// src/tests/openable.test.ts
//
// Opening a cupboard, and the things inside it.
//
// The interesting half is not the animation — it is that `mount: { on: 'inside' }`
// is a real place with real coordinates, and that a plan which puts a cup
// somewhere it could never be seen is a plan that does not compile.

import { describe as suite, it, expect } from 'vitest';
import { compileGrid } from '../core/house/grid';
import { ITEM_SPECS, itemOfPartKey, openPart, openPartsOf, partKey } from '../core/house/items';
import { CELL } from '../core/house/scale';
import { walkReducer, startWalking } from '../core/session/walk';
import type { Grid, ItemDef } from '../core/house/blocks';
import { room } from './support';

const K = room('kitchen', 'the kitchen');
const GRID: Grid = [
  [K, K, K],
  [K, K, K],
  [K, K, K],
];

const compiledWith = (items: readonly ItemDef[]) => compileGrid(GRID, { items });
const mustCompile = (items: readonly ItemDef[]) => {
  const c = compiledWith(items);
  if (!c.ok) throw new Error(JSON.stringify(c.error));
  return c.value;
};
const errorsOf = (items: readonly ItemDef[]) => {
  const c = compiledWith(items);
  return c.ok ? [] : c.error.map((e) => e.tag);
};

const CUPBOARD: ItemDef = { id: 'c', kind: 'cupboard', mount: { on: 'floor', cell: [1, 1] } };

suite('a shelf is a real place', () => {
  it('puts a cup at the shelf height its host declares', () => {
    const shelves = openPart('cupboard', 'doors')?.shelves ?? [];
    expect(shelves.length).toBeGreaterThan(1);
    const g = mustCompile([
      CUPBOARD,
      { id: 'cup', kind: 'cup', mount: { on: 'inside', host: 'c', shelf: 1 } },
    ]);
    const host = g.items.find((i) => i.id === 'c');
    const cup = g.items.find((i) => i.id === 'cup');
    expect(cup?.position[1]).toBeCloseTo((host?.position[1] ?? 0) + shelves[1], 9);
    // Directly above the cupboard's centre with no offset, so the only thing
    // that moved it is the shelf.
    expect(cup?.position[0]).toBeCloseTo(host?.position[0] ?? 0, 9);
    expect(cup?.position[2]).toBeCloseTo(host?.position[2] ?? 0, 9);
  });

  it('records what it is inside, so the renderer can hide it', () => {
    const g = mustCompile([CUPBOARD, { id: 'cup', kind: 'cup', mount: { on: 'inside', host: 'c' } }]);
    const cup = g.items.find((i) => i.id === 'cup');
    expect(cup?.mountedOn).toBe('inside');
    expect(cup?.inside).toBe(partKey('c', 'doors'));
    // A thing ON a table is not a thing IN one, and only one of them disappears
    // when the door shuts.
    const t = mustCompile([
      { id: 't', kind: 'table', mount: { on: 'floor', cell: [1, 1] } },
      { id: 'l', kind: 'laptop', mount: { on: 'item', host: 't' } },
    ]);
    expect(t.items.find((i) => i.id === 'l')?.inside).toBeUndefined();
  });

  it('measures the offset against the usable interior, not the carcass', () => {
    // `[0.5, 0]` should be the edge of the SHELF. Measured against the whole
    // footprint it would be the outside face of the cupboard, and a cup pushed
    // to the right of a shelf would end up half inside the side panel.
    const spec = ITEM_SPECS.cupboard;
    const inset = openPart('cupboard', 'doors')?.inset ?? 0;
    const g = mustCompile([
      CUPBOARD,
      { id: 'cup', kind: 'cup', mount: { on: 'inside', host: 'c', offset: [0.5, 0] } },
    ]);
    const host = g.items.find((i) => i.id === 'c');
    const cup = g.items.find((i) => i.id === 'cup');
    const moved = (cup?.position[0] ?? 0) - (host?.position[0] ?? 0);
    expect(moved).toBeCloseTo(0.5 * spec.w * (1 - 2 * inset), 9);
    expect(moved).toBeLessThan(spec.w / 2);
  });

  it('turns the offset with the host, like every other relative mount', () => {
    const g = mustCompile([
      { id: 'c', kind: 'cupboard', mount: { on: 'floor', cell: [1, 1], facing: 'e' } },
      { id: 'cup', kind: 'cup', mount: { on: 'inside', host: 'c', offset: [0.5, 0] } },
    ]);
    const host = g.items.find((i) => i.id === 'c');
    const cup = g.items.find((i) => i.id === 'cup');
    // Turned a quarter turn, "to the host's right" is along Z, not X.
    expect(cup?.position[0]).toBeCloseTo(host?.position[0] ?? 0, 9);
    expect(Math.abs((cup?.position[2] ?? 0) - (host?.position[2] ?? 0))).toBeGreaterThan(0.05);
  });
});

