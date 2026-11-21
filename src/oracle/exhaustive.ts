// INDEPENDENT exhaustive solver for tiny instances. It enumerates every crew decision minute by
// minute from primitive rules (wait one minute, traverse a connection, do an offered action at the
// current location, start an escort and then choose each joint move/wait) and every resident
// trajectory through its own time-expanded minimum over (location, minute). It imports only data
// types: no production candidate generator, pruning, routing, ledger, planner or feasibility flag.
//
// Declared preconditions for exactness (asserted): no expected deliveries; corridor and location
// capacities at least the total population (so only shelter places couple groups); escort-required
// groups have instructions at minute 0; repaired/protected rates never exceed original rates.
import type { Scenario } from '../engine/types';

export interface OracleObjective { served: number; protectedPM: number; maxExposure: number; busy: number; batteries: number; finalArrival: number }
export interface OraclePolicyObjective { nOpen: number; nBlocked: number; min: number; sum: number; protMin: number | null; protSum: number | null; worstExposure: number; busyMax: number; busySum: number; batMax: number; batSum: number; latestArrival: number }

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

interface Eff { action: string; at: number }
interface Outcome { effects: Eff[]; busy: number; bat: number; escorts: { g: string; sh: string; T: number; e: number }[]; obs?: number }

class O {
  H: number; thr: number;
  constructor(public s: Scenario) { this.H = s.horizon; this.thr = s.threshold; }
  totalPop() { return this.s.groups.reduce((n, g) => n + g.count, 0); }
  assertPre() {
    const s = this.s;
    if (s.deliveries.length) throw new Error('oracle precondition: no deliveries');
    for (const c of s.connections) if (c.capacity < this.totalPop()) throw new Error('oracle precondition: corridor capacity');
    for (const l of s.locations) if (l.capacity < this.totalPop()) throw new Error('oracle precondition: location capacity');
    for (const g of s.groups) if (g.escortRequired && g.instructionsAvailableAt !== 0) throw new Error('oracle precondition: escort instructions');
    for (const a of s.actions) if (a.effect.type === 'setRate') { const l = s.locations.find((x) => x.id === (a.effect as any).location)!; if (a.effect.rate > l.hazard.rate) throw new Error('oracle precondition: repaired rate'); }
  }
  isShelter(id: string) { return this.s.shelters.some((x) => x.location === id); }
  // own hazard formula
  hz(loc: string, t: number, eff: Eff[]): number {
    if (this.isShelter(loc)) return 0;
    const l = this.s.locations.find((x) => x.id === loc)!;
    const ch = eff.map((e) => ({ e, a: this.s.actions.find((x) => x.id === e.action)! })).filter((x) => x.a.effect.type === 'setRate' && (x.a.effect as any).location === loc).sort((x, y) => x.e.at - y.e.at);
    let h = l.hazard.initial, rate = l.hazard.rate, last = 0;
    for (const c of ch) { if (c.e.at >= t) break; h += rate * (c.e.at - last); last = c.e.at; rate = (c.a.effect as any).rate; }
    return r6(h + rate * (t - last));
  }
  chz(cid: string, t: number) { const c = this.s.connections.find((x) => x.id === cid)!; return r6(c.hazard.initial + c.hazard.rate * t); }
  safe(loc: string, t: number, eff: Eff[]) { return this.hz(loc, t, eff) < this.thr; }
  open(cid: string, t: number, eff: Eff[], reveal: null | { state: string; at: number }) {
    const c = this.s.connections.find((x) => x.id === cid)!;
    if (c.state === 'open') return true;
    if (c.state === 'unknown') return !!reveal && reveal.state === 'open' && reveal.at <= t;
    return eff.some((e) => { const a = this.s.actions.find((x) => x.id === e.action)!; return a.effect.type === 'openConnection' && a.effect.connection === cid && e.at <= t; });
  }
  nbrs(loc: string) { return this.s.connections.filter((c) => c.a === loc || c.b === loc).map((c) => ({ c, to: c.a === loc ? c.b : c.a })); }
  suitable(gid: string, sh: string) {
    const g = this.s.groups.find((x) => x.id === gid)!; const S = this.s.shelters.find((x) => x.location === sh)!;
    if (S.checklist.ventilationOperating === 'absent') return false;
    if (g.needsAccessibleEntry && S.checklist.accessibleEntry === 'absent') return false;
    if (g.needsAssistanceOnArrival && S.checklist.assistanceOnArrival === 'absent') return false;
    return true;
  }
  protectedMin(loc: string, eff: Eff[]) { let n = 0; for (let m = 0; m < this.H; m++) { if (this.hz(loc, m, eff) >= this.thr) break; n++; } return n; }

