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