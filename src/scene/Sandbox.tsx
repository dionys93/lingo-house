// src/scene/Sandbox.tsx
//
// A scratch scene for judging the roof on different footprints — especially small
// rooms, where the gable is shallow. Pick a preset and the same compile→render
// path draws it; no doors, windows, or navigation, just orbit around it and look.
// Reuses the real Floor/Walls/Roof, so what you see here is exactly what the house
// gets.

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { compileGrid } from '../core/grid';
import { defineRoom, EMPTY, type Grid } from '../core/blocks';
import { Ground } from './Ground';
import { Floor } from './Floor';
import { Walls } from './Walls';
import { Roof } from './Roof';

const K = defineRoom({ key: 'room', name: 'Room', color: '#cbb89a' });
const L = defineRoom({ key: 'room2', name: 'Room 2', color: '#c8d5c8' });
const _ = EMPTY;

const PRESETS: readonly { readonly name: string; readonly grid: Grid }[] = [
  { name: '1×1', grid: [[K]] },
  { name: '2×2', grid: [[K, K], [K, K]] },
  { name: '3×2 wide', grid: [[K, K, K], [K, K, K]] },
  { name: '2×3 deep', grid: [[K, K], [K, K], [K, K]] },
  { name: '3×3', grid: [[K, K, K], [K, K, K], [K, K, K]] },
  { name: '4×2 long', grid: [[K, K, K, K], [K, K, K, K]] },
  { name: '2 rooms', grid: [[K, K, L], [K, K, L]] },
];

const bar: CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: '50%',
  transform: 'translateX(-50%)',
  display: 'flex',
  gap: 6,
  padding: 8,
  borderRadius: 10,
  background: 'rgba(17, 24, 39, 0.75)',
};
const btn = (active: boolean): CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  font: '13px ui-sans-serif, system-ui',
  background: active ? '#e8e2d6' : 'rgba(255,255,255,0.15)',
  color: active ? '#111' : '#fff',
});

export function Sandbox() {
  const [idx, setIdx] = useState(1); // start at 2×2
  const result = useMemo(() => compileGrid(PRESETS[idx]?.grid ?? [[K]]), [idx]);
  const compiled = result.ok ? result.value : null;

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [3, 2.4, 3.6], fov: 50 }}>
        <color attach="background" args={['#dce8f5']} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <Ground />
        {compiled && (
          <>
            <Floor grid={compiled} />
            <Walls grid={compiled} />
            <Roof grid={compiled} />
          </>
        )}
        <OrbitControls
          enablePan={false}
          target={[0, 0.5, 0]}
          minDistance={1.5}
          maxDistance={20}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      </Canvas>

      <div style={bar}>
        {PRESETS.map((p, i) => (
          <button key={p.name} style={btn(i === idx)} onClick={() => setIdx(i)}>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}