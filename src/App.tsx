// src/App.tsx
//
// Minimal scene host — just enough to see Ground render. Walls, rooms, and the
// compiled house come later; this exists to de-risk the core→shell seam and the
// grass/camera work in isolation.

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Ground } from './scene/Ground';

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ position: [6, 5, 8], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 8, 5]} intensity={1} />
        <Ground />
        <OrbitControls
          enablePan={false}
          minDistance={2}
          maxDistance={30}
          // THE camera constraint you asked for: polar angle π/2 is dead
          // horizontal; anything past it tilts the view below the horizon to see
          // undersides. Capping just shy of π/2 keeps the camera at or above
          // ground level, always. Raise the epsilon to forbid grazing angles too.
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
      </Canvas>
    </div>
  );
}