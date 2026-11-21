// Deterministic execution. One clock; integer boundaries processed in five steps:
//  1 complete work / apply effects / reveal inspections / activate branch / consume reserved
//    batteries once; then process expected deliveries scheduled (actually arriving) this minute
//  2 arrivals and shelter admissions
//  3 validate occupancy and prerequisites (invariant checker, separate module)
//  4 start scheduled work (batteries reserved AND on hand), waits and departures
//  5 integrate exposure for [t, t+1) and advance time
// Every transaction has a stable id and is applied at most once, so duplicate processing and
// checkpoint resumption never duplicate consumption, deliveries, effects, admissions or arrivals.
import type { AnyPlan, CrewActivity, GroupId, Journey, Leg, LocId, PassageState, Scenario, Truth } from './types';
import {
  activateBranch, canStartWork, consumeForTask, initLiveLedger, placeProfile, processDelivery, reserveForApproval,
  type BatteryReservation, type LiveLedger,
} from './ledger';
import { hazardAt, effectiveRate, round6 } from './world';
import { activityLabel, type BoundarySnapshot } from './timeline';
import { checkInvariants, type Violation } from './invariants';

export interface CompiledActivity { id: string; branch: string; act: CrewActivity }
export interface CompiledJourney { id: string; branch: string; j: Journey }
export interface CompiledAdmission { group: GroupId; shelter: LocId; minute: number; count: number; branch: string }

export interface Compiled {
  planId: string;
  revision: number;
  crew: CompiledActivity[];
  journeys: CompiledJourney[];
  observation: null | { at: number; connection: string; actionId: string; possible: PassageState[]; activityId: string };
  batteries: { common: BatteryReservation[]; branches: Record<string, BatteryReservation[]> };
  admissions: { common: CompiledAdmission[]; branches: Record<string, CompiledAdmission[]> };
  assigned: Record<string, GroupId[]>; // 'common' | branch -> groups
}

export function compilePlan(s: Scenario, p: AnyPlan): Compiled {
  const count = (gid: string) => s.groups.find((g) => g.id === gid)!.count;
  const out: Compiled = {
    planId: p.id, revision: p.inputRevision, crew: [], journeys: [], observation: null,
    batteries: { common: [], branches: {} }, admissions: { common: [], branches: {} }, assigned: { common: [] },
  };
  const addCrew = (a: CrewActivity, branch: string) => {
    const id = branch === 'common' ? a.id : `${branch}/${a.id}`;
    out.crew.push({ id, branch, act: a });
    for (const b of a.batteries ?? []) {
      const r: BatteryReservation = { taskId: id, location: b.location, deliveryId: b.deliveryId, qty: b.qty, branch };
      if (branch === 'common') out.batteries.common.push(r); else (out.batteries.branches[branch] ??= []).push(r);
    }
  };
  const addJourney = (j: Journey, branch: string) => {
    out.journeys.push({ id: branch === 'common' ? `j-${j.groupId}` : `${branch}/j-${j.groupId}`, branch, j });
    const adm: CompiledAdmission = { group: j.groupId, shelter: j.shelter, minute: j.arrival, count: count(j.groupId), branch };
    if (branch === 'common') out.admissions.common.push(adm); else (out.admissions.branches[branch] ??= []).push(adm);
    (out.assigned[branch] ??= []).push(j.groupId);
  };
  if (p.kind === 'schedule' || !p.inspection) {
    const sc = p.kind === 'schedule' ? p.schedule : p.branches.open;
    sc.crew.forEach((a) => addCrew(a, 'common'));
    sc.journeys.forEach((j) => addJourney(j, 'common'));
  } else {
    const n = p.inspection.prefixCrewCount;
    p.branches.open.crew.slice(0, n).forEach((a) => addCrew(a, 'common'));
    for (const st of ['open', 'blocked'] as PassageState[]) p.branches[st].crew.slice(n).forEach((a) => addCrew(a, st));
    const common = new Set(p.commonGroups.filter((gid) => !s.groups.find((g) => g.id === gid)!.escortRequired || p.branches.open.crew.slice(0, n).some((a) => a.groupId === gid)));
    for (const j of p.branches.open.journeys) if (common.has(j.groupId)) addJourney(j, 'common');
    for (const st of ['open', 'blocked'] as PassageState[]) for (const j of p.branches[st].journeys) if (!common.has(j.groupId)) addJourney(j, st);
    const insp = p.branches.open.crew[n - 1];
    out.observation = { at: insp.end, connection: p.connection, actionId: insp.actionId!, possible: ['open', 'blocked'], activityId: insp.id };
    out.assigned.open ??= []; out.assigned.blocked ??= [];
  }
  return out;
}

