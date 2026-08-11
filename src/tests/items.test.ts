// src/tests/items.test.ts
//
// The item pipeline: cell → world placement, derived room, yaw-aware bounds,
// baseY sweep, and the three item errors — accumulated WITH opening errors.
// Coordinate oracle assumes CELL = 0.5 (asserted in grid.test.ts).

import { describe, it, expect } from 'vitest';
import { compileGrid, ITEM_SPECS, type CompiledGrid } from '../core/grid';
import { _, type Grid, type ItemDef } from '../core/blocks';
import { room } from './support';
import { WALL_THICKNESS } from '../core/grid';

const K = room('kitchen', 'Kitchen');
const L = room('livingRoom', 'Living Room');

// 2×2, kitchen top row, living room bottom-left, one empty cell.
// C = 2, R = 2 → xAt(c) = c·0.5 − 0.5, zAt(r) = r·0.5 − 0.5.
const GRID: Grid = [
  [K, K],
  [L, _],
];

const table = (over: Partial<ItemDef> = {}): ItemDef => ({
  id: 't1',
  kind: 'table',
  mount: { on: 'floor', cell: [1, 0] },
  ...over,
});
const onFloor = (cell: readonly [number, number], rest: object = {}): ItemDef['mount'] => ({
  on: 'floor',
  cell,
  ...rest,
});

const compiled = (items: readonly ItemDef[], baseY = 0): CompiledGrid => {
  const r = compileGrid(GRID, { items, baseY });
  if (!r.ok) throw new Error(`expected Ok, got: ${JSON.stringify(r.error)}`);
  return r.value;
};

const errorTags = (items: readonly ItemDef[]): readonly string[] => {
  const r = compileGrid(GRID, { items });
  if (r.ok) throw new Error('expected Err, got Ok');
  return r.error.map((e) => e.tag);
};

