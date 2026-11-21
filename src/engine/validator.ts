// Independent schedule and policy validator. Recomputes legality from primitive movements and work
// intervals: it rebuilds hazard changes from completed work (not from the planner's effect list),
// re-integrates exposure minute by minute, re-checks every capacity, and recomputes the objective.
// It shares hazard formulas, data types and the resource-ledger rules, nothing else.
import type { CrewActivity, GroupId, Journey, Leg, LocId, PassageState, PolicyResult, Scenario, Schedule } from './types';
import { checkAdmissions, checkBatterySources, type Admission } from './ledger';
import { baseWorld, connHazard, nodeHazard, round6, withEffects, type World } from './world';
import type { BoundarySnapshot } from './timeline';
import { requiredChecklist } from './common';

export interface GroupCheck {
  served: boolean;
  shelter: LocId | null;
  departure: number | null;
  arrival: number | null;
  exposure: number;
  waitingExposure: number;
  travelExposure: number;
  protectedMinutes: number;
  errors: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  groups: Record<GroupId, GroupCheck>;
  objective: { served: number; protectedPM: number; maxExposure: number; busy: number; batteries: number; finalArrival: number };
  world: World;
  boundaries: number;
}

export interface ValidateOptions {
  state?: PassageState; // policy branch state (reveal at the inspection's end)
  approval?: boolean; // also require essential confirmations
}

function nodeOk(w: World, loc: LocId, t: number) { return w.shelters.has(loc) || nodeHazard(w, loc, t) < w.thr; }

function checkLegs(w: World, legs: Leg[], start: LocId, from: number, opts: { stepFree: boolean; resident: boolean; destination?: LocId }, errs: string[], who: string) {
  let at = start, t = from;
  for (const l of legs) {
    if (l.from !== at) errs.push(`${who}: leg starts at ${l.from} but entity is at ${at}`);
    if (l.start !== t) errs.push(`${who}: leg at ${l.from} starts at ${l.start}, expected ${t} (no teleporting in time)`);
    if (l.end < l.start) errs.push(`${who}: leg ends before it starts`);
    if (l.end > w.H) errs.push(`${who}: leg ends after the horizon`);
    if (l.conn === null) {
      if (l.to !== l.from) errs.push(`${who}: wait leg changes location`);
      for (let x = l.start; x <= l.end; x++) if (!nodeOk(w, l.from, x)) errs.push(`${who}: waits at ${l.from} at minute ${x} with hazard ${nodeHazard(w, l.from, x)} (must be < ${w.thr})`);
      if (opts.resident && w.shelters.has(l.from)) errs.push(`${who}: resident waits inside shelter ${l.from} before admission`);
    } else {
      const c = w.conns.get(l.conn);
      if (!c) { errs.push(`${who}: unknown connection ${l.conn}`); continue; }
      if (!((c.a === l.from && c.b === l.to) || (c.b === l.from && c.a === l.to))) errs.push(`${who}: ${l.conn} does not join ${l.from} and ${l.to}`);
      if (l.end - l.start !== c.minutes) errs.push(`${who}: ${l.conn} takes ${c.minutes} minutes, leg takes ${l.end - l.start}`);
      if ((w.openAt.get(c.id) ?? Infinity) > l.start) errs.push(`${who}: ${l.conn} is not open at minute ${l.start}`);
      if (opts.stepFree && !c.accessible) errs.push(`${who}: ${l.conn} is not step-free`);
      for (let x = l.start; x <= l.end; x++) if (connHazard(w, c.id, x) >= w.thr) errs.push(`${who}: ${l.conn} unsafe at minute ${x}`);
      if (!nodeOk(w, l.from, l.start)) errs.push(`${who}: departs ${l.from} at ${l.start} while unsafe (${nodeHazard(w, l.from, l.start)})`);
      if (!w.shelters.has(l.to) && !nodeOk(w, l.to, l.end)) errs.push(`${who}: reaches ${l.to} at ${l.end} with hazard ${nodeHazard(w, l.to, l.end)} (must be < ${w.thr})`);
      if (opts.resident && w.shelters.has(l.to) && l.to !== opts.destination) errs.push(`${who}: passes through shelter ${l.to} (residents may not use a shelter as a shortcut)`);
      if (opts.resident && w.shelters.has(l.to) && l !== legs[legs.length - 1]) errs.push(`${who}: continues after entering shelter ${l.to}`);
    }
    at = l.to; t = l.end;
  }
  return { at, t };
}

