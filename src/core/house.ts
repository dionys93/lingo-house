// src/core/house.ts
//
// The multi-storey wrapper. `compileGrid` stays completely level-ignorant — it
// knows only the `baseY` it's handed — so everything about *stacking* lives
// here, in one place.
//
// Two phases, and the split is forced rather than stylistic. Structural checks
// (empty, duplicate levels, gaps) and the per-storey compiles can all run and
// accumulate together. But the cross-storey checks — duplicate room keys,
// matching footprints, stairs, reachability — need compiled output to look at,
// so they genuinely cannot run until phase one succeeded. Everything within a
// phase still accumulates; you never fix one storey to discover the next.

import { compileGrid, roofFor, WALL_HEIGHT, type CompiledGrid, type Vec3, type WallSide } from './grid';
import type { RoofMesh } from './roof';
import type { Stair, Storey } from './blocks';
import type { Cell, HouseError } from './errors';
import { err, ok, type Result } from './result';

export interface CompiledStair {
  readonly id: string;
  readonly level: number; // the storey it climbs out of
  readonly run: readonly Cell[]; // tread cells on the lower storey, bottom first
  readonly treads: readonly Vec3[]; // world centre of each tread cell, at its own height
  readonly arrival: Vec3; // world point you step onto, upstairs
  readonly rise: number; // total climb — one storey
  readonly connects: readonly [WallSide, WallSide]; // [lower room, upper room]
}

export interface CompiledStorey {
  readonly level: number;
  readonly baseY: number;
  readonly grid: CompiledGrid; // floors already have the stairwell cut out
  readonly openFloor: readonly Cell[]; // cells with no floor — the hole below the stair above
}

export interface CompiledHouse {
  readonly storeys: readonly CompiledStorey[]; // ascending by level
  readonly stairs: readonly CompiledStair[];
  readonly roof: RoofMesh; // on the top storey's footprint
}

const vec3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

const sameCell = (a: Cell, b: Cell): boolean => a[0] === b[0] && a[1] === b[1];

// The cells a straight run passes through, bottom tread first, inclusive.
// Returns null if the two ends don't share a row or a column.
function runCells(from: Cell, to: Cell): readonly Cell[] | null {
  const [r0, c0] = from;
  const [r1, c1] = to;
  if (r0 !== r1 && c0 !== c1) return null;
  const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  const dr = Math.sign(r1 - r0);
  const dc = Math.sign(c1 - c0);
  return Array.from({ length: steps + 1 }, (_, i): Cell => [r0 + dr * i, c0 + dc * i]);
}

