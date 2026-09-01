// src/tests/describe.test.ts
//
// What every popup says, tested without a scene. describe() is pure, so the
// entire reading experience — including which phrase a door shows from which
// side — is plain value assertions.

import { describe as suite, it, expect } from 'vitest';
import { compileHouse } from '../core/house/house';
import { buildNavGraph } from '../core/house/nav';
import { describe } from '../core/house/describe';
import type { LabelTable, Locale, LocaleLabels, NounKey } from '../core/house/labels';
import { MONTHS, type Month } from '../core/house/month';
import type { Selection } from '../core/session/explorer';
import { defineRoom, type Grid, type ItemDef, type Opening } from '../core/house/blocks';

const K = defineRoom({
  key: 'kitchen',
  labels: {
    en: { name: 'the kitchen', enter: 'Open the door to the kitchen', up: 'Go up to the kitchen', down: 'Go down to the kitchen' },
    es: { name: 'la cocina', enter: 'Abre la puerta de la cocina', up: 'Sube a la cocina', down: 'Baja a la cocina' },
    de: { name: 'die Küche', enter: 'Öffne die Tür zur Küche', up: 'Geh hinauf in die Küche', down: 'Geh hinunter in die Küche' },
  },
});
const L = defineRoom({
  key: 'livingRoom',
  labels: {
    en: { name: 'the living room', enter: 'Open the door to the living room', up: 'Go up to the living room', down: 'Go down to the living room' },
    es: { name: 'la sala', enter: 'Abre la puerta de la sala', up: 'Sube a la sala', down: 'Baja a la sala' },
    de: { name: 'das Wohnzimmer', enter: 'Öffne die Tür zum Wohnzimmer', up: 'Geh hinauf ins Wohnzimmer', down: 'Geh hinunter ins Wohnzimmer' },
  },
});

// A COMPLETE fixture: every noun, genuinely different in every language. The
// earlier version parameterised three words and stubbed the rest with one string
// reused across all locales — which made the table look real while quietly being
// unable to tell the languages apart for most entries. `satisfies` means adding a
// NounKey breaks this fixture too, so it can't rot back into stubs.
const WORDS = {
  table: { en: 'the table', es: 'la mesa', de: 'der Tisch' },
  diningTable: { en: 'the dining table', es: 'la mesa de comedor', de: 'der Esstisch' },
  dishwasher: { en: 'the dishwasher', es: 'el lavavajillas', de: 'die Spülmaschine' },
  chair: { en: 'the chair', es: 'la silla', de: 'der Stuhl' },
  sofa: { en: 'the sofa', es: 'el sofá', de: 'das Sofa' },
  rug: { en: 'the rug', es: 'la alfombra', de: 'der Teppich' },
  bookshelf: { en: 'the bookshelf', es: 'la estantería', de: 'das Bücherregal' },
  lamp: { en: 'the lamp', es: 'la lámpara', de: 'die Lampe' },
  floorLamp: { en: 'the floor lamp', es: 'la lámpara de pie', de: 'die Stehlampe' },
  pottedPlant: { en: 'the potted plant', es: 'la planta en maceta', de: 'die Topfpflanze' },
  cupboard: { en: 'the cupboard', es: 'el armario de cocina', de: 'der Küchenschrank' },
  plate: { en: 'the plate', es: 'el plato', de: 'der Teller' },
  cup: { en: 'the cup', es: 'la taza', de: 'die Tasse' },
  counter: { en: 'the counter', es: 'la encimera', de: 'die Arbeitsplatte' },
  oven: { en: 'the oven', es: 'el horno', de: 'der Backofen' },
  fridge: { en: 'the fridge', es: 'la nevera', de: 'der Kühlschrank' },
  toilet: { en: 'the toilet', es: 'el inodoro', de: 'die Toilette' },
  bathtub: { en: 'the bathtub', es: 'la bañera', de: 'die Badewanne' },
  shower: { en: 'the shower', es: 'la ducha', de: 'die Dusche' },
  sink: { en: 'the sink', es: 'el lavabo', de: 'das Waschbecken' },
  bed: { en: 'the bed', es: 'la cama', de: 'das Bett' },
  wardrobe: { en: 'the wardrobe', es: 'el armario', de: 'der Kleiderschrank' },
  nightstand: { en: 'the nightstand', es: 'la mesita de noche', de: 'der Nachttisch' },
  laptop: { en: 'the laptop', es: 'el portátil', de: 'der Laptop' },
  tv: { en: 'the television', es: 'la televisión', de: 'der Fernseher' },
  door: { en: 'the door', es: 'la puerta', de: 'die Tür' },
  frontDoor: { en: 'the front door', es: 'la puerta principal', de: 'die Haustür' },
  window: { en: 'the window', es: 'la ventana', de: 'das Fenster' },
  wall: { en: 'the wall', es: 'la pared', de: 'die Wand' },
  floor: { en: 'the floor', es: 'el suelo', de: 'der Boden' },
  ground: { en: 'the ground', es: 'el suelo', de: 'der Boden' },
  ceiling: { en: 'the ceiling', es: 'el techo', de: 'die Decke' },
  roof: { en: 'the roof', es: 'el tejado', de: 'das Dach' },
  stairs: { en: 'the stairs', es: 'la escalera', de: 'die Treppe' },
} as const satisfies Record<NounKey, Record<Locale, string>>;

