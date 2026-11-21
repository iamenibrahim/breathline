// One-command evidence report: `npm run evidence`.
// Runs, in order: engine tests (vitest), independent validator checks, both tiny-instance oracles,
// the generated tiny-case batch, negative cases, interruption tests, replay/export reconciliation and
// the agreement gate, resource requests and future commitments, seeded variations, stress cases,
// search-time benchmarks, then the production build and the network-disabled browser check.
// Writes EVIDENCE.md, evidence/report.json and src/generated/evidence-summary.json. Exits non-zero
// when any required check fails or did not run. A skipped check is never reported as passed.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import * as S from '../src/checks/suites';
import { buildExport } from '../src/engine/exportRun';
import { compilePlan, initSim, runToEnd } from '../src/engine/simulate';
import { sourceHash } from './common';

const root = process.cwd();
const t0 = Date.now();
const COMMAND = 'npm run evidence';
const buildId = `breathline-1.0.0+src.${sourceHash(root)}`;
mkdirSync('evidence/runs', { recursive: true });
mkdirSync('src/generated', { recursive: true });
const checks: S.Check[] = [];
const log = (m: string) => process.stdout.write(m + '\n');
const stage = (name: string, f: () => S.Check[]) => { const s = Date.now(); const cs = f(); checks.push(...cs); log(`${cs.every((c) => c.status === 'passed') ? '✓' : '✗'} ${name}: ${cs.filter((c) => c.status === 'passed').length}/${cs.length} passed (${Date.now() - s} ms)`); };

