// Joint resident assignment. Groups are indivisible and assigned jointly: every subset of servable
// groups is considered (largest population first), and for each subset the combination of
// per-(shelter, admission minute) candidates that minimises the worst per-person exposure and then
// the final arrival is found by threshold search with depth-first feasibility checks over shared
// shelter places, corridor capacity and node capacity. Capacity conflicts trigger a residual-capacity
// search for an alternative trajectory, so a greedy first route never blocks another group.
import type { GroupDef, GroupId, Journey, LocId, Scenario } from './types';
import { checkAdmissions, type Admission } from './ledger';
import { homeUsage, journeyUsage, Residual, type Usage } from './reservations';
import { groupDP, type Candidate } from './routing';
import { round6, type World } from './world';
import { suitableShelters } from './common';

export interface AssignInput {
  s: Scenario;
  world: World;
  fixed: Journey[]; // escorted journeys; their groups must be served
  candidates: Map<GroupId, Candidate[]>;
  protectedMin: Record<GroupId, number>;
  minDeparture: Record<GroupId, number>;
  stats?: { assignments: number };
}

export interface AssignResult {
  journeys: Journey[];
  unresolved: GroupId[];
  served: number;
  protectedPM: number;
  maxExposure: number;
  finalArrival: number;
  arrSum: number; // sum of arrival minutes (deterministic tie resolution: earlier arrivals first)
  key: string;
}

export function candToJourney(c: Candidate, groupId: GroupId, escorted = false, worldIndex = 0): Journey {
  return {
    groupId, shelter: c.shelter, departure: c.departure, arrival: c.arrival, legs: c.legs, escorted,
    exposure: c.exposures[worldIndex], waitingExposure: c.waiting[worldIndex], travelExposure: round6(c.exposures[worldIndex] - c.waiting[worldIndex]),
  };
}

function admissionsFor(js: Journey[], s: Scenario): Map<LocId, Admission[]> {
  const m = new Map<LocId, Admission[]>();
  for (const j of js) {
    const g = s.groups.find((x) => x.id === j.groupId)!;
    const l = m.get(j.shelter) ?? [];
    l.push({ group: j.groupId, minute: j.arrival, count: g.count });
    m.set(j.shelter, l);
  }
  return m;
}

export function assignJoint(inp: AssignInput): AssignResult | null {
  const { s, world } = inp;
  const H = world.H;
  const gById = new Map(s.groups.map((g) => [g.id, g] as const));
  const fixedIds = new Set(inp.fixed.map((j) => j.groupId));
  const candGroups = s.groups.filter((g) => !fixedIds.has(g.id) && (inp.candidates.get(g.id)?.length ?? 0) > 0).sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1));
  const fixedCount = inp.fixed.reduce((n, j) => n + gById.get(j.groupId)!.count, 0);

  const subsets: { mask: number; served: number; prot: number }[] = [];
  for (let mask = 0; mask < 1 << candGroups.length; mask++) {
    let served = fixedCount;
    const inS = new Set<string>(fixedIds);
    candGroups.forEach((g, i) => { if (mask & (1 << i)) { served += g.count; inS.add(g.id); } });
    let prot = 0;
    for (const g of s.groups) if (!inS.has(g.id)) prot += g.count * (inp.protectedMin[g.id] ?? 0);
    subsets.push({ mask, served, prot });
  }
  subsets.sort((a, b) => b.served - a.served || b.prot - a.prot || a.mask - b.mask);

  let best: AssignResult | null = null;
  for (const sub of subsets) {
    if (best && (sub.served < best.served || (sub.served === best.served && sub.prot < best.protectedPM))) break;
    const members = candGroups.filter((_, i) => sub.mask & (1 << i));
    const r = solveSubset(inp, members, fixedIds, H);
    if (inp.stats) inp.stats.assignments++;
    if (!r) continue;
    const unresolved = s.groups.filter((g) => !fixedIds.has(g.id) && !members.includes(g)).map((g) => g.id).sort();
    const journeys = [...inp.fixed, ...r.journeys].sort((a, b) => (a.groupId < b.groupId ? -1 : 1));
    const res: AssignResult = {
      journeys, unresolved, served: sub.served, protectedPM: sub.prot,
      maxExposure: journeys.length ? Math.max(...journeys.map((j) => j.exposure)) : 0,
      finalArrival: journeys.length ? Math.max(...journeys.map((j) => j.arrival)) : 0,
      arrSum: journeys.reduce((n, j) => n + j.arrival, 0),
      key: journeys.map((j) => `${j.groupId}:${j.shelter}@${j.arrival}/${j.departure}`).join(','),
    };
    if (!best || better(res, best)) best = res;
  }
  return best;
}

function better(a: AssignResult, b: AssignResult): boolean {
  if (a.served !== b.served) return a.served > b.served;
  if (a.protectedPM !== b.protectedPM) return a.protectedPM > b.protectedPM;
  if (Math.abs(a.maxExposure - b.maxExposure) > 1e-9) return a.maxExposure < b.maxExposure;
  if (a.finalArrival !== b.finalArrival) return a.finalArrival < b.finalArrival;
  if (a.arrSum !== b.arrSum) return a.arrSum < b.arrSum;
  return a.key < b.key;
}

