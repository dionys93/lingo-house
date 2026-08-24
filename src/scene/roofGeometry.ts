// src/scene/roofGeometry.ts
//
// MeshData → BufferGeometry for the roof, plus the corrugation that gives clay
// pantiles their actual thickness. Pure functions that happen to import three:
// BufferGeometry and BufferAttribute are plain JS, no DOM and no WebGL, so this
// whole file runs under vitest. It lives outside Roof.tsx because the component
// is four lines and this is the part worth testing.
//
// ── WHY CORRUGATION IS THE SHELL'S JOB ──────────────────────────────────────
//
// `core/roof.ts` says how big the roof is and how steeply it pitches. It does
// not know what the roof is made of, and it should not: swap pantiles for slate
// and the same plane wants to be flat. Corrugation is a property of the
// MATERIAL, so it belongs here, driven by `SurfaceSpec.corrugation`.
//
// ── WHY ONE DIRECTION IS ENOUGH ─────────────────────────────────────────────
//
// A pantile's roll runs UNBROKEN from eave to ridge. The cross-section is the
// same the whole way up, so the mesh only needs subdividing ACROSS the eave —
// never up the slope. That is the difference between a corrugated sheet at a
// few hundred triangles per panel and a displacement map at tens of thousands.
// The course lines that DO vary up the slope are shallow steps with no
// silhouette, and they stay in the normal map where they cost nothing.

import * as THREE from 'three';
import type { MeshData, Vec3 } from '../core/mesh';

const mix = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export interface Corrugation {
  readonly period: number; // world units between rolls — one tile's cover width
  readonly depth: number; // world units, pan to crown
  readonly segments: number; // subdivisions per period
  /** 0 in the pan, 1 at the crown. Takes the world coordinate over `period`. */
  readonly profile: (t: number) => number;
}

/**
 * Stations across `[uMin, uMax]`, on multiples of `step` measured from WORLD
 * ZERO, plus the two ends.
 *
 * Anchoring to world zero rather than dividing the span evenly is what keeps
 * the geometry in phase with the texture — both index off the same origin — and
 * what keeps two adjoining roofs' rolls on the same lines. Dividing the span
 * would put every roof's first roll at its own corner.
 */
function stations(uMin: number, uMax: number, step: number): number[] {
  const out = [uMin];
  const eps = step * 1e-6;
  for (let k = Math.ceil(uMin / step); k * step < uMax - eps; k++) {
    const u = k * step;
    if (u > uMin + eps) out.push(u);
  }
  out.push(uMax);
  return out;
}

/**
 * Subdivide each flat slope panel across the eave and push it out along its own
 * normal by the roll profile.
 *
 * Vertices are SHARED between adjacent stations within a panel, so
 * computeVertexNormals averages across them and the barrel reads as a curve
 * rather than as facets. Panels stay separate from each other, so the ridge
 * stays a crease. That distinction is the whole reason this builds its own
 * index buffer instead of emitting loose quads.
 *
 * UVs are untouched in u: the texture maps to the roof's PLAN width, which is
 * what a tile's cover width means. Mapping to the developed (corrugated) width
 * would shrink every tile by the length the corrugation adds.
 *
 * ── WHY THE LIFT IS VERTICAL AND NOT ALONG THE PANEL NORMAL ─────────────────
 *
 * Because the two panels of a roof have different normals, and displacing each
 * along its own would pull their shared ridge vertices apart — 63mm at pitch
 * 0.5, which is a visible split down the top of the roof. A vertical lift is
 * the same for both panels at every station, so the ridge closes exactly, on
 * asymmetric roofs (one abutting eave) as well as symmetric ones.
 *
 * The cost is that 70mm of vertical rise reads as 70 × cos(pitch) ≈ 63mm
 * measured perpendicular to the deck, and the barrels lean very slightly
 * out of square with the roof plane. At any pitch a house actually has, that
 * is invisible; a ridge you can see daylight through is not.
 */
export function corrugate(data: MeshData, c: Corrugation): MeshData {
  const positions: Vec3[] = [];
  const uvs: (readonly [number, number])[] = [];
  const indices: number[] = [];
  const step = c.period / c.segments;

  for (let q = 0; q < data.positions.length; q += 4) {
    // The quad invariant from core/roof.ts: 0,1 on the eave, 2,3 on the ridge,
    // 1→2 up the slope.
    const [e0, e1, r2, r3] = [
      data.positions[q], data.positions[q + 1], data.positions[q + 2], data.positions[q + 3],
    ];
    const u0 = data.uvs[q][0];
    const u1 = data.uvs[q + 1][0];
    const vTop = data.uvs[q + 2][1];

    // ONE VERTEX RUN PER TILE, not per panel. Within a tile the stations share
    // vertices, so computeVertexNormals averages across them and the roll comes
    // out as a barrel rather than a row of facets. ACROSS a tile boundary
    // nothing is shared, so the lap edge stays a hard crease with a shadow.
    //
    // Welding the whole panel was the second half of why this read as corrugated
    // iron: even with a steep drop in the profile, averaged normals rounded it
    // into just another part of the wave.
    const uLo = Math.min(u0, u1);
    const uHi = Math.max(u0, u1);
    for (let k = Math.floor(uLo / c.period); k * c.period < uHi - 1e-9; k++) {
      const a = Math.max(uLo, k * c.period);
      const b = Math.min(uHi, (k + 1) * c.period);
      if (b - a < step * 1e-3) continue; // a sliver at the rake overhang

      const base = positions.length;
      const us = stations(a, b, step);
      for (const u of us) {
        const s = (u - u0) / (u1 - u0); // u1 === u0 is impossible: a quad has width
        const lift = c.depth * c.profile(u / c.period);
        const up = (p: Vec3): Vec3 => [p[0], p[1] + lift, p[2]];
        positions.push(up(mix(e0, e1, s)), up(mix(r3, r2, s)));
        uvs.push([u, 0], [u, vTop]);
      }
      for (let i = 0; i < us.length - 1; i++) {
        const v = base + i * 2;
        // Same winding as the flat quad it replaces: (e0,e1,r2) then (e0,r2,r3).
        indices.push(v, v + 2, v + 3, v, v + 3, v + 1);
      }
    }
  }

  return { positions, uvs, indices };
}

/**
 * MeshData → BufferGeometry, for ANY producer. Nothing here is roof-specific;
 * it was named `slopeGeometry` only because the roof was the first mesh to need
 * it. The ground, the door and every item go through this same function, which
 * is the point — the three traps below are encoded once instead of rediscovered
 * per component.
 */
export function meshGeometry(data: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions.flat()), 3));
  // Without this the roof had no `uv` attribute at all, so any `map` sampled
  // texel (0,0) forever and every surface came out as one flat colour — which
  // looks exactly like the fallback the component draws, which is why it read
  // as "the texture didn't load" rather than "the geometry can't be textured".
  //
  // In WORLD UNITS, not 0..1 (see MeshData in core/mesh.ts), so the material
  // must come from `useTiledSurface` and not `useSurfaceMaterial`.
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs.flat()), 2));
  // Without the index, three reads a flat slope's 8 vertices as 2 unindexed
  // triangles instead of the 4 the quads describe: half the front panel, one
  // spurious sheet stretched from the ridge across the back, and both far ridge
  // corners dropped. It looks like a split at the top of the roof.
  g.setIndex([...data.indices]);
  // Runs AFTER setIndex — computeVertexNormals takes a different path for
  // indexed geometry, and the smoothing across shared vertices is exactly what
  // rounds the corrugation into barrels.
  g.computeVertexNormals();
  return g;
}