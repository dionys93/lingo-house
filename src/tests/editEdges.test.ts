// src/tests/editEdges.test.ts
//
// The editor may only offer a door where a door is legal. The way to be sure of
// that is not to reason about it — it is to put a door on every edge the editor
// offers and require the compiler to accept all of them.

import { describe, it, expect } from 'vitest';
import { edgeKey, wallEdges } from '../core/edit/edges';
import { compileGrid } from '../core/house/grid';
import { houseExtent } from '../core/house/house';
import { gridFrame } from '../core/house/frame';
import { houseFor } from '../content/house';
import { indexOf } from '../core/house/cells';
import type { Storey } from '../core/house/blocks';

const PLAN: readonly Storey[] = houseFor('january');
const EXTENT = houseExtent(PLAN);
const FRAME = gridFrame(EXTENT.rows, EXTENT.cols);

describe('every edge the editor offers is a legal place for an opening', () => {
  for (const storey of PLAN) {
    const edges = wallEdges(storey.grid, FRAME);

    it(`level ${String(storey.level)}: finds walls at all`, () => {
      expect(edges.length).toBeGreaterThan(20);
    });

    it(`level ${String(storey.level)}: a door compiles on every one of them`, () => {
      const rejected = edges.flatMap((e) => {
        const c = compileGrid(storey.grid, {
          openings: [{ kind: 'door', cell: e.cell, side: e.side, swing: 'in', between: e.between }],
          extent: EXTENT,
        });
        return c.ok ? [] : [`[${String(e.cell[0])},${String(e.cell[1])}] ${e.side}: ${JSON.stringify(c.error)}`];
      });
      expect(rejected).toEqual([]);
    });

    it(`level ${String(storey.level)}: never addresses an edge through an empty cell`, () => {
      // The half of the addressing rule that bites on the outer face of the
      // house: one side of an exterior wall is not a cell, and an opening whose
      // `cell` is empty is OpeningCellEmpty even though the wall is real.
      const index = indexOf(storey.grid);
      const empty = edges.filter((e) => index.at(e.cell[0], e.cell[1]) === null);
      expect(empty).toEqual([]);
    });

    it(`level ${String(storey.level)}: names each edge once`, () => {
      // cell [r,c] 'left' and cell [r,c-1] 'right' are the same edge. Offering
      // both would put two clickable lines on top of each other and let the
      // author place two openings the compiler then calls OpeningsOverlap.
      expect(new Set(edges.map((e) => e.key)).size).toBe(edges.length);
    });
  }

  it('the openings the house already has sit on edges it offers', () => {
    // Matched by EDGE, not by name. The bathroom door is authored from the
    // bathroom side and this set names that wall from the kitchen side; they
    // are the same wall, and a comparison that says otherwise is the bug.
    const missing = PLAN.flatMap((s) => {
      const edges = wallEdges(s.grid, FRAME);
      const keys = new Set(edges.map((e) => e.key));
      return (s.openings ?? [])
        .filter((o) => !keys.has(edgeKey(o.cell, o.side)))
        .map((o) => `L${String(s.level)} [${String(o.cell[0])},${String(o.cell[1])}] ${o.side}`);
    });
    expect(missing).toEqual([]);
  });
});
