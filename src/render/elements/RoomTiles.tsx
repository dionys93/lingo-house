// src/render/elements/RoomTiles.tsx
//
// A flat CELL×CELL tile per cell of every room, at height `y`, coloured per room.
// Shared by Floor (faces up, at the base) and Ceiling (faces down, at wall-top) so
// the per-cell layout — which follows the room's actual cells, not its bounding
// box — lives in exactly one place. Reads CompiledRoom.floor (world cell centres);
// never recomputes the grid→world mapping. Double-sided so a ceiling reliably
// blocks the view up into the roof no matter which way it's turned.

import * as THREE from 'three';
import type { CompiledGrid, Vec3 } from '../../core/house/compiled';
import { CELL } from '../../core/house/scale';
import type { Cell } from '../../core/shared/errors';
import { pickable } from '../three/pickable';
import { BLOCKS, CATCHES } from '../../core/style/shadows';

export function RoomTiles({
  grid,
  y,
  faceUp,
  defaultColor,
  onPick,
  skip = [],
}: {
  grid: CompiledGrid;
  y: number;
  faceUp: boolean;
  defaultColor: string;
  onPick?: (at: Vec3) => void;
  /** Cells to leave open — a stairwell. Matched by CELL, which is why this maps
   *  over `room.cells` and indexes `room.floor`: the two are index-aligned. */
  skip?: readonly Cell[];
}) {
  const rotX = faceUp ? -Math.PI / 2 : Math.PI / 2;
  // Undefined onPick = not pickable at all, rather than a no-op handler that
  // would still swallow clicks meant for whatever is behind the tile.
  const picks = onPick ? pickable(onPick) : {};
  // Derived from faceUp, not a second prop: a floor faces up and catches, a
  // ceiling faces down and blocks. Two props could disagree; one cannot.
  const shadow = faceUp ? CATCHES : BLOCKS;
  return (
    <>
      {grid.rooms.flatMap((room) =>
        room.cells.flatMap((cell, i) => {
          if (skip.some((s) => s[0] === cell[0] && s[1] === cell[1])) return [];
          const centre = room.floor[i];
          return (
          <mesh
            key={`${room.key}-${i}`}
            position={[centre[0], y, centre[2]]}
            rotation={[rotX, 0, 0]}
            {...shadow}
            {...picks}
          >
            <planeGeometry args={[CELL, CELL]} />
            <meshStandardMaterial color={room.color ?? defaultColor} side={THREE.DoubleSide} />
          </mesh>
          );
        }),
      )}
    </>
  );
}