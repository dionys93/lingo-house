// src/tests/outdoor.test.ts
//
// What `outdoor: true` actually changes.
//
// It is one field, and it turns the grid from THE BUILDING into THE PLOT: a
// patio is floor with a name and no house over it. The three derivations it
// touches are all one-liners, which is exactly why they need pinning — a
// one-liner is the kind of thing a later refactor "simplifies" back.

import { describe, it, expect } from 'vitest';
import { compileGrid } from '../core/house/grid';
import { compileHouse } from '../core/house/house';
import { uncoveredRects } from '../core/house/footprint';
import { roofed } from '../core/house/blocks';
import type { Grid, Storey } from '../core/house/blocks';
import { CELL } from '../core/house/scale';
import { outdoors, room } from './support';

const K = room('kitchen', 'the kitchen');
const P = outdoors('patio', 'the patio');
const L = outdoors('lawn', 'the lawn');

// A house one room deep with a paved yard behind it and grass beyond that.
const PLOT: Grid = [
  [L, L, L],
  [P, P, P],
  [K, K, K],
  [K, K, K],
];

const compiledOf = (g: Grid) => {
  const c = compileGrid(g);
  if (!c.ok) throw new Error(JSON.stringify(c.error));
  return c.value;
};

describe('no wall stands between two pieces of open air', () => {
  const grid = compiledOf(PLOT);

  it('puts no wall where the patio meets the lawn', () => {
    // Two DIFFERENT rooms touching, which is the exact condition that makes a
    // wall everywhere else in this compiler. The outdoor rule is the one
    // exception, and this is it.
    const between = grid.walls.filter(
      (w) => new Set(w.sides).size === 2 && w.sides.includes('patio') && w.sides.includes('lawn'),
    );
    expect(between).toEqual([]);
  });

  it('puts no wall at the edge of the plot', () => {
    // Outdoor-to-nothing. Before the flag this was the definition of an
    // exterior wall, so a paved yard could only be drawn walled in.
    expect(grid.walls.filter((w) => w.sides.includes('lawn'))).toEqual([]);
    expect(grid.walls.filter((w) => w.sides.includes('patio') && w.sides.includes('outside'))).toEqual([]);
  });

  it("still puts the house's back wall between the patio and the kitchen", () => {
    // The half that must NOT change. One side is open air and the other is a
    // room, so the wall is real — and it is the wall the back door goes in.
    const back = grid.walls.filter((w) => w.sides.includes('patio') && w.sides.includes('kitchen'));
    expect(back.length).toBeGreaterThan(0);
  });

  it('and a door in that wall compiles', () => {
    const c = compileGrid(PLOT, {
      openings: [{ kind: 'door', cell: [2, 1], side: 'back', swing: 'in', between: ['kitchen', 'patio'] }],
    });
    expect(c.ok).toBe(true);
  });
});

describe('nothing is built over open air', () => {
  it('leaves outdoor cells out of the footprint the roof sits on', () => {
    const grid = compiledOf(PLOT);
    // Four rows of plot, two rows of house. The outline is the house's.
    expect(grid.footprint.bbox.z1 - grid.footprint.bbox.z0).toBeCloseTo(2 * CELL, 9);
  });

  it('falls back to the whole plot when there is no building at all', () => {
    // A plan that is only a garden has no outline of its own to take, and the
    // alternative to a fallback is Math.min of an empty list — Infinity, and a
    // roof mesh made of NaN.
    const grid = compiledOf([[L, L]]);
    expect(Number.isFinite(grid.footprint.bbox.x0)).toBe(true);
    expect(grid.footprint.bbox.x1 - grid.footprint.bbox.x0).toBeCloseTo(2 * CELL, 9);
  });

  it('roofs the house and not the yard', () => {
    // uncoveredRects is what decides where gables go. Every rectangle it
    // returns must be inside the built rows (2 and 3).
    const rects = uncoveredRects(PLOT, null);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.filter((r) => r.r0 < 2)).toEqual([]);
  });

  it('because roofing reads the building, which is the plot minus its open air', () => {
    const building = roofed(PLOT);
    expect(building[0].every((b) => b === building[0][0])).toBe(true); // the lawn row is now empty
    expect(uncoveredRects(PLOT, null)).toEqual(uncoveredRects(building, null));
  });
});

describe('an outdoor room is a place, not a hole', () => {
  const grid = compiledOf(PLOT);

  it('is a room with a name in every language', () => {
    const patio = grid.rooms.find((r) => r.key === 'patio');
    expect(patio?.labels.es.name).toBe('the patio');
    expect(patio?.outdoor).toBe(true);
    expect(patio?.floor.length).toBe(3);
  });

  it('marks only the outdoor ones', () => {
    expect(grid.rooms.find((r) => r.key === 'kitchen')?.outdoor).toBeUndefined();
  });

  it('counts as reachable without a door into it', () => {
    // The reachability check walks doors and stairs out from 'outside'. A patio
    // has no door — you walk onto it — so without the link an honest plan gets
    // told a storey is unreachable for having no door into a place with no
    // walls. Here the ONLY route to the kitchen is the back door from the
    // patio, so the whole house hangs off that link.
    const plan: readonly Storey[] = [
      {
        level: 0,
        grid: PLOT,
        openings: [{ kind: 'door', cell: [2, 1], side: 'back', swing: 'in', between: ['kitchen', 'patio'] }],
      },
    ];
    const c = compileHouse(plan);
    expect(c.ok).toBe(true);
  });
});
