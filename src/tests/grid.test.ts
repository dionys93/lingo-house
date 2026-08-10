// src/core/grid.test.ts
//
// Slice 1's guardrail: the grid → geometry contract as a table of
// (grid) → (rooms + walls) or (errors). `compileGrid` is the innermost pure
// function of the core — no I/O, no React, no three — so every row here is a
// plain value assertion. This file is written BEFORE grid.ts exists (red first);
// grid.ts is "done" when the whole file is green.
//
// The contract this file pins down:
//   compileGrid(grid: Grid): Result<CompiledGrid, readonly HouseError[]>
//   CompiledGrid = { rooms: readonly CompiledRoom[]; walls: readonly CompiledWall[] }
//   CompiledRoom has at least `.key`
//   CompiledWall has `.sides: readonly [RoomKey | 'outside', RoomKey | 'outside']`
//
// Wall-counting convention under test — collinear edges merge into ONE run only
// when they share the SAME pair of sides. So [[K,K]] has 4 exterior walls (two
// 2-cell runs + two 1-cell ends), not 6. But [[K,L]] keeps its two north edges
// separate, because their inner rooms differ (K vs L) and a wall must have a
// single room per side (that's what lets the factory colour each face). A wall
// is EXTERIOR if one side is 'outside', INTERIOR if both sides are rooms.
//
// Deliberately NOT asserted at this slice: exact world coordinates of walls
// (a/b endpoints, sizes). Those depend on the origin-centering convention we fix
// when writing grid.ts; slice 1 is about topology — how many walls, of what
// kind, between which rooms.

import { describe, it, expect } from 'vitest';
import { _ } from '../core/blocks';
import { room } from './support';
import { compileGrid, consecutiveRanges, CELL, WALL_HEIGHT, WALL_THICKNESS } from '../core/grid';
import type { HouseError } from '../core/errors';
import type { Result } from '../core/result';

const K = room('kitchen', 'Kitchen', '#d4d4d4');
const L = room('livingRoom', 'Living Room');

// ── assertion helpers (strict-safe: no `!`, no bare indexing) ────────────────
function unwrap<T>(r: Result<T, readonly HouseError[]>): T {
  if (!r.ok) throw new Error(`expected Ok, got errors: ${JSON.stringify(r.error)}`);
  return r.value;
}
function errorsOf<T>(r: Result<T, readonly HouseError[]>): readonly HouseError[] {
  if (r.ok) throw new Error('expected Err, got Ok');
  return r.error;
}
function assertDefined<T>(x: T | undefined, msg: string): T {
  if (x === undefined) throw new Error(msg);
  return x;
}

type WallLike = { readonly sides: readonly string[] };
const exterior = (walls: readonly WallLike[]) =>
  walls.filter((w) => w.sides.includes('outside')).length;
const interior = (walls: readonly WallLike[]) =>
  walls.filter((w) => !w.sides.includes('outside')).length;

// Canonical string for a wall. a/b are left in emitted order (not sorted), so a
// swapped-endpoint bug changes the string; the whole set is compared unordered.
const wallKey = (w: {
  readonly axis: string;
  readonly a: readonly number[];
  readonly b: readonly number[];
  readonly height: number;
  readonly sides: readonly string[];
}) => JSON.stringify([w.axis, w.a, w.b, w.height, w.sides]);

describe('compileGrid — rooms & merging', () => {
  it('a single cell is one room', () => {
    const g = unwrap(compileGrid([[K]]));
    expect(g.rooms.map((r) => r.key)).toEqual(['kitchen']);
  });

  it('same-room cells side-by-side merge into one room', () => {
    const g = unwrap(compileGrid([[K, K]]));
    expect(g.rooms.map((r) => r.key)).toEqual(['kitchen']);
  });

  it('same-room cells top-to-bottom merge into one room', () => {
    const g = unwrap(compileGrid([[K], [K]]));
    expect(g.rooms.map((r) => r.key)).toEqual(['kitchen']);
  });

  it('two different rooms stay separate', () => {
    const g = unwrap(compileGrid([[K, L]]));
    expect(g.rooms.map((r) => r.key).sort()).toEqual(['kitchen', 'livingRoom']);
  });

  it('room identity is by key, not object reference', () => {
    // Two distinct defineRoom objects sharing a key are the SAME room — the key
    // is the identity the rest of the system (doors' `between`, labels) uses.
    const K2 = room('kitchen', 'Kitchen');
    const g = unwrap(compileGrid([[K, K2]]));
    expect(g.rooms.map((r) => r.key)).toEqual(['kitchen']);
  });

  it('a room floor has one world-space tile centre per cell', () => {
    const g = unwrap(compileGrid([[K, K]]));
    const kitchen = assertDefined(
      g.rooms.find((r) => r.key === 'kitchen'),
      'expected a kitchen room',
    );
    const asKey = (v: readonly number[]) => v.join(',');
    expect(kitchen.floor.map(asKey).sort()).toEqual(['-0.25,0,0', '0.25,0,0'].sort());
  });
});

