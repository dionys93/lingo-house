// web/src/components/house/FrontFacade.jsx
import { WallWithWindow } from './Window.jsx';
import { DOOR_WIDTH, WALL_HEIGHT } from './constants.js';

// The wall segments flanking the house's exterior front door, each with a
// real window opening. Built in LOCAL space alongside the front Door, in the
// same z=0 plane; the caller places both together.
//
// Like InteriorDoorway, the two flanks are computed independently rather
// than as equal halves, so an off-centre front door would still tile the
// wall exactly.
export function FrontFacade({ colors, span, offset = 0, doorWidth = DOOR_WIDTH }) {
  const flanks = [
    [-span / 2, offset - doorWidth / 2],
    [offset + doorWidth / 2, span / 2],
  ];

  return (
    <>
      {flanks.map(([from, to], i) => (
        <WallWithWindow key={i} x={(from + to) / 2} width={to - from} height={WALL_HEIGHT} colors={colors} />
      ))}
    </>
  );
}