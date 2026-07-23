// web/src/components/house/Ground.jsx
import { useMemo, useEffect } from 'react';
import { createGrassTexture } from '../../utils/proceduralTextures.js';
import { GROUND_SIZE, GROUND_THICKNESS } from './constants.js';

// A large solid slab of ground, textured with a procedural grass pattern.
// Its top surface sits exactly at y=0 — the same level as the bottom of
// every wall and the floor — so the house appears to grow straight out of
// it with no gap or seam, and there's real geometry (not empty space)
// blocking any view of the house's underside.
export function Ground({ colors }) {
  const texture = useMemo(() => createGrassTexture(colors.ground), [colors.ground]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={[0, -GROUND_THICKNESS / 2, 0]}>
      <boxGeometry args={[GROUND_SIZE, GROUND_THICKNESS, GROUND_SIZE]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}