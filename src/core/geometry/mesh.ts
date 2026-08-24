
//
// Mesh producers, and the one check that keeps them honest.
//
// `MeshData` lived in core/roof.ts while the roof was the only thing that made
// one. It moves here because a box and a plane are about to make them too, and
// a shared type owned by one of its producers is how the producer's assumptions
// leak into everyone else's.
//
// ── THE CONTRACT, AND WHAT IS NOT PART OF IT ────────────────────────────────
//
// METRIC IS THE CONTRACT. One UV unit is one world unit, on every producer.
// That is what makes physical tile scale agree between two meshes that know
// nothing about each other, and it is what lets a consumer set
// `repeat = 1 / worldScale` — a constant — instead of fitting an integer number
// of tiles to a face and rounding.
//
// THE ANCHOR IS NOT. The roof's docblock used to say "`u` is the world
// coordinate along the eave", which is true of the roof and false of everything
// else. World-anchoring is a roof-specific choice with a roof-specific reason —
// two roofs at different heights must put their tile columns on the same lines —
// and generalising it would be wrong for anything that moves. A door ROTATES:
// world-anchored UVs on a hinged panel are either recomputed every frame or
// they are a lie that happens to be true while the door is shut.
//
// So each producer states its own anchor and the type stays out of it:
//
//   gableRoof   WORLD-anchored. Adjacent roofs must register with each other.
//   boxMesh     LOCAL-anchored. It rotates; and N identical boxes then share
//               ONE mesh instead of minting one per position.
//   planeMesh   LOCAL-anchored, for the same reason as boxMesh.

import { err, ok, type Result } from '../shared/result';

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export interface MeshData {
  readonly positions: readonly Vec3[];
  /** In WORLD UNITS along the surface — not 0..1. See the header. */
  readonly uvs: readonly Vec2[];
  readonly indices: readonly number[]; // flat, 3 per triangle
}

// ── The check ───────────────────────────────────────────────────────────────

/**
 * A mesh that cannot be measured. These are PRODUCER bugs, not authoring
 * mistakes, which is why they are their own union and not `HouseError`: a
 * degenerate triangle is a code defect and has no business surfacing in the
 * red panel that tells someone their plan is wrong.
 */
export type MeshDefect =
  | { readonly tag: 'EmptyMesh' }
  | { readonly tag: 'UvCountMismatch'; readonly positions: number; readonly uvs: number }
  | { readonly tag: 'IndexCountNotTriangles'; readonly indices: number }
  | {
      readonly tag: 'IndexOutOfRange';
      readonly at: number;
      readonly index: number;
      readonly vertices: number;
    }
  | { readonly tag: 'DegenerateUvTriangle'; readonly triangle: number };

/**
 * World units of surface per UV unit. 1.0 means metric.
 *
 * Pooled across both axes and every triangle on purpose. `min !== max` is the
 * useful signal and it catches all three failure modes at once: a whole mesh
 * scaled wrong moves the mean, a transposed worldScale splits the two axes
 * apart, and one bad face splits min from max while the mean stays plausible.
 * Reporting u and v separately would hide the third.
 */
