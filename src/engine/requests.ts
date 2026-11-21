// Turn "unresolved" into a time-sensitive, validated resource request: what, how much, where, by
// when, for whom. Each candidate is a hypothetical tested in an isolated copy of the starting state
// through the ordinary planner and the independent validator. It never reserves anything and is
// never shown as an arrival.
import type { DeliveryDef, GroupDef, GroupId, PassageState, Scenario, Schedule } from './types';
import { planConfirmed } from './planner';
import { validateSchedule } from './validator';
import { diagnoseGroup } from './explain';
import { locName, suitableShelters } from './common';
import { basePlaces } from './ledger';

export interface ResourceRequest {
  groupId: GroupId;
  state?: PassageState;
  resource: 'batteries' | 'places' | 'instructions';
  quantity: number;
  location: string;
  latest: number | null; // latest feasible delivery minute (null if not monotone)
  windows: [number, number][];
  noWaitMinute: number | null; // when the schedule with the earliest delivery first uses it
  benefits: { gained: GroupId[]; residents: number; changed: GroupId[] };
  binding: string;
  validatedAtDeadline: boolean;
  nextMinuteFails: boolean;
  horizonDeadline: boolean;
  text: string;
  waitNote: string | null;
  scheduleAtDeadline: Schedule | null;
  testedRuns: number;
}

export interface RequestReport { requests: ResourceRequest[]; none: { groupId: GroupId; state?: PassageState; text: string }[]; elapsedMs: number; runs: number }

const REQ_ID = 'request-hypothetical';

function served(sc: Schedule) { return new Set(sc.journeys.map((j) => j.groupId)); }

function withDelivery(s: Scenario, d: Omit<DeliveryDef, 'id' | 'source' | 'confirmed'>): Scenario {
  const x: Scenario = JSON.parse(JSON.stringify(s));
  x.deliveries.push({ ...d, id: REQ_ID, source: 'hypothetical request (not confirmed)', confirmed: true });
  return x;
}

