// web/src/utils/animations.js
//
// Each entry describes how a wall splits into panels for a given "open"
// animation, and where each panel sits when closed vs. fully open. Adding a
// new animation style is just adding a new entry here — nothing in
// HouseExplorer.jsx needs to change to support it.
//
// Panel positions/rotations are LOCAL to the wall's own anchor group, which
// is placed at the wall's world position (ground level, at the wall's own
// face). (w, h, t) are the wall's overall width, height, and thickness —
// each animation decides how to divide that into panels.

function makeSwingDoors(sign) {
  return (w, h, t) => {
    const doorWidth = w / 2;
    const hingeX = w / 2;
    const swingAngle = Math.PI / 2;
    return [
      {
        size: [doorWidth, h, t],
        pivot: [doorWidth / 2, 0, 0],
        closed: { position: [-hingeX, h / 2, 0], rotation: 0 },
        open: { position: [-hingeX, h / 2, 0], rotation: sign * swingAngle },
      },
      {
        size: [doorWidth, h, t],
        pivot: [-doorWidth / 2, 0, 0],
        closed: { position: [hingeX, h / 2, 0], rotation: 0 },
        open: { position: [hingeX, h / 2, 0], rotation: -sign * swingAngle },
      },
    ];
  };
}

// A single full-width door, hinged on its left edge only — for a normal
// house front, rather than the two-leaf French-door look above (which is
// kept around as-is for later use, e.g. a grander entrance).
function makeSwingDoorSingle(sign) {
  return (w, h, t) => {
    const hingeX = -w / 2;
    const swingAngle = Math.PI / 2;
    return [
      {
        size: [w, h, t],
        pivot: [w / 2, 0, 0],
        closed: { position: [hingeX, h / 2, 0], rotation: 0 },
        open: { position: [hingeX, h / 2, 0], rotation: sign * swingAngle },
      },
    ];
  };
}

export const ANIMATIONS = {
  // Whole wall sinks straight down into the ground, out of view.
  slideDown: (w, h, t) => [
    {
      size: [w, h, t],
      pivot: [0, 0, 0],
      closed: { position: [0, h / 2, 0], rotation: 0 },
      open: { position: [0, -h - 0.4, 0], rotation: 0 },
    },
  ],

  // Splits into two equal panels that part from the center seam, like
  // elevator doors or sliding closet doors.
  doubleDoors: (w, h, t) => {
    const doorWidth = w / 2;
    const clearance = doorWidth + 0.3; // beyond just-clear, so the gap reads plainly
    return [
      {
        size: [doorWidth, h, t],
        pivot: [0, 0, 0],
        closed: { position: [-doorWidth / 2, h / 2, 0], rotation: 0 },
        open: { position: [-doorWidth / 2 - clearance, h / 2, 0], rotation: 0 },
      },
      {
        size: [doorWidth, h, t],
        pivot: [0, 0, 0],
        closed: { position: [doorWidth / 2, h / 2, 0], rotation: 0 },
        open: { position: [doorWidth / 2 + clearance, h / 2, 0], rotation: 0 },
      },
    ];
  },

  // True hinge-swing double doors, like French doors. Unlike the two
  // animations above, the group's position never changes between closed and
  // open — the hinge point is fixed, and only rotation animates. The mesh
  // itself sits offset from the group's origin via `pivot`, so rotating the
  // group swings the door around its outer edge instead of its center.
  //
  // `In` and `Out` are the same geometry, mirrored by a single sign flip:
  // doors swing toward -z (into the room, away from the camera) or toward
  // +z (outward, toward the viewer).
  swingDoorsIn: makeSwingDoors(1),
  swingDoorsOut: makeSwingDoors(-1),

  // Single-leaf versions — a normal front door, hinged on one edge only.
  swingDoorIn: makeSwingDoorSingle(1),
  swingDoorOut: makeSwingDoorSingle(-1),
};