// src/scene/vantage.ts
//
// Where the camera stands inside a room, so the arrival animation (CameraRig)
// and the turntable (InteriorControls) agree and the handoff is seamless.
//
// This works from the room's STANDABLE FLOOR TILES, not its bounding box. A
// bounding box is only a fair description of a rectangular room: the landing is
// L-shaped, with one arm running down beside the stairwell, and the centre of
// its box sits inside the BEDROOM next door — so orbiting the box centre put the
// camera through the wall. Tiles can't lie about that, and they already have the
// stairwell removed, so the camera can't be sent to hover over a hole either.

import type { AABB, Vec3 } from '../core/grid';
import { CELL } from '../core/grid';

export const EYE = 0.55; // eye height ABOVE THE ROOM'S OWN FLOOR
export const EXTERIOR_CAMERA: Vec3 = [4, 3.5, 5];
export const EXTERIOR_TARGET: Vec3 = [0, 0.4, 0];

const R_FACTOR = 0.55;
const R_MIN = 0.15;
const R_MAX = 0.9;

export interface Vantage {
  readonly center: Vec3; // at eye height, guaranteed over a real floor tile
  readonly radius: number; // orbit radius that stays on standable floor
}

const keyOf = (x: number, z: number): string => `${Math.round(x / CELL)}|${Math.round(z / CELL)}`;

// How far the standable floor continues from `from` in one direction, in world
// units — used to keep the orbit circle off the walls and out of the stairwell.
function reach(tiles: ReadonlySet<string>, from: Vec3, dx: number, dz: number): number {
  let steps = 0;
  while (steps < 8 && tiles.has(keyOf(from[0] + dx * CELL * (steps + 1), from[2] + dz * CELL * (steps + 1)))) {
    steps += 1;
  }
  return (steps + 0.5) * CELL; // half a cell of the tile you're standing on, plus the run
}

// `tiles` are floor-tile centres at the room's own floor height, already minus
// any stairwell. Returns null for a room with nothing to stand on.
export function vantageFrom(tiles: readonly Vec3[]): Vantage | null {
  if (tiles.length === 0) return null;

  const sum = tiles.reduce((a, t) => [a[0] + t[0], a[1] + t[1], a[2] + t[2]], [0, 0, 0]);
  const mean: Vec3 = [sum[0] / tiles.length, sum[1] / tiles.length, sum[2] / tiles.length];

  // Snap to the nearest REAL tile. The mean of an L-shape can fall in the
  // notch — outside the room entirely — so it is never used directly.
  const center = tiles.reduce((best, t) =>
    Math.hypot(t[0] - mean[0], t[2] - mean[2]) < Math.hypot(best[0] - mean[0], best[2] - mean[2])
      ? t
      : best,
  );

  const set = new Set(tiles.map((t) => keyOf(t[0], t[2])));
  const room = Math.min(
    reach(set, center, 1, 0),
    reach(set, center, -1, 0),
    reach(set, center, 0, 1),
    reach(set, center, 0, -1),
  );

  return {
    center: [center[0], center[1] + EYE, center[2]],
    radius: Math.min(R_MAX, Math.max(R_MIN, room * R_FACTOR)),
  };
}

// Kept for callers that still reason about a whole room's extent.
export const boxCenter = (b: AABB): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  b.min[1] + EYE,
  (b.min[2] + b.max[2]) / 2,
];