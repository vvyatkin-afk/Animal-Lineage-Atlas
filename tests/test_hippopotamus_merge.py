"""Deterministic, taxon-safe merge of common and pygmy hippo import bundles."""

from __future__ import annotations

from copy import deepcopy
import unittest

from tools.merge_hippopotamus_imports import merge_hippopotamus


COMMON = "Hippopotamus amphibius"
PYGMY = "Choeropsis liberiensis"


def source(source_id: str, source_type: str = "official zoo record") -> dict:
    return {
        "id": source_id,
        "title": f"Record {source_id}",
        "publisher": "Example Zoo",
        "url": f"https://example.org/{source_id}",
        "publication_date": None,
        "accessed_date": "2026-10-08",
        "source_type": source_type,
        "notes": "Supports only the stated animal facts.",
        "data_use": "Factual metadata with attribution; no page text or images copied.",
    }


def animal(animal_id: str, name: str, taxon: str, source_ids: list[str], sex: str = "unknown") -> dict:
    return {
        "id": animal_id,
        "taxon": taxon,
        "sex": sex,
        "status": "unknown",
        "name": {"canonical": name, "language": "en", "source_ids": source_ids, "localized": []},
        "aliases": [],
        "external_ids": [],
        "review": {"status": "reviewed", "reviewed_on": "2026-10-08", "notes": "Test fixture."},
    }


def canonical_atlas() -> dict:
    return {
        "release": {"schema_version": "1.0.0", "data_version": "v1", "engine_version": "1", "build_date": "2026-10-07", "provenance": "test"},
        "coverage": {
            "taxon": COMMON,
            "scope": "Common hippos.",
            "limitations": ["Test fixture."],
            "last_reviewed": "2026-10-07",
            "translations": {"ja": {"scope": "カバ", "limitations": ["試験データ"]}, "ru": {"scope": "Бегемоты", "limitations": ["Тестовые данные"]}},
        },
        "animals": [animal("hippopotamus:bibi", "Bibi", COMMON, ["source:old"], "female")],
        "claims": [],
        "relationships": [],
        "events": [],
        "institutions": [{"id": "institution:cin", "names": [{"value": "Cincinnati Zoo", "language": "en"}], "country_code": "US", "location": "Cincinnati, Ohio"}],
        "media": [],
        "sources": [source("source:old")],
    }


def common_bundle(name: str = "Bibi", sex: str = "female") -> dict:
    return {
        "animals": [
            animal("import:bibi", name, COMMON, ["source:common"], sex),
            animal("import:calf", "Calf", COMMON, ["source:common"]),
        ],
        "claims": [],
        "relationships": [{
            "id": "relationship:common:bibi-calf",
            "subject": "import:bibi",
            "object": "import:calf",
            "type": "biological_mother",
            "status": "confirmed",
            "source_ids": ["source:common"],
        }],
        "events": [{
            "id": "event:common:calf-birth",
            "animal_id": "import:calf",
            "type": "birth",
            "date": {"precision": "exact", "value": "2024-01-01"},
            "institution_id": "institution:common-cin",
            "source_ids": ["source:common"],
            "notes": "Born at Cincinnati Zoo.",
        }],
        "institutions": [{"id": "institution:common-cin", "names": [{"value": "Cincinnati Zoo", "language": "en"}], "country_code": "US", "location": "Cincinnati, Ohio"}],
        "media": [],
        "sources": [source("source:common")],
    }


def pygmy_bundle() -> dict:
    return {
        "animals": [
            animal("import:pygmy-bibi", "Bibi", PYGMY, ["source:pygmy"], "female"),
            animal("import:pygmy-calf", "Calf", PYGMY, ["source:pygmy"]),
        ],
        "claims": [],
        "relationships": [{
            "id": "relationship:pygmy:bibi-calf",
            "subject": "import:pygmy-bibi",
            "object": "import:pygmy-calf",
            "type": "biological_mother",
            "status": "confirmed",
            "source_ids": ["source:pygmy"],
        }],
        "events": [],
        "institutions": [],
        "media": [],
        "sources": [source("source:pygmy")],
    }


