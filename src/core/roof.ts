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
  /**
   * Sides that run into a taller wall instead of ending in open air.
   *
   * A lower roof over a setback does NOT overhang where it meets the storey
   * above — it runs into that wall and gets flashed. Left overhanging, the eave
   * reaches back UNDER the taller part and comes out below its ceiling, which is
   * what a roof cutting through an interior looks like.
   *
   * An abutting side stops at the wall centreline (so it's buried in the wall)
   * and, on an eave, keeps its full height there instead of dropping by the
   * overhang. That makes the two slopes asymmetric, which is correct: a
   * lean-to's high side is against the wall.
   */
  readonly abuts?: {
    readonly x0?: boolean;
    readonly x1?: boolean;
    readonly z0?: boolean;
    readonly z1?: boolean;
  };
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
  const { pitch, rakeOverhang, eaveOverhang, bearingOffset, abuts = {} } = shape;
  const eaveY = wallTop - pitch * eaveOverhang; // low edge, below wall-top
  // An abutting eave stops at the wall line, so it never descends the pitch and
  // sits at wall-top rather than below it.
  const rake = (side: boolean | undefined) => (side ? 0 : rakeOverhang);
  const eaveOut = (side: boolean | undefined) => (side ? 0 : bearingOffset + eaveOverhang);
  const eaveHeight = (side: boolean | undefined) => (side ? wallTop : eaveY);

  if (x1 - x0 >= z1 - z0) {
    // ridge along X — slopes face front/back (±Z eaves), gable ends face ±X
    const midZ = (z0 + z1) / 2;
    const ridgeY = wallTop + pitch * ((z1 - z0) / 2 + bearingOffset);
    const xa = x0 - rake(abuts.x0); // slopes hang past the gable ends
    const xb = x1 + rake(abuts.x1);
    const zFront = z1 + eaveOut(abuts.z1); // past the wall's outer face…
    const zBack = z0 - eaveOut(abuts.z0); // …continuing down the pitch line
    const yFront = eaveHeight(abuts.z1);
    const yBack = eaveHeight(abuts.z0);
    return {
      slopes: slopeMesh([
        [[xa, yFront, zFront], [xb, yFront, zFront], [xb, ridgeY, midZ], [xa, ridgeY, midZ]], // front
        [[xb, yBack, zBack], [xa, yBack, zBack], [xa, ridgeY, midZ], [xb, ridgeY, midZ]], // back
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
  const za = z0 - rake(abuts.z0);
  const zb = z1 + rake(abuts.z1);
  const xRight = x1 + eaveOut(abuts.x1);
  const xLeft = x0 - eaveOut(abuts.x0);
  const yRight = eaveHeight(abuts.x1);
  const yLeft = eaveHeight(abuts.x0);
  return {
    slopes: slopeMesh([
      [[xRight, yRight, za], [xRight, yRight, zb], [midX, ridgeY, zb], [midX, ridgeY, za]], // right
      [[xLeft, yLeft, zb], [xLeft, yLeft, za], [midX, ridgeY, za], [midX, ridgeY, zb]], // left
    ]),
    gables: [
      { base0: [x0, wallTop, z0], base1: [x1, wallTop, z0], apex: [midX, ridgeY, z0], axis: 'z' },
      { base0: [x0, wallTop, z1], base1: [x1, wallTop, z1], apex: [midX, ridgeY, z1], axis: 'z' },
    ],
  };
}