const nounsIn = (l: Locale): Record<NounKey, string> =>
  Object.fromEntries((Object.keys(WORDS) as NounKey[]).map((k) => [k, WORDS[k][l]])) as Record<
    NounKey,
    string
  >;

// Month names aren't what this file tests; the table just has to be total.
const monthsIn = (l: Locale): Record<Month, string> =>
  Object.fromEntries(MONTHS.map((m) => [m, `${m}-${l}`])) as Record<Month, string>;

// The sentences, per openable kind. German is accusative on purpose — it is
// the case that made composing these impossible, so the fixture has to carry it
// or the test proves nothing about the design.
const OPENS: Record<Locale, LocaleLabels['opens']> = {
  en: {
    cupboard: { open: 'Open the cupboard', close: 'Close the cupboard' },
    wardrobe: { open: 'Open the wardrobe', close: 'Close the wardrobe' },
    fridge: { open: 'Open the fridge', close: 'Close the fridge' },
    nightstand: { open: 'Open the drawer', close: 'Close the drawer' },
  },
  es: {
    cupboard: { open: 'Abre el armario de cocina', close: 'Cierra el armario de cocina' },
    wardrobe: { open: 'Abre el armario', close: 'Cierra el armario' },
    fridge: { open: 'Abre la nevera', close: 'Cierra la nevera' },
    nightstand: { open: 'Abre el cajón', close: 'Cierra el cajón' },
  },
  de: {
    cupboard: { open: 'Öffne den Küchenschrank', close: 'Schließ den Küchenschrank' },
    wardrobe: { open: 'Öffne den Kleiderschrank', close: 'Schließ den Kleiderschrank' },
    fridge: { open: 'Öffne den Kühlschrank', close: 'Schließ den Kühlschrank' },
    nightstand: { open: 'Öffne die Schublade', close: 'Schließ die Schublade' },
  },
};

const LABELS: LabelTable = {
  en: { nouns: nounsIn('en'), months: monthsIn('en'), outside: 'outside', goOutside: 'Go outside', closeDoor: 'Close the door', opens: OPENS.en },
  es: { nouns: nounsIn('es'), months: monthsIn('es'), outside: 'afuera', goOutside: 'Sal afuera', closeDoor: 'Cierra la puerta', opens: OPENS.es },
  de: { nouns: nounsIn('de'), months: monthsIn('de'), outside: 'draußen', goOutside: 'Geh nach draußen', closeDoor: 'Schließ die Tür', opens: OPENS.de },
};

const PATIO = defineRoom({
  key: 'patio',
  outdoor: true,
  labels: {
    en: { name: 'the patio', enter: 'Open the door to the patio', up: 'Go up to the patio', down: 'Go down to the patio' },
    es: { name: 'el patio', enter: 'Abre la puerta del patio', up: 'Sube al patio', down: 'Baja al patio' },
    de: { name: 'die Terrasse', enter: 'Öffne die Tür zur Terrasse', up: 'Geh hinauf auf die Terrasse', down: 'Geh hinunter auf die Terrasse' },
  },
});

