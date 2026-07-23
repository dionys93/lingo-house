// src/App.tsx
//
// Now renders the FIRST core→scene join: compile a grid, and on success stand
// its walls up over the grass. On failure we show the errors in a panel — no
// silent failure even in the host, even though [[K]] can't actually fail.
//
// The grid lives here inline for now; it moves to an authoring module (rooms.ts)
// once there's more than one cell to author.

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { compileGrid } from './core/grid';
import type { HouseError } from './core/errors';
import { Ground } from './scene/Ground';
import { Walls } from './scene/Walls';
import { defineRoom, EMPTY } from './core/blocks';
import type { Grid } from './core/blocks';
const _ = EMPTY;

const K = defineRoom({ key: 'kitchen', name: 'Kitchen', color: '#d4d4d4' });
const GRID: Grid = [[K, K]];

function ErrorPanel({ errors }: { errors: readonly HouseError[] }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        maxWidth: 360,
        padding: '12px 16px',
        borderRadius: 8,
        background: 'rgba(120, 20, 20, 0.92)',
        color: '#fff',
        font: '13px/1.5 ui-monospace, monospace',
      }}
    >
      <strong>Plan did not compile</strong>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
        {errors.map((e, i) => (
          <li key={i}>{e.tag}</li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  const result = useMemo(() => compileGrid(GRID), []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [3, 2.5, 4], fov: 50 }}>
        <color attach="background" args={['#dce8f5']} />
        <fog attach="fog" args={['#dce8f5', 18, 38]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <Ground />
        {result.ok && <Walls grid={result.value} />}
        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
      </Canvas>
      {!result.ok && <ErrorPanel errors={result.error} />}
    </div>
  );
}