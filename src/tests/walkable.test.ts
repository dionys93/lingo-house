// src/tests/walkable.test.ts
//
// Can you actually get there?
//
// This is the test the house was missing, and its absence shipped a real bug:
// a rug and a sofa between them sealed the living room off from the kitchen,
// and nothing failed. Every other test here checks that the compiler emits the
// right NUMBERS; none of them asked whether a person could cross the result.
//
// It works by flood-filling each storey with the SAME function the walker uses.
// `slide` is what WalkControls calls every frame, so an edge is traversable here
// exactly when it is traversable in the app — no second model of movement that
// could agree with the first while both are wrong. If this passes and you still
// get stuck, `slide` is the bug, not the fixture.
//
// Doors are treated as OPEN: they open on click, so "reachable" means reachable
// to someone willing to open the doors on the way. Windows are never open.

import { describe, it, expect } from 'vitest';
import { compileGrid } from '../core/house/grid';
import { compileHouse } from '../core/house/house';
import { houseFor } from '../content/house';
import { MONTHS } from '../core/house/month';
import { blockersFor, slide, type Segment2, type Vec2 } from '../core/house/collide';
import { stairwellOf } from '../core/house/collide';
import { CELL } from '../core/house/scale';
import { type Grid, type ItemDef, type ItemKind } from '../core/house/blocks';
import { room } from './support';

// The walker, as the app configures it. Kept in step with WalkControls by the
// assertion below rather than by hope.
const RADIUS = 0.18;
const BODY = { floorY: 0, stepOver: 0.09, headY: 0.7 };
const STEP = 0.1; // 200 mm sample grid — finer than the body, coarser than the wall

// One lattice for everything. The fill and the room lookup MUST agree on it —
// starting the fill at a tile centre (…0.25) while looking rooms up on a
// rounded grid (…0.20) means the two never meet and every room reads as
// unreachable, including the one you started in.
const snap = (v: number) => Math.round(v / STEP) * STEP;
const key = (p: Vec2) => `${snap(p[0]).toFixed(2)},${snap(p[1]).toFixed(2)}`;

/** Every point you can reach from `start`, walking the way the app walks. */
function reachable(start: Vec2, blockers: readonly Segment2[], bounds: readonly number[]): Set<string> {
  const [x0, z0, x1, z1] = bounds as [number, number, number, number];
  const seen = new Set<string>([key(start)]);
  const queue: Vec2[] = [start];
  while (queue.length > 0) {
    const at = queue.pop();
    if (at === undefined) break;
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const) {
      const to: Vec2 = [at[0] + dx, at[1] + dz];
      if (to[0] < x0 || to[0] > x1 || to[1] < z0 || to[1] > z1) continue;
      if (seen.has(key(to))) continue;
      // Did the move actually land where it was aimed? `slide` returns the
      // resolved position, so a blocked step comes back short.
      const got = slide(at, to, blockers, RADIUS);
      if (Math.hypot(got[0] - to[0], got[1] - to[1]) > STEP * 0.25) continue;
      seen.add(key(to));
      queue.push(to);
    }
  }
  return seen;
}

const compiled = compileHouse(houseFor(MONTHS[0]));