  /** Enumerate all crew outcomes from a state by minute-level DFS (exact memo on the full state). */
  crewOutcomes(start: { t: number; loc: string; eff: Eff[]; busy: number; bat: number; pack: number; escorts: Outcome['escorts']; done: string[] }, reveal: null | { state: string; at: number }, allowInspect: boolean, onInspect?: (st: typeof start, obs: number) => void): Map<string, Outcome> {
    const out = new Map<string, Outcome>();
    const seen = new Set<string>();
    const s = this.s;
    const key = (x: typeof start) => `${x.t}|${x.loc}|${x.eff.map((e) => e.action + '@' + e.at).sort().join(',')}|${x.busy}|${x.bat}|${x.pack}|${x.escorts.map((e) => `${e.g}>${e.sh}@${e.T}:${e.e}`).join(',')}|${x.done.slice().sort().join(',')}`;
    const rec = (x: typeof start) => {
      const k = key(x);
      if (seen.has(k)) return;
      seen.add(k);
      const ok = `${x.eff.map((e) => e.action + '@' + e.at).sort().join(',')}|${x.busy}|${x.bat}|${x.escorts.map((e) => `${e.g}>${e.sh}@${e.T}:${e.e}`).sort().join(',')}`;
      if (!out.has(ok)) out.set(ok, { effects: x.eff, busy: x.busy, bat: x.bat, escorts: x.escorts });
      // wait one minute
      if (x.t + 1 <= this.H && (this.isShelter(x.loc) || this.safe(x.loc, x.t + 1, x.eff))) rec({ ...x, t: x.t + 1 });
      // traverse a connection
      for (const { c, to } of this.nbrs(x.loc)) {
        const t1 = x.t + c.minutes;
        if (t1 > this.H || !this.open(c.id, x.t, x.eff, reveal)) continue;
        let okc = true; for (let m = x.t; m <= t1; m++) if (this.chz(c.id, m) >= this.thr) okc = false;
        if (!okc || !(this.isShelter(to) || this.safe(to, t1, x.eff))) continue;
        rec({ ...x, t: t1, loc: to, busy: x.busy + c.minutes });
      }
      // offered actions at this location
      for (const a of s.actions) {
        if (!a.offered || a.workLocation !== x.loc || x.done.includes(a.id)) continue;
        if (a.requiresToolkit && !s.crew.toolkit) continue;
        if (x.pack < a.batteries) continue;
        const t1 = x.t + a.duration;
        if (t1 > this.H) continue;
        let okw = true; for (let m = x.t; m <= t1; m++) if (!(this.isShelter(x.loc) || this.safe(x.loc, m, x.eff))) okw = false;
        if (!okw) continue;
        if (a.kind === 'inspect') {
          if (!allowInspect || !onInspect) continue;
          onInspect({ ...x, t: t1, busy: x.busy + a.duration, done: [...x.done, a.id] }, t1);
          continue;
        }
        rec({ ...x, t: t1, eff: [...x.eff, { action: a.id, at: t1 }], busy: x.busy + a.duration, bat: x.bat + a.batteries, pack: x.pack - a.batteries, done: [...x.done, a.id] });
      }
      // escort a co-located group (first step must be a joint move; earlier waiting is crew idle time)
      for (const g of s.groups) {
        if (!g.escortRequired || g.location !== x.loc || x.done.includes('esc:' + g.id) || x.t < g.instructionsAvailableAt) continue;
        let homeOk = true, e0 = 0;
        for (let m = 0; m <= x.t; m++) { if (!this.safe(g.location, m, x.eff)) homeOk = false; if (m < x.t) e0 += this.hz(g.location, m, x.eff); }
        if (!homeOk) continue;
        const esc = (u: string, tau: number, e: number, first: boolean) => {
          if (!first && tau + 1 <= this.H && !this.isShelter(u) && this.safe(u, tau + 1, x.eff)) esc(u, tau + 1, r6(e + this.hz(u, tau, x.eff)), false);
          for (const { c, to } of this.nbrs(u)) {
            if (!c.accessible && g.stepFree) continue;
            const t1 = tau + c.minutes;
            if (t1 > this.H || !this.open(c.id, tau, x.eff, reveal)) continue;
            let okc = true; for (let m = tau; m <= t1; m++) if (this.chz(c.id, m) >= this.thr) okc = false;
            if (!okc) continue;
            let ce = 0; for (let m = tau; m < t1; m++) ce += this.chz(c.id, m);
            if (this.isShelter(to)) {
              if (!this.suitable(g.id, to)) continue;
              rec({ ...x, t: t1, loc: to, busy: x.busy + (t1 - x.t), escorts: [...x.escorts, { g: g.id, sh: to, T: t1, e: r6(e + ce) }], done: [...x.done, 'esc:' + g.id] });
            } else if (this.safe(to, t1, x.eff)) esc(to, t1, r6(e + ce), false);
          }
        };
        esc(g.location, x.t, r6(e0), true);
      }
    };
    rec(start);
    return out;
  }

