// src/scene/Items.tsx
//
// The item factory — consumes compiled items and does nothing but build meshes.
// One factory per ItemKind, composed from primitives (react-planner's catalog is
// the proportion reference; we deliberately take the idea, not the dependency —
// its 3D layer is raw imperative three.js meshes plus Redux/Immutable, none of
// which belongs here). Each factory builds in LOCAL space: origin at the floor
// centre, "front" facing +Z; the group applies the compiled position and yaw, so
// facing/offset logic lives in the core, never re-derived here.
//
// The factory record is keyed by ItemKind (a closed union), so adding a kind
// won't compile until it has a factory — the same exhaustiveness discipline as
// the error switch.

import type { JSX } from 'react';
import type { CompiledGrid, CompiledItem } from '../core/grid';
import { ITEM_DIMENSIONS } from '../core/grid';
import type { ItemKind } from '../core/blocks';

const TABLE_TOP = '#8a6a4f'; // walnut
const TABLE_LEG = '#6f523c';

function Table(): JSX.Element {
  const { w, d, h } = ITEM_DIMENSIONS.table;
  const topT = 0.035; // slab thickness
  const legS = 0.035; // square leg side
  const inset = 0.03; // legs in from the edges
  const legH = h - topT;
  const lx = w / 2 - inset - legS / 2;
  const lz = d / 2 - inset - legS / 2;
  const legAt = ([sx, sz]: readonly [number, number]): JSX.Element => (
    <mesh key={`${sx},${sz}`} position={[sx * lx, legH / 2, sz * lz]}>
      <boxGeometry args={[legS, legH, legS]} />
      <meshStandardMaterial color={TABLE_LEG} roughness={0.85} />
    </mesh>
  );
  const corners: readonly (readonly [number, number])[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return (
    <>
      <mesh position={[0, h - topT / 2, 0]}>
        <boxGeometry args={[w, topT, d]} />
        <meshStandardMaterial color={TABLE_TOP} roughness={0.7} />
      </mesh>
      {corners.map(legAt)}
    </>
  );
}

// kind → local-space mesh builder. Record over the closed union = exhaustive.
const factories: Record<ItemKind, () => JSX.Element> = {
  table: Table,
};

function Item({ item }: { item: CompiledItem }) {
  const Build = factories[item.kind];
  return (
    <group position={[...item.position]} rotation={[0, item.yaw, 0]}>
      <Build />
    </group>
  );
}

export function Items({ grid }: { grid: CompiledGrid }) {
  return (
    <>
      {grid.items.map((item) => (
        <Item key={item.id} item={item} />
      ))}
    </>
  );
}