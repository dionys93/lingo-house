// src/authoring/rooms.ts
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  THIS IS THE FILE YOU EDIT TO CHANGE THE HOUSE.                        │
// └──────────────────────────────────────────────────────────────────────┘
//
// The house is a grid of square cells. You draw the floor plan directly: each
// entry is a room's block, or `_` for empty space. Walls are entirely a
// CONSEQUENCE of the grid — you never place one:
//   • two of the SAME room's blocks touching → they merge into one open room
//   • two DIFFERENT rooms touching           → a wall appears between them
//   • any block on the outer edge            → an exterior (siding) wall
//
// Reading the grid: the FIRST row is the BACK of the house, the LAST row is the
// FRONT (nearest the camera). Left-to-right in a row is left-to-right as you
// face the house. Rows may be different lengths.
//
// Doors and windows are placed ON a wall: name a cell and which of its sides the
// wall is on. `between` is an optional safety check — the compiler confirms the
// edge really connects those two rooms, so a miscounted cell fails loudly (in the
// red panel) instead of putting an opening in the wrong wall. NOTE: an opening's
// side must face OUT of the room — if the neighbouring cell is the same room, the
// "wall" is an internal seam and you'll get NotOnWall. When you resize the house,
// re-point openings to the room's true outer edge.

// Need empty space in the plan? Add `_` to this import and drop it in the grid.
import { defineRoom, type Grid, type ItemDef, type Opening, type Stair, type Storey } from '../core/blocks';

// ── The rooms: a key, its words in every language, and the colour seen from
// inside. `name` is what the room is called; `enter` is the phrase shown on ANY
// door leading here, so adding a door costs no new text. Informal register
// throughout (tú / du) — keep it consistent when you add rooms.
//
// KEYS ARE GLOBALLY UNIQUE across the whole house, storeys included: the key is
// an internal identifier, `labels` is what anyone reads. That's why the upstairs
// bathroom will be `bathroomUp` and still read "el baño".
const K = defineRoom({
  key: 'kitchen',
  color: '#d4d4d4',
  labels: {
    en: { name: 'the kitchen', enter: 'Open the door to the kitchen' },
    es: { name: 'la cocina', enter: 'Abre la puerta de la cocina' },
    de: { name: 'die Küche', enter: 'Öffne die Tür zur Küche' },
  },
});
const L = defineRoom({
  key: 'livingRoom',
  color: '#c9b79b',
  labels: {
    en: { name: 'the living room', enter: 'Open the door to the living room' },
    es: { name: 'la sala', enter: 'Abre la puerta de la sala' },
    de: { name: 'das Wohnzimmer', enter: 'Öffne die Tür zum Wohnzimmer' },
  },
});
const B = defineRoom({
  key: 'bathroom',
  color: '#c8d5c8',
  labels: {
    en: { name: 'the bathroom', enter: 'Open the door to the bathroom' },
    es: { name: 'el baño', enter: 'Abre la puerta del baño' },
    de: { name: 'das Badezimmer', enter: 'Öffne die Tür zum Badezimmer' },
  },
});

// ── The floor plan. Edit this. ──
// 6×6, open plan. Two big rooms: the kitchen across the back (its right-hand end
// is the dining wing — same room, no door, just where the dining table sits) and
// the living room across the front. A bathroom tucked into the right side. No
// hall: the front door opens into the living room and the staircase rises out of
// it, which is what a modern house does.
//
// The staircase will occupy the living room's LEFT column, rows 3–5. No door or
// window sits on that wall, so the run stays clear.
//
//        col:  0  1  2  3  4  5
export const GROUND_FLOOR: Grid = [
  /* row 0 */ [K, K, K, K, K, K],
  /* row 1 */ [K, K, K, K, K, K],
  /* row 2 */ [K, K, K, K, B, B],
  /* row 3 */ [L, L, L, L, B, B],
  /* row 4 */ [L, L, L, L, L, L],
  /* row 5 */ [L, L, L, L, L, L],
];

