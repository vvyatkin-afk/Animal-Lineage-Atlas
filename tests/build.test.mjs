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
  }
  assert.ok((await stat(path.join(outputRoot, 'atlas', 'catalog.json'))).isFile());
});

test('runtime payloads remain within the configured transfer budget', async () => {
  for (const appPath of appPaths.slice(1)) {
    const bytes = (await stat(path.join(outputRoot, appPath, 'runtime.json'))).size;
    assert.ok(bytes < 1_000_000, `${appPath} runtime is ${bytes} bytes`);
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
