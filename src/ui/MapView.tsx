// Neighborhood map that supports the decision: the selected routes, the hazards on them, the
// residents they affect and the crew are emphasised; unrelated passages fade. Place names only;
// technical ids appear in tooltips. Colour is always paired with text or an icon.
import type { AnyPlan, Leg, Scenario, Schedule } from '../engine/types';
import type { SimState } from '../engine/simulate';
import { liveNodeHazard } from '../engine/simulate';
import { baseWorld, nodeHazard, withEffects } from '../engine/world';
import { groupName, passageName, placeName, type Plainstatus } from './plain';

interface Props {
  s: Scenario;
  plan: AnyPlan | null;
  schedule: Schedule | null; // schedule currently in force (active branch, or open branch before observation)
  approved: boolean;
  run: SimState | null;
  t: number;
  statusOf: (gid: string) => Plainstatus;
  compact?: boolean;
}

type RouteKind = 'resident' | 'crew' | 'conditional';

const STATUS_FILL: Record<Plainstatus, string> = {
  arrived: 'var(--teal)', 'on-the-way': 'var(--teal-2)', 'has-route': 'var(--teal-3)', 'waiting-inspection': 'var(--amber)',
  'needs-help': 'var(--amber-2)', protected: 'var(--violet)', held: 'var(--red)', unsafe: 'var(--red)',
};
const STATUS_ICON: Record<Plainstatus, string> = { arrived: '✓', 'on-the-way': '→', 'has-route': '', 'waiting-inspection': '?', 'needs-help': '!', protected: '◐', held: '⏸', unsafe: '⚠' };

