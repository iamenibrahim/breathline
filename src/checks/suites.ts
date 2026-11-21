// Evidence check suites. Every check computes its observed value through the ordinary engine; the
// expected value is a test assertion, never a planner input. Used by `npm test` and `npm run evidence`.
import type { AnyPlan, PlanResult, PolicyResult, Scenario, Truth } from '../engine/types';
import { defaultTruth, getScenario, scenarioD, scenarioE } from '../engine/scenarios';
import { planConfirmed, residentCandidates } from '../engine/planner';
import { planAny, planPolicy } from '../engine/policy';
import { validatePolicy, validateSchedule } from '../engine/validator';
import { agreementCheck, duplicateProcessingTest, interruptionTest } from '../engine/agreement';
import { compilePlan, executeWithCheckpoints, initSim, runToEnd, arrivedCount, type SimState } from '../engine/simulate';
import { buildExport, reproduceExport } from '../engine/exportRun';
import { computeRequests } from '../engine/requests';
import { perturb, recomputeUnder, stressSelected, STRESS_VARIANTS, propagate } from '../engine/stress';
import { approvePlan, isStale } from '../engine/approval';
import { diagnoseGroup, explainSchedule } from '../engine/explain';
import { groupBenefits } from '../engine/benefit';
import { canonical, inputHash, objectiveComponents, policyComponents } from '../engine/common';
import { baseWorld, hazardAt, nodeHazard, protectedMinutes, withEffects } from '../engine/world';
import { Residual, intervalsOverlap } from '../engine/reservations';
import { oracleConfirmed, oraclePolicy } from '../oracle/exhaustive';
import { generateTiny, GENERATOR_BOUNDS, greedyServed, mulberry32, tinyAssignment, tinyCorridor, tinyPolicy } from '../oracle/tiny';

export type Status = 'passed' | 'failed' | 'not run';
export type Criterion = 'Survival impact and usefulness' | 'Technical execution' | 'Fit with the Hollow' | 'Connected problem-solving' | 'Originality and ingenuity' | 'Demo and communication';

export interface Check {
  id: string;
  name: string;
  category: string;
  criteria: Criterion[];
  required: boolean;
  status: Status;
  expected: string;
  observed: string;
  detail?: string;
  elapsedMs: number;
  inputHash?: string;
  searchStatus?: string;
  validator?: string;
  limitations?: string;
  data?: unknown;
}

type Body = () => { pass: boolean; observed: string; detail?: string; inputHash?: string; searchStatus?: string; validator?: string; limitations?: string; data?: unknown };

function check(id: string, category: string, criteria: Criterion[], name: string, expected: string, body: Body, required = true): Check {
  const t0 = Date.now();
  try {
    const r = body();
    return { id, name, category, criteria, required, status: r.pass ? 'passed' : 'failed', expected, observed: r.observed, detail: r.detail, elapsedMs: Date.now() - t0, inputHash: r.inputHash, searchStatus: r.searchStatus, validator: r.validator, limitations: r.limitations, data: r.data };
  } catch (e) {
    return { id, name, category, criteria, required, status: 'failed', expected, observed: `exception: ${(e as Error).message}`, detail: (e as Error).stack?.split('\n').slice(0, 3).join(' | '), elapsedMs: Date.now() - t0 };
  }
}

const TE: Criterion = 'Technical execution', SI: Criterion = 'Survival impact and usefulness', FH: Criterion = 'Fit with the Hollow', CP: Criterion = 'Connected problem-solving', OI: Criterion = 'Originality and ingenuity', DC: Criterion = 'Demo and communication';

function execute(s: Scenario, p: AnyPlan, truth: Truth = defaultTruth(s), runId = 'run'): SimState {
  const ctx = { s, plan: compilePlan(s, p), truth };
  const { state } = initSim(ctx, runId);
  return runToEnd(ctx, state);
}
const served = (p: PlanResult) => p.schedule.objective.served;
const groupsOf = (p: PlanResult) => p.schedule.journeys.map((j) => j.groupId).sort().join('');
const vOK = (s: Scenario, p: AnyPlan) => (p.kind === 'schedule' ? validateSchedule(s, p.schedule) : validatePolicy(s, p));
const vtext = (s: Scenario, p: AnyPlan) => { const v = vOK(s, p); return v.valid ? 'valid' : `INVALID: ${v.errors.slice(0, 2).join('; ')}`; };
const edit = (id: string, f: (s: Scenario) => void) => { const s = getScenario(id); f(s); return s; };
const arrivedGroups = (s: Scenario, st: SimState) => s.groups.filter((g) => st.groups[g.id].status === 'arrived').map((g) => g.id).join('');

