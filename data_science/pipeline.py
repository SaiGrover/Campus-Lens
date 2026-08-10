"""CampusLens 2.0 reproducible mining, warehousing and governance pipeline."""

from __future__ import annotations

import csv
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

from data_science.advanced import multimedia_mining, spatial_mining, stream_mining, web_mining
from data_science.associations import mine_associations
from data_science.clustering import cluster_and_detect_outliers
from data_science.generation import CATEGORIES, SEED, generate_sources
from data_science.modeling import train_classifiers, train_regression
from data_science.preprocessing import metadata_catalog, preprocess
from data_science.warehouse import build_warehouse

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"; PROCESSED_DIR = ROOT / "data" / "processed"; WAREHOUSE_DIR = ROOT / "warehouse"
PUBLIC_DATA = ROOT / "public" / "data"; PUBLIC_IMAGES = ROOT / "public" / "images" / "evidence"; OUTPUT_DIR = ROOT / "data_science" / "outputs"


def ensure_directories() -> None:
    for path in [RAW_DIR, PROCESSED_DIR, WAREHOUSE_DIR, PUBLIC_DATA, PUBLIC_IMAGES, OUTPUT_DIR]: path.mkdir(parents=True, exist_ok=True)


def export_arff(frame: pd.DataFrame) -> None:
    def write_file(path: Path, subset: pd.DataFrame) -> None:
        with path.open("w", encoding="utf-8", newline="") as handle:
            handle.write("@RELATION campuslens_complaints_v2\n\n@ATTRIBUTE complaint STRING\n@ATTRIBUTE facility_type {academic,lab,library,food,hostel,office,common,outdoor,utility,sports}\n")
            handle.write("@ATTRIBUTE hour NUMERIC\n@ATTRIBUTE occupancy NUMERIC\n@ATTRIBUTE humidity NUMERIC\n@ATTRIBUTE impact NUMERIC\n")
            handle.write("@ATTRIBUTE category {" + ",".join(value.replace(" ", "_") for value in CATEGORIES) + "}\n\n@DATA\n")
            for row in subset.itertuples():
                text = row.complaint_clean.replace("\\", "\\\\").replace("'", "\\'")
                handle.write(f"'{text}',{row.facility_type},{row.hour},{row.occupancy_pct},{row.humidity_pct},{row.impact_rating},{row.category.replace(' ', '_')}\n")
    write_file(PUBLIC_DATA / "campuslens-complaints.arff", frame)
    write_file(OUTPUT_DIR / "weka-development.arff", frame[frame.evaluation_fold != 4])
    write_file(OUTPUT_DIR / "weka-unseen-template-test.arff", frame[frame.evaluation_fold == 4])


def public_complaints(frame: pd.DataFrame) -> list[dict]:
    records = []
    for row in frame.sort_values("observed_at", ascending=False).itertuples():
        records.append({"id": row.complaint_id, "category": row.category, "location": f"{row.facility} · {row.room}", "zone": row.zone,
                        "facility": row.facility, "floor": row.floor, "room": row.room, "time": row.time_band, "hour": int(row.hour),
                        "day": row.day_name, "observedAt": row.observed_at, "rating": int(row.impact_rating), "text": row.complaint_clean,
                        "status": row.status, "occupancy": int(row.occupancy_pct), "humidity": int(row.humidity_pct),
                        "resolutionHours": float(row.resolution_hours), "anonymous": True})
    # Full export remains downloadable; the application consumes paginated chunks.
    (PUBLIC_DATA / "complaints.json").write_text(json.dumps(records, separators=(",", ":")), encoding="utf-8")
    page_size = 200; pages = []
    for page_index in range(0, len(records), page_size):
        name = f"complaints-page-{page_index // page_size + 1:02d}.json"; chunk = records[page_index:page_index + page_size]
        (PUBLIC_DATA / name).write_text(json.dumps(chunk, separators=(",", ":")), encoding="utf-8"); pages.append({"file": name, "rows": len(chunk)})
    (PUBLIC_DATA / "complaints-manifest.json").write_text(json.dumps({"total": len(records), "pageSize": page_size, "pages": pages}, indent=2), encoding="utf-8")
    return records