describe('compileGrid — walls (merged runs, two-sided)', () => {
  it('a lone cell has 4 exterior walls, no interior walls', () => {
    const { walls } = unwrap(compileGrid([[K]]));
    expect(exterior(walls)).toBe(4);
    expect(interior(walls)).toBe(0);
  });

  it('a 1x2 merged room has 4 exterior walls (long sides merge), no interior wall', () => {
    const { walls } = unwrap(compileGrid([[K, K]]));
    expect(exterior(walls)).toBe(4);
    expect(interior(walls)).toBe(0);
  });

  it('a 2x1 merged room has 4 exterior walls', () => {
    const { walls } = unwrap(compileGrid([[K], [K]]));
    expect(exterior(walls)).toBe(4);
    expect(interior(walls)).toBe(0);
  });

  it('a 2x2 merged room has 4 exterior walls', () => {
    const { walls } = unwrap(
      compileGrid([
        [K, K],
        [K, K],
      ]),
    );
    expect(exterior(walls)).toBe(4);
    expect(interior(walls)).toBe(0);
  });

  it('two adjacent rooms share exactly one interior wall carrying both rooms', () => {
    const { walls } = unwrap(compileGrid([[K, L]]));
    expect(interior(walls)).toBe(1);
    const wall = assertDefined(
      walls.find((w) => !w.sides.includes('outside')),
      'expected an interior wall between the two rooms',
    );
    expect(new Set(wall.sides)).toEqual(new Set(['kitchen', 'livingRoom']));
  });

  it('collinear exterior edges of DIFFERENT rooms do not merge', () => {
    // [[K,L]] north side is two edges (outside|K and outside|L). Different inner
    // rooms → they stay separate, so each room keeps 3 exterior walls = 6 total.
    // (Merging would leave the wall's inner face split between two rooms, which
    // breaks per-room interior colouring — hence the rule.)
    const { walls } = unwrap(compileGrid([[K, L]]));
    expect(exterior(walls)).toBe(6);
  });

  it('a lone cell places its four walls, extended by half-thickness at the corners', () => {
    const q = 0.25; // CELL / 2 at CELL = 0.5
    const t = WALL_THICKNESS / 2; // corners extend by this so perpendicular walls overlap
    const h = 1.2; // WALL_HEIGHT
    // Fixed axis stays at ±q; the RUN axis extends ±t at each end, since both ends
    // of every wall of a lone cell are corners.
    const expected = [
      { axis: 'z', a: [-q, 0, -q - t], b: [-q, 0, q + t], height: h, sides: ['outside', 'kitchen'] }, // west
      { axis: 'z', a: [q, 0, -q - t], b: [q, 0, q + t], height: h, sides: ['kitchen', 'outside'] }, // east
      { axis: 'x', a: [-q - t, 0, -q], b: [q + t, 0, -q], height: h, sides: ['outside', 'kitchen'] }, // back
      { axis: 'x', a: [-q - t, 0, q], b: [q + t, 0, q], height: h, sides: ['kitchen', 'outside'] }, // front
    ];
    const { walls } = unwrap(compileGrid([[K]]));
    expect(walls.map(wallKey).sort()).toEqual(expected.map(wallKey).sort());
  });

  it('coordinate oracle assumes CELL=0.5, WALL_HEIGHT=1.2, WALL_THICKNESS=0.08', () => {
    // Tripwire: if any of these constants is retuned, the ± values in the test
    // above must be updated. This fails first, loudly, to point you there.
    expect(CELL).toBe(0.5);
    expect(WALL_HEIGHT).toBe(1.2);
    expect(WALL_THICKNESS).toBe(0.08);
  });
});

