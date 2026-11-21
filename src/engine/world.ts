// Hazard formulas and the planning "world": connection availability over time and
// hazard-rate changes produced by completed work. Shared by planner, simulator and validator.
import type { ConnectionDef, ConnId, EffectRecord, LocationDef, LocId, PassageState, Scenario } from './types';

export interface RateChange { at: number; rate: number }

export const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/**
 * h(t) = initial + originalRate*min(t, r) + repairedRate*max(0, t - r), generalised to several
 * ordered changes. Accumulated hazard is preserved; a change only alters growth after it completes.
 */
export function hazardAt(initial: number, originalRate: number, changes: RateChange[] | undefined, t: number): number {
  let h = initial;
  let rate = originalRate;
  let last = 0;
  if (changes) {
    for (const c of changes) {
      if (c.at >= t) break;
      h += rate * (c.at - last);
      last = c.at;
      rate = c.rate;
    }
  }
  h += rate * (t - last);
  return round6(h);
}

export interface Adj { conn: ConnectionDef; to: LocId }

export interface World {
  s: Scenario;
  H: number;
  thr: number;
  mult: number;
  locs: Map<LocId, LocationDef>;
  conns: Map<ConnId, ConnectionDef>;
  adj: Map<LocId, Adj[]>;
  openAt: Map<ConnId, number>;
  rateChanges: Map<LocId, RateChange[]>;
  shelters: Set<LocId>;
  sig: string;
}

export function effectiveRate(rate: number, mult: number) {
  return rate > 0 ? round6(rate * mult) : rate;
}

/**
 * Base world from the planner-visible scenario. Unknown connections are unavailable unless
 * `assumed` supplies a state (used only for confirmed-world analysis of one declared state).
 */
export function baseWorld(s: Scenario, assumed?: Record<ConnId, PassageState>): World {
  const locs = new Map(s.locations.map((l) => [l.id, l] as const));
  const conns = new Map(s.connections.map((c) => [c.id, c] as const));
  const adj = new Map<LocId, Adj[]>();
  for (const l of s.locations) adj.set(l.id, []);
  for (const c of s.connections) {
    adj.get(c.a)!.push({ conn: c, to: c.b });
    adj.get(c.b)!.push({ conn: c, to: c.a });
  }
  for (const list of adj.values()) list.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : x.conn.id < y.conn.id ? -1 : 1));
  const openAt = new Map<ConnId, number>();
  for (const c of s.connections) {
    let st: string = c.state;
    if (st === 'unknown' && assumed && assumed[c.id]) st = assumed[c.id];
    openAt.set(c.id, st === 'open' ? 0 : Infinity);
  }
  const w: World = {
    s, H: s.horizon, thr: s.threshold, mult: s.hazardMultiplier ?? 1, locs, conns, adj, openAt,
    rateChanges: new Map(), shelters: new Set(s.shelters.map((x) => x.location)), sig: '',
  };
  w.sig = worldSig(w);
  return w;
}

export function withEffects(w: World, effects: EffectRecord[]): World {
  if (!effects.length) return w;
  const openAt = new Map(w.openAt);
  const rateChanges = new Map<LocId, RateChange[]>();
  for (const [k, v] of w.rateChanges) rateChanges.set(k, v.slice());
  for (const e of effects) {
    const ef = e.effect;
    if (ef.type === 'openConnection') {
      openAt.set(ef.connection, Math.min(openAt.get(ef.connection) ?? Infinity, e.at));
    } else if (ef.type === 'setRate') {
      const list = rateChanges.get(ef.location) ?? [];
      list.push({ at: e.at, rate: ef.rate });
      list.sort((a, b) => a.at - b.at);
      rateChanges.set(ef.location, list);
    } else if (ef.type === 'reveal') {
      const revealed = (e as EffectRecord & { revealed?: string }).revealed;
      if (revealed === 'open') openAt.set(ef.connection, Math.min(openAt.get(ef.connection) ?? Infinity, e.at));
    }
  }
  const nw: World = { ...w, openAt, rateChanges, sig: '' };
  nw.sig = worldSig(nw);
  return nw;
}

function worldSig(w: World): string {
  const parts: string[] = [];
  for (const [k, v] of [...w.openAt.entries()].sort()) if (v !== Infinity) parts.push(`${k}@${v}`);
  for (const [k, v] of [...w.rateChanges.entries()].sort()) parts.push(`${k}:${v.map((c) => `${c.at}>${c.rate}`).join(',')}`);
  return parts.join('|') + `|m${w.mult}`;
}

export function nodeHazard(w: World, loc: LocId, t: number): number {
  const l = w.locs.get(loc)!;
  return hazardAt(l.hazard.initial, effectiveRate(l.hazard.rate, w.mult), w.rateChanges.get(loc), t);
}

export function connHazard(w: World, conn: ConnId, t: number): number {
  const c = w.conns.get(conn)!;
  return hazardAt(c.hazard.initial, effectiveRate(c.hazard.rate, w.mult), undefined, t);
}

export function traversable(w: World, conn: ConnId, t: number): boolean {
  return (w.openAt.get(conn) ?? Infinity) <= t;
}

export function isShelter(w: World, loc: LocId) { return w.shelters.has(loc); }

/** Node safe at boundary t (shelters are safe terminal destinations). */
export function nodeSafe(w: World, loc: LocId, t: number): boolean {
  if (w.shelters.has(loc)) return true;
  return nodeHazard(w, loc, t) < w.thr;
}

/** Connection safe across [t0, t1] including both endpoints. Connection hazards are linear in these fixtures. */
export function connSafe(w: World, conn: ConnId, t0: number, t1: number): boolean {
  for (let t = t0; t <= t1; t++) if (connHazard(w, conn, t) >= w.thr) return false;
  return true;
}

export function connExposure(w: World, conn: ConnId, t0: number, t1: number): number {
  let e = 0;
  for (let t = t0; t < t1; t++) e += connHazard(w, conn, t);
  return round6(e);
}

/** Protected minutes: elapsed intervals [m, m+1) beginning before the location first reaches the threshold. */
export function protectedMinutes(w: World, loc: LocId): number {
  let n = 0;
  for (let m = 0; m < w.H; m++) {
    if (nodeHazard(w, loc, m) >= w.thr) break;
    n++;
  }
  return n;
}

export function firstCrossing(w: World, loc: LocId): number | null {
  for (let m = 0; m <= w.H; m++) if (nodeHazard(w, loc, m) >= w.thr) return m;
  return null;
}

export function waitExposure(w: World, loc: LocId, t0: number, t1: number): number {
  let e = 0;
  for (let t = t0; t < t1; t++) e += nodeHazard(w, loc, t);
  return round6(e);
}
