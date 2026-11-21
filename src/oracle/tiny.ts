// Tiny hand-built graphs and a seeded generator of tiny neighborhoods, all expressed in the
// ordinary input schema.
import type { ActionDef, ConnectionDef, GroupDef, LocationDef, Scenario, ShelterDef } from '../engine/types';

const L = (id: string, x: number, y: number, initial = 0, rate = 0): LocationDef => ({ id, name: id, level: 1, x, y, capacity: 99, hazard: { initial, rate }, role: '' });
const C = (a: string, b: string, minutes: number, extra: Partial<ConnectionDef> = {}): ConnectionDef => ({ id: `${a}-${b}`, a, b, minutes, accessible: true, kind: 'passage', state: 'open', capacity: 99, hazard: { initial: 0, rate: 0 }, ...extra });
const G = (id: string, count: number, location: string, extra: Partial<GroupDef> = {}): GroupDef => ({ id, name: `Group ${id}`, count, location, mobility: 'standard', stepFree: false, escortRequired: false, needsAccessibleEntry: false, needsAssistanceOnArrival: false, instructionsAvailableAt: 0, context: '', ...extra });
const S = (location: string, places: number, checklist: Partial<ShelterDef['checklist']> = {}): ShelterDef => ({ location, name: `Shelter ${location}`, places, placesConfirmed: true, steward: 'steward', checklist: { accessibleEntry: 'present', assistanceOnArrival: 'present', ventilationOperating: 'present', ...checklist } });

function base(id: string, horizon: number): Scenario {
  return { id, label: id, title: id, summary: '', horizon, threshold: 100, locations: [], connections: [], groups: [], shelters: [], crew: { id: 'crew', name: 'crew', start: 'Z', batteries: 0, packSize: 4, toolkit: true, qualifications: [] }, actions: [], deliveries: [], knowledge: { unknown: null }, instructionsConfirmed: {}, reports: [] };
}

/** Two groups of two, two shelters of two places; only the flexible group can use the second shelter. */
export function tinyAssignment(): Scenario {
  const s = base('tiny-assign', 6);
  s.locations = [L('Z', 0, 0), L('HF', 1, 0), L('HK', 2, 0), L('X', 1, 1), L('S1', 2, 1), L('S2', 1, 2)];
  s.connections = [C('Z', 'HF', 1), C('HF', 'S1', 1), C('HF', 'X', 1), C('X', 'S2', 1), C('HK', 'S1', 1)];
  s.groups = [G('F', 2, 'HF'), G('K', 2, 'HK', { needsAccessibleEntry: true })];
  s.shelters = [S('S1', 2), S('S2', 2, { accessibleEntry: 'absent' })];
  s.instructionsConfirmed = { F: true, K: true };
  return s;
}

/** Greedy: commit each group (largest first, then id) to its first (earliest, least-exposure) route. */
export function greedyServed(s: Scenario, candidates: Map<string, { shelter: string; arrival: number }[]>): number {
  const load = new Map<string, number>();
  let served = 0;
  for (const g of s.groups.slice().sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1))) {
    const c = (candidates.get(g.id) ?? []).slice().sort((a, b) => a.arrival - b.arrival)[0];
    if (!c) continue;
    const cap = s.shelters.find((x) => x.location === c.shelter)!.places;
    if ((load.get(c.shelter) ?? 0) + g.count <= cap) { load.set(c.shelter, (load.get(c.shelter) ?? 0) + g.count); served += g.count; }
  }
  return served;
}

/** Corridor test graph: two groups share one corridor with capacity for one group at a time. */
export function tinyCorridor(capacity: number, opposite = false): Scenario {
  const s = base('tiny-corridor', 8);
  s.locations = [L('Z', 0, 0), L('A1', 0, 1), L('A2', 0, 2), L('M', 1, 1), L('N', 2, 1), L('Q', 3, 1), L('Q2', 1, 3)];
  s.connections = [C('Z', 'A1', 1), C('A1', 'M', 1), C('A2', 'M', 1), C('M', 'N', 2, { capacity }), C('N', 'Q', 1)];
  s.groups = [G('P', 3, 'A1'), G('R', 3, 'A2')];
  s.shelters = [S('Q', 6)];
  if (opposite) {
    // R lives beyond the corridor and walks the other way to shelter Q2 behind M
    s.locations.push(L('B', 3, 2));
    s.connections = [C('Z', 'A1', 1), C('A1', 'M', 1), C('M', 'N', 2, { capacity }), C('N', 'Q', 1), C('N', 'B', 1), C('M', 'Q2', 1)];
    s.groups = [G('P', 3, 'A1'), G('R', 3, 'B')];
    s.shelters = [S('Q', 3), S('Q2', 3)];
    // P can only use Q (beyond the corridor); R can only use Q2 (behind it)
    s.shelters[1].checklist.accessibleEntry = 'absent';
    s.groups[0].needsAccessibleEntry = true;
    s.shelters[0].checklist.assistanceOnArrival = 'absent';
    s.groups[1].needsAssistanceOnArrival = true;
  }
  s.instructionsConfirmed = Object.fromEntries(s.groups.map((g) => [g.id, true]));
  return s;
}

