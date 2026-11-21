// Plain-language presentation. Every sentence here is assembled from engine outputs (schedules,
// policy objectives, dependencies, diagnoses, confirmations). No outcome is hard-coded and no
// planning logic is repeated: this module only names things and chooses words.
import type { AnyPlan, GroupDef, PassageState, PlanResult, PolicyResult, Scenario, Schedule, ShelterChecklist } from '../engine/types';
import { dependencies, diagnoseGroup } from '../engine/explain';
import type { confirmationsFor } from '../engine/approval';

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Deep Homes A" → "Deep Homes" when the trailing letter is the group's id. */
export function groupName(g: GroupDef): string {
  return g.name.endsWith(` ${g.id}`) ? g.name.slice(0, -(g.id.length + 1)) : g.name;
}

export function placeName(s: Scenario, id: string): string {
  const l = s.locations.find((x) => x.id === id);
  if (!l) return id;
  const home = s.groups.find((g) => g.location === id);
  return home && l.name.endsWith(` ${home.id}`) ? l.name.slice(0, -(home.id.length + 1)) : l.name;
}

/** A passage's everyday name, from the action that opens or inspects it, else its two ends. */
export function passageName(s: Scenario, connId: string): string {
  const opener = s.actions.find((a) => a.effect.type === 'openConnection' && a.effect.connection === connId);
  if (opener) return opener.label.replace(/^Open\s+/i, '');
  const insp = s.actions.find((a) => a.effect.type === 'reveal' && a.effect.connection === connId);
  if (insp) return insp.label.replace(/^Inspect\s+(the\s+)?/i, '');
  const c = s.connections.find((x) => x.id === connId);
  if (!c) return connId;
  return `${c.kind === 'stairs' ? 'stairs' : 'passage'} between ${placeName(s, c.a)} and ${placeName(s, c.b)}`;
}

/** Replace technical ids in engine text with place and passage names. */
export function plain(s: Scenario, text: string): string {
  let t = text;
  for (const c of s.connections.slice().sort((a, b) => b.id.length - a.id.length)) t = t.replace(new RegExp(`\\b${c.id}\\b`, 'g'), passageName(s, c.id));
  for (const l of s.locations) t = t.replace(new RegExp(` \\(${l.id}\\)`, 'g'), '');
  for (const l of s.locations.filter((x) => x.id.length > 1)) t = t.replace(new RegExp(`\\b${l.id}\\b`, 'g'), placeName(s, l.id));
  for (const g of s.groups) {
    t = t.split(g.name).join(groupName(g));
    // bare group letters ("B (8) is assigned", "A needs 4"), but never a letter that ends a name ("Gate B")
    t = t.replace(new RegExp(`(?<![A-Za-z0-9] )\\b${g.id}\\b(?= \\(\\d+\\))`, 'g'), groupName(g));
    t = t.replace(new RegExp(`(?<![A-Za-z0-9] )\\b${g.id} needs\\b`, 'g'), `${groupName(g)} needs`);
  }
  return t.replace(/\(occupancy requires below (\d+)\)/g, '(the hazard limit is $1)').replace(/reaches (\d+(?:\.\d+)?) at minute/g, 'reaches hazard $1 at minute');
}

export const total = (s: Scenario) => s.groups.reduce((n, g) => n + g.count, 0);
export const countOf = (s: Scenario, ids: string[]) => ids.reduce((n, id) => n + (s.groups.find((g) => g.id === id)?.count ?? 0), 0);

// ------------------------------------------------------------------ the plan, as a checklist

function stepTexts(s: Scenario, sc: Schedule, from = 0, to = sc.crew.length): string[] {
  const deps = dependencies(s, sc);
  const escorted = new Set(sc.journeys.filter((j) => j.escorted).map((j) => j.groupId));
  const out: string[] = [];
  for (const a of sc.crew.slice(from, to)) {
    if (a.kind === 'travel' || a.kind === 'wait') continue;
    if (a.kind === 'escort') {
      const g = s.groups.find((x) => x.id === a.groupId)!;
      out.push(`Escort the ${groupName(g)} residents to ${placeName(s, a.to)}${g.stepFree ? ' on a step-free route' : ''}.`);
      continue;
    }
    const act = s.actions.find((x) => x.id === a.actionId)!;
    if (a.kind === 'inspect') { out.push(`Check whether the ${passageName(s, (act.effect as { connection: string }).connection)} is open.`); continue; }
    if (act.kind === 'ventilate') {
      const loc = (act.effect as { location: string }).location;
      const n = countOf(s, s.groups.filter((g) => g.location === loc && sc.unresolved.includes(g.id)).map((g) => g.id));
      out.push(`${act.label}${n ? ` to protect the ${n} residents who must wait there` : ''}.`);
      continue;
    }
    const helped = [...new Set(deps.filter((d) => d.actionId === act.id && !(act.kind === 'open' && escorted.has(d.groupId))).map((d) => d.groupId))].map((id) => groupName(s.groups.find((g) => g.id === id)!));
    out.push(`${act.label}${helped.length ? ` so ${helped.join(' and ')} can ${act.kind === 'open' ? 'get through' : 'pass'}` : ''}.`);
  }
  return out;
}

