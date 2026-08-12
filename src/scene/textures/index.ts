// src/scene/textures/index.ts
//
// This folder is now just the texture ASSETS and the bespoke generators that
// produce them (grass). The registry that decides which surface goes on which
// mesh lives in `scene/surfaces/` — there used to be one here too, and two
// registries answering the same question is how the next texture gets added to
// the wrong one.
//
// Ground.tsx used to call `useSceneTexture('grass')` from here; it now calls
// `useSurfaceMaterial('grass', …)` like everything else, which is what gets it
// per-axis repeat and disposal for free.

export { createGrassTexture } from './grass';