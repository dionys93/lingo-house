// src/scene/Roof.tsx
//
// Renders the compiled gable roof: the sloped panels in the roof colour, and the
// triangular gable ends in the house siding (they're really the top of the end
// walls, so they match the walls, not the roof). Shape comes entirely from the
// pure roof core; the shell only builds geometry and picks materials. DoubleSide
// so the underside is visible from inside a room.

import { useMemo } from 'react';
import * as THREE from 'three';
import type { CompiledGrid } from '../core/grid';
import type { MeshData } from '../core/roof';
import { HOUSE_SIDING } from './wallMaterials';

const ROOF_COLOR = '#a86b4c'; // terracotta

function buildGeometry(data: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.positions.flat()), 3));
  g.setIndex([...data.indices]);
  g.computeVertexNormals();
  return g;
}

export function Roof({ grid }: { grid: CompiledGrid }) {
  const slopeGeo = useMemo(() => buildGeometry(grid.roof.slopes), [grid.roof]);
  const gableGeo = useMemo(() => buildGeometry(grid.roof.gables), [grid.roof]);

  return (
    <>
      <mesh geometry={slopeGeo}>
        <meshStandardMaterial color={ROOF_COLOR} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      <mesh geometry={gableGeo}>
        <meshStandardMaterial color={HOUSE_SIDING} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </>
  );
}