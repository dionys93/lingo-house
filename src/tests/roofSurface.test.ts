// src/tests/roofSurface.test.ts
//
// The roof's pure mesh producers. Everything under test here runs without three
// — the vitest wrapper is for assertions, not for module resolution.

import { describe, it, expect } from 'vitest';
import { gableRoof, type RoofShape } from '../core/geometry/roof';
import { corrugate, type Corrugation } from '../core/geometry/roofSurface';
import { pantileRoll } from '../core/geometry/pattern';

const SHAPE: RoofShape = { pitch: 0.5, rakeOverhang: 0.1, eaveOverhang: 0.2, bearingOffset: 0.04 };

// The authored massing: a tall storey with a lower one set back in front of it.
// Their ridges run on different axes, which is exactly the pair most likely to
// disagree with each other.
const tall = gableRoof({ x0: 0, x1: 3, z0: 0, z1: 3.5 }, 2.4, SHAPE);
const low = gableRoof({ x0: 0, x1: 3, z0: 3.5, z1: 4.5 }, 1.2, { ...SHAPE, abuts: { z0: true } });

const PANTILE: Corrugation = { period: 0.1, depth: 0.035, segments: 16, profile: pantileRoll };

const close = (a: readonly number[], b: readonly number[], eps = 1e-6) =>
  a.every((v, i) => Math.abs(v - b[i]) < eps);

describe('corrugate', () => {
  const rolled = corrugate(tall.slopes, PANTILE);

  it('gives every vertex a UV and keeps every index in range', () => {
    expect(rolled.uvs).toHaveLength(rolled.positions.length);
    expect(rolled.indices.every((i) => i >= 0 && i < rolled.positions.length)).toBe(true);
  });

  it('does not change the roof footprint — only its surface', () => {
    // u is the world coordinate along the eave; the tiles must not widen the
    // roof. Only Y moves.
    const u = (m: { uvs: readonly (readonly [number, number])[] }) => m.uvs.map((t) => t[0]);
    expect(Math.min(...u(rolled))).toBeCloseTo(Math.min(...u(tall.slopes)), 9);
    expect(Math.max(...u(rolled))).toBeCloseTo(Math.max(...u(tall.slopes)), 9);
  });

  it('lifts by the profile depth, pan to crown', () => {
    // The eave row of the first panel — every other vertex in its half.
    const half = rolled.positions.length / 2;
    const lifts = rolled.positions.slice(0, half).filter((_, i) => i % 2 === 0).map((p) => p[1]);
    const range = Math.max(...lifts) - Math.min(...lifts);
    // Not exactly `depth`: 16 samples per period never land on the crown, which
    // sits at t ≈ 0.775 while the samples fall on sixteenths. The discretised
    // roll reaches ~98.5% of the true profile. Raising `segments` closes the gap
    // and is not worth the triangles.
    expect(range).toBeLessThanOrEqual(PANTILE.depth + 1e-9);
    expect(range).toBeGreaterThan(PANTILE.depth * 0.97);
  });

  it('lifts VERTICALLY, so the two panels still meet along the ridge', () => {
    // The failure this avoids: displacing each panel along its own normal pulls
    // their shared ridge vertices 63mm apart at this pitch — a visible split
    // down the top of the roof. A vertical lift is identical on both panels at
    // every station.
    const ridge = rolled.positions.filter((_, i) => i % 2 === 1);
    const half = ridge.length / 2;
    const a = ridge.slice(0, half);
    const b = ridge.slice(half);
    // Same stations on both panels, one panel's run reversed relative to the other.
    for (const p of a) {
      expect(b.some((q) => close(p, q, 1e-9))).toBe(true);
    }
  });

  it('phase-locks to the world origin, not to each roof corner', () => {
    // Two roofs whose ridges run on different axes still put their rolls on
    // multiples of the cover width measured from world zero, so nothing drifts
    // out of step where they meet.
    for (const mesh of [corrugate(tall.slopes, PANTILE), corrugate(low.slopes, PANTILE)]) {
      const step = PANTILE.period / PANTILE.segments;
      const interior = mesh.uvs.map((t) => t[0]).filter((u) => Math.abs(u / step - Math.round(u / step)) < 1e-6);
      expect(interior.length).toBeGreaterThan(mesh.uvs.length / 2);
    }
  });

  it('breaks the vertex run at every tile edge, so the lap stays a crease', () => {
    // THE fix for the corrugated-iron look, and it needs both halves: a steep
    // drop in the profile AND a mesh that refuses to average normals across it.
    // Welding the whole panel rounded the lap edge back into the wave no matter
    // how steep the profile got.
    //
    // Stations inside a tile are shared (smooth barrel); stations at a tile
    // boundary are emitted twice, once for each neighbour.
    const counts = new Map<string, number>();
    for (const p of rolled.positions) {
      const k = p.map((v) => v.toFixed(6)).join(',');
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const duplicated = [...counts.values()].filter((n) => n > 1).length;
    // ~37 tiles per panel, two panels, eave and ridge rows.
    expect(duplicated).toBeGreaterThan(100);
  });

  it('keeps the roll asymmetric — sheet metal is symmetric, a lapped tile is not', () => {
    const flank = (t0: number, t1: number) =>
      Math.abs(pantileRoll(t1) - pantileRoll(t0)) * PANTILE.depth / ((t1 - t0) * PANTILE.period);
    // The rise climbs over 28% of the cover width, the lap face falls over 12%.
    expect(flank(0.88, 1.0) / flank(0.6, 0.88)).toBeGreaterThan(2);
  });

  it('stays affordable', () => {
    // ~2,400 triangles on the tall roof. A displacement map over the same area
    // would be tens of thousands, and it is unnecessary because a pantile's
    // roll is constant up the slope.
    expect(rolled.indices.length / 3).toBeLessThan(5000);
  });
});