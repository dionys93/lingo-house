// src/render/elements/Items.tsx
//
// The item factory — consumes compiled items and does nothing but build meshes.
// One factory per ItemKind, composed from primitives. Each factory builds in
// LOCAL space: origin at the floor centre, "front" facing +Z; the group applies
// the compiled position and yaw, so facing/offset logic lives in the core and is
// never re-derived here.
//
// The factory record is keyed by ItemKind (a closed union), so adding a kind
// won't compile until it has a factory — the same exhaustiveness discipline as
// the error switch.
//
// ── WHAT MAKES THESE READ AS OBJECTS ────────────────────────────────────────
//
// Every factory reads its footprint from ITEM_SPECS rather than hard-coding a
// size, so the core's dimensions and the mesh can never disagree — resize a kind
// in one place and its model follows. Beyond that, three habits do most of the
// work of looking real at close range, which is where this camera lives:
//
//   SILHOUETTE FIRST. A single box reads as a box at any distance. Legs that
//   taper, a plinth recessed under a cabinet, a worktop that overhangs, arms
//   narrower than the sofa body — the outline is what the eye resolves before
//   any material does.
//
//   HOLLOW THINGS MUST BE HOLLOW. A bath, a shower and a bookshelf are built
//   from walls around a void, not from a solid block with a darker face painted
//   on. At this scale the AO radius (0.15) is tuned to exactly these crevices,
//   so a real cavity shades itself for free.
//
//   MATERIALS CARRY THE MEANING. Ceramic is smooth and bright, fabric is fully
//   rough, chrome is `metalness` near 1 with `roughness` near 0. One colour at
//   one roughness across a whole object is the flat-fill look this replaces.
//
// TRANSPARENCY AND SHADOWS: glass takes IGNORED, never SOLID. three's depth
// material ignores opacity, so a shower screen at 0.22 would cast a solid black
// slab — the same trap `shadows.ts` documents for window glass.

import type { JSX } from 'react';
import type { CompiledGrid, CompiledItem } from '../../core/house/grid';
import { ITEM_SPECS } from '../../core/house/grid';
import type { ItemKind } from '../../core/house/blocks';
import { CATCHES, IGNORED, SOLID } from '../../core/style/shadows';
import { FLOOR_Y } from './Floor';

type V3 = [number, number, number];

// ── Primitives ──────────────────────────────────────────────────────────────
// Two helpers cover nearly everything. They exist so a factory reads as a parts
// list — position, size, material — instead of ten lines of JSX per part.

interface PartProps {
  readonly at: V3;
  readonly size: V3;
  readonly color: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly rotation?: V3;
}

