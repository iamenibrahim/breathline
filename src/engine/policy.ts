// Bounded two-state policy planning: a shared action prefix, at most one inspection, and two
// mutually exclusive suffixes selected only by the observed result. The planner receives the
// knowledge snapshot only (one unknown connection with declared possible states), never truth.
// Policy objective (lexicographic): min(nOpen,nBlocked); nOpen+nBlocked; [protection min, sum when
// the fallback action is offered]; worst per-person exposure over both states; crew busy max, sum;
// batteries max, sum; latest arrival; stable ids. Criterion 2 is an explicit preference across two
// possibilities, not a probability estimate.
import type { ConnId, GroupId, Journey, PassageState, PolicyObjective, PolicyResult, Scenario, Schedule, SearchInfo } from './types';
import { assignJoint, candToJourney, type AssignResult } from './assign';
import { initialCrew, listTasks, performAction, performTask, type CrewState } from './crew';
import { placeBreakpoints } from './ledger';
import { buildSchedule, DEFAULT_BUDGET, planConfirmed, SEARCH_SCOPE, type PlanOptions } from './planner';
import { groupDP, type Candidate } from './routing';
import { baseWorld, protectedMinutes, withEffects, type World } from './world';
import { comparePolicy, inputHash, suitableShelters } from './common';

let policyCounter = 0;

export function scheduleToPolicyObjective(sc: Schedule, withProt: boolean): PolicyObjective {
  const o = sc.objective;
  return {
    nOpen: o.served, nBlocked: o.served, min: o.served, sum: 2 * o.served,
    protMin: withProt ? o.protectedPM : null, protSum: withProt ? 2 * o.protectedPM : null,
    worstExposure: o.maxExposure, busyMax: o.busy, busySum: 2 * o.busy, batMax: o.batteries, batSum: 2 * o.batteries,
    latestArrival: o.finalArrival, tieKey: `${String(2 * sc.journeys.reduce((n, j) => n + j.arrival, 0)).padStart(4, '0')}|noinspect#${o.tieKey}`,
  };
}

function thinCommon(s: Scenario, cands: Candidate[]): Candidate[] {
  const byShelter = new Map<string, Candidate[]>();
  for (const c of cands) { const l = byShelter.get(c.shelter) ?? []; l.push(c); byShelter.set(c.shelter, l); }
  const out: Candidate[] = [];
  for (const [sh, list] of byShelter) {
    list.sort((a, b) => a.arrival - b.arrival || Math.max(...a.exposures) - Math.max(...b.exposures));
    let bestE = Infinity;
    const bps = placeBreakpoints(s, sh);
    const keep = new Set<Candidate>();
    for (const c of list) {
      const e = Math.max(...c.exposures);
      if (e < bestE - 1e-9) { keep.add(c); bestE = e; }
    }
    for (const b of bps) { const c = list.find((x) => x.arrival >= b); if (c) keep.add(c); }
    out.push(...keep);
  }
  return out.sort((a, b) => Math.max(...a.exposures) - Math.max(...b.exposures) || a.arrival - b.arrival || (a.key < b.key ? -1 : 1));
}

interface Pair { o: CrewState; b: CrewState }