/** Tiny two-state graph modelled on D: a battery conflict and one unknown bypass. */
export function tinyPolicy(inspectDuration = 1): Scenario {
  const s = base('tiny-policy', 8);
  s.locations = [L('Z', 0, 0), L('G', 1, 0), L('K', 0, 2), L('H', 1, 2, 0, 12), L('R', 3, 0), L('J', 3, 1, 40, 20), L('S', 2, 2)];
  s.connections = [C('Z', 'G', 1), C('G', 'S', 1), C('G', 'H', 1, { state: 'blocked' }), C('H', 'K', 1, { state: 'unknown' }), C('K', 'S', 1), C('Z', 'K', 1), C('R', 'J', 3), C('J', 'S', 1)];
  s.groups = [G('W', 2, 'H', { mobility: 'wheelchair', stepFree: true, escortRequired: true, needsAccessibleEntry: true, needsAssistanceOnArrival: true }), G('N', 3, 'R')];
  s.shelters = [S('S', 6)];
  s.crew.batteries = 2;
  s.actions = [
    { id: 'gate', kind: 'open', label: 'Open gate', workLocation: 'G', duration: 2, batteries: 2, requiresToolkit: true, effect: { type: 'openConnection', connection: 'G-H' }, offered: true, description: '' },
    { id: 'fan', kind: 'repair', label: 'Repair fan', workLocation: 'Z', duration: 2, batteries: 2, requiresToolkit: true, effect: { type: 'setRate', location: 'J', rate: 0 }, offered: true, description: '' },
    { id: 'inspect', kind: 'inspect', label: 'Inspect bypass', workLocation: 'K', duration: inspectDuration, batteries: 0, requiresToolkit: false, effect: { type: 'reveal', connection: 'H-K' }, offered: true, description: '' },
  ];
  s.knowledge = { unknown: { connection: 'H-K', possible: ['open', 'blocked'] } };
  s.instructionsConfirmed = { W: true, N: true };
  return s;
}

// ------------------------------------------------------------------ seeded generator

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const GENERATOR_BOUNDS = {
  locations: '4–7', groups: '1–2 (1–5 residents)', shelters: '1–2 (1–8 places)', interventions: 'at most 2 (open, repair, ventilate) plus one inspection in two-state cases',
  horizon: '6–8 minutes', durations: '1–3 minutes', hazards: 'initial 0–40, growth 0–25 per minute', batteries: '0–4', costs: '0–3',
  capacities: 'corridor and location capacities 99 (not varied; covered by dedicated corridor tests)', deliveries: 'none',
};

