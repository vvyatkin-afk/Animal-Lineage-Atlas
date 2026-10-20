# Deployment and rollback

## Release layout

Production Nginx serves `/var/www/html`. Releases switch only these four paths: `/atlas/`, `/atlas.red-panda/`, `/atlas.polar-bear/`, and `/atlas.hippopotamus/`. The read-only `/red-panda/` application is outside this release and is not modified.

Static files are staged under `/var/www/html/_animal-lineage-releases/<40-character-git-sha>/`. The relay code and full upstream allowlist are staged separately under `/var/lib/animal-lineage-atlas/<git-sha>/media-service`, outside the web root. `/var/lib/animal-lineage-atlas/media-current` selects the active relay release. Public `media-manifest.json` files include browser-direct original and thumbnail URLs only for individually approved records, alongside attribution and license details. The browser cannot submit arbitrary URLs to the relay, which accepts only an opaque media ID and a fixed variant.

The deployer validates all four child builds and runs the no-photo scanner before staging. Release directories are immutable and retained for rollback. Nginx's media include exposes only fixed opaque-ID and variant routes and proxies to the relay on loopback. The Node service runs as `www-data`, binds only `127.0.0.1:4175`, and has no persistent image cache.

## Deployment procedure

1. Confirm the reviewed source commit, green CI, and a successful complete local verification run. Build the four static paths into `dist/` and run the no-photo scanner on the worktree and build output.
2. Check free disk and record the current four public symlink targets. The release manifest records these targets and the media service's previous target and enablement state before activation.
3. Install the unit only if it is absent or already byte-identical. If an existing unit differs, stop and review it rather than overwrite it:

   ```sh
   if sudo -n test -e /etc/systemd/system/animal-atlas-media.service; then
     sudo -n cmp -s deploy/animal-atlas-media.service /etc/systemd/system/animal-atlas-media.service || exit 1
   else
     sudo -n install -o root -g root -m 0644 deploy/animal-atlas-media.service /etc/systemd/system/animal-atlas-media.service
   fi
   sudo -n systemctl daemon-reload
   ```

4. Stage and activate the release. This switches `media-current`, restarts and enables the relay, then atomically switches each of the four public paths. A restart or path-switch failure restores the previous targets:

   ```sh
   sudo -n python3 tools/deploy_release.py \
     --root /var/www/html \
     --media-root /var/lib/animal-lineage-atlas \
     --dist dist \
     --revision <40-character-git-sha>
   ```

5. Install the Nginx route. The manager writes a mode-0700, hash-verified backup under `/var/backups/animal-lineage-atlas/nginx/`, adds one include inside the existing Atlas server block, runs `/usr/sbin/nginx -t`, and reloads Nginx. It refuses unrelated existing snippets or configuration drift:

   ```sh
   sudo -n python3 tools/manage_nginx_relay.py install
   ```

   Save the printed backup directory in the release record. Nginx installation automatically restores the original pair if validation or reload fails.

6. Verify the relay service is active, all four Atlas paths return HTTP 200, and profile/tree images load directly from the approved Wikimedia hosts with same-origin `/media/` fallback URLs. Confirm Chromium decodes the licensed profile image and its attribution, then confirm the active legacy `/red-panda/` hashes still match the pre-release record. Record the deployed SHA, release manifest, Nginx backup directory, service status, and smoke-test evidence in the relevant phase release record.

The explicit `sudo -n` commands are needed because the production web root, systemd unit directory, Nginx configuration, and backup directory are root-owned. No SSH, firewall, DNS, or legacy application setting is changed.

## Rollback

Restore the four routes and relay activation state from the release manifest:

```sh
sudo -n python3 tools/rollback_release.py \
  --root /var/www/html \
  --media-root /var/lib/animal-lineage-atlas \
  --manifest /var/www/html/_animal-lineage-releases/<git-sha>/release-manifest.json
```

When the release had no prior relay, rollback stops and disables the service. When a prior relay existed, rollback restores its current target and its prior enablement state. Stale or changed paths cause rollback to stop without overwriting them. Keep both immutable release trees and manifests.

If the Nginx include should also be removed, use the exact backup printed during install. The manager checks that both active files still match the installed hashes before restoring them, then tests and reloads Nginx:

```sh
sudo -n python3 tools/manage_nginx_relay.py rollback --backup /var/backups/animal-lineage-atlas/nginx/<backup-directory>
```

The Nginx rollback restores the complete prior server config and snippet pair. It leaves the read-only `/red-panda/` application untouched. Run the four Atlas HTTP checks and the legacy hash check after rollback.
