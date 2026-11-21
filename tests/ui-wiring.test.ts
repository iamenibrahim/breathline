// UI ↔ engine wiring: drives the same session functions the React buttons call
// (Compute → Approve → Step → reload/Resume → edit → recompute), mirroring scripts/offline-check.ts
// without needing a browser. Also calls the engine helpers App.tsx renders from.
import { beforeAll, describe, expect, it } from 'vitest';
import {
  activeSchedule, applyEdit, approve, compute, computeAllRequests, isPlanStale, loadSession, newSession,
  resetRun, resumeRun, saveSession, stepRun, truthOf, type Session,
} from '../src/ui/session';
import { buildExport } from '../src/engine/exportRun';
import { confirmationsFor } from '../src/engine/approval';
import { explainPolicy, explainSchedule } from '../src/engine/explain';
import { groupBenefits } from '../src/engine/benefit';
import { stressSelected } from '../src/engine/stress';

beforeAll(() => {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const arrived = (s: Session) =>
  s.scenario.groups.filter((g) => s.run!.main.state.groups[g.id].status === 'arrived').reduce((n, g) => n + g.count, 0);
const playToEnd = (s: Session) => { for (let i = 0; i < 200 && !s.run!.main.state.done; i++) s = stepRun(s); return s; };
const computeApprove = (s: Session) => { s = computeAllRequests(compute(s)); const a = approve(s); expect(a.approvalErrors).toEqual([]); expect(a.run).not.toBeNull(); return a; };

describe('UI session → engine wiring', () => {
  it('A: compute, approve, play → 24/24; reload restores paused; resume → 24/24 with 0 violations', () => {
    let s = computeApprove(newSession('A'));
    expect(s.plan!.kind === 'schedule' ? explainSchedule(s.scenario, s.plan!.schedule) : explainPolicy(s.scenario, s.plan!)).toBeTruthy();
    expect(confirmationsFor(s.scenario, s.plan!)).toBeDefined();
    s = playToEnd(s);
    expect(arrived(s)).toBe(24);

    const sc = activeSchedule(s)!;
    expect(groupBenefits(s.scenario, sc, s.run!.baseline.state, s.run!.main.state).length).toBeGreaterThan(0);
    expect(stressSelected(s.scenario, sc).length).toBe(8);
    const ex = buildExport(s.scenario, s.run!.main.plan, truthOf(s), s.run!.main.state, s.revision, { resourceRequests: s.requests });
    expect(JSON.parse(JSON.stringify(ex))).toBeTruthy();

    s = resetRun(s);
    for (let i = 0; i < 7; i++) s = stepRun(s);
    const before = s.run!.main.state.processedThrough;
    saveSession(s);
    let r = loadSession()!;
    expect(r.notice).toContain('Restored after reload');
    expect(r.run!.main.state.processedThrough).toBe(before);
    expect(stepRun(r).run!.main.state.processedThrough).toBe(before); // paused: no progress until Resume
    r = playToEnd(resumeRun(r));
    expect(arrived(r)).toBe(24);
    expect(r.run!.main.state.violations.length).toBe(0);
  });

  it('edit batteries 4→3 makes the plan stale; recompute serves 16 of 24', () => {
    let s = computeApprove(newSession('A'));
    s = applyEdit(s, 'batteries 4 → 3', (x) => { x.crew.batteries = 3; });
    expect(isPlanStale(s)).toBe(true);
    expect(approve(s).approvalErrors.length).toBeGreaterThan(0);
    s = compute(s);
    const sc = s.plan!.kind === 'schedule' ? s.plan!.schedule : s.plan!.branches.open;
    expect(sc.objective.served).toBe(16);
  });

  it.each([['blocked', 20], ['open', 24]] as const)('D with hidden bypass %s → %i/24 arrived', (bypass, want) => {
    let s = newSession('D');
    s = { ...s, truth: { ...s.truth, bypass } };
    s = playToEnd(computeApprove(s));
    expect(arrived(s)).toBe(want);
  });

  it('E → 20/24 arrived', () => {
    const s = playToEnd(computeApprove(newSession('E')));
    expect(arrived(s)).toBe(20);
  });
});
