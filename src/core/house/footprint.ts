// src/core/house/footprint.ts
//
// A storey's outline, and the roofs that sit on it.
//
// Separated from grid.ts because none of it is about compiling one grid: these
// are the functions compileHouse uses to reason about how storeys STACK — what
// a lower floor covers that an upper one does not, which rectangles need
// roofing, and where a roof bears.

import { roofed, type Grid } from './blocks';
import { indexOf, uncoveredBy } from './cells';
import { gableRoof, type RoofMesh, type RoofBox } from '../geometry/roof';
import { CELL, ROOF_EAVE_OVERHANG, ROOF_PITCH, ROOF_RAKE_OVERHANG, WALL_THICKNESS } from './scale';
import type { Footprint } from './compiled';

// The roof from a footprint. compileHouse will call this with the TOP storey's
// footprint; today the shell calls it with the single grid's. Pitch/overhang stay
// encapsulated here so callers only supply the outline.
/**
 * The rectangles a storey needs roofing over: whatever it covers that the storey
 * above does not.
 *
 * This is what "the roof fills in the gaps" has to mean once storeys can differ.
 * The gap is a rectilinear REGION, never a rectangle — a ground floor minus a
 * smaller upper floor is a band or an L — and a gable only knows how to sit on a
 * box. So the region is cut into maximal rectangles and each gets its own roof,
 * butt-jointed where they meet.
 *
 * Row-runs merged downward: scan each row for spans of uncovered cells, and
 * extend a span from the row above when the columns match exactly. A front band
 * comes out as one rectangle, an L as two. It is not the minimal decomposition
 * for every shape, and deliberately so — minimal rectangle partitioning is a
 * genuinely hard problem, and the failure mode here is one more ridge, not a
 * hole in the roof.
 *
 * NO VALLEYS, ever. Two gables that meet just abut. Modelling the intersection
 * is the thing that turns this from a weekend into a project.
 */
export function uncoveredRects(
  below: Grid,
  above: Grid | null,
): readonly { readonly r0: number; readonly c0: number; readonly r1: number; readonly c1: number }[] {
  // `roofed` on both sides: a patio is not a rectangle wanting a gable over it,
  // and a terrace on the storey above does not count as covering the room below.
  const lower = indexOf(roofed(below));
  const rows = lower.rows;
  const cols = lower.cols;
  const open = uncoveredBy(lower, indexOf(above === null ? null : roofed(above)));

  type Rect = { r0: number; c0: number; r1: number; c1: number };
  const out: Rect[] = [];
  let previous: Rect[] = [];

  for (let r = 0; r < rows; r += 1) {
    const runs: Rect[] = [];
    let c = 0;
    while (c < cols) {
      if (!open(r, c)) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < cols && open(r, c)) c += 1;
      runs.push({ r0: r, c0: start, r1: r, c1: c - 1 });
    }
    // Extend a run downward only when the span matches exactly; anything else
    // starts a new rectangle rather than being squared off into a wrong one.
    const carried: Rect[] = [];
    for (const run of runs) {
      const cont = previous.find((q) => q.c0 === run.c0 && q.c1 === run.c1 && q.r1 === r - 1);
      if (cont) {
        cont.r1 = r;
        carried.push(cont);
      } else {
        out.push(run);
        carried.push(run);
      }
    }
    previous = carried;
  }
  return out;
}

/**
 * The world box of a cell rectangle, in wall CENTERLINE coordinates — the same
 * convention `Footprint.bbox` uses, so `gableRoof` bears identically on both.
 */
export function boxOfCells(
  rect: { readonly r0: number; readonly c0: number; readonly r1: number; readonly c1: number },
  extent: { readonly rows: number; readonly cols: number },
): RoofBox {
  const x = (col: number) => col * CELL - (extent.cols * CELL) / 2;
  const z = (row: number) => row * CELL - (extent.rows * CELL) / 2;
  return { x0: x(rect.c0), x1: x(rect.c1 + 1), z0: z(rect.r0), z1: z(rect.r1 + 1) };
}

/**
 * Which sides of a roof rectangle run into the storey above rather than ending
 * in open air.
 *
 * A cell-level question, not a geometric one: a side abuts if ANY cell just
 * beyond it is covered by the storey above. Answering it in world coordinates
 * would mean intersecting boxes; answering it here is four lookups.
 */
export function abutsOf(
  rect: { readonly r0: number; readonly c0: number; readonly r1: number; readonly c1: number },
  above: Grid | null,
): { x0: boolean; x1: boolean; z0: boolean; z1: boolean } {
  const upper = indexOf(above === null ? null : roofed(above));
  const covered = (r: number, c: number) => upper.filled(r, c);
  const anyRow = (c: number) => {
    for (let r = rect.r0; r <= rect.r1; r += 1) if (covered(r, c)) return true;
    return false;
  };
  const anyCol = (r: number) => {
    for (let c = rect.c0; c <= rect.c1; c += 1) if (covered(r, c)) return true;
    return false;
  };
  return {
    x0: anyRow(rect.c0 - 1),
    x1: anyRow(rect.c1 + 1),
    z0: anyCol(rect.r0 - 1),
    z1: anyCol(rect.r1 + 1),
  };
}

export function roofOver(
  box: RoofBox,
  wallTopY: number,
  abuts?: { x0?: boolean; x1?: boolean; z0?: boolean; z1?: boolean },
): RoofMesh {
  return gableRoof(box, wallTopY, {
    pitch: ROOF_PITCH,
    rakeOverhang: ROOF_RAKE_OVERHANG,
    eaveOverhang: ROOF_EAVE_OVERHANG,
    bearingOffset: WALL_THICKNESS / 2,
    abuts,
  });
}

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