import subprocess
import tempfile
import unittest
from pathlib import Path

from tools.manage_nginx_relay import NginxPaths, install_nginx_relay, rollback_nginx_relay


class NginxRelayManagementTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        base = Path(self.temporary.name)
        self.main = base / "etc/nginx/conf.d/atlas.conf"
        self.snippet = base / "etc/nginx/snippets/animal-atlas-media-relay.conf"
        self.backups = base / "backups"
        self.nginx = base / "nginx"
        self.systemctl = base / "systemctl"
        self.paths = NginxPaths(self.main, self.snippet, self.backups, self.nginx, self.systemctl)
        self.main.parent.mkdir(parents=True)
        self.original_main = (
            "server {\n"
            "    location /red-panda/ {\n"
            "        try_files $uri =404;\n"
            "    }\n"
            "    location / {\n"
            "        try_files $uri $uri/ =404;\n"
            "    }\n"
            "}\n"
        ).encode()
        self.main.write_bytes(self.original_main)
        self.snippet_bytes = b"location ~ ^/atlas/media/([a-f0-9]{32})/(thumb|profile)$ { return 404; }\n"

    def runner(self, calls, failure=None):
        def run(command, *, check):
            calls.append(command)
            if failure is not None:
                failure(command)
            return subprocess.CompletedProcess(command, 0)
        return run

    def test_install_backs_up_and_inserts_only_the_atlas_include_then_rolls_back(self):
        calls = []
        backup = install_nginx_relay(paths=self.paths, snippet_content=self.snippet_bytes, run=self.runner(calls))

        self.assertIsNotNone(backup)
        installed_main = self.main.read_bytes()
        self.assertIn(f"    include {self.snippet};\n".encode(), installed_main)
        self.assertIn(b"location /red-panda/ {", installed_main)
        self.assertEqual(self.snippet.read_bytes(), self.snippet_bytes)
        self.assertEqual([command[1:] for command in calls], [["-t"], ["reload", "nginx"]])

        rollback_nginx_relay(backup, paths=self.paths, run=self.runner(calls))
        self.assertEqual(self.main.read_bytes(), self.original_main)
        self.assertFalse(self.snippet.exists())
        self.assertEqual([command[1:] for command in calls[-2:]], [["-t"], ["reload", "nginx"]])

    def test_install_is_idempotent_and_does_not_duplicate_include(self):
        calls = []
        backup = install_nginx_relay(paths=self.paths, snippet_content=self.snippet_bytes, run=self.runner(calls))
        self.assertIsNotNone(backup)
        self.assertIsNone(install_nginx_relay(paths=self.paths, snippet_content=self.snippet_bytes, run=self.runner(calls)))
        self.assertEqual(self.main.read_bytes().count(f"    include {self.snippet};\n".encode()), 1)
        self.assertEqual(len(calls), 4)

    def test_install_refuses_unrelated_existing_snippet_without_changes(self):
        self.snippet.parent.mkdir(parents=True)
        self.snippet.write_text("# unrelated\n", encoding="utf-8")
        original_snippet = self.snippet.read_bytes()
        calls = []
        with self.assertRaisesRegex(RuntimeError, "Refusing to replace"):
            install_nginx_relay(paths=self.paths, snippet_content=self.snippet_bytes, run=self.runner(calls))
        self.assertEqual(self.main.read_bytes(), self.original_main)
        self.assertEqual(self.snippet.read_bytes(), original_snippet)
        self.assertEqual(calls, [])

    def test_failed_nginx_test_restores_the_original_pair(self):
        calls = []

        def fail_first_test(command):
            if len(calls) == 1:
                raise subprocess.CalledProcessError(1, command)

        with self.assertRaisesRegex(RuntimeError, "original configuration was restored"):
            install_nginx_relay(
                paths=self.paths,
                snippet_content=self.snippet_bytes,
                run=self.runner(calls, fail_first_test),
            )
        self.assertEqual(self.main.read_bytes(), self.original_main)
        self.assertFalse(self.snippet.exists())
        self.assertEqual(len(calls), 2)

    def test_rollback_refuses_to_overwrite_configuration_changed_after_install(self):
        backup = install_nginx_relay(paths=self.paths, snippet_content=self.snippet_bytes, run=self.runner([]))
        self.main.write_bytes(self.main.read_bytes() + b"# operator change\n")
        changed_main = self.main.read_bytes()
        calls = []
        with self.assertRaisesRegex(RuntimeError, "Refusing to roll back changed"):
            rollback_nginx_relay(backup, paths=self.paths, run=self.runner(calls))
        self.assertEqual(self.main.read_bytes(), changed_main)
        self.assertEqual(calls, [])

    def test_rollback_validation_failure_restores_the_tested_installed_pair(self):
        backup = install_nginx_relay(paths=self.paths, snippet_content=self.snippet_bytes, run=self.runner([]))
        installed_main = self.main.read_bytes()
        calls = []

        def fail_first_test(command):
            if len(calls) == 1:
                raise subprocess.CalledProcessError(1, command)

        with self.assertRaisesRegex(RuntimeError, "tested installed configuration was restored"):
            rollback_nginx_relay(backup, paths=self.paths, run=self.runner(calls, fail_first_test))
        self.assertEqual(self.main.read_bytes(), installed_main)
        self.assertEqual(self.snippet.read_bytes(), self.snippet_bytes)
        self.assertEqual(len(calls), 3)


if __name__ == "__main__":
    unittest.main()
