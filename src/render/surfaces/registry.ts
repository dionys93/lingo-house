// src/render/surfaces/registry.ts
//
// THE texture registry. Singular, deliberately: there were two — this one and
// `render/three/` — each with one consumer, each answering "how does a surface
// get onto a mesh". Two answers to one question is how the third texture ends up
// in the wrong place. `render/three/grass.ts` is still the grass GENERATOR;
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
// invisible. Measured, before that pass:
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
//    SurfaceSource, where `relief` lives on the pattern variant only.
//
// 2. `relief` IS A DEPTH IN WORLD UNITS, and used to not be. It was a strength
//    multiplier on the colour map's luminance gradient, which made it
//    RESOLUTION-DEPENDENT and, worse, not even linearly so — going from a 128px
//    tile to a 512px one needed the number to rise roughly TWELVEFOLD, because
//    the luminance field smooths as resolution climbs. It had to be re-solved
//    by hand every time `size` moved, and nobody could guess the factor.
//
//    Now that patterns emit their own height field (see pattern.ts), the number
//    is a physical depth and holds within ~2° of mean surface tilt across an
//    eightfold change in resolution. `normalScale` is the separate, honest knob
//    for exaggeration: `relief` says what the surface IS, `normalScale` says how
//    hard the renderer leans on it.
//
// Both numbers are checkable rather than felt: render the tile, take the mean
// height gradient in world units, take the arctangent.

import * as THREE from 'three';
import { pantileRoll, type Pattern } from '../../core/geometry/pattern';
import { createGrassTexture } from '../three/grass';
import oakPlankUrl from './oak-plank.png';

export type SurfaceSource =
  | {
      readonly kind: 'pattern';
      readonly pattern: Pattern;
      /**
       * Peak-to-trough relief depth, in WORLD UNITS. 0 for none. At 1 unit =
       * 2m, 0.035 is a 70mm roof tile and 0.0054 is 11mm of carved grain.
       *
       * It lives HERE, on the pattern variant alone, and the placement is the
       * whole point. A pattern KNOWS its own height field — one function draws
       * the colour and the shape, and pattern.ts now returns both. A photograph
       * doesn't: the only height field you could get from it is its luminance,
       * and that assumes DARK MEANS DEEP, which is simply false for a photo.
       * Dark means pigment. A stain becomes a pit, a pale knot a bump, and
       * compression noise fuzz.
       *
       * This used to be `normalStrength` on SurfaceSpec, where every source
       * could reach it. Moving it into the union makes the unsound case
       * unrepresentable instead of merely discouraged.
       *
       * Resolution-INdependent, as of the height-field change — see the tuning
       * note in the header for what it cost when it wasn't.
       */
      readonly relief: number;
    }
  | {
      readonly kind: 'image';
      readonly url: string;
      /**
       * Multiplied into the map. A photograph's colour is baked, so this is the
       * only way to re-tone one without a new asset.
       *
       * It lives HERE, on the image variant alone, for the same reason `relief`
       * lives on `pattern` alone. A pattern already states its own colours in
       * `base` and `grain`; giving it a tint too would mean two places to set
       * one thing, and a silent question about which wins.
       */
      readonly tint?: string;
    }
  | { readonly kind: 'generator'; readonly make: () => THREE.Texture };