  /** Min exposure per (shelter, T) for a group travelling alone; departure window [minDep, maxDepExcl). Worlds: 1 or 2. */
  groupOptions(gid: string, worlds: { eff: Eff[]; reveal: null | { state: string; at: number } }[], minDep: number, maxDepExcl: number): { sh: string; T: number; e: number }[] {
    const g = this.s.groups.find((x) => x.id === gid)!;
    if (g.escortRequired) return [];
    // labels: (node, t, departed) -> Pareto set of exposure vectors
    type L = { e: number[]; dep: boolean };
    const sets = new Map<string, L[]>();
    const k = (n: string, t: number, d: boolean) => `${n}|${t}|${d ? 1 : 0}`;
    const ins = (key: string, l: L) => {
      const arr = sets.get(key) ?? [];
      if (arr.some((x) => x.e.every((v, i) => v <= l.e[i] + 1e-9))) return;
      const keep = arr.filter((x) => !l.e.every((v, i) => v <= x.e[i] + 1e-9));
      keep.push(l); sets.set(key, keep);
    };
    if (!worlds.every((w) => this.safe(g.location, 0, w.eff))) return [];
    ins(k(g.location, 0, false), { e: worlds.map(() => 0), dep: false });
    const res: { sh: string; T: number; e: number[] }[] = [];
    for (let t = 0; t <= this.H; t++) {
      for (const [key, ls] of [...sets.entries()]) {
        const [n, ts, ds] = key.split('|');
        if (Number(ts) !== t) continue;
        for (const l of ls) {
          if (t + 1 <= this.H && worlds.every((w) => this.safe(n, t + 1, w.eff))) ins(k(n, t + 1, ds === '1'), { e: l.e.map((v, i) => r6(v + this.hz(n, t, worlds[i].eff))), dep: l.dep });
          const first = ds === '0';
          if (t < minDep || (first && t >= maxDepExcl)) continue;
          for (const { c, to } of this.nbrs(n)) {
            if (!c.accessible && g.stepFree) continue;
            const t1 = t + c.minutes;
            if (t1 > this.H || !worlds.every((w) => this.open(c.id, t, w.eff, w.reveal))) continue;
            let okc = true; for (let m = t; m <= t1; m++) if (this.chz(c.id, m) >= this.thr) okc = false;
            if (!okc) continue;
            let ce = 0; for (let m = t; m < t1; m++) ce += this.chz(c.id, m);
            const ne = l.e.map((v) => r6(v + ce));
            if (this.isShelter(to)) { if (this.suitable(gid, to)) res.push({ sh: to, T: t1, e: ne }); continue; }
            if (!worlds.every((w) => this.safe(to, t1, w.eff))) continue;
            ins(k(to, t1, true), { e: ne, dep: true });
          }
        }
      }
    }
    // per (shelter, T): min of worst-world exposure; then Pareto (T, e) per shelter
    const best = new Map<string, { sh: string; T: number; e: number }>();
    for (const r of res) { const kk = `${r.sh}@${r.T}`; const v = Math.max(...r.e); if (!best.has(kk) || best.get(kk)!.e > v) best.set(kk, { sh: r.sh, T: r.T, e: v }); }
    const opts = [...best.values()].sort((a, b) => a.T - b.T || a.e - b.e);
    const out: typeof opts = [];
    for (const o of opts) if (!out.some((x) => x.sh === o.sh && x.T <= o.T && x.e <= o.e)) out.push(o);
    return out;
  }
}

function cmpConf(a: OracleObjective, b: OracleObjective) {
  return b.served - a.served || b.protectedPM - a.protectedPM || (Math.abs(a.maxExposure - b.maxExposure) > 1e-9 ? a.maxExposure - b.maxExposure : 0) || a.busy - b.busy || a.batteries - b.batteries || a.finalArrival - b.finalArrival;
}

