// src/scene/Floor.tsx
//
// Interior floors. Each room's floor is drawn as one CELL×CELL tile per cell,
// using the world-space centres the core emits (CompiledRoom.floor) — NOT the
// room's bounding box, so an L-shaped room's floor follows its actual cells and
// never spills into a notch. The shell only reads those centres and draws; it
// never recomputes the grid→world mapping.

import { CELL, type CompiledGrid } from '../core/grid';

const FLOOR_Y = 0.02; // just above the grass (y=0) to avoid z-fighting
const DEFAULT_FLOOR = '#cfc9bd'; // rooms authored without a colour

export function Floor({ grid }: { grid: CompiledGrid }) {
  return (
    <>
      {grid.rooms.flatMap((room) =>
        room.floor.map((centre, i) => (
          <mesh
            key={`${room.key}-${i}`}
            position={[centre[0], FLOOR_Y, centre[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[CELL, CELL]} />
            <meshStandardMaterial color={room.color ?? DEFAULT_FLOOR} />
          </mesh>
        )),
      )}
    </>
  );
}