function Slab({ at, size, color, roughness = 0.8, metalness = 0, rotation }: PartProps): JSX.Element {
  return (
    <mesh position={at} rotation={rotation ?? [0, 0, 0]} {...SOLID}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

interface TubeProps {
  readonly at: V3;
  readonly rTop: number;
  readonly rBottom: number;
  readonly height: number;
  readonly color: string;
  readonly roughness?: number;
  readonly metalness?: number;
  readonly segments?: number;
  readonly rotation?: V3;
}

function Tube({
  at,
  rTop,
  rBottom,
  height,
  color,
  roughness = 0.8,
  metalness = 0,
  segments = 16,
  rotation,
}: TubeProps): JSX.Element {
  return (
    <mesh position={at} rotation={rotation ?? [0, 0, 0]} {...SOLID}>
      <cylinderGeometry args={[rTop, rBottom, height, segments]} />
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

// A tapered square leg: a 4-sided cylinder turned 45° so its flats face the
// axes. Taper is what separates furniture from scaffolding — a leg the same
// width top and bottom reads as pipe.
function Leg({
  at,
  top,
  bottom,
  height,
  color,
}: {
  readonly at: V3;
  readonly top: number;
  readonly bottom: number;
  readonly height: number;
  readonly color: string;
}): JSX.Element {
  // Side s of an inscribed square ⇒ circumradius s / √2.
  const r = (s: number) => s / Math.SQRT2;
  return (
    <Tube
      at={at}
      rTop={r(top)}
      rBottom={r(bottom)}
      height={height}
      color={color}
      roughness={0.85}
      segments={4}
      rotation={[0, Math.PI / 4, 0]}
    />
  );
}

// The four corners of a footprint, as signs. Used by everything with legs.
const CORNERS: readonly V3[] = [
  [-1, 0, -1],
  [-1, 0, 1],
  [1, 0, -1],
  [1, 0, 1],
];

// ── Palette ─────────────────────────────────────────────────────────────────
// Named once and shared, so a walnut table and a walnut nightstand are the same
// walnut. Ad-hoc hex per factory is how a room ends up with four browns.

const WALNUT = '#7d5c44';
const WALNUT_DARK = '#63472f';
const OAK = '#b08e68';
const CERAMIC = '#f1f0ea'; // sanitaryware white — never pure #fff, which blows out under the sun
const CHROME = '#c4c9ce';
const GLASS = '#cfe0e6';
const SCREEN_OFF = '#12171c';

// ── Living / general ────────────────────────────────────────────────────────

function Table(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.table;
  const topT = 0.026; // 52 mm slab
  const apronT = 0.022;
  const inset = 0.032;
  const legTop = 0.03;
  const legBottom = 0.022;
  const legH = h - topT;
  const lx = w / 2 - inset;
  const lz = d / 2 - inset;
  return (
    <>
      <Slab at={[0, h - topT / 2, 0]} size={[w, topT, d]} color={WALNUT} roughness={0.55} />
      {/* Apron: the rail that closes the gap between top and legs. Without it a
          table is four sticks under a plank and reads as a trestle. */}
      <Slab
        at={[0, h - topT - apronT / 2, -lz + 0.012]}
        size={[w - inset * 2, apronT, 0.016]}
        color={WALNUT_DARK}
      />
      <Slab
        at={[0, h - topT - apronT / 2, lz - 0.012]}
        size={[w - inset * 2, apronT, 0.016]}
        color={WALNUT_DARK}
      />
      {CORNERS.map(([sx, , sz]) => (
        <Leg
          key={`${String(sx)},${String(sz)}`}
          at={[sx * lx, legH / 2, sz * lz]}
          top={legTop}
          bottom={legBottom}
          height={legH}
          color={WALNUT_DARK}
        />
      ))}
    </>
  );
}

const CHAIR_SEAT = '#8d6f52';

function Chair(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.chair;
  const seatY = 0.225; // 450 mm
  const seatT = 0.02;
  const legS = 0.018;
  const inset = 0.022;
  const lx = w / 2 - inset;
  const lz = d / 2 - inset;
  const backH = h - seatY;
  return (
    <>
      {CORNERS.map(([sx, , sz]) => (
        <Leg
          key={`${String(sx)},${String(sz)}`}
          at={[sx * lx, (seatY - seatT) / 2, sz * lz]}
          top={legS}
          bottom={legS * 0.8}
          height={seatY - seatT}
          color={WALNUT_DARK}
        />
      ))}
      <Slab at={[0, seatY - seatT / 2, 0]} size={[w, seatT, d]} color={CHAIR_SEAT} roughness={0.7} />
      {/* Back: two stiles and two slats, leaning back slightly. A solid panel
          would read as a throne; the gaps are most of what says "chair". */}
      <group position={[0, seatY, -lz]} rotation={[0.08, 0, 0]}>
        {[-1, 1].map((s) => (
          <Slab
            key={s}
            at={[s * lx, backH / 2, 0]}
            size={[legS, backH, legS]}
            color={WALNUT_DARK}
          />
        ))}
        {[0.55, 0.85].map((f) => (
          <Slab
            key={f}
            at={[0, backH * f, 0]}
            size={[w - legS * 2, backH * 0.16, legS * 0.7]}
            color={CHAIR_SEAT}
            roughness={0.7}
          />
        ))}
      </group>
    </>
  );
}

const SOFA_BODY = '#6f7d8c';
const SOFA_CUSHION = '#7d8b9a';

function Sofa(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.sofa;
  const footH = 0.035;
  const frameTop = 0.155;
  const seatTop = 0.21; // 420 mm — seat height
  const armTop = 0.3;
  const armW = 0.075;
  const backT = 0.085;
  const innerW = w - armW * 2;
  const seatD = d - backT;
  return (
    <>
      {/* Feet, so light gets under it. A sofa sitting flush on the floor is the
          commonest giveaway of a box with cushions on it. */}
      {CORNERS.map(([sx, , sz]) => (
        <Tube
          key={`${String(sx)},${String(sz)}`}
          at={[sx * (w / 2 - 0.05), footH / 2, sz * (d / 2 - 0.05)]}
          rTop={0.012}
          rBottom={0.009}
          height={footH}
          color={WALNUT_DARK}
        />
      ))}
      {/* Frame under the seat */}
      <Slab
        at={[0, (footH + frameTop) / 2, 0]}
        size={[w, frameTop - footH, d]}
        color={SOFA_BODY}
        roughness={1}
      />
      {/* Arms, running the full depth and standing proud of the seat. */}
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          at={[s * (w / 2 - armW / 2), (footH + armTop) / 2, 0]}
          size={[armW, armTop - footH, d]}
          color={SOFA_BODY}
          roughness={1}
        />
      ))}
      {/* Back, carried all the way UP to h. This used to stop short at 0.36 and
          the back cushions floated in the gap above it. */}
      <Slab
        at={[0, (frameTop + h) / 2, -d / 2 + backT / 2]}
        size={[innerW, h - frameTop, backT]}
        color={SOFA_BODY}
        roughness={1}
      />
      {/* Seat cushions — two, with a visible seam. One slab is a bench. */}
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          at={[s * innerW * 0.25, (frameTop + seatTop) / 2, backT / 2]}
          size={[innerW * 0.48, seatTop - frameTop, seatD - 0.02]}
          color={SOFA_CUSHION}
          roughness={1}
        />
      ))}
      {/* Back cushions RESTING ON THE SEAT and leaning against the back, rather
          than hovering in front of it. */}
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          at={[s * innerW * 0.25, seatTop + 0.085, -d / 2 + backT + 0.038]}
          size={[innerW * 0.47, 0.17, 0.07]}
          color={SOFA_CUSHION}
          roughness={1}
          rotation={[0.1, 0, 0]}
        />
      ))}
    </>
  );
}