export function oracleConfirmed(s: Scenario): { objective: OracleObjective; outcomes: number } {
  const o = new O(s);
  o.assertPre();
  const outs = o.crewOutcomes({ t: 0, loc: s.crew.start, eff: [], busy: 0, bat: 0, pack: s.crew.batteries, escorts: [], done: [] }, null, false);
  let best: OracleObjective | null = null;
  for (const oc of outs.values()) {
    const r = evalState(o, oc, [{ eff: oc.effects, reveal: null }], 0);
    for (const x of r) if (!best || cmpConf(x, best) < 0) best = x;
  }
  return { objective: best!, outcomes: outs.size };
}

/** All resident combinations for one crew outcome (one world). */
function evalState(o: O, oc: Outcome, worlds: { eff: Eff[]; reveal: null | { state: string; at: number } }[], minDep: number): OracleObjective[] {
  const s = o.s;
  const escorted = new Map(oc.escorts.map((e) => [e.g, e]));
  const free = s.groups.filter((g) => !g.escortRequired && !escorted.has(g.id));
  const opts = free.map((g) => [null, ...o.groupOptions(g.id, worlds, Math.max(minDep, g.instructionsAvailableAt), Infinity)]);
  const res: OracleObjective[] = [];
  const pick: ({ sh: string; T: number; e: number } | null)[] = [];
  const rec = (i: number) => {
    if (i === free.length) {
      const load = new Map<string, number>();
      let served = 0, maxE = 0, fin = 0, prot = 0;
      for (const e of oc.escorts) { const g = s.groups.find((x) => x.id === e.g)!; load.set(e.sh, (load.get(e.sh) ?? 0) + g.count); served += g.count; maxE = Math.max(maxE, e.e); fin = Math.max(fin, e.T); }
      free.forEach((g, j) => { const p = pick[j]; if (p) { load.set(p.sh, (load.get(p.sh) ?? 0) + g.count); served += g.count; maxE = Math.max(maxE, p.e); fin = Math.max(fin, p.T); } });
      for (const [sh, n] of load) if (n > s.shelters.find((x) => x.location === sh)!.places) return;
      for (const g of s.groups) { const sv = escorted.has(g.id) || free.some((f, j) => f.id === g.id && pick[j]); if (!sv) prot += g.count * o.protectedMin(g.location, oc.effects); }
      res.push({ served, protectedPM: prot, maxExposure: r6(maxE), busy: oc.busy, batteries: oc.bat, finalArrival: fin });
      return;
    }
    for (const p of opts[i]) { pick[i] = p; rec(i + 1); }
  };
  rec(0);
  return res;
}

function cmpPol(a: OraclePolicyObjective, b: OraclePolicyObjective) {
  const p = a.protMin !== null && b.protMin !== null ? (b.protMin - a.protMin || (b.protSum ?? 0) - (a.protSum ?? 0)) : 0;
  return b.min - a.min || b.sum - a.sum || p || (Math.abs(a.worstExposure - b.worstExposure) > 1e-9 ? a.worstExposure - b.worstExposure : 0) || a.busyMax - b.busyMax || a.busySum - b.busySum || a.batMax - b.batMax || a.batSum - b.batSum || a.latestArrival - b.latestArrival;
}

