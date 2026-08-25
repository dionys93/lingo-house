// src/content/rooms.ts
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
import { defineRoom, type Grid, type ItemDef, type Opening, type Stair, type Storey } from '../core/house/blocks';

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
    en: { name: 'the kitchen', enter: 'Open the door to the kitchen', up: 'Go up to the kitchen', down: 'Go down to the kitchen' },
    es: { name: 'la cocina', enter: 'Abre la puerta de la cocina', up: 'Sube a la cocina', down: 'Baja a la cocina' },
    de: { name: 'die Küche', enter: 'Öffne die Tür zur Küche', up: 'Geh hinauf in die Küche', down: 'Geh hinunter in die Küche' },
  },
});
const L = defineRoom({
  key: 'livingRoom',
  color: '#c9b79b',
  labels: {
    en: { name: 'the living room', enter: 'Open the door to the living room', up: 'Go up to the living room', down: 'Go down to the living room' },
    es: { name: 'la sala', enter: 'Abre la puerta de la sala', up: 'Sube a la sala', down: 'Baja a la sala' },
    de: { name: 'das Wohnzimmer', enter: 'Öffne die Tür zum Wohnzimmer', up: 'Geh hinauf ins Wohnzimmer', down: 'Geh hinunter ins Wohnzimmer' },
  },
});
const B = defineRoom({
  key: 'bathroom',
  color: '#c8d5c8',
  labels: {
    en: { name: 'the bathroom', enter: 'Open the door to the bathroom', up: 'Go up to the bathroom', down: 'Go down to the bathroom' },
    es: { name: 'el baño', enter: 'Abre la puerta del baño', up: 'Sube al baño', down: 'Baja al baño' },
    de: { name: 'das Badezimmer', enter: 'Öffne die Tür zum Badezimmer', up: 'Geh hinauf ins Badezimmer', down: 'Geh hinunter ins Badezimmer' },
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
  // Row 6 exists so the STAIRCASE HAS A FOOT. The flight occupies rows 5-3 of
  // column 0, and a run's cells reach the far edge of the first one — so with
  // six rows the bottom step landed on the exterior wall centreline and you
  // arrived at the stairs already inside them.
  //
  // The alternative was shortening the flight, and the arithmetic ruled it out:
  // two cells over a 1.2 rise is a 50° pitch, which is a ship's ladder. Real
  // stairs sit at 30-37° and this one is already steep at 38.7°.
  /* row 6 */ [L, L, L, L, L, L],
  // Rows 7-8 are the SETBACK: the ground floor now reaches two cells further
  // forward than the upper storey, so the front of the house is single-height
  // and gets its own lower roof.
  /* row 7 */ [L, L, L, L, L, L],
  /* row 8 */ [L, L, L, L, L, L],
];

// ── Doors. `swing` is which way the panel opens. Open plan means few doors:
// the front door, one between the two big rooms, and one to the bathroom. ──
export const DOORS: readonly Opening[] = [
  { kind: 'door', cell: [8, 2], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
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
  { kind: 'window', cell: [8, 3], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [8, 4], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
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
  // ── Kitchen: the working run along the back wall. Offsets press each unit
  // against the wall — an appliance floating 20 cm out is the thing that reads
  // as "placed by a computer". The gaps between them are deliberate, not slack.
  { id: 'kitchen-fridge', kind: 'fridge', mount: { on: 'floor', cell: [0, 0], facing: 's', offset: [-0.12, -0.095] } },
  { id: 'kitchen-counter', kind: 'counter', mount: { on: 'floor', cell: [0, 2], facing: 's', offset: [0, -0.12] } },
  { id: 'kitchen-oven', kind: 'oven', mount: { on: 'floor', cell: [0, 3], facing: 's', offset: [0, -0.12] } },

  // ── The dining wing: same room as the kitchen, just the far end of it.
  // The chairs face the table (front is +Z, so 'e' looks toward +X).
  { id: 'dining-table', kind: 'table', mount: { on: 'floor', cell: [1, 4], facing: 's' } },
  { id: 'dining-chair-w', kind: 'chair', mount: { on: 'floor', cell: [1, 4], facing: 'e', offset: [-0.73, 0] } },
  { id: 'dining-chair-e', kind: 'chair', mount: { on: 'floor', cell: [1, 4], facing: 'w', offset: [0.73, 0] } },

  // ── Living room, arranged around the TV on the kitchen partition: sofa
  // facing it ('n' = toward the back of the house), coffee table between them,
  // rug under both. The rug is 12 mm tall and OVERLAPS both on purpose — legs
  // and feet stand on it, which is what a rug is for.
  { id: 'living-rug', kind: 'rug', mount: { on: 'floor', cell: [4, 2], facing: 's', offset: [0, 0.1] } },
  { id: 'living-table', kind: 'table', mount: { on: 'floor', cell: [4, 2], facing: 's' } },
  { id: 'work-laptop', kind: 'laptop', mount: { on: 'item', host: 'living-table', offset: [-0.2, -0.1] } },
  { id: 'living-sofa', kind: 'sofa', mount: { on: 'floor', cell: [5, 2], facing: 'n' } },
  { id: 'living-bookshelf', kind: 'bookshelf', mount: { on: 'floor', cell: [6, 5], facing: 'w', offset: [0.27, 0] } },
  // Living room's side of the kitchen partition. NOT [3,1]'s back edge — the
  // door between the two rooms already claims that one.
  { id: 'living-tv', kind: 'tv', mount: { on: 'wall', cell: [3, 2], side: 'back', height: 0.55 } },

  // ── The downstairs WC is two cells square, so it gets the two fixtures that
  // fit. The bath and shower are upstairs, where the bathroom is 3x3.
  { id: 'wc-toilet', kind: 'toilet', mount: { on: 'floor', cell: [2, 4], facing: 's', offset: [0, -0.07] } },
  { id: 'wc-sink', kind: 'sink', mount: { on: 'floor', cell: [3, 5], facing: 'w', offset: [0.195, 0] } },
];

// ═══════════════════════════════════════════════════════════════════════════
// UPSTAIRS
// ═══════════════════════════════════════════════════════════════════════════

const M = defineRoom({
  key: 'bedroom',
  color: '#c4bcd0',
  labels: {
    en: { name: 'the bedroom', enter: 'Open the door to the bedroom', up: 'Go up to the bedroom', down: 'Go down to the bedroom' },
    es: { name: 'el dormitorio', enter: 'Abre la puerta del dormitorio', up: 'Sube al dormitorio', down: 'Baja al dormitorio' },
    de: { name: 'das Schlafzimmer', enter: 'Öffne die Tür zum Schlafzimmer', up: 'Geh hinauf ins Schlafzimmer', down: 'Geh hinunter ins Schlafzimmer' },
  },
});
const S = defineRoom({
  key: 'bedroomSmall',
  color: '#cdc6b6',
  labels: {
    en: { name: 'the small bedroom', enter: 'Open the door to the small bedroom', up: 'Go up to the small bedroom', down: 'Go down to the small bedroom' },
    es: { name: 'el cuarto pequeño', enter: 'Abre la puerta del cuarto pequeño', up: 'Sube al cuarto pequeño', down: 'Baja al cuarto pequeño' },
    de: { name: 'das kleine Schlafzimmer', enter: 'Öffne die Tür zum kleinen Schlafzimmer', up: 'Geh hinauf ins kleine Schlafzimmer', down: 'Geh hinunter ins kleine Schlafzimmer' },
  },
});
// A DIFFERENT KEY from the downstairs bathroom, but the same words. Keys are
// internal identifiers; `labels` is what anyone reads. That's what lets room
// keys stay globally unique without inventing silly names for the user.
const W = defineRoom({
  key: 'bathroomUp',
  color: '#c8d5c8',
  labels: {
    en: { name: 'the bathroom', enter: 'Open the door to the bathroom', up: 'Go up to the bathroom', down: 'Go down to the bathroom' },
    es: { name: 'el baño', enter: 'Abre la puerta del baño', up: 'Sube al baño', down: 'Baja al baño' },
    de: { name: 'das Badezimmer', enter: 'Öffne die Tür zum Badezimmer', up: 'Geh hinauf ins Badezimmer', down: 'Geh hinunter ins Badezimmer' },
  },
});
const U = defineRoom({
  key: 'landing',
  color: '#ded5c6',
  labels: {
    en: { name: 'the landing', enter: 'Go up to the landing', up: 'Go up to the landing', down: 'Go down to the landing' },
    es: { name: 'el rellano', enter: 'Sube al rellano', up: 'Sube al rellano', down: 'Baja al rellano' },
    de: { name: 'der Treppenabsatz', enter: 'Geh hinauf zum Treppenabsatz', up: 'Geh hinauf zum Treppenabsatz', down: 'Geh hinunter zum Treppenabsatz' },
  },
});

// SMALLER than the ground floor, on purpose. It stops at row 6 while the ground
// floor runs to row 8, so the front two rows are single-storey and carry their
// own lower roof. Storeys align at cell [0][0], not on their centres — see the
// `extent` option in compileGrid.
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
  // Matches the ground floor's new row. The landing column continues over the
  // stair's approach rather than stopping short of it.
  /* row 6 */ [U, M, M, M, M, M],
];

export const UPPER_DOORS: readonly Opening[] = [
  { kind: 'door', cell: [2, 1], side: 'back', swing: 'in', between: ['landing', 'bedroomSmall'] },
  { kind: 'door', cell: [2, 2], side: 'right', swing: 'in', between: ['landing', 'bathroomUp'] },
  // Was [3,1] side 'left' — the c0/c1 boundary, which is exactly the flank the
  // staircase's balustrade runs down. On 'back' it sits on the r2/r3 line
  // instead, so you step off the top of the stairs with the bedroom in front of
  // you rather than behind your shoulder.
  // 'out', not 'in', and the two are not symmetric the way they read.
  //
  // `swing` is a ROTATION SIGN, not a destination: the compiler orders an
  // opening's sides geometrically as [negative, positive], so which room a given
  // sign points at depends on where that room sits relative to the wall. This
  // door and the bedroomSmall door two lines up are both axis-x walls, but the
  // landing is on the negative side of one and the positive side of the other —
  // so they need OPPOSITE swing values to do the same visible thing.
  //
  // Measured, rather than reasoned: with 'in' the panel tip lands in the
  // landing, swinging out at whoever just climbed the stairs.
  { kind: 'door', cell: [3, 1], side: 'back', swing: 'out', between: ['bedroom', 'landing'] },
];

export const UPPER_WINDOWS: readonly Opening[] = [
  { kind: 'window', cell: [0, 1], side: 'back', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
  { kind: 'window', cell: [0, 4], side: 'back', sill: 0.6, head: 1.0, between: ['bathroomUp', 'outside'] },
  { kind: 'window', cell: [1, 5], side: 'right', sill: 0.6, head: 1.0, between: ['bathroomUp', 'outside'] },
  { kind: 'window', cell: [4, 5], side: 'right', sill: 0.35, head: 1.0, between: ['bedroom', 'outside'] },
  { kind: 'window', cell: [6, 3], side: 'front', sill: 0.35, head: 1.0, between: ['bedroom', 'outside'] },
];

export const UPPER_ITEMS: readonly ItemDef[] = [
  // ── The family bathroom, 3x3. The bath runs along the right-hand wall under
  // the window (a 1.7 m tub is over two cells long, which is why it lives up
  // here); shower in the back corner; toilet and basin along the front wall.
  // Nothing goes on the wall the door is in — [2,2]'s right edge.
  { id: 'up-bath', kind: 'bathtub', mount: { on: 'floor', cell: [1, 5], facing: 'w', offset: [0.045, 0] } },
  { id: 'up-shower', kind: 'shower', mount: { on: 'floor', cell: [0, 3], facing: 's', offset: [0.03, 0.03] } },
  { id: 'up-sink', kind: 'sink', mount: { on: 'floor', cell: [2, 3], facing: 'n', offset: [0, 0.195] } },
  { id: 'up-toilet', kind: 'toilet', mount: { on: 'floor', cell: [2, 4], facing: 'n', offset: [0, 0.07] } },

  // ── Main bedroom: bed head against the bathroom partition, a nightstand
  // either side of it, wardrobe on the right-hand wall clear of the window.
  { id: 'bedroom-bed', kind: 'bed', mount: { on: 'floor', cell: [3, 3], facing: 's', offset: [0, 0.58] } },
  { id: 'bedroom-nightstand-l', kind: 'nightstand', mount: { on: 'floor', cell: [3, 2], facing: 's', offset: [0.055, -0.22] } },
  { id: 'bedroom-nightstand-r', kind: 'nightstand', mount: { on: 'floor', cell: [3, 4], facing: 's', offset: [-0.055, -0.22] } },
  { id: 'bedroom-wardrobe', kind: 'wardrobe', mount: { on: 'floor', cell: [5, 5], facing: 'w', offset: [0.12, 0] } },
  // Moved off [3,3]'s back edge: that is now the bed's headboard wall. On the
  // front wall it faces the bed instead of standing behind it.
  { id: 'bedroom-tv', kind: 'tv', mount: { on: 'wall', cell: [6, 2], side: 'front', height: 0.55 } },

  // ── Small bedroom. The room is only two cells deep and a bed is 2 m long, so
  // this one runs ACROSS the room ('e') rather than head-to-back-wall: 2 m does
  // not fit between two walls 1 m apart once the walls have thickness.
  { id: 'small-bed', kind: 'bed', mount: { on: 'floor', cell: [1, 0], facing: 'e', offset: [0.58, -0.5] } },
  { id: 'small-nightstand', kind: 'nightstand', mount: { on: 'floor', cell: [0, 2], facing: 's', offset: [0, -0.22] } },
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