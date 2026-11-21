// Reproduce the generated tiny-case batch from its seed: `npm run batch -- 20871120`.
import { batchChecks, generatedBatch } from '../src/checks/suites';
const seed = Number(process.argv[2] ?? 20871120);
const b = generatedBatch(seed);
for (const r of b.rows) console.log(`${r.agree && r.valid ? 'ok ' : 'BAD'} ${r.kind.padEnd(9)} seed ${r.seed} ${r.inspectionClass ?? ''} prod=${JSON.stringify(r.production)} oracle=${JSON.stringify(r.oracle)}`);
console.log(`${b.rows.length} cases; inspection-helps ${b.helps}; inspection-wastes-time ${b.wastes}; disagreements ${b.rows.filter((r) => !r.agree).length}`);
void batchChecks;
process.exit(b.rows.every((r) => r.agree && r.valid) ? 0 : 1);
