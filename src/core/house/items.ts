// src/core/house/items.ts
//
// Furniture: what each kind IS (size, what can rest on it), and where an
// authored mount actually puts it in the world.
//
// The clearest seam out of grid.ts — it has its own test file, its own error
// rows, and its own model (the mount graph). compileGrid hands it a context
// record of lookups rather than letting it reach back into that scope, so
// nothing here knows how a grid is walked.

import { assertNever, type Cell, type HouseError, type Side } from '../shared/errors';
import type { Facing, ItemDef, ItemKind } from './blocks';
import type { NounKey } from './labels';
import { CELL, WALL_HEIGHT, WALL_THICKNESS } from './scale';
import { vec3, type AABB, type CompiledItem, type Vec3, type WallSide } from './compiled';
import { resolveEdge } from './openings';

// ── Items. Canonical per-kind spec — DATA the core needs to place items and
// emit click bounds; what a kind LOOKS like stays in the shell's factory, same
// split as room `color`. `supportsTop` is the height at which OTHER items rest
// on this one — `null` means nothing can, which is what turns "laptop on a TV"
// into a typed error instead of a laptop embedded in a screen.
//
// SIZES ARE REAL, converted once. The house is built at 1 unit = 2 m (CELL is
// 0.5 = a 1 m cell; WALL_HEIGHT 1.2 = a 2.4 m room), so every number below is
// millimetres / 2000. They were stylised to fit a single cell before, which is
// why a table stood 0.68 m tall and a TV was 6 cm thick — dimensions nothing in
// the real world has. Each row carries its real size in the comment so the
// conversion stays checkable, and the few that legitimately exceed one cell (a
// bath, a sofa, a bed) are marked: items may straddle cells, and the rooms that
// hold them are two or three cells wide.
interface ItemSpec {
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly supportsTop: number | null;
  /**
   * Floor covering: other things stand ON this, so sharing its space is the
   * point rather than a mistake.
   *
   * The fit check needs this and no geometric rule can supply it. A rug's box
   * really does intersect the table standing on it — 12 mm of it — and the only
   * thing that distinguishes that from a chair inside a wardrobe is what the
   * object IS. Same fact `collide` reads as "you step over it".
   */
  readonly underfoot?: boolean;
  /**
   * It opens, and there is somewhere inside it.
   *
   * Absent means it doesn't — a sofa has an inside in the woodworking sense and
   * nowhere to put a cup. Present, it is what makes `mount: { on: 'inside' }`
   * legal and what tells the renderer which part swings.
   *
   * `shelves` are heights above the item's own base, lowest first, and there is
   * always at least one: an item that opens onto nothing would be a door with a
   * wall behind it. `inset` is how far in from the outside the usable interior
   * starts, as a fraction of the footprint — carcass plus door thickness — so a
   * plate on a shelf sits inside the box rather than flush with its face.
   */
  readonly opens?: readonly OpenPartSpec[];
}

/**
 * ONE openable part of an item.
 *
 * A list, because a thing can have more than one and the interesting ones do: a
 * counter is a drawer above a cupboard, a fridge is a fridge below a freezer.
 * Modelling `opens` as a single part made those two either wholly open or wholly
 * shut, which is not how either object works and — worse for this app — hid a
 * word. "The freezer" and "the drawer" are their own nouns, and the only way to
 * teach them is for the thing to have parts you can name.
 *
 * `noun` is what the part IS, and it is what the open/close sentence is keyed
 * by: a counter's lower half opens as "the cupboard" because that is what a
 * speaker calls it, not "the counter".
 *
 * `id` is unique within its item and is the renderer's handle on which bit
 * moves. Open state is keyed by `partKey(itemId, id)`, so the shell never has to
 * know that parts exist.
 */
export interface OpenPartSpec<N = NounKey> {
  readonly id: string;
  readonly noun: N;
  /** Which way it moves. Closed so the set of ways cannot quietly grow. */
  readonly as: 'doors' | 'drawer';
  readonly shelves: readonly number[];
  readonly inset?: number;
}

