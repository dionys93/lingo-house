// src/scene/InteriorControls.tsx
//
// Interior camera: a TURNTABLE with head-tilt. Your POSITION stays on an
// eye-height circle around the room centre — horizontal drag orbits you around
// the room (you move, you don't fly). Vertical drag only TILTS your gaze up/down
// (toward the ceiling/windows or the floor), it doesn't lift the camera — so you
// can look up and down without it becoming a free-flying helicopter. You enter
// facing into the room (CameraRig leaves you on the doorway side looking at the
// centre) and this picks that facing up, so there's no snap.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { CompiledRoom } from '../core/grid';
import { boundsAt, type Location, type NavState } from '../core/nav';
import { roomCenter, orbitRadius } from './vantage';

// Drag sensitivity. If drag-right orbits the WRONG way, flip the azimuth sign;
// if up/down is inverted, flip the pitch sign. Each is one character.
const DRAG = 0.006;
const PITCH_LIMIT = 1.0; // radians of look up/down (~57°)

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function InteriorControls({
  nav,
  rooms,
}: {
  nav: NavState;
  rooms: readonly CompiledRoom[];
}) {
  const { camera, gl } = useThree();
  const azimuth = useRef(0);
  const pitch = useRef(0);
  const dragging = useRef(false);
  const last = useRef<[number, number]>([0, 0]);
  const initializedAt = useRef<Location | null>(null);

  const location = nav.tag === 'in' ? nav.location : null;
  const active = location !== null && location !== 'outside';
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active) initializedAt.current = null;
  }, [active]);

  useEffect(() => {
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (!activeRef.current) return;
      dragging.current = true;
      last.current = [e.clientX, e.clientY];
    };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - last.current[0];
      const dy = e.clientY - last.current[1];
      last.current = [e.clientX, e.clientY];
      azimuth.current += dx * DRAG; // drag right → orbit right
      pitch.current = clamp(pitch.current - dy * DRAG, -PITCH_LIMIT, PITCH_LIMIT); // drag up → look up
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
      pitch.current = 0;
      initializedAt.current = location;
    }

    // Position: on the eye-height circle (never leaves it — no flying).
    camera.position.set(
      center[0] + r * Math.sin(azimuth.current),
      center[1],
      center[2] + r * Math.cos(azimuth.current),
    );
    // Gaze: at the centre, raised/lowered by the pitch (head-tilt).
    camera.lookAt(center[0], center[1] + r * Math.tan(pitch.current), center[2]);
  });

  return null;
}