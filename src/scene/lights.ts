// src/scene/lights.ts
//
// The light rig as DATA, derived from nav. Pure: no React, no three, no JSX —
// same contract as core/nav and core/describe, and testable the same way.
//
// Why this exists at all: the house has two viewing states and they want
// opposite rigs, for a structural reason rather than a stylistic one. Ceilings
// are opaque tiles at wall-top (Ceiling.tsx) with a roof over them, and windows
// are transparent geometry rather than light portals. So once the sun casts
// shadows it CANNOT reach an interior floor. A rig tuned for the exterior puts
// the inside of the house in the dark; a rig tuned for the interior flattens the
// outside. One rig cannot serve both, and the compromise serves neither.
//
// DERIVED, not synced — the same discipline HouseScene already applies to
// `described`. There is no rig state, no effect watching nav, and no way for the
// lights and the camera to disagree about where you are.

import { assertNever } from '../core/errors';
import type { NavState } from '../core/nav';

export interface LightRig {
  /** Directionless fill. Every point of this is a point a normal map cannot modulate. */
  readonly ambient: number;
  readonly sun: number;
  /** Off indoors: the roof would block the sun anyway, and the shadow pass isn't free. */
  readonly sunCastsShadow: boolean;
}

// Where the sun stands. This is DATA, not a detail of the light component,
// because it's coupled to the default camera and to the shadow frustum, and
// those three have to be reasoned about together.
//
// It used to be [5, 8, 5], which is azimuth 45° — only 6° from the default
// camera's own azimuth of 39°. That is front lighting, and it has two effects
// that look unrelated but are the same fact:
//
//   - Every face you can see is a face pointing at the sun, so shading looks
//     bright and confident.
//   - Every shadow falls DIRECTLY BEHIND the thing casting it. The house is
//     ~3.2 units tall and 3 wide, so from the camera's 29° elevation the line
//     of sight to its own ground shadow passes straight through the building.
//     The shadows were rendering; the house was standing in front of all of
//     them.
//
// [-6, 7, 2] is azimuth -72°, about 110° off the camera. Three-quarter lighting:
// the front face stays lit, the right face falls into shade, and the ground
// shadow swings out to the side where you can actually see it. Elevation is
// nearly unchanged at 48°, so the shading character is the same — only the
// direction moved.
export const SUN_POSITION: readonly [number, number, number] = [-6, 7, 2];

// Sun-first. Relief and edges read hard; shadows ground the house on the grass.
export const EXTERIOR_RIG: LightRig = {
  ambient: 0.15,
  sun: 2.2,
  sunCastsShadow: true,
};

// Fill-first. Nothing reaches in through the roof, so the fill IS the light until
// an environment map lands (see the todo, Tier 1) and takes over this job properly.
export const INTERIOR_RIG: LightRig = {
  ambient: 0.3,
  sun: 0.9,
  sunCastsShadow: false,
};

export function rigFor(nav: NavState): LightRig {
  switch (nav.tag) {
    case 'in':
      return nav.location === 'outside' ? EXTERIOR_RIG : INTERIOR_RIG;
    case 'moving':
      // The DESTINATION, not the origin. Switching at the start of a traverse
      // puts the change under the camera's own motion, which hides it; switching
      // on arrival pops it at the exact moment you stop and look. A cross-fade
      // would be better than either — deferred until the pop is actually visible,
      // because it needs a useFrame lerp and this does not.
      return nav.to === 'outside' ? EXTERIOR_RIG : INTERIOR_RIG;
    default:
      return assertNever(nav);
  }
}