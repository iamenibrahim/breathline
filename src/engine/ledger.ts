// One shared resource-ledger module. The planner, validator, approval check, simulator and
// invariant checker all call these rules, so no part of the engine can accept a commitment
// that another part rejects.
//
// Batteries: the crew's starting pack is one location that moves with the crew ('pack'); each
// delivery point is another. Five quantities per location: available, reserved, consumed,
// pendingUnreserved, pendingReserved. Pending batteries are never available, can never be
// consumed and never satisfy a work start.
// Shelter places: time-indexed profile = confirmed current places + confirmed expected places
// from their delivery minute onward. Reservations are checked at every minute from admission.
import type { BatterySource, CrewActivity, DeliveryDef, LocId, Scenario } from './types';

export function confirmedDeliveries(s: Scenario, resource: 'batteries' | 'places', location?: LocId): DeliveryDef[] {
  return s.deliveries
    .filter((d) => d.confirmed && d.resource === resource && (location === undefined || d.location === location))
    .sort((a, b) => a.minute - b.minute || (a.id < b.id ? -1 : 1));
}

// ------------------------------------------------------------------ shelter places

export function basePlaces(s: Scenario, shelter: LocId): number {
  return s.shelters.find((x) => x.location === shelter)?.places ?? 0;
}

/** Places at minute t. `actual` overrides delivery minutes (simulator truth); null = never delivered. */
export function placeProfile(s: Scenario, shelter: LocId, t: number, actual?: Record<string, number | null>): number {
  let p = basePlaces(s, shelter);
  for (const d of confirmedDeliveries(s, 'places', shelter)) {
    const m = actual && d.id in actual ? actual[d.id] : d.minute;
    if (m !== null && m !== undefined && m <= t) p += d.quantity;
  }
  return p;
}

export function placeBreakpoints(s: Scenario, shelter: LocId): number[] {
  return [...new Set(confirmedDeliveries(s, 'places', shelter).map((d) => d.minute))].sort((a, b) => a - b);
}

export interface Admission { group: string; minute: number; count: number }

/** A set of reservations is valid when, at every minute, places reserved by groups admitted by then fit the profile. */
export function checkAdmissions(s: Scenario, shelter: LocId, admissions: Admission[], horizon: number):
  { ok: true } | { ok: false; minute: number; needed: number; available: number } {
  for (let t = 0; t <= horizon; t++) {
    let needed = 0;
    for (const a of admissions) if (a.minute <= t) needed += a.count;
    if (needed === 0) continue;
    const available = placeProfile(s, shelter, t);
    if (needed > available) return { ok: false, minute: t, needed, available };
  }
  return { ok: true };
}

// ------------------------------------------------------------------ planning-time batteries

export interface PlanBatteryState {
  pack: number; // batteries left in the crew pack (moves with the crew)
  used: Record<string, number>; // delivery id -> batteries allocated from it
}

export function initialPlanBatteries(s: Scenario): PlanBatteryState {
  return { pack: s.crew.batteries, used: {} };
}

/** Batteries delivered to `location` with delivery minute <= t that are not yet allocated. */
export function localStock(s: Scenario, st: PlanBatteryState, location: LocId, t: number): number {
  let n = 0;
  for (const d of confirmedDeliveries(s, 'batteries', location)) if (d.minute <= t) n += d.quantity - (st.used[d.id] ?? 0);
  return n;
}

/**
 * Allocate `need` batteries for work starting at `location` at minute t: delivered stock at the work
 * location first (on hand at t), then the crew pack. Returns null if not enough is on hand.
 */
export function allocateBatteries(s: Scenario, st: PlanBatteryState, location: LocId, need: number, t: number):
  { sources: BatterySource[]; next: PlanBatteryState } | null {
  if (need <= 0) return { sources: [], next: st };
  if (localStock(s, st, location, t) + st.pack < need) return null;
  const next: PlanBatteryState = { pack: st.pack, used: { ...st.used } };
  const sources: BatterySource[] = [];
  let rem = need;
  for (const d of confirmedDeliveries(s, 'batteries', location)) {
    if (rem <= 0) break;
    if (d.minute > t) continue;
    const left = d.quantity - (next.used[d.id] ?? 0);
    if (left <= 0) continue;
    const take = Math.min(left, rem);
    next.used[d.id] = (next.used[d.id] ?? 0) + take;
    sources.push({ location, deliveryId: d.id, qty: take });
    rem -= take;
  }
  if (rem > 0) {
    next.pack -= rem;
    sources.push({ location: 'pack', qty: rem });
  }
  return { sources, next };
}

/** Earliest minute >= from at which `need` batteries are on hand at `location` (pack + delivered stock). */
export function earliestBatteryMinute(s: Scenario, st: PlanBatteryState, location: LocId, need: number, from: number, latest: number): number | null {
  for (let t = from; t <= latest; t++) if (localStock(s, st, location, t) + st.pack >= need) return t;
  return null;
}

