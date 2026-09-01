// src/render/elements/Floor.tsx
//
// Interior floors — one CELL×CELL tile per cell, in the room's colour, just above
// the grass. Layout is shared with the ceiling via RoomTiles.

import type { CompiledGrid, Vec3 } from '../../core/house/compiled';
import type { Cell } from '../../core/shared/errors';
import { RoomTiles } from './RoomTiles';

/**
 * How far the floor TILE sits above the storey's structural floor — just enough
 * to stop it z-fighting the grass at y=0.
 *
 * Exported because it is the surface things actually stand on. The compiler
 * places an item at `baseY`, which is 20 mm BELOW this, so anything rendered at
 * its raw compiled height is buried to that depth. Two centimetres of a table
 * leg is invisible; a 12 mm rug is entirely gone, which is exactly what
 * happened. Items.tsx lifts by this.
 */
export const FLOOR_Y = 0.02;
const DEFAULT_FLOOR = '#cfc9bd'; // rooms authored without a colour

export function Floor({
  grid,
  baseY = 0,
  skip,
  onPick,
}: {
  grid: CompiledGrid;
  baseY?: number;
  skip?: readonly Cell[];
  onPick?: (at: Vec3) => void;
}) {
  return (
    <RoomTiles
      rooms={grid.rooms}
      y={baseY + FLOOR_Y}
      faceUp
      defaultColor={DEFAULT_FLOOR}
      skip={skip}
      onPick={onPick}
    />
  );
}