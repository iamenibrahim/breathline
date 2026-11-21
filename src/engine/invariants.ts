// Automatic execution invariants, checked at every integer boundary after the transition steps.
// Separate from the planner and from the pre-approval validator. Uses only live state, the boundary
// history, the scenario and the approved plan.
import type { GroupId, LocId, Scenario } from './types';
import { checkAdmissions, ledgerInvariant, placeProfile } from './ledger';
import { requiredChecklist } from './common';
import type { SimContext, SimState } from './simulate';
import type { BoundarySnapshot } from './timeline';

export interface Violation { invariant: string; minute: number; entities: string[]; event: string | null; detail: string }

type Pos = { at: LocId | null; edge: string | null };

function transitionError(s: Scenario, prev: Pos, cur: Pos, liveEdge: { conn: string; from: string; to: string; start: number; end: number } | null, t: number): string | null {
  const conn = (a: string, b: string) => s.connections.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
  if (prev.at && cur.at) {
    if (prev.at === cur.at) return null;
    const c = conn(prev.at, cur.at);
    if (!c) return `jumped from ${prev.at} to ${cur.at}, which are not adjacent`;
    if (c.minutes !== 1) return `moved ${prev.at} → ${cur.at} in 1 minute over a ${c.minutes}-minute connection`;
    return null;
  }
  if (prev.at && cur.edge) {
    if (!liveEdge || liveEdge.conn !== cur.edge || liveEdge.from !== prev.at || liveEdge.start !== t - 1) return `entered ${cur.edge} without departing from ${prev.at} at minute ${t - 1}`;
    return null;
  }
  if (prev.edge && cur.edge) return prev.edge === cur.edge ? null : `switched from ${prev.edge} to ${cur.edge} mid-traversal`;
  if (prev.edge && cur.at) {
    const c = s.connections.find((x) => x.id === prev.edge)!;
    if (c.a !== cur.at && c.b !== cur.at) return `left ${prev.edge} at ${cur.at}, which is not one of its ends`;
    return null;
  }
  return null;
}