export interface GroupLive {
  at: LocId | null;
  edge: null | { conn: string; from: LocId; to: LocId; start: number; end: number };
  status: 'unresolved' | 'conditional' | 'assigned' | 'traveling' | 'arrived' | 'held';
  arrivedAt: number | null;
  shelter: LocId | null;
  exposure: number;
  protected: number;
  crossed: boolean;
  unsafe: boolean;
  departedAt: number | null;
}

export interface SimEvent {
  id: string;
  t: number;
  entity: string;
  action: string;
  before: unknown;
  after: unknown;
  plan: string | null;
  payload?: Record<string, unknown>;
}

export interface SimState {
  version: 1;
  runId: string;
  label: string;
  planId: string | null;
  t: number; // next boundary to process
  processedThrough: number;
  done: boolean;
  paused: boolean;
  pause: null | { reason: string; minute: number; entities: string[]; event: string | null; invariant?: string };
  crew: { at: LocId | null; edge: GroupLive['edge']; activity: string | null; activityId: string | null };
  groups: Record<GroupId, GroupLive>;
  openAt: Record<string, number>;
  rateChanges: Record<LocId, { at: number; rate: number }[]>;
  knowledge: { confirmed: Record<string, string>; observations: { at: number; connection: string; state: string }[]; revision: number };
  activeBranch: string | null;
  ledger: LiveLedger;
  placeDeliveries: string[]; // processed place deliveries
  shelters: Record<LocId, { occupants: GroupId[]; reservations: CompiledAdmission[] }>;
  pendingAdmissions: Record<string, CompiledAdmission[]>;
  appliedProtection: string[];
  applied: string[];
  workStarts: { id: string; t: number; pendingAtStart: boolean }[];
  events: SimEvent[];
  lastEventId: string | null;
  snapshots: BoundarySnapshot[];
  invariantChecks: number;
  violations: Violation[];
}

export interface SimContext { s: Scenario; plan: Compiled | null; truth: Truth; corrupt?: { t: number; group: GroupId; to: LocId } }

function groupCount(s: Scenario, gid: string) { return s.groups.find((g) => g.id === gid)!.count; }

export function activeBranches(st: SimState) { return st.activeBranch ? ['common', st.activeBranch] : ['common']; }

/** Approval: revalidated elsewhere; this commits reservations against the shared ledger. */
export function initSim(ctx: SimContext, runId: string, label = 'response'): { state: SimState; errors: string[] } {
  const { s, plan } = ctx;
  const ledger = initLiveLedger(s);
  const errors = plan ? reserveForApproval(ledger, s, plan.batteries.common, plan.batteries.branches) : [];
  const groups: Record<string, GroupLive> = {};
  for (const g of s.groups) {
    const common = plan?.assigned.common.includes(g.id);
    const cond = plan && !common && Object.entries(plan.assigned).some(([b, l]) => b !== 'common' && l.includes(g.id));
    groups[g.id] = { at: g.location, edge: null, status: common ? 'assigned' : cond ? 'conditional' : 'unresolved', arrivedAt: null, shelter: null, exposure: 0, protected: 0, crossed: false, unsafe: false, departedAt: null };
  }
  const openAt: Record<string, number> = {};
  for (const c of s.connections) openAt[c.id] = c.state === 'open' ? 0 : Infinity;
  const shelters: SimState['shelters'] = {};
  for (const sh of s.shelters) shelters[sh.location] = { occupants: [], reservations: [] };
  for (const a of plan?.admissions.common ?? []) shelters[a.shelter].reservations.push(a);
  const state: SimState = {
    version: 1, runId, label, planId: plan?.planId ?? null, t: 0, processedThrough: -1, done: false, paused: false, pause: null,
    crew: { at: s.crew.start, edge: null, activity: null, activityId: null }, groups, openAt, rateChanges: {},
    knowledge: { confirmed: {}, observations: [], revision: 0 }, activeBranch: null, ledger, placeDeliveries: [], shelters,
    pendingAdmissions: plan ? JSON.parse(JSON.stringify(plan.admissions.branches)) : {}, appliedProtection: [], applied: [], workStarts: [],
    events: [], lastEventId: null, snapshots: [], invariantChecks: 0, violations: [],
  };
  return { state, errors };
}

