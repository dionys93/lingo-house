// src/tests/pattern.test.ts
//
// The procedural texture generator, tested without a DOM — which is the whole
// reason it returns bytes rather than a canvas.

import { describe, it, expect } from 'vitest';
import { normalFromHeight, renderPattern, type Pattern } from '../core/geometry/pattern';

const OAK: Pattern = {
  kind: 'woodGrain',
  base: [186, 154, 112],
  grain: [141, 111, 76],
  rings: 5,
  waviness: 0.55,
  seed: 20260811,
};

const PANTILE: Pattern = {
  kind: 'clayPantile',
  base: [178, 94, 62],
  shade: [78, 38, 28],
  across: 6,
  courses: 4,
  stagger: 0, // straight bond — see the note in registry.ts
  batch: 0.34,
  grit: 0.14,
  seed: 4127,
};

const TILE_SCALE: readonly [number, number] = [0.6, 0.6];

const SIZE = 32;
const channels = (bytes: Uint8ClampedArray, offset: number): number[] =>
  Array.from({ length: bytes.length / 4 }, (_, i) => bytes[i * 4 + offset]);

/** The height field, or a failure — a pattern with depth must always emit one. */
function heightOf(pattern: Pattern, size: number): Float32Array {
  const { height } = renderPattern(pattern, size);
  if (height === null) throw new Error('expected a height field');
  return height;
}

/** Mean surface tilt encoded in a normal map, in degrees. */
function meanTilt(pattern: Pattern, size: number, relief: number): number {
  const nm = normalFromHeight(heightOf(pattern, size), size, relief, TILE_SCALE);
  let sum = 0;
  for (let i = 0; i < size * size * 4; i += 4) {
    sum += Math.acos(Math.min(1, Math.max(-1, (nm[i + 2] / 255) * 2 - 1)));
  }
  return (sum / (size * size)) * (180 / Math.PI);
}

describe('renderPattern', () => {
  it('returns RGBA for every pixel, fully opaque', () => {
    const { rgba } = renderPattern(OAK, SIZE);
    expect(rgba).toHaveLength(SIZE * SIZE * 4);
    expect(channels(rgba, 3).every((a) => a === 255)).toBe(true);
  });

  it('is deterministic — same pattern and size, byte-for-byte identical', () => {
    expect(Array.from(renderPattern(OAK, SIZE).rgba)).toEqual(
      Array.from(renderPattern(OAK, SIZE).rgba),
    );
  });

  it('depends on the seed, so two woods can differ without new code', () => {
    const other = renderPattern({ ...OAK, seed: OAK.seed + 1 }, SIZE).rgba;
    expect(Array.from(renderPattern(OAK, SIZE).rgba)).not.toEqual(Array.from(other));
  });

  it('actually produces GRAIN, not a flat fill', () => {
    // The one that matters. If the noise term ever zeroes out — a bad lattice
    // index, a seed of 0, an octave dropped — every pixel comes out the same and
    // the texture silently becomes a solid colour that still looks plausible in
    // a screenshot. Spread is the only thing that catches it.
    const reds = channels(renderPattern(OAK, SIZE).rgba, 0);
    const spread = Math.max(...reds) - Math.min(...reds);
    expect(spread).toBeGreaterThan(20);
  });

  it('stays between the two colours it was given', () => {
    const reds = channels(renderPattern(OAK, SIZE).rgba, 0);
    expect(Math.min(...reds)).toBeGreaterThanOrEqual(OAK.grain[0] - 1);
    expect(Math.max(...reds)).toBeLessThanOrEqual(OAK.base[0] + 1);
  });

  it('tiles without a seam — the lattice wraps', () => {
    // Column 0 should be a plausible neighbour of the last column; a hard seam
    // shows up as a much bigger jump than any interior step.
    const { rgba } = renderPattern(OAK, SIZE);
    const px = (x: number, y: number) => rgba[(y * SIZE + x) * 4];
    const wrap = Array.from({ length: SIZE }, (_, y) => Math.abs(px(0, y) - px(SIZE - 1, y)));
    const interior = Array.from({ length: SIZE }, (_, y) => Math.abs(px(1, y) - px(0, y)));
    expect(Math.max(...wrap)).toBeLessThanOrEqual(Math.max(...interior) * 3 + 6);
  });

  it('renders a solid pattern as one flat colour, with no height at all', () => {
    const { rgba, height } = renderPattern({ kind: 'solid', base: [10, 20, 30] }, 4);
    expect(Array.from(rgba.slice(0, 8))).toEqual([10, 20, 30, 255, 10, 20, 30, 255]);
    // A solid has no depth, and the type says so rather than shipping a
    // Float32Array of zeros the caller has to recognise as meaning "nothing".
    expect(height).toBeNull();
  });

  it('emits a height field alongside the colour for a pattern with depth', () => {
    const height = heightOf(OAK, SIZE);
    expect(height).toHaveLength(SIZE * SIZE);
    expect(Array.from(height).every((h) => h >= 0 && h <= 1)).toBe(true);
    // Not a constant — if it were, relief would silently be flat.
    expect(Math.max(...height) - Math.min(...height)).toBeGreaterThan(0.2);
  });
});

