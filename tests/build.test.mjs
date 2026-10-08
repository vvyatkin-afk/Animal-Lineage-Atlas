import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after, before } from 'node:test';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = path.join(repoRoot, 'tools', 'build_atlases.py');
const appPaths = ['atlas', 'atlas.red-panda', 'atlas.polar-bear', 'atlas.hippopotamus'];
let outputRoot;

before(async () => {
  outputRoot = await mkdtemp(path.join(os.tmpdir(), 'animal-lineage-build-'));
  const result = spawnSync('python3', [buildScript, '--out', outputRoot], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

after(async () => {
  if (outputRoot) await rm(outputRoot, { recursive: true, force: true });
});

test('all four independent static paths are emitted', async () => {
  assert.deepEqual((await readdir(outputRoot)).sort(), [...appPaths].sort());
  for (const appPath of appPaths) {
    const appDir = path.join(outputRoot, appPath);
    for (const file of ['index.html', 'styles.css', 'main.js']) {
      assert.ok((await stat(path.join(appDir, file))).isFile(), `${appPath}/${file} exists`);
    }
  }
  for (const appPath of appPaths.slice(1)) {
    assert.ok((await stat(path.join(outputRoot, appPath, 'runtime.json'))).isFile());
    const mediaManifest = JSON.parse(await readFile(path.join(outputRoot, appPath, 'local-media-manifest.json'), 'utf8'));
    assert.equal(mediaManifest.format, 'animal-lineage-atlas-local-media-manifest-v1');
    assert.deepEqual(mediaManifest.items, []);
  }
  assert.ok((await stat(path.join(outputRoot, 'atlas', 'catalog.json'))).isFile());
});

test('runtime payloads remain within the configured transfer budget', async () => {
  for (const appPath of appPaths.slice(1)) {
    const species = appPath.replace('atlas.', '');
    const canonical = JSON.parse(await readFile(path.join(repoRoot, 'atlases', species, 'atlas.json'), 'utf8'));
    const runtimePath = path.join(outputRoot, appPath, 'runtime.json');
    const bytes = (await stat(runtimePath)).size;
    assert.ok(bytes < Buffer.byteLength(JSON.stringify(canonical)), `${appPath} runtime index should be smaller than its canonical document`);
  }
});

test('runtime uses a compact searchable graph index and separate lazy profile chunks', async () => {
  const atlasDir = path.join(outputRoot, 'atlas.red-panda');
  const runtime = JSON.parse(await readFile(path.join(atlasDir, 'runtime.json'), 'utf8'));
  assert.equal(runtime.format, 'animal-lineage-atlas-runtime-index-v1');
  const canonical = JSON.parse(await readFile(path.join(repoRoot, 'atlases', 'red-panda', 'atlas.json'), 'utf8'));
  assert.equal(runtime.animals.length, canonical.animals.length);
  assert.ok(runtime.relationships.length > 0);
  assert.equal(runtime.relationships.length, canonical.relationships.length);
  for (const field of ['events', 'claims', 'media', 'sources', 'institutions']) {
    assert.equal(Object.hasOwn(runtime, field), false, `${field} should load with profile details`);
  }
  assert.ok(runtime.animals.every((animal) => typeof animal.detail_chunk === 'string'));

  const chunkNames = [...new Set(runtime.animals.map((animal) => animal.detail_chunk))];
  assert.equal(chunkNames.length, Math.ceil(canonical.animals.length / 128));
  const chunks = await Promise.all(chunkNames.map(async (chunkName) => JSON.parse(
    await readFile(path.join(atlasDir, chunkName), 'utf8'),
  )));
  const detailAnimals = chunks.flatMap((chunk) => chunk.animals);
  assert.deepEqual(
    detailAnimals.map((animal) => animal.id).sort(),
    canonical.animals.map((animal) => animal.id).sort(),
  );
  const futaChunk = chunks.find((chunk) => chunk.animals.some((animal) => animal.id === 'red-panda:futa'));
  assert.ok(futaChunk, 'the Futa profile chunk is emitted');
  assert.deepEqual(futaChunk.animals.find((animal) => animal.id === 'red-panda:futa'), canonical.animals.find((animal) => animal.id === 'red-panda:futa'));
  assert.ok(futaChunk.sources.length > 0, 'profile sources are emitted lazily with detail chunks');
  assert.ok(futaChunk.events.length > 0, 'profile events are emitted lazily with detail chunks');
  assert.ok(chunks.every((chunk) => chunk.animals.length <= 128), 'profile chunk size remains bounded');
});

test('runtime indexes and lazy detail chunks are byte-for-byte reproducible', async () => {
  const otherRoot = await mkdtemp(path.join(os.tmpdir(), 'animal-lineage-reproducible-'));
  try {
    const result = spawnSync('python3', [buildScript, '--out', otherRoot], { cwd: repoRoot, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    for (const appPath of appPaths.slice(1)) {
      const left = path.join(outputRoot, appPath);
      const right = path.join(otherRoot, appPath);
      const relativeFiles = async (root) => (await readdir(root, { recursive: true }))
        .filter((name) => name === 'runtime.json' || name.startsWith('details/'))
        .sort();
      const leftFiles = await relativeFiles(left);
      const rightFiles = await relativeFiles(right);
      assert.deepEqual(leftFiles, rightFiles);
      for (const file of leftFiles) {
        assert.deepEqual(await readFile(path.join(left, file)), await readFile(path.join(right, file)), `${appPath}/${file}`);
      }
    }
  } finally {
    await rm(otherRoot, { recursive: true, force: true });
  }
});

test('build resolves project inputs independently of the current directory', async () => {
  const elsewhere = await mkdtemp(path.join(os.tmpdir(), 'animal-lineage-cwd-'));
  const separateOutput = path.join(elsewhere, 'public');
  try {
    const result = spawnSync('python3', [buildScript, '--out', separateOutput], { cwd: elsewhere, encoding: 'utf8' });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.ok((await stat(path.join(separateOutput, 'atlas.red-panda', 'runtime.json'))).isFile());
  } finally {
    await rm(elsewhere, { recursive: true, force: true });
  }
});

test('build refuses a symlink output root without writing through it', async () => {
  const elsewhere = await mkdtemp(path.join(os.tmpdir(), 'animal-lineage-symlink-'));
  const target = path.join(elsewhere, 'target');
  const linkedOutput = path.join(elsewhere, 'output');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(target));
  await writeFile(path.join(target, 'sentinel.txt'), 'keep');
  await symlink(target, linkedOutput);
  try {
    const result = spawnSync('python3', [buildScript, '--out', linkedOutput], { cwd: repoRoot, encoding: 'utf8' });
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual((await readdir(target)).sort(), ['sentinel.txt']);
  } finally {
    await rm(elsewhere, { recursive: true, force: true });
  }
});

test('built templates declare each child base path and atlas identity', async () => {
  const paths = ['red-panda', 'polar-bear', 'hippopotamus'];
  const expected = ['/atlas.red-panda/', '/atlas.polar-bear/', '/atlas.hippopotamus/'];
  for (let index = 0; index < paths.length; index += 1) {
    const html = await readFile(path.join(outputRoot, `atlas.${paths[index]}`, 'index.html'), 'utf8');
    assert.match(html, new RegExp(`data-atlas="${paths[index]}"`));
    assert.match(html, new RegExp(`data-base-path="${expected[index].replaceAll('/', '\\/')}"`));
  }
});
