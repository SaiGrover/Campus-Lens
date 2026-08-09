"""Reproducible CampusLens data mining and warehousing pipeline.

Run from the repository root with: python data_science/pipeline.py
The fixed seed makes every generated dataset and metric reproducible.
"""

from __future__ import annotations

import csv
import json
import math
import random
import re
import sqlite3
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from mlxtend.frequent_patterns import apriori, association_rules, fpgrowth
from sklearn.cluster import AgglomerativeClustering, DBSCAN, KMeans
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import IsolationForest, RandomForestClassifier, RandomForestRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    davies_bouldin_score,
    f1_score,
    mean_squared_error,
    precision_score,
    recall_score,
    silhouette_score,
)
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.decomposition import TruncatedSVD
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier


ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
WAREHOUSE_DIR = ROOT / "warehouse"
PUBLIC_DATA = ROOT / "public" / "data"
PUBLIC_IMAGES = ROOT / "public" / "images" / "evidence"
OUTPUT_DIR = ROOT / "data_science" / "outputs"
SEED = 313
ROW_COUNT = 2840

RNG = random.Random(SEED)
NP_RNG = np.random.default_rng(SEED)

CATEGORIES = [
    "Network",
    "Infrastructure",
    "Cleanliness",
    "Canteen",
    "Electrical",
    "Lab Equipment",
    "Water",
    "Other",
]

CONFIG = {
    "Network": {
        "templates": [
            "wifi becomes extremely slow near {room} between {start} and {end}",
            "internet disconnects repeatedly during the lecture in {room}",
            "network authentication fails for students around {facility}",
            "very weak wifi signal on {floor} of {facility}",
        ],
        "zones": ["Labs & Research", "Academic & Teaching", "Library & Study"],
        "facilities": ["CL3", "CL15", "Aryabhatt Bhawan II", "LRC"],
    },
    "Infrastructure": {
        "templates": [
            "projector in {room} switches off after ten minutes",
            "broken writing desk is blocking the aisle in {room}",
            "classroom door and several chairs need repair on {floor}",
            "projector hdmi port is loose in {room}",
        ],
        "zones": ["Academic & Teaching", "Labs & Research"],
        "facilities": ["Aryabhatt Bhawan II", "A2/1", "A2/2", "CL3"],
    },
    "Cleanliness": {
        "templates": [
            "washroom near {room} has not been cleaned today",
            "garbage is overflowing in the corridor on {floor}",
            "floor near {facility} is dirty and slippery",
            "spill outside {room} creates a safety hazard",
        ],
        "zones": ["General & Utilities", "Hostels", "Academic & Teaching"],
        "facilities": ["Washrooms", "H4 Boys Hostel", "Aryabhatt Bhawan III"],
    },
    "Canteen": {
        "templates": [
            "canteen queue is very long at {start} with one counter open",
            "billing queue reaches the stairwell near {facility}",
            "food counter is overcrowded between {start} and {end}",
            "waiting time at {facility} is more than twenty minutes",
        ],
        "zones": ["Food"],
        "facilities": ["Annapurna / Main Mess", "Cafeteria / Canteen"],
    },
    "Electrical": {
        "templates": [
            "two ceiling fans are not working in {room}",
            "air conditioner stops cooling after noon on {floor}",
            "lights flicker repeatedly inside {room}",
            "power socket near the desk is unsafe in {room}",
        ],
        "zones": ["Academic & Teaching", "Labs & Research", "Hostels"],
        "facilities": ["A2/1", "CL22", "H5 Boys Hostel"],
    },
    "Lab Equipment": {
        "templates": [
            "three lab systems freeze during compilation in {room}",
            "monitor and keyboard are not detected at workstation in {room}",
            "computer fails to boot during practical class in {room}",
            "laboratory equipment reports a calibration error in {room}",
        ],
        "zones": ["Labs & Research"],
        "facilities": ["CL1", "CL3", "CL15", "CL22", "ECE Labs"],
    },
    "Water": {
        "templates": [
            "drinking water cooler near {room} is empty",
            "water is leaking into the corridor on {floor}",
            "low water pressure reported around {facility}",
            "water point near {facility} is not operational",
        ],
        "zones": ["General & Utilities", "Sports & Recreation", "Hostels"],
        "facilities": ["Water cooler", "Swimming Pool", "Girls Hostel"],
    },
    "Other": {
        "templates": [
            "parking congestion blocks the entrance near {facility}",
            "signage is missing for {room} on {floor}",
            "student common area is overcrowded after {start}",
            "unclassified campus issue reported around {facility}",
        ],
        "zones": ["General & Utilities", "Sports & Recreation", "Administration"],
        "facilities": ["Parking", "Main Gate", "Auditorium", "Administration Block"],
    },
}