export interface SurfaceSpec {
  readonly source: SurfaceSource;
  readonly roughness: number;
  readonly metalness: number;
  // World units covered by one tile, PER AXIS. Two numbers rather than one
  // because grain is directional: a board's rings run along its length, and
  // squashing them equally in both directions is what makes a stair tread read
  // like a scaled-down wall instead of a plank.
  //
  // Also feeds `normalFromHeight`: it is what converts a texel into a distance,
  // so a `relief` in world units means the same thing on every tile.
  readonly worldScale: readonly [u: number, v: number];
  readonly normalScale: number; // how hard the renderer leans on that relief
  readonly size?: number; // pattern resolution; ignored by image/generator
  /**
   * Relief too deep for a normal map to fake, handed to the MESH instead.
   *
   * A normal map perturbs shading and nothing else: no silhouette, no shadow
   * cast from one roll onto the next, no parallax — and it mips toward flat at
   * exactly the distance you look at a roof from. A 70mm pantile roll fails all
   * four, which is why the roof came out looking painted.
   *
   * A mesh that can corrugate reads this and displaces along `profile`; one
   * that can't ignores it and gets a flat sheet. `relief` above then covers
   * only what's LEFT — for the pantile, the step at each course.
   */
  readonly corrugation?: {
    readonly period: number; // world units between rolls
    readonly depth: number; // world units, pan to crown
    readonly segments: number; // subdivisions per period
    readonly profile: (t: number) => number; // 0 in the pan, 1 at the crown
  };
}

