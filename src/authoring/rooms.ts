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
import { defineRoom, type Grid, type ItemDef, type Opening } from '../core/blocks';

// ── The rooms: a key, a display name, and the colour seen from inside. ──
// Each room carries its own words: `name` is what it's called, `enter` is the
// phrase shown on ANY door leading here ("Open the door to the kitchen"). Keying
// the phrase by destination rather than by door means adding a door costs no new
// text. Informal register throughout (tú / du), which is what beginners meet
// first — keep it consistent when you add rooms.
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
// A bathroom across the back-left (2 rows), a kitchen down the right two columns,
// and a big living room filling the front-left.
export const GROUND_FLOOR: Grid = [
  [B, B, B, K, K],
  [B, B, B, K, K],
  [L, L, L, K, K],
  [L, L, L, K, K],
  [L, L, L, K, K],
];

// ── Doors. `swing` is which way the panel opens. ──
export const DOORS: readonly Opening[] = [
  { kind: 'door', cell: [4, 1], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] }, // front door (living room's front edge is row 4)
  { kind: 'door', cell: [2, 2], side: 'right', swing: 'in', between: ['livingRoom', 'kitchen'] }, // to the kitchen (living↔kitchen boundary, rows 2–4)
  { kind: 'door', cell: [1, 1], side: 'front', swing: 'in', between: ['livingRoom', 'bathroom'] }, // to the bathroom (bathroom's front row is 1)
];

// ── Windows. `sill`/`head` are the bottom/top heights (0 = floor, wall is 1.2
// tall). The window's LOOK follows its room automatically — bathroom windows are
// frosted, the kitchen gets a horizontal bar, the living room a picture window. ──
export const WINDOWS: readonly Opening[] = [
  { kind: 'window', cell: [0, 1], side: 'back', sill: 0.6, head: 1.0, between: ['bathroom', 'outside'] },
  { kind: 'window', cell: [1, 4], side: 'right', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [3, 4], side: 'right', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [2, 0], side: 'left', sill: 0.25, head: 1.0, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [3, 0], side: 'left', sill: 0.25, head: 1.0, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [4, 2], side: 'front', sill: 0.25, head: 1.0, between: ['livingRoom', 'outside'] },
];

// ── Items: furniture. WHERE each one sits is a `mount`:
//   { on: 'floor', cell, offset?, facing? }   — standing on the floor of a cell
//   { on: 'item',  host, offset?, facing? }   — sitting on top of another item
//   { on: 'wall',  cell, side, height, offset? } — hung on a wall, facing the room
// Offsets are fractions (0.5 = half a cell, or half the host's width). A wall
// item's facing is derived — it always looks into the room. Ids must be unique;
// order doesn't matter, so a laptop may be listed before its table. ──
export const ITEMS: readonly ItemDef[] = [
  // Living room, middle of the floor.
  { id: 'living-table', kind: 'table', mount: { on: 'floor', cell: [3, 1], facing: 's' } },
  // Sitting on that table, nudged toward its back-left corner. No cell, no
  // height, no facing — all three are inherited or derived from the table.
  { id: 'work-laptop', kind: 'laptop', mount: { on: 'item', host: 'living-table', offset: [-0.2, -0.1] } },
  // Hung on the living room's back wall (the bathroom partition), 0.55 up.
  { id: 'living-tv', kind: 'tv', mount: { on: 'wall', cell: [2, 0], side: 'back', height: 0.55 } },
];