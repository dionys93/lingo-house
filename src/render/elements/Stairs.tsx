// src/render/elements/Stairs.tsx
//
// The staircase.
//
// Two ideas taken from react-planner's simple-stair, both of which are the
// difference between a stack of boxes and a stair:
//
//   THE BLONDEL RULE  2 × riser + going ≈ 63cm is the ergonomic relation real
//                     stairs are proportioned by. Given a rise and a run it
//                     yields the step COUNT, rather than picking one by eye —
//                     which is what makes the flight read at the right rhythm.
//                     react-planner solves it as a = 63h / (d + 2h).
//   A SAWTOOTH PROFILE  the side of a flight is a stepped polygon, not a plank.
//                     Building it as a THREE.Shape and extruding gives the true
//                     silhouette, with every nose and riser visible in profile.
//                     A rotated box only ever approximates that diagonal.
//
// Deliberately NOT taken: react-planner loads its textures inside the per-mesh
// render path and never disposes them. Ours come from the provider.
//
// The compiler emits one tread per grid CELL, because cells are what the
// stairwell hole and the nav graph are made of. How many steps to DRAW is a
// separate, purely visual question — answered here, by Blondel.
//
// The whole flight is built in its OWN frame — origin at the bottom nose on the
// floor, +Z up the flight, +X the climber's left — then placed with one position
// and one Y rotation.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { boxMesh } from '../../core/geometry/mesh';
import { meshGeometry } from '../three/meshGeometry';
import type { CompiledStair } from '../../core/house/house';
import { CELL, type Vec3 } from '../../core/house/grid';
import { pickable } from '../three/pickable';
import { SurfaceMaterialSlot, useTiledSurface } from '../surfaces/SurfaceProvider';
import { SOLID } from '../../core/style/shadows';

type Triple = [number, number, number];

// This house is stylised at roughly 1 unit ≈ 2m, so Blondel's 63cm constant
// becomes 0.315 in world units. Kept as a named ratio rather than a magic
// number so the relation stays legible if the scale ever changes.
const BLONDEL = 0.315;

const WIDTH = CELL * 0.86; // between the inside faces of the stringers
const TREAD_T = 0.03;
const NOSING = 0.022; // tread overhang — this is what casts the step's shadow line
const STRINGER_T = 0.028;
const STRINGER_DROP = 0.075; // how far the profile hangs below the nose line
const RAIL_H = 0.4;
/**
 * Steps left clear at the FOOT of the flight, before the balustrade starts.
 *
 * Counted in STEPS rather than world units, and that's the point: a newel landing
 * exactly on a nosing is what makes the start of a rail read as deliberate. Half
 * a cell happened to be two steps on this flight and would land mid-tread on a
 * flight with any other proportions — Blondel picks the step count from the rise
 * and run, so it isn't a number to hardcode against.
 *
 * Set to 0 for a rail that runs the whole flight.
 */
const RAIL_ENTRY_STEPS = 3;
const RAIL_R = 0.017;
const POST = 0.028;

const RISER_COLOR = '#efe7d8'; // painted risers against wood treads: the tonal
// Shown until the surface resolves. The tinted oak's measured mean, so the
// stairs don't visibly change colour a frame after they appear.
const TIMBER_FALLBACK = '#966C4C';
const METAL = '#57534d'; // contrast is most of what separates one step from the next

/** Blondel: how many steps a flight of this rise and run wants. */
function stepCount(rise: number, run: number): number {
  // a = 63h / (d + 2h) is the riser height the rule implies; the count follows.
  const riser = (BLONDEL * rise) / (run + 2 * rise);
  return Math.max(2, Math.round(rise / riser));
}

/** The stepped side of a flight, as a closed polygon in the Z/Y plane. */
function stringerShape(n: number, going: number, riser: number, drop: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  // Up the sawtooth: riser, then tread, for each step.
  for (let i = 0; i < n; i++) {
    shape.lineTo(i * going, (i + 1) * riser);
    shape.lineTo((i + 1) * going, (i + 1) * riser);
  }
  // Back down the underside and close. The bottom end lands exactly ON the
  // floor (y = 0) rather than `drop` below it — a stringer rests on the floor,
  // and hanging it under would poke through the ground-floor tiles from below.
  shape.lineTo(n * going, n * riser - drop);
  shape.lineTo(0, 0);
  shape.closePath();
  return shape;
}

