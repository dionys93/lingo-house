// src/scene/Walls.tsx
//
// The wall factory — consumes core output and does nothing but read geometry and
// pick materials. Each wall is a box extruded from its centreline (a → b) up to
// `height`, THICKNESS added by the shell. Colour is driven by `sides`: each broad
// face wears the colour of the room on that side, or siding where it meets
// 'outside'. Colour/thickness/face-mapping now live in wallMaterials, shared with
// Doors so the door's lintel matches the wall around it.

import { useMemo } from 'react';
import type { CompiledGrid, CompiledWall } from '../core/grid';
import { WALL_THICKNESS, buildColorOf, faceColors, type Triple } from './wallMaterials';

function boxFor(wall: CompiledWall): { size: Triple; pos: Triple } {
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[2] - wall.a[2]);
  const pos: Triple = [(wall.a[0] + wall.b[0]) / 2, wall.a[1] + wall.height / 2, (wall.a[2] + wall.b[2]) / 2];
  const size: Triple =
    wall.axis === 'z' ? [WALL_THICKNESS, wall.height, len] : [len, wall.height, WALL_THICKNESS];
  return { size, pos };
}

function WallMesh({
  wall,
  colorOf,
}: {
  wall: CompiledWall;
  colorOf: (side: string) => string;
}) {
  const { size, pos } = boxFor(wall);
  const colors = faceColors(wall.axis, wall.sides, colorOf);
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      {colors.map((c, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={c} />
      ))}
    </mesh>
  );
}

export function Walls({ grid }: { grid: CompiledGrid }) {
  const colorOf = useMemo(() => buildColorOf(grid.rooms), [grid.rooms]);
  return (
    <>
      {grid.walls.map((wall, i) => (
        <WallMesh key={i} wall={wall} colorOf={colorOf} />
      ))}
    </>
  );
}
