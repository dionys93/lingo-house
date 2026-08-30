// src/core/house/scale.ts
//
// The numbers the whole house is measured in, and nothing else.
//
// A leaf module on purpose: every other core module needs CELL or WALL_HEIGHT,
// so anything living here must import nothing from the house. That is what lets
// items.ts, openings.ts and grid.ts all depend on the same constants without a
// cycle between them.
//
// One cell is CELL units on a side and walls rise WALL_HEIGHT. At 1 unit = 2 m
// that is a 1 m cell in a 2.4 m room.

// ── World-scale knobs. One cell is CELL units on a side; walls rise WALL_HEIGHT.
// Tunable and cosmetic — the roof will read wall-top height from here later. ────
export const CELL = 0.5;
export const WALL_HEIGHT = 1.2;
export const WALL_THICKNESS = 0.08; // wall depth; the core extends corners by half this so walls overlap
export const ROOF_PITCH = 0.55; // roof rise per unit of horizontal run (a ratio)
export const ROOF_RAKE_OVERHANG = 0.12; // how far the slopes hang past the gable ends
// Horizontal run past the eave walls' OUTER face; the eave edge drops below
// wall-top by ROOF_PITCH × this (≈ 0.09 world units at current values).
export const ROOF_EAVE_OVERHANG = 0.16;
// How tall the doorway itself is, as a fraction of the wall. This lived in the
// renderer, which meant a door's real vertical extent existed nowhere in the
// compiled data — so anything else that needed it (the popup anchor) had to
// guess with a magic fraction of the WALL height and land near the lintel.
export const DOOR_HEIGHT_FRAC = 0.82;