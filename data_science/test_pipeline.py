import json
import sqlite3
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data_science" / "outputs"


class PipelineArtifactTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clean = pd.read_csv(ROOT / "data" / "processed" / "complaints_clean.csv")
        cls.quality = json.loads((OUTPUT / "data_quality_report.json").read_text(encoding="utf-8"))
        cls.models = json.loads((OUTPUT / "model_metrics.json").read_text(encoding="utf-8"))

    def test_semantics_and_integration(self):
        self.assertEqual(len(self.clean), 2840)
        self.assertEqual(int(self.clean.isna().sum().sum()), 0)
        self.assertGreater(self.quality["uniqueTextRate"], .98)
        self.assertEqual(self.quality["weekdayConsistencyRate"], 1.0)
        self.assertEqual(self.quality["hierarchyValidRate"], 1.0)
        self.assertGreaterEqual(len(self.quality["integratedSources"]), 3)
        timestamps = pd.to_datetime(self.clean["observed_at"])
        self.assertTrue((timestamps.dt.day_name() == self.clean["day_name"]).all())

    def test_leakage_safe_model_selection(self):
        self.assertEqual(self.models["leakageAudit"]["exactTestTextSeenInDevelopmentRate"], 0)
        self.assertEqual(self.models["leakageAudit"]["templateGroupsOverlap"], 0)
        self.assertEqual(len(self.models["models"]), 7)
        self.assertIn("grouped", self.models["evaluationProtocol"].lower())
        self.assertIn("macroF1ConfidenceInterval95", self.models)
        self.assertEqual(set(self.models["subgroupPerformance"]), {"source_system", "facility_type"})
        selected = next(row for row in self.models["models"] if row.get("best"))
        matrix = self.models["confusionMatrix"]["values"]
        total = sum(map(sum, matrix)); diagonal = sum(row[index] for index, row in enumerate(matrix))
        self.assertEqual(total, self.models["testSize"])
        self.assertAlmostEqual(diagonal / total * 100, selected["accuracy"], places=2)
        self.assertGreater(selected["macroF1"], self.models["baseline"]["macroF1"])
        self.assertLess(selected["macroF1"], 90, "A synthetic benchmark above 90% should trigger a leakage review")

    def test_validated_association_rules_and_r_agreement(self):
        rules = json.loads((OUTPUT / "association_rules.json").read_text(encoding="utf-8"))
        comparison = json.loads((OUTPUT / "python_r_rule_comparison.json").read_text(encoding="utf-8"))
        self.assertTrue(rules["algorithmsAgree"])
        self.assertGreaterEqual(rules["stableRuleCount"], 3)
        self.assertTrue(all(rule["stable"] and rule["fdrQValue"] <= .05 for rule in rules["rules"]))
        self.assertTrue(all(len(rule["when"]) <= 2 and rule["then"].startswith("Category=") for rule in rules["rules"]))
        self.assertEqual(comparison["jaccardAgreement"], 1.0)

    def test_physical_warehouse_olap_and_scd(self):
        connection = sqlite3.connect(ROOT / "warehouse" / "campuslens.db")
        try:
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM fact_complaint").fetchone()[0], 2840)
            self.assertEqual(connection.execute("SELECT COUNT(*) FROM sf_fact_complaint").fetchone()[0], 2840)
            self.assertGreater(connection.execute("SELECT COUNT(*) FROM dim_location WHERE is_current=0 AND valid_to IS NOT NULL").fetchone()[0], 0)
            self.assertGreater(connection.execute("SELECT COUNT(*) FROM mart_location_rollup").fetchone()[0], 0)
            self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
        finally:
            connection.close()

    def test_clustering_anomalies_regression_and_advanced_mining(self):
        clustering = json.loads((OUTPUT / "clustering.json").read_text(encoding="utf-8"))
        regression = json.loads((OUTPUT / "regression_metrics.json").read_text(encoding="utf-8"))
        self.assertIn("Gaussian Mixture", clustering["algorithms"])
        self.assertIn("STING Grid", clustering["algorithms"])
        self.assertIn("stabilityARI", clustering["algorithms"]["K-Means"])
        self.assertGreater(clustering["anomalyEvaluation"]["positiveCount"], 0)
        self.assertGreaterEqual(clustering["anomalyEvaluation"]["f1"], 0)
        self.assertIn("predictionInterval90HalfWidth", regression)
        self.assertTrue(any(row.get("baseline") for row in regression["models"]))
        for name in ["spatial_mining.json", "web_mining.json", "stream_mining.json", "multimedia_mining.json"]:
            self.assertTrue((OUTPUT / name).exists(), name)
        multimedia = json.loads((OUTPUT / "multimedia_mining.json").read_text(encoding="utf-8"))
        self.assertGreater(multimedia["macroF1"], .65)
        self.assertLess(multimedia["accuracy"], 1.0)

    def test_external_tool_and_bi_artifacts(self):
        self.assertIn("Correctly classified", (OUTPUT / "weka-evaluation.txt").read_text(encoding="utf-8"))
        self.assertGreater((OUTPUT / "weka-naive-bayes.model").stat().st_size, 100_000)
        self.assertTrue((OUTPUT / "association_rules_r.csv").exists())
        self.assertTrue((ROOT / "data_science" / "powerbi" / "CampusLens.pbip").exists())
        ET.parse(ROOT / "data_science" / "tableau" / "CampusLens.twb")

    def test_image_preprocessing_outputs(self):
        with Image.open(ROOT / "public" / "images" / "evidence" / "lab-equipment-original.jpg") as original, Image.open(ROOT / "public" / "images" / "evidence" / "lab-equipment-processed.jpg") as processed:
            self.assertEqual(original.size, (320, 220))
            self.assertEqual(processed.size, (480, 330))


if __name__ == "__main__":
    unittest.main()
