import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const budgets = [
  { file: 'app.js', raw: 600_000, gzip: 180_000 },
  { file: 'app.css', raw: 230_000, gzip: 50_000 },
  { directory: 'styles', label: 'modular CSS layers', raw: 95_000, gzip: 24_000 },
  { file: 'index.html', raw: 150_000, gzip: 40_000 },
  { file: 'gym-tools.js', raw: 50_000, gzip: 16_000 },
];

async function listCssFiles(directory) {
  const entries = await readdir(new URL(`../${directory}/`, import.meta.url), { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const child = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return listCssFiles(child);
    return entry.isFile() && entry.name.endsWith('.css') ? [child] : [];
  }));
  return nested.flat();
}

let failed = false;
for (const budget of budgets) {
  const label = budget.label || budget.file;
  const files = budget.directory ? await listCssFiles(budget.directory) : [budget.file];
  const buffers = await Promise.all(files.map((file) => readFile(new URL(`../${file}`, import.meta.url))));
  const bytes = Buffer.concat(buffers);
  const raw = bytes.byteLength;
  const compressed = gzipSync(bytes, { level: 9 }).byteLength;
  const withinBudget = raw <= budget.raw && compressed <= budget.gzip;
  console.log(`${withinBudget ? 'PASS' : 'FAIL'} ${label}: ${raw}/${budget.raw} B raw, ${compressed}/${budget.gzip} B gzip`);
  if (!withinBudget) failed = true;
}

if (failed) process.exitCode = 1;
