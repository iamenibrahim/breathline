// Shared helpers: shelter suitability, objective ordering, hashing.
import type { GroupDef, LocId, Objective, PolicyObjective, Scenario, ShelterChecklist } from './types';

export const CHECK_LABEL: Record<keyof ShelterChecklist, string> = {
  accessibleEntry: 'accessible entry',
  assistanceOnArrival: 'assistance on arrival',
  ventilationOperating: 'ventilation operating',
};

export function requiredChecklist(g: GroupDef): (keyof ShelterChecklist)[] {
  const r: (keyof ShelterChecklist)[] = [];
  if (g.needsAccessibleEntry) r.push('accessibleEntry');
  if (g.needsAssistanceOnArrival) r.push('assistanceOnArrival');
  r.push('ventilationOperating');
  return r;
}

/** Planner excludes a shelter when a required item is confirmed absent; unconfirmed items block approval only. */
export function suitability(s: Scenario, g: GroupDef, shelter: LocId) {
  const sh = s.shelters.find((x) => x.location === shelter)!;
  const req = requiredChecklist(g);
  const absent = req.filter((k) => sh.checklist[k] === 'absent');
  const unconfirmed = req.filter((k) => sh.checklist[k] === 'unconfirmed');
  return { usable: absent.length === 0, absent, unconfirmed, shelter: sh };
}

export function suitableShelters(s: Scenario, g: GroupDef): LocId[] {
  return s.shelters.filter((sh) => suitability(s, g, sh.location).usable).map((sh) => sh.location).sort();
}

export function compareObjective(a: Objective, b: Objective): number {
  if (a.served !== b.served) return b.served - a.served;
  if (a.protectedPM !== b.protectedPM) return b.protectedPM - a.protectedPM;
  if (Math.abs(a.maxExposure - b.maxExposure) > 1e-9) return a.maxExposure - b.maxExposure;
  if (a.busy !== b.busy) return a.busy - b.busy;
  if (a.batteries !== b.batteries) return a.batteries - b.batteries;
  if (a.finalArrival !== b.finalArrival) return a.finalArrival - b.finalArrival;
  return a.tieKey < b.tieKey ? -1 : a.tieKey > b.tieKey ? 1 : 0;
}

/** Objective components without the tie key (for oracle comparison). */
export function objectiveComponents(o: Objective) {
  return { served: o.served, protectedPM: o.protectedPM, maxExposure: o.maxExposure, busy: o.busy, batteries: o.batteries, finalArrival: o.finalArrival };
}

export function comparePolicy(a: PolicyObjective, b: PolicyObjective): number {
  if (a.min !== b.min) return b.min - a.min;
  if (a.sum !== b.sum) return b.sum - a.sum;
  if (a.protMin !== null && b.protMin !== null) {
    if (a.protMin !== b.protMin) return b.protMin - a.protMin;
    if (a.protSum !== b.protSum) return (b.protSum ?? 0) - (a.protSum ?? 0);
  }
  if (Math.abs(a.worstExposure - b.worstExposure) > 1e-9) return a.worstExposure - b.worstExposure;
  if (a.busyMax !== b.busyMax) return a.busyMax - b.busyMax;
  if (a.busySum !== b.busySum) return a.busySum - b.busySum;
  if (a.batMax !== b.batMax) return a.batMax - b.batMax;
  if (a.batSum !== b.batSum) return a.batSum - b.batSum;
  if (a.latestArrival !== b.latestArrival) return a.latestArrival - b.latestArrival;
  return a.tieKey < b.tieKey ? -1 : a.tieKey > b.tieKey ? 1 : 0;
}

export function policyComponents(o: PolicyObjective) {
  const { tieKey, ...rest } = o;
  return rest;
}

/** Stable canonical JSON (sorted keys). */
export function canonical(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x === undefined ? null : x);
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  const keys = Object.keys(x as Record<string, unknown>).filter((k) => (x as Record<string, unknown>)[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical((x as Record<string, unknown>)[k])).join(',') + '}';
}

/** FNV-1a 64-bit-ish (two 32-bit lanes) hash, deterministic and dependency-free. */
export function hashString(str: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/** Hash of the planner input (scenario without display metadata). */
export function inputHash(s: Scenario): string {
  const { id, label, title, summary, reports, ...rest } = s;
  void id; void label; void title; void summary; void reports;
  const scrub = JSON.parse(JSON.stringify(rest));
  for (const g of scrub.groups) { delete g.name; delete g.context; }
  for (const l of scrub.locations) { delete l.name; delete l.role; delete l.x; delete l.y; }
  for (const a of scrub.actions) { delete a.label; delete a.description; }
  for (const sh of scrub.shelters) { delete sh.name; delete sh.steward; }
  for (const c of scrub.connections) delete c.note;
  delete scrub.crew.name;
  return hashString(canonical(scrub));
}

export function groupById(s: Scenario, id: string): GroupDef {
  const g = s.groups.find((x) => x.id === id);
  if (!g) throw new Error(`unknown group ${id}`);
  return g;
}

export function locName(s: Scenario, id: string): string {
  return s.locations.find((l) => l.id === id)?.name ?? id;
}
