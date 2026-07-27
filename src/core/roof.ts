// // src/core/roof.ts
// //
// // A GABLE roof over a rectangular footprint: one ridge, two sloped panels, and
// // two triangular gable ends. Height depends only on distance from the ridge LINE
// // (not the nearest edge) — that's what makes it read as a "triangular roof"
// // rather than the rounded hill a hip/heightfield gives on a square footprint. The
// // ridge runs along the longer side (ties → the X axis). Pure, no globals: it's a
// // function of the footprint box + wall height + pitch, exactly the seam we set up.
// //
// // (Non-rectangular footprints — an L with its own wing gables and valleys — remain
// // the deferred hard case; this covers the rectangular MVP.)

// type Vec3 = readonly [number, number, number];

// export interface MeshData {
//   readonly positions: readonly Vec3[];
//   readonly indices: readonly number[]; // flat, 3 per triangle
// }

// export interface RoofMesh {
//   readonly slopes: MeshData; // the sloped panels — roof material
//   readonly gables: MeshData; // the triangular ends — they're wall, so siding
// }

// export interface RoofBox {
//   readonly x0: number;
//   readonly x1: number;
//   readonly z0: number;
//   readonly z1: number;
// }

// // Pitch as a RATIO (rise per unit of horizontal run) — so the ridge height scales
// // with the span and any future wing at the same pitch tops out consistently.
// export function gableRoof(box: RoofBox, wallTop: number, pitch: number): RoofMesh {
//   const { x0, x1, z0, z1 } = box;
//   const width = x1 - x0;
//   const depth = z1 - z0;
//   const ridgeAlongX = width >= depth;

//   const sPos: Vec3[] = [];
//   const sIdx: number[] = [];
//   const gPos: Vec3[] = [];
//   const gIdx: number[] = [];
//   const quad = (P: Vec3[], I: number[], a: Vec3, b: Vec3, c: Vec3, d: Vec3): void => {
//     const n = P.length;
//     P.push(a, b, c, d);
//     I.push(n, n + 1, n + 2, n, n + 2, n + 3);
//   };
//   const tri = (P: Vec3[], I: number[], a: Vec3, b: Vec3, c: Vec3): void => {
//     const n = P.length;
//     P.push(a, b, c);
//     I.push(n, n + 1, n + 2);
//   };

//   if (ridgeAlongX) {
//     const midZ = (z0 + z1) / 2;
//     const ridgeY = wallTop + pitch * (depth / 2);
//     quad(sPos, sIdx, [x0, wallTop, z1], [x1, wallTop, z1], [x1, ridgeY, midZ], [x0, ridgeY, midZ]); // front slope
//     quad(sPos, sIdx, [x1, wallTop, z0], [x0, wallTop, z0], [x0, ridgeY, midZ], [x1, ridgeY, midZ]); // back slope
//     tri(gPos, gIdx, [x0, wallTop, z0], [x0, wallTop, z1], [x0, ridgeY, midZ]); // left gable
//     tri(gPos, gIdx, [x1, wallTop, z1], [x1, wallTop, z0], [x1, ridgeY, midZ]); // right gable
//   } else {
//     const midX = (x0 + x1) / 2;
//     const ridgeY = wallTop + pitch * (width / 2);
//     quad(sPos, sIdx, [x1, wallTop, z0], [x1, wallTop, z1], [midX, ridgeY, z1], [midX, ridgeY, z0]); // right slope
//     quad(sPos, sIdx, [x0, wallTop, z1], [x0, wallTop, z0], [midX, ridgeY, z0], [midX, ridgeY, z1]); // left slope
//     tri(gPos, gIdx, [x0, wallTop, z0], [x1, wallTop, z0], [midX, ridgeY, z0]); // back gable
//     tri(gPos, gIdx, [x1, wallTop, z1], [x0, wallTop, z1], [midX, ridgeY, z1]); // front gable
//   }

//   return {
//     slopes: { positions: sPos, indices: sIdx },
//     gables: { positions: gPos, indices: gIdx },
//   };
// }

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

// Pitch as a RATIO (rise per unit of horizontal run) — so ridge height scales with
// the span and any future wing at the same pitch tops out consistently.
export function gableRoof(box: RoofBox, wallTop: number, pitch: number): RoofMesh {
  const { x0, x1, z0, z1 } = box;
  const width = x1 - x0;
  const depth = z1 - z0;
  const ridgeAlongX = width >= depth;

  const sPos: Vec3[] = [];
  const sIdx: number[] = [];
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3): void => {
    const n = sPos.length;
    sPos.push(a, b, c, d);
    sIdx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  };

  let gables: Gable[];
  if (ridgeAlongX) {
    const midZ = (z0 + z1) / 2;
    const ridgeY = wallTop + pitch * (depth / 2);
    quad([x0, wallTop, z1], [x1, wallTop, z1], [x1, ridgeY, midZ], [x0, ridgeY, midZ]); // front slope
    quad([x1, wallTop, z0], [x0, wallTop, z0], [x0, ridgeY, midZ], [x1, ridgeY, midZ]); // back slope
    gables = [
      { base0: [x0, wallTop, z0], base1: [x0, wallTop, z1], apex: [x0, ridgeY, midZ], axis: 'x' },
      { base0: [x1, wallTop, z0], base1: [x1, wallTop, z1], apex: [x1, ridgeY, midZ], axis: 'x' },
    ];
  } else {
    const midX = (x0 + x1) / 2;
    const ridgeY = wallTop + pitch * (width / 2);
    quad([x1, wallTop, z0], [x1, wallTop, z1], [midX, ridgeY, z1], [midX, ridgeY, z0]); // right slope
    quad([x0, wallTop, z1], [x0, wallTop, z0], [midX, ridgeY, z0], [midX, ridgeY, z1]); // left slope
    gables = [
      { base0: [x0, wallTop, z0], base1: [x1, wallTop, z0], apex: [midX, ridgeY, z0], axis: 'z' },
      { base0: [x0, wallTop, z1], base1: [x1, wallTop, z1], apex: [midX, ridgeY, z1], axis: 'z' },
    ];
  }

  return { slopes: { positions: sPos, indices: sIdx }, gables };
}