// ---------------------------------------------------------------- reference & edits
export function referenceChecks(): Check[] {
  const out: Check[] = [];
  const A = getScenario('A');
  out.push(check('ref-A', 'reference', [SI, CP, FH], 'A: repair, open, escort serves 24; baseline 12; executed arrivals', '24 assigned (fan > gate > escort), baseline 12; executed 24 vs 12', () => {
    const p = planConfirmed(A), b = planConfirmed(A, { kinds: [], escort: false });
    const r = execute(A, p), rb = execute(A, b);
    const pass = served(p) === 24 && p.schedule.tasks.join('>') === 'repair-fan-3>open-gate-b>escort-A' && served(b) === 12 && arrivedCount(A, r) === 24 && arrivedCount(A, rb) === 12;
    return { pass, observed: `assigned ${served(p)} (${p.schedule.tasks.join(' > ')}); baseline ${served(b)}; executed arrivals ${arrivedCount(A, r)} vs ${arrivedCount(A, rb)}; +${arrivedCount(A, r) - arrivedCount(A, rb)}`, inputHash: inputHash(A), searchStatus: p.search.status, validator: vtext(A, p) };
  }));
  out.push(check('ref-A-components', 'reference', [CP], 'A component removal: none 12, fan only 20, gate+escort 16, all 24', '12 / 20 / 16 / 24', () => {
    const n = planConfirmed(A, { kinds: [], escort: false }), f = planConfirmed(A, { kinds: ['repair'], escort: false }), g = planConfirmed(A, { kinds: ['open'], escort: true }), all = planConfirmed(A);
    const obs = [n, f, g, all].map((p) => `${served(p)} (${groupsOf(p)})`).join(' / ');
    return { pass: [served(n), served(f), served(g), served(all)].join(',') === '12,20,16,24' && [n, f, g, all].every((p) => vOK(A, p).valid), observed: obs, inputHash: inputHash(A) };
  }));
  const B = getScenario('B');
  out.push(check('ref-B', 'reference', [FH, CP], 'B: rescue first; fan-first cannot serve 24', 'selected gate > escort > fan = 24; fan-first best 20; no intervention 12; gate+escort 16', () => {
    const p = planConfirmed(B), ff = planConfirmed(B, { requirePrefix: ['repair-fan-3'] }), n = planConfirmed(B, { kinds: [], escort: false }), g = planConfirmed(B, { kinds: ['open'] });
    const pass = served(p) === 24 && p.schedule.tasks.join('>') === 'open-gate-b>escort-A>repair-fan-3' && served(ff) === 20 && served(n) === 12 && served(g) === 16;
    return { pass, observed: `selected ${served(p)} (${p.schedule.tasks.join(' > ')}); fan-first best ${served(ff)}; none ${served(n)}; gate+escort ${served(g)}`, inputHash: inputHash(B), searchStatus: p.search.status, validator: vtext(B, p) };
  }));
  out.push(check('ref-B-margin', 'stress', [FH], 'B: one-minute repair delay makes J3 unsafe at B’s arrival (selected plan)', 'B fails at +1 minute (J3 = 100 at minute 18)', () => {
    const p = planConfirmed(B);
    const rows = stressSelected(B, p.schedule);
    const r1 = rows.find((r) => r.variant.repairDelay === 1 && r.variant.multiplier === 1)!;
    const f = r1.failedGroups.find((x) => x.group === 'B');
    return { pass: !!f && f.constraints.some((c) => c.includes('J3') && c.includes('100')), observed: f ? `B fails: ${f.constraints[0]}` : 'B still feasible' };
  }));
  const C = getScenario('C');
  out.push(check('ref-C', 'reference', [CP, SI], 'C: stable ventilation — fan repair excluded; batteries preserved', '24 without fan; 4 batteries preserved after execution', () => {
    const p = planConfirmed(C), r = execute(C, p), b = planConfirmed(C, { kinds: [], escort: false });
    const consumed = Object.values(r.ledger.locs).reduce((n, q) => n + q.consumed, 0);
    return { pass: served(p) === 24 && !p.schedule.tasks.includes('repair-fan-3') && consumed === 0 && served(b) === 20, observed: `assigned ${served(p)} (${p.schedule.tasks.join(' > ')}); consumed ${consumed}; preserved ${C.crew.batteries - consumed}; baseline ${served(b)}`, inputHash: inputHash(C), validator: vtext(C, p) };
  }));
  for (const [d, eo, eb, insp] of [[1, 24, 20, true], [7, 24, 20, true], [8, 20, 20, false]] as const) {
    out.push(check(`ref-D${d}`, 'reference', [OI, FH], `D, inspection ${d} min: policy ${eo}/${eb}${insp ? ' with inspection' : ', no inspection'}; confirmed-route response 20/20`, `${eo}/${eb}; inspection ${insp ? 'included' : 'omitted'}; confirmed routes 20/20`, () => {
      const s = scenarioD(d); const p = planPolicy(s);
      const extra = d === 7 ? ` open-branch A arrival ${p.branches.open.journeys.find((j) => j.groupId === 'A')?.arrival}` : '';
      const pass = p.objective.nOpen === eo && p.objective.nBlocked === eb && !!p.inspection === insp && p.noInspection.nOpen === 20 && p.noInspection.nBlocked === 20 && (d !== 7 || p.branches.open.journeys.find((j) => j.groupId === 'A')?.arrival === 20);
      return { pass, observed: `${p.objective.nOpen}/${p.objective.nBlocked}; inspection ${p.inspection ? `${p.inspection.start}–${p.inspection.end}` : 'omitted'}; confirmed routes ${p.noInspection.nOpen}/${p.noInspection.nBlocked};${extra}`, inputHash: inputHash(s), searchStatus: p.search.status, validator: vtext(s, p) };
    }));
  }
  out.push(check('ref-D-exec', 'reference', [OI, TE], 'D: execute both hidden states (policy) and the confirmed-route response from the same snapshot', 'policy open 24 / blocked 20 arrivals; confirmed-route 20 / 20', () => {
    const s = scenarioD(1); const p = planPolicy(s); const c = planConfirmed(s);
    const res = (['open', 'blocked'] as const).map((st) => [arrivedCount(s, execute(s, p, defaultTruth(s, st))), arrivedCount(s, execute(s, c, defaultTruth(s, st)))]);
    return { pass: res[0][0] === 24 && res[1][0] === 20 && res[0][1] === 20 && res[1][1] === 20, observed: `policy ${res[0][0]}/${res[1][0]}; confirmed-route ${res[0][1]}/${res[1][1]}` };
  }));
  out.push(check('ref-D-truth-invariance', 'reference', [OI, TE], 'D: changing only hidden truth leaves the pre-observation policy unchanged', 'identical policy JSON for open and blocked truths', () => {
    const s = scenarioD(1);
    const a = planPolicy(JSON.parse(JSON.stringify(s))); void defaultTruth(s, 'open');
    const b = planPolicy(JSON.parse(JSON.stringify(s))); void defaultTruth(s, 'blocked');
    const strip = (p: PolicyResult) => canonical({ ...p, id: '', search: { ...p.search, elapsedMs: 0 } });
    return { pass: strip(a) === strip(b), observed: strip(a) === strip(b) ? 'identical (the planner signature has no truth parameter; truth is only passed to the simulator)' : 'differs' };
  }));
  out.push(check('ref-label-invariance', 'reference', [TE], 'Scenario labels and group display names do not change the objective', 'identical objective after relabelling', () => {
    const s = scenarioD(1); const t = JSON.parse(JSON.stringify(s)) as Scenario;
    t.id = 'Z'; t.label = 'Z'; t.title = 'renamed'; t.groups.forEach((g, i) => (g.name = `Renamed ${i}`));
    const a = planPolicy(s), b = planPolicy(t);
    const A2 = getScenario('A'); const A3 = JSON.parse(JSON.stringify(A2)); A3.id = 'C'; A3.title = 'x'; A3.groups[0].name = 'Q';
    const same = canonical(policyComponents(a.objective)) === canonical(policyComponents(b.objective)) && canonical(objectiveComponents(planConfirmed(A2).schedule.objective)) === canonical(objectiveComponents(planConfirmed(A3).schedule.objective));
    return { pass: same, observed: same ? 'identical objectives (D and A)' : 'differs' };
  }));
  const E = scenarioE();
  out.push(check('ref-E', 'reference', [SI, FH], 'E: fan then ventilation; 20 assigned; A protected 20 vs 14 (+6/person, +24 person-minutes); 6 batteries', '20; protected 20 (none) vs 14 (fan only); 6 consumed exactly once', () => {
    const p = planConfirmed(E), f = planConfirmed(E, { kinds: ['repair'] }), n = planConfirmed(E, { kinds: [], escort: false }), v = planConfirmed(E, { kinds: ['ventilate'] });
    const r = execute(E, p), rf = execute(E, f), rn = execute(E, n);
    const consumed = Object.values(r.ledger.locs).reduce((x, q) => x + q.consumed, 0);
    const gain = r.groups.A.protected - rf.groups.A.protected;
    const pass = served(p) === 20 && p.schedule.tasks.join('>') === 'repair-fan-3>ventilate-RA' && r.groups.A.protected === 20 && rf.groups.A.protected === 14 && rn.groups.A.protected === 14 && served(v) === 12 && v.schedule.protectedMinutes.A === 20 && consumed === 6 && gain === 6 && gain * 4 === 24 && r.groups.A.status === 'unresolved' && arrivedCount(E, r) === 20;
    return { pass, observed: `assigned ${served(p)} (${p.schedule.tasks.join(' > ')}); executed arrivals ${arrivedCount(E, r)}; A protected ${r.groups.A.protected} vs fan-only ${rf.groups.A.protected} vs none ${rn.groups.A.protected}; vent-only ${served(v)} assigned / ${v.schedule.protectedMinutes.A} min; +${gain}/person, +${gain * 4} person-minutes; batteries consumed ${consumed}; A status ${r.groups.A.status}`, inputHash: inputHash(E), validator: vtext(E, p) };
  }));
  out.push(check('ref-E-order', 'reference', [SI, CP], 'E: ventilation-first is rejected because it loses B (evacuation outranks protection)', 'ventilation-first best = 12 assigned', () => {
    const vf = planConfirmed(E, { requirePrefix: ['ventilate-RA'] });
    return { pass: served(vf) === 12 && vf.schedule.protectedMinutes.A === 20, observed: `ventilation-first best: ${served(vf)} assigned, A protected ${vf.schedule.protectedMinutes.A}` };
  }));
  // setup edits
  const edits: [string, string, () => Scenario, (p: PlanResult) => boolean, string][] = [
    ['edit-A-bat3', 'A: batteries 4 → 3', () => edit('A', (s) => { s.crew.batteries = 3; }), (p) => served(p) === 16 && !p.schedule.tasks.includes('repair-fan-3'), 'repair unavailable; 16'],
    ['edit-A-L11', 'A: Lower Refuge 12 → 11 places', () => edit('A', (s) => { s.shelters[0].places = 11; }), (p) => served(p) === 20 && groupsOf(p) === 'BC', '20 through B and C'],
    ['edit-B-instr2', 'B: B instructions at minute 2', () => edit('B', (s) => { s.groups[1].instructionsAvailableAt = 2; }), (p) => served(p) === 16 && !p.schedule.journeys.some((j) => j.groupId === 'B'), '24 infeasible; B arrival would be 21'],
    ['edit-A-noaccess', 'A: Lower Refuge accessible entry confirmed absent', () => edit('A', (s) => { s.shelters[0].checklist.accessibleEntry = 'absent'; }), (p) => served(p) === 20 && groupsOf(p) === 'BC', '20 through B and C; unsuitable shelter'],
    ['edit-E-bat4', 'E: batteries 6 → 4', () => { const s = scenarioE(); s.crew.batteries = 4; return s; }, (p) => served(p) === 20 && p.schedule.tasks.includes('repair-fan-3') && !p.schedule.tasks.includes('ventilate-RA') && p.schedule.protectedMinutes.A === 14, 'fan kept; 20; A protected 14'],
  ];
  for (const [id, name, mk, ok, exp] of edits) {
    out.push(check(id, 'edits', [SI, TE], name, exp, () => {
      const s = mk(); const p = planConfirmed(s);
      const diag = p.schedule.unresolved.map((g) => `${g}: ${diagnoseGroup(s, p.schedule, s.groups.find((x) => x.id === g)!, p.search).map((b) => b.text).join(' ')}`).join(' | ');
      const extra = id === 'edit-A-noaccess' ? diag.includes('no confirmed accessible entry') && diag.includes('no confirmed assistance on arrival') : id === 'edit-B-instr2' ? diag.includes('arrival would be minute 21') : true;
      return { pass: ok(p) && extra && vOK(s, p).valid, observed: `${served(p)} (${groupsOf(p)}; ${p.schedule.tasks.join(' > ') || 'no work'}${id === 'edit-E-bat4' ? `; A protected ${p.schedule.protectedMinutes.A}` : ''}). ${diag}`, inputHash: inputHash(s), searchStatus: p.search.status, validator: vtext(s, p) };
    }));
  }
  out.push(check('explain-A', 'reference', [DC, SI], 'A: explanation connects the work to the residents it enables, from computed checks', 'names the J3 hazard 68 vs 100 for B and the escort for A', () => {
    const p = planConfirmed(A); const ex = explainSchedule(A, p.schedule, planConfirmed(A, { kinds: [], escort: false }).schedule);
    return { pass: ex.sentence.includes('68') && ex.sentence.includes('100') && ex.sentence.includes('escort') && ex.headline.includes('+12'), observed: `${ex.headline} ${ex.sentence}` };
  }));
  out.push(check('benefit-A-E', 'reference', [SI], 'Per-group benefit from executed baseline and response runs (A and E)', 'A: A and B newly arrive, C unchanged; E: A +6 min/person, +24 person-minutes, not evacuated', () => {
    const pa = planConfirmed(A), ba = planConfirmed(A, { kinds: [], escort: false });
    const ra = groupBenefits(A, pa.schedule, execute(A, ba), execute(A, pa));
    const pe = planConfirmed(E), be = planConfirmed(E, { kinds: [], escort: false });
    const re = groupBenefits(E, pe.schedule, execute(E, be), execute(E, pe));
    const ok = ra.find((r) => r.groupId === 'A')!.provided.startsWith('Accessible assistance') && ra.find((r) => r.groupId === 'B')!.provided.startsWith('A traversable corridor') && !ra.find((r) => r.groupId === 'C')!.changed && re.find((r) => r.groupId === 'A')!.protectedGain?.personMinutes === 24 && re.find((r) => r.groupId === 'A')!.response.startsWith('Unresolved');
    return { pass: ok, observed: [...ra, ...re].map((r) => `${r.groupId}: ${r.provided} [${r.baseline} → ${r.response}]`).join(' | ') };
  }));
  return out;
}