export type SurfaceKey =
  | 'wood.oak'
  | 'wood.walnut'
  | 'grass'
  | 'clay.pantile'
  | 'paint.oxblood'
  | 'wood.cherry'
  | 'metal.brass';

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
    // MEASURED, not eyeballed: the asset's mean is [224, 183, 131], luminance
    // 188 — the "clean pale board" the note above warns about. This multiplier
    // is [0.668, 0.590, 0.581], which lands the mean on [150, 108, 76]: dark
    // enough to read as a stained board and still 1.5x the oxblood front door,
    // which is where that stops being true.
    source: { kind: 'image', url: oakPlankUrl, tint: '#AA9694' },
    roughness: 0.78,
    metalness: 0,
    // The board measures 191 × 730px, i.e. 1 : 3.35. worldScale must hold that
    // ratio or the grain comes out squashed; 0.2 is the free knob (plank width
    // in world units) and 0.67 = 0.2 × 3.35 follows from it.
    worldScale: [0.2, 0.67],
    // No relief, and it is now structurally impossible to ask for any: `relief`
    // lives on the pattern variant. The 14 that used to sit here was the third
    // attempt at cranking a signal out of an image that has none — a smooth
    // veneer render, photographed flat. What 14 actually amplified was the
    // file's own compression noise, and it amplified it as GEOMETRY: dark stain
    // read as a pit, pale figure as a bump.
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
      // 0.0054 world units — about 11mm of relief. Solved against woodGrain's
      // own height field to reproduce the ~12° of mean tilt the old `relief: 8`
      // gave at size 128, so the look is unchanged; measured at 11.9° on 128
      // and 12.5° on 512, where the old number would have needed to be ~96.
      //
      // 11mm is NOT the depth of real wood grain, which is a few tenths of a
      // millimetre and would vanish. This is a stylisation — walnut carved as
      // if its figure were 11mm deep — and the value of the unit change is that
      // the exaggeration is now stated in something you can picture, rather
      // than hidden in a strength multiplier nobody could interpret.
      relief: 0.0054,
    },
    roughness: 0.7,
    metalness: 0,
    worldScale: [0.4, 0.16],
    normalScale: 0.8,
    size: 128,
  },

  // Clay pantiles for the roof. Dimensions are off real product data rather than
  // chosen: a traditional pantile runs ~200mm cover width and ~300mm gauge, with
  // ~70mm of profile depth. At 1 unit = 2m that is 0.1 × 0.15 per tile.
  //
  // WHY 3 ACROSS AND 2 COURSES. It is the smallest pair that makes the pattern
  // square in WORLD units: 3 × 0.1 = 0.3 and 2 × 0.15 = 0.3. That matters
  // because normalFromHeight takes central differences in texel space, so a
  // tile that is not square in world terms would come out with steeper relief
  // on one axis than the other. A half-tile stagger also closes after exactly
  // two courses, so the square repeats seamlessly.
  //
  // At this scale the tall roof carries ~35 tiles across and ~11 courses, i.e.
  // about 12 × 5 repeats of the pattern square, which does not read as tiling.
  'clay.pantile': {
    source: {
      kind: 'pattern',
      pattern: {
        kind: 'clayPantile',
        base: [178, 94, 62],
        shade: [78, 38, 28],
        // 6 × 4 rather than 3 × 2, and the reason is variety, not scale. The
        // per-tile firing colour can only vary with the pattern's own period, so
        // 3 × 2 gave SIX distinct tiles repeating every three columns — which
        // the eye reads as a pattern, not as variation. 6 × 4 gives 24.
        // Still square in world units: 6 × 0.1 = 4 × 0.15 = 0.6.
        across: 6,
        courses: 4,
        // STRAIGHT BOND — no offset between courses, and that is not laziness.
        // Broken bond is for plain tiles and slates, which are double-lapped and
        // interlock with nothing. A pantile's side lap has to register with the
        // tile beside it, so the columns must run true from eave to ridge; the
        // Roof Tile Association's guidance is to strike perpendicular lines
        // before laying them.
        //
        // It was 0.5, and once `corrugate` arrived that became a contradiction:
        // the geometry lays its rolls on multiples of the cover width from world
        // zero, identically on every course, while the texture claimed alternate
        // courses were offset half a tile. The per-tile colour would have jumped
        // sideways across a roll that ran straight through it.
        stagger: 0,
        // Both of these are COLOUR ONLY and cannot reach the height field —
        // which is exactly what the height-field change bought. Through the old
        // luminance path, `grit` came out as gravel and `batch` turned a merely
        // darker tile into a sunken one.
        batch: 0.34,
        grit: 0.14,
        seed: 4127,
      },
      // 0.007 world units — 14mm, a tile's thickness, which is the step where
      // each course laps the one below. It is NOT the 70mm profile depth any
      // more: the roll moved into the geometry (see `corrugation`), so leaving
      // it here too would tilt the same surface twice in the same direction and
      // blow the flanks out to black and white.
      //
      // Measured 2.0° of mean tilt at 512. Low, and correct — a pantile minus
      // its barrel is a mostly flat plate with a step at one end.
      relief: 0.007,
    },
    // Clay is matte but not chalk; a weathered pantile keeps a faint sheen.
    roughness: 0.82,
    metalness: 0,
    worldScale: [0.6, 0.6],
    normalScale: 1,
    // 0.1 = one tile's 200mm cover width; 0.035 = its 70mm profile depth. 16
    // subdivisions puts ~7 across the roll itself, which is enough for vertex
    // normals to round it into a barrel. Costs ~2,400 triangles on the tall
    // roof and ~2,000 on the low one.
    corrugation: { period: 0.1, depth: 0.035, segments: 24, profile: pantileRoll },
    // 512 rather than 128: this is seen at a grazing angle from ground level,
    // where the eave is the dominant read, and 3 × 2 tiles across 128px would
    // put a whole tile in 42 pixels.
    size: 512,
  },

  grass: {
    source: { kind: 'generator', make: createGrassTexture },
    roughness: 1,
    metalness: 0,
    worldScale: [1.25, 1.25], // 40-unit ground plane ⇒ the 32 repeats it had
    normalScale: 0,
  },
  // Oxblood on the front door. Traditional for a colonial cross-and-bible door,
  // and chosen over crimson because crimson sits near 345 degrees of hue — a red
  // with a BLUE undertone — against a pantile roof at roughly 20. The two pull
  // opposite ways and read as two reds disagreeing. Oxblood is warm enough to
  // sit with terracotta while staying obviously distinct from the five oak doors
  // inside, which is the point: a child should be able to see which one is die
  // Haustür.
  //
  // `solid` with relief 0, and that is honest rather than lazy. Paint IS flat.
  // Every bit of this door's visual interest is the panel geometry and the
  // shadow in its 16mm recesses — which is the whole argument for building it as
  // fifteen boxes instead of a texture. Faking grain on top would contradict the
  // reason it exists. If it reads too flat once rendered, a `woodGrain` variant
  // with a low-contrast grain telegraphing through the paint is a one-line
  // change here.
  'paint.oxblood': {
    source: { kind: 'pattern', pattern: { kind: 'solid', base: [142, 59, 52] }, relief: 0 },
    roughness: 0.7, // eggshell, not the 0.9 of bare timber
    metalness: 0,
    // A solid has no features to scale, so this is arbitrary — but it still
    // divides the metric UVs, so it has to stay sane rather than be left at
    // something silly just because nothing is visible.
    worldScale: [0.2, 0.2],
    normalScale: 1,
    size: 64, // nothing to resolve; the smallest tile that isn't absurd
  },
  // The interior doors. Calm, low-figure, mid-brown — cherry, and PROCEDURAL
  // rather than the photographed oak the doors wore first.
  //
  // The swap buys real relief. `wood.oak` is `kind: 'image'`, where relief is
  // structurally impossible: the only height field a photo offers is its
  // luminance, and that assumes dark means deep. A woodGrain pattern knows its
  // own height field, so cherry gets 4.4mm of actual carved grain that lights
  // and shadows correctly.
  //
  // HOW DARK IT CAN GO IS SET BY THE FRONT DOOR, not by taste. Oxblood sits at
  // luminance 76. Cherry's base is 115 — 1.51x — which still reads as lighter
  // across a room. Chestnut (94, 1.23x) and dark walnut (73, 0.95x) converge on
  // the front door in VALUE, leaving only hue to tell them apart, which is far
  // weaker at distance and nearly gone in shadow. Darkening past here quietly
  // undoes the reason the front door was picked out at all.
  //
  // NOTE THE CONTRAST GOES THE OTHER WAY FROM WALNUT. Walnut's comment argues
  // for widening base-to-grain to ~90 because 48 read as flat grey. Cherry is
  // deliberately down at ~30, because "less textured" is the brief: the door
  // should be quiet and let the front door be the thing you look at. Same knob,
  // opposite goal — worth saying out loud rather than leaving as a number that
  // looks like the walnut lesson unlearned.
  'wood.cherry': {
    source: {
      kind: 'pattern',
      pattern: {
        kind: 'woodGrain',
        base: [150, 108, 76],
        grain: [112, 78, 54], // ~30 apart, on purpose — see above
        rings: 3, // 4 on walnut, to survive a 34mm rail; a door face is 2.4 tiles wide
        waviness: 0.35, // cherry is straight-grained; walnut's 0.9 is figure
        seed: 214,
      },
      // Unchanged from the lighter version this replaced, and that is the point:
      // `relief` is a DEPTH IN WORLD UNITS, so re-colouring the wood does not
      // re-open it. Back when relief was a luminance-per-pixel strength, this
      // edit would have needed it re-solved by hand.
      relief: 0.0022, // ~4.4mm, against walnut's 11mm
    },
    roughness: 0.75,
    metalness: 0,
    // Same board size as oak, deliberately. A cherry door and an oak stair tread
    // then show the SAME plank width — which is the entire point of metric UVs,
    // and would be lost by picking a number that merely looked nice on a door.
    worldScale: [0.2, 0.67],
    normalScale: 1,
    size: 256,
  },

  // Doorknobs. A `solid` with no relief, because a polished knob has no texture
  // — its whole look is the environment map, which is why metalness is high and
  // roughness low. This is also the one surface that never needs metric UVs:
  // sphereMesh cannot provide them, and nothing here would show the distortion.
  'metal.brass': {
    source: { kind: 'pattern', pattern: { kind: 'solid', base: [181, 148, 79] }, relief: 0 },
    roughness: 0.28,
    metalness: 0.85,
    worldScale: [0.05, 0.05],
    normalScale: 1,
    size: 32,
  },
};