/** Effects implied by completed work in the crew schedule (independent of the planner's effect list). */
export function effectsFromCrew(s: Scenario, crew: CrewActivity[], state?: PassageState) {
  const out: { actionId: string; at: number; effect: Scenario['actions'][number]['effect']; revealed?: PassageState }[] = [];
  for (const a of crew) {
    if (a.kind !== 'work' && a.kind !== 'inspect') continue;
    const act = s.actions.find((x) => x.id === a.actionId);
    if (!act) continue;
    if (act.effect.type === 'reveal') { if (state) out.push({ actionId: act.id, at: a.end, effect: act.effect, revealed: state }); }
    else out.push({ actionId: act.id, at: a.end, effect: act.effect });
  }
  return out;
}

/** Position of a resident during the interval [m, m+1): node, connection or arrived. */
export function residentPosition(home: LocId, j: Journey | null, m: number): { node?: LocId; conn?: string; arrived?: LocId } {
  if (!j || m < j.departure) return { node: home };
  if (m >= j.arrival) return { arrived: j.shelter };
  for (const l of j.legs) if (l.start <= m && m < l.end) return l.conn ? { conn: l.conn } : { node: l.from };
  return { node: home };
}

export function validateSchedule(s: Scenario, sc: Schedule, opts: ValidateOptions = {}): ValidationResult {
  const errors: string[] = [];
  const H = s.horizon;
  const w0 = baseWorld(s);
  const w = withEffects(w0, effectsFromCrew(s, sc.crew, opts.state) as never);

  // ---- crew continuity, work, batteries
  const crew = sc.crew.slice().sort((a, b) => a.start - b.start);
  let cLoc = s.crew.start, cT = 0, busy = 0;
  const done = new Set<string>();
  for (const a of crew) {
    const who = `crew ${a.kind} ${a.actionId ?? a.groupId ?? ''}`.trim();
    if (a.from !== cLoc) errors.push(`${who}: starts at ${a.from} but the crew is at ${cLoc}`);
    if (a.start < cT) errors.push(`${who}: overlaps the previous activity (starts ${a.start}, previous ends ${cT})`);
    if (a.start > cT) for (let x = cT; x <= a.start; x++) if (!nodeOk(w, cLoc, x)) errors.push(`crew idle at ${cLoc} at minute ${x} is unsafe`);
    if (a.end > H) errors.push(`${who}: ends after the horizon`);
    const r = checkLegs(w, a.legs, a.from, a.start, { stepFree: a.kind === 'escort' && !!s.groups.find((g) => g.id === a.groupId)?.stepFree, resident: a.kind === 'escort', destination: a.kind === 'escort' ? a.to : undefined }, errors, who);
    if (a.legs.length && (r.at !== a.to || r.t !== a.end)) errors.push(`${who}: legs end at ${r.at}@${r.t}, activity says ${a.to}@${a.end}`);
    if (a.kind === 'work' || a.kind === 'inspect') {
      const act = s.actions.find((x) => x.id === a.actionId);
      if (!act) errors.push(`${who}: unknown action`);
      else {
        if (!act.offered) errors.push(`${act.label} is not an offered action`);
        if (a.from !== act.workLocation) errors.push(`${act.label} must be done at ${act.workLocation}`);
        if (a.end - a.start !== act.duration) errors.push(`${act.label} lasts ${act.duration} minutes, scheduled ${a.end - a.start}`);
        if (act.requiresToolkit && !s.crew.toolkit) errors.push(`${act.label} needs the tool kit`);
        if ((act.kind === 'inspect') !== (a.kind === 'inspect')) errors.push(`${act.label}: activity kind mismatch`);
        if (done.has(act.id)) errors.push(`${act.label} scheduled twice`);
        done.add(act.id);
        busy += act.duration;
      }
    } else if (a.kind === 'travel') busy += a.legs.filter((l) => l.conn).reduce((n, l) => n + l.end - l.start, 0);
    else if (a.kind === 'escort') busy += a.end - a.start;
    cLoc = a.to; cT = a.end;
  }
  errors.push(...checkBatterySources(s, crew));
  const batteries = crew.filter((a) => a.kind === 'work').reduce((n, a) => n + (s.actions.find((x) => x.id === a.actionId)?.batteries ?? 0), 0);

  // ---- residents
  const groups: Record<string, GroupCheck> = {};
  const byGroup = new Map<string, Journey>();
  for (const j of sc.journeys) {
    if (byGroup.has(j.groupId)) errors.push(`group ${j.groupId} has two journeys`);
    byGroup.set(j.groupId, j);
  }
  const connLoad = new Map<string, number>();
  const nodeLoad = new Map<string, number>();
  const admissions = new Map<LocId, Admission[]>();
  let served = 0, protectedPM = 0, maxExposure = 0, finalArrival = 0;
  for (const g of s.groups) {
    const j = byGroup.get(g.id) ?? null;
    const gErr: string[] = [];
    const who = `group ${g.id}`;
    let exposure = 0, waitingE = 0;
    const presence = new Set<string>();
    if (j) {
      if (j.departure < g.instructionsAvailableAt) gErr.push(`${who}: departs at ${j.departure} before instructions are available at ${g.instructionsAvailableAt}`);
      if (j.arrival > H) gErr.push(`${who}: arrives after the horizon`);
      if (!w.shelters.has(j.shelter)) gErr.push(`${who}: destination ${j.shelter} is not a shelter`);
      else {
        const sh = s.shelters.find((x) => x.location === j.shelter)!;
        for (const k of requiredChecklist(g)) if (sh.checklist[k] === 'absent') gErr.push(`${who}: ${sh.name} lacks ${k}`);
      }
      for (let x = 0; x <= j.departure; x++) if (!nodeOk(w, g.location, x)) gErr.push(`${who}: home ${g.location} unsafe at minute ${x} before departure`);
      const r = checkLegs(w, j.legs, g.location, j.departure, { stepFree: g.stepFree, resident: true, destination: j.shelter }, gErr, who);
      if (r.at !== j.shelter || r.t !== j.arrival) gErr.push(`${who}: legs end at ${r.at}@${r.t}, journey says ${j.shelter}@${j.arrival}`);
      if (g.escortRequired) {
        const esc = crew.find((a) => a.kind === 'escort' && a.groupId === g.id);
        if (!esc) gErr.push(`${who}: requires a continuous escort but no crew escort is scheduled`);
        else {
          if (esc.start !== j.departure || esc.end !== j.arrival) gErr.push(`${who}: escort covers ${esc.start}-${esc.end}, journey is ${j.departure}-${j.arrival}`);
          if (JSON.stringify(esc.legs) !== JSON.stringify(j.legs)) gErr.push(`${who}: crew and group do not move together`);
        }
        if (!j.escorted) gErr.push(`${who}: journey not marked as escorted`);
      }
      for (let m = 0; m < j.arrival; m++) {
        const p = residentPosition(g.location, j, m);
        const h = p.node ? nodeHazard(w, p.node, m) : p.conn ? connHazard(w, p.conn, m) : 0;
        exposure += h;
        if (m < j.departure) waitingE += h;
      }
      for (let x = 0; x <= j.departure; x++) presence.add(`${g.location}@${x}`);
      for (const l of j.legs) {
        if (l.conn) {
          for (let m = l.start; m < l.end; m++) connLoad.set(`${l.conn}@${m}`, (connLoad.get(`${l.conn}@${m}`) ?? 0) + g.count);
          presence.add(`${l.from}@${l.start}`);
          if (!w.shelters.has(l.to)) presence.add(`${l.to}@${l.end}`);
        } else for (let x = l.start; x <= l.end; x++) presence.add(`${l.from}@${x}`);
      }
      const adm = admissions.get(j.shelter) ?? [];
      adm.push({ group: g.id, minute: j.arrival, count: g.count });
      admissions.set(j.shelter, adm);
      if (!gErr.length) { served += g.count; maxExposure = Math.max(maxExposure, round6(exposure)); finalArrival = Math.max(finalArrival, j.arrival); }
    } else {
      if (g.escortRequired && crew.some((a) => a.kind === 'escort' && a.groupId === g.id)) gErr.push(`${who}: escort scheduled but no journey`);
      for (let x = 0; x <= H; x++) presence.add(`${g.location}@${x}`);
      for (let m = 0; m < H; m++) exposure += nodeHazard(w, g.location, m);
      waitingE = exposure;
    }
    for (const k of presence) { const [l] = k.split('@'); if (!w.shelters.has(l)) nodeLoad.set(k, (nodeLoad.get(k) ?? 0) + g.count); }
    let prot = 0;
    for (let m = 0; m < H; m++) { if (nodeHazard(w, g.location, m) >= w.thr) break; prot++; }
    if (!j) protectedPM += g.count * prot;
    errors.push(...gErr);
    groups[g.id] = {
      served: !!j && !gErr.length, shelter: j?.shelter ?? null, departure: j?.departure ?? null, arrival: j?.arrival ?? null,
      exposure: round6(exposure), waitingExposure: round6(waitingE), travelExposure: round6(exposure - waitingE), protectedMinutes: prot, errors: gErr,
    };
  }
  for (const [k, n] of connLoad) { const [c, m] = k.split('@'); const cap = w.conns.get(c)!.capacity; if (n > cap) errors.push(`corridor ${c} carries ${n} residents at minute ${m} (capacity ${cap})`); }
  for (const [k, n] of nodeLoad) { const [l, m] = k.split('@'); const cap = w.locs.get(l)!.capacity; if (n > cap) errors.push(`location ${l} holds ${n} residents at minute ${m} (capacity ${cap})`); }
  for (const [sh, adm] of admissions) {
    const r = checkAdmissions(s, sh, adm, H);
    if (!r.ok) errors.push(`${sh}: ${r.needed} places needed at minute ${r.minute}, ${r.available} available`);
  }

  if (opts.approval) errors.push(...essentialConfirmationErrors(s, sc));

  const objective = { served, protectedPM, maxExposure, busy, batteries, finalArrival };
  const o = sc.objective;
  if (o.served !== served) errors.push(`objective mismatch: plan claims ${o.served} served, validator finds ${served}`);
  if (o.protectedPM !== protectedPM) errors.push(`objective mismatch: protected person-minutes ${o.protectedPM} vs ${protectedPM}`);
  if (Math.abs(o.maxExposure - maxExposure) > 1e-6) errors.push(`objective mismatch: max exposure ${o.maxExposure} vs ${maxExposure}`);
  if (o.busy !== busy) errors.push(`objective mismatch: crew busy ${o.busy} vs ${busy}`);
  if (o.batteries !== batteries) errors.push(`objective mismatch: batteries ${o.batteries} vs ${batteries}`);
  if (o.finalArrival !== finalArrival) errors.push(`objective mismatch: final arrival ${o.finalArrival} vs ${finalArrival}`);
  for (const gid of sc.unresolved) if (byGroup.has(gid)) errors.push(`group ${gid} listed unresolved but has a journey`);
  return { valid: errors.length === 0, errors, groups, objective, world: w, boundaries: H + 1 };
}

