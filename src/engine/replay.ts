// Independent replay of an exported event history. Reconstructs boundary states only from the
// events (positions, effects, deliveries, consumption, admissions) plus the scenario's static data,
// and re-integrates exposure itself.
import type { Scenario } from './types';
import type { SimEvent } from './simulate';
import type { BoundarySnapshot } from './timeline';
import { effectiveRate, hazardAt, round6 } from './world';

export function replayEvents(s: Scenario, events: SimEvent[], processedThrough: number): BoundarySnapshot[] {
  const H = s.horizon;
  type Edge = { conn: string; from: string; to: string; start: number; end: number } | null;
  const crew: { at: string | null; edge: Edge; activity: string | null } = { at: s.crew.start, edge: null, activity: null };
  const g: Record<string, { at: string | null; edge: Edge; arrivedAt: number | null; exposure: number; protected: number; crossed: boolean; arrived: boolean }> = {};
  for (const x of s.groups) g[x.id] = { at: x.location, edge: null, arrivedAt: null, exposure: 0, protected: 0, crossed: false, arrived: false };
  const rates: Record<string, { at: number; rate: number }[]> = {};
  const occupants: Record<string, string[]> = {};
  for (const sh of s.shelters) occupants[sh.location] = [];
  let consumed = 0, pack = s.crew.batteries;
  const local: Record<string, number> = {};
  for (const d of s.deliveries) if (d.confirmed && d.resource === 'batteries') local[d.location] = 0;
  const hz = (loc: string, t: number) => {
    if (s.shelters.some((x) => x.location === loc)) return 0;
    const l = s.locations.find((x) => x.id === loc)!;
    return hazardAt(l.hazard.initial, effectiveRate(l.hazard.rate, s.hazardMultiplier ?? 1), rates[loc], t);
  };
  const chz = (conn: string, t: number) => { const c = s.connections.find((x) => x.id === conn)!; return hazardAt(c.hazard.initial, effectiveRate(c.hazard.rate, s.hazardMultiplier ?? 1), undefined, t); };
  const pos = (x: { at: string | null; edge: Edge }, t: number) => {
    if (x.edge && x.edge.start < t && t < x.edge.end) return { at: null, edge: x.edge.conn };
    if (x.edge && x.edge.start === t) return { at: x.edge.from, edge: null };
    return { at: x.at, edge: null };
  };
  const out: BoundarySnapshot[] = [];
  const byT = new Map<number, SimEvent[]>();
  for (const e of events) { const l = byT.get(e.t) ?? []; l.push(e); byT.set(e.t, l); }
  for (let t = 0; t <= Math.min(processedThrough, H); t++) {
    for (const e of byT.get(t) ?? []) {
      const p = (e.payload ?? {}) as Record<string, any>;
      if (e.entity === 'crew') {
        if (e.action === 'depart') { const l = p.leg; crew.edge = { conn: l.conn, from: l.from, to: l.to, start: l.start, end: l.end }; }
        else if (e.action === 'arrive') { crew.at = p.at; crew.edge = null; }
        else if (e.action.endsWith('-start')) crew.activity = e.after as string;
        else if (e.action === 'activity-end') crew.activity = null;
        else if (e.action === 'work-complete') { for (const src of p.sources ?? []) { consumed += src.qty; if (src.location === 'pack') pack -= src.qty; else local[src.location] -= src.qty; } }
      } else if (e.action === 'hazard-growth-changed' || e.action === 'protection-applied') {
        (rates[p.location] ??= []).push({ at: e.t, rate: p.rate }); rates[p.location].sort((a, b) => a.at - b.at);
      } else if (e.action === 'delivery-arrived') {
        if (p.resource === 'batteries') local[p.location] = (local[p.location] ?? 0) + p.quantity;
      } else if (g[e.entity]) {
        const x = g[e.entity];
        if (e.action === 'depart') { const l = p.leg; x.edge = { conn: l.conn, from: l.from, to: l.to, start: l.start, end: l.end }; }
        else if (e.action === 'arrive') { x.at = p.at; x.edge = null; }
        else if (e.action === 'admitted') { x.arrived = true; x.arrivedAt = e.t; occupants[p.shelter].push(e.entity); }
        else if (e.action === 'corrupted-arrival') { x.at = p.at; x.edge = null; x.arrived = true; x.arrivedAt = e.t; occupants[p.at]?.push(e.entity); }
      }
    }
    const groups: BoundarySnapshot['groups'] = {};
    for (const x of s.groups) { const y = g[x.id]; const pp = pos(y, t); groups[x.id] = { at: pp.at, edge: pp.edge, arrivedAt: y.arrivedAt, exposure: round6(y.exposure), protected: y.protected }; }
    const sh: Record<string, string[]> = {};
    for (const k of Object.keys(occupants)) sh[k] = occupants[k].slice().sort();
    const cp = pos(crew, t);
    out.push({ t, crew: { at: cp.at, edge: cp.edge, activity: crew.activity }, batteries: { consumed, pack, local: { ...local } }, shelters: sh, groups });
    if (t >= processedThrough || t >= H) continue;
    for (const x of s.groups) {
      const y = g[x.id];
      if (y.arrived) continue;
      y.exposure = round6(y.exposure + (y.edge ? chz(y.edge.conn, t) : y.at ? hz(y.at, t) : 0));
      if (!y.edge && y.at === x.location && !y.crossed) { if (hz(x.location, t) >= s.threshold) y.crossed = true; else y.protected++; }
    }
  }
  return out;
}

export function reconcileFinal(s: Scenario, events: SimEvent[]) {
  const arrivals = events.filter((e) => e.action === 'admitted').map((e) => e.entity).sort();
  const arrived = arrivals.reduce((n, gid) => n + s.groups.find((g) => g.id === gid)!.count, 0);
  const consumed = events.filter((e) => e.action === 'work-complete').reduce((n, e) => n + Number((e.payload as any)?.consumed ?? 0), 0);
  const observations = events.filter((e) => e.action === 'inspection-complete').map((e) => `${e.t}:${e.after}`);
  const branch = events.find((e) => e.action === 'branch-activated')?.after ?? null;
  return { arrivals, arrived, consumed, observations, branch };
}
