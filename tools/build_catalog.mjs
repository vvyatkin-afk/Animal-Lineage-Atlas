import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHubCatalog } from '../apps/hub/catalog.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = process.argv[2];
if (!outputPath) throw new Error('Usage: node --import tsx tools/build_catalog.mjs <output-path>');
const speciesIds = ['red-panda', 'polar-bear', 'hippopotamus'];
const inputs = await Promise.all(speciesIds.map(async (id) => ({
  id,
  document: JSON.parse(await readFile(path.join(repoRoot, 'atlases', id, 'atlas.json'), 'utf8')),
})));
const catalog = buildHubCatalog(inputs);
await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await writeFile(path.resolve(outputPath), `${JSON.stringify(catalog)}\n`, 'utf8');