export function compileHouse(storeys: readonly Storey[]): Result<CompiledHouse, readonly HouseError[]> {
  // ── Phase 1: structure, then per-storey compiles ──────────────────────────
  const phase1: HouseError[] = [];

  if (storeys.length === 0) return err([{ tag: 'EmptyHouse' }]);

  const seenLevels = new Set<number>();
  for (const s of storeys) {
    if (seenLevels.has(s.level)) phase1.push({ tag: 'DuplicateStorey', level: s.level });
    seenLevels.add(s.level);
  }

  const levels = [...seenLevels].sort((a, b) => a - b);
  for (let i = 1; i < levels.length; i++) {
    // Levels must be contiguous: a house with a ground floor and a level 2 has a
    // storey nobody can build a staircase to.
    if (levels[i] !== levels[i - 1] + 1) {
      phase1.push({ tag: 'FloatingStorey', level: levels[i], missing: levels[i] - 1 });
    }
  }

  const ordered = [...storeys].sort((a, b) => a.level - b.level);
  const compiled = new Map<number, CompiledGrid>();
  for (const s of ordered) {
    const r = compileGrid(s.grid, {
      openings: s.openings ?? [],
      items: s.items ?? [],
      baseY: s.level * WALL_HEIGHT,
    });
    if (r.ok) compiled.set(s.level, r.value);
    else phase1.push(...r.error);
  }

  if (phase1.length > 0) return err(phase1);

  // ── Phase 2: the checks that need compiled storeys ────────────────────────
  const phase2: HouseError[] = [];

  // Room keys are unique across the WHOLE house. Keys are internal identifiers
  // and `labels` is what anyone reads, so an upstairs bathroom is `bathroomUp`
  // and still says "el baño".
  const seenKeys = new Set<string>();
  for (const s of ordered) {
    for (const room of compiled.get(s.level)!.rooms) {
      if (seenKeys.has(room.key)) phase2.push({ tag: 'DuplicateRoomKey', key: room.key });
      seenKeys.add(room.key);
    }
  }

  // Every storey must share one outline. The roof goes on the top footprint; a
  // smaller upper storey is a setback, whose exposed lower roof is deferred, and
  // silently roofing only part of the house is exactly the wrongness the
  // compiler exists to prevent.
  const base = compiled.get(ordered[0].level)!.footprint.bbox;
  for (const s of ordered.slice(1)) {
    const b = compiled.get(s.level)!.footprint.bbox;
    if (b.x0 !== base.x0 || b.x1 !== base.x1 || b.z0 !== base.z0 || b.z1 !== base.z1) {
      phase2.push({ tag: 'FootprintMismatch', level: s.level });
    }
  }

  // ── Stairs, and the holes they cut ────────────────────────────────────────
  const stairs: CompiledStair[] = [];
  const holes = new Map<number, Cell[]>(); // level → cells with no floor
  const seenStairIds = new Set<string>();

  for (const s of ordered) {
    const below = compiled.get(s.level)!;
    for (const stair of s.stairs ?? []) {
      const fail = (e: HouseError) => {
        phase2.push(e);
        return null;
      };
      if (seenStairIds.has(stair.id)) {
        fail({ tag: 'DuplicateStairId', id: stair.id });
        continue;
      }
      seenStairIds.add(stair.id);

      const above = compiled.get(s.level + 1);
      if (above === undefined) {
        fail({ tag: 'StairWithoutStoreyAbove', id: stair.id, level: s.level });
        continue;
      }
      if (sameCell(stair.from, stair.to)) {
        fail({ tag: 'StairTooShort', id: stair.id });
        continue;
      }
      const run = runCells(stair.from, stair.to);
      if (run === null) {
        fail({ tag: 'StairNotStraight', id: stair.id });
        continue;
      }

      // Every tread must stand in a room on the lower storey…
      const roomAt = (g: CompiledGrid, cell: Cell): WallSide | null =>
        g.rooms.find((r) => r.cells.some((c) => sameCell(c, cell)))?.key ?? null;
      const bad = run.find((c) => roomAt(below, c) === null);
      if (bad !== undefined) {
        fail({ tag: 'StairCellInvalid', id: stair.id, cell: bad });
        continue;
      }

      // …and the ARRIVAL is derived, one step past the top tread along the same
      // line, in a room on the storey above.
      const [pr, pc] = run[run.length - 2];
      const [tr, tc] = stair.to;
      const arrivalCell: Cell = [tr + (tr - pr), tc + (tc - pc)];
      const upperRoom = roomAt(above, arrivalCell);
      if (upperRoom === null) {
        fail({ tag: 'StairArrivalInvalid', id: stair.id, cell: arrivalCell });
        continue;
      }

      // The hole is exactly the run's cells, cut from the floor ABOVE. Derived,
      // never authored, so it can't drift out of line with the stair.
      const holeCells = holes.get(s.level + 1) ?? [];
      holeCells.push(...run);
      holes.set(s.level + 1, holeCells);

      const baseY = s.level * WALL_HEIGHT;
      const centreOf = (g: CompiledGrid, cell: Cell): Vec3 =>
        g.rooms.flatMap((r) => r.cells.map((c, i) => [c, r.floor[i]] as const)).find(([c]) => sameCell(c, cell))![1];
      stairs.push({
        id: stair.id,
        level: s.level,
        run,
        // Each tread's top: the climb spread evenly over the run.
        treads: run.map((c, i) => {
          const [x, , z] = centreOf(below, c);
          return vec3(x, baseY + (WALL_HEIGHT * (i + 1)) / run.length, z);
        }),
        arrival: centreOf(above, arrivalCell),
        rise: WALL_HEIGHT,
        connects: [roomAt(below, stair.from)!, upperRoom],
      });
    }
  }

  // ── Reachability: doors within a storey, stairs between them ──────────────
  const adjacency = new Map<WallSide, Set<WallSide>>();
  const link = (a: WallSide, b: WallSide) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  for (const s of ordered) {
    for (const o of compiled.get(s.level)!.openings) {
      if (o.kind === 'door') link(o.sides[0], o.sides[1]);
    }
  }
  for (const st of stairs) link(st.connects[0], st.connects[1]);

  const reached = new Set<WallSide>(['outside']);
  const queue: WallSide[] = ['outside'];
  while (queue.length > 0) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  for (const s of ordered) {
    const rooms = compiled.get(s.level)!.rooms;
    if (!rooms.some((r) => reached.has(r.key))) {
      phase2.push({ tag: 'UnreachableStorey', level: s.level });
    }
  }

  if (phase2.length > 0) return err(phase2);

  // ── Emit ──────────────────────────────────────────────────────────────────
  // Floors come out of here with the stairwell already removed, so the renderer
  // never has to know a hole exists — it draws exactly the tiles it's given.
  const out: CompiledStorey[] = ordered.map((s) => {
    const grid = compiled.get(s.level)!;
    const holeCells = holes.get(s.level) ?? [];
    const holed =
      holeCells.length === 0
        ? grid
        : {
            ...grid,
            rooms: grid.rooms.map((r) => ({
              ...r,
              floor: r.floor.filter((_, i) => !holeCells.some((h) => sameCell(h, r.cells[i]))),
            })),
          };
    return { level: s.level, baseY: s.level * WALL_HEIGHT, grid: holed, openFloor: holeCells };
  });

  // The roof sits on whatever the topmost walls are — add a storey and it
  // recomputes up there, over the new blocks.
  const top = out[out.length - 1];
  return ok({ storeys: out, stairs, roof: roofFor(top.grid.footprint) });
}