describe('compileGrid — baseY lifts a whole storey', () => {
  it('offsets walls, room bounds, floor tiles, and the footprint by baseY', () => {
    const B = 3; // a storey lifted 3 units (basement would be negative)
    const { walls, rooms, footprint } = unwrap(compileGrid([[K]], { baseY: B }));
    for (const w of walls) {
      expect(w.a[1]).toBe(B); // base moves…
      expect(w.b[1]).toBe(B);
      expect(w.height).toBe(WALL_HEIGHT); // …height does not
    }
    const kitchen = rooms.find((r) => r.key === 'kitchen');
    expect(kitchen).toBeDefined();
    if (kitchen) {
      expect(kitchen.bounds.min[1]).toBe(B);
      expect(kitchen.bounds.max[1]).toBe(B + WALL_HEIGHT);
      for (const centre of kitchen.floor) expect(centre[1]).toBe(B);
    }
    expect(footprint.wallTopY).toBe(B + WALL_HEIGHT);
  });

  it('defaults to baseY 0 — on the ground', () => {
    const { walls, footprint } = unwrap(compileGrid([[K]]));
    for (const w of walls) expect(w.a[1]).toBe(0);
    expect(footprint.wallTopY).toBe(WALL_HEIGHT);
  });

  it('footprint bbox is the world X/Z outline, independent of baseY', () => {
    const q = 0.25;
    const { footprint } = unwrap(compileGrid([[K]], { baseY: 9 }));
    expect(footprint.bbox).toEqual({ x0: -q, x1: q, z0: -q, z1: q });
  });
});

describe('compileGrid — grid errors', () => {
  it('an empty grid is an error', () => {
    expect(errorsOf(compileGrid([]))).toContainEqual({ tag: 'EmptyGrid' });
  });

  it('a grid of only empty cells is an error', () => {
    expect(
      errorsOf(
        compileGrid([
          [_, _],
          [_, _],
        ]),
      ),
    ).toContainEqual({ tag: 'EmptyGrid' });
  });

  // NOTE: the two DisconnectedRoom cases depend on open question (A). If we later
  // allow multiple buildings / same-name rooms, these expectations change.
  it('same room in two diagonally-touching blobs is disconnected', () => {
    const errs = errorsOf(
      compileGrid([
        [K, _],
        [_, K],
      ]),
    );
    expect(errs).toContainEqual({ tag: 'DisconnectedRoom', room: 'kitchen', regions: 2 });
  });

  it('same room split by another room is disconnected', () => {
    const errs = errorsOf(compileGrid([[K, L, K]]));
    expect(errs).toContainEqual({ tag: 'DisconnectedRoom', room: 'kitchen', regions: 2 });
  });

  it("a room keyed 'outside' is a reserved-key error", () => {
    const O = room('outside', 'Nope');
    expect(errorsOf(compileGrid([[O]]))).toContainEqual({ tag: 'ReservedRoomKey', key: 'outside' });
  });
});

