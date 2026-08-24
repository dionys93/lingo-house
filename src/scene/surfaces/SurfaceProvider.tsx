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
//   * Normal maps are BUILT FROM THE PATTERN'S OWN HEIGHT FIELD, so there's no
//     second asset to author, ship, or keep in sync. This used to derive them
//     from the colour map's luminance instead — for the photographed oak
//     exactly as for the generated walnut — which was a reconstruction of
//     something the generator already knew, and wrong the moment a pattern
//     carried colour that wasn't depth. See the header of pattern.ts.
//
// Building happens in an effect rather than useMemo because image sources load
// asynchronously. Surfaces appear as they resolve and `useSurfaceMaterial`
// returns null until then, so callers fall back to a flat colour for a frame or
// two instead of rendering nothing.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { normalFromHeight, renderPattern } from './pattern';
import { SURFACES, type SurfaceKey, type SurfaceSpec } from './registry';

interface Built {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture | null; // null when the spec asks for no relief
}

/** One surface cloned to carry a specific repeat. */
interface Variant {
  readonly map: THREE.Texture;
  readonly normalMap: THREE.Texture | null;
}

interface Store {
  readonly base: ReadonlyMap<SurfaceKey, Built>;
  /**
   * Clone-and-cache a repeat variant for a face of `rx`×`ry` tiles.
   *
   * SIDE-EFFECTING: allocates GPU resources. Call it from an effect, never from
   * render. It used to be called inline in a `useMemo`, which put two mutations
   * (`variants.set`, `disposables.push`) in the render phase — see the note on
   * the variant cache in the provider for what that actually cost.
   */
  readonly acquire: (key: SurfaceKey, rx: number, ry: number) => Variant | null;
}

const NO_SURFACES: Store = { base: new Map(), acquire: () => null };
const SurfaceContext = createContext<Store>(NO_SURFACES);

function configure(tex: THREE.Texture, srgb: boolean, anisotropy: number): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Colour maps are authored in sRGB; a normal map is DATA — vectors, not
  // colour — and colour-managing it would bend every normal it encodes.
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // Asked of the renderer rather than guessed. The hardcoded 4 cost real
  // sharpness on the 40-unit ground plane, which is viewed almost edge-on at
  // the camera's polar cap — precisely the case anisotropic filtering exists
  // for. Every device we target reports 16.
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function canvasTexture(
  bytes: Uint8ClampedArray,
  w: number,
  h: number,
  srgb: boolean,
  anisotropy: number,
): THREE.Texture {
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
  return configure(new THREE.CanvasTexture(canvas), srgb, anisotropy);
}

export function SurfaceProvider({ children }: { children: ReactNode }) {
  // The renderer knows its own limit; we were guessing 4.
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  const [base, setBase] = useState<ReadonlyMap<SurfaceKey, Built>>(() => new Map());

  // Repeat-variants live in a REF, deliberately not in published state.
  //
  // They used to be a `variants: new Map()` field on the store object, minted
  // fresh on every publish. Publishing happens once synchronously and again per
  // image that resolves — so the moment the oak plank finished loading, every
  // variant built before it was orphaned and re-cloned from scratch. A ref
  // survives publishes, so a variant is cloned once and stays valid: `publish`
  // copies the base Map but the `Built` values inside it are the same objects.
  const variants = useRef(new Map<string, Variant>());

  useEffect(() => {
    let live = true;
    const base = new Map<SurfaceKey, Built>();
    const disposables: THREE.Texture[] = [];
    const cache = variants.current;
    const publish = () => {
      if (live) {
        // A surface that never arrives is invisible: the mesh keeps its fallback
        // colour and looks like a styling choice. Say what actually got built.
        console.info('[surfaces] built:', [...base.keys()]);
        setBase(new Map(base));
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
        // The pattern hands back the height field it already computed, so the
        // normal map is built from the shape rather than reconstructed from the
        // colour. `worldScale` is what turns a texel into a distance, which is
        // what makes `relief` a depth instead of a strength — see pattern.ts.
        const { rgba, height } = renderPattern(spec.source.pattern, size);
        remember(key, {
          map: canvasTexture(rgba, size, size, true, maxAnisotropy),
          normalMap:
            height !== null && spec.source.relief > 0
              ? canvasTexture(
                normalFromHeight(height, size, spec.source.relief, spec.worldScale),
                size,
                size,
                false,
                maxAnisotropy,
              )
              : null,
        });
        continue;
      }

      if (spec.source.kind === 'generator') {
        remember(key, { map: configure(spec.source.make(), true, maxAnisotropy), normalMap: null });
        continue;
      }

      // Image: nothing to derive. Relief lives on the pattern variant of
      // SurfaceSource, so a photograph structurally cannot ask for it — which
      // is why the pixel readback that used to happen here is gone, along with
      // the cross-origin taint it could hit.
      const url = spec.source.url;
      loader.load(
        url,
        (tex) => {
          if (!live) {
            tex.dispose();
            return;
          }
          configure(tex, true, maxAnisotropy);
          remember(key, { map: tex, normalMap: null });
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
          console.error(`[surfaces] ${key} FAILED to load: ${url}`, err);
        },
      );
    }

    publish();

    return () => {
      live = false;
      disposables.forEach((t) => t.dispose());
      // Variants clone `.source` from the bases above, so disposing a base
      // disposes its clones' pixels too. They have to go together or a
      // StrictMode remount leaves consumers holding dead textures.
      cache.forEach((v) => {
        v.map.dispose();
        v.normalMap?.dispose();
      });
      cache.clear();
    };
  }, [maxAnisotropy]);

  const acquire = useCallback(
    (key: SurfaceKey, rx: number, ry: number): Variant | null => {
      const source = base.get(key);
      if (source === undefined) return null;

      const id = `${key}|${rx}|${ry}`;
      const hit = variants.current.get(id);
      if (hit !== undefined) return hit;

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
      }

      const variant: Variant = { map, normalMap };
      variants.current.set(id, variant);
      return variant;
    },
    [base],
  );

  const store = useMemo<Store>(() => ({ base, acquire }), [base, acquire]);

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
 * Shared tail of both surface hooks: acquire a repeat-variant and dress it as
 * material props. The two hooks differ ONLY in how they arrive at rx/ry, so
 * that difference is all that lives above this.
 */
