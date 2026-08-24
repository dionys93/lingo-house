// src/scene/Ground.tsx
//
// The exterior ground: a large plane in the XZ plane at y=0, so walls (whose
// bases also sit at y=0) rest on it. It does two jobs — gives the scene a floor,
// and, together with the camera's polar-angle cap, keeps everything "grounded":
// you physically can't see under anything because the ground is in the way and
// the camera can't dip below the horizon.

import { useEffect, useMemo } from 'react';
import { planeMesh } from '../core/mesh';
import { meshGeometry } from './roofGeometry';
import { SurfaceMaterialSlot, useTiledSurface } from './surfaces/SurfaceProvider';
import { CATCHES } from './shadows';

const GROUND_SIZE = 40; // world units — large enough that its edges sit off-screen

export function Ground() {
  // METRIC UVs: 0→40 across the plane, so `useTiledSurface`'s constant
  // `repeat = 1 / worldScale` lands 40 / 1.25 = 32 tiles — exactly what
  // `useSurfaceMaterial` computed here before. This site is the ONE where the
  // old clamp was already exact (40 / 1.25 divides evenly), so the migration is
  // expected to be pixel-identical. If anything about the ground changes, the
  // plumbing is wrong, not the numbers — which is precisely why this one went
  // first.
  const geo = useMemo(() => meshGeometry(planeMesh([GROUND_SIZE, GROUND_SIZE])), []);

  // Four vertices, so leaking it would never be noticed — which is exactly how
  // Roof.tsx's leak survived until corrugation made it ~2,400. Dispose anyway.
  useEffect(() => () => geo.dispose(), [geo]);

  // No size argument. The plane's own UVs carry its extent, so the ground gets
  // the same physical grass scale as anything else asking for 'grass'.
  const grass = useTiledSurface('grass');

  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} {...CATCHES}>
      <SurfaceMaterialSlot material={grass} color="#6f8f4e" />
    </mesh>
  );
}