describe('the authored house is walkable', () => {
  it('compiles at all', () => {
    expect(compiled.ok).toBe(true);
  });

  if (!compiled.ok) return;
  const house = compiled.value;

  for (const storey of house.storeys) {
    const allDoors = new Set(storey.grid.openings.filter((o) => o.kind === 'door').map((o) => o.id));
    const blockers = [
      ...blockersFor(storey.grid.walls, storey.grid.openings, storey.grid.items.map((i) => i.bounds), allDoors, {
        ...BODY,
        floorY: storey.baseY,
      }),
      ...house.stairs
        .filter((st) => st.level === storey.level || st.level + 1 === storey.level)
        .flatMap((st) => stairwellOf(st.treads, CELL)),
    ];
    const b = storey.grid.footprint.bbox;
    const bounds = [b.x0, b.z0, b.x1, b.z1];

    // Start from open floor, which is NOT simply the first tile of the biggest
    // room: the living room's first cell is the one under the staircase, and a
    // fill started inside the stairwell box reaches sixteen samples and stops.
    // A tile counts as open when you can actually step off it in all four
    // directions.
    const stepsOff = (p: Vec2) =>
      ([[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const).every(([dx, dz]) => {
        const to: Vec2 = [p[0] + dx, p[1] + dz];
        const got = slide(p, to, blockers, RADIUS);
        return Math.hypot(got[0] - to[0], got[1] - to[1]) <= STEP * 0.25;
      });

    const biggest = [...storey.grid.rooms].sort((p, q) => q.cells.length - p.cells.length)[0];
    const openTile = biggest.floor
      .map((t): Vec2 => [snap(t[0]), snap(t[2])])
      .find(stepsOff);
    const start: Vec2 = openTile ?? [snap(biggest.floor[0][0]), snap(biggest.floor[0][2])];
    const seen = reachable(start, blockers, bounds);

    it(`level ${String(storey.level)}: every room is reachable from ${biggest.key}`, () => {
      const unreachable = storey.grid.rooms
        .filter((room) => {
          // A room counts as reached if ANY of its floor tiles was visited.
          // Asking for one specific tile would fail on a tile that happens to
          // sit under the wardrobe.
          return !room.floor.some((tile) => seen.has(key([tile[0], tile[2]])));
        })
        .map((room) => room.key);
      expect(unreachable).toEqual([]);
    });

    it(`level ${String(storey.level)}: furniture leaves a route, not just a room`, () => {
      // Sanity that the fill did real work rather than dying at the start —
      // a storey this size has thousands of standable samples.
      expect(seen.size).toBeGreaterThan(300);
    });
  }
});

// ── The rule itself, pinned ─────────────────────────────────────────────────
//
// The house above is now roomy enough that a rug can't seal it whatever the
// rule says, so passing there does NOT prove the height test works. This pair
// does: one doorway, one item standing in it, and the only difference between
// the two cases is how tall that item is.

describe('what counts as an obstacle is decided by height', () => {
  const K = room('kitchen', 'Kitchen');
  const L = room('livingRoom', 'Living Room');
  // Two rooms, three rows deep, one door on the boundary between them.
  const GRID: Grid = [
    [K, K, L, L],
    [K, K, L, L],
    [K, K, L, L],
  ];
  const DOOR = { kind: 'door', cell: [1, 1], side: 'right', swing: 'in' } as const;

  const crossing = (kind: ItemKind) => {
    // Pushed up against the doorway from the kitchen side, its face flush with
    // the wall, so it covers the opening while staying in one room. Dead centre
    // ON the boundary is what this used to do, and the compiler now rejects it
    // as ItemOutsideRoom — correctly, since that is an item inside a wall.
    const items: readonly ItemDef[] = [
      { id: 'x', kind, mount: { on: 'floor', cell: [1, 1], facing: 's', offset: [-0.02, 0] } },
    ];
    const c = compileGrid(GRID, { openings: [DOOR], items });
    if (!c.ok) throw new Error(`fixture did not compile: ${JSON.stringify(c.error)}`);
    const g = c.value;
    const doorIds = new Set(g.openings.filter((o) => o.kind === 'door').map((o) => o.id));
    expect(doorIds.size).toBe(1);
    const blockers = blockersFor(g.walls, g.openings, g.items.map((i) => i.bounds), doorIds, BODY);

    // Coordinates come from the COMPILED door, not from arithmetic on cell
    // indices: compileGrid centres the plan on the origin, so a hand-computed
    // "x = 1.25" lands outside the house entirely and every walk reads as
    // blocked — by nothing.
    const door = g.openings.find((o) => o.kind === 'door');
    if (door === undefined) throw new Error('no door');
    const mid: Vec2 = [(door.a[0] + door.b[0]) / 2, (door.a[2] + door.b[2]) / 2];
    const from: Vec2 = [mid[0] - 0.3, mid[1]];
    const to: Vec2 = [mid[0] + 0.3, mid[1]];
    const got = slide(from, to, blockers, RADIUS);
    return got[0] > mid[0]; // did we actually get through to the far side?
  };

  it('walks over a rug lying across the doorway', () => {
    expect(crossing('rug')).toBe(true);
  });

  it('but not through a table standing in the same spot', () => {
    expect(crossing('table')).toBe(false);
  });
});
