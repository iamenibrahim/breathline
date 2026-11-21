// Bounded stress evaluation of the SELECTED plan under eight declared combinations
// (extra fan-repair minutes 0/1/3/4 x original-growth multiplier 1.0/1.2). Task order, crew paths,
// resident paths and shelter choices are preserved; dependent tasks and departures are propagated
// when a prerequisite finishes later; independent departures and intentional waits are preserved.
// The result is revalidated by the independent validator. Recompute-under-conditions is separate.
import type { CrewActivity, GroupId, Journey, Leg, PlanResult, PolicyResult, Scenario, Schedule } from './types';
import { validateSchedule } from './validator';
import { planAny } from './policy';
import { dependencies } from './explain';

export interface StressVariant { id: string; repairDelay: number; multiplier: number }

export const STRESS_VARIANTS: StressVariant[] = [0, 1, 3, 4].flatMap((d) => [1.0, 1.2].map((m) => ({ id: `+${d}min x${m.toFixed(1)}`, repairDelay: d, multiplier: m })));

export function perturb(s: Scenario, v: StressVariant): Scenario {
  const x: Scenario = JSON.parse(JSON.stringify(s));
  for (const a of x.actions) if (a.kind === 'repair') a.duration += v.repairDelay;
  x.hazardMultiplier = v.multiplier;
  return x;
}

const shiftLegs = (legs: Leg[], d: number): Leg[] => legs.map((l) => ({ ...l, start: l.start + d, end: l.end + d }));

/** Propagate the selected schedule into perturbed conditions without re-optimising it. */
export function propagate(orig: Scenario, pert: Scenario, sc: Schedule): Schedule {
  const crew: CrewActivity[] = [];
  let prevEnd = 0;
  const completion = new Map<string, number>(); // actionId -> new completion
  const escortShift = new Map<GroupId, number>();
  for (const a of sc.crew) {
    const start = Math.max(a.start, prevEnd);
    const d = start - a.start;
    let na: CrewActivity;
    if (a.kind === 'work' || a.kind === 'inspect') {
      const dur = pert.actions.find((x) => x.id === a.actionId)!.duration;
      na = { ...a, start, end: start + dur, legs: [{ from: a.from, to: a.from, conn: null, start, end: start + dur }] };
      completion.set(a.actionId!, start + dur);
    } else if (a.kind === 'wait') {
      const end = Math.max(a.end, start);
      na = { ...a, start, end, legs: [{ from: a.from, to: a.from, conn: null, start, end }] };
    } else {
      na = { ...a, start, end: a.end + d, legs: shiftLegs(a.legs, d) };
      if (a.kind === 'escort') escortShift.set(a.groupId!, d);
    }
    crew.push(na);
    prevEnd = na.end;
  }
  const opened = new Map<string, number>();
  for (const a of crew) if (a.kind === 'work') {
    const ef = pert.actions.find((x) => x.id === a.actionId)!.effect;
    if (ef.type === 'openConnection') opened.set(ef.connection, a.end);
  }
  const journeys: Journey[] = sc.journeys.map((j) => {
    let d = j.escorted ? escortShift.get(j.groupId) ?? 0 : 0;
    if (!j.escorted) for (const l of j.legs) if (l.conn && opened.has(l.conn)) d = Math.max(d, opened.get(l.conn)! - l.start);
    return d > 0 ? { ...j, departure: j.departure + d, arrival: j.arrival + d, legs: shiftLegs(j.legs, d) } : j;
  });
  void orig; void completion;
  return { ...sc, crew, journeys };
}

export interface StressRow {
  variant: StressVariant;
  feasibleGroups: GroupId[];
  failedGroups: { group: GroupId; constraints: string[] }[];
  globalFailures: string[];
  residentsFeasible: number;
  note: string;
}

export function stressSelected(s: Scenario, sc: Schedule): StressRow[] {
  return STRESS_VARIANTS.map((v) => {
    const pert = perturb(s, v);
    const prop = propagate(s, pert, sc);
    const val = validateSchedule(pert, prop);
    const assigned = new Set(sc.journeys.map((j) => j.groupId));
    const feasible: GroupId[] = [], failed: StressRow['failedGroups'] = [];
    for (const g of s.groups) {
      if (!assigned.has(g.id)) continue;
      const gc = val.groups[g.id];
      if (gc.served) feasible.push(g.id); else failed.push({ group: g.id, constraints: gc.errors });
    }
    const global = val.errors.filter((e) => !e.startsWith('group ') && !e.startsWith('objective mismatch'));
    // a crew failure (e.g. work running past the horizon) invalidates the groups that depend on the crew:
    // escorted groups and groups whose journeys depend on completed work
    if (global.length) {
      const dependent = new Set([...sc.journeys.filter((j) => j.escorted).map((j) => j.groupId), ...dependencies(s, sc).map((d) => d.groupId)]);
      for (const g of feasible.slice()) if (dependent.has(g)) { feasible.splice(feasible.indexOf(g), 1); failed.push({ group: g, constraints: global }); }
    }
    return {
      variant: v, feasibleGroups: feasible, failedGroups: failed, globalFailures: global,
      residentsFeasible: feasible.reduce((n, gid) => n + s.groups.find((g) => g.id === gid)!.count, 0),
      note: v.repairDelay > 0 && !sc.crew.some((a) => a.kind === 'work' && s.actions.find((x) => x.id === a.actionId)?.kind === 'repair') ? 'Plan contains no repair: delay has no effect.' : '',
    };
  });
}

export function recomputeUnder(s: Scenario, v: StressVariant): PlanResult | PolicyResult {
  return planAny(perturb(s, v));
}

export { type Schedule };
