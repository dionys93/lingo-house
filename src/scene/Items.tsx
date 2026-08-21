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
import { ITEM_SPECS } from '../core/grid';
import type { ItemKind } from '../core/blocks';
import { IGNORED, SOLID } from './shadows';

const TABLE_TOP = '#8a6a4f'; // walnut
const TABLE_LEG = '#6f523c';

function Table(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.table;
  const topT = 0.035; // slab thickness
  const legS = 0.035; // square leg side
  const inset = 0.03; // legs in from the edges
  const legH = h - topT;
  const lx = w / 2 - inset - legS / 2;
  const lz = d / 2 - inset - legS / 2;
  const legAt = ([sx, sz]: readonly [number, number]): JSX.Element => (
    <mesh key={`${sx},${sz}`} position={[sx * lx, legH / 2, sz * lz]} {...SOLID}>
      <boxGeometry args={[legS, legH, legS]} />
      <meshStandardMaterial color={TABLE_LEG} roughness={0.85} />
    </mesh>
  );
  const corners: readonly (readonly [number, number])[] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return (
    <>
      <mesh position={[0, h - topT / 2, 0]} {...SOLID}>
        <boxGeometry args={[w, topT, d]} />
        <meshStandardMaterial color={TABLE_TOP} roughness={0.7} />
      </mesh>
      {corners.map(legAt)}
    </>
  );
}

const LAPTOP_BODY = '#b8bcc2';
const LAPTOP_SCREEN = '#2b3238';
const LAPTOP_KEYS = '#8f959c';

// Open laptop: a base with a darker key area, and a lid tilted back past
// vertical. Local "front" is +Z, so the screen faces the same way the item does.
function Laptop(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.laptop;
  const baseT = 0.012;
  const lidT = 0.008;
  const lidTilt = -0.28; // radians past upright, leaning away from the viewer
  return (
    <>
      <mesh position={[0, baseT / 2, 0]} {...SOLID}>
        <boxGeometry args={[w, baseT, d]} />
        <meshStandardMaterial color={LAPTOP_BODY} roughness={0.5} metalness={0.25} />
      </mesh>
      <mesh position={[0, baseT + 0.001, 0.008]} {...SOLID}>
        <boxGeometry args={[w * 0.82, 0.002, d * 0.62]} />
        <meshStandardMaterial color={LAPTOP_KEYS} roughness={0.8} />
      </mesh>
      {/* Hinged at the back edge: the group pivots, the lid hangs off it. */}
      <group position={[0, baseT, -d / 2]} rotation={[lidTilt, 0, 0]}>
        <mesh position={[0, (h - baseT) / 2, lidT / 2]} {...SOLID}>
          <boxGeometry args={[w, h - baseT, lidT]} />
          <meshStandardMaterial color={LAPTOP_BODY} roughness={0.5} metalness={0.25} />
        </mesh>
        <mesh position={[0, (h - baseT) / 2, lidT]} {...SOLID}>
          <boxGeometry args={[w * 0.88, (h - baseT) * 0.84, 0.001]} />
          <meshStandardMaterial
            color={LAPTOP_SCREEN}
            roughness={0.25}
            emissive={LAPTOP_SCREEN}
            emissiveIntensity={0.35}
          />
        </mesh>
      </group>
    </>
  );
}

const TV_BEZEL = '#1a1c1f';
const TV_SCREEN = '#10161c';

// Wall TV: a thin bezel with an inset screen on its +Z face. The compiler has
// already put it against the wall facing the room, so this just builds it
// flat — no wall logic in here.
function Tv(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.tv;
  return (
    <>
      <mesh position={[0, h / 2, 0]} {...SOLID}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={TV_BEZEL} roughness={0.45} />
      </mesh>
      <mesh position={[0, h / 2, d / 2 + 0.001]} {...SOLID}>
        <boxGeometry args={[w * 0.93, h * 0.88, 0.002]} />
        <meshStandardMaterial
          color={TV_SCREEN}
          roughness={0.18}
          emissive={TV_SCREEN}
          emissiveIntensity={0.5}
        />
      </mesh>
    </>
  );
}

// kind → local-space mesh builder. Record over the closed union = exhaustive:
// add a kind and this line stops compiling until it has a factory.
const factories: Record<ItemKind, () => JSX.Element> = {
  table: Table,
  laptop: Laptop,
  tv: Tv,
};

// The click target is a single invisible box over the item's compiled bounds,
// NOT the item's own meshes. A table is mostly gaps — thin legs and air — so
// aiming at the real geometry means missed clicks between the legs. One forgiving
// box also keeps hit-testing stable when a factory's geometry changes, and it's
// the reason `bounds` is yaw-aware in the core: the proxy sits in WORLD space, a
// sibling of the rotated group, so it can't inherit the yaw twice.
function ClickProxy({
  item,
  selected,
  onSelect,
}: {
  item: CompiledItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { min, max } = item.bounds;
  const centre: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const size: [number, number, number] = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  return (
    <mesh
      {...IGNORED}
      position={centre}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = 'auto';
      }}
    >
      <boxGeometry args={size} />
      {/* Invisible but still raycast (opacity 0, not `visible={false}`). When the
          item is open it warms up just enough to show what you're reading. */}
      <meshBasicMaterial
        transparent
        opacity={selected ? 0.14 : 0}
        depthWrite={false}
        color="#ffb545"
      />
    </mesh>
  );
}

function Item({
  item,
  selected,
  onSelect,
}: {
  item: CompiledItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const Build = factories[item.kind];
  return (
    <>
      <group position={[...item.position]} rotation={[0, item.yaw, 0]}>
        <Build />
      </group>
      <ClickProxy item={item} selected={selected} onSelect={onSelect} />
    </>
  );
}

export function Items({
  grid,
  selectedId,
  onSelect,
}: {
  grid: CompiledGrid;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {grid.items.map((item) => (
        <Item
          key={item.id}
          item={item}
          selected={item.id === selectedId}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </>
  );
}