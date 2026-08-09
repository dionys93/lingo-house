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

// A gable roof has TWO distinct overhangs, and they are not interchangeable:
//  - rakeOverhang: how far the slopes extend past the gable END walls, along the
//    ridge. Purely horizontal — it does not change any Y.
//  - eaveOverhang: how far the slopes extend past the EAVE walls (front/back,
//    perpendicular to the ridge), measured as horizontal run from the wall's
//    OUTER face. The slope plane continues down its own pitch line, so the eave
//    edge sits BELOW wall-top by pitch × eaveOverhang.
// bearingOffset places the plane correctly on a wall that has thickness: the
// footprint box is the wall CENTERLINE bbox, but walls are extruded ±half their
// thickness around it, and the roof must bear on the OUTER top edge — a plane
// through wall-top at the centerline would slice pitch × halfThickness into the
// wall's outboard top and let it bleed through. So the plane passes through
// wall-top at (footprint edge + bearingOffset); every wall top is at or below it.
// Named record rather than positional numbers: these are all plain numbers and
// would be silently transposable as positional arguments.
export interface RoofShape {
  readonly pitch: number; // rise per unit of horizontal run (a ratio)
  readonly rakeOverhang: number;
  readonly eaveOverhang: number;
  readonly bearingOffset: number; // half the wall thickness, supplied by the shell
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

// The gable's top is left open (see the shell) so the slopes never z-fight it —
// the roof is the only surface over the gable ends. The gable triangles keep
// their bases at the footprint (centerline) edge at wall-top; only the SLOPES
// extend. The plane bears on the wall's outer face (footprint edge + bearing):
// there it passes through wall-top exactly, rises inward, and drops outward down
// the pitch line to the eave — so wall tops sit at or below it everywhere, and
// the gable's sloped edges sit just under it (strictly steeper chord to the same
// ridge), never poking through.
export function gableRoof(box: RoofBox, wallTop: number, shape: RoofShape): RoofMesh {
  const { x0, x1, z0, z1 } = box;
  const { pitch, rakeOverhang, eaveOverhang, bearingOffset } = shape;
  const eaveY = wallTop - pitch * eaveOverhang; // low edge, below wall-top

  if (x1 - x0 >= z1 - z0) {
    // ridge along X — slopes face front/back (±Z eaves), gable ends face ±X
    const midZ = (z0 + z1) / 2;
    const ridgeY = wallTop + pitch * ((z1 - z0) / 2 + bearingOffset);
    const xa = x0 - rakeOverhang; // slopes hang past the gable ends
    const xb = x1 + rakeOverhang;
    const zFront = z1 + bearingOffset + eaveOverhang; // past the wall's outer face…
    const zBack = z0 - bearingOffset - eaveOverhang; // …continuing down the pitch line
    return {
      slopes: slopeMesh([
        [[xa, eaveY, zFront], [xb, eaveY, zFront], [xb, ridgeY, midZ], [xa, ridgeY, midZ]], // front
        [[xb, eaveY, zBack], [xa, eaveY, zBack], [xa, ridgeY, midZ], [xb, ridgeY, midZ]], // back
      ]),
      gables: [
        { base0: [x0, wallTop, z0], base1: [x0, wallTop, z1], apex: [x0, ridgeY, midZ], axis: 'x' },
        { base0: [x1, wallTop, z0], base1: [x1, wallTop, z1], apex: [x1, ridgeY, midZ], axis: 'x' },
      ],
    };
  }

  // ridge along Z — slopes face left/right (±X eaves), gable ends face ±Z
  const midX = (x0 + x1) / 2;
  const ridgeY = wallTop + pitch * ((x1 - x0) / 2 + bearingOffset);
  const za = z0 - rakeOverhang;
  const zb = z1 + rakeOverhang;
  const xRight = x1 + bearingOffset + eaveOverhang;
  const xLeft = x0 - bearingOffset - eaveOverhang;
  return {
    slopes: slopeMesh([
      [[xRight, eaveY, za], [xRight, eaveY, zb], [midX, ridgeY, zb], [midX, ridgeY, za]], // right
      [[xLeft, eaveY, zb], [xLeft, eaveY, za], [midX, ridgeY, za], [midX, ridgeY, zb]], // left
    ]),
    gables: [
      { base0: [x0, wallTop, z0], base1: [x1, wallTop, z0], apex: [midX, ridgeY, z0], axis: 'z' },
      { base0: [x0, wallTop, z1], base1: [x1, wallTop, z1], apex: [midX, ridgeY, z1], axis: 'z' },
    ],
  };
}