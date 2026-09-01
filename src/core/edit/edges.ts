// src/core/edit/edges.ts
//
// Every place an opening could go, as something you can draw and click.
//
// The compiler answers the opposite question: given a (cell, side) an author
// wrote, is that a wall? (openings.ts). An editor needs the set — you cannot
// click a wall that isn't drawn — and the set is not `CompiledGrid.walls`,
// because those are merged RUNS. A run four cells long is one wall segment and
// four separate places a door can go.
//
// So this walks the same boundaries the compiler does and keeps the ones where
// the sides differ, which is the same one-line rule ("a wall exists iff the two
// sides differ") that grid.ts is built on. Deriving the clickable set from any
// other source is how an editor ends up offering a door on an interior seam.
//
// ADDRESSING. A boundary is between two cells, so it has two equally true names
// — cell [r,c] side 'left' is the same edge as cell [r,c-1] side 'right'. The
// compiler treats them identically. This picks the one whose cell is a ROOM,
// because the other one may not be a cell at all: on the outer face of the
// house one side is empty, and an opening whose `cell` is empty is
// OpeningCellEmpty even though the wall is real.

import { boundaries, indexOf, type Occupant } from '../house/cells';
import { resolveEdge } from '../house/openings';
import type { Grid } from '../house/blocks';
import type { Cell, Side } from '../shared/errors';
import type { WallSide } from '../house/compiled';
import type { GridFrame } from '../house/frame';

export interface WallEdge {
  /**
   * The edge's identity, and the reason it is here rather than being implied by
   * `cell` + `side`. Those two names are BOTH true of one edge — [r,c] 'left'
   * and [r,c-1] 'right' are the same wall — so anything that has to decide
   * whether the plan already has an opening here, or which one to delete, must
   * compare edges and not names. Matching on the name instead silently misses
   * every opening the author happened to write from the other side, which is
   * one of the four in the house as it stands.
   *
   * Same string the compiler uses for an opening's id within a grid.
   */
  readonly key: string;
  /** How to author an opening here. */
  readonly cell: Cell;
  readonly side: Side;
  /** The two rooms it separates, in the compiler's geometric order. */
  readonly between: readonly [WallSide, WallSide];
  /** World endpoints, for drawing and hit-testing. [x, z] — this is a plan view. */
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
}

const named = (o: Occupant): WallSide => o ?? 'outside';

/**
 * The identity of the edge a (cell, side) names — one string for the one wall,
 * whichever of its two names you were given.
 */
export const edgeKey = (cell: Cell, side: Side): string => {
  const e = resolveEdge(cell, side);
  return `${e.orient}:${String(e.fixed)}:${String(e.varying)}`;
};

/**
 * The clickable wall edges of one storey, in the house's frame.
 *
 * `frame` is the house-wide one (houseExtent), not this grid's own — the same
 * rule every other coordinate in edit mode follows.
 */
export function wallEdges(grid: Grid, frame: GridFrame): readonly WallEdge[] {
  const index = indexOf(grid);
  const { xAt, zAt } = frame;
  return boundaries(index).map((e): WallEdge => {
    const between = [named(e.neg), named(e.pos)] as const;
    if (e.orient === 'v') {
      // A vertical boundary at column line `fixed`, alongside row `varying`.
      const [r, c] = [e.varying, e.fixed];
      const address =
        e.pos !== null
          ? ({ cell: [r, c] as Cell, side: 'left' as const })
          : ({ cell: [r, c - 1] as Cell, side: 'right' as const });
      return { key: edgeKey(address.cell, address.side), ...address, between, a: [xAt(c), zAt(r)], b: [xAt(c), zAt(r + 1)] };
    }
    const [r, c] = [e.fixed, e.varying];
    const address =
      e.pos !== null
        ? ({ cell: [r, c] as Cell, side: 'back' as const })
        : ({ cell: [r - 1, c] as Cell, side: 'front' as const });
    return { key: edgeKey(address.cell, address.side), ...address, between, a: [xAt(c), zAt(r)], b: [xAt(c + 1), zAt(r)] };
  });
}
