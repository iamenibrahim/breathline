// Neighborhood map that supports the decision: the selected routes, the hazards on them, the
// residents they affect and the crew are emphasised; unrelated passages fade. Place names only;
// technical ids appear in tooltips. Colour is always paired with text or an icon.
// Labels and markers are placed by mapLayout's Placer so they never sit on a passage line or
// on each other: fixed items first (shelters, marks, names, travel times), then moving ones.
import type { AnyPlan, Leg, Scenario, Schedule } from '../engine/types';
import type { SimState } from '../engine/simulate';
import { liveNodeHazard } from '../engine/simulate';
import { baseWorld, nodeHazard, withEffects } from '../engine/world';
import { groupName, passageName, placeName, type Plainstatus } from './plain';
import { Placer, textW, type Rect, type Seg } from './mapLayout';

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
type Anchor = 'start' | 'middle' | 'end';

const STATUS_FILL: Record<Plainstatus, string> = {
  arrived: 'var(--teal)', 'on-the-way': 'var(--teal-2)', 'has-route': 'var(--teal-3)', 'waiting-inspection': 'var(--amber)',
  'needs-help': 'var(--amber-2)', protected: 'var(--violet)', held: 'var(--red)', unsafe: 'var(--red)',
};
const STATUS_ICON: Record<Plainstatus, string> = { arrived: '✓', 'on-the-way': '→', 'has-route': '', 'waiting-inspection': '?', 'needs-help': '!', protected: '◐', held: '⏸', unsafe: '⚠' };
const CREW_DOING: Record<string, string> = { travel: 'travelling', work: 'working', inspect: 'inspecting', escort: 'escorting', wait: 'waiting' };
const LEVELS = [{ y: 40, h: 110, label: 'Upper level' }, { y: 160, h: 220, label: 'Middle level' }, { y: 390, h: 230, label: 'Deep level' }];
// sizes must match the map text styles in styles.css
const NAME = { size: 14, upper: true, spacing: 0.07 }, HZ = { size: 14 }, EDGE = { size: 14, spacing: 0.06 }, TAG = { size: 13, upper: true, spacing: 0.14 };
const CREW = { size: 12.5, upper: true, spacing: 0.08 }, LEVEL = { size: 14, upper: true, spacing: 0.3 };
const BOX_W = 90, BOX_H = 34; // shelter box half-sizes

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

  const onEdge = (edge: { start: number; end: number } | null) => !!edge && edge.start < t && t < edge.end;
  const posAt = (at: string | null, edge: { conn: string; from: string; to: string; start: number; end: number } | null, fallback: string): [number, number] => {
    if (edge && onEdge(edge)) {
      const a = loc(edge.from), b = loc(edge.to);
      const f = (t - edge.start) / (edge.end - edge.start);
      return [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
    }
    const l = loc(at ?? fallback);
    return [l.x, l.y];
  };

  // ================================================================== layout
  const segs: Seg[] = s.connections.map((c) => { const a = loc(c.a), b = loc(c.b); return [a.x, a.y, b.x, b.y]; });
  const P = new Placer(segs);
  s.shelters.forEach((sh) => { const l = loc(sh.location); P.reserve([l.x - BOX_W - 2, l.y - BOX_H - 2, l.x + BOX_W + 2, l.y + BOX_H + 2]); });
  // a group's home ring (with its wheelchair and status icons) and hazard rings are kept clear of labels
  homes.forEach((id) => { const l = loc(id); P.reserve([l.x - 20, l.y - 32, l.x + 22, l.y + 20]); });
  s.locations.filter((l) => l.hazard.initial > 0 || l.hazard.rate > 0).forEach((l) => P.reserve([l.x - 22, l.y - 22, l.x + 22, l.y + 22]));
  // a label box beside a point, and where its text goes
  const beside = (x: number, y: number, side: 'below' | 'above' | 'right' | 'left', off: number, w: number, h: number): { rect: Rect; tx: number; ty: number; anchor: Anchor } => {
    if (side === 'below') return { rect: [x - w / 2, y + off, x + w / 2, y + off + h], tx: x, ty: y + off, anchor: 'middle' };
    if (side === 'above') return { rect: [x - w / 2, y - off - h, x + w / 2, y - off], tx: x, ty: y - off - h, anchor: 'middle' };
    if (side === 'right') return { rect: [x + off, y - h / 2, x + off + w, y + h / 2], tx: x + off, ty: y - h / 2, anchor: 'start' };
    return { rect: [x - off - w, y - h / 2, x - off, y + h / 2], tx: x - off, ty: y - h / 2, anchor: 'end' };
  };
  const SIDES = ['below', 'right', 'above', 'left'] as const;
  const around = (x: number, y: number, off: number, w: number, h: number) => [
    ...SIDES.map((sd, i) => ({ ...beside(x, y, sd, off, w, h), bias: i * 0.1 })),
    // text hanging off one side of the dot, above or below it
    ...([-1, 1] as const).flatMap((dir, i) => ([['start', -8], ['end', 8]] as const).map(([anchor, dx], j) => {
      const x1 = anchor === 'start' ? x + dx : x + dx - w, y1 = dir < 0 ? y - off - h : y + off;
      return { rect: [x1, y1, x1 + w, y1 + h] as Rect, tx: x + dx, ty: y1, anchor: anchor as Anchor, bias: 0.4 + i * 0.05 + j * 0.02 };
    })),
  ];

  // 1. passage states and marks (at the midpoint)
  const conns = s.connections.map((c) => {
    const a = loc(c.a), b = loc(c.b);
    const st = connState(c.id), rel = relevantConn(c.id);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const marked = st === 'blocked' || st === 'unknown';
    if (marked) P.reserve([mx - 13, my - 13, mx + 13, my + 13]);
    return { c, a, b, st, rel, mx, my, marked };
  });

  // 2. place names (and hazard readouts) off the lines
  const nodes = s.locations.filter((l) => !isShelter(l.id)).map((l) => {
    const rel = !focusing || relevantNode.has(l.id);
    const h = hz(l.id), he = hzEnd(l.id);
    const hazardous = (l.hazard.initial > 0 || l.hazard.rate > 0) && rel;
    // once nobody is there or due to pass, a hazard no longer affects anyone: show it quietly
    const occupied = !run || s.groups.some((g) => { const gl = run.groups[g.id]; return gl.status !== 'arrived' && !gl.edge && gl.at === l.id; }) || legs.some((x) => !x.done && (x.leg.from === l.id || x.leg.to === l.id) && x.who !== 'crew');
    const level = !occupied ? 'quiet' : h >= s.threshold ? 'red' : h >= 60 ? 'amber' : hazardous ? 'warm' : '';
    const name = placeName(s, l.id);
    const hzText = hazardous ? (occupied ? `⚠ ${Math.round(h)} now · ${Math.round(he)} at min ${s.horizon}${h >= s.threshold ? ' · over limit' : ''}` : `⚠ ${Math.round(h)} · nobody here now`) : '';
    // a waiting group's ring sits on the dot, and hazards get an outer ring: the name clears both
    const off = hazardous ? 26 : homes.has(l.id) ? 22 : 10;
    const w = Math.max(textW(name, NAME.size, NAME), hazardous ? textW('⚠ 000 now · 000 at min 20', HZ.size) : 0);
    const lab = P.pick(around(l.x, l.y, off, w, hazardous ? 34 : 17));
    return { l, rel, hazardous, level, name, hzText, lab };
  });

  // 3. travel times and passage tags beside their own line, on its visible part
  const edgeLabels = conns.map((k) => {
    if (!k.rel) return { k, time: null, tag: null };
    let [ax, ay, bx, by] = [k.a.x, k.a.y, k.b.x, k.b.y];
    const clip = (sx: number, sy: number, ox: number, oy: number): [number, number] => {
      const dx = ox - sx, dy = oy - sy;
      const f = Math.min(dx ? (BOX_W + 2) / Math.abs(dx) : 1, dy ? (BOX_H + 2) / Math.abs(dy) : 1, 1);
      return [sx + dx * f, sy + dy * f];
    };
    if (isShelter(k.c.a)) [ax, ay] = clip(ax, ay, bx, by);
    if (isShelter(k.c.b)) [bx, by] = clip(bx, by, ax, ay);
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const px = -(by - ay) / len, py = (bx - ax) / len;
    const text = `${k.c.minutes} min${k.c.kind === 'stairs' ? ' · stairs' : ''}`;
    const w = textW(text, EDGE.size, EDGE), h = 15;
    const ext = Math.abs(px) * w / 2 + Math.abs(py) * h / 2 + 5;
    const cands = [0.5, 0.32, 0.68].flatMap((f, i) => [1, -1].map((sg) => {
      const cx = ax + (bx - ax) * f + sg * px * ext, cy = ay + (by - ay) * f + sg * py * ext;
      return { rect: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2] as Rect, x: cx, y: cy + 5, bias: i * 0.2 + (sg < 0 ? 0.05 : 0) };
    }));
    const time = { text, ...P.pick(cands) };
    const tagText = k.st === 'blocked' ? (k.c.note?.includes('collapsed') ? 'collapsed' : 'blocked') : k.st === 'unknown' ? 'open or blocked?' : k.st === 'opened' ? '✓ open' : null;
    let tag = null;
    if (tagText) {
      const tw = textW(tagText, TAG.size, TAG), te = Math.abs(px) * tw / 2 + Math.abs(py) * 7.5 + (k.marked ? 15 : 5);
      tag = { text: tagText, ...P.pick([1, -1].flatMap((sg, i) => [0.5, 0.4, 0.6].map((f, j) => {
        const cx = ax + (bx - ax) * f + sg * px * te, cy = ay + (by - ay) * f + sg * py * te;
        return { rect: [cx - tw / 2, cy - 7.5, cx + tw / 2, cy + 7.5] as Rect, tx: cx, ty: cy - 7.5, anchor: 'middle' as Anchor, bias: i * 0.05 + j * 0.2 };
      }))) };
    }
    return { k, time, tag };
  });

  // 4. level names, in whichever corner of the band is clear
  const levelLabels = LEVELS.map((lv) => {
    const w = textW(lv.label, LEVEL.size, LEVEL), yb = lv.y + lv.h - 6, yt = lv.y + 6;
    return P.pick([
      { rect: [978 - w, yb - 14, 978, yb] as Rect, x: 978, anchor: 'end' as Anchor, y: yb - 3 },
      { rect: [978 - w, yt, 978, yt + 14] as Rect, x: 978, anchor: 'end' as Anchor, y: yt + 11, bias: 0.1 },
      { rect: [22, yb - 14, 22 + w, yb] as Rect, x: 22, anchor: 'start' as Anchor, y: yb - 3, bias: 0.2 },
      { rect: [22, yt, 22 + w, yt + 14] as Rect, x: 22, anchor: 'start' as Anchor, y: yt + 11, bias: 0.3 },
    ]);
  });

  // 5. groups: waiting on their own dot, travelling on their line, arrived lined up on the shelter's free side
  const groupPos = new Map<string, [number, number]>();
  for (const sh of s.shelters) {
    const inside = run ? s.groups.filter((g) => run.groups[g.id].status === 'arrived' && run.groups[g.id].shelter === sh.location) : [];
    if (!inside.length) continue;
    const l = loc(sh.location), n = inside.length, span = n * 40;
    const lineup = P.pick([
      { rect: [l.x - BOX_W - 8 - span, l.y - 28, l.x - BOX_W - 4, l.y + 18] as Rect, at: (k: number): [number, number] => [l.x - BOX_W - 26 - k * 40, l.y] },
      { rect: [l.x + BOX_W + 4, l.y - 28, l.x + BOX_W + 8 + span, l.y + 18] as Rect, at: (k: number): [number, number] => [l.x + BOX_W + 26 + k * 40, l.y], bias: 0.1 },
      { rect: [l.x - span / 2, l.y + BOX_H + 4, l.x + span / 2, l.y + BOX_H + 50] as Rect, at: (k: number): [number, number] => [l.x - (n - 1) * 20 + k * 40, l.y + BOX_H + 30], bias: 0.2 },
      { rect: [l.x - span / 2, l.y - BOX_H - 50, l.x + span / 2, l.y - BOX_H - 4] as Rect, at: (k: number): [number, number] => [l.x - (n - 1) * 20 + k * 40, l.y - BOX_H - 22], bias: 0.3 },
    ]);
    inside.forEach((g, k) => groupPos.set(g.id, lineup.at(k)));
  }
  for (const g of s.groups) {
    if (groupPos.has(g.id)) continue;
    const gl = run?.groups[g.id];
    const p = gl ? posAt(gl.at, gl.edge, g.location) : ([loc(g.location).x, loc(g.location).y] as [number, number]);
    groupPos.set(g.id, p);
    P.reserve([p[0] - 18, p[1] - 30, p[0] + 18, p[1] + 18]);
  }

  // 6. crew: the clearest spot next to wherever it is
  const crew = (() => {
    const c = run?.crew;
    const [x, y] = c ? posAt(c.at, c.edge, s.crew.start) : [loc(s.crew.start).x, loc(s.crew.start).y];
    const text = `Crew${c?.activity ? ` · ${CREW_DOING[c.activity.split(':')[0]] ?? ''}` : ''}`;
    const w = textW(text, CREW.size, CREW);
    const spot = (dx: number, dy: number, left: boolean, bias = 0) => ({ x: dx, y: dy, left, bias, rect: (left ? [dx - 14 - w, dy - 10, dx + 9, dy + 10] : [dx - 9, dy - 10, dx + 14 + w, dy + 10]) as Rect });
    let cands;
    if (c && onEdge(c.edge)) {
      const a = loc(c.edge!.from), b = loc(c.edge!.to);
      const n = Math.hypot(b.x - a.x, b.y - a.y) || 1, px = -(b.y - a.y) / n, py = (b.x - a.x) / n;
      cands = [1, -1].flatMap((sg) => [spot(x + sg * px * 20, y + sg * py * 20, false), spot(x + sg * px * 20, y + sg * py * 20, true, 0.1)]);
    } else if (isShelter(c?.at ?? s.crew.start)) {
      cands = [spot(x, y + BOX_H + 18, false), spot(x, y - BOX_H - 18, false, 0.1), spot(x + BOX_W + 18, y, false, 0.2), spot(x - BOX_W - 18, y, true, 0.3)];
    } else {
      cands = [spot(x + 26, y, false), spot(x, y + 28, false, 0.1), spot(x, y - 28, false, 0.2), spot(x - 26, y, true, 0.3)];
    }
    return { text, ...P.pick(cands) };
  })();

  // ================================================================== drawing
  return (
    <figure className={`mapfig${compact ? ' compact' : ''}`}>
      <svg className="map" viewBox="0 0 1000 640" role="img" aria-labelledby="map-title map-desc">
        <title id="map-title">Neighborhood map{run ? ` at minute ${t}` : ''}</title>
        <desc id="map-desc">{s.groups.map((g) => `${groupName(g)}: ${g.count} residents, ${statusOf(g.id).replace('-', ' ')}`).join('. ')}.</desc>
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="var(--amber)" strokeWidth="1.5" /></pattern>
          <radialGradient id="glow" cx="50%" cy="55%" r="65%"><stop offset="0" stopColor="#8ad4ff" stopOpacity="0.07" /><stop offset="1" stopColor="#8ad4ff" stopOpacity="0" /></radialGradient>
        </defs>
        <rect x={0} y={0} width={1000} height={640} fill="url(#glow)" />
        {LEVELS.map((lv, i) => (
          <g key={lv.label}><rect x={10} y={lv.y} width={980} height={lv.h} rx={10} className="level" /><text x={levelLabels[i].x} y={levelLabels[i].y} textAnchor={levelLabels[i].anchor} className="level-label">{lv.label}</text></g>
        ))}
        {conns.map(({ c, a, b, st, rel }) => (
          <g key={c.id} className={rel ? 'conn' : 'conn faded'}>
            <title>{passageName(s, c.id)} ({c.id}) — {c.minutes} min{c.kind === 'stairs' ? ', stairs' : ''}{c.capacity < 24 ? `, up to ${c.capacity} people at once` : ''}</title>
            {st === 'unknown' && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="url(#hatch)" strokeWidth={12} opacity={0.55} />}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`edge edge-${st}${c.kind === 'stairs' ? ' edge-stairs' : ''}`} />
          </g>
        ))}
        {legs.map((x, i) => {
          const a = loc(x.leg.from), b = loc(x.leg.to);
          const cls = `route route-${x.kind}${!approved ? ' proposed' : ''}${x.done ? ' done' : ''}${x.active ? ' active' : ''}`;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cls} />;
        })}
        {/* passage labels and marks sit above the routes so a route never hides them */}
        {edgeLabels.map(({ k, time, tag }) => (
          <g key={k.c.id} className={k.rel ? 'conn' : 'conn faded'} aria-hidden="true">
            {time && <text x={time.x} y={time.y} textAnchor="middle" className="edge-label">{time.text}</text>}
            {k.st === 'blocked' && <g className="blocked-mark"><circle cx={k.mx} cy={k.my} r={11} /><text x={k.mx} y={k.my + 5} textAnchor="middle">{'✕'}</text></g>}
            {k.st === 'unknown' && <g className="unknown-mark"><circle cx={k.mx} cy={k.my} r={12} /><text x={k.mx} y={k.my + 6} textAnchor="middle">?</text></g>}
            {tag && <text x={tag.tx} y={tag.ty + 12} textAnchor={tag.anchor} className={`edge-tag${k.st === 'opened' ? ' opened' : ''}`}>{tag.text}</text>}
          </g>
        ))}
        {s.shelters.map((sh) => {
          const l = loc(sh.location);
          const occ = run ? run.shelters[l.id].occupants : [];
          const occN = occ.reduce((n, gid) => n + s.groups.find((g) => g.id === gid)!.count, 0);
          const resN = run ? run.shelters[l.id].reservations.filter((r) => !occ.includes(r.group)).reduce((n, r) => n + r.count, 0) : schedule ? schedule.journeys.filter((j) => j.shelter === l.id).reduce((n, j) => n + s.groups.find((g) => g.id === j.groupId)!.count, 0) : 0;
          return (
            <g key={l.id} className="shelter">
              <title>{l.name} ({l.id})</title>
              <rect x={l.x - BOX_W} y={l.y - BOX_H} width={BOX_W * 2} height={BOX_H * 2} rx={8} />
              <text x={l.x} y={l.y - 13} textAnchor="middle" className="shelter-name">{'⌂'} {l.name}</text>
              <text x={l.x} y={l.y + 6} textAnchor="middle" className="shelter-occ">{occN} of {sh.places} inside{resN ? ` · ${resN} expected` : ''}</text>
              <text x={l.x} y={l.y + 23} textAnchor="middle" className="shelter-check">{sh.checklist.accessibleEntry === 'present' ? 'step-free' : 'no step-free entry'} · {sh.checklist.assistanceOnArrival === 'present' ? 'assistance' : 'no assistance'}</text>
            </g>
          );
        })}
        {nodes.map(({ l, rel, hazardous, level, name, hzText, lab }) => (
          <g key={l.id} className={rel ? 'place' : 'place faded'}>
            <title>{name} ({l.id})</title>
            {hazardous && <circle cx={l.x} cy={l.y} r={21} className={`node-halo ${level ? 'node-' + level : ''}`} />}
            <circle cx={l.x} cy={l.y} r={hazardous ? 5 : 4} className={`node ${level ? 'node-' + level : ''}`} />
            <text x={lab.tx} y={lab.ty + 13} textAnchor={lab.anchor} className="node-name">{name}</text>
            {hazardous && <text x={lab.tx} y={lab.ty + 30} textAnchor={lab.anchor} className={`node-hz ${level}`}>{hzText}</text>}
          </g>
        ))}
        {s.groups.map((g) => {
          const st = statusOf(g.id);
          const [x, y] = groupPos.get(g.id)!;
          return (
            <g key={g.id} transform={`translate(${x},${y})`} className="group-marker">
              <title>{groupName(g)}: {g.count} residents{g.mobility === 'wheelchair' ? ' (wheelchair user)' : ''}</title>
              <circle r={16} className="gm-back" />
              <circle r={16} fill={STATUS_FILL[st]} stroke={STATUS_FILL[st]} />
              <text y={6} textAnchor="middle" className="gm-count">{g.count}</text>
              {STATUS_ICON[st] && <text x={14} y={-12} className="gm-status">{STATUS_ICON[st]}</text>}
              {g.mobility === 'wheelchair' && <text x={0} y={-21} textAnchor="middle" className="gm-icon">{'♿'}</text>}
            </g>
          );
        })}
        <g transform={`translate(${crew.x},${crew.y})`} className="crew-marker">
          <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" />
          <text x={crew.left ? -14 : 14} y={4} textAnchor={crew.left ? 'end' : 'start'} className="crew-label">{crew.text}</text>
        </g>
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