export function checkInvariants(ctx: SimContext, st: SimState, t: number): Violation[] {
  const { s, plan } = ctx;
  const v: Violation[] = [];
  const ev = st.lastEventId;
  const H = s.horizon;
  const cur = st.snapshots.find((x) => x.t === t)!;
  const prev: BoundarySnapshot | undefined = st.snapshots.find((x) => x.t === t - 1);
  const add = (invariant: string, entities: string[], detail: string) => v.push({ invariant, minute: t, entities, event: ev, detail });

  // crew continuity
  if (prev) {
    const e = transitionError(s, prev.crew, cur.crew, st.crew.edge, t);
    if (e) add('crew continuity', ['crew'], `crew ${e}`);
  } else if (t === 0 && cur.crew.at !== s.crew.start && !cur.crew.edge) add('crew continuity', ['crew'], `crew not at its start location`);
  if (st.crew.edge) {
    const c = s.connections.find((x) => x.id === st.crew.edge!.conn)!;
    if ((st.openAt[c.id] ?? Infinity) > st.crew.edge.start) add('crew continuity', ['crew', c.id], `crew traversing ${c.id}, which was not open at ${st.crew.edge.start}`);
  }

  // residents: continuity, escort, access, valid arrivals, protection is not evacuation
  const journeys = (plan?.journeys ?? []).filter((c) => (st.activeBranch ? ['common', st.activeBranch] : ['common']).includes(c.branch));
  for (const g of s.groups) {
    const gl = st.groups[g.id];
    const cp = cur.groups[g.id];
    if (prev) {
      const e = transitionError(s, prev.groups[g.id], cp, gl.edge, t);
      if (e) add('valid arrivals', [g.id], `${g.id} ${e}`);
    }
    if (gl.edge) {
      const c = s.connections.find((x) => x.id === gl.edge!.conn)!;
      if ((st.openAt[c.id] ?? Infinity) > gl.edge.start) add('valid arrivals', [g.id, c.id], `${g.id} on ${c.id}, which was not open when it departed`);
      if (g.stepFree && !c.accessible) add('continuous escorting', [g.id, c.id], `${g.id} on inaccessible ${c.id}`);
    }
    if (g.escortRequired && gl.departedAt !== null && (gl.status === 'traveling' || (gl.status === 'arrived' && gl.arrivedAt === t))) {
      if (cp.at !== cur.crew.at || cp.edge !== cur.crew.edge) add('continuous escorting', [g.id, 'crew'], `${g.id} is at ${cp.at ?? cp.edge} but the crew is at ${cur.crew.at ?? cur.crew.edge}`);
    }
    if (gl.status === 'arrived') {
      const j = journeys.find((c) => c.j.groupId === g.id)?.j;
      if (!j) add('valid arrivals', [g.id], `${g.id} arrived without an approved journey`);
      else {
        if (gl.shelter !== j.shelter) add('valid arrivals', [g.id], `${g.id} admitted at ${gl.shelter}, assigned ${j.shelter}`);
        if (gl.arrivedAt! > H) add('valid arrivals', [g.id], `${g.id} arrived after the horizon`);
        if (gl.departedAt === null || gl.departedAt < g.instructionsAvailableAt) add('valid arrivals', [g.id], `${g.id} has no valid departure at or after instructions (${g.instructionsAvailableAt})`);
      }
    }
    if (gl.status === 'unresolved' || gl.status === 'conditional') {
      if (cp.at !== g.location) add('protection is not evacuation', [g.id], `${g.id} is unresolved but not at its location`);
      if (Object.values(st.shelters).some((x) => x.occupants.includes(g.id))) add('protection is not evacuation', [g.id], `${g.id} is unresolved but counted as an occupant`);
    }
    if (gl.protected > t) add('protection is not evacuation', [g.id], `${g.id} has ${gl.protected} protected minutes after ${t} elapsed intervals`);
    // safety of served trajectories: an assigned/traveling group at an unsafe node invalidates the assignment
    if ((gl.status === 'assigned' || gl.status === 'traveling') && cp.at && !s.shelters.some((x) => x.location === cp.at)) {
      const l = s.locations.find((x) => x.id === cp.at)!;
      const rc = st.rateChanges[cp.at];
      let h = l.hazard.initial, rate = l.hazard.rate > 0 ? l.hazard.rate * (s.hazardMultiplier ?? 1) : l.hazard.rate, last = 0;
      for (const c of rc ?? []) { if (c.at >= t) break; h += rate * (c.at - last); last = c.at; rate = c.rate; }
      h += rate * (t - last);
      if (Math.round(h * 1e6) / 1e6 >= s.threshold) add('valid arrivals', [g.id, cp.at], `${g.id} is at ${cp.at} with hazard ${Math.round(h * 10) / 10} (threshold ${s.threshold})`);
    }
  }

  // shelter capacity and reservations
  for (const sh of s.shelters) {
    const live = st.shelters[sh.location];
    const occ = live.occupants;
    if (new Set(occ).size !== occ.length) add('shelter capacity', [sh.location], `${sh.name}: an arrival was converted twice`);
    const actual: Record<string, number | null> = {};
    for (const d of s.deliveries) if (d.resource === 'places') actual[d.id] = st.placeDeliveries.includes(d.id) ? d.minute : null;
    const avail = placeProfile(s, sh.location, t, actual);
    const n = occ.reduce((x, gid) => x + s.groups.find((g) => g.id === gid)!.count, 0);
    if (n > avail) add('shelter capacity', [sh.location], `${sh.name}: ${n} occupants, ${avail} places available at minute ${t}`);
    for (const gid of occ) if (!live.reservations.some((r) => r.group === gid) && !ctx.corrupt) add('shelter capacity', [sh.location, gid], `${gid} occupies ${sh.name} without a reservation`);
    const chk = checkAdmissions(s, sh.location, live.reservations.map((r) => ({ group: r.group, minute: r.minute, count: r.count })), H);
    if (!chk.ok) add('shelter capacity', [sh.location], `${sh.name}: reservations need ${chk.needed} places at minute ${chk.minute}, profile has ${chk.available}`);
    // suitable destinations
    for (const r of live.reservations) {
      const g = s.groups.find((x) => x.id === r.group)!;
      for (const k of requiredChecklist(g)) if (sh.checklist[k] !== 'present') add('suitable destinations', [g.id, sh.location], `${sh.name} lacks confirmed ${k} required by ${g.id}`);
    }
  }

  // batteries
  for (const e of ledgerInvariant(st.ledger, s)) add('battery accounting', ['batteries'], e);
  for (const c of st.ledger.consumptions) if (!st.applied.includes(`complete:${c.taskId}`)) add('battery accounting', [c.taskId], `consumption for ${c.taskId} without a completed intervention`);
  for (const w of st.workStarts.filter((x) => x.t === t)) {
    for (const r of st.ledger.reservations.filter((x) => x.taskId === w.id)) {
      if (r.deliveryId && !st.ledger.processedDeliveries.includes(r.deliveryId)) add('no work on pending resources', [w.id, r.deliveryId], `${w.id} started while delivery ${r.deliveryId} was pending`);
    }
  }
  void ({} as GroupId);
  return v;
}
