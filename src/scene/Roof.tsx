// src/scene/Roof.tsx
//
// Renders the compiled gable roof: the sloped panels in clay pantiles, and the
// gable ends as thick SIDING prisms — each flat triangle from the core extruded to
// the wall's thickness along its axis, so it sits on the end wall and reads as the
// wall continuing up to the ridge, not a sheet laid on the roof.
//
// The two halves take different materials on purpose. Slopes are the ROOF and
// get `clay.pantile`. Gables are the end WALL and keep `HOUSE_SIDING`, flat, on
// the same terms as every other wall — texturing walls is a separate decision
// and is deferred. So only the slopes carry UVs or corrugation.
//
// Geometry lives in ./roofGeometry so it can be tested; this file is the wiring.

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../core/grid';
import type { Gable, RoofMesh } from '../core/roof';
import { WALL_THICKNESS, HOUSE_SIDING } from './wallMaterials';
import { pickable } from './pickable';
import { SOLID } from './shadows';
import { corrugate, meshGeometry } from './roofGeometry';
import { SurfaceMaterialSlot, useTiledSurface } from './surfaces/SurfaceProvider';
import { SURFACES, type SurfaceKey } from './surfaces/registry';

const ROOF_SURFACE: SurfaceKey = 'clay.pantile';
const ROOF_COLOR = '#a86b4c'; // terracotta — the fallback until the surface builds

// Extrude each gable triangle to `thickness` along its axis → a triangular prism
// that matches (and sits on) the end wall.
function gableGeometry(gables: readonly Gable[], thickness: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const push = (v: Vec3): number => {
    positions.push(v[0], v[1], v[2]);
    return positions.length / 3 - 1;
  };
  for (const g of gables) {
    const h = thickness / 2;
    const off: Vec3 = g.axis === 'x' ? [h, 0, 0] : [0, 0, h];
    const shift = (v: Vec3, s: number): Vec3 => [v[0] + off[0] * s, v[1] + off[1] * s, v[2] + off[2] * s];
    const A = push(shift(g.base0, 1));
    const B = push(shift(g.base1, 1));
    const P = push(shift(g.apex, 1));
    const a = push(shift(g.base0, -1));
    const b = push(shift(g.base1, -1));
    const p = push(shift(g.apex, -1));
    indices.push(
      A, B, P, // +face triangle (end cap)
      a, p, b, // -face triangle (end cap)
      A, a, b, A, b, B, // bottom
      // Top is left OPEN — the overhanging roof covers it. Adding the sloped faces
      // here would put them coplanar with the roof and z-fight.
    );
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function Roof({ roof, onPick }: { roof: RoofMesh; onPick?: (at: Vec3) => void }) {
  const slopeGeo = useMemo(() => {
    // Corrugation is a property of the MATERIAL, so it is read from the surface
    // rather than authored on the house: swap pantiles for slate and the same
    // plane wants to be flat. A surface with no `corrugation` gets the flat
    // panels the core produced.
    const c = SURFACES[ROOF_SURFACE].corrugation;
    return meshGeometry(c ? corrugate(roof.slopes, c) : roof.slopes);
  }, [roof]);
  const gableGeo = useMemo(() => gableGeometry(roof.gables, WALL_THICKNESS), [roof]);

  // Geometries are GPU allocations and were never released. That was cheap to
  // ignore at 8 vertices a roof; corrugation makes it ~2,400, so every rebuild
  // of the house would strand a real buffer. Disposing on identity change
  // covers unmount and a new `roof` alike.
  useEffect(
    () => () => {
      slopeGeo.dispose();
      gableGeo.dispose();
    },
    [slopeGeo, gableGeo],
  );

  // No size argument, and that IS the point of `useTiledSurface`. Every roof in
  // the house asks for the same material; how many tiles land on it falls out of
  // its own UVs, so the low roof and the tall one match without either knowing
  // the other's dimensions.
  const tiles = useTiledSurface(ROOF_SURFACE);

  // Slopes and gable ends are both "the roof" — one label, two meshes, so the
  // handlers go on each rather than on a wrapping group (a group has no surface
  // to hit).
  const picks = onPick ? pickable(onPick) : {};

  return (
    <>
      <mesh geometry={slopeGeo} {...SOLID} {...picks}>
        <SurfaceMaterialSlot
          material={tiles}
          color={ROOF_COLOR}
          roughness={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh geometry={gableGeo} {...SOLID} {...picks}>
        <meshStandardMaterial color={HOUSE_SIDING} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </>
  );
}