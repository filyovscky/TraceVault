"""Run against a real OSINTchart checkout: python development/osintchart/test_adapter.py PATH."""
import copy
import sys
import unittest
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(sys.argv.pop(1)).resolve() / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
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

    def test_full_png_frames_and_derived_pdf_are_preserved(self):
        source = self.package["artifacts"][0]
        source.update(kind="full_page_png", mime_type="image/png", relative_path="screenshots/full.png")
        pdf = {"artifact_id": str(uuid4()), "capture_id": self.capture_id, "kind": "derived_pdf", "mime_type": "application/pdf", "relative_path": "exports/derived.pdf", "sha256": "b" * 64, "derivation": {"source_artifact_id": source["artifact_id"], "source_sha256": source["sha256"], "searchable_text": False}}
        frame = {"artifact_id": str(uuid4()), "capture_id": self.capture_id, "kind": "screenshot_frame", "relative_path": "screenshots/frame000.png", "sha256": "c" * 64}
        self.package["artifacts"].extend([pdf, frame])
        self.package["evidence"][0].update(kind="screenshot", capture_scope="full_page", frames=[{"index": 0, "scroll_y": 0, "artifact_id": frame["artifact_id"]}])
        apply_plan(self.service, self.package, preview(self.service, self.package), confirmed=True)
        registry = self.service.case.attributes["tracevault"][self.case_id]
        self.assertIn(pdf["artifact_id"], registry["artifacts"])
        self.assertEqual(registry["artifacts"][pdf["artifact_id"]]["derivation"]["source_sha256"], source["sha256"])
        self.assertFalse(registry["artifacts"][pdf["artifact_id"]]["derivation"]["searchable_text"])

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
