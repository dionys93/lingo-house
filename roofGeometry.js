// web/src/components/house/roofGeometry.js
//
// The house's roof model. Every roof block — the main one over the
// living-room/kitchen column, and any wing like the bathroom's — shares one
// pitch, so they read as a single building rather than parts bolted
// together. Walls, gable ends, and roof panels all derive from here, so
// none of them can drift out of sync with the others.

// Pitch as a RATIO: how far the roof falls per unit of horizontal run.
// Expressing it this way (rather than as a fixed rise) is what lets blocks
// of different spans share a pitch.
export const ROOF_PITCH = 0.8 / 1.8;

export const EAVE_HEIGHT = 1;        // where a block's eave sits, past the wall
export const ROOF_EAVE_OVERHANG = 0.3;  // how far a slope reaches past its wall
export const ROOF_GABLE_OVERHANG = 0.15; // how far a slope reaches past a gable end
export const ROOF_THICKNESS = 0.05;

// How tall the walls are under any gable at this pitch.
//
// wallHeight = ridge - PITCH*(span/2), and ridge = eave + PITCH*(span/2 + overhang).
// Substituting, the span cancels: wallHeight = eave + PITCH*overhang. So a
// narrow wing and the wide main block top out at exactly the same height —
// which is why the whole house needs only ONE wall height, and why the
// bathroom wing needs no special handling.
export const WALL_HEIGHT = EAVE_HEIGHT + ROOF_PITCH * ROOF_EAVE_OVERHANG;

// The ridge height of a gable block spanning `span` wall-to-wall.
export function ridgeHeight(span) {
  return WALL_HEIGHT + ROOF_PITCH * (span / 2);
}

// A block's roof height at a horizontal distance from its ridge.
export function roofHeightAt(distanceFromRidge, span) {
  return ridgeHeight(span) - ROOF_PITCH * distanceFromRidge;
}