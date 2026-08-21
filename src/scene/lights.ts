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

/**
 * Which HDRI lights the scene. `null` means no environment at all — not an
 * environment at zero strength — so the lab's Shipping baseline is honestly
 * what shipped, and the comparison doesn't depend on intensity working.
 */
export type EnvKey = 'outdoor' | 'indoor';

/**
 * Ambient occlusion settings. AO belongs to the RIG because it is the occlusion
 * term for the FILL: `ambient`, `skyFill` and the environment map are all
 * omnidirectional, so a wall in open air and a wall wedged into a corner
 * currently receive identical light. The sun has shadow maps for this; the fill
 * has had nothing. `null` means no composer at all.
 */
export interface AmbientOcclusion {
  readonly intensity: number;
  /**
   * WORLD UNITS, and this is the number that goes wrong. N8AO defaults to 5,
   * which is fine in a scene built at human scale and absurd here: CELL is 0.5,
   * so 5 would smear occlusion across ten cells and shade whole rooms. The
   * crevices worth darkening are wall-to-floor joins, door reveals and stair
   * nosings — WALL_THICKNESS is 0.08 — so the radius wants to sit a bit above
   * that and well under one cell.
   */
  readonly radius: number;
}

export interface LightRig {
  /** Flat fill. Every point of this is a point a normal map cannot modulate,
   *  so it stays as low as the scene will tolerate. */
  readonly ambient: number;
  /** Hemisphere fill: sky colour from above, ground colour from below. Unlike
   *  `ambient` this still varies with surface normal, so it lifts shadows
   *  WITHOUT flattening relief.
   *
   *  With an environment map now doing the real skylight job, this is down from
   *  0.55/0.35 to a floor: enough that a surface facing away from everything
   *  isn't pure black, not enough to flatten anything. */
  readonly skyFill: number;
  readonly sun: number;
  /** Off indoors: the roof would block the sun anyway, and the shadow pass isn't free. */
  readonly sunCastsShadow: boolean;
  readonly env: EnvKey | null;
  readonly envIntensity: number;
  readonly ao: AmbientOcclusion | null;
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

// Hemisphere colours, matched to what's already on screen: the Canvas clear
// colour above, the grass below. Shadowed faces near the ground pick up a little
// green, which is what actually happens and costs nothing to have.
export const SKY_COLOR = '#dce8f5';
export const GROUND_BOUNCE = '#6f8f4e';

// Sun-first. Relief and edges read hard; shadows ground the house on the grass.
//
// ambient 0.15 was calibrated in the lab BEFORE any mesh cast a shadow — in a
// scene where nothing was ever fully occluded, 0.15 of flat fill was plenty.
// Turning shadows on moved a large set of surfaces onto that fill alone, and
// moving the sun from front lighting to three-quarter put a visible face into
// shade by design. Both changes pushed the same way, hence the skyFill below.
export const EXTERIOR_RIG: LightRig = {
  ambient: 0.06,
  skyFill: 0.18,
  sun: 2.2,
  sunCastsShadow: true,
  env: 'outdoor',
  envIntensity: 0.45,
  // Lighter outside: the sun already casts real shadows, so contacts get an
  // occlusion term from the shadow map. Push AO as hard as the interior and
  // every junction gets darkened twice.
  ao: { intensity: 1.6, radius: 0.15 },
};

// Fill-first. Nothing reaches in through the roof, so the fill IS the light until
// an environment map lands (see the todo, Tier 1) and takes over this job properly.
export const INTERIOR_RIG: LightRig = {
  ambient: 0.08,
  skyFill: 0.12,
  sun: 0.9,
  sunCastsShadow: false,
  // Indoors the environment does nearly all the work. `apartment` is a real
  // interior probe, so bounce comes off walls and windows rather than from a
  // sky that isn't visible from in here — which is exactly what the hemisphere
  // light was pretending. ambient and skyFill are a floor now, not a source.
  env: 'indoor',
  envIntensity: 1.0,
  // Heavier inside, because `sunCastsShadow` is false in here: without AO the
  // interior has ZERO occlusion of any kind and every room is lit by pure
  // omnidirectional fill. This is the only thing separating a room from a box.
  ao: { intensity: 2.6, radius: 0.15 },
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