export function computeRequests(s: Scenario, base: Schedule, opts: { state?: PassageState } = {}): RequestReport {
  const t0 = Date.now();
  const H = s.horizon;
  const assumed = opts.state && s.knowledge.unknown ? { [s.knowledge.unknown.connection]: opts.state } : undefined;
  const sAssumed: Scenario = JSON.parse(JSON.stringify(s));
  if (assumed && s.knowledge.unknown) { const c = sAssumed.connections.find((x) => x.id === s.knowledge.unknown!.connection)!; c.state = opts.state!; sAssumed.knowledge = { unknown: null }; for (const a of sAssumed.actions) if (a.kind === 'inspect') a.offered = false; }
  const S0 = served(base);
  const out: ResourceRequest[] = [];
  const none: RequestReport['none'] = [];
  let runs = 0;
  const plan = (x: Scenario) => { runs++; return planConfirmed(x).schedule; };
  const ok = (sc: Schedule, g: GroupDef) => { const sv = served(sc); return sv.has(g.id) && [...S0].every((x) => sv.has(x)); };

  for (const gid of base.unresolved) {
    const g = s.groups.find((x) => x.id === gid)!;
    const diag = diagnoseGroup(sAssumed, base, g);
    const found: ResourceRequest[] = [];
    const runCandidate = (resource: ResourceRequest['resource'], quantity: number, location: string, build: (t: number) => Scenario) => {
      const feas: boolean[] = [];
      const scheds: (Schedule | null)[] = [];
      for (let t = 0; t <= H; t++) {
        const sc = plan(build(t));
        const v = ok(sc, g) && validateSchedule(build(t), sc).valid;
        feas.push(v); scheds.push(v ? sc : null);
      }
      if (!feas.some(Boolean)) return null;
      const windows: [number, number][] = [];
      for (let t = 0; t <= H; t++) if (feas[t]) { if (windows.length && windows[windows.length - 1][1] === t - 1) windows[windows.length - 1][1] = t; else windows.push([t, t]); }
      const monotone = windows.length === 1 && windows[0][0] === 0;
      const latest = monotone ? windows[0][1] : null;
      const atDeadline = latest !== null ? scheds[latest] : null;
      const first = scheds[windows[0][0]]!;
      let noWait: number | null = null;
      if (resource === 'batteries') {
        const starts = first.crew.filter((a) => a.batteries?.some((b) => b.deliveryId === REQ_ID)).map((a) => a.start);
        noWait = starts.length ? Math.min(...starts) : null;
      } else if (resource === 'places') {
        const adm = first.journeys.filter((j) => j.shelter === location).sort((a, b) => a.arrival - b.arrival);
        let cum = 0;
        for (const j of adm) { cum += s.groups.find((x) => x.id === j.groupId)!.count; if (cum > basePlaces(s, location)) { noWait = j.arrival; break; } }
      }
      const after = atDeadline ?? first;
      const sv = served(after);
      const gained = [...sv].filter((x) => !S0.has(x));
      const changed = after.journeys.filter((j) => S0.has(j.groupId)).filter((j) => { const b = base.journeys.find((x) => x.groupId === j.groupId)!; return b.shelter !== j.shelter || b.arrival !== j.arrival || b.departure !== j.departure; }).map((j) => j.groupId);
      let nextFails = false;
      let horizonDeadline = false;
      if (latest !== null && latest < H) nextFails = !feas[latest + 1];
      else if (latest === H) {
        horizonDeadline = true;
        // no later minute exists: a delivery that never arrives must leave the group unserved
        const never = JSON.parse(JSON.stringify(build(H))) as Scenario;
        never.deliveries = never.deliveries.filter((d) => d.id !== REQ_ID);
        if (resource === 'instructions') never.groups.find((x) => x.id === g.id)!.instructionsAvailableAt = s.groups.find((x) => x.id === g.id)!.instructionsAvailableAt;
        nextFails = !served(plan(never)).has(g.id);
      }
      let waitNote: string | null = null;
      if (atDeadline && resource !== 'instructions') {
        const waits = atDeadline.journeys.flatMap((j) => j.legs.filter((l) => !l.conn).map((l) => `${j.groupId} waits at ${locName(s, l.from)} (${l.from}) from ${l.start} to ${l.end}`));
        const later = atDeadline.journeys.filter((j) => { const b = first.journeys.find((x) => x.groupId === j.groupId); return b && j.departure > b.departure; }).map((j) => `${j.groupId} departs at ${j.departure} instead of ${first.journeys.find((x) => x.groupId === j.groupId)!.departure}`);
        const crewWaits = atDeadline.crew.filter((a) => a.kind === 'wait').map((a) => `crew waits at ${locName(s, a.from)} (${a.from}) ${a.start}–${a.end}`);
        const all = [...waits, ...later, ...crewWaits];
        if (all.length) waitNote = `With delivery at the deadline: ${all.join('; ')}.`;
      }
      return { latest, windows, noWait, atDeadline, gained, changed, nextFails, horizonDeadline, waitNote, residents: gained.reduce((n, x) => n + s.groups.find((y) => y.id === x)!.count, 0) };
    };

    const bindingFor = (code: string[]) => diag.find((d) => code.includes(d.code))?.text ?? diag[0]?.text ?? '';

    // batteries: work locations of battery-consuming actions that could open routes or slow hazards
    const batLocs = [...new Set(s.actions.filter((a) => a.offered && a.batteries > 0 && a.kind !== 'ventilate' && a.kind !== 'inspect').map((a) => a.workLocation))].sort();
    const batFound: ResourceRequest[] = [];
    for (const loc of batLocs) {
      for (let q = 1; q <= s.crew.packSize; q++) {
        const b = (t: number) => withDelivery(sAssumed, { resource: 'batteries', quantity: q, location: loc, minute: t });
        const sc0 = plan(b(0));
        if (!ok(sc0, g)) continue;
        const r = runCandidate('batteries', q, loc, b);
        if (r) batFound.push(mk('batteries', q, loc, r, bindingFor(['missing-resources', 'threshold-at-arrival'])));
        break;
      }
    }
    batFound.sort((a, b) => a.quantity - b.quantity || (b.latest ?? -1) - (a.latest ?? -1) || (a.location < b.location ? -1 : 1));
    if (batFound.length) found.push(batFound[0]);

    // places at suitable shelters
    for (const sh of suitableShelters(s, g)) {
      for (let q = 1; q <= g.count; q++) {
        const b = (t: number) => withDelivery(sAssumed, { resource: 'places', quantity: q, location: sh, minute: t });
        if (!ok(plan(b(0)), g)) continue;
        const r = runCandidate('places', q, sh, b);
        if (r) found.push(mk('places', q, sh, r, bindingFor(['shelter-shortage'])));
        break;
      }
    }

    // earlier instructions
    if (g.instructionsAvailableAt > 0) {
      const b = (v: number) => { const x: Scenario = JSON.parse(JSON.stringify(sAssumed)); x.groups.find((y) => y.id === g.id)!.instructionsAvailableAt = v; return x; };
      let best: number | null = null;
      for (let v = g.instructionsAvailableAt - 1; v >= 0; v--) { const sc = plan(b(v)); if (ok(sc, g) && validateSchedule(b(v), sc).valid) { best = v; break; } }
      if (best !== null) {
        const sc = plan(b(best));
        const nextFails = !served(plan(b(best + 1))).has(g.id);
        const gained = [...served(sc)].filter((x) => !S0.has(x));
        const j = sc.journeys.find((x) => x.groupId === g.id)!;
        found.push({
          groupId: g.id, state: opts.state, resource: 'instructions', quantity: 1, location: g.location, latest: best, windows: [[0, best]], noWaitMinute: null,
          benefits: { gained, residents: gained.reduce((n, x) => n + s.groups.find((y) => y.id === x)!.count, 0), changed: [] },
          binding: bindingFor(['instructions', 'horizon']), validatedAtDeadline: true, nextMinuteFails: nextFails, horizonDeadline: false,
          text: `Deliver departure instructions to ${locName(s, g.location)} (${g.location}) by minute ${best} so ${g.name} (${g.count} residents) can reach ${locName(s, j.shelter)} by minute ${j.arrival}.`,
          waitNote: null, scheduleAtDeadline: sc, testedRuns: 0,
        });
      }
    }

    if (found.length) out.push(...found);
    else {
      const prot = base.protectedMinutes[g.id];
      const protNote = s.actions.some((a) => a.offered && a.kind === 'ventilate' && base.tasks.includes(a.id) && (a.effect as { location: string }).location === g.location)
        ? ` Temporary ventilation keeps ${g.location} below threshold to minute ${prot === H ? H : prot}; ${g.name} still needs an accessible route.` : '';
      none.push({ groupId: g.id, state: opts.state, text: `No tested resource change (up to ${s.crew.packSize} batteries at a work location, up to ${g.count} shelter places, earlier instructions) gives ${g.name} a feasible journey. Binding constraint: ${diag.map((d) => d.text).join(' ')}${protNote}` });
    }

    function mk(resource: ResourceRequest['resource'], quantity: number, location: string, r: NonNullable<ReturnType<typeof runCandidate>>, binding: string): ResourceRequest {
      const who = `${g.name} (${g.count} resident${g.count === 1 ? '' : 's'}${g.mobility === 'wheelchair' ? ', including the wheelchair user' : ''})`;
      const by = r.latest !== null ? `by minute ${r.latest}` : `within ${r.windows.map(([a, b]) => `${a}–${b}`).join(' or ')}`;
      let text = '';
      if (resource === 'batteries') {
        text = `Deliver ${quantity} batter${quantity === 1 ? 'y' : 'ies'} to ${locName(s, location)} (${location}) ${by} to ${g.escortRequired ? 'evacuate' : 'serve'} ${who}${g.escortRequired ? ' with escort' : ''}.`;
        if (r.latest !== null && r.latest < H) text += ` Delivery at ${r.latest + 1} is too late.`;
      } else {
        const all = r.gained.length + S0.size === s.groups.length;
        text = `Confirm ${quantity} more place${quantity === 1 ? '' : 's'} at ${locName(s, location)}, available ${by}, so ${who} can be admitted${all ? ` and all ${s.groups.reduce((n, x) => n + x.count, 0)} residents arrive` : ''}.`;
        if (r.latest !== null && r.latest < H) text += ` Places available at ${r.latest + 1} are too late.`;
      }
      if (r.noWait !== null && r.latest !== null && r.noWait < r.latest) text += ` If it arrives by minute ${r.noWait}, nobody waits for it (time that avoids waiting); the deadline ${r.latest} relies on safe waiting.`;
      return {
        groupId: g.id, state: opts.state, resource, quantity, location, latest: r.latest, windows: r.windows, noWaitMinute: r.noWait,
        benefits: { gained: r.gained, residents: r.residents, changed: r.changed }, binding,
        validatedAtDeadline: !!r.atDeadline, nextMinuteFails: r.nextFails, horizonDeadline: r.horizonDeadline, text, waitNote: r.waitNote, scheduleAtDeadline: r.atDeadline, testedRuns: H + 1,
      };
    }
    // attach wait notes computed inside runCandidate
  }
  return { requests: out, none, elapsedMs: Date.now() - t0, runs };
}
