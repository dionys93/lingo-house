
//
// Procedural surface patterns. PURE: in a pattern description and a size, out
// colour bytes AND a height field. No canvas, no three, no DOM — which is what
// makes the whole thing unit-testable in vitest, and why the seeded PRNG below
// exists instead of Math.random(). Random in a render would break purity AND
// make the grain crawl every time React re-rendered.
//
// Deterministic in the strong sense: the same (pattern, size) always produces
// byte-for-byte identical output, on any machine, in any order.
//
// ── WHY A HEIGHT FIELD, AND NOT LUMINANCE ───────────────────────────────────
//
// This used to return colour alone, and relief was RECONSTRUCTED from it:
// `normalFromLuminance` took central differences over the colour map and called
// dark "deep". For a photograph that is the only option there is. For a
// generated pattern it was never necessary — the generator computes the height
// and then threw it away — and it is only CORRECT while colour is a pure
// function of height.
//
// The clay pantile is where that assumption broke. A tile needs two things that
// are colour but NOT depth: per-tile firing variation (`batch`) and fired-clay
// speckle (`grit`). Run through luminance, the speckle became gravel and a
// merely darker tile became a physically sunken one — the same failure as the
// oak `normalStrength: 14` the registry documents, arriving from the procedural
// side instead of the photographic one.
//
// So each generator now decides which of its OWN terms are depth. That is a
// judgement per pattern, not a rule about noise: walnut's fibre IS depth (it is
// the wood's figure) and stays in the height, while the pantile's `grit` is
// pigment on a smooth surface and does not.
//
// ── WHAT THAT BUYS ──────────────────────────────────────────────────────────
//
// `relief` stops being a luminance-per-pixel strength and becomes a DEPTH IN
// WORLD UNITS, so it no longer changes meaning when `size` does. Measured, on
// the pantile: the old strength had to go from 8 to roughly 96 between a 128px
// tile and a 512px one — and not linearly, because the luminance field itself
// smooths as resolution climbs, which is why the number was unguessable by
// hand. The new one holds within about two degrees of mean surface tilt across
// an eightfold change in resolution.

export type RGB = readonly [r: number, g: number, b: number];

export type Pattern =
  | { readonly kind: 'solid'; readonly base: RGB }
  | {
      readonly kind: 'woodGrain';
      readonly base: RGB;
      readonly grain: RGB;
      readonly rings: number; // growth rings across the tile
      readonly waviness: number; // how much the rings wander
      readonly seed: number;
    }
  | {
      readonly kind: 'weave';
      readonly base: RGB;
      readonly thread: RGB;
      readonly pitch: number; // threads across the tile
      readonly seed: number;
    }
  | {
      // A clay pantile roof: a shallow pan with one bold roll at its edge,
      // lapped by the course above. Real product dimensions, so the numbers in
      // the registry mean something — ~200mm cover width, ~300mm gauge, ~70mm
      // of profile depth.
      readonly kind: 'clayPantile';
      readonly base: RGB; // fired terracotta, sun-bleached
      readonly shade: RGB; // down in the pan, and under each lap
      readonly across: number; // tiles across the pattern square
      readonly courses: number; // courses up it
      readonly stagger: number; // 0..1 of a cover width, offset per course
      readonly batch: number; // per-tile colour variation — clay is fired in batches
      readonly grit: number; // fired-clay speckle
      readonly seed: number;
    };

/** Everything a pattern produces. `height` is null when it has no depth. */
export interface PatternRender {
  readonly rgba: Uint8ClampedArray;
  /** 0..1, row-major, `size * size`. Feed it to `normalFromHeight`. */
  readonly height: Float32Array | null;
}

// mulberry32 — five lines, no dependency, well-distributed enough for texture
// noise and fully reproducible from its seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

// Value noise on a wrapping lattice, so a tile can repeat without a visible seam.
function makeNoise(seed: number, lattice: number): (x: number, y: number) => number {
  const rand = mulberry32(seed);
  const grid = Array.from({ length: lattice * lattice }, rand);
  const at = (ix: number, iy: number): number =>
    grid[((iy % lattice) + lattice) % lattice * lattice + (((ix % lattice) + lattice) % lattice)];

  return (x, y) => {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const tx = smooth(x - fx);
    const ty = smooth(y - fy);
    return lerp(
      lerp(at(fx, fy), at(fx + 1, fy), tx),
      lerp(at(fx, fy + 1), at(fx + 1, fy + 1), tx),
      ty,
    );
  };
}

// Two octaves is plenty at this stylisation level and keeps generation cheap.
function fbm(noise: (x: number, y: number) => number, x: number, y: number): number {
  return noise(x, y) * 0.65 + noise(x * 2, y * 2) * 0.35;
}

const shade = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

