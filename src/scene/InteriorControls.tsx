// src/scene/InteriorControls.tsx
//
// Interior camera: a TURNTABLE. You orbit the room's centre at eye height, level
// (no pitch — you move around the room, you don't fly). Drag right → orbit right.
// You enter facing INTO the room (CameraRig leaves the camera on the doorway side
// looking at the centre), and this picks that facing up so there's no snap.
// OrbitControls still handles the exterior.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CompiledRoom } from '../core/grid';
import { boundsAt, type Location, type NavState } from '../core/nav';
import { roomCenter, orbitRadius } from './vantage';

// Drag sensitivity. If drag-right orbits the WRONG way, flip this sign.
const DRAG = 0.006;

export function InteriorControls({
  nav,
  rooms,
}: {
  nav: NavState;
  rooms: readonly CompiledRoom[];
}) {
  const { camera, gl } = useThree();
  const azimuth = useRef(0);
  const dragging = useRef(false);
  const lastX = useRef(0);
  const initializedAt = useRef<Location | null>(null);

  const location = nav.tag === 'in' ? nav.location : null;
  const active = location !== null && location !== 'outside';
  const activeRef = useRef(active);
  activeRef.current = active;

  // Re-derive the entry facing next time we come into a room.
  useEffect(() => {
    if (!active) initializedAt.current = null;
  }, [active]);

  // Horizontal drag → orbit. Vertical is ignored (level turntable, not a heli).
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (!activeRef.current) return;
      dragging.current = true;
      lastX.current = e.clientX;
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - lastX.current;
      lastX.current = e.clientX;
      azimuth.current += dx * DRAG; // drag right → orbit right
    };
    const up = () => {
      dragging.current = false;
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [gl]);

  useFrame(() => {
    if (!active || location === null) return;
    const box = boundsAt(location, rooms);
    if (box === null) return;
    const center = roomCenter(box);
    const r = orbitRadius(box);

    // Pick up the facing the transition left us at (looking into the room).
    if (initializedAt.current !== location) {
      azimuth.current = Math.atan2(camera.position.x - center[0], camera.position.z - center[2]);
      initializedAt.current = location;
    }

    camera.position.set(
      center[0] + r * Math.sin(azimuth.current),
      center[1],
      center[2] + r * Math.cos(azimuth.current),
    );
    camera.lookAt(center[0], center[1], center[2]);
  });

  return null;
}