/**
 * A part as CALLERS see it, with its noun narrowed to the openable ones.
 *
 * The declared spec says `NounKey`, because the union of openable nouns is
 * derived from these very entries and cannot be named before they exist. The
 * accessor below narrows it back, which is sound by construction: OpenableNoun
 * IS the set of nouns appearing here, so every value this can hold is in it.
 * That narrowing is what makes `labels[l].opens[part.noun]` total.
 */
export type OpenPart = OpenPartSpec<OpenableNoun>;

/** The key open state is held under: one item's one part. */
export const partKey = (itemId: string, partId: string): string => `${itemId}:${partId}`;

/**
 * The item a part key belongs to.
 *
 * Split on the LAST separator, not the first: item ids are authored and nothing
 * stops one containing a colon, while part ids are ours and never do.
 */
export const itemOfPartKey = (key: string): string => key.slice(0, key.lastIndexOf(':'));
const SPECS = {
  // ── Living / general
  table: { w: 0.44, d: 0.3, h: 0.37, supportsTop: 0.37 }, //   880 ×  600 ×  740
  chair: { w: 0.225, d: 0.25, h: 0.45, supportsTop: null }, //  450 ×  500 ×  900
  sofa: { w: 1.0, d: 0.45, h: 0.425, supportsTop: null }, //   2000 ×  900 ×  850 — 2 cells wide
  rug: { w: 1.0, d: 0.75, h: 0.006, supportsTop: null, underfoot: true }, // 2000 × 1500 × 12
  bookshelf: { w: 0.4, d: 0.15, h: 0.9, supportsTop: null }, // 800 ×  300 × 1800
  // A lamp's `supportsTop` is null for the obvious reason and its shade is the
  // widest part, which is what `w` measures.
  lamp: { w: 0.14, d: 0.14, h: 0.24, supportsTop: null }, //     280 ×  280 ×  480 — a table lamp
  // Stands on the floor and reads at eye height: the shade is at 1.5 m, which
  // is just above a 1.3 m eye, so you look UP into it the way you do in a room.
  floorLamp: { w: 0.19, d: 0.19, h: 0.8, supportsTop: null }, //  380 ×  380 × 1600
  pottedPlant: { w: 0.16, d: 0.16, h: 0.34, supportsTop: null }, // 320 × 320 × 680 to the leaves
  // ── Electronics
  laptop: { w: 0.15, d: 0.105, h: 0.095, supportsTop: null }, // 300 × 210 × 190 open
  tv: { w: 0.44, d: 0.02, h: 0.248, supportsTop: null }, //     880 ×   40 ×  495 — 40", true 16:9
  // ── Kitchen
  diningTable: { w: 1.0, d: 1.0, h: 0.37, supportsTop: 0.37 }, // 2000 × 2000 × 740 — 2 cells square
  // A drawer over a cupboard, and BOTH open. Two parts, two words: you open the
  // drawer or you open the cupboard, and a counter that opened as one thing
  // could teach neither.
  counter: {
    w: 0.6,
    d: 0.3,
    h: 0.45, //                                                 1200 ×  600 ×  900 — worktop
    supportsTop: 0.45,
    opens: [
      { id: 'drawer', noun: 'drawer', as: 'drawer', shelves: [0.31], inset: 0.1 },
      { id: 'doors', noun: 'cupboard', as: 'doors', shelves: [0.08], inset: 0.1 },
    ],
  },
  // A base unit: same carcass as the counter, and it OPENS. Two shelves, at a
  // third and two thirds of the internal height.
  cupboard: {
    w: 0.4,
    d: 0.3,
    h: 0.45, //                                                  800 ×  600 ×  900
    supportsTop: 0.45,
    opens: [{ id: 'doors', noun: 'cupboard', as: 'doors', shelves: [0.06, 0.25], inset: 0.12 }],
  },
  dishwasher: { w: 0.3, d: 0.3, h: 0.425, supportsTop: null }, // 600 × 600 × 850 — slots into the run
  oven: { w: 0.3, d: 0.3, h: 0.45, supportsTop: null }, //       600 ×  600 ×  900 — hob on top, so nothing rests here
  fridge: {
    w: 0.3,
    d: 0.325,
    h: 0.9, //                                                    600 ×  650 × 1800
    supportsTop: null,
    // The freezer is its own part with its own word, and its own door.
    opens: [
      { id: 'door', noun: 'fridge', as: 'doors', shelves: [0.18, 0.4], inset: 0.14 },
      { id: 'freezer', noun: 'freezer', as: 'doors', shelves: [0.72], inset: 0.14 },
    ],
  },
  // ── Shelf things. Small, and the reason a cupboard is worth opening.
  // A STACK of plates, which is what a cupboard holds and what reads at arm's
  // length — a single 24 mm disc on a shelf looks like a coaster.
  plate: { w: 0.13, d: 0.13, h: 0.03, supportsTop: null }, //     260 ×  260 ×   60 — three plates
  cup: { w: 0.04, d: 0.04, h: 0.05, supportsTop: null }, //        80 ×   80 ×  100
  // ── Bathroom
  toilet: { w: 0.185, d: 0.35, h: 0.39, supportsTop: null }, //  370 ×  700 ×  780 to the cistern lid
  bathtub: { w: 0.85, d: 0.375, h: 0.29, supportsTop: null }, // 1700 × 750 ×  580 — 2 cells long
  shower: { w: 0.45, d: 0.45, h: 1.0, supportsTop: null }, //    900 ×  900 × 2000 enclosure
  sink: { w: 0.3, d: 0.225, h: 0.425, supportsTop: null }, //    600 ×  450 ×  850 — basin rim, not a shelf
  // ── Bedroom
  bed: { w: 0.7, d: 1.0, h: 0.5, supportsTop: 0.26 }, //        1400 × 2000 × 1000 headboard; 520 mattress top
  wardrobe: {
    w: 0.5,
    d: 0.3,
    h: 1.0, //                                                   1000 ×  600 × 2000
    supportsTop: null,
    opens: [{ id: 'doors', noun: 'wardrobe', as: 'doors', shelves: [0.08, 0.78], inset: 0.1 }],
  },
  nightstand: {
    w: 0.225,
    d: 0.2,
    h: 0.275, //                                                   450 ×  400 ×  550
    supportsTop: 0.275,
    opens: [{ id: 'drawer', noun: 'drawer', as: 'drawer', shelves: [0.14], inset: 0.14 }],
  },
  // `as const satisfies` and not a plain annotation, for one reason that pays
  // for the extra characters: `satisfies` still checks every entry against
  // ItemSpec and still fails if a kind is missing, and `as const` keeps the
  // literal types — which is what lets OpenableKind below be DERIVED from this
  // table rather than written out a second time beside it.
} as const satisfies Record<ItemKind, ItemSpec>;