class HippopotamusImportMergeTests(unittest.TestCase):
    def test_explicit_crosswalk_merges_curated_identity_and_preserves_new_evidence(self):
        atlas, report = merge_hippopotamus(
            canonical_atlas(),
            [
                {"bundle": common_bundle(), "animal_id_map": {"import:bibi": "hippopotamus:bibi"}},
                {"bundle": pygmy_bundle(), "animal_id_map": {}},
            ],
        )

        self.assertEqual(len(atlas["animals"]), 4)
        self.assertEqual({item["taxon"] for item in atlas["animals"]}, {COMMON, PYGMY})
        self.assertCountEqual(next(item for item in atlas["animals"] if item["id"] == "hippopotamus:bibi")["name"]["source_ids"], ["source:common", "source:old"])
        self.assertIn("import:pygmy-bibi", {item["id"] for item in atlas["animals"]})
        self.assertEqual(report["id_mappings"]["import:bibi"], "hippopotamus:bibi")
        self.assertEqual(report["counts"]["animals"], 4)

    def test_same_name_does_not_merge_without_an_explicit_identity_crosswalk(self):
        atlas, _ = merge_hippopotamus(
            canonical_atlas(), [{"bundle": common_bundle(), "animal_id_map": {}}]
        )
        self.assertEqual(sum(item["name"]["canonical"] == "Bibi" for item in atlas["animals"]), 2)

    def test_cross_taxon_parentage_is_rejected(self):
        bundle = pygmy_bundle()
        bundle["relationships"][0]["subject"] = "hippopotamus:bibi"
        with self.assertRaisesRegex(ValueError, "cross-taxon"):
            merge_hippopotamus(canonical_atlas(), [{"bundle": bundle, "animal_id_map": {}}])

    def test_semantically_duplicate_parent_edge_keeps_all_citations(self):
        bundle = common_bundle()
        bundle["relationships"] = [{
            "id": "relationship:import:bibi-fiona",
            "subject": "import:bibi",
            "object": "import:calf",
            "type": "biological_mother",
            "status": "confirmed",
            "source_ids": ["source:common"],
        }]
        atlas, report = merge_hippopotamus(
            canonical_atlas(),
            [{"import_id": "common", "bundle": bundle, "animal_id_map": {"import:bibi": "hippopotamus:bibi", "import:calf": "hippopotamus:fiona"}}],
        )
        matches = [edge for edge in atlas["relationships"] if edge["subject"] == "hippopotamus:bibi" and edge["object"] == "hippopotamus:fiona" and edge["type"] == "biological_mother"]
        self.assertEqual(len(matches), 1)
        self.assertIn("source:common", matches[0]["source_ids"])
        self.assertEqual(report["relationship_id_mappings"]["relationship:import:bibi-fiona"], matches[0]["id"])

    def test_conflicting_import_facts_are_preserved_as_reviewable_claims(self):
        bundle = common_bundle(name="Bibi the Second", sex="male")
        bundle["animals"] = [bundle["animals"][0]]
        bundle["relationships"] = []
        bundle["events"] = []
        atlas, report = merge_hippopotamus(
            canonical_atlas(),
            [{"import_id": "common", "bundle": bundle, "animal_id_map": {"import:bibi": "hippopotamus:bibi"}}],
        )
        bibi = next(item for item in atlas["animals"] if item["id"] == "hippopotamus:bibi")
        self.assertEqual(bibi["sex"], "female")
        conflict_claims = [claim for claim in atlas["claims"] if claim["subject"] == "hippopotamus:bibi"]
        self.assertEqual({claim["claim_type"] for claim in conflict_claims}, {"import_alternate_sex", "import_alternate_name"})
        self.assertEqual(len(report["conflicts"]), 2)

    def test_merge_is_deterministic_and_reports_source_tiers(self):
        imports = [
            {"bundle": common_bundle(), "animal_id_map": {"import:bibi": "hippopotamus:bibi"}},
            {"bundle": pygmy_bundle(), "animal_id_map": {}},
        ]
        first = merge_hippopotamus(canonical_atlas(), imports)
        second = merge_hippopotamus(canonical_atlas(), imports)
        self.assertEqual(first, second)
        sources = {item["id"]: item for item in first[0]["sources"]}
        self.assertEqual(sources["source:common"]["tier"], "B")
        self.assertEqual(sources["source:pygmy"]["tier"], "B")

    def test_input_objects_are_not_mutated(self):
        atlas = canonical_atlas()
        bundle = common_bundle()
        atlas_before = deepcopy(atlas)
        bundle_before = deepcopy(bundle)
        merge_hippopotamus(atlas, [{"bundle": bundle, "animal_id_map": {"import:bibi": "hippopotamus:bibi"}}])
        self.assertEqual(atlas, atlas_before)
        self.assertEqual(bundle, bundle_before)


if __name__ == "__main__":
    unittest.main()