/** Confirmations the plan depends on. Unconfirmed essential items block ordinary approval. */
export function essentialConfirmations(s: Scenario, sc: Schedule) {
  const items: { item: string; confirmed: boolean; source: string; detail: string }[] = [];
  const shelters = new Set(sc.journeys.map((j) => j.shelter));
  for (const shId of [...shelters].sort()) {
    const sh = s.shelters.find((x) => x.location === shId)!;
    items.push({ item: `${sh.name}: ${sh.places} places`, confirmed: sh.placesConfirmed, source: sh.steward, detail: 'shelter places' });
    const needed = new Set<string>();
    for (const j of sc.journeys.filter((x) => x.shelter === shId)) for (const k of requiredChecklist(s.groups.find((g) => g.id === j.groupId)!)) needed.add(k);
    for (const k of [...needed].sort()) {
      const st = sh.checklist[k as keyof typeof sh.checklist];
      items.push({ item: `${sh.name}: ${k === 'accessibleEntry' ? 'accessible entry' : k === 'assistanceOnArrival' ? 'assistance on arrival' : 'ventilation operating'}`, confirmed: st === 'present', source: sh.steward, detail: st });
    }
  }
  for (const j of sc.journeys.slice().sort((a, b) => (a.groupId < b.groupId ? -1 : 1))) {
    const g = s.groups.find((x) => x.id === j.groupId)!;
    items.push({ item: `Departure instructions for ${g.name} available by minute ${g.instructionsAvailableAt}`, confirmed: !!s.instructionsConfirmed[g.id], source: 'resident representative', detail: 'instructions' });
  }
  const used = new Set<string>();
  for (const a of sc.crew) for (const b of a.batteries ?? []) if (b.deliveryId) used.add(b.deliveryId);
  for (const d of s.deliveries) if (d.resource === 'places' && shelters.has(d.location)) used.add(d.id);
  for (const id of [...used].sort()) {
    const d = s.deliveries.find((x) => x.id === id)!;
    items.push({ item: `Expected delivery: ${d.quantity} ${d.resource} at ${d.location} by minute ${d.minute}`, confirmed: d.confirmed, source: d.source, detail: 'delivery' });
  }
  return items;
}

