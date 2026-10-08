import importlib.util
import json
import sys
import unittest
from copy import deepcopy
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_validator(test_case):
    module_path = ROOT / "tools" / "validate_atlas.py"
    test_case.assertTrue(module_path.is_file(), "validator module should exist")
    spec = importlib.util.spec_from_file_location("validate_atlas", module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def minimal_atlas():
    return {
        "release": {
            "schema_version": "1.0.0",
            "data_version": "2026.10.07",
            "engine_version": "1.0.0",
            "build_date": "2026-10-07",
            "provenance": "test fixture",
        },
        "coverage": {
            "taxon": "Hippopotamus amphibius",
            "scope": "One test animal",
            "limitations": ["Test fixture only"],
            "translations": {
                "ja": {"scope": "テスト対象の動物1頭", "limitations": ["テスト用データのみ"]},
                "ru": {"scope": "Одно тестовое животное", "limitations": ["Только тестовые данные"]},
            },
            "last_reviewed": "2026-10-07",
        },
        "animals": [
            {
                "id": "test:fiona",
                "taxon": "Hippopotamus amphibius",
                "sex": "female",
                "status": "living",
                "name": {
                    "canonical": "Fiona",
                    "language": "en",
                    "source_ids": ["source:zoo"],
                    "localized": [],
                },
                "aliases": [],
                "external_ids": [],
                "review": {"status": "reviewed", "reviewed_on": "2026-10-07", "notes": ""},
            }
        ],
        "claims": [],
        "relationships": [],
        "events": [],
        "institutions": [],
        "media": [],
        "sources": [
            {
                "id": "source:zoo",
                "title": "Zoo animal profile",
                "publisher": "Example Zoo",
                "url": "https://example.org/fiona",
                "publication_date": None,
                "accessed_date": "2026-10-07",
                "source_type": "zoo_profile",
                "notes": "Test fixture.",
                "data_use": "Factual name citation; no media reuse implied.",
            }
        ],
    }


def issue_codes(issues):
    return {issue.code for issue in issues}


class ValidateAtlasTests(unittest.TestCase):
    def setUp(self):
        self.validator = load_validator(self)

    def test_accepts_minimal_atlas(self):
        self.assertEqual(self.validator.validate_atlas(minimal_atlas()), [])

    def test_accepts_direct_remote_url_as_non_embedded_link_only_metadata(self):
        atlas = minimal_atlas()
        atlas["media"].append(
            {
                "media_id": "media:test:link-only",
                "animal_id": "test:fiona",
                "source_page_url": "https://example.org/fiona-photo-source",
                "direct_remote_url": "https://cdn.example.org/fiona.jpg",
                "credit": None,
                "rights_status": "unknown",
                "embedding_status": "link_only",
                "offline_archive_eligible": False,
                "identity_confidence": "probable",
                "checked_date": "2026-10-07",
                "notes": "URL metadata only; not embedded or fetched.",
                "source_ids": ["source:zoo"],
            }
        )
        self.assertEqual(self.validator.validate_atlas(atlas), [])

    def test_rejects_embedding_when_media_rights_are_unknown(self):
        atlas = minimal_atlas()
        atlas["media"].append(
            {
                "media_id": "media:test:unknown-rights",
                "animal_id": "test:fiona",
                "source_page_url": "https://example.org/fiona-photo-source",
                "direct_remote_url": "https://cdn.example.org/fiona.jpg",
                "credit": None,
                "rights_status": "unknown",
                "embedding_status": "allowed",
                "offline_archive_eligible": False,
                "identity_confidence": "probable",
                "checked_date": "2026-10-07",
                "notes": "Fixture only.",
                "source_ids": ["source:zoo"],
            }
        )
        self.assertIn("unlicensed_embedding", issue_codes(self.validator.validate_atlas(atlas)))

    def test_rejects_incomplete_coverage_translation(self):
        atlas = minimal_atlas()
        atlas["coverage"]["translations"]["ja"]["limitations"] = []
        self.assertIn("invalid_coverage_translation", issue_codes(self.validator.validate_atlas(atlas)))

    def test_rejects_dangling_relationship(self):
        atlas = minimal_atlas()
        atlas["relationships"].append(
            {
                "id": "rel:missing-parent",
                "subject": "test:absent",
                "object": "test:fiona",
                "type": "biological_mother",
                "status": "confirmed",
                "source_ids": ["source:zoo"],
                "review": {"status": "reviewed", "reviewed_on": "2026-10-07", "notes": ""},
            }
        )
        self.assertIn("dangling_animal", issue_codes(self.validator.validate_atlas(atlas)))

    def test_rejects_duplicate_external_id_in_namespace(self):
        atlas = minimal_atlas()
        duplicate = deepcopy(atlas["animals"][0])
        duplicate.update(
            {
                "id": "test:second",
                "name": {"canonical": "Second", "language": "en", "source_ids": ["source:zoo"], "localized": []},
                "external_ids": [{"namespace": "zoo-registry", "value": "42"}],
            }
        )
        atlas["animals"][0]["external_ids"] = [{"namespace": "zoo-registry", "value": "42"}]
        atlas["animals"].append(duplicate)
        self.assertIn("duplicate_external_id", issue_codes(self.validator.validate_atlas(atlas)))

    def test_rejects_self_ancestry_and_cycles(self):
        atlas = minimal_atlas()
        second = deepcopy(atlas["animals"][0])
        second.update(
            {
                "id": "test:second",
                "name": {"canonical": "Second", "language": "en", "source_ids": ["source:zoo"], "localized": []},
            }
        )
        atlas["animals"].append(second)
        atlas["relationships"] = [
            {
                "id": "rel:self",
                "subject": "test:fiona",
                "object": "test:fiona",
                "type": "biological_mother",
                "status": "confirmed",
                "source_ids": ["source:zoo"],
                "review": {"status": "reviewed", "reviewed_on": "2026-10-07", "notes": ""},
            },
            {
                "id": "rel:forward",
                "subject": "test:fiona",
                "object": "test:second",
                "type": "biological_father",
                "status": "probable",
                "source_ids": ["source:zoo"],
                "review": {"status": "reviewed", "reviewed_on": "2026-10-07", "notes": ""},
            },
            {
                "id": "rel:backward",
                "subject": "test:second",
                "object": "test:fiona",
                "type": "biological_mother",
                "status": "confirmed",
                "source_ids": ["source:zoo"],
                "review": {"status": "reviewed", "reviewed_on": "2026-10-07", "notes": ""},
            },
        ]
        codes = issue_codes(self.validator.validate_atlas(atlas))
        self.assertIn("self_ancestry", codes)
        self.assertIn("ancestry_cycle", codes)

    def test_date_precision_survives_round_trip(self):
        atlas = minimal_atlas()
        atlas["events"] = [
            {
                "id": "event:birth",
                "animal_id": "test:fiona",
                "type": "birth",
                "date": {"precision": "approximate", "value": "2017-01"},
                "institution_id": None,
                "source_ids": ["source:zoo"],
                "notes": "Source gives month-level precision.",
            }
        ]
        original = deepcopy(atlas["events"][0]["date"])
        self.assertEqual(self.validator.validate_atlas(atlas), [])
        self.assertEqual(json.loads(json.dumps(atlas))["events"][0]["date"], original)

    def test_unnamed_birth_outcome_can_link_to_known_parents(self):
        atlas = minimal_atlas()
        atlas["events"] = [
            {
                "id": "event:unnamed-outcome",
                "animal_id": None,
                "related_animal_ids": ["test:fiona"],
                "outcome_count": 2,
                "type": "birth",
                "date": {"precision": "approximate", "value": "2020"},
                "institution_id": None,
                "source_ids": ["source:zoo"],
                "notes": "Two offspring were reported; neither was individually identified.",
            }
        ]
        self.assertEqual(self.validator.validate_atlas(atlas), [])

    def test_conflicting_claims_are_preserved(self):
        atlas = minimal_atlas()
        atlas["sources"].append(
            {
                "id": "source:second",
                "title": "Second report",
                "publisher": "Example News",
                "url": "https://example.org/fiona-story",
                "publication_date": None,
                "accessed_date": "2026-10-07",
                "source_type": "news",
                "notes": "Test fixture.",
                "data_use": "Factual name citation only.",
            }
        )
        for claim_id, value, source_id in (
            ("claim:name-one", "Fiona", "source:zoo"),
            ("claim:name-two", "Fiona Grace", "source:second"),
        ):
            atlas["claims"].append(
                {
                    "id": claim_id,
                    "subject": "test:fiona",
                    "claim_type": "alternate_canonical_name",
                    "value": value,
                    "status": "disputed",
                    "source_ids": [source_id],
                    "review": {"status": "needs_review", "reviewed_on": "2026-10-07", "notes": "Conflicting source claims."},
                }
            )
        self.assertEqual(self.validator.validate_atlas(atlas), [])
        self.assertEqual(len(atlas["claims"]), 2)

    def test_unknown_parent_is_not_materialized(self):
        atlas = minimal_atlas()
        self.assertEqual(len(atlas["animals"]), 1)
        self.assertEqual(atlas["relationships"], [])
        self.assertEqual(self.validator.validate_atlas(atlas), [])


if __name__ == "__main__":
    unittest.main()
