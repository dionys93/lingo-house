// src/scene/HouseScene.tsx
//
// The real, explorable house — compiles the authored plan and wires navigation
// (door graph → reducer, door click → traverse, CameraRig through doorways,
// OrbitControls outside / InteriorControls in a room). App toggles between this
// and the sandbox.

import { useCallback, useMemo, useReducer } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { compileHouse, type CompiledStorey } from '../core/house';
import { describeError, type HouseError } from '../core/errors';
import { buildNavGraph, makeNavReducer, START_OUTSIDE, type NavState } from '../core/nav';
import { explorerReducer, START_EXPLORER, type Selection } from '../core/explorer';
import { describe as describeSelection } from '../core/describe';
import { HOUSE } from '../authoring/rooms';
import { LABELS } from '../authoring/labels';
import { Ground } from './Ground';
import { Floor } from './Floor';
import { Ceiling } from './Ceiling';
import { Walls } from './Walls';
import { Roof } from './Roof';
import { Stairs } from './Stairs';
import { Items } from './Items';
import { Doors } from './Doors';
import { SelectionPopup } from './SelectionPopup';
import { LanguageBar } from './LanguageBar';
import { Windows } from './Windows';
import { CameraRig } from './CameraRig';
import { InteriorControls } from './InteriorControls';

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

// Everything that repeats per floor. Each storey draws its own walls, floors,
// ceilings, openings and items, all already in world space — the only thing it
// needs to be told about its level is where the stairwell leaves a gap.
function Storey({
  storey,
  nav,
  selectedItemId,
  select,
}: {
  storey: CompiledStorey;
  nav: NavState;
  selectedItemId: string | null;
  select: (selection: Selection) => void;
}) {
  const { grid, baseY, openFloor, openCeiling } = storey;
  return (
    <>
      <Floor
        grid={grid}
        baseY={baseY}
        skip={openFloor}
        onPick={(at) => select({ on: 'part', part: 'floor', at })}
      />
      <Ceiling
        grid={grid}
        baseY={baseY}
        skip={openCeiling}
        onPick={(at) => select({ on: 'part', part: 'ceiling', at })}
      />
      <Walls grid={grid} onPick={(at) => select({ on: 'part', part: 'wall', at })} />
      <Items
        grid={grid}
        selectedId={selectedItemId}
        onSelect={(id) => select({ on: 'item', id })}
      />
      <Doors grid={grid} nav={nav} onPick={(id) => select({ on: 'opening', id })} />
      <Windows grid={grid} onPick={(id) => select({ on: 'opening', id })} />
    </>
  );
}

export function HouseScene() {
  const result = useMemo(() => compileHouse(HOUSE), []);
  const house = result.ok ? result.value : null;

  // Doors and rooms are gathered across every storey. That's safe precisely
  // because room keys and opening ids are unique house-wide — the M2 gate
  // decision cashing out: nav, camera and labels never need to know a level.
  const openings = useMemo(() => house?.storeys.flatMap((s) => s.grid.openings) ?? [], [house]);
  const rooms = useMemo(() => house?.storeys.flatMap((s) => s.grid.rooms) ?? [], [house]);

  // Doors AND stairs — one graph, so climbing is the same kind of move as
  // walking through a doorway.
  const graph = useMemo(() => buildNavGraph(openings, house?.stairs ?? []), [openings, house]);
  const reducer = useMemo(() => makeNavReducer(graph), [graph]);
  const [nav, dispatch] = useReducer(reducer, START_OUTSIDE);
  const [explorer, explore] = useReducer(explorerReducer, START_EXPLORER);

  const outside = nav.tag === 'in' && nav.location === 'outside';

  // DERIVED, not synced: the popup exists only while you're standing still in a
  // place, and describe() resolves the words from that place. Walk through a
  // door and it's gone; no effect watching nav, nothing to forget to clear, and
  // no way for the two reducers to disagree.
  const described =
    house && explorer.selected !== null && nav.tag === 'in'
      ? describeSelection(
          explorer.selected,
          nav.location,
          house,
          graph,
          LABELS,
          explorer.from,
          explorer.to,
        )
      : null;

  const select = useCallback((selection: Selection) => explore({ tag: 'select', selection }), []);
  const onDismiss = useCallback(() => explore({ tag: 'dismiss' }), []);
  // Traversal is now an ACT OF READING: it happens from the popup's phrase
  // button, and closes the popup so the next room starts clean.
  const onAct = useCallback((edgeId: string) => {
    dispatch({ tag: 'traverse', edgeId });
    explore({ tag: 'dismiss' });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [4, 3.5, 5], fov: 50 }}>
        <color attach="background" args={['#dce8f5']} />
        <fog attach="fog" args={['#dce8f5', 18, 38]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <Ground />
        {house && (
          <>
            {house.storeys.map((storey) => (
              <Storey
                key={storey.level}
                storey={storey}
                nav={nav}
                selectedItemId={explorer.selected?.on === 'item' ? explorer.selected.id : null}
                select={select}
              />
            ))}
            {/* Once, on top — the roof belongs to the house, not to a storey. */}
            <Stairs stairs={house.stairs} onPick={(id) => select({ on: 'stair', id })} />
            <Roof roof={house.roof} onPick={(at) => select({ on: 'part', part: 'roof', at })} />
            <CameraRig nav={nav} dispatch={dispatch} rooms={rooms} />
            <InteriorControls nav={nav} rooms={rooms} />
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
        <OrbitControls
          enabled={outside}
          enablePan={false}
          target={[0, 0.4, 0]}
          minDistance={2}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
      </Canvas>
      <LanguageBar from={explorer.from} to={explorer.to} dispatch={explore} />
      {!result.ok && <ErrorPanel errors={result.error} />}
    </div>
  );
}