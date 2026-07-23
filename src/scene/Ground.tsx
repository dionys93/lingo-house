// src/scene/Ground.tsx
//
// The exterior ground: a large plane in the XZ plane at y=0, so walls (whose
// bases also sit at y=0) rest on it. It does two jobs — gives the scene a floor,
// and, together with the camera's polar-angle cap (see Scene/App), keeps
// everything "grounded": you physically can't see under anything because the
// ground is in the way and the camera can't dip below the horizon.

import { useMemo } from 'react';
import * as THREE from 'three';
import { useSceneTexture } from './textures';

const GROUND_SIZE = 40; // world units — large enough that its edges sit off-screen
const GRASS_REPEAT = 32; // how many times the grass tiles across the plane

export function Ground() {
  const grass = useSceneTexture('grass');

  // A configured CLONE, so this surface owns its own repeat independently of any
  // other consumer of the same base texture. useMemo keeps it stable per texture.
  const map = useMemo(() => {
    const t = grass.clone();
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
    t.needsUpdate = true;
    return t;
  }, [grass]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
      <meshStandardMaterial map={map} />
    </mesh>
  );
}