describe('renderPattern — clay pantile', () => {
  it('does not let colour variation become geometry', () => {
    // THE test for why the height field exists. `batch` (per-tile firing
    // colour) and `grit` (fired-clay speckle) are pigment on a smooth surface.
    // Through the old luminance-derived normals they became relief: the speckle
    // read as gravel and a merely darker tile read as a sunken one. Colour must
    // move; height must not.
    const noisy = renderPattern(PANTILE, 64);
    const plain = renderPattern({ ...PANTILE, batch: 0, grit: 0 }, 64);
    expect(Array.from(noisy.rgba)).not.toEqual(Array.from(plain.rgba));
    expect(Array.from(noisy.height!)).toEqual(Array.from(plain.height!));
  });

  it('lays a lap line under every course', () => {
    // The butt of the course above sits proud, so the head of the one below is
    // the lowest thing on the tile. Two courses ⇒ two low rows.
    const size = 64;
    const height = heightOf(PANTILE, size);
    const rowMean = Array.from({ length: size }, (_, y) => {
      let sum = 0;
      for (let x = 0; x < size; x++) sum += height[y * size + x];
      return sum / size;
    });
    const floor = Math.min(...rowMean);
    const low = rowMean.filter((m) => m < floor + 0.05).length;
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(size / 4); // a line, not half the roof
  });

  it('divides tiles VERTICALLY, not just into horizontal bands', () => {
    // The defect this catches: the map had strong course lines and no side-lap
    // shadow at all, so it read as a stack of strips. Combined with corrugations
    // running unbroken up the slope, that is corrugated iron — and no amount of
    // geometry or lighting fixes an albedo with no vertical structure in it.
    //
    // One row, across six tiles: it has to vary.
    const size = 512;
    const { rgba } = renderPattern(PANTILE, size);
    const row = Array.from({ length: size }, (_, x) => rgba[(80 * size + x) * 4]);
    expect(Math.max(...row) - Math.min(...row)).toBeGreaterThan(45);
  });

  it('lays STRAIGHT bond — tile columns run true from eave to ridge', () => {
    // This used to assert the opposite, back when `stagger` was 0.5 and the
    // height field still carried the roll. Both of those were wrong.
    //
    // A pantile's side lap has to register with the tile beside it, so the
    // columns cannot be offset course to course — that is broken bond, which is
    // for plain tiles and slates. And `corrugate` lays its rolls on multiples of
    // the cover width from world zero on every course regardless, so a staggered
    // texture would have slid the per-tile colour sideways across a roll running
    // straight through it.
    const size = 128;
    const { rgba } = renderPattern(PANTILE, size);

    // Mean column profile over the middle of one course. Averaging is what
    // makes this robust: a single row's darkest pixel is a noise minimum, not
    // the pan floor, which is how the first version of this test lied.
    const band = (v0: number, v1: number): number[] => {
      const out = new Array<number>(size).fill(0);
      let rows = 0;
      for (let y = Math.floor(size * v0); y < Math.floor(size * v1); y++) {
        rows += 1;
        for (let x = 0; x < size; x++) out[x] += rgba[(y * size + x) * 4];
      }
      return out.map((v) => v / rows);
    };
    const panOf = (a: number[]) => a.indexOf(Math.min(...a)) % (size / PANTILE.across);

    expect(panOf(band(0.55, 0.70))).toBeCloseTo(panOf(band(0.05, 0.20)), 5);
  });
});

