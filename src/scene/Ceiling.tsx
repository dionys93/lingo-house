// src/scene/Ceiling.tsx
//
// Interior ceilings — the same per-cell tiles as the floor, lifted to just below
// the wall tops and facing DOWN, in the room's interior colour (room.color ??
// DEFAULT_INTERIOR — the exact expression the walls use, so ceiling and interior
// walls always match). Single-sided facing down: invisible from outside (the roof
// covers the top anyway), visible when you look up from inside.

import { WALL_HEIGHT, type CompiledGrid } from '../core/grid';
import { DEFAULT_INTERIOR } from './wallMaterials';
import { RoomTiles } from './RoomTiles';

const CEILING_Y = WALL_HEIGHT - 0.02; // just below the wall tops, to avoid z-fighting with them

export function Ceiling({ grid }: { grid: CompiledGrid }) {
  return <RoomTiles grid={grid} y={CEILING_Y} faceUp={false} defaultColor={DEFAULT_INTERIOR} />;
}