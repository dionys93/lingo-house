// src/render/scenes/ItemGallery.tsx
//
// The item sandbox: every ItemKind, laid out on a floor, named, and orbitable.
//
// This exists because the items are the only part of the app you cannot get a
// straight look at. In the house they're scattered across seven rooms behind
// walls, at whatever angle first-person walking happens to give you — so
// judging whether a new one reads correctly, or whether two woods match, meant
// walking there. Here they stand in a row at eye level and you can spin round
// them.
//
// It is built from the REAL pipeline, not a mock: kinds go in as authored
// ItemDefs, through compileGrid, and out as the same CompiledItems the house
// renders. So the sizes, the yaw and the click bounds shown here are the ones
// the house uses, and a spacing bug in the compiler shows up here too. A
// hand-placed gallery could drift from the house; this one cannot.

import { useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from '@react-three/drei';
import type { CompiledItem } from '../../core/house/compiled';
import { compileGrid } from '../../core/house/grid';
import { ITEM_SPECS } from '../../core/house/items';
import { CELL } from '../../core/house/scale';
import { defineRoom, type Grid, type ItemDef, type ItemKind } from '../../core/house/blocks';
import { LABELS } from '../../content/labels';
import { LOCALES, LOCALE_NAMES, type Locale } from '../../core/house/labels';
import { Items } from '../elements/Items';
import { FLOOR_Y } from '../elements/Floor';
import { openPartsOf, partKey } from '../../core/house/items';
import { SurfaceProvider } from '../surfaces/SurfaceProvider';
import { HouseLights } from '../stage/HouseLights';
import { ScenePost } from '../stage/ScenePost';
import { EXTERIOR_RIG } from '../../core/style/lights';

// Every kind, in the order ItemKind declares them — grouped by room, so the
// gallery reads as kitchen, bathroom, bedroom rather than alphabetical soup.
const KINDS = Object.keys(ITEM_SPECS) as readonly ItemKind[];

const COLS = 6;
// Three cells per item: one to stand in, one of air either side. Anything
// tighter and a sofa (two cells wide) touches its neighbour.
const PITCH = 3;
const ROWS = Math.ceil(KINDS.length / COLS);

const PLINTH = defineRoom({
  key: 'gallery',
  color: '#cfcac2',
  labels: {
    en: { name: 'the gallery', enter: '', up: '', down: '' },
    es: { name: 'la galería', enter: '', up: '', down: '' },
    de: { name: 'die Galerie', enter: '', up: '', down: '' },
  },
});

const cellOf = (i: number): [number, number] => [
  Math.floor(i / COLS) * PITCH + 1,
  (i % COLS) * PITCH + 1,
];

const GRID: Grid = Array.from({ length: ROWS * PITCH }, () =>
  Array.from({ length: COLS * PITCH }, () => PLINTH),
);

const DEFS: readonly ItemDef[] = KINDS.map((kind, i) => ({
  id: kind,
  kind,
  mount: { on: 'floor', cell: cellOf(i), facing: 's' },
}));

// NO recentring group, and that is worth stating because the obvious version of
// this file has one. compileGrid already centres a plan on the origin — cell
// [0][0] is not the world origin, the middle of the grid is — so the board
// arrives centred, and "helpfully" shifting it by half its width is what pushes
// it off screen. Camera and OrbitControls target the origin because that is
// where the subject already is.
//
// Distance is derived from BOTH dimensions, not just the width. Adding a kind
// eventually adds a row, and a camera framed on width alone then crops the
// front row and squashes the back one — which is exactly what happened at
// nineteen kinds. Growing with depth keeps the framing stable as the roster
// grows, and the viewer can orbit from there.
const BOARD_WIDTH = COLS * PITCH * CELL;
const BOARD_DEPTH = ROWS * PITCH * CELL;
const CAMERA: [number, number, number] = [
  0,
  BOARD_WIDTH * 0.58 + BOARD_DEPTH * 0.16,
  BOARD_WIDTH * 0.72 + BOARD_DEPTH * 0.42,
];

const bar: CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 10,
  display: 'flex',
  gap: 6,
  padding: 6,
  borderRadius: 10,
  background: 'rgba(17, 24, 39, 0.82)',
};

const chip = (active: boolean): CSSProperties => ({
  padding: '5px 11px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  font: '13px ui-sans-serif, system-ui',
  background: active ? '#e8e2d6' : 'rgba(255,255,255,0.15)',
  color: active ? '#111' : '#fff',
});

