// src/render/scenes/HouseScene.tsx
//
// The real, explorable house — compiles the authored plan and wires navigation
// (door graph → reducer, door click → traverse, CameraRig through doorways,
// OrbitControls outside / InteriorControls in a room). App toggles between this
// and the sandbox.

import { useCallback, useMemo, useReducer, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { compileHouse } from '../../core/house/house';
import { CELL } from '../../core/house/grid';
import { describeError, type HouseError } from '../../core/shared/errors';
import { buildNavGraph } from '../../core/house/nav';
import { locationOf, startWalking, walkReducer, type Stance } from '../../core/session/walk';
import { locationAt } from '../../core/house/locate';
import { blocksDoorway, blockersFor, doorwayOf, stairwellOf, type Vec2 } from '../../core/house/collide';
import { explorerReducer, START_EXPLORER, type Selection } from '../../core/session/explorer';
import { describe as describeSelection } from '../../core/house/describe';
import { HOUSE } from '../../content/rooms';
import { LABELS } from '../../content/labels';
import { Ground } from '../elements/Ground';
import { Roof } from '../elements/Roof';
import { Stairs } from '../elements/Stairs';
import { SurfaceProvider } from '../surfaces/SurfaceProvider';
import { HouseLights } from '../stage/HouseLights';
import { rigFor } from '../../core/style/lights';
import { BODY_RADIUS, EYE, WalkControls } from '../stage/WalkControls';
import { ScenePost } from '../stage/ScenePost';
import { Storey } from '../elements/Storey';
import { SelectionPopup } from '../ui/SelectionPopup';
import { LanguageBar } from '../ui/LanguageBar';

function ErrorPanel({ errors }: { errors: readonly HouseError[] }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        maxWidth: 440,
        padding: '12px 16px',
        borderRadius: 8,
        background: 'rgba(120, 20, 20, 0.92)',
        color: '#fff',
        font: '13px/1.55 ui-monospace, monospace',
      }}
    >
      <strong>Plan did not compile</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        {errors.map((e, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            {describeError(e)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HouseScene() {
  const result = useMemo(() => compileHouse(HOUSE), []);
  const house = result.ok ? result.value : null;

  // Doors from every storey in one flat list. That's safe precisely because
  // opening ids are unique house-wide — the M2 gate decision cashing out: nav
  // and labels never need to know a level.
  const openings = useMemo(() => house?.storeys.flatMap((s) => s.grid.openings) ?? [], [house]);

  // Where the camera may stand in each room, derived from the tiles it can
  // actually stand on — the room's floor minus the stairwell. Computed here
  // because only the storey knows which cells are open.
  // `vantages` deleted with the teleport: per-room camera positions only meant
  // something when arriving at a room WAS the movement.

  // Doors AND stairs — one graph, so climbing is the same kind of move as
  // walking through a doorway.
  const graph = useMemo(() => buildNavGraph(openings, house?.stairs ?? []), [openings, house]);
  // The GROUND floor, used only for where you spawn. Everything that should
  // follow you around the house uses `standingOn` below.
  const ground = house?.storeys[0] ?? null;

  // Spawn on the lawn, in front of the house, facing it. Doors open on click
  // now, so arriving at your own front door is possible in a way it wasn't
  // while they were all shut.
  const start = useMemo<Vec2>(() => {
    const b = ground?.grid.footprint.bbox;
    return b ? [(b.x0 + b.x1) / 2, b.z1 + 1.2] : [0, 2];
  }, [ground]);

  const [walk, dispatch] = useReducer(walkReducer, 'outside', startWalking);
  const [explorer, explore] = useReducer(explorerReducer, START_EXPLORER);

  // Derived from POSITION now, not stored. Cheap and pure, so no memo.
  const rig = rigFor(locationOf(walk));
  const walkLevel = walk.tag === 'walking' ? walk.level : walk.to.level;

  /**
   * The storey you're actually on.
   *
   * This was `ground` in three places and each one was wrong the moment you
   * climbed the stairs. The visible symptom was that upstairs doors wouldn't
   * open, and the chain is worth writing down because it's four steps long and
   * none of them looks like a door bug:
   *
   *   locationAt(pos, ground.grid) reports a GROUND-FLOOR room while you stand
   *   on the landing → describe() asks graph.traverse(thatRoom, upstairsDoorId)
   *   → no edge, because that door doesn't touch a downstairs room → describe
   *   returns the subject with NO action → the popup names the door and offers
   *   nothing to click.
   *
   * Two quieter bugs shared the same cause: upstairs had no collision at all
   * (blockersFor read the ground floor's walls), and the light rig was picking
   * the room underneath you.
   */
  const standingOn = house?.storeys.find((st) => st.level === walkLevel) ?? null;

  // Walls, shut doors and furniture, flattened to 2D. Rebuilt when a door opens,
  // which is the only thing that changes them.
  const blockers = useMemo(
    () =>
      standingOn && house
        ? [
          ...blockersFor(
            standingOn.grid.walls,
            standingOn.grid.openings,
            standingOn.grid.items.map((i) => i.bounds),
            walk.openDoors,
          ),
          // A stair blocks the storey it rises from AND the one it rises into —
          // the flight below, the hole above. Same footprint, two reasons.
          ...house.stairs
            .filter((st) => st.level === walkLevel || st.level + 1 === walkLevel)
            .flatMap((st) => stairwellOf(st.treads, CELL)),
        ]
        : [],
    [standingOn, house, walkLevel, walk.openDoors],
  );

  // Mirrored in a ref, not state: onAct needs to know where you're standing, and
  // a door click is far too rare to justify re-rendering the house at 60Hz to
  // keep a copy fresh.
  const here = useRef<Vec2>(start);

  const onMoved = useCallback(
    (pos: Vec2) => {
      here.current = pos;
      if (!standingOn) return;
      dispatch({ tag: 'entered', location: locationAt(pos, standingOn.grid) });
    },
    [standingOn],
  );

  const baseYOf = useCallback(
    (level: number) => house?.storeys.find((st) => st.level === level)?.baseY ?? 0,
    [house],
  );

  // DERIVED, not synced: the popup exists only while you're standing still in a
  // place, and describe() resolves the words from that place. Walk through a
  // door and it's gone; no effect watching nav, nothing to forget to clear, and
  // no way for the two reducers to disagree.
  const described =
    house && explorer.selected !== null && walk.tag === 'walking'
      ? describeSelection(
          explorer.selected,
          walk.location,
          house,
          graph,
          LABELS,
          explorer.from,
          explorer.to,
          walk.openDoors,
        )
      : null;

  const select = useCallback((selection: Selection) => explore({ tag: 'select', selection }), []);
  const onDismiss = useCallback(() => explore({ tag: 'dismiss' }), []);
  // Traversal is now an ACT OF READING: it happens from the popup's phrase
  // button, and closes the popup so the next room starts clean.
  // The click that used to fly the camera through a doorway now just unlatches
  // it. Everything upstream of this line — pickable, select, describe, the popup
  // — is untouched; only what the popup's action DOES has changed.
  const onAct = useCallback(
    (edgeId: string) => {
      const stair = house?.stairs.find((st) => st.id === edgeId);
      if (stair) {
        // WHICH WAY. `stair.level` is the storey it climbs OUT of, so standing on
        // it means up and standing above it means down. This used to be hardcoded
        // to `level + 1`, so clicking a stair from the landing sent you upstairs
        // again — descending didn't exist rather than being merely unpolished.
        const goingUp = walkLevel === stair.level;
        const land = goingUp ? stair.arrival : stair.departure;

        // Face the way you travelled. `yaw: 0` meant you always arrived looking
        // down -Z, which upstairs put your back to the landing you'd just
        // climbed to. The camera looks along -Z at yaw 0, so a heading (dx, dz)
        // is atan2(-dx, -dz).
        const first = stair.treads[0];
        const last = stair.treads[stair.treads.length - 1];
        const dx = (last[0] - first[0]) * (goingUp ? 1 : -1);
        const dz = (last[2] - first[2]) * (goingUp ? 1 : -1);

        // The NEAR end of the flight — the foot going up, the top landing
        // coming down. Walked to first so the climb itself runs along the stair
        // instead of cutting through it.
        const near = goingUp ? stair.departure : stair.arrival;
        const heading = Math.atan2(-dx, -dz);

        dispatch({
          tag: 'climb',
          edgeId,
          via: {
            level: walkLevel,
            pos: [near[0], near[2]],
            // Already facing up the flight by the time you get there, so leg 2
            // is pure travel and the turn happens while you're still walking.
            yaw: heading,
          },
          to: {
            level: goingUp ? stair.level + 1 : stair.level,
            pos: [land[0], land[2]],
            yaw: heading,
          },
          toLocation: goingUp ? stair.connects[1] : stair.connects[0],
        });
      } else {
        // Opening never traps. CLOSING can: sealing the gap you're standing in
        // restores a wall segment through your own position, and `slide` reads a
        // path that starts on a segment as blocked in every direction — you'd
        // stop being able to move at all. So a door you're standing in refuses
        // to shut, which is also how doors work.
        const door = standingOn?.grid.openings.find((o) => o.id === edgeId);
        const shutting = walk.openDoors.has(edgeId);
        const inTheWay =
          shutting && door !== undefined && blocksDoorway(here.current, doorwayOf(door), BODY_RADIUS);
        if (!inTheWay) dispatch({ tag: 'toggleDoor', doorId: edgeId });
      }
      explore({ tag: 'dismiss' });
    },
    [house, standingOn, walk.openDoors, walkLevel],
  );

  const onArrived = useCallback(() => dispatch({ tag: 'arrived' }), []);
  const climbTo: Stance | null = walk.tag === 'climbing' ? walk.to : null;
  const climbVia: Stance | null = walk.tag === 'climbing' ? walk.via : null;

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/* `shadows` enables the shadow map. Without it every castShadow and
          receiveShadow flag in the scene is inert — which is exactly what was
          wrong here while the lab looked fine. */}
      <Canvas shadows dpr={[1, 2]} camera={{ position: [start[0], EYE, start[1]], fov: 65 }}>
        <color attach="background" args={['#dce8f5']} />
        <fog attach="fog" args={['#dce8f5', 18, 38]} />
        <HouseLights rig={rig} />
        {/* SurfaceProvider hoisted ABOVE Ground and outside the `house &&` guard.
            It used to sit below both, so Ground — the only consumer of the grass
            surface — rendered outside the provider and fell back to flat colour.
            Unconditional now, so a plan that fails to compile still shows ground
            rather than empty sky. */}
        <SurfaceProvider>
          <Ground />
          {house && (
            <>
              {house.storeys.map((storey) => (
                <Storey
                  key={storey.level}
                  storey={storey}
                  openDoors={walk.openDoors}
                  selectedItemId={explorer.selected?.on === 'item' ? explorer.selected.id : null}
                  select={select}
                />
              ))}
              {/* Once, on top — the roof belongs to the house, not to a storey. */}
              <Stairs stairs={house.stairs} onPick={(id) => select({ on: 'stair', id })} />
              {/* One per uncovered rectangle: the top storey's own, plus the
                  lower roof over anything it doesn't cover. Keyed by index
                  because a roof has no identity of its own — it's derived. */}
              {house.roofs.map((rf, i) => (
                <Roof
                  key={i}
                  roof={rf}
                  onPick={(at) => select({ on: 'part', part: 'roof', at })}
                />
              ))}
              {described && (
                <SelectionPopup
                  described={described}
                  from={explorer.from}
                  to={explorer.to}
                  onAct={onAct}
                  onDismiss={onDismiss}
                />
              )}
            </>
          )}
        </SurfaceProvider>
        <ScenePost ao={rig.ao} />
        <WalkControls
          blockers={blockers}
          start={start}
          startYaw={Math.PI}
          level={walkLevel}
          baseYOf={baseYOf}
          climbTo={climbTo}
          climbVia={climbVia}
          onArrived={onArrived}
          onMoved={onMoved}
        />
      </Canvas>
      <LanguageBar from={explorer.from} to={explorer.to} dispatch={explore} />
      {!result.ok && <ErrorPanel errors={result.error} />}
    </div>
  );
}