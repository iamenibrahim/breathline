// Import or replay an exported run: `npm run replay -- evidence/runs/A-response.json [...]`.
// Re-executes the run from its initial snapshot and independently replays its event history, then
// reconciles final counts with the saved result. Exits non-zero on any mismatch.
import { readFileSync } from 'node:fs';
import { reproduceExport, type RunExport } from '../src/engine/exportRun';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: npm run replay -- <export.json> [...]'); process.exit(2); }
let bad = 0;
for (const f of files) {
  const x = JSON.parse(readFileSync(f, 'utf8')) as RunExport;
  const r = reproduceExport(x);
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} ${f}: ${x.label} — arrived ${r.arrived}/24 (saved ${x.observed.arrived})${r.branch ? `, branch ${r.branch}` : ''}${r.observations.length ? `, observations ${r.observations.join(',')}` : ''}`);
  for (const c of r.checks) if (!c.ok) console.log(`     ${c.name}: ${c.detail}`);
  if (!r.ok) bad++;
}
process.exit(bad ? 1 : 0);