export function MapView({ s, plan, schedule, approved, run, t, statusOf, compact }: Props) {
  const loc = (id: string) => s.locations.find((l) => l.id === id)!;
  const isShelter = (id: string) => s.shelters.some((x) => x.location === id);
  const planWorld = schedule ? withEffects(baseWorld(s), schedule.effects) : baseWorld(s);
  const hz = (id: string) => (run ? liveNodeHazard(s, run, id, t) : nodeHazard(baseWorld(s), id, t));
  const hzEnd = (id: string) => (run ? liveNodeHazard(s, run, id, s.horizon) : nodeHazard(planWorld, id, s.horizon));
  const unknownConn = s.knowledge.unknown?.connection;
  const observed = run?.knowledge.observations.find((o) => o.connection === unknownConn)?.state;

  // ---- routes in force, and which legs are conditional on an inspection
  const legs: { leg: Leg; kind: RouteKind; done: boolean; active: boolean; who: string }[] = [];
  const addLegs = (sc: Schedule, kindFor: (who: string, isCrew: boolean) => RouteKind | null) => {
    for (const j of sc.journeys) { const k = kindFor(j.groupId, false); if (k) j.legs.filter((l) => l.conn).forEach((l) => legs.push({ leg: l, kind: k, who: j.groupId, done: !!run && (run.groups[j.groupId].status === 'arrived' || l.end <= t), active: !!run && l.start <= t && t < l.end })); }
    for (const a of sc.crew) { const k = kindFor('crew', true); if (k) a.legs.filter((l) => l.conn).forEach((l) => legs.push({ leg: l, kind: k, who: 'crew', done: !!run && l.end <= t, active: !!run && l.start <= t && t < l.end })); }
  };
  if (plan && schedule) {
    if (plan.kind === 'policy' && plan.inspection && !observed) {
      const n = plan.inspection.prefixCrewCount;
      const shared = { ...plan.branches.open, crew: plan.branches.open.crew.slice(0, n), journeys: plan.branches.open.journeys.filter((j) => plan.branches.blocked.journeys.some((b) => b.groupId === j.groupId)) };
      addLegs(shared, (_w, crew) => (crew ? 'crew' : 'resident'));
      const cond = { ...plan.branches.open, crew: plan.branches.open.crew.slice(n), journeys: plan.branches.open.journeys.filter((j) => !plan.branches.blocked.journeys.some((b) => b.groupId === j.groupId)) };
      addLegs(cond, () => 'conditional');
    } else addLegs(schedule, (_w, crew) => (crew ? 'crew' : 'resident'));
  }
  const usedConn = new Set(legs.map((x) => x.leg.conn!));
  const homes = new Set(s.groups.map((g) => g.location));
  const relevantNode = new Set<string>([...homes, ...s.shelters.map((x) => x.location), s.crew.start]);
  legs.forEach((x) => { relevantNode.add(x.leg.from); relevantNode.add(x.leg.to); });
  if (run?.crew.at) relevantNode.add(run.crew.at);
  const focusing = !!schedule;

  const connState = (id: string) => {
    const c = s.connections.find((x) => x.id === id)!;
    if (c.state === 'unknown') return observed ? (observed === 'open' ? 'opened' : 'blocked') : 'unknown';
    if (run) return (run.openAt[id] ?? Infinity) <= t ? (c.state === 'blocked' ? 'opened' : 'open') : 'blocked';
    return c.state;
  };
  // blocked or unknown passages next to a home explain who is stuck: keep them visible
  const relevantConn = (id: string) => {
    if (!focusing || usedConn.has(id)) return true;
    const c = s.connections.find((x) => x.id === id)!;
    const st = connState(id);
    return (st === 'blocked' || st === 'unknown' || st === 'opened') && (homes.has(c.a) || homes.has(c.b));
  };

  const posAt = (at: string | null, edge: { conn: string; from: string; to: string; start: number; end: number } | null, fallback: string): [number, number] => {
    if (edge && edge.start < t && t < edge.end) {
      const a = loc(edge.from), b = loc(edge.to);
      const f = (t - edge.start) / (edge.end - edge.start);
      return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
    }
    const l = loc(at ?? fallback);
    return [l.x, l.y];
  };

  return (
    <figure className={`mapfig${compact ? ' compact' : ''}`}>
      <svg className="map" viewBox="0 0 1000 640" role="img" aria-labelledby="map-title map-desc">
        <title id="map-title">Neighborhood map{run ? ` at minute ${t}` : ''}</title>
        <desc id="map-desc">{s.groups.map((g) => `${groupName(g)}: ${g.count} residents, ${statusOf(g.id).replace('-', ' ')}`).join('. ')}.</desc>
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="var(--amber)" strokeWidth="3" /></pattern>
        </defs>
        {[{ y: 40, h: 110, label: 'Upper level' }, { y: 160, h: 220, label: 'Middle level' }, { y: 390, h: 230, label: 'Deep level' }].map((l) => (
          <g key={l.label}><rect x={10} y={l.y} width={980} height={l.h} rx={10} className="level" /><text x={978} y={l.y + l.h - 9} textAnchor="end" className="level-label">{l.label}</text></g>
        ))}
        {s.connections.map((c) => {
          const a = loc(c.a), b = loc(c.b);
          const st = connState(c.id);
          const rel = relevantConn(c.id);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const lx = a.x + (b.x - a.x) * 0.4 + ((b.y - a.y) / len) * 14, ly = a.y + (b.y - a.y) * 0.4 - ((b.x - a.x) / len) * 14;
          return (
            <g key={c.id} className={rel ? 'conn' : 'conn faded'}>
              <title>{passageName(s, c.id)} ({c.id}) — {c.minutes} min{c.kind === 'stairs' ? ', stairs' : ''}{c.capacity < 24 ? `, up to ${c.capacity} people at once` : ''}</title>
              {st === 'unknown' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#hatch)" strokeWidth={12} opacity={0.55} />}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge edge-${st}${c.kind === 'stairs' ? ' edge-stairs' : ''}`} />
              {rel && <text x={lx} y={ly} textAnchor="middle" className="edge-label">{c.minutes} min{c.kind === 'stairs' ? ' · stairs' : ''}</text>}
              {st === 'blocked' && <g className="blocked-mark"><circle cx={mx} cy={my} r={11} /><text x={mx} y={my + 5} textAnchor="middle">{'✕'}</text>{rel && <text x={mx} y={my + 27} textAnchor="middle" className="edge-tag">{c.note?.includes('collapsed') ? 'collapsed' : 'blocked'}</text>}</g>}
              {st === 'unknown' && <g className="unknown-mark"><circle cx={mx} cy={my} r={12} /><text x={mx} y={my + 6} textAnchor="middle">?</text><text x={mx} y={my + 29} textAnchor="middle" className="edge-tag">open or blocked?</text></g>}
              {st === 'opened' && rel && <text x={mx} y={my + 24} textAnchor="middle" className="edge-tag opened">{'✓'} open</text>}
            </g>
          );
        })}
        {legs.map((x, i) => {
          const a = loc(x.leg.from), b = loc(x.leg.to);
          const cls = `route route-${x.kind}${!approved ? ' proposed' : ''}${x.done ? ' done' : ''}${x.active ? ' active' : ''}`;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cls} />;
        })}
        {s.locations.map((l) => {
          const rel = !focusing || relevantNode.has(l.id);
          if (isShelter(l.id)) {
            const sh = s.shelters.find((x) => x.location === l.id)!;
            const occ = run ? run.shelters[l.id].occupants : [];
            const occN = occ.reduce((n, gid) => n + s.groups.find((g) => g.id === gid)!.count, 0);
            const resN = run ? run.shelters[l.id].reservations.filter((r) => !occ.includes(r.group)).reduce((n, r) => n + r.count, 0) : schedule ? schedule.journeys.filter((j) => j.shelter === l.id).reduce((n, j) => n + s.groups.find((g) => g.id === j.groupId)!.count, 0) : 0;
            return (
              <g key={l.id} className="shelter">
                <title>{l.name} ({l.id})</title>
                <rect x={l.x - 90} y={l.y - 34} width={180} height={68} rx={8} />
                <text x={l.x} y={l.y - 13} textAnchor="middle" className="shelter-name">{'⌂'} {l.name}</text>
                <text x={l.x} y={l.y + 6} textAnchor="middle" className="shelter-occ">{occN} of {sh.places} inside{resN ? ` · ${resN} expected` : ''}</text>
                <text x={l.x} y={l.y + 23} textAnchor="middle" className="shelter-check">{sh.checklist.accessibleEntry === 'present' ? 'step-free' : 'no step-free entry'} · {sh.checklist.assistanceOnArrival === 'present' ? 'assistance' : 'no assistance'}</text>
              </g>
            );
          }
          const h = hz(l.id), he = hzEnd(l.id);
          const hazardous = (l.hazard.initial > 0 || l.hazard.rate > 0) && rel;
          // once nobody is there or due to pass, a hazard no longer affects anyone: show it quietly
          const occupied = !run || s.groups.some((g) => { const gl = run.groups[g.id]; return gl.status !== 'arrived' && !gl.edge && gl.at === l.id; }) || legs.some((x) => !x.done && (x.leg.from === l.id || x.leg.to === l.id) && x.who !== 'crew');
          const level = !occupied ? 'quiet' : h >= s.threshold ? 'red' : h >= 60 ? 'amber' : hazardous ? 'warm' : '';
          return (
            <g key={l.id} className={rel ? 'place' : 'place faded'}>
              <title>{placeName(s, l.id)} ({l.id})</title>
              <circle cx={l.x} cy={l.y} r={hazardous ? 13 : 8} className={`node ${level ? 'node-' + level : ''}`} />
              {hazardous && <text x={l.x} y={l.y + 5} textAnchor="middle" className="node-icon">{'⚠'}</text>}
              <text x={l.x} y={l.y + (hazardous ? 32 : 26)} textAnchor="middle" className="node-name">{placeName(s, l.id)}</text>
              {hazardous && <text x={l.x} y={l.y + 49} textAnchor="middle" className={`node-hz ${level}`}>{occupied ? <>hazard {Math.round(h)} now {'·'} {Math.round(he)} at min {s.horizon}{h >= s.threshold ? ' — over the limit' : ''}</> : <>hazard {Math.round(h)} {'·'} nobody here now</>}</text>}
            </g>
          );
        })}
        {s.groups.map((g, i) => {
          const gl = run?.groups[g.id];
          const st = statusOf(g.id);
          const [x, y] = gl ? posAt(gl.at, gl.edge, g.location) : [loc(g.location).x, loc(g.location).y];
          const inShelter = gl?.status === 'arrived';
          const idx = inShelter ? s.groups.filter((o) => run!.groups[o.id].status === 'arrived' && run!.groups[o.id].shelter === gl!.shelter).findIndex((o) => o.id === g.id) : 0;
          const off = inShelter ? [112 + idx * 40, 0] : gl?.edge && gl.edge.start < t ? [0, -24] : [-34, -32];
          return (
            <g key={g.id} transform={`translate(${x + off[0]},${y + off[1]})`} className="group-marker">
              <title>{groupName(g)}: {g.count} residents{g.mobility === 'wheelchair' ? ' (wheelchair user)' : ''}</title>
              <circle r={17} fill={STATUS_FILL[st]} />
              <text y={6} textAnchor="middle" className="gm-count">{g.count}</text>
              {STATUS_ICON[st] && <text x={15} y={-11} className="gm-status">{STATUS_ICON[st]}</text>}
              {g.mobility === 'wheelchair' && <text x={-36} y={6} className="gm-icon">{'♿'}</text>}
            </g>
          );
        })}
        {(() => {
          const c = run?.crew;
          const [x, y] = c ? posAt(c.at, c.edge, s.crew.start) : [loc(s.crew.start).x, loc(s.crew.start).y];
          const atShelter = !!c?.at && !c.edge && isShelter(c.at);
          return (
            <g transform={`translate(${atShelter ? x - 60 : x + 22},${atShelter ? y + 52 : y + 16})`} className="crew-marker">
              <rect x={-11} y={-11} width={22} height={22} transform="rotate(45)" />
              <text x={18} y={5} className="crew-label">Crew{c?.activity ? ` · ${({ travel: 'travelling', work: 'working', inspect: 'inspecting', escort: 'escorting', wait: 'waiting' } as Record<string, string>)[c.activity.split(':')[0]] ?? ''}` : ''}</text>
            </g>
          );
        })()}
      </svg>
      <figcaption className="legend" aria-label="Map legend">
        <span><i className="lg lg-res" /> residents' route</span>
        <span><i className="lg lg-crew" /> crew route</span>
        {legs.some((x) => x.kind === 'conditional') && <span><i className="lg lg-cond" /> only if the inspection finds it open</span>}
        <span className="sym red">{'✕'} blocked</span>
        {s.connections.some((c) => c.state === 'unknown') && <span className="sym amber">? not yet checked</span>}
        <span className="sym amber">{'⚠'} hazard (limit {s.threshold})</span>
        <span className="sym">{'◆'} crew</span>
        <span className="sym">(n) people in a group</span>
      </figcaption>
    </figure>
  );
}
