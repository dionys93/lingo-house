// src/tests/describe.test.ts
//
// What every popup says, tested without a scene. describe() is pure, so the
// entire reading experience — including which phrase a door shows from which
// side — is plain value assertions.

import { describe as suite, it, expect } from 'vitest';
import { compileGrid } from '../core/grid';
import { buildDoorGraph } from '../core/nav';
import { describe } from '../core/describe';
import type { LabelTable, Locale, NounKey } from '../core/labels';
import type { Selection } from '../core/explorer';
import { defineRoom, type Grid } from '../core/blocks';

const K = defineRoom({
  key: 'kitchen',
  labels: {
    en: { name: 'the kitchen', enter: 'Open the door to the kitchen' },
    es: { name: 'la cocina', enter: 'Abre la puerta de la cocina' },
    de: { name: 'die Küche', enter: 'Öffne die Tür zur Küche' },
  },
});
const L = defineRoom({
  key: 'livingRoom',
  labels: {
    en: { name: 'the living room', enter: 'Open the door to the living room' },
    es: { name: 'la sala', enter: 'Abre la puerta de la sala' },
    de: { name: 'das Wohnzimmer', enter: 'Öffne die Tür zum Wohnzimmer' },
  },
});

// A COMPLETE fixture: every noun, genuinely different in every language. The
// earlier version parameterised three words and stubbed the rest with one string
// reused across all locales — which made the table look real while quietly being
// unable to tell the languages apart for most entries. `satisfies` means adding a
// NounKey breaks this fixture too, so it can't rot back into stubs.
const WORDS = {
  table: { en: 'the table', es: 'la mesa', de: 'der Tisch' },
  laptop: { en: 'the laptop', es: 'el portátil', de: 'der Laptop' },
  tv: { en: 'the television', es: 'la televisión', de: 'der Fernseher' },
  door: { en: 'the door', es: 'la puerta', de: 'die Tür' },
  window: { en: 'the window', es: 'la ventana', de: 'das Fenster' },
  wall: { en: 'the wall', es: 'la pared', de: 'die Wand' },
  floor: { en: 'the floor', es: 'el suelo', de: 'der Boden' },
  ceiling: { en: 'the ceiling', es: 'el techo', de: 'die Decke' },
  roof: { en: 'the roof', es: 'el tejado', de: 'das Dach' },
} as const satisfies Record<NounKey, Record<Locale, string>>;

const nounsIn = (l: Locale): Record<NounKey, string> =>
  Object.fromEntries((Object.keys(WORDS) as NounKey[]).map((k) => [k, WORDS[k][l]])) as Record<
    NounKey,
    string
  >;

const LABELS: LabelTable = {
  en: { nouns: nounsIn('en'), outside: 'outside', goOutside: 'Go outside' },
  es: { nouns: nounsIn('es'), outside: 'afuera', goOutside: 'Sal afuera' },
  de: { nouns: nounsIn('de'), outside: 'draußen', goOutside: 'Geh nach draußen' },
};

