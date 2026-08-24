// src/render/three/pickable.ts
//
// The click handlers every pickable surface shares. Extracted the moment floors,
// walls, ceilings, windows, doors and items all needed the same three props —
// stopPropagation so a click lands on the nearest thing only, and the pointer
// cursor so anything readable looks readable.
//
// `onPick` receives the world point that was hit, which is what a part selection
// needs: every wall is "the wall", so there's no wall to identify, only a place
// to hang the popup.

import type { ThreeEvent } from '@react-three/fiber';
import type { Vec3 } from '../../core/house/grid';

export interface PickHandlers {
  readonly onClick: (e: ThreeEvent<MouseEvent>) => void;
  readonly onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  readonly onPointerOut: () => void;
}

export function pickable(onPick: (at: Vec3) => void): PickHandlers {
  return {
    onClick: (e) => {
      e.stopPropagation();
      onPick([e.point.x, e.point.y, e.point.z]);
    },
    onPointerOver: (e) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
    },
    onPointerOut: () => {
      document.body.style.cursor = 'auto';
    },
  };
}