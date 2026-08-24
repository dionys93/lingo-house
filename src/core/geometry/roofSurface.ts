
//
// The roof's mesh PRODUCERS: corrugation, and the gable ends. MeshData in,
// MeshData out — no three, no DOM, no clock.
//
// ── NO THREE IN THIS FILE, ON PURPOSE ───────────────────────────────────────
//
// These are pure functions and they should be reachable by the fast loop:
//
//   node --experimental-strip-types -e "import('./src/scene/roofMesh.ts')…"
//
// They were not, until this file existed. They sat next to `meshGeometry`,
// which needs three, and a module-level import is all-or-nothing — one
// `import * as THREE` takes every function in the file down with it, used or
// not. Verifying a pure change to `gableMesh` meant stripping the import into a
// scratch copy first, which is exactly the friction the project's "measure,
// don't reason" rule exists to avoid.
//
// An eslint override enforces it now rather than leaving it to memory. A
// TYPE-only import of three would be fine — node erases those — but a value
// import is what breaks the loop, so that is what the rule bans.
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

import type { MeshData, Vec2, Vec3 } from '../core/mesh';
import type { Gable } from '../core/roof';

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
 * The gable ends: each flat triangle from the core extruded to wall thickness,
 * so it sits on the end wall and reads as the wall continuing up to the ridge.
 *
 * EVERY FACE GETS ITS OWN VERTICES, and that is the entire point of this
 * function existing. The version this replaced shared the base corners between
 * the end-cap triangle and the bottom quad, so `computeVertexNormals` averaged
 * a face normal with a perpendicular one. Measured on this house, the three
 * vertex normals of a single FLAT triangle came out 28.3° apart on one roof and
 * 10.7° on the other — so the gable shaded as a gradient while the wall beside
 * it, a BoxGeometry with unshared faces, shaded uniformly at 0.0°. No amount of
 * matching the colour fixes that; it is a normals problem wearing a paint
 * problem's clothes.
 *
 * Same rule `mergeMeshes` states: two surfaces meeting at an angle have
 * genuinely different normals there, and welding them rounds the corner off.
 *
 * The top is left OPEN — the overhanging roof covers it, and adding the sloped
 * faces would put them coplanar with the roof and z-fight.
 *
 * UVs are metric and WORLD-anchored, matching the roof's convention rather than
 * boxMesh's: a gable is a fixed piece of building, and when walls are eventually
 * textured, world anchoring is what lets the siding on the gable line up with
 * the siding on the wall underneath it.
 */
export function gableMesh(gables: readonly Gable[], thickness: number): MeshData {
  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  // One face, its own vertices, never reused. The two projection axes are
  // per-face and NOT shared: the caps stand vertically so their `v` is height,
  // but the bottom quad lies flat, where height is constant. Projecting it the
  // same way collapses its UVs to a line — uvDensity reports exactly that, as
  // DegenerateUvTriangle, which is how this was caught.
  const face = (vs: readonly Vec3[], uAxis: 0 | 1 | 2, vAxis: 0 | 1 | 2): void => {
    const base = positions.length;
    for (const v of vs) {
      positions.push(v);
      uvs.push([v[uAxis], v[vAxis]]);
    }
    for (let i = 2; i < vs.length; i++) indices.push(base, base + i - 1, base + i);
  };

  for (const g of gables) {
    const h = thickness / 2;
    const off: Vec3 = g.axis === 'x' ? [h, 0, 0] : [0, 0, h];
    const shift = (v: Vec3, s: number): Vec3 => [
      v[0] + off[0] * s,
      v[1] + off[1] * s,
      v[2] + off[2] * s,
    ];
    const [A, B, P] = [shift(g.base0, 1), shift(g.base1, 1), shift(g.apex, 1)];
    const [a, b, p] = [shift(g.base0, -1), shift(g.base1, -1), shift(g.apex, -1)];

    // The axis the gable's base runs along, and the one its thickness runs along.
    const [along, through]: [0 | 2, 0 | 2] = g.axis === 'x' ? [2, 0] : [0, 2];
    face([A, B, P], along, 1); // outer cap — u along the base, v is height
    face([a, p, b], along, 1); // inner cap
    face([A, a, b, B], along, through); // bottom, sitting flat on the wall top
  }

  return { positions, uvs, indices };
}