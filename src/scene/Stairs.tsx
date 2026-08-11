// src/scene/Stairs.tsx
//
// The staircase. Every number here comes from the compiler: which cells the run
// occupies, how high each tread sits, where you arrive. This file only turns
// that into boxes.
//
// Each step is drawn as a solid block from the storey floor up to its own tread
// height, which is how a stylised staircase reads at this scale — a stack of
// rising slabs rather than open treads with a stringer. It also means there's
// nothing to see under the stairs, so no gap to fill.

import type { CompiledStair } from '../core/house';
import { CELL, type Vec3 } from '../core/grid';
import { pickable } from './pickable';

const TREAD = '#b8a684';
const RISER = '#9d8c6d';

// A little narrower than its cell so the run reads as a distinct object against
// the floor and the wall it sits along, rather than merging into both.
const WIDTH = CELL * 0.86;

function Step({ centre, floorY, onPick }: { centre: Vec3; floorY: number; onPick?: () => void }) {
  const height = centre[1] - floorY;
  if (height <= 1e-4) return null;
  return (
    <mesh
      position={[centre[0], floorY + height / 2, centre[2]]}
      {...(onPick ? pickable(() => onPick()) : {})}
    >
      <boxGeometry args={[WIDTH, height, WIDTH]} />
      {/* The top face is the tread you'd stand on; the rest is the riser block. */}
      {[RISER, RISER, TREAD, RISER, RISER, RISER].map((c, i) => (
        <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.85} />
      ))}
    </mesh>
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
      {stairs.map((stair) => {
        // `treads` are the TOP of each step; the flight starts at the floor of
        // the storey it climbs out of, which is the first tread minus one riser.
        const floorY = stair.treads[0][1] - stair.rise / stair.treads.length;
        return stair.treads.map((centre, i) => (
          <Step
            key={`${stair.id}-${i}`}
            centre={centre}
            floorY={floorY}
            onPick={onPick ? () => onPick(stair.id) : undefined}
          />
        ));
      })}
    </>
  );
}