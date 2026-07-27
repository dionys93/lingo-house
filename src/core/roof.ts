// src/core/roof.ts
//
// A GABLE roof over a rectangular footprint: one ridge, two sloped panels, and
// two triangular gable ends. Height depends only on distance from the ridge LINE
// (not the nearest edge) — that's what makes it a "triangular roof" rather than
// the rounded hill a hip/heightfield gives on a square footprint. The ridge runs
// along the longer side (ties → the X axis). Pure, no globals.
//
// The gable ends are described here as flat triangles + an extrude axis; the SHELL
// gives them the wall's thickness, so a gable reads as the end WALL continuing up
// to the ridge, not a flat sheet placed on the roof. (Thickness is a render
// constant, so it stays out of the core.)
//
// (Non-rectangular footprints — an L with wing gables and valleys — remain the
// deferred hard case; this covers the rectangular MVP.)

type Vec3 = readonly [number, number, number];

export interface MeshData {
  readonly positions: readonly Vec3[];
  readonly indices: readonly number[]; // flat, 3 per triangle
}

// A gable end, as a flat triangle the shell extrudes to wall thickness along
// `axis` (the direction the end wall is thin in).
export interface Gable {
  readonly base0: Vec3; // one bottom corner, at wall-top
  readonly base1: Vec3; // the other bottom corner, at wall-top
  readonly apex: Vec3; // the ridge point
  readonly axis: 'x' | 'z';
}

export interface RoofMesh {
  readonly slopes: MeshData; // the sloped panels — roof material
  readonly gables: readonly Gable[]; // the ends — extruded to wall thickness, siding
}

export interface RoofBox {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

type Quad = readonly [Vec3, Vec3, Vec3, Vec3];

// Two triangles per quad, built without mutation.
function slopeMesh(quads: readonly Quad[]): MeshData {
  return {
    positions: quads.flatMap((q) => [...q]),
    indices: quads.flatMap((_, i) => {
      const n = i * 4;
      return [n, n + 1, n + 2, n, n + 2, n + 3];
    }),
  };
}

// Pitch as a RATIO (rise per unit of horizontal run). The slopes OVERHANG the
// gable ends by `overhang` (the rake overhang — roofs hang past the gable wall,
// which reads more naturally than stopping flush). No z-fight because the gable's
// top is left open (see the shell) — the roof is the only surface over it.
export function gableRoof(box: RoofBox, wallTop: number, pitch: number, overhang: number): RoofMesh {
  const { x0, x1, z0, z1 } = box;

  if (x1 - x0 >= z1 - z0) {
    // ridge along X — slopes face front/back, gable ends face ±X
    const midZ = (z0 + z1) / 2;
    const ridgeY = wallTop + pitch * ((z1 - z0) / 2);
    const xa = x0 - overhang; // slopes hang past the gable ends
    const xb = x1 + overhang;
    return {
      slopes: slopeMesh([
        [[xa, wallTop, z1], [xb, wallTop, z1], [xb, ridgeY, midZ], [xa, ridgeY, midZ]], // front
        [[xb, wallTop, z0], [xa, wallTop, z0], [xa, ridgeY, midZ], [xb, ridgeY, midZ]], // back
      ]),
      gables: [
        { base0: [x0, wallTop, z0], base1: [x0, wallTop, z1], apex: [x0, ridgeY, midZ], axis: 'x' },
        { base0: [x1, wallTop, z0], base1: [x1, wallTop, z1], apex: [x1, ridgeY, midZ], axis: 'x' },
      ],
    };
  }

  // ridge along Z — slopes face left/right, gable ends face ±Z
  const midX = (x0 + x1) / 2;
  const ridgeY = wallTop + pitch * ((x1 - x0) / 2);
  const za = z0 - overhang;
  const zb = z1 + overhang;
  return {
    slopes: slopeMesh([
      [[x1, wallTop, za], [x1, wallTop, zb], [midX, ridgeY, zb], [midX, ridgeY, za]], // right
      [[x0, wallTop, zb], [x0, wallTop, za], [midX, ridgeY, za], [midX, ridgeY, zb]], // left
    ]),
    gables: [
      { base0: [x0, wallTop, z0], base1: [x1, wallTop, z0], apex: [midX, ridgeY, z0], axis: 'z' },
      { base0: [x0, wallTop, z1], base1: [x1, wallTop, z1], apex: [midX, ridgeY, z1], axis: 'z' },
    ],
  };
}