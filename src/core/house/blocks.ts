// src/core/house/blocks.ts
//
// The tiny data layer the authoring grid is built from. `defineRoom` is a plain
// constructor with NO validation — reserved-key and every other check happen in
// the compiler as typed HouseErrors, never as a throw here. That keeps the whole
// "mistakes are values, not crashes" promise intact from the very first call.
//
// Vocabulary (matches rooms.ts): a *cell* is a grid position ([row, col]); a
// *block* is what sits in a cell — a room marker or EMPTY.

// A room carries its own labels because room keys are authored and open-ended —
// a central Record<RoomKey, ...> couldn't be checked for completeness without
// making RoomKey generic through the whole core. Here the compiler still refuses
// a room that lacks a name in any language.
//   name  — what the room is called ("the kitchen" / "la cocina")
//   enter — the phrase on a door LEADING HERE ("Open the door to the kitchen").
//           Keyed by DESTINATION, not by door: it's a fact about the room, so
//           every door that arrives here says it and adding a door costs no text.
import type { Locale } from './labels';

//   name  — what the room is called ("the kitchen" / "la cocina")
//   enter — the phrase on a DOOR leading here ("Open the door to the kitchen")
//   up    — the phrase on a STAIR climbed to get here ("Go up to the landing")
//   down  — the phrase on a stair descended to get here ("Go down to the hall")
//
// All keyed by DESTINATION, not by the door or stair: arriving somewhere is a
// fact about the place you arrive at, so every route here says the same thing
// and adding a route costs no new text.
//
// `up` and `down` are BOTH required even though most rooms only ever get one:
// which applies depends on where the traveller started, not on the room, and the
// compiler can't know that. Writing them out beats composing them — "sube al
// baño" but "sube a la cocina", and a language app that teaches `a el` is worse
// than one that teaches less.
export interface RoomLabels {
  readonly name: string;
  readonly enter: string;
  readonly up: string;
  readonly down: string;
}

export interface RoomDef {
  readonly key: string;
  readonly labels: Record<Locale, RoomLabels>;
  readonly color?: string; // interior colour; absent = house default. Opaque to the core.
  /**
   * OPEN AIR. A patio, a lawn, a terrace: floor you can stand on, with a name
   * you can learn, and no building over it.
   *
   * This one flag is what turns the grid from THE BUILDING into THE PLOT. Before
   * it, every cell was either a room or nothing, and "nothing" is what made a
   * wall appear at the edge of the house — so a paved yard behind the kitchen
   * could only be drawn as a room, and drawing it as a room walled and roofed
   * it. There was no way to say "this is somewhere, and it is outside".
   *
   * It changes exactly three derivations, each in one place:
   *
   *   WALLS      — a wall exists where two sides differ AND they are not both
   *                open air. Patio against kitchen is the house's back wall;
   *                patio against lawn, or against the edge of the plot, is
   *                nothing at all.
   *   ROOF       — roofing reads the BUILDING (see `roofed` below), so a patio
   *                is not a rectangle wanting a gable over it.
   *   CEILING    — there isn't one. That is a render decision and it reads the
   *                same flag.
   *
   * Everything else treats it as the room it is: it has labels in every
   * language, it is a Location you can stand in, items sit on it, and the
   * fit checks apply. Which is the point — "el patio" is a word to learn.
   */
  readonly outdoor?: boolean;
}

export const EMPTY = Symbol('empty');
export type Empty = typeof EMPTY;

// The authoring shorthand for an empty cell, exported so every plan and test
// IMPORTS it instead of re-declaring `const _ = EMPTY`. That re-declaration is
// silently broken: `EMPTY` is a `unique symbol`, but aliasing it through an
// un-annotated `const` widens it to plain `symbol`, which is not assignable to
// `Block` — so any grid literal containing a locally-aliased `_` fails to
// compile. Annotating at each site would work; exporting it once means nobody
// has to know.
export const _: Empty = EMPTY;

export type Block = RoomDef | Empty;
export type Grid = readonly (readonly Block[])[];

export const defineRoom = (def: RoomDef): RoomDef => def;

export const isRoom = (b: Block): b is RoomDef => b !== EMPTY;

/** Open air: a named outdoor place, or nothing at all. Both are sky. */
export const isOpenAir = (b: Block): boolean => b === EMPTY || b.outdoor === true;

/**
 * The plan with its open-air cells taken out — THE BUILDING, from the plot.
 *
 * Roofing and setbacks are questions about the building, and every one of them
 * is already written in terms of "is this cell filled". Handing them a grid
 * where a patio reads as empty is what makes them right about a patio without
 * any of them learning what a patio is.
 */
export const roofed = (grid: Grid): Grid =>
  grid.map((row) => row.map((b): Block => (isRoom(b) && b.outdoor === true ? EMPTY : b)));

// ── Openings: doors and windows, placed ON a wall by naming a cell and which of
// its sides the wall is on (same cell+side model as the compiler validates). A
// discriminated union so a door can't carry a sill and a window can't swing.
// `between` is an optional cross-check: the edge must connect those two rooms.
import type { Cell, Side } from '../shared/errors';

export type Opening =
  | {
      readonly kind: 'door';
      readonly cell: Cell;
      readonly side: Side;
      readonly swing: 'in' | 'out';
      readonly between?: readonly [string, string];
    }
  | {
      readonly kind: 'window';
      readonly cell: Cell;
      readonly side: Side;
      readonly sill: number; // height of the window's bottom edge, in world units
      readonly head: number; // height of its top edge
      readonly between?: readonly [string, string];
    };

