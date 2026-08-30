// src/core/house/openings.ts
//
// Where a door or window is allowed to go, and which boundary edge it lands on.
//
// Two jobs, kept together because the second only exists to serve the first:
// `resolveEdge` turns a (cell, side) pair into the single grid boundary it
// names, and `validateOpening` decides whether that boundary is a wall at all
// and which two rooms it separates.
//
// The rule the whole file defends: an opening must sit on a boundary whose two
// sides DIFFER. Same room on both sides is an internal seam, not a wall, and an
// opening there would be a hole in the middle of a room.

import { assertNever, type Cell, type HouseError, type Side } from '../shared/errors';
import type { Opening } from './blocks';
import type { WallSide } from './compiled';
import { WALL_HEIGHT } from './scale';

// A grid boundary edge an opening resolves to. `orient` 'v' = vertical boundary
// (a run along Z), 'h' = horizontal (along X). `fixed` is the boundary line index,
// `varying` the cell index along it — matching the wall-segment loops exactly.
export interface ResolvedEdge {
  readonly orient: 'v' | 'h';
  readonly fixed: number;
  readonly varying: number;
}

// cell + side → the single boundary edge that side names.
export function resolveEdge(cell: Cell, side: Side): ResolvedEdge {
  const [r, c] = cell;
  switch (side) {
    case 'back':
      return { orient: 'h', fixed: r, varying: c };
    case 'front':
      return { orient: 'h', fixed: r + 1, varying: c };
    case 'left':
      return { orient: 'v', fixed: c, varying: r };
    case 'right':
      return { orient: 'v', fixed: c + 1, varying: r };
    default:
      return assertNever(side);
  }
}

// The outcome of validating one opening: an error, or the resolved edge + sides
// it claims. Pure and self-contained — each check `return`s, so no `continue` in
// the caller's loop, and it's independently testable.
export type OpeningCheck =
  | { readonly ok: false; readonly error: HouseError }
  | { readonly ok: true; readonly edge: ResolvedEdge; readonly neg: WallSide; readonly pos: WallSide };

export function validateOpening(
  op: Opening,
  keyAt: (r: number, c: number) => WallSide,
  R: number,
  C: number,
): OpeningCheck {
  const [r, c] = op.cell;
  if (keyAt(r, c) === 'outside') {
    return {
      ok: false,
      error:
        r < 0 || r >= R || c < 0 || c >= C
          ? { tag: 'OpeningCellOutOfBounds', cell: op.cell }
          : { tag: 'OpeningCellEmpty', cell: op.cell },
    };
  }

  const edge = resolveEdge(op.cell, op.side);
  const neg =
    edge.orient === 'v' ? keyAt(edge.varying, edge.fixed - 1) : keyAt(edge.fixed - 1, edge.varying);
  const pos =
    edge.orient === 'v' ? keyAt(edge.varying, edge.fixed) : keyAt(edge.fixed, edge.varying);
  if (neg === pos) {
    return { ok: false, error: { tag: 'OpeningNotOnWall', cell: op.cell, side: op.side } };
  }

  if (op.between !== undefined) {
    const want = new Set<WallSide>(op.between);
    const have = new Set<WallSide>([neg, pos]);
    const matches = want.size === have.size && [...want].every((k) => have.has(k));
    if (!matches) {
      return {
        ok: false,
        error: {
          tag: 'OpeningConnectsWrongRooms',
          cell: op.cell,
          side: op.side,
          expected: op.between,
          actual: [neg, pos],
        },
      };
    }
  }

  if (op.kind === 'window') {
    if (op.sill >= op.head) {
      return {
        ok: false,
        error: { tag: 'WindowSillAboveHead', cell: op.cell, side: op.side, sill: op.sill, head: op.head },
      };
    }
    if (op.head > WALL_HEIGHT || op.sill < 0) {
      return {
        ok: false,
        error: { tag: 'WindowExceedsWall', cell: op.cell, side: op.side, head: op.head, wallHeight: WALL_HEIGHT },
      };
    }
  }

  return { ok: true, edge, neg, pos };
}