export function generateTiny(seed: number, twoState: boolean): Scenario {
  const rnd = mulberry32(seed);
  const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const s = base(`gen-${twoState ? 'p' : 'c'}-${seed}`, ri(6, 8));
  const nLoc = ri(4, 7);
  const nGroups = ri(1, 2);
  const nShel = nLoc >= 5 ? ri(1, 2) : 1;
  const ids: string[] = ['Z'];
  const homes = Array.from({ length: nGroups }, (_, i) => `H${i + 1}`);
  const shelters = Array.from({ length: nShel }, (_, i) => `Q${i + 1}`);
  ids.push(...homes, ...shelters);
  let j = 1;
  while (ids.length < nLoc) ids.push(`J${j++}`);
  while (ids.length > nLoc) ids.pop(); // keep within bounds (homes/shelters first)
  s.locations = ids.map((id, i) => L(id, i % 3, Math.floor(i / 3), id.startsWith('H') ? ri(0, 20) : id.startsWith('J') && rnd() < 0.5 ? ri(0, 40) : 0, id.startsWith('H') ? ri(0, 15) : id.startsWith('J') && rnd() < 0.6 ? ri(0, 25) : 0));
  for (const l of s.locations) if (l.id === 'Z' || l.id.startsWith('Q')) l.hazard = { initial: 0, rate: 0 };
  // random spanning tree + extra edges
  const conns: ConnectionDef[] = [];
  const have = new Set<string>();
  const addC = (a: string, b: string) => { const k = [a, b].sort().join('|'); if (a === b || have.has(k)) return; have.add(k); conns.push(C(a, b, ri(1, 3), { accessible: rnd() > 0.2, kind: 'passage' })); };
  for (let i = 1; i < ids.length; i++) addC(ids[i], ids[ri(0, i - 1)]);
  for (let e = 0; e < ri(1, 3); e++) addC(pick(ids), pick(ids));
  for (const c of conns) if (!c.accessible) c.kind = 'stairs';
  s.connections = conns;
  const realHomes = homes.filter((h) => ids.includes(h));
  s.groups = realHomes.map((h, i) => {
    const esc = i === 0 && rnd() < 0.5;
    return G(`G${i + 1}`, ri(1, 5), h, esc ? { mobility: 'wheelchair', stepFree: true, escortRequired: true, needsAccessibleEntry: true, needsAssistanceOnArrival: rnd() < 0.5 } : { instructionsAvailableAt: rnd() < 0.3 ? ri(1, 2) : 0 });
  });
  s.shelters = shelters.filter((q) => ids.includes(q)).map((q) => S(q, ri(1, 8), { accessibleEntry: rnd() < 0.2 ? 'absent' : 'present', assistanceOnArrival: rnd() < 0.3 ? 'absent' : 'present' }));
  s.crew.batteries = ri(0, 4);
  // interventions
  const acts: ActionDef[] = [];
  const nActs = ri(1, 2);
  const nonShelter = ids.filter((x) => !x.startsWith('Q'));
  for (let k = 0; k < nActs; k++) {
    const kind = pick(['open', 'repair', 'ventilate'] as const);
    if (kind === 'open') {
      const cands = conns.filter((c) => c.state === 'open' && !s.knowledge.unknown);
      if (!cands.length) continue;
      const c = pick(cands);
      c.state = 'blocked';
      acts.push({ id: `open-${c.id}`, kind: 'open', label: `Open ${c.id}`, workLocation: rnd() < 0.5 ? c.a : c.b, duration: ri(1, 3), batteries: ri(0, 3), requiresToolkit: true, effect: { type: 'openConnection', connection: c.id }, offered: true, description: '' });
    } else if (kind === 'repair') {
      const hz = s.locations.filter((l) => l.hazard.rate > 0 && !l.id.startsWith('H'));
      if (!hz.length) continue;
      const l = pick(hz);
      acts.push({ id: `repair-${l.id}`, kind: 'repair', label: `Repair at ${l.id}`, workLocation: pick(nonShelter), duration: ri(1, 3), batteries: ri(0, 3), requiresToolkit: true, effect: { type: 'setRate', location: l.id, rate: Math.floor(l.hazard.rate / 3) }, offered: true, description: '' });
    } else {
      const g = pick(s.groups);
      const l = s.locations.find((x) => x.id === g.location)!;
      if (l.hazard.rate === 0) continue;
      acts.push({ id: `vent-${l.id}`, kind: 'ventilate', label: `Ventilate ${l.id}`, workLocation: l.id, duration: ri(1, 2), batteries: ri(1, 2), requiresToolkit: true, effect: { type: 'setRate', location: l.id, rate: 0 }, offered: true, description: '' });
    }
  }
  const seenA = new Set<string>();
  s.actions = acts.filter((a) => (seenA.has(a.id) ? false : (seenA.add(a.id), true)));
  if (twoState) {
    // one unknown connection incident to a home when possible, inspected at its other end
    const home = s.groups[0].location;
    let c = conns.find((x) => (x.a === home || x.b === home) && x.state === 'open' && !s.actions.some((a) => a.effect.type === 'openConnection' && a.effect.connection === x.id));
    if (!c || rnd() < 0.3) {
      const other = pick(ids.filter((x) => x !== home && !x.startsWith('Q')));
      const nc = C(home, other, ri(1, 2));
      if (!conns.some((x) => [x.a, x.b].sort().join('|') === [home, other].sort().join('|'))) { conns.push(nc); c = nc; }
    }
    if (c) {
      c.state = 'unknown';
      c.accessible = true; c.kind = 'passage';
      const at = c.a === home ? c.b : c.a;
      s.knowledge = { unknown: { connection: c.id, possible: ['open', 'blocked'] } };
      s.actions.push({ id: 'inspect', kind: 'inspect', label: `Inspect ${c.id}`, workLocation: at, duration: ri(1, 3), batteries: 0, requiresToolkit: false, effect: { type: 'reveal', connection: c.id }, offered: true, description: '' });
    }
  }
  s.instructionsConfirmed = Object.fromEntries(s.groups.map((g) => [g.id, true]));
  return s;
}