/**
 * The table everything reads, at its DECLARED type.
 *
 * Two names for one object because they answer different questions. `SPECS`
 * keeps its literal types, which is what makes OpenableKind derivable below;
 * `ITEM_SPECS` widens them back to ItemSpec, which is what lets a caller
 * holding an arbitrary `kind` read `.opens` at all — under the literal types
 * that property simply does not exist on the entries that lack it.
 */
export const ITEM_SPECS: Record<ItemKind, ItemSpec> = SPECS;

/**
 * The kinds that open, derived from the table above.
 *
 * Not a hand-written union. This codebase has been bitten by "three
 * declarations of the same set" before (see App.tsx's roster), and a list of
 * openable kinds kept beside ITEM_SPECS is exactly that: mark a kind openable
 * and forget the list, and the phrase table stays complete while missing the
 * one word you need.
 *
 * Derived, adding `opens` to a spec immediately breaks every Record<OpenableKind, …>
 * that has not learned the new kind — which is how the label table is made to
 * carry a sentence for it in every language before the build goes green.
 */
export type OpenableKind = {
  [K in ItemKind]: (typeof SPECS)[K] extends { readonly opens: unknown } ? K : never;
}[ItemKind];

/**
 * Every noun that names something openable, derived from the parts above.
 *
 * This, not the item kind, is what the open/close sentences are keyed by — a
 * counter has no sentence of its own, and its two parts borrow the words for a
 * drawer and a cupboard. Derived for the same reason OpenableKind is: give a
 * part a new noun and the label table fails to compile until every language has
 * a sentence for it.
 */
