import { describe, expect, it } from 'vitest';
import { hazardAt } from '../src/engine/world';
import { getScenario, scenarioD, defaultTruth } from '../src/engine/scenarios';
import { initLiveLedger, reserveForApproval, processDelivery, canStartWork, consumeForTask, ledgerInvariant, checkAdmissions } from '../src/engine/ledger';
import { planConfirmed } from '../src/engine/planner';
import { planPolicy } from '../src/engine/policy';
import { compilePlan, executeWithCheckpoints, restore } from '../src/engine/simulate';
import * as S from '../src/checks/suites';

const expectAllPassed = (checks: S.Check[]) => {
  const bad = checks.filter((c) => c.status !== 'passed');
  expect(bad.map((c) => `${c.id}: ${c.observed}`)).toEqual([]);
};

describe('hazard formula', () => {
  it('preserves accumulated hazard and changes growth only after completion', () => {
    expect(hazardAt(10, 10, [{ at: 5, rate: 2 }], 9)).toBe(68);
    expect(hazardAt(10, 10, [{ at: 5, rate: 2 }], 5)).toBe(60);
    expect(hazardAt(10, 10, undefined, 9)).toBe(100);
    expect(hazardAt(2, 7, [{ at: 13, rate: 0 }], 20)).toBe(93);
  });
});

describe('shared resource ledger', () => {
  it('keeps pending, reserved and consumed distinct; processes a delivery once', () => {
    const s = scenarioD(1);
    s.deliveries.push({ id: 'd', resource: 'batteries', quantity: 4, location: 'G', minute: 14, source: 'crew', confirmed: true });
    const l = initLiveLedger(s);
    expect(reserveForApproval(l, s, [{ taskId: 'gate', location: 'G', deliveryId: 'd', qty: 4, branch: 'common' }], {})).toEqual([]);
    expect(l.locs.G.pendingReserved).toBe(4);
    expect(canStartWork(l, 'gate').ok).toBe(false);
    expect(processDelivery(l, s.deliveries[0])).toBe(true);
    expect(processDelivery(l, s.deliveries[0])).toBe(false);
    expect(canStartWork(l, 'gate').ok).toBe(true);
    expect(consumeForTask(l, 'gate', 16)).toBe(4);
    expect(consumeForTask(l, 'gate', 16)).toBe(0);
    expect(ledgerInvariant(l, s)).toEqual([]);
  });
  it('checks place reservations at every minute from admission', () => {
    const s = getScenario('A');
    s.shelters[0].places = 11;
    s.deliveries.push({ id: 'p', resource: 'places', quantity: 1, location: 'L', minute: 20, source: 'steward', confirmed: true });
    expect(checkAdmissions(s, 'L', [{ group: 'B', minute: 10, count: 8 }, { group: 'A', minute: 13, count: 4 }], 20).ok).toBe(false);
    expect(checkAdmissions(s, 'L', [{ group: 'B', minute: 10, count: 8 }, { group: 'A', minute: 20, count: 4 }], 20).ok).toBe(true);
  });
});

describe('determinism and checkpoints', () => {
  it('returns identical plans for identical inputs', () => {
    const a = planConfirmed(getScenario('A')), b = planConfirmed(getScenario('A'));
    expect(JSON.stringify(a.schedule)).toBe(JSON.stringify(b.schedule));
    const c = planPolicy(scenarioD(1)), d = planPolicy(scenarioD(1));
    expect(JSON.stringify(c.branches)).toBe(JSON.stringify(d.branches));
  });
  it('restores paused at the checkpoint and requires explicit resume', () => {
    const s = getScenario('A');
    const { checkpoints } = executeWithCheckpoints({ s, plan: compilePlan(s, planConfirmed(s)), truth: defaultTruth(s) }, 'cp');
    const st = restore(checkpoints[8]);
    expect(st.paused).toBe(true);
    expect(st.processedThrough).toBe(7);
  });
});

describe('reference conditions A–E and setup edits', () => { it('pass', () => expectAllPassed(S.referenceChecks())); });
describe('focused behaviour checks', () => { it('pass', () => expectAllPassed(S.focusedChecks())); });
describe('independent validator', () => { it('accepts every reference plan', () => expectAllPassed(S.validatorChecks())); });
describe('negative cases', () => { it('pass', () => expectAllPassed(S.negativeChecks())); });
describe('interruption at transaction boundaries', () => { it('pass', () => expectAllPassed(S.interruptionChecks())); });
describe('agreement gate', () => { it('five views agree for every reference run', () => expectAllPassed(S.agreementChecks().checks)); });
describe('export and replay', () => { it('reproduce', () => expectAllPassed(S.exportChecks())); });
describe('resource requests and future commitments', () => { it('pass', () => expectAllPassed(S.requestChecks())); });
