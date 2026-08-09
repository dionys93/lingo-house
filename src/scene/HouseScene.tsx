// src/scene/HouseScene.tsx
//
// The real, explorable house — compiles the authored plan and wires navigation
// (door graph → reducer, door click → traverse, CameraRig through doorways,
// OrbitControls outside / InteriorControls in a room). App toggles between this
// and the sandbox.

import { useCallback, useMemo, useReducer } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { compileGrid, roofFor } from '../core/grid';
import { describeError, type HouseError } from '../core/errors';
import { buildDoorGraph, makeNavReducer, START_OUTSIDE } from '../core/nav';
import { explorerReducer, START_EXPLORER } from '../core/explorer';
import { GROUND_FLOOR, DOORS, WINDOWS, ITEMS } from '../authoring/rooms';
import { LABELS } from '../authoring/labels';
import { Ground } from './Ground';
import { Floor } from './Floor';
import { Ceiling } from './Ceiling';
import { Walls } from './Walls';
import { Roof } from './Roof';
import { Items } from './Items';
import { Doors } from './Doors';
import { ItemPopup } from './ItemPopup';
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

export function HouseScene() {
  const result = useMemo(() => compileGrid(GROUND_FLOOR, [...DOORS, ...WINDOWS], 0, ITEMS), []);
  const compiled = result.ok ? result.value : null;

  const graph = useMemo(() => buildDoorGraph(compiled?.openings ?? []), [compiled]);
  const reducer = useMemo(() => makeNavReducer(graph), [graph]);
  const [nav, dispatch] = useReducer(reducer, START_OUTSIDE);
  const [explorer, explore] = useReducer(explorerReducer, START_EXPLORER);
  const roof = useMemo(() => (compiled ? roofFor(compiled.footprint) : null), [compiled]);

  const outside = nav.tag === 'in' && nav.location === 'outside';

  // DERIVED, not synced: the popup is showing when the selected item is in the
  // room you're standing in. Walk out and it hides; walk back and it's still
  // there. No effect watching nav, nothing to forget to clear, and no way for
  // the two reducers to disagree — the only source of truth is the pair of them.
  const selectedItem = compiled?.items.find((i) => i.id === explorer.selected) ?? null;
  const popupItem =
    selectedItem && nav.tag === 'in' && nav.location === selectedItem.room ? selectedItem : null;

  const onSelect = useCallback((id: string) => explore({ tag: 'selectItem', id }), []);
  const onDismiss = useCallback(() => explore({ tag: 'dismiss' }), []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [4, 3.5, 5], fov: 50 }}>
        <color attach="background" args={['#dce8f5']} />
        <fog attach="fog" args={['#dce8f5', 18, 38]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <Ground />
        {compiled && (
          <>
            <Floor grid={compiled} />
            <Ceiling grid={compiled} />
            <Walls grid={compiled} />
            {roof && <Roof roof={roof} />}
            <Items grid={compiled} selectedId={explorer.selected} onSelect={onSelect} />
            <Doors grid={compiled} nav={nav} dispatch={dispatch} />
            <Windows grid={compiled} />
            <CameraRig nav={nav} dispatch={dispatch} rooms={compiled.rooms} />
            <InteriorControls nav={nav} rooms={compiled.rooms} />
            {popupItem && (
              <ItemPopup
                item={popupItem}
                labels={LABELS}
                from={explorer.from}
                to={explorer.to}
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