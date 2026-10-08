"""Source-backed checks for the polar-bear and hippopotamus v1 datasets."""

from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_atlas(species: str) -> dict:
    path = ROOT / "atlases" / species / "atlas.json"
    return json.loads(path.read_text(encoding="utf-8"))


def sources_by_id(atlas: dict) -> dict[str, dict]:
    return {source["id"]: source for source in atlas["sources"]}


def relationships_by_pair(atlas: dict) -> dict[tuple[str, str, str], dict]:
    return {
        (edge["subject"], edge["object"], edge["type"]): edge
        for edge in atlas["relationships"]
    }


class SpeciesDataTests(unittest.TestCase):
    def test_core_coverage_is_available_in_all_interface_locales(self):
        for species in ("red-panda", "polar-bear", "hippopotamus"):
            with self.subTest(species=species):
                coverage = load_atlas(species)["coverage"]
                self.assertIn("translations", coverage)
                self.assertEqual(set(coverage["translations"]), {"ja", "ru"})
                for locale in ("ja", "ru"):
                    translated = coverage["translations"][locale]
                    self.assertTrue(translated["scope"].strip())
                    self.assertEqual(len(translated["limitations"]), len(coverage["limitations"]))
                    self.assertTrue(all(item.strip() for item in translated["limitations"]))

    def test_polar_bear_relationships_have_primary_evidence(self):
        atlas = load_atlas("polar-bear")
        sources = sources_by_id(atlas)
        self.assertTrue(atlas["relationships"])
        for edge in atlas["relationships"]:
            self.assertTrue(edge["source_ids"], edge["id"])
            self.assertTrue(
                all(source_id in sources for source_id in edge["source_ids"]),
                f"{edge['id']} cites a missing source",
            )
            cited = [sources[source_id] for source_id in edge["source_ids"]]
            self.assertTrue(cited, edge["id"])
            self.assertTrue(
                any(
                    (
                        source["source_type"].startswith("official_zoo")
                        or source["source_type"] == "open_research_dataset"
                    )
                    and source["url"].startswith("https://")
                    for source in cited
                ),
                f"{edge['id']} lacks direct official zoo or open-dataset evidence",
            )

        pairs = relationships_by_pair(atlas)
        expected = {
            ("polar-bear:franz", "polar-bear:jasper", "biological_father"),
            ("polar-bear:vaida", "polar-bear:jasper", "biological_mother"),
            ("polar-bear:simona", "polar-bear:tonja", "biological_mother"),
            ("polar-bear:vrangel", "polar-bear:wolodja", "biological_father"),
            ("polar-bear:tonja", "polar-bear:hertha", "biological_mother"),
            ("polar-bear:wolodja", "polar-bear:hertha", "biological_father"),
            ("polar-bear:umca", "polar-bear:tom", "biological_father"),
        }
        self.assertTrue(expected.issubset(pairs.keys()))

    def test_polar_wild_research_import_stays_separate_and_has_no_placeholder_parents(self):
        atlas = load_atlas("polar-bear")
        report_path = ROOT / "atlases" / "polar-bear" / "import_report.json"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        wild = report["western_hudson_bay"]

        self.assertEqual(wild["population"], "wild_research")
        self.assertEqual(wild["import"]["status"], "not_imported_download_denied")
        self.assertEqual(wild["import"]["animal_count"], 0)
        self.assertEqual(wild["import"]["relationship_count"], 0)
        self.assertEqual(wild["import"]["research_ids_imported"], [])
        self.assertTrue(wild["import"]["unknown_parents_remain_unmaterialized"])
        self.assertEqual(
            report["populations"]["wild_research"]["imported_animal_count"], 0
        )
        alternate = report["alternative_hudson_bay_dataset"]
        self.assertEqual(alternate["doi"], "10.5061/dryad.1719f")
        self.assertEqual(alternate["reported_individual_count"], 414)
        self.assertEqual(alternate["parent_columns"], [3, 4])
        self.assertEqual(alternate["import_status"], "discovery_only_download_denied")
        self.assertEqual(alternate["imported_individual_count"], 0)
        self.assertEqual(alternate["imported_relationship_count"], 0)
        self.assertEqual(alternate["research_ids_imported"], [])
        self.assertEqual(
            report["populations"]["zoo_captive"]["atlas_animal_count"],
            len(atlas["animals"]),
        )
        self.assertIn("zoo/captive", atlas["coverage"]["scope"].lower())
        self.assertFalse(
            any(
                external_id["namespace"].startswith("dryad:")
                for animal in atlas["animals"]
                for external_id in animal["external_ids"]
            ),
            "Wild Dryad research IDs must not be mixed into the zoo corpus.",
        )

    def test_new_polar_zoo_identities_keep_namesakes_separate_and_unknown_parents_absent(self):
        atlas = load_atlas("polar-bear")
        animal_ids = {animal["id"] for animal in atlas["animals"]}
        pairs = relationships_by_pair(atlas)

        self.assertTrue(
            {
                "polar-bear:nora",
                "polar-bear:nora-columbus",
                "polar-bear:nora-prague-1942",
            }.issubset(animal_ids)
        )
        self.assertIn("polar-bear:aurora-toronto", animal_ids)
        self.assertIn("polar-bear:aurora-columbus", animal_ids)
        self.assertIn(
            (
                "polar-bear:vera-nuremberg",
                "polar-bear:gregor-nuremberg",
                "biological_mother",
            ),
            pairs,
        )
        self.assertIn(
            (
                "polar-bear:felix-nuremberg",
                "polar-bear:aleut-nuremberg",
                "biological_father",
            ),
            pairs,
        )

        for parent_type in ("biological_mother", "biological_father"):
            self.assertFalse(
                any(
                    edge["object"] == "polar-bear:juno-toronto"
                    and edge["type"] == parent_type
                    for edge in atlas["relationships"]
                ),
                "Toronto Zoo's Juno record does not identify her parents.",
            )

    def test_tonja_wolodja_parentage_is_genetically_documented(self):
        atlas = load_atlas("polar-bear")
        sources = sources_by_id(atlas)
        pairs = relationships_by_pair(atlas)
        genetic_source = next(
            source
            for source in atlas["sources"]
            if source["url"].endswith(
                "/eisbaerin-tonja-wurde-als-junge-baerin-in-russland-vertauscht"
            )
        )
        for child in ("polar-bear:tonja", "polar-bear:wolodja"):
            for parent, relation_type in (
                ("polar-bear:simona", "biological_mother"),
                ("polar-bear:vrangel", "biological_father"),
            ):
                edge = pairs[(parent, child, relation_type)]
                self.assertIn(genetic_source["id"], edge["source_ids"])
                self.assertIn(genetic_source["id"], sources)

    def test_hippo_taxa_are_not_mixed(self):
        atlas = load_atlas("hippopotamus")
        self.assertEqual(atlas["coverage"]["taxon"], "Hippopotamus amphibius")
        self.assertEqual(
            {animal["taxon"] for animal in atlas["animals"]},
            {"Hippopotamus amphibius"},
        )
        self.assertTrue(atlas["animals"])

    def test_cincinnati_parentage_is_source_backed(self):
        atlas = load_atlas("hippopotamus")
        sources = sources_by_id(atlas)
        pairs = relationships_by_pair(atlas)
        expected = {
            ("hippopotamus:bibi", "hippopotamus:fiona", "biological_mother"),
            ("hippopotamus:henry", "hippopotamus:fiona", "biological_father"),
            ("hippopotamus:bibi", "hippopotamus:fritz", "biological_mother"),
            ("hippopotamus:tucker", "hippopotamus:fritz", "biological_father"),
        }
        self.assertTrue(expected.issubset(pairs.keys()))
        for pair in expected:
            edge = pairs[pair]
            cited = [sources[source_id] for source_id in edge["source_ids"]]
            self.assertTrue(
                any(
                    source["publisher"] == "Cincinnati Zoo & Botanical Garden"
                    and source["source_type"].startswith("official_zoo")
                    for source in cited
                ),
                f"{edge['id']} lacks direct Cincinnati Zoo evidence",
            )

        henry = next(animal for animal in atlas["animals"] if animal["id"] == "hippopotamus:henry")
        self.assertEqual(henry["status"], "deceased")
        death = next(event for event in atlas["events"] if event["animal_id"] == "hippopotamus:henry" and event["type"] == "death")
        self.assertEqual(death["date"], {"precision": "exact", "value": "2017-10-31"})
        sibling = next(claim for claim in atlas["claims"] if claim["claim_type"] == "sibling")
        self.assertEqual(sibling["value"], "hippopotamus:fritz")
        self.assertIn("source:hippopotamus:cincinnati-fritz", sibling["source_ids"])

    def test_historical_locations_have_dates_or_unknown_precision(self):
        datasets = {}
        for species in ("polar-bear", "hippopotamus"):
            atlas = load_atlas(species)
            datasets[species] = atlas
            sources = sources_by_id(atlas)
            for event in atlas["events"]:
                if event["type"] not in {"move", "transfer"}:
                    continue
                self.assertIn(event["date"]["precision"], {"exact", "approximate", "range", "unknown"})
                self.assertTrue(event["source_ids"], event["id"])
                self.assertTrue(
                    all(source_id in sources for source_id in event["source_ids"]),
                    f"{event['id']} cites a missing source",
                )
                if event["date"]["precision"] == "unknown":
                    self.assertTrue(event["date"].get("notes", "").strip())
                    self.assertTrue(event["notes"].strip())

        polar_events = {event["id"]: event for event in datasets["polar-bear"]["events"]}
        self.assertEqual(polar_events["event:polar-bear:bora-to-dvur"]["date"]["precision"], "unknown")
        self.assertEqual(polar_events["event:polar-bear:tom-arrival"]["date"], {"precision": "approximate", "value": "2009-02"})
        self.assertEqual(polar_events["event:polar-bear:tom-transfer-to-almaty"]["date"], {"precision": "exact", "value": "2024-03-28"})
        hippo_events = {event["id"]: event for event in datasets["hippopotamus"]["events"]}
        self.assertEqual(hippo_events["event:hippopotamus:bibi-arrival"]["date"], {"precision": "approximate", "value": "2016"})
        self.assertEqual(hippo_events["event:hippopotamus:tucker-arrival"]["date"], {"precision": "approximate", "value": "2021-09"})


if __name__ == "__main__":
    unittest.main()