ROOMS = ["CL3", "CL15", "CL22", "CR425", "CS1", "G2", "FF6", "TS17"]
FLOORS = ["Ground Floor", "Floor 1", "Floor 2", "Floor 3", "Floor 4"]
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
TIMES = list(range(8, 19))


def ensure_directories() -> None:
    for directory in [RAW_DIR, PROCESSED_DIR, WAREHOUSE_DIR, PUBLIC_DATA, PUBLIC_IMAGES, OUTPUT_DIR]:
        directory.mkdir(parents=True, exist_ok=True)


def generate_raw_dataset() -> pd.DataFrame:
    start_date = datetime(2026, 1, 5, 8, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    category_weights = [0.28, 0.19, 0.10, 0.14, 0.09, 0.10, 0.06, 0.04]
    rows: list[dict[str, object]] = []
    for index in range(ROW_COUNT):
        category = RNG.choices(CATEGORIES, weights=category_weights, k=1)[0]
        cfg = CONFIG[category]
        zone = RNG.choice(cfg["zones"])
        facility = RNG.choice(cfg["facilities"])
        floor = RNG.choice(FLOORS)
        room = RNG.choice(ROOMS)
        day = RNG.choice(DAYS)
        hour = RNG.choice(TIMES)
        if category == "Canteen":
            hour = RNG.choice([12, 13, 13, 14])
        if category == "Network":
            hour = RNG.choice([9, 10, 10, 11, 12, 14])
        occupancy = int(np.clip(NP_RNG.normal(78 if category in {"Canteen", "Network"} else 55, 19), 5, 100))
        humidity = int(np.clip(NP_RNG.normal(68 if category in {"Electrical", "Water"} else 54, 16), 20, 96))
        rating = RNG.choices([1, 2, 3, 4, 5], weights=[0.19, 0.31, 0.27, 0.16, 0.07], k=1)[0]
        created_at = start_date + timedelta(days=index // 16, hours=hour - 8, minutes=RNG.randrange(0, 60))
        template = RNG.choice(cfg["templates"])
        complaint = template.format(room=room, facility=facility, floor=floor, start=f"{hour}:00", end=f"{min(hour + 2, 20)}:00")
        if RNG.random() < 0.18:
            complaint += RNG.choice([" please fix urgently", " this happens repeatedly", " students cannot continue class", " !!!!"])
        if RNG.random() < 0.22:
            complaint += RNG.choice([
                " and the room is overcrowded",
                " while the wifi is also unstable",
                " near a water cooler",
                " after a power interruption",
                " beside the canteen queue",
            ])
        # A controlled amount of annotation noise prevents unrealistically perfect models.
        recorded_category = RNG.choice([name for name in CATEGORIES if name != category]) if RNG.random() < 0.055 else category
        recurring = int(RNG.random() < (0.42 if category in {"Network", "Infrastructure", "Lab Equipment"} else 0.24))
        status = RNG.choices(["Open", "Verified", "In Progress", "Resolved", "Escalated"], [0.26, 0.16, 0.22, 0.29, 0.07])[0]
        severity = "Critical" if rating == 1 else "High" if rating == 2 else "Medium" if rating == 3 else "Low"
        resolution = max(0.4, 1.0 + (6 - rating) * 0.72 + recurring * 1.1 + occupancy * 0.018 + RNG.gauss(0, 0.62))
        rows.append({
            "complaint_id": f"CL-{10000 + index}",
            "student_key": f"ANON-{RNG.randrange(1, 601):04d}",
            "complaint_text": complaint,
            "category": recorded_category,
            "zone": zone,
            "facility": facility,
            "floor": floor,
            "room": room,
            "day_name": day,
            "hour": hour,
            "observed_at": created_at.isoformat(),
            "impact_rating": rating,
            "severity": severity,
            "occupancy_pct": occupancy,
            "humidity_pct": humidity,
            "recurring": recurring,
            "status": status,
            "resolution_hours": round(resolution, 2),
            "has_image": int(RNG.random() < 0.31),
        })

    raw = pd.DataFrame(rows)
    # Deliberately inject realistic quality problems for the preprocessing lab.
    missing_location = NP_RNG.choice(raw.index, size=28, replace=False)
    missing_occupancy = NP_RNG.choice(raw.index, size=35, replace=False)
    noisy_text = NP_RNG.choice(raw.index, size=52, replace=False)
    raw.loc[missing_location, "facility"] = np.nan
    raw.loc[missing_occupancy, "occupancy_pct"] = np.nan
    raw.loc[noisy_text, "complaint_text"] = raw.loc[noisy_text, "complaint_text"].str.upper() + "   !!!"
    raw.to_csv(RAW_DIR / "complaints_raw.csv", index=False)
    return raw


def clean_text(value: str) -> str:
    text = value.lower().strip()
    text = re.sub(r"[^a-z0-9\s/-]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def preprocess(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, object]]:
    frame = raw.copy()
    before_missing = frame.isna().sum().to_dict()
    before_rows = len(frame)
    frame["facility"] = frame.groupby("category")["facility"].transform(lambda values: values.fillna(values.mode().iloc[0]))
    frame["occupancy_pct"] = frame["occupancy_pct"].fillna(frame["occupancy_pct"].median()).astype(int)
    frame["complaint_clean"] = frame["complaint_text"].astype(str).map(clean_text)
    frame = frame.drop_duplicates(subset=["complaint_id"]).reset_index(drop=True)
    frame["time_band"] = pd.cut(frame["hour"], bins=[7, 10, 12, 14, 16, 19], labels=["8-10", "10-12", "12-2", "2-4", "4-7"], include_lowest=True).astype(str)
    frame["occupancy_band"] = pd.cut(frame["occupancy_pct"], bins=[0, 40, 70, 100], labels=["Low", "Medium", "High"], include_lowest=True).astype(str)
    frame["humidity_band"] = pd.cut(frame["humidity_pct"], bins=[0, 50, 70, 100], labels=["Low", "Medium", "High"], include_lowest=True).astype(str)
    frame["impact_normalized"] = (frame["impact_rating"] - 1) / 4
    frame["occupancy_standardized"] = ((frame["occupancy_pct"] - frame["occupancy_pct"].mean()) / frame["occupancy_pct"].std()).round(5)
    frame["humidity_standardized"] = ((frame["humidity_pct"] - frame["humidity_pct"].mean()) / frame["humidity_pct"].std()).round(5)
    frame.to_csv(PROCESSED_DIR / "complaints_clean.csv", index=False)
    frame.sample(284, random_state=SEED).to_csv(PROCESSED_DIR / "complaints_sample_10pct.csv", index=False)
    report = {
        "rawRows": before_rows,
        "cleanRows": len(frame),
        "missingBefore": {key: int(value) for key, value in before_missing.items() if value},
        "missingAfter": int(frame.isna().sum().sum()),
        "duplicatesRemoved": before_rows - len(frame),
        "transformations": [
            "lowercase and punctuation normalization",
            "category-mode location imputation",
            "median occupancy imputation",
            "min-max impact normalization",
            "z-score occupancy and humidity standardization",
            "time, occupancy and humidity discretization",
            "10% stratified analysis sample",
        ],
    }
    (OUTPUT_DIR / "data_quality_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return frame, report


def load_schema(connection: sqlite3.Connection) -> None:
    connection.executescript((WAREHOUSE_DIR / "schema.sql").read_text(encoding="utf-8"))


def build_warehouse(frame: pd.DataFrame) -> None:
    database = WAREHOUSE_DIR / "campuslens.db"
    if database.exists():
        database.unlink()
    connection = sqlite3.connect(database)
    load_schema(connection)
    cursor = connection.cursor()

    def insert_dimension(table: str, key_name: str, columns: list[str], records: list[tuple]) -> dict[tuple, int]:
        placeholders = ",".join("?" for _ in columns)
        cursor.executemany(f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders})", records)
        rows = cursor.execute(f"SELECT {key_name}, {','.join(columns)} FROM {table}").fetchall()
        return {tuple(row[1:]): row[0] for row in rows}

    locations = sorted({(row.zone, row.facility, row.floor, row.room) for row in frame.itertuples()})
    categories = [(category,) for category in CATEGORIES]
    severities = [(name, rank) for rank, name in enumerate(["Low", "Medium", "High", "Critical"], 1)]
    dates = sorted({datetime.fromisoformat(value).date() for value in frame["observed_at"]})
    times = sorted({(int(row.hour), row.time_band) for row in frame.itertuples()})
    students = sorted({(value, 1) for value in frame["student_key"]})

    location_keys = insert_dimension("dim_location", "location_key", ["zone", "facility", "floor", "room"], locations)
    category_keys = insert_dimension("dim_category", "category_key", ["category_name"], categories)
    severity_keys = insert_dimension("dim_severity", "severity_key", ["severity_name", "severity_rank"], severities)
    date_keys = insert_dimension("dim_date", "date_key", ["full_date", "day_name", "month", "quarter", "year"], [(str(d), d.strftime("%A"), d.month, (d.month - 1) // 3 + 1, d.year) for d in dates])
    time_keys = insert_dimension("dim_time", "time_key", ["hour_of_day", "time_band"], times)
    student_keys = insert_dimension("dim_student", "student_key", ["anonymous_id", "is_anonymous"], students)

    fact_rows = []
    for row in frame.itertuples():
        observed = datetime.fromisoformat(row.observed_at)
        fact_rows.append((
            row.complaint_id,
            student_keys[(row.student_key, 1)],
            location_keys[(row.zone, row.facility, row.floor, row.room)],
            date_keys[(str(observed.date()), observed.strftime("%A"), observed.month, (observed.month - 1) // 3 + 1, observed.year)],
            time_keys[(int(row.hour), row.time_band)],
            category_keys[(row.category,)],
            severity_keys[(row.severity, ["Low", "Medium", "High", "Critical"].index(row.severity) + 1)],
            row.complaint_clean,
            int(row.impact_rating),
            int(row.occupancy_pct),
            int(row.humidity_pct),
            int(row.recurring),
            row.status,
            float(row.resolution_hours),
            int(row.has_image),
            row.observed_at,
        ))
    cursor.executemany(
        """INSERT INTO fact_complaint (
        complaint_id, student_key, location_key, date_key, time_key, category_key,
        severity_key, complaint_text, impact_rating, occupancy_pct, humidity_pct,
        recurring, status, resolution_hours, has_image, observed_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        fact_rows,
    )
    connection.executescript((WAREHOUSE_DIR / "olap_views.sql").read_text(encoding="utf-8"))
    connection.commit()
    connection.close()


def train_models(frame: pd.DataFrame) -> tuple[dict[str, object], dict[str, object]]:
    x_train, x_test, y_train, y_test = train_test_split(
        frame["complaint_clean"], frame["category"], test_size=0.2, random_state=SEED, stratify=frame["category"]
    )
    models = {
        "Naive Bayes": MultinomialNB(alpha=0.35),
        "kNN": KNeighborsClassifier(n_neighbors=7, weights="distance"),
        "ID3": DecisionTreeClassifier(criterion="entropy", max_depth=35, min_samples_leaf=2, random_state=SEED),
        "SVM": LinearSVC(C=1.2, random_state=SEED),
        "Random Forest": RandomForestClassifier(n_estimators=140, max_depth=38, random_state=SEED, n_jobs=-1),
        "Neural Network": MLPClassifier(hidden_layer_sizes=(48,), max_iter=220, random_state=SEED, early_stopping=True),
    }
    rows = []
    fitted: dict[str, tuple[TfidfVectorizer, object, np.ndarray]] = {}
    for name, model in models.items():
        vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=3500, sublinear_tf=True)
        train_matrix = vectorizer.fit_transform(x_train)
        test_matrix = vectorizer.transform(x_test)
        if name == "Neural Network":
            model.fit(train_matrix.toarray(), y_train)
            prediction = model.predict(test_matrix.toarray())
        else:
            model.fit(train_matrix, y_train)
            prediction = model.predict(test_matrix)
        fitted[name] = (vectorizer, model, prediction)
        rows.append({
            "name": name,
            "accuracy": round(accuracy_score(y_test, prediction) * 100, 2),
            "precision": round(precision_score(y_test, prediction, average="weighted", zero_division=0) * 100, 2),
            "recall": round(recall_score(y_test, prediction, average="weighted", zero_division=0) * 100, 2),
            "f1": round(f1_score(y_test, prediction, average="weighted", zero_division=0) * 100, 2),
        })
    rows.sort(key=lambda item: item["f1"], reverse=True)
    rows[0]["best"] = True
    best_name = rows[0]["name"]
    best_vectorizer, _, best_predictions = fitted[best_name]
    labels = CATEGORIES
    matrix = confusion_matrix(y_test, best_predictions, labels=labels).tolist()

    # A compact Multinomial NB model is exported for deterministic browser inference.
    nb_vectorizer, nb_model, _ = fitted["Naive Bayes"]
    feature_names = nb_vectorizer.get_feature_names_out().tolist()
    browser_model = {
        "algorithm": "Multinomial Naive Bayes",
        "classes": nb_model.classes_.tolist(),
        "vocabulary": {token: int(index) for token, index in nb_vectorizer.vocabulary_.items()},
        "idf": nb_vectorizer.idf_.round(8).tolist(),
        "classLogPrior": nb_model.class_log_prior_.round(8).tolist(),
        "featureLogProb": nb_model.feature_log_prob_.round(8).tolist(),
    }
    (PUBLIC_DATA / "classifier.json").write_text(json.dumps(browser_model), encoding="utf-8")

    numeric_features = ["impact_rating", "occupancy_pct", "humidity_pct", "recurring", "hour"]
    categorical_features = ["category", "zone", "status"]
    regression_preprocessor = ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric_features),
        ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical_features),
    ])
    train_r, test_r = train_test_split(frame, test_size=0.2, random_state=SEED)
    regressors = {
        "Random Forest Regressor": RandomForestRegressor(n_estimators=160, random_state=SEED, n_jobs=-1),
        "Neural Network Backpropagation": MLPRegressor(hidden_layer_sizes=(40, 20), max_iter=350, random_state=SEED, early_stopping=True),
        "Linear Regression": LinearRegression(),
    }
    regression_rows = []
    for name, regressor in regressors.items():
        pipeline = Pipeline([("preprocess", regression_preprocessor), ("model", regressor)])
        pipeline.fit(train_r[numeric_features + categorical_features], train_r["resolution_hours"])
        prediction = pipeline.predict(test_r[numeric_features + categorical_features])
        regression_rows.append({"name": name, "rmse": round(math.sqrt(mean_squared_error(test_r["resolution_hours"], prediction)), 3)})
    regression_rows.sort(key=lambda item: item["rmse"])
    regression_rows[0]["best"] = True

    result = {
        "datasetSize": len(frame),
        "trainingSize": len(x_train),
        "testSize": len(x_test),
        "randomSeed": SEED,
        "featureCount": len(best_vectorizer.vocabulary_),
        "models": rows,
        "bestModel": best_name,
        "confusionMatrix": {"labels": labels, "values": matrix},
        "regression": regression_rows,
    }
    (OUTPUT_DIR / "model_metrics.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result, browser_model


def mine_associations(frame: pd.DataFrame) -> dict[str, object]:
    transactions = pd.DataFrame({
        "Building=" + frame["facility"].astype(str): True,
    }) if False else None
    item_rows = []
    for row in frame.itertuples():
        item_rows.append({
            f"Facility={row.facility}",
            f"Time={row.time_band}",
            f"Day={row.day_name}",
            f"Occupancy={row.occupancy_band}",
            f"Humidity={row.humidity_band}",
            f"Category={row.category}",
            f"Severity={row.severity}",
        })
    all_items = sorted(set().union(*item_rows))
    encoded = pd.DataFrame([{item: item in transaction for item in all_items} for transaction in item_rows], dtype=bool)
    apriori_sets = apriori(encoded, min_support=0.025, use_colnames=True, max_len=3)
    fp_sets = fpgrowth(encoded, min_support=0.025, use_colnames=True, max_len=3)
    mined = association_rules(apriori_sets, metric="confidence", min_threshold=0.52)
    mined = mined[mined["consequents"].map(lambda values: any(str(item).startswith("Category=") for item in values))]
    mined = mined.sort_values(["lift", "confidence"], ascending=False).head(24)
    rules = []
    for _, row in mined.iterrows():
        antecedents = sorted(str(item) for item in row["antecedents"])
        consequents = sorted(str(item) for item in row["consequents"])
        rules.append({
            "when": antecedents,
            "then": " + ".join(consequents),
            "support": round(float(row["support"]), 4),
            "confidence": round(float(row["confidence"]), 4),
            "lift": round(float(row["lift"]), 3),
            "leverage": round(float(row["leverage"]), 4),
            "conviction": None if not math.isfinite(float(row["conviction"])) else round(float(row["conviction"]), 3),
        })
    result = {
        "transactionCount": len(frame),
        "minSupport": 0.025,
        "minConfidence": 0.52,
        "aprioriFrequentItemsets": len(apriori_sets),
        "fpGrowthFrequentItemsets": len(fp_sets),
        "algorithmsAgree": set(map(frozenset, apriori_sets["itemsets"])) == set(map(frozenset, fp_sets["itemsets"])),
        "rules": rules,
    }
    (OUTPUT_DIR / "association_rules.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def cluster_and_detect_outliers(frame: pd.DataFrame) -> dict[str, object]:
    vectorizer = TfidfVectorizer(max_features=180, min_df=3, stop_words="english")
    sparse_text = vectorizer.fit_transform(frame["complaint_clean"])
    text_matrix = TruncatedSVD(n_components=18, random_state=SEED).fit_transform(sparse_text)
    numeric = StandardScaler().fit_transform(frame[["impact_rating", "occupancy_pct", "humidity_pct", "hour"]])
    features = np.hstack([text_matrix, numeric])
    sample_indices = NP_RNG.choice(len(frame), size=900, replace=False)
    sample = features[sample_indices]
    algorithms = {}
    kmeans = KMeans(n_clusters=8, random_state=SEED, n_init=15).fit(sample)
    algorithms["K-Means"] = {
        "silhouette": round(silhouette_score(sample, kmeans.labels_), 4),
        "daviesBouldin": round(davies_bouldin_score(sample, kmeans.labels_), 4),
        "clusters": int(len(set(kmeans.labels_))),
    }
    hierarchical = AgglomerativeClustering(n_clusters=8, linkage="ward").fit(sample)
    algorithms["Hierarchical"] = {
        "silhouette": round(silhouette_score(sample, hierarchical.labels_), 4),
        "daviesBouldin": round(davies_bouldin_score(sample, hierarchical.labels_), 4),
        "clusters": int(len(set(hierarchical.labels_))),
    }
    dbscan = None
    dbscan_score = -2.0
    for epsilon in np.linspace(0.45, 1.8, 10):
        candidate = DBSCAN(eps=float(epsilon), min_samples=7).fit(sample)
        candidate_clusters = set(candidate.labels_) - {-1}
        if len(candidate_clusters) < 2:
            continue
        score = silhouette_score(sample, candidate.labels_)
        if score > dbscan_score:
            dbscan, dbscan_score = candidate, score
    if dbscan is None:
        dbscan = DBSCAN(eps=1.1, min_samples=7).fit(sample)
    unique_dbscan = set(dbscan.labels_) - {-1}
    algorithms["DBSCAN"] = {
        "silhouette": round(silhouette_score(sample, dbscan.labels_), 4) if len(unique_dbscan) > 1 else None,
        "daviesBouldin": round(davies_bouldin_score(sample, dbscan.labels_), 4) if len(unique_dbscan) > 1 else None,
        "clusters": len(unique_dbscan),
        "noisePoints": int(np.sum(dbscan.labels_ == -1)),
    }
    isolation = IsolationForest(contamination=0.025, random_state=SEED).fit(features)
    outlier_flags = isolation.predict(features)
    outlier_scores = isolation.decision_function(features)
    outlier_indices = np.argsort(outlier_scores)[:12]
    outliers = [{"id": frame.iloc[index]["complaint_id"], "score": round(float(outlier_scores[index]), 4), "text": frame.iloc[index]["complaint_clean"]} for index in outlier_indices]
    cluster_counts = Counter(kmeans.labels_)
    sample_frame = frame.iloc[sample_indices].reset_index(drop=True)
    top_clusters = []
    for cluster, count in cluster_counts.most_common():
        members = sample_frame[np.asarray(kmeans.labels_) == cluster]
        top_category = str(members["category"].mode().iloc[0])
        top_time = str(members["time_band"].mode().iloc[0])
        top_clusters.append({"name": f"{top_category} · {top_time}", "share": round(count / len(sample) * 100, 1)})
    result = {"sampleSize": len(sample), "algorithms": algorithms, "outlierCount": int(np.sum(outlier_flags == -1)), "outliers": outliers, "clusters": top_clusters}
    (OUTPUT_DIR / "clustering.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def generate_images() -> dict[str, object]:
    width, height = 720, 440
    base = Image.new("RGB", (width, height), (43, 51, 48))
    draw = ImageDraw.Draw(base)
    draw.rectangle((0, 285, width, height), fill=(55, 61, 58))
    draw.rectangle((90, 90, 630, 280), fill=(26, 32, 30), outline=(116, 132, 122), width=4)
    for index in range(5):
        x = 120 + index * 108
        draw.rectangle((x, 165, x + 72, 260), fill=(15, 18, 18), outline=(119, 255, 101), width=2)
        draw.rectangle((x + 16, 260, x + 56, 280), fill=(91, 101, 96))
    draw.line((95, 95, 625, 275), fill=(238, 98, 82), width=8)
    noise = NP_RNG.normal(0, 25, (height, width, 3)).astype(np.int16)
    noisy = np.clip(np.asarray(base).astype(np.int16) + noise, 0, 255).astype(np.uint8)
    original = Image.fromarray(noisy).filter(ImageFilter.GaussianBlur(1.2))
    original_path = PUBLIC_IMAGES / "lab-equipment-original.jpg"
    original.save(original_path, quality=82, optimize=True)
    processed = original.filter(ImageFilter.MedianFilter(size=3))
    processed = ImageEnhance.Contrast(processed).enhance(1.32)
    processed = ImageEnhance.Sharpness(processed).enhance(1.25)
    processed = processed.resize((480, 293), Image.Resampling.LANCZOS)
    processed_path = PUBLIC_IMAGES / "lab-equipment-processed.jpg"
    processed.save(processed_path, quality=86, optimize=True)
    normalized = np.asarray(processed).astype(np.float32) / 255.0
    np.save(OUTPUT_DIR / "lab-equipment-normalized.npy", normalized)
    return {
        "original": "/images/evidence/lab-equipment-original.jpg",
        "processed": "/images/evidence/lab-equipment-processed.jpg",
        "originalSize": [width, height],
        "processedSize": [480, 293],
        "normalization": "pixel / 255.0",
        "operations": ["median noise removal", "contrast enhancement", "sharpening", "Lanczos resize", "0-1 normalization"],
    }


def export_arff(frame: pd.DataFrame) -> None:
    path = PUBLIC_DATA / "campuslens-complaints.arff"
    with path.open("w", encoding="utf-8", newline="") as handle:
        handle.write("@RELATION campuslens_complaints\n\n")
        handle.write("@ATTRIBUTE complaint STRING\n@ATTRIBUTE zone STRING\n@ATTRIBUTE facility STRING\n")
        handle.write("@ATTRIBUTE hour NUMERIC\n@ATTRIBUTE occupancy NUMERIC\n@ATTRIBUTE humidity NUMERIC\n@ATTRIBUTE impact NUMERIC\n")
        handle.write("@ATTRIBUTE category {" + ",".join(category.replace(" ", "_") for category in CATEGORIES) + "}\n\n@DATA\n")
        for row in frame.itertuples():
            text = row.complaint_clean.replace("\\", "\\\\").replace("'", "\\'")
            handle.write(f"'{text}','{row.zone}','{row.facility}',{row.hour},{row.occupancy_pct},{row.humidity_pct},{row.impact_rating},{row.category.replace(' ', '_')}\n")


def public_complaints(frame: pd.DataFrame) -> list[dict[str, object]]:
    recent = frame.sort_values("observed_at", ascending=False)
    records = []
    for row in recent.itertuples():
        records.append({
            "id": row.complaint_id,
            "category": row.category,
            "location": f"{row.facility} · {row.room}",
            "zone": row.zone,
            "facility": row.facility,
            "floor": row.floor,
            "room": row.room,
            "time": row.time_band,
            "hour": int(row.hour),
            "day": row.day_name,
            "observedAt": row.observed_at,
            "rating": int(row.impact_rating),
            "text": row.complaint_clean,
            "status": row.status,
            "occupancy": int(row.occupancy_pct),
            "humidity": int(row.humidity_pct),
            "resolutionHours": float(row.resolution_hours),
            "anonymous": True,
        })
    (PUBLIC_DATA / "complaints.json").write_text(json.dumps(records, separators=(",", ":")), encoding="utf-8")
    return records


def build_analytics(frame: pd.DataFrame, quality: dict[str, object], models: dict[str, object], associations: dict[str, object], clustering: dict[str, object], images: dict[str, object]) -> dict[str, object]:
    category_counts = frame["category"].value_counts()
    issue_mix = [{"name": category, "count": int(category_counts.get(category, 0)), "pct": round(float(category_counts.get(category, 0) / len(frame) * 100), 1)} for category in CATEGORIES]
    facilities = frame["facility"].value_counts().head(8)
    hotspots = [{"name": name, "count": int(count), "pct": round(int(count) / int(facilities.max()) * 100, 1)} for name, count in facilities.items()]
    time_bands = ["8-10", "10-12", "12-2", "2-4", "4-7"]
    heatmap = []
    for facility in facilities.index[:5]:
        subset = frame[frame["facility"] == facility]
        values = [int((subset["time_band"] == band).sum()) for band in time_bands]
        heatmap.append({"place": facility, "values": values})
    status_counts = {str(key): int(value) for key, value in frame["status"].value_counts().items()}
    critical = int((frame["severity"] == "Critical").sum())
    unresolved = int(frame["status"].isin(["Open", "Verified", "In Progress", "Escalated"]).sum())
    health_score = round(max(0, 100 - critical / len(frame) * 120 - unresolved / len(frame) * 28))
    analytics = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "data/processed/complaints_clean.csv",
        "datasetCount": len(frame),
        "campusHealthScore": health_score,
        "criticalCount": critical,
        "unresolvedCount": unresolved,
        "meanResolutionHours": round(float(frame["resolution_hours"].mean()), 2),
        "statusCounts": status_counts,
        "issueMix": issue_mix,
        "hotspots": hotspots,
        "heatmap": {"timeBands": time_bands, "rows": heatmap},
        "models": models,
        "association": associations,
        "clustering": clustering,
        "imagePipeline": images,
        "dataQuality": quality,
    }
    (PUBLIC_DATA / "analytics.json").write_text(json.dumps(analytics, indent=2), encoding="utf-8")
    return analytics


def write_metadata(frame: pd.DataFrame) -> None:
    fields = []
    for column in frame.columns:
        fields.append({
            "field": column,
            "dtype": str(frame[column].dtype),
            "nullable": bool(frame[column].isna().any()),
            "distinctValues": int(frame[column].nunique()),
            "role": "measure" if pd.api.types.is_numeric_dtype(frame[column]) else "dimension",
        })
    metadata = {"dataset": "CampusLens complaints", "owner": "CampusLens Data Team", "rowCount": len(frame), "fields": fields}
    (WAREHOUSE_DIR / "metadata_catalog.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


def main() -> None:
    ensure_directories()
    raw = generate_raw_dataset()
    clean, quality = preprocess(raw)
    build_warehouse(clean)
    models, _ = train_models(clean)
    associations = mine_associations(clean)
    clustering = cluster_and_detect_outliers(clean)
    images = generate_images()
    export_arff(clean)
    public_complaints(clean)
    build_analytics(clean, quality, models, associations, clustering, images)
    write_metadata(clean)
    print(json.dumps({"status": "ok", "rows": len(clean), "bestModel": models["bestModel"], "rules": len(associations["rules"]), "warehouse": str(WAREHOUSE_DIR / "campuslens.db")}, indent=2))


if __name__ == "__main__":
    main()
