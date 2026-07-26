// src/scene/vantage.ts
//
// Where the camera stands and which way it faces — shared by the arrival
// animation (CameraRig) and the look controller (InteriorControls) so the handoff
// is seamless: the transition ends exactly where the look controller takes over,
// facing the same way.

import type { AABB, Vec3 } from '../core/grid';

export const EYE = 0.55; // eye height inside a room
export const EXTERIOR_CAMERA: Vec3 = [4, 3.5, 5];
export const EXTERIOR_TARGET: Vec3 = [0, 0.4, 0];

// Stand near the back wall of the room, at eye height, facing the FRONT of the
// house (+Z). yaw 0 = looking toward +Z.
export function interiorStand(bounds: AABB): { position: Vec3; yaw: number } {
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const backZ = bounds.min[2] + 0.2;
  return { position: [cx, EYE, backZ], yaw: 0 };
}

// The point that stand position looks at when facing front — one unit ahead in +Z.
export function frontLookAt(bounds: AABB): Vec3 {
  const { position } = interiorStand(bounds);
  return [position[0], position[1], position[2] + 1];
}