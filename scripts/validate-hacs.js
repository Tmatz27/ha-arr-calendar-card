import { readFileSync, existsSync } from 'node:fs';
const hacs = JSON.parse(readFileSync('hacs.json', 'utf8'));
for (const key of ['name', 'filename', 'content_in_root']) {
  if (!(key in hacs)) throw new Error(`hacs.json missing ${key}`);
}
if (!existsSync(hacs.filename)) throw new Error(`Configured filename ${hacs.filename} does not exist`);
for (const file of ['README.md', 'LICENSE']) {
  if (!existsSync(file)) throw new Error(`${file} is required`);
}
console.log('HACS metadata validated');