function Flight({ stair, onPick }: { stair: CompiledStair; onPick?: () => void }) {
  const cells = stair.treads.length;
  const runLen = cells * CELL;
  const n = stepCount(stair.rise, runLen);
  const riser = stair.rise / n;
  const going = runLen / n;
  const pitch = Math.atan2(stair.rise, runLen);

  const first = stair.treads[0];
  const last = stair.treads[cells - 1];
  const dir = useMemo<Vec3>(
    () =>
      cells > 1
        ? [Math.sign(last[0] - first[0]), 0, Math.sign(last[2] - first[2])]
        : [0, 0, 1],
    [first, last, cells],
  );

  // The compiler's first tread is the top of the first CELL, so the floor is one
  // cell-riser below it — not one drawn-step riser.
  const floorY = first[1] - stair.rise / cells;
  const origin: Triple = [first[0] - dir[0] * (CELL / 2), floorY, first[2] - dir[2] * (CELL / 2)];
  const yaw = Math.atan2(dir[0], dir[2]);

  const profile = useMemo(
    () =>
      new THREE.ExtrudeGeometry(stringerShape(n, going, riser, STRINGER_DROP), {
        depth: STRINGER_T,
        bevelEnabled: false,
      }),
    [n, going, riser],
  );
  useMemo(() => () => profile.dispose(), [profile]);

  // ONE surface for every piece of stair timber, and the same one the interior
  // doors use — the STEPS' wood, darkened by a tint, carried to the doors. That is only meaningful because both sides are metric now: a
  // tread and a door show the same physical plank because each carries its own
  // true extent, not because anyone matched two numbers by hand.
  //
  // This replaced three `useSurfaceMaterial` calls whose clamped integer repeat
  // was measurably wrong — tread −26% × +56%, stringer −27% × +5%, rail +4% ×
  // +371%. Pointing the old hook at a shared key would have given three
  // different plank sizes wearing the same name.
  const timber = useTiledSurface('wood.oak');

  // GRAIN RUNS WITH THE BOARD, and `grain` says so directly instead of being
  // smuggled in through the order of a size pair. A tread is a board laid
  // ACROSS the flight, so its grain runs along x; the rail runs UP it, so along
  // z. Getting this backwards lays the grain across the plank, which is exactly
  // how the first version looked wrong however good the texture was.
  //
  // Every tread is identical, so they share ONE geometry rather than minting a
  // BoxGeometry per step.
  const treadGeo = useMemo(
    () => meshGeometry(boxMesh([WIDTH, TREAD_T, going + NOSING], 'x')),
    [going],
  );
  useEffect(() => () => treadGeo.dispose(), [treadGeo]);

  const picks = onPick ? pickable(() => onPick()) : {};

  const steps = Array.from({ length: n }, (_, i) => ({
    i,
    top: (i + 1) * riser,
    front: i * going,
  }));

  const sideX = (side: 'left' | 'right') =>
    (side === 'left' ? 1 : -1) * (WIDTH / 2 + STRINGER_T / 2);

  // The balustrade's own span, clear of the foot. Kept as plain numbers in the
  // flight's local frame so the rail, its newels and its balusters all read from
  // one description instead of each re-deriving the slope.
  // Clamped in steps, not distance, so the clamp can't put the newel mid-tread
  // on a short flight either.
  const railStartZ = Math.min(RAIL_ENTRY_STEPS, Math.floor(n * 0.4)) * going;
  const railMidZ = (railStartZ + runLen) / 2;
  const railLen = Math.hypot(runLen - railStartZ, stair.rise * (1 - railStartZ / runLen));

  // Declared here rather than up with treadGeo because it depends on railLen,
  // which depends on railStartZ. Both open sides get the same rail, so one
  // geometry serves both.
  const railGeo = useMemo(
    () => meshGeometry(boxMesh([RAIL_R * 2, RAIL_R * 2, railLen], 'z')),
    [railLen],
  );
  useEffect(() => () => railGeo.dispose(), [railGeo]);

  /** Rail height at a point along the run — vertical offset above the nosing line. */
  const railY = (z: number) => RAIL_H - TREAD_T / 2 + (stair.rise * z) / runLen;

  return (
    <group position={origin} rotation={[0, yaw, 0]}>
      {/* Stringers: the sawtooth silhouette that makes a flight of the steps.
          The shape is built in the XY plane and extruded along +Z (that's what
          ExtrudeGeometry does), so it needs turning to stand along the flight.
          The rotation is NEGATIVE: +π/2 maps the shape's +X onto -Z and sends
          the whole beam backwards out through the front of the house, which is
          exactly what it did. -π/2 lays it along +Z, up the stairs.
          After that turn the plank occupies x ∈ [-T, 0], hence the +T/2 nudge
          to centre it on the stringer line. */}
      {(['left', 'right'] as const).map((side) => (
        <mesh
          {...SOLID}
          key={side}
          geometry={profile}
          position={[sideX(side) + STRINGER_T / 2, 0, 0]}
          rotation={[0, -Math.PI / 2, 0]}
          {...picks}
        >
          <SurfaceMaterialSlot material={timber} color={TIMBER_FALLBACK} roughness={0.9} />
        </mesh>
      ))}

      {steps.map(({ i, top, front }) => (
        <group key={i}>
          {/* Tread, overhanging its riser: the overhang is the shadow line. */}
          <mesh
            geometry={treadGeo}
            position={[0, top - TREAD_T / 2, front + (going - NOSING) / 2]}
            {...SOLID}
            {...picks}
          >
            <SurfaceMaterialSlot material={timber} color={TIMBER_FALLBACK} roughness={0.85} />
          </mesh>

          {/* Riser, set back behind the nose so the tread reads as a board. */}
          <mesh position={[0, top - riser / 2 - TREAD_T / 2, front + NOSING]} {...SOLID} {...picks}>
            <boxGeometry args={[WIDTH, riser - TREAD_T, 0.018]} />
            <meshStandardMaterial color={RISER_COLOR} roughness={0.95} />
          </mesh>
        </group>
      ))}

      {/* Balustrade — open flanks only; against a wall it reads as a mistake. */}
      {stair.openSides.map((side) => {
        const x = sideX(side) + (side === 'left' ? 1 : -1) * 0.012;
        return (
          <group key={side}>
            {/*
              Offset VERTICALLY above the nosing line, not perpendicular to the
              slope. Perpendicular was the bug: displacing the centre normal to
              the slope translates the rail ALONG the slope as well as away from
              it, by RAIL_H·sin(pitch). At this pitch that's 0.25 — so the rail
              began a quarter-unit BELOW the bottom nose and ended a quarter-unit
              short of the top. The flight's origin sits on the wall centreline,
              which is how that overhang ended up outside the house.

              A real handrail is measured vertically from the nosing anyway, so
              the fix is also the more correct construction.
            */}
            <mesh
              {...SOLID}
              geometry={railGeo}
              position={[x, railY(railMidZ), (railStartZ + runLen) / 2]}
              rotation={[-pitch, 0, 0]}
            >
              <SurfaceMaterialSlot material={timber} color={TIMBER_FALLBACK} roughness={0.6} />
            </mesh>

            {/* Balusters every other step — one per step is a picket fence at
                this count, and the rhythm is what reads, not the number. */}
            {steps
              .filter(({ i, front }) => i % 2 === 0 && front + going / 2 >= railStartZ)
              .map(({ i, top, front }) => (
                <mesh key={i} position={[x, top + RAIL_H / 2 - TREAD_T, front + going / 2]} {...SOLID}>
                  <boxGeometry args={[POST * 0.4, RAIL_H, POST * 0.4]} />
                  <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.35} />
                </mesh>
              ))}

            {/* Newels: stouter, one at each end of the run. */}
            {[
              // Bottom newel moves up to where the rail now starts, so the post
              // isn't standing in the doorway of its own staircase.
              { y: railY(railStartZ) - (RAIL_H - TREAD_T) / 2, z: railStartZ },
              { y: stair.rise + RAIL_H / 2 - TREAD_T, z: runLen },
            ].map((p, k) => (
              <mesh key={k} position={[x, p.y, p.z]} {...SOLID}>
                <boxGeometry args={[POST, RAIL_H, POST]} />
                <meshStandardMaterial color={METAL} roughness={0.5} metalness={0.35} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

export function Stairs({
  stairs,
  onPick,
}: {
  stairs: readonly CompiledStair[];
  onPick?: (id: string) => void;
}) {
  return (
    <>
      {stairs.map((stair) => (
        <Flight key={stair.id} stair={stair} onPick={onPick ? () => onPick(stair.id) : undefined} />
      ))}
    </>
  );
}