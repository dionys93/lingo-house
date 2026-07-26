// src/App.tsx
//
// The scene host. It compiles the plan the human authored in authoring/rooms.ts
// — the grid AND its doors — and renders it. On success the walls stand up, the
// floors fill, and the doors swing on click; on failure the errors show in a
// panel (no silent failure even here).

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { compileGrid } from './core/grid';
import { describeError, type HouseError } from './core/errors';
import { GROUND_FLOOR, DOORS, WINDOWS } from './authoring/rooms';
import { Ground } from './scene/Ground';
import { Floor } from './scene/Floor';
import { Walls } from './scene/Walls';
import { Doors } from './scene/Doors';
import { Windows } from './scene/Windows';

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

export default function App() {
  const result = useMemo(() => compileGrid(GROUND_FLOOR, [...DOORS, ...WINDOWS]), []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [4, 3.5, 5], fov: 50 }}>
        <color attach="background" args={['#dce8f5']} />
        <fog attach="fog" args={['#dce8f5', 18, 38]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <Ground />
        {result.ok && (
          <>
            <Floor grid={result.value} />
            <Walls grid={result.value} />
            <Doors grid={result.value} />
            <Windows grid={result.value} />
          </>
        )}
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