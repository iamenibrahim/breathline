// Explanations built from actual constraint checks (never from scenario names).
import type { EffectRecord, GroupDef, Journey, PolicyResult, Scenario, Schedule, SearchInfo } from './types';
import { crewPath, groupDP, staticRoute } from './routing';
import { baseWorld, firstCrossing, nodeHazard, withEffects, type World } from './world';
import { CHECK_LABEL, locName, requiredChecklist, suitability, suitableShelters } from './common';
import { placeProfile } from './ledger';

export type BlockerCode =
  | 'inaccessible-stairs' | 'missing-escort' | 'unsafe-waiting' | 'threshold-at-arrival' | 'instructions'
  | 'shelter-shortage' | 'unsuitable-shelter' | 'corridor-overlap' | 'crew-conflict' | 'missing-resources'
  | 'no-route' | 'unknown-passage' | 'horizon' | 'displaced';

export interface Blocker { code: BlockerCode; text: string; scope: 'local' | 'search' }

const fmt = (x: number) => (Math.round(x * 10) / 10).toString();

export function groupLabel(g: GroupDef) {
  return `${g.name} (${g.count} resident${g.count === 1 ? '' : 's'}${g.mobility === 'wheelchair' ? ', including a wheelchair user' : ''})`;
}

/** Why is this group unresolved in this plan? Every statement comes from a constraint check. */
export function diagnoseGroup(s: Scenario, sc: Schedule, g: GroupDef, search?: SearchInfo, assumedWorld?: World): Blocker[] {
  const out: Blocker[] = [];
  const w = assumedWorld ?? withEffects(baseWorld(s), sc.effects);
  const H = s.horizon;
  const searchWide = !!search && search.status === 'exhaustive' && !search.groupsEverServed.includes(g.id);
  const scope = (): 'local' | 'search' => (searchWide ? 'search' : 'local');
  const count = (gid: string) => s.groups.find((x) => x.id === gid)!.count;

  // 1. shelter suitability
  const usable = suitableShelters(s, g);
  if (!usable.length) {
    const parts = s.shelters.map((sh) => `${sh.name} has places but no confirmed ${suitability(s, g, sh.location).absent.map((k) => CHECK_LABEL[k]).join(' or ')}`);
    out.push({ code: 'unsuitable-shelter', text: `No suitable shelter: ${parts.join('; ')}.`, scope: 'search' });
    return out;
  }

  // 2. routes: this plan's world, then a relaxed world where every offered opening action is complete
  const openers = s.actions.filter((a) => a.offered && a.effect.type === 'openConnection');
  const relaxed = withEffects(w, openers.map((a) => ({ actionId: a.id, at: 0, effect: a.effect })));
  const route = (world: World, stepFree: boolean) => usable.map((sh) => staticRoute(world, g.location, sh, { stepFree, noShelterTransit: true, openOnly: true })).find(Boolean);
  if (!route(w, g.stepFree)) {
    const closed = s.connections.filter((c) => (c.a === g.location || c.b === g.location) && (w.openAt.get(c.id) ?? Infinity) === Infinity);
    const closedText = closed.map((c) => {
      const opener = openers.find((a) => (a.effect as { connection: string }).connection === c.id);
      return `${c.id} ${c.state === 'unknown' ? 'unknown until inspected' : opener ? `blocked (${opener.label} would open it; not in this plan)` : 'blocked; no available action opens it'}`;
    });
    if (g.stepFree && route(w, false)) out.push({ code: 'inaccessible-stairs', text: `The only open route uses stairs, which a wheelchair user cannot use.`, scope: scope() });
    if (closed.some((c) => c.state === 'unknown')) out.push({ code: 'unknown-passage', text: 'An unknown passage cannot be used until an inspection confirms it open.', scope: 'local' });
    if (!route(relaxed, g.stepFree)) {
      out.push({ code: 'no-route', text: `No step-free route to a suitable shelter: ${closedText.join('; ')}.`, scope: closed.some((c) => c.state === 'unknown') ? 'local' : 'search' });
      return out;
    }
    out.push({ code: 'no-route', text: `No open step-free route in this plan: ${closedText.join('; ')}.`, scope: 'local' });
  }

  // 3. escort
  const hasJourney = sc.journeys.some((j) => j.groupId === g.id);
  if (g.escortRequired && !hasJourney) {
    const last = sc.crew.length ? sc.crew[sc.crew.length - 1] : null;
    const cross = firstCrossing(w, g.location);
    const reach = crewPath(relaxed, last ? last.to : s.crew.start, last ? last.end : 0, g.location);
    if (cross !== null && (!reach || reach.arrival >= cross)) out.push({ code: 'unsafe-waiting', text: `${locName(s, g.location)} reaches the hazard threshold at minute ${cross}, before the crew could arrive after this plan's work${reach ? ` (minute ${reach.arrival})` : ''}.`, scope: scope() });
    out.push({ code: 'missing-escort', text: `Needs a continuous escort; ${sc.crew.length ? 'in this plan the crew is committed to other work' : 'this plan has no escort task'}.`, scope: scope() });
  }

  // locations this group could reach at all (relaxed world, its own access needs, no shelter transit)
  const reach = new Set<string>([g.location]);
  { const q = [g.location]; while (q.length) { const n = q.shift()!; if (n !== g.location && relaxed.shelters.has(n)) continue; for (const { conn, to } of relaxed.adj.get(n)!) { if (g.stepFree && !conn.accessible) continue; if ((relaxed.openAt.get(conn.id) ?? Infinity) === Infinity) continue; if (!reach.has(to)) { reach.add(to); q.push(to); } } } }

  // 4. shelter places, given the residents this plan serves
  for (const sh of usable.filter((x) => reach.has(x))) {
    const occ = sc.journeys.filter((j) => j.shelter === sh && j.groupId !== g.id);
    const taken = occ.reduce((n, j) => n + count(j.groupId), 0);
    const places = placeProfile(s, sh, H);
    if (taken + g.count > places) out.push({ code: 'shelter-shortage', text: `${locName(s, sh)} has ${places} places; ${occ.map((j) => `${j.groupId} (${count(j.groupId)})`).join(' and ')} ${occ.length === 1 ? 'is' : 'are'} assigned there; ${g.id} needs ${g.count}.`, scope: 'local' });
  }

  // 5. resources for work that would help this group
  const remaining = s.crew.batteries + s.deliveries.filter((d) => d.confirmed && d.resource === 'batteries').reduce((n, d) => n + d.quantity, 0) - sc.objective.batteries;
  const relevant = s.actions.filter((a) => a.offered && a.batteries > 0 && !sc.tasks.includes(a.id) && a.kind !== 'ventilate' && (
    a.effect.type === 'setRate' ? reach.has(a.effect.location) :
    a.effect.type === 'openConnection' ? (() => { const c = s.connections.find((x) => x.id === (a.effect as { connection: string }).connection)!; return reach.has(c.a) || reach.has(c.b); })() : false));
  for (const a of relevant) {
    if (a.batteries <= remaining) continue;
    const total = s.crew.batteries;
    out.push({ code: 'missing-resources', text: a.batteries > total ? `${a.label} needs ${a.batteries} batteries; ${total} are available.` : `${a.label} needs ${a.batteries} batteries; ${sc.objective.batteries} of ${total} are committed to other work in this plan.`, scope: 'local' });
  }

  // 6. time and hazard for groups that travel on their own
  if (!g.escortRequired && !hasJourney) {
    const cands = groupDP({ worlds: [w], group: g, minDeparture: g.instructionsAvailableAt, shelters: usable, stepFree: g.stepFree });
    if (!cands.length) {
      const noHaz = earliestIgnoringHazard(w, g, usable);
      if (noHaz === null) out.push({ code: 'horizon', text: 'No open route reaches a suitable shelter.', scope: scope() });
      else if (noHaz.arrival > H) {
        out.push({ code: g.instructionsAvailableAt > 0 ? 'instructions' : 'horizon', text: `Instructions are available at minute ${g.instructionsAvailableAt}; the shortest journey takes ${noHaz.arrival - noHaz.departure} minutes, so arrival would be minute ${noHaz.arrival}, after the ${H}-minute horizon.`, scope: scope() });
      } else {
        const hit = noHaz.path.find((p) => !w.shelters.has(p.node) && nodeHazard(w, p.node, p.t) >= w.thr);
        const home = firstCrossing(w, g.location);
        if (hit) out.push({ code: 'threshold-at-arrival', text: `${locName(s, hit.node)} (${hit.node}) reaches ${fmt(nodeHazard(w, hit.node, hit.t))} at minute ${hit.t}, when the group would arrive there (occupancy requires below ${w.thr}).`, scope: scope() });
        else if (home !== null) out.push({ code: 'unsafe-waiting', text: `${locName(s, g.location)} reaches the threshold at minute ${home}.`, scope: scope() });
        else out.push({ code: 'threshold-at-arrival', text: 'Every route crosses a location at or above the hazard threshold.', scope: scope() });
      }
    } else if (!out.some((b) => b.code === 'shelter-shortage')) {
      out.push({ code: 'displaced', text: 'A journey exists for this group alone, but serving it would displace residents this plan serves (the objective maximises residents served).', scope: 'local' });
    }
  }
  if (!out.length) out.push({ code: 'displaced', text: 'Not served in this plan; serving it would displace other residents or exceed crew time.', scope: 'local' });
  return out;
}