/** Exhaustive two-state policy search: no-inspection policies plus every prefix/inspection/branch pair. */
export function oraclePolicy(s: Scenario): { objective: OraclePolicyObjective; noInspection: OraclePolicyObjective; inspectionPolicies: number } {
  const o = new O(s);
  o.assertPre();
  const unk = s.knowledge.unknown!;
  const withProt = s.actions.some((a) => a.offered && a.kind === 'ventilate');
  const startSt = { t: 0, loc: s.crew.start, eff: [] as Eff[], busy: 0, bat: 0, pack: s.crew.batteries, escorts: [] as Outcome['escorts'], done: [] as string[] };
  // no inspection: the unknown connection is never usable
  let noInsp: OraclePolicyObjective | null = null;
  for (const oc of o.crewOutcomes(startSt, null, false).values()) {
    for (const x of evalState(o, oc, [{ eff: oc.effects, reveal: null }], 0)) {
      const p: OraclePolicyObjective = { nOpen: x.served, nBlocked: x.served, min: x.served, sum: 2 * x.served, protMin: withProt ? x.protectedPM : null, protSum: withProt ? 2 * x.protectedPM : null, worstExposure: x.maxExposure, busyMax: x.busy, busySum: 2 * x.busy, batMax: x.batteries, batSum: 2 * x.batteries, latestArrival: x.finalArrival };
      if (!noInsp || cmpPol(p, noInsp) < 0) noInsp = p;
    }
  }
  let best = noInsp!;
  let count = 0;
  // inspection prefixes
  const prefixes: { st: typeof startSt; obs: number }[] = [];
  const pkeys = new Set<string>();
  o.crewOutcomes(startSt, null, true, (st, obs) => { const k = JSON.stringify(st); if (!pkeys.has(k)) { pkeys.add(k); prefixes.push({ st, obs }); } });
  for (const { st, obs } of prefixes) {
    const conts: Record<string, Outcome[]> = {};
    for (const state of unk.possible) conts[state] = [...o.crewOutcomes(st, { state, at: obs }, false).values()];
    // common (pre-observation) options for each free group: valid in both worlds
    for (const co of conts.open) for (const cb of conts.blocked) {
      count++;
      const W = { open: { eff: co.effects, reveal: { state: 'open', at: obs } }, blocked: { eff: cb.effects, reveal: { state: 'blocked', at: obs } } };
      const escO = new Map(co.escorts.map((e) => [e.g, e])), escB = new Map(cb.escorts.map((e) => [e.g, e]));
      const free = s.groups.filter((g) => !g.escortRequired);
      type Opt = { kind: 'none' } | { kind: 'common'; sh: string; T: number; e: number } | { kind: 'branch'; o: { sh: string; T: number; e: number } | null; b: { sh: string; T: number; e: number } | null };
      const opts: Opt[][] = free.map((g) => {
        const list: Opt[] = [{ kind: 'none' }];
        for (const c of o.groupOptions(g.id, [W.open, W.blocked], g.instructionsAvailableAt, obs)) list.push({ kind: 'common', ...c });
        const lo = [null, ...o.groupOptions(g.id, [W.open], Math.max(obs, g.instructionsAvailableAt), Infinity)];
        const lb = [null, ...o.groupOptions(g.id, [W.blocked], Math.max(obs, g.instructionsAvailableAt), Infinity)];
        for (const a of lo) for (const b of lb) if (a || b) list.push({ kind: 'branch', o: a, b });
        return list;
      });
      const pick: Opt[] = [];
      const rec = (i: number) => {
        if (i === free.length) {
          const evalW = (which: 'o' | 'b') => {
            const esc = which === 'o' ? escO : escB;
            const oc = which === 'o' ? co : cb;
            const load = new Map<string, number>();
            let served = 0, maxE = 0, fin = 0, prot = 0;
            for (const e of esc.values()) { const g = s.groups.find((x) => x.id === e.g)!; load.set(e.sh, (load.get(e.sh) ?? 0) + g.count); served += g.count; maxE = Math.max(maxE, e.e); fin = Math.max(fin, e.T); }
            const servedIds = new Set(esc.keys());
            free.forEach((g, j) => {
              const p = pick[j];
              const x = p.kind === 'common' ? p : p.kind === 'branch' ? (which === 'o' ? p.o : p.b) : null;
              if (x) { load.set(x.sh, (load.get(x.sh) ?? 0) + g.count); served += g.count; maxE = Math.max(maxE, x.e); fin = Math.max(fin, x.T); servedIds.add(g.id); }
            });
            for (const [sh, n] of load) if (n > s.shelters.find((x) => x.location === sh)!.places) return null;
            for (const g of s.groups) if (!servedIds.has(g.id)) prot += g.count * o.protectedMin(g.location, oc.effects);
            return { served, maxE, fin, prot, busy: oc.busy, bat: oc.bat };
          };
          const a = evalW('o'), b = evalW('b');
          if (!a || !b) return;
          const p: OraclePolicyObjective = {
            nOpen: a.served, nBlocked: b.served, min: Math.min(a.served, b.served), sum: a.served + b.served,
            protMin: withProt ? Math.min(a.prot, b.prot) : null, protSum: withProt ? a.prot + b.prot : null,
            worstExposure: r6(Math.max(a.maxE, b.maxE)), busyMax: Math.max(a.busy, b.busy), busySum: a.busy + b.busy,
            batMax: Math.max(a.bat, b.bat), batSum: a.bat + b.bat, latestArrival: Math.max(a.fin, b.fin),
          };
          if (cmpPol(p, best) < 0) best = p;
          return;
        }
        for (const x of opts[i]) { pick[i] = x; rec(i + 1); }
      };
      rec(0);
    }
  }
  return { objective: best, noInspection: noInsp!, inspectionPolicies: count };
}