export function essentialConfirmationErrors(s: Scenario, sc: Schedule): string[] {
  return essentialConfirmations(s, sc).filter((x) => !x.confirmed).map((x) => `unconfirmed essential input: ${x.item} (${x.source})`);
}

export interface PolicyValidation {
  valid: boolean;
  errors: string[];
  branches: Record<PassageState, ValidationResult>;
}

export function validatePolicy(s: Scenario, p: PolicyResult, opts: { approval?: boolean } = {}): PolicyValidation {
  const errors: string[] = [];
  const branches = {} as Record<PassageState, ValidationResult>;
  for (const st of ['open', 'blocked'] as PassageState[]) {
    const r = validateSchedule(s, p.branches[st], { state: p.inspection ? st : undefined, approval: opts.approval });
    branches[st] = r;
    errors.push(...r.errors.map((e) => `[${st}] ${e}`));
  }
  const conn = p.connection;
  if (p.inspection) {
    const n = p.inspection.prefixCrewCount;
    const o = p.branches.open.crew.slice(0, n), b = p.branches.blocked.crew.slice(0, n);
    if (JSON.stringify(o) !== JSON.stringify(b)) errors.push('shared prefix differs between states');
    const insp = o[n - 1];
    if (!insp || insp.kind !== 'inspect' || insp.end !== p.inspection.end) errors.push('the prefix must end with the inspection');
    const tObs = p.inspection.end;
    for (const st of ['open', 'blocked'] as PassageState[]) {
      const sc = p.branches[st];
      sc.crew.slice(0, n).forEach((a) => a.legs.forEach((l) => { if (l.conn === conn) errors.push(`[${st}] prefix crew movement uses the unknown connection before inspection`); }));
      sc.crew.slice(n).forEach((a) => { if (a.start < tObs) errors.push(`[${st}] branch activity starts before the observation`); });
      if (sc.crew.slice(n).some((a) => a.kind === 'inspect')) errors.push(`[${st}] more than one inspection`);
      for (const j of sc.journeys) {
        if (j.departure < tObs) {
          const other = p.branches[st === 'open' ? 'blocked' : 'open'].journeys.find((x) => x.groupId === j.groupId);
          if (!other || JSON.stringify(other.legs) !== JSON.stringify(j.legs) || other.departure !== j.departure) errors.push(`[${st}] group ${j.groupId} departs before the observation but its instructions differ between states`);
          if (j.legs.some((l) => l.conn === conn && l.start < tObs)) errors.push(`[${st}] group ${j.groupId} uses the unknown connection before inspection`);
        }
        for (const l of j.legs) if (l.conn === conn && l.start < tObs) errors.push(`[${st}] ${j.groupId} traverses the unknown connection before it is inspected`);
      }
    }
    if (p.branches.blocked.journeys.some((j) => j.legs.some((l) => l.conn === conn))) errors.push('[blocked] a journey crosses the blocked bypass');
    if (p.branches.blocked.crew.some((a) => a.legs.some((l) => l.conn === conn))) errors.push('[blocked] crew crosses the blocked bypass');
  } else {
    for (const st of ['open', 'blocked'] as PassageState[]) {
      for (const a of p.branches[st].crew) for (const l of a.legs) if (l.conn === conn) errors.push(`[${st}] uses the unknown connection without inspection`);
      for (const j of p.branches[st].journeys) for (const l of j.legs) if (l.conn === conn) errors.push(`[${st}] ${j.groupId} uses the unknown connection without inspection`);
    }
  }
  const nO = branches.open.objective.served, nB = branches.blocked.objective.served;
  if (p.objective.nOpen !== nO || p.objective.nBlocked !== nB) errors.push(`policy objective mismatch: claims ${p.objective.nOpen}/${p.objective.nBlocked}, validator finds ${nO}/${nB}`);
  if (p.objective.min !== Math.min(nO, nB) || p.objective.sum !== nO + nB) errors.push('policy min/sum mismatch');
  const worst = Math.max(branches.open.objective.maxExposure, branches.blocked.objective.maxExposure);
  if (Math.abs(p.objective.worstExposure - worst) > 1e-6) errors.push(`policy worst exposure mismatch ${p.objective.worstExposure} vs ${worst}`);
  return { valid: errors.length === 0, errors, branches };
}

