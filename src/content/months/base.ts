// src/content/months/base.ts
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

// ── THE BASE PLAN ──────────────────────────────────────────────────────────
//
// This is the house every month falls back to. A month that wants to differ
// gets its own file beside this one and an entry in content/house.ts; until it
// has one it renders exactly this, so adding a month costs nothing.
//
// SIZE: 9 x 10 cells on the ground floor. At CELL = 0.5 and 1 unit = 2 m that
// is 9 m x 10 m. It was 6 x 9 and too tight to live in — a sofa is two cells
// wide on its own, and with furniture in a room four cells across there was no
// route past it. Rooms are sized from what has to fit plus a walkway, not the
// other way round.

// Need empty space in the plan? Add `_` to this import and drop it in the grid.
import { defineRoom, type Grid, type ItemDef, type Opening, type Stair, type Storey } from '../../core/house/blocks';

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
// 9 wide x 10 deep. A kitchen across the back with its dining wing at the right
// end, a WC tucked into the back-right corner, and one big living room across
// the front that the staircase rises out of.
//
// TWO doorways connect living room to kitchen, not one. With a single door the
// only route between the halves of the house ran past the sofa, and any piece
// of furniture near it turned circulation into a bottleneck. Two openings mean
// there is always a way round whatever is in the middle of the room.
//
// The staircase occupies the living room's LEFT column, rows 7 up to 4. Four
// cells of run over a 1.2 rise is a 31 degree pitch — a comfortable domestic
// stair. It was three cells and 38.7 degrees, which is steep enough to notice.
// Nothing else may sit on that column between those rows.
//
//        col:  0  1  2  3  4  5  6  7  8
export const GROUND_FLOOR: Grid = [
  /* row 0 */ [K, K, K, K, K, K, K, B, B],
  /* row 1 */ [K, K, K, K, K, K, K, B, B],
  /* row 2 */ [K, K, K, K, K, K, K, B, B],
  // The kitchen runs full width beneath the WC, which is what makes the WC an
  // interior room with one door rather than a block bitten out of the corner.
  /* row 3 */ [K, K, K, K, K, K, K, K, K],
  /* row 4 */ [L, L, L, L, L, L, L, L, L],
  /* row 5 */ [L, L, L, L, L, L, L, L, L],
  /* row 6 */ [L, L, L, L, L, L, L, L, L],
  /* row 7 */ [L, L, L, L, L, L, L, L, L],
  // Rows 8-9 are the SETBACK: the ground floor reaches two cells further
  // forward than the upper storey, so the front of the house is single-height
  // and gets its own lower roof.
  /* row 8 */ [L, L, L, L, L, L, L, L, L],
  /* row 9 */ [L, L, L, L, L, L, L, L, L],
];