export function liveNodeHazard(s: Scenario, st: SimState, loc: LocId, t: number) {
  const l = s.locations.find((x) => x.id === loc)!;
  return hazardAt(l.hazard.initial, effectiveRate(l.hazard.rate, s.hazardMultiplier ?? 1), st.rateChanges[loc], t);
}

function liveHazardAtPos(s: Scenario, st: SimState, pos: { at: LocId | null; edge: GroupLive['edge'] }, t: number) {
  if (pos.edge) { const c = s.connections.find((x) => x.id === pos.edge!.conn)!; return hazardAt(c.hazard.initial, effectiveRate(c.hazard.rate, s.hazardMultiplier ?? 1), undefined, t); }
  if (pos.at && s.shelters.some((x) => x.location === pos.at)) return 0;
  return pos.at ? liveNodeHazard(s, st, pos.at, t) : 0;
}

function emit(st: SimState, t: number, counter: { n: number }, ev: Omit<SimEvent, 'id' | 't' | 'plan'>) {
  const id = `${st.runId}:${String(t).padStart(2, '0')}:${String(counter.n++).padStart(2, '0')}`;
  const e: SimEvent = { id, t, plan: st.planId, ...ev };
  st.events.push(e);
  st.lastEventId = id;
  return e;
}

function pauseRun(st: SimState, reason: string, minute: number, entities: string[], event: string | null, invariant?: string) {
  st.paused = true;
  st.pause = { reason, minute, entities, event, invariant };
}

function once(st: SimState, tx: string): boolean {
  if (st.applied.includes(tx)) return false;
  st.applied.push(tx);
  return true;
}

function placesAvailableNow(s: Scenario, st: SimState, sh: LocId, t: number) {
  const actual: Record<string, number | null> = {};
  for (const d of s.deliveries) if (d.resource === 'places') actual[d.id] = st.placeDeliveries.includes(d.id) ? d.minute : null;
  return placeProfile(s, sh, t, actual);
}

