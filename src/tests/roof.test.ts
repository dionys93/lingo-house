// src/tests/roof.test.ts

import { describe, it, expect } from 'vitest';
import { uvDensity } from '../core/mesh';
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

describe('gableRoof — UVs are world distances along the surface', () => {
  const SHAPE: RoofShape = { pitch: 0.5, rakeOverhang: 0.1, eaveOverhang: 0.2, bearingOffset: 0.04 };

  // The authored house: a tall storey with a lower one set back in front of it,
  // abutting. These are the two roofs that have to agree.
  const tall = gableRoof({ x0: 0, x1: 3, z0: 0, z1: 3.5 }, 2.4, SHAPE);
  const low = gableRoof({ x0: 0, x1: 3, z0: 3.5, z1: 4.5 }, 1.2, { ...SHAPE, abuts: { z0: true } });

  it('gives every vertex a UV', () => {
    expect(tall.slopes.uvs).toHaveLength(tall.slopes.positions.length);
    expect(low.slopes.uvs).toHaveLength(low.slopes.positions.length);
  });

  it('one UV unit is one world unit, on every panel of both roofs', () => {
    // The whole point. If this drifts, the shingle changes size between the low
    // roof and the tall one, which is the thing the roof work exists to avoid.
    //
    // Measured by uvDensity, which replaced a helper local to this file that
    // stepped `q += 4` and could therefore only ever see a roof. min and max
    // both, not the mean: one bad panel moves the mean far too little to fail.
    for (const [name, roof] of [
      ['tall', tall],
      ['low', low],
    ] as const) {
      const d = uvDensity(roof.slopes);
      // Narrows, and names the defect instead of letting a NaN mean fail as an
      // unexplained number.
      if (!d.ok) throw new Error(`${name} roof: ${JSON.stringify(d.error)}`);
      expect(d.value.min).toBeCloseTo(1, 6);
      expect(d.value.max).toBeCloseTo(1, 6);
    }
  });

  it('measures v UP THE SLOPE, not across the plan', () => {
    // In plan the tall roof's half-span is 1.5 + bearing; up the slope it is
    // longer by 1/cos(pitch). Projecting to the ground would compress every
    // course by that factor and shrink the tiles on a steeper roof.
    const halfSpanInPlan = 1.5 + SHAPE.bearingOffset + SHAPE.eaveOverhang;
    const vMax = Math.max(...tall.slopes.uvs.map((t) => t[1]));
    expect(vMax).toBeCloseTo(halfSpanInPlan * Math.hypot(1, SHAPE.pitch), 6);
    expect(vMax).toBeGreaterThan(halfSpanInPlan);
  });

  it('starts v at the eave, so courses run bottom-up like real tiles', () => {
    // Corners 0 and 1 of every quad sit on the eave — the quad invariant that
    // slopeMesh relies on.
    const { positions: p, uvs } = tall.slopes;
    for (let q = 0; q < p.length; q += 4) {
      expect(uvs[q][1]).toBe(0);
      expect(uvs[q + 1][1]).toBe(0);
      expect(p[q][1]).toBeLessThan(p[q + 2][1]); // eave below ridge
    }
  });

  it('anchors u in WORLD space, so two roofs put their tiles on the same lines', () => {
    // u is the world coordinate along the eave. Both roofs here run from the
    // same x0, so both start at the same u — a per-quad 0..1 would have each
    // roof begin its own grid at its own corner and drift out of step.
    const uOf = (r: ReturnType<typeof gableRoof>) => r.slopes.uvs.map((t) => t[0]);
    const tallSpan = tall.slopes.positions.map((v) => v[2]); // ridge along Z here
    const lowSpan = low.slopes.positions.map((v) => v[0]); // ridge along X here
    expect(Math.min(...uOf(tall))).toBeCloseTo(Math.min(...tallSpan), 6);
    expect(Math.min(...uOf(low))).toBeCloseTo(Math.min(...lowSpan), 6);
  });

  it('holds u constant up the slope — tiles run in columns, not fans', () => {
    for (const roof of [tall, low]) {
      const { uvs } = roof.slopes;
      for (let q = 0; q < uvs.length; q += 4) {
        expect(uvs[q + 3][0]).toBeCloseTo(uvs[q][0], 6); // ridge corner over its eave corner
        expect(uvs[q + 2][0]).toBeCloseTo(uvs[q + 1][0], 6);
      }
    }
  });
});