#!/usr/bin/env python3
"""Restore the four prior public paths recorded by an Atlas release manifest."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

try:
    from .release_common import (
        EXPECTED_PATHS,
        MEDIA_SERVICE_TARGET_RE,
        RELEASES_DIRECTORY,
        atomic_media_symlink_swap,
        atomic_symlink_swap,
        media_service_target,
        public_target,
        remove_media_symlink,
        remove_public_link,
        restart_systemd_service,
        validate_public_target,
    )
except ImportError:  # Direct script execution places tools/ on sys.path.
    from release_common import (
        EXPECTED_PATHS,
        MEDIA_SERVICE_TARGET_RE,
        RELEASES_DIRECTORY,
        atomic_media_symlink_swap,
        atomic_symlink_swap,
        media_service_target,
        public_target,
        remove_media_symlink,
        remove_public_link,
        restart_systemd_service,
        validate_public_target,
    )


def _restart_media_service() -> None:
    restart_systemd_service("animal-atlas-media.service")


def _stop_media_service() -> None:
    subprocess.run(["systemctl", "stop", "animal-atlas-media.service"], check=True)


def _media_service_enabled() -> bool:
    result = subprocess.run(
        ["systemctl", "is-enabled", "animal-atlas-media.service"],
        check=False,
        capture_output=True,
        text=True,
    )
    state = (result.stdout or result.stderr).strip()
    if state in {"enabled", "enabled-runtime", "linked", "linked-runtime", "alias"}:
        return True
    if state in {"disabled", "static", "indirect", "masked", "not-found", "generated", "transient"}:
        return False
    raise RuntimeError(f"Could not determine media service enablement state: {state or 'no systemd status'}")


def _set_media_service_enabled(enabled: bool) -> None:
    operation = "enable" if enabled else "disable"
    subprocess.run(["systemctl", operation, "animal-atlas-media.service"], check=True)


def _validate_media_root(web_root: Path, media_root: Path) -> Path:
    media_root = Path(media_root).expanduser()
    if media_root.is_symlink() or not media_root.is_dir():
        raise ValueError(f"Media release root must be a regular directory: {media_root}")
    media_root = media_root.resolve(strict=True)
    if media_root == web_root or media_root.is_relative_to(web_root) or web_root.is_relative_to(media_root):
        raise ValueError("Private media release root must be separate from the public web root")
    return media_root


def rollback_release(root: Path, manifest_path: Path, *, media_root: Path, manage_media_service: bool = False) -> None:
    root = Path(root).expanduser()
    manifest_path = Path(manifest_path).expanduser()
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"Web root must be an existing, non-symlink directory: {root}")
    root = root.resolve(strict=True)
    media_root = _validate_media_root(root, media_root)
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
    if not isinstance(manifest, dict):
        raise ValueError("Release manifest must be a JSON object")
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
    for name, target in previous_targets.items():
        validate_public_target(root, name, target)
    revision = manifest.get("revision")
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
        raise ValueError("Manifest does not contain a full Git revision")
    expected_targets = {name: f"{RELEASES_DIRECTORY}/{revision}/{name}" for name in EXPECTED_PATHS}
    if manifest_path.parent.name != revision or targets != expected_targets:
        raise ValueError("Manifest path and release targets do not match its revision")

    current_targets = {name: public_target(root, name) for name in EXPECTED_PATHS}
    if current_targets != targets:
        raise RuntimeError("Public paths changed since this release; refusing stale rollback")

    media_state = manifest.get("media_service")
    if media_state is not None:
        if not isinstance(media_state, dict) or set(media_state) != {"previous_target", "target", "previous_enabled"}:
            raise ValueError("Manifest contains an invalid media service rollback record")
        media_target = media_state["target"]
        previous_media_target = media_state["previous_target"]
        previous_media_enabled = media_state["previous_enabled"]
        if previous_media_enabled is not None and not isinstance(previous_media_enabled, bool):
            raise ValueError("Manifest contains an invalid previous media service enablement state")
        expected_media_target = f"{revision}/media-service"
        if media_target != expected_media_target or not MEDIA_SERVICE_TARGET_RE.fullmatch(str(media_target)):
            raise ValueError("Manifest media service target does not match its revision")
        if previous_media_target is not None:
            if not isinstance(previous_media_target, str) or not MEDIA_SERVICE_TARGET_RE.fullmatch(previous_media_target):
                raise ValueError("Manifest contains an invalid previous media service target")
            previous_media_path = (media_root / previous_media_target).resolve(strict=True)
            try:
                previous_media_path.relative_to(media_root)
            except ValueError as error:
                raise ValueError("Previous media service target escapes the private media root") from error
            if previous_media_path != (media_root / previous_media_target).absolute() or not previous_media_path.is_dir():
                raise ValueError("Previous media service target is not a directory")
        if media_service_target(media_root) != media_target:
            raise RuntimeError("Media service target changed since this release; refusing stale rollback")
    else:
        media_target = None
        previous_media_target = None
        previous_media_enabled = None

    changed: list[str] = []
    media_changed = False
    enabled_before_rollback = _media_service_enabled() if manage_media_service and media_target is not None else None
    try:
        if media_target is not None:
            if previous_media_target is None:
                remove_media_symlink(media_root, media_target)
            else:
                atomic_media_symlink_swap(media_root, previous_media_target)
            media_changed = True
            if manage_media_service:
                if previous_media_target is None:
                    _stop_media_service()
                else:
                    _restart_media_service()
                if previous_media_enabled is not None and _media_service_enabled() != previous_media_enabled:
                    _set_media_service_enabled(previous_media_enabled)
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
        if media_changed and media_target is not None:
            try:
                current_media_target = media_service_target(media_root)
                if current_media_target != previous_media_target:
                    raise RuntimeError("Media service target changed during rollback")
                atomic_media_symlink_swap(media_root, media_target)
                if manage_media_service:
                    _restart_media_service()
                    if enabled_before_rollback is not None and _media_service_enabled() != enabled_before_rollback:
                        _set_media_service_enabled(enabled_before_rollback)
            except Exception as restore_error:
                restore_errors.append(f"media service: {restore_error}")
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
    parser.add_argument("--media-root", type=Path, default=Path("/var/lib/animal-lineage-atlas"), help="private media release directory")
    parser.add_argument("--skip-media-service-management", action="store_true", help="leave the relay process untouched")
    args = parser.parse_args(argv)
    try:
        rollback_release(
            args.root,
            args.manifest,
            media_root=args.media_root,
            manage_media_service=not args.skip_media_service_management,
        )
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Rollback failed: {error}", file=sys.stderr)
        return 1
    print("Restored all previous Atlas public path targets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
