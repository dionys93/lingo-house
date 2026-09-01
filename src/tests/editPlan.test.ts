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
    const after = applyEdit(PLAN, { tag: 'removeOpening', level: 0, cell: [5, 2], side: 'back' });
    expect(openingsOn(after, 0).length).toBe(before - 1);
    expect(openingsOn(after, 0).some((o) => o.cell[0] === 5 && o.cell[1] === 2 && o.side === 'back')).toBe(false);
  });

  it('re-mounts an item without disturbing anything else about it', () => {
    const after = applyEdit(PLAN, {
      tag: 'setMount',
      level: 0,
      id: 'living-sofa',
      mount: { on: 'floor', cell: [6, 3], facing: 'n' },
    });
    const sofa = itemsOn(after, 0).find((i) => i.id === 'living-sofa');
    expect(sofa?.kind).toBe('sofa');
    expect(sofa?.mount).toEqual({ on: 'floor', cell: [6, 3], facing: 'n' });
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
