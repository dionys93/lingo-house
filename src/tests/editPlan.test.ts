// src/tests/editPlan.test.ts
//
// The edit actions themselves. Small surface, and two of the rules on it are
// the kind that look obvious and are wrong in the interesting direction.

import { describe, it, expect } from 'vitest';
import { applyEdit, itemsOn, mountOnto, nextItemId, openingsOn, slotsOf } from '../core/edit/plan';
import { compileHouse } from '../core/house/house';
import type { ItemDef } from '../core/house/blocks';
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

describe('putting one item on another', () => {
  const hostOf = (kind: Parameters<typeof slotsOf>[0]): ItemDef => ({ id: 'h', kind, mount: { on: 'floor', cell: [0, 0] } });

  it('offers the top of anything with a surface', () => {
    expect(slotsOf('table')).toEqual(['top']);
    expect(slotsOf('bed')).toEqual(['top']);
  });

  it('offers the inside of anything that opens', () => {
    expect(slotsOf('wardrobe')).toEqual(['inside']);
    expect(slotsOf('fridge')).toEqual(['inside']);
  });

  it('offers both on a nightstand, top first', () => {
    // The ordering IS the placement rule: dropping something on a piece of
    // furniture means the surface. You have to say "in the drawer".
    expect(slotsOf('nightstand')).toEqual(['top', 'inside']);
    // A counter is the same shape of thing: a worktop over a drawer over a
    // cupboard, and you can put a kettle on it or a plate in it.
    expect(slotsOf('counter')).toEqual(['top', 'inside']);
  });

  it('offers nothing on a rug', () => {
    expect(slotsOf('rug')).toEqual([]);
    expect(mountOnto(hostOf('rug'), 'top')).toBeNull();
  });

  it('builds the mount the compiler wants', () => {
    expect(mountOnto(hostOf('nightstand'), 'top')).toEqual({ on: 'item', host: 'h' });
    expect(mountOnto(hostOf('cupboard'), 'inside', 1)).toEqual({ on: 'inside', host: 'h', shelf: 1 });
  });

  it('refuses a slot the host does not have', () => {
    // Not a nearest-legal guess: a lamp "inside" a table would compile to
    // ItemHasNoInside and blame the lamp.
    expect(mountOnto(hostOf('table'), 'inside')).toBeNull();
    expect(mountOnto(hostOf('wardrobe'), 'top')).toBeNull();
  });

  it('and what it builds actually compiles', () => {
    const stand = itemsOn(PLAN, 1).find((i) => i.id === 'bedroom-nightstand-l');
    expect(stand).toBeDefined();
    if (!stand) return;
    const mount = mountOnto(stand, 'inside', 0);
    expect(mount).not.toBeNull();
    if (!mount) return;
    const next = applyEdit(PLAN, { tag: 'addItem', level: 1, item: { id: 'in-drawer', kind: 'cup', mount } });
    const c = compileHouse(next);
    expect(c.ok).toBe(true);
  });
});