export function planPolicy(s: Scenario, opts: PlanOptions = {}): PolicyResult {
  const t0 = Date.now();
  const budget = { ...DEFAULT_BUDGET, ...(opts.budget ?? {}) };
  const unk = s.knowledge.unknown;
  if (!unk) throw new Error('planPolicy requires an unknown connection in the knowledge model');
  const conn: ConnId = unk.connection;
  const states = unk.possible.slice().sort() as PassageState[]; // ['blocked','open']
  const withProt = s.actions.some((a) => a.offered && a.kind === 'ventilate' && (!opts.kinds || opts.kinds.includes('ventilate')));
  const inspect = s.actions.find((a) => a.offered && a.kind === 'inspect' && a.effect.type === 'reveal' && a.effect.connection === conn);

  // 1. Responses restricted to confirmed routes (no inspection): the unknown connection is unavailable.
  const noInsp = planConfirmed(s, { ...opts, assumed: undefined });
  const noInspObj = scheduleToPolicyObjective(noInsp.schedule, withProt);
  let bestObj: PolicyObjective = noInspObj;
  let best: { branches: Record<PassageState, Schedule>; inspection: PolicyResult['inspection']; common: GroupId[] } = {
    branches: { open: noInsp.schedule, blocked: noInsp.schedule } as Record<PassageState, Schedule>, inspection: null, common: [],
  };
  let explored = noInsp.search.explored;
  let assignments = noInsp.search.assignments;
  let limited = noInsp.search.status === 'best-before-limit' || noInsp.search.status === 'none-before-limit';
  const everServed = new Set(noInsp.search.groupsEverServed);

  if (inspect && (!opts.kinds || opts.kinds.includes('inspect'))) {
    const tasks = listTasks(s, { kinds: opts.kinds ?? null, escort: opts.escort !== false, includeInspect: false });
    const w0 = baseWorld(s);
    const lateCache = new Map<string, Candidate[]>();
    const commonCache = new Map<string, Candidate[]>();
    const stats = { assignments: 0 };
    const groups = s.groups.filter((g) => !g.escortRequired);

    const late = (w: World, gid: string, tObs: number) => {
      const g = s.groups.find((x) => x.id === gid)!;
      const k = `${w.sig}|${gid}|${tObs}`;
      let c = lateCache.get(k);
      if (!c) { c = groupDP({ worlds: [w], group: g, minDeparture: Math.max(g.instructionsAvailableAt, tObs), shelters: suitableShelters(s, g), stepFree: g.stepFree }); lateCache.set(k, c); }
      return c;
    };
    const common = (wo: World, wb: World, gid: string, tObs: number) => {
      const g = s.groups.find((x) => x.id === gid)!;
      const k = `${wo.sig}||${wb.sig}|${gid}|${tObs}`;
      let c = commonCache.get(k);
      if (!c) {
        c = thinCommon(s, groupDP({ worlds: [wo, wb], group: g, minDeparture: g.instructionsAvailableAt, maxDepartureExcl: tObs, shelters: suitableShelters(s, g), stepFree: g.stepFree }));
        commonCache.set(k, c);
      }
      return c;
    };

    const evaluatePair = (prefix: CrewState, tObs: number, pair: Pair) => {
      const W: Record<PassageState, World> = { open: pair.o.world, blocked: pair.b.world };
      const prefixEscorts = prefix.escorts;
      const escorted: Record<PassageState, Set<string>> = {
        open: new Set(pair.o.escorts.map((j) => j.groupId)), blocked: new Set(pair.b.escorts.map((j) => j.groupId)),
      };
      const commonOpts: { gid: string; cands: (Candidate | null)[] }[] = groups
        .filter((g) => !escorted.open.has(g.id) && !escorted.blocked.has(g.id))
        .map((g) => ({ gid: g.id, cands: [null, ...common(W.open, W.blocked, g.id, tObs)] }));
      const prot: Record<PassageState, Record<string, number>> = { open: {}, blocked: {} };
      for (const st of states) for (const g of s.groups) prot[st][g.id] = protectedMinutes(W[st], g.location);
      const kappa: (Candidate | null)[] = [];
      const recK = (i: number) => {
        if (limited) return;
        if (i === commonOpts.length) {
          if (explored >= budget.maxPlans || Date.now() - t0 > budget.timeLimitMs) { limited = true; return; }
          explored++;
          const res: Partial<Record<PassageState, AssignResult>> = {};
          for (const [wi, st] of (['open', 'blocked'] as PassageState[]).entries()) {
            const fixed: Journey[] = [...(st === 'open' ? pair.o : pair.b).escorts];
            const kGroups = new Set<string>();
            kappa.forEach((c, idx) => { if (c) { fixed.push(candToJourney(c, commonOpts[idx].gid, false, wi)); kGroups.add(commonOpts[idx].gid); } });
            const fixedIds = new Set(fixed.map((j) => j.groupId));
            const candidates = new Map<string, Candidate[]>();
            const minDeparture: Record<string, number> = {};
            for (const g of s.groups) {
              minDeparture[g.id] = Math.max(g.instructionsAvailableAt, tObs);
              if (g.escortRequired || fixedIds.has(g.id)) continue;
              candidates.set(g.id, late(W[st], g.id, tObs));
            }
            const r = assignJoint({ s, world: W[st], fixed, candidates, protectedMin: prot[st], minDeparture, stats });
            if (!r) return;
            res[st] = r;
          }
          const ro = res.open!, rb = res.blocked!;
          for (const j of [...ro.journeys, ...rb.journeys]) everServed.add(j.groupId);
          const commonIds = [...prefixEscorts.map((j) => j.groupId), ...commonOpts.filter((_, idx) => kappa[idx]).map((c) => c.gid)].sort();
          const obj: PolicyObjective = {
            nOpen: ro.served, nBlocked: rb.served, min: Math.min(ro.served, rb.served), sum: ro.served + rb.served,
            protMin: withProt ? Math.min(ro.protectedPM, rb.protectedPM) : null, protSum: withProt ? ro.protectedPM + rb.protectedPM : null,
            worstExposure: Math.max(ro.maxExposure, rb.maxExposure),
            busyMax: Math.max(pair.o.busy, pair.b.busy), busySum: pair.o.busy + pair.b.busy,
            batMax: Math.max(pair.o.batteriesUsed, pair.b.batteriesUsed), batSum: pair.o.batteriesUsed + pair.b.batteriesUsed,
            latestArrival: Math.max(ro.finalArrival, rb.finalArrival),
            tieKey: `${String(ro.arrSum + rb.arrSum).padStart(4, '0')}|inspect#${prefix.done.join('>')}|o:${pair.o.done.join('>')}#${ro.key}|b:${pair.b.done.join('>')}#${rb.key}`,
          };
          if (comparePolicy(obj, bestObj) < 0) {
            bestObj = obj;
            const insp = prefix.activities[prefix.activities.length - 1];
            best = {
              branches: { open: buildSchedule(s, pair.o, ro, W.open), blocked: buildSchedule(s, pair.b, rb, W.blocked) } as Record<PassageState, Schedule>,
              inspection: { actionId: inspect.id, location: inspect.workLocation, start: insp.start, end: insp.end, prefixCrewCount: prefix.activities.length },
              common: commonIds,
            };
          }
          return;
        }
        for (const c of commonOpts[i].cands) { kappa[i] = c; recK(i + 1); if (limited) return; }
        kappa.length = i;
      };
      recK(0);
    };

    const suffixes = (st: CrewState): CrewState[] => {
      const out: CrewState[] = [];
      const rec = (x: CrewState) => {
        out.push(x);
        for (const task of tasks) {
          if (x.done.includes(task.id)) continue;
          for (const nx of performTask(s, x, task)) rec(nx);
        }
      };
      rec(st);
      return out;
    };

    const visitPrefix = (st: CrewState) => {
      if (limited) return;
      // inspect now
      const ins = performAction(s, st, inspect, { applyEffect: false });
      if (ins) {
        const tObs = ins.t;
        const branchStart = (state: PassageState): CrewState => {
          const rec = { actionId: inspect.id, at: tObs, effect: inspect.effect, revealed: state } as never;
          return { ...ins, world: withEffects(ins.world, [rec]), effects: [...ins.effects, rec] };
        };
        const so = suffixes(branchStart('open'));
        const sb = suffixes(branchStart('blocked'));
        for (const o of so) for (const b of sb) { evaluatePair(ins, tObs, { o, b }); if (limited) return; }
      }
      for (const task of tasks) {
        if (st.done.includes(task.id)) continue;
        for (const nx of performTask(s, st, task)) visitPrefix(nx);
        if (limited) return;
      }
    };
    visitPrefix(initialCrew(s, w0));
    assignments += stats.assignments;
  }

  const status: SearchInfo['status'] = limited
    ? (bestObj.min > 0 || bestObj.sum > 0 ? 'best-before-limit' : 'none-before-limit')
    : (bestObj.sum === 0 ? 'proven-infeasible' : 'exhaustive');
  const search: SearchInfo = {
    status, explored, assignments, elapsedMs: Date.now() - t0, budget,
    scope: [
      ...SEARCH_SCOPE,
      'Policy: shared prefix of tasks, one inspection, then independently enumerated task suffixes per observed state.',
      'Pre-observation resident departures are identical in both states; candidates for them come from a two-state search valid in both states (Pareto-thinned per shelter).',
    ],
    groupsEverServed: [...everServed].sort(),
  };
  return {
    kind: 'policy', id: `policy-${++policyCounter}-${inputHash(s).slice(0, 6)}`, inputRevision: opts.revision ?? 0, inputHash: inputHash(s),
    connection: conn, inspection: best.inspection, commonGroups: best.common, branches: best.branches, objective: bestObj, search, noInspection: noInspObj,
    restriction: opts.restriction,
  };
}

/** Select confirmed-state or policy planning from the supplied knowledge model (never a fixture id). */
export function planAny(s: Scenario, opts: PlanOptions = {}) {
  return s.knowledge.unknown ? planPolicy(s, opts) : planConfirmed(s, opts);
}