const RUG_FIELD = '#9c6152';
const RUG_BORDER = '#7a463b';

// Flat enough that it only ever RECEIVES shadow — a 12 mm mat casting its own is
// pure acne. Lifted a hair off the floor tile so the two don't z-fight.
function Rug(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.rug;
  const border = 0.06;
  return (
    <>
      <mesh position={[0, h / 2, 0]} {...CATCHES}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={RUG_BORDER} roughness={1} />
      </mesh>
      <mesh position={[0, h + 0.0005, 0]} {...CATCHES}>
        <boxGeometry args={[w - border * 2, 0.001, d - border * 2]} />
        <meshStandardMaterial color={RUG_FIELD} roughness={1} />
      </mesh>
    </>
  );
}

// Deterministic, NOT Math.random: this is render code, and a re-render that
// reshuffles the books is the flicker the seeded-PRNG rule exists to prevent.
// A literal table is the simplest seed there is.
const BOOKS: readonly (readonly [width: number, height: number, color: string])[] = [
  [0.022, 0.115, '#8c3f3a'],
  [0.016, 0.1, '#3f5d76'],
  [0.028, 0.125, '#6d7a45'],
  [0.014, 0.095, '#8a6b3a'],
  [0.024, 0.12, '#4a4560'],
  [0.018, 0.105, '#a05a3c'],
  [0.02, 0.09, '#3d6b62'],
  [0.026, 0.118, '#6a3f52'],
];

interface PlacedBook {
  readonly x: number;
  readonly w: number;
  readonly h: number;
  readonly color: string;
}

// Lay books left to right along one shelf until the width runs out. Pure: the
// same row index always yields the same row of books, so nothing shifts between
// renders. The phase shift per row is what stops four identical shelves.
function booksOn(row: number, innerW: number): readonly PlacedBook[] {
  const out: PlacedBook[] = [];
  const limit = innerW / 2 - 0.012;
  let x = -innerW / 2 + 0.012;
  for (let i = 0; i < BOOKS.length; i++) {
    const [w, h, color] = BOOKS[(i + row * 3) % BOOKS.length];
    if (x + w > limit) break;
    out.push({ x: x + w / 2, w, h, color });
    x += w + 0.003;
  }
  return out;
}

function Bookshelf(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.bookshelf;
  const sideT = 0.018;
  const shelfT = 0.014;
  const backT = 0.008;
  const shelves = 4; // gaps between them
  const innerW = w - sideT * 2;
  const gap = (h - shelfT) / shelves;
  return (
    <>
      {[-1, 1].map((s) => (
        <Slab key={s} at={[s * (w / 2 - sideT / 2), h / 2, 0]} size={[sideT, h, d]} color={WALNUT} />
      ))}
      <Slab at={[0, h / 2, -d / 2 + backT / 2]} size={[innerW, h, backT]} color={WALNUT_DARK} />
      {Array.from({ length: shelves + 1 }, (_, i) => (
        <Slab
          key={i}
          at={[0, i * gap + shelfT / 2, 0]}
          size={[innerW, shelfT, d - backT]}
          color={WALNUT}
        />
      ))}
      {/* Books: what say "someone lives here". The shelf alone says "shelf". */}
      {Array.from({ length: shelves }, (_, row) =>
        booksOn(row, innerW).map((b, i) => (
          <Slab
            key={`${String(row)}-${String(i)}`}
            at={[b.x, row * gap + shelfT + b.h / 2, 0.006]}
            size={[b.w, b.h, d - backT - 0.02]}
            color={b.color}
            roughness={0.9}
          />
        )),
      )}
    </>
  );
}

