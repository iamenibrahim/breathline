// Decorative night-city backdrop behind the map: a starfield, a glowing horizon, a perspective grid
// floor and a pixel skyline with lit windows. Original artwork generated from a fixed seed so it is
// identical on every load; purely decorative (aria-hidden) and static (no animation).
import { memo } from 'react';

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

const W = 1600, H = 260;

function buildSkyline() {
  const r = rng(20261120);
  const towers: { x: number; w: number; h: number; tone: number }[] = [];
  for (let x = 0; x < W;) {
    const w = 26 + Math.floor(r() * 64);
    const tall = r() < 0.18;
    const h = Math.floor((tall ? 140 : 50) + r() * (tall ? 110 : 90));
    towers.push({ x, w, h, tone: r() < 0.5 ? 0 : 1 });
    x += w + Math.floor(r() * 6);
  }
  const windows: { x: number; y: number; c: number }[] = [];
  for (const t of towers) {
    for (let y = H - t.h + 10; y < H - 8; y += 10) {
      for (let x = t.x + 5; x < t.x + t.w - 6; x += 9) {
        const p = r();
        if (p < 0.2) windows.push({ x, y, c: p < 0.04 ? 2 : p < 0.1 ? 1 : 0 });
      }
    }
  }
  return { towers, windows };
}

const SKY = buildSkyline();
const STARS = (() => { const r = rng(7); return Array.from({ length: 140 }, () => ({ x: r() * 100, y: r() * 62, s: r() < 0.1 ? 2 : 1, o: 0.25 + r() * 0.6 })); })();

export const Backdrop = memo(function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="bd-sky" />
      <div className="bd-stars">{STARS.map((s, i) => <i key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o }} />)}</div>
      <div className="bd-sun" />
      <div className="bd-floor" />
      <svg className="bd-city" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        {SKY.towers.map((t, i) => <rect key={i} x={t.x} y={H - t.h} width={t.w} height={t.h} className={t.tone ? 'tw-b' : 'tw-a'} />)}
        {SKY.windows.map((w, i) => <rect key={i} x={w.x} y={w.y} width={4} height={4} className={`wn wn-${w.c}`} />)}
        <rect x={0} y={H - 3} width={W} height={3} className="bd-edge" />
      </svg>
    </div>
  );
});