describe('compileGrid — items', () => {
  it('records how it was mounted, so the shell can find wall-hung items', () => {
    const { items } = compiled([table()]);
    expect(items[0].mountedOn).toBe('floor');
  });

  it('places an item at its cell centre, room derived from the cell', () => {
    const [item] = compiled([table()]).items;
    expect(item.position).toEqual([-0.25, 0, 0.25]); // cell [1,0] centre
    expect(item.room).toBe('livingRoom'); // derived, not authored
    expect(item.yaw).toBe(0); // default facing 's'
  });

  it('applies the within-cell offset in cell units', () => {
    const [item] = compiled([table({ mount: onFloor([1, 0], { offset: [0.25, -0.25] }) })]).items;
    expect(item.position[0]).toBeCloseTo(-0.25 + 0.25 * 0.5);
    expect(item.position[2]).toBeCloseTo(0.25 - 0.25 * 0.5);
  });

  it('baseY sweeps item position and bounds like every other Y', () => {
    const [item] = compiled([table()], 1.2).items;
    expect(item.position[1]).toBe(1.2);
    expect(item.bounds.min[1]).toBe(1.2);
    expect(item.bounds.max[1]).toBeCloseTo(1.2 + ITEM_SPECS.table.h);
  });

  it('bounds are yaw-aware: e/w swap the X/Z footprint', () => {
    const { w, d } = ITEM_SPECS.table;
    const south = compiled([table({ mount: onFloor([1, 0], { facing: 's' }) })]).items[0];
    expect(south.bounds.max[0] - south.bounds.min[0]).toBeCloseTo(w);
    expect(south.bounds.max[2] - south.bounds.min[2]).toBeCloseTo(d);
    const east = compiled([table({ mount: onFloor([1, 0], { facing: 'e' }) })]).items[0];
    expect(east.bounds.max[0] - east.bounds.min[0]).toBeCloseTo(d);
    expect(east.bounds.max[2] - east.bounds.min[2]).toBeCloseTo(w);
    expect(east.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('rejects an item off the grid', () => {
    expect(errorTags([table({ mount: onFloor([5, 0]) })])).toEqual(['ItemCellOutOfBounds']);
  });

  it('rejects an item on an empty cell', () => {
    expect(errorTags([table({ mount: onFloor([1, 1]) })])).toEqual(['ItemCellEmpty']);
  });

  it('rejects duplicate ids, keeping the first', () => {
    expect(errorTags([table(), table({ mount: onFloor([0, 0]) })])).toEqual(['DuplicateItemId']);
  });

  it('accumulates item errors WITH opening errors in one compile', () => {
    const r = compileGrid(
      GRID,
      {
        openings: [{ kind: 'door', cell: [9, 9], side: 'front', swing: 'in' }], // bad opening
        items: [table({ mount: onFloor([1, 1]) })], // bad item
      },
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

// ── Mounting: placement as a relationship rather than a coordinate ──────────

describe('compileGrid — mounting on another item', () => {
  const laptopOn = (host: string, over: object = {}): ItemDef => ({
    id: 'l1',
    kind: 'laptop',
    mount: { on: 'item', host, ...over },
  });

  it('sits on the host’s top surface and inherits its room', () => {
    const { items } = compiled([table(), laptopOn('t1')]);
    const t = items.find((i) => i.id === 't1')!;
    const l = items.find((i) => i.id === 'l1')!;
    expect(l.position[1]).toBeCloseTo(t.position[1] + ITEM_SPECS.table.supportsTop!);
    expect([l.position[0], l.position[2]]).toEqual([t.position[0], t.position[2]]); // centred
    expect(l.room).toBe(t.room); // derived from the host, not authored
  });

  it('resolves regardless of authoring order — host may come second', () => {
    const { items } = compiled([laptopOn('t1'), table()]);
    expect(items.find((i) => i.id === 'l1')!.position[1]).toBeCloseTo(
      ITEM_SPECS.table.supportsTop!,
    );
  });

  it('inherits the host’s facing unless told otherwise', () => {
    const turned = table({ mount: onFloor([1, 0], { facing: 'e' }) });
    expect(compiled([turned, laptopOn('t1')]).items.find((i) => i.id === 'l1')!.yaw).toBeCloseTo(
      Math.PI / 2,
    );
    const override = compiled([turned, laptopOn('t1', { facing: 'n' })]);
    expect(override.items.find((i) => i.id === 'l1')!.yaw).toBeCloseTo(Math.PI);
  });

  it('applies the offset in the HOST’s rotated frame, not world axes', () => {
    // Same authored offset, host turned 90°: what was a +X nudge becomes −Z.
    const nudge = { offset: [0.5, 0] as const };
    const south = compiled([table(), laptopOn('t1', nudge)]);
    const east = compiled([table({ mount: onFloor([1, 0], { facing: 'e' }) }), laptopOn('t1', nudge)]);
    const half = 0.5 * ITEM_SPECS.table.w;
    const s = south.items.find((i) => i.id === 'l1')!;
    const e = east.items.find((i) => i.id === 'l1')!;
    expect(s.position[0] - south.items[0].position[0]).toBeCloseTo(half);
    expect(e.position[2] - east.items[0].position[2]).toBeCloseTo(-half);
  });

  it('rejects a host that does not exist', () => {
    expect(errorTags([table(), laptopOn('nope')])).toEqual(['UnknownMountHost']);
  });

  it('rejects stacking on something nothing rests on', () => {
    const tv: ItemDef = { id: 'tv1', kind: 'tv', mount: onFloor([1, 0]) };
    expect(errorTags([tv, laptopOn('tv1')])).toEqual(['ItemNotMountable']);
  });

  it('reports a mount loop instead of overflowing the stack', () => {
    const a: ItemDef = { id: 'a', kind: 'laptop', mount: { on: 'item', host: 'b' } };
    const b: ItemDef = { id: 'b', kind: 'laptop', mount: { on: 'item', host: 'a' } };
    expect(errorTags([a, b])).toEqual(['MountCycle']);
  });

  it('reports the ROOT cause once — a dependent of a broken host adds no noise', () => {
    // The table is off the grid; the laptop on it is dropped silently, because
    // "your table is off the grid" is the only actionable message here.
    expect(errorTags([table({ mount: onFloor([9, 9]) }), laptopOn('t1')])).toEqual([
      'ItemCellOutOfBounds',
    ]);
  });
});

describe('compileGrid — mounting on a wall', () => {
  // GRID is [[K,K],[L,_]] — the K/L boundary is a real wall on row 1 col 0's back.
  const tvOn = (over: object): ItemDef => ({
    id: 'tv1',
    kind: 'tv',
    mount: { on: 'wall', cell: [1, 0], side: 'back', height: 0.5, ...over },
  });

  it('rests against the wall’s inner face, facing into the room', () => {
    const [tv] = compiled([tvOn({})]).items;
    // Wall centreline is z = 0 (row 1's back edge); the room is at +Z, so the
    // TV sits just inside it and looks south.
    expect(tv.position[2]).toBeCloseTo(0 + WALL_THICKNESS / 2 + ITEM_SPECS.tv.d / 2);
    expect(tv.yaw).toBeCloseTo(0); // 's' — into the living room
    expect(tv.position[1]).toBeCloseTo(0.5);
    expect(tv.room).toBe('livingRoom');
  });

  it('slides along the wall with the scalar offset', () => {
    const centred = compiled([tvOn({})]).items[0];
    const slid = compiled([tvOn({ offset: 0.25 })]).items[0];
    expect(slid.position[0] - centred.position[0]).toBeCloseTo(0.25 * 0.5);
    expect(slid.position[2]).toBeCloseTo(centred.position[2]); // still against the wall
  });

  it('rejects a wall that isn’t there', () => {
    // [0,0]'s right edge is kitchen↔kitchen — same room both sides, no wall.
    expect(
      errorTags([{ id: 'tv1', kind: 'tv', mount: { on: 'wall', cell: [0, 0], side: 'right', height: 0.5 } }]),
    ).toEqual(['ItemNotOnWall']);
  });

  it('rejects a mount that would poke through the ceiling', () => {
    expect(errorTags([tvOn({ height: 1.15 })])).toEqual(['ItemTooHigh']); // 1.15 + 0.2 > 1.2
  });

  it('baseY lifts wall mounts with the storey', () => {
    expect(compiled([tvOn({})], 1.2).items[0].position[1]).toBeCloseTo(1.2 + 0.5);
  });
});

describe('compileGrid — mount kind is carried through', () => {
  it('reports floor, item and wall mounts distinctly', () => {
    const items: readonly ItemDef[] = [
      { id: 't', kind: 'table', mount: onFloor([1, 0]) },
      { id: 'l', kind: 'laptop', mount: { on: 'item', host: 't' } },
      { id: 'v', kind: 'tv', mount: { on: 'wall', cell: [1, 0], side: 'back', height: 0.5 } },
    ];
    const byId = new Map(compiled(items).items.map((i) => [i.id, i.mountedOn]));
    expect([byId.get('t'), byId.get('l'), byId.get('v')]).toEqual(['floor', 'item', 'wall']);
  });
});