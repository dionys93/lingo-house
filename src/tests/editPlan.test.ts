// src/tests/editPlan.test.ts
//
// The edit actions themselves. Small surface, and two of the rules on it are
// the kind that look obvious and are wrong in the interesting direction.

import { describe, it, expect } from 'vitest';
import { applyEdit, itemsOn, nextItemId, openingsOn } from '../core/edit/plan';
import { houseFor } from '../content/house';
import type { Storey } from '../core/house/blocks';

const PLAN: readonly Storey[] = houseFor('january');

describe('editing a plan', () => {
  it('leaves the plan it was given alone', () => {
    const before = JSON.stringify(PLAN);
    applyEdit(PLAN, { tag: 'removeItem', level: 0, id: 'living-sofa' });
    expect(JSON.stringify(PLAN)).toBe(before);
  });

  it('touches only the storey named', () => {
    const after = applyEdit(PLAN, { tag: 'removeItem', level: 0, id: 'bedroom-bed' });
    // `bedroom-bed` is upstairs, so removing it FROM LEVEL 0 must do nothing —
    // ids are unique across the house, which makes "remove by id" look like it
    // needs no level, right up until it deletes off the wrong floor.
    expect(itemsOn(after, 1).map((i) => i.id)).toContain('bedroom-bed');
    expect(itemsOn(after, 0)).toEqual(itemsOn(PLAN, 0));
  });

  it('addresses an opening by the wall edge it sits on', () => {
    // Openings carry no authored id. The edge is the identity, and the compiler
    // already guarantees one opening per edge.
    const before = openingsOn(PLAN, 0).length;
    const after = applyEdit(PLAN, { tag: 'removeOpening', level: 0, cell: [8, 2], side: 'back' });
    expect(openingsOn(after, 0).length).toBe(before - 1);
    expect(openingsOn(after, 0).some((o) => o.cell[0] === 8 && o.cell[1] === 2 && o.side === 'back')).toBe(false);
  });

  it('re-mounts an item without disturbing anything else about it', () => {
    const after = applyEdit(PLAN, {
      tag: 'setMount',
      level: 0,
      id: 'living-sofa',
      mount: { on: 'floor', cell: [9, 3], facing: 'n' },
    });
    const sofa = itemsOn(after, 0).find((i) => i.id === 'living-sofa');
    expect(sofa?.kind).toBe('sofa');
    expect(sofa?.mount).toEqual({ on: 'floor', cell: [9, 3], facing: 'n' });
    expect(itemsOn(after, 0).length).toBe(itemsOn(PLAN, 0).length);
  });
});

describe('naming a new item', () => {
  it('never reuses an id that is taken anywhere in the house', () => {
    // Scoped to the whole plan on purpose: DuplicateItemId is a cross-storey
    // check, so a per-storey counter produces a chair upstairs and a chair down
    // that are both `chair-1` and a house that does not compile.
    const taken = new Set(PLAN.flatMap((s) => (s.items ?? []).map((i) => i.id)));
    let plan = PLAN;
    const made: string[] = [];
    for (let n = 0; n < 5; n += 1) {
      const id = nextItemId(plan, 'chair');
      made.push(id);
      plan = applyEdit(plan, { tag: 'addItem', level: n % 2, item: { id, kind: 'chair', mount: { on: 'floor', cell: [1, 1] } } });
    }
    expect(new Set(made).size).toBe(5);
    expect(made.filter((id) => taken.has(id))).toEqual([]);
  });

  it('names it after the kind, because a diff has to be readable', () => {
    expect(nextItemId(PLAN, 'bookshelf')).toBe('bookshelf-1');
  });
});

describe('an opening is its edge, not the name it was written under', () => {
  it('deletes a door addressed from the other side of its wall', () => {
    // The base plan writes the bathroom door as cell [2,7] side 'front'. The
    // same wall, named from the kitchen, is cell [3,7] side 'back'. Both are
    // true, the compiler treats them identically, and an editor that hands back
    // whichever name it derived must still delete the right door.
    const before = openingsOn(PLAN, 0).length;
    const after = applyEdit(PLAN, { tag: 'removeOpening', level: 0, cell: [6, 7], side: 'back' });
    expect(openingsOn(after, 0).length).toBe(before - 1);
    expect(openingsOn(after, 0).some((o) => o.cell[0] === 5 && o.cell[1] === 7 && o.side === 'front')).toBe(false);
  });
});

describe('deleting a host takes what it holds', () => {
  it('removes the cups when the cupboard goes', () => {
    // Leaving them behind is not "keeping the user's work": their host is gone,
    // so the plan stops compiling and the error names a cup nobody touched.
    const before = itemsOn(PLAN, 0);
    const cups = before.filter((i) => i.mount.on === 'inside' && i.mount.host === 'kitchen-cupboard');
    expect(cups.length).toBeGreaterThan(0);
    const after = itemsOn(applyEdit(PLAN, { tag: 'removeItem', level: 0, id: 'kitchen-cupboard' }), 0);
    expect(after.map((i) => i.id)).not.toContain('kitchen-cupboard');
    for (const c of cups) expect(after.map((i) => i.id)).not.toContain(c.id);
  });

  it('follows the chain, not just one link', () => {
    // A laptop on a table is one link; a cup on a shelf in a cupboard on a
    // table would be two. Nothing forbids the second, so removal cannot stop
    // at the first.
    const plan = applyEdit(PLAN, { tag: 'removeItem', level: 0, id: 'living-table' });
    expect(itemsOn(plan, 0).map((i) => i.id)).not.toContain('work-laptop');
  });

  it('leaves everything else alone', () => {
    const after = itemsOn(applyEdit(PLAN, { tag: 'removeItem', level: 0, id: 'kitchen-cupboard' }), 0);
    expect(after.map((i) => i.id)).toContain('kitchen-fridge');
    expect(after.length).toBe(itemsOn(PLAN, 0).length - 5); // the cupboard, three cups and the plates
  });
});