describe('normalFromHeight', () => {
  const size = 32;
  const height = () => heightOf(OAK, size);

  it('returns RGBA for every pixel, fully opaque', () => {
    const out = normalFromHeight(height(), size, 0.005, TILE_SCALE);
    expect(out).toHaveLength(size * size * 4);
    expect(channels(out, 3).every((a) => a === 255)).toBe(true);
  });

  it('is deterministic, like the colour map beside it', () => {
    expect(Array.from(normalFromHeight(height(), size, 0.005, TILE_SCALE))).toEqual(
      Array.from(normalFromHeight(height(), size, 0.005, TILE_SCALE)),
    );
  });

  it('encodes unit vectors — every texel is a normal, not a colour', () => {
    const out = normalFromHeight(height(), size, 0.005, TILE_SCALE);
    for (let i = 0; i < out.length; i += 4) {
      const x = (out[i] / 255) * 2 - 1;
      const y = (out[i + 1] / 255) * 2 - 1;
      const z = (out[i + 2] / 255) * 2 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
    }
  });

  it('points mostly up (+Z) — a surface, not noise', () => {
    const out = normalFromHeight(height(), size, 0.005, TILE_SCALE);
    expect(channels(out, 2).every((b) => b > 127)).toBe(true);
  });

  it('relief 0 gives a perfectly flat map', () => {
    const flat = normalFromHeight(height(), size, 0, TILE_SCALE);
    // Exactly (0, 0, 1): the neutral normal every renderer treats as "no relief".
    expect(channels(flat, 0).every((r) => Math.abs(r - 127.5) < 1)).toBe(true);
    expect(channels(flat, 2).every((b) => b >= 254)).toBe(true);
  });

  it('deeper relief means more tilt', () => {
    expect(meanTilt(OAK, size, 0.01)).toBeGreaterThan(meanTilt(OAK, size, 0.002));
  });

  it('a tile squeezed onto less world comes out steeper', () => {
    // Same height field, same depth, half the world distance to cross ⇒ twice
    // the slope. This is the property that makes `relief` mean something.
    const tight = normalFromHeight(height(), size, 0.005, [0.15, 0.15]);
    const wide = normalFromHeight(height(), size, 0.005, [0.6, 0.6]);
    const flatness = (nm: Uint8ClampedArray) =>
      channels(nm, 2).reduce((a, b) => a + b, 0) / (size * size);
    expect(flatness(tight)).toBeLessThan(flatness(wide));
  });

  it('relief keeps its meaning across resolutions', () => {
    // THE payoff. This number used to be a luminance-per-pixel strength and had
    // to be re-solved by hand whenever `size` changed — 8 at 128px became ~96 at
    // 512px, a twelvefold jump nobody could guess. As a depth in world units it
    // holds, within a degree or two of sampling error.
    //
    // It holds BETTER for a smooth field than for a stepped one, and the two
    // patterns here show both ends of that. Oak's grain is curved, so the same
    // relief lands within a degree across a fourfold change of resolution. The
    // pantile's remaining relief is the LAP — a discontinuity, whose gradient is
    // always exactly one texel wide however many texels there are — so it drifts
    // more. That is a property of steps, not a defect in the unit.
    const oakDrift = Math.abs(meanTilt(OAK, 128, 0.005) - meanTilt(OAK, 512, 0.005));
    expect(oakDrift).toBeLessThan(1.5);

    const lapDrift = Math.abs(meanTilt(PANTILE, 128, 0.007) - meanTilt(PANTILE, 512, 0.007));
    expect(lapDrift).toBeLessThan(3);
  });

  it('the pantile normal map carries the LAP only — the roll is geometry', () => {
    // The roll is displaced into the mesh by `corrugate`, so it must not also be
    // in the normal map: the same surface would be tilted twice in the same
    // direction and the flanks would blow out to black and white. With the roll
    // gone, the height field no longer varies across u at all.
    const size = 64;
    const height = heightOf(PANTILE, size);
    for (let y = 0; y < size; y++) {
      const first = height[y * size];
      for (let x = 1; x < size; x++) expect(height[y * size + x]).toBe(first);
    }
    // The colour map still varies across u, because a pan really is dirtier
    // than a crown — the roll earns its place in the albedo either way.
    const { rgba } = renderPattern(PANTILE, size);
    const row = Array.from({ length: size }, (_, x) => rgba[(10 * size + x) * 4]);
    expect(Math.max(...row) - Math.min(...row)).toBeGreaterThan(20);
  });
});