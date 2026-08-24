// src/render/elements/Walls.tsx
//
// The wall factory — consumes core output and does nothing but read geometry and
// pick materials. Each wall is a box extruded from its centreline (a → b) up to
// `height`, THICKNESS added by the shell. Colour is driven by `sides`: each broad
// face wears the colour of the room on that side, or siding where it meets
// 'outside'. Colour/thickness/face-mapping now live in wallMaterials, shared with
// Doors so the door's lintel matches the wall around it.

import { useMemo } from 'react';
import { WALL_THICKNESS as WT, type CompiledGrid, type CompiledItem, type CompiledWall, type Vec3 } from '../../core/house/grid';
import { pickable } from '../three/pickable';
import { WALL_THICKNESS, buildColorOf, faceColors, type Triple, SIDING_ROUGHNESS } from '../../core/style/wallMaterials';
import { SOLID } from '../../core/style/shadows';

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
  onPick,
}: {
  wall: CompiledWall;
  colorOf: (side: string) => string;
  onPick?: (at: Vec3) => void;
}) {
  const { size, pos } = boxFor(wall);
  const colors = faceColors(wall.axis, wall.sides, colorOf);
  return (
    <mesh position={pos} {...SOLID} {...(onPick ? pickable(onPick) : {})}>
      <boxGeometry args={size} />
      {colors.map((c, i) => (
        <meshStandardMaterial
          key={i}
          attach={`material-${i}`}
          color={c}
          roughness={SIDING_ROUGHNESS}
        />
      ))}
    </mesh>
  );
}

// Is this wall the one `item` is bolted to? Wall-mounted items sit just off the
// inner face, so the test is: close to the wall's line, and within its run.
function carries(wall: CompiledWall, item: CompiledItem): boolean {
  const [px, , pz] = item.position;
  const along = wall.axis === 'z' ? [wall.a[2], wall.b[2]] : [wall.a[0], wall.b[0]];
  const at = wall.axis === 'z' ? pz : px;
  const across = wall.axis === 'z' ? Math.abs(px - wall.a[0]) : Math.abs(pz - wall.a[2]);
  const within = at >= Math.min(...along) && at <= Math.max(...along);
  // Half a wall plus a shallow item: anything further out is standing near the
  // wall, not hanging on it.
  return within && across <= WT / 2 + 0.12;
}

export function Walls({ grid, onPick }: { grid: CompiledGrid; onPick?: (at: Vec3) => void }) {
  // Only walls with something ON them are clickable. Every wall being a click
  // target meant the biggest surfaces in the scene produced the least
  // interesting popup — "la pared" fired constantly by accident and buried the
  // things worth reading. A wall with a TV on it is a wall you MEANT to look at.
  const hung = grid.items.filter((i) => i.mountedOn === 'wall');
  const colorOf = useMemo(() => buildColorOf(grid.rooms), [grid.rooms]);
  return (
    <>
      {grid.walls.map((wall, i) => (
        <WallMesh
          key={i}
          wall={wall}
          colorOf={colorOf}
          onPick={onPick && hung.some((it) => carries(wall, it)) ? onPick : undefined}
        />
      ))}
    </>
  );
}