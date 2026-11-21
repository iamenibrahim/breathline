// JSON export that supports reproducing a reported run, and its reconciliation.
import type { AnyPlan, Scenario, Truth } from './types';
import { compilePlan, initSim, runToEnd, type SimState } from './simulate';
import { reconcileFinal, replayEvents } from './replay';
import { compareTimelines } from './timeline';
import { inputHash } from './common';
import { protectedMinutes, baseWorld, withEffects } from './world';

export const BUILD_ID = 'breathline-1.0.0';

export const ASSUMPTIONS = [
  'Simulation — illustrative conditions and assumptions. Hazard indices are fictional planning units.',
  'A shelter arrival demonstrates evacuation within this model only; it is not a medical outcome, permanent housing or long-term safety.',
  'Fan 3 slows hazard growth in one transit corridor (J3); it does not restore ventilation in occupied homes.',
  'Temporary local ventilation keeps one waiting location below the threshold until the horizon; it is not an evacuation and says nothing about safety after minute 20.',
  'Passage states, travel durations and action effects are as declared; inspection accuracy is assumed in the two-state case.',
  'Instruction availability is a declared delay; it does not demonstrate message delivery. Radio coverage, power, accurate reports and compliance remain operational dependencies.',
  'Restrictions are modeled as physical access constraints; the app cannot override Directorate authority.',
];

export interface RunExport {
  format: 'breathline-run/1';
  buildId: string;
  runId: string;
  label: string;
  inputRevision: number;
  inputHash: string;
  initialSnapshot: Scenario;
  knowledge: Scenario['knowledge'];
  truth: Truth; // reproduction data only; never planner input
  reports: Scenario['reports'];
  confirmedDeliveries: Scenario['deliveries'];
  deliveryEvents: unknown[];
  shelterConfirmations: { shelter: string; places: number; placesConfirmed: boolean; checklist: unknown }[];
  assumptions: string[];
  search: unknown;
  plan: AnyPlan;
  objective: unknown;
  reservations: unknown;
  ledger: unknown;
  fallbackProtection: { actions: unknown[]; protectedMinutesByGroup: Record<string, number> };
  observationHistory: unknown[];
  activatedBranch: string | null;
  eventHistory: SimState['events'];
  processedThrough: number;
  observed: { arrived: number; arrivedGroups: string[]; consumed: number; perGroup: Record<string, unknown>; paused: string | null; invariantChecks: number; violations: number };
  resourceRequests?: unknown;
  stress?: unknown;
}

export function buildExport(s: Scenario, plan: AnyPlan, truth: Truth, st: SimState, revision: number, extra: { resourceRequests?: unknown; stress?: unknown } = {}): RunExport {
  const compiled = compilePlan(s, plan);
  const effects = st.events.filter((e) => e.action === 'protection-applied' || e.action === 'hazard-growth-changed');
  const w = withEffects(baseWorld(s), effects.map((e) => ({ actionId: String((e.payload as any).actionId), at: e.t, effect: { type: 'setRate', location: (e.payload as any).location, rate: (e.payload as any).rate } })) as never);
  const prot: Record<string, number> = {};
  for (const g of s.groups) if (st.groups[g.id].status !== 'arrived') prot[g.id] = protectedMinutes(w, g.location);
  return {
    format: 'breathline-run/1', buildId: BUILD_ID, runId: st.runId, label: st.label, inputRevision: revision, inputHash: inputHash(s),
    initialSnapshot: s, knowledge: s.knowledge, truth, reports: s.reports,
    confirmedDeliveries: s.deliveries.filter((d) => d.confirmed), deliveryEvents: st.events.filter((e) => e.action === 'delivery-arrived'),
    shelterConfirmations: s.shelters.map((x) => ({ shelter: x.location, places: x.places, placesConfirmed: x.placesConfirmed, checklist: x.checklist })),
    assumptions: ASSUMPTIONS, search: plan.search, plan, objective: plan.kind === 'schedule' ? plan.schedule.objective : plan.objective,
    reservations: { batteries: compiled.batteries, admissions: compiled.admissions },
    ledger: st.ledger,
    fallbackProtection: { actions: s.actions.filter((a) => a.kind === 'ventilate' && a.offered), protectedMinutesByGroup: prot },
    observationHistory: st.knowledge.observations, activatedBranch: st.activeBranch,
    eventHistory: st.events, processedThrough: st.processedThrough,
    observed: {
      arrived: s.groups.filter((g) => st.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0),
      arrivedGroups: s.groups.filter((g) => st.groups[g.id].status === 'arrived').map((g) => g.id),
      consumed: Object.values(st.ledger.locs).reduce((n, q) => n + q.consumed, 0),
      perGroup: Object.fromEntries(s.groups.map((g) => [g.id, { status: st.groups[g.id].status, arrivedAt: st.groups[g.id].arrivedAt, exposure: st.groups[g.id].exposure, protectedMinutes: st.groups[g.id].protected, unsafe: st.groups[g.id].unsafe }])),
      paused: st.pause?.reason ?? null, invariantChecks: st.invariantChecks, violations: st.violations.length,
    },
    ...extra,
  };
}

/** Re-execute the exported run from its initial snapshot and replay its event history independently. */
export function reproduceExport(x: RunExport) {
  const checks: { name: string; ok: boolean; detail: string }[] = [];
  const s = x.initialSnapshot;
  checks.push({ name: 'input hash', ok: inputHash(s) === x.inputHash, detail: `${inputHash(s)} vs ${x.inputHash}` });
  const ctx = { s, plan: compilePlan(s, x.plan), truth: x.truth };
  const { state } = initSim(ctx, x.runId, x.label);
  runToEnd(ctx, state);
  const sameEvents = JSON.stringify(state.events) === JSON.stringify(x.eventHistory);
  checks.push({ name: 're-executed event history', ok: sameEvents, detail: `${state.events.length} events vs ${x.eventHistory.length}` });
  const arrived = s.groups.filter((g) => state.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0);
  checks.push({ name: 're-executed arrivals', ok: arrived === x.observed.arrived, detail: `${arrived} vs ${x.observed.arrived}` });
  const rec = reconcileFinal(s, x.eventHistory);
  checks.push({ name: 'event-history arrivals reconcile with saved result', ok: rec.arrived === x.observed.arrived && JSON.stringify(rec.arrivals) === JSON.stringify(x.observed.arrivedGroups.slice().sort()), detail: `${rec.arrived} (${rec.arrivals.join(',')}) vs ${x.observed.arrived}` });
  checks.push({ name: 'event-history consumption reconciles', ok: rec.consumed === x.observed.consumed, detail: `${rec.consumed} vs ${x.observed.consumed}` });
  const replay = replayEvents(s, x.eventHistory, x.processedThrough);
  const cmp = compareTimelines(replay, state.snapshots);
  checks.push({ name: 'independent replay matches re-execution boundary by boundary', ok: cmp.equal, detail: cmp.firstDiff ?? `${replay.length} boundaries` });
  return { ok: checks.every((c) => c.ok), checks, arrived, branch: rec.branch, observations: rec.observations };
}
