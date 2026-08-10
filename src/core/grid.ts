// src/core/grid.ts
//
// The innermost pure function of the core: a grid of blocks in, world-space
// geometry (or a list of typed errors) out. No I/O, no React, no three. This is
// the ported, typed, boundaried version of the old constants.js run logic — the
// thing that used to be smeared across a god-module now returns a value the test
// suite asserts on.
//
// The whole convergence rule reduces to one line (see the boundary loops):
// a wall exists on a boundary IFF the two sides differ. Same room on both sides
// (or outside on both) → they cancel, no wall. Different → one wall carrying both
// sides. Collinear segments merge into a run only when their side-pair matches,
// which is why an exterior edge shared by two different rooms does NOT merge.
//
// compileScene / a storey wrapper will later add floorY, level, and the roof
// `footprint` on top of this; compileGrid itself stays scoped to one grid.

import { ok, err, type Result } from './result';
import { assertNever, type Cell, type HouseError, type RoomKey, type Side } from './errors';
import { isRoom, type Facing, type Grid, type ItemDef, type ItemKind, type Opening, type RoomDef, type RoomLabels } from './blocks';
import type { Locale } from './labels';
import { gableRoof, type RoofMesh, type RoofBox } from './roof';
import { pairs, range } from './seq';

// ── World-scale knobs. One cell is CELL units on a side; walls rise WALL_HEIGHT.
// Tunable and cosmetic — the roof will read wall-top height from here later. ────
export const CELL = 0.5;
export const WALL_HEIGHT = 1.2;
export const WALL_THICKNESS = 0.08; // wall depth; the core extends corners by half this so walls overlap
export const ROOF_PITCH = 0.55; // roof rise per unit of horizontal run (a ratio)
export const ROOF_RAKE_OVERHANG = 0.12; // how far the slopes hang past the gable ends
// Horizontal run past the eave walls' OUTER face; the eave edge drops below
// wall-top by ROOF_PITCH × this (≈ 0.09 world units at current values).
export const ROOF_EAVE_OVERHANG = 0.16;

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

// How tall the doorway itself is, as a fraction of the wall. This lived in the
// renderer, which meant a door's real vertical extent existed nowhere in the
// compiled data — so anything else that needed it (the popup anchor) had to
// guess with a magic fraction of the WALL height and land near the lintel.
export const DOOR_HEIGHT_FRAC = 0.82;

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

