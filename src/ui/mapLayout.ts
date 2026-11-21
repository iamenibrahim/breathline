// Label and marker placement for the map: every candidate spot is a rectangle; it costs more
// for each passage line it crosses, each label or marker already placed that it overlaps, and
// for leaving the map. The cheapest candidate wins and is reserved for later placements.
export type Rect = [number, number, number, number]; // x1, y1, x2, y2
export type Seg = [number, number, number, number];
export const MAP_W = 1000, MAP_H = 640;

/** Liang–Barsky: does segment (x1,y1)→(x2,y2) touch the rectangle? */
export function segHitsRect([x1, y1, x2, y2]: Seg, [rx1, ry1, rx2, ry2]: Rect): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy], q = [x1 - rx1, rx2 - x1, y1 - ry1, ry2 - y1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}
export const overlaps = (a: Rect, b: Rect) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
const outside = (r: Rect) => r[0] < 4 || r[2] > MAP_W - 4 || r[1] < 12 || r[3] > MAP_H - 4;

/** Approximate rendered width of a label (IBM Plex Sans). */
export const textW = (text: string, size: number, opts: { upper?: boolean; spacing?: number } = {}) =>
  text.length * size * ((opts.upper ? 0.63 : 0.53) + (opts.spacing ?? 0));

export class Placer {
  private taken: Rect[] = [];
  constructor(private segs: Seg[]) {}
  cost(r: Rect) {
    return this.segs.filter((s) => segHitsRect(s, r)).length * 3 + this.taken.filter((o) => overlaps(o, r)).length * 4 + (outside(r) ? 10 : 0);
  }
  reserve(r: Rect) { this.taken.push(r); }
  /** Cheapest candidate (ties broken by `bias`, then order); reserves its rectangle. */
  pick<T extends { rect: Rect; bias?: number }>(cands: T[]): T {
    let best = cands[0], bestCost = Infinity;
    for (const c of cands) { const k = this.cost(c.rect) + (c.bias ?? 0); if (k < bestCost) { best = c; bestCost = k; } }
    this.reserve(best.rect);
    return best;
  }
}