/** Process one integer boundary. Returns the state (mutated in place). */
export function processBoundary(ctx: SimContext, st: SimState): SimState {
  if (st.done || st.paused) return st;
  const { s, plan, truth } = ctx;
  const t = st.t;
  const H = s.horizon;
  const counter = { n: 0 };
  const acts = () => (plan?.crew ?? []).filter((c) => activeBranches(st).includes(c.branch));
  const jrn = () => (plan?.journeys ?? []).filter((c) => activeBranches(st).includes(c.branch));

  // ---------------- step 1: completions, effects, observation, consumption; then deliveries
  for (const c of acts()) {
    const a = c.act;
    if ((a.kind === 'work' || a.kind === 'inspect') && a.end === t && once(st, `complete:${c.id}`)) {
      const action = s.actions.find((x) => x.id === a.actionId)!;
      if (a.kind === 'work') {
        const ef = action.effect;
        if (ef.type === 'openConnection') {
          const before = st.openAt[ef.connection];
          st.openAt[ef.connection] = Math.min(before, t);
          emit(st, t, counter, { entity: ef.connection, action: 'passage-opened', before: before === Infinity ? 'blocked' : 'open', after: 'open', payload: { actionId: action.id, connection: ef.connection } });
        } else if (ef.type === 'setRate') {
          if (!st.appliedProtection.includes(c.id)) {
            st.appliedProtection.push(c.id);
            (st.rateChanges[ef.location] ??= []).push({ at: t, rate: ef.rate });
            st.rateChanges[ef.location].sort((x, y) => x.at - y.at);
            emit(st, t, counter, { entity: ef.location, action: action.kind === 'ventilate' ? 'protection-applied' : 'hazard-growth-changed', before: null, after: { rate: ef.rate, from: t }, payload: { actionId: action.id, location: ef.location, rate: ef.rate } });
          }
        }
        const used = consumeForTask(st.ledger, c.id, t);
        const sources = st.ledger.consumptions.filter((x) => x.taskId === c.id).map((x) => ({ location: x.location, qty: x.qty }));
        emit(st, t, counter, { entity: 'crew', action: 'work-complete', before: a.id, after: null, payload: { actionId: action.id, taskId: c.id, consumed: used, sources } });
      } else {
        // observation: the simulator reveals hidden truth; the planner never sees it
        const obs = plan!.observation!;
        const state = truth.connectionStates[obs.connection];
        emit(st, t, counter, { entity: obs.connection, action: 'inspection-complete', before: 'unknown', after: state, payload: { connection: obs.connection, state } });
        st.knowledge.observations.push({ at: t, connection: obs.connection, state });
        st.knowledge.revision++;
        if (!obs.possible.includes(state as PassageState)) {
          pauseRun(st, `Observation "${state}" is outside the declared states (${obs.possible.join(', ')}). Stop and report; no branch executes.`, t, [obs.connection], st.lastEventId);
        } else {
          st.knowledge.confirmed[obs.connection] = state;
          if (state === 'open') st.openAt[obs.connection] = Math.min(st.openAt[obs.connection], t);
          st.activeBranch = state;
          const errs = activateBranch(st.ledger, s, state);
          for (const r of st.pendingAdmissions[state] ?? []) st.shelters[r.shelter].reservations.push(r);
          st.pendingAdmissions = {};
          for (const g of s.groups) if (st.groups[g.id].status === 'conditional') st.groups[g.id].status = plan!.assigned[state].includes(g.id) ? 'assigned' : 'unresolved';
          emit(st, t, counter, { entity: 'policy', action: 'branch-activated', before: null, after: state, payload: { branch: state, errors: errs } });
        }
      }
      if (st.crew.activityId === c.id) { st.crew.activity = null; st.crew.activityId = null; emit(st, t, counter, { entity: 'crew', action: 'activity-end', before: c.id, after: null, payload: { activityId: c.id } }); }
    }
  }
  for (const d of s.deliveries.filter((x) => x.confirmed)) {
    const actual = d.id in truth.deliveryActual ? truth.deliveryActual[d.id] : d.minute;
    if (actual === t && once(st, `delivery:${d.id}`)) {
      if (d.resource === 'batteries') processDelivery(st.ledger, d);
      else st.placeDeliveries.push(d.id);
      emit(st, t, counter, { entity: d.location, action: 'delivery-arrived', before: 'pending', after: 'on-hand', payload: { deliveryId: d.id, resource: d.resource, quantity: d.quantity, location: d.location } });
    }
  }
  if (st.paused) return finishBoundary(ctx, st, t, counter, false);

  // ---------------- step 2: arrivals and admissions
  for (const c of acts()) for (const [i, l] of c.act.legs.entries()) {
    if (l.conn && l.end === t && once(st, `crew-arrive:${c.id}:${i}`)) {
      st.crew.at = l.to; st.crew.edge = null;
      emit(st, t, counter, { entity: 'crew', action: 'arrive', before: l.conn, after: l.to, payload: { at: l.to, conn: l.conn } });
    }
    if (c.act.end === t && st.crew.activityId === c.id) { st.crew.activity = null; st.crew.activityId = null; emit(st, t, counter, { entity: 'crew', action: 'activity-end', before: c.id, after: null, payload: { activityId: c.id } }); }
  }
  for (const c of jrn()) for (const [i, l] of c.j.legs.entries()) {
    const g = st.groups[c.j.groupId];
    if (l.conn && l.end === t && once(st, `arrive:${c.id}:${i}`)) {
      const before = g.edge?.conn ?? null;
      g.at = l.to; g.edge = null;
      emit(st, t, counter, { entity: c.j.groupId, action: 'arrive', before, after: l.to, payload: { group: c.j.groupId, at: l.to, conn: l.conn } });
      if (i === c.j.legs.length - 1) {
        const sh = c.j.shelter;
        const avail = placesAvailableNow(s, st, sh, t) - st.shelters[sh].occupants.reduce((n, gid) => n + groupCount(s, gid), 0);
        if (avail >= groupCount(s, c.j.groupId)) {
          if (once(st, `admit:${c.j.groupId}`)) {
            st.shelters[sh].occupants.push(c.j.groupId);
            g.status = 'arrived'; g.arrivedAt = t; g.shelter = sh;
            emit(st, t, counter, { entity: c.j.groupId, action: 'admitted', before: 'reserved', after: 'occupant', payload: { group: c.j.groupId, shelter: sh } });
          }
        } else {
          g.status = 'held';
          const pending = s.deliveries.filter((d) => d.resource === 'places' && d.location === sh && d.confirmed && !st.placeDeliveries.includes(d.id)).map((d) => d.id);
          emit(st, t, counter, { entity: c.j.groupId, action: 'admission-blocked', before: null, after: 'held at entrance', payload: { group: c.j.groupId, shelter: sh, pending } });
          pauseRun(st, `Admission of ${c.j.groupId} at ${sh} blocked: places not available${pending.length ? ` (delivery ${pending.join(', ')} still pending)` : ''}. Residents held at the entrance; stop and report.`, t, [c.j.groupId, sh, ...pending], st.lastEventId);
        }
      }
    }
  }
  if (ctx.corrupt && ctx.corrupt.t === t && once(st, `corrupt:${t}`)) {
    // deliberately corrupted event (negative test): teleports a group into a shelter
    const g = st.groups[ctx.corrupt.group];
    const before = g.at;
    g.at = ctx.corrupt.to; g.edge = null; g.status = 'arrived'; g.arrivedAt = t; g.shelter = ctx.corrupt.to;
    st.shelters[ctx.corrupt.to]?.occupants.push(ctx.corrupt.group);
    emit(st, t, counter, { entity: ctx.corrupt.group, action: 'corrupted-arrival', before, after: ctx.corrupt.to, payload: { group: ctx.corrupt.group, at: ctx.corrupt.to } });
  }
  if (st.paused) return finishBoundary(ctx, st, t, counter, false);
  if (t >= H) return finishBoundary(ctx, st, t, counter, true);

  // ---------------- step 4: starts (work only with reserved, on-hand batteries)
  for (const c of acts()) {
    const a = c.act;
    if (a.start === t && once(st, `start:${c.id}`)) {
      if (a.kind === 'work') {
        const chk = canStartWork(st.ledger, c.id);
        if (!chk.ok) {
          st.applied = st.applied.filter((x) => x !== `start:${c.id}`);
          pauseRun(st, `Cannot start ${s.actions.find((x) => x.id === a.actionId)!.label}: ${chk.reason}. Crew holds at ${a.from}; dependent tasks wait. Stop and report the missing delivery.`, t, [c.id, ...(chk.deliveryId ? [chk.deliveryId] : [])], st.lastEventId);
          return finishBoundary(ctx, st, t, counter, false);
        }
        st.workStarts.push({ id: c.id, t, pendingAtStart: false });
      }
      st.crew.activity = activityLabel(a.kind, a.actionId ?? a.groupId);
      st.crew.activityId = c.id;
      emit(st, t, counter, { entity: 'crew', action: `${a.kind}-start`, before: null, after: st.crew.activity, payload: { activityId: c.id, kind: a.kind, actionId: a.actionId, groupId: a.groupId } });
    }
    for (const [i, l] of a.legs.entries()) {
      if (l.conn && l.start === t && once(st, `crew-depart:${c.id}:${i}`)) {
        if (st.openAt[l.conn] > t) {
          pauseRun(st, `Approved crew movement over ${l.conn} at minute ${t}, but it is not open in the live state.`, t, ['crew', l.conn], st.lastEventId);
          return finishBoundary(ctx, st, t, counter, false);
        }
        st.crew.edge = { conn: l.conn, from: l.from, to: l.to, start: l.start, end: l.end };
        emit(st, t, counter, { entity: 'crew', action: 'depart', before: l.from, after: l.conn, payload: { leg: l } });
      }
    }
  }
  for (const c of jrn()) {
    const g = st.groups[c.j.groupId];
    const gd = s.groups.find((x) => x.id === c.j.groupId)!;
    for (const [i, l] of c.j.legs.entries()) {
      if (l.conn && l.start === t && once(st, `depart:${c.id}:${i}`)) {
        if (st.openAt[l.conn] > t) { pauseRun(st, `Approved movement of ${gd.id} over ${l.conn} at minute ${t}, but it is not open in the live state.`, t, [gd.id, l.conn], st.lastEventId); return finishBoundary(ctx, st, t, counter, false); }
        if (i === 0 && t < gd.instructionsAvailableAt) { pauseRun(st, `${gd.id} scheduled to depart before instructions are available.`, t, [gd.id], st.lastEventId); return finishBoundary(ctx, st, t, counter, false); }
        if (i === 0) { g.departedAt = t; g.status = 'traveling'; }
        g.edge = { conn: l.conn, from: l.from, to: l.to, start: l.start, end: l.end };
        emit(st, t, counter, { entity: gd.id, action: 'depart', before: l.from, after: l.conn, payload: { group: gd.id, leg: l } });
      }
    }
  }
  return finishBoundary(ctx, st, t, counter, false);
}