// ── The pantile profile ─────────────────────────────────────────────────────
//
// Both return a signed height in units of the profile depth, so the SHAPE of a
// pantile is stated once here and scaled by `relief` at the far end of the
// pipeline. Deciding the tiles are deeper does not change their shape.

const PANTILE_PAN = 0.6; // fraction of the cover width that is pan, not roll
const PANTILE_CROWN = 0.88; // where the roll peaks; past it is the lap face
const PANTILE_LAP = 0.12; // fraction of the gauge overlapped by the course above

const PANTILE_PAN_DIP = 0.28; // how far the pan dishes below the tile's base plane
const PANTILE_SIDE = 0.12; // width of the side-lap shadow, as a fraction of cover width

/**
 * Across one cover width: a dished pan, a roll rising off it, then a STEEP DROP
 * back to pan level.
 *
 * That drop is the whole point, and the first version of this did not have one.
 * A pantile roof is not a wavy surface — it is a field of discrete plates, each
 * one's roll landing on top of its neighbour's pan. What the eye reads is the
 * EDGE of that roll and the shadow it throws. Return to the pan smoothly and
 * symmetrically instead and you have described corrugated iron, which is exactly
 * what it looked like.
 *
 * So the flanks are deliberately unequal: the roll climbs over 28% of the cover
 * width and falls over 12%. Sheet metal is symmetric; a lapped tile is not.
 *
 * The slope discontinuity where that fall meets the next pan is a CREASE, and it
 * survives only if the mesh refuses to average normals across it — see the
 * per-tile vertex runs in core/geometry/roofSurface.ts. Profile and mesh have to agree
 * on this or the geometry rounds the edge straight back off.
 */
const pantileCross = (t: number): number => {
  if (t < PANTILE_PAN) {
    return -PANTILE_PAN_DIP * Math.sin(Math.PI * (t / PANTILE_PAN));
  }
  if (t < PANTILE_CROWN) {
    return Math.sin((Math.PI / 2) * ((t - PANTILE_PAN) / (PANTILE_CROWN - PANTILE_PAN)));
  }
  return Math.cos((Math.PI / 2) * ((t - PANTILE_CROWN) / (1 - PANTILE_CROWN)));
};

/**
 * The same profile normalised to 0..1 — 0 at the bottom of the pan, 1 at the
 * crown of the roll — for a mesh to DISPLACE by.
 *
 * The roll is the one part of a pantile that a normal map cannot fake. It is
 * 70mm deep, it breaks the silhouette at the eave and the rake, and it shadows
 * the pan beside it. So the roof carries it as geometry (see
 * core/geometry/roofSurface.ts) and this is the shape it displaces along.
 *
 * `t` is the world coordinate along the eave divided by the cover width, so the
 * geometry and the texture are phase-locked to the same world origin without
 * either one being told about the other.
 */
export const pantileRoll = (t: number): number =>
  (pantileCross(t - Math.floor(t)) + PANTILE_PAN_DIP) / (1 + PANTILE_PAN_DIP);

/**
 * Along one gauge. The butt of the course above sits PROUD of the head of the
 * one below, so this is a step and not a ramp — which is what puts the hard
 * shadow line under every course.
 */
const pantileAlong = (s: number): number =>
  s > 1 - PANTILE_LAP
    ? -0.45 - 0.25 * ((s - (1 - PANTILE_LAP)) / PANTILE_LAP)
    : 0.06 * s;

