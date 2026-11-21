// Decorative deep-space backdrop behind the map: a fixed-seed starfield and a faint glow.
// Purely decorative (aria-hidden) and static.
import { memo } from 'react';

function rng(seed: number) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

const STARS = (() => {
  const r = rng(20261120);
  return Array.from({ length: 220 }, () => ({ x: r() * 100, y: r() * 100, s: r() < 0.06 ? 2 : r() < 0.4 ? 1.4 : 1, o: 0.18 + r() * 0.62 }));
})();

export const Backdrop = memo(function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="bd-sky" />
      <div className="bd-stars">{STARS.map((s, i) => <i key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o }} />)}</div>
    </div>
  );
});