// Kitchen left, living room right, an interior door between them, and a front
// door from the living room to outside.
const GRID: Grid = [[K, L]];
const DOORS = [
  { kind: 'door', cell: [0, 0], side: 'right', swing: 'in', between: ['kitchen', 'livingRoom'] },
  { kind: 'door', cell: [0, 1], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
] as const;
const ITEMS = [{ id: 't1', kind: 'table', mount: { on: 'floor', cell: [0, 0] } }] as const;

// One storey, but compiled as a house — describe() reads the whole building so
// that a room on any floor resolves without a level tagging along.
const asHouse = (openings: readonly Opening[], items: readonly ItemDef[] = []) => {
  const r = compileHouse([{ level: 0, grid: GRID, openings, items }]);
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

const house = asHouse([...DOORS], [...ITEMS]);
const compiled = house.storeys[0].grid;
const graph = buildNavGraph(compiled.openings);

const doorIds = compiled.openings.filter((o) => o.kind === 'door').map((o) => o.id);
const [interiorDoor, frontDoor] = doorIds;

const SHUT: ReadonlySet<string> = new Set();

const at = (
  sel: Selection,
  where: 'kitchen' | 'livingRoom' | 'outside',
  openDoors: ReadonlySet<string> = SHUT,
  openItems: ReadonlySet<string> = SHUT,
) =>
  describe({
    selection: sel,
    where,
    house,
    graph,
    labels: LABELS,
    from: 'en',
    to: 'es',
    openDoors,
    openItems,
  });

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

  it('calls the same tile the floor indoors and the ground outdoors', () => {
    // One mesh, two words. The shell dispatches part 'floor' for every tile
    // because it is one component; which word that is depends on where you are
    // standing, which only describe() knows. Teaching a learner that a patio has
    // a "floor" is teaching them the wrong word.
    const yard = compileHouse([
      {
        level: 0,
        grid: [[K, PATIO]],
        openings: [{ kind: 'door', cell: [0, 0], side: 'right', swing: 'in', between: ['kitchen', 'patio'] }],
      },
    ]);
    if (!yard.ok) throw new Error(JSON.stringify(yard.error));
    const g = buildNavGraph(yard.value.storeys[0].grid.openings);
    // Both clicks are made from the SAME place, so what changes the word is the
    // tile under the cursor and nothing else.
    const tileOf = (key: string) => {
      const room = yard.value.storeys[0].grid.rooms.find((r) => r.key === key);
      if (room === undefined) throw new Error(`no room ${key}`);
      return room.floor[0];
    };
    const say = (clicked: string) => {
      const d = describe({
        selection: { on: 'part', part: 'floor', at: tileOf(clicked) },
        where: 'kitchen',
        house: yard.value,
        graph: g,
        labels: LABELS,
        from: 'en',
        to: 'es',
        openDoors: SHUT,
        openItems: SHUT,
      });
      if (d === null) throw new Error('described nothing');
      return d;
    };
    expect(say('kitchen').subject.from).toBe('the floor');
    expect(say('patio').subject.from).toBe('the ground');
    // Spanish has one word for both, and that is a fact about Spanish rather
    // than a reason to make the English wrong.
    expect(say('patio').subject.to).toBe('el suelo');
  });

  it('returns null for a selection that no longer exists', () => {
    expect(at({ on: 'item', id: 'ghost' }, 'kitchen')).toBeNull();
  });
});