function useRepeated(key: SurfaceKey, rx: number, ry: number): SurfaceMaterial | null {
  const { acquire } = useContext(SurfaceContext);
  const spec = SURFACES[key];

  // EFFECTFUL: cloning a texture is a GPU allocation, so it happens after
  // commit, not during render. `acquire` changes identity when new surfaces
  // publish, which is what re-runs this and picks up a late-loading image.
  const [variant, setVariant] = useState<Variant | null>(null);
  useEffect(() => {
    setVariant(acquire(key, rx, ry));
  }, [acquire, key, rx, ry]);

  return useMemo(
    () =>
      variant === null
        ? null
        : {
          map: variant.map,
          normalMap: variant.normalMap,
          normalScale: new THREE.Vector2(spec.normalScale, spec.normalScale),
          roughness: spec.roughness,
          metalness: spec.metalness,
          // White by default, so a map's own colour comes through untinted.
          // An image source may override it: a photograph's colour is baked and
          // this multiplier is the only way to re-tone one. Patterns never set
          // it — they state their colours directly.
          color: spec.source.kind === 'image' ? (spec.source.tint ?? '#ffffff') : '#ffffff',
        },
    [variant, spec],
  );
}

/**
 * Material props for a mesh whose UVs are in WORLD UNITS along the surface.
 * The roof is the first of these; everything else follows.
 *
 * `repeat` is simply `1 / worldScale`, a constant per surface. The geometry
 * already states how much world it covers, so the surface only has to say how
 * big one tile is — nothing is fitted to a face and nothing is rounded, so two
 * meshes of wildly different size come out at identical physical tile scale by
 * construction rather than by arithmetic that happens to agree.
 */
export function useTiledSurface(key: SurfaceKey): SurfaceMaterial | null {
  const spec = SURFACES[key];
  return useRepeated(key, 1 / spec.worldScale[0], 1 / spec.worldScale[1]);
}

/**
 * Material props for a mesh whose UVs are 0..1 — i.e. one of three's primitive
 * geometries, which is everything that predates the roof: `boxGeometry` on the
 * stairs and the lab panels, `planeGeometry` on the ground.
 *
 * Pass the mesh's own dimensions and it works out how many tiles that is. The
 * shape is lifted from react-planner's `applyTexture(material, texture, length,
 * height)` and the seam is a good one — every mesh knows its own size.
 *
 * TRANSITIONAL, and it goes when the last 0..1 UV does. Two things are wrong
 * with it and neither is fixable here:
 *
 *   THE ROUNDING. `Math.max(1, Math.round(…))` is a lie about "the same
 *   physical size on every object". A stair tread is 0.16 × 0.43 against oak's
 *   0.2 × 0.67 tile — that's 0.8 × 0.64 of a tile, and it clamps to 1 × 1, so
 *   the board comes out 25% and 56% oversized. At CELL = 0.5 most faces in this
 *   house are smaller than one tile, so most faces are wrong. The handrail
 *   aliasing that the registry blames on ring count is this.
 *
 *   ONE REPEAT FOR SIX FACES. `boxGeometry` gives every face 0..1 regardless of
 *   its size, so the repeat computed for a tread's top is also applied to its
 *   3cm edges. Nobody noticed because those edges are thin and shadowed.
 *
 * `useTiledSurface` has neither problem, because metric UVs make the question
 * go away rather than answer it better.
 */
export function useSurfaceMaterial(
  key: SurfaceKey,
  worldSize: readonly [number, number],
): SurfaceMaterial | null {
  const spec = SURFACES[key];

  // PURE: what size of tile this face needs. Rounded so near-identical meshes
  // share one clone instead of minting a texture per pixel of difference. At
  // least 1, or the tile vanishes.
  const rx = Math.max(1, Math.round(worldSize[0] / spec.worldScale[0]));
  const ry = Math.max(1, Math.round(worldSize[1] / spec.worldScale[1]));

  return useRepeated(key, rx, ry);
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
  side,
}: {
  material: SurfaceMaterial | null;
  color: string;
  roughness?: number;
  metalness?: number;
  // Passed through to BOTH branches. The roof needs DoubleSide — you see its
  // underside from upstairs — and a caller that reached for a bare
  // <meshStandardMaterial> to get it would lose the keying above, which is the
  // exact bug this component exists to prevent.
  side?: THREE.Side;
}) {
  return material ? (
    <meshStandardMaterial key="surfaced" {...material} side={side} />
  ) : (
    <meshStandardMaterial
      key="flat"
      color={color}
      roughness={roughness}
      metalness={metalness}
      side={side}
    />
  );
}