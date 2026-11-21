// Approval: revalidate against the current input revision before committing reservations.
// A stale plan cannot be approved; unconfirmed essential inputs block ordinary approval.
import type { AnyPlan, Scenario } from './types';
import { inputHash } from './common';
import { essentialConfirmations, validatePolicy, validateSchedule } from './validator';
import { compilePlan, type Compiled } from './simulate';

export function isStale(s: Scenario, revision: number, p: AnyPlan): boolean {
  return p.inputRevision !== revision || p.inputHash !== inputHash(s);
}

export interface ApprovalResult { ok: boolean; errors: string[]; confirmations: ReturnType<typeof essentialConfirmations>; compiled: Compiled | null }

export function confirmationsFor(s: Scenario, p: AnyPlan) {
  if (p.kind === 'schedule') return essentialConfirmations(s, p.schedule);
  const seen = new Set<string>();
  return [...essentialConfirmations(s, p.branches.open), ...essentialConfirmations(s, p.branches.blocked)].filter((x) => (seen.has(x.item) ? false : (seen.add(x.item), true)));
}

export function approvePlan(s: Scenario, revision: number, p: AnyPlan): ApprovalResult {
  const confirmations = confirmationsFor(s, p);
  if (isStale(s, revision, p)) return { ok: false, errors: [`Stale plan: computed for input revision ${p.inputRevision}, current revision is ${revision}. Recompute before approval.`], confirmations, compiled: null };
  const v = p.kind === 'schedule' ? validateSchedule(s, p.schedule, { approval: true }) : validatePolicy(s, p, { approval: true });
  if (!v.valid) return { ok: false, errors: v.errors, confirmations, compiled: null };
  return { ok: true, errors: [], confirmations, compiled: compilePlan(s, p) };
}
