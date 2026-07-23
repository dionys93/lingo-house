// src/scene/textures/grass.ts
//
// A procedural, seamless grass texture — no image asset, so nothing to load or
// keep in the repo, and it's reproducible. The look comes from stacked octaves
// of TILEABLE value noise (soft clumps) mapped onto a two-green palette, with a
// little per-pixel grain on top. The two failure modes we're avoiding: a flat
// single green (reads as plastic) and pure per-pixel noise (reads as static).

import * as THREE from 'three';

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const smoothstep = (t: number): number => t * t * (3 - 2 * t);

// One octave of tileable value noise: a gridN×gridN field of random values,
// sampled with WRAPPING indices (so the tile is seamless) and bilinearly
// interpolated with a smoothstep falloff for soft edges.
function makeOctave(gridN: number): (u: number, v: number) => number {
  const field = Array.from({ length: gridN * gridN }, () => Math.random());
  const at = (ix: number, iy: number): number => {
    const wx = ((ix % gridN) + gridN) % gridN;
    const wy = ((iy % gridN) + gridN) % gridN;
    return field[wy * gridN + wx] ?? 0;
  };
  return (u, v) => {
    const fx = u * gridN;
    const fy = v * gridN;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const sx = smoothstep(fx - x0);
    const sy = smoothstep(fy - y0);
    const top = lerp(at(x0, y0), at(x0 + 1, y0), sx);
    const bot = lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), sx);
    return lerp(top, bot, sy);
  };
}

export function createGrassTexture(size = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('createGrassTexture: 2D canvas context unavailable');

  const o1 = makeOctave(8); // broad patches
  const o2 = makeOctave(16); // mid clumps
  const o3 = makeOctave(48); // fine variation

  const dark: readonly [number, number, number] = [54, 88, 40];
  const light: readonly [number, number, number] = [128, 170, 78];

  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const clump = o1(u, v) * 0.55 + o2(u, v) * 0.3 + o3(u, v) * 0.15;
      const n = clump * 0.85 + Math.random() * 0.15; // grain on top of the clumps
      const i = (y * size + x) * 4;
      img.data[i] = lerp(dark[0], light[0], n);
      img.data[i + 1] = lerp(dark[1], light[1], n);
      img.data[i + 2] = lerp(dark[2], light[2], n);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}