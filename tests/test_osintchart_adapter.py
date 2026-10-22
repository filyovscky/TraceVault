"""Run against a real OSINTchart checkout: python tests/test_osintchart_adapter.py PATH."""
import copy
import sys
import unittest
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(sys.argv.pop(1)).resolve() / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "adapters"))
from osint_notebook.services.case_service import CaseService
from osint_notebook.models.types import SCHEMA_VERSION
from osintchart_import import preview, apply_plan


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.service = CaseService()
        self.case_id, self.capture_id, self.artifact_id = (str(uuid4()) for _ in range(3))
        timestamp = "2026-10-22T11:42:17.384Z"
        refs = [{"reference_id": str(uuid4()), "capture_id": self.capture_id, "artifact_id": self.artifact_id, "source_url": "https://example.org", "status": "archived", "observed_at": timestamp} for _ in range(5)]
        self.package = {"schema_version": 1, "format": "tracevault-osintchart", "case": {"case_id": self.case_id}, "entities": [{"entity_id": str(uuid4()), "entity_type": "person", "label": "Person " + str(i), "raw_value": "Person " + str(i), "confidence": None, "created_at": timestamp, "evidence_refs": [r["reference_id"] for r in (refs[:3] if i == 0 else [refs[i + 2]])]} for i in range(3)], "evidence": [{"capture_id": self.capture_id}], "artifacts": [{"artifact_id": self.artifact_id, "capture_id": self.capture_id, "relative_path": "captures/archive.html", "sha256": "a" * 64}], "evidence_refs": refs, "relations": []}

    def test_real_schema_and_idempotent_service_import(self):
        self.assertEqual(SCHEMA_VERSION, 2)
        plan = preview(self.service, self.package)
        self.assertEqual(plan["counts"]["create"], 3)
        apply_plan(self.service, self.package, plan, confirmed=True)
        self.assertEqual(len(self.service.case.entities), 3)
        plan = preview(self.service, self.package)
        self.assertEqual(plan["counts"]["skip"], 3)
        apply_plan(self.service, self.package, plan, confirmed=True)
        self.assertEqual(len(self.service.case.entities), 3)
        self.assertEqual(sum(len(e.meta.evidence_refs) for e in self.service.case.entities.values()), 5)
        for entity in self.service.case.entities.values():
            self.assertEqual(str(entity.meta.verification), "unconfirmed")
            self.assertTrue(entity.attributes["tracevault"]["confidence_unassessed"])
            self.assertTrue(all(isinstance(ref, str) for ref in entity.meta.evidence_refs))
        # Actual target model serialization survives round trip.
        restored = type(self.service.case).model_validate_json(self.service.case.model_dump_json())
        self.assertEqual(len(restored.entities), 3)

    def test_confirmation_and_stale_preview(self):
        plan = preview(self.service, self.package)
        with self.assertRaises(ValueError):
            apply_plan(self.service, self.package, plan)
        self.service.new_case("Another target")
        with self.assertRaises(ValueError):
            apply_plan(self.service, self.package, plan, confirmed=True)

    def test_conflict_does_not_overwrite_analyst_or_evidence(self):
        apply_plan(self.service, self.package, preview(self.service, self.package), confirmed=True)
        first = next(iter(self.service.case.entities.values()))
        self.service.update_entity(first.id, label="Analyst changed name")
        plan = preview(self.service, self.package)
        self.assertEqual(plan["counts"]["conflict"], 1)
        before = self.service.case.model_dump_json()
        with self.assertRaises(ValueError):
            apply_plan(self.service, self.package, plan, confirmed=True)
        self.assertEqual(before, self.service.case.model_dump_json())
        changed = copy.deepcopy(self.package)
        changed["artifacts"][0]["sha256"] = "b" * 64
        self.assertGreater(preview(self.service, changed)["counts"]["conflict"], 0)

    def test_unknown_references_and_unsafe_paths_rejected(self):
        self.package["entities"][0]["evidence_refs"] = [str(uuid4())]
        with self.assertRaises(ValueError):
            preview(self.service, self.package)
        self.package["entities"][0]["evidence_refs"] = []
        self.package["artifacts"][0]["relative_path"] = "../outside.html"
        with self.assertRaises(ValueError):
            preview(self.service, self.package)


if __name__ == "__main__":
    unittest.main()