// ---------------------------------------------------------------- focused behaviour
export function focusedChecks(): Check[] {
  const out: Check[] = [];
  const A = getScenario('A');
  out.push(check('f-threshold', 'focused', [TE], 'Strict threshold: hazard 100 is unsafe, 99.x is safe; repair preserves accumulated hazard', 'J3 = 100 at 9 unrepaired (unsafe); 68 with repair at 5; RA 93 then held', () => {
    const w = baseWorld(A);
    const rep = withEffects(w, [{ actionId: 'repair-fan-3', at: 5, effect: { type: 'setRate', location: 'J3', rate: 2 } }]);
    const h1 = nodeHazard(w, 'J3', 9), h2 = nodeHazard(rep, 'J3', 9), h3 = nodeHazard(rep, 'J3', 5), h4 = hazardAt(2, 7, [{ at: 13, rate: 0 }], 20);
    return { pass: h1 === 100 && h2 === 68 && h3 === 60 && h4 === 93 && !(h1 < 100), observed: `J3(9)=${h1} unrepaired, ${h2} repaired at 5 (J3(5)=${h3}); RA(20) with protection at 13 = ${h4}` };
  }));
  out.push(check('f-protected-time', 'focused', [TE, SI], 'Protected minutes count elapsed intervals (max 20, never 21); a crossed threshold cannot be undone', '14 without ventilation, 20 with it; ventilation after crossing gains nothing', () => {
    const E = scenarioE(); const w = baseWorld(E);
    const p0 = protectedMinutes(w, 'RA');
    const p1 = protectedMinutes(withEffects(w, [{ actionId: 'ventilate-RA', at: 13, effect: { type: 'setRate', location: 'RA', rate: 0 } }]), 'RA');
    const p2 = protectedMinutes(withEffects(w, [{ actionId: 'ventilate-RA', at: 15, effect: { type: 'setRate', location: 'RA', rate: 0 } }]), 'RA');
    return { pass: p0 === 14 && p1 === 20 && p2 === 14, observed: `none ${p0}; ventilated at 13 ${p1}; ventilated at 15 (after crossing at 14) ${p2}` };
  }));
  out.push(check('f-exposure', 'focused', [TE], 'Exposure integrates waiting before departure (left endpoint) and travel', 'A in A: waiting 0–9 = 335; B 0; unresolved A over horizon = 1370', () => {
    const p = planConfirmed(A); const j = p.schedule.journeys.find((x) => x.groupId === 'A')!;
    const b = planConfirmed(A, { kinds: [], escort: false });
    return { pass: j.exposure === 335 && j.waitingExposure === 335 && b.schedule.exposureUnresolved.A === 1370, observed: `A exposure ${j.exposure} (waiting ${j.waitingExposure}, travel ${j.travelExposure}); unresolved A over 20 minutes ${b.schedule.exposureUnresolved.A}` };
  }));
  const negatives: [string, string, (s: Scenario, sc: any) => void, string][] = [
    ['f-instructions', 'Instruction availability: departure before instructionsAvailableAt is rejected', (s) => { s.groups[2].instructionsAvailableAt = 1; }, 'before instructions'],
    ['f-stairs', 'Wheelchair access: an escort over the stairs is rejected', (_s, sc) => { const e = sc.crew.find((a: any) => a.kind === 'escort'); const j = sc.journeys.find((x: any) => x.groupId === 'A'); const legs = [{ from: 'RA', to: 'ST', conn: 'RA-ST', start: 10, end: 11 }, { from: 'ST', to: 'U', conn: 'ST-U', start: 11, end: 12 }]; e.legs = legs; e.to = 'U'; e.end = 12; j.legs = legs; j.shelter = 'U'; j.arrival = 12; }, 'not step-free'],
    ['f-escort', 'Continuous escort: a group moving without the crew alongside is rejected', (_s, sc) => { const j = sc.journeys.find((x: any) => x.groupId === 'A'); j.departure += 1; j.arrival += 1; j.legs = j.legs.map((l: any) => ({ ...l, start: l.start + 1, end: l.end + 1 })); }, 'escort covers'],
    ['f-crew-conflict', 'Crew conflicts: overlapping activities are rejected', (_s, sc) => { sc.crew[1].start = 4; sc.crew[1].legs[0].start = 4; }, 'overlaps'],
    ['f-toolkit', 'Equipment: work without the tool kit is rejected', (s) => { s.crew.toolkit = false; }, 'tool kit'],
    ['f-batteries', 'Batteries: work beyond the pack is rejected', (s) => { s.crew.batteries = 3; }, 'pack exhausted'],
    ['f-shelter-transit', 'No shelter transit: a resident route through a shelter is rejected', (_s, sc) => { const j = sc.journeys.find((x: any) => x.groupId === 'C'); j.legs = [{ from: 'RC', to: 'X1', conn: 'RC-X1', start: 0, end: 1 }, { from: 'X1', to: 'U', conn: 'X1-U', start: 1, end: 3 }, { from: 'U', to: 'X2', conn: 'U-X2', start: 3, end: 5 }]; j.shelter = 'X2'; j.arrival = 5; }, 'shelter'],
    ['f-capacity', 'Joint indivisible assignment: over-filling a shelter is rejected', (s) => { s.shelters[0].places = 11; }, 'places needed'],
    ['f-threshold-arrival', 'Threshold at arrival: B through unrepaired J3 at minute 9 is rejected', (_s, sc) => { sc.crew.splice(0, 1); sc.crew.forEach((a: any) => { void a; }); }, 'hazard'],
  ];
  for (const [id, name, mut, needle] of negatives) {
    out.push(check(id, 'focused', [TE], name, `validator rejects (…${needle}…)`, () => {
      const s = getScenario('A'); const sc = JSON.parse(JSON.stringify(planConfirmed(s).schedule));
      mut(s, sc);
      const v = validateSchedule(s, sc);
      const hit = v.errors.find((e) => e.includes(needle));
      return { pass: !v.valid && !!hit, observed: hit ?? v.errors.slice(0, 2).join('; ') ?? 'accepted' };
    }));
  }
  out.push(check('f-corridor', 'focused', [TE], 'Shared corridor capacity: overlapping and opposite-direction intervals conflict; adjacent intervals do not', 'overlap blocked; adjacent allowed; opposite shares the pool; planner staggers groups', () => {
    const s = tinyCorridor(3); const w = baseWorld(s); const r = new Residual(w);
    r.add({ group: 'x', count: 3, conns: [{ conn: 'M-N', start: 1, end: 3 }], nodes: [] });
    const overlap = !r.canMove('M-N', 2, 4, 1), adjacent = r.canMove('M-N', 3, 5, 3);
    const p = planConfirmed(s); const legs = p.schedule.journeys.map((j) => j.legs.find((l) => l.conn === 'M-N')!);
    const staggered = legs.length === 2 && !intervalsOverlap(legs[0], legs[1]);
    const so = tinyCorridor(3, true); const po = planConfirmed(so); const lo = po.schedule.journeys.map((j) => j.legs.find((l) => l.conn === 'M-N')!);
    const opp = lo.length === 2 && !intervalsOverlap(lo[0], lo[1]) && lo[0].from !== lo[1].from;
    const bad = JSON.parse(JSON.stringify(p.schedule)); const jr = bad.journeys.find((j: any) => j.groupId === 'R'); const d = jr.departure; const sh = (x: number) => x - d; jr.departure = 0; jr.arrival = sh(jr.arrival); jr.legs.forEach((l: any) => { l.start = sh(l.start); l.end = sh(l.end); });
    const vbad = validateSchedule(s, bad);
    return { pass: overlap && adjacent && staggered && opp && served(p) === 6 && served(po) === 6 && vOK(s, p).valid && vOK(so, po).valid && vbad.errors.some((e) => e.includes('capacity')), observed: `overlap blocked ${overlap}; adjacent allowed ${adjacent}; same-direction staggered ${legs.map((l) => `[${l.start},${l.end})`).join(' ')}; opposite ${lo.map((l) => `${l.from}→${l.to} [${l.start},${l.end})`).join(' ')}; forced overlap rejected: ${vbad.errors.find((e) => e.includes('capacity'))}` };
  }));
  out.push(check('f-reservation-conversion', 'focused', [TE], 'Reservation-to-occupant conversion: each arrival converts exactly one reservation', 'occupants equal reservations at the horizon, no duplicates', () => {
    const p = planConfirmed(A); const st = execute(A, p);
    const ok = Object.values(st.shelters).every((x) => x.occupants.length === x.reservations.length && new Set(x.occupants).size === x.occupants.length);
    return { pass: ok && st.violations.length === 0, observed: Object.entries(st.shelters).map(([k, v]) => `${k}: occupants ${v.occupants.join(',')} / reservations ${v.reservations.map((r) => r.group).join(',')}`).join('; ') };
  }));
  out.push(check('f-suitability', 'suitability', [SI, FH], 'Suitability: absent accessible entry or assistance removes the shelter for A only; absent ventilation removes it for every group; unconfirmed items block approval', 'A-only exclusion; all-group exclusion; approval blocked', () => {
    const s1 = edit('A', (s) => { s.shelters[0].checklist.assistanceOnArrival = 'absent'; }); const p1 = planConfirmed(s1);
    const s2 = edit('A', (s) => { s.shelters[0].checklist.ventilationOperating = 'absent'; }); const p2 = planConfirmed(s2);
    const s3 = edit('A', (s) => { s.shelters[0].checklist.accessibleEntry = 'unconfirmed'; }); const p3 = planConfirmed(s3); const a3 = approvePlan(s3, 0, p3);
    const ok = groupsOf(p1) === 'BC' && groupsOf(p2) === 'C' && served(p3) === 24 && !a3.ok && a3.errors.some((e) => e.includes('accessible entry'));
    return { pass: ok, observed: `assistance absent → ${groupsOf(p1)}; ventilation absent → ${groupsOf(p2)}; accessible entry unconfirmed → planned ${served(p3)}, approval: ${a3.errors[0]}` };
  }));
  out.push(check('f-joint-alt-shelter', 'oracle-tiny', [TE, CP], 'Tiny alternative-shelter graph: joint assignment serves 4 where greedy first-route commitment serves 2', 'production 4 = oracle 4; greedy 2', () => {
    const s = tinyAssignment(); const p = planConfirmed(s); const o = oracleConfirmed(s);
    const g = greedyServed(s, residentCandidates(s, baseWorld(s), null, new Set()) as never);
    const same = canonical(objectiveComponents(p.schedule.objective)) === canonical(o.objective);
    return { pass: same && served(p) === 4 && g === 2, observed: `production ${canonical(objectiveComponents(p.schedule.objective))}; oracle ${canonical(o.objective)}; flexible group → ${p.schedule.journeys.find((j) => j.groupId === 'F')?.shelter}; greedy ${g}`, validator: vtext(s, p) };
  }));
  out.push(check('f-tiny-policy', 'oracle-tiny', [OI, TE], 'Tiny two-state graph: independent policy enumeration agrees with production (inspection helps at 1 min, omitted at 3 min)', 'complete policy objective identical at both durations', () => {
    const r = [1, 3].map((d) => { const s = tinyPolicy(d); const p = planPolicy(s); const o = oraclePolicy(s); return { d, same: canonical(policyComponents(p.objective)) === canonical(o.objective), insp: !!p.inspection, p: policyComponents(p.objective), n: o.inspectionPolicies }; });
    return { pass: r.every((x) => x.same) && r[0].insp && !r[1].insp, observed: r.map((x) => `d=${x.d}: ${x.same ? 'agree' : 'DISAGREE'} ${x.p.nOpen}/${x.p.nBlocked} inspection ${x.insp ? 'used' : 'omitted'} (${x.n} inspection policies enumerated)`).join('; ') };
  }));
  return out;
}

