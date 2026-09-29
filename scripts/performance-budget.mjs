import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const budgets = [
  { file: 'app.js', raw: 600_000, gzip: 180_000 },
  { file: 'app.css', raw: 325_000, gzip: 65_000 },
  { file: 'index.html', raw: 150_000, gzip: 40_000 },
  { file: 'gym-tools.js', raw: 50_000, gzip: 16_000 },
];

let failed = false;
for (const budget of budgets) {
  const bytes = await readFile(new URL(`../${budget.file}`, import.meta.url));
  const raw = bytes.byteLength;
  const compressed = gzipSync(bytes, { level: 9 }).byteLength;
  const withinBudget = raw <= budget.raw && compressed <= budget.gzip;
  console.log(`${withinBudget ? 'PASS' : 'FAIL'} ${budget.file}: ${raw}/${budget.raw} B raw, ${compressed}/${budget.gzip} B gzip`);
  if (!withinBudget) failed = true;
}

if (failed) process.exitCode = 1;
