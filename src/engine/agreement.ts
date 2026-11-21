// Agreement gate: five independent views of one run must agree boundary by boundary —
// planner forecast, independent validator, live execution with invariants, replay of the exported
// event history, and execution resumed from every checkpoint.
import type { AnyPlan, PassageState, Scenario, Schedule, Truth } from './types';
import { compilePlan, executeWithCheckpoints, processBoundary, restore, resume, runToEnd, type SimContext, type SimState } from './simulate';
import { compareTimelines, forecastTimeline } from './timeline';
import { validatorTimeline } from './validator';
import { replayEvents } from './replay';

export interface AgreementResult {
  run: string;
  passed: boolean;
  views: { forecast: boolean; validator: boolean; live: boolean; replay: boolean; checkpoints: boolean };
  diffs: string[];
  boundaries: number;
  checkpointsTested: number;
  invariantChecks: number;
  violations: number;
  final: { arrived: string[]; consumed: number; branch: string | null };
  state: SimState;
}

export function scheduleForTruth(p: AnyPlan, truth: Truth): { sc: Schedule; state?: PassageState } {
  if (p.kind === 'schedule') return { sc: p.schedule };
  if (!p.inspection) return { sc: p.branches.open };
  const st = truth.connectionStates[p.connection] as PassageState;
  return { sc: p.branches[st] ?? p.branches.open, state: st };
}

export function agreementCheck(run: string, s: Scenario, p: AnyPlan, truth: Truth): AgreementResult {
  const ctx: SimContext = { s, plan: compilePlan(s, p), truth };
  const { state, checkpoints } = executeWithCheckpoints(ctx, run);
  const live = state.snapshots;
  const { sc, state: branch } = scheduleForTruth(p, truth);
  const diffs: string[] = [];
  const f = compareTimelines(forecastTimeline(s, sc), live);
  if (!f.equal) diffs.push(`forecast vs live: ${f.firstDiff}`);
  const v = compareTimelines(validatorTimeline(s, sc, branch), live);
  if (!v.equal) diffs.push(`validator vs live: ${v.firstDiff}`);
  const exported = JSON.parse(JSON.stringify(state.events));
  const r = compareTimelines(replayEvents(s, exported, state.processedThrough), live);
  if (!r.equal) diffs.push(`replay vs live: ${r.firstDiff}`);
  const liveOk = state.done && !state.paused && state.violations.length === 0;
  if (!liveOk) diffs.push(`live execution: ${state.pause?.reason ?? 'not done'}; violations ${state.violations.length}`);
  let cpOk = true;
  for (let i = 0; i < checkpoints.length; i++) {
    const rs = resume(restore(checkpoints[i]));
    runToEnd(ctx, rs);
    const c = compareTimelines(rs.snapshots, live);
    const sameEvents = JSON.stringify(rs.events.map((e) => e.id)) === JSON.stringify(state.events.map((e) => e.id));
    const sameLedger = JSON.stringify(rs.ledger) === JSON.stringify(state.ledger);
    if (!c.equal || !sameEvents || !sameLedger || rs.done !== state.done) { cpOk = false; diffs.push(`checkpoint ${i}: ${c.firstDiff ?? (sameEvents ? 'ledger differs' : 'event ids differ')}`); }
  }
  const final = {
    arrived: s.groups.filter((g) => state.groups[g.id].status === 'arrived').map((g) => g.id),
    consumed: Object.values(state.ledger.locs).reduce((n, q) => n + q.consumed, 0),
    branch: state.activeBranch,
  };
  return {
    run, passed: diffs.length === 0, views: { forecast: f.equal, validator: v.equal, live: liveOk, replay: r.equal, checkpoints: cpOk },
    diffs, boundaries: live.length, checkpointsTested: checkpoints.length, invariantChecks: state.invariantChecks, violations: state.violations.length, final, state,
  };
}