// ---------------------------------------------------------------- validator over every returned plan
export function validatorChecks(): Check[] {
  const cases: [string, () => [Scenario, AnyPlan]][] = [];
  for (const id of ['A', 'B', 'C', 'E']) {
    cases.push([`${id} selected`, () => { const s = getScenario(id); return [s, planConfirmed(s)]; }]);
    cases.push([`${id} baseline`, () => { const s = getScenario(id); return [s, planConfirmed(s, { kinds: [], escort: false })]; }]);
  }
  for (const d of [1, 7, 8]) cases.push([`D${d} policy`, () => { const s = scenarioD(d); return [s, planPolicy(s)]; }]);
  return [check('validator-all', 'validator', [TE], 'Independent validator accepts every reference plan and recomputes the same objective', 'all valid', () => {
    const res = cases.map(([n, f]) => { const [s, p] = f(); const v = vOK(s, p); return `${n}: ${v.valid ? 'valid' : 'INVALID ' + v.errors[0]}`; });
    return { pass: res.every((x) => x.endsWith('valid') && !x.includes('INVALID')), observed: res.join('; ') };
  })];
}

// ---------------------------------------------------------------- generated batch
export function generatedBatch(seed = 20871120, nConfirmed = 40, nPolicy = 40, minEach = 8) {
  const rnd = mulberry32(seed);
  const rows: { seed: number; kind: string; inputHash: string; production: unknown; oracle: unknown; agree: boolean; valid: boolean; productionMs: number; oracleMs: number; status: string; inspectionClass?: string; error?: string; scenario: Scenario }[] = [];
  let helps = 0, wastes = 0, attempts = 0;
  const confirmedSeeds: number[] = [];
  while (confirmedSeeds.length < nConfirmed) confirmedSeeds.push(Math.floor(rnd() * 1e9));
  for (const sd of confirmedSeeds) {
    const s = generateTiny(sd, false);
    try {
      const t0 = Date.now(); const p = planConfirmed(s); const t1 = Date.now(); const o = oracleConfirmed(s); const t2 = Date.now();
      const agree = canonical(objectiveComponents(p.schedule.objective)) === canonical(o.objective);
      rows.push({ seed: sd, kind: 'confirmed', inputHash: inputHash(s), production: objectiveComponents(p.schedule.objective), oracle: o.objective, agree, valid: validateSchedule(s, p.schedule).valid, productionMs: t1 - t0, oracleMs: t2 - t1, status: p.search.status, scenario: s });
    } catch (e) { rows.push({ seed: sd, kind: 'confirmed', inputHash: inputHash(s), production: null, oracle: null, agree: false, valid: false, productionMs: 0, oracleMs: 0, status: 'error', error: (e as Error).message, scenario: s }); }
  }
  let nP = 0;
  while ((nP < nPolicy || helps < minEach || wastes < minEach) && attempts < 2000) {
    attempts++;
    const sd = Math.floor(rnd() * 1e9);
    const s = generateTiny(sd, true);
    if (!s.knowledge.unknown) continue;
    try {
      const t0 = Date.now(); const p = planPolicy(s); const t1 = Date.now(); const o = oraclePolicy(s); const t2 = Date.now();
      const cls = p.inspection ? 'inspection-helps' : o.inspectionPolicies > 0 ? 'inspection-wastes-time' : 'inspection-unreachable';
      // keep the batch balanced: after the quota, only keep cases of the kind still missing
      if (nP >= nPolicy && !((cls === 'inspection-helps' && helps < minEach) || (cls === 'inspection-wastes-time' && wastes < minEach))) continue;
      if (cls === 'inspection-helps') helps++; if (cls === 'inspection-wastes-time') wastes++;
      nP++;
      const agree = canonical(policyComponents(p.objective)) === canonical(o.objective);
      rows.push({ seed: sd, kind: 'two-state', inputHash: inputHash(s), production: policyComponents(p.objective), oracle: o.objective, agree, valid: validatePolicy(s, p).valid, productionMs: t1 - t0, oracleMs: t2 - t1, status: p.search.status, inspectionClass: cls, scenario: s });
    } catch (e) { nP++; rows.push({ seed: sd, kind: 'two-state', inputHash: inputHash(s), production: null, oracle: null, agree: false, valid: false, productionMs: 0, oracleMs: 0, status: 'error', error: (e as Error).message, scenario: s }); }
  }
  return { seed, rows, helps, wastes, bounds: GENERATOR_BOUNDS };
}

