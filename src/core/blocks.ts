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