// src/core/house/house.ts
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

import type { CompiledGrid, Vec3, WallSide } from './compiled';
import { abutsOf, boxOfCells, roofOver, uncoveredRects } from './footprint';
import { compileGrid } from './grid';
import { WALL_HEIGHT } from './scale';
import type { RoofMesh } from '../geometry/roof';
import { indexOf } from './cells';
import type { Storey } from './blocks';
import type { Cell, HouseError } from '../shared/errors';
import { err, ok, type Result } from '../shared/result';

export interface CompiledStair {
  readonly id: string;
  readonly level: number; // the storey it climbs out of
  readonly run: readonly Cell[]; // tread cells on the lower storey, bottom first
  readonly treads: readonly Vec3[]; // world centre of each tread cell, at its own height
  readonly arrival: Vec3; // world point you step onto, upstairs
  // …and its mirror at the foot. Every stair is climbable in two directions and
  // only one of them had a landing point, which is why descending didn't exist:
  // the shell had nowhere to send you. Derived here rather than in the renderer
  // because only the compiler has the CELLS — the shell would be guessing half a
  // cell back from treads[0] and hoping it landed in a room.
  readonly departure: Vec3; // world point you step onto, downstairs
  readonly rise: number; // total climb — one storey
  readonly connects: readonly [WallSide, WallSide]; // [lower room, upper room]
  // Which flanks of the flight are open floor rather than wall, as seen by
  // someone CLIMBING. A balustrade belongs on an open side; against a wall it
  // reads as a mistake. Derived here because only the compiler knows which cells
  // belong to rooms.
  readonly openSides: readonly ('left' | 'right')[];
}

export interface CompiledStorey {
  readonly level: number;
  readonly baseY: number;
  readonly grid: CompiledGrid;
  // Cells with no floor: the stairwell coming up from the storey below.
  readonly openFloor: readonly Cell[];
  // Cells with no ceiling: the same stairwell, seen from underneath. Derived
  // from the storey ABOVE's openFloor, so looking up the stairs shows the
  // opening rather than a ceiling sealing it off.
  readonly openCeiling: readonly Cell[];
}

export interface CompiledHouse {
  readonly storeys: readonly CompiledStorey[]; // ascending by level
  readonly stairs: readonly CompiledStair[];
  /**
   * One roof per uncovered rectangle, at the height of the storey it caps.
   *
   * Was a single mesh on the top storey's footprint, which only worked because
   * every storey was forced to share one outline. With setbacks a house has
   * several roofs at several heights: the top storey's own, plus whatever each
   * lower storey leaves exposed.
   */
  readonly roofs: readonly RoofMesh[];
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