type NounsOf<K extends ItemKind> = (typeof SPECS)[K] extends { readonly opens: infer P }
  ? P extends readonly { readonly noun: infer N }[]
    ? N
    : never
  : never;
export type OpenableNoun = { [K in ItemKind]: NounsOf<K> }[ItemKind];

/**
 * The parts of a kind that open — empty when nothing does.
 *
 * The runtime answer and the type are the same source: OpenableNoun is derived
 * from these very entries, so a caller may index a Record<OpenableNoun, …> with
 * `part.noun` and get a total lookup rather than one with a fallback.
 */
export const openPartsOf = (kind: ItemKind): readonly OpenPart[] =>
  (ITEM_SPECS[kind].opens ?? []) as readonly OpenPart[];

/** One named part of a kind, or null if it has no such part. */
export const openPart = (kind: ItemKind, id: string): OpenPart | null =>
  openPartsOf(kind).find((p) => p.id === id) ?? null;

// facing → rotation about Y, for a model whose local "front" is +Z ('s').
export const ITEM_YAW: Record<Facing, number> = {
  s: 0,
  e: Math.PI / 2,
  n: Math.PI,
  w: -Math.PI / 2,
};

// The inverse, for inheriting a host's orientation. Built FROM ITEM_YAW so the
// two can't drift apart, and keyed by number since that's what a compiled item
// carries.
const FACING_OF_YAW: ReadonlyMap<number, Facing> = new Map(
  (Object.entries(ITEM_YAW) as readonly [Facing, number][]).map(([f, y]) => [y, f]),
);
// Item validation + world placement. Dependencies come in as a context record
// (functions as parameters, no reach-back into compileGrid's scope). Errors
// accumulate; a bad item never silently drops.
//
// Placement is a GRAPH now, not a list: an item mounted on another can't be
// placed until its host is. Resolution is a memoized depth-first walk with a
// `visiting` set, so a mount loop is reported as a MountCycle instead of
// overflowing the stack. Order of authoring doesn't matter — a laptop may be
// listed before the table it sits on.
export interface ItemCtx {
  readonly keyAt: (r: number, c: number) => WallSide;
  readonly xAt: (col: number) => number;
  readonly zAt: (row: number) => number;
  readonly R: number;
  readonly C: number;
  readonly baseY: number;
}

// side → the way an item hung on that wall must face, and which way is INTO the
// room from the wall's centreline. Derived, never authored: a TV facing into the
// wall is not a thing anyone wants, so it shouldn't be expressible.
const WALL_MOUNT: Record<Side, { readonly facing: Facing; readonly inward: 1 | -1 }> = {
  back: { facing: 's', inward: 1 }, // wall at the cell's low-Z edge; room is +Z
  front: { facing: 'n', inward: -1 },
  left: { facing: 'e', inward: 1 }, // wall at the cell's low-X edge; room is +X
  right: { facing: 'w', inward: -1 },
};

// Shared by all three mounts, so the AABB rule lives in exactly one place.
// Yaws are axis-aligned quarter turns, so e/w simply swap the X/Z footprint and
// the box is exact rather than a rotated-box overestimate.
function itemBounds(kind: ItemKind, [x, y, z]: Vec3, facing: Facing): AABB {
  const { w, d, h } = ITEM_SPECS[kind];
  const [hx, hz] = facing === 'e' || facing === 'w' ? [d / 2, w / 2] : [w / 2, d / 2];
  return { min: vec3(x - hx, y, z - hz), max: vec3(x + hx, y + h, z + hz) };
}

