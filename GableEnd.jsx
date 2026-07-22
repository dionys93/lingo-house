// web/src/components/house/GableEnd.jsx
import { useMemo } from 'react';
import * as THREE from 'three';
import { ROOF_THICKNESS } from './roofGeometry.js';

const LINER_THICKNESS = 0.02;

// The triangular wall closing one end of a gable — base corners at the wall
// tops, apex at the ridge. Without it the space under the roof's peak is
// open at that end.
//
// Built in LOCAL space: the triangle lies in the local XY plane and extrudes
// along local +Z, so the caller positions and rotates it. That's what lets
// the same component cap the main roof (facing ±Z) and the bathroom wing's
// roof (facing +X) with no special casing. `outwardSign` is in LOCAL terms:
// +1 means local +Z faces out of the house.
//
// `halfSpan`, `baseY` and `ridgeY` are passed in rather than derived here,
// because the house now has more than one roof block and they don't share a
// span. The caller computes them from roofGeometry so they still can't drift
// from the roof panels they meet.
//
// extrudeGeometry always extrudes toward local +Z regardless of orientation,
// which is why the liner's offset is asymmetric between the two ends rather
// than a mirror. DoubleSide avoids reasoning about the triangle's winding.
export function GableEnd({ colors, halfSpan, baseY, ridgeY, outwardSign = 1, interiorColor }) {
  const hasLiner = interiorColor && interiorColor !== colors.wall;

  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-halfSpan, baseY);
    s.lineTo(halfSpan, baseY);
    s.lineTo(0, ridgeY);
    s.closePath();
    return s;
  }, [halfSpan, baseY, ridgeY]);

  // extrudeGeometry spans local z in [0, depth], so a mesh at P occupies
  // [P, P + depth]. Centre the core on local z=0; sit the liner flush
  // against whichever face points into the house.
  const coreZ = -ROOF_THICKNESS / 2;
  const linerZ = outwardSign > 0 ? -ROOF_THICKNESS / 2 - LINER_THICKNESS : ROOF_THICKNESS / 2;

  return (
    <group>
      <mesh position={[0, 0, coreZ]}>
        <extrudeGeometry args={[shape, { depth: ROOF_THICKNESS, bevelEnabled: false }]} />
        <meshStandardMaterial color={colors.wall} side={THREE.DoubleSide} />
      </mesh>
      {hasLiner && (
        <mesh position={[0, 0, linerZ]}>
          <extrudeGeometry args={[shape, { depth: LINER_THICKNESS, bevelEnabled: false }]} />
          <meshStandardMaterial color={interiorColor} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}