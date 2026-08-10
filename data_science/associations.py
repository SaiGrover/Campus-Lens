"""Validated, constrained association mining and categorical correlation analysis."""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import numpy as np
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules, fpgrowth
from scipy.stats import chi2_contingency, fisher_exact


def _transactions(frame: pd.DataFrame) -> tuple[pd.DataFrame, list[set[str]]]:
    rows = []
    for row in frame.itertuples():
        rows.append({f"FacilityType={row.facility_type}", f"Time={row.time_band}", f"Day={row.day_name}",
                     f"Occupancy={row.occupancy_band}", f"Humidity={row.humidity_band}", f"Severity={row.severity}",
                     f"Source={row.source_system}", f"Category={row.category}"})
    items = sorted(set().union(*rows))
    return pd.DataFrame([{item: item in row for item in items} for row in rows], dtype=bool), rows


def _rule_metrics(rows: list[set[str]], antecedents: frozenset[str], consequent: str) -> tuple[float, float, float, float]:
    n = max(1, len(rows)); antecedent_count = sum(antecedents <= row for row in rows); consequent_count = sum(consequent in row for row in rows)
    joint = sum(antecedents <= row and consequent in row for row in rows)
    support = joint / n; confidence = joint / antecedent_count if antecedent_count else 0; base = consequent_count / n
    lift = confidence / base if base else 0
    table = [[joint, antecedent_count - joint], [consequent_count - joint, n - antecedent_count - consequent_count + joint]]
    p_value = fisher_exact(table, alternative="greater").pvalue if min(map(min, table)) >= 0 else 1.0
    return support, confidence, lift, float(p_value)


def _fdr(values: list[float]) -> list[float]:
    count = len(values); order = np.argsort(values); adjusted = np.ones(count); running = 1.0
    for rank_index in range(count - 1, -1, -1):
        original = int(order[rank_index]); rank = rank_index + 1
        running = min(running, values[original] * count / rank); adjusted[original] = min(1.0, running)
    return adjusted.tolist()


def _cramers_v(left: pd.Series, right: pd.Series) -> float:
    table = pd.crosstab(left, right); chi2 = chi2_contingency(table, correction=False)[0]; n = table.to_numpy().sum()
    phi2 = chi2 / n; rows, columns = table.shape
    corrected = max(0, phi2 - ((columns - 1) * (rows - 1)) / max(1, n - 1))
    rows_corrected = rows - ((rows - 1) ** 2) / max(1, n - 1); columns_corrected = columns - ((columns - 1) ** 2) / max(1, n - 1)
    return math.sqrt(corrected / max(1e-9, min(columns_corrected - 1, rows_corrected - 1)))


def mine_associations(frame: pd.DataFrame, output_dir: Path) -> dict:
    ordered = frame.sort_values("observed_at"); split = int(len(ordered) * .7); training, validation = ordered.iloc[:split], ordered.iloc[split:]
    encoded, training_rows = _transactions(training); _, validation_rows = _transactions(validation)
    started = time.perf_counter(); apriori_sets = apriori(encoded, min_support=.012, use_colnames=True, max_len=3); apriori_ms = (time.perf_counter() - started) * 1000
    started = time.perf_counter(); fp_sets = fpgrowth(encoded, min_support=.012, use_colnames=True, max_len=3); fp_ms = (time.perf_counter() - started) * 1000
    mined = association_rules(apriori_sets, metric="confidence", min_threshold=.25)
    candidates = []
    contextual = ("Time=", "Day=", "Occupancy=", "Humidity=", "Severity=", "Source=")
    for _, row in mined.iterrows():
        antecedents = frozenset(map(str, row.antecedents)); consequents = list(map(str, row.consequents))
        if len(consequents) != 1 or not consequents[0].startswith("Category=") or not 1 <= len(antecedents) <= 2: continue
        if any(item.startswith("Category=") for item in antecedents): continue
        if not any(item.startswith(contextual) for item in antecedents): continue
        valid_support, valid_confidence, valid_lift, p_value = _rule_metrics(validation_rows, antecedents, consequents[0])
        if valid_support < .006 or valid_confidence < .20 or valid_lift < 1.06 or abs(float(row.confidence) - valid_confidence) > .22: continue
        candidates.append({"when": sorted(antecedents), "then": consequents[0], "support": round(float(row.support), 4),
                           "confidence": round(float(row.confidence), 4), "lift": round(float(row.lift), 3),
                           "validationSupport": round(valid_support, 4), "validationConfidence": round(valid_confidence, 4),
                           "validationLift": round(valid_lift, 3), "pValue": p_value,
                           "leverage": round(float(row.leverage), 4), "conviction": None if not math.isfinite(float(row.conviction)) else round(float(row.conviction), 3)})
    adjusted = _fdr([row["pValue"] for row in candidates]) if candidates else []
    for row, value in zip(candidates, adjusted): row["fdrQValue"] = round(value, 6); row["stable"] = value <= .05
    candidates.sort(key=lambda row: (row["stable"], row["validationLift"], row["validationConfidence"]), reverse=True)
    rules = []
    for candidate in candidates:
        redundant = any(existing["then"] == candidate["then"] and set(existing["when"]).issubset(candidate["when"]) and existing["validationConfidence"] >= candidate["validationConfidence"] - .02 for existing in rules)
        if not redundant: rules.append(candidate)
        if len(rules) == 24: break

    fields = ["category", "facility_type", "time_band", "day_name", "occupancy_band", "humidity_band", "severity", "source_system"]
    correlations = []
    for index, left in enumerate(fields):
        for right in fields[index + 1:]: correlations.append({"left": left, "right": right, "cramersV": round(_cramers_v(frame[left], frame[right]), 4)})
    correlations.sort(key=lambda row: row["cramersV"], reverse=True)
    apriori_items = set(map(frozenset, apriori_sets.itemsets)); fp_items = set(map(frozenset, fp_sets.itemsets))
    result = {"transactionCount": len(frame), "trainingTransactions": len(training), "validationTransactions": len(validation),
              "minSupport": .012, "minConfidence": .25, "validationMinimumSupport": .006,
              "lowSupportWarning": "Rules near the minimum support are exploratory and must pass holdout stability plus FDR control; lift alone is not treated as evidence.",
              "constraint": "single category consequent; one or two non-category antecedents; at least one contextual condition",
              "aprioriFrequentItemsets": len(apriori_sets), "fpGrowthFrequentItemsets": len(fp_sets), "algorithmsAgree": apriori_items == fp_items,
              "benchmarkMs": {"Apriori": round(apriori_ms, 2), "FP-Growth": round(fp_ms, 2)}, "redundancyPruned": len(candidates) - len(rules),
              "stableRuleCount": sum(bool(row["stable"]) for row in rules), "rules": rules, "correlationAnalysis": correlations[:18]}
    (output_dir / "association_rules.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    pd.DataFrame(rules).to_csv(output_dir / "association_rules_validated.csv", index=False)
    return result
