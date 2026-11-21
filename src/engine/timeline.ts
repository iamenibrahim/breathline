// Boundary snapshots: the common format used by the agreement gate. Each view (planner forecast,
// validator, live execution, replay of exported events, checkpoint resumption) produces one array
// of snapshots, t = 0..H, describing the state at boundary t after the boundary's transitions.
import type { GroupId, LocId, PassageState, Scenario, Schedule } from './types';
import { baseWorld, connHazard, nodeHazard, round6, withEffects } from './world';

export interface BoundarySnapshot {
  t: number;
  crew: { at: LocId | null; edge: string | null; activity: string | null };
  batteries: { consumed: number; pack: number; local: Record<string, number> };
  shelters: Record<LocId, string[]>;
  groups: Record<GroupId, { at: LocId | null; edge: string | null; arrivedAt: number | null; exposure: number; protected: number }>;
}

export function activityLabel(kind: string, id?: string) { return `${kind}${id ? ':' + id : ''}`; }

/** Planner forecast view: derived from the plan's own effect list and legs. */
export function forecastTimeline(s: Scenario, sc: Schedule, _state?: PassageState): BoundarySnapshot[] {
  const w = withEffects(baseWorld(s), sc.effects);
  const H = s.horizon;
  const out: BoundarySnapshot[] = [];
  const exp: Record<string, number> = {};
  const prot: Record<string, number> = {};
  const crossed: Record<string, boolean> = {};
  for (const g of s.groups) { exp[g.id] = 0; prot[g.id] = 0; crossed[g.id] = false; }
  const jBy = new Map(sc.journeys.map((j) => [j.groupId, j] as const));
  for (let t = 0; t <= H; t++) {
    // crew
    let at: string | null = s.crew.start, edge: string | null = null, activity: string | null = null;
    for (const a of sc.crew) {
      if (a.end <= t) at = a.to;
      if (a.start <= t && t < a.end) {
        activity = activityLabel(a.kind, a.actionId ?? a.groupId);
        at = a.from;
        for (const l of a.legs) {
          if (l.start <= t && t <= l.end) { if (l.conn && l.start < t && t < l.end) { edge = l.conn; at = null; } else at = t === l.end ? l.to : l.from; }
        }
      }
    }
    // batteries
    let consumed = 0, packUsed = 0;
    const localUsed: Record<string, number> = {};
    for (const a of sc.crew) if (a.kind === 'work' && a.end <= t) for (const b of a.batteries ?? []) {
      consumed += b.qty;
      if (b.location === 'pack') packUsed += b.qty; else localUsed[b.location] = (localUsed[b.location] ?? 0) + b.qty;
    }
    const local: Record<string, number> = {};
    for (const d of s.deliveries) if (d.confirmed && d.resource === 'batteries') {
      local[d.location] = (local[d.location] ?? 0) + (d.minute <= t ? d.quantity : 0);
    }
    for (const k of Object.keys(local)) local[k] -= localUsed[k] ?? 0;
    // groups
    const groups: BoundarySnapshot['groups'] = {};
    const shelters: Record<string, string[]> = {};
    for (const sh of s.shelters) shelters[sh.location] = [];
    for (const g of s.groups) {
      const j = jBy.get(g.id);
      let gat: string | null = g.location, gedge: string | null = null, arrivedAt: number | null = null;
      if (j && t >= j.departure) {
        if (t >= j.arrival) { gat = j.shelter; arrivedAt = j.arrival; shelters[j.shelter].push(g.id); }
        else for (const l of j.legs) if (l.start <= t && t <= l.end) { if (l.conn && l.start < t && t < l.end) { gedge = l.conn; gat = null; } else gat = t === l.end ? l.to : l.from; }
      }
      groups[g.id] = { at: gat, edge: gedge, arrivedAt, exposure: round6(exp[g.id]), protected: prot[g.id] };
    }
    for (const k of Object.keys(shelters)) shelters[k].sort();
    out.push({ t, crew: { at, edge, activity }, batteries: { consumed, pack: s.crew.batteries - packUsed, local }, shelters, groups });
    // integrate [t, t+1)
    if (t < H) for (const g of s.groups) {
      const j = jBy.get(g.id);
      let h = 0;
      let atHome = !j || t < j.departure;
      if (atHome) h = nodeHazard(w, g.location, t);
      else if (t < j!.arrival) {
        const l = j!.legs.find((x) => x.start <= t && t < x.end);
        h = l ? (l.conn ? connHazard(w, l.conn, t) : nodeHazard(w, l.from, t)) : 0;
        if (l && !l.conn && l.from === g.location) atHome = true;
      }
      exp[g.id] += h;
      if (atHome && !crossed[g.id]) { if (nodeHazard(w, g.location, t) >= w.thr) crossed[g.id] = true; else prot[g.id]++; }
    }
  }
  return out;
}

export function compareTimelines(a: BoundarySnapshot[], b: BoundarySnapshot[], from = 0): { equal: boolean; firstDiff: string | null } {
  const n = Math.max(a.length, b.length);
  for (let i = from; i < n; i++) {
    const x = a[i], y = b[i];
    if (!x || !y) return { equal: false, firstDiff: `missing boundary ${i}` };
    const sx = JSON.stringify(normalize(x)), sy = JSON.stringify(normalize(y));
    if (sx !== sy) {
      for (const k of ['crew', 'batteries', 'shelters', 'groups'] as const) {
        const ka = JSON.stringify(normalize(x)[k]), kb = JSON.stringify(normalize(y)[k]);
        if (ka !== kb) return { equal: false, firstDiff: `t=${i} ${k}: ${ka} vs ${kb}` };
      }
      return { equal: false, firstDiff: `t=${i}` };
    }
  }
  return { equal: true, firstDiff: null };
}

function normalize(sn: BoundarySnapshot) {
  const local: Record<string, number> = {};
  for (const k of Object.keys(sn.batteries.local).sort()) local[k] = sn.batteries.local[k];
  const groups: Record<string, unknown> = {};
  for (const k of Object.keys(sn.groups).sort()) { const g = sn.groups[k]; groups[k] = { ...g, exposure: Math.round(g.exposure * 1e4) / 1e4 }; }
  const shelters: Record<string, string[]> = {};
  for (const k of Object.keys(sn.shelters).sort()) shelters[k] = sn.shelters[k].slice().sort();
  return { t: sn.t, crew: sn.crew, batteries: { consumed: sn.batteries.consumed, pack: sn.batteries.pack, local }, shelters, groups };
}
