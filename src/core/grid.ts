// src/core/grid.ts
//
// The innermost pure function of the core: a grid of blocks in, world-space
// geometry (or a list of typed errors) out. No I/O, no React, no three. This is
// the ported, typed, boundaried version of the old constants.js run logic — the
// thing that used to be smeared across a god-module now returns a value the test
// suite asserts on.
//
// The whole convergence rule reduces to one line (see the boundary loops):
// a wall exists on a boundary IFF the two sides differ. Same room on both sides
// (or outside on both) → they cancel, no wall. Different → one wall carrying both
// sides. Collinear segments merge into a run only when their side-pair matches,
// which is why an exterior edge shared by two different rooms does NOT merge.
//
// compileScene / a storey wrapper will later add floorY, level, and the roof
// `footprint` on top of this; compileGrid itself stays scoped to one grid.

import { ok, err, type Result } from './result';
import type { Cell, HouseError, RoomKey } from './errors';
import { isRoom, type Grid, type RoomDef } from './blocks';

// ── World-scale knobs. One cell is CELL units on a side; walls rise WALL_HEIGHT.
// Tunable and cosmetic — the roof will read wall-top height from here later. ────
export const CELL = 0.5;
export const WALL_HEIGHT = 1.2;

export type Vec3 = readonly [number, number, number];
export type WallSide = RoomKey | 'outside';

