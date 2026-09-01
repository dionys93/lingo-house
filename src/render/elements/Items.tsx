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
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { CompiledGrid, CompiledItem } from '../../core/house/compiled';
import { ITEM_SPECS } from '../../core/house/items';
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

/**
 * A box with its edges taken off — upholstery, bedding, anything that yields.
 *
 * Hard boxes are right for joinery and wrong for everything stuffed: a sofa
 * built from them reads as a bench with slabs on it, because in life the giveaway
 * of a cushion is that its corners are round and catch the light along the roll.
 *
 * `radius` is clamped below half the smallest side. RoundedBox degenerates —
 * self-intersecting faces, black shading — the moment the fillet is larger than
 * the box can hold, and a thin cushion is exactly where that happens.
 */
function Soft({
  at,
  size,
  color,
  radius,
  roughness = 1,
  metalness = 0,
  rotation,
}: PartProps & { readonly radius: number }): JSX.Element {
  const safe = Math.min(radius, Math.min(...size) / 2 - 0.001);
  return (
    <RoundedBox
      args={size}
      radius={Math.max(safe, 0.001)}
      smoothness={4}
      position={at}
      rotation={rotation ?? [0, 0, 0]}
      {...SOLID}
    >
      <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />
    </RoundedBox>
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
  const frameTop = 0.15;
  const seatTop = 0.215; // 430 mm — seat height
  const armTop = 0.3;
  const armW = 0.085;
  const backT = 0.09;
  const innerW = w - armW * 2;
  const seatD = d - backT;
  return (
    <>
      {/* Turned feet. Everything above them is upholstery and rounded; the feet
          are the one hard, small thing, which is what makes the rest read soft. */}
      {CORNERS.map(([sx, , sz]) => (
        <Tube
          key={`${String(sx)},${String(sz)}`}
          at={[sx * (w / 2 - 0.06), footH / 2, sz * (d / 2 - 0.06)]}
          rTop={0.014}
          rBottom={0.01}
          height={footH}
          color={WALNUT_DARK}
          roughness={0.6}
        />
      ))}
      {/* Frame under the seat */}
      <Soft
        at={[0, (footH + frameTop) / 2, 0]}
        size={[w, frameTop - footH, d]}
        color={SOFA_BODY}
        radius={0.025}
      />
      {/* ROLLED ARMS: a generous fillet on a narrow box is a roll. At radius
          0.042 on an 85 mm arm the flat is almost gone, so the highlight runs
          along the top as a curve rather than breaking at an edge. */}
      {[-1, 1].map((s) => (
        <Soft
          key={s}
          at={[s * (w / 2 - armW / 2), (footH + armTop) / 2, 0]}
          size={[armW, armTop - footH, d]}
          color={SOFA_BODY}
          radius={0.042}
        />
      ))}
      {/* Back, carried up to h. */}
      <Soft
        at={[0, (frameTop + h) / 2, -d / 2 + backT / 2]}
        size={[innerW, h - frameTop, backT]}
        color={SOFA_BODY}
        radius={0.035}
      />
      {/* Seat cushions — two, thicker than they were and rounded, so the seam
          between them reads as a gap between two soft things rather than a
          groove cut in one hard one. */}
      {[-1, 1].map((s) => (
        <Soft
          key={s}
          at={[s * innerW * 0.253, (frameTop + seatTop) / 2 + 0.008, backT / 2]}
          size={[innerW * 0.475, seatTop - frameTop + 0.03, seatD - 0.02]}
          color={SOFA_CUSHION}
          radius={0.03}
        />
      ))}
      {/* Back cushions, resting on the seat and leaning into the back. */}
      {[-1, 1].map((s) => (
        <Soft
          key={s}
          at={[s * innerW * 0.253, seatTop + 0.088, -d / 2 + backT + 0.045]}
          size={[innerW * 0.465, 0.175, 0.085]}
          color={SOFA_CUSHION}
          radius={0.035}
          rotation={[0.12, 0, 0]}
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

/**
 * A base unit: worktop, one pull-out drawer directly under it, two cupboard
 * doors below that.
 *
 * The drawer is what separates it from the appliance beside it. Its front is
 * SHORTER than the doors and set off by its own shadow gap, because that
 * horizontal band near the top is the single cue that says "drawer" — a run of
 * identical full-height panels reads as a row of cupboards whatever you call it.
 */
function Counter(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.counter;
  const topT = 0.02;
  const bodyH = h - topT - PLINTH_H;
  const gap = 0.006; // shadow gap between drawer and doors
  const drawerH = bodyH * 0.26;
  const doorH = bodyH - drawerH - gap;
  const drawerY = PLINTH_H + doorH + gap + drawerH / 2;
  return (
    <>
      <Slab
        at={[0, PLINTH_H / 2, -PLINTH_INSET / 2]}
        size={[w - 0.02, PLINTH_H, d - PLINTH_INSET]}
        color="#3f4145"
      />
      <Slab at={[0, PLINTH_H + bodyH / 2, 0]} size={[w, bodyH, d]} color={CABINET} roughness={0.6} />

      {/* TWO DOORS below, proud of the carcass with a seam between them. */}
      {[-1, 1].map((sgn) => (
        <Slab
          key={sgn}
          at={[sgn * w * 0.243, PLINTH_H + doorH / 2, d / 2 + 0.003]}
          size={[w * 0.47, doorH - gap, 0.006]}
          color={CABINET_LINE}
          roughness={0.6}
        />
      ))}
      {/* Their handles: vertical, either side of the centre seam, the way a
          pair of cupboard doors is actually fitted. */}
      {[-1, 1].map((sgn) => (
        <Tube
          key={sgn}
          at={[sgn * 0.022, PLINTH_H + doorH * 0.62, d / 2 + 0.016]}
          rTop={0.005}
          rBottom={0.005}
          height={doorH * 0.4}
          color={STEEL}
          roughness={0.25}
          metalness={0.85}
        />
      ))}

      {/* ONE DRAWER on top, full width. */}
      <Slab
        at={[0, drawerY, d / 2 + 0.004]}
        size={[w - 0.014, drawerH, 0.008]}
        color={CABINET_LINE}
        roughness={0.6}
      />
      {/* A long horizontal bar across it — drawers pull, doors swing, and the
          handle axis is how you tell at a glance. */}
      <Tube
        at={[0, drawerY, d / 2 + 0.019]}
        rTop={0.006}
        rBottom={0.006}
        height={w * 0.62}
        color={STEEL}
        roughness={0.2}
        metalness={0.9}
        rotation={[0, 0, Math.PI / 2]}
      />

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

/**
 * An integrated dishwasher: one full-height door under a worktop, a control
 * strip along its top edge, and a recessed handle.
 *
 * This is the old `counter` model, given the width it should always have had
 * (600 mm, one appliance bay) and the two details that name it. Everything in a
 * fitted kitchen is a box of the same height; what distinguishes them is the
 * face, so that is where the effort goes.
 */
function Dishwasher(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.dishwasher;
  const topT = 0.02;
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
        roughness={0.4}
        metalness={0.5}
      />
      {/* The door: one panel, nearly the whole face. */}
      <Slab
        at={[0, PLINTH_H + bodyH * 0.46, d / 2 + 0.004]}
        size={[w - 0.012, bodyH * 0.84, 0.008]}
        color="#cfd4d8"
        roughness={0.3}
        metalness={0.6}
      />
      {/* Control strip along the top edge, with three indicator lights. A
          washing machine has the same door; this band is the difference. */}
      <Slab
        at={[0, PLINTH_H + bodyH * 0.94, d / 2 + 0.005]}
        size={[w - 0.012, bodyH * 0.1, 0.01]}
        color="#3a3f44"
        roughness={0.35}
      />
      {[-1, 0, 1].map((sgn) => (
        <Tube
          key={sgn}
          at={[sgn * w * 0.12, PLINTH_H + bodyH * 0.94, d / 2 + 0.012]}
          rTop={0.005}
          rBottom={0.005}
          height={0.004}
          color={sgn === 0 ? '#7fd08a' : '#5b6169'}
          roughness={0.3}
          metalness={0.2}
          rotation={[Math.PI / 2, 0, 0]}
        />
      ))}
      {/* Recessed bar handle under the control strip. */}
      <Tube
        at={[0, PLINTH_H + bodyH * 0.83, d / 2 + 0.016]}
        rTop={0.006}
        rBottom={0.006}
        height={w * 0.72}
        color={STEEL}
        roughness={0.2}
        metalness={0.9}
        rotation={[0, 0, Math.PI / 2]}
      />
      <Slab
        at={[0, h - topT / 2, 0.008]}
        size={[w + 0.008, topT, d + 0.016]}
        color={WORKTOP}
        roughness={0.35}
      />
    </>
  );
}

/**
 * The kitchen table: 2 m square, seating on all sides.
 *
 * Square rather than the living room's rectangle, and its own kind rather than
 * a resized `table`, because a coffee table and a dining table are two objects
 * with two words. The legs sit further in than a small table's would — at this
 * span a leg on the corner looks like scaffolding, and the inset is what keeps
 * the top reading as a slab you could sit at rather than a platform.
 */
function DiningTable(): JSX.Element {
  const { w, d, h } = ITEM_SPECS.diningTable;
  const topT = 0.032; // 64 mm — a 2 m top needs visible thickness or it sags to the eye
  const apronT = 0.028;
  const inset = 0.075;
  const legTop = 0.045;
  const legBottom = 0.032;
  const legH = h - topT;
  const lx = w / 2 - inset;
  const lz = d / 2 - inset;
  return (
    <>
      <Slab at={[0, h - topT / 2, 0]} size={[w, topT, d]} color={WALNUT} roughness={0.55} />
      {/* Apron on all four sides, since all four are on show at a square table. */}
      {[-1, 1].map((sgn) => (
        <Slab
          key={`z${String(sgn)}`}
          at={[0, h - topT - apronT / 2, sgn * (lz - 0.014)]}
          size={[w - inset * 2, apronT, 0.018]}
          color={WALNUT_DARK}
        />
      ))}
      {[-1, 1].map((sgn) => (
        <Slab
          key={`x${String(sgn)}`}
          at={[sgn * (lx - 0.014), h - topT - apronT / 2, 0]}
          size={[0.018, apronT, d - inset * 2]}
          color={WALNUT_DARK}
        />
      ))}
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

function Fridge({ open }: ItemProps): JSX.Element {
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
      {/* The fridge compartment's shelves, visible once its door swings. The
          freezer above keeps its fixed panel — one door that opens is the one
          you reach for, and two swinging doors on one hinge side read as a
          cabinet coming apart. */}
      {ITEM_SPECS.fridge.opens && (
        <Shelves
          w={w}
          d={d}
          inset={ITEM_SPECS.fridge.opens.inset ?? 0}
          heights={ITEM_SPECS.fridge.opens.shelves}
          color="#e9eef1"
        />
      )}
      <Slab
        at={[0, h - freezerH / 2 - gap / 2, d / 2 + 0.004]}
        size={[w - 0.01, freezerH - gap, 0.008]}
        color="#ced4d9"
        roughness={0.3}
        metalness={0.6}
      />
      <Tube
        at={[w * 0.32, h - freezerH * 0.5, d / 2 + 0.018]}
        rTop={0.006}
        rBottom={0.006}
        height={freezerH * 0.5}
        color={STEEL}
        roughness={0.2}
        metalness={0.9}
      />
      {/* Hinged on the LEFT (-x), so its handle stays on the right where the
          freezer's is — a fridge whose two handles are on opposite sides reads
          as two appliances stacked. */}
      <SwingDoor
        hinge={[-w / 2, (h - freezerH - gap) / 2, d / 2 + 0.004]}
        width={w - 0.01}
        height={h - freezerH - gap}
        thickness={0.008}
        sign={1}
        open={open}
        color="#ced4d9"
        handle={STEEL}
      />
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
      <Soft
        at={[0, mattressTop + 0.016, d * 0.14]}
        size={[w - 0.012, 0.038, d * 0.66]}
        color={DUVET}
        radius={0.017}
      />
      {/* Turn-back at the top edge of the duvet */}
      <Slab
        at={[0, mattressTop + 0.016, d * 0.14 - d * 0.33 + 0.02]}
        size={[w - 0.012, 0.022, 0.05]}
        color={LINEN}
        roughness={1}
      />
      {/* Two pillows. Thicker and heavily rounded — a pillow is the softest
          thing in the house and a 40 mm slab with square corners read as a
          folded towel. The slight tilt sets them against the headboard. */}
      {[-1, 1].map((s) => (
        <Soft
          key={s}
          at={[s * w * 0.22, mattressTop + 0.035, -d / 2 + 0.135]}
          size={[w * 0.42, 0.065, 0.155]}
          color={LINEN}
          radius={0.03}
          rotation={[0.09, 0, 0]}
        />
      ))}
    </>
  );
}

function Wardrobe({ open }: ItemProps): JSX.Element {
  const { w, d, h } = ITEM_SPECS.wardrobe;
  const opens = ITEM_SPECS.wardrobe.opens;
  const plinth = 0.045;
  const bodyH = h - plinth - 0.018;
  const leaf = w * 0.47;
  return (
    <>
      <Slab
        at={[0, plinth / 2, -0.01]}
        size={[w - 0.03, plinth, d - 0.02]}
        color="#4a3826"
      />
      {/* Carcass open at the front — a back and two sides — so swinging the
          doors reveals a space rather than the front face of a solid block. */}
      <Slab at={[0, plinth + bodyH / 2, -d / 2 + 0.01]} size={[w, bodyH, 0.02]} color={OAK} roughness={0.65} />
      {[-1, 1].map((sx) => (
        <Slab
          key={sx}
          at={[sx * (w / 2 - 0.01), plinth + bodyH / 2, 0]}
          size={[0.02, bodyH, d]}
          color={OAK}
          roughness={0.65}
        />
      ))}
      <Slab at={[0, plinth + bodyH - 0.01, 0]} size={[w, 0.02, d]} color={OAK} roughness={0.65} />
      {opens && (
        <Shelves
          w={w}
          d={d}
          inset={opens.inset ?? 0}
          heights={opens.shelves}
          color="#c9ab86"
        />
      )}
      {/* The hanging rail, between the two shelves — what makes it a wardrobe
          rather than a bookcase with doors. */}
      <Tube
        at={[0, plinth + bodyH * 0.72, 0]}
        rTop={0.008}
        rBottom={0.008}
        height={w - 0.05}
        color={STEEL}
        roughness={0.25}
        metalness={0.85}
        rotation={[0, 0, Math.PI / 2]}
      />
      {([-1, 1] as const).map((sx) => (
        <SwingDoor
          key={sx}
          hinge={[sx * (w / 2), plinth + bodyH / 2, d / 2 + 0.005]}
          width={leaf}
          height={bodyH - 0.014}
          thickness={0.01}
          sign={sx === -1 ? 1 : -1}
          open={open}
          color="#bb9670"
          handle={STEEL}
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

function Nightstand({ open }: ItemProps): JSX.Element {
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
      {/* Two drawers, and the TOP one pulls out. A drawer slides rather than
          swings, so the whole drawer — front, box and knob — rides in a group
          that translates along +Z, and what is on the shelf inside rides with
          the world rather than with the drawer. Pulled out most of its depth,
          not all: a drawer clear of its carcass is a drawer on the floor. */}
      {([-1, 1] as const).map((sy) => {
        const y = legH + bodyH * (sy < 0 ? 0.27 : 0.73);
        const out = sy > 0 && open ? d * 0.62 : 0;
        return (
          <group key={sy} position={[0, 0, out]}>
            <Slab at={[0, y, d / 2 + 0.003]} size={[w * 0.88, bodyH * 0.4, 0.006]} color="#8d6a4c" roughness={0.6} />
            {out > 0 && (
              <>
                {/* The box behind the front, only worth drawing when you can
                    see into it. */}
                <Slab at={[0, y - bodyH * 0.19, d * 0.5 - out * 0.5]} size={[w * 0.82, 0.008, out]} color="#6f5439" />
                {[-1, 1].map((sx) => (
                  <Slab
                    key={sx}
                    at={[sx * w * 0.41, y - bodyH * 0.06, d * 0.5 - out * 0.5]}
                    size={[0.008, bodyH * 0.26, out]}
                    color="#6f5439"
                  />
                ))}
              </>
            )}
            <Tube
              at={[0, y, d / 2 + 0.014]}
              rTop={0.009}
              rBottom={0.007}
              height={0.014}
              color={STEEL}
              roughness={0.3}
              metalness={0.8}
              rotation={[Math.PI / 2, 0, 0]}
            />
          </group>
        );
      })}
      <Slab at={[0, h - topT / 2, 0]} size={[w + 0.012, topT, d + 0.012]} color={WALNUT} roughness={0.5} />
    </>
  );
}

// kind → local-space mesh builder. Record over the closed union = exhaustive:
// add a kind and this line stops compiling until it has a factory.

// ── Openable carcasses ──────────────────────────────────────────────────────
//
// A door that swings has to turn about its HINGE, not its centre, and a mesh
// turns about its own origin. So every swinging door is a `<group>` placed at
// the hinge with the leaf offset half its width inside it — the same trick the
// house's own doors use, and the reason a leaf that "rotates in place" reads as
// a panel spinning in a doorway rather than opening.
function SwingDoor({
  hinge,
  width,
  height,
  thickness,
  sign,
  open,
  color,
  handle,
}: {
  /** World-local position of the hinge edge, at the door's mid-height. */
  readonly hinge: V3;
  readonly width: number;
  readonly height: number;
  readonly thickness: number;
  /** +1 hinges on the left and swings anticlockwise; -1 mirrors it. */
  readonly sign: 1 | -1;
  readonly open: boolean;
  readonly color: string;
  readonly handle?: string;
}): JSX.Element {
  // NEGATIVE. A positive rotation about Y carries +X toward -Z, so a leaf
  // hinged at the left of the carcass and extending to the right swings INTO
  // the box — which, viewed head on, looks almost exactly like a door that
  // never moved, because the two leaves end up crossing the interior roughly
  // where they started. It reads as nothing happening, not as a bug.
  //
  // 100° rather than 90: a door stopped exactly square to the carcass reads as
  // a panel that happens to be perpendicular, and the extra ten degrees is what
  // makes it read as swung.
  const angle = open ? -sign * (Math.PI * 100) / 180 : 0;
  return (
    <group position={hinge} rotation={[0, angle, 0]}>
      <Slab at={[(sign * width) / 2, 0, 0]} size={[width, height, thickness]} color={color} roughness={0.6} />
      {handle !== undefined && (
        <Tube
          at={[sign * (width - 0.022), 0, thickness / 2 + 0.008]}
          rTop={0.005}
          rBottom={0.005}
          height={height * 0.3}
          color={handle}
          roughness={0.25}
          metalness={0.85}
        />
      )}
    </group>
  );
}

const SHELF_INK = '#d6cfc2';

/** The shelves you see once the doors are open. */
function Shelves({
  w,
  d,
  inset,
  heights,
  color = SHELF_INK,
}: {
  readonly w: number;
  readonly d: number;
  readonly inset: number;
  readonly heights: readonly number[];
  readonly color?: string;
}): JSX.Element {
  const iw = w * (1 - 2 * inset);
  const id = d * (1 - 2 * inset);
  return (
    <>
      {heights.map((y, i) => (
        <Slab key={i} at={[0, y - 0.006, 0]} size={[iw, 0.012, id]} color={color} roughness={0.8} />
      ))}
    </>
  );
}

// A base unit. Same carcass language as Counter — plinth, body, doors — but
// without the worktop's overhang, and its doors move.
function Cupboard({ open }: ItemProps): JSX.Element {
  const { w, d, h } = ITEM_SPECS.cupboard;
  const opens = ITEM_SPECS.cupboard.opens;
  // Stops BELOW the worktop rather than running to the full height. Sharing the
  // top 16 mm with the worktop slab put two surfaces in the same plane, which
  // reads as a moiré band along the front edge and not as joinery.
  const top = 0.016;
  const bodyH = h - PLINTH_H - top;
  const leaf = w / 2 - 0.008;
  return (
    <>
      <Slab
        at={[0, PLINTH_H / 2, -PLINTH_INSET / 2]}
        size={[w - 0.01, PLINTH_H, d - PLINTH_INSET]}
        color="#3f4247"
      />
      {/* The carcass, open at the front — a back, two sides and a top, so the
          inside is a space rather than a solid you have painted a door onto. */}
      <Slab at={[0, PLINTH_H + bodyH / 2, -d / 2 + 0.008]} size={[w, bodyH, 0.016]} color={CABINET_LINE} />
      {[-1, 1].map((sx) => (
        <Slab
          key={sx}
          at={[sx * (w / 2 - 0.008), PLINTH_H + bodyH / 2, 0]}
          size={[0.016, bodyH, d]}
          color={CABINET_LINE}
        />
      ))}
      <Slab at={[0, h - top / 2, 0]} size={[w, top, d]} color={WORKTOP} roughness={0.4} />
      {opens && (
        <Shelves w={w} d={d} inset={opens.inset ?? 0} heights={opens.shelves.map((y) => y + PLINTH_H)} />
      )}
      {/* Two doors, hinged on the outer edges so they open outward from the
          middle — which is what lets you see in from straight ahead. */}
      {([-1, 1] as const).map((sx) => (
        <SwingDoor
          key={sx}
          hinge={[sx * (w / 2), PLINTH_H + bodyH / 2, d / 2 + 0.006]}
          width={leaf}
          height={bodyH - 0.01}
          thickness={0.012}
          sign={sx === -1 ? 1 : -1}
          open={open}
          color={CABINET}
          handle={STEEL}
        />
      ))}
    </>
  );
}

// ── Lamp ────────────────────────────────────────────────────────────────────

const LAMP_SHADE = '#e8dcc0';
const LAMP_BASE = '#54463a';

/**
 * A table lamp, and the one item in the house that is also a light.
 *
 * The `pointLight` casts no shadow deliberately. Shadow-casting point lights
 * are six shadow maps each, and there is a lamp in three rooms — that is
 * eighteen extra passes to make a warm patch on a wall that the emissive shade
 * already implies. The sun is what casts shadows here.
 */
function Lamp(): JSX.Element {
  const { w, h } = ITEM_SPECS.lamp;
  const shadeH = h * 0.42;
  const shadeY = h - shadeH / 2;
  return (
    <>
      <Tube at={[0, 0.012, 0]} rTop={w * 0.3} rBottom={w * 0.36} height={0.024} color={LAMP_BASE} roughness={0.5} />
      <Tube at={[0, h * 0.42, 0]} rTop={0.008} rBottom={0.009} height={h * 0.62} color={LAMP_BASE} roughness={0.4} metalness={0.3} />
      <mesh position={[0, shadeY, 0]} {...SOLID}>
        <cylinderGeometry args={[w * 0.34, w * 0.5, shadeH, 18, 1, true]} />
        <meshStandardMaterial
          color={LAMP_SHADE}
          roughness={0.9}
          side={THREE.DoubleSide}
          emissive={LAMP_SHADE}
          emissiveIntensity={0.45}
        />
      </mesh>
      <pointLight position={[0, shadeY, 0]} intensity={0.25} distance={2.2} decay={2} color="#ffd9a0" />
    </>
  );
}

// ── Potted plant ────────────────────────────────────────────────────────────

const TERRACOTTA = '#b5673f';
const SOIL = '#3c2f26';
const LEAF = '#4e7d46';
const LEAF_DARK = '#3d6338';

// Leaves as flattened, tilted ellipsoids on stems. Deterministic — a plant that
// reshuffles on every re-render is a plant that twitches when you walk past it.
const FRONDS: readonly (readonly [angle: number, tilt: number, len: number, up: number])[] = [
  [0.0, 0.55, 1.0, 0.62],
  [1.1, 0.75, 0.86, 0.5],
  [2.2, 0.45, 0.94, 0.72],
  [3.3, 0.8, 0.8, 0.46],
  [4.4, 0.5, 0.9, 0.66],
  [5.5, 0.7, 0.84, 0.55],
];

function PottedPlant(): JSX.Element {
  const { w, h } = ITEM_SPECS.pottedPlant;
  const potH = h * 0.34;
  const rim = w / 2;
  return (
    <>
      <Tube at={[0, potH / 2, 0]} rTop={rim} rBottom={rim * 0.72} height={potH} color={TERRACOTTA} roughness={0.85} segments={18} />
      <Tube at={[0, potH - 0.004, 0]} rTop={rim * 1.06} rBottom={rim * 1.06} height={0.018} color={TERRACOTTA} roughness={0.85} segments={18} />
      <Tube at={[0, potH - 0.012, 0]} rTop={rim * 0.94} rBottom={rim * 0.94} height={0.01} color={SOIL} roughness={1} segments={18} />
      {FRONDS.map(([angle, tilt, len, up], i) => {
        const reach = w * 0.62 * len;
        const top = potH + (h - potH) * up;
        return (
          <group key={i} rotation={[0, angle, 0]}>
            {/* Stem: a thin tapered tube leaning out from the soil. */}
            <Tube
              at={[reach * 0.28, potH + (top - potH) * 0.5, 0]}
              rTop={0.003}
              rBottom={0.005}
              height={top - potH}
              color={LEAF_DARK}
              roughness={0.9}
              segments={6}
              rotation={[0, 0, -tilt * 0.5]}
            />
            {/* Leaf: a squashed sphere, so it reads as a blade rather than a ball. */}
            <mesh position={[reach, top, 0]} rotation={[0, 0, -tilt]} scale={[1, 0.28, 0.62]} {...SOLID}>
              <sphereGeometry args={[w * 0.34, 10, 8]} />
              <meshStandardMaterial color={i % 2 === 0 ? LEAF : LEAF_DARK} roughness={0.85} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}

// ── Shelf things ────────────────────────────────────────────────────────────

// A stack of three, which is what the spec's height is measured as. Each plate
// is a shallow truncated cone — wider at the rim than at the foot — so the
// stack reads as crockery rather than as a cylinder with lines on it.
function Plate(): JSX.Element {
  const { w, h } = ITEM_SPECS.plate;
  const one = h / 3;
  return (
    <>
      {[0, 1, 2].map((i) => (
        <Tube
          key={i}
          at={[0, one * (i + 0.5), 0]}
          rTop={w / 2}
          rBottom={w * 0.4}
          height={one * 0.9}
          color={CERAMIC}
          roughness={0.35}
          segments={20}
        />
      ))}
    </>
  );
}

function Cup(): JSX.Element {
  const { w, h } = ITEM_SPECS.cup;
  return (
    <>
      <mesh position={[0, h / 2, 0]} {...SOLID}>
        <cylinderGeometry args={[w / 2, w * 0.4, h, 14, 1, true]} />
        <meshStandardMaterial color={CERAMIC} roughness={0.3} side={THREE.DoubleSide} />
      </mesh>
      <Tube at={[0, 0.004, 0]} rTop={w * 0.4} rBottom={w * 0.4} height={0.008} color={CERAMIC} roughness={0.3} segments={14} />
      {/* The handle, as a torus on its side. */}
      <mesh position={[w * 0.5, h * 0.55, 0]} rotation={[0, Math.PI / 2, 0]} {...SOLID}>
        <torusGeometry args={[h * 0.24, 0.004, 6, 12, Math.PI * 1.3]} />
        <meshStandardMaterial color={CERAMIC} roughness={0.3} />
      </mesh>
    </>
  );
}

// Every factory takes the same props, and all but the openable ones ignore them
// — a zero-argument function is assignable here, so a chair does not have to
// declare a parameter it will never read.
export interface ItemProps {
  readonly open: boolean;
}

const factories: Record<ItemKind, (props: ItemProps) => JSX.Element> = {
  table: Table,
  chair: Chair,
  sofa: Sofa,
  rug: Rug,
  bookshelf: Bookshelf,
  lamp: Lamp,
  pottedPlant: PottedPlant,
  laptop: Laptop,
  tv: Tv,
  diningTable: DiningTable,
  counter: Counter,
  cupboard: Cupboard,
  dishwasher: Dishwasher,
  oven: Oven,
  fridge: Fridge,
  plate: Plate,
  cup: Cup,
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
  open,
  selected,
  onSelect,
}: {
  item: CompiledItem;
  open: boolean;
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
        <Build open={open} />
      </group>
      <ClickProxy item={item} selected={selected} onSelect={onSelect} />
    </>
  );
}

export function Items({
  grid,
  openItems,
  selectedId,
  onSelect,
}: {
  grid: CompiledGrid;
  /** Which items are open. Decides both how a cupboard is drawn and whether
   *  what is inside it is drawn at all. */
  openItems: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {grid.items
        // A cup on a shelf behind a shut door is not drawn, and — because the
        // click proxy goes with it — not clickable either. Rendering it and
        // letting the carcass hide it would leave an invisible, pickable cup
        // floating inside a closed cupboard.
        .filter((item) => item.inside === undefined || openItems.has(item.inside))
        .map((item) => (
          <Item
            key={item.id}
            item={item}
            open={openItems.has(item.id)}
            selected={item.id === selectedId}
            onSelect={() => {
              onSelect(item.id);
            }}
          />
        ))}
    </>
  );
}
