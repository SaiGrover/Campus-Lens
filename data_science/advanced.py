"""Spatial, web, stream and multimedia mining experiments required by CO5."""

from __future__ import annotations

import json
import random
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
from scipy.spatial.distance import jensenshannon
from sklearn.decomposition import PCA
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from .generation import CATEGORIES, SEED


def spatial_mining(frame: pd.DataFrame, output_dir: Path) -> dict:
    facilities = frame.groupby(["facility", "latitude", "longitude"]).agg(complaints=("complaint_id", "count"), meanImpact=("impact_rating", "mean")).reset_index()
    coordinates = facilities[["latitude", "longitude"]].to_numpy(); values = facilities["complaints"].to_numpy(dtype=float); n = len(values)
    distances = np.sqrt(((coordinates[:, None, :] - coordinates[None, :, :]) ** 2).sum(axis=2)); np.fill_diagonal(distances, np.inf)
    neighbours = np.zeros((n, n), dtype=float)
    for index in range(n): neighbours[index, np.argsort(distances[index])[:4]] = 1
    neighbours = np.maximum(neighbours, neighbours.T); total_weight = neighbours.sum(); centered = values - values.mean()
    moran = (n / total_weight) * float(np.sum(neighbours * centered[:, None] * centered[None, :])) / float(np.sum(centered ** 2)) if total_weight and np.sum(centered ** 2) else 0
    local_score = centered * (neighbours @ centered) / (np.var(values) + 1e-9)
    facilities["localMoranScore"] = local_score
    hotspots = facilities.sort_values("localMoranScore", ascending=False).head(8)
    lat_bins = pd.cut(frame["latitude"], bins=8, labels=False); lon_bins = pd.cut(frame["longitude"], bins=8, labels=False)
    grid = frame.assign(lat_cell=lat_bins, lon_cell=lon_bins).groupby(["lat_cell", "lon_cell"], observed=True).agg(complaints=("complaint_id", "count"), meanImpact=("impact_rating", "mean")).reset_index()
    result = {"method": "global/local Moran-style spatial autocorrelation with privacy-jittered facility coordinates", "globalMoranI": round(moran, 4),
              "facilityCount": n, "grid": {"resolution": "8x8", "activeCells": len(grid), "cells": grid.round(3).to_dict("records")},
              "hotspots": hotspots.round(5).to_dict("records"), "privacy": "Coordinates are generalized and jittered; no person-level position is stored."}
    (output_dir / "spatial_mining.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def web_mining(services: pd.DataFrame, output_dir: Path) -> dict:
    ordered = services.sort_values(["session_id", "observed_at"])
    route_counts = ordered["route"].value_counts(); search = ordered.groupby("search_term").agg(searches=("session_id", "count"), conversions=("converted_to_report", "sum"), meanDwell=("dwell_seconds", "mean")).reset_index()
    search["conversionRate"] = search["conversions"] / search["searches"]
    transitions = Counter()
    # Synthetic sessions contain one event, so sequence analysis uses adjacent time-ordered events within each facility.
    for _, group in ordered.groupby("facility"):
        routes = group.sort_values("observed_at")["route"].tolist()
        transitions.update(zip(routes[:-1], routes[1:]))
    result = {"method": "usage mining of service routes, searches, dwell and report conversion", "eventCount": len(services),
              "routePopularity": [{"route": key, "events": int(value)} for key, value in route_counts.items()],
              "searchIntent": search.sort_values("conversionRate", ascending=False).round(4).to_dict("records"),
              "topTransitions": [{"from": left, "to": right, "count": count} for (left, right), count in transitions.most_common(12)]}
    (output_dir / "web_mining.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def stream_mining(frame: pd.DataFrame, output_dir: Path) -> dict:
    stream = frame.sort_values("observed_at").reset_index(drop=True); window = 240; step = 120; baseline = None; windows = []
    for start in range(0, len(stream) - window + 1, step):
        chunk = stream.iloc[start:start + window]; distribution = chunk["category"].value_counts(normalize=True).reindex(CATEGORIES, fill_value=0).to_numpy()
        if baseline is None: baseline = distribution
        divergence = float(jensenshannon(baseline + 1e-8, distribution + 1e-8) ** 2)
        windows.append({"start": str(chunk.iloc[0]["observed_at"]), "end": str(chunk.iloc[-1]["observed_at"]), "rows": len(chunk),
                        "jensenShannonDrift": round(divergence, 4), "drift": divergence >= .025,
                        "topCategory": str(chunk["category"].mode().iloc[0]), "meanImpact": round(float(chunk["impact_rating"].mean()), 3)})
    result = {"method": "bounded sliding-window stream mining", "windowSize": window, "step": step, "driftThreshold": .025,
              "windowCount": len(windows), "driftWindowCount": sum(row["drift"] for row in windows), "windows": windows,
              "operationalPolicy": "A drift flag queues human review and retraining; it never silently replaces the deployed model."}
    (output_dir / "stream_mining.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def _image_features(image: Image.Image) -> list[float]:
    resized = image.convert("RGB").resize((96, 96)); array = np.asarray(resized, dtype=np.float32) / 255
    edges = np.asarray(resized.convert("L").filter(ImageFilter.FIND_EDGES), dtype=np.float32) / 255
    red, green, blue = [array[:, :, index] for index in range(3)]
    return [*array.mean(axis=(0, 1)).tolist(), *array.std(axis=(0, 1)).tolist(), float(edges.mean()), float((edges > .35).mean()),
            float((red > green * 1.25).mean()), float((blue > red * 1.2).mean()), float(array.mean()), float(array.std())]


def _draw_image(label: str, index: int, rng: random.Random, np_rng: np.random.Generator) -> Image.Image:
    image = Image.new("RGB", (320, 220), (38 + rng.randrange(15), 43 + rng.randrange(15), 48 + rng.randrange(15))); draw = ImageDraw.Draw(image)
    draw.rectangle((20, 30, 300, 195), outline=(110, 120, 135), width=3)
    for x in range(45, 290, 55): draw.rectangle((x, 95, x + 38, 165), fill=(22, 26, 32), outline=(95, 112, 140), width=2)
    if label == "equipment_fault":
        for x in range(45, 290, 55): draw.rectangle((x + 5, 105, x + 33, 140), fill=(155 + rng.randrange(80), 35, 48))
    elif label == "infrastructure_damage":
        points = [(35, 45), (90, 80), (72, 122), (145, 155), (128, 195)]; draw.line(points, fill=(232, 206, 176), width=5)
    elif label == "cleanliness_hazard":
        for _ in range(8):
            x, y = rng.randrange(25, 285), rng.randrange(150, 205); draw.ellipse((x, y, x + rng.randrange(12, 34), y + rng.randrange(5, 15)), fill=(105, 86, 42))
    else:
        draw.rectangle((35, 178, 285, 188), fill=(85, 106, 94))
    noise = np_rng.normal(0, 8 + index % 8, (220, 320, 3)); return Image.fromarray(np.clip(np.asarray(image, dtype=np.int16) + noise, 0, 255).astype(np.uint8))


def multimedia_mining(public_images: Path, output_dir: Path) -> dict:
    rng = random.Random(SEED); np_rng = np.random.default_rng(SEED); labels = ["equipment_fault", "infrastructure_damage", "cleanliness_hazard", "normal"]
    feature_rows = []; images = []
    for label in labels:
        for index in range(36):
            visual_label = rng.choice([value for value in labels if value != label]) if rng.random() < .14 else label
            image = _draw_image(visual_label, index, rng, np_rng); images.append(image)
            feature_rows.append({"image_id": f"IMG-{label[:3].upper()}-{index:03d}", "label": label, **{f"f{position}": value for position, value in enumerate(_image_features(image))}})
    features = pd.DataFrame(feature_rows); columns = [column for column in features if column.startswith("f")]
    train, test = train_test_split(features, test_size=.25, stratify=features["label"], random_state=SEED)
    model = RandomForestClassifier(n_estimators=220, min_samples_leaf=2, random_state=SEED).fit(train[columns], train["label"]); prediction = model.predict(test[columns])
    scaled = StandardScaler().fit_transform(features[columns]); embedding = PCA(n_components=3, random_state=SEED).fit_transform(scaled)
    similarity = cosine_similarity(scaled); np.fill_diagonal(similarity, -1); pair = np.unravel_index(np.argmax(similarity), similarity.shape)
    public_images.mkdir(parents=True, exist_ok=True)
    original = images[0]; original_path = public_images / "lab-equipment-original.jpg"; original.save(original_path, quality=86)
    processed = ImageEnhance.Contrast(original.filter(ImageFilter.MedianFilter(3))).enhance(1.25).resize((480, 330), Image.Resampling.LANCZOS)
    processed_path = public_images / "lab-equipment-processed.jpg"; processed.save(processed_path, quality=88)
    for label_index, label in enumerate(labels): images[label_index * 36].save(public_images / f"multimedia-{label}.jpg", quality=86)
    features[["image_id", "label", *columns]].to_csv(output_dir / "image_features.csv", index=False)
    result = {"method": "visual feature extraction + Random Forest image classification + PCA embeddings + cosine duplicate search",
              "datasetSize": len(features), "testSize": len(test), "classes": labels, "accuracy": round(float(accuracy_score(test["label"], prediction)), 4),
              "macroF1": round(float(f1_score(test["label"], prediction, average="macro")), 4),
              "perClass": classification_report(test["label"], prediction, output_dict=True, zero_division=0),
              "confusionMatrix": {"labels": labels, "values": confusion_matrix(test["label"], prediction, labels=labels).tolist()},
              "embedding": {"method": "PCA", "components": 3, "explainedVariance": round(float(PCA(n_components=3).fit(scaled).explained_variance_ratio_.sum()), 4),
                            "sample": [{"id": features.iloc[index].image_id, "x": round(float(embedding[index, 0]), 3), "y": round(float(embedding[index, 1]), 3), "z": round(float(embedding[index, 2]), 3)} for index in range(20)]},
              "nearestDuplicateCandidate": {"left": features.iloc[pair[0]].image_id, "right": features.iloc[pair[1]].image_id, "cosineSimilarity": round(float(similarity[pair]), 4)},
              "original": "/images/evidence/lab-equipment-original.jpg", "processed": "/images/evidence/lab-equipment-processed.jpg",
              "operations": ["server-compatible decode", "median noise removal", "contrast enhancement", "Lanczos resize", "visual feature extraction", "classification", "embedding"]}
    (output_dir / "multimedia_mining.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result