function snapshotOf(ctx: SimContext, st: SimState, t: number): BoundarySnapshot {
  const { s } = ctx;
  const posOf = (x: { at: LocId | null; edge: GroupLive['edge'] }) => {
    if (x.edge && x.edge.start < t && t < x.edge.end) return { at: null, edge: x.edge.conn };
    if (x.edge && x.edge.start === t) return { at: x.edge.from, edge: null };
    return { at: x.at, edge: null };
  };
  const groups: BoundarySnapshot['groups'] = {};
  for (const g of s.groups) {
    const gl = st.groups[g.id];
    const p = posOf(gl);
    groups[g.id] = { at: p.at, edge: p.edge, arrivedAt: gl.arrivedAt, exposure: round6(gl.exposure), protected: gl.protected };
  }
  const local: Record<string, number> = {};
  let consumed = 0;
  for (const [k, q] of Object.entries(st.ledger.locs)) { consumed += q.consumed; if (k !== 'pack') local[k] = q.available + q.reserved; }
  const pk = st.ledger.locs.pack;
  const shelters: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(st.shelters)) shelters[k] = v.occupants.slice().sort();
  const cp = posOf(st.crew);
  return { t, crew: { at: cp.at, edge: cp.edge, activity: st.crew.activity }, batteries: { consumed, pack: pk.available + pk.reserved, local }, shelters, groups };
}

