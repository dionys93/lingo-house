// src/scene/Ceiling.tsx
//
// Interior ceilings — the same per-cell tiles as the floor, lifted to just below
// the wall tops and facing DOWN, in the room's interior colour (room.color ??
// DEFAULT_INTERIOR — the exact expression the walls use, so ceiling and interior
// walls always match). Single-sided facing down: invisible from outside (the roof
// covers the top anyway), visible when you look up from inside.

import { WALL_HEIGHT, type CompiledGrid, type Vec3 } from '../core/grid';
import type { Cell } from '../core/errors';
import { DEFAULT_INTERIOR } from './wallMaterials';
import { RoomTiles } from './RoomTiles';

const CEILING_Y = WALL_HEIGHT - 0.02; // just below the wall tops, to avoid z-fighting with them

export function Ceiling({
  grid,
  baseY = 0,
  skip,
  onPick,
}: {
  grid: CompiledGrid;
  baseY?: number;
  /** The stairwell, seen from below — leave it open or the stairs run into a lid. */
  skip?: readonly Cell[];
  onPick?: (at: Vec3) => void;
}) {
  return (
    <RoomTiles
      grid={grid}
      y={baseY + CEILING_Y}
      faceUp={false}
      defaultColor={DEFAULT_INTERIOR}
      skip={skip}
      onPick={onPick}
    />
  );
}