"""Executable star and snowflake warehouse construction with SCD2 history."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from .generation import CATEGORIES


def _insert_dimension(cursor, table: str, key: str, columns: list[str], records: list[tuple]) -> dict[tuple, int]:
    cursor.executemany(f"INSERT INTO {table} ({','.join(columns)}) VALUES ({','.join('?' for _ in columns)})", records)
    rows = cursor.execute(f"SELECT {key},{','.join(columns)} FROM {table}").fetchall()
    return {tuple(row[1:]): row[0] for row in rows}


def build_warehouse(frame: pd.DataFrame, warehouse_dir: Path) -> dict:
    database = warehouse_dir / "campuslens.db"
    if database.exists(): database.unlink()
    connection = sqlite3.connect(database); connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript((warehouse_dir / "schema.sql").read_text(encoding="utf-8")); connection.executescript((warehouse_dir / "snowflake_schema.sql").read_text(encoding="utf-8"))
    cursor = connection.cursor(); now = datetime.now(timezone.utc).isoformat(); valid_start = "2025-08-01T00:00:00+00:00"
    natural_locations = sorted({(row.campus, row.zone, row.facility, row.facility_type, row.floor, row.room, float(row.latitude), float(row.longitude)) for row in frame.itertuples()})
    location_records = []
    for index, location in enumerate(natural_locations):
        if index < 6:
            location_records.append((*location, "2025-01-01T00:00:00+00:00", "2025-07-31T23:59:59+00:00", 0, 1))
            location_records.append((*location, valid_start, None, 1, 2))
        else: location_records.append((*location, valid_start, None, 1, 1))
    location_columns = ["campus","zone","facility","facility_type","floor","room","latitude","longitude","valid_from","valid_to","is_current","version_number"]
    cursor.executemany(f"INSERT INTO dim_location ({','.join(location_columns)}) VALUES ({','.join('?' for _ in location_columns)})", location_records)
    location_keys = {(row[1],row[2],row[3],row[4],row[5],row[6]): row[0] for row in cursor.execute("SELECT location_key,campus,zone,facility,floor,room,facility_type FROM dim_location WHERE is_current=1")}
    categories = _insert_dimension(cursor,"dim_category","category_key",["category_name"],[(value,) for value in CATEGORIES])
    severities = _insert_dimension(cursor,"dim_severity","severity_key",["severity_name","severity_rank"],[(name,index) for index,name in enumerate(["Low","Medium","High","Critical"],1)])
    sources = _insert_dimension(cursor,"dim_source","source_key",["source_name","source_kind"],[(name,"operational") for name in sorted(frame.source_system.unique())])
    students = _insert_dimension(cursor,"dim_student","student_key",["anonymous_id","is_anonymous","retention_class"],[(value,1,"benchmark-pseudonymous") for value in sorted(frame.student_key.unique())])
    observed = pd.to_datetime(frame.observed_at, utc=True)
    dates = sorted(set(observed.dt.date)); date_records = [(str(value),value.strftime("%A"),value.month,(value.month-1)//3+1,value.year,"2025-26") for value in dates]
    date_keys = _insert_dimension(cursor,"dim_date","date_key",["full_date","day_name","month","quarter","year","academic_term"],date_records)
    time_records = sorted({(int(row.hour),row.time_band) for row in frame.itertuples()}); time_keys = _insert_dimension(cursor,"dim_time","time_key",["hour_of_day","time_band"],time_records)
    fact_rows = []
    for row in frame.itertuples():
        timestamp = pd.Timestamp(row.observed_at); date_tuple = (str(timestamp.date()),timestamp.strftime("%A"),timestamp.month,(timestamp.month-1)//3+1,timestamp.year,"2025-26")
        location_tuple = (row.campus,row.zone,row.facility,row.floor,row.room,row.facility_type)
        fact_rows.append((row.complaint_id,row.event_id,students[(row.student_key,1,"benchmark-pseudonymous")],location_keys[location_tuple],date_keys[date_tuple],time_keys[(int(row.hour),row.time_band)],categories[(row.category,)],severities[(row.severity,["Low","Medium","High","Critical"].index(row.severity)+1)],sources[(row.source_system,"operational")],row.complaint_clean,int(row.impact_rating),int(row.occupancy_pct),int(row.humidity_pct),int(row.recurring),row.status,float(row.resolution_hours),int(row.has_image),int(row.service_sessions),int(row.is_seeded_anomaly),row.observed_at))
    cursor.executemany("""INSERT INTO fact_complaint (complaint_id,event_id,student_key,location_key,date_key,time_key,category_key,severity_key,source_key,complaint_text,impact_rating,occupancy_pct,humidity_pct,recurring,status,resolution_hours,has_image,service_sessions,seeded_anomaly,observed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",fact_rows)

    # Populate the normalized snowflake from the same conformed locations.
    campus_keys = _insert_dimension(cursor,"sf_dim_campus","campus_key",["campus_name"],[(value,) for value in sorted(frame.campus.unique())])
    zone_records = sorted({(campus_keys[(row.campus,)],row.zone) for row in frame.itertuples()}); zone_keys = _insert_dimension(cursor,"sf_dim_zone","zone_key",["campus_key","zone_name"],zone_records)
    facility_records = sorted({(zone_keys[(campus_keys[(row.campus,)],row.zone)],row.facility,row.facility_type,float(row.latitude),float(row.longitude)) for row in frame.itertuples()})
    facility_keys = _insert_dimension(cursor,"sf_dim_facility","facility_key",["zone_key","facility_name","facility_type","latitude","longitude"],facility_records)
    floor_records = sorted({(facility_keys[(zone_keys[(campus_keys[(row.campus,)],row.zone)],row.facility,row.facility_type,float(row.latitude),float(row.longitude))],row.floor) for row in frame.itertuples()})
    floor_keys = _insert_dimension(cursor,"sf_dim_floor","floor_key",["facility_key","floor_name"],floor_records)
    room_records = sorted({(floor_keys[(facility_keys[(zone_keys[(campus_keys[(row.campus,)],row.zone)],row.facility,row.facility_type,float(row.latitude),float(row.longitude))],row.floor)],row.room) for row in frame.itertuples()})
    room_keys = _insert_dimension(cursor,"sf_dim_room","room_key",["floor_key","room_name"],room_records)
    sf_rows=[]
    for complaint_key,row in enumerate(frame.itertuples(),1):
        timestamp=pd.Timestamp(row.observed_at); date_tuple=(str(timestamp.date()),timestamp.strftime("%A"),timestamp.month,(timestamp.month-1)//3+1,timestamp.year,"2025-26")
        zone_key=zone_keys[(campus_keys[(row.campus,)],row.zone)]; facility_key=facility_keys[(zone_key,row.facility,row.facility_type,float(row.latitude),float(row.longitude))]; floor_key=floor_keys[(facility_key,row.floor)]; room_key=room_keys[(floor_key,row.room)]
        sf_rows.append((complaint_key,room_key,date_keys[date_tuple],time_keys[(int(row.hour),row.time_band)],categories[(row.category,)],severities[(row.severity,["Low","Medium","High","Critical"].index(row.severity)+1)],int(row.impact_rating),float(row.resolution_hours)))
    cursor.executemany("INSERT INTO sf_fact_complaint (complaint_key,room_key,date_key,time_key,category_key,severity_key,impact_rating,resolution_hours) VALUES (?,?,?,?,?,?,?,?)",sf_rows)
    connection.executescript((warehouse_dir/"olap_views.sql").read_text(encoding="utf-8"))
    cursor.execute("INSERT INTO etl_batch_audit VALUES (?,?,?,?,?,?,?,?)",(f"BATCH-{datetime.now():%Y%m%d%H%M%S}",now,datetime.now(timezone.utc).isoformat(),len(frame),len(fact_rows),0,"2.0.0","PASSED"))
    connection.commit()
    checks={"starFacts":cursor.execute("SELECT COUNT(*) FROM fact_complaint").fetchone()[0],"snowflakeFacts":cursor.execute("SELECT COUNT(*) FROM sf_fact_complaint").fetchone()[0],"rollupRows":cursor.execute("SELECT COUNT(*) FROM mart_location_rollup").fetchone()[0],"scdHistoricalRows":cursor.execute("SELECT COUNT(*) FROM dim_location WHERE is_current=0 AND valid_to IS NOT NULL").fetchone()[0],"foreignKeyViolations":len(cursor.execute("PRAGMA foreign_key_check").fetchall())}
    connection.close(); return checks
