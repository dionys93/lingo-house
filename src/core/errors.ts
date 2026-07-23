// src/core/errors.ts
//
// Every way a house plan can be wrong, as one discriminated union. compileScene
// returns these instead of throwing or silently dropping, so an authoring
// mistake becomes a typed value the tool can render — never a crash, never a
// no-render (the old `if (!Item) return null` / `if (!r) return null` failures).
//
// This union is a SUPERSET of what any one slice produces. Slice 1 emits only
// the grid errors, but doors and stairs are already designed (locked decisions),
// so their variants live here now — the error-display switch handles them all
// from day one, and switch-exhaustiveness-check guarantees future variants can't
// slip through unhandled. Item errors are deliberately ABSENT until the item
// placement model is finalized; no speculative variants.
//
// NOTE: Cell / RoomKey / Side are declared here because errors.ts is the first
// core file that needs them. They'll migrate to a shared `types.ts` when we
// write the plan/spec types, and this file will import them instead.

export type Cell = readonly [row: number, col: number];
export type RoomKey = string;
export type Side = 'front' | 'back' | 'left' | 'right';

export type HouseError =
  // ── Grid ──────────────────────────────────────────────────────────────────
  | { readonly tag: 'EmptyGrid' }
  | { readonly tag: 'ReservedRoomKey'; readonly key: RoomKey } // 'outside' / EMPTY used as a room
  | { readonly tag: 'DisconnectedRoom'; readonly room: RoomKey; readonly regions: number }
  //   ↑ pending open question (A): may become legal (multiple buildings) or an
  //     alias for "two rooms sharing a name". Until decided, it's an error.

  // ── Doors ─────────────────────────────  (placed by cell + side)
  | { readonly tag: 'DoorCellOutOfBounds'; readonly cell: Cell }
  | { readonly tag: 'DoorCellEmpty'; readonly cell: Cell }
  | { readonly tag: 'DoorNotOnWall'; readonly cell: Cell; readonly side: Side } // both sides same room → no wall to cut
  | { readonly tag: 'DoorRoomUnknown'; readonly room: RoomKey } // optional `between` names a nonexistent room
  | {
      readonly tag: 'DoorConnectsWrongRooms'; // `between` given, but the named edge connects other rooms
      readonly cell: Cell;
      readonly side: Side;
      readonly expected: readonly [RoomKey, RoomKey];
      readonly actual: readonly [RoomKey | 'outside', RoomKey | 'outside'];
    }

  // ── Stairs ────────────────────────────  (placed by starts/ends; hole derived; land on ends+1)
  | { readonly tag: 'StairEndpointOutOfBounds'; readonly endpoint: Cell }
  | { readonly tag: 'StairsNotStraight'; readonly starts: Cell; readonly ends: Cell } // differ on both axes
  | { readonly tag: 'StairFootOnEmptyCell'; readonly starts: Cell }
  | { readonly tag: 'StairLandsInEmptySpace'; readonly landing: Cell } // ends+1 empty or off the upper grid
  | {
      readonly tag: 'StairConnectsWrongRooms';
      readonly expected: readonly [RoomKey, RoomKey];
      readonly actual: readonly [RoomKey, RoomKey];
    }

  // ── Textures ──────────────────────────
  | { readonly tag: 'UnknownTextureKey'; readonly key: string };

// Sanctioned throw. Reaching this means a tagged union grew a variant that a
// switch didn't handle — a programming bug, not a recoverable condition. Pair it
// with an exhaustive switch (default: assertNever(x)) so switch-exhaustiveness-
// check flags the gap at compile time and this line effectively never runs.
export const assertNever = (x: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
};