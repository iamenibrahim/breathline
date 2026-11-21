// Time-expanded search over (location, minute) with explicit waiting.
// Residents: minimum-exposure trajectory per (shelter, admission minute), safety at every boundary,
// no transit through shelters, step-free groups never use stairs. Two-world mode is used for
// pre-observation journeys that must be valid in both possible passage states.
import type { GroupDef, Leg, LocId } from './types';
import { Residual } from './reservations';
import { connExposure, connSafe, nodeHazard, nodeSafe, round6, traversable, type World } from './world';

interface Label {
  e: number[]; // exposure per world
  w: number[]; // waiting exposure at home before departure, per world
  dep: number; // first move minute; Infinity while not departed
  arr: number; // minute arrived at current node
  parent: Label | null;
  node: LocId;
  t: number;
  via: null | { kind: 'wait' } | { kind: 'move'; conn: string; from: LocId; t0: number };
}

export interface Candidate {
  key: string;
  shelter: LocId;
  arrival: number;
  departure: number;
  legs: Leg[];
  exposures: number[];
  waiting: number[];
}

export interface DPInput {
  worlds: World[];
  group: GroupDef;
  minDeparture: number;
  maxDepartureExcl?: number;
  shelters: LocId[];
  stepFree: boolean;
  residual?: Residual;
}

const better = (a: Label, b: Label): boolean => {
  // a strictly preferred to b (single total order used for ties in one world)
  for (let i = 0; i < a.e.length; i++) if (a.e[i] !== b.e[i]) return false;
  if (a.dep !== b.dep) return a.dep > b.dep; // wait at home rather than in corridors
  if (a.arr !== b.arr) return a.arr < b.arr; // when waiting is needed en route, wait nearer the destination
  return false;
};

function dominates(a: Label, b: Label): boolean {
  let strictly = false;
  for (let i = 0; i < a.e.length; i++) {
    if (a.e[i] > b.e[i] + 1e-9) return false;
    if (a.e[i] < b.e[i] - 1e-9) strictly = true;
  }
  if (strictly) return true;
  // equal exposures
  for (let i = 0; i < a.e.length; i++) if (Math.abs(a.e[i] - b.e[i]) > 1e-9) return false;
  if (better(a, b)) return true;
  if (better(b, a)) return false;
  return true; // identical keys: keep the first inserted
}

function insert(set: Label[], l: Label): boolean {
  for (const x of set) if (dominates(x, l)) return false;
  for (let i = set.length - 1; i >= 0; i--) if (dominates(l, set[i])) set.splice(i, 1);
  set.push(l);
  return true;
}

function reconstruct(l: Label): Leg[] {
  const steps: Label[] = [];
  for (let c: Label | null = l; c; c = c.parent) steps.push(c);
  steps.reverse();
  const legs: Leg[] = [];
  for (const st of steps) {
    if (!st.via) continue;
    if (st.via.kind === 'wait') {
      const last = legs[legs.length - 1];
      if (last && last.conn === null && last.from === st.node && last.end === st.t - 1) last.end = st.t;
      else legs.push({ from: st.node, to: st.node, conn: null, start: st.t - 1, end: st.t });
    } else {
      legs.push({ from: st.via.from, to: st.node, conn: st.via.conn, start: st.via.t0, end: st.t });
    }
  }
  // drop home waiting before the first move (implied by departure), keep en-route waits
  while (legs.length && legs[0].conn === null) legs.shift();
  return legs;
}

/** Minimum-exposure trajectories to every reachable (allowed shelter, admission minute). */
export function groupDP(inp: DPInput): Candidate[] {
  const { worlds, group, stepFree } = inp;
  const w0 = worlds[0];
  const H = w0.H;
  const allowed = new Set(inp.shelters);
  const nW = worlds.length;
  const sets = new Map<string, Label[]>();
  const key = (n: LocId, t: number) => `${n}@${t}`;
  const home = group.location;
  if (!worlds.every((w) => nodeSafe(w, home, 0))) return [];
  if (inp.residual && !inp.residual.canBe(home, 0, group.count)) return [];
  const start: Label = { e: Array(nW).fill(0), w: Array(nW).fill(0), dep: Infinity, arr: 0, parent: null, node: home, t: 0, via: null };
  sets.set(key(home, 0), [start]);
  const results = new Map<string, Label[]>();
  const nodeIds = [...w0.locs.keys()].sort();

  for (let t = 0; t <= H; t++) {
    for (const n of nodeIds) {
      const ls = sets.get(key(n, t));
      if (!ls) continue;
      for (const lab of ls) {
        // wait one minute
        if (t + 1 <= H && worlds.every((w) => nodeSafe(w, n, t + 1)) && (!inp.residual || inp.residual.canBe(n, t + 1, group.count))) {
          const add = worlds.map((w) => nodeHazard(w, n, t));
          const nl: Label = {
            e: lab.e.map((x, i) => round6(x + add[i])),
            w: lab.dep === Infinity ? lab.w.map((x, i) => round6(x + add[i])) : lab.w,
            dep: lab.dep, arr: lab.arr, parent: lab, node: n, t: t + 1, via: { kind: 'wait' },
          };
          const k = key(n, t + 1);
          const s = sets.get(k) ?? [];
          if (insert(s, nl)) sets.set(k, s);
        }
        // move along a connection
        const isFirst = lab.dep === Infinity;
        if (t < inp.minDeparture) continue;
        if (isFirst && inp.maxDepartureExcl !== undefined && t >= inp.maxDepartureExcl) continue;
        for (const { conn, to } of w0.adj.get(n)!) {
          if (stepFree && !conn.accessible) continue;
          const t1 = t + conn.minutes;
          if (t1 > H) continue;
          if (!worlds.every((w) => traversable(w, conn.id, t))) continue;
          if (!worlds.every((w) => connSafe(w, conn.id, t, t1))) continue;
          const toShelter = w0.shelters.has(to);
          if (toShelter && !allowed.has(to)) continue; // residents may not pass through shelters
          if (!toShelter && !worlds.every((w) => nodeSafe(w, to, t1))) continue;
          if (inp.residual && (!inp.residual.canMove(conn.id, t, t1, group.count) || !inp.residual.canBe(to, t1, group.count))) continue;
          const add = worlds.map((w) => connExposure(w, conn.id, t, t1));
          const nl: Label = {
            e: lab.e.map((x, i) => round6(x + add[i])), w: lab.w,
            dep: isFirst ? t : lab.dep, arr: t1, parent: lab, node: to, t: t1,
            via: { kind: 'move', conn: conn.id, from: n, t0: t },
          };
          if (toShelter) {
            const rk = key(to, t1);
            const s = results.get(rk) ?? [];
            if (insert(s, nl)) results.set(rk, s);
          } else {
            const k = key(to, t1);
            const s = sets.get(k) ?? [];
            if (insert(s, nl)) sets.set(k, s);
          }
        }
      }
    }
  }
  const out: Candidate[] = [];
  for (const [k, ls] of results) {
    // pick min of worst-world exposure, then sum, then the tie order
    const pick = ls.slice().sort((a, b) => {
      const ma = Math.max(...a.e), mb = Math.max(...b.e);
      if (ma !== mb) return ma - mb;
      const sa = a.e.reduce((x, y) => x + y, 0), sb = b.e.reduce((x, y) => x + y, 0);
      if (sa !== sb) return sa - sb;
      if (a.dep !== b.dep) return b.dep - a.dep;
      return a.arr - b.arr;
    })[0];
    const [shelter, T] = k.split('@');
    out.push({ key: `${group.id}:${shelter}@${T}`, shelter, arrival: Number(T), departure: pick.dep, legs: reconstruct(pick), exposures: pick.e, waiting: pick.w });
  }
  out.sort((a, b) => Math.max(...a.exposures) - Math.max(...b.exposures) || a.arrival - b.arrival || (a.shelter < b.shelter ? -1 : a.shelter > b.shelter ? 1 : 0));
  return out;
}

