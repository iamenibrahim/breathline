// Physical crew actions: travel, wait for on-hand batteries, work, inspect, escort.
// The crew cannot overlap activities; its actual final location carries into the next activity.
import type { ActionDef, CrewActivity, EffectRecord, GroupDef, Journey, LocId, Scenario } from './types';
import { allocateBatteries, earliestBatteryMinute, initialPlanBatteries, placeBreakpoints, type PlanBatteryState } from './ledger';
import { crewPath, groupDP } from './routing';
import { nodeSafe, round6, withEffects, type World } from './world';
import { suitableShelters } from './common';

export interface CrewState {
  t: number;
  loc: LocId;
  bat: PlanBatteryState;
  busy: number;
  batteriesUsed: number;
  activities: CrewActivity[];
  effects: EffectRecord[];
  world: World;
  escorts: Journey[];
  done: string[]; // task ids in order
}

export type Task = { id: string; kind: 'action'; action: ActionDef } | { id: string; kind: 'escort'; group: GroupDef };

export function initialCrew(s: Scenario, world: World): CrewState {
  return { t: 0, loc: s.crew.start, bat: initialPlanBatteries(s), busy: 0, batteriesUsed: 0, activities: [], effects: [], world, escorts: [], done: [] };
}

function nextId(st: CrewState, kind: string) { return `${kind}-${st.activities.length + 1}`; }

function travel(st: CrewState, to: LocId): { st: CrewState; arrival: number } | null {
  const p = crewPath(st.world, st.loc, st.t, to);
  if (!p) return null;
  if (!p.legs.length) return { st, arrival: st.t };
  const act: CrewActivity = { id: nextId(st, 'travel'), kind: 'travel', start: st.t, end: p.arrival, from: st.loc, to, legs: p.legs };
  return { st: { ...st, activities: [...st.activities, act], t: p.arrival, loc: to, busy: st.busy + p.moving }, arrival: p.arrival };
}

/** Travel to the work location, wait until batteries are on hand, work; effect applies at completion. */
export function performAction(s: Scenario, st0: CrewState, a: ActionDef, opts: { applyEffect: boolean } = { applyEffect: true }): CrewState | null {
  if (a.requiresToolkit && !s.crew.toolkit) return null;
  const tr = travel(st0, a.workLocation);
  if (!tr) return null;
  let st = tr.st;
  const H = st.world.H;
  const start = earliestBatteryMinute(s, st.bat, a.workLocation, a.batteries, tr.arrival, H - a.duration);
  if (start === null) return null;
  for (let t = tr.arrival; t <= start + a.duration; t++) if (!nodeSafe(st.world, a.workLocation, t)) return null;
  const alloc = allocateBatteries(s, st.bat, a.workLocation, a.batteries, start);
  if (!alloc) return null;
  const acts = st.activities.slice();
  if (start > tr.arrival) {
    acts.push({ id: `wait-${acts.length + 1}`, kind: 'wait', start: tr.arrival, end: start, from: a.workLocation, to: a.workLocation,
      legs: [{ from: a.workLocation, to: a.workLocation, conn: null, start: tr.arrival, end: start }], reason: `waiting for batteries to be on hand for ${a.label}` });
  }
  const end = start + a.duration;
  acts.push({ id: `${a.kind === 'inspect' ? 'inspect' : 'work'}-${acts.length + 1}`, kind: a.kind === 'inspect' ? 'inspect' : 'work', start, end,
    from: a.workLocation, to: a.workLocation, legs: [{ from: a.workLocation, to: a.workLocation, conn: null, start, end }],
    actionId: a.id, batteries: alloc.sources });
  const effects = st.effects.slice();
  let world = st.world;
  if (opts.applyEffect && a.effect.type !== 'reveal') {
    const rec: EffectRecord = { actionId: a.id, at: end, effect: a.effect };
    effects.push(rec);
    world = withEffects(world, [rec]);
  }
  st = { ...st, activities: acts, effects, world, t: end, loc: a.workLocation, bat: alloc.next, busy: st.busy + a.duration, batteriesUsed: st.batteriesUsed + a.batteries, done: [...st.done, a.id] };
  return st;
}

/**
 * Escort: physically reach the group, then accompany its entire step-free journey to a suitable
 * shelter. Candidates: earliest admission per shelter, plus the earliest admission at or after each
 * confirmed place-delivery minute at that shelter (declared search scope).
 */
export function performEscort(s: Scenario, st0: CrewState, g: GroupDef): CrewState[] {
  const tr = travel(st0, g.location);
  if (!tr) return [];
  const st = tr.st;
  const shelters = suitableShelters(s, g);
  if (!shelters.length) return [];
  const cands = groupDP({ worlds: [st.world], group: g, minDeparture: Math.max(tr.arrival, g.instructionsAvailableAt), shelters, stepFree: g.stepFree });
  const chosen = new Map<string, (typeof cands)[number]>();
  for (const sh of shelters) {
    const forSh = cands.filter((c) => c.shelter === sh).sort((a, b) => a.arrival - b.arrival || a.exposures[0] - b.exposures[0]);
    if (!forSh.length) continue;
    chosen.set(forSh[0].key, forSh[0]);
    for (const b of placeBreakpoints(s, sh)) {
      const c = forSh.find((x) => x.arrival >= b);
      if (c) chosen.set(c.key, c);
    }
  }
  const out: CrewState[] = [];
  for (const c of [...chosen.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) {
    const acts = st.activities.slice();
    if (c.departure > tr.arrival) {
      acts.push({ id: `wait-${acts.length + 1}`, kind: 'wait', start: tr.arrival, end: c.departure, from: g.location, to: g.location,
        legs: [{ from: g.location, to: g.location, conn: null, start: tr.arrival, end: c.departure }], reason: `waiting with ${g.name} until departure` });
    }
    acts.push({ id: `escort-${acts.length + 1}`, kind: 'escort', start: c.departure, end: c.arrival, from: g.location, to: c.shelter, legs: c.legs, groupId: g.id });
    const j: Journey = {
      groupId: g.id, shelter: c.shelter, departure: c.departure, arrival: c.arrival, legs: c.legs, escorted: true,
      exposure: c.exposures[0], waitingExposure: c.waiting[0], travelExposure: round6(c.exposures[0] - c.waiting[0]),
    };
    out.push({ ...st, activities: acts, t: c.arrival, loc: c.shelter, busy: st.busy + (c.arrival - c.departure), escorts: [...st.escorts, j], done: [...st.done, `escort-${g.id}`] });
  }
  return out;
}

export function performTask(s: Scenario, st: CrewState, task: Task): CrewState[] {
  if (task.kind === 'action') { const r = performAction(s, st, task.action); return r ? [r] : []; }
  return performEscort(s, st, task.group);
}

export function listTasks(s: Scenario, opts: { kinds?: string[] | null; escort?: boolean; includeInspect?: boolean }): Task[] {
  const tasks: Task[] = [];
  for (const a of s.actions) {
    if (!a.offered) continue;
    if (a.kind === 'inspect' && !opts.includeInspect) continue;
    if (opts.kinds && !opts.kinds.includes(a.kind)) continue;
    tasks.push({ id: a.id, kind: 'action', action: a });
  }
  if (opts.escort !== false) for (const g of s.groups) if (g.escortRequired) tasks.push({ id: `escort-${g.id}`, kind: 'escort', group: g });
  return tasks.sort((a, b) => (a.id < b.id ? -1 : 1));
}
