// src/core/shared/errors.ts
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
  // Mounted INSIDE something that doesn't open. A closed box with a cup in it is
  // a cup nobody can ever see, which is a mistake and not a hiding place.
  | { readonly tag: 'ItemHasNoInside'; readonly id: string; readonly host: string }
  | { readonly tag: 'NoSuchShelf'; readonly id: string; readonly host: string; readonly part: string; readonly shelf: number; readonly shelves: number }
  // Mounted inside a part the host does not have — "in the freezer" of a
  // cupboard. Names the parts it DOES have, because the fix is always to pick
  // one of them.
  | { readonly tag: 'NoSuchPart'; readonly id: string; readonly host: string; readonly part: string; readonly parts: readonly string[] }
  | { readonly tag: 'ItemNotOnWall'; readonly id: string; readonly cell: Cell; readonly side: Side }
  | { readonly tag: 'ItemTooHigh'; readonly id: string; readonly top: number; readonly limit: number }
  // ── Fit. The two ways furniture can be placed somewhere it does not go, both
  // of which used to compile cleanly and were caught, if at all, by eye.
  | {
      readonly tag: 'ItemOutsideRoom';
      readonly id: string;
      readonly room: RoomKey;
      readonly cell: Cell; // the cell it reaches into that isn't its room
    }
  | { readonly tag: 'ItemsOverlap'; readonly a: string; readonly b: string }

  // ── House level: storeys stacked together ──
  | { readonly tag: 'EmptyHouse' }
  | { readonly tag: 'DuplicateStorey'; readonly level: number }
  | { readonly tag: 'FloatingStorey'; readonly level: number; readonly missing: number }
  | { readonly tag: 'DuplicateRoomKey'; readonly key: string }
  | { readonly tag: 'UnreachableStorey'; readonly level: number }

  // ── Stairs ────────────────────────────
  | { readonly tag: 'DuplicateStairId'; readonly id: string }
  | { readonly tag: 'StairNotStraight'; readonly id: string }
  | { readonly tag: 'StairTooShort'; readonly id: string }
  | { readonly tag: 'StairCellInvalid'; readonly id: string; readonly cell: Cell }
  | { readonly tag: 'StairArrivalInvalid'; readonly id: string; readonly cell: Cell }
  | { readonly tag: 'StairDepartureInvalid'; readonly id: string; readonly cell: Cell }
  | { readonly tag: 'StairWithoutStoreyAbove'; readonly id: string; readonly level: number }

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
    case 'ItemHasNoInside':
      return `Item '${e.id}' is mounted inside '${e.host}', which does not open — nothing put in it could ever be seen.`;

    case 'NoSuchShelf':
      return `Item '${e.id}' asks for shelf ${String(e.shelf)} of the ${e.part} of '${e.host}', which has ${String(e.shelves)}.`;

    case 'NoSuchPart':
      return `Item '${e.id}' is mounted in the '${e.part}' of '${e.host}', which has: ${e.parts.join(', ')}.`;

    case 'ItemNotMountable':
      return `Item '${e.id}' can't sit on '${e.host}' — nothing rests on that kind of item.`;
    case 'ItemNotOnWall':
      return `Item '${e.id}' hangs on the ${e.side} of ${fmtCell(e.cell)}, but there's no wall there.`;
    case 'ItemTooHigh':
      return `Item '${e.id}' reaches ${e.top.toFixed(2)}, above the ${e.limit.toFixed(2)} wall — it would poke through the ceiling.`;
    case 'ItemOutsideRoom':
      return `Item '${e.id}' is in '${e.room}' but overhangs ${fmtCell(e.cell)}, which isn't — it would stick through a wall.`;
    case 'ItemsOverlap':
      return `Items '${e.a}' and '${e.b}' occupy the same space.`;
    case 'EmptyHouse':
      return `The house has no storeys.`;
    case 'DuplicateStorey':
      return `Two storeys both claim level ${e.level} — levels must be unique.`;
    case 'FloatingStorey':
      return `Level ${e.level} floats: there's no level ${e.missing} beneath it.`;
    case 'DuplicateRoomKey':
      return `Two rooms share the key '${e.key}'. Keys are unique across the whole house, storeys included — give one a distinct key (they can still share a name).`;
    case 'UnreachableStorey':
      return `Level ${e.level} can't be reached — no stairs connect it to the rest of the house.`;
    case 'DuplicateStairId':
      return `Two stairs share the id '${e.id}' — stair ids must be unique.`;
    case 'StairNotStraight':
      return `Stair '${e.id}' bends: its bottom and top treads must share a row or a column.`;
    case 'StairTooShort':
      return `Stair '${e.id}' has no run — its bottom and top treads are the same cell.`;
    case 'StairCellInvalid':
      return `Stair '${e.id}' runs through ${fmtCell(e.cell)}, which isn't inside a room on that storey.`;
    case 'StairArrivalInvalid':
      return `Stair '${e.id}' would arrive at ${fmtCell(e.cell)} upstairs, which isn't inside a room. Extend the room, or move the stair.`;
    case 'StairDepartureInvalid':
      return `Stair '${e.id}' has no floor at its foot — ${fmtCell(e.cell)} isn't inside a room on this storey. Extend the plan past the bottom step rather than shortening the run, which only steepens the pitch.`;
    case 'StairWithoutStoreyAbove':
      return `Stair '${e.id}' climbs out of level ${e.level}, but there's no level ${e.level + 1} to arrive on.`;
    case 'UnknownTextureKey':
      return `Unknown texture key '${e.key}'.`;
    default:
      return assertNever(e);
  }
}