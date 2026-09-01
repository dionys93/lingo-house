// src/tests/frame.test.ts
//
// The inverse has to be the inverse OF THE COMPILER, not of a formula that
// resembles it. So the round trip is taken through compileGrid itself: author a
// mount, compile it, hand the world position back to floorMountAt, and require
// the mount you get to be the one you wrote.
//
// A test against gridFrame alone would pass with both halves off by the same
// half-cell, which is exactly the mistake that makes a dragged sofa land one
// cell from the cursor.

import { describe, it, expect } from 'vitest';
import { compileGrid } from '../core/house/grid';
import { centreOf, floorMountAt, gridFrame } from '../core/house/frame';
import { CELL } from '../core/house/scale';
import type { Cell } from '../core/shared/errors';
import type { Grid, ItemDef } from '../core/house/blocks';
import { room } from './support';

const K = room('kitchen', 'Kitchen');
const GRID: Grid = [
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
];

describe('a grid frame inverts the compiler', () => {
  const frame = gridFrame(GRID.length, 6);

  it('puts a zero-offset item at the cell centre the frame names', () => {
    const items: readonly ItemDef[] = [
      { id: 'a', kind: 'chair', mount: { on: 'floor', cell: [1, 2] } },
    ];
    const c = compileGrid(GRID, { items });
    if (!c.ok) throw new Error(JSON.stringify(c.error));
    const [x, z] = centreOf(frame, [1, 2]);
    expect(c.value.items[0].position[0]).toBeCloseTo(x, 12);
    expect(c.value.items[0].position[2]).toBeCloseTo(z, 12);
  });

  it('round-trips every cell and offset back to the mount that was authored', () => {
    // Offsets on the 0.05 lattice the editor snaps to, including the extremes
    // where the nearest-centre rule is about to hand the point to a neighbour.
    const offsets = [-0.45, -0.2, -0.05, 0, 0.05, 0.2, 0.45];
    // Interior cells only. An offset of -0.45 on an EDGE cell hangs a chair
    // half out of the house, which the fit check rejects — correctly, and it is
    // a different rule from the one under test.
    const cases: ItemDef[] = [];
    for (let r = 1; r < GRID.length - 1; r += 1) {
      for (let c = 1; c < 5; c += 1) {
        for (const ox of offsets) {
          for (const oz of offsets) {
            cases.push({
              id: `i-${String(r)}-${String(c)}-${String(ox)}-${String(oz)}`,
              kind: 'chair',
              mount: { on: 'floor', cell: [r, c], offset: [ox, oz] },
            });
          }
        }
      }
    }
    // One at a time: together they would all be ItemsOverlap, which is a real
    // rule and not the one under test here.
    const wrong: string[] = [];
    for (const def of cases) {
      const c = compileGrid(GRID, { items: [def] });
      if (!c.ok) {
        wrong.push(`${def.id}: did not compile`);
        continue;
      }
      const p = c.value.items[0].position;
      const got = floorMountAt(frame, p[0], p[2]);
      const want = def.mount.on === 'floor' ? def.mount : null;
      if (want === null) continue;
      const same =
        got.cell[0] === want.cell[0] &&
        got.cell[1] === want.cell[1] &&
        Math.abs(got.offset[0] - (want.offset?.[0] ?? 0)) < 1e-9 &&
        Math.abs(got.offset[1] - (want.offset?.[1] ?? 0)) < 1e-9;
      if (!same) wrong.push(`${def.id}: got ${JSON.stringify(got)}`);
    }
    expect(wrong).toEqual([]);
  });

  it('snaps to the nearest centre, so the offset is never more than half a cell', () => {
    // A point three quarters of the way across cell [0,0] belongs to [0,1],
    // nudged back — not to [0,0] nudged three quarters forward.
    const [x0, z0] = centreOf(frame, [0, 0]);
    const got = floorMountAt(frame, x0 + CELL * 0.75, z0);
    expect(got.cell).toEqual([0, 1]);
    expect(got.offset[0]).toBeCloseTo(-0.25, 9);
  });

  it('quantises the offset to the snap lattice', () => {
    const [x0, z0] = centreOf(frame, [1, 1]);
    const got = floorMountAt(frame, x0 + CELL * 0.1234, z0 - CELL * 0.0777);
    expect(got.offset[0]).toBeCloseTo(0.1, 9);
    expect(got.offset[1]).toBeCloseTo(-0.1, 9);
    // And it is a number a person would write, not 0.15000000000000002.
    expect(String(got.offset[0]).length).toBeLessThan(6);
  });

  it('clamps a point dragged off the grid to the edge cell', () => {
    const far = floorMountAt(frame, 99, -99);
    expect(far.cell).toEqual([0, 5]);
  });
});

describe('the frame edit mode uses is the house-wide one', () => {
  // A setback: this storey is smaller than the house, so its own extent is NOT
  // the frame it compiles in. Measuring the storey you happen to be editing
  // puts every one of its items half a cell out — silently, and only there.
  const SMALL: Grid = [
    [K, K],
    [K, K],
  ];
  const WHOLE = { rows: 5, cols: 6 };

  it("differs from the small storey's own extent", () => {
    expect(gridFrame(2, 2).xAt(0)).not.toBeCloseTo(gridFrame(WHOLE.rows, WHOLE.cols).xAt(0), 6);
  });

  it('and only the house-wide one inverts an item on that storey correctly', () => {
    const c = compileGrid(SMALL, {
      items: [{ id: 'up', kind: 'chair', mount: { on: 'floor', cell: [1, 1] } }],
      extent: WHOLE,
    });
    if (!c.ok) throw new Error(JSON.stringify(c.error));
    const up = c.value.items[0];
    const right = floorMountAt(gridFrame(WHOLE.rows, WHOLE.cols), up.position[0], up.position[2]);
    const wrong = floorMountAt(gridFrame(2, 2), up.position[0], up.position[2]);
    const cell: Cell = [1, 1];
    expect(right.cell).toEqual(cell);
    expect(right.offset).toEqual([0, 0]);
    // Not merely a different cell — the offset it invents is a whole cell of
    // drift, which is what "silently, and only there" looks like in a plan.
    expect(wrong.cell).not.toEqual(cell);
    expect(Math.abs(wrong.offset[0])).toBeGreaterThan(0.4);
  });
});