export function compileItems(
  items: readonly ItemDef[],
  ctx: ItemCtx,
): { readonly itemErrors: readonly HouseError[]; readonly compiledItems: readonly CompiledItem[] } {
  const { keyAt, xAt, zAt, R, C, baseY } = ctx;
  const itemErrors: HouseError[] = [];

  // Pass 1: index by id. Duplicates are reported here and the FIRST wins, so
  // mounts that name that id resolve against one unambiguous item.
  const byId = new Map<string, ItemDef>();
  for (const def of items) {
    if (byId.has(def.id)) itemErrors.push({ tag: 'DuplicateItemId', id: def.id });
    else byId.set(def.id, def);
  }

  // Pass 2: resolve. `null` means "this item failed"; the reason is already in
  // itemErrors. A dependent of a failed host is dropped WITHOUT a second error —
  // one root cause per mistake, not a cascade of consequences burying it.
  const memo = new Map<string, CompiledItem | null>();
  const visiting = new Set<string>();
  const cycleReported = new Set<string>();

  const fail = (id: string, error: HouseError): null => {
    itemErrors.push(error);
    memo.set(id, null);
    return null;
  };

  const resolve = (def: ItemDef): CompiledItem | null => {
    const cached = memo.get(def.id);
    if (cached !== undefined) return cached;
    if (visiting.has(def.id)) {
      if (!cycleReported.has(def.id)) {
        cycleReported.add(def.id);
        itemErrors.push({ tag: 'MountCycle', ids: [...visiting, def.id] });
      }
      return null;
    }
    visiting.add(def.id);
    const placed = place(def);
    visiting.delete(def.id);
    if (memo.get(def.id) === undefined) memo.set(def.id, placed);
    return placed;
  };

  // Cell checks are shared by the floor and wall mounts.
  const roomAt = (def: ItemDef, cell: Cell): WallSide | null => {
    const [r, c] = cell;
    if (r < 0 || r >= R || c < 0 || c >= C) {
      fail(def.id, { tag: 'ItemCellOutOfBounds', id: def.id, cell });
      return null;
    }
    const room = keyAt(r, c);
    if (room === 'outside') {
      fail(def.id, { tag: 'ItemCellEmpty', id: def.id, cell });
      return null;
    }
    return room;
  };

  const emit = (def: ItemDef, position: Vec3, facing: Facing, room: WallSide): CompiledItem => ({
    id: def.id,
    kind: def.kind,
    mountedOn: def.mount.on,
    position,
    yaw: ITEM_YAW[facing],
    bounds: itemBounds(def.kind, position, facing),
    room,
  });

  function place(def: ItemDef): CompiledItem | null {
    const m = def.mount;
    switch (m.on) {
      case 'floor': {
        const room = roomAt(def, m.cell);
        if (room === null) return null;
        const [r, c] = m.cell;
        const [ox, oz] = m.offset ?? [0, 0];
        const position = vec3(xAt(c) + CELL / 2 + ox * CELL, baseY, zAt(r) + CELL / 2 + oz * CELL);
        return emit(def, position, m.facing ?? 's', room);
      }

      case 'item': {
        const hostDef = byId.get(m.host);
        if (hostDef === undefined) {
          return fail(def.id, { tag: 'UnknownMountHost', id: def.id, host: m.host });
        }
        const host = resolve(hostDef);
        if (host === null) {
          memo.set(def.id, null); // host's error is the root cause; don't pile on
          return null;
        }
        const spec = ITEM_SPECS[host.kind];
        if (spec.supportsTop === null) {
          return fail(def.id, { tag: 'ItemNotMountable', id: def.id, host: m.host });
        }
        // Offset is in fractions of the host's footprint, expressed in the
        // host's LOCAL frame, then turned by the host's yaw — so authoring
        // doesn't have to re-do the trigonometry every time a table is rotated.
        const [ox, oz] = m.offset ?? [0, 0];
        const [lx, lz] = [ox * spec.w, oz * spec.d];
        const [cos, sin] = [Math.cos(host.yaw), Math.sin(host.yaw)];
        const position = vec3(
          host.position[0] + lx * cos + lz * sin,
          host.position[1] + spec.supportsTop,
          host.position[2] - lx * sin + lz * cos,
        );
        // Inherit the host's orientation unless told otherwise.
        const facing = m.facing ?? FACING_OF_YAW.get(host.yaw) ?? 's';
        return emit(def, position, facing, host.room);
      }

      case 'inside': {
        const hostDef = byId.get(m.host);
        if (hostDef === undefined) {
          return fail(def.id, { tag: 'UnknownMountHost', id: def.id, host: m.host });
        }
        const host = resolve(hostDef);
        if (host === null) {
          memo.set(def.id, null); // host's error is the root cause; don't pile on
          return null;
        }
        const parts = openPartsOf(host.kind);
        if (parts.length === 0) {
          return fail(def.id, { tag: 'ItemHasNoInside', id: def.id, host: m.host });
        }
        // Unnamed means the host's FIRST part, which is the one a plan written
        // before parts existed meant — and the one clicking a host puts things
        // in, since that is the part listed first for the same reason.
        const opens = m.part === undefined ? parts[0] : openPart(host.kind, m.part);
        if (opens === null) {
          return fail(def.id, {
            tag: 'NoSuchPart',
            id: def.id,
            host: m.host,
            part: m.part ?? '',
            parts: parts.map((p) => p.id),
          });
        }
        const index = m.shelf ?? 0;
        const shelf = opens.shelves[index];
        // Not `?? 0`. A shelf that doesn't exist is a mistake in the plan, and
        // silently using the bottom one puts the cup somewhere nobody asked for
        // and tells no one.
        if (index < 0 || index >= opens.shelves.length) {
          return fail(def.id, {
            tag: 'NoSuchShelf',
            id: def.id,
            host: m.host,
            part: opens.id,
            shelf: index,
            shelves: opens.shelves.length,
          });
        }
        // The offset is in fractions of the USABLE interior, not of the whole
        // footprint — so `[0.5, 0]` is the right-hand edge of the shelf rather
        // than a point inside the carcass. Same rotated frame as `on: 'item'`.
        const spec = ITEM_SPECS[host.kind];
        const inset = opens.inset ?? 0;
        const [ox, oz] = m.offset ?? [0, 0];
        const [lx, lz] = [ox * spec.w * (1 - 2 * inset), oz * spec.d * (1 - 2 * inset)];
        const [cos, sin] = [Math.cos(host.yaw), Math.sin(host.yaw)];
        const position = vec3(
          host.position[0] + lx * cos + lz * sin,
          host.position[1] + shelf,
          host.position[2] - lx * sin + lz * cos,
        );
        const facing = m.facing ?? FACING_OF_YAW.get(host.yaw) ?? 's';
        return { ...emit(def, position, facing, host.room), inside: partKey(host.id, opens.id) };
      }

      case 'wall': {
        const room = roomAt(def, m.cell);
        if (room === null) return null;
        // Same edge test the openings use: if both sides of the edge are the
        // same room there is no wall there, and the item would hang in mid-air.
        const edge = resolveEdge(m.cell, m.side);
        const neg =
          edge.orient === 'v'
            ? keyAt(edge.varying, edge.fixed - 1)
            : keyAt(edge.fixed - 1, edge.varying);
        const pos =
          edge.orient === 'v' ? keyAt(edge.varying, edge.fixed) : keyAt(edge.fixed, edge.varying);
        if (neg === pos) {
          return fail(def.id, { tag: 'ItemNotOnWall', id: def.id, cell: m.cell, side: m.side });
        }

        const { facing, inward } = WALL_MOUNT[m.side];
        const { d, h } = ITEM_SPECS[def.kind];
        const top = m.height + h;
        if (top > WALL_HEIGHT) {
          return fail(def.id, { tag: 'ItemTooHigh', id: def.id, top, limit: WALL_HEIGHT });
        }
        // Off the wall's INNER face (half a thickness in from the centreline),
        // then out by half the item's depth so it rests against the surface
        // rather than half-buried in it.
        const clearance = inward * (WALL_THICKNESS / 2 + d / 2);
        const along = (m.offset ?? 0) * CELL;
        const [r, c] = m.cell;
        const position =
          edge.orient === 'v'
            ? vec3(xAt(edge.fixed) + clearance, baseY + m.height, zAt(r) + CELL / 2 + along)
            : vec3(xAt(c) + CELL / 2 + along, baseY + m.height, zAt(edge.fixed) + clearance);
        return emit(def, position, facing, room);
      }

      default:
        return assertNever(m);
    }
  }

  const compiledItems: CompiledItem[] = [];
  for (const def of byId.values()) {
    const placed = resolve(def);
    if (placed !== null) compiledItems.push(placed);
  }

  // ── FIT. Everything above validates one item against the GRID; these two
  // check items against the space they actually end up occupying, which is a
  // different question and the one that kept going wrong.
  //
  // Both were verified by hand until now — by eye in the running app, or by a
  // throwaway script written three separate times, which is the clearest signal
  // there is that a check belongs in the compiler. Between them they caught a
  // nightstand inside a bed and a chair through a wall.
  itemErrors.push(...fitErrors(compiledItems, byId, ctx));

  return { itemErrors, compiledItems };
}

