// src/scene/surfaces/SurfaceProvider.tsx
//
// Turns the registry into GPU textures, once, and cleans up after itself.
//
// The API shape is lifted from react-planner's `applyTexture(material, texture,
// length, height)`: the CALLER passes the size of the face it's covering and
// gets back a correctly-repeated material. That's the right seam — every mesh
// knows its own dimensions and nothing else can.
//
// What we do differently, deliberately:
//   * Returns PROPS to spread rather than mutating a material, so map, repeat,
//     roughness and normalScale can't drift apart across call sites.
//   * Built once and disposed. react-planner calls `new TextureLoader()` inside
//     the per-mesh render path, so every wall refetches its own copy and nothing
//     is ever released.
//   * Normal maps are DERIVED from the colour map's own luminance — for the
//     photographed oak exactly as for the generated walnut — so there's no
//     second asset to author, ship, or keep in sync.
//
// Building happens in an effect rather than useMemo because image sources load
// asynchronously. Surfaces appear as they resolve and `useSurfaceMaterial`
// returns null until then, so callers fall back to a flat colour for a frame or
// two instead of rendering nothing.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { normalFromLuminance, renderPattern } from './pattern';
import { SURFACES, type SurfaceKey, type SurfaceSpec } from './registry';

interface Built {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture | null; // null when the spec asks for no relief
}

interface Store {
  readonly base: ReadonlyMap<SurfaceKey, Built>;
  readonly variants: Map<string, Built>; // key|rx|ry → clones carrying their own repeat
  readonly disposables: THREE.Texture[];
}

const EMPTY: Store = { base: new Map(), variants: new Map(), disposables: [] };
const SurfaceContext = createContext<Store>(EMPTY);

function configure(tex: THREE.Texture, srgb: boolean): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Colour maps are authored in sRGB; a normal map is DATA — vectors, not
  // colour — and colour-managing it would bend every normal it encodes.
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function canvasTexture(bytes: Uint8ClampedArray, w: number, h: number, srgb: boolean): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Only ever null if the canvas is already claimed by another context type,
  // which can't happen for one we just made. Throwing beats a blank texture.
  if (ctx === null) throw new Error('surfaces: could not get a 2d canvas context');
  const image = ctx.createImageData(w, h);
  image.data.set(bytes);
  ctx.putImageData(image, 0, 0);
  return configure(new THREE.CanvasTexture(canvas), srgb);
}

/** Read a loaded image's pixels back out, so a normal map can be derived. */
function pixelsOf(image: TexImageSource, w: number, h: number): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) return null;
  ctx.drawImage(image as CanvasImageSource, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

export function SurfaceProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(EMPTY);

  useEffect(() => {
    let live = true;
    const base = new Map<SurfaceKey, Built>();
    const disposables: THREE.Texture[] = [];
    const publish = () => {
      if (live) {
        // A surface that never arrives is invisible: the mesh keeps its fallback
        // colour and looks like a styling choice. Say what actually got built.
        console.info('[surfaces] built:', [...base.keys()]);
        setStore({ base: new Map(base), variants: new Map(), disposables });
      }
    };

    const remember = (key: SurfaceKey, built: Built) => {
      base.set(key, built);
      disposables.push(built.map);
      if (built.normalMap) disposables.push(built.normalMap);
    };

    const loader = new THREE.TextureLoader();

    for (const key of Object.keys(SURFACES) as SurfaceKey[]) {
      const spec: SurfaceSpec = SURFACES[key];

      if (spec.source.kind === 'pattern') {
        const size = spec.size ?? 128;
        const rgba = renderPattern(spec.source.pattern, size);
        remember(key, {
          map: canvasTexture(rgba, size, size, true),
          normalMap:
            spec.normalStrength > 0
              ? canvasTexture(
                normalFromLuminance(rgba, size, size, spec.normalStrength),
                size,
                size,
                false,
              )
              : null,
        });
        continue;
      }

      if (spec.source.kind === 'generator') {
        remember(key, { map: configure(spec.source.make(), true), normalMap: null });
        continue;
      }

      // Image: the texture itself is ready when three says so, and only then can
      // its pixels be read back to derive relief.
      loader.load(
        spec.source.url,
        (tex) => {
          if (!live) {
            tex.dispose();
            return;
          }
          configure(tex, true);
          let normalMap: THREE.Texture | null = null;
          if (spec.normalStrength > 0 && tex.image) {
            const w = tex.image.width as number;
            const h = tex.image.height as number;
            const rgba = pixelsOf(tex.image as TexImageSource, w, h);
            // A cross-origin image would taint the canvas and getImageData throws;
            // ours is bundled, but losing relief beats losing the whole surface.
            if (rgba) normalMap = canvasTexture(normalFromLuminance(rgba, w, h, spec.normalStrength), w, h, false);
          }
          remember(key, { map: tex, normalMap });
          publish();
        },
        // onProgress: nothing useful to report for a bundled asset, but the
        // slot has to be filled to reach onError — `load` takes them positionally.
        undefined,
        // A failed load was previously SILENT: no throw, no log, no state change.
        // The mesh just kept its fallback colour forever, which is indistinguishable
        // from the texture having loaded and simply looking plain. That is the
        // whole reason a missing surface is so expensive to diagnose.
        (err) => {
          console.error(`[surfaces] ${key} FAILED to load: ${spec.source.url}`, err);
        },
      );
    }

    publish();

    return () => {
      live = false;
      disposables.forEach((t) => t.dispose());
    };
  }, []);

  return <SurfaceContext.Provider value={store}>{children}</SurfaceContext.Provider>;
}

