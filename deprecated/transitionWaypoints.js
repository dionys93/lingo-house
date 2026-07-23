// web/src/components/house/transitionWaypoints.js
//
// A camera transition can't fly the straight line between two rooms' resting
// poses — it would cut through a wall, since a doorway is a narrow opening the
// poses know nothing about. So every transition routes through waypoint(s).
//
// A door contributes one waypoint (the opening). A STAIR contributes two — the
// bottom of the flight then the top — so the camera walks along the floor to
// the stair foot, up through the well, and onto the landing, instead of arcing
// diagonally through the storey.

import { parentOf, roomDoorway, roomStair, DOORWAY_WAYPOINT_Y, EXTERIOR } from './constants.js';

export function transitionWaypoint(fromLocation, toLocation) {
  const child =
    parentOf(toLocation) === fromLocation ? toLocation :
    parentOf(fromLocation) === toLocation ? fromLocation :
    null;
  if (!child || child === EXTERIOR) return null;

  const stair = roomStair(child);
  if (stair) return { positions: [stair.waypointBottom, stair.waypointTop] };

  const doorway = roomDoorway(child);
  if (!doorway) return null;
  return { positions: [[doorway.doorPosition[0], DOORWAY_WAYPOINT_Y, doorway.doorPosition[2]]] };
}