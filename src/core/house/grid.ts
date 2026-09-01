// src/core/house/grid.ts
//
// The innermost pure function of the core: a grid of blocks in, world-space
// geometry (or a list of typed errors) out. No I/O, no React, no three.
//
// The whole convergence rule reduces to one line (see the boundary loops):
// a wall exists on a boundary IFF the two sides differ. Same room on both sides
// (or outside on both) → they cancel, no wall. Different → one wall carrying both
// sides. Collinear segments merge into a run only when their side-pair matches,
// which is why an exterior edge shared by two different rooms does NOT merge.
//
// WHAT LIVES ELSEWHERE. This file was 940 lines and four unrelated jobs. It is
// now the orchestrator plus the wall/region derivation that is genuinely its
// own — everything a caller needs but that isn't "walk this grid" moved out:
//
//   scale.ts      the measurements everything is expressed in
//   compiled.ts   the shapes emitted (the types this returns)
//   items.ts      furniture: specs, the mount graph, placement
//   openings.ts   which boundary a door or window lands on, and whether it may
//   footprint.ts  storey outlines and the roofs that sit on them
//
// Consumers import from the module that owns the thing, not from here — there
// is no barrel, deliberately, because a barrel would blur the per-file lint
// globs the layering rests on.

import { ok, err, type Result } from '../shared/result';
import type { Cell, HouseError, RoomKey } from '../shared/errors';
import { isRoom, type Grid, type ItemDef, type Opening, type RoomDef } from './blocks';
import { boundaries, indexOf } from './cells';
import { CELL, DOOR_HEIGHT_FRAC, WALL_HEIGHT, WALL_THICKNESS } from './scale';
import {
  vec3,
  type CompiledGrid,
  type CompiledOpening,
  type CompiledRoom,
  type CompiledWall,
  type Footprint,
  type AABB,
  type Vec3,
  type WallSide,
} from './compiled';
import { compileItems } from './items';
import { gridFrame } from './frame';
import { validateOpening, type ResolvedEdge } from './openings';

// Everything except the grid itself arrives in one record. Four positional
// optionals was the limit — `compileGrid(g, [], 1.2, items)` says nothing about
// what 1.2 is, and stairs would have added a fifth. Named fields also mean
// compileHouse can build the options per storey without counting commas.
export interface CompileOptions {
  readonly openings?: readonly Opening[];
  readonly items?: readonly ItemDef[];
  /** World Y of this storey's floor. Every emitted Y is measured from here. */
  readonly baseY?: number;
  /**
   * Grid extent to centre on, when it isn't this grid's own.
   *
   * Every storey used to centre on ITSELF, which silently forbade setbacks: a
   * 7-row upper floor over a 9-row ground floor would centre on its own 7 rows
   * and float one cell inboard of where it was drawn, aligned to nothing. Cell
   * [0][0] has to mean the same world corner on every storey, so the whole house
   * shares one extent — the union of every storey's — and a smaller storey
   * simply stops early.
   *
   * Defaults to this grid's own size, so a lone grid (the sandbox, the lab) is
   * unaffected.
   */
  readonly extent?: { readonly rows: number; readonly cols: number };
}

export function compileGrid(
  grid: Grid,
  options: CompileOptions = {},
): Result<CompiledGrid, readonly HouseError[]> {
  const { openings = [], items = [], baseY = 0, extent } = options;
  const R = grid.length;
  const C = grid.reduce((max, row) => Math.max(max, row.length), 0);
  // What the house is centred on, which is not necessarily what THIS storey
  // spans. Cell [0][0] is the same world corner on every storey either way.
  const originR = extent?.rows ?? R;
  const originC = extent?.cols ?? C;

  // Every occupied cell as (r, c, def), walked ONCE. Both the neighbour-lookup
  // map and the per-room grouping derive from this list, so the grid isn't
  // traversed once per structure.
  const roomCells = grid.flatMap((row, r) =>
    row.flatMap((block, c) => (isRoom(block) ? [{ r, c, def: block }] : [])),
  );

  // An empty grid gates everything else — nothing below is meaningful without a
  // single room — so return it rather than accumulate alongside other errors.
  if (roomCells.length === 0) return err([{ tag: 'EmptyGrid' }]);

  // One index for the whole compile. `null` from it means "no cell drawn";
  // `outward` is where that becomes the name a WALL uses for its far side.
  const index = indexOf(grid);
  const outward = (o: RoomKey | null): WallSide => o ?? 'outside';
  const keyAt = (r: number, c: number): WallSide => outward(index.at(r, c));

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
  // From frame.ts rather than spelled out here, because edit mode needs to run
  // this mapping BACKWARDS — screen point to cell and offset — and an inverse
  // derived from a second copy of the formula is free to drift from it.
  const { xAt, zAt } = gridFrame(originR, originC);

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
  // `boundaries` already keeps only the lines where the two sides differ, so all
  // that's left here is dropping the ones an opening claimed and naming the
  // absent side 'outside'.
  const edges = boundaries(index).filter(
    (b) => !claimed.has(`${b.orient}:${b.fixed}:${b.varying}`),
  );
  const asSeg = (b: (typeof edges)[number]): Seg => ({
    fixed: b.fixed,
    varying: b.varying,
    neg: outward(b.neg),
    pos: outward(b.pos),
  });
  const vSegs: readonly Seg[] = edges.filter((b) => b.orient === 'v').map(asSeg);
  const hSegs: readonly Seg[] = edges.filter((b) => b.orient === 'h').map(asSeg);

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
// ── wall runs and regions ────────────────────────────────────────────────────

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