const tag: CSSProperties = {
  padding: '3px 8px',
  borderRadius: 5,
  background: 'rgba(17,24,39,0.82)',
  color: '#fff',
  font: '11px/1.35 ui-sans-serif, system-ui',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  pointerEvents: 'none',
  userSelect: 'none',
};

/**
 * Puts a DOM label over each item, every frame.
 *
 * Written by hand rather than with drei's <Html> because that mounted all
 * seventeen labels into the DOM at correct screen positions and then painted
 * only four of them — the rest ended up under the canvas and no z-index setting
 * moved them. Projecting the point ourselves is a dozen lines, has no opinion
 * about stacking, and keeps the labels in one flat overlay we control.
 *
 * Positions are written straight to the elements' style. Going through React
 * state would re-render seventeen nodes per frame while orbiting, to say the
 * same thing.
 */
function LabelProjector({
  items,
  nodes,
}: {
  items: readonly CompiledItem[];
  nodes: React.RefObject<Map<string, HTMLDivElement | null>>;
}) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const point = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    for (const item of items) {
      const el = nodes.current.get(item.id);
      if (!el) continue;
      point.set(item.position[0], item.bounds.max[1] + 0.14, item.position[2]).project(camera);
      // z > 1 means the point is behind the camera, where the projection
      // mirrors it back into frame — hide rather than draw a label upside down
      // behind you.
      el.style.opacity = point.z > 1 ? '0' : '1';
      el.style.transform =
        `translate(-50%, -100%) translate(` +
        `${String((point.x * 0.5 + 0.5) * size.width)}px, ` +
        `${String((-point.y * 0.5 + 0.5) * size.height)}px)`;
    }
  });
  return null;
}

export function ItemGallery() {
  const [locale, setLocale] = useState<Locale>('es');
  const nodes = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const compiled = useMemo(() => compileGrid(GRID, { items: DEFS }), []);

  if (!compiled.ok) return null;
  const grid = compiled.value;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Canvas shadows camera={{ position: CAMERA, fov: 42 }}>
        <HouseLights rig={EXTERIOR_RIG} />
        <SurfaceProvider>
          {/* A plain floor rather than Ground's grass: this is a studio, and
              grass under a toilet reads as a mistake rather than a backdrop. */}
          {/* At FLOOR_Y, because Items lifts by it — a studio floor at y=0
              would leave everything hovering 2 cm. */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]} receiveShadow>
            <planeGeometry args={[80, 80]} />
            <meshStandardMaterial color="#b8b2a7" roughness={1} />
          </mesh>
          <group>
            {/* Everything OPEN, because the gallery exists to show what each item
                looks like and half of a cupboard is what is inside it. */}
            <Items
              grid={grid}
              // Every PART of every item, because open state is keyed per part
              // now — a set of bare item ids opens nothing at all.
              openItems={
                new Set(
                  grid.items.flatMap((i) => openPartsOf(i.kind).map((part) => partKey(i.id, part.id))),
                )
              }
              selectedId={null}
              onSelect={() => undefined}
            />
          </group>
        </SurfaceProvider>
        <LabelProjector items={grid.items} nodes={nodes} />
        <ScenePost ao={EXTERIOR_RIG.ao} />
        {/* Orbit, not walk: the whole point is getting round the far side of a
            thing, which walking at eye height is bad at. */}
        <OrbitControls
          target={[0, 0.3, 0]}
          maxPolarAngle={Math.PI / 2.05}
          minDistance={0.8}
          maxDistance={16}
        />
      </Canvas>
      {/* One flat overlay for every label, positioned by LabelProjector. */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
        {grid.items.map((item) => (
          <div
            key={item.id}
            ref={(el) => {
              nodes.current.set(item.id, el);
            }}
            style={{ ...tag, position: 'absolute', top: 0, left: 0, opacity: 0 }}
          >
            {LABELS[locale].nouns[item.kind]}
            <div style={{ opacity: 0.6, font: '10px ui-monospace, monospace' }}>{item.kind}</div>
          </div>
        ))}
      </div>
      <div style={bar}>
        {LOCALES.map((l) => (
          <button key={l} type="button" style={chip(l === locale)} onClick={() => { setLocale(l); }}>
            {LOCALE_NAMES[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
