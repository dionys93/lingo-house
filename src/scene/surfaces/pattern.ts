// src/scene/surfaces/pattern.ts
//
// Procedural surface patterns. PURE: in a pattern description and a size, out a
// flat RGBA byte array. No canvas, no three, no DOM — which is what makes the
// whole thing unit-testable in vitest, and why the seeded PRNG below exists
// instead of Math.random(). Random in a render would break purity AND make the
// grain crawl every time React re-rendered.
//
// Deterministic in the strong sense: the same (pattern, size) always produces
// byte-for-byte identical output, on any machine, in any order.

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
    };

// mulberry32 — five lines, no dependency, well-distributed enough for texture
// noise and fully reproducible from its seed.
function mulberry32(seed: number): () => number {
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

/** RGBA, row-major, `size * size * 4` bytes. */
export function renderPattern(pattern: Pattern, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const put = (i: number, [r, g, b]: RGB) => {
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  };

  if (pattern.kind === 'solid') {
    for (let i = 0; i < out.length; i += 4) put(i, pattern.base);
    return out;
  }

  const noise = makeNoise(pattern.seed, 8);

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
        // Bias toward the base so the grain is a figure in the wood, not stripes.
        const fibre = (fbm(noise, u * 40, v * 6) - 0.5) * 0.18;
        put(i, shade(pattern.base, pattern.grain, Math.min(1, Math.max(0, t * 0.8 + fibre))));
      } else {
        const cell = (n: number) => Math.abs(((n * pattern.pitch) % 1) - 0.5) * 2;
        const over = cell(u) > cell(v) ? 1 : 0;
        const jitter = (fbm(noise, u * 20, v * 20) - 0.5) * 0.25;
        put(i, shade(pattern.base, pattern.thread, Math.min(1, Math.max(0, over * 0.7 + jitter))));
      }
    }
  }

  return out;
}

// ── Normal maps ─────────────────────────────────────────────────────────────
//
// A colour map alone gives a flat surface with a picture printed on it. What
// makes wood look like wood under a moving light is RELIEF: the grain catching
// the light differently as you orbit. react-planner ships a hand-painted
// `*-normal.jpg` beside every texture for exactly this reason.
//
// We don't need the second asset, because we already have the height field: the
// pattern's own luminance. Dark grain is low, pale wood is high. Central
// differences over that field give the surface gradient, and the gradient packs
// straight into a tangent-space normal map.
//
// Same purity contract as renderPattern — bytes in, bytes out, no DOM.

const luminance = (bytes: Uint8ClampedArray, i: number): number =>
  (bytes[i] * 0.299 + bytes[i + 1] * 0.587 + bytes[i + 2] * 0.114) / 255;

/**
 * A tangent-space normal map derived from ANY RGBA image's luminance — a
 * generated pattern or a loaded photograph, it makes no difference. Dark is low,
 * pale is high, and the gradient of that field is the surface relief.
 *
 * Written against raw bytes rather than against `Pattern` precisely so the image
 * path and the procedural path share it; two copies of this arithmetic drifting
 * apart is how a photo texture ends up lit differently from a generated one.
 *
 * `strength` scales the relief: 0 is flat, ~3 is pronounced.
 */
export function normalFromLuminance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  // Wrapping lookups, so the normal map tiles exactly like the colour map does.
  const at = (x: number, y: number): number =>
    luminance(rgba, ((((y % height) + height) % height) * width + (((x % width) + width) % width)) * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // The surface normal is (-dx, -dy, 1) normalised, then mapped from
      // [-1,1] into the [0,255] byte range every normal map uses.
      const len = Math.hypot(dx, dy, 1);
      const i = (y * width + x) * 4;
      out[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** The same thing for a generated pattern, which is just a square RGBA image. */
export const renderNormalMap = (
  pattern: Pattern,
  size: number,
  strength: number,
): Uint8ClampedArray => normalFromLuminance(renderPattern(pattern, size), size, size, strength);