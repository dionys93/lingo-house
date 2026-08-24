// src/core/geometry/door.ts
//
// A six-panel colonial door — the "cross and bible" — as fifteen boxes merged
// into one mesh.
//
// ── WHY THIS IS GEOMETRY AND NOT A TEXTURE ──────────────────────────────────
//
// Two reasons, and the first one is structural:
//
//   IT DOESN'T TILE. The whole surface pipeline exists to repeat a texture at a
//   true physical size — worldScale, repeat = 1 / worldScale, metric UVs. A
//   cross-and-bible layout appears EXACTLY ONCE, registered to the door's own
//   edges. Route it through useTiledSurface and you get a grid of small crosses.
//
//   THE PANELS ARE RECESSED. 16mm on each face, which is real depth with real
//   shadow in it — and `aoRadius` is 0.15, tuned to exactly this scale, so the
//   recesses shade for free. Painting them on as flat colour is the same mistake
//   as deriving relief from luminance, which this codebase already tore out once.
//
// ── WHY IT LIVES IN core/geometry/ ──────────────────────────────────────────
//
// Same seam corrugation sits on. `core/` knows a door is an opening of a given
// size; it does not know whether that door is panelled, any more than it knows
// what oak looks like — panelling is closer to a STYLE. It lives in core anyway
// because it is pure geometry with no three import: it runs under
// `node --experimental-strip-types` like the rest of core, and the shell in
// render/ turns its MeshData into something drawable.

import {
  boxMesh,
  cylinderMesh,
  mergeMeshes,
  rotatedX90,
  sphereMesh,
  translated,
  type MeshData,
  type Vec3,
} from './mesh';

/**
 * Frame member sizes, in WORLD UNITS at 1 unit = 2m.
 *
 * Fixed rather than proportional, because joinery is: a 110mm stile is 110mm
 * whether the door is 900mm wide or 1200mm. The comments carry the millimetres
 * so the numbers stay checkable.
 */
export interface PanelDoorSpec {
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  readonly stile: number; // vertical frame edges
  readonly topRail: number;
  readonly crossRail: number; // below the top panels — the cross's horizontal
  readonly lockRail: number; // below the middle panels
  readonly bottomRail: number;
  readonly muntin: number; // the centre vertical — the cross's upright
  readonly panelInset: number; // how far each panel sits below the frame face
  /** Top, middle, bottom panel heights. Middle is tallest on a colonial door. */
  readonly panelRows: readonly [number, number, number];
}

/** Standard colonial proportions for the house's 960 × 1968 × 80mm door. */
export const CROSS_AND_BIBLE: PanelDoorSpec = {
  width: 0.48, // 960mm
  height: 0.984, // 1968mm
  thickness: 0.04, // 80mm
  stile: 0.055, // 110mm
  topRail: 0.055, // 110mm
  crossRail: 0.045, // 90mm
  lockRail: 0.075, // 150mm
  bottomRail: 0.1, // 200mm
  muntin: 0.045, // 90mm
  panelInset: 0.008, // 16mm each face, leaving a 48mm panel
  panelRows: [0.15, 0.31, 0.249], // 300 / 620 / 498mm
};

/**
 * Build the door, centred on the origin like boxMesh — so it drops straight
 * into the `panelOffset` the plain slab already used.
 *
 * GRAIN RUNS WITH THE MEMBER. Stiles, muntins and panels take 'y'; rails take
 * 'x', because a rail is a horizontal piece of timber and its grain runs along
 * its length. Invisible under solid paint, correct the moment the surface isn't.
 */
