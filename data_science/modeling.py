"""Leakage-safe supervised evaluation, calibration and temporal regression."""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import binomtest
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor, ExtraTreesClassifier, VotingClassifier
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix, f1_score, log_loss,
                             mean_absolute_error, mean_squared_error, precision_score, r2_score, recall_score)
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.naive_bayes import MultinomialNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import LinearSVC
from sklearn.tree import DecisionTreeClassifier

from .generation import CATEGORIES, SEED


def _classifiers() -> dict[str, object]:
    return {
        "Naive Bayes": MultinomialNB(alpha=.45),
        "kNN": KNeighborsClassifier(n_neighbors=9, weights="distance", metric="cosine"),
        "ID3": DecisionTreeClassifier(criterion="entropy", max_depth=28, min_samples_leaf=3, random_state=SEED),
        "SVM": LinearSVC(C=1.0, random_state=SEED),
        "Random Forest": RandomForestClassifier(n_estimators=180, max_depth=32, min_samples_leaf=2, random_state=SEED, n_jobs=-1),
        "Neural Network": MLPClassifier(hidden_layer_sizes=(48,), max_iter=260, early_stopping=True, random_state=SEED),
        "Extra Trees Ensemble": ExtraTreesClassifier(n_estimators=180, min_samples_leaf=2, random_state=SEED, n_jobs=-1),
    }


def _fit_predict(name: str, estimator: object, train_text: pd.Series, train_y: pd.Series, target_text: pd.Series):
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=4500, sublinear_tf=True, stop_words="english")
    train_matrix = vectorizer.fit_transform(train_text); target_matrix = vectorizer.transform(target_text)
    estimator = clone(estimator)
    if name == "Neural Network":
        estimator.fit(train_matrix.toarray(), train_y); prediction = estimator.predict(target_matrix.toarray())
    else:
        estimator.fit(train_matrix, train_y); prediction = estimator.predict(target_matrix)
    return vectorizer, estimator, prediction


def _bootstrap_macro_ci(y_true: np.ndarray, y_pred: np.ndarray, seed: int = SEED) -> list[float]:
    rng = np.random.default_rng(seed); values = []
    for _ in range(400):
        indices = rng.integers(0, len(y_true), len(y_true))
        values.append(f1_score(y_true[indices], y_pred[indices], average="macro", zero_division=0))
    return [round(float(value * 100), 2) for value in np.quantile(values, [.025, .975])]