export function batchChecks(): { checks: Check[]; batch: ReturnType<typeof generatedBatch> } {
  const t0 = Date.now();
  const batch = generatedBatch();
  const fails = batch.rows.filter((r) => !r.agree || !r.valid);
  const c: Check = {
    id: 'generated-batch', name: `Generated tiny-case batch (seed ${batch.seed}): complete lexicographic objective vs independent exhaustive solver`, category: 'generated-batch', criteria: [TE, OI], required: true,
    status: fails.length === 0 && batch.helps >= 8 && batch.wastes >= 8 ? 'passed' : 'failed',
    expected: 'every case agrees on every objective component and validates; both inspection kinds present (>= 8 each)',
    observed: `${batch.rows.length} cases (${batch.rows.filter((r) => r.kind === 'confirmed').length} confirmed-state, ${batch.rows.filter((r) => r.kind === 'two-state').length} two-state); agree ${batch.rows.filter((r) => r.agree).length}; valid ${batch.rows.filter((r) => r.valid).length}; inspection-helps ${batch.helps}; inspection-wastes-time ${batch.wastes}; failures ${fails.map((f) => f.seed).join(',') || 'none'}`,
    elapsedMs: Date.now() - t0, limitations: 'Agreement establishes correctness for these generated instances only. Generator bounds: corridor/location capacities not varied and no deliveries (oracle preconditions).',
  };
  return { checks: [c], batch };
}

// ---------------------------------------------------------------- negative cases
export function negativeChecks(): Check[] {
  const out: Check[] = [];
  const A = getScenario('A');
  out.push(check('neg-stale', 'negative', [TE], 'Stale approval is rejected', 'plan computed at revision 0 cannot be approved at revision 1', () => {
    const p = planConfirmed(A, { revision: 0 });
    const s2 = edit('A', (s) => { s.crew.batteries = 3; });
    const r = approvePlan(s2, 1, p);
    const ok0 = approvePlan(A, 0, p);
    return { pass: !r.ok && r.errors[0].startsWith('Stale') && ok0.ok && isStale(s2, 1, p), observed: `${r.errors[0]} | same revision approves: ${ok0.ok}` };
  }));
  out.push(check('neg-duplicate', 'negative', [TE], 'Duplicate completion/boundary processing does not duplicate consumption, occupancy or arrivals', 'identical state after re-processing minute 5 (fan completion) and 13 (admission)', () => {
    const p = planConfirmed(A);
    const a = duplicateProcessingTest(A, p, defaultTruth(A), 5), b = duplicateProcessingTest(A, p, defaultTruth(A), 13);
    return { pass: a.identical && b.identical, observed: `minute 5 ${a.identical ? 'identical' : 'DIFFERS'}; minute 13 ${b.identical ? 'identical' : 'DIFFERS'}` };
  }));
  out.push(check('neg-corrupt', 'negative', [TE], 'A deliberately corrupted event (teleport into a shelter) pauses playback naming the invariant', 'paused; invariant "valid arrivals"', () => {
    const p = planConfirmed(A); const ctx = { s: A, plan: compilePlan(A, p), truth: defaultTruth(A), corrupt: { t: 5, group: 'B', to: 'L' } };
    const { state } = initSim(ctx, 'corrupt'); runToEnd(ctx, state);
    return { pass: state.paused && state.pause?.invariant === 'valid arrivals' && state.pause.minute === 5, observed: `paused at ${state.pause?.minute}: ${state.pause?.reason} (event ${state.pause?.event})` };
  }));
  out.push(check('neg-unknown-edge', 'negative', [OI, TE], 'Unknown-edge traversal before inspection is rejected (validator) and cannot execute (simulator)', 'validator error; simulator pauses', () => {
    const s = scenarioD(1); const p = planPolicy(s); const bad = JSON.parse(JSON.stringify(p)) as PolicyResult;
    // make a fixed (no inspection) response escort A through the unknown bypass at minute 5
    bad.inspection = null;
    const legs = [{ from: 'RA', to: 'X3', conn: 'RA-X3', start: 10, end: 11 }, { from: 'X3', to: 'P', conn: 'X3-P', start: 11, end: 12 }, { from: 'P', to: 'L', conn: 'P-L', start: 12, end: 13 }];
    for (const st of ['open', 'blocked'] as const) {
      const sc = bad.branches[st];
      sc.crew = sc.crew.slice(0, 2).concat([{ id: 'x-travel', kind: 'travel', start: 9, end: 10, from: 'X3', to: 'RA', legs: [{ from: 'X3', to: 'RA', conn: 'RA-X3', start: 9, end: 10 }] }, { id: 'x-escort', kind: 'escort', start: 10, end: 13, from: 'RA', to: 'L', legs, groupId: 'A' }] as never);
      sc.journeys = sc.journeys.concat([{ groupId: 'A', shelter: 'L', departure: 10, arrival: 13, legs, escorted: true, exposure: 0, waitingExposure: 0, travelExposure: 0 }]);
    }
    const v = validatePolicy(s, bad);
    const ctx = { s, plan: compilePlan(s, bad), truth: defaultTruth(s, 'open') };
    const { state } = initSim(ctx, 'unk'); runToEnd(ctx, state);
    return { pass: !v.valid && v.errors.some((e) => e.includes('unknown connection')) && state.paused, observed: `validator: ${v.errors.find((e) => e.includes('unknown'))}; simulator: ${state.pause?.reason}` };
  }));
  out.push(check('neg-confirm-change', 'negative', [SI, TE], 'Changed steward confirmation (Lower Refuge 11 places) makes the plan stale; recomputation returns 20 (B, C), names the lost group and the request', 'stale; recompute 20; A lost; request: 1 place at Lower Refuge by 20', () => {
    const p = planConfirmed(A, { revision: 0 });
    const s2 = edit('A', (s) => { s.shelters[0].places = 11; s.reports.find((r) => r.id === 'rep-L-places')!.value = '11'; });
    const stale = !approvePlan(s2, 1, p).ok;
    const p2 = planConfirmed(s2, { revision: 1 });
    const lost = p.schedule.journeys.map((j) => j.groupId).filter((g) => !p2.schedule.journeys.some((j) => j.groupId === g));
    const req = computeRequests(s2, p2.schedule).requests.find((r) => r.groupId === 'A');
    return { pass: stale && served(p2) === 20 && lost.join() === 'A' && req?.resource === 'places' && req.quantity === 1 && req.latest === 20 && approvePlan(s2, 1, p2).ok, observed: `stale ${stale}; recompute ${served(p2)} (${groupsOf(p2)}); lost ${lost.join(',')}; request: ${req?.text}` };
  }));
  out.push(check('neg-unconfirmed', 'negative', [TE, SI], 'Unconfirmed essential inputs (places, instructions, delivery) block approval and are listed', 'approval blocked with reasons; residents not dropped', () => {
    const s = edit('A', (x) => { x.shelters[1].placesConfirmed = false; x.instructionsConfirmed.B = false; });
    const p = planConfirmed(s); const r = approvePlan(s, 0, p);
    return { pass: !r.ok && served(p) === 24 && r.errors.some((e) => e.includes('Upper Refuge')) && r.errors.some((e) => e.includes('Pump Quarter')), observed: `planned ${served(p)}; ${r.errors.join(' | ')}` };
  }));
  return out;
}