/** Everything <meshStandardMaterial> needs for one surface on one face. */
export interface SurfaceMaterial {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture | null;
  readonly normalScale: THREE.Vector2;
  readonly roughness: number;
  readonly metalness: number;
  readonly color: string;
}

/**
 * Material props for `key`, sized for a face `worldSize` = [u, v] in world
 * units. Pass the mesh's own dimensions and the grain comes out the same
 * physical size on every object using this surface.
 *
 * Returns null until the surface is ready, so callers fall back to a flat
 * colour rather than render nothing.
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
    const source = store.base.get(key);
    if (source === undefined) return null;

    const id = `${key}|${rx}|${ry}`;
    let variant = store.variants.get(id);
    if (variant === undefined) {
      // `repeat` lives on the Texture, not the material, so two scales need two
      // Textures. `clone()` shares `.source`, so every variant of one surface is
      // still a single GPU upload — the cost is a wrapper object, not an image.
      const map = source.map.clone();
      map.repeat.set(rx, ry);
      map.needsUpdate = true;
      let normalMap: THREE.Texture | null = null;
      if (source.normalMap) {
        normalMap = source.normalMap.clone();
        normalMap.repeat.set(rx, ry);
        normalMap.needsUpdate = true;
        store.disposables.push(normalMap);
      }
      variant = { map, normalMap };
      store.variants.set(id, variant);
      store.disposables.push(map);
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

/**
 * A `<meshStandardMaterial>` for a surface, falling back to a flat colour until
 * the surface is ready.
 *
 * THE `key` IS THE WHOLE POINT — do not remove it as redundant.
 *
 * Both branches are `<meshStandardMaterial>` in the same slot, so without
 * distinct keys React reconciles them as ONE element and R3F assigns `map` onto
 * the material instance it already built. But `USE_MAP` is a #define compiled
 * into the shader program: a material first built without a map has no sampler,
 * and setting `.map` later does nothing until something sets `.needsUpdate` and
 * forces a rebuild. Distinct keys make React construct a NEW material once the
 * surface arrives, so it compiles with the map present.
 *
 * The symptom this fixes: ground stayed untextured on load and only came good
 * after walking through a door — because stepping inside flips
 * `rig.sunCastsShadow`, which changes three's lighting-state hash and recompiles
 * every program in the scene. Every surface had the bug; only the ground was
 * visible before the first navigation.
 */
export function SurfaceMaterialSlot({
  material,
  color,
  roughness,
  metalness,
}: {
  material: SurfaceMaterial | null;
  color: string;
  roughness?: number;
  metalness?: number;
}) {
  return material ? (
    <meshStandardMaterial key="surfaced" {...material} />
  ) : (
    <meshStandardMaterial key="flat" color={color} roughness={roughness} metalness={metalness} />
  );
}