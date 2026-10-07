#!/usr/bin/env python3
"""Validate canonical Atlas datasets against the published JSON Schema."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / "packages" / "schema" / "atlas.schema.json"
SCHEMA = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
Draft202012Validator.check_schema(SCHEMA)
VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FormatChecker())


def validate_schema(document: object) -> list:
    return sorted(
        VALIDATOR.iter_errors(document),
        key=lambda error: (tuple(str(part) for part in error.absolute_path), error.message),
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("atlases", nargs="+", type=Path, help="canonical Atlas JSON files")
    args = parser.parse_args(argv)
    invalid = False
    for atlas_path in args.atlases:
        try:
            document = json.loads(atlas_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            print(f"ERROR {atlas_path}: {error}", file=sys.stderr)
            invalid = True
            continue
        errors = validate_schema(document)
        if errors:
            invalid = True
            for error in errors:
                path = "$" + "".join(f"[{part!r}]" if isinstance(part, int) else f".{part}" for part in error.absolute_path)
                print(f"SCHEMA {atlas_path}: {path}: {error.message}")
            print(f"Schema validation failed: {len(errors)} issue(s) in {atlas_path}", file=sys.stderr)
        else:
            print(f"Schema-valid atlas: {atlas_path}")
    return 1 if invalid else 0


if __name__ == "__main__":
    raise SystemExit(main())
