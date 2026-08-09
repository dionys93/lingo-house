// src/core/blocks.ts
//
// The tiny data layer the authoring grid is built from. `defineRoom` is a plain
// constructor with NO validation — reserved-key and every other check happen in
// the compiler as typed HouseErrors, never as a throw here. That keeps the whole
// "mistakes are values, not crashes" promise intact from the very first call.
//
// Vocabulary (matches rooms.ts): a *cell* is a grid position ([row, col]); a
// *block* is what sits in a cell — a room marker or EMPTY.

export interface RoomDef {
  readonly key: string;
  readonly name: string;
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

// ── Items: furniture/objects placed IN a cell — the click targets of the
// language loop. Authored in storey-local grid space (a cell, like doors);
// the compiler emits world space. Never author world coordinates: that's the
// rule that lets baseY sweep items along with everything else when storeys
// stack. `kind` is a CLOSED union — the shell's factory record plus exhaustive
// checks make the compiler walk you to every site when a kind is added.
export type ItemKind = 'table';
export type Facing = 'n' | 's' | 'e' | 'w'; // n = toward the BACK of the house (row 0)

export interface ItemDef {
  readonly id: string; // unique across the plan; compiler errors on duplicates
  readonly kind: ItemKind;
  readonly cell: Cell; // same addressing as openings
  readonly offset?: readonly [x: number, z: number]; // within-cell nudge, in cell units (0.5 = one cell edge)
  readonly facing?: Facing; // default 's' — toward the front/camera
}