export interface UvDensity {
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

/**
 * Measure whether a mesh's UVs are metric.
 *
 * This generalises the helper that lived inside roof.test.ts, which stepped
 * `q += 4` and read `uvs[q + 1]` — bound to the roof's quad layout and unable
 * to see a box, a plane, or anything corrugate() had already touched. Per
 * TRIANGLE instead, so it measures any producer, including ones not written yet.
 *
 * The mapping from UV to world is affine over a triangle, so with world edges
 * e1, e2 and UV edges d1, d2 the Jacobian J solves [e1 e2] = J · [d1 d2]:
 *
 *     ∂p/∂u = (e1·d2.v − e2·d1.v) / det        det = d1.u·d2.v − d2.u·d1.v
 *     ∂p/∂v = (e2·d1.u − e1·d2.u) / det
 *
 * RETURNS A RESULT, and that is not ceremony. Slivers genuinely occur in this
 * codebase — `corrugate` carries an explicit guard for one at the rake overhang
 * — and a zero-area UV triangle divides by `det`. Returning NaN would poison
 * the mean silently and leave a "measured at 1.0" claim standing over a broken
 * mesh, which is precisely the silenced signal this function exists to prevent.
 * Every defect is collected, not just the first, so one run names every bad
 * triangle.
 */
export function uvDensity(mesh: MeshData): Result<UvDensity, readonly MeshDefect[]> {
  const { positions, uvs, indices } = mesh;
  const defects: MeshDefect[] = [];

  if (positions.length !== uvs.length) {
    defects.push({ tag: 'UvCountMismatch', positions: positions.length, uvs: uvs.length });
  }
  if (indices.length % 3 !== 0) {
    defects.push({ tag: 'IndexCountNotTriangles', indices: indices.length });
  }
  if (indices.length === 0 || positions.length === 0) {
    defects.push({ tag: 'EmptyMesh' });
  }
  // Bail before indexing: every check below reads through `indices`, so a bad
  // one would report a cascade of consequences on top of its own cause.
  if (defects.length > 0) return err(defects);

  for (const [at, index] of indices.entries()) {
    if (!Number.isInteger(index) || index < 0 || index >= positions.length) {
      defects.push({ tag: 'IndexOutOfRange', at, index, vertices: positions.length });
    }
  }
  if (defects.length > 0) return err(defects);

  const densities: number[] = [];

  for (let t = 0; t * 3 < indices.length; t++) {
    const [i0, i1, i2] = [indices[t * 3], indices[t * 3 + 1], indices[t * 3 + 2]];
    const [p0, p1, p2] = [positions[i0], positions[i1], positions[i2]];
    const [t0, t1, t2] = [uvs[i0], uvs[i1], uvs[i2]];

    const e1: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2: Vec3 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const d1: Vec2 = [t1[0] - t0[0], t1[1] - t0[1]];
    const d2: Vec2 = [t2[0] - t0[0], t2[1] - t0[1]];

    const det = d1[0] * d2[1] - d2[0] * d1[1];
    // Scaled to the triangle's own UV extent rather than an absolute epsilon:
    // at CELL = 0.5 a legitimate face can be 0.03 across, and a fixed threshold
    // would call it degenerate.
    const scale = Math.max(Math.hypot(...d1), Math.hypot(...d2));
    if (Math.abs(det) <= scale * scale * 1e-9) {
      defects.push({ tag: 'DegenerateUvTriangle', triangle: t });
      continue;
    }

    const dpdu = Math.hypot(
      (e1[0] * d2[1] - e2[0] * d1[1]) / det,
      (e1[1] * d2[1] - e2[1] * d1[1]) / det,
      (e1[2] * d2[1] - e2[2] * d1[1]) / det,
    );
    const dpdv = Math.hypot(
      (e2[0] * d1[0] - e1[0] * d2[0]) / det,
      (e2[1] * d1[0] - e1[1] * d2[0]) / det,
      (e2[2] * d1[0] - e1[2] * d2[0]) / det,
    );
    densities.push(dpdu, dpdv);
  }

  if (defects.length > 0) return err(defects);

  return ok({
    min: Math.min(...densities),
    max: Math.max(...densities),
    mean: densities.reduce((a, b) => a + b, 0) / densities.length,
  });
}

// ── Producers ───────────────────────────────────────────────────────────────

const dot = (p: Vec3, d: Vec3): number => p[0] * d[0] + p[1] * d[1] + p[2] * d[2];
const axisOf = (d: Vec3): 0 | 1 | 2 => (d[0] !== 0 ? 0 : d[1] !== 0 ? 1 : 2);
const neg = (d: Vec3): Vec3 => [-d[0], -d[1], -d[2]];

interface Face {
  readonly normal: Vec3; // outward
  readonly u: Vec3; // in-plane unit vector
  readonly v: Vec3; // in-plane unit vector; u × v === normal
}

/**
 * The six faces, each with an in-plane frame whose cross product IS the outward
 * normal. That is what makes winding fall out rather than be asserted: emit the
 * corners (−u,−v), (+u,−v), (+u,+v), (−u,+v) and triangulate 0,1,2 / 0,2,3 and
 * every face faces out, with no per-face sign table to get wrong.
 */
const FACES: readonly Face[] = [
  { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

/**
 * Which box axis the texture's `v` runs along.
 *
 * Not a formality — `SurfaceSpec.worldScale` is two numbers precisely because
 * grain is directional, and Stairs.tsx already carries the scar: "Getting this
 * backwards lays the grain across the plank instead of along it, which is
 * exactly how the first version looked wrong however good the texture was."
 *
 * A door wants 'y': stiles run up it.
 */
export type GrainAxis = 'x' | 'y' | 'z';

const GRAIN_AXIS: Record<GrainAxis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

/**
 * An axis-aligned box centred on the origin — the same convention as three's
 * BoxGeometry, so it drops in where one is today — with METRIC, PER-FACE UVs.
 *
 * BoxGeometry gives every face 0..1 regardless of its size, which forces the
 * consumer to compute a repeat from the mesh's dimensions and then apply that
 * one repeat to all six faces. On a door panel that is 0.480 × 0.984 broad and
 * 0.040 thick, the thickness edges come out 400% and 1575% off. Here each face
 * carries its own true extent, so one `repeat = 1 / worldScale` is right on all
 * six at once.
 *
 * UVs run from zero at each face's own lower-left corner. LOCAL, per the header
 * — the box may be rotated by its transform, and per-face rather than continuous
 * around the edges because a real board's end grain does not continue from its
 * face anyway.
 *
 * `grain` sets which axis `v` follows. On the two faces perpendicular to it —
 * a door's top and bottom edges — there is no grain axis in the plane, so `v`
 * follows the LONGER in-plane extent and the board still reads as running along
 * its length. Ties break toward the lower axis index, so the result is
 * deterministic rather than dependent on float comparison.
 */
export function boxMesh(size: Vec3, grain: GrainAxis): MeshData {
  const half: Vec3 = [size[0] / 2, size[1] / 2, size[2] / 2];
  const grainAxis = GRAIN_AXIS[grain];

  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  for (const face of FACES) {
    const nAxis = axisOf(face.normal);
    const inPlane = ([0, 1, 2] as const).filter((a) => a !== nAxis);
    const targetV =
      grainAxis !== nAxis
        ? grainAxis
        : size[inPlane[0]] >= size[inPlane[1]]
          ? inPlane[0]
          : inPlane[1];

    // Only two axes lie in a face, so if `v` is not already on the one we want,
    // `u` must be — and (u, v) → (v, −u) rotates the frame a quarter turn while
    // preserving u × v, so the face still points outward.
    const turn = axisOf(face.v) !== targetV;
    const uDir = turn ? face.v : face.u;
    const vDir = turn ? neg(face.u) : face.v;

    const hu = half[axisOf(uDir)];
    const hv = half[axisOf(vDir)];
    const centre: Vec3 = [
      face.normal[0] * half[0],
      face.normal[1] * half[1],
      face.normal[2] * half[2],
    ];

    const base = positions.length;
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const p: Vec3 = [
        centre[0] + uDir[0] * su * hu + vDir[0] * sv * hv,
        centre[1] + uDir[1] * su * hu + vDir[1] * sv * hv,
        centre[2] + uDir[2] * su * hu + vDir[2] * sv * hv,
      ];
      positions.push(p);
      // dot(p, dir) runs over ±h, so the +h shift lands the face's own corner
      // at zero and its far edge at its true extent. Metric with no min-scan.
      uvs.push([dot(p, uDir) + hu, dot(p, vDir) + hv]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return { positions, uvs, indices };
}

/**
 * Shift a mesh without touching its UVs.
 *
 * Translation cannot change a metric UV, because boxMesh anchors each face at
 * its own corner rather than in world space. That is what makes composition
 * work at all: fifteen boxes can be moved into a door and every one keeps the
 * grain scale it was born with.
 */
export function translated(mesh: MeshData, by: Vec3): MeshData {
  return {
    ...mesh,
    positions: mesh.positions.map((p): Vec3 => [p[0] + by[0], p[1] + by[1], p[2] + by[2]]),
  };
}

/**
 * Concatenate meshes into one, offsetting each one's indices by the vertices
 * already emitted.
 *
 * This is a DRAW CALL collapser. A six-panel door is fifteen boxes; fifteen
 * meshes is fifteen draw calls, doubled to thirty by the shadow pass, for one
 * door. Merged it is one geometry and one draw call. The same applies to every
 * composed item — a chair is six boxes, a bookshelf about eight — so this is
 * what keeps "add more furniture" from meaning "add more draw calls".
 *
 * Vertices are NOT welded across the seams, deliberately. Two boxes meeting at
 * a right angle have genuinely different normals there, and welding them would
 * round the corner off — the same reason `corrugate` keeps its per-tile runs
 * unshared at the lap.
 */
export function mergeMeshes(meshes: readonly MeshData[]): MeshData {
  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  for (const m of meshes) {
    const base = positions.length;
    positions.push(...m.positions);
    uvs.push(...m.uvs);
    indices.push(...m.indices.map((i) => i + base));
  }
  return { positions, uvs, indices };
}

/**
 * Turn a mesh a quarter turn about Y: (x, y, z) → (z, y, −x).
 *
 * A proper rotation, so winding survives. A bare axis SWAP would not — it flips
 * handedness and turns every face inside out.
 *
 * Needed because a composed mesh is built in one canonical orientation and the
 * house has walls running both ways. UVs are untouched: they are per-face and
 * local, so a rotated piece keeps the grain scale it was born with.
 */
export function rotatedY90(mesh: MeshData): MeshData {
  return {
    ...mesh,
    positions: mesh.positions.map((p): Vec3 => [p[2], p[1], -p[0]]),
  };
}

/**
 * A quarter turn about X: (x, y, z) → (x, −z, y). Determinant +1, so winding
 * survives — unlike the axis SWAP (x, y, z) → (x, z, y), which looks equivalent,
 * has determinant −1, and turns the mesh inside out.
 *
 * Stands a Y-axis cylinder up along Z, which is how a door's rose sits.
 */
export function rotatedX90(mesh: MeshData): MeshData {
  return {
    ...mesh,
    positions: mesh.positions.map((p): Vec3 => [p[0], -p[2], p[1]]),
  };
}

// ── Curved primitives, and the one place the metric contract stops ──────────
//
// A CYLINDER'S SIDE IS DEVELOPABLE — zero Gaussian curvature, so it unrolls
// flat and its UVs are honestly metric: `u` is arc length around, `v` is height.
// uvDensity returns 1.0 on it and should.
//
// A SPHERE IS NOT. Positive curvature means no distortion-free map exists, at
// any resolution. uvDensity WILL report min ≠ max on sphereMesh, and that is
// the check working rather than failing.
//
// Acceptable for exactly one reason: the only sphere here is a brass doorknob,
// whose whole look is reflection off the environment map rather than a tiled
// texture. Put a wood grain on a sphere and it will stretch at the poles — and
// uvDensity will have said so first.

/**
 * A cylinder about the Y axis, centred on the origin. Metric UVs on the side;
 * caps are planar-projected, which is metric within each cap.
 *
 * uvDensity measures the side at sin(pi/segments)/(pi/segments), not 1.0 — 0.9836
 * at 10 segments — because `u` is ARC length while the geometry is chords. That
 * gap is the faceting, not an error, and it closes as segments rise. The caps
 * measure exactly 1.0, which is the tell that the two are different situations.
 */
export function cylinderMesh(radius: number, height: number, segments: number): MeshData {
  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const [hy, circ] = [height / 2, 2 * Math.PI * radius];

  // The seam vertex is emitted TWICE — once at u = 0 and once at u = circ — so
  // the texture meets itself instead of running backward across the last quad.
  for (let s = 0; s <= segments; s++) {
    const a = (s / segments) * 2 * Math.PI;
    const [x, z] = [Math.cos(a) * radius, Math.sin(a) * radius];
    positions.push([x, -hy, z], [x, hy, z]);
    uvs.push([(s / segments) * circ, 0], [(s / segments) * circ, height]);
  }
  for (let s = 0; s < segments; s++) {
    const b = s * 2;
    indices.push(b, b + 3, b + 2, b, b + 1, b + 3);
  }

  for (const [sy, flip] of [
    [hy, false],
    [-hy, true],
  ] as const) {
    const centre = positions.length;
    positions.push([0, sy, 0]);
    uvs.push([radius, radius]);
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * 2 * Math.PI;
      const [x, z] = [Math.cos(a) * radius, Math.sin(a) * radius];
      positions.push([x, sy, z]);
      uvs.push([x + radius, z + radius]);
    }
    for (let s = 0; s < segments; s++) {
      const [i, j] = [centre + 1 + s, centre + 2 + s];
      indices.push(...(flip ? [centre, i, j] : [centre, j, i]));
    }
  }

  return { positions, uvs, indices };
}

/**
 * A UV sphere centred on the origin. NOT metric — see the note above. UVs are
 * arc length at the equator, which is the least-bad choice and exact on the one
 * ring where it can be.
 */
export function sphereMesh(radius: number, segments: number, rings: number): MeshData {
  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    const [sy, sr] = [Math.cos(phi) * radius, Math.sin(phi) * radius];
    for (let s = 0; s <= segments; s++) {
      const theta = (s / segments) * 2 * Math.PI;
      positions.push([Math.cos(theta) * sr, sy, Math.sin(theta) * sr]);
      uvs.push([(s / segments) * 2 * Math.PI * radius, (r / rings) * Math.PI * radius]);
    }
  }
  const row = segments + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const [a, b] = [r * row + s, (r + 1) * row + s];
      // A pole row collapses to a point, so one triangle of each pair there
      // would be degenerate — and a degenerate triangle is what uvDensity
      // rejects outright.
      if (r !== 0) indices.push(a, a + 1, b);
      if (r !== rings - 1) indices.push(a + 1, b + 1, b);
    }
  }

  return { positions, uvs, indices };
}

/**
 * A flat rectangle in the XY plane facing +Z, centred on the origin — three's
 * planeGeometry convention, so Ground.tsx's existing −π/2 rotation still lays
 * it flat — with metric UVs.
 */
export function planeMesh(size: Vec2): MeshData {
  const [hw, hh] = [size[0] / 2, size[1] / 2];
  return {
    positions: [
      [-hw, -hh, 0],
      [hw, -hh, 0],
      [hw, hh, 0],
      [-hw, hh, 0],
    ],
    uvs: [
      [0, 0],
      [size[0], 0],
      [size[0], size[1]],
      [0, size[1]],
    ],
    indices: [0, 1, 2, 0, 2, 3],
  };
}