// Kitchen left, living room right, an interior door between them, and a front
// door from the living room to outside.
const GRID: Grid = [[K, L]];
const DOORS = [
  { kind: 'door', cell: [0, 0], side: 'right', swing: 'in', between: ['kitchen', 'livingRoom'] },
  { kind: 'door', cell: [0, 1], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
] as const;
const ITEMS = [{ id: 't1', kind: 'table', mount: { on: 'floor', cell: [0, 0] } }] as const;

const compiled = (() => {
  const r = compileGrid(GRID, { openings: [...DOORS], items: [...ITEMS] });
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
})();
const graph = buildDoorGraph(compiled.openings);

const doorIds = compiled.openings.filter((o) => o.kind === 'door').map((o) => o.id);
const [interiorDoor, frontDoor] = doorIds;

const at = (sel: Selection, where: 'kitchen' | 'livingRoom' | 'outside') =>
  describe(sel, where, compiled, graph, LABELS, 'en', 'es');

suite('describe — the word chain', () => {
  it('names what you clicked, with the room you are in as context', () => {
    const d = at({ on: 'item', id: 't1' }, 'kitchen')!;
    expect(d.subject).toEqual({ from: 'the table', to: 'la mesa' });
    expect(d.context).toEqual([{ from: 'the kitchen', to: 'la cocina' }]);
  });

  it('names building parts from the same table', () => {
    const d = at({ on: 'part', part: 'wall', at: [0, 0.5, 0] }, 'kitchen')!;
    expect(d.subject).toEqual({ from: 'the wall', to: 'la pared' });
    expect(d.anchor).toEqual([0, 0.5, 0]); // hangs where you clicked
  });

  it('drops the room context when you are outside', () => {
    expect(at({ on: 'opening', id: frontDoor }, 'outside')!.context).toEqual([]);
  });

  it('returns null for a selection that no longer exists', () => {
    expect(at({ on: 'item', id: 'ghost' }, 'kitchen')).toBeNull();
  });
});

suite('describe — the traversal phrase', () => {
  it('is keyed by DESTINATION, so it flips with the direction you approach from', () => {
    const fromKitchen = at({ on: 'opening', id: interiorDoor }, 'kitchen')!;
    const fromLiving = at({ on: 'opening', id: interiorDoor }, 'livingRoom')!;
    expect(fromKitchen.action!.label.to).toBe('Abre la puerta de la sala');
    expect(fromLiving.action!.label.to).toBe('Abre la puerta de la cocina');
    expect(fromKitchen.action!.doorId).toBe(interiorDoor);
  });

  it('uses the outside phrase when the destination is not a room', () => {
    const out = at({ on: 'opening', id: frontDoor }, 'livingRoom')!;
    expect(out.action!.label).toEqual({ from: 'Go outside', to: 'Sal afuera' });
  });

  it('offers no action for a door you are not standing beside', () => {
    // The interior door doesn't touch 'outside', so there's nothing to walk.
    expect(at({ on: 'opening', id: interiorDoor }, 'outside')!.action).toBeUndefined();
  });

  it('names a window but never offers to walk through it', () => {
    const grid = compileGrid(
      [[K, L]],
      {
        openings: [...DOORS, { kind: 'window', cell: [0, 0], side: 'back', sill: 0.4, head: 0.9 }],
      },
    );
    if (!grid.ok) throw new Error('setup');
    const win = grid.value.openings.find((o) => o.kind === 'window')!;
    const d = describe(
      { on: 'opening', id: win.id },
      'kitchen',
      grid.value,
      buildDoorGraph(grid.value.openings),
      LABELS,
      'en',
      'es',
    )!;
    expect(d.subject).toEqual({ from: 'the window', to: 'la ventana' });
    expect(d.action).toBeUndefined();
  });
});

suite('describe — popup placement', () => {
  it('anchors a door popup dead centre of the doorway, not up at the lintel', () => {
    const d = at({ on: 'opening', id: interiorDoor }, 'kitchen')!;
    const door = compiled.openings.find((o) => o.id === interiorDoor)!;
    // Horizontally the midpoint of the opening's span…
    expect(d.anchor[0]).toBeCloseTo((door.a[0] + door.b[0]) / 2);
    expect(d.anchor[2]).toBeCloseTo((door.a[2] + door.b[2]) / 2);
    // …vertically the middle of the DOORWAY's own extent. The old anchor used
    // 0.75 × wall height (0.9), which sat above a doorway only 0.98 tall.
    expect(d.anchor[1]).toBeCloseTo((door.sill + door.head) / 2);
    expect(d.anchor[1]).toBeLessThan(door.head);
  });

  it('anchors a window popup in the middle of the glass', () => {
    const g = compileGrid(
      [[K, L]],
      {
        openings: [...DOORS, { kind: 'window', cell: [0, 0], side: 'back', sill: 0.4, head: 0.9 }],
      },
    );
    if (!g.ok) throw new Error('setup');
    const win = g.value.openings.find((o) => o.kind === 'window')!;
    const d = describe(
      { on: 'opening', id: win.id },
      'kitchen',
      g.value,
      buildDoorGraph(g.value.openings),
      LABELS,
      'en',
      'es',
    )!;
    expect(d.anchor[1]).toBeCloseTo(0.65); // (0.4 + 0.9) / 2
  });
});