// ---------------------------------------------------------------- interruption
export function interruptionChecks(): Check[] {
  const out: Check[] = [];
  const cases: [string, () => [Scenario, AnyPlan, Truth], number[], string][] = [
    ['A fan completion', () => { const s = getScenario('A'); return [s, planConfirmed(s), defaultTruth(s)]; }, [5], 'battery consumption'],
    ['A admissions (C 3, B 10, A 13)', () => { const s = getScenario('A'); return [s, planConfirmed(s), defaultTruth(s)]; }, [3, 10, 13], 'shelter admission'],
    ['D fan completion + inspection (open)', () => { const s = scenarioD(1); return [s, planPolicy(s), defaultTruth(s, 'open')]; }, [5, 10, 14, 17], 'consumption, observation, admission'],
    ['D fan completion + inspection (blocked)', () => { const s = scenarioD(1); return [s, planPolicy(s), defaultTruth(s, 'blocked')]; }, [5, 10, 17], 'consumption, observation, admission'],
    ['D battery-request run: delivery at 14 and Gate B completion at 16', () => { const s = scenarioD(1); s.deliveries.push({ id: 'req-G', resource: 'batteries', quantity: 4, location: 'G', minute: 14, source: 'Neighbouring crew', confirmed: true }); return [s, planPolicy(s), defaultTruth(s, 'blocked')]; }, [14, 16, 20], 'delivery and consumption'],
    ['E fan (5) and ventilation (13) completion', () => { const s = scenarioE(); return [s, planConfirmed(s), defaultTruth(s)]; }, [5, 13], 'battery consumption and protection effect'],
    ['A Lower Refuge place delivery at 20', () => { const s = getScenario('A'); s.shelters[0].places = 11; s.deliveries.push({ id: 'req-L', resource: 'places', quantity: 1, location: 'L', minute: 20, source: 'Lower Refuge steward', confirmed: true }); return [s, planConfirmed(s), defaultTruth(s)]; }, [19, 20], 'place delivery and admission'],
  ];
  for (const [name, mk, minutes, what] of cases) {
    out.push(check(`int-${name.split(' ')[0]}-${minutes.join('-')}`, 'interruption', [TE, FH], `Reload before/after transactions: ${name}`, `resumed runs identical to the uninterrupted run (${what} exactly once)`, () => {
      const [s, p, truth] = mk();
      const res = minutes.flatMap((m) => interruptionTest(s, p, truth, m).results);
      const full = execute(s, p, truth, 'interrupt');
      const consumed = Object.values(full.ledger.locs).reduce((n, q) => n + q.consumed, 0);
      const extra = name.startsWith('E') ? `; consumed ${consumed}; protection effects ${full.appliedProtection.length}; A protected ${full.groups.A.protected}` : `; consumed ${consumed}; arrivals ${arrivedCount(s, full)}`;
      const eOk = !name.startsWith('E') || (consumed === 6 && full.appliedProtection.length === 2 && full.groups.A.protected === 20);
      return { pass: res.every((r) => r.equal) && eOk, observed: res.map((r) => `${r.point}: ${r.equal ? 'ok' : r.detail}`).join('; ') + extra };
    }));
  }
  return out;
}

// ---------------------------------------------------------------- export / replay & agreement
export function referenceRuns(): [string, Scenario, AnyPlan, Truth][] {
  const runs: [string, Scenario, AnyPlan, Truth][] = [];
  for (const id of ['A', 'B', 'C']) {
    const s = getScenario(id);
    runs.push([`${id} response`, s, planConfirmed(s), defaultTruth(s)]);
    runs.push([`${id} baseline`, s, planConfirmed(s, { kinds: [], escort: false }), defaultTruth(s)]);
  }
  const A = getScenario('A');
  runs.push(['A fan only', A, planConfirmed(A, { kinds: ['repair'], escort: false }), defaultTruth(A)]);
  runs.push(['A gate+escort', A, planConfirmed(A, { kinds: ['open'] }), defaultTruth(A)]);
  for (const d of [1, 8]) for (const st of ['open', 'blocked'] as const) { const s = scenarioD(d); runs.push([`D${d} policy, ${st}`, s, planPolicy(s), defaultTruth(s, st)]); }
  for (const st of ['open', 'blocked'] as const) { const s = scenarioD(1); runs.push([`D confirmed-route, ${st}`, s, planConfirmed(s), defaultTruth(s, st)]); }
  const E = scenarioE();
  runs.push(['E response', E, planConfirmed(E), defaultTruth(E)]);
  runs.push(['E baseline', E, planConfirmed(E, { kinds: [], escort: false }), defaultTruth(E)]);
  runs.push(['E fan only', E, planConfirmed(E, { kinds: ['repair'] }), defaultTruth(E)]);
  const L = edit('A', (s) => { s.shelters[0].places = 11; s.deliveries.push({ id: 'req-L', resource: 'places', quantity: 1, location: 'L', minute: 20, source: 'Lower Refuge steward', confirmed: true }); });
  runs.push(['A + Lower Refuge place at 20', L, planConfirmed(L), defaultTruth(L)]);
  const DG = scenarioD(1); DG.deliveries.push({ id: 'req-G', resource: 'batteries', quantity: 4, location: 'G', minute: 14, source: 'Neighbouring crew', confirmed: true });
  for (const st of ['open', 'blocked'] as const) runs.push([`D + 4 batteries at G by 14, ${st}`, DG, planPolicy(DG), defaultTruth(DG, st)]);
  return runs;
}

export function agreementChecks(): { checks: Check[]; boundaries: number; violations: number; results: { run: string; passed: boolean; views: unknown; diffs: string[] }[] } {
  const results: { run: string; passed: boolean; views: unknown; diffs: string[] }[] = [];
  let boundaries = 0, violations = 0;
  const checks = referenceRuns().map(([name, s, p, truth]) => check(`agree-${name}`, 'agreement', [TE], `Agreement gate: ${name}`, 'forecast = validator = live (invariants) = replay = every checkpoint resumption', () => {
    const r = agreementCheck(name, s, p, truth);
    boundaries += r.invariantChecks; violations += r.violations;
    results.push({ run: name, passed: r.passed, views: r.views, diffs: r.diffs });
    return { pass: r.passed, observed: `${r.passed ? 'all five views agree' : r.diffs.join('; ')} (${r.boundaries} boundaries, ${r.checkpointsTested} checkpoints, ${r.invariantChecks} invariant checks, ${r.violations} violations; arrived ${r.final.arrived.join(',') || 'none'}; consumed ${r.final.consumed}${r.final.branch ? `; branch ${r.final.branch}` : ''})`, inputHash: inputHash(s) };
  }));
  checks.push({ id: 'invariants-summary', name: 'Execution invariants over every agreement run', category: 'agreement', criteria: [TE], required: true, status: violations === 0 && boundaries > 0 ? 'passed' : 'failed', expected: '0 violations', observed: `${boundaries} boundaries checked, ${violations} violations`, elapsedMs: 0 });
  return { checks, boundaries, violations, results };
}

export function exportChecks(): Check[] {
  return referenceRuns().map(([name, s, p, truth]) => check(`export-${name}`, 'replay-export', [TE], `Export → JSON → re-execute and replay: ${name}`, 'input hash, events, arrivals and consumption reconcile', () => {
    const st = execute(s, p, truth, `exp-${name}`);
    const ex = buildExport(s, p, truth, st, 0);
    const back = JSON.parse(JSON.stringify(ex));
    const r = reproduceExport(back);
    return { pass: r.ok, observed: r.checks.map((c) => `${c.name}: ${c.ok ? 'ok' : c.detail}`).join('; '), inputHash: ex.inputHash };
  }));
}