// ── Doors. `swing` is which way the panel opens. ──
export const DOORS: readonly Opening[] = [
  { kind: 'door', cell: [9, 4], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
  // The two kitchen doorways. Far enough apart that furniture in the middle of
  // the living room can never block both.
  { kind: 'door', cell: [4, 2], side: 'back', swing: 'in', between: ['livingRoom', 'kitchen'] },
  { kind: 'door', cell: [4, 6], side: 'back', swing: 'in', between: ['livingRoom', 'kitchen'] },
  { kind: 'door', cell: [2, 7], side: 'front', swing: 'in', between: ['bathroom', 'kitchen'] },
];

// ── Windows. `sill`/`head` are the bottom/top heights (0 = floor, wall is 1.2
// tall). The window's LOOK follows its room automatically. Nothing on the living
// room's left wall between rows 4 and 7 — that's the staircase. ──
export const WINDOWS: readonly Opening[] = [
  { kind: 'window', cell: [0, 1], side: 'back', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [0, 5], side: 'back', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [1, 0], side: 'left', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
  { kind: 'window', cell: [1, 8], side: 'right', sill: 0.6, head: 1.0, between: ['bathroom', 'outside'] },
  { kind: 'window', cell: [9, 2], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [9, 6], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [6, 8], side: 'right', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
  { kind: 'window', cell: [8, 0], side: 'left', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
];

// ── Items: furniture. WHERE each one sits is a `mount`:
//   { on: 'floor', cell, offset?, facing? }       — standing on the floor of a cell
//   { on: 'item',  host, offset?, facing? }       — sitting on top of another item
//   { on: 'wall',  cell, side, height, offset? }  — hung on a wall, facing the room
// Offsets are fractions of a CELL (1.0 = one whole cell), so the numbers that
// press a unit against a wall are small. A wall item's facing is derived — it
// always looks into the room. Ids must be unique; order doesn't matter, so a
// laptop may be listed before its table. ──
export const ITEMS: readonly ItemDef[] = [
  // ── The kitchen run, along the back wall between the two windows. The
  // dishwasher slots in at the far end, next to the dining wing.
  { id: 'kitchen-fridge', kind: 'fridge', mount: { on: 'floor', cell: [0, 0], facing: 's', offset: [-0.12, -0.095] } },
  { id: 'kitchen-counter-l', kind: 'counter', mount: { on: 'floor', cell: [0, 2], facing: 's', offset: [0, -0.12] } },
  { id: 'kitchen-oven', kind: 'oven', mount: { on: 'floor', cell: [0, 3], facing: 's', offset: [0, -0.12] } },
  { id: 'kitchen-counter-r', kind: 'counter', mount: { on: 'floor', cell: [0, 4], facing: 's', offset: [0, -0.12] } },
  { id: 'kitchen-dishwasher', kind: 'dishwasher', mount: { on: 'floor', cell: [0, 6], facing: 's', offset: [0.1, -0.12] } },

  // ── The dining wing: a 2 m square table with its back to the WC partition,
  // so it reads as belonging to that wall rather than marooned mid-room. Two
  // cells square means the mounting cell is a corner of it, not its middle —
  // the offsets do the centring, which is why they are large here and tiny
  // everywhere else.
  //
  // Three chairs, on the three sides that aren't the wall.
  { id: 'dining-table', kind: 'diningTable', mount: { on: 'floor', cell: [1, 6], facing: 's', offset: [-0.58, 0.5] } },
  { id: 'dining-chair-w', kind: 'chair', mount: { on: 'floor', cell: [2, 4], facing: 'e', offset: [0.13, -0.5] } },
  { id: 'dining-chair-n', kind: 'chair', mount: { on: 'floor', cell: [0, 5], facing: 's', offset: [0.42, 0.21] } },
  { id: 'dining-chair-s', kind: 'chair', mount: { on: 'floor', cell: [3, 5], facing: 'n', offset: [0.42, -0.21] } },

  // ── The WC.
  { id: 'wc-toilet', kind: 'toilet', mount: { on: 'floor', cell: [0, 7], facing: 's', offset: [0, -0.07] } },
  { id: 'wc-sink', kind: 'sink', mount: { on: 'floor', cell: [2, 8], facing: 'w', offset: [0.195, 0] } },

  // ── Living room, arranged around the TV on the kitchen partition. The rug is
  // 12 mm tall and OVERLAPS the table and sofa on purpose — legs and feet stand
  // on it, and nothing that short is an obstacle to walk around.
  { id: 'living-rug', kind: 'rug', mount: { on: 'floor', cell: [7, 4], facing: 's' } },
  { id: 'living-table', kind: 'table', mount: { on: 'floor', cell: [7, 4], facing: 's' } },
  { id: 'work-laptop', kind: 'laptop', mount: { on: 'item', host: 'living-table', offset: [-0.2, -0.1] } },
  { id: 'living-sofa', kind: 'sofa', mount: { on: 'floor', cell: [8, 4], facing: 'n' } },
  { id: 'living-tv', kind: 'tv', mount: { on: 'wall', cell: [4, 4], side: 'back', height: 0.55 } },
  // A reading corner in the far right of the room, well clear of the walkways.
  { id: 'living-bookshelf', kind: 'bookshelf', mount: { on: 'floor', cell: [9, 8], facing: 'w', offset: [0.27, 0] } },
  { id: 'reading-chair', kind: 'chair', mount: { on: 'floor', cell: [9, 7], facing: 'w' } },
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

// SMALLER than the ground floor, on purpose. It stops at row 7 while the ground
// floor runs to row 9, so the front two rows are single-storey and carry their
// own lower roof. Storeys align at cell [0][0], not on their centres.
//
// The landing is an L: a corridor across row 3 serving all three doors, and the
// column of cells above the staircase. Those stair cells have their floor cut
// away automatically, derived from the flight below — so the landing's walkable
// part is the corridor, and [3,0] is where you step off the top step.
//
//        col:  0  1  2  3  4  5  6  7  8
export const UPPER_FLOOR: Grid = [
  /* row 0 */ [S, S, S, S, W, W, W, W, W],
  /* row 1 */ [S, S, S, S, W, W, W, W, W],
  /* row 2 */ [S, S, S, S, W, W, W, W, W],
  /* row 3 */ [U, U, U, U, U, M, M, M, M],
  /* row 4 */ [U, M, M, M, M, M, M, M, M],
  /* row 5 */ [U, M, M, M, M, M, M, M, M],
  /* row 6 */ [U, M, M, M, M, M, M, M, M],
  /* row 7 */ [U, M, M, M, M, M, M, M, M],
];

export const UPPER_DOORS: readonly Opening[] = [
  { kind: 'door', cell: [3, 2], side: 'back', swing: 'in', between: ['landing', 'bedroomSmall'] },
  { kind: 'door', cell: [3, 4], side: 'back', swing: 'in', between: ['landing', 'bathroomUp'] },
  // `swing` is a ROTATION SIGN, not a destination: the compiler orders an
  // opening's sides geometrically as [negative, positive], so which room a given
  // sign points at depends on where that room sits relative to the wall. Two
  // doors on parallel walls can need OPPOSITE values to do the same visible
  // thing. Check by eye, not by reasoning.
  { kind: 'door', cell: [4, 2], side: 'back', swing: 'out', between: ['bedroom', 'landing'] },
];

export const UPPER_WINDOWS: readonly Opening[] = [
  { kind: 'window', cell: [0, 1], side: 'back', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
  { kind: 'window', cell: [2, 0], side: 'left', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
  { kind: 'window', cell: [0, 6], side: 'back', sill: 0.6, head: 1.0, between: ['bathroomUp', 'outside'] },
  { kind: 'window', cell: [1, 8], side: 'right', sill: 0.6, head: 1.0, between: ['bathroomUp', 'outside'] },
  { kind: 'window', cell: [4, 8], side: 'right', sill: 0.35, head: 1.0, between: ['bedroom', 'outside'] },
  { kind: 'window', cell: [7, 2], side: 'front', sill: 0.35, head: 1.0, between: ['bedroom', 'outside'] },
  { kind: 'window', cell: [7, 6], side: 'front', sill: 0.35, head: 1.0, between: ['bedroom', 'outside'] },
];

export const UPPER_ITEMS: readonly ItemDef[] = [
  // ── The family bathroom. The bath runs along the right-hand wall under the
  // window (1.7 m is over two cells long); shower in the back-left corner;
  // basin and WC along the front wall. Nothing goes on the wall the door is in.
  { id: 'up-bath', kind: 'bathtub', mount: { on: 'floor', cell: [1, 8], facing: 'w', offset: [0.045, 0] } },
  { id: 'up-shower', kind: 'shower', mount: { on: 'floor', cell: [0, 4], facing: 's', offset: [0.03, 0.03] } },
  { id: 'up-sink', kind: 'sink', mount: { on: 'floor', cell: [2, 5], facing: 'n', offset: [0, 0.195] } },
  { id: 'up-toilet', kind: 'toilet', mount: { on: 'floor', cell: [2, 6], facing: 'n', offset: [0, 0.07] } },

  // ── Main bedroom: bed head against the landing partition, a nightstand either
  // side, wardrobe on the right-hand wall clear of the window.
  { id: 'bedroom-bed', kind: 'bed', mount: { on: 'floor', cell: [4, 4], facing: 's', offset: [0, 0.58] } },
  { id: 'bedroom-nightstand-l', kind: 'nightstand', mount: { on: 'floor', cell: [4, 3], facing: 's', offset: [0.055, -0.22] } },
  { id: 'bedroom-nightstand-r', kind: 'nightstand', mount: { on: 'floor', cell: [4, 5], facing: 's', offset: [-0.055, -0.22] } },
  { id: 'bedroom-wardrobe', kind: 'wardrobe', mount: { on: 'floor', cell: [6, 8], facing: 'w', offset: [0.12, 0] } },
  // On the front wall between the two windows, facing the foot of the bed.
  { id: 'bedroom-tv', kind: 'tv', mount: { on: 'wall', cell: [7, 4], side: 'front', height: 0.55 } },

  // ── Small bedroom. The room is three cells deep and a bed is 2 m long, so
  // this one runs ACROSS the room ('e') with its head to the left-hand wall.
  { id: 'small-bed', kind: 'bed', mount: { on: 'floor', cell: [1, 0], facing: 'e', offset: [0.58, -0.5] } },
  { id: 'small-nightstand', kind: 'nightstand', mount: { on: 'floor', cell: [0, 2], facing: 's', offset: [0, -0.22] } },
  { id: 'small-wardrobe', kind: 'wardrobe', mount: { on: 'floor', cell: [2, 3], facing: 'n', offset: [0, 0.12] } },
];

// ── The staircase. Rises up the living room's left column, bottom tread by the
// front of the house. The arrival cell upstairs ([3,0], on the landing) and the
// stairwell hole are both DERIVED from this run — nothing else to keep in sync.
export const STAIRS: readonly Stair[] = [{ id: 'main-stair', from: [7, 0], to: [4, 0] }];

// ── The house: storeys snap into an array. `level` is authoritative; array
// order is cosmetic. Push another Storey to add a floor. ──
export const BASE_PLAN: readonly Storey[] = [
  { level: 0, grid: GROUND_FLOOR, openings: [...DOORS, ...WINDOWS], items: ITEMS, stairs: STAIRS },
  { level: 1, grid: UPPER_FLOOR, openings: [...UPPER_DOORS, ...UPPER_WINDOWS], items: UPPER_ITEMS },
];