export interface Note { kind: 'uncertain' | 'depends' | 'blocker' | 'protection'; text: string }

export interface PlanView {
  headline: string;
  steps: string[];
  branches: null | { state: PassageState; label: string; reach: number; steps: string[] }[];
  forecast: string;
  protection: { group: string; text: string; detail: string }[];
  notes: Note[];
  conditionalGroups: string[]; // routes that depend on the inspection
}

export function mainSchedule(p: AnyPlan): Schedule {
  return p.kind === 'schedule' ? p.schedule : p.branches.open;
}

export function protectionGains(s: Scenario, sc: Schedule, base: Schedule | null) {
  if (!base) return [];
  const vent = s.actions.filter((a) => a.kind === 'ventilate' && sc.tasks.includes(a.id));
  return sc.unresolved.flatMap((gid) => {
    const g = s.groups.find((x) => x.id === gid)!;
    if (!vent.some((a) => (a.effect as { location: string }).location === g.location)) return [];
    const now = sc.protectedMinutes[gid] ?? 0, before = base.protectedMinutes[gid] ?? 0;
    if (now <= before) return [];
    return [{ g, gain: now - before, now, before }];
  });
}

export function planView(s: Scenario, p: AnyPlan, baseline: PlanResult | null): PlanView {
  const T = total(s);
  const base = baseline?.schedule.objective.served ?? 0;
  const notes: Note[] = [];
  const sc = mainSchedule(p);
  const prot = protectionGains(s, p.kind === 'policy' && p.inspection ? p.branches.blocked : sc, baseline?.schedule ?? null);
  const protection = prot.map(({ g, gain, now, before }) => ({
    group: g.id,
    text: `${g.count} residents gain ${gain} minutes each below the hazard limit. They still need a route.`,
    detail: `${groupName(g)}: below the limit until minute ${now >= s.horizon ? `${s.horizon} (end of the window)` : now} instead of reaching it at minute ${before}; ${gain * g.count} person-minutes in total. Not counted as arrivals.`,
  }));
  const protTail = prot.length ? ` and protect the ${countOf(s, prot.map((x) => x.g.id))} who must wait` : '';

  if (p.kind === 'policy' && p.inspection) {
    const pol = p as PolicyResult;
    const passage = passageName(s, pol.connection);
    const n = pol.inspection!.prefixCrewCount;
    const cond = s.groups.filter((g) => pol.branches.open.journeys.some((j) => j.groupId === g.id) !== pol.branches.blocked.journeys.some((j) => j.groupId === g.id));
    const condNames = cond.map((g) => `the ${groupName(g)} residents`).join(' and ');
    const extra = pol.objective.nOpen - pol.objective.nBlocked;
    notes.push({ kind: 'uncertain', text: `The ${passage} may be open or blocked. The check at minute ${pol.inspection!.end} decides whether ${condNames || 'anyone more'} can be escorted (${plural(Math.abs(extra), 'person', 'people')}). If it is blocked, they keep waiting.` });
    pushDepends(s, pol.branches.open, notes);
    return {
      headline: `Help ${pol.objective.min} residents reach shelter — ${pol.objective.nOpen} if the ${passage} is open`,
      steps: stepTexts(s, pol.branches.open, 0, n),
      branches: (['open', 'blocked'] as PassageState[]).map((st) => {
        const steps = stepTexts(s, pol.branches[st], n);
        const waiting = pol.branches[st].unresolved.map((gid) => groupName(s.groups.find((g) => g.id === gid)!));
        return { state: st, label: `If the ${passage} is ${st}`, reach: st === 'open' ? pol.objective.nOpen : pol.objective.nBlocked, steps: steps.length ? steps : [`Hold position${st === 'blocked' ? ` and do not cross the ${passage}` : ''}.${waiting.length ? ` The ${waiting.join(' and ')} residents keep waiting.` : ''}`] };
      }),
      forecast: `Forecast: ${pol.objective.min} can reach shelter whatever the check finds, ${pol.objective.nOpen} if the ${passage} is open; ${base} without crew intervention.`,
      protection, notes, conditionalGroups: cond.map((g) => g.id),
    };
  }
  if (p.kind === 'policy' && !p.inspection) {
    const insp = s.actions.find((a) => a.offered && a.kind === 'inspect');
    if (insp) notes.push({ kind: 'uncertain', text: `The ${passageName(s, p.connection)} is unchecked. Checking it (${plural(insp.duration, 'minute')}) would not let anyone else reach shelter in time, so the plan leaves it out and uses only confirmed routes.` });
  }
  const served = sc.objective.served;
  pushDepends(s, sc, notes);
  const headline = served === T ? `Help all ${T} residents reach shelter` : sc.tasks.length === 0 ? `Use the routes that already work: ${served} of ${T} can reach shelter` : `Help ${served} of ${T} residents reach shelter${protTail}`;
  return { headline, steps: stepTexts(s, sc), branches: null, forecast: `Forecast: ${served} can reach shelter; ${base} without crew intervention.`, protection, notes, conditionalGroups: [] };
}

