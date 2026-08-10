"""Target-independent ETL, ELT comparison, integration, lineage and quality checks."""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import pandas as pd


def clean_text(value: str) -> str:
    text = re.sub(r"[^a-z0-9\s:/-]", " ", str(value).lower().strip())
    return re.sub(r"\s+", " ", text).strip()


def preprocess(raw: pd.DataFrame, services: pd.DataFrame, locations: pd.DataFrame, processed_dir: Path, output_dir: Path) -> tuple[pd.DataFrame, dict]:
    frame = raw.copy()
    missing_before = frame.isna().sum().to_dict()
    hierarchy_lookup = {(row.zone, row.floor, row.room): row.facility for row in locations.itertuples()}
    missing_facility = frame["facility"].isna()
    frame.loc[missing_facility, "facility"] = frame.loc[missing_facility].apply(lambda row: hierarchy_lookup[(row.zone, row.floor, row.room)], axis=1)
    frame["occupancy_pct"] = frame.groupby("facility_type")["occupancy_pct"].transform(lambda values: values.fillna(values.median())).astype(int)
    frame["complaint_clean"] = frame["complaint_text"].map(clean_text)
    frame = frame.drop_duplicates(subset=["complaint_id"]).reset_index(drop=True)
    frame["observed_at"] = pd.to_datetime(frame["observed_at"], utc=True)
    frame["day_name"] = frame["observed_at"].dt.day_name()
    frame["full_date"] = frame["observed_at"].dt.date.astype(str)
    frame["time_band"] = pd.cut(frame["hour"], [7, 10, 12, 14, 16, 19], labels=["8-10", "10-12", "12-2", "2-4", "4-7"], include_lowest=True).astype(str)
    frame["occupancy_band"] = pd.cut(frame["occupancy_pct"], [0, 40, 70, 100], labels=["Low", "Medium", "High"], include_lowest=True).astype(str)
    frame["humidity_band"] = pd.cut(frame["humidity_pct"], [0, 50, 70, 100], labels=["Low", "Medium", "High"], include_lowest=True).astype(str)
    frame["impact_normalized"] = (frame["impact_rating"] - 1) / 4
    for name in ["occupancy_pct", "humidity_pct"]:
        frame[name.replace("_pct", "_standardized")] = ((frame[name] - frame[name].mean()) / frame[name].std()).round(5)

    services = services.copy()
    services["observed_at"] = pd.to_datetime(services["observed_at"], utc=True)
    services["full_date"] = services["observed_at"].dt.date.astype(str)
    service_daily = services.groupby(["full_date", "facility"]).agg(
        service_sessions=("session_id", "count"), report_conversions=("converted_to_report", "sum"), mean_dwell_seconds=("dwell_seconds", "mean")
    ).reset_index()
    frame = frame.merge(service_daily, on=["full_date", "facility"], how="left")
    frame[["service_sessions", "report_conversions", "mean_dwell_seconds"]] = frame[["service_sessions", "report_conversions", "mean_dwell_seconds"]].fillna(0)
    frame["observed_at"] = frame["observed_at"].map(lambda value: value.isoformat())

    valid_pairs = set(map(tuple, locations[["zone", "facility", "floor", "room"]].itertuples(index=False, name=None)))
    hierarchy_valid = frame.apply(lambda row: (row.zone, row.facility, row.floor, row.room) in valid_pairs, axis=1)
    duplicate_text_rate = 1 - frame["complaint_clean"].nunique() / len(frame)
    quality = {
        "rawRows": len(raw), "cleanRows": len(frame),
        "missingBefore": {key: int(value) for key, value in missing_before.items() if value},
        "missingAfter": int(frame.isna().sum().sum()), "duplicatesRemoved": len(raw) - len(frame),
        "uniqueTextRate": round(1 - duplicate_text_rate, 4), "hierarchyValidRate": round(float(hierarchy_valid.mean()), 4),
        "weekdayConsistencyRate": round(float((pd.to_datetime(frame["observed_at"]).dt.day_name() == frame["day_name"]).mean()), 4),
        "integratedSources": ["student complaint stream", "campus service web events", "facility master"],
        "transformations": [
            "lowercase and punctuation normalization", "explicit unknown-member location imputation",
            "facility-type median occupancy imputation", "validated campus concept hierarchy",
            "min-max impact normalization", "z-score occupancy and humidity standardization",
            "time, occupancy and humidity discretization", "daily web-service feature integration",
            "template-group evaluation folds", "10% reproducible analysis sample",
        ],
        "etlVsElt": {
            "ETL": "CSV sources are cleaned, validated and integrated before SQLite warehouse loading.",
            "ELT": "Raw operational rows are retained in PostgreSQL and transformed into governed live marts after loading.",
        },
    }
    processed_dir.mkdir(parents=True, exist_ok=True); output_dir.mkdir(parents=True, exist_ok=True)
    frame.to_csv(processed_dir / "complaints_clean.csv", index=False)
    frame.sample(frac=.10, random_state=313).to_csv(processed_dir / "complaints_sample_10pct.csv", index=False)
    (output_dir / "data_quality_report.json").write_text(json.dumps(quality, indent=2), encoding="utf-8")
    return frame, quality


def metadata_catalog(frame: pd.DataFrame, path: Path) -> None:
    definitions = {
        "complaint_id": "Stable source complaint identifier", "event_id": "Synthetic incident batch identifier",
        "category": "Human-labelled complaint class", "observed_at": "ISO-8601 event timestamp with timezone",
        "resolution_hours": "Elapsed hours until resolution", "latitude": "Privacy-jittered facility latitude",
        "longitude": "Privacy-jittered facility longitude", "template_group": "Generation group used only for leakage-safe evaluation",
        "is_seeded_anomaly": "Synthetic benchmark ground truth for anomaly evaluation",
    }
    sensitive = {"student_key": "restricted-pseudonymous", "complaint_text": "internal-free-text", "latitude": "generalized-location", "longitude": "generalized-location"}
    fields = []
    for column in frame.columns:
        numeric = pd.api.types.is_numeric_dtype(frame[column])
        fields.append({
            "field": column, "businessDefinition": definitions.get(column, column.replace("_", " ").capitalize()),
            "dtype": str(frame[column].dtype), "nullable": bool(frame[column].isna().any()), "distinctValues": int(frame[column].nunique()),
            "role": "measure" if numeric else "dimension", "sensitivity": sensitive.get(column, "internal"),
            "source": "service_events.csv" if column.startswith(("service_", "report_conversion", "mean_dwell")) else "complaints_raw.csv",
            "transformation": "derived during governed ETL" if column not in {"complaint_id", "complaint_text", "category"} else "source-preserved",
        })
    catalog = {
        "dataset": "CampusLens integrated complaints", "owner": "CampusLens Data Team", "dataSteward": "Course project team",
        "refreshFrequency": "pipeline run or governed incremental refresh", "retention": "180 days for named operational reports; benchmark data versioned",
        "qualityThresholds": {"missingAfter": 0, "weekdayConsistency": 1.0, "hierarchyValidity": 1.0, "testTextOverlapMaximum": 0.05},
        "lineage": ["complaints_raw.csv + facility_master.csv + service_events.csv", "preprocessing.py", "complaints_clean.csv", "campuslens.db", "analytics.json"],
        "artifactVersion": "2.0.0", "rowCount": len(frame), "fields": fields,
    }
    path.write_text(json.dumps(catalog, indent=2), encoding="utf-8")