function finishBoundary(ctx: SimContext, st: SimState, t: number, counter: { n: number }, horizonReached: boolean): SimState {
  const { s } = ctx;
  // ---------------- step 3 (after transitions): independent invariant checker
  const snap = snapshotOf(ctx, st, t);
  st.snapshots = st.snapshots.filter((x) => x.t !== t);
  st.snapshots.push(snap);
  const v = checkInvariants(ctx, st, t);
  st.invariantChecks++;
  if (v.length) {
    st.violations.push(...v);
    if (!st.paused) pauseRun(st, `Invariant violated: ${v[0].invariant} — ${v[0].detail}`, t, v[0].entities, v[0].event, v[0].invariant);
  }
  if (st.paused) { st.processedThrough = t - 1; return st; }
  if (horizonReached) { st.done = true; st.processedThrough = t; st.t = t; return st; }
  // ---------------- step 5: exposure for [t, t+1), protected-minute counters, advance
  if (once(st, `exposure:${t}`)) {
    for (const g of s.groups) {
      const gl = st.groups[g.id];
      if (gl.status === 'arrived') continue;
      gl.exposure = round6(gl.exposure + liveHazardAtPos(s, st, gl, t));
      if (!gl.edge && gl.at === g.location && !gl.crossed) {
        if (liveNodeHazard(s, st, g.location, t) >= s.threshold) { gl.crossed = true; gl.unsafe = true; }
        else gl.protected++;
      }
    }
  }
  void counter;
  st.processedThrough = t;
  st.t = t + 1;
  return st;
}

export function runToEnd(ctx: SimContext, st: SimState, maxBoundaries = 1000): SimState {
  let n = 0;
  while (!st.done && !st.paused && n++ < maxBoundaries) processBoundary(ctx, st);
  return st;
}

export function checkpoint(st: SimState): string { return JSON.stringify(st, (_k, v) => (v === Infinity ? '__inf__' : v)); }

/** Restore paused at the checkpointed boundary; resuming requires an explicit call. */
export function restore(json: string): SimState {
  const st: SimState = JSON.parse(json, (_k, v) => (v === '__inf__' ? Infinity : v));
  if (!st.done && !st.pause) { st.paused = true; st.pause = { reason: `Restored from checkpoint after minute ${st.processedThrough}. Paused — resume explicitly.`, minute: st.processedThrough, entities: [], event: st.lastEventId }; }
  return st;
}

export function resume(st: SimState): SimState {
  if (st.pause && !st.pause.invariant && st.pause.reason.startsWith('Restored')) { st.paused = false; st.pause = null; }
  return st;
}

export function resumeAfterInspection(st: SimState): SimState { st.paused = false; st.pause = null; return st; }

/** Run a compiled plan to the horizon, recording a checkpoint after each boundary. */
export function executeWithCheckpoints(ctx: SimContext, runId: string, label = 'response') {
  const { state, errors } = initSim(ctx, runId, label);
  const checkpoints: string[] = [checkpoint(state)];
  while (!state.done && !state.paused) { processBoundary(ctx, state); checkpoints.push(checkpoint(state)); }
  return { state, checkpoints, errors };
}

export function arrivedCount(s: Scenario, st: SimState) {
  return s.groups.filter((g) => st.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0);
}

export function assignedNotArrived(s: Scenario, st: SimState) {
  return s.groups.filter((g) => ['assigned', 'traveling'].includes(st.groups[g.id].status)).reduce((n, g) => n + g.count, 0);
}

export type { Leg };
