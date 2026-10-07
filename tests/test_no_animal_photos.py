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


if __name__ == "__main__":
    unittest.main()
