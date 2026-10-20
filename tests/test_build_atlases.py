import json
import tempfile
import unittest
from pathlib import Path

from tools.build_atlases import _write_runtime_index


class RuntimeGraphSummaryTests(unittest.TestCase):
    def test_graph_summary_preserves_dates_location_and_media_permission_gates(self):
        document = {
            "release": {"data_version": "test", "build_date": "2026-10-20"},
            "coverage": {"scope": "fixture"},
            "animals": [{
                "id": "fixture:bear",
                "taxon": "Ursus maritimus",
                "sex": "female",
                "status": "deceased",
                "name": {"canonical": "Nora", "localized": []},
                "aliases": [],
                "external_ids": [],
            }],
            "relationships": [],
            "events": [
                {"id": "birth", "animal_id": "fixture:bear", "type": "birth",
                 "date": {"precision": "approximate", "value": "2001"}, "institution_id": "zoo:test"},
                {"id": "death", "animal_id": "fixture:bear", "type": "death",
                 "date": {"precision": "range", "start": "2021", "end": "2022"}, "institution_id": "zoo:test"},
            ],
            "claims": [],
            "media": [
                {"media_id": "media:good", "animal_id": "fixture:bear", "embedding_status": "allowed",
                 "rights_status": "permission_granted", "identity_confidence": "confirmed",
                 "direct_remote_url": "https://images.example.org/nora.jpg",
                 "source_page_url": "https://zoo.example.org/nora"},
                {"media_id": "media:probable", "animal_id": "fixture:bear", "embedding_status": "allowed",
                 "rights_status": "cc0", "identity_confidence": "probable",
                 "direct_remote_url": "https://images.example.org/possible.jpg",
                 "source_page_url": "https://zoo.example.org/nora"},
                {"media_id": "media:rights-unknown", "animal_id": "fixture:bear", "embedding_status": "allowed",
                 "rights_status": "unknown", "identity_confidence": "confirmed",
                 "direct_remote_url": "https://images.example.org/unknown.jpg",
                 "source_page_url": "https://zoo.example.org/nora"},
            ],
            "sources": [],
            "institutions": [{"id": "zoo:test", "names": [{"value": "Example Zoo", "language": "en"}],
                               "country_code": "US", "location": "Example City"}],
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            _write_runtime_index(document, output)
            runtime = json.loads((output / "runtime.json").read_text(encoding="utf-8"))
            flag_svg_exists = (output / "flags" / "us.svg").is_file()
            flag_license = (output / "flags" / "LICENSE").read_text(encoding="utf-8")

        summary = runtime["animals"][0]
        self.assertEqual(summary["sex"], "female")
        self.assertEqual(summary["status"], "deceased")
        self.assertEqual(summary["birth_date_label"], "~2001")
        self.assertEqual(summary["death_date_label"], "2021–2022")
        self.assertEqual(summary["institution_label"], "Example Zoo")
        self.assertTrue(summary["photo_confirmed"])
        self.assertEqual(summary["photo_url"], "https://images.example.org/nora.jpg")
        self.assertEqual(summary["photo_source_url"], "https://zoo.example.org/nora")
        self.assertTrue(flag_svg_exists)
        self.assertIn("Copyright (c) 2013 Panayiotis Lipiridis", flag_license)

    def test_summary_does_not_choose_between_conflicting_dates_or_unapproved_photos(self):
        document = {
            "release": {}, "coverage": {},
            "animals": [{"id": "fixture:panda", "taxon": "Ailurus fulgens", "sex": "unknown", "status": "unknown",
                         "name": {"canonical": "Example"}}],
            "relationships": [], "claims": [], "sources": [], "institutions": [],
            "events": [
                {"id": "birth-a", "animal_id": "fixture:panda", "type": "birth",
                 "date": {"precision": "exact", "value": "2010-01-01"}},
                {"id": "birth-b", "animal_id": "fixture:panda", "type": "birth",
                 "date": {"precision": "approximate", "value": "2010"}},
            ],
            "media": [{"media_id": "media:no", "animal_id": "fixture:panda", "embedding_status": "link_only",
                       "rights_status": "unknown", "identity_confidence": "unknown",
                       "direct_remote_url": "https://images.example.org/panda.jpg",
                       "source_page_url": "https://source.example.org/panda"}],
        }
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            _write_runtime_index(document, output)
            runtime = json.loads((output / "runtime.json").read_text(encoding="utf-8"))

        summary = runtime["animals"][0]
        self.assertIsNone(summary["birth_date_label"])
        self.assertFalse(summary["photo_confirmed"])
        self.assertNotIn("photo_url", summary)
        self.assertNotIn("photo_source_url", summary)
        self.assertFalse((output / "flags").exists())


if __name__ == "__main__":
    unittest.main()
