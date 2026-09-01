// src/core/house/compiled.ts
//
// The shapes the compiler EMITS. No logic, no constants, no I/O — just the
// vocabulary that grid.ts, items.ts, openings.ts and every consumer downstream
// agree on.
//
// Split out of grid.ts for one concrete reason: items.ts and openings.ts both
// need these types, and grid.ts needs their functions. With the types living in
// grid.ts that is a straight import cycle. A leaf module of pure types has no
// such problem, and it makes the compiled surface readable in one screen
// instead of hunting for interfaces between 900 lines of derivation.

import type { Cell, RoomKey } from '../shared/errors';
import type { ItemKind, RoomLabels } from './blocks';
import type { Locale } from './labels';
import type { RoofBox } from '../geometry/roof';

export type Vec3 = readonly [number, number, number];
export type WallSide = RoomKey | 'outside';

export interface AABB {
  readonly min: Vec3;
  readonly max: Vec3;
}

export interface CompiledRoom {
  readonly key: RoomKey;
  readonly labels: Record<Locale, RoomLabels>; // carried through; the core never picks a language
  readonly color?: string; // opaque to the core; the factory interprets it
  /** Open air — no ceiling, no roof, and no wall where it meets other open air. */
  readonly outdoor?: boolean;
  readonly cells: readonly Cell[];
  readonly bounds: AABB;
  readonly floor: readonly Vec3[]; // world centre of each cell, at the storey's baseY — one tile each
}

export interface CompiledWall {
  readonly a: Vec3;
  readonly b: Vec3;
  readonly height: number;
  readonly axis: 'x' | 'z'; // the run's direction
  // [neg, pos]: for an axis-'z' wall, neg = smaller-X side, pos = larger-X side;
  // for axis-'x', neg = smaller-Z side, pos = larger-Z side. Each is a room key
  // or 'outside'. This is what lets the factory colour each face by its room.
  readonly sides: readonly [WallSide, WallSide];
}

interface OpeningBase {
  readonly id: string; // stable per edge: `${orient}:${fixed}:${varying}`
  readonly a: Vec3;
  readonly b: Vec3;
  readonly axis: 'x' | 'z';
  readonly height: number; // full wall height; the renderer fills sill/head/lintel
  readonly sides: readonly [WallSide, WallSide];
}
// The storey floor an opening stands on. Openings emit their endpoints at their
// storey's baseY, so THIS is the bottom of the wall around them — not zero, the
// moment there's more than one storey. Renderers that hardcode 0 draw the whole
// opening down at ground level; that's exactly what went wrong with upper-storey
// windows and doors, so the value has a name now rather than being spelled
// `a[1]` in whichever file remembers.
export const openingFloorY = (o: CompiledOpening): number => o.a[1];

// Discriminated on `kind`: a door can't carry a sill, a window can't swing.
// BOTH now carry `sill`/`head`, the opening's true vertical extent — a door's
// sill is the floor. `height` stays the full wall height, which is what the
// renderer fills around the opening.
export type CompiledOpening =
  | (OpeningBase & {
      readonly kind: 'door';
      readonly swing: 'in' | 'out';
      readonly sill: number;
      readonly head: number;
    })
  | (OpeningBase & { readonly kind: 'window'; readonly sill: number; readonly head: number });
export interface CompiledItem {
  readonly id: string;
  readonly kind: ItemKind;
  // Which kind of mount put it here. The shell needs this to answer "does this
  // wall have anything hanging on it?" — asking the geometry alone can't tell a
  // TV bolted to a wall from a table that happens to stand against one.
  readonly mountedOn: 'floor' | 'item' | 'wall';
  readonly position: Vec3; // world, at the floor; baseY already applied
  readonly yaw: number; // radians about Y — shell applies to the whole item group
  readonly bounds: AABB; // world, yaw-aware — for click raycasting
  readonly room: RoomKey; // DERIVED from the cell, never authored
}
// A storey's roofable outline: the world bbox its walls enclose, and the height
// its walls top out at (baseY + WALL_HEIGHT). The roof is a pure function of this —
// the seam that lets the roof "travel" with whatever storey's blocks it sits on.
export interface Footprint {
  readonly bbox: RoofBox;
  readonly wallTopY: number;
}

export interface CompiledGrid {
  readonly rooms: readonly CompiledRoom[];
  readonly walls: readonly CompiledWall[];
  readonly openings: readonly CompiledOpening[];
  readonly items: readonly CompiledItem[];
  readonly footprint: Footprint; // roof is computed from this, not baked in here
}
/** Tuple constructor, so the readonly Vec3 shape is written once. */
export const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];