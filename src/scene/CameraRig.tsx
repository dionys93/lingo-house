// src/scene/CameraRig.tsx
//
// Drives the camera while nav is 'moving' (OrbitControls disabled): first to the
// doorway waypoint (nav.via), then to the destination vantage, dispatching
// 'arrived' on reaching it. For a room, the destination is the DOORWAY SIDE of the
// room centre, looking AT the centre — i.e. facing into the room, away from the
// door you came through. That's exactly where InteriorControls takes over, so the
// handoff faces the right way with no snap. For the exterior, the outdoor vantage.

import { useEffect, useRef, type Dispatch } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Vec3 } from '../core/grid';
import type { Location, NavEvent, NavState } from '../core/nav';
import { EXTERIOR_CAMERA, EXTERIOR_TARGET, type Vantage } from './vantage';

const REACH = 0.12; // distance that counts as "arrived" at a waypoint

function dampVec(v: THREE.Vector3, t: Vec3, lambda: number, dt: number): void {
  v.x = THREE.MathUtils.damp(v.x, t[0], lambda, dt);
  v.y = THREE.MathUtils.damp(v.y, t[1], lambda, dt);
  v.z = THREE.MathUtils.damp(v.z, t[2], lambda, dt);
}

// The camera position + look-at for arriving at `to`, entering through `via`.
function arrival(
  to: Location,
  via: Vec3,
  vantages: ReadonlyMap<string, Vantage>,
): { pos: Vec3; look: Vec3 } {
  const v = vantages.get(to);
  if (v === undefined) return { pos: EXTERIOR_CAMERA, look: EXTERIOR_TARGET };
  const { center, radius: r } = v;
  // unit vector from the room centre toward the doorway we came in through
  const dx = via[0] - center[0];
  const dz = via[2] - center[2];
  const len = Math.hypot(dx, dz) || 1;
  const pos: Vec3 = [center[0] + (dx / len) * r, center[1], center[2] + (dz / len) * r];
  return { pos, look: center }; // stand on the door side, look at centre = into the room
}

export function CameraRig({
  nav,
  dispatch,
  vantages,
}: {
  nav: NavState;
  dispatch: Dispatch<NavEvent>;
  vantages: ReadonlyMap<string, Vantage>;
}) {
  const { camera } = useThree();
  const phase = useRef<'approach' | 'enter'>('approach');
  const moveKey = nav.tag === 'moving' ? `${nav.from}->${nav.to}` : 'idle';

  useEffect(() => {
    if (nav.tag === 'moving') phase.current = 'approach';
  }, [nav.tag, moveKey]);

  useFrame((_, delta) => {
    if (nav.tag !== 'moving') return;
    const dt = Math.min(delta, 0.05);

    const dest = arrival(nav.to, nav.via, vantages);
    const aimPos = phase.current === 'approach' ? nav.via : dest.pos;
    const aimLook = phase.current === 'approach' ? nav.via : dest.look;
    dampVec(camera.position, aimPos, 5, dt);
    camera.lookAt(aimLook[0], aimLook[1], aimLook[2]);

    const reached =
      camera.position.distanceTo(new THREE.Vector3(aimPos[0], aimPos[1], aimPos[2])) < REACH;
    if (reached) {
      if (phase.current === 'approach') phase.current = 'enter';
      else dispatch({ tag: 'arrived' });
    }
  });

  return null;
}