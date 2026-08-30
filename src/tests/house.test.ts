// src/tests/house.test.ts
//
// compileHouse: the stacking rules, the derived stairwell, and the error table.
// All pure — no scene, no React.

import { describe, it, expect } from 'vitest';
import { compileHouse } from '../core/house/house';
import { WALL_HEIGHT } from '../core/house/scale';
import type { Opening, Stair, Storey } from '../core/house/blocks';
import type { HouseError } from '../core/shared/errors';
import { room } from './support';

const A = room('down', 'Downstairs');
const B = room('up', 'Upstairs');

// 4 rows × 2 cols, one room per storey.
//
// Was three rows, which is one short: a two-cell run starting at the last row
// has its DEPARTURE cell — the floor you stand on before the bottom step — off
// the grid entirely. compileHouse rejects that now, and it is the same defect
// the authored house had, where the bottom step landed on the exterior wall.
// The fixture wasn't wrong before the rule existed; it is wrong now.
const GRID_A = [
  [A, A],
  [A, A],
  [A, A],
  [A, A],
];
const GRID_B = [
  [B, B],
  [B, B],
  [B, B],
  [B, B],
];

// Row 3, not row 2: adding a row moved the front wall, and row 2's front edge is
// now an interior seam between two cells of the same room — no wall to hang a
// door on.
const FRONT_DOOR: Opening = { kind: 'door', cell: [3, 0], side: 'front', swing: 'out' };
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
      Math.max(...h.roofs.flatMap((r) => r.slopes.positions.map((p) => p[1])));
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

  it('leaves the rooms alone — a room still OWNS the cells it owns', () => {
    // The first version of this cut the tiles out of each room's `floor` list.
    // That broke an invariant: `cells` and `floor` are index-aligned, one tile
    // per cell, and a shortened `floor` beside a full `cells` is a trap for
    // anything that later zips them. The hole is a separate cell list instead,
    // and the renderer skips by cell.
    const h = compiled(house());
    for (const storey of h.storeys) {
      for (const room of storey.grid.rooms) {
        expect(room.floor).toHaveLength(room.cells.length);
      }
    }
    const tiles = (i: number) => h.storeys[i].grid.rooms.reduce((n, r) => n + r.floor.length, 0);
    expect(tiles(0)).toBe(8); // 4 rows × 2 cols
    expect(tiles(1)).toBe(8); // NOT 6 — the two-cell hole lives in openFloor, not here
  });

  it('opens the ceiling below to match, so the stairs do not run into a lid', () => {
    const h = compiled(house());
    // The storey below sees the same cells missing from its ceiling as the
    // storey above sees missing from its floor.
    expect(h.storeys[0].openCeiling).toEqual(h.storeys[1].openFloor);
    expect(h.storeys[1].openCeiling).toEqual([]); // nothing above the top storey
  });

  it('the skipped cells are ones the room really has, so skipping by cell works', () => {
    const h = compiled(house());
    const upper = h.storeys[1];
    const owned = upper.grid.rooms.flatMap((r) => r.cells);
    for (const hole of upper.openFloor) {
      expect(owned.some((c) => c[0] === hole[0] && c[1] === hole[1])).toBe(true);
    }
  });

  it('derives which flank is open floor, for the balustrade', () => {
    // GRID_A is 3×2 and the run is down column 0, so the climber's right (column
    // 1) is room and the left is off the grid entirely.
    expect(compiled(house()).stairs[0].openSides).toEqual(['right']);
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

  it('ACCEPTS a storey whose outline differs, and roofs the part it leaves bare', () => {
    // The inverse of what this used to assert. FootprintMismatch existed to stop
    // a single gable silently half-roofing a house; roofs are derived per
    // uncovered rectangle now, so a setback has nothing left to reject.
    const narrow = [[B], [B], [B], [B]]; // one column instead of two
    const h = compiled(house({}, { grid: narrow }));

    // Two roofs at two heights: the upper storey's own, and a lower one over the
    // column the upper storey doesn't cover.
    expect(h.roofs).toHaveLength(2);
    const ridges = h.roofs
      .map((r) => Math.max(...r.slopes.positions.map((p) => p[1])))
      .sort((x, y) => x - y);
    expect(ridges[1] - ridges[0]).toBeCloseTo(WALL_HEIGHT);
  });

  it('aligns storeys at cell [0][0], not on their own centres', () => {
    // A smaller storey centred on ITSELF would float inboard of where it was
    // drawn. Sharing the house's extent is what makes a setback land on the
    // corner it was authored from.
    const narrow = [[B], [B], [B], [B]];
    const h = compiled(house({}, { grid: narrow }));
    const [ground, upper] = h.storeys;
    expect(upper.grid.footprint.bbox.x0).toBeCloseTo(ground.grid.footprint.bbox.x0);
    expect(upper.grid.footprint.bbox.z0).toBeCloseTo(ground.grid.footprint.bbox.z0);
    expect(upper.grid.footprint.bbox.x1).toBeLessThan(ground.grid.footprint.bbox.x1);
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
    // Runs to the LAST row, so the derived arrival — one step past the top
    // tread — falls off the grid. Was [0,0]→[2,0], which stopped isolating this
    // once the fixture grew a fourth row: the arrival then landed on row 3 and
    // the DEPARTURE fell off instead, so the assertion caught the wrong error.
    expect(withStair({ id: 's1', from: [1, 0], to: [3, 0] })).toContain('StairArrivalInvalid');
  });

  it('rejects a departure that lands nowhere on this storey', () => {
    // The mirror of the case above, and the one that has no floor at the FOOT.
    // Running from row 0 means the cell you stand on before the bottom step is
    // row -1 — which is how a staircase ends up starting inside an exterior
    // wall with nowhere to approach it from.
    expect(withStair({ id: 's1', from: [0, 0], to: [2, 0] })).toContain('StairDepartureInvalid');
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