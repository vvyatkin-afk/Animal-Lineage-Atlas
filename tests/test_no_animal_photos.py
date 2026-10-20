import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from tools.check_no_animal_photos import scan_tree


class NoAnimalPhotosTests(unittest.TestCase):
    def test_rejects_animal_photo_extensions(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "portrait.jpg").write_bytes(b"not really a photo")
            (root / "diagram.PNG").write_bytes(b"image bytes")
            findings = scan_tree(root)
            self.assertEqual(len(findings), 2)
            self.assertTrue(any("portrait.jpg" in finding for finding in findings))

    def test_allows_generic_svg_fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "placeholder.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
            self.assertEqual(scan_tree(root), [])

    def test_rejects_local_animal_photo_reference(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "runtime.json").write_text(
                json.dumps({"media": [{"direct_remote_url": "./animal.webp"}]}), encoding="utf-8"
            )
            findings = scan_tree(root)
            self.assertTrue(any("local photo reference" in finding for finding in findings))

    def test_rejects_embedded_image_data_in_script_assets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image_uri = "data" + chr(58) + "image/avif;base64,AAAA"
            (root / "main.js").write_text(f'const image = "{image_uri}";', encoding="utf-8")
            findings = scan_tree(root)
            self.assertTrue(any("embedded animal image" in finding for finding in findings))

    def test_allows_only_screenshot_pngs_listed_with_matching_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            capture_dir = root / "reports" / "phase4" / "baseline"
            capture_dir.mkdir(parents=True)
            screenshot = capture_dir / "baseline.png"
            screenshot.write_bytes(b"QA screenshot bytes")
            manifest = {
                "schema_version": "phase4-baseline-screenshots-v1",
                "screenshots": [{
                    "path": "reports/phase4/baseline/baseline.png",
                    "sha256": hashlib.sha256(screenshot.read_bytes()).hexdigest(),
                }],
            }
            (capture_dir / "screenshot-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            self.assertEqual(scan_tree(root), [])

    def test_allows_phase5_screenshots_only_when_the_phase5_manifest_hash_matches(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            capture_dir = root / "reports" / "phase5" / "baseline"
            capture_dir.mkdir(parents=True)
            screenshot = capture_dir / "bandit.png"
            screenshot.write_bytes(b"Phase 5 QA screenshot bytes")
            manifest = {
                "schema_version": "phase5-baseline-screenshots-v1",
                "screenshots": [{
                    "path": "reports/phase5/baseline/bandit.png",
                    "sha256": hashlib.sha256(screenshot.read_bytes()).hexdigest(),
                }],
            }
            (capture_dir / "screenshot-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            self.assertEqual(scan_tree(root), [])

    def test_rejects_unlisted_tampered_or_out_of_scope_screenshot_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            capture_dir = root / "reports" / "phase4" / "after"
            capture_dir.mkdir(parents=True)
            listed = capture_dir / "listed.png"
            listed.write_bytes(b"original capture")
            unlisted = capture_dir / "unlisted.png"
            unlisted.write_bytes(b"extra image")
            manifest = {
                "schema_version": "phase4-after-screenshots-v1",
                "screenshots": [{"path": "reports/phase4/after/listed.png", "sha256": "0" * 64}],
            }
            (capture_dir / "screenshot-manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            findings = scan_tree(root)
            self.assertEqual(len(findings), 2)
            self.assertTrue(any("listed.png" in finding for finding in findings))
            self.assertTrue(any("unlisted.png" in finding for finding in findings))


if __name__ == "__main__":
    unittest.main()
