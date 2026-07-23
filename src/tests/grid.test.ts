// src/tests/grid.test.ts
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
import { defineRoom, EMPTY } from '../core/blocks';
import { compileGrid, consecutiveRanges, CELL, WALL_HEIGHT } from '../core/grid';
import type { HouseError } from '../core/errors';
import type { Result } from '../core/result';

const K = defineRoom({ key: 'kitchen', name: 'Kitchen', color: '#d4d4d4' });
const L = defineRoom({ key: 'livingRoom', name: 'Living Room' });
const _ = EMPTY;

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
    const K2 = defineRoom({ key: 'kitchen', name: 'Kitchen' });
    const g = unwrap(compileGrid([[K, K2]]));
    expect(g.rooms.map((r) => r.key)).toEqual(['kitchen']);
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

  it('a lone cell places its four walls at ±CELL/2, spanning the cell, height WALL_HEIGHT', () => {
    const q = 0.25; // CELL / 2 at CELL = 0.5
    const h = 1.2; // WALL_HEIGHT
    const expected = [
      { axis: 'z', a: [-q, 0, -q], b: [-q, 0, q], height: h, sides: ['outside', 'kitchen'] }, // west
      { axis: 'z', a: [q, 0, -q], b: [q, 0, q], height: h, sides: ['kitchen', 'outside'] }, // east
      { axis: 'x', a: [-q, 0, -q], b: [q, 0, -q], height: h, sides: ['outside', 'kitchen'] }, // back
      { axis: 'x', a: [-q, 0, q], b: [q, 0, q], height: h, sides: ['kitchen', 'outside'] }, // front
    ];
    const { walls } = unwrap(compileGrid([[K]]));
    expect(walls.map(wallKey).sort()).toEqual(expected.map(wallKey).sort());
  });

  it('coordinate oracle assumes CELL=0.5 and WALL_HEIGHT=1.2', () => {
    // Tripwire: if either constant is retuned, the ± values in the test above
    // must be updated. This fails first, loudly, to point you there.
    expect(CELL).toBe(0.5);
    expect(WALL_HEIGHT).toBe(1.2);
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
    const O = defineRoom({ key: 'outside', name: 'Nope' });
    expect(errorsOf(compileGrid([[O]]))).toContainEqual({ tag: 'ReservedRoomKey', key: 'outside' });
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