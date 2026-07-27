// src/scene/RoomTiles.tsx
//
// A flat CELL×CELL tile per cell of every room, at height `y`, coloured per room.
// Shared by Floor (faces up, at the base) and Ceiling (faces down, at wall-top) so
// the per-cell layout — which follows the room's actual cells, not its bounding
// box — lives in exactly one place. Reads CompiledRoom.floor (world cell centres);
// never recomputes the grid→world mapping. Double-sided so a ceiling reliably
// blocks the view up into the roof no matter which way it's turned.

import * as THREE from 'three';
import { CELL, type CompiledGrid } from '../core/grid';

export function RoomTiles({
  grid,
  y,
  faceUp,
  defaultColor,
}: {
  grid: CompiledGrid;
  y: number;
  faceUp: boolean;
  defaultColor: string;
}) {
  const rotX = faceUp ? -Math.PI / 2 : Math.PI / 2;
  return (
    <>
      {grid.rooms.flatMap((room) =>
        room.floor.map((centre, i) => (
          <mesh
            key={`${room.key}-${i}`}
            position={[centre[0], y, centre[2]]}
            rotation={[rotX, 0, 0]}
          >
            <planeGeometry args={[CELL, CELL]} />
            <meshStandardMaterial color={room.color ?? defaultColor} side={THREE.DoubleSide} />
          </mesh>
        )),
      )}
    </>
  );
}