function earliestIgnoringHazard(w: World, g: GroupDef, shelters: string[]) {
  const maxT = w.H + 100;
  const start = g.instructionsAvailableAt;
  const prev = new Map<string, string | null>();
  const k = (n: string, t: number) => `${n}@${t}`;
  prev.set(k(g.location, start), null);
  const byT = new Map<number, string[]>([[start, [g.location]]]);
  for (let t = start; t <= maxT; t++) {
    const nodes = (byT.get(t) ?? []).slice().sort();
    for (const n of nodes) if (shelters.includes(n)) {
      const path: { node: string; t: number }[] = [];
      let cur: string | null = k(n, t);
      while (cur) { const [nn, tt] = cur.split('@'); path.push({ node: nn, t: Number(tt) }); cur = prev.get(cur) ?? null; }
      path.reverse();
      return { arrival: t, departure: start, path };
    }
    const push = (n: string, t1: number, from: string) => {
      const kk = k(n, t1);
      if (prev.has(kk)) return;
      prev.set(kk, from);
      const l = byT.get(t1) ?? []; l.push(n); byT.set(t1, l);
    };
    for (const n of nodes) {
      if (w.shelters.has(n)) continue;
      for (const { conn, to } of w.adj.get(n)!) {
        if (g.stepFree && !conn.accessible) continue;
        if ((w.openAt.get(conn.id) ?? Infinity) > t) continue;
        if (w.shelters.has(to) && !shelters.includes(to)) continue;
        push(to, t + conn.minutes, k(n, t));
      }
      push(n, t + 1, k(n, t));
    }
  }
  return null;
}

