// src/tests/meshGeometry.test.ts
//
// The MeshData → BufferGeometry adapter. Split out of roofGeometry.test.ts when
// the module was, so each test file names a real file again.

import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import { gableRoof, type RoofShape } from '../core/roof';
import { meshGeometry } from '../scene/meshGeometry';

const SHAPE: RoofShape = { pitch: 0.5, rakeOverhang: 0.1, eaveOverhang: 0.2, bearingOffset: 0.04 };

// The authored massing: a tall storey with a lower one set back in front of it.
// Their ridges run on different axes, which is exactly the pair most likely to
// disagree with each other.
const tall = gableRoof({ x0: 0, x1: 3, z0: 0, z1: 3.5 }, 2.4, SHAPE);
const low = gableRoof({ x0: 0, x1: 3, z0: 3.5, z1: 4.5 }, 1.2, { ...SHAPE, abuts: { z0: true } });

const PANTILE: Corrugation = { period: 0.1, depth: 0.035, segments: 16, profile: pantileRoll };

const at = (a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
  [a.getX(i), a.getY(i), a.getZ(i)] as const;
const close = (a: readonly number[], b: readonly number[], eps = 1e-6) =>
  a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('meshGeometry', () => {
  it('carries every vertex the core produced', () => {
    const geo = meshGeometry(tall.slopes);
    expect(geo.getAttribute('position').count).toBe(tall.slopes.positions.length);
  });

  it('carries the INDEX — without it the panels tear open at the ridge', () => {
    // The regression. 2 quads → 8 vertices → 12 indices → 4 triangles. Drop the
    // index and three draws floor(8 / 3) = 2 triangles from those same vertices.
    const geo = meshGeometry(tall.slopes);
    const index = geo.getIndex();
    expect(index).not.toBeNull();
    expect(index?.count).toBe(tall.slopes.indices.length);
    expect(index?.count).toBe(12);
  });

  it('carries a UV per vertex, or every map samples texel (0,0)', () => {
    const geo = meshGeometry(tall.slopes);
    const uv = geo.getAttribute('uv');
    expect(uv).toBeDefined();
    expect(uv.count).toBe(tall.slopes.positions.length);
    expect(uv.itemSize).toBe(2);
  });

  it('keeps UVs in world units once they are on the GPU buffer', () => {
    // Float32 rather than the core's doubles, so this is the last place the
    // metric scale could be lost.
    const geo = meshGeometry(tall.slopes);
    const uv = geo.getAttribute('uv');
    const pos = geo.getAttribute('position');
    for (let q = 0; q < pos.count; q += 4) {
      const alongEave = Math.hypot(
        pos.getX(q + 1) - pos.getX(q),
        pos.getY(q + 1) - pos.getY(q),
        pos.getZ(q + 1) - pos.getZ(q),
      );
      expect(Math.abs(uv.getX(q + 1) - uv.getX(q)) / alongEave).toBeCloseTo(1, 4);
    }
  });

  it('meets at the ridge without welding — a crease, not a curve', () => {
    // Two facts at once. The panels DO share the ridge line, so there is no gap
    // to see through; and they do NOT share vertices, so each keeps its own face
    // normal. If someone reaches for mergeVertices to "tidy up", the second half
    // fails and the roof rounds off at the top.
    const geo = meshGeometry(tall.slopes);
    const pos = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    let coincident = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 4; j < 8; j++) {
        if (!close(at(pos, i), at(pos, j))) continue;
        coincident += 1;
        expect(close(at(n, i), at(n, j))).toBe(false);
      }
    }
    expect(coincident).toBe(2);
  });
});