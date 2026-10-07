"""Shared safety checks and atomic path swaps for static Atlas releases."""

from __future__ import annotations

import os
import uuid
from pathlib import Path


EXPECTED_PATHS = ("atlas", "atlas.red-panda", "atlas.polar-bear", "atlas.hippopotamus")
RELEASES_DIRECTORY = "_animal-lineage-releases"


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
