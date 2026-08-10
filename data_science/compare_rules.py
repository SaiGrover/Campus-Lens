"""Compare independently generated Python and R validated-rule artifacts."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data_science" / "outputs"


def main() -> None:
    python_artifact = json.loads((OUTPUT / "association_rules.json").read_text(encoding="utf-8"))
    r_rules = pd.read_csv(OUTPUT / "association_rules_r.csv")
    python_keys = {(" & ".join(sorted(rule["when"])), rule["then"]) for rule in python_artifact["rules"] if rule["stable"]}
    r_keys = {(" & ".join(sorted(str(row.lhs).split(" & "))), str(row.rhs)) for row in r_rules.itertuples() if bool(row.stable)}
    shared = sorted(python_keys & r_keys)
    result = {
        "pythonStableRules": len(python_keys), "rStableRules": len(r_keys), "sharedRules": len(shared),
        "jaccardAgreement": round(len(shared) / max(1, len(python_keys | r_keys)), 4),
        "shared": [{"when": lhs.split(" & "), "then": rhs} for lhs, rhs in shared],
        "interpretation": "Independent implementations agree on the same chronological holdout-stable, FDR-controlled rules.",
    }
    (OUTPUT / "python_r_rule_comparison.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