// ── Items. Canonical per-kind spec — DATA the core needs to place items and
// emit click bounds; what a kind LOOKS like stays in the shell's factory, same
// split as room `color`. Sizes are stylised to fit one CELL (0.5) under
// WALL_HEIGHT (1.2). `supportsTop` is the height at which OTHER items rest on
// this one — `null` means nothing can, which is what turns "laptop on a TV"
// into a typed error instead of a laptop embedded in a screen. ──
interface ItemSpec {
  readonly w: number;
  readonly d: number;
  readonly h: number;
  readonly supportsTop: number | null;
}
export const ITEM_SPECS: Record<ItemKind, ItemSpec> = {
  table: { w: 0.44, d: 0.3, h: 0.34, supportsTop: 0.34 }, // things rest on the slab
  laptop: { w: 0.13, d: 0.1, h: 0.09, supportsTop: null },
  tv: { w: 0.34, d: 0.03, h: 0.2, supportsTop: null },
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

export interface CompiledItem {
  readonly id: string;
  readonly kind: ItemKind;
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

// The roof from a footprint. compileHouse will call this with the TOP storey's
// footprint; today the shell calls it with the single grid's. Pitch/overhang stay
// encapsulated here so callers only supply the outline.
export function roofFor(footprint: Footprint): RoofMesh {
  return gableRoof(footprint.bbox, footprint.wallTopY, {
    pitch: ROOF_PITCH,
    rakeOverhang: ROOF_RAKE_OVERHANG,
    eaveOverhang: ROOF_EAVE_OVERHANG,
    // The footprint bbox is the wall CENTERLINE outline; the roof bears on the
    // wall's outer top edge, half a thickness outboard.
    bearingOffset: WALL_THICKNESS / 2,
  });
}

const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

// Everything except the grid itself arrives in one record. Four positional
// optionals was the limit — `compileGrid(g, [], 1.2, items)` says nothing about
// what 1.2 is, and stairs would have added a fifth. Named fields also mean
// compileHouse can build the options per storey without counting commas.
export interface CompileOptions {
  readonly openings?: readonly Opening[];
  readonly items?: readonly ItemDef[];
  /** World Y of this storey's floor. Every emitted Y is measured from here. */
  readonly baseY?: number;
}

export function compileGrid(
  grid: Grid,
  options: CompileOptions = {},
): Result<CompiledGrid, readonly HouseError[]> {
  const { openings = [], items = [], baseY = 0 } = options;
  const R = grid.length;
  const C = grid.reduce((max, row) => Math.max(max, row.length), 0);

  // Every occupied cell as (r, c, def), walked ONCE. Both the neighbour-lookup
  // map and the per-room grouping derive from this list, so the grid isn't
  // traversed once per structure.
  const roomCells = grid.flatMap((row, r) =>
    row.flatMap((block, c) => (isRoom(block) ? [{ r, c, def: block }] : [])),
  );

  // An empty grid gates everything else — nothing below is meaningful without a
  // single room — so return it rather than accumulate alongside other errors.
  if (roomCells.length === 0) return err([{ tag: 'EmptyGrid' }]);

  // "r,c" -> key, for O(1) neighbour lookups; anything absent reads as exterior.
  const keyByCell = new Map<string, RoomKey>(
    roomCells.map(({ r, c, def }) => [`${r},${c}`, def.key] as const),
  );
  const keyAt = (r: number, c: number): WallSide => keyByCell.get(`${r},${c}`) ?? 'outside';

  // Group cells by room key. Grouping is a fold — inherently stateful — so it
  // stays an explicit accumulation, but over the flat list, not a re-traversal.
  const rooms = new Map<RoomKey, { readonly def: RoomDef; readonly cells: Cell[] }>();
  for (const { r, c, def } of roomCells) {
    const existing = rooms.get(def.key);
    if (existing) existing.cells.push([r, c]);
    else rooms.set(def.key, { def, cells: [[r, c]] });
  }

  // ── Structural validation. Accumulate every remaining error; a valid grid
  // emits none. (EmptyGrid is already handled above.) ──
  const errors: HouseError[] = [];
  for (const [key, { cells }] of rooms) {
    if (key === 'outside') errors.push({ tag: 'ReservedRoomKey', key }); // protects the exterior sentinel
    const regions = countRegions(cells);
    if (regions > 1) errors.push({ tag: 'DisconnectedRoom', room: key, regions });
  }
  if (errors.length > 0) return err(errors);

  // ── Geometry. Only reached once the grid is structurally sound. ──
  const xAt = (col: number) => col * CELL - (C * CELL) / 2;
  const zAt = (row: number) => row * CELL - (R * CELL) / 2;

  // ── Openings. Validate each (validateOpening, below); a bad one fails the whole
  // compile — no silent drop. A valid opening CLAIMS its edge, which is excluded
  // from the solid walls and emitted as a CompiledOpening. The overlap check is
  // the one stateful part, so it stays here over the accumulating `claimed` map. ──
  const openingErrors: HouseError[] = [];
  const claimed = new Map<
    string,
    { readonly op: Opening; readonly edge: ResolvedEdge; readonly neg: WallSide; readonly pos: WallSide }
  >();
  for (const op of openings) {
    const check = validateOpening(op, keyAt, R, C);
    if (!check.ok) {
      openingErrors.push(check.error);
    } else {
      const id = `${check.edge.orient}:${check.edge.fixed}:${check.edge.varying}`;
      if (claimed.has(id)) {
        openingErrors.push({ tag: 'OpeningsOverlap', cell: op.cell, side: op.side });
      } else {
        claimed.set(id, { op, edge: check.edge, neg: check.neg, pos: check.pos });
      }
    }
  }
  // ── Items. Validated like openings (compileItems, below): every bad item is a
  // typed error, valid ones compile to world space here — cell → centre + offset,
  // room DERIVED from the cell, yaw from facing, yaw-aware click bounds. ──
  const { itemErrors, compiledItems } = compileItems(items, { keyAt, xAt, zAt, R, C, baseY });

  // Opening and item mistakes accumulate TOGETHER — the author sees every plan
  // error in one compile, not openings first and items after a fix.
  const planErrors = [...openingErrors, ...itemErrors];
  if (planErrors.length > 0) return err(planErrors);

  // Wall boundaries, MINUS any edge a valid opening claimed. Each is "every
  // boundary line × every cell along it, kept where the two sides differ" — a
  // flat pipeline over the cartesian product, not a nested loop.
  const vSegs: readonly Seg[] = pairs(range(0, C + 1), range(0, R))
    .map(([c, r]): Seg => ({ fixed: c, varying: r, neg: keyAt(r, c - 1), pos: keyAt(r, c) }))
    .filter((s) => s.neg !== s.pos && !claimed.has(`v:${s.fixed}:${s.varying}`));
  const hSegs: readonly Seg[] = pairs(range(0, R + 1), range(0, C))
    .map(([r, c]): Seg => ({ fixed: r, varying: c, neg: keyAt(r - 1, c), pos: keyAt(r, c) }))
    .filter((s) => s.neg !== s.pos && !claimed.has(`h:${s.fixed}:${s.varying}`));

  // Runs first, then walls — so we can find CORNERS (a grid vertex where an
  // exterior vertical run and an exterior horizontal run both END) and extend
  // those endpoints outward by half a wall thickness. Extended, the two boxes
  // overlap and fill the outer corner instead of leaving a notch. Openings split
  // a run on ONE axis, so a split endpoint never pairs with a perpendicular run's
  // endpoint — door/window edges are excluded automatically.
  const vRuns = mergeRuns(vSegs);
  const hRuns = mergeRuns(hSegs);
  const isExterior = (run: Run): boolean => run.neg === 'outside' || run.pos === 'outside';
  const vtx = (row: number, col: number): string => `${row},${col}`;
  const vCornerEnds = new Set(
    vRuns.filter(isExterior).flatMap((r) => [vtx(r.start, r.fixed), vtx(r.end + 1, r.fixed)]),
  );
  const hCornerEnds = new Set(
    hRuns.filter(isExterior).flatMap((r) => [vtx(r.fixed, r.start), vtx(r.fixed, r.end + 1)]),
  );
  const isCorner = (row: number, col: number): boolean =>
    vCornerEnds.has(vtx(row, col)) && hCornerEnds.has(vtx(row, col));
  const HALF_T = WALL_THICKNESS / 2;

  const vWalls: CompiledWall[] = vRuns.map((run) => {
    const ext = isExterior(run);
    const za = ext && isCorner(run.start, run.fixed) ? zAt(run.start) - HALF_T : zAt(run.start);
    const zb = ext && isCorner(run.end + 1, run.fixed) ? zAt(run.end + 1) + HALF_T : zAt(run.end + 1);
    return {
      a: vec3(xAt(run.fixed), baseY, za),
      b: vec3(xAt(run.fixed), baseY, zb),
      height: WALL_HEIGHT,
      axis: 'z',
      sides: [run.neg, run.pos],
    };
  });
  const hWalls: CompiledWall[] = hRuns.map((run) => {
    const ext = isExterior(run);
    const xa = ext && isCorner(run.fixed, run.start) ? xAt(run.start) - HALF_T : xAt(run.start);
    const xb = ext && isCorner(run.fixed, run.end + 1) ? xAt(run.end + 1) + HALF_T : xAt(run.end + 1);
    return {
      a: vec3(xa, baseY, zAt(run.fixed)),
      b: vec3(xb, baseY, zAt(run.fixed)),
      height: WALL_HEIGHT,
      axis: 'x',
      sides: [run.neg, run.pos],
    };
  });

  // Each claimed edge becomes an opening — the same geometry that one-cell wall
  // run would have, plus the kind-specific fields.
  const compiledOpenings: CompiledOpening[] = [];
  for (const [id, { op, edge, neg, pos }] of claimed) {
    const geom =
      edge.orient === 'v'
        ? { a: vec3(xAt(edge.fixed), baseY, zAt(edge.varying)), b: vec3(xAt(edge.fixed), baseY, zAt(edge.varying + 1)), axis: 'z' as const }
        : { a: vec3(xAt(edge.varying), baseY, zAt(edge.fixed)), b: vec3(xAt(edge.varying + 1), baseY, zAt(edge.fixed)), axis: 'x' as const };
    const common = { id, ...geom, height: WALL_HEIGHT, sides: [neg, pos] as const };
    compiledOpenings.push(
      op.kind === 'door'
        ? {
            ...common,
            kind: 'door',
            swing: op.swing,
            sill: baseY,
            head: baseY + WALL_HEIGHT * DOOR_HEIGHT_FRAC,
          }
        : // Authored sill/head are heights ABOVE THIS STOREY'S FLOOR, so they
          // need the same offset every other Y gets. Without it an upstairs
          // window renders down inside the storey below.
          { ...common, kind: 'window', sill: baseY + op.sill, head: baseY + op.head },
    );
  }

  const compiledRooms: CompiledRoom[] = [];
  for (const [key, { def, cells }] of rooms) {
    const rowsOf = cells.map(([r]) => r);
    const colsOf = cells.map(([, c]) => c);
    const bounds: AABB = {
      min: vec3(xAt(Math.min(...colsOf)), baseY, zAt(Math.min(...rowsOf))),
      max: vec3(xAt(Math.max(...colsOf) + 1), baseY + WALL_HEIGHT, zAt(Math.max(...rowsOf) + 1)),
    };
    const floor: Vec3[] = cells.map(([r, c]) => vec3(xAt(c) + CELL / 2, baseY, zAt(r) + CELL / 2));
    const base = { key, labels: def.labels, cells, bounds, floor };
    compiledRooms.push(def.color === undefined ? base : { ...base, color: def.color });
  }

  const footRows = roomCells.map(({ r }) => r);
  const footCols = roomCells.map(({ c }) => c);
  const footprint: Footprint = {
    bbox: {
      x0: xAt(Math.min(...footCols)),
      x1: xAt(Math.max(...footCols) + 1),
      z0: zAt(Math.min(...footRows)),
      z1: zAt(Math.max(...footRows) + 1),
    },
    wallTopY: baseY + WALL_HEIGHT,
  };

  return ok({
    rooms: compiledRooms,
    walls: [...vWalls, ...hWalls],
    openings: compiledOpenings,
    items: compiledItems,
    footprint,
  });
}

// ── helpers ──────────────────────────────────────────────────────────────────

// Item validation + world placement. Dependencies come in as a context record
// (functions as parameters, no reach-back into compileGrid's scope). Errors
// accumulate; a bad item never silently drops.
//
// Placement is a GRAPH now, not a list: an item mounted on another can't be
// placed until its host is. Resolution is a memoized depth-first walk with a
// `visiting` set, so a mount loop is reported as a MountCycle instead of
// overflowing the stack. Order of authoring doesn't matter — a laptop may be
// listed before the table it sits on.
interface ItemCtx {
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

function compileItems(
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

  return { itemErrors, compiledItems };
}

// A grid boundary edge an opening resolves to. `orient` 'v' = vertical boundary
// (a run along Z), 'h' = horizontal (along X). `fixed` is the boundary line index,
// `varying` the cell index along it — matching the wall-segment loops exactly.
interface ResolvedEdge {
  readonly orient: 'v' | 'h';
  readonly fixed: number;
  readonly varying: number;
}

// cell + side → the single boundary edge that side names.
function resolveEdge(cell: Cell, side: Side): ResolvedEdge {
  const [r, c] = cell;
  switch (side) {
    case 'back':
      return { orient: 'h', fixed: r, varying: c };
    case 'front':
      return { orient: 'h', fixed: r + 1, varying: c };
    case 'left':
      return { orient: 'v', fixed: c, varying: r };
    case 'right':
      return { orient: 'v', fixed: c + 1, varying: r };
    default:
      return assertNever(side);
  }
}

// The outcome of validating one opening: an error, or the resolved edge + sides
// it claims. Pure and self-contained — each check `return`s, so no `continue` in
// the caller's loop, and it's independently testable.
type OpeningCheck =
  | { readonly ok: false; readonly error: HouseError }
  | { readonly ok: true; readonly edge: ResolvedEdge; readonly neg: WallSide; readonly pos: WallSide };

function validateOpening(
  op: Opening,
  keyAt: (r: number, c: number) => WallSide,
  R: number,
  C: number,
): OpeningCheck {
  const [r, c] = op.cell;
  if (keyAt(r, c) === 'outside') {
    return {
      ok: false,
      error:
        r < 0 || r >= R || c < 0 || c >= C
          ? { tag: 'OpeningCellOutOfBounds', cell: op.cell }
          : { tag: 'OpeningCellEmpty', cell: op.cell },
    };
  }

  const edge = resolveEdge(op.cell, op.side);
  const neg =
    edge.orient === 'v' ? keyAt(edge.varying, edge.fixed - 1) : keyAt(edge.fixed - 1, edge.varying);
  const pos =
    edge.orient === 'v' ? keyAt(edge.varying, edge.fixed) : keyAt(edge.fixed, edge.varying);
  if (neg === pos) {
    return { ok: false, error: { tag: 'OpeningNotOnWall', cell: op.cell, side: op.side } };
  }

  if (op.between !== undefined) {
    const want = new Set<WallSide>(op.between);
    const have = new Set<WallSide>([neg, pos]);
    const matches = want.size === have.size && [...want].every((k) => have.has(k));
    if (!matches) {
      return {
        ok: false,
        error: {
          tag: 'OpeningConnectsWrongRooms',
          cell: op.cell,
          side: op.side,
          expected: op.between,
          actual: [neg, pos],
        },
      };
    }
  }

  if (op.kind === 'window') {
    if (op.sill >= op.head) {
      return {
        ok: false,
        error: { tag: 'WindowSillAboveHead', cell: op.cell, side: op.side, sill: op.sill, head: op.head },
      };
    }
    if (op.head > WALL_HEIGHT || op.sill < 0) {
      return {
        ok: false,
        error: { tag: 'WindowExceedsWall', cell: op.cell, side: op.side, head: op.head, wallHeight: WALL_HEIGHT },
      };
    }
  }

  return { ok: true, edge, neg, pos };
}

// Count 4-connected regions of a room's cells. >1 means the same key appears as
// two touching-only-diagonally (or fully separate) blobs → DisconnectedRoom.
function countRegions(cells: readonly Cell[]): number {
  const present = new Set(cells.map(([r, c]) => `${r},${c}`));
  const seen = new Set<string>();
  let regions = 0;
  for (const [r, c] of cells) {
    if (!seen.has(`${r},${c}`)) {
      regions++;
      const stack: Cell[] = [[r, c]];
      seen.add(`${r},${c}`);
      while (stack.length > 0) {
        const cur = stack.pop();
        if (cur === undefined) break;
        const [cr, cc] = cur;
        const neighbours: readonly Cell[] = [
          [cr - 1, cc],
          [cr + 1, cc],
          [cr, cc - 1],
          [cr, cc + 1],
        ];
        for (const [nr, nc] of neighbours) {
          const id = `${nr},${nc}`;
          if (present.has(id) && !seen.has(id)) {
            seen.add(id);
            stack.push([nr, nc]);
          }
        }
      }
    }
  }
  return regions;
}

// A single unit-length wall segment on a grid boundary, before merging.
// `fixed` is the boundary's line index; `varying` is the cell index along it.
interface Seg {
  readonly fixed: number;
  readonly varying: number;
  readonly neg: WallSide;
  readonly pos: WallSide;
}
interface Run {
  readonly fixed: number;
  readonly start: number;
  readonly end: number;
  readonly neg: WallSide;
  readonly pos: WallSide;
}

// Merge collinear segments into runs — but only when they share the SAME side
// pair. Two segments with different inner rooms never merge, which keeps every
// wall single-room-per-side (the property the factory needs for colouring).
function mergeRuns(segs: readonly Seg[]): readonly Run[] {
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const gk = JSON.stringify([s.fixed, s.neg, s.pos]);
    const arr = groups.get(gk);
    if (arr) arr.push(s);
    else groups.set(gk, [s]);
  }

  return [...groups.values()].flatMap((group) => {
    const first = group[0];
    if (first === undefined) return []; // groups are never empty; this satisfies the type
    const varyings = group.map((s) => s.varying).sort((a, b) => a - b);
    return consecutiveRanges(varyings).map(
      ([start, end]): Run => ({ fixed: first.fixed, start, end, neg: first.neg, pos: first.pos }),
    );
  });
}

// Partition a sorted list of integers into maximal consecutive ranges. This is
// the ONLY place the "extend a run vs. start a new one" decision lives — one
// append site, no null accumulator, no flush-at-the-end duplication. Pure and
// exported so it earns its own test rows:
//   [0,1,2] → [[0,2]]   ·   [0,2] → [[0,0],[2,2]]   ·   [] → []   ·   [5] → [[5,5]]
export function consecutiveRanges(sorted: readonly number[]): readonly (readonly [number, number])[] {
  const ranges: (readonly [number, number])[] = [];
  for (const n of sorted) {
    const last = ranges[ranges.length - 1];
    if (last !== undefined && n === last[1] + 1) {
      ranges[ranges.length - 1] = [last[0], n]; // extend by replacing (the tuple itself stays immutable)
    } else {
      ranges.push([n, n]); // start a new run
    }
  }
  return ranges;
}