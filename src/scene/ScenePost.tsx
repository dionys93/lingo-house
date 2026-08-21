// src/scene/ScenePost.tsx
//
// The post chain. Currently one effect that matters — ambient occlusion — plus
// the two passes that exist to undo what adding a composer breaks.
//
// Rendered from the rig for the same reason HouseLights is: one source of
// truth, so the house, the sandbox and the lab cannot disagree about how the
// scene is lit. `ao: null` renders NO composer at all rather than a composer at
// zero strength, which keeps the lab's Shipping baseline honest and keeps the
// cost at zero when it's off.

import { Suspense } from 'react';
import { EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { AmbientOcclusion } from './lights';

export function ScenePost({ ao }: { ao: AmbientOcclusion | null }) {
  if (ao === null) return null;

  return (
    // SMAA loads its lookup textures asynchronously, so the composer suspends.
    // Scoped here so it can't blank the scene.
    <Suspense fallback={null}>
      {/*
        multisampling={0} is REQUIRED, not a preference, and not for the reason
        I first gave. react-postprocessing defaults to WebGL2 MSAA and normally
        you would keep it. But AO reads the depth buffer, and a multisampled
        depth target cannot be sampled — N8AO's own README says hardware AA does
        not work with ambient occlusion. So MSAA off, SMAA in its place.
      */}
      <EffectComposer multisampling={0}>
        <N8AO
          aoRadius={ao.radius}
          intensity={ao.intensity}
          distanceFalloff={1}
          quality="medium"
          // Half-resolution AO. The occlusion term is low-frequency by nature,
          // so the softness is nearly invisible while the fill-rate saving is
          // not — and fill rate is the whole cost of this effect at dpr 2 on a
          // tablet. Turn it off only if a measurement says you can afford to.
          halfRes
        />
        <SMAA />
        {/*
          MUST BE LAST, and must exist at all. R3F's Canvas applies ACES Filmic
          tone mapping by default, but a composer takes that over — without this
          pass the whole image comes back washed out and every value tuned in
          lights.ts is wrong. If colours look off after enabling AO, this line
          and its position are the first thing to check.
        */}
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Suspense>
  );
}