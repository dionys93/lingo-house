// src/scene/Windows.tsx
//
// Renders each kind:'window' opening: solid wall infill below the sill and above
// the head (coloured like the wall it continues, via shared wallMaterials), and
// the window itself between them — a frame, glass, and mullions whose look comes
// from the window's room (windowStyles). The core cut the whole edge; the shell
// fills sill/head and drops the styled window in the gap.

import { useMemo } from 'react';
import * as THREE from 'three';
import type { CompiledGrid, CompiledOpening } from '../core/grid';
import { pickable } from './pickable';
import { openingFloorY } from '../core/grid';
import { WALL_THICKNESS, buildColorOf, faceColors, type Triple } from './wallMaterials';
import { roomOf, styleForRoom } from './windowStyles';

type WindowOpening = Extract<CompiledOpening, { kind: 'window' }>;

const FRAME_W = 0.03; // frame + mullion bar thickness (in the window plane)
const FRAME_DEPTH = WALL_THICKNESS * 0.9; // how deep the frame sits in the wall
const GLASS_DEPTH = 0.02;

// A solid wall piece (sill or head infill), coloured two-sided like a real wall.
function Infill({
  opening,
  y0,
  y1,
  colorOf,
}: {
  opening: WindowOpening;
  y0: number;
  y1: number;
  colorOf: (side: string) => string;
}) {
  const { a, b, axis, sides } = opening;
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const midX = (a[0] + b[0]) / 2;
  const midZ = (a[2] + b[2]) / 2;
  const h = y1 - y0;
  if (h <= 1e-4) return null;
  const size: Triple = axis === 'z' ? [WALL_THICKNESS, h, len] : [len, h, WALL_THICKNESS];
  const pos: Triple = [axis === 'z' ? a[0] : midX, (y0 + y1) / 2, axis === 'z' ? midZ : a[2]];
  const colors = faceColors(axis, sides, colorOf);
  return (
    <mesh position={pos}>
      <boxGeometry args={size} />
      {colors.map((c, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={c} />
      ))}
    </mesh>
  );
}

// A frame/mullion bar, sized in the window's LOCAL frame (x = along the run,
// y = up, z = wall normal), then the whole group is oriented per axis.
function Bar({ w, h, x, y, color }: { w: number; h: number; x: number; y: number; color: string }) {
  return (
    <mesh position={[x, y, 0]}>
      <boxGeometry args={[w, h, FRAME_DEPTH]} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function WindowInstance({
  opening,
  colorOf,
  onPick,
}: {
  opening: WindowOpening;
  colorOf: (side: string) => string;
  onPick?: () => void;
}) {
  const { a, b, axis, height, sides, sill, head } = opening;
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const midX = (a[0] + b[0]) / 2;
  const midZ = (a[2] + b[2]) / 2;
  const style = styleForRoom(roomOf(sides));
  const floorY = openingFloorY(opening);

  // Orient the window group so local X runs along the opening, local Z = wall normal.
  const position: Triple = [axis === 'z' ? a[0] : midX, 0, axis === 'z' ? midZ : a[2]];
  const rotationY = axis === 'z' ? Math.PI / 2 : 0;

  const midY = (sill + head) / 2;
  const innerW = len - 2 * FRAME_W;
  const innerH = head - sill - 2 * FRAME_W;

  return (
    <group>
      {/* Wall below the sill and above the head. Both ends are measured from
          THIS storey's floor: with a hardcoded 0 the upstairs sill panel grew
          down through the whole ground floor, and the head panel came out with
          a negative height and silently vanished. */}
      <Infill opening={opening} y0={floorY} y1={sill} colorOf={colorOf} />
      <Infill opening={opening} y0={head} y1={floorY + height} colorOf={colorOf} />

      <group position={position} rotation={[0, rotationY, 0]} {...(onPick ? pickable(onPick) : {})}>
        {/* glass */}
        <mesh position={[0, midY, 0]}>
          <boxGeometry args={[innerW, innerH, GLASS_DEPTH]} />
          <meshStandardMaterial
            color={style.glass}
            transparent
            opacity={style.glassOpacity}
            roughness={style.glassRoughness}
            metalness={0}
          />
        </mesh>

        {/* frame: top, bottom, left, right */}
        <Bar w={len} h={FRAME_W} x={0} y={head - FRAME_W / 2} color={style.frame} />
        <Bar w={len} h={FRAME_W} x={0} y={sill + FRAME_W / 2} color={style.frame} />
        <Bar w={FRAME_W} h={head - sill} x={-(len / 2 - FRAME_W / 2)} y={midY} color={style.frame} />
        <Bar w={FRAME_W} h={head - sill} x={len / 2 - FRAME_W / 2} y={midY} color={style.frame} />

        {/* mullions per style */}
        {(style.mullion === 'horizontal' || style.mullion === 'cross') && (
          <Bar w={innerW} h={FRAME_W} x={0} y={midY} color={style.frame} />
        )}
        {(style.mullion === 'vertical' || style.mullion === 'cross') && (
          <Bar w={FRAME_W} h={innerH} x={0} y={midY} color={style.frame} />
        )}
      </group>
    </group>
  );
}

export function Windows({
  grid,
  onPick,
}: {
  grid: CompiledGrid;
  onPick?: (id: string) => void;
}) {
  const colorOf = useMemo(() => buildColorOf(grid.rooms), [grid.rooms]);
  const windows = grid.openings.filter((o): o is WindowOpening => o.kind === 'window');
  return (
    <>
      {windows.map((o) => (
        <WindowInstance
          key={o.id}
          opening={o}
          colorOf={colorOf}
          onPick={onPick ? () => onPick(o.id) : undefined}
        />
      ))}
    </>
  );
}