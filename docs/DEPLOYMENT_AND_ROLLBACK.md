# Deployment and rollback

## Release layout

Production Nginx serves `/var/www/html`. A release is staged under:

```text
/var/www/html/_animal-lineage-releases/<40-character-git-sha>/
```

The release contains `atlas/`, `atlas.red-panda/`, `atlas.polar-bear/`, and `atlas.hippopotamus/`. Each public path is a symlink into the selected immutable release. The existing `/red-panda/` application is outside this layout and is never replaced.

## Deployment procedure

1. Confirm the source is the reviewed GitHub `main` commit and the CI run is green.
2. Build to `dist/`; run the repository and built-release no-photo checks.
3. Run the complete Node, Python, data-validation, browser, and deployment test suites. Check free disk before copying the release.
4. Run `nginx -t` to validate the active configuration. The Atlas deployment does not edit Nginx configuration.
5. Stage with `python3 tools/deploy_release.py --root /var/www/html --dist dist --revision <git-sha>`.
6. Verify each new path and representative direct-profile query, check `/red-panda/`, and record the deployed SHA and manifest path in `docs/RELEASE_V1.md`.

The deployer refuses to replace an unexpected non-symlink target and refuses to touch the legacy path. It writes a manifest containing the old path targets before atomically switching each path. Existing releases are retained.

## Rollback

Use the manifest written in the deployed release:

```sh
python3 tools/rollback_release.py --root /var/www/html --manifest /var/www/html/_animal-lineage-releases/<git-sha>/release-manifest.json
```

Rollback atomically restores the prior four path targets recorded in that manifest and leaves `/red-panda/` untouched. Do not remove the release directories or manifest needed to restore a previous version. Run the HTTP smoke checks again after rollback.

If production permissions prevent the authorized command from completing, stop and report the exact required command and permission; do not use `sudo` or change service configuration without explicit authorization.
