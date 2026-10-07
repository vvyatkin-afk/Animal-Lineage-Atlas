import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_migrator(test_case):
    module_path = ROOT / "tools" / "import" / "migrate_red_panda.py"
    test_case.assertTrue(module_path.is_file(), "red-panda importer should exist")
    spec = importlib.util.spec_from_file_location("migrate_red_panda", module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def source_tree_fixture():
    return {
        "meta": {"title": "Curated Futa family", "cutoff": "2026-07-20"},
        "sources": {
            "S01": {
                "type_ja": "公式資料",
                "title": "Example Zoo record",
                "org": "Example Zoo",
                "date": "2022-05",
                "url": "https://example.org/animals",
                "note_ja": "Official family record.",
            }
        },
        "nodes": [
            {
                "id": "mother",
                "name_jp": "母パンダ",
                "sex": "F",
                "parent": None,
                "co_parent_ja": "未確認の親",
                "confidence": "B",
                "status_ja": "死亡記録は確認できず",
                "sources": ["S01"],
                "events": [],
                "photo": "mother.jpg",
                "photo_url": "images/mother.webp",
                "image": "assets/generated/mother.jpg",
            },
            {
                "id": "cub",
                "name_jp": "仔パンダ",
                "sex": "M",
                "parent": "mother",
                "co_parent_ja": "未確認の親",
                "confidence": "A",
                "status_ja": "在籍中",
                "sources": ["S01"],
                "birth_date": "2022-05",
                "events": [
                    {
                        "date": "2022-05",
                        "type": "birth",
                        "place_jp": "Example Zoo",
                        "note_ja": "Born at Example Zoo.",
                        "source": "S01",
                    },
                    {
                        "date": "2023-01-02",
                        "type": "move",
                        "place_jp": "Second Zoo",
                        "note_ja": "Moved.",
                        "source": None,
                    },
                ],
                "photo": "cub.jpg",
                "photo_url": "photos/cub.webp?token=local-fixture",
                "image": "assets/generated/cub.jpg",
                "photo_links_confirmed": [
                    {
                        "title": "Cub profile and image page",
                        "url": "https://example.org/cub-media",
                        "source_type_ja": "公式資料",
                        "note_ja": "Named individual page.",
                        "rights_ja": "Link only; no reuse permission.",
                    }
                ],
            },
        ],
        "unnamed_outcomes": [
            {
                "id": "unnamed-2024",
                "parent": "mother",
                "co_parent": "cub",
                "date": "2024",
                "count": 2,
                "note_ja": "Two unnamed outcomes.",
                "sources": ["S01"],
            }
        ],
        "unquantified": [
            {
                "parent": "mother",
                "note_ja": "A birth was reported; count and date were not published.",
                "sources": ["S01"],
            }
        ],
    }


class RedPandaMigrationTests(unittest.TestCase):
    def setUp(self):
        self.migrator = load_migrator(self)
        self.temp_dir = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp_dir.name)
        self.input_path = self.directory / "tree.json"
        self.output_path = self.directory / "atlas.json"
        self.report_path = self.directory / "migration_report.json"
        self.input_path.write_text(json.dumps(source_tree_fixture(), ensure_ascii=False), encoding="utf-8")

    def tearDown(self):
        self.temp_dir.cleanup()

    def migrate(self, excluded_snapshot_path=None):
        return self.migrator.migrate_red_panda(
            self.input_path,
            self.output_path,
            self.report_path,
            excluded_snapshot_path=excluded_snapshot_path,
        )

    def read_atlas(self):
        return json.loads(self.output_path.read_text(encoding="utf-8"))

    def test_imports_all_named_source_nodes(self):
        report = self.migrate()
        atlas = self.read_atlas()
        self.assertEqual(report.animal_count, 2)
        self.assertEqual({item["id"] for item in atlas["animals"]}, {"red-panda:mother", "red-panda:cub"})
        self.assertEqual(len(json.loads((self.directory / "legacy_id_map.json").read_text(encoding="utf-8"))["mappings"]), 2)

    def test_local_photo_paths_are_dropped(self):
        self.migrate()
        atlas = self.read_atlas()
        encoded = json.dumps(atlas, ensure_ascii=False)
        self.assertNotIn("mother.jpg", encoded)
        self.assertNotIn("cub.jpg", encoded)
        self.assertNotIn("assets/generated", encoded)
        self.assertTrue(atlas["media"])
        self.assertTrue(all(item["embedding_status"] == "link_only" for item in atlas["media"]))
        self.assertTrue(all("direct_remote_url" not in item for item in atlas["media"]))

    def test_sources_and_uncertainty_are_retained(self):
        self.migrate()
        atlas = self.read_atlas()
        self.assertEqual(len([source for source in atlas["sources"] if source["id"].startswith("source:red-panda:S")]), 1)
        self.assertIn("Legacy data grade: A", next(animal for animal in atlas["animals"] if animal["id"] == "red-panda:cub")["review"]["notes"])
        relation = next(item for item in atlas["relationships"] if item["object"] == "red-panda:cub")
        self.assertEqual(relation["status"], "probable")
        self.assertTrue(any(claim["claim_type"] == "unresolved_co_parent_name" for claim in atlas["claims"]))
        self.assertTrue(any(event["animal_id"] is None and event.get("outcome_count") == 2 for event in atlas["events"]))
        self.assertTrue(any(event["animal_id"] is None and "outcome_count" not in event for event in atlas["events"]))

    def test_unlinked_co_parent_is_not_fabricated(self):
        self.migrate()
        atlas = self.read_atlas()
        self.assertEqual(len(atlas["animals"]), 2)
        self.assertNotIn("red-panda:未確認の親", {animal["id"] for animal in atlas["animals"]})
        claim = next(item for item in atlas["claims"] if item["claim_type"] == "unresolved_co_parent_name")
        self.assertEqual(claim["value"], "未確認の親")
        self.assertEqual(claim["status"], "unknown")

    def test_resolved_co_parent_is_social_not_ancestral(self):
        tree = source_tree_fixture()
        tree["nodes"][1]["co_parent_ja"] = "相方"
        tree["nodes"].append(
            {
                "id": "partner",
                "name_jp": "相方",
                "sex": "F",
                "parent": None,
                "co_parent_ja": "仔パンダ",
                "confidence": "B",
                "status_ja": "在籍中",
                "sources": ["S01"],
                "events": [],
            }
        )
        self.input_path.write_text(json.dumps(tree, ensure_ascii=False), encoding="utf-8")
        self.migrate()
        atlas = self.read_atlas()
        partner_link = next(item for item in atlas["relationships"] if item["type"] == "social")
        self.assertEqual({partner_link["subject"], partner_link["object"]}, {"red-panda:cub", "red-panda:partner"})
        self.assertEqual(sum(item["type"] in {"biological_mother", "biological_father"} for item in atlas["relationships"]), 1)

    def test_report_documents_unlicensed_global_exclusion(self):
        excluded_path = self.directory / "global.json"
        excluded_path.write_text(
            json.dumps(
                {
                    "meta": {"totals": {"pandas": 2, "familyEdges": 1, "litterEdges": 0}},
                    "pandas": [
                        {"id": "global:one", "nameEn": "must not be copied"},
                        {"id": "global:two", "nameEn": "also excluded"},
                    ],
                    "zoos": [{"id": "zoo:one", "nameEn": "excluded zoo"}],
                    "familyEdges": [{"parent": "global:one", "child": "global:two"}],
                    "litterEdges": [],
                }
            ),
            encoding="utf-8",
        )
        self.migrate(excluded_path)
        report = json.loads(self.report_path.read_text(encoding="utf-8"))
        excluded = report["excluded_global_snapshot"]
        self.assertEqual(excluded["record_counts"]["profiles"], 2)
        self.assertEqual(excluded["record_counts"]["family_edges"], 1)
        self.assertEqual(excluded["profile_ids"], ["global:one", "global:two"])
        self.assertEqual(excluded["declared_license"], None)
        self.assertNotIn("must not be copied", json.dumps(report))
        self.assertNotIn("familyEdges", excluded)
        self.assertNotIn("litterEdges", excluded)


if __name__ == "__main__":
    unittest.main()
