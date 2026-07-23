// src/scene/Walls.tsx
//
// The wall factory — the first component that consumes core output. It takes a
// CompiledGrid and does nothing but read geometry and pick materials: it never
// merges, never looks at the grid, never touches navigation. Each wall is a box
// extruded from its centerline (a → b) up to `height`, with THICKNESS added by
// the shell (the core deliberately emits centerline + height only).
//
// Colour is driven entirely by `sides` — each broad face wears the colour of the
// room on that side, or the house siding where it meets 'outside'. This is the
// two-sided-wall design finally realised: no nav-depth coupling, just "which
// room is on this face". Edge faces (top/bottom/ends) get a neutral trim.

import { useMemo } from 'react';
import type { CompiledGrid, CompiledWall } from '../core/grid';

const WALL_THICKNESS = 0.08; // shell constant — the core emits centreline + height only
const HOUSE_SIDING = '#dfd3c3'; // exterior default, shown wherever a face meets 'outside'
const DEFAULT_INTERIOR = '#d8d2c8'; // rooms authored without a colour
const TRIM = '#c4b8a4'; // top / bottom / end faces

type Triple = [number, number, number];

function boxFor(wall: CompiledWall): { size: Triple; pos: Triple } {
  const len = Math.hypot(wall.b[0] - wall.a[0], wall.b[2] - wall.a[2]);
  const pos: Triple = [(wall.a[0] + wall.b[0]) / 2, wall.height / 2, (wall.a[2] + wall.b[2]) / 2];
  const size: Triple =
    wall.axis === 'z' ? [WALL_THICKNESS, wall.height, len] : [len, wall.height, WALL_THICKNESS];
  return { size, pos };
}

// BoxGeometry face order is [+X, -X, +Y, -Y, +Z, -Z]. A 'z'-axis wall is thin in
// X, so its two broad faces are ±X; an 'x'-axis wall is thin in Z, so ±Z. neg is
// the smaller-coordinate side, pos the larger — matching how the core packs them.
function faceColors(wall: CompiledWall, colorOf: (side: string) => string): [string, string, string, string, string, string] {
  const neg = colorOf(wall.sides[0]);
  const pos = colorOf(wall.sides[1]);
  return wall.axis === 'z'
    ? [pos, neg, TRIM, TRIM, TRIM, TRIM]
    : [TRIM, TRIM, TRIM, TRIM, pos, neg];
}

function WallMesh({ wall, colorOf }: { wall: CompiledWall; colorOf: (side: string) => string }) {
  const { size, pos } = boxFor(wall);
  const colors = faceColors(wall, colorOf);
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
  const colorOf = useMemo(() => {
    const byKey = new Map(grid.rooms.map((r) => [r.key, r.color ?? DEFAULT_INTERIOR]));
    return (side: string): string =>
      side === 'outside' ? HOUSE_SIDING : (byKey.get(side) ?? DEFAULT_INTERIOR);
  }, [grid]);

  return (
    <>
      {grid.walls.map((wall, i) => (
        <WallMesh key={i} wall={wall} colorOf={colorOf} />
      ))}
    </>
  );
}