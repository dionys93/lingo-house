// src/scene/vantage.ts
//
// Shared interior-camera geometry, so the arrival animation (CameraRig) and the
// turntable (InteriorControls) agree on where the camera sits — the handoff is
// seamless. Inside a room you orbit its centre at eye height (a turntable), never
// flying: no pitch, walls stay the horizon.

import type { AABB, Vec3 } from '../core/grid';

export const EYE = 0.55; // eye height inside a room
export const EXTERIOR_CAMERA: Vec3 = [4, 3.5, 5];
export const EXTERIOR_TARGET: Vec3 = [0, 0.4, 0];

const R_FACTOR = 0.55;
const R_MIN = 0.15;
const R_MAX = 0.9;

export const roomCenter = (b: AABB): Vec3 => [
  (b.min[0] + b.max[0]) / 2,
  EYE,
  (b.min[2] + b.max[2]) / 2,
];

// Orbit radius that keeps the camera comfortably inside the room's walls.
export function orbitRadius(b: AABB): number {
  const halfW = (b.max[0] - b.min[0]) / 2;
  const halfD = (b.max[2] - b.min[2]) / 2;
  return Math.min(R_MAX, Math.max(R_MIN, Math.min(halfW, halfD) * R_FACTOR));
}