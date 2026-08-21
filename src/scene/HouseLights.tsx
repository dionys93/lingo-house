// src/scene/HouseLights.tsx
//
// The rig, rendered. Takes a LightRig VALUE rather than nav, so the lab can hand
// it a preset and HouseScene can hand it rigFor(nav) — one component, one set of
// light objects, no way for the two to drift. A lab that lights its scene
// differently from the house is a lab that stops predicting the house, which is
// the only thing a lab is for.

import type { LightRig } from './lights';

export function HouseLights({ rig }: { rig: LightRig }) {
  return (
    <>
      <ambientLight intensity={rig.ambient} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={rig.sun}
        castShadow={rig.sunCastsShadow}
        // Only allocated when castShadow is true. 2048 is affordable on the
        // tablet/laptop target; don't reach for 4096 without a measurement.
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.02}
      />
    </>
  );
}