// ---------------------------------------------------------------- requests and future commitments
export function requestChecks(): Check[] {
  const out: Check[] = [];
  const specs: [string, () => Scenario, string | undefined, (r: ReturnType<typeof computeRequests>) => boolean, string][] = [
    ['req-D-blocked', () => scenarioD(1), 'blocked', (r) => r.requests.some((q) => q.resource === 'batteries' && q.quantity === 4 && q.location === 'G' && q.latest === 14 && q.nextMinuteFails), '4 batteries to G by 14; 15 too late'],
    ['req-A-L11', () => edit('A', (s) => { s.shelters[0].places = 11; }), undefined, (r) => r.requests.some((q) => q.resource === 'places' && q.quantity === 1 && q.location === 'L' && q.latest === 20 && q.horizonDeadline && q.nextMinuteFails && q.noWaitMinute === 13), '1 place at L by 20 (horizon); never-arrives fails; avoids waiting by 13'],
    ['req-B-instr', () => edit('B', (s) => { s.groups[1].instructionsAvailableAt = 2; }), undefined, (r) => r.requests.some((q) => q.resource === 'instructions' && q.location === 'RB' && q.latest === 1 && q.nextMinuteFails), 'instructions to RB by minute 1'],
    ['req-A-bat3', () => edit('A', (s) => { s.crew.batteries = 3; }), undefined, (r) => r.requests.some((q) => q.resource === 'batteries' && q.quantity === 1 && q.location === 'F' && q.latest === 3 && q.nextMinuteFails), '1 battery at F by 3'],
    ['req-E', () => scenarioE(), undefined, (r) => r.requests.length === 0 && r.none.some((n) => n.groupId === 'A' && n.text.includes('still needs an accessible route')), 'no tested change; A still needs an accessible route'],
    ['req-A-noaccess', () => edit('A', (s) => { s.shelters[0].checklist.accessibleEntry = 'absent'; }), undefined, (r) => r.requests.length === 0 && r.none.some((n) => n.text.includes('no confirmed accessible entry')), 'no tested change; binding: unsuitable shelter'],
  ];
  for (const [id, mk, state, ok, exp] of specs) {
    out.push(check(id, 'requests', [SI, FH], `Resource request: ${id.replace('req-', '')}`, exp, () => {
      const s = mk();
      const base = state ? planPolicy(s).branches[state as 'blocked'] : planConfirmed(s).schedule;
      const r = computeRequests(s, base, { state: state as never });
      return { pass: ok(r) && r.requests.every((q) => q.validatedAtDeadline && q.nextMinuteFails), observed: [...r.requests.map((q) => `${q.text} [deadline validated ${q.validatedAtDeadline}; next minute/never fails ${q.nextMinuteFails}]`), ...r.none.map((n) => n.text)].join(' | ') + ` (${r.runs} planner runs, ${r.elapsedMs} ms)` };
    }));
  }
  // future commitments: plan, validate, approve, execute accept the same schedule; late delivery rejected/paused
  out.push(check('future-D-batteries', 'future-commitments', [TE, SI], 'D: record 4 batteries at G by 14 as a confirmed expected delivery; plan, validate, approve, execute agree; 15 is rejected and pauses playback', 'all four accept; 24 arrive; late delivery rejected by validator and pauses at gate start', () => {
    const s = scenarioD(1); s.deliveries.push({ id: 'req-G', resource: 'batteries', quantity: 4, location: 'G', minute: 14, source: 'Neighbouring crew', confirmed: true });
    const p = planPolicy(s); const ap = approvePlan(s, 0, p);
    const runs = (['open', 'blocked'] as const).map((st) => arrivedCount(s, execute(s, p, defaultTruth(s, st))));
    const late = JSON.parse(JSON.stringify(s)) as Scenario; late.deliveries[0].minute = 15; late.reports = s.reports;
    const vLate = validatePolicy(late, { ...p, inputHash: inputHash(late) });
    const truth = defaultTruth(s, 'blocked'); truth.deliveryActual['req-G'] = 15;
    const ctx = { s, plan: compilePlan(s, p), truth }; const { state } = initSim(ctx, 'late'); runToEnd(ctx, state);
    return { pass: ap.ok && runs.every((n) => n === 24) && !vLate.valid && state.paused && state.pause!.minute === 14 && state.pause!.entities.includes('req-G'), observed: `approve ${ap.ok}; arrivals open/blocked ${runs.join('/')}; late plan: ${vLate.errors.find((e) => e.includes('delivery')) ?? vLate.errors[0]}; playback: ${state.pause?.reason}` };
  }));
  out.push(check('future-A-place', 'future-commitments', [TE, SI], 'A (11 places): record 1 place at Lower Refuge at 20; plan/validate/approve/execute agree (24 arrive); a place that never arrives leaves A unserved in planning and pauses playback at admission', '24 arrive; never-arrives: planning 20, playback pauses at 20', () => {
    const s = edit('A', (x) => { x.shelters[0].places = 11; x.deliveries.push({ id: 'req-L', resource: 'places', quantity: 1, location: 'L', minute: 20, source: 'Lower Refuge steward', confirmed: true }); });
    const p = planConfirmed(s); const ap = approvePlan(s, 0, p); const st = execute(s, p);
    const never = JSON.parse(JSON.stringify(s)) as Scenario; never.deliveries = [];
    const pn = planConfirmed(never);
    const truth = defaultTruth(s); truth.deliveryActual['req-L'] = null;
    const ctx = { s, plan: compilePlan(s, p), truth }; const r = initSim(ctx, 'never'); runToEnd(ctx, r.state);
    return { pass: ap.ok && arrivedCount(s, st) === 24 && served(pn) === 20 && !pn.schedule.journeys.some((j) => j.groupId === 'A') && r.state.paused && r.state.pause!.minute === 20, observed: `approve ${ap.ok}; executed ${arrivedCount(s, st)} (planner timing: ${p.schedule.journeys.map((j) => `${j.groupId} ${j.departure}→${j.arrival}`).join(', ')}); never-arrives planning ${served(pn)} (${groupsOf(pn)}); playback: ${r.state.pause?.reason}` };
  }));
  out.push(check('future-A-place-reference', 'future-commitments', [TE], 'Spec reference timing for the Lower Refuge place: A waits with the crew at P 12–19, P→L 19–20, admitted at 20 — validated and executed to 24', 'valid; 24 arrive; A admitted at 20', () => {
    const s = edit('A', (x) => { x.shelters[0].places = 11; x.deliveries.push({ id: 'req-L', resource: 'places', quantity: 1, location: 'L', minute: 20, source: 'Lower Refuge steward', confirmed: true }); });
    const p = JSON.parse(JSON.stringify(planConfirmed(s))) as PlanResult;
    const sc = p.schedule;
    const legs = [{ from: 'RA', to: 'G', conn: 'RA-G', start: 10, end: 11 }, { from: 'G', to: 'P', conn: 'G-P', start: 11, end: 12 }, { from: 'P', to: 'P', conn: null, start: 12, end: 19 }, { from: 'P', to: 'L', conn: 'P-L', start: 19, end: 20 }];
    const esc = sc.crew.find((a) => a.kind === 'escort')!; esc.legs = legs; esc.end = 20;
    const jA = sc.journeys.find((j) => j.groupId === 'A')!; jA.legs = legs; jA.arrival = 20; jA.travelExposure = 0;
    const jB = sc.journeys.find((j) => j.groupId === 'B')!; jB.departure = 0; jB.arrival = 10; jB.legs = [{ from: 'RB', to: 'J2', conn: 'RB-J2', start: 0, end: 4 }, { from: 'J2', to: 'J3', conn: 'J2-J3', start: 4, end: 9 }, { from: 'J3', to: 'L', conn: 'J3-L', start: 9, end: 10 }];
    sc.objective.busy = 20; sc.objective.finalArrival = 20;
    const v = validateSchedule(s, sc); const st = execute(s, p);
    return { pass: v.valid && arrivedCount(s, st) === 24 && st.groups.A.arrivedAt === 20 && st.violations.length === 0, observed: `validator ${v.valid ? 'valid' : v.errors.join('; ')}; executed ${arrivedCount(s, st)}; A admitted at ${st.groups.A.arrivedAt}; the planner itself prefers B departing at 10 (crew busy 13 vs 20, criterion 4)`, limitations: 'Hand-constructed schedule from the specification, checked by the same validator and simulator; not the planner’s selected timing.' };
  }));
  out.push(check('future-B-instr', 'future-commitments', [TE], 'B: instructions confirmed for minute 1 → plan/validate/approve/execute 24; minute 2 makes the same plan invalid', '24 arrive; late instructions rejected', () => {
    const s = edit('B', (x) => { x.groups[1].instructionsAvailableAt = 1; });
    const p = planConfirmed(s); const ap = approvePlan(s, 0, p); const st = execute(s, p);
    const late = edit('B', (x) => { x.groups[1].instructionsAvailableAt = 2; });
    const v = validateSchedule(late, p.schedule);
    return { pass: ap.ok && arrivedCount(s, st) === 24 && !v.valid, observed: `approve ${ap.ok}; executed ${arrivedCount(s, st)}; with instructions at 2: ${v.errors[0]}` };
  }));
  return out;
}