function pushDepends(s: Scenario, sc: Schedule, notes: Note[]) {
  for (const d of dependencies(s, sc)) {
    if (d.kind !== 'hazard') continue;
    const g = s.groups.find((x) => x.id === d.groupId)!;
    const act = s.actions.find((a) => a.id === d.actionId)!;
    notes.push({ kind: 'depends', text: `Depends on \u201c${act.label}\u201d finishing first: ${groupName(g)} passes the ${placeName(s, d.node!).toLowerCase()} at minute ${d.t} at hazard ${Math.round(d.withWork!)} (${Math.round(d.withoutWork!)} without it; the limit is ${s.threshold}).` });
  }
}

/** Why each group still needs help (plain text, from the engine's constraint checks). */
export function whyWaiting(s: Scenario, sc: Schedule, gid: string, search?: PlanResult['search']) {
  const g = s.groups.find((x) => x.id === gid)!;
  return diagnoseGroup(s, sc, g, search).map((b) => ({ code: b.code, text: plain(s, b.text), technical: b.text, searchWide: b.scope === 'search' }));
}

// ------------------------------------------------------------------ confirmations as instructions

type Conf = ReturnType<typeof confirmationsFor>[number];

const CHECK_INSTRUCTION: Record<keyof ShelterChecklist, (sh: string) => string> = {
  accessibleEntry: (sh) => `Confirm ${sh} has a step-free entrance.`,
  assistanceOnArrival: (sh) => `Confirm assistance is available on arrival at ${sh}.`,
  ventilationOperating: (sh) => `Confirm ventilation is working at ${sh}.`,
};

export function confirmationInstruction(s: Scenario, c: Conf): { text: string; done: string; editText: string; apply: (x: Scenario) => void } {
  if (c.kind === 'places') {
    const sh = s.shelters.find((x) => x.location === c.ref.shelter)!;
    return { text: `Confirm ${sh.name} has ${sh.places} places.`, done: `${sh.name} has ${sh.places} places`, editText: `${sh.steward} confirmed ${sh.places} places`, apply: (x) => { x.shelters.find((y) => y.location === sh.location)!.placesConfirmed = true; } };
  }
  if (c.kind === 'checklist') {
    const sh = s.shelters.find((x) => x.location === c.ref.shelter)!;
    const k = c.ref.key as keyof ShelterChecklist;
    return { text: CHECK_INSTRUCTION[k](sh.name), done: CHECK_INSTRUCTION[k](sh.name).replace(/^Confirm /, '').replace(/\.$/, ''), editText: `${sh.steward} confirmed ${k}`, apply: (x) => { x.shelters.find((y) => y.location === sh.location)!.checklist[k] = 'present'; } };
  }
  if (c.kind === 'instructions') {
    const g = s.groups.find((x) => x.id === c.ref.group)!;
    return { text: `Confirm the ${groupName(g)} residents will have their departure instructions by minute ${g.instructionsAvailableAt}.`, done: `${groupName(g)} instructions by minute ${g.instructionsAvailableAt}`, editText: `${groupName(g)} representative acknowledged instructions`, apply: (x) => { x.instructionsConfirmed[g.id] = true; } };
  }
  const d = s.deliveries.find((x) => x.id === c.ref.delivery)!;
  return { text: `Confirm ${d.quantity} ${d.resource} will reach ${placeName(s, d.location)} by minute ${d.minute} (${d.source}).`, done: `${d.quantity} ${d.resource} to ${placeName(s, d.location)} by minute ${d.minute}`, editText: `${d.source} confirmed delivery ${d.id}`, apply: (x) => { x.deliveries.find((y) => y.id === d.id)!.confirmed = true; } };
}

// ------------------------------------------------------------------ resident status words

export type Plainstatus = 'arrived' | 'on-the-way' | 'has-route' | 'waiting-inspection' | 'needs-help' | 'protected' | 'held' | 'unsafe';

export const STATUS_WORDS: Record<Plainstatus, { label: string; icon: string }> = {
  arrived: { label: 'Arrived', icon: '✓' },
  'on-the-way': { label: 'On the way', icon: '→' },
  'has-route': { label: 'Has a route', icon: '○' },
  'waiting-inspection': { label: 'Waiting for inspection', icon: '?' },
  'needs-help': { label: 'Still needs help', icon: '!' },
  protected: { label: 'Still needs help · temporary protection', icon: '◐' },
  held: { label: 'Held at the shelter entrance', icon: '⏸' },
  unsafe: { label: 'Hazard limit reached', icon: '⚠' },
};
