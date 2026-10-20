#!/usr/bin/env python3
"""Install or roll back the narrowly scoped Atlas media relay Nginx include."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAIN_CONFIG = Path("/etc/nginx/conf.d/00-red-panda-atlas.conf")
DEFAULT_SNIPPET = Path("/etc/nginx/snippets/animal-atlas-media-relay.conf")
DEFAULT_BACKUP_ROOT = Path("/var/backups/animal-lineage-atlas/nginx")
DEFAULT_NGINX = Path("/usr/sbin/nginx")
DEFAULT_SYSTEMCTL = Path("/usr/bin/systemctl")


@dataclass(frozen=True)
class NginxPaths:
    main_config: Path = DEFAULT_MAIN_CONFIG
    snippet: Path = DEFAULT_SNIPPET
    backup_root: Path = DEFAULT_BACKUP_ROOT
    nginx: Path = DEFAULT_NGINX
    systemctl: Path = DEFAULT_SYSTEMCTL


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _read_regular(path: Path) -> tuple[bytes, os.stat_result] | None:
    if path.is_symlink():
        raise RuntimeError(f"Refusing to modify a symlinked Nginx path: {path}")
    if not path.exists():
        return None
    if not path.is_file():
        raise RuntimeError(f"Nginx path is not a regular file: {path}")
    return path.read_bytes(), path.stat()


def _atomic_write(path: Path, content: bytes, *, mode: int, uid: int | None = None, gid: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.atlas-", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temporary, mode)
        if uid is not None and gid is not None and os.geteuid() == 0:
            os.chown(temporary, uid, gid)
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


def _snapshot(path: Path, state: tuple[bytes, os.stat_result] | None, backup_dir: Path, name: str) -> dict[str, object]:
    if state is None:
        return {"path": str(path), "exists": False}
    content, metadata = state
    backup_file = backup_dir / name
    backup_file.write_bytes(content)
    backup_file.chmod(0o600)
    backup_fd = os.open(backup_file, os.O_RDONLY)
    try:
        os.fsync(backup_fd)
    finally:
        os.close(backup_fd)
    return {
        "path": str(path),
        "exists": True,
        "backup_file": backup_file.name,
        "sha256": _sha256(content),
        "mode": stat.S_IMODE(metadata.st_mode),
        "uid": metadata.st_uid,
        "gid": metadata.st_gid,
    }


def _restore_snapshot(snapshot: dict[str, object], backup_dir: Path) -> None:
    path = Path(str(snapshot["path"]))
    if not snapshot["exists"]:
        if path.exists() or path.is_symlink():
            path.unlink()
        return
    backup_file = backup_dir / str(snapshot["backup_file"])
    content = backup_file.read_bytes()
    if _sha256(content) != snapshot["sha256"]:
        raise RuntimeError(f"Nginx backup checksum mismatch: {backup_file}")
    _atomic_write(
        path,
        content,
        mode=int(snapshot["mode"]),
        uid=int(snapshot["uid"]),
        gid=int(snapshot["gid"]),
    )


def _write_manifest(backup_dir: Path, manifest: dict[str, object]) -> None:
    manifest_path = backup_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    manifest_path.chmod(0o600)
    manifest_fd = os.open(manifest_path, os.O_RDONLY)
    try:
        os.fsync(manifest_fd)
    finally:
        os.close(manifest_fd)
    directory_fd = os.open(backup_dir, os.O_RDONLY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def _run_nginx(paths: NginxPaths, run) -> None:
    run([str(paths.nginx), "-t"], check=True)


def _reload_nginx(paths: NginxPaths, run) -> None:
    run([str(paths.systemctl), "reload", "nginx"], check=True)


def _verify_installed(paths: NginxPaths, manifest: dict[str, object]) -> None:
    installed = manifest["installed"]
    for name in ("main_config", "snippet"):
        expected = installed[name]
        path = paths.main_config if name == "main_config" else paths.snippet
        current = _read_regular(path)
        if not expected["exists"]:
            if current is not None:
                raise RuntimeError(f"Refusing to roll back changed Nginx path: {path}")
        elif current is None or _sha256(current[0]) != expected["sha256"]:
            raise RuntimeError(f"Refusing to roll back changed Nginx path: {path}")


def _restore_pair(paths: NginxPaths, backup_dir: Path, manifest: dict[str, object], state_name: str) -> None:
    state = manifest[state_name]
    _restore_snapshot(state["main_config"], backup_dir)
    _restore_snapshot(state["snippet"], backup_dir)


def install_nginx_relay(
    *,
    paths: NginxPaths = NginxPaths(),
    snippet_content: bytes | None = None,
    run=subprocess.run,
) -> Path | None:
    if snippet_content is None:
        snippet_content = (REPO_ROOT / "deploy/nginx/atlas-media-relay.conf").read_bytes()
    include_line = f"    include {paths.snippet};\n"
    main_state = _read_regular(paths.main_config)
    if main_state is None:
        raise RuntimeError(f"Active Nginx server configuration is missing: {paths.main_config}")
    snippet_state = _read_regular(paths.snippet)
    original_main, main_metadata = main_state
    include_count = original_main.count(include_line.encode("utf-8"))
    if include_count:
        if include_count != 1 or snippet_state is None or snippet_state[0] != snippet_content:
            raise RuntimeError("Atlas media include already exists with unexpected configuration")
        _run_nginx(paths, run)
        _reload_nginx(paths, run)
        return None
    if str(paths.snippet).encode("utf-8") in original_main:
        raise RuntimeError("Active Nginx config already mentions the Atlas media snippet in an unrecognized form")
    if snippet_state is not None and snippet_state[0] != snippet_content:
        raise RuntimeError(f"Refusing to replace an existing Nginx snippet: {paths.snippet}")

    try:
        original_text = original_main.decode("utf-8")
    except UnicodeDecodeError as error:
        raise RuntimeError("Active Nginx server configuration is not UTF-8") from error
    fallback = "    location / {\n"
    if original_text.count("server {") != 1 or original_text.count(fallback) != 1 or original_text.count("location /red-panda/") != 1:
        raise RuntimeError("Active Atlas server block does not match the reviewed insertion point")
    new_main = original_text.replace(fallback, include_line + fallback, 1).encode("utf-8")

    if paths.backup_root.is_symlink():
        raise RuntimeError(f"Refusing symlink Nginx backup root: {paths.backup_root}")
    paths.backup_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not paths.backup_root.is_dir():
        raise RuntimeError(f"Nginx backup root is not a directory: {paths.backup_root}")
    os.chmod(paths.backup_root, 0o700)
    backup_dir = Path(tempfile.mkdtemp(prefix="phase4-nginx-", dir=paths.backup_root))
    backup_dir.chmod(0o700)
    original_state = {
        "main_config": _snapshot(paths.main_config, main_state, backup_dir, "00-red-panda-atlas.conf.original"),
        "snippet": _snapshot(paths.snippet, snippet_state, backup_dir, "animal-atlas-media-relay.conf.original"),
    }
    installed_state = {
        "main_config": {"path": str(paths.main_config), "exists": True, "sha256": _sha256(new_main)},
        "snippet": {"path": str(paths.snippet), "exists": True, "sha256": _sha256(snippet_content)},
    }
    # Save the intended active pair so a failed rollback can restore the tested config.
    (backup_dir / "00-red-panda-atlas.conf.installed").write_bytes(new_main)
    (backup_dir / "00-red-panda-atlas.conf.installed").chmod(0o600)
    (backup_dir / "animal-atlas-media-relay.conf.installed").write_bytes(snippet_content)
    (backup_dir / "animal-atlas-media-relay.conf.installed").chmod(0o600)
    for installed_file in (backup_dir / "00-red-panda-atlas.conf.installed", backup_dir / "animal-atlas-media-relay.conf.installed"):
        installed_fd = os.open(installed_file, os.O_RDONLY)
        try:
            os.fsync(installed_fd)
        finally:
            os.close(installed_fd)
    snippet_metadata = snippet_state[1] if snippet_state is not None else None
    manifest = {
        "format": "animal-lineage-atlas-nginx-relay-backup-v1",
        "created_at": datetime.now(UTC).isoformat(),
        "paths": {"main_config": str(paths.main_config), "snippet": str(paths.snippet)},
        "original": original_state,
        "installed": {
            "main_config": {
                **installed_state["main_config"],
                "backup_file": "00-red-panda-atlas.conf.installed",
                "mode": stat.S_IMODE(main_metadata.st_mode),
                "uid": main_metadata.st_uid,
                "gid": main_metadata.st_gid,
            },
            "snippet": {
                **installed_state["snippet"],
                "backup_file": "animal-atlas-media-relay.conf.installed",
                "mode": stat.S_IMODE(snippet_metadata.st_mode) if snippet_metadata is not None else 0o644,
                "uid": snippet_metadata.st_uid if snippet_metadata is not None else os.geteuid(),
                "gid": snippet_metadata.st_gid if snippet_metadata is not None else os.getegid(),
            },
        },
    }
    _write_manifest(backup_dir, manifest)

    reload_attempted = False
    try:
        if snippet_state is None:
            _atomic_write(paths.snippet, snippet_content, mode=0o644)
        _atomic_write(
            paths.main_config,
            new_main,
            mode=stat.S_IMODE(main_metadata.st_mode),
            uid=main_metadata.st_uid,
            gid=main_metadata.st_gid,
        )
        _run_nginx(paths, run)
        reload_attempted = True
        _reload_nginx(paths, run)
    except Exception as error:
        restore_error = None
        try:
            current_main = _read_regular(paths.main_config)
            if current_main is not None and _sha256(current_main[0]) == _sha256(new_main):
                _restore_snapshot(original_state["main_config"], backup_dir)
            elif current_main is None or _sha256(current_main[0]) != original_state["main_config"]["sha256"]:
                raise RuntimeError(f"Active server configuration changed during install: {paths.main_config}")
            current_snippet = _read_regular(paths.snippet)
            if snippet_state is None and current_snippet is not None and _sha256(current_snippet[0]) == _sha256(snippet_content):
                _restore_snapshot(original_state["snippet"], backup_dir)
            elif snippet_state is not None and current_snippet is not None and _sha256(current_snippet[0]) != original_state["snippet"]["sha256"]:
                raise RuntimeError(f"Media snippet changed during install: {paths.snippet}")
            _run_nginx(paths, run)
            if reload_attempted:
                _reload_nginx(paths, run)
        except Exception as rollback_error:
            restore_error = rollback_error
        if restore_error:
            raise RuntimeError(f"Nginx relay install failed ({error}); restoring the saved configuration also failed: {restore_error}") from error
        raise RuntimeError(f"Nginx relay install failed and the original configuration was restored: {error}") from error
    return backup_dir


def rollback_nginx_relay(backup_dir: Path, *, paths: NginxPaths = NginxPaths(), run=subprocess.run) -> None:
    backup_dir = Path(backup_dir).expanduser()
    if backup_dir.is_symlink() or not backup_dir.is_dir():
        raise ValueError(f"Nginx backup must be a regular directory: {backup_dir}")
    manifest_path = backup_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("format") != "animal-lineage-atlas-nginx-relay-backup-v1":
        raise ValueError("Unsupported Atlas Nginx backup manifest")
    if manifest.get("paths") != {"main_config": str(paths.main_config), "snippet": str(paths.snippet)}:
        raise ValueError("Backup paths do not match the active Nginx configuration")
    _verify_installed(paths, manifest)
    try:
        _restore_pair(paths, backup_dir, manifest, "original")
        _run_nginx(paths, run)
        _reload_nginx(paths, run)
    except Exception as error:
        try:
            _restore_pair(paths, backup_dir, manifest, "installed")
            _run_nginx(paths, run)
            _reload_nginx(paths, run)
        except Exception as restore_error:
            raise RuntimeError(f"Nginx rollback failed ({error}); restoring the installed configuration also failed: {restore_error}") from error
        raise RuntimeError(f"Nginx rollback failed; the tested installed configuration was restored: {error}") from error


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="operation", required=True)
    subparsers.add_parser("install", help="install the media route and create a hash-verified backup")
    rollback_parser = subparsers.add_parser("rollback", help="restore an install backup if current files still match")
    rollback_parser.add_argument("--backup", type=Path, required=True, help="backup directory printed by install")
    args = parser.parse_args(argv)
    try:
        if args.operation == "install":
            backup = install_nginx_relay()
            print("Atlas media Nginx include already installed and valid" if backup is None else f"Installed Atlas media Nginx include; backup: {backup}")
        else:
            rollback_nginx_relay(args.backup)
            print("Restored the prior Nginx configuration and snippet")
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"Nginx relay configuration failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
