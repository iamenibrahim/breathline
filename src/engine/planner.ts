// Confirmed-state planner: bounded enumeration of intervention subsets and orders (each target at
// most once), physical crew travel, escorts and joint resident assignment, optimised
// lexicographically:
//   1 residents assigned  2 protected person-minutes for unresolved residents  3 worst per-person
//   exposure among assigned  4 crew busy minutes  5 batteries  6 final arrival  7 stable ids.
// The search is seeded with the no-intervention baseline. Scenario names are never read.
import type { ConnId, GroupId, PassageState, PlanResult, Scenario, Schedule, SearchInfo } from './types';
import { assignJoint, type AssignResult } from './assign';
import { initialCrew, listTasks, performTask, type CrewState, type Task } from './crew';
import { groupDP, type Candidate } from './routing';
import { baseWorld, protectedMinutes, waitExposure, type World } from './world';
import { compareObjective, inputHash, suitableShelters } from './common';

export interface PlanOptions {
  kinds?: string[] | null; // enabled action kinds; null = all offered
  escort?: boolean;
  assumed?: Record<ConnId, PassageState>;
  budget?: { maxPlans?: number; timeLimitMs?: number };
  revision?: number;
  restriction?: string;
  requirePrefix?: string[]; // component checks: only responses that begin with these tasks (e.g. fan first)
}

export const DEFAULT_BUDGET = { maxPlans: 20000, timeLimitMs: 8000 };

export const SEARCH_SCOPE = [
  'Each offered intervention and each escort is used at most once; every subset and order is enumerated.',
  'The crew starts each task as soon as it arrives by the earliest safe route and the task’s batteries are on hand; it waits only for on-hand batteries or a group’s departure.',
  'Work and escorts must complete within the horizon.',
  'Escort candidates: the earliest admission at each suitable shelter, plus the earliest admission at or after each confirmed place-delivery minute.',
  'Resident candidates: one minimum-exposure trajectory per (shelter, admission minute) from a time-expanded search with waiting; capacity conflicts trigger a residual-capacity re-search.',
  'Joint assignment considers every subset of servable groups.',
];

export interface CandidateCache { map: Map<string, Candidate[]> }

export function residentCandidates(s: Scenario, w: World, cache: CandidateCache | null, excluded: Set<GroupId>): Map<GroupId, Candidate[]> {
  const out = new Map<GroupId, Candidate[]>();
  for (const g of s.groups) {
    if (excluded.has(g.id) || g.escortRequired) continue;
    const k = `${w.sig}|${g.id}`;
    let c = cache?.map.get(k);
    if (!c) {
      c = groupDP({ worlds: [w], group: g, minDeparture: g.instructionsAvailableAt, shelters: suitableShelters(s, g), stepFree: g.stepFree });
      cache?.map.set(k, c);
    }
    out.set(g.id, c);
  }
  return out;
}

export function evaluateCrewState(s: Scenario, st: CrewState, cache: CandidateCache | null, stats?: { assignments: number }): { schedule: Schedule; assign: AssignResult } | null {
  const w = st.world;
  const fixedIds = new Set(st.escorts.map((j) => j.groupId));
  const candidates = residentCandidates(s, w, cache, fixedIds);
  const protectedMin: Record<string, number> = {};
  const minDeparture: Record<string, number> = {};
  for (const g of s.groups) { protectedMin[g.id] = protectedMinutes(w, g.location); minDeparture[g.id] = g.instructionsAvailableAt; }
  const a = assignJoint({ s, world: w, fixed: st.escorts, candidates, protectedMin, minDeparture, stats });
  if (!a) return null;
  return { schedule: buildSchedule(s, st, a, w), assign: a };
}

