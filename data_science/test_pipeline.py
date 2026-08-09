import json
import sqlite3
import unittest
from pathlib import Path

import pandas as pd
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


class PipelineArtifactTests(unittest.TestCase):
    def test_dataset_and_etl_invariants(self):
        raw = pd.read_csv(ROOT / "data" / "raw" / "complaints_raw.csv")
        clean = pd.read_csv(ROOT / "data" / "processed" / "complaints_clean.csv")
        self.assertEqual(len(raw), 2840)
        self.assertEqual(len(clean), 2840)
        self.assertEqual(int(clean.isna().sum().sum()), 0)
        self.assertEqual(clean["complaint_id"].nunique(), 2840)
        self.assertTrue(clean["impact_normalized"].between(0, 1).all())

    def test_warehouse_matches_clean_dataset(self):
        connection = sqlite3.connect(ROOT / "warehouse" / "campuslens.db")
        try:
            fact_count = connection.execute("SELECT COUNT(*) FROM fact_complaint").fetchone()[0]
            location_count = connection.execute("SELECT COUNT(*) FROM dim_location").fetchone()[0]
            mart_count = connection.execute("SELECT SUM(complaint_count) FROM mart_campus_health").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(fact_count, 2840)
        self.assertGreater(location_count, 20)
        self.assertEqual(mart_count, 2840)

    def test_model_metrics_are_mathematically_consistent(self):
        metrics = json.loads((ROOT / "data_science" / "outputs" / "model_metrics.json").read_text(encoding="utf-8"))
        matrix = metrics["confusionMatrix"]["values"]
        total = sum(sum(row) for row in matrix)
        diagonal = sum(matrix[index][index] for index in range(len(matrix)))
        self.assertEqual(total, metrics["testSize"])
        self.assertAlmostEqual(diagonal / total * 100, metrics["models"][0]["accuracy"], places=2)
        self.assertEqual(len(matrix), 8)
        self.assertEqual(len(metrics["models"]), 6)

    def test_rule_algorithms_and_exports(self):
        rules = json.loads((ROOT / "data_science" / "outputs" / "association_rules.json").read_text(encoding="utf-8"))
        self.assertTrue(rules["algorithmsAgree"])
        self.assertGreaterEqual(len(rules["rules"]), 10)
        self.assertGreater(rules["aprioriFrequentItemsets"], 0)
        arff = (ROOT / "public" / "data" / "campuslens-complaints.arff").read_text(encoding="utf-8")
        data_lines = arff.split("@DATA\n", 1)[1].strip().splitlines()
        self.assertEqual(len(data_lines), 2840)
        self.assertIn("Lab_Equipment", arff)
        self.assertIn("Water", arff)

    def test_real_image_preprocessing_outputs(self):
        with Image.open(ROOT / "public" / "images" / "evidence" / "lab-equipment-original.jpg") as original, \
             Image.open(ROOT / "public" / "images" / "evidence" / "lab-equipment-processed.jpg") as processed:
            self.assertEqual(original.size, (720, 440))
            self.assertEqual(processed.size, (480, 293))
            self.assertNotEqual(original.size, processed.size)


if __name__ == "__main__":
    unittest.main()