suite('a plan that hides something forever does not compile', () => {
  it('refuses to put anything inside a thing that does not open', () => {
    expect(
      errorsOf([
        { id: 't', kind: 'table', mount: { on: 'floor', cell: [1, 1] } },
        { id: 'cup', kind: 'cup', mount: { on: 'inside', host: 't' } },
      ]),
    ).toContain('ItemHasNoInside');
  });

  it('refuses a shelf that is not there', () => {
    // Not silently the bottom shelf. A cup on shelf 7 of a two-shelf cupboard is
    // a mistake in the plan, and putting it somewhere plausible tells nobody.
    expect(errorsOf([CUPBOARD, { id: 'cup', kind: 'cup', mount: { on: 'inside', host: 'c', shelf: 7 } }]))
      .toContain('NoSuchShelf');
  });

  it('still refuses a host that does not exist', () => {
    expect(errorsOf([{ id: 'cup', kind: 'cup', mount: { on: 'inside', host: 'ghost' } }]))
      .toContain('UnknownMountHost');
  });

  it('does not call a cup inside a cupboard an overlap', () => {
    // The fit check exempts a host and what it holds — which it must, because
    // being inside something IS overlapping it.
    expect(errorsOf([CUPBOARD, { id: 'cup', kind: 'cup', mount: { on: 'inside', host: 'c' } }])).toEqual([]);
  });

  it('and still catches two cupboards in the same place', () => {
    expect(
      errorsOf([
        CUPBOARD,
        { id: 'c2', kind: 'cupboard', mount: { on: 'floor', cell: [1, 1], offset: [0.05, 0] } },
      ]),
    ).toContain('ItemsOverlap');
  });
});

suite('open and shut', () => {
  it('is a set on the walk state, flipped by clicking', () => {
    let s = startWalking('kitchen');
    expect(s.openItems.has('c')).toBe(false);
    s = walkReducer(s, { tag: 'toggleItem', itemId: 'c' });
    expect(s.openItems.has('c')).toBe(true);
    s = walkReducer(s, { tag: 'toggleItem', itemId: 'c' });
    expect(s.openItems.has('c')).toBe(false);
  });

  it('keeps doors and items in separate sets', () => {
    // Their ids come from different places — an opening's is derived from its
    // wall edge, an item's is authored — so one set holding both would let you
    // ask "is this open" of the wrong thing and get an answer.
    let s = startWalking('kitchen');
    s = walkReducer(s, { tag: 'toggleItem', itemId: 'c' });
    expect(s.openDoors.size).toBe(0);
    s = walkReducer(s, { tag: 'toggleDoor', doorId: 'c' });
    expect(s.openItems.has('c')).toBe(true);
    expect(s.openDoors.has('c')).toBe(true);
  });

  it('survives a climb', () => {
    let s = startWalking('kitchen');
    s = walkReducer(s, { tag: 'toggleItem', itemId: 'c' });
    const stance = { level: 1, pos: [0, 0] as const, yaw: 0 };
    s = walkReducer(s, { tag: 'climb', edgeId: 'st', via: stance, to: stance, toLocation: 'landing' });
    expect(s.openItems.has('c')).toBe(true);
    s = walkReducer(s, { tag: 'arrived' });
    expect(s.openItems.has('c')).toBe(true);
  });
});

