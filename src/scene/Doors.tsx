// src/scene/Doors.tsx
//
// Renders each kind:'door' opening the core emitted: a lintel filling the wall
// above the door, and a panel hinged at one edge that swings on click. Nothing
// here is authored — hinge end, span, and orientation all come from the opening's
// a/b/axis; swing direction comes from `swing`. This is the first real
// interaction, and the click machinery interactive items will reuse later.

import { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CompiledGrid, CompiledOpening, WallSide } from '../core/grid';
import {
  WALL_THICKNESS,
  buildColorOf,
  faceColors,
  type Triple,
} from './wallMaterials';

type DoorOpening = Extract<CompiledOpening, { kind: 'door' }>;

const DOOR_THICKNESS = 0.04;
const DOOR_HEIGHT_FRAC = 0.82; // door is this fraction of the wall; the rest is lintel
const DOOR_GAP = 0.02; // panel slightly narrower than the opening, so it doesn't bind
const OPEN_ANGLE = (Math.PI / 2) * 0.9; // ~81° when open
const PANEL_COLOR = '#8a6f52'; // wood

function DoorInstance({
  opening,
  colorOf,
}: {
  opening: DoorOpening;
  colorOf: (side: WallSide) => string;
}) {
  const [open, setOpen] = useState(false);
  const hinge = useRef<THREE.Group>(null);

  const { a, b, axis, height, sides, swing } = opening;
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const doorHeight = height * DOOR_HEIGHT_FRAC;
  const midX = (a[0] + b[0]) / 2;
  const midZ = (a[2] + b[2]) / 2;

  // Lintel: the wall piece above the door, coloured like the wall it continues.
  const lintelSize: Triple =
    axis === 'z'
      ? [WALL_THICKNESS, height - doorHeight, len]
      : [len, height - doorHeight, WALL_THICKNESS];
  const lintelPos: Triple = [
    axis === 'z' ? a[0] : midX,
    (doorHeight + height) / 2,
    axis === 'z' ? midZ : a[2],
  ];
  const lintelColors = faceColors(axis, sides, colorOf);

  // Panel: hinged at `a`, extending toward `b`. Local to the hinge group, so the
  // group's Y-rotation swings it.
  const panelSize: Triple =
    axis === 'z'
      ? [DOOR_THICKNESS, doorHeight, len - DOOR_GAP]
      : [len - DOOR_GAP, doorHeight, DOOR_THICKNESS];
  const panelOffset: Triple =
    axis === 'z' ? [0, doorHeight / 2, len / 2] : [len / 2, doorHeight / 2, 0];

  // First-pass swing convention (validate visually; flip the sign if a door
  // swings the wrong way through its wall).
  const target = open ? (swing === 'in' ? OPEN_ANGLE : -OPEN_ANGLE) : 0;
  useFrame((_, delta) => {
    const g = hinge.current;
    if (g) g.rotation.y = THREE.MathUtils.damp(g.rotation.y, target, 9, delta);
  });

  return (
    <group>
      <mesh position={lintelPos}>
        <boxGeometry args={lintelSize} />
        {lintelColors.map((c, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={c} />
        ))}
      </mesh>

      <group ref={hinge} position={[a[0], 0, a[2]]}>
        <mesh
          position={panelOffset}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto';
          }}
        >
          <boxGeometry args={panelSize} />
          <meshStandardMaterial color={PANEL_COLOR} />
        </mesh>
      </group>
    </group>
  );
}

export function Doors({ grid }: { grid: CompiledGrid }) {
  const colorOf = useMemo(() => buildColorOf(grid.rooms), [grid.rooms]);
  const doors = grid.openings.filter((o): o is DoorOpening => o.kind === 'door');
  return (
    <>
      {doors.map((o) => (
        <DoorInstance key={o.id} opening={o} colorOf={colorOf} />
      ))}
    </>
  );
}