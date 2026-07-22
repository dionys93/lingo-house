// web/src/components/house/Roof.jsx
import { useMemo, useEffect } from 'react';
import { createShingleTexture } from '../../utils/proceduralTextures.js';
import {
  ROOF_PITCH, ROOF_EAVE_OVERHANG, ROOF_GABLE_OVERHANG, ROOF_THICKNESS,
  ridgeHeight,
} from './roofGeometry.js';
import { ROOF_REGIONS } from './constants.js';

// A single sloped roof panel: a thin box tilted to the pitch. `spanReach` is
// the horizontal distance the slope covers (half the gable span plus the
// eave overhang), `length` is its extent along the ridge. `baseY` lifts the
// whole panel to its region's floor-top, so a region capped at the second
// storey rides above one capped at the ground floor.
function slopePanel({ ridgeAxis, center, baseY, ridgeHeightY, sign, spanReach, length, texture }) {
  const pitchAngle = Math.atan(ROOF_PITCH);
  const panelWidth = Math.hypot(spanReach, spanReach * ROOF_PITCH); // slope length
  const midOut = sign * spanReach / 2;
  const midY = baseY + ridgeHeightY - (spanReach / 2) * ROOF_PITCH;

  if (ridgeAxis === 'z') {
    return (
      <mesh position={[center[0] + midOut, midY, center[2]]} rotation={[0, 0, -sign * pitchAngle]}>
        <boxGeometry args={[panelWidth, ROOF_THICKNESS, length]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    );
  }
  return (
    <mesh position={[center[0], midY, center[2] + midOut]} rotation={[sign * pitchAngle, 0, 0]}>
      <boxGeometry args={[length, ROOF_THICKNESS, panelWidth]} />
      <meshStandardMaterial map={texture} />
    </mesh>
  );
}

// One gable per roof region. Each region is a maximal rectangle of columns that
// share a cap height (see roofRegions in grid-engine): where the storey covers
// the ground floor the region rides at storey height, where the ground floor is
// exposed it rides lower, and balcony columns are excluded (open to sky). So the
// roof "always moves upward" and can exist at several heights over one house.
export function Roof({ colors }) {
  const texture = useMemo(
    () => createShingleTexture(colors.roof, { repeatX: 2, repeatY: 3 }),
    [colors.roof]
  );
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <group>
      {ROOF_REGIONS.map((region, i) => {
        const ridgeY = ridgeHeight(region.gableSpan);
        const reach = region.gableSpan / 2 + ROOF_EAVE_OVERHANG;
        const length = region.ridgeLength + 2 * ROOF_GABLE_OVERHANG;
        const center = [region.rect.centerX, 0, region.rect.centerZ];
        return (
          <group key={i}>
            {slopePanel({ ridgeAxis: region.ridgeAxis, center, baseY: region.baseY, ridgeHeightY: ridgeY, sign: -1, spanReach: reach, length, texture })}
            {slopePanel({ ridgeAxis: region.ridgeAxis, center, baseY: region.baseY, ridgeHeightY: ridgeY, sign: 1, spanReach: reach, length, texture })}
          </group>
        );
      })}
    </group>
  );
}