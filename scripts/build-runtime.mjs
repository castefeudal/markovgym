import { build } from 'esbuild';
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';

const directory = resolve('assets/runtime');
await mkdir(directory, { recursive: true });
// Delete only files produced by this build in the verified output directory.
for (const name of await readdir(directory)) {
  const target = resolve(directory, name);
  if (relative(directory, target).startsWith('..') || target === directory) throw new Error('Unsafe build path');
  if (/\.js$/.test(name)) await unlink(target);
}
const result = await build({
  entryPoints: { application: 'app.js' }, outdir: directory,
  bundle: true, splitting: true, format: 'esm', target: 'es2022',
  minify: true, metafile: true, legalComments: 'eof', charset: 'utf8',
  plugins: [{ name: 'shared-bootstrap', setup(build) {
    // Entry registers bootstrap first. Keep its ES module singleton, including
    // the service worker listeners, outside the application bundle.
    build.onResolve({ filter: /^\.\/bootstrap\.js$/ }, () => ({ path: '../../bootstrap.js', external: true }));
  } }],
});
const files = Object.keys(result.metafile.outputs).map(file => `./${relative(process.cwd(), file).split(sep).join('/')}`).sort();
const template = await readFile(new URL('../src/app/service-worker.js', import.meta.url), 'utf8');
await writeFile(new URL('../sw.js', import.meta.url), template.replace('// GENERATED_RUNTIME_ASSETS', files.map(file => `  '${file}',`).join('\n')));
await writeFile(new URL('../assets/runtime-manifest.json', import.meta.url), JSON.stringify(files, null, 2) + '\n');
console.log(`Runtime built: ${files.length} modules, ${Object.values(result.metafile.outputs).reduce((sum, file) => sum + file.bytes, 0)} bytes`);