// ── Electronics ─────────────────────────────────────────────────────────────

const LAPTOP_SHELL = '#aeb3b9';
const LAPTOP_DARK = '#33383d';

function Laptop(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.laptop;
  const baseT = 0.009;
  const lidT = 0.005;
  const lidTilt = -0.3;
  const lidH = h - baseT;
  return (
    <>
      <Slab
        at={[0, baseT / 2, 0]}
        size={[w, baseT, d]}
        color={LAPTOP_SHELL}
        roughness={0.4}
        metalness={0.45}
      />
      {/* Keyboard well, then the keys as one dark inset, then the trackpad. */}
      <Slab
        at={[0, baseT + 0.0005, -0.004]}
        size={[w * 0.84, 0.001, d * 0.5]}
        color={LAPTOP_DARK}
        roughness={0.9}
      />
      <Slab
        at={[0, baseT + 0.0005, d * 0.3]}
        size={[w * 0.34, 0.001, d * 0.26]}
        color="#9aa0a6"
        roughness={0.35}
      />
      <group position={[0, baseT, -d / 2 + lidT]} rotation={[lidTilt, 0, 0]}>
        <Slab
          at={[0, lidH / 2, -lidT / 2]}
          size={[w, lidH, lidT]}
          color={LAPTOP_SHELL}
          roughness={0.4}
          metalness={0.45}
        />
        {/* Bezel, then the lit panel inside it. */}
        <Slab at={[0, lidH / 2, 0.0005]} size={[w * 0.94, lidH * 0.93, 0.001]} color="#1b1f23" />
        <mesh position={[0, lidH / 2 + 0.002, 0.0015]} {...SOLID}>
          <boxGeometry args={[w * 0.88, lidH * 0.82, 0.001]} />
          <meshStandardMaterial
            color="#8fa6bb"
            roughness={0.18}
            emissive="#7d97ae"
            emissiveIntensity={0.55}
          />
        </mesh>
      </group>
    </>
  );
}

const TV_FRAME = '#17191c';

function Tv(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.tv;
  const bezel = 0.006; // 12 mm — a modern set is nearly all screen
  return (
    <>
      {/* The panel itself is the thin part; the electronics box behind it is
          what actually has depth. Modelling both is why it reads as a TV rather
          than a black rectangle. */}
      <Slab at={[0, h / 2, 0]} size={[w, h, d * 0.45]} color={TV_FRAME} roughness={0.4} />
      <Slab
        at={[0, h / 2, -d * 0.4]}
        size={[w * 0.55, h * 0.55, d * 0.55]}
        color="#25282c"
        roughness={0.7}
      />
      <mesh position={[0, h / 2, d * 0.23 + 0.001]} {...SOLID}>
        <boxGeometry args={[w - bezel * 2, h - bezel * 2, 0.002]} />
        <meshStandardMaterial
          color="#1b2733"
          roughness={0.12}
          emissive={SCREEN_OFF}
          emissiveIntensity={0.45}
        />
      </mesh>
    </>
  );
}

// ── Kitchen ─────────────────────────────────────────────────────────────────

const CABINET = '#e4e0d8';
const CABINET_LINE = '#cbc6bc';
const WORKTOP = '#4b4d52';
const STEEL = '#c2c7cc';

// Shared by counter and oven: the recessed toe-kick every fitted unit stands on.
const PLINTH_H = 0.05;
const PLINTH_INSET = 0.03;

function Counter(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.counter;
  const topT = 0.02;
  const bodyH = h - topT - PLINTH_H;
  return (
    <>
      <Slab
        at={[0, PLINTH_H / 2, -PLINTH_INSET / 2]}
        size={[w - 0.02, PLINTH_H, d - PLINTH_INSET]}
        color="#3f4145"
      />
      <Slab at={[0, PLINTH_H + bodyH / 2, 0]} size={[w, bodyH, d]} color={CABINET} roughness={0.6} />
      {/* Two doors and the seam between them. */}
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          at={[s * w * 0.24, PLINTH_H + bodyH / 2, d / 2 + 0.002]}
          size={[w * 0.46, bodyH * 0.92, 0.004]}
          color={CABINET_LINE}
          roughness={0.6}
        />
      ))}
      {/* Bar handles, horizontal, near the top of each door. */}
      {[-1, 1].map((s) => (
        <Tube
          key={s}
          at={[s * w * 0.24, PLINTH_H + bodyH * 0.86, d / 2 + 0.012]}
          rTop={0.005}
          rBottom={0.005}
          height={w * 0.28}
          color={STEEL}
          roughness={0.25}
          metalness={0.85}
          rotation={[0, 0, Math.PI / 2]}
        />
      ))}
      {/* Worktop, overhanging the front — the overhang is the whole silhouette. */}
      <Slab
        at={[0, h - topT / 2, 0.008]}
        size={[w + 0.008, topT, d + 0.016]}
        color={WORKTOP}
        roughness={0.35}
      />
    </>
  );
}

