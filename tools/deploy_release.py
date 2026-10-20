#!/usr/bin/env python3
"""Stage immutable Atlas and media releases, then atomically switch their paths."""

from __future__ import annotations

import argparse
from datetime import UTC, datetime
import json
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from .check_no_animal_photos import scan_tree
    from .release_common import (
        EXPECTED_PATHS,
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
    from check_no_animal_photos import scan_tree
    from release_common import (
        EXPECTED_PATHS,
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


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MEDIA_ROOT = Path("/var/lib/animal-lineage-atlas")


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


def _prepare_media_root(web_root: Path, media_root: Path) -> Path:
    media_root = Path(media_root).expanduser()
    if media_root.is_symlink():
        raise ValueError(f"Media release root must not be a symlink: {media_root}")
    resolved_candidate = media_root.resolve(strict=False)
    if resolved_candidate == web_root or resolved_candidate.is_relative_to(web_root) or web_root.is_relative_to(resolved_candidate):
        raise ValueError("Private media release root must be separate from the public web root")
    newly_created = not media_root.exists()
    media_root.mkdir(parents=True, exist_ok=True, mode=0o755)
    if not media_root.is_dir():
        raise ValueError(f"Media release root must be a directory: {media_root}")
    if newly_created:
        media_root.chmod(0o755)
    elif stat.S_IMODE(media_root.stat().st_mode) & 0o005 != 0o005:
        raise ValueError(f"Media release root must be traversable by the relay service user: {media_root}")
    media_root = media_root.resolve(strict=True)
    if media_root == web_root or media_root.is_relative_to(web_root) or web_root.is_relative_to(media_root):
        raise ValueError("Private media release root must be separate from the public web root")
    return media_root


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
            public_manifest_path = app / "media-manifest.json"
            try:
                public_manifest = json.loads(public_manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as error:
                raise ValueError(f"Atlas public media manifest is missing or invalid: {public_manifest_path}") from error
            if public_manifest.get("format") != "animal-lineage-atlas-public-media-v1" or not isinstance(public_manifest.get("items"), list):
                raise ValueError(f"Atlas public media manifest has an unsupported format: {public_manifest_path}")
        for path in app.rglob("*"):
            if path.is_symlink():
                raise ValueError(f"Build contains a symlink: {path}")
    findings = scan_tree(dist)
    if findings:
        raise ValueError("Build failed the no-photo check:\n" + "\n".join(findings))
    return dist


def deploy_release(
    root: Path,
    dist: Path,
    revision: str,
    *,
    media_root: Path,
    restart_media_service: bool = False,
) -> Path:
    if not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
        raise ValueError("Revision must be a full 40-character Git SHA")
    root = Path(root).expanduser()
    if root.is_symlink() or not root.is_dir():
        raise ValueError(f"Web root must be an existing, non-symlink directory: {root}")
    root = root.resolve(strict=True)
    dist = _validate_dist(dist)
    media_root = _prepare_media_root(root, media_root)

    previous_targets = {name: public_target(root, name) for name in EXPECTED_PATHS}
    for name, target in previous_targets.items():
        validate_public_target(root, name, target)
    releases_root = root / RELEASES_DIRECTORY
    if releases_root.is_symlink():
        raise RuntimeError(f"Refusing to use symlink release directory: {releases_root}")
    releases_root.mkdir(exist_ok=True)
    if not releases_root.is_dir():
        raise RuntimeError(f"Release path is not a directory: {releases_root}")
    previous_media_target = media_service_target(media_root)
    previous_media_enabled = _media_service_enabled() if restart_media_service else None

    release = releases_root / revision
    media_release = media_root / revision
    if release.exists() or release.is_symlink() or media_release.exists() or media_release.is_symlink():
        raise RuntimeError(f"Release revision already exists: {release}")
    targets = {name: f"{RELEASES_DIRECTORY}/{revision}/{name}" for name in EXPECTED_PATHS}
    media_target = f"{revision}/media-service"
    manifest = {
        "format": "animal-lineage-atlas-release-v1",
        "revision": revision,
        "created_at": datetime.now(UTC).isoformat(),
        "previous_targets": previous_targets,
        "targets": targets,
        "media_service": {
            "previous_target": previous_media_target,
            "target": media_target,
            "previous_enabled": previous_media_enabled,
        },
    }

    staging = Path(tempfile.mkdtemp(prefix=f".{revision}.staging-", dir=releases_root))
    media_staging = Path(tempfile.mkdtemp(prefix=f".{revision}.staging-", dir=media_root))
    try:
        for name in EXPECTED_PATHS:
            shutil.copytree(dist / name, staging / name)
        media_service_dir = media_staging / "media-service"
        media_service_dir.mkdir()
        media_service_dir.chmod(0o755)
        shutil.copy2(REPO_ROOT / "packages" / "media" / "relay-server.mjs", media_service_dir / "relay-server.mjs")
        shutil.copy2(REPO_ROOT / "packages" / "media" / "approved-media-v1.json", media_service_dir / "approved-media-v1.json")
        (staging / "release-manifest.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        # mkdtemp creates a private 0700 directory; the web server must be able
        # to traverse the published release after the staging directory is renamed.
        staging.chmod(0o755)
        media_staging.chmod(0o755)
        media_release.parent.mkdir(parents=True, exist_ok=True)
        media_staging.rename(media_release)
        staging.rename(release)
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        shutil.rmtree(media_staging, ignore_errors=True)
        raise

    switched: list[str] = []
    media_switched = False
    try:
        atomic_media_symlink_swap(media_root, media_target)
        media_switched = True
        if restart_media_service:
            _restart_media_service()
            _set_media_service_enabled(True)
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
        if media_switched:
            try:
                if previous_media_target is None:
                    remove_media_symlink(media_root, media_target)
                    if restart_media_service:
                        _stop_media_service()
                else:
                    if media_service_target(media_root) != media_target:
                        raise RuntimeError("Media service target changed during failed deployment")
                    atomic_media_symlink_swap(media_root, previous_media_target)
                if restart_media_service:
                    if previous_media_target is not None:
                        _restart_media_service()
                    if previous_media_enabled is not None and _media_service_enabled() != previous_media_enabled:
                        _set_media_service_enabled(previous_media_enabled)
            except Exception as restore_error:
                restore_errors.append(f"media service: {restore_error}")
        if restore_errors:
            raise RuntimeError(
                f"Public path switch failed ({error}); automatic restoration also failed: "
                + "; ".join(restore_errors)
            ) from error
        raise RuntimeError(f"Release activation failed and earlier paths were restored: {error}") from error
    return release


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True, help="existing static web root")
    parser.add_argument("--dist", type=Path, required=True, help="four-path build directory")
    parser.add_argument("--revision", required=True, help="full 40-character Git SHA")
    parser.add_argument("--media-root", type=Path, default=DEFAULT_MEDIA_ROOT, help="private release directory outside the public web root")
    parser.add_argument("--skip-media-service-restart", action="store_true", help="stage the media code without restarting the approved relay")
    args = parser.parse_args(argv)
    try:
        release = deploy_release(
            args.root,
            args.dist,
            args.revision,
            media_root=args.media_root,
            restart_media_service=not args.skip_media_service_restart,
        )
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Deployment failed: {error}", file=sys.stderr)
        return 1
    print(f"Deployed {args.revision} to {release}")
    print(f"Rollback manifest: {release / 'release-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
