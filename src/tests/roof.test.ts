// src/tests/roof.test.ts

import { describe, it, expect } from 'vitest';
import { gableRoof } from '../core/roof';

const allY = (roof: ReturnType<typeof gableRoof>): number[] => [
  ...roof.slopes.positions.map((p) => p[1]),
  ...roof.gables.flatMap((g) => [g.base0[1], g.base1[1], g.apex[1]]),
];

describe('gableRoof', () => {
  // A 2.5 × 2.5 square footprint. Tie → ridge along X, so span is the Z depth 2.5.
  const box = { x0: -1.25, x1: 1.25, z0: -1.25, z1: 1.25 };

  it('eaves sit at wall-top', () => {
    expect(Math.min(...allY(gableRoof(box, 1.2, 0.5)))).toBeCloseTo(1.2);
  });

  it('the ridge rises above the walls by pitch × halfSpan', () => {
    expect(Math.max(...allY(gableRoof(box, 1.2, 0.5)))).toBeCloseTo(1.2 + 0.5 * 1.25);
  });

  it('has two sloped panels and two gable ends, each apex at the ridge', () => {
    const roof = gableRoof(box, 1.2, 0.5);
    expect(roof.slopes.positions).toHaveLength(8); // two quads
    expect(roof.gables).toHaveLength(2);
    const ridgeY = 1.2 + 0.5 * 1.25;
    for (const g of roof.gables) {
      expect(g.apex[1]).toBeCloseTo(ridgeY); // apex at the ridge
      expect(g.base0[1]).toBeCloseTo(1.2); // bases at wall-top
      expect(g.base1[1]).toBeCloseTo(1.2);
    }
  });

  it('the ridge runs along the longer side (span is the shorter one)', () => {
    const wide = gableRoof({ x0: -2, x1: 2, z0: -0.5, z1: 0.5 }, 1, 0.5);
    expect(Math.max(...allY(wide))).toBeCloseTo(1 + 0.5 * 0.5);
    expect(wide.gables.every((g) => g.axis === 'x')).toBe(true); // gables face ±X
    const deep = gableRoof({ x0: -0.5, x1: 0.5, z0: -2, z1: 2 }, 1, 0.5);
    expect(Math.max(...allY(deep))).toBeCloseTo(1 + 0.5 * 0.5);
    expect(deep.gables.every((g) => g.axis === 'z')).toBe(true); // gables face ±Z
  });
});