// web/src/components/house/Window.jsx
import { WallSegment } from './Siding.jsx';

// Just the glass — it sits in an actual hole in the wall (see
// WallWithWindow below), so whatever's genuinely behind it shows through
// the tint, rather than a painted-on illusion.
export function Window({ width = 0.32, height = 0.32 }) {
  return (
    <mesh position={[0, 0, 0.04]}>
      <boxGeometry args={[width, height, 0.01]} />
      <meshStandardMaterial color="#bfe3f0" transparent opacity={0.3} roughness={0.1} />
    </mesh>
  );
}

// A flat wall with a genuine rectangular hole cut into it — built from 4
// surrounding wall segments (top/bottom/left/right of the opening) instead
// of one solid box, the same trick used for the doorway. The glass sits in
// the actual gap, so there's real depth behind it, and a plain white trim
// frames the opening from outside — extending onto the wall, not over the
// glass, so it never fights with the transparent pane.
export function WallWithWindow({ x, width, height, colors, windowWidth = 0.32, windowHeight = 0.32, windowCenterY = height * 0.62 }) {
  const holeTop = windowCenterY + windowHeight / 2;
  const holeBottom = windowCenterY - windowHeight / 2;
  const sideWidth = (width - windowWidth) / 2;
  const trimWidth = 0.015;
  const trimColor = '#ffffff';

  return (
    <group position={[x, 0, 0]}>
      {/* top segment, above the opening */}
      <WallSegment
        position={[0, (holeTop + height) / 2, 0]}
        size={[width, height - holeTop, 0.05]}
        color={colors.wall}
        sidingBoards={2}
      />

      {/* bottom segment, below the opening */}
      <WallSegment
        position={[0, holeBottom / 2, 0]}
        size={[width, holeBottom, 0.05]}
        color={colors.wall}
        sidingBoards={3}
      />

      {/* left segment, beside the opening */}
      <WallSegment
        position={[-(windowWidth / 2 + sideWidth / 2), windowCenterY, 0]}
        size={[sideWidth, windowHeight, 0.05]}
        color={colors.wall}
        sidingBoards={2}
      />

      {/* right segment, beside the opening */}
      <WallSegment
        position={[windowWidth / 2 + sideWidth / 2, windowCenterY, 0]}
        size={[sideWidth, windowHeight, 0.05]}
        color={colors.wall}
        sidingBoards={2}
      />

      {/* White trim/casing around the opening — a plain border, no muntin
          bars across the glass. Extends outward from the opening's edge
          onto the wall (not inward over the glass), so it never overlaps
          the transparent pane. */}
      <mesh position={[0, windowCenterY + windowHeight / 2 + trimWidth / 2, 0.03]}>
        <boxGeometry args={[windowWidth + trimWidth * 2, trimWidth, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[0, windowCenterY - windowHeight / 2 - trimWidth / 2, 0.03]}>
        <boxGeometry args={[windowWidth + trimWidth * 2, trimWidth, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[-(windowWidth / 2 + trimWidth / 2), windowCenterY, 0.03]}>
        <boxGeometry args={[trimWidth, windowHeight, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>
      <mesh position={[windowWidth / 2 + trimWidth / 2, windowCenterY, 0.03]}>
        <boxGeometry args={[trimWidth, windowHeight, 0.02]} />
        <meshStandardMaterial color={trimColor} />
      </mesh>

      {/* the glass sits in the actual opening — nothing opaque behind it */}
      <group position={[0, windowCenterY, 0]}>
        <Window width={windowWidth} height={windowHeight} />
      </group>
    </group>
  );
}