/** Does this world X (or Z) fall in a cell of the grid, and which one? */
const cellIndex = (v: number, origin: number): number => Math.floor((v - origin) / CELL + 1e-6);

/**
 * The cells a footprint touches. The max edge is pulled in by an epsilon: an
 * item pressed exactly against a boundary ends ON it, and without the nudge it
 * would report the neighbouring cell it does not actually enter.
 */
function cellsUnder(b: AABB, ctx: ItemCtx): readonly Cell[] {
  const { xAt, zAt } = ctx;
  const out: Cell[] = [];
  const c0 = cellIndex(b.min[0], xAt(0));
  const c1 = cellIndex(b.max[0] - 1e-6, xAt(0));
  const r0 = cellIndex(b.min[2], zAt(0));
  const r1 = cellIndex(b.max[2] - 1e-6, zAt(0));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([r, c]);
  return out;
}

/** Strict 3-D intersection. Touching is not overlapping — a laptop whose base
 *  sits exactly on a table top shares a plane with it, not a volume. */
const intersects = (p: AABB, q: AABB): boolean =>
  Math.min(p.max[0], q.max[0]) - Math.max(p.min[0], q.min[0]) > 1e-6 &&
  Math.min(p.max[1], q.max[1]) - Math.max(p.min[1], q.min[1]) > 1e-6 &&
  Math.min(p.max[2], q.max[2]) - Math.max(p.min[2], q.min[2]) > 1e-6;

