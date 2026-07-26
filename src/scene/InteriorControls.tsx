// src/scene/InteriorControls.tsx
//
// First-person look for room interiors. You stand at a fixed spot (near the back
// wall) and dragging turns your head — drag right, look right — starting faced
// toward the front of the house every time you enter. This replaces OrbitControls
// inside a room, where orbiting-around-a-point read as inverted and left you
// facing a random direction. OrbitControls still handles the exterior.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CompiledRoom, Vec3 } from '../core/grid';
import { boundsAt, type NavState } from '../core/nav';
import { interiorStand } from './vantage';

const SENSITIVITY = 0.005;
const PITCH_LIMIT = 1.2; // radians up/down from level

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function InteriorControls({
  nav,
  rooms,
}: {
  nav: NavState;
  rooms: readonly CompiledRoom[];
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const last = useRef<[number, number]>([0, 0]);

  const location = nav.tag === 'in' ? nav.location : null;
  const active = location !== null && location !== 'outside';
  const activeRef = useRef(active);
  activeRef.current = active;

  // On entering a room, reset the view to face front.
  useEffect(() => {
    if (!active || location === null) return;
    const box = boundsAt(location, rooms);
    if (box === null) return;
    yaw.current = interiorStand(box).yaw;
    pitch.current = 0;
  }, [active, location, rooms]);

  // Drag → look. Listeners live for the component's life; they no-op unless we're
  // inside a room (activeRef), so they never fight OrbitControls on the exterior.
  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (!activeRef.current) return;
      dragging.current = true;
      last.current = [e.clientX, e.clientY];
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const [lx, ly] = last.current;
      const dx = e.clientX - lx;
      const dy = e.clientY - ly;
      last.current = [e.clientX, e.clientY];
      yaw.current -= dx * SENSITIVITY; // drag right → turn right
      pitch.current = clamp(pitch.current - dy * SENSITIVITY, -PITCH_LIMIT, PITCH_LIMIT);
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
    const { position } = interiorStand(box);
    camera.position.set(position[0], position[1], position[2]);
    const cp = Math.cos(pitch.current);
    const dir: Vec3 = [
      Math.sin(yaw.current) * cp,
      Math.sin(pitch.current),
      Math.cos(yaw.current) * cp,
    ];
    camera.lookAt(position[0] + dir[0], position[1] + dir[1], position[2] + dir[2]);
  });

  return null;
}