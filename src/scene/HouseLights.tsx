// src/scene/HouseLights.tsx
//
// The rig, rendered. Takes a LightRig VALUE rather than nav, so the lab can hand
// it a preset and HouseScene can hand it rigFor(nav) — one component, one set of
// light objects, no way for the two to drift. A lab that lights its scene
// differently from the house is a lab that stops predicting the house, which is
// the only thing a lab is for.

import { GROUND_BOUNCE, SKY_COLOR, SUN_POSITION } from './lights';
import type { LightRig } from './lights';

// Half-width of the sun's orthographic shadow box. See the comment on the light.
const SUN_RADIUS = 8;

export function HouseLights({ rig }: { rig: LightRig }) {
  return (
    <>
      <ambientLight intensity={rig.ambient} />
      {/* Fills shadow without flattening it. A hemisphere light still varies
          with the surface normal — up-facing gets sky, down-facing gets grass —
          so unlike raising `ambient` it lifts the dark side WITHOUT washing out
          the normal maps. Turn skyFill, not ambient, when the scene is too dark. */}
      <hemisphereLight color={SKY_COLOR} groundColor={GROUND_BOUNCE} intensity={rig.skyFill} />
      <directionalLight
        position={[SUN_POSITION[0], SUN_POSITION[1], SUN_POSITION[2]]}
        intensity={rig.sun}
        castShadow={rig.sunCastsShadow}
        // Only allocated when castShadow is true. 2048 is affordable on the
        // tablet/laptop target; don't reach for 4096 without a measurement.
        shadow-mapSize={[2048, 2048]}
        shadow-normalBias={0.02}
        // three's default directional shadow camera is a ±5 box, which is
        // MARGINAL here and would clip at the far corner: the 6×6 grid at
        // CELL 0.5 is 3 units square, so half its diagonal is ~2.1, and two
        // 1.2 storeys plus roof throw a shadow of roughly the same again from
        // a sun at ~48°. That lands right on 5. ±8 over-covers instead.
        // Sun distance is 9.4, so far=30 clears the far edge with room spare.
        //
        // The cost is resolution — 2048 over 16 units is 128 texels/unit, or
        // ~64 per cell, which is still ample at this scale. Revisit both
        // numbers together if the floor plan grows past about 10 units square.
        shadow-camera-left={-SUN_RADIUS}
        shadow-camera-right={SUN_RADIUS}
        shadow-camera-top={SUN_RADIUS}
        shadow-camera-bottom={-SUN_RADIUS}
        shadow-camera-near={1}
        shadow-camera-far={30}
      />
    </>
  );
}