/** Independent check of the battery sources declared by a schedule (used by the validator and approval). */
export function checkBatterySources(s: Scenario, crew: CrewActivity[]): string[] {
  const errors: string[] = [];
  let pack = s.crew.batteries;
  const used: Record<string, number> = {};
  const work = crew.filter((a) => a.kind === 'work').sort((a, b) => a.start - b.start);
  for (const a of work) {
    const action = s.actions.find((x) => x.id === a.actionId);
    if (!action) { errors.push(`unknown action ${a.actionId}`); continue; }
    const srcs = a.batteries ?? [];
    const total = srcs.reduce((n, x) => n + x.qty, 0);
    if (total !== action.batteries) errors.push(`${action.label}: declares ${total} batteries, needs ${action.batteries}`);
    for (const src of srcs) {
      if (src.qty < 0) errors.push(`${action.label}: negative battery quantity`);
      if (src.location === 'pack') {
        pack -= src.qty;
        if (pack < 0) errors.push(`${action.label}: crew pack exhausted at minute ${a.start}`);
      } else {
        const d = s.deliveries.find((x) => x.id === src.deliveryId);
        if (!d) { errors.push(`${action.label}: unknown delivery ${src.deliveryId}`); continue; }
        if (!d.confirmed) errors.push(`${action.label}: relies on unconfirmed delivery ${d.id}`);
        if (d.location !== action.workLocation || src.location !== d.location) errors.push(`${action.label}: delivery ${d.id} is at ${d.location}, work is at ${action.workLocation}`);
        if (d.minute > a.start) errors.push(`${action.label}: starts at ${a.start} but delivery ${d.id} arrives at ${d.minute} (pending batteries cannot satisfy a work start)`);
        used[d.id] = (used[d.id] ?? 0) + src.qty;
        if (used[d.id] > d.quantity) errors.push(`${action.label}: delivery ${d.id} over-allocated`);
      }
    }
  }
  return errors;
}

// ------------------------------------------------------------------ live ledger (approval + execution)

export interface LocQty { available: number; reserved: number; consumed: number; pendingUnreserved: number; pendingReserved: number }

export interface BatteryReservation { taskId: string; location: string; deliveryId?: string; qty: number; branch: string }

export interface LiveLedger {
  initial: number;
  locs: Record<string, LocQty>;
  delivered: number;
  processedDeliveries: string[];
  consumptions: { taskId: string; qty: number; at: number; location: string }[];
  reservations: BatteryReservation[]; // active (common + activated branch)
  alternatives: Record<string, BatteryReservation[]>; // mutually exclusive branch reservations not yet activated
  activatedBranch: string | null;
}

const emptyQty = (): LocQty => ({ available: 0, reserved: 0, consumed: 0, pendingUnreserved: 0, pendingReserved: 0 });

export function initLiveLedger(s: Scenario): LiveLedger {
  const locs: Record<string, LocQty> = { pack: { ...emptyQty(), available: s.crew.batteries } };
  for (const d of confirmedDeliveries(s, 'batteries')) {
    locs[d.location] = locs[d.location] ?? emptyQty();
    locs[d.location].pendingUnreserved += d.quantity;
  }
  return { initial: s.crew.batteries, locs, delivered: 0, processedDeliveries: [], consumptions: [], reservations: [], alternatives: {}, activatedBranch: null };
}

function applyReservation(l: LiveLedger, r: BatteryReservation, s: Scenario): string | null {
  const q = (l.locs[r.location] = l.locs[r.location] ?? emptyQty());
  if (r.location === 'pack') {
    if (q.available < r.qty) return `pack has ${q.available} available, ${r.qty} needed for ${r.taskId}`;
    q.available -= r.qty; q.reserved += r.qty;
    return null;
  }
  const d = s.deliveries.find((x) => x.id === r.deliveryId);
  if (!d || !d.confirmed) return `delivery ${r.deliveryId} is not a confirmed expected delivery`;
  if (l.processedDeliveries.includes(d.id)) {
    if (q.available < r.qty) return `${r.location} has ${q.available} available`;
    q.available -= r.qty; q.reserved += r.qty;
  } else {
    if (q.pendingUnreserved < r.qty) return `${r.location} has ${q.pendingUnreserved} pending unreserved`;
    q.pendingUnreserved -= r.qty; q.pendingReserved += r.qty;
  }
  return null;
}

/** Reserve on approval. Common reservations once; branch reservations are validated as alternatives. */
export function reserveForApproval(l: LiveLedger, s: Scenario, common: BatteryReservation[], branches: Record<string, BatteryReservation[]>): string[] {
  const errors: string[] = [];
  for (const r of common) { const e = applyReservation(l, r, s); if (e) errors.push(e); }
  l.reservations.push(...common);
  for (const [b, rs] of Object.entries(branches)) {
    // validate each branch against the post-common ledger without committing it
    const trial: LiveLedger = JSON.parse(JSON.stringify(l));
    for (const r of rs) { const e = applyReservation(trial, r, s); if (e) errors.push(`branch ${b}: ${e}`); }
    l.alternatives[b] = rs;
  }
  return errors;
}

