// src/scene/Roof.tsx
//
// Renders the compiled gable roof: the sloped panels in the roof colour, and the
// gable ends as thick SIDING prisms — each flat triangle from the core extruded to
// the wall's thickness along its axis, so it sits on the end wall and reads as the
// wall continuing up to the ridge, not a sheet laid on the roof.

import { useMemo } from 'react';
import * as THREE from 'three';
import type { Vec3 } from '../core/grid';
import type { Gable, MeshData, RoofMesh } from '../core/roof';
import { WALL_THICKNESS, HOUSE_SIDING } from './wallMaterials';
import { pickable } from './pickable';

const ROOF_COLOR = '#a86b4c'; // terracotta

function slopeGeometry(data: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions.flat()), 3));
  g.setIndex([...data.indices]);
  g.computeVertexNormals();
  return g;
}

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
  const slopeGeo = useMemo(() => slopeGeometry(roof.slopes), [roof]);
  const gableGeo = useMemo(() => gableGeometry(roof.gables, WALL_THICKNESS), [roof]);

  // Slopes and gable ends are both "the roof" — one label, two meshes, so the
  // handlers go on each rather than on a wrapping group (a group has no surface
  // to hit).
  const picks = onPick ? pickable(onPick) : {};

  return (
    <>
      <mesh geometry={slopeGeo} {...picks}>
        <meshStandardMaterial color={ROOF_COLOR} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      <mesh geometry={gableGeo} {...picks}>
        <meshStandardMaterial color={HOUSE_SIDING} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </>
  );
}