function Oven(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.oven;
  const topT = 0.014;
  const bodyH = h - topT - PLINTH_H;
  return (
    <>
      <Slab
        at={[0, PLINTH_H / 2, -PLINTH_INSET / 2]}
        size={[w - 0.02, PLINTH_H, d - PLINTH_INSET]}
        color="#3f4145"
      />
      <Slab
        at={[0, PLINTH_H + bodyH / 2, 0]}
        size={[w, bodyH, d]}
        color={STEEL}
        roughness={0.35}
        metalness={0.55}
      />
      {/* Oven door: a dark glass panel, inset, with a bar handle over it. */}
      <Slab
        at={[0, PLINTH_H + bodyH * 0.42, d / 2 + 0.003]}
        size={[w * 0.84, bodyH * 0.58, 0.005]}
        color="#1f2225"
        roughness={0.15}
      />
      <Tube
        at={[0, PLINTH_H + bodyH * 0.78, d / 2 + 0.016]}
        rTop={0.007}
        rBottom={0.007}
        height={w * 0.82}
        color={STEEL}
        roughness={0.2}
        metalness={0.9}
        rotation={[0, 0, Math.PI / 2]}
      />
      {/* Control knobs. Four small cylinders are worth more than any texture. */}
      {[-1.5, -0.5, 0.5, 1.5].map((s) => (
        <Tube
          key={s}
          at={[s * w * 0.16, PLINTH_H + bodyH * 0.92, d / 2 + 0.008]}
          rTop={0.011}
          rBottom={0.011}
          height={0.012}
          color="#4a4d51"
          roughness={0.4}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ))}
      {/* Hob: a dark glass top with four burner rings. */}
      <Slab at={[0, h - topT / 2, 0]} size={[w, topT, d]} color="#1e2124" roughness={0.2} />
      {CORNERS.map(([sx, , sz]) => (
        <Tube
          key={`${String(sx)},${String(sz)}`}
          at={[sx * w * 0.21, h + 0.001, sz * d * 0.21]}
          rTop={0.035}
          rBottom={0.035}
          height={0.002}
          color="#33383c"
          roughness={0.5}
        />
      ))}
    </>
  );
}

function Fridge(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.fridge;
  const freezerH = h * 0.34; // freezer on top
  const gap = 0.006;
  return (
    <>
      <Slab
        at={[0, h / 2, 0]}
        size={[w, h, d]}
        color="#b9bfc4"
        roughness={0.45}
        metalness={0.5}
      />
      {/* Two doors as proud panels, with a real gap between them. */}
      <Slab
        at={[0, h - freezerH / 2 - gap / 2, d / 2 + 0.004]}
        size={[w - 0.01, freezerH - gap, 0.008]}
        color="#ced4d9"
        roughness={0.3}
        metalness={0.6}
      />
      <Slab
        at={[0, (h - freezerH - gap) / 2, d / 2 + 0.004]}
        size={[w - 0.01, h - freezerH - gap, 0.008]}
        color="#ced4d9"
        roughness={0.3}
        metalness={0.6}
      />
      {/* Vertical bar handles, both hinged on the same side like a real one. */}
      {([
        [h - freezerH * 0.5, freezerH * 0.5],
        [(h - freezerH) * 0.55, (h - freezerH) * 0.5],
      ] as const).map(([y, len]) => (
        <Tube
          key={y}
          at={[w * 0.32, y, d / 2 + 0.018]}
          rTop={0.006}
          rBottom={0.006}
          height={len}
          color={STEEL}
          roughness={0.2}
          metalness={0.9}
        />
      ))}
    </>
  );
}

// ── Bathroom ────────────────────────────────────────────────────────────────