def build_analytics(frame: pd.DataFrame, quality: dict, models: dict, regression: dict, associations: dict, clustering: dict,
                    multimedia: dict, spatial: dict, web: dict, stream: dict, warehouse_checks: dict) -> dict:
    category_counts = frame.category.value_counts(); facilities = frame.facility.value_counts().head(8); bands = ["8-10", "10-12", "12-2", "2-4", "4-7"]
    issue_mix = [{"name": category, "count": int(category_counts.get(category, 0)), "pct": round(float(category_counts.get(category, 0) / len(frame) * 100), 1)} for category in CATEGORIES]
    hotspots = [{"name": name, "count": int(count), "pct": round(int(count) / int(facilities.max()) * 100, 1)} for name, count in facilities.items()]
    heatmap = [{"place": facility, "values": [int(((frame.facility == facility) & (frame.time_band == band)).sum()) for band in bands]} for facility in facilities.index[:5]]
    critical = int((frame.severity == "Critical").sum()); unresolved = int(frame.status.isin(["Open", "Verified", "In Progress", "Escalated"]).sum())
    health = round(max(0, 100 - critical / len(frame) * 105 - unresolved / len(frame) * 24))
    models = dict(models); models["regression"] = regression["models"]
    analytics = {"generatedAt": datetime.now(timezone.utc).isoformat(), "pipelineVersion": "2.0.0", "source": "integrated multi-source benchmark",
                 "datasetCount": len(frame), "campusHealthScore": health, "criticalCount": critical, "unresolvedCount": unresolved,
                 "meanResolutionHours": round(float(frame.resolution_hours.mean()), 2), "statusCounts": {str(k): int(v) for k, v in frame.status.value_counts().items()},
                 "issueMix": issue_mix, "hotspots": hotspots, "heatmap": {"timeBands": bands, "rows": heatmap}, "models": models,
                 "regression": regression, "association": associations, "clustering": clustering, "imagePipeline": multimedia,
                 "spatial": spatial, "webMining": web, "streamMining": stream, "dataQuality": quality, "warehouse": warehouse_checks,
                 "limitations": ["All benchmark labels and anomalies are synthetic and must not be presented as institutional ground truth.",
                                 "Model promotion requires human review when stream drift is detected.", "Spatial coordinates are generalized facility centroids."]}
    (PUBLIC_DATA / "analytics.json").write_text(json.dumps(analytics, indent=2), encoding="utf-8")
    return analytics


def write_governance(frame: pd.DataFrame, models: dict, stream: dict) -> None:
    dataset_hash = hashlib.sha256((PROCESSED_DIR / "complaints_clean.csv").read_bytes()).hexdigest()
    registry = {"modelName": models["bestModel"], "version": "2.0.0", "stage": "academic-benchmark", "trainedAt": datetime.now(timezone.utc).isoformat(),
                "datasetSha256": dataset_hash, "evaluationProtocol": models["evaluationProtocol"], "approval": "human review required",
                "monitoring": {"driftMetric": "Jensen-Shannon divergence", "driftWindows": stream["driftWindowCount"], "retrainingTrigger": "review after any sustained drift flag"}}
    (OUTPUT_DIR / "model_registry.json").write_text(json.dumps(registry, indent=2), encoding="utf-8")
    ethics = {"protectedAttributesUsed": [], "reason": "The benchmark intentionally excludes caste, gender, disability, religion and identity attributes.",
              "fairnessScope": "Performance is monitored by collection channel and facility type; demographic fairness cannot be claimed without consented protected-attribute data.",
              "risks": ["synthetic-to-real domain shift", "minority issue under-reporting", "location privacy", "automation bias"],
              "controls": ["human label correction", "no automated disciplinary action", "generalized coordinates", "private named-report fields", "model drift review"]}
    (OUTPUT_DIR / "ethics_and_fairness.json").write_text(json.dumps(ethics, indent=2), encoding="utf-8")


def main() -> None:
    ensure_directories(); raw, services, locations = generate_sources(RAW_DIR); clean, quality = preprocess(raw, services, locations, PROCESSED_DIR, OUTPUT_DIR)
    warehouse_checks = build_warehouse(clean, WAREHOUSE_DIR); models = train_classifiers(clean, OUTPUT_DIR, PUBLIC_DATA); regression = train_regression(clean, OUTPUT_DIR)
    associations = mine_associations(clean, OUTPUT_DIR); clustering = cluster_and_detect_outliers(clean, OUTPUT_DIR)
    spatial = spatial_mining(clean, OUTPUT_DIR); web = web_mining(services, OUTPUT_DIR); stream = stream_mining(clean, OUTPUT_DIR); multimedia = multimedia_mining(PUBLIC_IMAGES, OUTPUT_DIR)
    export_arff(clean); public_complaints(clean); metadata_catalog(clean, WAREHOUSE_DIR / "metadata_catalog.json")
    build_analytics(clean, quality, models, regression, associations, clustering, multimedia, spatial, web, stream, warehouse_checks); write_governance(clean, models, stream)
    print(json.dumps({"status": "ok", "rows": len(clean), "bestModel": models["bestModel"], "validatedRules": len(associations["rules"]), "warehouse": warehouse_checks,
                      "advancedMining": ["spatial", "web", "stream", "multimedia"]}, indent=2))


if __name__ == "__main__": main()
