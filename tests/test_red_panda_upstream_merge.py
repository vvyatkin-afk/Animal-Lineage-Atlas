import copy
import importlib.util
import json
import sys
import unittest
from urllib.error import HTTPError
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_merger(test_case):
    module_path = ROOT / "tools" / "import" / "merge_red_panda_upstream.py"
    test_case.assertTrue(module_path.is_file(), "red-panda upstream merger should exist")
    spec = importlib.util.spec_from_file_location("merge_red_panda_upstream", module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def animal(animal_id, name, *, sex="unknown", status="unknown", external_ids=None):
    return {
        "id": animal_id,
        "taxon": "Ailurus fulgens",
        "sex": sex,
        "status": status,
        "name": {
            "canonical": name,
            "language": "en",
            "source_ids": ["source:red-panda:curated"],
            "localized": [],
        },
        "aliases": [],
        "external_ids": external_ids or [],
        "review": {
            "status": "reviewed",
            "reviewed_on": "2026-10-07",
            "notes": "Curated fixture record.",
        },
    }


def curated_atlas():
    zoo_id = "place:example-zoo"
    parent = animal(
        "red-panda:curated-parent",
        "Parent",
        sex="female",
        external_ids=[{"namespace": "wwoast-redpanda-lineage", "value": "p1"}],
    )
    matched = animal("red-panda:curated-matched", "Matched", sex="male", status="living")
    twin_a = animal("red-panda:curated-twin-a", "Twin", sex="female")
    twin_b = animal("red-panda:curated-twin-b", "Twin", sex="female")
    animals = [parent, matched, twin_a, twin_b]
    events = []
    relationships = []
    for record in (matched, twin_a, twin_b):
        events.extend(
            [
                {
                    "id": f"event:{record['id']}:birth",
                    "animal_id": record["id"],
                    "type": "birth",
                    "date": {"precision": "exact", "value": "2020-01-01"},
                    "institution_id": zoo_id,
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Source-linked birth record.",
                },
                {
                    "id": f"event:{record['id']}:current",
                    "animal_id": record["id"],
                    "type": "observation",
                    "date": {"precision": "exact", "value": "2026-01-01"},
                    "institution_id": zoo_id,
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Source-linked current-location record.",
                },
            ]
        )
        relationships.append(
            {
                "id": f"relationship:{parent['id']}:{record['id']}",
                "subject": parent["id"],
                "object": record["id"],
                "type": "biological_mother",
                "status": "confirmed",
                "source_ids": ["source:red-panda:curated"],
                "review": {
                    "status": "reviewed",
                    "reviewed_on": "2026-10-07",
                    "notes": "Curated parent link.",
                },
            }
        )
    return {
        "release": {
            "schema_version": "1.0.0",
            "data_version": "2026-10-07",
            "engine_version": "1.0.0",
            "build_date": "2026-10-07",
            "provenance": "Curated fixture.",
        },
        "coverage": {
            "taxon": "Ailurus fulgens",
            "scope": "Curated fixture.",
            "limitations": ["Fixture only."],
            "last_reviewed": "2026-10-07",
            "source_categories": ["official_source"],
            "translations": {
                "ja": {"scope": "テスト", "limitations": ["テスト"]},
                "ru": {"scope": "Тест", "limitations": ["Тест"]},
            },
        },
        "animals": animals,
        "claims": [],
        "relationships": relationships,
        "events": events,
        "institutions": [
            {
                "id": zoo_id,
                "names": [{"value": "Example Zoo", "language": "en"}],
                "country_code": None,
                "location": "Example City",
            }
        ],
        "media": [],
        "sources": [
            {
                "id": "source:red-panda:curated",
                "title": "Curated source",
                "publisher": "Example Zoo",
                "url": "https://example.org/curated",
                "publication_date": None,
                "accessed_date": "2026-10-07",
                "source_type": "official_source",
                "notes": "Curated source fixture.",
                "data_use": "Citation for claims only.",
            }
        ],
    }


class CuratedFutaCrosswalkEvidenceTests(unittest.TestCase):
    def test_real_futa_family_crosswalk_is_explicit_and_source_linked(self):
        curated = json.loads((ROOT / "atlases/red-panda/curated-atlas.json").read_text())
        atlas = json.loads((ROOT / "atlases/red-panda/atlas.json").read_text())
        report = json.loads((ROOT / "atlases/red-panda/upstream_sync_report.json").read_text())
        sources = {source["id"]: source for source in curated["sources"]}
        canonical_sources = {source["id"]: source for source in atlas["sources"]}
        animals = {animal["id"]: animal for animal in curated["animals"]}
        expected = {"34": "red-panda:futa", "49": "red-panda:nara", "50": "red-panda:fufu"}

        for upstream_id, curated_id in expected.items():
            animal_record = animals[curated_id]
            self.assertIn(
                {"namespace": "wwoast-redpanda-lineage", "value": upstream_id},
                animal_record["external_ids"],
            )
            self.assertIn("source:red-panda:S02", animal_record["name"]["source_ids"])
            mapping = next(item for item in report["animal_id_mappings"] if item["upstream_id"] == upstream_id)
            self.assertEqual(mapping["final_animal_id"], curated_id)
            self.assertEqual(mapping["match_method"], "explicit_external_id")

        parent_links = {
            (item["subject"], item["object"], item["type"]): item
            for item in curated["relationships"]
        }
        self.assertIn(("red-panda:nara", "red-panda:futa", "biological_mother"), parent_links)
        self.assertIn(("red-panda:fufu", "red-panda:futa", "biological_father"), parent_links)
        self.assertEqual(
            parent_links[("red-panda:nara", "red-panda:futa", "biological_mother")]["source_ids"],
            ["source:red-panda:S02"],
        )
        self.assertEqual(
            parent_links[("red-panda:fufu", "red-panda:futa", "biological_father")]["source_ids"],
            ["source:red-panda:S02"],
        )
        chiba_source = sources["source:red-panda:S22"]
        self.assertEqual(chiba_source["url"], "https://www.city.chiba.jp/sogoseisaku/shichokoshitsu/kohokocho/dayori23/documents/0601_1.pdf")
        self.assertEqual(chiba_source["accessed_date"], "2026-10-08")
        self.assertEqual(chiba_source["tier"], "B")
        self.assertEqual(sources["source:red-panda:S02"]["tier"], "B")
        self.assertEqual(sources["source:red-panda:S08"]["tier"], "D")
        self.assertEqual(sources["source:red-panda:S12"]["tier"], "discovery_only")
        self.assertTrue(all(source.get("tier") in {"A", "B", "C", "D", "discovery_only"} for source in curated["sources"]))
        self.assertTrue(all(source.get("tier") in {"A", "B", "C", "D", "discovery_only"} for source in atlas["sources"]))
        self.assertEqual(canonical_sources["source:red-panda:wwoast-lineage-export"]["tier"], "D")
        self.assertTrue(any(source.get("tier") == "discovery_only" for source in atlas["sources"] if source.get("source_type") == "media_source_link"))
        reviewed_crosswalks = {item["upstream_id"]: item for item in report["reviewed_external_id_crosswalks"]}
        self.assertEqual(set(reviewed_crosswalks), {"34", "49", "50", "200"})
        self.assertEqual(reviewed_crosswalks["34"]["source_ids"], ["source:red-panda:S02", "source:red-panda:S22"])
        self.assertEqual(reviewed_crosswalks["200"]["curated_animal_id"], "red-panda:kelu")
        self.assertEqual(reviewed_crosswalks["200"]["source_ids"], ["source:red-panda:S24"])
        kelu = next(row for row in curated["animals"] if row["id"] == "red-panda:kelu")
        self.assertEqual(kelu["name"]["language"], "es")
        self.assertEqual(kelu["review"]["reviewed_on"], "2026-10-08")
        self.assertIn(
            {"namespace": "wwoast-redpanda-lineage", "value": "200"},
            animals["red-panda:kelu"]["external_ids"],
        )
        kelu_birth = next(event for event in atlas["events"] if event["animal_id"] == "red-panda:kelu" and event["type"] == "birth")
        self.assertEqual(kelu_birth["date"], {"precision": "exact", "value": "2015-12-25"})
        self.assertEqual(kelu_birth["source_ids"], ["source:red-panda:S24", "source:red-panda:wwoast-lineage-export"])

    def test_kelu_identity_crosswalk_excludes_unverified_parentage(self):
        report = json.loads((ROOT / "atlases/red-panda/upstream_sync_report.json").read_text())
        mapping = next(item for item in report["animal_id_mappings"] if item["upstream_id"] == "200")
        self.assertEqual(mapping["status"], "matched")
        self.assertEqual(mapping["match_method"], "explicit_external_id")
        self.assertEqual(mapping["final_animal_id"], "red-panda:kelu")
        self.assertEqual(mapping["crosswalk_evidence"]["source_ids"], ["source:red-panda:S24"])
        institution_mapping = next(row for row in report["institution_id_mappings"] if row["upstream_id"] == "-56")
        self.assertEqual(institution_mapping["status"], "reviewed_external_id_crosswalk")
        self.assertEqual(institution_mapping["final_institution_id"], "place:311a839503c54580")
        atlas = json.loads((ROOT / "atlases/red-panda/atlas.json").read_text())
        parquemet = next(row for row in atlas["institutions"] if row["id"] == "place:311a839503c54580")
        self.assertEqual(parquemet["names"][0]["language"], "es")
        birthplace = next(row for row in report["edge_id_mappings"]["birthplace"] if row["source_edge"]["_out"] == "200")
        self.assertEqual(birthplace["status"], "mapped_to_birth_event")
        self.assertEqual(birthplace["event_id"], "event:red-panda:kelu:1")
        birth_mapping = next(row for row in report["event_mappings"] if row["upstream_id"] == "200" and row["event_type"] == "birth")
        self.assertEqual(birth_mapping["status"], "mapped_to_existing_canonical_event")
        parentage_edges = [row for row in report["edge_id_mappings"]["family"] if row["source_edge"]["_in"] == "200"]
        self.assertEqual(len(parentage_edges), 2)
        self.assertTrue(all(row["status"] == "excluded_reviewed_unconfirmed_parentage" for row in parentage_edges))
        self.assertTrue(all(row["child_animal_id"] == "red-panda:kelu" for row in parentage_edges))
        review = next(item for item in report["unresolved_curated_source_review"] if item["record_id"] == "claim:red-panda:kelu:co-parent")
        self.assertIn("source:red-panda:S24", review["source_ids"])
        self.assertIn("source:red-panda:wwoast-lineage-export", review["source_ids"])
        atlas = json.loads((ROOT / "atlases/red-panda/atlas.json").read_text())
        self.assertFalse(any(item.get("object") == "red-panda:kelu" for item in atlas["relationships"]))
        kelu_births = [event for event in atlas["events"] if event["animal_id"] == "red-panda:kelu" and event["type"] == "birth"]
        self.assertEqual(len(kelu_births), 1)
        sources = {source["id"]: source for source in json.loads((ROOT / "atlases/red-panda/curated-atlas.json").read_text())["sources"]}
        self.assertEqual(sources["source:red-panda:S12"]["publisher"], "T13 (Canal 13)")
        self.assertEqual(sources["source:red-panda:S12"]["tier"], "discovery_only")

    def test_repository_license_audit_records_completed_endpoint_and_tree_check(self):
        snapshot = json.loads((ROOT / "atlases/red-panda/upstream_snapshot.json").read_text())
        self.assertEqual(snapshot["repository_license_endpoint_status"], 404)
        self.assertEqual(snapshot["repository_license_endpoint_url"], "https://api.github.com/repos/wwoast/redpanda-lineage/license")
        self.assertFalse(snapshot["repository_tree_truncated"])
        self.assertEqual(snapshot["repository_license_files"], [])
        self.assertIn("returned HTTP 404", snapshot["license_check"])
        self.assertIn("no LICENSE, COPYING, or COPYRIGHT", snapshot["license_check"])
        self.assertIn("no explicit license was found", snapshot["license_check"].lower())

    def test_real_report_maps_every_source_vertex_or_excludes_it_explicitly(self):
        report = json.loads((ROOT / "atlases/red-panda/upstream_sync_report.json").read_text())
        mappings = report["source_vertex_id_mappings"]
        self.assertEqual(len(mappings), report["source_counts"]["vertices"])
        self.assertEqual(len({item["source_vertex_id"] for item in mappings}), len(mappings))
        self.assertEqual(report["counts"]["source_vertex_id_mappings"], len(mappings))
        self.assertTrue(all(item.get("status") for item in mappings))
        self.assertEqual(report["source_counts"]["vertices"], 2256)

    def test_rights_page_is_not_cited_as_animal_evidence_and_kelu_parent_is_unconfirmed(self):
        curated = json.loads((ROOT / "atlases/red-panda/curated-atlas.json").read_text())
        rights_source_id = "source:red-panda:S14"
        source = next(item for item in curated["sources"] if item["id"] == rights_source_id)
        self.assertIn("media-rights", source["data_use"].lower())
        self.assertNotIn("factual claims", source["data_use"].lower())
        self.assertTrue(all(rights_source_id not in animal["name"].get("source_ids", []) for animal in curated["animals"]))
        for section in ("claims", "relationships", "events"):
            self.assertTrue(all(rights_source_id not in item.get("source_ids", []) for item in curated[section]))
            self.assertTrue(all(item.get("source_ids") for item in curated[section]))
        for animal in curated["animals"]:
            self.assertTrue(animal["name"].get("source_ids"))
        rights_media = [item for item in curated["media"] if rights_source_id in item.get("source_ids", [])]
        self.assertTrue(rights_media)
        self.assertTrue(all(item["source_page_url"].startswith("https://redpanda-zukan.jp/") for item in rights_media))
        self.assertFalse(any(item.get("object") == "red-panda:kelu" for item in curated["relationships"]))
        kelu_birth = next(item for item in curated["events"] if item["animal_id"] == "red-panda:kelu" and item["type"] == "birth")
        self.assertEqual(kelu_birth["source_ids"], ["source:red-panda:S24"])
        self.assertNotIn("parents", kelu_birth["notes"].lower())

    def test_discovery_only_legacy_events_are_removed_or_reduced_and_reported(self):
        curated = json.loads((ROOT / "atlases/red-panda/curated-atlas.json").read_text())
        atlas = json.loads((ROOT / "atlases/red-panda/atlas.json").read_text())
        report = json.loads((ROOT / "atlases/red-panda/upstream_sync_report.json").read_text())
        event_ids = {item["id"] for item in curated["events"]}
        unresolved = {
            item["record_id"]: item
            for item in report["unresolved_curated_source_review"]
        }
        removed_ids = {
            "event:red-panda:chiichi:3",
            "event:red-panda:kouta:2",
            "event:red-panda:kouta:3",
            "event:red-panda:yuka_tobe:1",
            "event:red-panda:yuka_tobe:2",
            "event:red-panda:yuka_tobe:3",
        }
        self.assertTrue(removed_ids.isdisjoint(event_ids))
        self.assertTrue(removed_ids.issubset(unresolved))
        self.assertIn("claim:red-panda:kelu:co-parent", unresolved)
        self.assertIn("event:red-panda:unnamed:u2011a#unverified-sire-and-cause-detail", unresolved)
        for animal_id in ("chiichi", "kouta", "yuka_tobe"):
            animal_record = next(item for item in curated["animals"] if item["id"] == f"red-panda:{animal_id}")
            self.assertEqual(animal_record["status"], "unknown")

        litter = next(item for item in curated["events"] if item["id"] == "event:red-panda:unnamed:u2011a")
        self.assertEqual(litter["animal_id"], "red-panda:chiichi")
        self.assertEqual(litter["date"], {"precision": "approximate", "value": "2011-05"})
        self.assertEqual(litter["outcome_count"], 2)
        self.assertNotIn("related_animal_ids", litter)
        self.assertEqual(litter["source_ids"], ["source:red-panda:S23"])
        self.assertNotIn("食べ", litter["notes"])
        self.assertNotIn("風太", litter["notes"])
        kelu = next(item for item in curated["animals"] if item["id"] == "red-panda:kelu")
        self.assertEqual(kelu["name"]["canonical"], "Kelú")
        self.assertEqual(kelu["name"]["source_ids"], ["source:red-panda:S24"])
        kelu_birth = next(item for item in curated["events"] if item["id"] == "event:red-panda:kelu:1")
        kelu_death = next(item for item in curated["events"] if item["id"] == "event:red-panda:kelu:2")
        self.assertEqual(kelu_birth["source_ids"], ["source:red-panda:S24"])
        self.assertEqual(kelu_death["date"], {"precision": "approximate", "value": "2023-08"})
        self.assertEqual(kelu_death["source_ids"], ["source:red-panda:S24"])
        self.assertEqual(kelu["status"], "deceased")
        sources_by_id = {source["id"]: source for source in curated["sources"]}
        self.assertEqual(sources_by_id["source:red-panda:S23"]["tier"], "B")
        self.assertEqual(sources_by_id["source:red-panda:S23"]["url"], "https://www.city.chiba.jp/zoo/guide/documents/vol81.pdf")
        self.assertEqual(sources_by_id["source:red-panda:S24"]["tier"], "B")
        self.assertEqual(sources_by_id["source:red-panda:S24"]["url"], "https://www.instagram.com/p/Cv7skWKuggY/")
        self.assertEqual(sources_by_id["source:red-panda:S25"]["tier"], "B")
        self.assertEqual(sources_by_id["source:red-panda:S25"]["url"], "https://www.gob.cl/noticias/minvu-presenta-al-primer-panda-rojo-nacido-en-chile-y-anuncia-concurso-para-buscarle-nombre/")

        # Every source-linked fact in the canonical animal, claim, relationship,
        # and event collections must have at least one A/B/C/D source.
        sources = {source["id"]: source for source in atlas["sources"]}
        factual_records = []
        factual_records.extend((animal["id"] + ":name", animal["name"]) for animal in atlas["animals"])
        factual_records.extend((item["id"], item) for kind in ("claims", "relationships", "events") for item in atlas[kind])
        for record_id, record in factual_records:
            source_ids = record.get("source_ids", [])
            self.assertTrue(source_ids, record_id)
            self.assertTrue(any(sources[source_id]["tier"] in {"A", "B", "C", "D"} for source_id in source_ids), record_id)
        resolutions = report["canonical_source_tier_audit"]
        self.assertTrue(resolutions)
        self.assertTrue(all(item["accepted_source_ids"] for item in resolutions))
        tier_rows = {item["record_id"]: item for item in resolutions}
        self.assertEqual(tier_rows["red-panda:kelu:name"]["accepted_source_ids"], ["source:red-panda:S24", "source:red-panda:wwoast-lineage-export"])
        self.assertEqual(tier_rows["event:red-panda:kelu:1"]["accepted_source_ids"], ["source:red-panda:S24", "source:red-panda:wwoast-lineage-export"])
        self.assertEqual(tier_rows["event:red-panda:unnamed:u2011a"]["accepted_source_ids"], ["source:red-panda:S23"])


class UpstreamSyncSnapshotTests(unittest.TestCase):
    def test_sync_document_records_snapshot_ids_and_media_policy(self):
        snapshot = json.loads((ROOT / "atlases/red-panda/upstream_snapshot.json").read_text())
        report = json.loads((ROOT / "atlases/red-panda/upstream_sync_report.json").read_text())
        doc = (ROOT / "docs/RED_PANDA_UPSTREAM_SYNC.md").read_text()

        for expected in (
            snapshot["request_url"],
            snapshot["export_url"],
            snapshot["retrieved_at_utc"],
            snapshot["sha256"],
            snapshot["repository_commit"],
            snapshot["embedded_commit"],
            "No explicit license was found during this retrieval",
            "single canonical `animals` array",
            "5,839 imported upstream media records",
            "78 inherited curated media records",
            f"{report['counts']['near_match_review_candidates_not_merged']} other near-match candidates",
            f"{report['counts']['near_match_incomplete_required_fields_profiles_not_merged']} have at least one unavailable or unresolved required field",
            "No image bytes",
            "local `path` values",
        ):
            with self.subTest(expected=expected):
                self.assertIn(expected, doc)

    def test_current_snapshot_checks_license_endpoint_and_complete_tree(self):
        module_path = ROOT / "tools" / "import" / "sync_red_panda_upstream.py"
        sys.path.insert(0, str(module_path.parent))
        spec = importlib.util.spec_from_file_location("sync_red_panda_upstream_for_test", module_path)
        sync = importlib.util.module_from_spec(spec)
        sys.modules[spec.name] = sync
        spec.loader.exec_module(sync)

        commit_sha = "c" * 40
        bodies = {
            sync.README_EXPORT_URL: (b'{"_commit":"embedded"}', "https://redpandafinder.com/export/redpanda.json", {}),
            sync.REPOSITORY_API_URL: (b'{"default_branch":"main","license":null}', sync.REPOSITORY_API_URL, {}),
            f"{sync.REPOSITORY_API_URL}/branches/main": (
                json.dumps({"commit": {"sha": commit_sha, "commit": {"committer": {"date": "2026-10-05T21:45:05Z"}}}}).encode(),
                f"{sync.REPOSITORY_API_URL}/branches/main",
                {},
            ),
            f"{sync.REPOSITORY_API_URL}/git/trees/{commit_sha}?recursive=1": (
                b'{"tree":[],"truncated":false}',
                f"{sync.REPOSITORY_API_URL}/git/trees/{commit_sha}?recursive=1",
                {},
            ),
        }

        def fetch(url):
            if url.endswith("/license"):
                raise HTTPError(url, 404, "Not Found", {}, None)
            return bodies[url]

        with patch.object(sync, "_fetch", side_effect=fetch):
            _, snapshot = sync._current_snapshot()

        self.assertEqual(snapshot["repository_license_endpoint_status"], 404)
        self.assertEqual(snapshot["repository_license_endpoint_url"], f"{sync.REPOSITORY_API_URL}/license")
        self.assertEqual(snapshot["repository_commit"], commit_sha)
        self.assertFalse(snapshot["repository_tree_truncated"])
        self.assertIn("returned HTTP 404", snapshot["license_check"])
        self.assertIn("No explicit license was found during this retrieval", snapshot["license_check"])


def upstream_export():
    def panda(record_id, name, *, birthday="2020/1/1", gender="Female", death=None, photos=None):
        return {
            "_id": record_id,
            "type": "panda",
            "name": {"en": name},
            "othernames": {"en": ["none"]},
            "nicknames": {"en": ["none"]},
            "birthday": birthday,
            "death": death,
            "gender": gender,
            "children": ["none"],
            "locations": [{"_id": "z1", "date": birthday}],
            "photos": photos or [],
            "path": f"pandas/example/{record_id}_{name.lower()}.jpg",
        }

    vertices = [
        panda("p1", "Parent", birthday="1990/1/1", photos=[]),
        panda(
            "u1",
            "Matched",
            gender="Male",
            death="2025/2/3",
            photos=[
                {"source": "https://example.org/photo/1", "url": "cwdc://local/one.jpg"},
                {"source": "https://example.org/photo/2", "url": "https://cdn.example/image.jpg"},
                {"source": "ig://unresolved", "url": "cwdc://local/two.jpg"},
            ],
        ),
        panda("u3", "Twin"),
        panda("u4", "Unique", gender="unknown"),
        {
            "_id": "-z1",
            "type": "zoo",
            "name": {"en": "Example Zoo"},
            "location": {"en": "Example City"},
            "website": "https://example.org/zoo",
            "map": "https://maps.example.org/zoo",
            "photos": [{"source": "https://example.org/zoo/photo", "url": "cwdc://local/zoo.jpg"}],
            "path": "zoos/example/zoo.jpg",
        },
        {
            "_id": "media.example",
            "type": "media",
            "panda.tags": ["u1"],
            "photos": [
                {
                    "source": "https://example.org/shared-photo",
                    "url": "https://cdn.example/shared.jpg",
                    "locations": {"u1": [1, 2]},
                }
            ],
            "path": "media/example/shared.jpg",
        },
        {"_id": "none", "type": "none"},
    ]
    edges = [
        {"_in": "u1", "_label": "family", "_out": "p1"},
        {"_in": "u3", "_label": "family", "_out": "p1"},
        {"_in": "none", "_label": "family", "_out": "p1"},
        {"_in": "u4", "_label": "family", "_out": "none"},
        {"_in": "u4", "_label": "family", "_out": "u4"},
        {"_in": "u1", "_label": "litter", "_out": "u3"},
        {"_in": "none", "_label": "litter", "_out": "u1"},
        {"_in": "-z1", "_label": "zoo", "_out": "u1"},
        {"_in": "-z1", "_label": "birthplace", "_out": "u1"},
        {"_in": "-z1", "_label": "zoo", "_out": "u3"},
        {"_in": "-z1", "_label": "birthplace", "_out": "u3"},
        {"_in": "-z1", "_label": "zoo", "_out": "u4"},
    ]
    return {
        "_commit": "b" * 40,
        "_totals": {"pandas": 4, "zoos": 1, "media": 1, "photos": 5},
        "vertices": vertices,
        "edges": edges,
    }


SNAPSHOT = {
    "export_url": "https://redpandafinder.com/export/redpanda.json",
    "readme_export_url": "https://wwoast.github.io/redpanda-lineage/export/redpanda.json",
    "retrieved_at_utc": "2026-10-08T02:07:38Z",
    "sha256": "a" * 64,
    "bytes": 1234,
    "repository_url": "https://github.com/wwoast/redpanda-lineage",
    "repository_commit": "c" * 40,
    "repository_commit_date": "2026-10-07T00:00:00Z",
    "repository_license": None,
}


class RedPandaUpstreamMergeTests(unittest.TestCase):
    def setUp(self):
        self.merger = load_merger(self)
        self.upstream = upstream_export()
        self.curated = curated_atlas()

    def merge(self):
        return self.merger.merge_red_panda(self.upstream, self.curated, SNAPSHOT)

    def test_explicit_and_exact_composite_matches_share_one_canonical_animal(self):
        atlas, report = self.merge()
        mapping = {item["upstream_id"]: item for item in report["animal_id_mappings"]}
        self.assertEqual(mapping["p1"]["final_animal_id"], "red-panda:curated-parent")
        self.assertEqual(mapping["p1"]["match_method"], "explicit_external_id")
        self.assertEqual(mapping["u1"]["final_animal_id"], "red-panda:curated-matched")
        self.assertEqual(mapping["u1"]["match_method"], "secondary_exact_composite")
        self.assertEqual(report["counts"]["merged_overlaps"], 2)
        self.assertEqual(len(atlas["animals"]), 6)
        self.assertEqual(len({animal_record["id"] for animal_record in atlas["animals"]}), 6)

    def test_every_source_vertex_has_a_mapping_or_explicit_exclusion(self):
        _, report = self.merge()
        vertices = {item["source_vertex_id"]: item for item in report["source_vertex_id_mappings"]}
        self.assertEqual(set(vertices), {str(item["_id"]) for item in self.upstream["vertices"]})
        self.assertEqual(vertices["u1"]["final_animal_id"], "red-panda:curated-matched")
        self.assertTrue(vertices["-z1"]["final_institution_id"].startswith("place:"))
        self.assertEqual(vertices["none"]["status"], "excluded_unknown_marker")
        self.assertEqual(vertices["none"].get("final_animal_id"), None)
        self.assertEqual(vertices["media.example"]["status"], "mapped_media_metadata")
        self.assertEqual(vertices["media.example"]["target_animal_ids"], ["red-panda:curated-matched"])
        self.assertTrue(vertices["media.example"]["target_media_ids"])

    def test_every_source_edge_has_a_mapping_or_explicit_exclusion(self):
        upstream = copy.deepcopy(self.upstream)
        next(item for item in upstream["vertices"] if item.get("_id") == "u4")["birthday"] = "none"
        upstream["vertices"].append({"_id": "wild1", "type": "wild"})
        upstream["edges"].append({"_in": "-z1", "_label": "birthplace", "_out": "u4"})
        upstream["edges"].append({"_in": "wild1", "_label": "birthplace", "_out": "p1"})
        atlas, report = self.merger.merge_red_panda(upstream, self.curated, SNAPSHOT)

        for label in ("family", "litter", "zoo", "birthplace"):
            rows = report["edge_id_mappings"][label]
            expected_edges = [edge for edge in upstream["edges"] if edge["_label"] == label]
            self.assertEqual([row["source_edge"] for row in rows], expected_edges)
            self.assertEqual(
                [row["source_edge_id"] for row in rows],
                [f"{label}:{index:04d}" for index in range(1, len(expected_edges) + 1)],
            )
            self.assertTrue(all(row.get("status") for row in rows))

        zoo_rows = report["edge_id_mappings"]["zoo"]
        self.assertEqual(len(zoo_rows), 3)
        self.assertTrue(all(row["status"] == "mapped_current_holding_not_event" for row in zoo_rows))
        self.assertTrue(all(row["used_for_identity_resolution"] for row in zoo_rows))
        self.assertTrue(all(row["final_animal_id"] and row["final_institution_id"] for row in zoo_rows))

        birthplace_rows = report["edge_id_mappings"]["birthplace"]
        self.assertEqual(
            [row["status"] for row in birthplace_rows],
            ["mapped_to_birth_event", "mapped_to_birth_event", "excluded_no_birth_date", "mapped_to_birth_event_without_institution"],
        )
        birth_events = {event["id"] for event in atlas["events"] if event["type"] == "birth"}
        self.assertTrue(all(row["event_id"] in birth_events for row in birthplace_rows[:2]))
        self.assertEqual(birthplace_rows[0]["event_id"], "event:red-panda:curated-matched:birth")
        self.assertEqual(
            next(row for row in report["event_mappings"] if row["upstream_id"] == "u1" and row["event_type"] == "birth")["status"],
            "mapped_to_existing_canonical_event",
        )
        matched_births = [event for event in atlas["events"] if event["animal_id"] == "red-panda:curated-matched" and event["type"] == "birth"]
        self.assertEqual(len(matched_births), 1)
        self.assertIn("source:red-panda:wwoast-lineage-export", matched_births[0]["source_ids"])
        self.assertEqual(birthplace_rows[2]["final_animal_id"], "red-panda:upstream-u4")
        self.assertEqual(birthplace_rows[3]["source_population_marker_id"], "wild1")
        self.assertIn(birthplace_rows[3]["event_id"], birth_events)
        self.assertEqual(report["source_counts"]["edges"], len(upstream["edges"]))
        self.assertEqual(report["edge_accounting"]["source_edges"], len(upstream["edges"]))

    def test_production_report_accounts_for_each_edge_label(self):
        report = json.loads((ROOT / "atlases/red-panda/upstream_sync_report.json").read_text())
        for label in ("family", "litter", "zoo", "birthplace"):
            rows = report["edge_id_mappings"][label]
            counts = report["edge_accounting"]["by_label"][label]
            self.assertEqual(len(rows), counts["source"])
            self.assertEqual(counts["source"], counts["mapped"] + counts["excluded"])
            self.assertTrue(all(row.get("status") for row in rows))

    def test_ambiguous_composite_candidates_are_not_merged(self):
        atlas, report = self.merge()
        mapping = next(item for item in report["animal_id_mappings"] if item["upstream_id"] == "u3")
        self.assertEqual(mapping["match_method"], "unique_upstream")
        self.assertEqual(mapping["status"], "ambiguous_not_merged")
        self.assertEqual(
            mapping["ambiguous_candidates"],
            ["red-panda:curated-twin-a", "red-panda:curated-twin-b"],
        )
        self.assertIn(mapping["final_animal_id"], {record["id"] for record in atlas["animals"]})

    def test_family_edges_are_inverted_and_none_markers_never_become_animals(self):
        atlas, report = self.merge()
        relation = next(
            item
            for item in atlas["relationships"]
            if item["subject"] == "red-panda:curated-parent"
            and item["object"] == "red-panda:curated-matched"
        )
        self.assertEqual(relation["type"], "biological_mother")
        self.assertEqual(len(report["edge_id_mappings"]["family"]), 5)
        unknown_child = next(
            item
            for item in report["edge_id_mappings"]["family"]
            if item["source_edge"]["_in"] == "none"
        )
        unknown_parent = next(
            item
            for item in report["edge_id_mappings"]["family"]
            if item["source_edge"]["_out"] == "none"
        )
        self.assertEqual(unknown_child["status"], "excluded_unknown_offspring_marker")
        self.assertEqual(unknown_parent["status"], "excluded_unknown_parent_marker")
        self.assertEqual(
            report["edge_id_mappings"]["family"][-1]["status"],
            "excluded_self_parent_edge",
        )
        ids = {record["id"] for record in atlas["animals"]}
        self.assertNotIn("red-panda:none", ids)
        self.assertNotIn("red-panda:unknown", ids)
        self.assertFalse(any(item["subject"] == item["object"] for item in atlas["relationships"]))

    def test_litter_edges_are_claims_and_unknown_members_are_excluded(self):
        atlas, report = self.merge()
        claims = [item for item in atlas["claims"] if item["claim_type"] == "upstream_litter_association"]
        self.assertEqual(len(claims), 1)
        self.assertEqual(claims[0]["subject"], "red-panda:curated-matched")
        self.assertEqual(claims[0]["value"]["related_animal_id"], "red-panda:upstream-u3")
        self.assertEqual(len(report["edge_id_mappings"]["litter"]), 2)
        self.assertEqual(
            report["edge_id_mappings"]["litter"][1]["status"],
            "excluded_unknown_litter_member_marker",
        )
        self.assertFalse(any(item["type"] == "social" for item in atlas["relationships"]))

    def test_curated_status_remains_preferred_and_upstream_conflict_is_retained(self):
        atlas, report = self.merge()
        matched = next(item for item in atlas["animals"] if item["id"] == "red-panda:curated-matched")
        self.assertEqual(matched["status"], "living")
        self.assertTrue(
            any(item["claim_type"] == "upstream_alternate_status" and item["value"] == "deceased" for item in atlas["claims"])
        )
        self.assertTrue(any(item["field"] == "status" for item in report["provenance_conflicts"]))
        self.assertTrue(any(item["animal_id"] == "red-panda:curated-matched" and item["type"] == "death" for item in atlas["events"]))

    def test_link_only_media_retains_http_metadata_without_local_paths(self):
        atlas, report = self.merge()
        encoded = json.dumps(atlas, ensure_ascii=False)
        self.assertNotIn("cwdc://", encoded)
        self.assertNotIn("local/one.jpg", encoded)
        self.assertNotIn('"path"', encoded)
        self.assertNotIn('"photos"', encoded)
        upstream_media = [item for item in atlas["media"] if item["media_id"].startswith("media:red-panda:upstream:")]
        self.assertEqual(len(upstream_media), 3)
        self.assertTrue(all(item["embedding_status"] == "link_only" for item in upstream_media))
        self.assertTrue(all(item["rights_status"] == "unknown" for item in upstream_media))
        self.assertTrue(all(item.get("offline_archive_eligible") is False for item in upstream_media))
        self.assertTrue(all(item["direct_remote_url"].startswith("https://") for item in upstream_media if item.get("direct_remote_url")))
        self.assertEqual(report["counts"]["retained_media_source_page_urls"], 3)
        self.assertEqual(report["counts"]["retained_direct_remote_urls"], 2)
        self.assertGreater(report["counts"]["dropped_photo_refs"], 0)

    def test_merge_outputs_are_deterministic_for_the_same_snapshot(self):
        first = self.merge()
        second = self.merge()
        self.assertEqual(first, second)
        self.assertEqual(
            [record["id"] for record in first[0]["animals"]],
            sorted(record["id"] for record in first[0]["animals"]),
        )

    def test_coverage_describes_both_layers_and_does_not_claim_complete_studbook(self):
        atlas, _ = self.merge()
        coverage = atlas["coverage"]
        scope = coverage["scope"]
        self.assertIn("4 named profiles", scope)
        self.assertIn("4 curated Futa-family records", scope)
        self.assertIn("2 reviewed identity overlaps", scope)
        self.assertIn("6 canonical animals", scope)
        self.assertIn("not a complete or official studbook", scope)
        self.assertTrue(any("0 near-match profiles remain unmerged" in item for item in coverage["limitations"]))
        ja_scope = coverage["translations"]["ja"]["scope"]
        self.assertIn("プロフィール4件", ja_scope)
        self.assertIn("記録4件", ja_scope)
        self.assertIn("重複2件", ja_scope)
        self.assertIn("記録6件", ja_scope)
        ru_scope = coverage["translations"]["ru"]["scope"]
        self.assertIn("4 именных профилей", ru_scope)
        self.assertIn("4 кураторскими записями", ru_scope)
        self.assertIn("2 подтверждёнными совпадениями", ru_scope)
        self.assertIn("6 канонических записей", ru_scope)
        for language in ("ja", "ru"):
            self.assertTrue(coverage["translations"][language]["limitations"])
            self.assertEqual(len(coverage["translations"][language]["limitations"]), len(coverage["limitations"]))

    def test_malformed_photo_url_is_counted_and_dropped_without_aborting_merge(self):
        unique = next(item for item in self.upstream["vertices"] if item.get("_id") == "u4")
        unique["photos"].append({"source": "https://[bad-host/photo", "url": "cwdc://local/opaque.jpg"})
        atlas, report = self.merge()
        self.assertEqual(len(atlas["animals"]), 6)
        self.assertGreaterEqual(report["counts"]["dropped_photo_refs"], 2)

    def test_exact_composite_match_allows_both_sides_to_have_no_known_parents(self):
        record = animal("red-panda:curated-no-parents", "Unique", sex="unknown", status="unknown")
        self.curated["animals"].append(record)
        self.curated["events"].extend(
            [
                {
                    "id": "event:red-panda:curated-no-parents:birth",
                    "animal_id": record["id"],
                    "type": "birth",
                    "date": {"precision": "exact", "value": "2020-01-01"},
                    "institution_id": "place:example-zoo",
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Exact composite fixture.",
                },
                {
                    "id": "event:red-panda:curated-no-parents:current",
                    "animal_id": record["id"],
                    "type": "observation",
                    "date": {"precision": "exact", "value": "2026-01-01"},
                    "institution_id": "place:example-zoo",
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Exact composite fixture.",
                },
            ]
        )
        atlas, report = self.merge()
        mapping = next(item for item in report["animal_id_mappings"] if item["upstream_id"] == "u4")
        self.assertEqual(mapping["match_method"], "secondary_exact_composite")
        self.assertEqual(mapping["final_animal_id"], record["id"])

    def test_parent_mismatch_is_reported_as_a_near_match_and_never_merged(self):
        parent = self.curated["animals"][0]
        record = animal("red-panda:curated-parent-mismatch", "Unique", sex="unknown", status="unknown")
        self.curated["animals"].append(record)
        self.curated["events"].extend(
            [
                {
                    "id": "event:red-panda:curated-parent-mismatch:birth",
                    "animal_id": record["id"],
                    "type": "birth",
                    "date": {"precision": "exact", "value": "2020-01-01"},
                    "institution_id": "place:example-zoo",
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Near-match fixture.",
                },
                {
                    "id": "event:red-panda:curated-parent-mismatch:current",
                    "animal_id": record["id"],
                    "type": "observation",
                    "date": {"precision": "exact", "value": "2026-01-01"},
                    "institution_id": "place:example-zoo",
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Near-match fixture.",
                },
            ]
        )
        self.curated["relationships"].append(
            {
                "id": "relationship:red-panda:curated-parent-mismatch",
                "subject": parent["id"],
                "object": record["id"],
                "type": "biological_mother",
                "status": "confirmed",
                "source_ids": ["source:red-panda:curated"],
                "review": parent["review"],
            }
        )
        atlas, report = self.merge()
        mapping = next(item for item in report["animal_id_mappings"] if item["upstream_id"] == "u4")
        self.assertEqual(mapping["match_method"], "unique_upstream")
        self.assertNotEqual(mapping["final_animal_id"], record["id"])
        self.assertEqual(mapping["near_match_candidates"][0]["animal_id"], record["id"])
        self.assertIn("known_parent_set", mapping["near_match_candidates"][0]["mismatched_fields"])

    def test_near_match_reason_names_every_mismatched_required_field(self):
        parent = self.curated["animals"][0]
        record = animal("red-panda:curated-zoo-and-parent-mismatch", "Unique", sex="unknown", status="unknown")
        self.curated["animals"].append(record)
        self.curated["institutions"].append(
            {
                "id": "place:other-zoo",
                "names": [{"value": "Other Zoo", "language": "en"}],
                "country_code": None,
                "location": "Other City",
            }
        )
        self.curated["events"].extend(
            [
                {
                    "id": "event:red-panda:curated-zoo-and-parent-mismatch:birth",
                    "animal_id": record["id"],
                    "type": "birth",
                    "date": {"precision": "exact", "value": "2020-01-01"},
                    "institution_id": "place:other-zoo",
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Near-match fixture.",
                },
                {
                    "id": "event:red-panda:curated-zoo-and-parent-mismatch:current",
                    "animal_id": record["id"],
                    "type": "observation",
                    "date": {"precision": "exact", "value": "2026-01-01"},
                    "institution_id": "place:other-zoo",
                    "source_ids": ["source:red-panda:curated"],
                    "notes": "Near-match fixture.",
                },
            ]
        )
        self.curated["relationships"].append(
            {
                "id": "relationship:red-panda:curated-zoo-and-parent-mismatch",
                "subject": parent["id"],
                "object": record["id"],
                "type": "biological_mother",
                "status": "confirmed",
                "source_ids": ["source:red-panda:curated"],
                "review": parent["review"],
            }
        )

        _, report = self.merge()
        mapping = next(item for item in report["animal_id_mappings"] if item["upstream_id"] == "u4")
        candidate = next(item for item in mapping["near_match_candidates"] if item["animal_id"] == record["id"])
        self.assertIn("current_zoo_mismatch", candidate["mismatched_fields"])
        self.assertIn("known_parent_set", candidate["mismatched_fields"])
        self.assertIn("current-zoo names differ", candidate["reason"])
        self.assertIn("known-parent sets do not match exactly", candidate["reason"])

    def test_missing_curated_current_zoo_is_reported_without_automatic_merge(self):
        record = animal("red-panda:curated-no-current-zoo", "Unique", sex="unknown", status="unknown")
        self.curated["animals"].append(record)
        self.curated["events"].append(
            {
                "id": "event:red-panda:curated-no-current-zoo:birth",
                "animal_id": record["id"],
                "type": "birth",
                "date": {"precision": "exact", "value": "2020-01-01"},
                "institution_id": "place:example-zoo",
                "source_ids": ["source:red-panda:curated"],
                "notes": "The profile has no current location.",
            }
        )
        atlas, report = self.merge()
        mapping = next(item for item in report["animal_id_mappings"] if item["upstream_id"] == "u4")
        self.assertEqual(mapping["status"], "near_match_incomplete_required_fields")
        self.assertNotEqual(mapping["final_animal_id"], record["id"])
        candidate = next(item for item in mapping["near_match_candidates"] if item["animal_id"] == record["id"])
        self.assertIn("current_zoo_missing_curated", candidate["mismatched_fields"])
        self.assertIn("current zoo is absent from the curated profile", candidate["reason"])


if __name__ == "__main__":
    unittest.main()