// ---------------------------------------------------------------- seeded variations
export function seededVariations(seed = 4242, n = 15) {
  const rnd = mulberry32(seed);
  const kinds = ['battery shortage', 'lower shelter capacity', 'longer repair', 'slower connection', 'later instructions', 'faster hazard'];
  const rows: { i: number; seed: number; base: string; change: string; inputHash: string; served: number; baseline: number; valid: boolean; status: string; elapsedMs: number; optimality: string; tasks: string }[] = [];
  for (let i = 0; i < n; i++) {
    const baseId = ['A', 'B', 'C'][i % 3];
    const s = getScenario(baseId);
    const kind = kinds[i % kinds.length];
    let change = '';
    if (kind === 'battery shortage') { s.crew.batteries = Math.floor(rnd() * 4); change = `batteries ${s.crew.batteries}`; }
    if (kind === 'lower shelter capacity') { const sh = s.shelters[Math.floor(rnd() * 2)]; sh.places = 8 + Math.floor(rnd() * 4); change = `${sh.location} places ${sh.places}`; }
    if (kind === 'longer repair') { const a = s.actions.find((x) => x.kind === 'repair')!; a.duration += 1 + Math.floor(rnd() * 3); change = `fan repair ${a.duration} min`; }
    if (kind === 'slower connection') { const c = s.connections[Math.floor(rnd() * s.connections.length)]; c.minutes += 1 + Math.floor(rnd() * 2); change = `${c.id} ${c.minutes} min`; }
    if (kind === 'later instructions') { const g = s.groups[Math.floor(rnd() * 3)]; g.instructionsAvailableAt = 1 + Math.floor(rnd() * 3); change = `${g.id} instructions at ${g.instructionsAvailableAt}`; }
    if (kind === 'faster hazard') { const l = s.locations.find((x) => x.id === (rnd() < 0.5 ? 'RA' : 'J3'))!; l.hazard.rate = Math.round(l.hazard.rate * (1.1 + rnd() * 0.3) * 10) / 10; change = `${l.id} growth ${l.hazard.rate}`; }
    const t0 = Date.now(); const p = planConfirmed(s); const el = Date.now() - t0;
    const b = planConfirmed(s, { kinds: [], escort: false });
    const total = s.groups.reduce((x, g) => x + g.count, 0);
    rows.push({ i, seed, base: baseId, change: `${kind}: ${change}`, inputHash: inputHash(s), served: served(p), baseline: served(b), valid: validateSchedule(s, p.schedule).valid, status: p.search.status, elapsedMs: el,
      optimality: served(p) === total ? 'criterion 1 optimal by bound (all residents)' : p.search.status === 'exhaustive' ? 'exhaustive within declared scope; not independently enumerated' : 'not established', tasks: p.schedule.tasks.join(' > ') || 'no work' });
  }
  return { seed, rows };
}

export function seededChecks(): { checks: Check[]; data: ReturnType<typeof seededVariations> } {
  const t0 = Date.now();
  const data = seededVariations();
  const bad = data.rows.filter((r) => !r.valid || r.served < r.baseline || (r.status !== 'exhaustive' && r.status !== 'proven-infeasible'));
  return { data, checks: [{ id: 'seeded-variations', name: `${data.rows.length} seeded perturbations of A–C (seed ${data.seed})`, category: 'seeded-variations', criteria: [TE], required: true, status: bad.length === 0 && data.rows.length >= 12 ? 'passed' : 'failed', expected: '>= 12 cases; every schedule independently valid and at least the seeded baseline', observed: data.rows.map((r) => `#${r.i} ${r.base} ${r.change} → ${r.served} (baseline ${r.baseline}, ${r.valid ? 'valid' : 'INVALID'}, ${r.status}, ${r.elapsedMs} ms)`).join('; '), elapsedMs: Date.now() - t0, limitations: 'Validity is established for these instances; optimality only where the all-residents bound is met.' }] };
}

// ---------------------------------------------------------------- stress
export function stressChecks(): { checks: Check[]; tables: Record<string, unknown> } {
  const tables: Record<string, unknown> = {};
  const checks: Check[] = [];
  for (const id of ['A', 'B', 'C']) {
    checks.push(check(`stress-${id}`, 'stress', [FH, TE], `${id}: selected plan under 8 declared variants (repair +0/1/3/4 × growth ×1.0/1.2)`, '8 rows evaluated with propagation, revalidated', () => {
      const s = getScenario(id); const p = planConfirmed(s); const rows = stressSelected(s, p.schedule);
      tables[id] = rows.map((r) => ({ variant: r.variant.id, feasible: r.feasibleGroups.join(''), residents: r.residentsFeasible, failed: r.failedGroups.map((f) => `${f.group}: ${f.constraints[0]}`) }));
      return { pass: rows.length === 8 && rows[0].residentsFeasible === served(p), observed: rows.map((r) => `${r.variant.id}: ${r.residentsFeasible}`).join('; '), limitations: 'Eight-case result describes those eight cases only; not a failure probability.' };
    }));
  }
  checks.push(check('stress-recompute', 'stress', [TE], 'B: recompute under +1 min repair delay from the same perturbed snapshot (reported separately)', 'selected plan fails for B; recomputation reports its own result and search status', () => {
    const s = getScenario('B'); const v = STRESS_VARIANTS.find((x) => x.repairDelay === 1 && x.multiplier === 1)!;
    const r = recomputeUnder(s, v) as PlanResult;
    const pv = perturb(s, v); const prop = propagate(s, pv, planConfirmed(s).schedule); void prop;
    tables.recompute = { variant: v.id, served: served(r), tasks: r.schedule.tasks, status: r.search.status };
    return { pass: served(r) === 20 && vOK(pv, r).valid, observed: `recomputed: ${served(r)} (${r.schedule.tasks.join(' > ')}), ${r.search.status}; A remains reachable only without the fan, B only with it` };
  }));
  checks.push(check('stress-D', 'stress', [OI], 'D: selected policies executed in both states at inspection 1 and 8, plus the 7-minute boundary', 'd1 24/20, d7 24 (A at 20)/20, d8 20/20 executed', () => {
    const res: string[] = [];
    let ok = true;
    for (const [d, eo, eb] of [[1, 24, 20], [7, 24, 20], [8, 20, 20]] as const) {
      const s = scenarioD(d); const p = planPolicy(s);
      const o = execute(s, p, defaultTruth(s, 'open')), b = execute(s, p, defaultTruth(s, 'blocked'));
      ok = ok && arrivedCount(s, o) === eo && arrivedCount(s, b) === eb && (d !== 7 || o.groups.A.arrivedAt === 20);
      res.push(`d${d}: open ${arrivedCount(s, o)}${d === 7 ? ` (A at ${o.groups.A.arrivedAt})` : ''}, blocked ${arrivedCount(s, b)}`);
    }
    tables.D = res;
    return { pass: ok, observed: res.join('; ') };
  }));
  return { checks, tables };
}

// ---------------------------------------------------------------- benchmarks
export function benchmarks(): Check[] {
  const rows: string[] = [];
  const data: Record<string, unknown> = {};
  for (const id of ['A', 'B', 'C', 'D', 'E']) {
    const times: number[] = [];
    let status = '', explored = 0;
    for (let k = 0; k < 3; k++) { const s = getScenario(id); const t0 = performance.now(); const p = planAny(s); times.push(performance.now() - t0); status = p.search.status; explored = p.search.explored; }
    times.sort((a, b) => a - b);
    rows.push(`${id}: median ${times[1].toFixed(1)} ms (${explored} plans, ${status})`);
    data[id] = { medianMs: Math.round(times[1] * 10) / 10, explored, status };
  }
  return [{ id: 'benchmarks', name: 'Search-time benchmarks on this machine (median of 3)', category: 'benchmarks', criteria: [TE], required: true, status: 'passed', expected: 'recorded', observed: rows.join('; '), elapsedMs: 0, data, limitations: 'Times depend on the machine; budget 20,000 plans / 8 s per search.' }];
}
