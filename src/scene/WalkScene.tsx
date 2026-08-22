// src/scene/WalkScene.tsx
//
// Slices 1 and 3: stand in the house at eye height and walk around it.
//
// This is still a GATE as much as a feature. The numbers say it's tight —
// reading WALL_HEIGHT 1.2 as a 2.4m ceiling fixes the scale at 1 unit = 2m,
// which everything else agrees with (CELL 0.5 = a 1m cell, WALL_THICKNESS 0.08 =
// 16cm), so the authored 6x6 house is a 36m² cabin you cross in four seconds.
// Whether that's liveable is the thing to find out before six more slices are
// built on it. If it isn't, the fix is AUTHORING — draw rooms 4x5 cells instead
// of 2x2. Changing CELL would invalidate every worldScale in the surface
// registry.
//
// Doors are all shut, because opening them is slice 5. You can walk around the
// ground floor and you cannot leave it — which is exactly what slice 3's
// done-condition asks for.

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { compileHouse } from '../core/house';
import { CELL } from '../core/grid';
import { HOUSE } from '../authoring/rooms';
import { blockersFor, type Vec2 } from '../core/collide';
import { EXTERIOR_RIG, INTERIOR_RIG } from './lights';
import { HouseLights } from './HouseLights';
import { ScenePost } from './ScenePost';
import { SurfaceProvider } from './surfaces/SurfaceProvider';
import { Ground } from './Ground';
import { Storey } from './Storey';
import { Roof } from './Roof';
import { Stairs } from './Stairs';
import { EYE, WalkControls } from './WalkControls';

const NO_OPEN_DOORS: ReadonlySet<string> = new Set();

export function WalkScene() {
  const result = useMemo(() => compileHouse(HOUSE), []);
  const house = result.ok ? result.value : null;
  const ground = house?.storeys[0] ?? null;

  // Walls, shut doors and furniture, flattened to 2D segments. Recomputed only
  // when the house changes, which is never — but it's derived, not stored.
  const blockers = useMemo(
    () =>
      ground
        ? blockersFor(
          ground.grid.walls,
          ground.grid.openings,
          ground.grid.items.map((i) => i.bounds),
          NO_OPEN_DOORS,
        )
        : [],
    [ground],
  );

  // Spawns INSIDE, and that's deliberate for now: doors don't open until slice
  // 5, so a spawn outside would be a spawn locked out. Flip this to a point on
  // the lawn the moment doors work — arriving at your own front door is the
  // better opening, and it's one line.
  //
  // DERIVED, not hardcoded. `slide` requires a legal starting point and quietly
  // does nothing useful from inside a wall, so the spawn is the centre of a real
  // floor cell rather than a coordinate I guessed and hoped was in a room.
  const start = useMemo<Vec2>(() => {
    const cell = ground?.grid.rooms[0]?.floor[0];
    return cell ? [cell[0], cell[2]] : [0, 0];
  }, [ground]);

  // Standing inside, so the interior rig — the same one rigFor will select once
  // locationAt exists (slice 4). Hardcoded here because rigFor still reads
  // nav.location, which continuous movement is about to delete.
  const rig = INTERIOR_RIG;

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        // fov 65 rather than the orbit view's 50. A narrow lens makes a small
        // room look bigger than it is, which is the one way this could lie.
        // Position and rotation are set by WalkControls every frame; the values
        // here only matter for the first frame, because R3F applies this prop
        // once on mount and never again.
        camera={{ position: [start[0], EYE, start[1]], fov: 65 }}
      >
        <color attach="background" args={['#dce8f5']} />
        <HouseLights rig={rig} />
        <SurfaceProvider>
          <Ground />
          {house && (
            <>
              {house.storeys.map((storey) => (
                <Storey
                  key={storey.level}
                  storey={storey}
                  openDoors={NO_OPEN_DOORS}
                  selectedItemId={null}
                  select={() => {}}
                />
              ))}
              <Stairs stairs={house.stairs} />
              <Roof roof={house.roof} />
            </>
          )}
        </SurfaceProvider>
        <ScenePost ao={rig.ao ?? EXTERIOR_RIG.ao} />
        <WalkControls
          blockers={blockers}
          start={start}
          level={0}
          baseYOf={(l) => house?.storeys.find((st) => st.level === l)?.baseY ?? 0}
        />
      </Canvas>

      <div
        style={{
          position: 'absolute',
          bottom: 14,
          left: 14,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'rgba(17, 24, 39, 0.82)',
          color: '#fff',
          font: '13px/1.6 ui-sans-serif, system-ui',
        }}
      >
        <strong>W A S D</strong> walk · <strong>drag</strong> to look · <strong>← →</strong> turn
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>
          eye at {EYE * 2}m · cell = {CELL * 2}m · house ≈ {6 * CELL * 2}m across ·
          doors shut until slice 5
        </div>
      </div>
    </div>
  );
}