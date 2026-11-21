import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hashString } from '../src/engine/common';

export function sourceHash(root: string): string {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d).sort()) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== 'generated') walk(p); } else if (/\.(ts|tsx|css)$/.test(f)) files.push(p); } };
  walk(join(root, 'src'));
  let acc = readFileSync(join(root, 'package.json'), 'utf8');
  for (const f of files) acc += f + readFileSync(f, 'utf8');
  return hashString(acc);
}
