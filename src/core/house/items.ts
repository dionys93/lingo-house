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
}
export const ITEM_SPECS: Record<ItemKind, ItemSpec> = {
  // ── Living / general
  table: { w: 0.44, d: 0.3, h: 0.37, supportsTop: 0.37 }, //   880 ×  600 ×  740
  chair: { w: 0.225, d: 0.25, h: 0.45, supportsTop: null }, //  450 ×  500 ×  900
  sofa: { w: 1.0, d: 0.45, h: 0.425, supportsTop: null }, //   2000 ×  900 ×  850 — 2 cells wide
  rug: { w: 1.0, d: 0.75, h: 0.006, supportsTop: null, underfoot: true }, // 2000 × 1500 × 12
  bookshelf: { w: 0.4, d: 0.15, h: 0.9, supportsTop: null }, // 800 ×  300 × 1800
  // ── Electronics
  laptop: { w: 0.15, d: 0.105, h: 0.095, supportsTop: null }, // 300 × 210 × 190 open
  tv: { w: 0.44, d: 0.02, h: 0.248, supportsTop: null }, //     880 ×   40 ×  495 — 40", true 16:9
  // ── Kitchen
  diningTable: { w: 1.0, d: 1.0, h: 0.37, supportsTop: 0.37 }, // 2000 × 2000 × 740 — 2 cells square
  counter: { w: 0.6, d: 0.3, h: 0.45, supportsTop: 0.45 }, //  1200 ×  600 ×  900 — worktop
  dishwasher: { w: 0.3, d: 0.3, h: 0.425, supportsTop: null }, // 600 × 600 × 850 — slots into the run
  oven: { w: 0.3, d: 0.3, h: 0.45, supportsTop: null }, //       600 ×  600 ×  900 — hob on top, so nothing rests here
  fridge: { w: 0.3, d: 0.325, h: 0.9, supportsTop: null }, //    600 ×  650 × 1800
  // ── Bathroom
  toilet: { w: 0.185, d: 0.35, h: 0.39, supportsTop: null }, //  370 ×  700 ×  780 to the cistern lid
  bathtub: { w: 0.85, d: 0.375, h: 0.29, supportsTop: null }, // 1700 × 750 ×  580 — 2 cells long
  shower: { w: 0.45, d: 0.45, h: 1.0, supportsTop: null }, //    900 ×  900 × 2000 enclosure
  sink: { w: 0.3, d: 0.225, h: 0.425, supportsTop: null }, //    600 ×  450 ×  850 — basin rim, not a shelf
  // ── Bedroom
  bed: { w: 0.7, d: 1.0, h: 0.5, supportsTop: 0.26 }, //        1400 × 2000 × 1000 headboard; 520 mattress top
  wardrobe: { w: 0.5, d: 0.3, h: 1.0, supportsTop: null }, //   1000 ×  600 × 2000
  nightstand: { w: 0.225, d: 0.2, h: 0.275, supportsTop: 0.275 }, // 450 × 400 × 550
};

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
    return m !== undefined && m.on === 'item' ? m.host : null;
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