export interface Dependency { actionId: string; groupId: string; text: string; short: string; kind?: 'access' | 'hazard'; node?: string; t?: number; withWork?: number; withoutWork?: number }

/** Which served groups depend on which completed work, from hazard and access checks. */
export function dependencies(s: Scenario, sc: Schedule, state?: 'open' | 'blocked'): Dependency[] {
  const deps: Dependency[] = [];
  const full = withEffects(baseWorld(s), sc.effects);
  for (const e of sc.effects) {
    const without = withEffects(baseWorld(s), sc.effects.filter((x) => x !== e));
    const act = s.actions.find((a) => a.id === e.actionId)!;
    for (const j of sc.journeys) {
      const g = s.groups.find((x) => x.id === j.groupId)!;
      if (e.effect.type === 'openConnection' || e.effect.type === 'reveal') {
        const c = (e.effect as { connection: string }).connection;
        const leg = j.legs.find((l) => l.conn === c);
        if (leg) deps.push({ actionId: act.id, groupId: g.id, text: `${g.name} crosses ${c} at minute ${leg.start}, opened${e.effect.type === 'reveal' ? ' (confirmed by inspection)' : ''} at minute ${e.at}`, short: `${g.name} (${g.count}) can cross ${c} at minute ${leg.start}`, kind: 'access', node: c, t: leg.start });
        continue;
      }
      // hazard dependency: a visited location would be at/above threshold without this work
      const visits: { node: string; t: number }[] = [];
      for (let x = 0; x <= j.departure; x++) visits.push({ node: g.location, t: x });
      for (const l of j.legs) {
        if (l.conn === null) for (let x = l.start; x <= l.end; x++) visits.push({ node: l.from, t: x });
        else visits.push({ node: l.to, t: l.end });
      }
      const crit = visits.find((v) => !full.shelters.has(v.node) && nodeHazard(without, v.node, v.t) >= full.thr && nodeHazard(full, v.node, v.t) < full.thr);
      if (crit) deps.push({ actionId: act.id, groupId: g.id, text: `${g.name} passes ${locName(s, crit.node)} (${crit.node}) at minute ${crit.t}: hazard ${fmt(nodeHazard(full, crit.node, crit.t))} with ${lowerFirst(act.label)} completed at ${e.at}, ${fmt(nodeHazard(without, crit.node, crit.t))} without it`, short: `${g.name} (${g.count}) can pass the ${locName(s, crit.node).toLowerCase()} at minute ${crit.t} (hazard ${fmt(nodeHazard(full, crit.node, crit.t))} instead of ${fmt(nodeHazard(without, crit.node, crit.t))})`, kind: 'hazard', node: crit.node, t: crit.t, withWork: nodeHazard(full, crit.node, crit.t), withoutWork: nodeHazard(without, crit.node, crit.t) });
    }
  }
  void state;
  return deps;
}

