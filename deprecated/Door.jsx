// web/src/components/house/Door.jsx
import { WallSegment } from './Siding.jsx';
import { Wall } from './Wall.jsx';
import { DOOR_WIDTH, DOOR_HEIGHT, WALL_HEIGHT, WALL_THICKNESS } from './constants.js';

// A door: a fixed header strip above shorter swinging leaves. Built in LOCAL
// space — lying in the local z=0 plane, with local +Z pointing back toward
// whatever you entered from. The caller positions and rotates it, which is
// how the same component serves the exterior front door and a doorway into a
// room off to the side without any axis special-casing.
//
// `centerX` offsets it along the wall it sits in. `interiorColor` gives the
// header the same inward liner the wall segments beside it get; without it
// the header reads as a chunk of the other room's colour above the doorway.
// The leaves aren't linered — a door is the same door from either side.
export function Door({ colors, width = DOOR_WIDTH, height = DOOR_HEIGHT, animation = 'swingDoorOut', open, onToggle, centerX = 0, interiorColor }) {
  const headerHeight = WALL_HEIGHT - height;
  const headerY = height + headerHeight / 2;

  return (
    <group>
      <WallSegment
        position={[centerX, headerY, 0]}
        size={[width, headerHeight, WALL_THICKNESS]}
        color={colors.wall}
        sidingBoards={2}
        interiorColor={interiorColor}
      />
      <Wall animation={animation} width={width} height={height} position={[centerX, 0, 0]} open={open} onToggle={onToggle} colors={colors} />
    </group>
  );
}