// ── Items: furniture/objects — the click targets of the language loop.
// Authored in storey-local grid space; the compiler emits world space. Never
// author world coordinates: that's the rule that lets baseY sweep items along
// with everything else when storeys stack. `kind` is a CLOSED union — the
// shell's factory record plus exhaustive checks make the compiler walk you to
// every site when a kind is added.
// Grouped by the room that usually owns them. Adding one here walks the
// compiler through every site that must learn about it: ITEM_SPECS (size), the
// shell's factory record (what it looks like), and the label table (its name in
// every language). None of the three can be forgotten.
export type ItemKind =
  // Living / general
  | 'table'
  | 'chair'
  | 'sofa'
  | 'rug'
  | 'bookshelf'
  // Two lamps, not one with a height knob. A table lamp and a floor lamp are
  // two words in every language this teaches, and a learner who meets "la
  // lámpara de pie" has learned something a taller `lamp` would have hidden.
  | 'lamp'
  | 'floorLamp'
  | 'pottedPlant'
  // Electronics
  | 'laptop'
  | 'tv'
  // Kitchen
  // `diningTable` is its own kind rather than a bigger `table`: the living
  // room's table is a coffee table, and one shared kind cannot be 2 m square
  // there and 0.9 m here. Separate kinds also give the learner two words,
  // which is the point of the app.
  | 'diningTable'
  | 'counter'
  // A base unit that OPENS, with plates and cups on its shelves. The counter is
  // the same carcass with a worktop and no doors — two kinds because they are
  // two words, and because only one of them is a thing you can open.
  | 'cupboard'
  | 'dishwasher'
  | 'oven'
  | 'fridge'
  // Bathroom
  // Things small enough to live on a shelf. They exist so that opening a
  // cupboard shows you something, which is the entire reason opening is worth
  // building: the contents are more vocabulary, met where a learner would meet
  // them.
  | 'plate'
  | 'cup'
  | 'toilet'
  | 'bathtub'
  | 'shower'
  | 'sink'
  // Bedroom
  | 'bed'
  | 'wardrobe'
  | 'nightstand';
export type Facing = 'n' | 's' | 'e' | 'w'; // n = toward the BACK of the house (row 0)

// WHERE an item sits is a RELATIONSHIP, not a coordinate — and the three kinds
// of relationship don't take the same information, so they're a discriminated
// union rather than one record of optional fields. A wall-mounted TV has no
// `facing` (it must face into the room — derived, not authored) and no 2-D
// offset (it can only slide ALONG the wall, so its offset is a scalar); a
// laptop on a table has no cell of its own. Optional fields would let you
// author every one of those contradictions and need runtime checks to catch
// them. This way they don't typecheck.
export type Mount =
  // On the floor of a cell. `offset` nudges within the cell, in cell fractions.
  | {
      readonly on: 'floor';
      readonly cell: Cell;
      readonly offset?: readonly [x: number, z: number];
      readonly facing?: Facing;
    }
  // On top of another item. `offset` is in fractions of the HOST's footprint and
  // is applied in the host's own rotated frame, so [0.25, 0] means "a quarter of
  // the way toward the host's right", whichever way the host is turned. Facing
  // defaults to the host's, so a laptop lines up with its table for free.
  | {
      readonly on: 'item';
      readonly host: string;
      readonly offset?: readonly [x: number, z: number];
      readonly facing?: Facing;
    }
  // INSIDE another item — on a shelf in a cupboard, in a drawer, in the fridge.
  //
  // A separate mount from `on: 'item'` rather than a flag on it, because the two
  // differ in what they need and in what they MEAN. On top of a table is a place
  // you can always see; inside a cupboard is a place you can see only when the
  // cupboard is open, which is the whole point of it. `shelf` indexes the host
  // spec's shelf heights (0 is the lowest); `offset` is in fractions of the
  // host's footprint, in the host's own rotated frame, exactly as `on: 'item'`.
  | {
      readonly on: 'inside';
      readonly host: string;
      /** Which openable part's interior — a counter has a drawer AND a
       *  cupboard. Defaults to the host's first part. */
      readonly part?: string;
      readonly shelf?: number;
      readonly offset?: readonly [x: number, z: number];
      readonly facing?: Facing;
    }
  // Hung on the wall on `side` of `cell`, `height` above that storey's floor,
  // measured to the item's underside. Faces into the room automatically.
  | {
      readonly on: 'wall';
      readonly cell: Cell;
      readonly side: Side;
      readonly height: number;
      readonly offset?: number; // slide along the wall, in cell fractions
    };

export interface ItemDef {
  readonly id: string; // unique across the plan; compiler errors on duplicates
  readonly kind: ItemKind;
  readonly mount: Mount;
}

// ── Stairs: the vertical edges of the house. Authored on the LOWER storey,
// because that's where you start climbing.
//
// `from` is the bottom tread's cell and `to` is the top tread's; the cells
// between are derived, and so is the ARRIVAL cell on the storey above — one step
// further along the same line. Nothing about the upper storey is authored here:
// the stairwell hole is exactly the run's cells, cut from the floor above. That
// derivation is the whole point. Authoring the hole separately would let it
// drift out of line with the stair the first time anyone moved one.
export interface Stair {
  readonly id: string; // unique across the house
  readonly from: Cell; // bottom tread, on this storey
  readonly to: Cell; // top tread, on this storey — must share a row or column with `from`
}

// A storey is a grid plus what's in it. `level` is authoritative and array order
// is cosmetic: 0 is the ground, negative is below grade, positive is above.
export interface Storey {
  readonly level: number;
  readonly grid: Grid;
  readonly openings?: readonly Opening[];
  readonly items?: readonly ItemDef[];
  readonly stairs?: readonly Stair[]; // stairs rising OUT of this storey to level + 1
}