export interface Explanation { headline: string; steps: { start: number; end: number; text: string }[]; deps: Dependency[]; sentence: string }

export function explainSchedule(s: Scenario, sc: Schedule, baseline?: Schedule): Explanation {
  const deps = dependencies(s, sc);
  const steps: Explanation['steps'] = [];
  const total = s.groups.reduce((n, g) => n + g.count, 0);
  const sentences: string[] = [];
  const w = withEffects(baseWorld(s), sc.effects);
  for (const a of sc.crew) {
    if (a.kind === 'travel') { steps.push({ start: a.start, end: a.end, text: `Travel ${a.legs.filter((l) => l.conn).map((l) => l.from).concat(a.to).join(' → ')}` }); continue; }
    if (a.kind === 'wait') { steps.push({ start: a.start, end: a.end, text: `Wait at ${locName(s, a.from)} (${a.reason ?? 'waiting'})` }); continue; }
    if (a.kind === 'escort') {
      const g = s.groups.find((x) => x.id === a.groupId)!;
      const route = [a.from, ...a.legs.filter((l) => l.conn).map((l) => l.to)].join(' → ');
      const waits = a.legs.filter((l) => !l.conn).map((l) => `wait at ${locName(s, l.from)} ${l.start}–${l.end}`);
      steps.push({ start: a.start, end: a.end, text: `Escort ${g.name} (${g.count}) ${route}${waits.length ? ` (${waits.join(', ')})` : ''}; admitted at ${locName(s, a.to)} at minute ${a.end}` });
      sentences.push(`escort the ${g.count} ${g.name} residents${g.mobility === 'wheelchair' ? ', including the wheelchair user,' : ''} to ${locName(s, a.to)} (arriving at minute ${a.end})`);
      continue;
    }
    const act = s.actions.find((x) => x.id === a.actionId)!;
    if (a.kind === 'inspect') { steps.push({ start: a.start, end: a.end, text: `${act.label} at ${locName(s, a.from)} — the result selects the branch` }); continue; }
    const my = deps.filter((d) => d.actionId === act.id);
    let clause = '';
    if (act.kind === 'ventilate') {
      const loc = (act.effect as { location: string }).location;
      const waiting = s.groups.filter((g) => g.location === loc && sc.unresolved.includes(g.id));
      const before = firstCrossing(withEffects(baseWorld(s), sc.effects.filter((e) => e.actionId !== act.id)), loc);
      const after = firstCrossing(w, loc);
      if (waiting.length) clause = ` so the ${waiting.reduce((n, g) => n + g.count, 0)} residents who cannot be evacuated stay below the threshold ${after === null ? `until the horizon (minute ${s.horizon})` : `until minute ${after}`} instead of ${before === null ? 'never reaching it' : `reaching it at minute ${before}`} — conditions improved, not evacuated`;
    } else if (my.length) {
      const escorted = new Set(sc.journeys.filter((j) => j.escorted).map((j) => j.groupId));
      const relevant = my.filter((d) => !(act.kind === 'open' && escorted.has(d.groupId)));
      clause = relevant.length ? ` so ${relevant.map((d) => d.short).join(' and ')}` : '';
    } else if (act.kind === 'open') clause = ' to open a step-free route for the escort';
    steps.push({ start: a.start, end: a.end, text: `${act.label} at ${locName(s, a.from)}${act.batteries ? ` (${act.batteries} batteries)` : ''}${clause}` });
    sentences.push(`${lowerFirst(act.label)} (${a.start}–${a.end})${clause}`);
  }
  const served = sc.objective.served;
  const base = baseline?.objective.served;
  const headline = `${served} of ${total} residents have a feasible shelter journey${base !== undefined ? ` (${served - base >= 0 ? '+' : ''}${served - base} versus no intervention)` : ''}.`;
  const sentence = sentences.length
    ? cap(sentences.join('; then ')) + '.'
    : 'No intervention improves on the routes that already exist; keep the crew available.';
  return { headline, steps, deps, sentence };
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const lowerFirst = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

export function explainPolicy(s: Scenario, p: PolicyResult): { headline: string; prefix: string; open: string; blocked: string; summary: string } {
  const total = s.groups.reduce((n, g) => n + g.count, 0);
  const o = p.objective;
  if (!p.inspection) {
    const ex = explainSchedule(s, p.branches.open);
    return {
      headline: `${o.nOpen} of ${total} residents feasible in both modeled states without inspection.`,
      prefix: ex.sentence, open: 'No inspection: the same response runs whatever the bypass state.', blocked: 'No inspection: the same response runs whatever the bypass state.',
      summary: `Leave inspection out of this response: it cannot add a feasible assignment within the horizon and would consume crew time. ${ex.sentence}`,
    };
  }
  const n = p.inspection.prefixCrewCount;
  const pre = { ...p.branches.open, crew: p.branches.open.crew.slice(0, n) };
  const preEx = explainSchedule(s, { ...pre, journeys: [], unresolved: [] } as Schedule);
  const sfx = (st: 'open' | 'blocked') => {
    const sc = p.branches[st];
    const rest = sc.crew.slice(n);
    if (!rest.length) {
      const un = sc.unresolved.map((gid) => s.groups.find((g) => g.id === gid)!.name);
      return `Crew holds position${un.length ? `; ${un.join(', ')} remain${un.length === 1 ? 's' : ''} unresolved` : ''}. Do not cross the ${st === 'blocked' ? 'blocked bypass' : 'bypass'}.`;
    }
    return explainSchedule(s, { ...sc, crew: rest } as Schedule).sentence;
  };
  const extra = o.nOpen - o.nBlocked;
  return {
    headline: `${o.min} feasible in both modeled states${extra > 0 ? `; up to ${extra} additional residents if the bypass is open` : ''}.`,
    prefix: preEx.sentence.replace(/\.$/, '') + `; then inspect the bypass at ${locName(s, p.inspection.location)} (${p.inspection.start}–${p.inspection.end}).`,
    open: sfx('open'), blocked: sfx('blocked'),
    summary: `Inspection costs ${p.inspection.end - p.inspection.start} crew minute${p.inspection.end - p.inspection.start === 1 ? '' : 's'} at ${locName(s, p.inspection.location)}; it creates a conditional opportunity for ${extra} more residents while keeping ${o.min} feasible in both states.`,
  };
}

export function stillWaitingText(s: Scenario, sc: Schedule, baseline: Schedule | null, gid: string): string | null {
  const g = s.groups.find((x) => x.id === gid)!;
  const now = sc.protectedMinutes[gid];
  const before = baseline ? (baseline.protectedMinutes[gid] ?? null) : null;
  if (now === undefined) return null;
  if (before !== null && now > before) return `Still waiting — conditions improved, not evacuated: below threshold ${now === s.horizon ? `until the horizon at minute ${s.horizon}` : `for ${now} minutes`} instead of reaching it at minute ${before} (+${now - before} minutes per person, ${(now - before) * g.count} person-minutes).`;
  return null;
}

export { requiredChecklist };
export type { EffectRecord, Journey };