export function renderPattern(pattern: Pattern, size: number): PatternRender {
  const out = new Uint8ClampedArray(size * size * 4);
  const put = (i: number, [r, g, b]: RGB) => {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  };

  if (pattern.kind === 'solid') {
    for (let i = 0; i < out.length; i += 4) put(i, pattern.base);
    return { rgba: out, height: null };
  }

  const height = new Float32Array(size * size);
  const noise = makeNoise(pattern.seed, 8);

  if (pattern.kind === 'clayPantile') {
    // One colour offset per TILE rather than per pixel, drawn from its own
    // stream so that changing `grit` doesn't reshuffle which tiles are pale.
    const jitter = mulberry32(pattern.seed ^ 0x9e3779b9);
    const fired = Array.from({ length: pattern.across * pattern.courses }, () => jitter() - 0.5);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const i = (y * size + x) * 4;

        const course = Math.floor(v * pattern.courses);
        const s = v * pattern.courses - course; // 0..1 up this course
        const shifted = u + course * pattern.stagger; // half-tile offset per course
        const col = Math.floor(shifted * pattern.across) % pattern.across;
        const t = (shifted * pattern.across) % 1; // 0..1 across this tile

        const roll = pantileCross(t); // the barrel — carried by GEOMETRY
        const lap = pantileAlong(s); // the course step — carried by the normal map

        // THE HEIGHT FIELD IS THE LAP ALONE. The roll is displaced into the mesh,
        // so leaving it here too would tilt the surface twice in the same
        // direction and the flanks would blow out to near-black and near-white.
        // Clamped, so the bottom of the lap comes out flat rather than spiky.
        height[y * size + x] = clamp01((lap + 0.7) / 0.76);

        // COLOUR sees the roll too, but only faintly now, and the restraint is
        // the point. A pan really is darker than a crown — rain and dirt collect
        // in it — so the roll earns some place in the albedo. At full strength
        // though it was a smooth gradient lying exactly on top of a smooth
        // geometric wave, and two smooth waves in phase is the sheet-metal read
        // twice over. Damped, and modulated by noise, so it reads as dirt IN the
        // pan rather than as shading OF the pan.
        // THE SIDE LAP. The previous tile's roll edge sits on this pan and throws
        // a shadow down it. Without this the albedo has no vertical division at
        // all — only the course bands — so the map reads as a stack of strips
        // rather than a grid of tiles, and no lighting rescues that.
        const side = Math.pow(Math.max(0, 1 - t / PANTILE_SIDE), 1.5);
        const batch = fired[course * pattern.across + col] * pattern.batch;
        const speck = (fbm(noise, u * 24, v * 24) - 0.5) * pattern.grit;
        const dirt =
          (1 - (roll + PANTILE_PAN_DIP) / (1 + PANTILE_PAN_DIP)) *
          0.3 *
          (0.45 + 0.55 * fbm(noise, u * 9, v * 9));
        const tone = clamp01(0.24 + dirt + side * 0.45 - lap * 0.9 + batch + speck);
        put(i, shade(pattern.base, pattern.shade, tone));
      }
    }

    return { rgba: out, height };
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const i = (y * size + x) * 4;

      if (pattern.kind === 'woodGrain') {
        // Rings running along one axis, pushed sideways by noise so they wander
        // like real grain instead of reading as printed stripes.
        const warp = (fbm(noise, u * 4, v * 4) - 0.5) * pattern.waviness;
        const ring = (v * pattern.rings + warp) % 1;
        const t = Math.abs(ring - 0.5) * 2; // triangle wave: soft, seamless
        // Bias toward the base so the grain is a figure in the wood, not
        // stripes. The fibre term stays in the height: in timber the figure
        // genuinely IS relief, which is not true of the pantile's speckle.
        const k = clamp01(t * 0.8 + (fbm(noise, u * 40, v * 6) - 0.5) * 0.18);
        height[y * size + x] = 1 - k; // dark grain is low
        put(i, shade(pattern.base, pattern.grain, k));
      } else {
        const cell = (n: number) => Math.abs(((n * pattern.pitch) % 1) - 0.5) * 2;
        const over = cell(u) > cell(v) ? 1 : 0;
        const jitter = (fbm(noise, u * 20, v * 20) - 0.5) * 0.25;
        const k = clamp01(over * 0.7 + jitter);
        height[y * size + x] = 1 - k; // the thread passing under sits lower
        put(i, shade(pattern.base, pattern.thread, k));
      }
    }
  }

  return { rgba: out, height };
}

// ── Normal maps ─────────────────────────────────────────────────────────────
//
// A colour map alone gives a flat surface with a picture printed on it. What
// makes wood look like wood, or a roof read as tiled, under a moving light is
// RELIEF. react-planner ships a hand-painted `*-normal.jpg` beside every
// texture for exactly this reason. We don't need the second asset, because the
// generator already knows the shape.

/**
 * A tangent-space normal map from a KNOWN height field.
 *
 * `relief` is peak-to-trough depth in WORLD UNITS and `worldScale` is how much
 * world one tile covers, so the gradient below is a real slope — rise over run,
 * both measured in the same units — rather than a luminance difference between
 * two adjacent pixels. That is the entire reason the number survives a change
 * of `size`.
 *
 * Square only, because a pattern is square. The width/height pair its
 * predecessor took existed so the image path could share the arithmetic;
 * `relief` lives on the pattern variant of SurfaceSource, so an image can never
 * reach this.
 */
export function normalFromHeight(
  height: Float32Array,
  size: number,
  relief: number,
  worldScale: readonly [u: number, v: number],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const perTexelU = worldScale[0] / size;
  const perTexelV = worldScale[1] / size;

  // Wrapping lookups, so the normal map tiles exactly like the colour map does.
  const at = (x: number, y: number): number =>
    height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((at(x + 1, y) - at(x - 1, y)) * relief) / (2 * perTexelU);
      const dy = ((at(x, y + 1) - at(x, y - 1)) * relief) / (2 * perTexelV);
      // The surface normal is (-dx, -dy, 1) normalised, then mapped from
      // [-1,1] into the [0,255] byte range every normal map uses.
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out[i + 3] = 255;
    }
  }
  return out;
}