// src/render/elements/Floor.tsx
//
// Interior floors — one CELL×CELL tile per cell, in the room's colour, just above
// the grass. Layout is shared with the ceiling via RoomTiles.

import { type CompiledGrid, type Vec3 } from '../../core/house/grid';
import type { Cell } from '../../core/shared/errors';
import { RoomTiles } from './RoomTiles';

const FLOOR_Y = 0.02; // just above the grass (y=0) to avoid z-fighting
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
      grid={grid}
      y={baseY + FLOOR_Y}
      faceUp
      defaultColor={DEFAULT_FLOOR}
      skip={skip}
      onPick={onPick}
    />
  );
}