#!/usr/bin/env python3
"""Restore the four prior public paths recorded by an Atlas release manifest."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    from .release_common import EXPECTED_PATHS, RELEASES_DIRECTORY, atomic_symlink_swap, public_target, remove_public_link
except ImportError:  # Direct script execution places tools/ on sys.path.
    from release_common import EXPECTED_PATHS, RELEASES_DIRECTORY, atomic_symlink_swap, public_target, remove_public_link


def rollback_release(root: Path, manifest_path: Path) -> None:
    root = Path(root).expanduser()
    manifest_path = Path(manifest_path).expanduser()
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"Web root must be an existing, non-symlink directory: {root}")
    root = root.resolve(strict=True)
    if manifest_path.is_symlink() or not manifest_path.is_file():
        raise ValueError(f"Release manifest must be a regular file: {manifest_path}")
    manifest_path = manifest_path.resolve(strict=True)
    releases_candidate = root / RELEASES_DIRECTORY
    if releases_candidate.is_symlink() or not releases_candidate.is_dir():
        raise ValueError(f"Release path must be a regular, non-symlink directory: {releases_candidate}")
    releases_root = releases_candidate.resolve(strict=True)
    try:
        manifest_path.relative_to(releases_root)
    except ValueError as error:
        raise ValueError("Manifest must be inside the Atlas release directory") from error

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"Could not read release manifest: {error}") from error
    if manifest.get("format") != "animal-lineage-atlas-release-v1":
        raise ValueError("Unsupported Atlas release manifest format")
    targets = manifest.get("targets")
    previous_targets = manifest.get("previous_targets")
    expected_keys = set(EXPECTED_PATHS)
    if not isinstance(targets, dict) or set(targets) != expected_keys:
        raise ValueError("Manifest targets do not contain exactly the four Atlas paths")
    if not isinstance(previous_targets, dict) or set(previous_targets) != expected_keys:
        raise ValueError("Manifest previous targets do not contain exactly the four Atlas paths")
    if any(not isinstance(targets[name], str) for name in EXPECTED_PATHS):
        raise ValueError("Manifest contains an invalid current target")
    if any(previous_targets[name] is not None and not isinstance(previous_targets[name], str) for name in EXPECTED_PATHS):
        raise ValueError("Manifest contains an invalid previous target")
    revision = manifest.get("revision")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
        raise ValueError("Manifest does not contain a full Git revision")
    expected_targets = {name: f"{RELEASES_DIRECTORY}/{revision}/{name}" for name in EXPECTED_PATHS}
    if manifest_path.parent.name != revision or targets != expected_targets:
        raise ValueError("Manifest path and release targets do not match its revision")

    current_targets = {name: public_target(root, name) for name in EXPECTED_PATHS}
    if current_targets != targets:
        raise RuntimeError("Public paths changed since this release; refusing stale rollback")

    changed: list[str] = []
    try:
        for name in EXPECTED_PATHS:
            previous = previous_targets[name]
            if previous is None:
                remove_public_link(root, name, targets[name])
            else:
                atomic_symlink_swap(root, name, previous)
            changed.append(name)
    except Exception as error:
        restore_errors: list[str] = []
        for name in reversed(changed):
            try:
                if public_target(root, name) != previous_targets[name]:
                    raise RuntimeError(f"Public path changed during rollback: {root / name}")
                atomic_symlink_swap(root, name, targets[name])
            except Exception as restore_error:
                restore_errors.append(f"{name}: {restore_error}")
        if restore_errors:
            raise RuntimeError(
                f"Rollback failed ({error}); restoring the release targets also failed: "
                + "; ".join(restore_errors)
            ) from error
        raise RuntimeError(f"Rollback failed and changed paths were restored: {error}") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="existing static web root")
    parser.add_argument("--manifest", type=Path, required=True, help="manifest from the deployed release")
    args = parser.parse_args(argv)
    try:
        rollback_release(args.root, args.manifest)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Rollback failed: {error}", file=sys.stderr)
        return 1
    print("Restored all previous Atlas public path targets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
