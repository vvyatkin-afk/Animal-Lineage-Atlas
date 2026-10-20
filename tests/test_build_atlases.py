import json
import tempfile
import unittest
from pathlib import Path

from tools.build_atlases import _approved_items_for_document, _write_public_media_manifest, _write_runtime_index


class RuntimeGraphSummaryTests(unittest.TestCase):
    def test_graph_summary_preserves_dates_location_and_requires_approved_media_allowlist(self):
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
        self.assertFalse(summary["photo_confirmed"])
        self.assertNotIn("photo_url", summary)
        self.assertNotIn("photo_source_url", summary)
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

    def test_approved_photo_uses_browser_direct_thumbnail_and_original_with_thumbnail_relay_fallback(self):
        media_id = "a426db98f35e4bc984275cc031467ac9"
        source_url = "https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg"
        direct_thumbnail_url = "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Futa_20261004_3.jpg/330px-Futa_20261004_3.jpg"
        relay_thumbnail_url = "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Futa_20261004_3.jpg/250px-Futa_20261004_3.jpg"
        document = {
            "release": {}, "coverage": {},
            "animals": [{"id": "red-panda:futa", "taxon": "Ailurus fulgens", "sex": "male", "status": "living",
                         "name": {"canonical": "Futa"}}],
            "relationships": [], "events": [], "claims": [], "sources": [], "institutions": [],
            "media": [{"media_id": media_id, "animal_id": "red-panda:futa", "embedding_status": "allowed",
                       "rights_status": "cc-by-4.0", "identity_confidence": "confirmed", "source_page_url": source_url,
                       "direct_remote_url": "https://upload.wikimedia.org/wikipedia/commons/5/55/Futa_20261004_3.jpg",
                       "direct_thumbnail_url": direct_thumbnail_url,
                       "license_name": "CC BY 4.0", "license_url": "https://creativecommons.org/licenses/by/4.0/"}],
        }
        approved = [{
            "id": media_id, "animal_id": "red-panda:futa", "identity_confidence": "confirmed",
            "source_page_url": source_url, "creator": "Misei sen", "credit": "Misei sen",
            "rights_status": "cc-by-4.0", "embedding_status": "allowed",
            "license": {"name": "CC BY 4.0", "version": "4.0", "url": "https://creativecommons.org/licenses/by/4.0/"},
            "original_url": "https://upload.wikimedia.org/wikipedia/commons/5/55/Futa_20261004_3.jpg",
            "direct_thumbnail_url": direct_thumbnail_url,
            "changes": "No changes made.",
            "variants": {"thumb": {"url": relay_thumbnail_url, "max_bytes": 65536},
                         "profile": {"url": "https://thumb.wikimedia.org/example-large.jpg", "max_bytes": 393216}},
        }]
        approved_items = _approved_items_for_document(document, {"items": approved})
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary)
            _write_runtime_index(document, output, "/atlas.red-panda/", approved_items)
            _write_public_media_manifest(output, approved_items)
            runtime = json.loads((output / "runtime.json").read_text(encoding="utf-8"))
            public_manifest = json.loads((output / "media-manifest.json").read_text(encoding="utf-8"))
            chunk_name = runtime["animals"][0]["detail_chunk"]
            chunk = json.loads((output / chunk_name).read_text(encoding="utf-8"))

        summary = runtime["animals"][0]
        self.assertTrue(summary["photo_confirmed"])
        self.assertEqual(summary["photo_url"], direct_thumbnail_url)
        self.assertEqual(summary["photo_fallback_url"], f"/atlas.red-panda/media/{media_id}/thumb")
        self.assertEqual(summary["photo_credit"], "Misei sen")
        self.assertEqual(summary["photo_license"], "CC BY 4.0")
        self.assertEqual(chunk["media"][0]["media_id"], media_id)
        self.assertNotIn("direct_remote_url", chunk["media"][0])
        self.assertNotIn("direct_thumbnail_url", chunk["media"][0])
        self.assertEqual(public_manifest["items"][0]["thumbnail_url"], relay_thumbnail_url)
        public_manifest_text = json.dumps(public_manifest)
        self.assertIn("upload.wikimedia.org", public_manifest_text)
        self.assertIn("thumb.wikimedia.org", public_manifest_text)
        self.assertIn(source_url, public_manifest_text)

    def test_approved_direct_thumbnail_must_match_its_original_and_a_standard_size(self):
        media_id = "a426db98f35e4bc984275cc031467ac9"
        source_url = "https://commons.wikimedia.org/wiki/File:Futa_20261004_3.jpg"
        original_url = "https://upload.wikimedia.org/wikipedia/commons/5/55/Futa_20261004_3.jpg"
        invalid_thumbnail_urls = [
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Other_photo.jpg/330px-Other_photo.jpg",
            "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Futa_20261004_3.jpg/292px-Futa_20261004_3.jpg",
        ]
        for invalid_thumbnail_url in invalid_thumbnail_urls:
            with self.subTest(thumbnail=invalid_thumbnail_url):
                document = {"media": [{
                    "media_id": media_id,
                    "animal_id": "red-panda:futa",
                    "embedding_status": "allowed",
                    "rights_status": "cc-by-4.0",
                    "identity_confidence": "confirmed",
                    "source_page_url": source_url,
                    "direct_remote_url": original_url,
                    "direct_thumbnail_url": invalid_thumbnail_url,
                    "license_name": "CC BY 4.0",
                    "license_url": "https://creativecommons.org/licenses/by/4.0/",
                }]}
                approved = [{
                    "id": media_id,
                    "animal_id": "red-panda:futa",
                    "identity_confidence": "confirmed",
                    "source_page_url": source_url,
                    "creator": "Misei sen",
                    "credit": "Misei sen",
                    "rights_status": "cc-by-4.0",
                    "embedding_status": "allowed",
                    "license": {"name": "CC BY 4.0", "version": "4.0", "url": "https://creativecommons.org/licenses/by/4.0/"},
                    "original_url": original_url,
                    "direct_thumbnail_url": invalid_thumbnail_url,
                    "variants": {"thumb": {"url": "https://thumb.wikimedia.org/wikipedia/commons/thumb/5/55/Futa_20261004_3.jpg/250px-Futa_20261004_3.jpg"}},
                }]
                with self.assertRaisesRegex(RuntimeError, "does not match canonical record"):
                    _approved_items_for_document(document, {"items": approved})


if __name__ == "__main__":
    unittest.main()
