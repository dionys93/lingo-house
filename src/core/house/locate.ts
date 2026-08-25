// src/core/house/locate.ts
//
// Where you are, from where you're standing.
//
// The old nav model STORED your location: the reducer recorded which room you
// were in and only changed it when you traversed a door. Continuous movement
// makes that unrepresentable — you can stand in a doorway — so location stops
// being a fact anyone holds and becomes a question you ask of a position.
//
// Same direction `described` and `rigFor` already went. Nothing to keep in sync,
// nothing that can disagree with the camera.

import { CELL, type CompiledGrid, type Vec3 } from './grid';
import type { Location } from './nav';
import type { Vec2 } from './collide';

const HALF = CELL / 2;

/**
 * Which room contains this point, or 'outside'.
 *
 * A cell is a CELL-sized square centred on its floor tile, so containment is two
 * comparisons per cell. Linear over every cell in the storey, which is ~36 for
 * the authored house — cheap enough that indexing it would be inventing a
 * problem. If a plan ever gets big enough to notice, bucket by cell coordinate;
 * don't cache, because a cache is a stored location again.
 *
 * The half-open comparison matters on shared edges: a point exactly on the
 * boundary between two rooms belongs to the first one found rather than to both.
 * Which room wins is arbitrary; that exactly one does is not.
 */
export function locationAt(pos: Vec2, grid: CompiledGrid): Location {
  for (const room of grid.rooms) {
    for (const centre of room.floor) {
      if (contains(centre, pos)) return room.key;
    }
  }
  return 'outside';
}

/*
 * NOT routed through core/cells: this one asks a different question.
 *
 * `CellIndex` is keyed by (row, col) and everything else here starts from cells.
 * This starts from a WORLD POSITION, and turning that back into a cell needs the
 * origin the grid was centred on — which is the house's extent, not the storey's,
 * and isn't carried on CompiledGrid. Forcing it through the index would mean
 * either threading extent into every caller or reconstructing it from the bbox
 * and hoping the rounding agrees.
 *
 * It's a linear scan over floor tiles, called once per frame only when the
 * position actually changed, over ~54 cells. If a plan ever gets big enough to
 * notice, the fix is to put the extent on CompiledGrid and index by cell — not
 * to cache, because a cache is a stored location again.
 */

const contains = (centre: Vec3, p: Vec2): boolean =>
  p[0] >= centre[0] - HALF &&
  p[0] < centre[0] + HALF &&
  p[1] >= centre[2] - HALF &&
  p[1] < centre[2] + HALF;