  // The union of every storey's grid. Computed before any of them compile,
  // because they all have to agree on it.
  const extent = {
    rows: ordered.reduce((m, s) => Math.max(m, s.grid.length), 0),
    cols: ordered.reduce(
      (m, s) => Math.max(m, s.grid.reduce((n, row) => Math.max(n, row.length), 0)),
      0,
    ),
  };
  const compiled = new Map<number, CompiledGrid>();
  for (const s of ordered) {
    const r = compileGrid(s.grid, {
      openings: s.openings ?? [],
      items: s.items ?? [],
      baseY: s.level * WALL_HEIGHT,
      // Every storey centres on the WHOLE house, not on itself, so cell [0][0]
      // is the same world corner on all of them and a smaller storey aligns to
      // the corner it was drawn from instead of floating in the middle.
      extent,
    });
    // An opening's id is `${orient}:${fixed}:${varying}` — unique per GRID, but
    // the same edge exists at the same coordinates on every storey, so across a
    // house it isn't unique at all. An id that isn't unique in the scope it's
    // looked up in is a broken id, so it gets qualified here rather than having
    // every lookup carry a level alongside it. compileGrid stays level-ignorant.
    if (r.ok) {
      compiled.set(s.level, {
        ...r.value,
        openings: r.value.openings.map((o) => ({ ...o, id: `L${s.level}:${o.id}` })),
      });
    } else phase1.push(...r.error);
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

  // Item ids are AUTHORED, so unlike opening ids they can collide by accident.
  // compileGrid catches duplicates within a storey; only here can we see across.
  const seenItemIds = new Set<string>();
  for (const s of ordered) {
    for (const item of compiled.get(s.level)!.items) {
      if (seenItemIds.has(item.id)) phase2.push({ tag: 'DuplicateItemId', id: item.id });
      seenItemIds.add(item.id);
    }
  }

  // The FootprintMismatch check used to live here, refusing any storey whose
  // outline differed from the ground floor's. It existed because the roof was a
  // single gable on one footprint and half-roofing a house silently is exactly
  // the wrongness the compiler exists to prevent. Roofs are now derived per
  // uncovered rectangle, so the constraint has nothing left to protect.

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
      //
      // Was a scan over every room's every cell, per lookup — and `flankOpen`
      // below calls it once per tread per flank. The shared index answers the
      // same question in O(1), and answers it the same way `boundaries` does,
      // which is the point of having extracted it.
      const belowIx = indexOf(s.grid);
      const aboveIx = indexOf(storeys.find((o) => o.level === s.level + 1)?.grid ?? null);
      const roomAt = (ix: ReturnType<typeof indexOf>, cell: Cell): WallSide | null =>
        ix.at(cell[0], cell[1]);
      const bad = run.find((c) => roomAt(belowIx, c) === null);
      if (bad !== undefined) {
        fail({ tag: 'StairCellInvalid', id: stair.id, cell: bad });
        continue;
      }

      // …and the ARRIVAL is derived, one step past the top tread along the same
      // line, in a room on the storey above.
      const [pr, pc] = run[run.length - 2];
      const [tr, tc] = stair.to;
      const arrivalCell: Cell = [tr + (tr - pr), tc + (tc - pc)];
      const upperRoom = roomAt(aboveIx, arrivalCell);
      if (upperRoom === null) {
        fail({ tag: 'StairArrivalInvalid', id: stair.id, cell: arrivalCell });
        continue;
      }

      // And the DEPARTURE, one step before the bottom tread on the same line, in
      // a room on THIS storey. Refusing a flight with no floor at its foot is the
      // compile-time form of a bug that otherwise only shows up visually: the
      // bottom step landing on an exterior wall with nowhere to stand.
      const [sr, sc] = run[1] ?? stair.to;
      const [fr, fc] = run[0];
      const departureCell: Cell = [fr - (sr - fr), fc - (sc - fc)];
      if (roomAt(belowIx, departureCell) === null) {
        fail({ tag: 'StairDepartureInvalid', id: stair.id, cell: departureCell });
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
      // Grid step of the run, and the cell to each flank of it. Walking along
      // (dr, dc), the climber's left is [r - dc, c + dr] and the right is its
      // mirror — one rotation, written out rather than re-derived per side.
      const [ar, ac] = run[0];
      const [br, bc] = run[1] ?? stair.to;
      const dr = Math.sign(br - ar);
      const dc = Math.sign(bc - ac);
      const flankOpen = (sign: 1 | -1): boolean =>
        run.every((c) => roomAt(belowIx, [c[0] - sign * dc, c[1] + sign * dr]) !== null);
      const openSides: ('left' | 'right')[] = [];
      if (flankOpen(1)) openSides.push('left');
      if (flankOpen(-1)) openSides.push('right');

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
        departure: centreOf(below, departureCell),
        rise: WALL_HEIGHT,
        connects: [roomAt(belowIx, stair.from)!, upperRoom],
        openSides,
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
  // The holes are emitted as CELL LISTS rather than by filtering each room's
  // `floor`. Filtering was the first attempt and it quietly broke an invariant:
  // `CompiledRoom.cells` and `.floor` are index-aligned (one tile per cell), and
  // a shortened `floor` beside a full `cells` is a trap for anyone who later
  // zips them. The room still OWNS the cells it owns; it's the tiles that aren't
  // drawn, which the renderer skips by cell.
  const out: CompiledStorey[] = ordered.map((s) => ({
    level: s.level,
    baseY: s.level * WALL_HEIGHT,
    grid: compiled.get(s.level)!,
    openFloor: holes.get(s.level) ?? [],
    openCeiling: holes.get(s.level + 1) ?? [],
  }));

  // One roof per storey per uncovered rectangle. A storey with another directly
  // over every cell contributes nothing; the top storey contributes its whole
  // outline, because there is never anything above it.
  const roofs: RoofMesh[] = [];
  for (const s of ordered) {
    const above = ordered.find((o) => o.level === s.level + 1)?.grid ?? null;
    const wallTopY = compiled.get(s.level)!.footprint.wallTopY;
    for (const rect of uncoveredRects(s.grid, above)) {
      roofs.push(roofOver(boxOfCells(rect, extent), wallTopY, abutsOf(rect, above)));
    }
  }

  return ok({ storeys: out, stairs, roofs });
}