function fitErrors(
  items: readonly CompiledItem[],
  byId: ReadonlyMap<string, ItemDef>,
  ctx: ItemCtx,
): readonly HouseError[] {
  const { keyAt, R, C } = ctx;
  const errors: HouseError[] = [];

  // ── Does each item stay inside its own room?
  //
  // Straddling CELLS is normal and expected — a bed is two cells long and a
  // sofa two wide. Straddling ROOMS is not: the boundary between two rooms is
  // a wall, so an item over it is an item through a wall.
  for (const item of items) {
    // Floor coverings are exempt: a runner through a doorway is a normal thing
    // to own, and `underfoot` already says this one lies on the floor rather
    // than standing on it. A wardrobe across a threshold is still an error.
    if (ITEM_SPECS[item.kind].underfoot === true) continue;
    for (const [r, c] of cellsUnder(item.bounds, ctx)) {
      const here = r < 0 || r >= R || c < 0 || c >= C ? 'outside' : keyAt(r, c);
      if (here !== item.room) {
        errors.push({ tag: 'ItemOutsideRoom', id: item.id, room: item.room, cell: [r, c] });
        break; // one error per item: the first offending cell names the problem
      }
    }
  }

  // ── Does anything share space with anything else?
  //
  // Two exemptions, both real rather than convenient. Floor coverings are meant
  // to be stood on (see `underfoot`). And an item mounted on another may sink
  // into its host's box — a pillow on a bed rests at the mattress, well below
  // the headboard the bed's bounds include — so a host and its dependent are
  // not a clash however deeply they intersect.
  const hostOf = (id: string): string | null => {
    const m = byId.get(id)?.mount;
    // Both relative mounts. `on: 'inside'` needs it MORE than `on: 'item'`: a
    // cup on a shelf is not merely sunk into its host's box, it is wholly
    // within it, which is the point rather than a mistake.
    return m !== undefined && (m.on === 'item' || m.on === 'inside') ? m.host : null;
  };
  const solid = items.filter((i) => ITEM_SPECS[i.kind].underfoot !== true);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i];
      const b = solid[j];
      if (hostOf(a.id) === b.id || hostOf(b.id) === a.id) continue;
      if (intersects(a.bounds, b.bounds)) errors.push({ tag: 'ItemsOverlap', a: a.id, b: b.id });
    }
  }

  return errors;
}