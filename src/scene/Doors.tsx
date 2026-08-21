// src/scene/Doors.tsx
//
// Renders each kind:'door' opening, and is now the navigation trigger. Clicking a
// door dispatches `traverse` — the reducer decides if the move is legal and, if
// so, the CameraRig walks you through. A door swings open when it's the one being
// traversed (nav.edgeId), so open/close is DERIVED from nav state, not a local
// toggle — one source of truth for "which door is open".

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { openingFloorY, type CompiledGrid, type CompiledOpening } from '../core/grid';
import type { NavState } from '../core/nav';
import { WALL_THICKNESS, buildColorOf, faceColors, type Triple } from './wallMaterials';
import { SOLID } from './shadows';

type DoorOpening = Extract<CompiledOpening, { kind: 'door' }>;

const DOOR_THICKNESS = 0.04;
const DOOR_GAP = 0.02;
const OPEN_ANGLE = (Math.PI / 2) * 0.9;
const PANEL_COLOR = '#8a6f52';

function DoorInstance({
  opening,
  colorOf,
  open,
  onPick,
}: {
  opening: DoorOpening;
  colorOf: (side: string) => string;
  open: boolean;
  onPick: () => void;
}) {
  const hinge = useRef<THREE.Group>(null);

  const { a, b, axis, height, sides, swing } = opening;
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  // Comes from the compiler now, so the popup and the geometry can't disagree.
  const doorHeight = opening.head - opening.sill;
  // Everything vertical hangs off the storey floor, not off zero.
  const floorY = openingFloorY(opening);
  const midX = (a[0] + b[0]) / 2;
  const midZ = (a[2] + b[2]) / 2;

  const lintelSize: Triple =
    axis === 'z'
      ? [WALL_THICKNESS, height - doorHeight, len]
      : [len, height - doorHeight, WALL_THICKNESS];
  const lintelPos: Triple = [
    axis === 'z' ? a[0] : midX,
    floorY + (doorHeight + height) / 2,
    axis === 'z' ? midZ : a[2],
  ];
  const lintelColors = faceColors(axis, sides, colorOf);

  const panelSize: Triple =
    axis === 'z'
      ? [DOOR_THICKNESS, doorHeight, len - DOOR_GAP]
      : [len - DOOR_GAP, doorHeight, DOOR_THICKNESS];
  const panelOffset: Triple =
    axis === 'z' ? [0, doorHeight / 2, len / 2] : [len / 2, doorHeight / 2, 0];

  const target = open ? (swing === 'in' ? OPEN_ANGLE : -OPEN_ANGLE) : 0;
  useFrame((_, delta) => {
    const g = hinge.current;
    if (g) g.rotation.y = THREE.MathUtils.damp(g.rotation.y, target, 9, delta);
  });

  return (
    <group>
      <mesh position={lintelPos} {...SOLID}>
        <boxGeometry args={lintelSize} />
        {lintelColors.map((c, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={c} />
        ))}
      </mesh>

      <group ref={hinge} position={[a[0], floorY, a[2]]}>
        <mesh
          {...SOLID}
          position={panelOffset}
          onClick={(e) => {
            e.stopPropagation();
            onPick();
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

export function Doors({
  grid,
  nav,
  onPick,
}: {
  grid: CompiledGrid;
  nav: NavState;
  // Clicking a door SELECTS it — traversal now happens from the popup's action
  // button, so that moving through the house means reading the phrase for it.
  onPick: (id: string) => void;
}) {
  const colorOf = useMemo(() => buildColorOf(grid.rooms), [grid.rooms]);
  const doors = grid.openings.filter((o): o is DoorOpening => o.kind === 'door');
  return (
    <>
      {doors.map((o) => (
        <DoorInstance
          key={o.id}
          opening={o}
          colorOf={colorOf}
          open={nav.tag === 'moving' && nav.edgeId === o.id}
          onPick={() => onPick(o.id)}
        />
      ))}
    </>
  );
}