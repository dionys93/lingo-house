// src/scene/surfaces/registry.ts
//
// THE texture registry. Singular, deliberately: there were two — this one and
// `scene/textures/` — each with one consumer, each answering "how does a surface
// get onto a mesh". Two answers to one question is how the third texture ends up
// in the wrong place. `scene/textures/grass.ts` is still the grass GENERATOR;
// it's just registered here now instead of behind its own hook.
//
// A surface has a SOURCE, and the point of the union is that consumers never
// learn which kind it is. Swapping the procedural oak for the photographed one
// was a one-line change here and touched no component.
//
//   pattern    generated from a seeded description — no asset, no load
//   image      a file on disk, loaded and repeated
//   generator  a bespoke canvas routine that owns its own look
//
// The CORE never sees any of this. It deals in ItemKind and room keys, exactly
// as it deals in room `color`; what oak looks like is the shell's business.

import * as THREE from 'three';
import type { Pattern } from './pattern';
import { createGrassTexture } from '../textures/grass';
import oakPlankUrl from '../textures/oak-plank.png';

export type SurfaceSource =
  | { readonly kind: 'pattern'; readonly pattern: Pattern }
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'generator'; readonly make: () => THREE.Texture };

export interface SurfaceSpec {
  readonly source: SurfaceSource;
  readonly roughness: number;
  readonly metalness: number;
  // World units covered by one tile, PER AXIS. Two numbers rather than one
  // because grain is directional: a board's rings run along its length, and
  // squashing them equally in both directions is what makes a stair tread read
  // like a scaled-down wall instead of a plank.
  readonly worldScale: readonly [u: number, v: number];
  // Relief for the derived normal map. 0 = flat colour, ~3 = pronounced.
  readonly normalStrength: number;
  readonly normalScale: number; // how hard the renderer leans on that relief
  readonly size?: number; // pattern resolution; ignored by image/generator
}

export type SurfaceKey = 'wood.oak' | 'wood.walnut' | 'grass';

export const SURFACES: Record<SurfaceKey, SurfaceSpec> = {
  // Photographed oak, cropped out of the uploaded tile's white field and
  // offset-blended so it wraps. The source image is ONE BOARD: its long axis is
  // v, and the horizontal wrap is deliberately left un-blended because that edge
  // IS the join between two boards — blending it away would give one endless
  // sheet of wood instead of a floor of planks.
  'wood.oak': {
    source: { kind: 'image', url: oakPlankUrl },
    roughness: 0.78,
    metalness: 0,
    // The tile is one board: ~0.2 world units across, ~0.8 along. Matching those
    // proportions is what stops a stair tread showing four boards side by side.
    worldScale: [0.2, 0.8],
    normalStrength: 2.2,
    normalScale: 0.5,
  },

  // Still procedural — nothing has needed a second photographed wood, and this
  // is the case the pattern generator exists for.
  'wood.walnut': {
    source: {
      kind: 'pattern',
      pattern: {
        kind: 'woodGrain',
        base: [126, 94, 66],
        grain: [78, 55, 38],
        rings: 7,
        waviness: 0.8,
        seed: 611,
      },
    },
    roughness: 0.7,
    metalness: 0,
    worldScale: [0.4, 0.16],
    normalStrength: 3.0,
    normalScale: 0.8,
    size: 128,
  },

  grass: {
    source: { kind: 'generator', make: createGrassTexture },
    roughness: 1,
    metalness: 0,
    worldScale: [1.25, 1.25], // 40-unit ground plane ⇒ the 32 repeats it had
    normalStrength: 0,
    normalScale: 0,
  },
};