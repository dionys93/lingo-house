// web/src/components/house/InteriorDoorway.jsx
import { WallSegment } from './Siding.jsx';
import { Door } from './Door.jsx';
import { DOOR_WIDTH, WALL_HEIGHT, WALL_THICKNESS } from './constants.js';

// A doorway between two rooms: the swinging door plus solid wall filling the
// rest of the shared wall's width. The door alone is only DOOR_WIDTH wide —
// far narrower than the wall it's closing off. This is the interior
// equivalent of FrontFacade, minus the windows.
//
// Built in LOCAL space: lying in the local z=0 plane, spanning local x, with
// local +Z toward the parent room. The caller rotates it into place, so the
// same component works for a doorway to the room behind and one to a room
// off the side. Because local +Z is always the parent's side, the siding /
// interior-liner convention needs no special casing either.
//
// `offset` need not be 0 — the two flanking segments are computed
// independently rather than as equal halves, so the door can sit anywhere
// along the wall and the flanks still tile it exactly.
export function InteriorDoorway({ colors, span, offset = 0, animation, open, onToggle, interiorColor }) {
  const flanks = [
    [-span / 2, offset - DOOR_WIDTH / 2],
    [offset + DOOR_WIDTH / 2, span / 2],
  ];

  return (
    <>
      {flanks.map(([from, to], i) => (
        <WallSegment
          key={i}
          position={[(from + to) / 2, WALL_HEIGHT / 2, 0]}
          size={[to - from, WALL_HEIGHT, WALL_THICKNESS]}
          color={colors.wall}
          interiorColor={interiorColor}
        />
      ))}
      <Door colors={colors} centerX={offset} animation={animation} open={open} onToggle={onToggle} interiorColor={interiorColor} />
    </>
  );
}