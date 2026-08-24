// src/render/three/meshGeometry.ts
//
// The ONE place MeshData becomes something three can draw.
//
// ── WHY THIS IS ALONE IN A FILE ─────────────────────────────────────────────
//
// A module-level import is all-or-nothing. One `import * as THREE` makes every
// function in the module unreachable to `node --experimental-strip-types`,
// whether or not it uses three — and that loop is how this project finds bugs
// fastest ("measure, don't reason"). This function genuinely needs three; the
// mesh PRODUCERS next door do not. Keeping the dependency in the thinnest
// possible module is functional-core / imperative-shell applied one level down,
// inside the shell: three is the effect, and this is its adapter.
//
// It used to live in roofGeometry.ts beside `corrugate`, which cost exactly
// that — verifying a pure change to `gableMesh` meant stripping the import into
// a scratch copy first.
//
// ── WHY IT IS NOT CALLED slopeGeometry ANY MORE ─────────────────────────────
//
// Nothing here is roof-specific; it was named for the roof only because the roof
// was the first mesh to need it. Roof, Ground, Doors and Stairs all go through
// it now, which is the point — the three traps below are encoded once instead of
// rediscovered per component.

import * as THREE from 'three';
import type { MeshData } from '../../core/geometry/mesh';

export function meshGeometry(data: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions.flat()), 3));
  // Without this the roof had no `uv` attribute at all, so any `map` sampled
  // texel (0,0) forever and every surface came out as one flat colour — which
  // looks exactly like the fallback the component draws, which is why it read
  // as "the texture didn't load" rather than "the geometry can't be textured".
  //
  // In WORLD UNITS, not 0..1 (see MeshData in core/mesh.ts), so the material
  // must come from `useTiledSurface` and not `useSurfaceMaterial`.
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.uvs.flat()), 2));
  // Without the index, three reads a flat slope's 8 vertices as 2 unindexed
  // triangles instead of the 4 the quads describe: half the front panel, one
  // spurious sheet stretched from the ridge across the back, and both far ridge
  // corners dropped. It looks like a split at the top of the roof.
  g.setIndex([...data.indices]);
  // Runs AFTER setIndex — computeVertexNormals takes a different path for
  // indexed geometry, and the smoothing across shared vertices is exactly what
  // rounds the corrugation into barrels.
  g.computeVertexNormals();
  return g;
}