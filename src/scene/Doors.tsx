// src/scene/Doors.tsx
//
// Renders each kind:'door' opening. Clicking a door SELECTS it; traversal happens
// from the popup's action button, so moving through the house means reading the
// phrase for it. A door swings open when it's in `openDoors`, so open/close is
// DERIVED from walk state, not a local toggle — one source of truth for "which
// door is open".
//
// The panel is the reason boxMesh anchors its UVs LOCALLY rather than in world
// space the way the roof does. A door ROTATES: world-anchored UVs on a hinged
// panel would have to be rebuilt every frame, or else be a lie that happens to
// be true only while the door is shut.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { boxMesh, rotatedY90 } from '../core/mesh';
import { panelDoorMesh, doorKnobMesh, CROSS_AND_BIBLE } from './doorMesh';
import { openingFloorY, type CompiledGrid, type CompiledOpening } from '../core/grid';
import { WALL_THICKNESS, buildColorOf, faceColors, type Triple } from './wallMaterials';
import { meshGeometry } from './roofGeometry';
import { SurfaceMaterialSlot, useTiledSurface, type SurfaceMaterial } from './surfaces/SurfaceProvider';
import { type SurfaceKey } from './surfaces/registry';
import { SOLID } from './shadows';

type DoorOpening = Extract<CompiledOpening, { kind: 'door' }>;

const DOOR_THICKNESS = 0.04;
const DOOR_GAP = 0.02;
const OPEN_ANGLE = (Math.PI / 2) * 0.9;
const PANEL_COLOR = '#966C4C'; // fallback — the tinted oak's measured mean
const KNOB_COLOR = '#B5944F'; // ditto — brass
const FRONT_PANEL_COLOR = '#8E3B34'; // ditto — or the front door flashes oak first
const DOOR_SURFACE: SurfaceKey = 'wood.oak';
const KNOB_SURFACE: SurfaceKey = 'metal.brass';
const FRONT_DOOR_SURFACE: SurfaceKey = 'paint.oxblood';

/**
 * A door onto the outside is the front door.
 *
 * DERIVED, not authored. The compiler already resolved both sides of every
 * opening, so no new field, no id matching against strings like `L0:h:9:2`
 * that mean nothing and would break the moment the house is redrawn.
 * `faceColors` makes exactly this test, and `describe` now makes it too — one
 * fact, three readers, no third place to keep in sync.
 */
const isFrontDoor = (o: DoorOpening): boolean => o.sides.includes('outside');

function DoorInstance({
  opening,
  colorOf,
  open,
  onPick,
  surface,
  knob,
}: {
  opening: DoorOpening;
  colorOf: (side: string) => string;
  open: boolean;
  onPick: () => void;
  // Hoisted to the parent: every door in the house is the same material, and
  // saying so once beats six independent hook calls that can drift apart.
  surface: SurfaceMaterial | null;
  knob: SurfaceMaterial | null;
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

  // `grain: 'y'` because stiles run UP a door. Getting this backwards lays the
  // boards across it — the same mistake Stairs.tsx already carries a scar for.
  //
  // Keyed on the three NUMBERS, not on `panelSize`: that array is a fresh
  // literal every render, so a dependency on it would rebuild and dispose a GPU
  // buffer on every single render.
  //
  // Not shared between the six doors, even though they are dimensionally
  // identical today. Sharing needs an extra rotation group (the z-axis panel is
  // the x-axis one turned a quarter) plus a size-keyed cache in the parent, to
  // save five buffers of twenty-four vertices. Not worth the machinery.
  const [panelW, panelH, panelD] = panelSize;
  // The front door is fifteen boxes merged into one mesh — 180 triangles, one
  // draw call. Its outer envelope is identical to the slab's (960 × 1968 × 80),
  // so the hinge offset and everything collision knows stay exactly as they are.
  // Interior doors keep the plain slab: panelling all six would cost 900
  // triangles to say something only the front door needs to say.
  const front = isFrontDoor(opening);
  const turned = axis === 'z';
  const panelGeo = useMemo(() => {
    // panelDoorMesh and doorKnobMesh are both built x-wide. A door on a wall
    // running north-south needs them turned — a real rotation, not an axis
    // swap, or every face ends up inside out.
    const m = front ? panelDoorMesh(CROSS_AND_BIBLE) : boxMesh([panelW, panelH, panelD], 'y');
    return meshGeometry(turned && front ? rotatedY90(m) : m);
  }, [front, turned, panelW, panelH, panelD]);
  useEffect(() => () => panelGeo.dispose(), [panelGeo]);

  // Every door gets one, front and back. Merged into a single mesh, so six
  // doors cost six draw calls rather than twenty-four.
  //
  // panelSize is [thickness, height, width] on a z-axis door and
  // [width, height, thickness] on an x-axis one, so the canonical pair has to
  // be un-permuted here before the mesh is built and turned back.
  const knobGeo = useMemo(() => {
    const m = doorKnobMesh({
      ...CROSS_AND_BIBLE,
      width: turned ? panelD : panelW,
      height: panelH,
      thickness: turned ? panelW : panelD,
    });
    return meshGeometry(turned ? rotatedY90(m) : m);
  }, [turned, panelW, panelH, panelD]);
  useEffect(() => () => knobGeo.dispose(), [knobGeo]);

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
          geometry={panelGeo}
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
          <SurfaceMaterialSlot
            material={surface}
            color={front ? FRONT_PANEL_COLOR : PANEL_COLOR}
          />
        </mesh>
        <mesh {...SOLID} geometry={knobGeo} position={panelOffset} raycast={() => null}>
          <SurfaceMaterialSlot material={knob} color={KNOB_COLOR} />
        </mesh>
      </group>
    </group>
  );
}

export function Doors({
  grid,
  openDoors,
  onPick,
}: {
  grid: CompiledGrid;
  openDoors: ReadonlySet<string>;
  // Clicking a door SELECTS it — traversal now happens from the popup's action
  // button, so that moving through the house means reading the phrase for it.
  onPick: (id: string) => void;
}) {
  const colorOf = useMemo(() => buildColorOf(grid.rooms), [grid.rooms]);
  const doors = grid.openings.filter((o): o is DoorOpening => o.kind === 'door');
  // No size argument — that is the whole point of the metric hook. The panel's
  // own UVs carry its extent, so all six faces get the same physical grain and
  // a door matches the stair treads without either knowing the other's size.
  const timber = useTiledSurface(DOOR_SURFACE);
  const knob = useTiledSurface(KNOB_SURFACE);
  const oxblood = useTiledSurface(FRONT_DOOR_SURFACE);
  return (
    <>
      {doors.map((o) => (
        <DoorInstance
          key={o.id}
          opening={o}
          colorOf={colorOf}
          open={openDoors.has(o.id)}
          onPick={() => onPick(o.id)}
          surface={isFrontDoor(o) ? oxblood : timber}
          knob={knob}
        />
      ))}
    </>
  );
}