// src/scene/wallMaterials.ts
//
// Shared wall-surface logic, so Walls and Doors (the door's lintel is a wall
// piece) colour faces the same way instead of duplicating it. Colour is always
// driven by a face's SIDE — the room on it, or the house siding for 'outside'.

import type { CompiledRoom, WallSide } from '../core/grid';

export type Triple = [number, number, number];

export const WALL_THICKNESS = 0.08; // shell constant — the core emits centreline + height only
export const HOUSE_SIDING = '#dfd3c3'; // exterior default, for any face meeting 'outside'
export const DEFAULT_INTERIOR = '#d8d2c8'; // rooms authored without a colour
export const TRIM = '#c4b8a4'; // top / bottom / end faces

// side → colour, resolved once from the compiled rooms.
export function buildColorOf(rooms: readonly CompiledRoom[]): (side: WallSide) => string {
  const byKey = new Map(rooms.map((r) => [r.key, r.color ?? DEFAULT_INTERIOR]));
  return (side) => (side === 'outside' ? HOUSE_SIDING : (byKey.get(side) ?? DEFAULT_INTERIOR));
}

// BoxGeometry face order is [+X, -X, +Y, -Y, +Z, -Z]. A 'z'-axis piece is thin in
// X, so its broad faces are ±X; an 'x'-axis piece thin in Z, so ±Z. neg is the
// smaller-coordinate side, pos the larger. Edge faces get TRIM.
export function faceColors(
  axis: 'x' | 'z',
  sides: readonly [WallSide, WallSide],
  colorOf: (side: WallSide) => string,
): [string, string, string, string, string, string] {
  const neg = colorOf(sides[0]);
  const pos = colorOf(sides[1]);
  return axis === 'z'
    ? [pos, neg, TRIM, TRIM, TRIM, TRIM]
    : [TRIM, TRIM, TRIM, TRIM, pos, neg];
}