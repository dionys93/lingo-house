// src/tests/house.test.ts
//
// compileHouse: the stacking rules, the derived stairwell, and the error table.
// All pure — no scene, no React.

import { describe, it, expect } from 'vitest';
import { compileHouse } from '../core/house';
import { WALL_HEIGHT } from '../core/grid';
import type { Opening, Stair, Storey } from '../core/blocks';
import type { HouseError } from '../core/errors';
import { room } from './support';

const A = room('down', 'Downstairs');
const B = room('up', 'Upstairs');

// 3 rows × 2 cols, one room per storey. Three rows so a stair has somewhere to
// run and still land on a cell that exists.
const GRID_A = [
  [A, A],
  [A, A],
  [A, A],
];
const GRID_B = [
  [B, B],
  [B, B],
  [B, B],
];

const FRONT_DOOR: Opening = { kind: 'door', cell: [2, 0], side: 'front', swing: 'out' };
// Bottom tread at the front, climbing back; arrival is derived as [0,0].
const STAIR: Stair = { id: 's1', from: [2, 0], to: [1, 0] };

const house = (over: Partial<Storey> = {}, upper: Partial<Storey> = {}): readonly Storey[] => [
  { level: 0, grid: GRID_A, openings: [FRONT_DOOR], stairs: [STAIR], ...over },
  { level: 1, grid: GRID_B, ...upper },
];

const compiled = (storeys: readonly Storey[]) => {
  const r = compileHouse(storeys);
  if (!r.ok) throw new Error(`expected Ok, got: ${JSON.stringify(r.error)}`);
  return r.value;
};

const tags = (storeys: readonly Storey[]): readonly HouseError['tag'][] => {
  const r = compileHouse(storeys);
  if (r.ok) throw new Error('expected Err, got Ok');
  return r.error.map((e) => e.tag);
};

describe('compileHouse — stacking', () => {
  it('lifts each storey to its level and returns them in ascending order', () => {
    const h = compiled(house());
    expect(h.storeys.map((s) => s.level)).toEqual([0, 1]);
    expect(h.storeys.map((s) => s.baseY)).toEqual([0, WALL_HEIGHT]);
    expect(h.storeys[1].grid.footprint.wallTopY).toBeCloseTo(2 * WALL_HEIGHT);
  });

  it('sorts by level, not by array order', () => {
    const reversed = [...house()].reverse();
    expect(compiled(reversed).storeys.map((s) => s.level)).toEqual([0, 1]);
  });

  it('puts the roof on the TOP storey — it travels with the topmost walls', () => {
    const oneStorey = compiled([{ level: 0, grid: GRID_A, openings: [FRONT_DOOR] }]);
    const twoStorey = compiled(house());
    const ridge = (h: ReturnType<typeof compiled>) =>
      Math.max(...h.roof.slopes.positions.map((p) => p[1]));
    expect(ridge(twoStorey) - ridge(oneStorey)).toBeCloseTo(WALL_HEIGHT);
  });
});

describe('compileHouse — the stairwell is DERIVED', () => {
  it('cuts the hole from the floor above, exactly over the run', () => {
    const h = compiled(house());
    expect(h.storeys[1].openFloor).toEqual([
      [2, 0],
      [1, 0],
    ]);
    expect(h.storeys[0].openFloor).toEqual([]); // nothing above the ground floor
  });

  it('removes those tiles from the room, so the renderer never sees a hole', () => {
    const h = compiled(house());
    const tiles = (i: number) => h.storeys[i].grid.rooms.reduce((n, r) => n + r.floor.length, 0);
    expect(tiles(0)).toBe(6); // all six cells
    expect(tiles(1)).toBe(4); // six minus the two-cell run
  });

  it('derives the arrival cell one step past the top tread, and the rooms it joins', () => {
    const h = compiled(house());
    const [stair] = h.stairs;
    expect(stair.run).toEqual([
      [2, 0],
      [1, 0],
    ]);
    expect(stair.connects).toEqual(['down', 'up']); // lower room, upper room
    expect(stair.arrival[1]).toBeCloseTo(WALL_HEIGHT); // you land on the upper floor
  });

  it('spreads the climb over the run, ending exactly at the floor above', () => {
    const [stair] = compiled(house()).stairs;
    expect(stair.treads.map((t) => t[1])).toEqual([WALL_HEIGHT / 2, WALL_HEIGHT]);
    expect(stair.rise).toBe(WALL_HEIGHT);
  });
});

describe('compileHouse — house-level errors', () => {
  it('rejects a house with no storeys', () => {
    expect(tags([])).toEqual(['EmptyHouse']);
  });

  it('rejects two storeys on the same level', () => {
    expect(tags([...house(), { level: 1, grid: GRID_B }])).toContain('DuplicateStorey');
  });

  it('rejects a gap in the levels', () => {
    expect(tags([{ level: 0, grid: GRID_A, openings: [FRONT_DOOR] }, { level: 2, grid: GRID_B }])).toContain(
      'FloatingStorey',
    );
  });

  it('rejects a room key reused on another storey — keys are house-wide', () => {
    // Same key, even though the labels would read identically.
    expect(tags(house({}, { grid: GRID_A }))).toContain('DuplicateRoomKey');
  });

  it('rejects a storey whose outline differs — setback roofs are not supported', () => {
    const narrow = [[B], [B], [B]];
    expect(tags(house({}, { grid: narrow }))).toContain('FootprintMismatch');
  });

  it('rejects a storey nobody can reach', () => {
    // No stairs: the upper floor is a room you can see and never enter.
    expect(tags(house({ stairs: [] }))).toEqual(['UnreachableStorey']);
  });

  it('accumulates across ALL storeys rather than stopping at the first', () => {
    // A bad opening downstairs and a bad opening upstairs, in one compile.
    const bad: Opening = { kind: 'door', cell: [9, 9], side: 'front', swing: 'in' };
    const got = tags(house({ openings: [FRONT_DOOR, bad] }, { openings: [bad] }));
    expect(got.filter((t) => t === 'OpeningCellOutOfBounds')).toHaveLength(2);
  });
});

describe('compileHouse — stair errors', () => {
  const withStair = (s: Stair) => tags(house({ stairs: [s] }));

  it('rejects a bent run', () => {
    expect(withStair({ id: 's1', from: [2, 0], to: [1, 1] })).toContain('StairNotStraight');
  });

  it('rejects a run with no length', () => {
    expect(withStair({ id: 's1', from: [1, 0], to: [1, 0] })).toContain('StairTooShort');
  });

  it('rejects a tread outside any room on its own storey', () => {
    expect(withStair({ id: 's1', from: [2, 0], to: [9, 0] })).toContain('StairCellInvalid');
  });

  it('rejects an arrival that lands nowhere upstairs', () => {
    // Climbing the wrong way: the derived arrival falls off the grid.
    expect(withStair({ id: 's1', from: [0, 0], to: [2, 0] })).toContain('StairArrivalInvalid');
  });

  it('rejects a stair with no storey above it', () => {
    expect(
      tags([{ level: 0, grid: GRID_A, openings: [FRONT_DOOR], stairs: [STAIR] }]),
    ).toContain('StairWithoutStoreyAbove');
  });

  it('rejects two stairs sharing an id', () => {
    const two: readonly Stair[] = [STAIR, { id: 's1', from: [2, 1], to: [1, 1] }];
    expect(tags(house({ stairs: two }))).toContain('DuplicateStairId');
  });
});