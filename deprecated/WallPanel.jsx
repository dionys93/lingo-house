// web/src/components/house/WallPanel.jsx
import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { lerpVec3 } from '../../utils/lerp.js';
import { LERP_SPEED } from './constants.js';

// One leaf of a wall/door. `closed`/`open` are its two transforms (from
// utils/animations.js); it eases toward whichever one `isOpen` currently
// points at. The doorknob rides along for free since it's a sibling mesh
// inside the same animated group.
export function WallPanel({ size, pivot = [0, 0, 0], closed, open, isOpen, onToggle, colors }) {
  const ref = useRef();
  const [hovered, setHovered] = useState(false);

  useFrame(() => {
    if (!ref.current) return;
    const target = isOpen ? open : closed;
    lerpVec3(ref.current.position, target.position, LERP_SPEED);
    ref.current.rotation.y += (target.rotation - ref.current.rotation.y) * LERP_SPEED;
  });

  // Doorknob sits near whichever edge of this panel meets the other door
  // (or right-of-center for a single full-width panel), inferred from which
  // side of center this panel's closed position sits on — works for any
  // animation without needing to know which one is active.
  const knobSign = closed.position[0] < 0 ? 1 : closed.position[0] > 0 ? -1 : 1;
  const knobX = pivot[0] + knobSign * (size[0] / 2 - 0.08);
  const knobZ = pivot[2] + size[2] / 2 + 0.02;

  return (
    <group ref={ref} position={closed.position} rotation={[0, closed.rotation, 0]}>
      <mesh
        position={pivot}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial color={hovered ? colors.doorHover : colors.door} />
      </mesh>

      <mesh position={[knobX, -size[1] * 0.12, knobZ]}>
        <sphereGeometry args={[0.03, 12, 12]} />
        <meshStandardMaterial color="#d4af37" metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  );
}