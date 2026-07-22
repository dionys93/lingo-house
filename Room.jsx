// web/src/components/house/Room.jsx
import { roomRect, roomById, WALL_HEIGHT } from './constants.js';
const SLAB = 0.05;

export function Room({ roomId, colors, rect, ceilingColor, ceiling = true, holes = [] }) {
  const r = rect ?? roomRect(roomId);
  if (!r) return null;
  const ceil = ceilingColor ?? roomById(roomId)?.interiorWallColor ?? colors.wall;

  // Floor: if there are holes, split the slab into strips around them. For one
  // hole this is 4 border rects; multiple holes fall back to per-hole gaps in Z.
  const floorPieces = holes.length === 0
    ? [{ cx: r.centerX, cz: r.centerZ, w: r.width, d: r.depth }]
    : sliceAround(r, holes[0]); // one stair hole per room in practice

  return (
    <group position={[0, 0, 0]}>
      {floorPieces.map((p, i) => (
        <mesh key={i} position={[p.cx, SLAB / 2, p.cz]}>
          <boxGeometry args={[p.w, SLAB, p.d]} />
          <meshStandardMaterial color={colors.floor} />
        </mesh>
      ))}
      {ceiling && (
        <mesh position={[r.centerX, WALL_HEIGHT - SLAB / 2, r.centerZ]}>
          <boxGeometry args={[r.width, SLAB, r.depth]} />
          <meshStandardMaterial color={ceil} />
        </mesh>
      )}
    </group>
  );
}

// Four rectangles tiling the room minus a hole: front strip, back strip, and
// left/right strips spanning only the hole's depth. Any zero-size strip drops.
function sliceAround(r, hole) {
  const rx0 = r.centerX - r.width / 2, rx1 = r.centerX + r.width / 2;
  const rz0 = r.centerZ - r.depth / 2, rz1 = r.centerZ + r.depth / 2;
  const hx0 = hole.centerX - hole.width / 2, hx1 = hole.centerX + hole.width / 2;
  const hz0 = hole.centerZ - hole.depth / 2, hz1 = hole.centerZ + hole.depth / 2;
  const strips = [
    { x0: rx0, x1: rx1, z0: rz0, z1: hz0 },   // back strip (full width)
    { x0: rx0, x1: rx1, z0: hz1, z1: rz1 },   // front strip (full width)
    { x0: rx0, x1: hx0, z0: hz0, z1: hz1 },   // left strip (hole depth)
    { x0: hx1, x1: rx1, z0: hz0, z1: hz1 },   // right strip (hole depth)
  ];
  return strips
    .filter((s) => s.x1 - s.x0 > 1e-4 && s.z1 - s.z0 > 1e-4)
    .map((s) => ({ cx: (s.x0 + s.x1) / 2, cz: (s.z0 + s.z1) / 2, w: s.x1 - s.x0, d: s.z1 - s.z0 }));
}