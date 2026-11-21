import type { AnyPlan, Journey, Scenario, Schedule } from '../engine/types';
import type { SimState } from '../engine/simulate';
import { baseWorld, nodeHazard, withEffects } from '../engine/world';
import { liveNodeHazard } from '../engine/simulate';

interface Props {
  s: Scenario;
  plan: AnyPlan | null;
  schedule: Schedule | null;
  approved: boolean;
  run: SimState | null;
  t: number;
}

const groupColor = (status: string, unsafe: boolean) => (unsafe ? 'var(--red)' : status === 'arrived' ? 'var(--teal)' : status === 'traveling' ? 'var(--teal-2)' : status === 'assigned' ? 'var(--teal-3)' : status === 'conditional' ? 'var(--amber)' : 'var(--amber-2)');

export function MapView({ s, plan, schedule, approved, run, t }: Props) {
  const loc = (id: string) => s.locations.find((l) => l.id === id)!;
  const isShelter = (id: string) => s.shelters.some((x) => x.location === id);
  const planWorld = schedule ? withEffects(baseWorld(s), schedule.effects) : baseWorld(s);
  const hz = (id: string) => (run ? liveNodeHazard(s, run, id, t) : nodeHazard(baseWorld(s), id, t));
  const hzEnd = (id: string) => (run ? liveNodeHazard(s, run, id, s.horizon) : nodeHazard(planWorld, id, s.horizon));
  const unknownConn = s.knowledge.unknown?.connection;
  const revealed = run?.knowledge.observations.find((o) => o.connection === unknownConn)?.state;

  const connState = (id: string) => {
    const c = s.connections.find((x) => x.id === id)!;
    if (c.state === 'unknown') return revealed ? (revealed === 'open' ? 'opened' : 'blocked') : 'unknown';
    if (run) return (run.openAt[id] ?? Infinity) <= t ? (c.state === 'blocked' ? 'opened' : 'open') : 'blocked';
    return c.state;
  };

  // route overlays
  const routeLegs: { from: string; to: string; kind: string; key: string }[] = [];
  if (schedule) {
    const style = !approved ? 'proposed' : 'approved';
    schedule.journeys.forEach((j: Journey) => j.legs.filter((l) => l.conn).forEach((l, i) => {
      const done = run && run.groups[j.groupId].status === 'arrived';
      const active = run && l.start <= t && t < l.end;
      routeLegs.push({ from: l.from, to: l.to, kind: done ? 'completed' : active ? 'active' : style, key: `${j.groupId}-${i}` });
    }));
    schedule.crew.forEach((a) => a.legs.filter((l) => l.conn).forEach((l, i) => {
      const done = run && l.end <= t;
      const active = run && l.start <= t && t < l.end;
      routeLegs.push({ from: l.from, to: l.to, kind: done ? 'crew-done' : active ? 'active' : `crew-${style}`, key: `${a.id}-${i}` });
    }));
  }

  const posAt = (at: string | null, edge: { conn: string; from: string; to: string; start: number; end: number } | null, fallback: string): [number, number] => {
    if (edge && edge.start < t && t < edge.end) {
      const a = loc(edge.from), b = loc(edge.to);
      const f = (t - edge.start) / (edge.end - edge.start);
      return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
    }
    const l = loc(at ?? fallback);
    return [l.x, l.y];
  };

  const levels = [
    { y: 40, h: 110, label: 'Upper level' },
    { y: 160, h: 220, label: 'Mid level' },
    { y: 390, h: 230, label: 'Deep level' },
  ];

  return (
    <svg className="map" viewBox="0 0 1000 640" role="img" aria-label={`Neighborhood map at minute ${t}`}>
      <defs>
        <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="var(--amber)" strokeWidth="3" />
        </pattern>
      </defs>
      {levels.map((l) => (
        <g key={l.label}>
          <rect x={10} y={l.y} width={980} height={l.h} rx={10} className="level" />
          <text x={978} y={l.y + 18} textAnchor="end" className="level-label">{l.label}</text>
        </g>
      ))}
      {s.connections.map((c) => {
        const a = loc(c.a), b = loc(c.b);
        const st = connState(c.id);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const cls = `edge edge-${st}${c.kind === 'stairs' ? ' edge-stairs' : ''}`;
        return (
          <g key={c.id}>
            {st === 'unknown' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#hatch)" strokeWidth={12} opacity={0.55} />}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cls} />
            <text x={mx + 6} y={my - 6} className="edge-label">{c.minutes}&prime;{c.kind === 'stairs' ? ' stairs' : ''}{c.capacity < 24 ? ` cap ${c.capacity}` : ''}</text>
            {st === 'blocked' && <g className="blocked-mark"><circle cx={mx} cy={my} r={10} /><text x={mx} y={my + 4} textAnchor="middle">{'✕'}</text><text x={mx} y={my + 24} textAnchor="middle" className="edge-tag">{c.note?.includes('collapsed') ? 'collapsed' : 'blocked'}</text></g>}
            {st === 'unknown' && <g className="unknown-mark"><circle cx={mx} cy={my} r={11} /><text x={mx} y={my + 5} textAnchor="middle">?</text><text x={mx} y={my + 26} textAnchor="middle" className="edge-tag">unknown</text></g>}
            {st === 'opened' && <text x={mx} y={my + 22} textAnchor="middle" className="edge-tag opened">opened</text>}
          </g>
        );
      })}
      {routeLegs.map((r) => {
        const a = loc(r.from), b = loc(r.to);
        return <line key={r.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`route route-${r.kind}`} />;
      })}
      {s.locations.map((l) => {
        const h = hz(l.id), he = hzEnd(l.id);
        const hazardous = l.hazard.initial > 0 || l.hazard.rate > 0;
        if (isShelter(l.id)) {
          const sh = s.shelters.find((x) => x.location === l.id)!;
          const occ = run ? run.shelters[l.id].occupants : [];
          const occN = occ.reduce((n, gid) => n + s.groups.find((g) => g.id === gid)!.count, 0);
          const resN = run ? run.shelters[l.id].reservations.filter((r) => !occ.includes(r.group)).reduce((n, r) => n + r.count, 0) : schedule ? schedule.journeys.filter((j) => j.shelter === l.id).reduce((n, j) => n + s.groups.find((g) => g.id === j.groupId)!.count, 0) : 0;
          return (
            <g key={l.id} className="shelter">
              <rect x={l.x - 86} y={l.y - 32} width={172} height={64} rx={8} />
              <text x={l.x} y={l.y - 12} textAnchor="middle" className="shelter-name">{l.name}</text>
              <text x={l.x} y={l.y + 7} textAnchor="middle" className="shelter-occ">{occN} of {sh.places} inside{resN ? ` · ${resN} reserved` : ''}</text>
              <text x={l.x} y={l.y + 23} textAnchor="middle" className="shelter-check">{sh.checklist.accessibleEntry === 'present' ? 'step-free' : 'no step-free'} · {sh.checklist.assistanceOnArrival === 'present' ? 'assistance' : 'no assistance'}</text>
            </g>
          );
        }
        const cls = !hazardous ? 'node' : h >= s.threshold ? 'node node-red' : h >= 60 ? 'node node-amber' : 'node node-warm';
        return (
          <g key={l.id}>
            <circle cx={l.x} cy={l.y} r={17} className={cls} />
            <text x={l.x} y={l.y + 5} textAnchor="middle" className="node-id">{l.id}</text>
            <text x={l.x} y={l.y + 34} textAnchor="middle" className="node-name">{l.name}</text>
            {hazardous && <text x={l.x} y={l.y + 50} textAnchor="middle" className={`node-hz ${h >= s.threshold ? 'red' : h >= 60 ? 'amber' : ''}`}>hazard {Math.round(h)} {'→'} {Math.round(he)} at {s.horizon}</text>}
          </g>
        );
      })}
      {s.groups.map((g, i) => {
        const gl = run?.groups[g.id];
        const [x, y] = gl ? posAt(gl.at, gl.edge, g.location) : [loc(g.location).x, loc(g.location).y];
        const status = gl?.status ?? (schedule?.journeys.some((j) => j.groupId === g.id) ? (plan?.kind === 'policy' && plan.inspection && !plan.commonGroups.includes(g.id) ? 'conditional' : 'assigned') : 'unresolved');
        const atShelter = gl?.status === 'arrived';
        const shelterIdx = atShelter ? s.groups.filter((x) => run!.groups[x.id].status === 'arrived' && run!.groups[x.id].shelter === gl!.shelter).findIndex((x) => x.id === g.id) : 0;
        const off = atShelter ? [-60 + shelterIdx * 36, 52] : gl?.edge && gl.edge.start < t ? [0, -22] : [-30, -30];
        return (
          <g key={g.id} transform={`translate(${x + off[0]},${y + off[1]})`} className="group-marker">
            <circle r={15} fill={groupColor(status, !!gl?.unsafe)} />
            <text y={5} textAnchor="middle" className="gm-id">{g.id}</text>
            <text x={16} y={-9} className="gm-count">{g.count}</text>
            {g.mobility === 'wheelchair' && <text x={-33} y={5} className="gm-icon" aria-label="wheelchair user">{'♿'}</text>}
          </g>
        );
      })}
      {(() => {
        const c = run?.crew;
        const [x, y] = c ? posAt(c.at, c.edge, s.crew.start) : [loc(s.crew.start).x, loc(s.crew.start).y];
        return (
          <g transform={`translate(${x + 20},${y + 14})`} className="crew-marker">
            <rect x={-10} y={-10} width={20} height={20} transform="rotate(45)" />
            <text x={16} y={4} className="crew-label">Crew{c?.activity ? ` · ${c.activity.split(':')[0]}` : ''}</text>
          </g>
        );
      })()}
    </svg>
  );
}
