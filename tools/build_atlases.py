#!/usr/bin/env python3
"""Build four independent static Atlas paths from canonical source files."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
try:
    from .check_no_animal_photos import scan_tree
except ImportError:  # Direct script execution places tools/ on sys.path.
    from check_no_animal_photos import scan_tree


CHILD_PATHS = {
    "red-panda": "/atlas.red-panda/",
    "polar-bear": "/atlas.polar-bear/",
    "hippopotamus": "/atlas.hippopotamus/",
}
OUTPUT_NAMES = ("atlas", "atlas.red-panda", "atlas.polar-bear", "atlas.hippopotamus")


def _remove_recreatable_target(path: Path) -> None:
    if path.is_symlink():
        raise RuntimeError(f"Refusing to replace build output symlink: {path}")
    if path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


def _compact_json(source_path: Path, destination_path: Path) -> None:
    document = json.loads(source_path.read_text(encoding="utf-8"))
    destination_path.write_text(
        json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def build_atlases(output_root: Path) -> list[Path]:
    output_root = Path(output_root).expanduser()
    if output_root.is_symlink():
        raise RuntimeError(f"Refusing to use symlink build root: {output_root}")
    output_root = output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    for name in OUTPUT_NAMES:
        _remove_recreatable_target(output_root / name)

    esbuild_config = REPO_ROOT / "esbuild.config.mjs"
    if not esbuild_config.exists() or not (REPO_ROOT / "node_modules" / "esbuild").exists():
        raise RuntimeError("Dependencies are not installed; run npm ci first.")
    built_paths: list[Path] = []

    hub_dir = output_root / "atlas"
    hub_dir.mkdir()
    shutil.copy2(REPO_ROOT / "apps" / "hub" / "index.html", hub_dir / "index.html")
    shutil.copy2(REPO_ROOT / "apps" / "hub" / "styles.css", hub_dir / "styles.css")
    subprocess.run(
        ["node", str(esbuild_config), str(REPO_ROOT / "apps" / "hub" / "main.ts"), str(hub_dir / "main.js")],
        cwd=REPO_ROOT,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    subprocess.run(
        ["node", "--import", "tsx", str(REPO_ROOT / "tools" / "build_catalog.mjs"), str(hub_dir / "catalog.json")],
        cwd=REPO_ROOT,
        check=True,
    )
    built_paths.append(hub_dir)

    for species, base_path in CHILD_PATHS.items():
        output_dir = output_root / f"atlas.{species}"
        output_dir.mkdir()
        template = (REPO_ROOT / "apps" / "atlas" / "index.html").read_text(encoding="utf-8")
        template = re.sub(r'data-atlas="[^"]+"', f'data-atlas="{species}"', template, count=1)
        template = re.sub(r'data-base-path="[^"]+"', f'data-base-path="{base_path}"', template, count=1)
        (output_dir / "index.html").write_text(template, encoding="utf-8")
        shutil.copy2(REPO_ROOT / "apps" / "atlas" / "styles.css", output_dir / "styles.css")
        subprocess.run(
            ["node", str(esbuild_config), str(REPO_ROOT / "apps" / "atlas" / "main.ts"), str(output_dir / "main.js")],
            cwd=REPO_ROOT,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        _compact_json(REPO_ROOT / "atlases" / species / "atlas.json", output_dir / "runtime.json")
        built_paths.append(output_dir)

    findings = scan_tree(output_root)
    if findings:
        raise RuntimeError("Built release failed the no-photo check:\n" + "\n".join(findings))
    return built_paths


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "dist", help="Output directory (default: repository dist/)")
    args = parser.parse_args()
    try:
        paths = build_atlases(args.out)
    except (OSError, ValueError, subprocess.CalledProcessError, RuntimeError) as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return 1
    for path in paths:
        print(f"Built {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
