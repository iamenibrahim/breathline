// UI session model: a versioned, serialisable local session. Separates initial configuration
// (scenario + revision), proposed plans, committed approval, live execution state and history.
// Pure functions over plain objects; React only renders them.
import type { AnyPlan, PassageState, PlanResult, Scenario, Schedule, Truth } from '../engine/types';
import { defaultTruth, getScenario } from '../engine/scenarios';
import { planConfirmed } from '../engine/planner';
import { planAny } from '../engine/policy';
import { approvePlan, isStale } from '../engine/approval';
import { compilePlan, initSim, processBoundary, restore, resume, checkpoint, type SimState } from '../engine/simulate';
import { computeRequests, type RequestReport } from '../engine/requests';
import { inputHash } from '../engine/common';

export const SESSION_KEY = 'breathline.session.v2';

export interface RunSlot { label: string; plan: AnyPlan; state: SimState }
export interface RunSet { number: number; label: string; main: RunSlot; baseline: RunSlot; comparison: RunSlot | null; startedRevision: number }

export interface Session {
  version: 2;
  scenarioId: string;
  scenario: Scenario;
  revision: number;
  edits: { revision: number; text: string }[];
  plan: AnyPlan | null;
  baseline: PlanResult | null;
  comparison: { label: string; plan: AnyPlan } | null;
  approved: null | { planId: string; revision: number };
  approvalErrors: string[];
  truth: { bypass: string; deliveries: Record<string, number | null> };
  run: RunSet | null;
  runCounter: number;
  requests: Partial<Record<'confirmed' | PassageState, RequestReport>> | null;
  notice: string | null;
  lastRunNote?: string | null;
  observations: { at: string; text: string }[];
}

export function newSession(id = 'A'): Session {
  const scenario = getScenario(id);
  return {
    version: 2, scenarioId: id, scenario, revision: 0, edits: [], plan: null, baseline: null, comparison: null, approved: null, approvalErrors: [],
    truth: { bypass: 'open', deliveries: {} }, run: null, runCounter: 0, requests: null, notice: null, observations: [],
  };
}

export function truthOf(sess: Session): Truth {
  const t = defaultTruth(sess.scenario, sess.truth.bypass);
  for (const [k, v] of Object.entries(sess.truth.deliveries)) t.deliveryActual[k] = v;
  return t;
}

export function isPlanStale(sess: Session) { return !!sess.plan && isStale(sess.scenario, sess.revision, sess.plan); }

/** Edit a real starting constraint: increments the input revision; the current plan becomes stale. */
export function applyEdit(sess: Session, text: string, f: (s: Scenario) => void): Session {
  const scenario: Scenario = JSON.parse(JSON.stringify(sess.scenario));
  f(scenario);
  const revision = sess.revision + 1;
  const startedNew = !!sess.run && (sess.run.main.state.processedThrough >= 0);
  return {
    ...sess, scenario, revision, edits: [...sess.edits, { revision, text }], approved: null, approvalErrors: [],
    run: startedNew ? null : sess.run && null, requests: null,
    notice: startedNew
      ? `Conditions updated (${text}). The simulation that was running has stopped. Find a plan again: approving it starts a new run from the updated starting conditions — Breathline does not replan from where people are now.`
      : sess.plan ? `Conditions updated (${text}). The current plan no longer matches — find a plan again before approving.` : `Conditions updated (${text}).`,
    lastRunNote: startedNew ? `Run ${sess.run!.number} was stopped at minute ${Math.max(0, sess.run!.main.state.processedThrough)} by a change of conditions.` : sess.lastRunNote ?? null,
  };
}

export function compute(sess: Session): Session {
  const s = sess.scenario;
  const plan = planAny(s, { revision: sess.revision });
  const baseline = planConfirmed(s, { kinds: [], escort: false, revision: sess.revision, restriction: 'No interventions' });
  let comparison: Session['comparison'] = null;
  if (s.knowledge.unknown) comparison = { label: 'Best response restricted to confirmed routes', plan: planConfirmed(s, { revision: sess.revision, restriction: 'Confirmed routes only (no inspection)' }) };
  else if (s.actions.some((a) => a.offered && a.kind === 'ventilate')) {
    const kinds = [...new Set(s.actions.filter((a) => a.offered && a.kind !== 'ventilate').map((a) => a.kind))];
    comparison = { label: 'Same response without temporary ventilation', plan: planConfirmed(s, { kinds, revision: sess.revision, restriction: 'Without fallback protection' }) };
  }
  return { ...sess, plan, baseline, comparison, approved: null, approvalErrors: [], requests: null, notice: null };
}

export function computeAllRequests(sess: Session): Session {
  if (!sess.plan) return sess;
  const s = sess.scenario;
  const req: Session['requests'] = {};
  if (sess.plan.kind === 'schedule') req.confirmed = computeRequests(s, sess.plan.schedule);
  else for (const st of ['open', 'blocked'] as PassageState[]) if (sess.plan.branches[st].unresolved.length) req[st] = computeRequests(s, sess.plan.branches[st], { state: st });
  return { ...sess, requests: req };
}

function slot(s: Scenario, label: string, plan: AnyPlan, truth: Truth, runId: string): RunSlot {
  const { state } = initSim({ s, plan: compilePlan(s, plan), truth }, runId, label);
  return { label, plan, state };
}

