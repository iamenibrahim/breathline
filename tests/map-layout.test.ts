// Map label placement: a label never lands on a passage line when a clear spot exists.
import { describe, expect, it } from 'vitest';
import { Placer, segHitsRect, type Rect } from '../src/ui/mapLayout';

describe('map label placement', () => {
  it('detects a line crossing a label box, and ignores one that passes by', () => {
    expect(segHitsRect([0, 50, 100, 50], [40, 40, 60, 60])).toBe(true);
    expect(segHitsRect([0, 0, 100, 0], [40, 40, 60, 60])).toBe(false);
    expect(segHitsRect([50, 0, 50, 100], [40, 40, 60, 60])).toBe(true);
  });

  it('picks the spot clear of lines and of labels already placed', () => {
    const P = new Placer([[100, 100, 100, 300]]); // a vertical passage
    const onLine: Rect = [80, 180, 120, 200], left: Rect = [30, 180, 70, 200], right: Rect = [130, 180, 170, 200];
    P.reserve(right); // something already sits on the right
    expect(P.pick([{ rect: onLine }, { rect: right }, { rect: left, bias: 0.3 }]).rect).toEqual(left);
  });
});
