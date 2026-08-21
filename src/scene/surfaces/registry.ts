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
//
// ── ON TUNING THESE NUMBERS ─────────────────────────────────────────────────
//
// Every surface here was previously tuned by eye and every one of them came out
// invisible. Measured, before this pass:
//
//   wood.walnut  128px  colour std  9.0   derived relief  4.5°
//   wood.oak     512px  colour std 10.9   derived relief  2.0°
//
// A colour std of ~10/255 is ±4% variation: at any real viewing distance that
// reads as a flat fill, which is indistinguishable from the flat-colour fallback
// each consumer draws when a surface fails to load. That equivalence is why a
// working texture pipeline looked for a long time like a broken one.
//
// Two things follow, and both are counter-intuitive enough to write down:
//
// 1. RELIEF CARRIES WOOD, NOT COLOUR. Real timber has modest albedo variation.
//    What makes it read as timber is grain catching a moving light. Pushing
//    `base`/`grain` far apart to compensate gives painted stripes, not wood —
//    so contrast goes up only moderately and `relief` does the work. Which is
//    also why a PHOTOGRAPH cannot borrow this trick: see the note on
//    SurfaceSource, where `relief` now lives on the pattern variant only.
//
// 2. `relief` IS RESOLUTION-DEPENDENT. `normalFromLuminance` takes
//    central differences over ADJACENT PIXELS, so the same strength on a 512px
//    tile yields roughly a quarter of the relief it does on a 128px one. The
//    numbers below are solved for ~12° of mean surface tilt at each tile's own
//    resolution, NOT copied between surfaces. If you change `size`, this number
//    is no longer valid.
//
// Both numbers are checkable rather than felt: render the tile, take the mean
// luminance gradient, take the arctangent.

import * as THREE from 'three';
import type { Pattern } from './pattern';
import { createGrassTexture } from '../textures/grass';
import oakPlankUrl from '../textures/oak-plank.png';

export type SurfaceSource =
  | {
      readonly kind: 'pattern';
      readonly pattern: Pattern;
      /**
       * Relief derived from this pattern's own luminance. 0 for none.
       *
       * It lives HERE, on the pattern variant alone, and the placement is the
       * whole point. Deriving a normal map from luminance assumes DARK MEANS
       * DEEP. For a generated pattern that assumption is exact — one function
       * drew the colour and the grooves, so its dark bands ARE its grooves. For
       * a photograph it is simply false: dark means pigment. A stain becomes a
       * pit, a pale knot becomes a bump, and compression noise becomes fuzz.
       *
       * This used to be `normalStrength` on SurfaceSpec, where every source
       * could reach it. Moving it into the union makes the unsound case
       * unrepresentable instead of merely discouraged.
       *
       * Resolution-dependent — see the tuning note in the header. Solve it,
       * don't copy it between tiles of different sizes.
       */
      readonly relief: number;
    }
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
  readonly normalScale: number; // how hard the renderer leans on that relief
  readonly size?: number; // pattern resolution; ignored by image/generator
}

export type SurfaceKey = 'wood.oak' | 'wood.walnut' | 'grass';

export const SURFACES: Record<SurfaceKey, SurfaceSpec> = {
  // Photographed oak, cropped down to the single board that was floating in the
  // source file's transparent field — that field sampled as BLACK, because a
  // `map`'s alpha is discarded unless the material is `transparent`, so every
  // oak face was drawing a black frame. The tile now IS the board, opaque, with
  // no alpha channel at all.
  //
  // It wraps along v (the board's length). The horizontal wrap is deliberately
  // left un-blended: that edge IS the join between two boards, and blending it
  // gives one endless sheet of wood instead of a floor of planks.
  //
  // Be aware of what this asset is: a smooth veneer render, colour std 10.9.
  // There is very little grain in it to find, and no `normalStrength` recovers
  // detail that was never photographed. If oak ever needs to look better than
  // "clean pale board", replace the file — the `source` union means that is a
  // one-line change here and touches no component.
  'wood.oak': {
    source: { kind: 'image', url: oakPlankUrl },
    roughness: 0.78,
    metalness: 0,
    // The board measures 191 × 730px, i.e. 1 : 3.35. worldScale must hold that
    // ratio or the grain comes out squashed; 0.2 is the free knob (plank width
    // in world units) and 0.67 = 0.2 × 3.35 follows from it.
    worldScale: [0.2, 0.67],
    // No relief, and the header's own measurements are why: this tile is
    // colour std 10.9 and derived relief came out at 2.0°, against the ~12°
    // every other number here is solved for. The 14 that used to sit here was
    // the third attempt at cranking a signal out of an image that has none —
    // a smooth veneer render, photographed flat. What 14 actually amplified
    // was the file's own compression noise, and it amplified it as GEOMETRY:
    // dark stain read as a pit, pale figure as a bump.
    //
    // Flat is the honest answer for a smooth veneer. If oak needs to look like
    // sawn timber, that is a new asset with real grain in it — one line, here,
    // per the note above.
    normalScale: 0,
  },

  // Still procedural — nothing has needed a second photographed wood, and this
  // is the case the pattern generator exists for.
  'wood.walnut': {
    source: {
      kind: 'pattern',
      pattern: {
        kind: 'woodGrain',
        // Base and grain were 48/255 apart, which caps the tile's contrast no
        // matter what else is tuned: the blend runs between exactly these two
        // colours. ~90 apart lifts colour std from 9.0 to 16.1 while still
        // reading as timber rather than as stripes.
        base: [150, 112, 78],
        grain: [62, 42, 28],
        // 7 rings across a 128px tile put a ring every 18px. On a face smaller
        // than one tile — the handrail is 34mm thick — that aliases into flat
        // grey, which is most of why the rail has never shown grain. 4 rings
        // survives being squeezed onto a small face.
        rings: 4,
        waviness: 0.9,
        seed: 611,
      },
      // Sound here in a way it never was on the photo: renderPattern drew both
      // the colour and the relief from the same grain field. Was 3.0 → 4.5°;
      // 8 is solved for ~12° at size 128.
      relief: 8,
    },
    roughness: 0.7,
    metalness: 0,
    worldScale: [0.4, 0.16],
    normalScale: 0.8,
    size: 128,
  },

  grass: {
    source: { kind: 'generator', make: createGrassTexture },
    roughness: 1,
    metalness: 0,
    worldScale: [1.25, 1.25], // 40-unit ground plane ⇒ the 32 repeats it had
    normalScale: 0,
  },
};