function solveSubset(inp: AssignInput, members: GroupDef[], fixedIds: Set<string>, H: number): { journeys: Journey[] } | null {
  const { s, world } = inp;
  const gById = new Map(s.groups.map((g) => [g.id, g] as const));
  const base = new Residual(world);
  const memberIds = new Set(members.map((g) => g.id));
  for (const g of s.groups) if (!fixedIds.has(g.id) && !memberIds.has(g.id)) base.add(homeUsage(g.id, g.count, g.location, H));
  for (const j of inp.fixed) {
    const g = gById.get(j.groupId)!;
    const u = journeyUsage(j, g.count, g.location, world.shelters);
    if (!base.fits(u).ok) return null;
    base.add(u);
  }
  const fixedAdm = admissionsFor(inp.fixed, s);
  for (const [sh, adm] of fixedAdm) if (!checkAdmissions(s, sh, adm, H).ok) return null;
  if (!members.length) return { journeys: [] };

  const fixedMaxE = inp.fixed.length ? Math.max(...inp.fixed.map((j) => j.exposure)) : 0;
  const fixedMaxA = inp.fixed.length ? Math.max(...inp.fixed.map((j) => j.arrival)) : 0;
  const lbE = Math.max(fixedMaxE, ...members.map((g) => inp.candidates.get(g.id)![0] ? Math.min(...inp.candidates.get(g.id)!.map((c) => c.exposures[0])) : Infinity));
  if (lbE === Infinity) return null;
  const expVals = [...new Set(members.flatMap((g) => inp.candidates.get(g.id)!.map((c) => c.exposures[0])))].filter((e) => e >= lbE - 1e-9).sort((a, b) => a - b);
  if (!expVals.length || expVals[0] > lbE + 1e-9) expVals.unshift(lbE);

  let eStar: number | null = null;
  for (const e of expVals) {
    if (dfs(inp, members, base, fixedAdm, e, H, H) ) { eStar = Math.max(e, fixedMaxE); break; }
  }
  if (eStar === null) return null;
  const lbA = Math.max(fixedMaxA, ...members.map((g) => Math.min(...inp.candidates.get(g.id)!.filter((c) => c.exposures[0] <= eStar! + 1e-9).map((c) => c.arrival), Infinity)));
  for (let a = Math.max(0, lbA === Infinity ? 0 : lbA); a <= H; a++) {
    const r = dfs(inp, members, base, fixedAdm, eStar, a, H);
    if (r) return { journeys: r };
  }
  return null;
}

function dfs(inp: AssignInput, members: GroupDef[], res: Residual, adm0: Map<LocId, Admission[]>, eCap: number, aCap: number, H: number): Journey[] | null {
  const adm = new Map([...adm0.entries()].map(([k, v]) => [k, v.slice()] as const));
  const usages0: Usage[] = [];
  const out = dfsInner(inp, members, res, adm, eCap, aCap, H, usages0);
  for (const u of usages0) res.remove(u); // leave the shared residual untouched
  return out;
}

function dfsInner(inp: AssignInput, members: GroupDef[], res: Residual, adm: Map<LocId, Admission[]>, eCap: number, aCap: number, H: number, usages: Usage[]): Journey[] | null {
  const { s, world } = inp;
  const chosen: Journey[] = [];
  const rec = (i: number): boolean => {
    if (i === members.length) return true;
    const g = members[i];
    const tryCand = (c: Candidate): boolean => {
      if (c.exposures[0] > eCap + 1e-9 || c.arrival > aCap) return false;
      const j = candToJourney(c, g.id);
      const u = journeyUsage(j, g.count, g.location, world.shelters);
      if (!res.fits(u).ok) return false;
      const list = (adm.get(c.shelter) ?? []).slice();
      list.push({ group: g.id, minute: c.arrival, count: g.count });
      if (!checkAdmissions(s, c.shelter, list, H).ok) return false;
      res.add(u); usages.push(u); chosen.push(j);
      const prev = adm.get(c.shelter);
      adm.set(c.shelter, list);
      if (rec(i + 1)) return true;
      if (prev) adm.set(c.shelter, prev); else adm.delete(c.shelter);
      res.remove(u); usages.pop(); chosen.pop();
      return false;
    };
    const cands = inp.candidates.get(g.id)!;
    const tried = new Set<string>();
    let capacityConflict = false;
    for (const c of cands) {
      tried.add(c.key + '|' + c.departure);
      if (tryCand(c)) return true;
      if (c.exposures[0] <= eCap + 1e-9 && c.arrival <= aCap) {
        const u = journeyUsage(candToJourney(c, g.id), g.count, g.location, world.shelters);
        if (!res.fits(u).ok) capacityConflict = true;
      }
    }
    if (capacityConflict) {
      // corridor/node conflict: search again around current reservations
      const alt = groupDP({ worlds: [world], group: g, minDeparture: inp.minDeparture[g.id] ?? g.instructionsAvailableAt, shelters: suitableShelters(s, g), stepFree: g.stepFree, residual: res });
      for (const c of alt) {
        if (tried.has(c.key + '|' + c.departure)) continue;
        if (tryCand(c)) return true;
      }
    }
    return false;
  };
  return rec(0) ? chosen.slice() : null;
}
