import { build } from 'esbuild';

const [entryPoint, outfile] = process.argv.slice(2);
if (!entryPoint || !outfile) {
  throw new Error('Usage: node esbuild.config.mjs <entry-point> <output-file>');
}

await build({
  entryPoints: [entryPoint],
  outfile,
  bundle: true,
  format: 'esm',
  target: 'es2022',
});
