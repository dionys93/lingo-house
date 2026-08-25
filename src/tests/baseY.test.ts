// src/tests/baseY.test.ts
//
// The storey-offset oracle.
//
// Enumerating the Y fields by hand is how the gap got in: window sill/head were
// passed through unoffset for as long as baseY existed, because nothing checked
// them. So this doesn't enumerate. It compiles the SAME house twice, at y=0 and
// at y=B, walks both results in lockstep, and asserts of every single number:
// it either stayed identical (a length, an extent, an X or Z) or moved by
// exactly B (a Y). Nothing else is allowed.
//
// That makes the test total over the compiled shape: any field added later that
// forgets baseY fails here without anyone remembering to extend a list.

import { describe, it, expect } from 'vitest';
import { compileGrid, ITEM_SPECS, WALL_HEIGHT, type CompiledGrid } from '../core/house/grid';
import { _, type Grid, type ItemDef, type Opening } from '../core/house/blocks';
import { room } from './support';

const K = room('kitchen', 'Kitchen');
const L = room('livingRoom', 'Living Room');

// Deliberately exercises every emitting path at once: two rooms so there are
// interior AND exterior walls, a door, a window with a non-zero sill, an item on
// the floor, one mounted on it, and one hung on a wall.
const GRID: Grid = [
  [K, K, L],
  [K, _, L],
];

const OPENINGS: readonly Opening[] = [
  { kind: 'door', cell: [0, 1], side: 'right', swing: 'in', between: ['kitchen', 'livingRoom'] },
  { kind: 'window', cell: [0, 0], side: 'back', sill: 0.45, head: 0.95 },
];

const ITEMS: readonly ItemDef[] = [
  { id: 'tbl', kind: 'table', mount: { on: 'floor', cell: [0, 0] } },
  { id: 'lap', kind: 'laptop', mount: { on: 'item', host: 'tbl' } },
  { id: 'telly', kind: 'tv', mount: { on: 'wall', cell: [0, 0], side: 'back', height: 0.5 } },
];

const B = 1.2; // one storey up

const compileAt = (baseY: number): CompiledGrid => {
  const r = compileGrid(GRID, { openings: OPENINGS, items: ITEMS, baseY });
  if (!r.ok) throw new Error(`fixture failed to compile: ${JSON.stringify(r.error)}`);
  return r.value;
};

// Classifying every number as Y or not-Y is the whole game, and the DEFAULT
// MATTERS: an unknown scalar is assumed to be a Y and required to move. That way
// a Y field added later is checked automatically, and only a genuinely
// non-vertical scalar has to be declared below. The first version of this test
// defaulted the other way — "stayed put OR moved by baseY" — and let the window
// bug straight back through, because a sill that forgets the offset stays put.
//
// Structural cases first: a 3-number tuple is a Vec3, so index 1 is its Y and
// 0/2 are X and Z. A 2-number tuple is a [row, col] cell — no Y at all.
const FLAT_SCALARS = new Set([
  'height', // an EXTENT, not a position: a wall is not taller upstairs
  'yaw', // radians
  'x0', 'x1', 'z0', 'z1', // footprint bbox — horizontal
]);

type Leaf = { readonly path: string; readonly isY: boolean; readonly ground: number; readonly lifted: number };

function leaves(a: unknown, b: unknown, path = '', key = '', inVec3 = false, index = -1): readonly Leaf[] {
  if (typeof a === 'number' && typeof b === 'number') {
    const isY = inVec3 ? index === 1 : !FLAT_SCALARS.has(key);
    return [{ path, isY, ground: a, lifted: b }];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const numeric = a.length === 3 && a.every((v) => typeof v === 'number');
    const cell = a.length === 2 && a.every((v) => typeof v === 'number');
    return a.flatMap((v, i) =>
      cell
        ? [{ path: `${path}[${i}]`, isY: false, ground: v as number, lifted: b[i] as number }]
        : leaves(v, b[i], `${path}[${i}]`, key, numeric, i),
    );
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    return Object.keys(a as object).flatMap((k) =>
      leaves(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        `${path}.${k}`,
        k,
      ),
    );
  }
  return [];
}

describe('baseY sweeps the whole compiled storey', () => {
  const ground = compileAt(0);
  const lifted = compileAt(B);
  const all = leaves(ground, lifted);
  const show = (ls: readonly Leaf[]) => ls.map((l) => `${l.path}: ${l.ground} → ${l.lifted}`);

  it('finds numbers to check at all (guards against an empty walk)', () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.filter((l) => l.isY).length).toBeGreaterThan(20);
  });

  it('EVERY vertical number moves by exactly baseY', () => {
    // Naming the offenders matters more than the count: this message tells you
    // which field forgot the offset.
    expect(show(all.filter((l) => l.isY && Math.abs(l.lifted - (l.ground + B)) > 1e-9))).toEqual([]);
  });

  it('and nothing horizontal moves at all', () => {
    expect(show(all.filter((l) => !l.isY && l.lifted !== l.ground))).toEqual([]);
  });

  it('specifically lifts the things that used to be missed', () => {
    const win = (g: CompiledGrid) => g.openings.find((o) => o.kind === 'window')!;
    // The regression: authored sill/head are heights above THIS storey's floor.
    expect(win(ground).sill).toBeCloseTo(0.45);
    expect(win(lifted).sill).toBeCloseTo(B + 0.45);
    expect(win(lifted).head).toBeCloseTo(B + 0.95);
    // And the rest of the seam, spot-checked by name for a readable failure.
    expect(lifted.footprint.wallTopY).toBeCloseTo(B + WALL_HEIGHT);
    expect(lifted.rooms[0].floor[0][1]).toBeCloseTo(B);
    // Derived, not a literal: an item mounted on the table lands at the table's
    // own support height, so resizing the table can't silently falsify this.
    expect(lifted.items.find((i) => i.id === 'lap')!.position[1]).toBeCloseTo(
      B + (ITEM_SPECS.table.supportsTop ?? 0),
    );
    expect(lifted.items.find((i) => i.id === 'telly')!.position[1]).toBeCloseTo(B + 0.5);
  });

  it('leaves extents alone — a wall is not taller upstairs', () => {
    expect(lifted.rooms[0].bounds.max[1] - lifted.rooms[0].bounds.min[1]).toBeCloseTo(
      ground.rooms[0].bounds.max[1] - ground.rooms[0].bounds.min[1],
    );
    expect(lifted.openings[0].height).toBe(ground.openings[0].height);
  });
});