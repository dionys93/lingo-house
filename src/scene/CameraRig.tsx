// src/scene/CameraRig.tsx
//
// The shell half of navigation: when nav is 'moving', drive the camera manually
// (OrbitControls disabled) — first to the doorway waypoint (nav.via), then to the
// destination vantage, dispatching 'arrived' on reaching it. The move ends exactly
// where the settled controller takes over: interior stand position + front facing
// for a room (InteriorControls), or the exterior vantage (OrbitControls). WHERE
// and WHEN come from the pure nav core; only the smooth motion lives here.

import { useEffect, useRef, type Dispatch } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { CompiledRoom, Vec3 } from '../core/grid';
import { boundsAt, type NavEvent, type NavState } from '../core/nav';
import { interiorStand, frontLookAt, EXTERIOR_CAMERA, EXTERIOR_TARGET } from './vantage';

const REACH = 0.12; // distance that counts as "arrived" at a waypoint

function dampVec(v: THREE.Vector3, t: Vec3, lambda: number, dt: number): void {
  v.x = THREE.MathUtils.damp(v.x, t[0], lambda, dt);
  v.y = THREE.MathUtils.damp(v.y, t[1], lambda, dt);
  v.z = THREE.MathUtils.damp(v.z, t[2], lambda, dt);
}

export function CameraRig({
  nav,
  dispatch,
  rooms,
}: {
  nav: NavState;
  dispatch: Dispatch<NavEvent>;
  rooms: readonly CompiledRoom[];
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

    const box = boundsAt(nav.to, rooms);
    const destPos: Vec3 = box ? interiorStand(box).position : EXTERIOR_CAMERA;
    const destLook: Vec3 = box ? frontLookAt(box) : EXTERIOR_TARGET;

    const aimPos = phase.current === 'approach' ? nav.via : destPos;
    const aimLook = phase.current === 'approach' ? nav.via : destLook;
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