def train_classifiers(frame: pd.DataFrame, output_dir: Path, public_data: Path) -> dict:
    train = frame[frame["evaluation_fold"].isin([0, 1, 2])].copy()
    validation = frame[frame["evaluation_fold"] == 3].copy()
    test = frame[frame["evaluation_fold"] == 4].copy()
    dev = frame[frame["evaluation_fold"] != 4].copy()
    configs = _classifiers()
    validation_rows = []
    for name, estimator in configs.items():
        _, _, prediction = _fit_predict(name, estimator, train["complaint_clean"], train["category"], validation["complaint_clean"])
        validation_rows.append({"name": name, "validationMacroF1": round(f1_score(validation["category"], prediction, average="macro", zero_division=0) * 100, 2)})
    validation_rows.sort(key=lambda row: row["validationMacroF1"], reverse=True)
    selected_name = validation_rows[0]["name"]

    # Grouped CV is reported independently from the untouched template holdout.
    cv = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=SEED)
    cv_scores: dict[str, list[float]] = {name: [] for name in configs}
    for train_index, valid_index in cv.split(dev, dev["category"], groups=dev["template_group"]):
        fold_train, fold_valid = dev.iloc[train_index], dev.iloc[valid_index]
        for name, estimator in configs.items():
            _, _, prediction = _fit_predict(name, estimator, fold_train["complaint_clean"], fold_train["category"], fold_valid["complaint_clean"])
            cv_scores[name].append(f1_score(fold_valid["category"], prediction, average="macro", zero_division=0))

    fitted = {}; rows = []
    for name, estimator in configs.items():
        vectorizer, model, prediction = _fit_predict(name, estimator, dev["complaint_clean"], dev["category"], test["complaint_clean"])
        fitted[name] = (vectorizer, model, np.asarray(prediction))
        rows.append({
            "name": name, "accuracy": round(accuracy_score(test["category"], prediction) * 100, 2),
            "precision": round(precision_score(test["category"], prediction, average="weighted", zero_division=0) * 100, 2),
            "recall": round(recall_score(test["category"], prediction, average="weighted", zero_division=0) * 100, 2),
            "f1": round(f1_score(test["category"], prediction, average="weighted", zero_division=0) * 100, 2),
            "macroF1": round(f1_score(test["category"], prediction, average="macro", zero_division=0) * 100, 2),
            "groupedCvMacroF1": round(float(np.mean(cv_scores[name])) * 100, 2),
            "groupedCvStd": round(float(np.std(cv_scores[name])) * 100, 2),
            "validationMacroF1": next(row["validationMacroF1"] for row in validation_rows if row["name"] == name),
        })
    rows.sort(key=lambda row: row["validationMacroF1"], reverse=True)
    rows[0]["best"] = True
    selected_vectorizer, selected_model, selected_prediction = fitted[selected_name]
    labels = CATEGORIES
    report = classification_report(test["category"], selected_prediction, labels=labels, output_dict=True, zero_division=0)
    per_class = {label: {metric: round(float(report[label][metric]) * 100, 2) for metric in ["precision", "recall", "f1-score"]} | {"support": int(report[label]["support"])} for label in labels}
    subgroup_performance = {}
    overall_macro = f1_score(test["category"], selected_prediction, average="macro", zero_division=0)
    for attribute in ["source_system", "facility_type"]:
        groups = []
        values = test[attribute].astype(str).to_numpy()
        truth = test["category"].to_numpy()
        for value in sorted(set(values)):
            mask = values == value
            group_macro = f1_score(truth[mask], selected_prediction[mask], average="macro", zero_division=0)
            groups.append({"group": value, "support": int(mask.sum()),
                           "accuracy": round(accuracy_score(truth[mask], selected_prediction[mask]) * 100, 2),
                           "macroF1": round(group_macro * 100, 2),
                           "macroF1GapFromOverall": round((group_macro - overall_macro) * 100, 2)})
        subgroup_performance[attribute] = groups

    baseline = Pipeline([("tfidf", TfidfVectorizer(min_df=2)), ("model", DummyClassifier(strategy="most_frequent"))])
    baseline.fit(dev["complaint_clean"], dev["category"]); baseline_prediction = baseline.predict(test["complaint_clean"])
    second_name = rows[1]["name"]; second_prediction = fitted[second_name][2]
    best_correct = selected_prediction == test["category"].to_numpy(); second_correct = second_prediction == test["category"].to_numpy()
    discordant_best = int(np.sum(best_correct & ~second_correct)); discordant_second = int(np.sum(~best_correct & second_correct))
    mcnemar_p = float(binomtest(discordant_best, discordant_best + discordant_second, .5).pvalue) if discordant_best + discordant_second else 1.0

    # Export a browser NB trained on all benchmark rows, with validation-derived temperature scaling.
    nb_vectorizer = TfidfVectorizer(ngram_range=(1, 2), min_df=2, max_features=4500, sublinear_tf=True, stop_words="english")
    nb_train_matrix = nb_vectorizer.fit_transform(train["complaint_clean"]); nb_validation_matrix = nb_vectorizer.transform(validation["complaint_clean"])
    nb = MultinomialNB(alpha=.45).fit(nb_train_matrix, train["category"])
    validation_log = nb.predict_log_proba(nb_validation_matrix)
    temperatures = np.linspace(.5, 3.0, 26)
    losses = []
    for temperature in temperatures:
        scaled = np.exp(validation_log / temperature); scaled /= scaled.sum(axis=1, keepdims=True)
        losses.append(log_loss(validation["category"], scaled, labels=nb.classes_))
    temperature = float(temperatures[int(np.argmin(losses))])
    full_matrix = nb_vectorizer.fit_transform(frame["complaint_clean"]); nb = MultinomialNB(alpha=.45).fit(full_matrix, frame["category"])
    browser_model = {"algorithm": "Temperature-calibrated Multinomial Naive Bayes", "version": "2.0.0", "temperature": temperature,
                     "classes": nb.classes_.tolist(), "vocabulary": {token: int(index) for token, index in nb_vectorizer.vocabulary_.items()},
                     "idf": nb_vectorizer.idf_.round(8).tolist(), "classLogPrior": nb.class_log_prior_.round(8).tolist(),
                     "featureLogProb": nb.feature_log_prob_.round(8).tolist()}
    (public_data / "classifier.json").write_text(json.dumps(browser_model), encoding="utf-8")

    test_text = set(test["complaint_clean"]); dev_text = set(dev["complaint_clean"])
    result = {
        "evaluationProtocol": "model selection on template fold 3; final evaluation on untouched template fold 4; grouped 4-fold CV on development data",
        "datasetSize": len(frame), "trainingSize": len(train), "validationSize": len(validation), "testSize": len(test), "randomSeed": SEED,
        "featureCount": len(selected_vectorizer.vocabulary_), "models": rows, "bestModel": selected_name,
        "baseline": {"name": "Most frequent class", "macroF1": round(f1_score(test["category"], baseline_prediction, average="macro", zero_division=0) * 100, 2)},
        "macroF1ConfidenceInterval95": _bootstrap_macro_ci(test["category"].to_numpy(), selected_prediction),
        "mcnemarVsRunnerUp": {"runnerUp": second_name, "bestOnlyCorrect": discordant_best, "runnerUpOnlyCorrect": discordant_second, "pValue": round(mcnemar_p, 5)},
        "perClass": per_class, "confusionMatrix": {"labels": labels, "values": confusion_matrix(test["category"], selected_prediction, labels=labels).tolist()},
        "subgroupPerformance": subgroup_performance,
        "leakageAudit": {"exactTestTextSeenInDevelopmentRate": round(len(test_text & dev_text) / max(1, len(test_text)), 4),
                         "templateGroupsOverlap": len(set(test["template_group"]) & set(dev["template_group"]))},
        "calibration": {"browserModel": "Naive Bayes", "temperature": temperature, "validationLogLoss": round(float(min(losses)), 4)},
        "hyperparameters": {name: estimator.get_params(deep=False) for name, estimator in configs.items()},
    }
    (output_dir / "model_metrics.json").write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    return result