function Toilet(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.toilet;
  const cisternD = d * 0.28;
  const cisternH = h * 0.55;
  const bowlTop = h * 0.42; // 330 mm — seat height
  const bowlR = w / 2;
  return (
    <>
      {/* Cistern at the back, standing on the floor. */}
      <Slab
        at={[0, cisternH / 2, -d / 2 + cisternD / 2]}
        size={[w, cisternH, cisternD]}
        color={CERAMIC}
        roughness={0.25}
      />
      <Slab
        at={[0, cisternH, -d / 2 + cisternD / 2]}
        size={[w + 0.008, 0.012, cisternD + 0.008]}
        color={CERAMIC}
        roughness={0.25}
      />
      {/* Flush plate */}
      <Slab
        at={[0, cisternH * 0.78, -d / 2 + cisternD + 0.002]}
        size={[w * 0.3, 0.018, 0.004]}
        color={CHROME}
        roughness={0.15}
        metalness={0.9}
      />
      {/* Pedestal — narrower at the floor, which is what makes it a toilet and
          not a bucket. */}
      <Tube
        at={[0, bowlTop * 0.42, 0.01]}
        rTop={bowlR * 0.72}
        rBottom={bowlR * 0.5}
        height={bowlTop * 0.84}
        color={CERAMIC}
        roughness={0.25}
      />
      {/* Bowl */}
      <Tube
        at={[0, bowlTop - 0.02, 0.02]}
        rTop={bowlR}
        rBottom={bowlR * 0.78}
        height={0.06}
        color={CERAMIC}
        roughness={0.25}
      />
      {/* Seat ring: a flattened torus, which is exactly the shape and costs one
          mesh. */}
      <mesh position={[0, bowlTop + 0.012, 0.02]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.45]} {...SOLID}>
        <torusGeometry args={[bowlR * 0.8, bowlR * 0.22, 8, 20]} />
        <meshStandardMaterial color="#fbfaf6" roughness={0.3} />
      </mesh>
      {/* Lid, up against the cistern */}
      <Slab
        at={[0, cisternH * 0.62, -d / 2 + cisternD + 0.012]}
        size={[w * 0.9, bowlR * 1.5, 0.012]}
        color="#fbfaf6"
        roughness={0.3}
      />
    </>
  );
}

function Bathtub(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.bathtub;
  const wall = 0.022;
  const floorT = 0.02;
  const innerW = w - wall * 2;
  const innerD = d - wall * 2;
  return (
    <>
      {/* Four rims and a base around a real void. A solid box with a painted
          top is the version that never reads as a bath. */}
      <Slab at={[0, floorT / 2, 0]} size={[w, floorT, d]} color={CERAMIC} roughness={0.2} />
      {[-1, 1].map((s) => (
        <Slab
          key={`x${String(s)}`}
          at={[s * (w / 2 - wall / 2), h / 2, 0]}
          size={[wall, h, d]}
          color={CERAMIC}
          roughness={0.2}
        />
      ))}
      {[-1, 1].map((s) => (
        <Slab
          key={`z${String(s)}`}
          at={[0, h / 2, s * (d / 2 - wall / 2)]}
          size={[innerW, h, wall]}
          color={CERAMIC}
          roughness={0.2}
        />
      ))}
      {/* A shallow pool of water: it catches the environment map and instantly
          says "this is a vessel". */}
      <mesh position={[0, floorT + 0.02, 0]} {...IGNORED}>
        <boxGeometry args={[innerW - 0.004, 0.002, innerD - 0.004]} />
        <meshStandardMaterial
          color="#bcd8e2"
          roughness={0.05}
          metalness={0.25}
          transparent
          opacity={0.55}
        />
      </mesh>
      {/* Mixer tap at one end. */}
      <Tube
        at={[-w / 2 + 0.05, h + 0.022, 0]}
        rTop={0.008}
        rBottom={0.009}
        height={0.045}
        color={CHROME}
        roughness={0.12}
        metalness={0.95}
      />
      <Tube
        at={[-w / 2 + 0.082, h + 0.04, 0]}
        rTop={0.006}
        rBottom={0.006}
        height={0.062}
        color={CHROME}
        roughness={0.12}
        metalness={0.95}
        rotation={[0, 0, Math.PI / 2]}
      />
    </>
  );
}

