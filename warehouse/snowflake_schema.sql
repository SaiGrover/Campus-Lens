-- Executable normalized snowflake alternative, populated by warehouse.py.
CREATE TABLE sf_dim_campus (campus_key INTEGER PRIMARY KEY AUTOINCREMENT, campus_name TEXT NOT NULL UNIQUE);
CREATE TABLE sf_dim_zone (zone_key INTEGER PRIMARY KEY AUTOINCREMENT, campus_key INTEGER NOT NULL REFERENCES sf_dim_campus(campus_key), zone_name TEXT NOT NULL, UNIQUE(campus_key,zone_name));
CREATE TABLE sf_dim_facility (facility_key INTEGER PRIMARY KEY AUTOINCREMENT, zone_key INTEGER NOT NULL REFERENCES sf_dim_zone(zone_key), facility_name TEXT NOT NULL, facility_type TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL, UNIQUE(zone_key,facility_name));
CREATE TABLE sf_dim_floor (floor_key INTEGER PRIMARY KEY AUTOINCREMENT, facility_key INTEGER NOT NULL REFERENCES sf_dim_facility(facility_key), floor_name TEXT NOT NULL, UNIQUE(facility_key,floor_name));
CREATE TABLE sf_dim_room (room_key INTEGER PRIMARY KEY AUTOINCREMENT, floor_key INTEGER NOT NULL REFERENCES sf_dim_floor(floor_key), room_name TEXT NOT NULL, UNIQUE(floor_key,room_name));
CREATE TABLE sf_fact_complaint (complaint_key INTEGER PRIMARY KEY, room_key INTEGER NOT NULL REFERENCES sf_dim_room(room_key), date_key INTEGER NOT NULL REFERENCES dim_date(date_key), time_key INTEGER NOT NULL REFERENCES dim_time(time_key), category_key INTEGER NOT NULL REFERENCES dim_category(category_key), severity_key INTEGER NOT NULL REFERENCES dim_severity(severity_key), impact_rating INTEGER NOT NULL, resolution_hours REAL NOT NULL);
CREATE INDEX idx_sf_fact_room ON sf_fact_complaint(room_key);
