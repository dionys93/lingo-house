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
import { compileHouse, houseExtent } from '../core/house/house';
import { gridFrame } from '../core/house/frame';
import { houseFor } from '../content/house';
import { MONTHS } from '../core/house/month';
import { blockersFor, blockingFootprint, canStand, nearestStandable, obstructs, slide, stairwellBox, type Box2, type Segment2, type Vec2 } from '../core/house/collide';
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

/**
 * Every point you can reach from `start`, walking the way the app walks.
 *
 * Every candidate is SNAPPED before use, so the fill lands on exact multiples
 * of STEP and its keys can be compared with a sweep of the same lattice.
 * Stepping by raw addition instead lets error accumulate until `Math.round(1.25
 * / 0.1)` comes out 12 here and 13 there — two names for one place, which reads
 * as an unreachable tile that is standing right where you are.
 */
function reachable(start: Vec2, blockers: readonly Segment2[], bounds: readonly number[]): Set<string> {
  const [x0, z0, x1, z1] = bounds as [number, number, number, number];
  const seen = new Set<string>([key(start)]);
  const queue: Vec2[] = [start];
  while (queue.length > 0) {
    const at = queue.pop();
    if (at === undefined) break;
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as const) {
      const to: Vec2 = [snap(at[0] + dx), snap(at[1] + dz)];
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

/** Every point on the same lattice that a body could legally occupy. */
function standable(
  bbox: { x0: number; z0: number; x1: number; z1: number },
  blockers: readonly Segment2[],
  solids: readonly Box2[],
): Vec2[] {
  const out: Vec2[] = [];
  for (let x = snap(bbox.x0); x <= bbox.x1; x = snap(x + STEP)) {
    for (let z = snap(bbox.z0); z <= bbox.z1; z = snap(z + STEP)) {
      const p: Vec2 = [x, z];
      if (canStand(p, blockers, solids, RADIUS)) out.push(p);
    }
  }
  return out;
}

const PLAN = houseFor(MONTHS[0]);
const compiled = compileHouse(PLAN);

// THE PLOT, not the building. `footprint.bbox` is the outline the roof sits on,
// which is what it should be and is no longer the area you can walk: the patio
// and the garden are rooms outside it. A fill bounded by the building can't
// reach them, and — the part that would have been silently wrong — can't walk
// around the outside of the house either, which is one of the two ways to the
// patio.
const EXTENT = houseExtent(PLAN);
const PLOT = (() => {
  const f = gridFrame(EXTENT.rows, EXTENT.cols);
  return { x0: f.xAt(0), x1: f.xAt(EXTENT.cols), z0: f.zAt(0), z1: f.zAt(EXTENT.rows) };
})();

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
    const b = PLOT;
    const bounds = [b.x0, b.z0, b.x1, b.z1];

    // The interiors, for `canStand` — see collide.ts. Built exactly as the shell
    // builds them, so this test and the app agree on what standable means.
    const bodyHere = { ...BODY, floorY: storey.baseY };
    const solids: readonly Box2[] = [
      ...storey.grid.items
        .filter((i) => obstructs(i.bounds, bodyHere))
        .map((i) => blockingFootprint(i.bounds)),
      ...house.stairs
        .filter((st) => st.level === storey.level || st.level + 1 === storey.level)
        .map((st) => stairwellBox(st.treads, CELL))
        .filter((b): b is Box2 => b !== null),
    ];

    // Start from open floor, which is NOT simply the first tile of the biggest
    // room: the living room's first cell is the one under the staircase, and a
    // fill started inside the stairwell box reaches sixteen samples and stops.
    // `canStand` is the core's own definition of a legal position — this used to
    // carry a local copy of the same idea, which is one definition too many.
    const biggest = [...storey.grid.rooms].sort((p, q) => q.cells.length - p.cells.length)[0];
    const openTile = biggest.floor
      .map((t): Vec2 => [snap(t[0]), snap(t[2])])
      .find((p) => canStand(p, blockers, solids, RADIUS));
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

    // The assertion the sofa bug needed, and the one "every room is reachable"
    // cannot make: a room stays reachable while most of it is sealed off, because
    // one tile inside its doorway counts for the whole room. This asks about every
    // POINT instead, at the same 100mm resolution the fill walks.
    //
    // Scope is every point a body could legally occupy — `canStand`, the core's
    // own definition, the same one the walker's rescue uses. A point under the bed
    // is not standable and is not asked about; a point in the open behind the
    // dining table is, and if the fill never got there, something is walled in.
    //
    // Restricted to points inside a room so the garden doesn't count. The house
    // has one exterior door and the fill opens it, so without this the whole
    // lawn is in scope and every assertion is about grass.
    it(`level ${String(storey.level)}: every point you can stand on can be walked to`, () => {
      const inRoom = (p: Vec2) =>
        storey.grid.rooms.some((r) =>
          r.floor.some((t) => Math.abs(t[0] - p[0]) <= CELL / 2 && Math.abs(t[2] - p[1]) <= CELL / 2),
        );
      const stranded = standable(b, blockers, solids)
        .filter(inRoom)
        .filter((p) => !seen.has(key(p)));
      // Named by position, because a bare count tells you a room is walled in
      // without telling you which end of which room to go and look at.
      expect(stranded.map((p) => `[${p[0].toFixed(2)}, ${p[1].toFixed(2)}]`)).toEqual([]);
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

// ── Recovery, against the real house ────────────────────────────────────────
//
// The synthetic cases live in collide.test.ts. This asks the same question of
// the actual authored plan, because the numbers that matter — how wide a bed
// is against how wide a walker is — are content, not fixtures.

describe('a walker caught inside the furniture can be got out', () => {
  const compiledHouse = compileHouse(houseFor(MONTHS[0]));

  it('compiles', () => {
    expect(compiledHouse.ok).toBe(true);
  });

  if (!compiledHouse.ok) return;
  const house = compiledHouse.value;
  const storey = house.storeys[0];
  const bodyHere = { floorY: storey.baseY, stepOver: 0.09, headY: 0.7 };
  const blockers = blockersFor(
    storey.grid.walls,
    storey.grid.openings,
    storey.grid.items.map((i) => i.bounds),
    new Set(storey.grid.openings.filter((o) => o.kind === 'door').map((o) => o.id)),
    bodyHere,
  );
  const solids: readonly Box2[] = storey.grid.items
    .filter((i) => obstructs(i.bounds, bodyHere))
    .map((i) => blockingFootprint(i.bounds));

  // The sofa: two cells wide, and the widest thing on the ground floor a body
  // can be lost inside.
  const sofa = storey.grid.items.find((i) => i.kind === 'sofa');

  it('has a sofa to be caught in', () => {
    expect(sofa).toBeDefined();
  });

  if (sofa === undefined) return;
  const middle: Vec2 = [
    (sofa.bounds.min[0] + sofa.bounds.max[0]) / 2,
    (sofa.bounds.min[2] + sofa.bounds.max[2]) / 2,
  ];

  it('knows the middle of the sofa is not somewhere you can be', () => {
    expect(canStand(middle, blockers, solids, RADIUS)).toBe(false);
  });

  it('and the segments alone would NOT have known', () => {
    // The whole reason `solids` exists, restated in the authored geometry
    // rather than in a fixture.
    expect(canStand(middle, blockers, [], RADIUS)).toBe(true);
  });

  it('puts you somewhere legal, nearby', () => {
    const out = nearestStandable(middle, blockers, solids, RADIUS);
    expect(out).not.toBeNull();
    if (out) {
      expect(canStand(out, blockers, solids, RADIUS)).toBe(true);
      expect(Math.hypot(out[0] - middle[0], out[1] - middle[1])).toBeLessThan(1.0);
    }
  });
});