export interface AABB {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface CompiledRoom {
  readonly key: RoomKey;
  readonly name: string;
  readonly color?: string; // opaque to the core; the factory interprets it
  readonly cells: readonly Cell[];
  readonly bounds: AABB;
}

export interface CompiledWall {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly height: number;
  readonly axis: 'x' | 'z'; // the run's direction
  // [neg, pos]: for an axis-'z' wall, neg = smaller-X side, pos = larger-X side;
  // for axis-'x', neg = smaller-Z side, pos = larger-Z side. Each is a room key
  // or 'outside'. This is what lets the factory colour each face by its room.
  readonly sides: readonly [WallSide, WallSide];
}

export interface CompiledGrid {
  readonly rooms: readonly CompiledRoom[];
  readonly walls: readonly CompiledWall[];
}

const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

export function compileGrid(grid: Grid): Result<CompiledGrid, readonly HouseError[]> {
  const R = grid.length;
  const C = grid.reduce((max, row) => Math.max(max, row.length), 0);

  // Every occupied cell as (r, c, def), walked ONCE. Both the neighbour-lookup
  // map and the per-room grouping derive from this list, so the grid isn't
  // traversed once per structure.
  const roomCells = grid.flatMap((row, r) =>
    row.flatMap((block, c) => (isRoom(block) ? [{ r, c, def: block }] : [])),
  );

  // An empty grid gates everything else — nothing below is meaningful without a
  // single room — so return it rather than accumulate alongside other errors.
  if (roomCells.length === 0) return err([{ tag: 'EmptyGrid' }]);

  // "r,c" -> key, for O(1) neighbour lookups; anything absent reads as exterior.
  const keyByCell = new Map<string, RoomKey>(
    roomCells.map(({ r, c, def }) => [`${r},${c}`, def.key] as const),
  );
  const keyAt = (r: number, c: number): WallSide => keyByCell.get(`${r},${c}`) ?? 'outside';

  // Group cells by room key. Grouping is a fold — inherently stateful — so it
  // stays an explicit accumulation, but over the flat list, not a re-traversal.
  const rooms = new Map<RoomKey, { readonly def: RoomDef; readonly cells: Cell[] }>();
  for (const { r, c, def } of roomCells) {
    const existing = rooms.get(def.key);
    if (existing) existing.cells.push([r, c]);
    else rooms.set(def.key, { def, cells: [[r, c]] });
  }

  // ── Structural validation. Accumulate every remaining error; a valid grid
  // emits none. (EmptyGrid is already handled above.) ──
  const errors: HouseError[] = [];
  for (const [key, { cells }] of rooms) {
    if (key === 'outside') errors.push({ tag: 'ReservedRoomKey', key }); // protects the exterior sentinel
    const regions = countRegions(cells);
    if (regions > 1) errors.push({ tag: 'DisconnectedRoom', room: key, regions });
  }
  if (errors.length > 0) return err(errors);

  // ── Geometry. Only reached once the grid is structurally sound. ──
  const xAt = (col: number) => col * CELL - (C * CELL) / 2;
  const zAt = (row: number) => row * CELL - (R * CELL) / 2;

  // Vertical boundaries (fixed X, varying row): a wall where left key ≠ right key.
  const vSegs: Seg[] = [];
  for (let c = 0; c <= C; c++) {
    for (let r = 0; r < R; r++) {
      const neg = keyAt(r, c - 1);
      const pos = keyAt(r, c);
      if (neg !== pos) vSegs.push({ fixed: c, varying: r, neg, pos });
    }
  }
  // Horizontal boundaries (fixed Z, varying col): a wall where north key ≠ south key.
  const hSegs: Seg[] = [];
  for (let r = 0; r <= R; r++) {
    for (let c = 0; c < C; c++) {
      const neg = keyAt(r - 1, c);
      const pos = keyAt(r, c);
      if (neg !== pos) hSegs.push({ fixed: r, varying: c, neg, pos });
    }
  }

  const vWalls: CompiledWall[] = mergeRuns(vSegs).map((run) => ({
    a: vec3(xAt(run.fixed), 0, zAt(run.start)),
    b: vec3(xAt(run.fixed), 0, zAt(run.end + 1)),
    height: WALL_HEIGHT,
    axis: 'z',
    sides: [run.neg, run.pos],
  }));
  const hWalls: CompiledWall[] = mergeRuns(hSegs).map((run) => ({
    a: vec3(xAt(run.start), 0, zAt(run.fixed)),
    b: vec3(xAt(run.end + 1), 0, zAt(run.fixed)),
    height: WALL_HEIGHT,
    axis: 'x',
    sides: [run.neg, run.pos],
  }));

  const compiledRooms: CompiledRoom[] = [];
  for (const [key, { def, cells }] of rooms) {
    const rowsOf = cells.map(([r]) => r);
    const colsOf = cells.map(([, c]) => c);
    const bounds: AABB = {
      min: vec3(xAt(Math.min(...colsOf)), 0, zAt(Math.min(...rowsOf))),
      max: vec3(xAt(Math.max(...colsOf) + 1), WALL_HEIGHT, zAt(Math.max(...rowsOf) + 1)),
    };
    const base = { key, name: def.name, cells, bounds };
    compiledRooms.push(def.color === undefined ? base : { ...base, color: def.color });
  }

  return ok({ rooms: compiledRooms, walls: [...vWalls, ...hWalls] });
}

// ── helpers ──────────────────────────────────────────────────────────────────

// Count 4-connected regions of a room's cells. >1 means the same key appears as
// two touching-only-diagonally (or fully separate) blobs → DisconnectedRoom.
function countRegions(cells: readonly Cell[]): number {
  const present = new Set(cells.map(([r, c]) => `${r},${c}`));
  const seen = new Set<string>();
  let regions = 0;
  for (const [r, c] of cells) {
    if (seen.has(`${r},${c}`)) continue;
    regions++;
    const stack: Cell[] = [[r, c]];
    seen.add(`${r},${c}`);
    while (stack.length > 0) {
      const cur = stack.pop();
      if (cur === undefined) break;
      const [cr, cc] = cur;
      const neighbours: readonly Cell[] = [
        [cr - 1, cc],
        [cr + 1, cc],
        [cr, cc - 1],
        [cr, cc + 1],
      ];
      for (const [nr, nc] of neighbours) {
        const id = `${nr},${nc}`;
        if (present.has(id) && !seen.has(id)) {
          seen.add(id);
          stack.push([nr, nc]);
        }
      }
    }
  }
  return regions;
}

// A single unit-length wall segment on a grid boundary, before merging.
// `fixed` is the boundary's line index; `varying` is the cell index along it.
interface Seg {
  readonly fixed: number;
  readonly varying: number;
  readonly neg: WallSide;
  readonly pos: WallSide;
}
interface Run {
  readonly fixed: number;
  readonly start: number;
  readonly end: number;
  readonly neg: WallSide;
  readonly pos: WallSide;
}

// Merge collinear segments into runs — but only when they share the SAME side
// pair. Two segments with different inner rooms never merge, which keeps every
// wall single-room-per-side (the property the factory needs for colouring).
function mergeRuns(segs: readonly Seg[]): readonly Run[] {
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const gk = JSON.stringify([s.fixed, s.neg, s.pos]);
    const arr = groups.get(gk);
    if (arr) arr.push(s);
    else groups.set(gk, [s]);
  }

  return [...groups.values()].flatMap((group) => {
    const first = group[0];
    if (first === undefined) return []; // groups are never empty; this satisfies the type
    const varyings = group.map((s) => s.varying).sort((a, b) => a - b);
    return consecutiveRanges(varyings).map(
      ([start, end]): Run => ({ fixed: first.fixed, start, end, neg: first.neg, pos: first.pos }),
    );
  });
}

// Partition a sorted list of integers into maximal consecutive ranges. This is
// the ONLY place the "extend a run vs. start a new one" decision lives — one
// append site, no null accumulator, no flush-at-the-end duplication. Pure and
// exported so it earns its own test rows:
//   [0,1,2] → [[0,2]]   ·   [0,2] → [[0,0],[2,2]]   ·   [] → []   ·   [5] → [[5,5]]
export function consecutiveRanges(sorted: readonly number[]): readonly (readonly [number, number])[] {
  const ranges: (readonly [number, number])[] = [];
  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last !== undefined && n === last[1] + 1) {
      ranges[ranges.length - 1] = [last[0], n]; // extend by replacing (the tuple itself stays immutable)
    } else {
      ranges.push([n, n]); // start a new run
    }
  }
  return ranges;
}