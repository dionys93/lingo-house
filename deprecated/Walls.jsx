// web/src/components/house/Walls.jsx
import { WallSegment } from './Siding.jsx';
import {
  SOLID_WALL_RUNS, sideColor, depthOf,
  WALL_HEIGHT, WALL_THICKNESS, EXTERIOR,
} from './constants.js';

// Every solid wall in the house, straight from the grid's wall runs. A run
// knows what's on each side of it, so its two colors are derived, not
// assigned: an exterior side wears the house siding, a side facing room X
// wears X's interior color. Doorway runs are excluded here — each is filled
// by its InteriorDoorway / facade instead (see HouseExplorer).
//
// WallSegment renders a core + siding on one side + an optional liner on the
// other. Siding faces the "outer" side: the exterior if one side is outside,
// otherwise whichever room is shallower in the navigation tree.

export function Walls({ colors, runs = SOLID_WALL_RUNS }) {
  return (
    <>
      {runs.map((run, i) => {
        const mid = (run.lo + run.hi) / 2;
        const length = run.hi - run.lo;
        const position = run.axis === 'x'
          ? [run.at, WALL_HEIGHT / 2, mid]
          : [mid, WALL_HEIGHT / 2, run.at];
        const size = run.axis === 'x'
          ? [WALL_THICKNESS, WALL_HEIGHT, length]
          : [length, WALL_HEIGHT, WALL_THICKNESS];

        // Outer side: exterior wins; between two rooms, the shallower one.
        const negIsOuter = run.sideNeg === EXTERIOR
          || (run.sidePos !== EXTERIOR && depthOf(run.sideNeg) <= depthOf(run.sidePos));
        const outer = negIsOuter ? run.sideNeg : run.sidePos;
        const inner = negIsOuter ? run.sidePos : run.sideNeg;
        const sidingSign = negIsOuter ? -1 : 1;

        return (
          <WallSegment
            key={i}
            position={position}
            size={size}
            sidingAxis={run.axis}
            sidingSign={sidingSign}
            color={sideColor(outer, colors)}
            interiorColor={sideColor(inner, colors)}
          />
        );
      })}
    </>
  );
}