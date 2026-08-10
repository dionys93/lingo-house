// src/core/blocks.ts
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

export interface RoomLabels {
  readonly name: string;
  readonly enter: string;
}

export interface RoomDef {
  readonly key: string;
  readonly labels: Record<Locale, RoomLabels>;
  readonly color?: string; // interior colour; absent = house default. Opaque to the core.
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

// ── Openings: doors and windows, placed ON a wall by naming a cell and which of
// its sides the wall is on (same cell+side model as the compiler validates). A
// discriminated union so a door can't carry a sill and a window can't swing.
// `between` is an optional cross-check: the edge must connect those two rooms.
import type { Cell, Side } from './errors';

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
export type ItemKind = 'table' | 'laptop' | 'tv';
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