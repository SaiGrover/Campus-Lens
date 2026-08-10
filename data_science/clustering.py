"""Honest clustering comparison and labelled anomaly benchmark evaluation."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import AgglomerativeClustering, DBSCAN, KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import adjusted_rand_score, davies_bouldin_score, f1_score, precision_score, recall_score, silhouette_score
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

from .generation import SEED


def _metrics(features: np.ndarray, labels: np.ndarray) -> dict:
    clusters = set(labels) - {-1}
    if len(clusters) < 2: return {"silhouette": None, "daviesBouldin": None, "clusters": len(clusters), "noisePoints": int(np.sum(labels == -1))}
    return {"silhouette": round(float(silhouette_score(features, labels)), 4), "daviesBouldin": round(float(davies_bouldin_score(features, labels)), 4),
            "clusters": len(clusters), "noisePoints": int(np.sum(labels == -1))}


def cluster_and_detect_outliers(frame: pd.DataFrame, output_dir: Path) -> dict:
    rng = np.random.default_rng(SEED); indices = rng.permutation(len(frame)); tuning_idx, evaluation_idx = indices[:900], indices[900:1800]
    tuning_frame, evaluation_frame = frame.iloc[tuning_idx].reset_index(drop=True), frame.iloc[evaluation_idx].reset_index(drop=True)
    vectorizer = TfidfVectorizer(max_features=260, min_df=3, stop_words="english")
    tuning_sparse = vectorizer.fit_transform(tuning_frame["complaint_clean"]); evaluation_sparse = vectorizer.transform(evaluation_frame["complaint_clean"])
    svd = TruncatedSVD(n_components=20, random_state=SEED); tuning_text = svd.fit_transform(tuning_sparse); evaluation_text = svd.transform(evaluation_sparse)
    scaler = StandardScaler(); numeric_columns = ["impact_rating", "occupancy_pct", "humidity_pct", "hour", "service_sessions"]
    tuning_numeric = scaler.fit_transform(tuning_frame[numeric_columns]); evaluation_numeric = scaler.transform(evaluation_frame[numeric_columns])
    tuning = np.hstack([tuning_text, tuning_numeric]); evaluation = np.hstack([evaluation_text, evaluation_numeric])

    k_search = []
    for k in range(2, 13):
        labels = KMeans(n_clusters=k, random_state=SEED, n_init=20).fit_predict(tuning)
        k_search.append({"k": k, "silhouette": round(float(silhouette_score(tuning, labels)), 4)})
    chosen_k = max(k_search, key=lambda row: row["silhouette"])["k"]
    kmeans = KMeans(n_clusters=chosen_k, random_state=SEED, n_init=30).fit(evaluation); kmeans_repeat = KMeans(n_clusters=chosen_k, random_state=SEED + 1, n_init=30).fit(evaluation)
    algorithms = {"K-Means": _metrics(evaluation, kmeans.labels_) | {"stabilityARI": round(float(adjusted_rand_score(kmeans.labels_, kmeans_repeat.labels_)), 4), "selectedK": chosen_k}}
    hierarchical_labels = AgglomerativeClustering(n_clusters=chosen_k, linkage="ward").fit_predict(evaluation)
    algorithms["Hierarchical"] = _metrics(evaluation, hierarchical_labels)

    gmm_search = []
    for components in range(2, 11):
        model = GaussianMixture(n_components=components, covariance_type="diag", random_state=SEED, reg_covar=1e-5).fit(tuning)
        gmm_search.append({"components": components, "bic": round(float(model.bic(tuning)), 2)})
    selected_components = min(gmm_search, key=lambda row: row["bic"])["components"]
    gmm = GaussianMixture(n_components=selected_components, covariance_type="diag", random_state=SEED, reg_covar=1e-5).fit(evaluation)
    algorithms["Gaussian Mixture"] = _metrics(evaluation, gmm.predict(evaluation)) | {"selectedBy": "minimum tuning BIC", "components": selected_components}

    eps_search = []
    for epsilon in np.linspace(.7, 2.4, 18):
        labels = DBSCAN(eps=float(epsilon), min_samples=8).fit_predict(tuning); clusters = set(labels) - {-1}
        if len(clusters) >= 2 and np.mean(labels == -1) < .65:
            eps_search.append({"epsilon": float(epsilon), "silhouette": float(silhouette_score(tuning, labels))})
    selected_epsilon = max(eps_search, key=lambda row: row["silhouette"])["epsilon"] if eps_search else 1.2
    dbscan_labels = DBSCAN(eps=selected_epsilon, min_samples=8).fit_predict(evaluation)
    algorithms["DBSCAN"] = _metrics(evaluation, dbscan_labels) | {"epsilonSelectedOnTuning": round(selected_epsilon, 3)}

    # STING-like grid clustering for the syllabus grid-based method.
    lat_bin = pd.cut(evaluation_frame["latitude"], bins=6, labels=False, duplicates="drop"); lon_bin = pd.cut(evaluation_frame["longitude"], bins=6, labels=False, duplicates="drop")
    grid_labels = (lat_bin.fillna(0).astype(int) * 6 + lon_bin.fillna(0).astype(int)).to_numpy()
    grid_counts = Counter(grid_labels); active_cells = {cell for cell, count in grid_counts.items() if count >= 8}; grid_cluster_labels = np.array([value if value in active_cells else -1 for value in grid_labels])
    algorithms["STING Grid"] = _metrics(evaluation[:, -5:], grid_cluster_labels) | {"grid": "6x6", "minimumCellDensity": 8}

    feature_names = vectorizer.get_feature_names_out(); cluster_profiles = []
    for cluster_id, count in Counter(kmeans.labels_).most_common():
        members = evaluation_frame[np.asarray(kmeans.labels_) == cluster_id]
        text_centroid = kmeans.cluster_centers_[cluster_id][:20]; reconstructed = svd.inverse_transform(text_centroid.reshape(1, -1))[0]
        terms = [str(feature_names[index]) for index in np.argsort(reconstructed)[-3:][::-1]]
        cluster_profiles.append({"id": int(cluster_id), "name": " / ".join(terms[:2]), "topTerms": terms,
                                 "dominantFacilityType": str(members["facility_type"].mode().iloc[0]), "dominantTime": str(members["time_band"].mode().iloc[0]),
                                 "share": round(count / len(evaluation) * 100, 1)})

    # Threshold is chosen on chronological validation labels and evaluated once on the future holdout.
    ordered = frame.sort_values("observed_at").reset_index(drop=True); train_end, valid_end = int(len(ordered) * .6), int(len(ordered) * .8)
    anomaly_train, anomaly_valid, anomaly_test = ordered.iloc[:train_end], ordered.iloc[train_end:valid_end], ordered.iloc[valid_end:]
    numeric = ["impact_rating", "occupancy_pct", "humidity_pct", "hour", "resolution_hours", "service_sessions"]
    anomaly_scaler = StandardScaler().fit(anomaly_train[numeric]); train_features = anomaly_scaler.transform(anomaly_train[numeric]); valid_features = anomaly_scaler.transform(anomaly_valid[numeric]); test_features = anomaly_scaler.transform(anomaly_test[numeric])
    detector = IsolationForest(contamination="auto", random_state=SEED).fit(train_features[anomaly_train["is_seeded_anomaly"] == 0])
    validation_scores = -detector.decision_function(valid_features); test_scores = -detector.decision_function(test_features)
    thresholds = np.quantile(validation_scores, np.linspace(.85, .995, 40)); best_threshold = max(thresholds, key=lambda threshold: f1_score(anomaly_valid["is_seeded_anomaly"], validation_scores >= threshold, zero_division=0))
    anomaly_prediction = test_scores >= best_threshold; truth = anomaly_test["is_seeded_anomaly"].to_numpy()
    outlier_indices = np.argsort(test_scores)[-12:][::-1]
    outliers = [{"id": str(anomaly_test.iloc[index]["complaint_id"]), "score": round(float(test_scores[index]), 4), "knownSyntheticAnomaly": bool(truth[index]), "text": str(anomaly_test.iloc[index]["complaint_clean"])} for index in outlier_indices]
    anomaly_evaluation = {"protocol": "threshold tuned on labelled validation anomalies; final metrics on chronological holdout",
                          "threshold": round(float(best_threshold), 5), "testSize": len(anomaly_test), "positiveCount": int(np.sum(truth)),
                          "predictedCount": int(np.sum(anomaly_prediction)), "precision": round(float(precision_score(truth, anomaly_prediction, zero_division=0)), 4),
                          "recall": round(float(recall_score(truth, anomaly_prediction, zero_division=0)), 4), "f1": round(float(f1_score(truth, anomaly_prediction, zero_division=0)), 4)}
    result = {"tuningSize": len(tuning), "evaluationSize": len(evaluation), "featureReduction": {"method": "TF-IDF + TruncatedSVD", "components": 20, "explainedVariance": round(float(svd.explained_variance_ratio_.sum()), 4)},
              "kSelection": k_search, "gmmSelection": gmm_search, "algorithms": algorithms, "clusters": cluster_profiles,
              "anomalyEvaluation": anomaly_evaluation, "outlierCount": anomaly_evaluation["predictedCount"], "outliers": outliers,
              "interpretation": "Cluster quality is reported without claiming operational separation when silhouette is weak."}
    (output_dir / "clustering.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result
