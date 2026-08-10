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
// slip through unhandled. Item errors landed with the locked item model.
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

  // ── Openings (doors + windows; placed by cell + side) ──
  | { readonly tag: 'OpeningCellOutOfBounds'; readonly cell: Cell }
  | { readonly tag: 'OpeningCellEmpty'; readonly cell: Cell }
  | { readonly tag: 'OpeningNotOnWall'; readonly cell: Cell; readonly side: Side } // side faces the same room → no wall
  | {
      readonly tag: 'OpeningConnectsWrongRooms'; // `between` given, but the edge connects other rooms
      readonly cell: Cell;
      readonly side: Side;
      readonly expected: readonly [RoomKey, RoomKey];
      readonly actual: readonly [RoomKey | 'outside', RoomKey | 'outside'];
    }
  | { readonly tag: 'OpeningsOverlap'; readonly cell: Cell; readonly side: Side } // two openings on one edge
  | { readonly tag: 'WindowSillAboveHead'; readonly cell: Cell; readonly side: Side; readonly sill: number; readonly head: number }
  | { readonly tag: 'WindowExceedsWall'; readonly cell: Cell; readonly side: Side; readonly head: number; readonly wallHeight: number }

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

  // ── Items (placed by cell; model locked — see planning doc) ──
  | { readonly tag: 'ItemCellOutOfBounds'; readonly id: string; readonly cell: Cell }
  | { readonly tag: 'ItemCellEmpty'; readonly id: string; readonly cell: Cell }
  | { readonly tag: 'DuplicateItemId'; readonly id: string }
  | { readonly tag: 'UnknownMountHost'; readonly id: string; readonly host: string }
  | { readonly tag: 'MountCycle'; readonly ids: readonly string[] }
  | { readonly tag: 'ItemNotMountable'; readonly id: string; readonly host: string }
  | { readonly tag: 'ItemNotOnWall'; readonly id: string; readonly cell: Cell; readonly side: Side }
  | { readonly tag: 'ItemTooHigh'; readonly id: string; readonly top: number; readonly limit: number }

  // ── Textures ──────────────────────────
  | { readonly tag: 'UnknownTextureKey'; readonly key: string };

// Sanctioned throw. Reaching this means a tagged union grew a variant that a
// switch didn't handle — a programming bug, not a recoverable condition. Pair it
// with an exhaustive switch (default: assertNever(x)) so switch-exhaustiveness-
// check flags the gap at compile time and this line effectively never runs.
export const assertNever = (x: never): never => {
  throw new Error(`Unhandled variant: ${JSON.stringify(x)}`);
};

// A human-readable, diagnostic message for each error — cell, side, room, and so
// on, not just the tag. Exhaustive on purpose: adding a HouseError variant won't
// compile until it has a message here, so the panel can never under-report.
const fmtCell = (c: Cell): string => `[${c[0]}, ${c[1]}]`;

export function describeError(e: HouseError): string {
  switch (e.tag) {
    case 'EmptyGrid':
      return 'The grid is empty — there are no rooms to build.';
    case 'ReservedRoomKey':
      return `Room key '${e.key}' is reserved (it names the exterior). Rename that room.`;
    case 'DisconnectedRoom':
      return `Room '${e.room}' appears in ${e.regions} separate places — each room must be one connected blob.`;
    case 'OpeningCellOutOfBounds':
      return `Opening at cell ${fmtCell(e.cell)} is off the grid.`;
    case 'OpeningCellEmpty':
      return `Opening at cell ${fmtCell(e.cell)} sits on an empty cell — put it on a room.`;
    case 'OpeningNotOnWall':
      return `Opening at ${fmtCell(e.cell)} side '${e.side}' isn't on a wall — that side faces the same room.`;
    case 'OpeningConnectsWrongRooms':
      return `Opening at ${fmtCell(e.cell)} side '${e.side}': you said ${e.expected.join(' ↔ ')}, but that wall connects ${e.actual.join(' ↔ ')}.`;
    case 'OpeningsOverlap':
      return `Two openings share one edge (at ${fmtCell(e.cell)} side '${e.side}') — only one opening per edge.`;
    case 'WindowSillAboveHead':
      return `Window at ${fmtCell(e.cell)} side '${e.side}': sill (${e.sill}) is at or above head (${e.head}).`;
    case 'WindowExceedsWall':
      return `Window at ${fmtCell(e.cell)} side '${e.side}': head (${e.head}) exceeds the wall height (${e.wallHeight}).`;
    case 'StairEndpointOutOfBounds':
      return `Stair endpoint ${fmtCell(e.endpoint)} is off the grid.`;
    case 'StairsNotStraight':
      return `Stair from ${fmtCell(e.starts)} to ${fmtCell(e.ends)} isn't a straight run.`;
    case 'StairFootOnEmptyCell':
      return `Stair foot ${fmtCell(e.starts)} sits on an empty cell.`;
    case 'StairLandsInEmptySpace':
      return `Stair lands at ${fmtCell(e.landing)}, where there's no room above to step onto.`;
    case 'StairConnectsWrongRooms':
      return `Stair: you said ${e.expected.join(' ↔ ')}, but it connects ${e.actual.join(' ↔ ')}.`;
    case 'ItemCellOutOfBounds':
      return `Item '${e.id}' at cell ${fmtCell(e.cell)} is off the grid.`;
    case 'ItemCellEmpty':
      return `Item '${e.id}' at cell ${fmtCell(e.cell)} sits on an empty cell — put it in a room.`;
    case 'DuplicateItemId':
      return `Two items share the id '${e.id}' — item ids must be unique.`;
    case 'UnknownMountHost':
      return `Item '${e.id}' is mounted on '${e.host}', but there is no item with that id.`;
    case 'MountCycle':
      return `These items are mounted on each other in a loop: ${e.ids.join(' → ')}.`;
    case 'ItemNotMountable':
      return `Item '${e.id}' can't sit on '${e.host}' — nothing rests on that kind of item.`;
    case 'ItemNotOnWall':
      return `Item '${e.id}' hangs on the ${e.side} of ${fmtCell(e.cell)}, but there's no wall there.`;
    case 'ItemTooHigh':
      return `Item '${e.id}' reaches ${e.top.toFixed(2)}, above the ${e.limit.toFixed(2)} wall — it would poke through the ceiling.`;
    case 'UnknownTextureKey':
      return `Unknown texture key '${e.key}'.`;
    default:
      return assertNever(e);
  }
}