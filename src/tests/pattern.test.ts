// src/tests/pattern.test.ts
//
// The procedural texture generator, tested without a DOM — which is the whole
// reason it returns bytes rather than a canvas.

import { describe, it, expect } from 'vitest';
import { renderNormalMap, renderPattern, type Pattern } from '../scene/surfaces/pattern';

const OAK: Pattern = {
  kind: 'woodGrain',
  base: [186, 154, 112],
  grain: [141, 111, 76],
  rings: 5,
  waviness: 0.55,
  seed: 20260811,
};

const SIZE = 32;
const channels = (bytes: Uint8ClampedArray, offset: number): number[] =>
  Array.from({ length: bytes.length / 4 }, (_, i) => bytes[i * 4 + offset]);

describe('renderPattern', () => {
  it('returns RGBA for every pixel, fully opaque', () => {
    const out = renderPattern(OAK, SIZE);
    expect(out).toHaveLength(SIZE * SIZE * 4);
    expect(channels(out, 3).every((a) => a === 255)).toBe(true);
  });

  it('is deterministic — same pattern and size, byte-for-byte identical', () => {
    expect(Array.from(renderPattern(OAK, SIZE))).toEqual(Array.from(renderPattern(OAK, SIZE)));
  });

  it('depends on the seed, so two woods can differ without new code', () => {
    const other = renderPattern({ ...OAK, seed: OAK.seed + 1 }, SIZE);
    expect(Array.from(renderPattern(OAK, SIZE))).not.toEqual(Array.from(other));
  });

  it('actually produces GRAIN, not a flat fill', () => {
    // The one that matters. If the noise term ever zeroes out — a bad lattice
    // index, a seed of 0, an octave dropped — every pixel comes out the same and
    // the texture silently becomes a solid colour that still looks plausible in
    // a screenshot. Spread is the only thing that catches it.
    const reds = channels(renderPattern(OAK, SIZE), 0);
    const spread = Math.max(...reds) - Math.min(...reds);
    expect(spread).toBeGreaterThan(20);
  });

  it('stays between the two colours it was given', () => {
    const reds = channels(renderPattern(OAK, SIZE), 0);
    expect(Math.min(...reds)).toBeGreaterThanOrEqual(OAK.grain[0] - 1);
    expect(Math.max(...reds)).toBeLessThanOrEqual(OAK.base[0] + 1);
  });

  it('tiles without a seam — the lattice wraps', () => {
    // Column 0 should be a plausible neighbour of the last column; a hard seam
    // shows up as a much bigger jump than any interior step.
    const out = renderPattern(OAK, SIZE);
    const px = (x: number, y: number) => out[(y * SIZE + x) * 4];
    const wrap = Array.from({ length: SIZE }, (_, y) => Math.abs(px(0, y) - px(SIZE - 1, y)));
    const interior = Array.from({ length: SIZE }, (_, y) => Math.abs(px(1, y) - px(0, y)));
    expect(Math.max(...wrap)).toBeLessThanOrEqual(Math.max(...interior) * 3 + 6);
  });

  it('renders a solid pattern as one flat colour', () => {
    const out = renderPattern({ kind: 'solid', base: [10, 20, 30] }, 4);
    expect(Array.from(out.slice(0, 8))).toEqual([10, 20, 30, 255, 10, 20, 30, 255]);
  });
});

describe('renderNormalMap', () => {
  it('returns RGBA for every pixel, fully opaque', () => {
    const out = renderNormalMap(OAK, SIZE, 2.6);
    expect(out).toHaveLength(SIZE * SIZE * 4);
    expect(channels(out, 3).every((a) => a === 255)).toBe(true);
  });

  it('is deterministic, like the colour map it is derived from', () => {
    expect(Array.from(renderNormalMap(OAK, SIZE, 2.6))).toEqual(
      Array.from(renderNormalMap(OAK, SIZE, 2.6)),
    );
  });

  it('encodes unit vectors — every texel is a normal, not a colour', () => {
    const out = renderNormalMap(OAK, SIZE, 2.6);
    for (let i = 0; i < out.length; i += 4) {
      const x = (out[i] / 255) * 2 - 1;
      const y = (out[i + 1] / 255) * 2 - 1;
      const z = (out[i + 2] / 255) * 2 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
    }
  });

  it('points mostly up (+Z) — a surface, not noise', () => {
    const out = renderNormalMap(OAK, SIZE, 2.6);
    expect(channels(out, 2).every((b) => b > 127)).toBe(true);
  });

  it('strength 0 gives a perfectly flat map', () => {
    const flat = renderNormalMap(OAK, SIZE, 0);
    // Exactly (0, 0, 1): the neutral normal every renderer treats as "no relief".
    expect(channels(flat, 0).every((r) => Math.abs(r - 127.5) < 1)).toBe(true);
    expect(channels(flat, 2).every((b) => b >= 254)).toBe(true);
  });

  it('more strength means more relief', () => {
    const spread = (s: number) => {
      const r = channels(renderNormalMap(OAK, SIZE, s), 0);
      return Math.max(...r) - Math.min(...r);
    };
    expect(spread(4)).toBeGreaterThan(spread(1));
  });
});