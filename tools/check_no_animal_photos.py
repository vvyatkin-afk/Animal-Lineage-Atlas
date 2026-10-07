#!/usr/bin/env python3
"""Reject local animal-photo files and references in source/release trees."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


PHOTO_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
IGNORED_DIRECTORY_NAMES = {
    ".git", ".worktrees", ".cache", ".pytest_cache", "__pycache__", "node_modules", "dist", "build", ".superpowers"
}
DATA_IMAGE_RE = re.compile(r"data:image/", re.IGNORECASE)
LOCAL_IMAGE_ATTRIBUTE_RE = re.compile(
    r"(?:src|href)\s*=\s*(['\"])(?!https?://|//|data:)([^'\"]+\.(?:jpe?g|png|webp)(?:[?#][^'\"]*)?)\1",
    re.IGNORECASE,
)
CSS_IMAGE_RE = re.compile(
    r"url\(\s*(['\"]?)(?!https?://|//|data:)([^)'\"\s]+\.(?:jpe?g|png|webp)(?:[?#][^)'\"\s]*)?)\1\s*\)",
    re.IGNORECASE,
)


def _walk_files(root: Path):
    for path in root.rglob("*"):
        if any(part in IGNORED_DIRECTORY_NAMES for part in path.relative_to(root).parts[:-1]):
            continue
        if path.is_file() and not path.is_symlink():
            yield path


def _media_references(document, relative_path: str, findings: list[str]) -> None:
    if isinstance(document, dict):
        for key, value in document.items():
            if key == "direct_remote_url" and isinstance(value, str):
                if DATA_IMAGE_RE.match(value):
                    findings.append(f"embedded animal image reference in {relative_path}: {value[:80]}")
                elif value:
                    parsed = urlsplit(value)
                    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                        findings.append(f"local photo reference in {relative_path}: {value}")
                    elif Path(parsed.path).suffix.lower() in PHOTO_EXTENSIONS and parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
                        findings.append(f"local photo reference in {relative_path}: {value}")
            elif key in {"local_path", "relative_path", "local_media_path"} and isinstance(value, str):
                if Path(urlsplit(value).path).suffix.lower() in PHOTO_EXTENSIONS:
                    findings.append(f"local photo reference in {relative_path}: {value}")
            else:
                _media_references(value, relative_path, findings)
    elif isinstance(document, list):
        for value in document:
            _media_references(value, relative_path, findings)


def scan_tree(root: Path) -> list[str]:
    root = Path(root).resolve()
    findings: list[str] = []
    if not root.exists():
        return [f"scan root does not exist: {root}"]
    for path in _walk_files(root):
        relative_path = path.relative_to(root).as_posix()
        if path.suffix.lower() in PHOTO_EXTENSIONS:
            findings.append(f"local animal-photo file: {relative_path}")
            continue
        if path.suffix.lower() == ".json":
            try:
                _media_references(json.loads(path.read_text(encoding="utf-8")), relative_path, findings)
            except (UnicodeDecodeError, json.JSONDecodeError):
                continue
        if path.suffix.lower() in {".html", ".css", ".svg", ".js", ".mjs", ".ts", ".json"}:
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            if DATA_IMAGE_RE.search(content):
                findings.append(f"embedded animal image reference in {relative_path}")
            if path.suffix.lower() in {".html", ".css", ".svg"}:
                for match in (*LOCAL_IMAGE_ATTRIBUTE_RE.finditer(content), *CSS_IMAGE_RE.finditer(content)):
                    findings.append(f"local photo reference in {relative_path}: {match.group(2)}")
    return sorted(set(findings))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    findings = scan_tree(args.root)
    if findings:
        print("Animal-photo policy check failed:")
        for finding in findings:
            print(f"- {finding}")
        return 1
    print(f"No local animal photos or local photo references found under {args.root.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