/** Commit only the matching branch's reservations when the observation arrives. */
export function activateBranch(l: LiveLedger, s: Scenario, branch: string): string[] {
  if (l.activatedBranch === branch) return [];
  if (l.activatedBranch) return [`branch ${l.activatedBranch} already active`];
  const errors: string[] = [];
  for (const r of l.alternatives[branch] ?? []) { const e = applyReservation(l, r, s); if (e) errors.push(e); else l.reservations.push(r); }
  l.activatedBranch = branch;
  l.alternatives = {};
  return errors;
}

/** Delivery processed exactly once: pending reserved -> reserved, pending unreserved -> available. */
export function processDelivery(l: LiveLedger, d: DeliveryDef): boolean {
  if (l.processedDeliveries.includes(d.id)) return false;
  const q = (l.locs[d.location] = l.locs[d.location] ?? emptyQty());
  const reservedForIt = l.reservations.filter((r) => r.deliveryId === d.id).reduce((n, r) => n + r.qty, 0);
  const res = Math.min(reservedForIt, q.pendingReserved, d.quantity);
  q.pendingReserved -= res; q.reserved += res;
  const unres = d.quantity - res;
  q.pendingUnreserved -= unres; q.available += unres;
  l.delivered += d.quantity;
  l.processedDeliveries.push(d.id);
  return true;
}

/** Work may start only if its batteries are reserved and on hand at the work location. */
export function canStartWork(l: LiveLedger, taskId: string): { ok: true } | { ok: false; reason: string; deliveryId?: string } {
  for (const r of l.reservations.filter((x) => x.taskId === taskId)) {
    if (r.location !== 'pack' && r.deliveryId && !l.processedDeliveries.includes(r.deliveryId)) {
      return { ok: false, reason: `batteries from delivery ${r.deliveryId} are still pending at ${r.location}`, deliveryId: r.deliveryId };
    }
    const q = l.locs[r.location];
    if (!q || q.reserved < r.qty) return { ok: false, reason: `${r.qty} reserved batteries not on hand at ${r.location}` };
  }
  return { ok: true };
}

/** Consume reserved batteries exactly once at completion. */
export function consumeForTask(l: LiveLedger, taskId: string, at: number): number {
  if (l.consumptions.some((c) => c.taskId === taskId)) return 0;
  let total = 0;
  for (const r of l.reservations.filter((x) => x.taskId === taskId)) {
    const q = l.locs[r.location];
    q.reserved -= r.qty; q.consumed += r.qty;
    total += r.qty;
    l.consumptions.push({ taskId, qty: r.qty, at, location: r.location });
  }
  return total;
}

export function releaseAll(l: LiveLedger) {
  for (const r of l.reservations) {
    const q = l.locs[r.location];
    if (r.location !== 'pack' && r.deliveryId && !l.processedDeliveries.includes(r.deliveryId)) { q.pendingReserved -= r.qty; q.pendingUnreserved += r.qty; }
    else { q.reserved -= r.qty; q.available += r.qty; }
  }
  l.reservations = []; l.alternatives = {};
}

export function totalConsumed(l: LiveLedger) {
  return Object.values(l.locs).reduce((n, q) => n + q.consumed, 0);
}

/** Battery accounting invariant: initial + delivered = available + reserved + consumed; pending matches undelivered confirmed deliveries. */
export function ledgerInvariant(l: LiveLedger, s: Scenario): string[] {
  const errs: string[] = [];
  let onHand = 0, pending = 0;
  for (const [k, q] of Object.entries(l.locs)) {
    for (const [f, v] of Object.entries(q)) if (v < 0) errs.push(`${k}.${f} is negative (${v})`);
    onHand += q.available + q.reserved + q.consumed;
    pending += q.pendingUnreserved + q.pendingReserved;
  }
  if (onHand !== l.initial + l.delivered) errs.push(`on-hand accounting ${onHand} != initial ${l.initial} + delivered ${l.delivered}`);
  const undelivered = confirmedDeliveries(s, 'batteries').filter((d) => !l.processedDeliveries.includes(d.id)).reduce((n, d) => n + d.quantity, 0);
  if (pending !== undelivered) errs.push(`pending ${pending} != undelivered confirmed deliveries ${undelivered}`);
  if (new Set(l.processedDeliveries).size !== l.processedDeliveries.length) errs.push('a delivery was processed twice');
  const tasks = l.consumptions.map((c) => c.taskId + '@' + c.location);
  if (new Set(tasks).size !== tasks.length) errs.push('a consumption was recorded twice');
  return errs;
}
