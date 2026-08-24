// src/core/cells.ts
//
// What is at a cell, and where two cells differ. One rule, one place.
//
// This was answered five separate ways, and they didn't agree with each other:
//
//   compileGrid   keyAt(r, c)      -> WallSide, 'outside' when absent
//   compileHouse  roomAt(g, cell)  -> key | null, by SCANNING every room's cells
//   uncoveredRects filled(g, r, c) -> boolean, straight off the raw Grid
//   abutsOf       covered(r, c)    -> boolean, the same expression again
//   locate        locationAt(pos)  -> key | 'outside', by scanning floor tiles
//
// Three sentinels for "nothing here" and two of them O(rooms × cells) per
// lookup, one of those called inside `run.every(...)`.
//
// The sentinel split is worth naming rather than papering over: `null` is a fact
// about the PLAN — no cell was drawn. `'outside'` is what a WALL calls that when
// it needs a name for the surface on its far side. They are not the same thing,
// so the index speaks in `null` and callers that build walls translate at the
// point they emit one.
//
// This is also the migration seam. If the plan ever becomes a 3D block array,
// `indexOf` changes and `boundaries` gains a third axis; nothing downstream of
// them has to know.

import { isRoom, type Grid } from './blocks';
import type { RoomKey } from '../shared/errors';

/** What occupies a cell. `null` means no cell was drawn there. */
export type Occupant = RoomKey | null;

export interface CellIndex {
  readonly rows: number;
  readonly cols: number;
  /** O(1). Off-grid and empty both read as `null` — a hole and a void are the
   *  same absence as far as adjacency is concerned. */
  readonly at: (r: number, c: number) => Occupant;
  readonly filled: (r: number, c: number) => boolean;
}

export function indexOf(grid: Grid | null): CellIndex {
  const rows = grid?.length ?? 0;
  const cols = grid?.reduce((m, row) => Math.max(m, row.length), 0) ?? 0;
  // Flat array rather than a "r,c" string map: same O(1), no key formatting on
  // a path that runs once per cell per boundary.
  const cells: Occupant[] = new Array<Occupant>(rows * cols).fill(null);
  if (grid) {
    for (let r = 0; r < rows; r += 1) {
      const row = grid[r] ?? [];
      for (let c = 0; c < row.length; c += 1) {
        const block = row[c];
        if (block !== undefined && isRoom(block)) cells[r * cols + c] = block.key;
      }
    }
  }
  const at = (r: number, c: number): Occupant =>
    r < 0 || c < 0 || r >= rows || c >= cols ? null : (cells[r * cols + c] ?? null);
  return { rows, cols, at, filled: (r, c) => at(r, c) !== null };
}

/** One boundary line between two cells, named by the grid line it lies on. */
export interface Boundary {
  /** 'v' runs along Z at a fixed column line; 'h' runs along X at a fixed row line. */
  readonly orient: 'v' | 'h';
  readonly fixed: number;
  readonly varying: number;
  /** The cell on the smaller coordinate side, and the larger. */
  readonly neg: Occupant;
  readonly pos: Occupant;
}

/**
 * Every boundary where the two sides differ — which is exactly the set of walls.
 *
 * "Differ" covers all three cases at once and that's the point: room-to-room is
 * a partition, room-to-nothing is an exterior wall, and same-to-same is an
 * interior seam with no wall at all. One comparison, no special cases.
 *
 * Boundaries run to `rows + 1` / `cols + 1` so the outer faces are included; the
 * cell beyond the last one reads `null` and therefore differs.
 */
export function boundaries(index: CellIndex): readonly Boundary[] {
  const { rows, cols, at } = index;
  const out: Boundary[] = [];
  for (let c = 0; c <= cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const neg = at(r, c - 1);
      const pos = at(r, c);
      if (neg !== pos) out.push({ orient: 'v', fixed: c, varying: r, neg, pos });
    }
  }
  for (let r = 0; r <= rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const neg = at(r - 1, c);
      const pos = at(r, c);
      if (neg !== pos) out.push({ orient: 'h', fixed: r, varying: c, neg, pos });
    }
  }
  return out;
}

/**
 * Cells filled in `below` that `above` does not cover.
 *
 * The same difference `boundaries` takes across one grid, taken between two —
 * which is why setbacks and walls are the same question asked on different axes.
 */
export const uncoveredBy = (below: CellIndex, above: CellIndex) =>
  (r: number, c: number): boolean => below.filled(r, c) && !above.filled(r, c);