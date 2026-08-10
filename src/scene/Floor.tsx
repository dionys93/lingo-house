// src/scene/Floor.tsx
//
// Interior floors — one CELL×CELL tile per cell, in the room's colour, just above
// the grass. Layout is shared with the ceiling via RoomTiles.

import { type CompiledGrid, type Vec3 } from '../core/grid';
import { RoomTiles } from './RoomTiles';

const FLOOR_Y = 0.02; // just above the grass (y=0) to avoid z-fighting
const DEFAULT_FLOOR = '#cfc9bd'; // rooms authored without a colour

export function Floor({ grid, onPick }: { grid: CompiledGrid; onPick?: (at: Vec3) => void }) {
  return <RoomTiles grid={grid} y={FLOOR_Y} faceUp defaultColor={DEFAULT_FLOOR} onPick={onPick} />;
}