function Shower(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.shower;
  const trayH = 0.045;
  const frame = 0.012;
  return (
    <>
      <Slab at={[0, trayH / 2, 0]} size={[w, trayH, d]} color={CERAMIC} roughness={0.25} />
      {/* Back and left walls are solid panels; front and right are glass, so
          you can see in. */}
      <Slab
        at={[0, h / 2, -d / 2 + 0.006]}
        size={[w, h - trayH, 0.012]}
        color="#dfe3e2"
        roughness={0.35}
      />
      <Slab
        at={[-w / 2 + 0.006, h / 2, 0]}
        size={[0.012, h - trayH, d]}
        color="#dfe3e2"
        roughness={0.35}
      />
      {/* Glass takes IGNORED: at opacity 0.22 a SOLID role would cast a black
          box, the exact trap shadows.ts documents for window panes. */}
      {[
        { at: [0, trayH + (h - trayH) / 2, d / 2 - 0.006] as V3, size: [w, h - trayH, 0.008] as V3 },
        {
          at: [w / 2 - 0.006, trayH + (h - trayH) / 2, 0] as V3,
          size: [0.008, h - trayH, d] as V3,
        },
      ].map(({ at, size }, i) => (
        <mesh key={i} position={at} {...IGNORED}>
          <boxGeometry args={size} />
          <meshStandardMaterial
            color={GLASS}
            roughness={0.05}
            metalness={0.1}
            transparent
            opacity={0.22}
          />
        </mesh>
      ))}
      {/* Chrome frame on the two open corners — the edge that makes glass legible. */}
      <Tube
        at={[w / 2 - 0.006, trayH + (h - trayH) / 2, d / 2 - 0.006]}
        rTop={frame / 2}
        rBottom={frame / 2}
        height={h - trayH}
        color={CHROME}
        roughness={0.15}
        metalness={0.9}
      />
      {/* Riser rail and head on the back wall. */}
      <Tube
        at={[0, h * 0.62, -d / 2 + 0.022]}
        rTop={0.007}
        rBottom={0.007}
        height={h * 0.42}
        color={CHROME}
        roughness={0.15}
        metalness={0.9}
      />
      <Tube
        at={[0, h * 0.84, -d / 2 + 0.055]}
        rTop={0.032}
        rBottom={0.028}
        height={0.012}
        color={CHROME}
        roughness={0.15}
        metalness={0.9}
      />
    </>
  );
}

function Sink(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.sink;
  const basinH = 0.055;
  const wall = 0.014;
  return (
    <>
      {/* Pedestal, waisted: narrow at the middle, flared at the foot. */}
      <Tube
        at={[0, (h - basinH) / 2, -0.01]}
        rTop={w * 0.16}
        rBottom={w * 0.24}
        height={h - basinH}
        color={CERAMIC}
        roughness={0.25}
      />
      {/* Basin as a rim around a void, same reason as the bath. */}
      <Slab at={[0, h - basinH + wall / 2, 0]} size={[w, wall, d]} color={CERAMIC} roughness={0.2} />
      {[-1, 1].map((s) => (
        <Slab
          key={`x${String(s)}`}
          at={[s * (w / 2 - wall / 2), h - basinH / 2, 0]}
          size={[wall, basinH, d]}
          color={CERAMIC}
          roughness={0.2}
        />
      ))}
      {[-1, 1].map((s) => (
        <Slab
          key={`z${String(s)}`}
          at={[0, h - basinH / 2, s * (d / 2 - wall / 2)]}
          size={[w - wall * 2, basinH, wall]}
          color={CERAMIC}
          roughness={0.2}
        />
      ))}
      {/* Tap */}
      <Tube
        at={[0, h + 0.02, -d / 2 + 0.03]}
        rTop={0.007}
        rBottom={0.008}
        height={0.04}
        color={CHROME}
        roughness={0.12}
        metalness={0.95}
      />
      <Tube
        at={[0, h + 0.038, -d / 2 + 0.052]}
        rTop={0.005}
        rBottom={0.005}
        height={0.045}
        color={CHROME}
        roughness={0.12}
        metalness={0.95}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </>
  );
}

// ── Bedroom ─────────────────────────────────────────────────────────────────

const DUVET = '#9db2c4';
const LINEN = '#f2efe7';

function Bed(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.bed;
  const frameH = 0.1;
  const mattressTop = 0.26; // must equal ITEM_SPECS.bed.supportsTop
  const mattressH = mattressTop - frameH;
  return (
    <>
      {/* Headboard at the BACK (-Z), because local front is +Z: the compiler
          turns the whole group, so "head against the wall" is a facing, not a
          special case in here. */}
      <Slab at={[0, h / 2, -d / 2 + 0.02]} size={[w, h, 0.04]} color={WALNUT} roughness={0.6} />
      <Slab
        at={[0, frameH / 2, 0]}
        size={[w, frameH, d - 0.04]}
        color={WALNUT_DARK}
        roughness={0.7}
      />
      {/* Feet */}
      {CORNERS.map(([sx, , sz]) => (
        <Leg
          key={`${String(sx)},${String(sz)}`}
          at={[sx * (w / 2 - 0.035), 0.02, sz * (d / 2 - 0.06)]}
          top={0.032}
          bottom={0.026}
          height={0.04}
          color={WALNUT_DARK}
        />
      ))}
      <Slab
        at={[0, frameH + mattressH / 2, 0]}
        size={[w - 0.03, mattressH, d - 0.07]}
        color={LINEN}
        roughness={1}
      />
      {/* Duvet: covers the foot two-thirds and sits slightly proud of the
          mattress, so there's a fold line instead of one flat slab. */}
      <Slab
        at={[0, mattressTop + 0.012, d * 0.14]}
        size={[w - 0.012, 0.03, d * 0.66]}
        color={DUVET}
        roughness={1}
      />
      {/* Turn-back at the top edge of the duvet */}
      <Slab
        at={[0, mattressTop + 0.016, d * 0.14 - d * 0.33 + 0.02]}
        size={[w - 0.012, 0.022, 0.05]}
        color={LINEN}
        roughness={1}
      />
      {/* Two pillows at the head */}
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          at={[s * w * 0.22, mattressTop + 0.022, -d / 2 + 0.13]}
          size={[w * 0.4, 0.04, 0.14]}
          color={LINEN}
          roughness={1}
          rotation={[0.06, 0, 0]}
        />
      ))}
    </>
  );
}

