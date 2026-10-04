import { readFile, writeFile } from 'node:fs/promises';

const directory = new URL('../src/views/', import.meta.url);
let body = await readFile(new URL('shell.html', directory), 'utf8');
for (const match of [...body.matchAll(/<!-- view:([a-z0-9-]+) -->/g)]) {
  body = body.replace(match[0], (await readFile(new URL(`${match[1]}.html`, directory), 'utf8')).trim());
}
await writeFile(new URL('../app-body.html', import.meta.url), body);
// Only indentation between tags is removed. Inline spaces, prose, textarea
// content and ARIA labels retain their source representation.
const compact = body.replace(/<!--[^]*?-->/g, '').replace(/>\s*\n\s*</g, '><').trim();
await writeFile(new URL('../ui.html', import.meta.url), compact);
console.log(`ui.html written: ${Buffer.byteLength(compact)} bytes`);
