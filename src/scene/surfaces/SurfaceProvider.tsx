// src/scene/surfaces/SurfaceProvider.tsx
//
// Turns the registry into GPU textures, once, and cleans up after itself.
//
// The shape of the API is lifted from react-planner's `applyTexture(material,
// texture, length, height)`: the CALLER passes the size of the face it's
// covering and gets back a correctly-repeated material. That's the right seam —
// every mesh knows its own dimensions, and nothing else can know them.
//
// What we do differently, deliberately:
//   * It returns PROPS rather than mutating a material. Spreading one object
//     onto <meshStandardMaterial> beats four hand-copied lines per mesh, which
//     is what the first version had and is how map/roughness/normal drift apart.
//   * Textures are built once and disposed. react-planner calls
//     `new TextureLoader()` inside the per-mesh render path, so every wall
//     re-fetches its own copy and nothing is ever released.
//   * The normal map is DERIVED from the colour map's luminance, so there's no
//     second asset to author, ship, or keep in sync.
//
// The cache lives in the provider, not at module scope: module-level state
// outlives the scene, never gets disposed, and would be silently shared between
// two mounted canvases.

import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import * as THREE from 'three';
import { renderNormalMap, renderPattern } from './pattern';
import { SURFACES, type SurfaceKey, type SurfaceSpec } from './registry';

interface Built {
  readonly map: THREE.CanvasTexture;
  readonly normalMap: THREE.CanvasTexture;
}

interface Store {
  readonly base: ReadonlyMap<SurfaceKey, Built>;
  readonly variants: Map<string, Built>; // key|rx|ry → clones carrying their own repeat
  readonly disposables: THREE.Texture[];
}

const SurfaceContext = createContext<Store | null>(null);

function toTexture(bytes: Uint8ClampedArray, size: number, srgb: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // Only ever null if the canvas is already claimed by another context type,
  // which can't happen for one we just made. Throwing beats a blank texture.
  if (ctx === null) throw new Error('surfaces: could not get a 2d canvas context');
  const image = ctx.createImageData(size, size);
  image.data.set(bytes);
  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Colour maps are authored in sRGB; a normal map is DATA — vectors, not
  // colour — and colour-managing it would bend every normal it encodes.
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const build = (spec: SurfaceSpec): Built => ({
  map: toTexture(renderPattern(spec.pattern, spec.size), spec.size, true),
  normalMap: toTexture(
    renderNormalMap(spec.pattern, spec.size, spec.normalStrength),
    spec.size,
    false,
  ),
});

export function SurfaceProvider({ children }: { children: ReactNode }) {
  const store = useMemo<Store>(() => {
    const base = new Map<SurfaceKey, Built>();
    const disposables: THREE.Texture[] = [];
    for (const key of Object.keys(SURFACES) as SurfaceKey[]) {
      const built = build(SURFACES[key]);
      base.set(key, built);
      disposables.push(built.map, built.normalMap);
    }
    return { base, variants: new Map(), disposables };
  }, []);

  useEffect(() => () => store.disposables.forEach((t) => t.dispose()), [store]);

  return <SurfaceContext.Provider value={store}>{children}</SurfaceContext.Provider>;
}

/** Everything <meshStandardMaterial> needs for one surface on one face. */
export interface SurfaceMaterial {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture;
  readonly normalScale: THREE.Vector2;
  readonly roughness: number;
  readonly metalness: number;
  readonly color: string;
}

/**
 * Material props for `key`, sized for a face `worldSize` = [along, across] in
 * world units. Pass the mesh's own dimensions and the grain comes out the same
 * physical size on every object that uses this surface.
 *
 * Returns null before the provider is mounted, so callers can fall back to a
 * flat colour rather than render nothing.
 */
export function useSurfaceMaterial(
  key: SurfaceKey,
  worldSize: readonly [number, number],
): SurfaceMaterial | null {
  const store = useContext(SurfaceContext);
  const spec = SURFACES[key];

  // Rounded so near-identical meshes share one clone instead of minting a
  // texture per pixel of difference. At least 1, or the tile vanishes.
  const rx = Math.max(1, Math.round(worldSize[0] / spec.worldScale[0]));
  const ry = Math.max(1, Math.round(worldSize[1] / spec.worldScale[1]));

  return useMemo(() => {
    if (store === null) return null;
    const source = store.base.get(key);
    if (source === undefined) return null;

    const id = `${key}|${rx}|${ry}`;
    let variant = store.variants.get(id);
    if (variant === undefined) {
      // `repeat` lives on the Texture, not the material, so two scales need two
      // Textures. `clone()` shares `.source`, so every variant of one surface is
      // still a single GPU upload — the cost is a wrapper object, not an image.
      const map = source.map.clone();
      const normalMap = source.normalMap.clone();
      map.repeat.set(rx, ry);
      normalMap.repeat.set(rx, ry);
      map.needsUpdate = true;
      normalMap.needsUpdate = true;
      variant = { map, normalMap };
      store.variants.set(id, variant);
      store.disposables.push(map, normalMap);
    }

    return {
      map: variant.map,
      normalMap: variant.normalMap,
      normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
      roughness: spec.roughness,
      metalness: spec.metalness,
      color: '#ffffff', // white, so the map's own colour comes through untinted
    };
  }, [store, key, rx, ry, spec]);
}