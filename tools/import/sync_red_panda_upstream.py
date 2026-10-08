#!/usr/bin/env python3
"""Fetch and merge the current wwoast/redpanda-lineage JSON export."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from merge_red_panda_upstream import merge_red_panda


ROOT = Path(__file__).resolve().parents[2]
README_EXPORT_URL = "https://wwoast.github.io/redpanda-lineage/export/redpanda.json"
REPOSITORY_API_URL = "https://api.github.com/repos/wwoast/redpanda-lineage"
DEFAULT_CURATED = ROOT / "atlases/red-panda/curated-atlas.json"
DEFAULT_ATLAS = ROOT / "atlases/red-panda/atlas.json"
DEFAULT_REPORT = ROOT / "atlases/red-panda/upstream_sync_report.json"
DEFAULT_SNAPSHOT = ROOT / "atlases/red-panda/upstream_snapshot.json"


def _fetch(url):
    request = Request(url, headers={"User-Agent": "Animal-Lineage-Atlas-red-panda-sync/1.0", "Accept": "application/json"})
    with urlopen(request, timeout=60) as response:
        return response.read(), response.geturl(), dict(response.headers.items())


def _current_snapshot():
    raw, effective_url, headers = _fetch(README_EXPORT_URL)
    retrieved_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    repository_raw, _, _ = _fetch(REPOSITORY_API_URL)
    repository = json.loads(repository_raw)
    branch_name = repository.get("default_branch", "master")
    branch_raw, _, _ = _fetch(f"{REPOSITORY_API_URL}/branches/{branch_name}")
    branch = json.loads(branch_raw)
    commit = branch.get("commit", {})
    commit_sha = commit.get("sha")
    tree_raw, _, _ = _fetch(f"{REPOSITORY_API_URL}/git/trees/{commit_sha}?recursive=1")
    tree = json.loads(tree_raw)
    license_endpoint_url = f"{REPOSITORY_API_URL}/license"
    try:
        license_raw, _, _ = _fetch(license_endpoint_url)
        license_endpoint_status = 200
        license_endpoint_payload = json.loads(license_raw)
    except HTTPError as error:
        license_endpoint_status = error.code
        license_endpoint_payload = None
    license_files = [
        item.get("path")
        for item in tree.get("tree", [])
        if Path(item.get("path", "")).name.upper() in {"LICENSE", "LICENSE.TXT", "LICENSE.MD", "COPYING", "COPYRIGHT"}
    ]
    if repository.get("license"):
        license_check = f"GitHub repository API reports {repository['license'].get('spdx_id') or 'a declared license'}"
    elif tree.get("truncated"):
        license_check = "GitHub repository API returned license=null, but the recursive tree was truncated, so named license files could not be fully ruled out."
    elif license_files:
        license_check = "GitHub repository API returned license=null; the repository tree contains a named license file."
    elif license_endpoint_status == 404:
        license_check = (
            f"GitHub repository metadata returned license=null; the dedicated license endpoint returned HTTP 404; "
            f"the complete recursive tree at commit {commit_sha} contains no LICENSE, COPYING, or COPYRIGHT path. "
            "No explicit license was found during this retrieval."
        )
    elif license_endpoint_status != 200:
        license_check = (
            f"GitHub repository metadata returned license=null; the dedicated license endpoint returned HTTP {license_endpoint_status}; "
            "the license check is incomplete and no legal conclusion is recorded."
        )
    elif license_endpoint_payload:
        license_check = "The dedicated GitHub license endpoint returned a response; its license metadata is recorded for review."
    else:
        license_check = (
            f"GitHub repository metadata returned license=null; the dedicated license endpoint returned HTTP 200; "
            f"the complete recursive tree at commit {commit_sha} contains no LICENSE, COPYING, or COPYRIGHT path. "
            "No explicit license was found during this retrieval."
        )
    metadata = {
        "request_url": README_EXPORT_URL,
        "export_url": effective_url,
        "retrieved_at_utc": retrieved_at,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "last_modified": headers.get("Last-Modified"),
        "etag": headers.get("ETag"),
        "repository_url": "https://github.com/wwoast/redpanda-lineage",
        "repository_commit": commit_sha,
        "repository_commit_date": (commit.get("commit", {}).get("committer") or commit.get("commit", {}).get("author") or {}).get("date"),
        "repository_license": (repository.get("license") or {}).get("spdx_id") if repository.get("license") else None,
        "repository_license_endpoint_url": license_endpoint_url,
        "repository_license_endpoint_status": license_endpoint_status,
        "repository_license_endpoint_result": (license_endpoint_payload or {}).get("spdx_id") if isinstance(license_endpoint_payload, dict) else None,
        "repository_default_branch": branch_name,
        "repository_license_files": license_files,
        "repository_tree_truncated": bool(tree.get("truncated")),
        "repository_tree_commit": commit_sha,
        "license_check": license_check,
        "embedded_commit": json.loads(raw).get("_commit"),
    }
    return raw, metadata


def _write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def run(args):
    curated_path = Path(args.curated)
    curated = json.loads(curated_path.read_text(encoding="utf-8"))
    if args.input_json:
        if not args.snapshot_json:
            raise ValueError("--snapshot-json is required with --input-json so the run remains pinned and auditable")
        raw = Path(args.input_json).read_bytes()
        snapshot = json.loads(Path(args.snapshot_json).read_text(encoding="utf-8"))
        actual_hash = hashlib.sha256(raw).hexdigest()
        if actual_hash != snapshot.get("sha256"):
            raise ValueError(f"input SHA-256 {actual_hash} does not match pinned snapshot {snapshot.get('sha256')}")
        if len(raw) != snapshot.get("bytes"):
            raise ValueError(f"input length {len(raw)} does not match pinned snapshot byte count {snapshot.get('bytes')}")
        upstream = json.loads(raw)
    else:
        raw, snapshot = _current_snapshot()
        upstream = json.loads(raw)

    atlas, report = merge_red_panda(upstream, curated, snapshot)
    _write_json(args.atlas_output, atlas)
    _write_json(args.report_output, report)
    _write_json(args.snapshot_output, snapshot)
    counts = report["counts"]
    print(
        "Merged export: "
        f"{counts['upstream_pandas']} pandas; {counts['merged_overlaps']} curated matches; "
        f"{counts['canonical_animals_out']} canonical animals; "
        f"SHA-256 {snapshot['sha256']}"
    )
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--curated", default=str(DEFAULT_CURATED), help="immutable curated base atlas JSON")
    parser.add_argument("--atlas-output", default=str(DEFAULT_ATLAS), help="canonical merged atlas output")
    parser.add_argument("--report-output", default=str(DEFAULT_REPORT), help="machine-readable audit report output")
    parser.add_argument("--snapshot-output", default=str(DEFAULT_SNAPSHOT), help="pinned retrieval metadata output")
    parser.add_argument("--input-json", help="reuse an already downloaded raw export instead of fetching current data")
    parser.add_argument("--snapshot-json", help="retrieval metadata for --input-json; its hash and size are checked")
    args = parser.parse_args(argv)
    try:
        return run(args)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        parser.error(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
