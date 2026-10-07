import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const requiredFiles = [
  'README.md',
  'docs/ARCHITECTURE.md',
  'docs/MISSION_AND_SCOPE.md',
  'docs/DATA_MODEL.md',
  'docs/SOURCE_AND_EVIDENCE_POLICY.md',
  'docs/MEDIA_AND_RIGHTS_POLICY.md',
  'docs/OFFLINE_ARCHIVE_FUTURE.md',
  'docs/RED_PANDA_MIGRATION.md',
  'docs/POLAR_BEAR_SOURCES.md',
  'docs/HIPPOPOTAMUS_SOURCES.md',
  'docs/DEPLOYMENT_AND_ROLLBACK.md',
  'docs/RELEASE_V1.md',
  'docs/QA_REPORT.json',
];
const pathTargets = ['/atlas/', '/atlas.red-panda/', '/atlas.polar-bear/', '/atlas.hippopotamus/'];

test('required project and release documentation exists and is substantive', async () => {
  for (const file of requiredFiles) {
    const fileStat = await stat(new URL(file, root));
    assert.ok(fileStat.isFile() && fileStat.size > 80, `${file} should exist and contain useful content`);
  }
});

test('README and release notes list the four exact production paths', async () => {
  const readme = await readFile(new URL('README.md', root), 'utf8');
  const release = await readFile(new URL('docs/RELEASE_V1.md', root), 'utf8');
  for (const path of pathTargets) {
    assert.ok(readme.includes(path), `README should list ${path}`);
    assert.ok(release.includes(path), `release notes should list ${path}`);
  }
});

test('release record and relationship counts match canonical datasets', async () => {
  const release = await readFile(new URL('docs/RELEASE_V1.md', root), 'utf8');
  for (const species of ['red-panda', 'polar-bear', 'hippopotamus']) {
    const atlas = JSON.parse(await readFile(new URL(`atlases/${species}/atlas.json`, root), 'utf8'));
    assert.match(release, new RegExp(`${atlas.animals.length}\\s+animals`, 'i'), `${species} animal count`);
    assert.match(release, new RegExp(`${atlas.relationships.length}\\s+relationships`, 'i'), `${species} relationship count`);
  }
});

test('offline policy names all local manifest fields and deployment rollback protects legacy path', async () => {
  const offline = await readFile(new URL('docs/OFFLINE_ARCHIVE_FUTURE.md', root), 'utf8');
  for (const field of ['original source URL', 'credit', 'rights', 'relative path', 'checksum', 'archive status']) {
    assert.ok(offline.toLowerCase().includes(field.toLowerCase()), `offline policy should explain ${field}`);
  }
  const deployment = await readFile(new URL('docs/DEPLOYMENT_AND_ROLLBACK.md', root), 'utf8');
  assert.match(deployment, /rollback/i);
  assert.match(deployment, /\/red-panda\//);
});