suite('what a cupboard is, dimensionally', () => {
  it('has shelves inside its own height', () => {
    // A shelf above the carcass would put a cup on the roof of it.
    for (const [kind, spec] of Object.entries(ITEM_SPECS)) {
      for (const part of spec.opens ?? []) {
        expect(part.shelves.length, `${kind}/${part.id}`).toBeGreaterThan(0);
        for (const y of part.shelves) {
          expect(y, `${kind}/${part.id} shelf`).toBeGreaterThan(0);
          expect(y, `${kind}/${part.id} shelf`).toBeLessThan(spec.h);
        }
      }
    }
  });

  it('leaves a usable interior', () => {
    for (const [kind, spec] of Object.entries(ITEM_SPECS)) {
      for (const part of spec.opens ?? []) {
        const inset = part.inset;
        if (inset === undefined) continue;
        expect(inset, `${kind}/${part.id}`).toBeGreaterThanOrEqual(0);
        expect(inset, `${kind}/${part.id}`).toBeLessThan(0.5);
        // And what fits on the shelf is smaller than the shelf.
        expect(spec.w * (1 - 2 * inset), kind).toBeGreaterThan(ITEM_SPECS.cup.w);
      }
    }
  });

  it('is one cell wide or less, like the rest of the kitchen run', () => {
    expect(ITEM_SPECS.cupboard.w).toBeLessThanOrEqual(CELL * 1.2);
  });
});

suite('a thing can open in more than one place', () => {
  it('gives a counter a drawer and a cupboard, and a fridge a freezer', () => {
    // The two that motivated parts. Each part carries the NOUN it is called by,
    // which is what its sentence is keyed on — a counter has no word of its own
    // for opening, and borrows the ones a speaker actually uses.
    expect(openPartsOf('counter').map((p) => [p.id, p.noun])).toEqual([
      ['drawer', 'drawer'],
      ['doors', 'cupboard'],
    ]);
    expect(openPartsOf('fridge').map((p) => p.noun)).toEqual(['fridge', 'freezer']);
  });

  it('keeps each part open or shut on its own', () => {
    let s = startWalking('kitchen');
    s = walkReducer(s, { tag: 'toggleItem', itemId: partKey('c1', 'drawer') });
    expect(s.openItems.has(partKey('c1', 'drawer'))).toBe(true);
    // Pulling the drawer does not swing the doors below it.
    expect(s.openItems.has(partKey('c1', 'doors'))).toBe(false);
  });

  it('puts a thing in the part it was told to', () => {
    const shelves = openPart('fridge', 'freezer')?.shelves ?? [];
    expect(shelves.length).toBeGreaterThan(0);
    const g = mustCompile([
      { id: 'f', kind: 'fridge', mount: { on: 'floor', cell: [1, 1] } },
      { id: 'ice', kind: 'cup', mount: { on: 'inside', host: 'f', part: 'freezer' } },
    ]);
    const host = g.items.find((i) => i.id === 'f');
    const ice = g.items.find((i) => i.id === 'ice');
    expect(ice?.position[1]).toBeCloseTo((host?.position[1] ?? 0) + shelves[0], 9);
    // And it is hidden by the FREEZER's door, not the fridge's — which is the
    // whole reason `inside` records a part key rather than an item id.
    expect(ice?.inside).toBe(partKey('f', 'freezer'));
  });

  it('defaults to the first part when none is named', () => {
    // What a plan written before parts existed meant, and what clicking a host
    // in edit mode does — the same part, for the same reason.
    const g = mustCompile([
      { id: 'c', kind: 'counter', mount: { on: 'floor', cell: [1, 1] } },
      { id: 'p', kind: 'plate', mount: { on: 'inside', host: 'c' } },
    ]);
    expect(g.items.find((i) => i.id === 'p')?.inside).toBe(partKey('c', 'drawer'));
  });

  it('refuses a part the host does not have', () => {
    expect(
      errorsOf([
        CUPBOARD,
        { id: 'x', kind: 'cup', mount: { on: 'inside', host: 'c', part: 'freezer' } },
      ]),
    ).toContain('NoSuchPart');
  });

  it('reads the host back out of a part key', () => {
    // Split on the LAST separator: item ids are authored and could contain one,
    // part ids are ours and never do.
    expect(itemOfPartKey(partKey('kitchen-counter-l', 'doors'))).toBe('kitchen-counter-l');
    expect(itemOfPartKey(partKey('a:b', 'drawer'))).toBe('a:b');
  });
});
