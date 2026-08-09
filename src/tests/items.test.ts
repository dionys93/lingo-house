// src/tests/items.test.ts
//
// The item pipeline: cell → world placement, derived room, yaw-aware bounds,
// baseY sweep, and the three item errors — accumulated WITH opening errors.
// Coordinate oracle assumes CELL = 0.5 (asserted in grid.test.ts).

import { describe, it, expect } from 'vitest';
import { compileGrid, ITEM_DIMENSIONS, type CompiledGrid } from '../core/grid';
import { defineRoom, _, type Grid, type ItemDef } from '../core/blocks';

const K = defineRoom({ key: 'kitchen', name: 'Kitchen' });
const L = defineRoom({ key: 'livingRoom', name: 'Living Room' });

// 2×2, kitchen top row, living room bottom-left, one empty cell.
// C = 2, R = 2 → xAt(c) = c·0.5 − 0.5, zAt(r) = r·0.5 − 0.5.
const GRID: Grid = [
  [K, K],
  [L, _],
];

const table = (over: Partial<ItemDef> = {}): ItemDef => ({
  id: 't1',
  kind: 'table',
  cell: [1, 0],
  ...over,
});

const compiled = (items: readonly ItemDef[], baseY = 0): CompiledGrid => {
  const r = compileGrid(GRID, [], baseY, items);
  if (!r.ok) throw new Error(`expected Ok, got: ${JSON.stringify(r.error)}`);
  return r.value;
};

const errorTags = (items: readonly ItemDef[]): readonly string[] => {
  const r = compileGrid(GRID, [], 0, items);
  if (r.ok) throw new Error('expected Err, got Ok');
  return r.error.map((e) => e.tag);
};

describe('compileGrid — items', () => {
  it('places an item at its cell centre, room derived from the cell', () => {
    const [item] = compiled([table()]).items;
    expect(item.position).toEqual([-0.25, 0, 0.25]); // cell [1,0] centre
    expect(item.room).toBe('livingRoom'); // derived, not authored
    expect(item.yaw).toBe(0); // default facing 's'
  });

  it('applies the within-cell offset in cell units', () => {
    const [item] = compiled([table({ offset: [0.25, -0.25] })]).items;
    expect(item.position[0]).toBeCloseTo(-0.25 + 0.25 * 0.5);
    expect(item.position[2]).toBeCloseTo(0.25 - 0.25 * 0.5);
  });

  it('baseY sweeps item position and bounds like every other Y', () => {
    const [item] = compiled([table()], 1.2).items;
    expect(item.position[1]).toBe(1.2);
    expect(item.bounds.min[1]).toBe(1.2);
    expect(item.bounds.max[1]).toBeCloseTo(1.2 + ITEM_DIMENSIONS.table.h);
  });

  it('bounds are yaw-aware: e/w swap the X/Z footprint', () => {
    const { w, d } = ITEM_DIMENSIONS.table;
    const south = compiled([table({ facing: 's' })]).items[0];
    expect(south.bounds.max[0] - south.bounds.min[0]).toBeCloseTo(w);
    expect(south.bounds.max[2] - south.bounds.min[2]).toBeCloseTo(d);
    const east = compiled([table({ facing: 'e' })]).items[0];
    expect(east.bounds.max[0] - east.bounds.min[0]).toBeCloseTo(d);
    expect(east.bounds.max[2] - east.bounds.min[2]).toBeCloseTo(w);
    expect(east.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('rejects an item off the grid', () => {
    expect(errorTags([table({ cell: [5, 0] })])).toEqual(['ItemCellOutOfBounds']);
  });

  it('rejects an item on an empty cell', () => {
    expect(errorTags([table({ cell: [1, 1] })])).toEqual(['ItemCellEmpty']);
  });

  it('rejects duplicate ids, keeping the first', () => {
    expect(errorTags([table(), table({ cell: [0, 0] })])).toEqual(['DuplicateItemId']);
  });

  it('accumulates item errors WITH opening errors in one compile', () => {
    const r = compileGrid(
      GRID,
      [{ kind: 'door', cell: [9, 9], side: 'front', swing: 'in' }], // bad opening
      0,
      [table({ cell: [1, 1] })], // bad item
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.map((e) => e.tag).sort()).toEqual(
        ['ItemCellEmpty', 'OpeningCellOutOfBounds'].sort(),
      );
    }
  });

  it('no items authored → empty items, not absent', () => {
    expect(compiled([]).items).toEqual([]);
  });
});