#!/usr/bin/env python3
"""Stage an immutable Atlas build and atomically switch its four public paths."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
import re
import shutil
import sys
import tempfile
from pathlib import Path

try:
    from .check_no_animal_photos import scan_tree
    from .release_common import EXPECTED_PATHS, RELEASES_DIRECTORY, atomic_symlink_swap, public_target, remove_public_link
except ImportError:  # Direct script execution places tools/ on sys.path.
    from check_no_animal_photos import scan_tree
    from release_common import EXPECTED_PATHS, RELEASES_DIRECTORY, atomic_symlink_swap, public_target, remove_public_link


def _validate_dist(dist: Path) -> Path:
    dist = Path(dist).expanduser()
    if dist.is_symlink() or not dist.is_dir():
        raise ValueError(f"Build directory must be an existing, non-symlink directory: {dist}")
    dist = dist.resolve(strict=True)
    children = {path.name for path in dist.iterdir()}
    if children != set(EXPECTED_PATHS):
        raise ValueError(f"Build directory must contain exactly {', '.join(EXPECTED_PATHS)}")
    for name in EXPECTED_PATHS:
        app = dist / name
        if app.is_symlink() or not app.is_dir() or not (app / "index.html").is_file():
            raise ValueError(f"Build path is incomplete or linked: {app}")
        if name != "atlas":
            manifest_path = app / "local-media-manifest.json"
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise ValueError(f"Atlas media manifest is missing or invalid: {manifest_path}") from error
            if manifest.get("format") != "animal-lineage-atlas-local-media-manifest-v1" or not isinstance(manifest.get("items"), list):
                raise ValueError(f"Atlas media manifest has an unsupported format: {manifest_path}")
        for path in app.rglob("*"):
            if path.is_symlink():
                raise ValueError(f"Build contains a symlink: {path}")
    findings = scan_tree(dist)
    if findings:
        raise ValueError("Build failed the no-photo check:\n" + "\n".join(findings))
    return dist


def deploy_release(root: Path, dist: Path, revision: str) -> Path:
    if not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
        raise ValueError("Revision must be a full 40-character Git SHA")
    root = Path(root).expanduser()
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"Web root must be an existing, non-symlink directory: {root}")
    root = root.resolve(strict=True)
    dist = _validate_dist(dist)

    previous_targets = {name: public_target(root, name) for name in EXPECTED_PATHS}
    releases_root = root / RELEASES_DIRECTORY
    if releases_root.is_symlink():
        raise RuntimeError(f"Refusing to use symlink release directory: {releases_root}")
    releases_root.mkdir(exist_ok=True)
    if not releases_root.is_dir():
        raise RuntimeError(f"Release path is not a directory: {releases_root}")

    release = releases_root / revision
    if release.exists() or release.is_symlink():
        raise RuntimeError(f"Release revision already exists: {release}")
    targets = {name: f"{RELEASES_DIRECTORY}/{revision}/{name}" for name in EXPECTED_PATHS}
    manifest = {
        "format": "animal-lineage-atlas-release-v1",
        "revision": revision,
        "created_at": datetime.now(UTC).isoformat(),
        "previous_targets": previous_targets,
        "targets": targets,
    }

    staging = Path(tempfile.mkdtemp(prefix=f".{revision}.staging-", dir=releases_root))
    try:
        for name in EXPECTED_PATHS:
            shutil.copytree(dist / name, staging / name)
        (staging / "release-manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        # mkdtemp creates a private 0700 directory; the web server must be able
        # to traverse the published release after the staging directory is renamed.
        staging.chmod(0o755)
        staging.rename(release)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise

    switched: list[str] = []
    try:
        for name in EXPECTED_PATHS:
            atomic_symlink_swap(root, name, targets[name])
            switched.append(name)
    except Exception as error:
        restore_errors: list[str] = []
        for name in reversed(switched):
            try:
                old_target = previous_targets[name]
                if old_target is None:
                    remove_public_link(root, name, targets[name])
                else:
                    if public_target(root, name) != targets[name]:
                        raise RuntimeError(f"Public path changed during failed deployment: {root / name}")
                    atomic_symlink_swap(root, name, old_target)
            except Exception as restore_error:
                restore_errors.append(f"{name}: {restore_error}")
        if restore_errors:
            raise RuntimeError(
                f"Public path switch failed ({error}); automatic restoration also failed: "
                + "; ".join(restore_errors)
            ) from error
        raise RuntimeError(f"Public path switch failed and earlier paths were restored: {error}") from error
    return release


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="existing static web root")
    parser.add_argument("--dist", type=Path, required=True, help="four-path build directory")
    parser.add_argument("--revision", required=True, help="full 40-character Git SHA")
    args = parser.parse_args(argv)
    try:
        release = deploy_release(args.root, args.dist, args.revision)
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Deployment failed: {error}", file=sys.stderr)
        return 1
    print(f"Deployed {args.revision} to {release}")
    print(f"Rollback manifest: {release / 'release-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