/**
 * Validator view for the agreement gate: boundary states recomputed from primitive legs, work
 * intervals and the validator's own world (effects derived from completed work).
 */
export function validatorTimeline(s: Scenario, sc: Schedule, state?: PassageState): BoundarySnapshot[] {
  const w = withEffects(baseWorld(s), effectsFromCrew(s, sc.crew, state) as never);
  const H = s.horizon;
  const crew = sc.crew.slice().sort((a, b) => a.start - b.start);
  const crewPos = (t: number): { at: string | null; edge: string | null; activity: string | null } => {
    let at: string = s.crew.start;
    let cur: CrewActivity | null = null;
    for (const a of crew) { if (a.end <= t) at = a.to; else if (a.start <= t) { cur = a; break; } }
    if (!cur) return { at, edge: null, activity: null };
    const label = `${cur.kind}${cur.actionId ?? cur.groupId ? ':' + (cur.actionId ?? cur.groupId) : ''}`;
    let pos: { at: string | null; edge: string | null } = { at: cur.from, edge: null };
    for (const l of cur.legs) {
      if (l.start < t && t < l.end && l.conn) { pos = { at: null, edge: l.conn }; break; }
      if (l.end === t) pos = { at: l.to, edge: null };
      else if (l.start === t) { pos = { at: l.from, edge: null }; break; }
      else if (l.start < t && t < l.end) pos = { at: l.from, edge: null };
    }
    return { ...pos, activity: label };
  };
  const out: BoundarySnapshot[] = [];
  const exposure: Record<string, number> = {}, prot: Record<string, number> = {}, crossed: Record<string, boolean> = {};
  for (const g of s.groups) { exposure[g.id] = 0; prot[g.id] = 0; crossed[g.id] = false; }
  const jBy = new Map(sc.journeys.map((j) => [j.groupId, j] as const));
  const done = (t: number) => crew.filter((a) => a.kind === 'work' && a.end <= t);
  for (let t = 0; t <= H; t++) {
    const used = done(t).flatMap((a) => a.batteries ?? []);
    const local: Record<string, number> = {};
    for (const d of s.deliveries) if (d.confirmed && d.resource === 'batteries') local[d.location] = (local[d.location] ?? 0) + (d.minute <= t ? d.quantity : 0);
    for (const b of used) if (b.location !== 'pack') local[b.location] -= b.qty;
    const groups: BoundarySnapshot['groups'] = {};
    const shelters: Record<string, string[]> = {};
    for (const sh of s.shelters) shelters[sh.location] = [];
    for (const g of s.groups) {
      const j = jBy.get(g.id) ?? null;
      let at: string | null = g.location, edge: string | null = null, arrivedAt: number | null = null;
      if (j && t >= j.arrival) { at = j.shelter; arrivedAt = j.arrival; shelters[j.shelter].push(g.id); }
      else if (j && t >= j.departure) {
        const moving = j.legs.find((l) => l.conn && l.start < t && t < l.end);
        if (moving) { at = null; edge = moving.conn; }
        else { const l = j.legs.find((x) => x.end === t) ?? j.legs.find((x) => x.start <= t && t <= x.end); at = l ? (l.end === t ? l.to : l.from) : g.location; }
      }
      groups[g.id] = { at, edge, arrivedAt, exposure: round6(exposure[g.id]), protected: prot[g.id] };
    }
    out.push({ t, crew: crewPos(t), batteries: { consumed: used.reduce((n, b) => n + b.qty, 0), pack: s.crew.batteries - used.filter((b) => b.location === 'pack').reduce((n, b) => n + b.qty, 0), local }, shelters, groups });
    if (t === H) break;
    for (const g of s.groups) {
      const j = jBy.get(g.id) ?? null;
      const p = residentPosition(g.location, j, t);
      exposure[g.id] += p.node ? (w.shelters.has(p.node) ? 0 : nodeHazard(w, p.node, t)) : p.conn ? connHazard(w, p.conn, t) : 0;
      if (p.node === g.location && !crossed[g.id]) { if (nodeHazard(w, g.location, t) >= w.thr) crossed[g.id] = true; else prot[g.id]++; }
    }
  }
  return out;
}