// ── Doors. `swing` is which way the panel opens. Open plan means few doors:
// the front door, one between the two big rooms, and one to the bathroom. ──
export const DOORS: readonly Opening[] = [
  { kind: 'door', cell: [5, 2], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
  { kind: 'door', cell: [3, 1], side: 'back', swing: 'in', between: ['livingRoom', 'kitchen'] },
  { kind: 'door', cell: [3, 4], side: 'front', swing: 'in', between: ['bathroom', 'livingRoom'] },
];

// ── Windows. `sill`/`head` are the bottom/top heights (0 = floor, wall is 1.2
// tall). The window's LOOK follows its room automatically. Nothing on the living
// room's left wall — that's the staircase. ──
export const WINDOWS: readonly Opening[] = [
  { kind: 'window', cell: [0, 1], side: 'back', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [0, 4], side: 'back', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [1, 0], side: 'left', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [1, 5], side: 'right', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [2, 5], side: 'right', sill: 0.6, head: 1.0, between: ['bathroom', 'outside'] },
  { kind: 'window', cell: [5, 3], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [5, 4], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [4, 5], side: 'right', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
];

// ── Items: furniture. WHERE each one sits is a `mount`:
//   { on: 'floor', cell, offset?, facing? }       — standing on the floor of a cell
//   { on: 'item',  host, offset?, facing? }       — sitting on top of another item
//   { on: 'wall',  cell, side, height, offset? }  — hung on a wall, facing the room
// Offsets are fractions (0.5 = half a cell, or half the host's width). A wall
// item's facing is derived — it always looks into the room. Ids must be unique;
// order doesn't matter, so a laptop may be listed before its table. ──
export const ITEMS: readonly ItemDef[] = [
  { id: 'living-table', kind: 'table', mount: { on: 'floor', cell: [4, 2], facing: 's' } },
  { id: 'work-laptop', kind: 'laptop', mount: { on: 'item', host: 'living-table', offset: [-0.2, -0.1] } },
  // Living room's side of the kitchen partition. NOT [3,1]'s back edge — the
  // door between the two rooms already claims that one.
  { id: 'living-tv', kind: 'tv', mount: { on: 'wall', cell: [3, 2], side: 'back', height: 0.55 } },
  // The dining wing: same room as the kitchen, just the far end of it.
  { id: 'dining-table', kind: 'table', mount: { on: 'floor', cell: [1, 4], facing: 's' } },
];

// ═══════════════════════════════════════════════════════════════════════════
// UPSTAIRS
// ═══════════════════════════════════════════════════════════════════════════

const M = defineRoom({
  key: 'bedroom',
  color: '#c4bcd0',
  labels: {
    en: { name: 'the bedroom', enter: 'Open the door to the bedroom' },
    es: { name: 'el dormitorio', enter: 'Abre la puerta del dormitorio' },
    de: { name: 'das Schlafzimmer', enter: 'Öffne die Tür zum Schlafzimmer' },
  },
});
const S = defineRoom({
  key: 'bedroomSmall',
  color: '#cdc6b6',
  labels: {
    en: { name: 'the small bedroom', enter: 'Open the door to the small bedroom' },
    es: { name: 'el cuarto pequeño', enter: 'Abre la puerta del cuarto pequeño' },
    de: { name: 'das kleine Schlafzimmer', enter: 'Öffne die Tür zum kleinen Schlafzimmer' },
  },
});
// A DIFFERENT KEY from the downstairs bathroom, but the same words. Keys are
// internal identifiers; `labels` is what anyone reads. That's what lets room
// keys stay globally unique without inventing silly names for the user.
const W = defineRoom({
  key: 'bathroomUp',
  color: '#c8d5c8',
  labels: {
    en: { name: 'the bathroom', enter: 'Open the door to the bathroom' },
    es: { name: 'el baño', enter: 'Abre la puerta del baño' },
    de: { name: 'das Badezimmer', enter: 'Öffne die Tür zum Badezimmer' },
  },
});
const U = defineRoom({
  key: 'landing',
  color: '#ded5c6',
  labels: {
    en: { name: 'the landing', enter: 'Go up to the landing' },
    es: { name: 'el rellano', enter: 'Sube al rellano' },
    de: { name: 'der Treppenabsatz', enter: 'Geh hinauf zum Treppenabsatz' },
  },
});

// Same 6×6 outline as the ground floor — REQUIRED, not stylistic: the roof sits
// on the top storey's footprint, and a smaller upper storey is a setback whose
// exposed lower roof isn't supported yet. The compiler enforces it.
//
// The landing's three front cells sit directly over the staircase; their floor
// is cut away automatically, derived from the stair below.
//
//        col:  0  1  2  3  4  5
export const UPPER_FLOOR: Grid = [
  /* row 0 */ [S, S, S, W, W, W],
  /* row 1 */ [S, S, S, W, W, W],
  /* row 2 */ [U, U, U, W, W, W],
  /* row 3 */ [U, M, M, M, M, M],
  /* row 4 */ [U, M, M, M, M, M],
  /* row 5 */ [U, M, M, M, M, M],
];

export const UPPER_DOORS: readonly Opening[] = [
  { kind: 'door', cell: [2, 1], side: 'back', swing: 'in', between: ['landing', 'bedroomSmall'] },
  { kind: 'door', cell: [2, 2], side: 'right', swing: 'in', between: ['landing', 'bathroomUp'] },
  { kind: 'door', cell: [3, 1], side: 'left', swing: 'in', between: ['bedroom', 'landing'] },
];

export const UPPER_WINDOWS: readonly Opening[] = [
  { kind: 'window', cell: [0, 1], side: 'back', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
  { kind: 'window', cell: [0, 4], side: 'back', sill: 0.6, head: 1.0, between: ['bathroomUp', 'outside'] },
  { kind: 'window', cell: [1, 5], side: 'right', sill: 0.6, head: 1.0, between: ['bathroomUp', 'outside'] },
  { kind: 'window', cell: [4, 5], side: 'right', sill: 0.35, head: 1.0, between: ['bedroom', 'outside'] },
  { kind: 'window', cell: [5, 3], side: 'front', sill: 0.35, head: 1.0, between: ['bedroom', 'outside'] },
];

export const UPPER_ITEMS: readonly ItemDef[] = [
  { id: 'bedroom-table', kind: 'table', mount: { on: 'floor', cell: [4, 4], facing: 's' } },
  // The bedroom's back wall — the partition with the upstairs bathroom. NOT the
  // front of [4,5]: that edge is bedroom-to-bedroom, so there's no wall there.
  { id: 'bedroom-tv', kind: 'tv', mount: { on: 'wall', cell: [3, 3], side: 'back', height: 0.6 } },
];

// ── The staircase. Rises up the living room's left column, bottom tread by the
// front wall. The arrival cell upstairs ([2,0], on the landing) and the
// stairwell hole are both DERIVED from this run — nothing else to keep in sync.
export const STAIRS: readonly Stair[] = [{ id: 'main-stair', from: [5, 0], to: [3, 0] }];

// ── The house: storeys snap into an array. `level` is authoritative; array
// order is cosmetic. Push another Storey to add a floor. ──
export const HOUSE: readonly Storey[] = [
  { level: 0, grid: GROUND_FLOOR, openings: [...DOORS, ...WINDOWS], items: ITEMS, stairs: STAIRS },
  { level: 1, grid: UPPER_FLOOR, openings: [...UPPER_DOORS, ...UPPER_WINDOWS], items: UPPER_ITEMS },
];