export function panelDoorMesh(spec: PanelDoorSpec): MeshData {
  const { width: w, height: h, thickness: t, stile, muntin, panelInset } = spec;
  const [rowTop, rowMid, rowBot] = spec.panelRows;

  const railSpan = w - 2 * stile; // rails run between the stiles
  const panelW = (railSpan - muntin) / 2;
  const panelT = t - 2 * panelInset;
  const stackH = spec.topRail + rowTop + spec.crossRail + rowMid + spec.lockRail + rowBot + spec.bottomRail;

  // Unreachable for any authored door — openings are one cell wide and take
  // their height from the compiler, so w and h are fixed. Loud anyway, because
  // the alternative is inside-out boxes that render as a door with its faces
  // turned in, which reads as a renderer bug rather than a bad number.
  if (panelW <= 0 || panelT <= 0) {
    throw new Error(`panelDoorMesh: frame does not fit — panel ${panelW} × ${panelT}`);
  }
  if (Math.abs(stackH - h) > 1e-9) {
    throw new Error(`panelDoorMesh: rows sum to ${stackH}, door is ${h}`);
  }

  // Walk DOWN from the top edge. Each member records the centre of the band it
  // occupies, so nothing is positioned relative to anything but the door itself.
  let y = h / 2;
  const band = (size: number): number => {
    const centre = y - size / 2;
    y -= size;
    return centre;
  };

  const at = (size: Vec3, centre: Vec3, grain: 'x' | 'y'): MeshData =>
    translated(boxMesh(size, grain), centre);

  const rail = (size: number, cy: number): MeshData =>
    at([railSpan, size, t], [0, cy, 0], 'x');

  const row = (panelH: number, cy: number): readonly MeshData[] => [
    at([muntin, panelH, t], [0, cy, 0], 'y'),
    at([panelW, panelH, panelT], [-(muntin / 2 + panelW / 2), cy, 0], 'y'),
    at([panelW, panelH, panelT], [muntin / 2 + panelW / 2, cy, 0], 'y'),
  ];

  const topRail = rail(spec.topRail, band(spec.topRail));
  const rowTopPieces = row(rowTop, band(rowTop));
  const crossRail = rail(spec.crossRail, band(spec.crossRail));
  const rowMidPieces = row(rowMid, band(rowMid));
  const lockRail = rail(spec.lockRail, band(spec.lockRail));
  const rowBotPieces = row(rowBot, band(rowBot));
  const bottomRail = rail(spec.bottomRail, band(spec.bottomRail));

  return mergeMeshes([
    at([stile, h, t], [-(w / 2 - stile / 2), 0, 0], 'y'),
    at([stile, h, t], [w / 2 - stile / 2, 0, 0], 'y'),
    topRail,
    ...rowTopPieces,
    crossRail,
    ...rowMidPieces,
    lockRail,
    ...rowBotPieces,
    bottomRail,
  ]);
}

// ── Hardware ────────────────────────────────────────────────────────────────

/**
 * Knob geometry, in world units at 1 unit = 2m.
 *
 * `height` is 1000mm from the floor, which is where knobs actually go. The
 * child walking this house has a 1300mm eye height, so they reach slightly
 * DOWN for it — same as a real child in a real house, and worth preserving.
 */
const KNOB = {
  height: 0.5, // 1000mm from the floor
  inset: 0.032, // 64mm in from the latch edge
  roseRadius: 0.014, // 28mm — a 56mm rose
  roseDepth: 0.006, // 12mm proud of the face
  ballRadius: 0.016, // 32mm — a 64mm knob
  segments: 10,
  rings: 6,
} as const;

/**
 * Both knobs for one door, as a SINGLE mesh.
 *
 * Merged deliberately. A knob is a rose plus a ball, and a door needs one on
 * each face — four meshes per door, twenty-four across the house, forty-eight
 * once the shadow pass renders them again. Merged it is one draw call per door.
 *
 * Separate from the panel mesh because brass is a different material, which is
 * the one thing mergeMeshes cannot collapse across.
 *
 * Built in the same origin-centred frame as the door itself, so it takes the
 * identical `panelOffset` and needs no placement logic of its own. The latch
 * side is +x: the hinge sits at the door's origin and the panel extends away
 * from it, so the far edge is always the one that opens.
 */
export function doorKnobMesh(spec: PanelDoorSpec): MeshData {
  const { width: w, height: h, thickness: t } = spec;
  const x = w / 2 - KNOB.inset;
  const y = KNOB.height - h / 2;

  // Rotated ONCE, then translated twice. A cylinder is symmetric about its own
  // axis midpoint, so the two faces need no mirroring — and mirroring is exactly
  // what would have flipped the winding.
  const rose = rotatedX90(cylinderMesh(KNOB.roseRadius, KNOB.roseDepth, KNOB.segments));
  const ball = sphereMesh(KNOB.ballRadius, KNOB.segments, KNOB.rings);

  const side = (sign: 1 | -1): readonly MeshData[] => {
    const faceZ = sign * (t / 2);
    return [
      translated(rose, [x, y, faceZ + sign * (KNOB.roseDepth / 2)]),
      translated(ball, [x, y, faceZ + sign * (KNOB.roseDepth + KNOB.ballRadius * 0.75)]),
    ];
  };

  return mergeMeshes([...side(1), ...side(-1)]);
}