suite('describe — opening things', () => {
  // Its own house: the module fixture is one cell per room, and a cupboard
  // plus a table will not both fit in a square metre — which the fit checks say
  // so, correctly.
  const ROOMY: Grid = [
    [K, K, L],
    [K, K, L],
  ];
  const built = compileHouse([
    {
      level: 0,
      grid: ROOMY,
      openings: [
        { kind: 'door', cell: [0, 1], side: 'right', swing: 'in', between: ['kitchen', 'livingRoom'] },
        // A front door, or the whole storey is somewhere nobody can reach.
        { kind: 'door', cell: [1, 2], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
      ],
      items: [
        { id: 't1', kind: 'table', mount: { on: 'floor', cell: [1, 1] } },
        { id: 'cb', kind: 'cupboard', mount: { on: 'floor', cell: [0, 0] } },
        { id: 'cup1', kind: 'cup', mount: { on: 'inside', host: 'cb' } },
      ],
    },
  ]);
  if (!built.ok) throw new Error(JSON.stringify(built.error));
  const withCupboard = built.value;
  const g = buildNavGraph(withCupboard.storeys[0].grid.openings);
  const say = (id: string, openItems: ReadonlySet<string> = SHUT) => {
    const d = describe({
      selection: { on: 'item', id },
      where: 'kitchen',
      house: withCupboard,
      graph: g,
      labels: LABELS,
      from: 'en',
      to: 'es',
      openDoors: SHUT,
      openItems,
    });
    if (d === null) throw new Error(`described nothing for ${id}`);
    return d;
  };

  it('offers to open what opens', () => {
    expect(say('cb').action).toEqual({
      label: { from: 'Open the cupboard', to: 'Abre el armario de cocina' },
      on: 'item',
      id: 'cb',
    });
  });

  it('offers to close it once it is open — same click, opposite word', () => {
    expect(say('cb', new Set(['cb'])).action?.label).toEqual({
      from: 'Close the cupboard',
      to: 'Cierra el armario de cocina',
    });
  });

  it('says the whole sentence, inflected — which is why it is not composed', () => {
    // THE TEST THAT JUSTIFIES THE TABLE. German puts the object of `öffne` in
    // the accusative, so "der Küchenschrank" becomes "den Küchenschrank" — a
    // form no amount of gluing the noun onto the verb produces, because the
    // noun's own entry says "der". German will not be the last language here
    // with case, so the phrase is written out rather than derived, exactly as
    // the room phrases already are.
    const inGerman = describe({
      selection: { on: 'item', id: 'cb' },
      where: 'kitchen',
      house: withCupboard,
      graph: g,
      labels: LABELS,
      from: 'en',
      to: 'de',
      openDoors: SHUT,
      openItems: SHUT,
    });
    expect(inGerman?.action?.label.to).toBe('Öffne den Küchenschrank');
    // …and the bare noun, which the popup shows above the button, still says
    // "der". Both forms are true; only a table can hold both.
    expect(inGerman?.subject.to).toBe('der Küchenschrank');
  });

  it('offers nothing on something that does not open', () => {
    // Openable is a property of the KIND, read from the same spec that says how
    // big it is. Nothing is authored per item to say a table stays shut.
    expect(say('t1').action).toBeUndefined();
  });

  it('names the container in the chain, under the room', () => {
    // The chain was built to grow downward and this is the first thing to grow
    // it: the cup, then what it is in, then where that is.
    const d = say('cup1', new Set(['cb']));
    expect(d.subject).toEqual({ from: 'the cup', to: 'la taza' });
    expect(d.context).toEqual([
      { from: 'the cupboard', to: 'el armario de cocina' },
      { from: 'the kitchen', to: 'la cocina' },
    ]);
  });

  it('leaves a free-standing item with just its room', () => {
    expect(say('cb').context).toEqual([{ from: 'the kitchen', to: 'la cocina' }]);
  });

  it('tags the action so the shell never has to guess what the id names', () => {
    // A stair id and an item id are both strings. Before this, the shell found
    // out which by searching collections in order.
    const kinds = [
      say('cb').action?.on,
      at({ on: 'opening', id: interiorDoor }, 'kitchen')?.action?.on,
    ];
    expect(kinds).toEqual(['item', 'door']);
  });
});

suite('describe — the traversal phrase', () => {
  it('is keyed by DESTINATION, so it flips with the direction you approach from', () => {
    const fromKitchen = at({ on: 'opening', id: interiorDoor }, 'kitchen')!;
    const fromLiving = at({ on: 'opening', id: interiorDoor }, 'livingRoom')!;
    expect(fromKitchen.action!.label.to).toBe('Abre la puerta de la sala');
    expect(fromLiving.action!.label.to).toBe('Abre la puerta de la cocina');
    expect(fromKitchen.action!.id).toBe(interiorDoor);
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
    const h = asHouse([...DOORS, { kind: 'window', cell: [0, 0], side: 'back', sill: 0.4, head: 0.9 }]);
    const win = h.storeys[0].grid.openings.find((o) => o.kind === 'window')!;
    const d = describe({
      selection: { on: 'opening', id: win.id },
      where: 'kitchen',
      house: h,
      graph: buildNavGraph(h.storeys[0].grid.openings),
      labels: LABELS,
      from: 'en',
      to: 'es',
      openDoors: SHUT,
      openItems: SHUT,
    })!;
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
    const h = asHouse([...DOORS, { kind: 'window', cell: [0, 0], side: 'back', sill: 0.4, head: 0.9 }]);
    const win = h.storeys[0].grid.openings.find((o) => o.kind === 'window')!;
    const d = describe({
      selection: { on: 'opening', id: win.id },
      where: 'kitchen',
      house: h,
      graph: buildNavGraph(h.storeys[0].grid.openings),
      labels: LABELS,
      from: 'en',
      to: 'es',
      openDoors: SHUT,
      openItems: SHUT,
    })!;
    expect(d.anchor[1]).toBeCloseTo(0.65); // (0.4 + 0.9) / 2
  });
});

suite('describe — stairs', () => {
  // A two-storey fixture: the kitchen below, the living room above, joined by a
  // stair. Contrived, but it exercises the only thing that matters here — which
  // phrase you get depends on which end you're standing at.
  const twoStorey = (() => {
    const r = compileHouse([
      {
        level: 0,
        // Four rows, not three: the stair's departure cell — the floor at the
        // foot of the flight — has to exist, and on a three-row grid it falls
        // off the end.
        grid: [[K], [K], [K], [K]],
        openings: [{ kind: 'door', cell: [3, 0], side: 'front', swing: 'out' }],
        stairs: [{ id: 'st', from: [2, 0], to: [1, 0] }],
      },
      { level: 1, grid: [[L], [L], [L], [L]] },
    ]);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r;
  })().value;
  const stairGraph = buildNavGraph(
    twoStorey.storeys.flatMap((s) => s.grid.openings),
    twoStorey.stairs,
  );
  const atStair = (where: 'kitchen' | 'livingRoom' | 'outside') =>
    describe({
      selection: { on: 'stair', id: 'st' },
      where,
      house: twoStorey,
      graph: stairGraph,
      labels: LABELS,
      from: 'en',
      to: 'es',
      openDoors: SHUT,
      openItems: SHUT,
    });

  it('names the stairs and hangs the popup partway UP the flight', () => {
    const d = atStair('kitchen')!;
    expect(d.subject).toEqual({ from: 'the stairs', to: 'la escalera' });
    // Between the bottom and top treads — not above the topmost step, which is
    // where a fixed lift off the middle tread used to put it.
    const [stair] = twoStorey.stairs;
    const lo = stair.treads[0][1];
    const hi = stair.treads[stair.treads.length - 1][1];
    expect(d.anchor[1]).toBeGreaterThan(lo);
    expect(d.anchor[1]).toBeLessThan(hi);
    // …and horizontally halfway along the run, whatever the tread count.
    expect(d.anchor[2]).toBeCloseTo((stair.treads[0][2] + stair.treads[stair.treads.length - 1][2]) / 2);
  });

  it('says CLIMB from the bottom and DESCEND from the top — same stair', () => {
    expect(atStair('kitchen')!.action!.label.to).toBe('Sube a la sala');
    expect(atStair('livingRoom')!.action!.label.to).toBe('Baja a la cocina');
  });

  it('hands nav the stair id, so the popup button drives the same traverse', () => {
    expect(atStair('kitchen')!.action!.id).toBe('st');
  });

  it('offers no climb from a room the stair does not touch', () => {
    expect(atStair('outside')!.action).toBeUndefined();
  });
});

suite('describe — a door that is already open', () => {
  it('offers closing it, in both languages', () => {
    const d = at({ on: 'opening', id: interiorDoor }, 'kitchen', new Set([interiorDoor]))!;
    expect(d.action).toEqual({
      label: { from: 'Close the door', to: 'Cierra la puerta' },
      on: 'door',
      id: interiorDoor,
    });
  });

  it('still names the destination while it is shut', () => {
    const d = at({ on: 'opening', id: interiorDoor }, 'kitchen')!;
    expect(d.action?.label.from).toContain('living room');
  });

  it('names no room when closing — you close a door, not a destination', () => {
    // The point of skipping the graph: the phrase holds even from a side the
    // graph doesn't join, and it is identical from either side of the door.
    const fromKitchen = at({ on: 'opening', id: interiorDoor }, 'kitchen', new Set([interiorDoor]))!;
    const fromLiving = at({ on: 'opening', id: interiorDoor }, 'livingRoom', new Set([interiorDoor]))!;
    expect(fromKitchen.action).toEqual(fromLiving.action);
  });

  it('names an exterior door with its OWN noun, not door-plus-adjective', () => {
    // die Haustür is a different word from die Tür, not a decorated one, and the
    // same holds in Spanish and English. `describe` derives this from the
    // compiler's own `sides` rather than from anything authored, so the only way
    // to get it wrong is to stop deriving it.
    const front = at({ on: 'opening', id: frontDoor }, 'livingRoom')!;
    const interior = at({ on: 'opening', id: interiorDoor }, 'kitchen')!;
    expect(front.subject).toEqual({ from: 'the front door', to: 'la puerta principal' });
    expect(interior.subject).toEqual({ from: 'the door', to: 'la puerta' });
  });

  it('subject stays the SAME noun whether the door is open or shut', () => {
    const open = at({ on: 'opening', id: frontDoor }, 'outside', new Set([frontDoor]))!;
    const shut = at({ on: 'opening', id: frontDoor }, 'outside')!;
    expect(open.subject).toEqual(shut.subject);
  });
});