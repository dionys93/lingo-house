// web/src/components/house/Wall.jsx
import { ANIMATIONS } from '../../utils/animations.js';
import { WallPanel } from './WallPanel.jsx';
import { WALL_HEIGHT, WALL_THICKNESS } from './constants.js';

// A generic openable wall, built in local space — the caller places it. Kept
// independent of Door so it stays reusable for a different opening later (a
// garage, a gate) without dragging Door's header/sizing along.
export function Wall({ animation = 'swingDoorOut', width, height = WALL_HEIGHT, thickness = WALL_THICKNESS, position = [0, 0, 0], open, onToggle, colors }) {
  const panels = ANIMATIONS[animation](width, height, thickness);

  return (
    <group position={position}>
      {panels.map((panel, i) => (
        <WallPanel key={i} {...panel} isOpen={open} onToggle={onToggle} colors={colors} />
      ))}
    </group>
  );
}