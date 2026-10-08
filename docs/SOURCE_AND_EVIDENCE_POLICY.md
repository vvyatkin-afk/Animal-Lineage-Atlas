# Source and evidence policy

## Source priority

Prefer the institution responsible for the animal or record: zoo biographies, dated announcements, official histories, public studbooks, and direct genetic findings. Use secondary reporting to locate or corroborate primary material, and label its role. Each source record retains the direct page URL and publication/access information available during review.

Source tiers are defined in [`DATA_PROVENANCE_TIERS.md`](DATA_PROVENANCE_TIERS.md). A `discovery_only` source can document a research lead or an unresolved report, but cannot be the sole support for a canonical animal fact, claim, relationship, or event. A public community dataset is tier D and can support imported records when the snapshot, version, and hash are recorded.

## Linking claims to evidence

Every factual relationship, event, and claim must identify its supporting source record. A source may support a name, an event, or one particular family link; it does not automatically prove all facts about that animal. Do not infer parentage from co-housing, breeding-pair expectations, or a shared enclosure.

## Preserve source precision

Use only the date detail the source provides. A birth year stays year-precision, a reported age stays in notes when no calendar date can be established, and an unknown date remains unknown. Keep reported spellings and names. Add a translation only when a cited source gives it.

## Uncertainty and conflicts

Unknown, probable, confirmed, and disputed evidence remain distinct. Competing dates or identities are represented as separate sourced claims and resolved only when the evidence supports a decision. The decision and the remaining disagreement are explained in dataset coverage notes and the species research files.

## Review and corrections

Every dataset includes a review date and scope/limitations. Corrections should name the animal ID, source URL, and specific record to change. Update the canonical JSON, preserve the prior evidence trail, and run the full data validator and test suite before release.
