// src/scene/Ground.tsx
//
// The exterior ground: a large plane in the XZ plane at y=0, so walls (whose
// bases also sit at y=0) rest on it. It does two jobs — gives the scene a floor,
// and, together with the camera's polar-angle cap, keeps everything "grounded":
// you physically can't see under anything because the ground is in the way and
// the camera can't dip below the horizon.

import { useSurfaceMaterial } from './surfaces/SurfaceProvider';

const GROUND_SIZE = 40; // world units — large enough that its edges sit off-screen

export function Ground() {
  // Same call every other surface makes: hand over the face size, get back a
  // material repeated to match. The 32 tiles this used to set by hand now fall
  // out of the grass surface's own worldScale.
  const grass = useSurfaceMaterial('grass', [GROUND_SIZE, GROUND_SIZE]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      {grass ? <meshStandardMaterial {...grass} /> : <meshStandardMaterial color="#6f8f4e" />}
    </mesh>
  );
}