function Wardrobe(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.wardrobe;
  const plinth = 0.045;
  const bodyH = h - plinth - 0.018;
  return (
    <>
      <Slab
        at={[0, plinth / 2, -0.01]}
        size={[w - 0.03, plinth, d - 0.02]}
        color="#4a3826"
      />
      <Slab at={[0, plinth + bodyH / 2, 0]} size={[w, bodyH, d]} color={OAK} roughness={0.65} />
      {/* Two doors, proud of the carcass, with a shadow gap between them. */}
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          at={[s * w * 0.245, plinth + bodyH / 2, d / 2 + 0.005]}
          size={[w * 0.47, bodyH - 0.014, 0.01]}
          color="#bb9670"
          roughness={0.6}
        />
      ))}
      {/* Long vertical handles either side of the seam. */}
      {[-1, 1].map((s) => (
        <Tube
          key={s}
          at={[s * 0.022, plinth + bodyH * 0.5, d / 2 + 0.016]}
          rTop={0.006}
          rBottom={0.006}
          height={bodyH * 0.34}
          color={STEEL}
          roughness={0.25}
          metalness={0.85}
        />
      ))}
      {/* Cornice */}
      <Slab
        at={[0, h - 0.009, 0.004]}
        size={[w + 0.014, 0.018, d + 0.012]}
        color={WALNUT}
        roughness={0.6}
      />
    </>
  );
}

function Nightstand(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.nightstand;
  const topT = 0.016;
  const legH = 0.05;
  const bodyH = h - topT - legH;
  return (
    <>
      {CORNERS.map(([sx, , sz]) => (
        <Leg
          key={`${String(sx)},${String(sz)}`}
          at={[sx * (w / 2 - 0.02), legH / 2, sz * (d / 2 - 0.02)]}
          top={0.018}
          bottom={0.012}
          height={legH}
          color={WALNUT_DARK}
        />
      ))}
      <Slab at={[0, legH + bodyH / 2, 0]} size={[w, bodyH, d]} color={WALNUT} roughness={0.6} />
      {/* Two drawer fronts with a gap, and round knobs. */}
      {[-1, 1].map((s) => (
        <Slab
          key={s}
          at={[0, legH + bodyH * (s < 0 ? 0.27 : 0.73), d / 2 + 0.003]}
          size={[w * 0.88, bodyH * 0.4, 0.006]}
          color="#8d6a4c"
          roughness={0.6}
        />
      ))}
      {[-1, 1].map((s) => (
        <Tube
          key={s}
          at={[0, legH + bodyH * (s < 0 ? 0.27 : 0.73), d / 2 + 0.014]}
          rTop={0.009}
          rBottom={0.007}
          height={0.014}
          color={STEEL}
          roughness={0.3}
          metalness={0.8}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ))}
      <Slab at={[0, h - topT / 2, 0]} size={[w + 0.012, topT, d + 0.012]} color={WALNUT} roughness={0.5} />
    </>
  );
}

// kind → local-space mesh builder. Record over the closed union = exhaustive:
// add a kind and this line stops compiling until it has a factory.
const factories: Record<ItemKind, () => JSX.Element> = {
  table: Table,
  chair: Chair,
  sofa: Sofa,
  rug: Rug,
  bookshelf: Bookshelf,
  laptop: Laptop,
  tv: Tv,
  counter: Counter,
  oven: Oven,
  fridge: Fridge,
  toilet: Toilet,
  bathtub: Bathtub,
  shower: Shower,
  sink: Sink,
  bed: Bed,
  wardrobe: Wardrobe,
  nightstand: Nightstand,
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
    (min[1] + max[1]) / 2 + FLOOR_Y,
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
      {/* Lifted onto the floor TILE, not the structural floor the compiler
          measures from — see FLOOR_Y. The proxy is lifted to match, or a rug's
          click box would sit under the floor and never be hit. */}
      <group
        position={[item.position[0], item.position[1] + FLOOR_Y, item.position[2]]}
        rotation={[0, item.yaw, 0]}
      >
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
          onSelect={() => {
            onSelect(item.id);
          }}
        />
      ))}
    </>
  );
}