def _regression_preprocessor(numeric: list[str], categorical: list[str]):
    return ColumnTransformer([
        ("numeric", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric),
        ("categorical", OneHotEncoder(handle_unknown="ignore"), categorical),
    ])


def train_regression(frame: pd.DataFrame, output_dir: Path) -> dict:
    ordered = frame.sort_values("observed_at").reset_index(drop=True)
    train_end, validation_end = int(len(ordered) * .70), int(len(ordered) * .85)
    train, validation, test = ordered.iloc[:train_end], ordered.iloc[train_end:validation_end], ordered.iloc[validation_end:]
    numeric = ["impact_rating", "occupancy_pct", "humidity_pct", "recurring", "hour", "service_sessions", "mean_dwell_seconds"]
    categorical = ["category", "facility_type", "status", "source_system"]
    candidates = {
        "Linear Regression": LinearRegression(), "Random Forest Regressor": RandomForestRegressor(n_estimators=220, min_samples_leaf=3, random_state=SEED, n_jobs=-1),
        "Neural Network Backpropagation": MLPRegressor(hidden_layer_sizes=(48, 20), max_iter=400, early_stopping=True, random_state=SEED),
    }
    validation_rows = []
    for name, estimator in candidates.items():
        pipeline = Pipeline([("preprocess", _regression_preprocessor(numeric, categorical)), ("model", estimator)])
        pipeline.fit(train[numeric + categorical], train["resolution_hours"])
        prediction = pipeline.predict(validation[numeric + categorical])
        validation_rows.append({"name": name, "validationRmse": math.sqrt(mean_squared_error(validation["resolution_hours"], prediction))})
    selected = min(validation_rows, key=lambda row: row["validationRmse"])["name"]
    development = pd.concat([train, validation])
    rows = []; selected_residuals = None; feature_importance = []
    baseline = DummyRegressor(strategy="mean").fit(development[numeric], development["resolution_hours"])
    baseline_prediction = baseline.predict(test[numeric])
    rows.append({"name": "Mean baseline", "rmse": round(math.sqrt(mean_squared_error(test["resolution_hours"], baseline_prediction)), 3),
                 "mae": round(mean_absolute_error(test["resolution_hours"], baseline_prediction), 3), "r2": round(r2_score(test["resolution_hours"], baseline_prediction), 3), "baseline": True})
    for name, estimator in candidates.items():
        pipeline = Pipeline([("preprocess", _regression_preprocessor(numeric, categorical)), ("model", estimator)])
        pipeline.fit(development[numeric + categorical], development["resolution_hours"])
        prediction = pipeline.predict(test[numeric + categorical]); residuals = test["resolution_hours"].to_numpy() - prediction
        row = {"name": name, "rmse": round(math.sqrt(mean_squared_error(test["resolution_hours"], prediction)), 3),
               "mae": round(mean_absolute_error(test["resolution_hours"], prediction), 3), "r2": round(r2_score(test["resolution_hours"], prediction), 3),
               "validationRmse": round(next(item["validationRmse"] for item in validation_rows if item["name"] == name), 3)}
        if name == selected:
            row["best"] = True; selected_residuals = residuals
            if hasattr(estimator, "feature_importances_"):
                names = pipeline.named_steps["preprocess"].get_feature_names_out(); values = pipeline.named_steps["model"].feature_importances_
                feature_importance = [{"feature": str(feature).replace("numeric__", "").replace("categorical__", ""), "importance": round(float(value), 4)} for feature, value in sorted(zip(names, values), key=lambda pair: pair[1], reverse=True)[:12]]
        rows.append(row)
    residuals = np.asarray(selected_residuals)
    result = {"protocol": "chronological 70/15/15 split; model chosen on validation period and evaluated once on future holdout",
              "trainSize": len(train), "validationSize": len(validation), "testSize": len(test), "models": rows, "bestModel": selected,
              "residualQuantiles": {str(q): round(float(np.quantile(residuals, q)), 3) for q in [.05, .25, .5, .75, .95]},
              "predictionInterval90HalfWidth": round(float(np.quantile(np.abs(residuals), .90)), 3), "featureImportance": feature_importance}
    (output_dir / "regression_metrics.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result
