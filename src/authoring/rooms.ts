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
// face the house. Rows may be different lengths — a short row just leaves the
// missing columns empty.
//
// Two rules the compiler enforces, so you can't draw a broken house silently:
//   • the same room may not appear in two separate blobs (that's ambiguous) —
//     it shows up as a DisconnectedRoom error, not a broken render;
//   • a room may not be keyed 'outside' (that word is reserved for exterior).
//
// (Doors, stairs, and items are placed by naming the cells they touch. Those
// lists will join this file as each of those features lands.)

import { defineRoom, EMPTY, type Grid } from '../core/blocks';

// ── The rooms: a key, a display name, and the colour seen from inside. ──
const K = defineRoom({ key: 'kitchen', name: 'Kitchen', color: '#d4d4d4' });
const L = defineRoom({ key: 'livingRoom', name: 'Living Room', color: '#c9b79b' });
const B = defineRoom({ key: 'bathroom', name: 'Bathroom', color: '#c8d5c8' });
const _ = EMPTY;

// ── The floor plan. Edit this. ──
// A living room (2×2, merged), a kitchen running down the right, and a small
// bathroom at the front-left, with an empty notch beside it.
export const GROUND_FLOOR: Grid = [
  [B, B, B, K, K],
  [L, L, L, K, K],
  [L, L, L, K, K],
  [L, L, L, K, K],
];