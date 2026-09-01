// src/core/house/frame.ts
//
// Where cell [r][c] lands in the world, and — the reason this file exists — how
// to get back.
//
// The forward direction was two closures inside compileGrid. That was fine
// while nothing else needed it, and edit mode needs the INVERSE: you drag a
// sofa to a point on screen, and what has to be written to the plan is a cell
// and a small offset, never a world coordinate. Authoring world coordinates is
// the one thing the item model forbids outright, because baseY sweeps a storey's
// items along with it when storeys stack and a hardcoded Y stays behind.
//
// An inverse derived independently would be a second definition of the same
// mapping, free to drift from the first by a half-cell and produce plans that
// compile to somewhere other than where you dropped the thing. So the frame is
// one value that carries both directions, compileGrid builds its geometry from
// it, and edit mode inverts the same object.
//
// A frame is defined by an EXTENT, not by a storey. Every storey in a house
// centres on the union of all of them (see CompileOptions.extent), so cell
// [0][0] is the same world corner upstairs and down — which is also why edit
// mode must ask the house for the extent rather than measure the storey it is
// editing.

import type { Cell } from '../shared/errors';
import { CELL } from './scale';

export interface GridFrame {
  readonly rows: number;
  readonly cols: number;
  /** World X of the LINE at column `col` — its low-X edge. Column `cols` is the far edge. */
  readonly xAt: (col: number) => number;
  /** World Z of the LINE at row `row` — its low-Z edge. */
  readonly zAt: (row: number) => number;
}

/** The frame a grid of this extent is centred in. */
export const gridFrame = (rows: number, cols: number): GridFrame => ({
  rows,
  cols,
  xAt: (col) => col * CELL - (cols * CELL) / 2,
  zAt: (row) => row * CELL - (rows * CELL) / 2,
});

/** Where the centre of a cell sits, which is where a zero-offset item stands. */
export const centreOf = (f: GridFrame, [r, c]: Cell): readonly [number, number] => [
  f.xAt(c) + CELL / 2,
  f.zAt(r) + CELL / 2,
];

/**
 * The floor mount that puts an item at world (x, z) — the exact inverse of the
 * `on: 'floor'` case in compileItems.
 *
 * The cell is the one whose CENTRE is nearest, not the one the point falls
 * inside, so the offset that comes back is always within half a cell of zero.
 * Picking the containing cell instead gives offsets in [0, 1) and puts a sofa
 * that straddles a boundary in whichever cell its centre happens to land in —
 * the same placement, authored in a way that reads as further from home than it
 * is. Half-cell offsets keep the cell meaningful: it is the cell the thing is
 * IN, and the offset is a nudge.
 *
 * `snap` quantises the offset, in cell fractions. It exists because a dragged
 * item otherwise emits 0.4321708 into a file a person has to read; 0.05 is a
 * 50 mm nudge at this scale, which is finer than anything you can see and still
 * reads as a number someone typed.
 *
 * The cell is clamped into the grid. A point dragged past the last column is a
 * cell out of bounds, which the compiler reports as ItemCellOutOfBounds — a
 * real error the editor should show, but it should show it about the edge cell
 * the user was aiming at rather than about cell 47.
 */
export function floorMountAt(
  f: GridFrame,
  x: number,
  z: number,
  snap = 0.05,
): { readonly cell: Cell; readonly offset: readonly [number, number] } {
  const u = (x - f.xAt(0)) / CELL - 0.5; // in cell-centres from the first centre
  const v = (z - f.zAt(0)) / CELL - 0.5;
  const clamp = (n: number, hi: number) => Math.max(0, Math.min(hi, n));
  const c = clamp(Math.round(u), f.cols - 1);
  const r = clamp(Math.round(v), f.rows - 1);
  const q = (n: number) => (snap > 0 ? Math.round(n / snap) * snap : n);
  // Rounded to kill the float dust `Math.round(x / 0.05) * 0.05` leaves behind
  // (0.15000000000000002), which would otherwise be written into the plan.
  const tidy = (n: number) => Number(q(n).toFixed(6));
  return { cell: [r, c], offset: [tidy(u - c), tidy(v - r)] };
}