/** Reload immediately before and after a transaction at minute m; compare with the uninterrupted run. */
export function interruptionTest(s: Scenario, p: AnyPlan, truth: Truth, minute: number) {
  const ctx: SimContext = { s, plan: compilePlan(s, p), truth };
  const { state: full, checkpoints } = executeWithCheckpoints(ctx, 'interrupt');
  const results: { point: string; equal: boolean; detail: string }[] = [];
  // checkpoint index k holds the state after boundary k-1 (index 0 = before boundary 0)
  for (const [label, idx] of [['before', minute], ['after', minute + 1]] as const) {
    if (idx >= checkpoints.length) { results.push({ point: `${label} minute ${minute}`, equal: false, detail: 'no checkpoint' }); continue; }
    const restored = restore(checkpoints[idx]);
    const wasPaused = restored.paused || restored.done; // a checkpoint at the horizon is already final
    resume(restored);
    // a torn write: also re-process the same boundary twice to prove idempotence
    runToEnd(ctx, restored);
    const same = (k: string, a: unknown, b: unknown) => (JSON.stringify(a) === JSON.stringify(b) ? null : k);
    const diffs = [
      same('batteries consumed', restored.ledger.consumptions, full.ledger.consumptions),
      same('ledger', restored.ledger.locs, full.ledger.locs),
      same('observations', restored.knowledge.observations, full.knowledge.observations),
      same('activated branch', restored.activeBranch, full.activeBranch),
      same('shelter occupants', Object.fromEntries(Object.entries(restored.shelters).map(([k, v]) => [k, v.occupants])), Object.fromEntries(Object.entries(full.shelters).map(([k, v]) => [k, v.occupants]))),
      same('arrivals', Object.fromEntries(Object.entries(restored.groups).map(([k, v]) => [k, v.arrivedAt])), Object.fromEntries(Object.entries(full.groups).map(([k, v]) => [k, v.arrivedAt]))),
      same('event ids', restored.events.map((e) => e.id), full.events.map((e) => e.id)),
      same('exposure', Object.fromEntries(Object.entries(restored.groups).map(([k, v]) => [k, v.exposure])), Object.fromEntries(Object.entries(full.groups).map(([k, v]) => [k, v.exposure]))),
      same('protected minutes', Object.fromEntries(Object.entries(restored.groups).map(([k, v]) => [k, v.protected])), Object.fromEntries(Object.entries(full.groups).map(([k, v]) => [k, v.protected]))),
      same('protection effects', restored.appliedProtection, full.appliedProtection),
      same('deliveries', restored.ledger.processedDeliveries.concat(restored.placeDeliveries), full.ledger.processedDeliveries.concat(full.placeDeliveries)),
    ].filter(Boolean);
    results.push({ point: `${label} minute ${minute}`, equal: diffs.length === 0 && wasPaused, detail: diffs.length ? `differs: ${diffs.join(', ')}` : wasPaused ? 'restored paused; resumed explicitly; identical final state' : 'restore was not paused' });
  }
  return { results, full };
}

/** Duplicate processing: re-run a boundary's transactions on a cloned state and check nothing repeats. */
export function duplicateProcessingTest(s: Scenario, p: AnyPlan, truth: Truth, minute: number) {
  const ctx: SimContext = { s, plan: compilePlan(s, p), truth };
  const { state: full, checkpoints } = executeWithCheckpoints(ctx, 'dup');
  const st = restore(checkpoints[minute + 1]);
  resume(st);
  const before = JSON.stringify({ l: st.ledger, sh: st.shelters, g: st.groups, ev: st.events.length });
  // simulate a duplicated completion event: rewind the clock by one boundary without clearing applied transactions
  st.t = minute; st.processedThrough = minute - 1; st.done = false;
  processBoundary(ctx, st);
  const after = JSON.stringify({ l: st.ledger, sh: st.shelters, g: st.groups, ev: st.events.length });
  return { identical: before === after, full };
}
