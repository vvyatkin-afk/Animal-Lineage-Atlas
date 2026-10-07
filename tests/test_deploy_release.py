import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tools.deploy_release import EXPECTED_PATHS, deploy_release
from tools.release_common import atomic_symlink_swap
from tools.rollback_release import rollback_release


def make_dist(root: Path) -> Path:
    dist = root / "dist"
    for name in EXPECTED_PATHS:
        app = dist / name
        app.mkdir(parents=True)
        (app / "index.html").write_text(f"<main>{name}</main>", encoding="utf-8")
        (app / "main.js").write_text("// bundle", encoding="utf-8")
        (app / "styles.css").write_text("body { color: #123; }", encoding="utf-8")
        if name != "atlas":
            (app / "local-media-manifest.json").write_text(
                json.dumps({"format": "animal-lineage-atlas-local-media-manifest-v1", "items": []}),
                encoding="utf-8",
            )
    return dist


class DeployReleaseTests(unittest.TestCase):
    def test_deploy_uses_an_immutable_revision_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            dist = make_dist(Path(directory))
            release = deploy_release(root, dist, "a" * 40)

            self.assertEqual(release, root / "_animal-lineage-releases" / ("a" * 40))
            self.assertEqual(stat.S_IMODE(release.stat().st_mode), 0o755)
            for name in EXPECTED_PATHS:
                self.assertTrue((root / name).is_symlink())
                self.assertEqual(os.readlink(root / name), f"_animal-lineage-releases/{'a' * 40}/{name}")
                self.assertTrue((release / name / "index.html").is_file())

            (dist / "atlas" / "index.html").write_text("different bytes", encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError, "already exists"):
                deploy_release(root, dist, "a" * 40)
            self.assertEqual((release / "atlas" / "index.html").read_text(encoding="utf-8"), "<main>atlas</main>")

    def test_symlink_swap_uses_atomic_replace(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            public_path = root / "atlas"
            os.symlink("old/atlas", public_path)
            with patch("tools.release_common.os.replace", wraps=os.replace) as replace:
                atomic_symlink_swap(root, "atlas", "new/atlas")
            replace.assert_called_once()
            self.assertEqual(os.readlink(public_path), "new/atlas")
            self.assertEqual(sorted(path.name for path in root.iterdir()), ["atlas"])

    def test_rollback_restores_all_previous_path_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            previous_targets = {}
            for name in EXPECTED_PATHS:
                (root / "previous" / name).mkdir(parents=True)
                previous_targets[name] = f"previous/{name}"
                os.symlink(previous_targets[name], root / name)
            dist = make_dist(Path(directory))
            release = deploy_release(root, dist, "b" * 40)

            manifest = release / "release-manifest.json"
            rollback_release(root, manifest)

            for name, target in previous_targets.items():
                self.assertTrue((root / name).is_symlink())
                self.assertEqual(os.readlink(root / name), target)
            saved = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(set(saved["previous_targets"]), set(EXPECTED_PATHS))

    def test_rollback_removes_paths_that_did_not_exist_before_deploy(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            dist = make_dist(Path(directory))
            release = deploy_release(root, dist, "f" * 40)
            rollback_release(root, release / "release-manifest.json")
            self.assertFalse(any((root / name).exists() or (root / name).is_symlink() for name in EXPECTED_PATHS))

    def test_partial_public_switch_restores_prior_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            previous_targets = {}
            for name in EXPECTED_PATHS:
                (root / "previous" / name).mkdir(parents=True)
                previous_targets[name] = f"previous/{name}"
                os.symlink(previous_targets[name], root / name)
            dist = make_dist(Path(directory))
            from tools import deploy_release as deploy_module
            real_swap = deploy_module.atomic_symlink_swap

            def fail_on_second(root_path, name, target):
                if name == "atlas.red-panda":
                    raise OSError("injected switch failure")
                real_swap(root_path, name, target)

            with patch("tools.deploy_release.atomic_symlink_swap", side_effect=fail_on_second):
                with self.assertRaisesRegex(RuntimeError, "earlier paths were restored"):
                    deploy_release(root, dist, "1" * 40)
            for name, target in previous_targets.items():
                self.assertEqual(os.readlink(root / name), target)

    def test_stale_rollback_refuses_to_replace_a_changed_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            dist = make_dist(Path(directory))
            release = deploy_release(root, dist, "2" * 40)
            (root / "atlas").unlink()
            os.symlink("manually-changed/atlas", root / "atlas")
            with self.assertRaisesRegex(RuntimeError, "changed since this release"):
                rollback_release(root, release / "release-manifest.json")
            self.assertEqual(os.readlink(root / "atlas"), "manually-changed/atlas")

    def test_deploy_never_changes_the_legacy_red_panda_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            legacy = root / "red-panda"
            legacy.mkdir()
            marker = legacy / "legacy.html"
            marker.write_text("keep legacy", encoding="utf-8")
            dist = make_dist(Path(directory))

            deploy_release(root, dist, "c" * 40)

            self.assertTrue(legacy.is_dir())
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep legacy")

    def test_deploy_rejects_a_photo_bundle_before_switching_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            dist = make_dist(Path(directory))
            (dist / "atlas.red-panda" / "portrait.png").write_bytes(b"photo bytes")

            with self.assertRaisesRegex(ValueError, "photo"):
                deploy_release(root, dist, "d" * 40)

            self.assertEqual(list(root.iterdir()), [])

    def test_deploy_refuses_an_unexpected_public_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "www"
            root.mkdir()
            unexpected = root / "atlas"
            unexpected.mkdir()
            marker = unexpected / "keep.txt"
            marker.write_text("keep", encoding="utf-8")
            dist = make_dist(Path(directory))

            with self.assertRaisesRegex(RuntimeError, "non-symlink"):
                deploy_release(root, dist, "e" * 40)

            self.assertEqual(marker.read_text(encoding="utf-8"), "keep")


if __name__ == "__main__":
    unittest.main()