describe('compileGrid — openings', () => {
  it('a door claims its edge and splits the wall run around it', () => {
    const plain = unwrap(compileGrid([[K, K, K]]));
    const withDoor = unwrap(
      compileGrid([[K, K, K]], { openings: [{ kind: 'door', cell: [0, 1], side: 'front', swing: 'out' }] }),
    );
    expect(withDoor.openings).toHaveLength(1);
    expect(withDoor.openings[0]?.kind).toBe('door');
    // the 3-cell front wall (one run) becomes two runs around the gap → +1 wall
    expect(withDoor.walls.length).toBe(plain.walls.length + 1);
  });

  it('an interior door carries both room keys', () => {
    const g = unwrap(
      compileGrid([[K, L]], { openings: [{ kind: 'door', cell: [0, 0], side: 'right', swing: 'in' }] }),
    );
    const door = assertDefined(g.openings[0], 'expected a door');
    expect(new Set(door.sides)).toEqual(new Set(['kitchen', 'livingRoom']));
  });

  it('rejects a door on a same-room seam (no wall there)', () => {
    const errs = errorsOf(
      compileGrid([[K, K]], { openings: [{ kind: 'door', cell: [0, 0], side: 'right', swing: 'in' }] }),
    );
    expect(errs).toContainEqual({ tag: 'OpeningNotOnWall', cell: [0, 0], side: 'right' });
  });

  // Regression: the bounds test read `c < 0` with no upper check, so a door past
  // the last COLUMN fell through to keyAt → 'outside' and was reported as
  // OpeningCellEmpty. Wrong diagnosis for a real mistake; the unused `C`
  // parameter was the compiler pointing straight at it.
  it('rejects a door off the grid — past the last column, not just the last row', () => {
    const off = (cell: readonly [number, number]) =>
      errorsOf(compileGrid([[K, K]], { openings: [{ kind: 'door', cell, side: 'front', swing: 'out' }] }));
    expect(off([0, 5])).toContainEqual({ tag: 'OpeningCellOutOfBounds', cell: [0, 5] });
    expect(off([5, 0])).toContainEqual({ tag: 'OpeningCellOutOfBounds', cell: [5, 0] });
  });

  it('rejects a door on an empty cell', () => {
    const errs = errorsOf(
      compileGrid([[K, _]], { openings: [{ kind: 'door', cell: [0, 1], side: 'front', swing: 'out' }] }),
    );
    expect(errs).toContainEqual({ tag: 'OpeningCellEmpty', cell: [0, 1] });
  });

  it('rejects a `between` that does not match the edge', () => {
    const errs = errorsOf(
      compileGrid(
        [[K, L]],
        {
          openings: [
            { kind: 'door', cell: [0, 0], side: 'right', swing: 'in', between: ['kitchen', 'bathroom'] },
          ],
        },
      ),
    );
    expect(errs.some((e) => e.tag === 'OpeningConnectsWrongRooms')).toBe(true);
  });

  it('rejects two openings on the same edge', () => {
    const errs = errorsOf(
      compileGrid(
        [[K, L]],
        {
          openings: [
            { kind: 'door', cell: [0, 0], side: 'right', swing: 'in' },
            { kind: 'window', cell: [0, 1], side: 'left', sill: 0.3, head: 0.9 },
          ],
        },
      ),
    );
    expect(errs.some((e) => e.tag === 'OpeningsOverlap')).toBe(true);
  });

  it('rejects a window whose sill is above its head', () => {
    const errs = errorsOf(
      compileGrid([[K]], { openings: [{ kind: 'window', cell: [0, 0], side: 'front', sill: 0.9, head: 0.3 }] }),
    );
    expect(errs).toContainEqual({
      tag: 'WindowSillAboveHead',
      cell: [0, 0],
      side: 'front',
      sill: 0.9,
      head: 0.3,
    });
  });

  it('accepts a valid window and emits its sill and head', () => {
    const g = unwrap(
      compileGrid([[K]], { openings: [{ kind: 'window', cell: [0, 0], side: 'front', sill: 0.3, head: 0.9 }] }),
    );
    const win = assertDefined(g.openings[0], 'expected a window');
    expect(win.kind).toBe('window');
    if (win.kind === 'window') {
      expect(win.sill).toBe(0.3);
      expect(win.head).toBe(0.9);
    }
  });
});

describe('consecutiveRanges', () => {
  it('merges a fully consecutive run', () => {
    expect(consecutiveRanges([0, 1, 2])).toEqual([[0, 2]]);
  });
  it('splits at a gap', () => {
    expect(consecutiveRanges([0, 2])).toEqual([
      [0, 0],
      [2, 2],
    ]);
  });
  it('handles multiple runs', () => {
    expect(consecutiveRanges([0, 1, 3, 4, 7])).toEqual([
      [0, 1],
      [3, 4],
      [7, 7],
    ]);
  });
  it('is empty for empty input', () => {
    expect(consecutiveRanges([])).toEqual([]);
  });
  it('handles a singleton', () => {
    expect(consecutiveRanges([5])).toEqual([[5, 5]]);
  });
});