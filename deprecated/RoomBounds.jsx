// web/src/components/house/RoomBounds.jsx
import { useFrame } from '@react-three/fiber';
import { roomRect, roomById, WALL_HEIGHT, ROOM_BOUNDS_MARGIN } from './constants.js';

export function RoomBounds({ controlsRef, settledLocation, active }) {
  useFrame(({ camera }) => {
    if (!active || !roomById(settledLocation)) return;
    const controls = controlsRef.current;
    if (!controls) return;

    const { centerX, centerZ, width, depth, baseY } = roomRect(settledLocation);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    const p = camera.position;
    const x = clamp(p.x, centerX - width / 2 + ROOM_BOUNDS_MARGIN, centerX + width / 2 - ROOM_BOUNDS_MARGIN);
    const y = clamp(p.y, baseY + ROOM_BOUNDS_MARGIN, baseY + WALL_HEIGHT - ROOM_BOUNDS_MARGIN);
    const z = clamp(p.z, centerZ - depth / 2 + ROOM_BOUNDS_MARGIN, centerZ + depth / 2 - ROOM_BOUNDS_MARGIN);

    if (x !== p.x || y !== p.y || z !== p.z) {
      p.set(x, y, z);
      controls.update();
    }
  });
  return null;
}