// 1 engine tests
{
  const s = Date.now();
  const r = spawnSync('npx', ['vitest', 'run', '--reporter=json', '--outputFile=evidence/vitest.json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  let observed = 'vitest did not produce a report', status: S.Status = 'not run';
  if (existsSync('evidence/vitest.json')) {
    const j = JSON.parse(readFileSync('evidence/vitest.json', 'utf8'));
    observed = `${j.numPassedTests}/${j.numTotalTests} tests passed in ${j.testResults.length} files`;
    status = j.numFailedTests === 0 && j.numTotalTests > 0 && r.status === 0 ? 'passed' : 'failed';
  }
  checks.push({ id: 'engine-tests', name: 'Engine test suite (npm test)', category: 'engine-tests', criteria: ['Technical execution'], required: true, status, expected: 'all tests pass', observed, elapsedMs: Date.now() - s });
  log(`${status === 'passed' ? '✓' : '✗'} engine tests: ${observed}`);
}
stage('reference conditions and edits', S.referenceChecks);
stage('independent validator', S.validatorChecks);
stage('focused checks and tiny-instance oracles', S.focusedChecks);
let batchData: unknown = null;
stage('generated tiny-case batch', () => { const r = S.batchChecks(); batchData = r.batch; return r.checks; });
stage('negative cases', S.negativeChecks);
stage('interruption tests', S.interruptionChecks);
stage('replay and export reconciliation', S.exportChecks);
let agreement: ReturnType<typeof S.agreementChecks> | null = null;
stage('agreement gate', () => { agreement = S.agreementChecks(); return agreement.checks; });
stage('resource requests and future commitments', S.requestChecks);
let seeded: unknown = null;
stage('seeded variations', () => { const r = S.seededChecks(); seeded = r.data; return r.checks; });
let stressTables: unknown = null;
stage('stress cases', () => { const r = S.stressChecks(); stressTables = r.tables; return r.checks; });
stage('search-time benchmarks', S.benchmarks);

// exported reference runs (for `npm run replay`)
const exported: string[] = [];
for (const [name, s, p, truth] of S.referenceRuns()) {
  const ctx = { s, plan: compilePlan(s, p), truth };
  const { state } = initSim(ctx, name.replace(/[^A-Za-z0-9]+/g, '-'));
  runToEnd(ctx, state);
  const file = `evidence/runs/${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/-+$/, '')}.json`;
  writeFileSync(file, JSON.stringify(buildExport(s, p, truth, state, 0), null, 1));
  exported.push(file);
}
const replayCmd = spawnSync('npx', ['tsx', 'scripts/replay.ts', 'evidence/runs/A-response.json', 'evidence/runs/D1-policy-blocked.json', 'evidence/runs/E-response.json'], { encoding: 'utf8' });
checks.push({ id: 'replay-command', name: 'Documented replay command reconciles exported runs (npm run replay -- <file>)', category: 'replay-export', criteria: ['Technical execution'], required: true, status: replayCmd.status === 0 ? 'passed' : 'failed', expected: 'exit 0, all reconciled', observed: (replayCmd.stdout || replayCmd.stderr).trim().split('\n').slice(-4).join(' | '), elapsedMs: 0 });
log(`${replayCmd.status === 0 ? '✓' : '✗'} replay command`);


const CRITERIA: [S.Criterion, number][] = [['Survival impact and usefulness', 25], ['Technical execution', 25], ['Fit with the Hollow', 20], ['Connected problem-solving', 10], ['Originality and ingenuity', 10], ['Demo and communication', 10]];
function writePanel(note: string) {
  const summary = { passed: checks.filter((c) => c.status === 'passed').length, failed: checks.filter((c) => c.status === 'failed').length, notRun: checks.filter((c) => c.status === 'not run').length, total: checks.length };
  const panel = {
    buildId, generatedAt: new Date().toISOString(), command: COMMAND, summary, note,
    criteria: CRITERIA.map(([c, w]) => ({ criterion: c, weight: w, checks: checks.filter((x) => x.criteria.includes(c)).map((x) => ({ id: x.id, name: x.name, status: x.status, observed: x.observed.slice(0, 300), expected: x.expected })) })),
  };
  writeFileSync('src/generated/evidence-summary.json', JSON.stringify(panel, null, 1));
  return panel;
}

writePanel('engine checks recorded; build and browser checks run after this build');
// production build + network-disabled browser check
{
  const s = Date.now();
  const b = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
  checks.push({ id: 'build', name: 'Production build (tsc + vite single-file)', category: 'build', criteria: ['Technical execution'], required: true, status: b.status === 0 ? 'passed' : 'failed', expected: 'build succeeds', observed: b.status === 0 ? `dist/index.html ${existsSync('dist/index.html') ? (readFileSync('dist/index.html').length / 1024).toFixed(0) + ' KiB' : 'missing'}` : (b.stdout + b.stderr).slice(-600), elapsedMs: Date.now() - s });
  log(`${b.status === 0 ? '✓' : '✗'} production build`);
  if (process.env.EVIDENCE_SKIP_BROWSER) {
    checks.push({ id: 'offline-browser', name: 'Network-disabled browser run (reload, checkpoint restore, full workflow)', category: 'offline', criteria: ['Technical execution', 'Fit with the Hollow'], required: true, status: 'not run', expected: 'workflow completes offline', observed: 'skipped by EVIDENCE_SKIP_BROWSER', elapsedMs: 0 });
  } else if (b.status === 0) {
    const s2 = Date.now();
    const o = spawnSync('npx', ['tsx', 'scripts/offline-check.ts', '--json'], { encoding: 'utf8', timeout: 240000 });
    let res: { status: S.Status; observed: string; steps?: string[] } = { status: 'not run', observed: (o.stderr || o.stdout || 'no output').slice(-500) };
    try { res = JSON.parse(o.stdout.trim().split('\n').pop()!); } catch { /* keep not run */ }
    checks.push({ id: 'offline-browser', name: 'Network-disabled browser run (reload, checkpoint restore, full workflow, map scene)', category: 'offline', criteria: ['Technical execution', 'Fit with the Hollow', 'Demo and communication'], required: true, status: res.status, expected: 'no network requests; A forecast then simulation result vs baseline; map scene controls (time bar, selection card, zoom/pan/reset, layer toggle); reload restores paused; edit during a run explains a new run; stale plan blocked; missing confirmation blocks approval; D both outcomes and both hidden states; E protection separate from arrivals; mobile order', observed: res.observed, detail: res.steps?.join(' | '), elapsedMs: Date.now() - s2 });
    log(`${res.status === 'passed' ? '✓' : '✗'} network-disabled browser check: ${res.observed.slice(0, 160)}`);
  }
}

const panel = writePanel('final');
{ const rb = spawnSync('npx', ['vite', 'build'], { encoding: 'utf8' }); log(`${rb.status === 0 ? '\u2713' : '\u2717'} rebuilt dist/index.html with the final evidence summary embedded`); }
const summary = { passed: checks.filter((c) => c.status === 'passed').length, failed: checks.filter((c) => c.status === 'failed').length, notRun: checks.filter((c) => c.status === 'not run').length, total: checks.length };
const requiredBad = checks.filter((c) => c.required && c.status !== 'passed');
const exitStatus = requiredBad.length ? 1 : 0;
const env = { node: process.version, platform: `${platform()} ${release()}`, cpu: cpus()[0]?.model ?? 'unknown', cores: cpus().length };
const report = { command: COMMAND, buildId, generatedAt: new Date().toISOString(), elapsedMs: Date.now() - t0, env, summary, exitStatus, checks, agreement: agreement ? { boundaries: (agreement as any).boundaries, violations: (agreement as any).violations, runs: (agreement as any).results } : null, batch: batchData, seeded, stress: stressTables, exportedRuns: exported };
writeFileSync('evidence/report.json', JSON.stringify(report, (k, v) => (k === 'scenario' ? undefined : v), 1));
writeFileSync('evidence/batch.json', JSON.stringify(batchData, null, 1));



// EVIDENCE.md
const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const md: string[] = [];
md.push('# Breathline — Evidence report', '', '**Simulation — illustrative conditions and assumptions.** Everything below is an observed output of the recorded command on the machine named; expectations come from the build brief and are listed separately from observations. Nothing here is a judging score.', '');
md.push(`- Command: \`${COMMAND}\` (exit status **${exitStatus}**)`, `- Build identifier: \`${buildId}\``, `- Generated: ${report.generatedAt} · total ${(report.elapsedMs / 1000).toFixed(1)} s`, `- Machine: ${env.cpu} ×${env.cores}, ${env.platform}, Node ${env.node}`, `- Result: **${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run** (of ${summary.total} checks)`, '');
md.push('## Rubric criteria → recorded checks', '', '| Criterion | Weight | Checks (status) |', '|---|---:|---|');
for (const c of panel.criteria) md.push(`| ${c.criterion} | ${CRITERIA.find((x) => x[0] === c.criterion)![1]} | ${c.checks.map((x) => `${x.id} (${x.status})`).join(', ')} |`);
md.push('', 'Weights are the proposed rubric’s; the table maps evidence to criteria and awards nothing.', '');
const cats = [...new Set(checks.map((c) => c.category))];
for (const cat of cats) {
  md.push(`## ${cat}`, '', '| ID | Check | Expected | Observed | Status | Validator / search | Input hash | ms |', '|---|---|---|---|---|---|---|---:|');
  for (const c of checks.filter((x) => x.category === cat)) md.push(`| ${c.id} | ${esc(c.name)} | ${esc(c.expected)} | ${esc(c.observed)} | **${c.status}** | ${esc([c.validator, c.searchStatus].filter(Boolean).join('; ') || '—')} | ${c.inputHash ?? '—'} | ${c.elapsedMs} |`);
  const lims = checks.filter((x) => x.category === cat && x.limitations).map((x) => `- ${x.id}: ${x.limitations}`);
  if (lims.length) md.push('', 'Limitations:', ...lims);
  md.push('');
}
const ag = agreement as any;
if (ag) {
  md.push('## Agreement gate detail', '', `Boundaries checked by the live invariant checker across agreement runs: **${ag.boundaries}**; violations: **${ag.violations}**.`, '', '| Run | Forecast | Validator | Live (invariants) | Replay | Checkpoints | Result |', '|---|---|---|---|---|---|---|');
  for (const r of ag.results) md.push(`| ${r.run} | ${r.views.forecast ? 'agree' : 'DIFF'} | ${r.views.validator ? 'agree' : 'DIFF'} | ${r.views.live ? 'ok' : 'FAIL'} | ${r.views.replay ? 'agree' : 'DIFF'} | ${r.views.checkpoints ? 'agree' : 'DIFF'} | ${r.passed ? 'passed' : 'failed: ' + esc(r.diffs.join('; '))} |`);
  md.push('');
}
const bd = batchData as any;
if (bd) {
  md.push('## Generated tiny-case batch', '', `Seed **${bd.seed}** (reproduce: \`npm run batch -- ${bd.seed}\`). Bounds: ${Object.entries(bd.bounds).map(([k, v]) => `${k} ${v}`).join('; ')}.`, '', `Cases: ${bd.rows.length}; inspection-helps: **${bd.helps}**; inspection-wastes-time: **${bd.wastes}**; agreement: ${bd.rows.filter((r: any) => r.agree).length}/${bd.rows.length}.`, '', '| Seed | Kind | Inspection | Production objective | Oracle objective | Agree | Valid | Prod ms | Oracle ms |', '|---|---|---|---|---|---|---|---:|---:|');
  for (const r of bd.rows) md.push(`| ${r.seed} | ${r.kind} | ${r.inspectionClass ?? '—'} | \`${JSON.stringify(r.production)}\` | \`${JSON.stringify(r.oracle)}\` | ${r.agree ? 'yes' : '**NO**'} | ${r.valid ? 'yes' : '**NO**'} | ${r.productionMs} | ${r.oracleMs} |`);
  md.push('', 'Agreement establishes correctness for these generated instances, not for every possible neighborhood.', '');
}
const sd = seeded as any;
if (sd) {
  md.push('## Seeded variations', '', `Seed ${sd.seed}.`, '', '| # | Base | Change | Assigned | Baseline | Valid | Search | ms | Optimality |', '|---|---|---|---:|---:|---|---|---:|---|');
  for (const r of sd.rows) md.push(`| ${r.i} | ${r.base} | ${r.change} | ${r.served} | ${r.baseline} | ${r.valid ? 'yes' : 'NO'} | ${r.status} | ${r.elapsedMs} | ${r.optimality} |`);
  md.push('');
}
const st = stressTables as any;
if (st) {
  md.push('## Stress (selected plan, propagated, revalidated)', '', 'Modeled route feasibility for the eight declared variants; not simulated arrivals, not a failure probability.', '');
  for (const id of ['A', 'B', 'C']) {
    md.push(`### ${id}`, '', '| Variant | Feasible groups | Residents | Failed constraints |', '|---|---|---:|---|');
    for (const r of st[id]) md.push(`| ${r.variant} | ${r.feasible || '—'} | ${r.residents} | ${esc(r.failed.join('; ') || '—')} |`);
    md.push('');
  }
  md.push(`Recompute under ${st.recompute.variant} for B: ${st.recompute.served} residents (${st.recompute.tasks.join(' > ')}), ${st.recompute.status}.`, '', `D policies executed: ${st.D.join('; ')}.`, '');
}
md.push(readFileSync('docs/EVIDENCE-manual.md', 'utf8'));
writeFileSync('EVIDENCE.md', md.join('\n'));
log(`\n${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run — exit ${exitStatus}. Wrote EVIDENCE.md, evidence/report.json (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
if (requiredBad.length) log('Required checks not passed: ' + requiredBad.map((c) => `${c.id} (${c.status})`).join(', '));
process.exit(exitStatus);