export function approve(sess: Session): Session {
  if (!sess.plan || !sess.baseline) return sess;
  const r = approvePlan(sess.scenario, sess.revision, sess.plan);
  if (!r.ok) return { ...sess, approvalErrors: r.errors, approved: null };
  if (sess.approved?.planId === sess.plan.id && sess.run) return sess; // repeated approval is a no-op
  const n = sess.runCounter + 1;
  const truth = truthOf(sess);
  const s = sess.scenario;
  const run: RunSet = {
    number: n, label: `Run ${n} (input revision ${sess.revision})`, startedRevision: sess.revision,
    main: slot(s, 'Response', sess.plan, truth, `r${n}-response`),
    baseline: slot(s, 'No intervention', sess.baseline, truth, `r${n}-baseline`),
    comparison: sess.comparison ? slot(s, sess.comparison.label, sess.comparison.plan, truth, `r${n}-comparison`) : null,
  };
  return { ...sess, approved: { planId: sess.plan.id, revision: sess.revision }, approvalErrors: [], run, runCounter: n, notice: null };
}

export function discardApproval(sess: Session): Session {
  if (sess.run && sess.run.main.state.processedThrough >= 0) return { ...sess, notice: 'The simulation has started; use Run again to restart it, or update conditions to start a new run.' };
  return { ...sess, approved: null, run: null, notice: 'Approval withdrawn before the simulation started; its reservations were released.' };
}

export function stepRun(sess: Session): Session {
  if (!sess.run) return sess;
  const s = sess.scenario;
  const truth = truthOf(sess);
  const adv = (x: RunSlot): RunSlot => {
    const st: SimState = JSON.parse(checkpoint(x.state), (_k, v) => (v === '__inf__' ? Infinity : v));
    processBoundary({ s, plan: compilePlan(s, x.plan), truth }, st);
    return { ...x, state: st };
  };
  if (sess.run.main.state.done || sess.run.main.state.paused) return sess;
  const run: RunSet = { ...sess.run, main: adv(sess.run.main), baseline: adv(sess.run.baseline), comparison: sess.run.comparison ? adv(sess.run.comparison) : null };
  let observations = sess.observations;
  if (run.main.state.done) {
    const arrived = s.groups.filter((g) => run.main.state.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0);
    const base = s.groups.filter((g) => run.baseline.state.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0);
    observations = [...observations, { at: new Date().toISOString(), text: `${run.label}, scenario ${s.label}${s.knowledge.unknown ? ` (hidden bypass ${sess.truth.bypass})` : ''}: ${arrived}/24 arrived vs ${base}/24 with no intervention; ${run.main.state.invariantChecks} invariant checks, ${run.main.state.violations.length} violations; input ${inputHash(s)}` }];
  }
  return { ...sess, run, observations };
}

export function resetRun(sess: Session): Session {
  if (!sess.run || !sess.plan || !sess.baseline) return sess;
  return approve({ ...sess, run: null, approved: null });
}

export function resumeRun(sess: Session): Session {
  if (!sess.run) return sess;
  const r = (x: RunSlot): RunSlot => ({ ...x, state: resume(JSON.parse(JSON.stringify(x.state))) });
  return { ...sess, run: { ...sess.run, main: r(sess.run.main), baseline: r(sess.run.baseline), comparison: sess.run.comparison ? r(sess.run.comparison) : null } };
}

// ------------------------------------------------------------------ persistence (versioned, local)
export function saveSession(sess: Session) {
  try {
    const data = { ...sess, run: sess.run ? { ...sess.run, main: { ...sess.run.main, state: checkpoint(sess.run.main.state) }, baseline: { ...sess.run.baseline, state: checkpoint(sess.run.baseline.state) }, comparison: sess.run.comparison ? { ...sess.run.comparison, state: checkpoint(sess.run.comparison.state) } : null } : null };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data, (_k, v) => (v === Infinity ? '__inf__' : v)));
  } catch { /* storage unavailable: session stays in memory */ }
}

/** Restore paused at the last completed boundary; explicit resume required. */
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw, (_k, v) => (v === '__inf__' ? Infinity : v));
    if (d.version !== 2) return null;
    if (d.run) {
      const fix = (x: any) => ({ ...x, state: restore(typeof x.state === 'string' ? x.state : JSON.stringify(x.state)) });
      d.run = { ...d.run, main: fix(d.run.main), baseline: fix(d.run.baseline), comparison: d.run.comparison ? fix(d.run.comparison) : null };
      const st = d.run.main.state as SimState;
      d.notice = st.done ? null : `Restored after reload at minute ${Math.max(0, st.processedThrough)} (the last saved minute). Paused — no time passed while the page was closed. Press Resume to continue.`;
    }
    return d as Session;
  } catch { return null; }
}

export function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } }

export function activeSchedule(sess: Session): Schedule | null {
  if (!sess.plan) return null;
  if (sess.plan.kind === 'schedule') return sess.plan.schedule;
  if (!sess.plan.inspection) return sess.plan.branches.open;
  const br = sess.run?.main.state.activeBranch as PassageState | null;
  return br ? sess.plan.branches[br] : sess.plan.branches.open;
}
