// src/scene/textures/index.ts
//
// The texture registry — the answer to "how do textures get into components".
// A component never constructs a texture; it asks for one BY KEY. Because the
// key is constrained to TextureKey, a typo is a compile error, not a blank
// surface at runtime. This is the render-side mirror of the compiler's
// UnknownTextureKey check: the same "textures are a keyed set, unknown keys are
// caught" rule, enforced here by the type system instead of a Result.
//
// Swapping procedural grass for an image later is a one-line change here — add a
// factory that loads a file — and no component that says useSceneTexture('grass')
// has to change.

import { useMemo } from 'react';
import * as THREE from 'three';
import { createGrassTexture } from './grass';

const FACTORIES = {
  grass: createGrassTexture,
} as const;

export type TextureKey = keyof typeof FACTORIES;

export function useSceneTexture(key: TextureKey): THREE.Texture {
  return useMemo(() => FACTORIES[key](), [key]);
}