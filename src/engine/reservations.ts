// Resident capacity reservations. Connection occupancy is reserved on [departure, arrival) and
// counts concurrent residents; a bidirectional connection has one shared pool. Node occupancy
// counts residents present at each integer boundary. Shelters use places (ledger), not node capacity.
import type { ConnId, GroupId, Journey, Leg, LocId } from './types';
import type { World } from './world';

export interface Usage {
  group: GroupId;
  count: number;
  conns: { conn: ConnId; start: number; end: number }[];
  nodes: { loc: LocId; t: number }[];
}

/** Presence of a journey: home from 0 until departure, every wait interval, every node passed. */
export function journeyUsage(j: { groupId: GroupId; legs: Leg[]; departure: number; shelter: LocId }, count: number, home: LocId, shelters: Set<LocId>): Usage {
  const conns: Usage['conns'] = [];
  const nodeSet = new Set<string>();
  const add = (loc: LocId, t: number) => { if (!shelters.has(loc)) nodeSet.add(`${loc}@${t}`); };
  for (let t = 0; t <= j.departure; t++) add(home, t);
  for (const l of j.legs) {
    if (l.conn === null) for (let t = l.start; t <= l.end; t++) add(l.from, t);
    else { conns.push({ conn: l.conn, start: l.start, end: l.end }); add(l.from, l.start); add(l.to, l.end); }
  }
  const nodes = [...nodeSet].map((k) => { const [loc, t] = k.split('@'); return { loc, t: Number(t) }; });
  return { group: j.groupId, count, conns, nodes };
}

export function homeUsage(group: GroupId, count: number, home: LocId, horizon: number): Usage {
  const nodes = [] as Usage['nodes'];
  for (let t = 0; t <= horizon; t++) nodes.push({ loc: home, t });
  return { group, count, conns: [], nodes };
}

export class Residual {
  private connLoad = new Map<string, number>();
  private nodeLoad = new Map<string, number>();
  constructor(private w: World) {}

  canMove(conn: ConnId, start: number, end: number, count: number): boolean {
    const cap = this.w.conns.get(conn)!.capacity;
    for (let m = start; m < end; m++) if ((this.connLoad.get(`${conn}@${m}`) ?? 0) + count > cap) return false;
    return true;
  }
  canBe(loc: LocId, t: number, count: number): boolean {
    if (this.w.shelters.has(loc)) return true;
    const cap = this.w.locs.get(loc)!.capacity;
    return (this.nodeLoad.get(`${loc}@${t}`) ?? 0) + count <= cap;
  }
  fits(u: Usage): { ok: true } | { ok: false; reason: string } {
    for (const c of u.conns) if (!this.canMove(c.conn, c.start, c.end, u.count)) return { ok: false, reason: `corridor ${c.conn} capacity exceeded during [${c.start}, ${c.end})` };
    for (const n of u.nodes) if (!this.canBe(n.loc, n.t, u.count)) return { ok: false, reason: `location ${n.loc} capacity exceeded at minute ${n.t}` };
    return { ok: true };
  }
  add(u: Usage, sign = 1) {
    for (const c of u.conns) for (let m = c.start; m < c.end; m++) {
      const k = `${c.conn}@${m}`; this.connLoad.set(k, (this.connLoad.get(k) ?? 0) + sign * u.count);
    }
    for (const n of u.nodes) { const k = `${n.loc}@${n.t}`; this.nodeLoad.set(k, (this.nodeLoad.get(k) ?? 0) + sign * u.count); }
  }
  remove(u: Usage) { this.add(u, -1); }
}

/** Independent pairwise check for tests: do two connection intervals overlap on a shared pool? */
export function intervalsOverlap(a: { start: number; end: number }, b: { start: number; end: number }) {
  return a.start < b.end && b.start < a.end;
}

export function journeyToUsage(j: Journey, count: number, home: LocId, w: World): Usage {
  return journeyUsage(j, count, home, w.shelters);
}