/** Earliest safe crew travel (crew may use stairs and pass through shelters). Returns legs and arrival. */
export function crewPath(w: World, from: LocId, t0: number, to: LocId): { legs: Leg[]; arrival: number; moving: number } | null {
  if (from === to) return { legs: [], arrival: t0, moving: 0 };
  const H = w.H;
  const seen = new Map<string, { prev: string | null; leg: Leg | null }>();
  const k = (n: LocId, t: number) => `${n}@${t}`;
  seen.set(k(from, t0), { prev: null, leg: null });
  const frontier: Map<number, LocId[]> = new Map([[t0, [from]]]);
  for (let t = t0; t <= H; t++) {
    const nodes = (frontier.get(t) ?? []).slice().sort();
    for (const n of nodes) {
      if (n === to) {
        const legs: Leg[] = [];
        let cur: string | null = k(n, t);
        while (cur) { const e: { prev: string | null; leg: Leg | null } = seen.get(cur)!; if (e.leg) legs.push(e.leg); cur = e.prev; }
        legs.reverse();
        const merged: Leg[] = [];
        for (const l of legs) {
          const last = merged[merged.length - 1];
          if (l.conn === null && last && last.conn === null && last.end === l.start) last.end = l.end; else merged.push({ ...l });
        }
        const moving = merged.filter((l) => l.conn !== null).reduce((x, l) => x + (l.end - l.start), 0);
        return { legs: merged, arrival: t, moving };
      }
      for (const { conn, to: nb } of w.adj.get(n)!) {
        const t1 = t + conn.minutes;
        if (t1 > H || !traversable(w, conn.id, t) || !connSafe(w, conn.id, t, t1) || !nodeSafe(w, nb, t1)) continue;
        const kk = k(nb, t1);
        if (seen.has(kk)) continue;
        seen.set(kk, { prev: k(n, t), leg: { from: n, to: nb, conn: conn.id, start: t, end: t1 } });
        const list = frontier.get(t1) ?? []; list.push(nb); frontier.set(t1, list);
      }
      if (t + 1 <= H && nodeSafe(w, n, t + 1)) {
        const kk = k(n, t + 1);
        if (!seen.has(kk)) {
          seen.set(kk, { prev: k(n, t), leg: { from: n, to: n, conn: null, start: t, end: t + 1 } });
          const list = frontier.get(t + 1) ?? []; list.push(n); frontier.set(t + 1, list);
        }
      }
    }
  }
  return null;
}

/** Static reachability ignoring time and hazards (diagnostics). */
export function staticRoute(w: World, from: LocId, to: LocId, opts: { stepFree: boolean; noShelterTransit: boolean; openOnly: boolean }): LocId[] | null {
  const prev = new Map<LocId, LocId | null>([[from, null]]);
  const q = [from];
  while (q.length) {
    const n = q.shift()!;
    if (n === to) {
      const path: LocId[] = [];
      for (let c: LocId | null = n; c !== null; c = prev.get(c)!) path.push(c);
      return path.reverse();
    }
    if (n !== from && opts.noShelterTransit && w.shelters.has(n)) continue;
    for (const { conn, to: nb } of w.adj.get(n)!) {
      if (opts.stepFree && !conn.accessible) continue;
      if (opts.openOnly && (w.openAt.get(conn.id) ?? Infinity) === Infinity) continue;
      if (prev.has(nb)) continue;
      prev.set(nb, n);
      q.push(nb);
    }
  }
  return null;
}
