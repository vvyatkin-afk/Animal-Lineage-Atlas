# Deployment and rollback

## Release layout

Production Nginx serves `/var/www/html`. This deployment covers the four Atlas routes `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/`. A release is staged under:

```text
/var/www/html/_animal-lineage-releases/<40-character-git-sha>/
```

The release contains `atlas/`, `atlas.red-panda/`, `atlas.polar-bear/`, and `atlas.hippopotamus/`. Each public path is a symlink into the selected immutable release. Each child path includes an empty `local-media-manifest.json`; the public release has no local animal-image assets.

The published release root is mode `0755` so Nginx can traverse it. The deployer keeps its `mkdtemp` staging directory private while copying and validating files, then changes the completed directory to `0755` immediately before the atomic rename.

## Deployment procedure

1. Confirm the source is the reviewed GitHub `main` commit and the CI run is green.
2. Build to `dist/`; run the repository and built-release no-photo checks.
3. Run the complete Node, Python, data-validation, browser, and deployment test suites. Check free disk before copying the release.
4. Run `nginx -t` to validate the active configuration. The Atlas deployment does not edit Nginx configuration.
5. Stage with `sudo -n python3 tools/deploy_release.py --root /var/www/html --dist dist --revision <git-sha>` when the web root is not writable by the workspace account. This release task authorizes that scoped deployment command; it does not alter Nginx configuration.
6. Verify all four Atlas paths and representative direct-profile queries, then record the deployed SHA and manifest path in `docs/RELEASE_V2_EXPANDED_DATASETS.md`.

The deployer refuses to replace an unexpected non-symlink target. It validates the four build directories and no-photo policy, writes a manifest containing the four prior Atlas path targets before atomically switching each path, and retains existing releases.

## Rollback

Use the manifest written in the deployed release:

```sh
sudo -n python3 tools/rollback_release.py --root /var/www/html --manifest /var/www/html/_animal-lineage-releases/<git-sha>/release-manifest.json
```

Rollback atomically restores the prior four Atlas path targets recorded in that manifest. Do not remove the release directories or manifest needed to restore a previous version. Run the HTTP smoke checks again after rollback.

The web root is root-owned on the production host. The user authorized this release deployment, so use the scoped `sudo -n` commands above if required. Do not change service configuration as part of this release.
