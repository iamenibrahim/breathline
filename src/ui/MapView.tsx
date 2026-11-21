// Full-bleed neighborhood scene. The 1000x640 map is fitted into the open area between the floating
// panels and can be panned (drag, arrow keys) and zoomed (wheel, +/- keys, buttons). Selected routes,
// relevant hazards, affected residents and the crew are emphasised; unrelated passages fade. Place
// names only; technical ids appear in tooltips. Colour is always paired with text or an icon.
import { useEffect, useRef, useState } from 'react';
import type { AnyPlan, Leg, Scenario, Schedule } from '../engine/types';
import type { SimState } from '../engine/simulate';
import { liveNodeHazard } from '../engine/simulate';
import { baseWorld, nodeHazard, withEffects } from '../engine/world';
import { groupName, passageName, placeName, type Plainstatus } from './plain';

export interface Camera { x: number; y: number; k: number }
export interface Layers { routes: boolean; hazards: boolean; labels: boolean; times: boolean }
export interface Insets { left: number; right: number; top: number; bottom: number }

interface Props {
  s: Scenario;
  plan: AnyPlan | null;
  schedule: Schedule | null; // schedule currently in force (active branch, or open branch before observation)
  approved: boolean;
  run: SimState | null;
  t: number;
  statusOf: (gid: string) => Plainstatus;
  cam: Camera;
  setCam: (c: Camera | ((c: Camera) => Camera)) => void;
  layers: Layers;
  insets: Insets;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

type RouteKind = 'resident' | 'crew' | 'conditional';
export const MAP_W = 1000, MAP_H = 640;

const STATUS_FILL: Record<Plainstatus, string> = {
  arrived: 'var(--teal)', 'on-the-way': 'var(--teal-2)', 'has-route': 'var(--teal-3)', 'waiting-inspection': 'var(--amber)',
  'needs-help': 'var(--amber-2)', protected: 'var(--violet)', held: 'var(--red)', unsafe: 'var(--red)',
};
const STATUS_ICON: Record<Plainstatus, string> = { arrived: '✓', 'on-the-way': '→', 'has-route': '', 'waiting-inspection': '?', 'needs-help': '!', protected: '◐', held: '⏸', unsafe: '⚠' };
const CREW_DOING: Record<string, string> = { travel: 'travelling', work: 'working', inspect: 'inspecting', escort: 'escorting', wait: 'waiting' };

/** Zoom by factor f about point (px, py) in map units, keeping that point still. */
export function zoomAbout(c: Camera, f: number, px = MAP_W / 2, py = MAP_H / 2): Camera {
  const k = Math.min(4, Math.max(0.6, c.k * f));
  const r = k / c.k;
  return { k, x: px - (px - c.x) * r, y: py - (py - c.y) * r };
}

/** Centre the free viewing area on a map point. */
export function focusOn(c: Camera, px: number, py: number): Camera {
  const k = Math.max(c.k, 1.5);
  return { k, x: MAP_W / 2 - px * k, y: MAP_H / 2 - py * k };
}

export function MapView({ s, plan, schedule, approved, run, t, statusOf, cam, setCam, layers, insets, selected, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const drag = useRef<null | { x: number; y: number; cx: number; cy: number; moved: boolean }>(null);
  const [dragging, setDragging] = useState(false);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<null | { d: number }>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // fit the map into the free rectangle between the floating panels
  const freeW = Math.max(220, size.w - insets.left - insets.right), freeH = Math.max(180, size.h - insets.top - insets.bottom);
  const sc = Math.min(freeW / MAP_W, freeH / MAP_H);
  const vbW = size.w / sc, vbH = size.h / sc;
  const vx = -(insets.left / sc) - (freeW / sc - MAP_W) / 2, vy = -(insets.top / sc) - (freeH / sc - MAP_H) / 2;

  const loc = (id: string) => s.locations.find((l) => l.id === id)!;
  const isShelter = (id: string) => s.shelters.some((x) => x.location === id);
  const planWorld = schedule ? withEffects(baseWorld(s), schedule.effects) : baseWorld(s);
  const hz = (id: string) => (run ? liveNodeHazard(s, run, id, t) : nodeHazard(baseWorld(s), id, t));
  const hzEnd = (id: string) => (run ? liveNodeHazard(s, run, id, s.horizon) : nodeHazard(planWorld, id, s.horizon));
  const unknownConn = s.knowledge.unknown?.connection;
  const observed = run?.knowledge.observations.find((o) => o.connection === unknownConn)?.state;

  // ---- routes in force, and which legs are conditional on an inspection
  const legs: { leg: Leg; kind: RouteKind; done: boolean; active: boolean; who: string }[] = [];
  const addLegs = (sch: Schedule, kindFor: (isCrew: boolean) => RouteKind) => {
    for (const j of sch.journeys) j.legs.filter((l) => l.conn).forEach((l) => legs.push({ leg: l, kind: kindFor(false), who: j.groupId, done: !!run && (run.groups[j.groupId].status === 'arrived' || l.end <= t), active: !!run && l.start <= t && t < l.end }));
    for (const a of sch.crew) a.legs.filter((l) => l.conn).forEach((l) => legs.push({ leg: l, kind: kindFor(true), who: 'crew', done: !!run && l.end <= t, active: !!run && l.start <= t && t < l.end }));
  };
  if (plan && schedule) {
    if (plan.kind === 'policy' && plan.inspection && !observed) {
      const n = plan.inspection.prefixCrewCount;
      const inBoth = (gid: string) => plan.branches.blocked.journeys.some((b) => b.groupId === gid);
      addLegs({ ...plan.branches.open, crew: plan.branches.open.crew.slice(0, n), journeys: plan.branches.open.journeys.filter((j) => inBoth(j.groupId)) }, (crew) => (crew ? 'crew' : 'resident'));
      addLegs({ ...plan.branches.open, crew: plan.branches.open.crew.slice(n), journeys: plan.branches.open.journeys.filter((j) => !inBoth(j.groupId)) }, () => 'conditional');
    } else addLegs(schedule, (crew) => (crew ? 'crew' : 'resident'));
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

  // ---- interaction: drag to pan, wheel to zoom about the pointer, keyboard pan/zoom, click to select
  const toMapXY = (el: Element, cx: number, cy: number): [number, number] => { const r = el.getBoundingClientRect(); return [vx + (cx - r.left) / sc, vy + (cy - r.top) / sc]; };
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as Element).closest('[data-select]')) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    if (pts.current.size === 2) { const [a, b] = [...pts.current.values()]; pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; drag.current = null; return; }
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pts.current.size === 2) {
      // two-finger pinch: zoom about the midpoint
      const [a, b] = [...pts.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const [mx, my] = toMapXY(e.currentTarget as Element, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const f = d / pinch.current.d;
      pinch.current.d = d;
      setCam((c) => zoomAbout(c, f, mx, my));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    setCam((c) => ({ k: c.k, x: d.cx + dx / sc, y: d.cy + dy / sc }));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (drag.current && !drag.current.moved) onSelect(null);
    drag.current = null;
    setDragging(false);
  };
  const onWheel = (e: React.WheelEvent) => {
    const [px, py] = toMapXY(e.currentTarget as Element, e.clientX, e.clientY);
    setCam((c) => zoomAbout(c, e.deltaY < 0 ? 1.12 : 1 / 1.12, px, py));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = 40;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => setCam((c) => ({ ...c, x: c.x + step })), ArrowRight: () => setCam((c) => ({ ...c, x: c.x - step })),
      ArrowUp: () => setCam((c) => ({ ...c, y: c.y + step })), ArrowDown: () => setCam((c) => ({ ...c, y: c.y - step })),
      '+': () => setCam((c) => zoomAbout(c, 1.2)), '=': () => setCam((c) => zoomAbout(c, 1.2)), '-': () => setCam((c) => zoomAbout(c, 1 / 1.2)),
      '0': () => setCam({ x: 0, y: 0, k: 1 }), Escape: () => onSelect(null),
    };
    if (keys[e.key] && e.target === e.currentTarget) { e.preventDefault(); keys[e.key](); }
  };
  const sel = (id: string, label: string) => ({
    'data-select': id, role: 'button', tabIndex: 0, 'aria-pressed': selected === id, 'aria-label': label,
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); onSelect(selected === id ? null : id); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect(selected === id ? null : id); } },
  });

  return (
    <div className="scene-wrap" ref={wrap}>
      <svg className={`scene${dragging ? ' dragging' : ''}`} viewBox={`${vx} ${vy} ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet"
        role="application" aria-roledescription="map" tabIndex={0}
        aria-label={`Neighborhood map${run ? ` at minute ${t}` : ''}. Drag or use the arrow keys to move, plus and minus to zoom, 0 to reset. ${s.groups.map((g) => `${groupName(g)}: ${g.count} residents, ${statusOf(g.id).replace('-', ' ')}`).join('. ')}.`}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} onKeyDown={onKey}>
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="var(--amber)" strokeWidth="3" /></pattern>
        </defs>
        <g className={`cam${dragging ? '' : ' smooth'}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          {[{ y: 40, h: 110, label: 'Upper level' }, { y: 160, h: 220, label: 'Middle level' }, { y: 390, h: 230, label: 'Deep level' }].map((l) => (
            <g key={l.label} className="stratum"><rect x={10} y={l.y} width={980} height={l.h} rx={16} /><text x={978} y={l.y + l.h - 10} textAnchor="end" className="stratum-label">{l.label}</text></g>
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
                {rel && layers.times && <text x={lx} y={ly} textAnchor="middle" className="edge-label">{c.minutes} min{c.kind === 'stairs' ? ' · stairs' : ''}</text>}
                {st === 'blocked' && <g className="blocked-mark"><circle cx={mx} cy={my} r={11} /><text x={mx} y={my + 5} textAnchor="middle">✕</text>{rel && <text x={mx} y={my + 27} textAnchor="middle" className="edge-tag">{c.note?.includes('collapsed') ? 'collapsed' : 'blocked'}</text>}</g>}
                {st === 'unknown' && <g className="unknown-mark"><circle cx={mx} cy={my} r={12} /><text x={mx} y={my + 6} textAnchor="middle">?</text><text x={mx} y={my + 29} textAnchor="middle" className="edge-tag">open or blocked?</text></g>}
                {st === 'opened' && rel && <text x={mx} y={my + 24} textAnchor="middle" className="edge-tag opened">✓ open</text>}
              </g>
            );
          })}
          {layers.routes && legs.map((x, i) => {
            const a = loc(x.leg.from), b = loc(x.leg.to);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`route route-${x.kind}${!approved ? ' proposed' : ''}${x.done ? ' done' : ''}${x.active ? ' active' : ''}`} />;
          })}
          {s.locations.map((l) => {
            const rel = !focusing || relevantNode.has(l.id);
            const id = `place:${l.id}`;
            const isSel = selected === id;
            if (isShelter(l.id)) {
              const sh = s.shelters.find((x) => x.location === l.id)!;
              const occ = run ? run.shelters[l.id].occupants : [];
              const occN = occ.reduce((n, gid) => n + s.groups.find((g) => g.id === gid)!.count, 0);
              const resN = run ? run.shelters[l.id].reservations.filter((r) => !occ.includes(r.group)).reduce((n, r) => n + r.count, 0) : schedule ? schedule.journeys.filter((j) => j.shelter === l.id).reduce((n, j) => n + s.groups.find((g) => g.id === j.groupId)!.count, 0) : 0;
              return (
                <g key={l.id} className={`shelter${isSel ? ' sel' : ''}`} {...sel(id, `${l.name}: ${occN} of ${sh.places} inside`)}>
                  <title>{l.name} ({l.id})</title>
                  <rect x={l.x - 78} y={l.y - 30} width={156} height={60} rx={6} />
                  <text x={l.x} y={l.y - 8} textAnchor="middle" className="shelter-name">{l.name}</text>
                  <text x={l.x} y={l.y + 15} textAnchor="middle" className="shelter-occ">{occN}<tspan className="shelter-of"> / {sh.places}</tspan>{resN ? <tspan className="shelter-exp"> · +{resN} due</tspan> : null}</text>
                </g>
              );
            }
            const h = hz(l.id), he = hzEnd(l.id);
            const hazardous = (l.hazard.initial > 0 || l.hazard.rate > 0) && rel && layers.hazards;
            // once nobody is there or due to pass, a hazard no longer affects anyone: show it quietly
            const occupied = !run || s.groups.some((g) => { const gl = run.groups[g.id]; return gl.status !== 'arrived' && !gl.edge && gl.at === l.id; }) || legs.some((x) => !x.done && (x.leg.from === l.id || x.leg.to === l.id) && x.who !== 'crew');
            const level = !hazardous ? '' : !occupied ? 'quiet' : h >= s.threshold ? 'red' : h >= 60 ? 'amber' : 'warm';
            return (
              <g key={l.id} className={`place${rel ? '' : ' faded'}${isSel ? ' sel' : ''}`} {...sel(id, placeName(s, l.id))}>
                <title>{placeName(s, l.id)} ({l.id})</title>
                {hazardous && level !== 'quiet' && <circle cx={l.x} cy={l.y} r={level === 'red' ? 30 : 23} className={`haze haze-${level}`} />}
                <circle cx={l.x} cy={l.y} r={hazardous ? 12 : 6} className={`node${level ? ' node-' + level : ''}`} />
                {isSel && <circle cx={l.x} cy={l.y} r={22} className="sel-ring" />}
                {hazardous && <text x={l.x} y={l.y + 5} textAnchor="middle" className="node-icon">⚠</text>}
                {(layers.labels || isSel) && <text x={l.x} y={l.y + (hazardous ? 32 : 26)} textAnchor="middle" className="node-name">{placeName(s, l.id)}</text>}
                {hazardous && occupied && <text x={l.x} y={l.y + 47} textAnchor="middle" className={`node-hz ${level}`}><title>{`Hazard ${Math.round(h)} now, ${Math.round(he)} by minute ${s.horizon} (limit ${s.threshold})`}</title>⚠ {Math.round(h)} → {Math.round(he)}{h >= s.threshold ? ' over limit' : ''}</text>}
              </g>
            );
          })}
          {s.groups.map((g) => {
            const gl = run?.groups[g.id];
            const st = statusOf(g.id);
            const [x, y] = gl ? posAt(gl.at, gl.edge, g.location) : [loc(g.location).x, loc(g.location).y];
            const inShelter = gl?.status === 'arrived';
            const idx = inShelter ? s.groups.filter((o) => run!.groups[o.id].status === 'arrived' && run!.groups[o.id].shelter === gl!.shelter).findIndex((o) => o.id === g.id) : 0;
            const off = inShelter ? [112 + idx * 40, 0] : gl?.edge && gl.edge.start < t ? [0, -24] : [-34, -32];
            const id = `group:${g.id}`;
            return (
              <g key={g.id} transform={`translate(${x + off[0]},${y + off[1]})`} className={`group-marker${selected === id ? ' sel' : ''}`} {...sel(id, `${groupName(g)}, ${g.count} residents`)}>
                <title>{groupName(g)}: {g.count} residents{g.mobility === 'wheelchair' ? ' (wheelchair user)' : ''}</title>
                {(st === 'needs-help' || st === 'waiting-inspection' || st === 'unsafe') && <circle r={17} className={`gm-pulse pulse-${st}`} />}
                <circle r={17} fill={STATUS_FILL[st]} className="gm-dot" />
                <text y={6} textAnchor="middle" className="gm-count">{g.count}</text>
                {STATUS_ICON[st] && <text x={15} y={-11} className="gm-status">{STATUS_ICON[st]}</text>}
                {g.mobility === 'wheelchair' && <text x={-36} y={6} className="gm-icon">♿</text>}
              </g>
            );
          })}
          {(() => {
            const c = run?.crew;
            const [x, y] = c ? posAt(c.at, c.edge, s.crew.start) : [loc(s.crew.start).x, loc(s.crew.start).y];
            const atShelter = !!c?.at && !c.edge && isShelter(c.at);
            return (
              <g transform={`translate(${atShelter ? x - 60 : x + 24},${atShelter ? y + 60 : y - 22})`} className={`crew-marker${selected === 'crew' ? ' sel' : ''}`} {...sel('crew', 'Crew')}>
                <rect x={-10} y={-10} width={20} height={20} transform="rotate(45)" />
                <title>{`Crew${c?.activity ? ` — ${CREW_DOING[c.activity.split(':')[0]] ?? ''}` : ''}`}</title>
                <text x={18} y={5} className="crew-label">Crew</text>
              </g>
            );
          })()}
        </g>
      </svg>
    </div>
  );
}

export function Legend({ s, conditional }: { s: Scenario; conditional: boolean }) {
  return (
    <div className="legend" role="note" aria-label="Map key">
      <span><i className="lg lg-res" /> residents' route</span>
      <span><i className="lg lg-crew" /> crew route</span>
      {conditional && <span><i className="lg lg-cond" /> only if the inspection finds it open</span>}
      <span className="sym red">✕ blocked</span>
      {s.connections.some((c) => c.state === 'unknown') && <span className="sym amber">? not yet checked</span>}
      <span className="sym amber">⚠ 44 → 142 hazard now → minute {s.horizon} (limit {s.threshold})</span>
      <span className="sym">◆ crew · (n) people in a group</span>
      <span className="sym">12 / 12 shelter places taken</span>
    </div>
  );
}
