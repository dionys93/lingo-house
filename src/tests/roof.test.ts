// src/tests/roof.test.ts

import { describe, it, expect } from 'vitest';
import { gableRoof, type RoofShape } from '../core/roof';

const allY = (roof: ReturnType<typeof gableRoof>): number[] => [
  ...roof.slopes.positions.map((p) => p[1]),
  ...roof.gables.flatMap((g) => [g.base0[1], g.base1[1], g.apex[1]]),
];

describe('gableRoof', () => {
  // A 2.5 × 2.5 square footprint (wall centerlines). Tie → ridge along X, so the
  // span is the Z depth 2.5.
  const box = { x0: -1.25, x1: 1.25, z0: -1.25, z1: 1.25 };
  const SHAPE: RoofShape = { pitch: 0.5, rakeOverhang: 0.1, eaveOverhang: 0.2, bearingOffset: 0.04 };
  const { pitch, rakeOverhang, eaveOverhang, bearingOffset } = SHAPE;
  const ridgeY = 1.2 + pitch * (1.25 + bearingOffset);

  // The slope's Y at a given Z, interpolated along the front panel. This is the
  // plane the walls must stay under.
  const frontSlopeAt = (roof: ReturnType<typeof gableRoof>, z: number): number => {
    const [eave, , , ridge] = roof.slopes.positions.slice(0, 4);
    return eave[1] + ((ridge[1] - eave[1]) * (eave[2] - z)) / (eave[2] - ridge[2]);
  };

  it('eaves drop below wall-top by pitch × eaveOverhang', () => {
    expect(Math.min(...allY(gableRoof(box, 1.2, SHAPE)))).toBeCloseTo(1.2 - pitch * eaveOverhang);
  });

  it('bears on the wall\'s outer top edge: at or above wall-top across the wall\'s thickness', () => {
    // Walls are extruded ±bearingOffset around the centerline. A plane through
    // wall-top at the CENTERLINE would cut below wall-top over the wall's outer
    // half and the wall would bleed through the roof — the plane must instead
    // pass through wall-top at the outer face and clear the whole wall.
    const roof = gableRoof(box, 1.2, SHAPE);
    expect(frontSlopeAt(roof, 1.25 + bearingOffset)).toBeCloseTo(1.2); // outer face: bearing line
    expect(frontSlopeAt(roof, 1.25)).toBeGreaterThan(1.2); // centerline: clear
    expect(frontSlopeAt(roof, 1.25 - bearingOffset)).toBeGreaterThan(1.2); // inner face: clear
  });

  it('the ridge rises above the walls by pitch × (halfSpan + bearingOffset)', () => {
    expect(Math.max(...allY(gableRoof(box, 1.2, SHAPE)))).toBeCloseTo(ridgeY);
  });

  it('has two sloped panels and two gable ends, each apex at the ridge', () => {
    const roof = gableRoof(box, 1.2, SHAPE);
    expect(roof.slopes.positions).toHaveLength(8); // two quads
    expect(roof.gables).toHaveLength(2);
    for (const g of roof.gables) {
      expect(g.apex[1]).toBeCloseTo(ridgeY); // apex at the ridge
      expect(g.base0[1]).toBeCloseTo(1.2); // bases stay at wall-top…
      expect(g.base1[1]).toBeCloseTo(1.2); // …only the slopes drop past them
    }
  });

  it('gable sloped edges stay at or under the roof plane', () => {
    // Base corners sit at the centerline under a plane that clears them there,
    // and the apex touches the ridge — the straight edge between must never
    // poke through the (also straight) slope above it.
    const roof = gableRoof(box, 1.2, SHAPE);
    const g = roof.gables[0];
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const z = g.base1[2] + (g.apex[2] - g.base1[2]) * t;
      const y = g.base1[1] + (g.apex[1] - g.base1[1]) * t;
      expect(y).toBeLessThanOrEqual(frontSlopeAt(roof, z) + 1e-9);
    }
  });

  it('slopes hang past the gable ends by the rake overhang', () => {
    const roof = gableRoof(box, 1.2, SHAPE);
    const xs = roof.slopes.positions.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(-1.25 - rakeOverhang); // past the left gable
    expect(Math.max(...xs)).toBeCloseTo(1.25 + rakeOverhang);
    // the gable ends still sit at the footprint edge
    expect(roof.gables.some((g) => g.apex[0] === -1.25)).toBe(true);
    expect(roof.gables.some((g) => g.apex[0] === 1.25)).toBe(true);
  });

  it('slopes hang past the eave walls\' outer face by the eave overhang', () => {
    const roof = gableRoof(box, 1.2, SHAPE);
    const zs = roof.slopes.positions.map((p) => p[2]);
    expect(Math.min(...zs)).toBeCloseTo(-1.25 - bearingOffset - eaveOverhang);
    expect(Math.max(...zs)).toBeCloseTo(1.25 + bearingOffset + eaveOverhang);
  });

  it('the ridge runs along the longer side (span is the shorter one)', () => {
    const shortRidgeY = 1 + pitch * (0.5 + bearingOffset);
    const wide = gableRoof({ x0: -2, x1: 2, z0: -0.5, z1: 0.5 }, 1, SHAPE);
    expect(Math.max(...allY(wide))).toBeCloseTo(shortRidgeY);
    expect(wide.gables.every((g) => g.axis === 'x')).toBe(true); // gables face ±X
    const deep = gableRoof({ x0: -0.5, x1: 0.5, z0: -2, z1: 2 }, 1, SHAPE);
    expect(Math.max(...allY(deep))).toBeCloseTo(shortRidgeY);
    expect(deep.gables.every((g) => g.axis === 'z')).toBe(true); // gables face ±Z
  });
});