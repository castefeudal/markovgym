import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function files(directory) {
  const entries = await readdir(new URL(directory, import.meta.url), { withFileTypes: true });
  return (await Promise.all(entries.map(async entry => {
    const path = `${directory}${entry.name}`;
    return entry.isDirectory() ? files(`${path}/`) : /\.(mjs|js)$/.test(entry.name) ? [fileURLToPath(new URL(path, import.meta.url))] : [];
  }))).flat();
}
const paths = ['app.js', 'bootstrap.js', 'gym-tools.js', 'sw.js'].map(path => fileURLToPath(new URL(`../${path}`, import.meta.url)));
for (const directory of ['../src/', '../tools/', '../scripts/']) paths.push(...await files(directory));
for (const path of paths) {
  const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
  if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
}
console.log(`Syntax checked: ${paths.length} modules`);
