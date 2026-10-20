"""Shared safety checks and atomic path swaps for static Atlas releases."""

from __future__ import annotations

import os
import re
import subprocess
import time
import uuid
from pathlib import Path


EXPECTED_PATHS = ("atlas", "atlas.red-panda", "atlas.polar-bear", "atlas.hippopotamus")
RELEASES_DIRECTORY = "_animal-lineage-releases"
MEDIA_CURRENT_LINK = "media-current"
MEDIA_SERVICE_TARGET_RE = re.compile(r"^[0-9a-fA-F]{40}/media-service$")


def restart_systemd_service(unit: str, *, run=None, sleep=None) -> None:
    """Restart a service and require it to remain active through startup."""
    runner = run or subprocess.run
    pause = sleep or time.sleep
    runner(["systemctl", "restart", unit], check=True)
    for attempt in range(30):
        active = runner(["systemctl", "is-active", "--quiet", unit], check=False)
        if active.returncode == 0:
            pause(1.0)
            stable = runner(["systemctl", "is-active", "--quiet", unit], check=False)
            if stable.returncode == 0:
                return
            raise RuntimeError(f"Systemd service did not remain active after restart: {unit}")
        if attempt < 29:
            pause(0.1)
    raise RuntimeError(f"Systemd service did not become active after restart: {unit}")


def validate_public_name(name: str) -> None:
    if name not in EXPECTED_PATHS:
        raise ValueError(f"Refusing to change unexpected public path: {name}")


def public_target(root: Path, name: str) -> str | None:
    validate_public_name(name)
    path = root / name
    if path.is_symlink():
        return os.readlink(path)
    if path.exists():
        raise RuntimeError(f"Refusing to replace non-symlink public path: {path}")
    return None


def validate_public_target(root: Path, name: str, target: str | None) -> None:
    """Require saved release targets to resolve to directories inside the web root."""
    validate_public_name(name)
    if target is None:
        return
    if not isinstance(target, str) or not target:
        raise ValueError(f"Invalid saved target for {name}")
    root = Path(root).resolve(strict=True)
    candidate = Path(target)
    if not candidate.is_absolute():
        candidate = root / candidate
    resolved = candidate.resolve(strict=True)
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Saved target for {name} escapes the public web root") from error
    if not resolved.is_dir():
        raise ValueError(f"Saved target for {name} is not a directory")


def atomic_symlink_swap(root: Path, name: str, target: str) -> None:
    """Atomically replace one expected public path with a symlink."""
    validate_public_name(name)
    root = Path(root)
    destination = root / name
    public_target(root, name)
    temporary = root / f".{name}.atlas-swap-{uuid.uuid4().hex}"
    try:
        os.symlink(target, temporary)
        os.replace(temporary, destination)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def remove_public_link(root: Path, name: str, expected_target: str) -> None:
    """Remove a newly installed symlink only if it still has our target."""
    validate_public_name(name)
    path = Path(root) / name
    if not path.is_symlink() or os.readlink(path) != expected_target:
        raise RuntimeError(f"Refusing to remove changed public path: {path}")
    path.unlink()


def media_service_target(media_root: Path) -> str | None:
    """Return the verified media-current target inside a private media root."""
    media_root = Path(media_root)
    if media_root.is_symlink() or not media_root.is_dir():
        raise RuntimeError(f"Media release root must be a regular directory: {media_root}")
    media_root = media_root.resolve(strict=True)
    link = media_root / MEDIA_CURRENT_LINK
    if link.is_symlink():
        target = link.readlink().as_posix()
        if not MEDIA_SERVICE_TARGET_RE.fullmatch(target):
            raise RuntimeError(f"Refusing unexpected media service link target: {target}")
        resolved_target = (media_root / target).resolve(strict=True)
        try:
            resolved_target.relative_to(media_root)
        except ValueError as error:
            raise RuntimeError("Media service link escapes the immutable release directory") from error
        if resolved_target != (media_root / target).absolute() or not resolved_target.is_dir():
            raise RuntimeError("Current media service target is not a directory")
        return target
    if link.exists():
        raise RuntimeError(f"Refusing to replace a non-symlink media service path: {link}")
    return None


def atomic_media_symlink_swap(media_root: Path, target: str) -> None:
    """Atomically switch the private media service current target."""
    if not MEDIA_SERVICE_TARGET_RE.fullmatch(target):
        raise ValueError(f"Refusing unexpected media service target: {target}")
    root = Path(media_root)
    if root.is_symlink() or not root.is_dir():
        raise RuntimeError(f"Media release root must be a regular directory: {root}")
    root = root.resolve(strict=True)
    target_path = (root / target).resolve(strict=True)
    try:
        target_path.relative_to(root)
    except ValueError as error:
        raise RuntimeError("New media service target escapes the private media root") from error
    if target_path != (root / target).absolute() or not target_path.is_dir():
        raise RuntimeError("New media service target is not a directory")
    media_service_target(root)
    destination = root / MEDIA_CURRENT_LINK
    temporary = root / f".{MEDIA_CURRENT_LINK}.atlas-swap-{uuid.uuid4().hex}"
    try:
        os.symlink(target, temporary)
        os.replace(temporary, destination)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def remove_media_symlink(media_root: Path, expected_target: str) -> None:
    """Remove media-current only while it still points at our expected release."""
    if not MEDIA_SERVICE_TARGET_RE.fullmatch(expected_target):
        raise ValueError(f"Refusing unexpected media service target: {expected_target}")
    link = Path(media_root) / MEDIA_CURRENT_LINK
    if not link.is_symlink() or link.readlink().as_posix() != expected_target:
        raise RuntimeError(f"Refusing to remove changed media service path: {link}")
    link.unlink()