export function buildSchedule(s: Scenario, st: CrewState, a: AssignResult, w: World): Schedule {
  const protectedMap: Record<string, number> = {};
  const expU: Record<string, number> = {};
  for (const gid of a.unresolved) {
    const g = s.groups.find((x) => x.id === gid)!;
    protectedMap[gid] = protectedMinutes(w, g.location);
    expU[gid] = waitExposure(w, g.location, 0, w.H);
  }
  const tieKey = `${String(a.arrSum).padStart(4, '0')}|${st.done.join('>')}#${a.key}`;
  return {
    crew: st.activities,
    journeys: a.journeys,
    effects: st.effects,
    unresolved: a.unresolved,
    protectedMinutes: protectedMap,
    exposureUnresolved: expU,
    objective: { served: a.served, protectedPM: a.protectedPM, maxExposure: a.maxExposure, busy: st.busy, batteries: st.batteriesUsed, finalArrival: a.finalArrival, tieKey },
    tasks: st.done,
  };
}

let planCounter = 0;

export function planConfirmed(s: Scenario, opts: PlanOptions = {}): PlanResult {
  const t0 = Date.now();
  const budget = { ...DEFAULT_BUDGET, ...(opts.budget ?? {}) };
  const w0 = baseWorld(s, opts.assumed);
  const tasks = listTasks(s, { kinds: opts.kinds ?? null, escort: opts.escort !== false, includeInspect: false });
  const cache: CandidateCache = { map: new Map() };
  const stats = { assignments: 0 };
  let explored = 0;
  let limited = false;
  let best: Schedule | null = null;
  const everServed = new Set<string>();

  const prefix = opts.requirePrefix ?? [];
  const visit = (st: CrewState) => {
    if (limited) return;
    if (explored >= budget.maxPlans || Date.now() - t0 > budget.timeLimitMs) { limited = true; return; }
    explored++;
    const depth = st.done.length;
    const ev = depth >= prefix.length ? evaluateCrewState(s, st, cache, stats) : null;
    if (ev) {
      for (const j of ev.schedule.journeys) everServed.add(j.groupId);
      if (!best || compareObjective(ev.schedule.objective, best.objective) < 0) best = ev.schedule;
    }
    for (const task of tasks) {
      if (st.done.includes(task.id)) continue;
      if (depth < prefix.length && task.id !== prefix[depth]) continue;
      for (const nx of performTask(s, st, task)) visit(nx);
      if (limited) return;
    }
  };
  visit(initialCrew(s, w0)); // the root is the no-intervention baseline (seed)

  const finalBest = best as Schedule | null;
  const status: SearchInfo['status'] = limited
    ? (finalBest && finalBest.objective.served > 0 ? 'best-before-limit' : 'none-before-limit')
    : (!finalBest || finalBest.objective.served === 0 ? 'proven-infeasible' : 'exhaustive');
  const search: SearchInfo = {
    status, explored, assignments: stats.assignments, elapsedMs: Date.now() - t0, budget, scope: SEARCH_SCOPE,
    groupsEverServed: [...everServed].sort(),
  };
  const schedule: Schedule = finalBest ?? emptySchedule(s, w0);
  return { kind: 'schedule', id: `plan-${++planCounter}-${inputHash(s).slice(0, 6)}`, inputRevision: opts.revision ?? 0, inputHash: inputHash(s), schedule, search, restriction: opts.restriction };
}

function emptySchedule(s: Scenario, w: World): Schedule {
  const protectedMap: Record<string, number> = {};
  const expU: Record<string, number> = {};
  let prot = 0;
  for (const g of s.groups) { protectedMap[g.id] = protectedMinutes(w, g.location); expU[g.id] = waitExposure(w, g.location, 0, w.H); prot += g.count * protectedMap[g.id]; }
  return { crew: [], journeys: [], effects: [], unresolved: s.groups.map((g) => g.id), protectedMinutes: protectedMap, exposureUnresolved: expU,
    objective: { served: 0, protectedPM: prot, maxExposure: 0, busy: 0, batteries: 0, finalArrival: 0, tieKey: '' }, tasks: [] };
}

/** Component-removal / restricted planning helpers. */
export function planBaseline(s: Scenario, revision = 0): PlanResult {
  return planConfirmed(s, { kinds: [], escort: false, revision, restriction: 'No interventions' });
}

export function tasksForDisplay(s: Scenario): Task[] { return listTasks(s, { includeInspect: true }); }
