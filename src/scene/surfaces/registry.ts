// src/scene/surfaces/registry.ts
//
// What each named surface looks like. The CORE never sees this — it deals in
// `ItemKind` and room keys, exactly as it deals in room `color`; deciding what
// oak looks like is the shell's job.
//
// `worldScale` is the field that does the real work: how many WORLD UNITS one
// tile of the texture covers. Without it, every mesh shows one tile stretched
// across whatever face it has, so a 0.43-unit stair tread and a 3-unit wall get
// the same grain and nothing reads at its true size. With it, a mesh asks for
// the repeat that matches its own dimensions.

import type { Pattern } from './pattern';

export type SurfaceKey = 'wood.oak' | 'wood.walnut';

export interface SurfaceSpec {
  readonly pattern: Pattern;
  readonly roughness: number;
  readonly metalness: number;
  readonly size: number; // texture resolution, px
  // World units covered by one tile, PER AXIS. Two numbers rather than one
  // because grain is directional: a board's rings run along its length, and
  // squashing them equally in both directions is what makes a stair tread read
  // like a scaled-down wall instead of a plank.
  readonly worldScale: readonly [u: number, v: number];
  // How much relief the derived normal map has. 0 = flat colour, ~1 = strong.
  readonly normalStrength: number;
  readonly normalScale: number; // how hard the renderer leans on that relief
}

export const SURFACES: Record<SurfaceKey, SurfaceSpec> = {
  // Pale, fairly straight grain — the staircase.
  'wood.oak': {
    pattern: {
      kind: 'woodGrain',
      base: [186, 154, 112],
      grain: [141, 111, 76],
      rings: 5,
      waviness: 0.55,
      seed: 20260811,
    },
    roughness: 0.82,
    metalness: 0,
    size: 128,
    // Rings repeat every ~34cm ALONG a board but only ~13cm across it, so the
    // grain stays long and directional instead of turning into a chequer.
    worldScale: [0.34, 0.13],
    normalStrength: 2.6,
    normalScale: 0.65,
  },

  // Darker, busier — furniture.
  'wood.walnut': {
    pattern: {
      kind: 'woodGrain',
      base: [126, 94, 66],
      grain: [78, 55, 38],
      rings: 7,
      waviness: 0.8,
      seed: 611,
    },
    roughness: 0.7,
    metalness: 0,
    size: 128,
    worldScale: [0.4, 0.16],
    normalStrength: 3.0,
    normalScale: 0.8,
  },
};