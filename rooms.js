// web/src/components/house/rooms.js
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  THIS IS THE FILE YOU EDIT TO CHANGE THE HOUSE.                        │
// └──────────────────────────────────────────────────────────────────────┘
//
// The house is a grid of square cells. You draw the floor plan directly:
// each entry in the grid is a room's block (or `_` for empty space). Where
// two of the SAME room's blocks touch, they merge into one open room; where
// two DIFFERENT rooms touch, a wall appears between them; and any block on
// the outer edge gets an exterior wall. You never place a wall yourself —
// walls are entirely a consequence of the grid.
//
// Reading the grid: the FIRST row is the BACK of the house, the LAST row is
// the FRONT (nearest the camera). Left-to-right in a row is left-to-right as
// you face the house. Rows can be different lengths; a short row just means
// empty space in the missing columns.
//
// Doors and items aren't blocks — a door is a gap in the wall BETWEEN two
// rooms, and an item is an object sitting INSIDE a room — so they're small
// separate lists below the grid.

import { defineRoom, EMPTY } from './blocks.js';

// One cell = this many world units on a side. Rooms are whole numbers of
// cells, so their real sizes are multiples of this.
export const CELL = 0.5;

// ── 1. The rooms: a letter, a name, and the colour seen from inside. ──
const K = defineRoom({ key: 'kitchen', name: 'Kitchen', color: '#d4d4d4' });
const L = defineRoom({ key: 'livingRoom', name: 'Living Room' }); // no color = house default
const B = defineRoom({ key: 'bathroom', name: 'Bathroom', color: '#c8d5c8' });
const D = defineRoom({ key: 'bedroom', name: 'Bedroom', color: '#d8cfc0' });
const Y = defineRoom({ key: 'balcony', name: 'Balcony', color: '#a8dadc' });
const _ = EMPTY;


export const GROUND_FLOOR = [
  [_, _, _, _, _, _],   // rows 0–1: empty — the storey's back balcony hangs here
  [_, _, _, _, _, _],
  [K, K, K, K, K, K],   // rows 2–6: kitchen (was 0–4)
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [K, K, K, K, K, K],
  [L, L, L, L, B, B],   // rows 7–11: living room + bathroom (was 5–9)
  [L, L, L, L, B, B],
  [L, L, L, L, B, B],
  [L, L, L, L, B, B],
  [L, L, L, L, B, B],
];

export const SECOND_STOREY = [
  [_, Y, Y, Y, Y, _],   // balcony — its own room now, so a wall forms vs the bedroom
  [_, Y, Y, Y, Y, _],
  [D, D, D, D, D, D],   // rows 2–11: bedroom, directly over the ground floor
  [D, D, D, D, D, D],
  [D, D, D, D, D, D],
  [D, D, D, D, D, D],
  [D, D, D, D, D, D],
  [D, D, D, D, D, D],
  [D, D, D, D, D, D],
  [D, D, D, D, D, D],
  [_, _, _, _, _, _],
  [_, _, _, _, _, _],
];

// ── 3. Doors. ──
export const DOORS = [
  { between: ['outside', 'livingRoom'], side: 'front', swing: 'out' },
  { between: ['livingRoom', 'kitchen'], swing: 'in' },
  { between: ['livingRoom', 'bathroom'], side: 'left', swing: 'in' },
  { between: ['bedroom', 'balcony'], swing: 'out' },   
];

// ── 3b. Stairs. dir = climb direction (which way you walk UP);
//        width = cells across; spot = where the footprint anchors. ──
export const STAIRS = [
  { between: ['livingRoom', 'bedroom'], dir: 'north', width: 2, spot: 'back-left' },
];

// ── 4. Items. Each names its room and a spot inside it. ──
export const ITEMS = [
  // { type: 'toilet', room: 'bathroom', spot: 'back-left' },
  // { type: 'bathShower', room: 'bathroom', spot: 'right-wall' },
];