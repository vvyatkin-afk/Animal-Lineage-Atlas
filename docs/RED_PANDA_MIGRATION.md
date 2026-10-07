# Red-panda migration

The v1 red-panda atlas imports the cited, curated Futa-family layer from `FFJ-Red-Panda-Atlas-card-ui-20261007`, at source commit `fe97aff63d87948232462ea4b60873460de96948`. The input JSON hash matches the reviewed production tree asset recorded in the preflight checklist and migration report.

## Imported corpus

`atlases/red-panda/atlas.json` contains 83 named animals, 93 relationships, 173 events, 63 claims, 39 institutions or places, 78 link-only media references, and 95 source records. The 93 relationships include 76 explicit parent references and 17 social-partner links; the social links are not rendered as ancestry. The migration report records seven unnamed-outcome events covering eight outcomes and one unquantified birth event.

Each named animal maps to `red-panda:<legacy-id>` in `atlases/red-panda/legacy_id_map.json`. The report lists source and target counts, all mapped IDs, unresolved names, decisions, source hashes, and dropped local-image fields. Unresolved co-parent names remain claims rather than invented animal records.

## Excluded unlicensed snapshot

The separate `wwoast/redpanda-lineage` snapshot declares no reuse license. It is not copied into canonical data or runtime. The report records its hash, every excluded profile ID, and aggregate counts: 1,559 profiles, 320 zoos, 2,386 family edges, and 1,049 litter edges. Local paths and direct image URLs from the curated source were dropped; only source-page links remain as media metadata.

## Checks and remaining review

Run:

```sh
python3 tools/validate_atlas.py atlases/red-panda/atlas.json
python3 -m unittest tests.test_red_panda_migration -v
python3 tools/check_no_animal_photos.py .
```

The atlas is a reviewed migration of a cited family layer, not a complete red-panda studbook. Sixty-three unresolved items remain explicit in `atlases/red-panda/migration_report.json`. The migration report and ID map are the detailed audit trail.
