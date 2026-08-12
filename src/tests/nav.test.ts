// src/tests/nav.test.ts

import { describe, it, expect } from 'vitest';
import {
  buildNavGraph,
  makeNavReducer,
  boundsAt,
  START_OUTSIDE,
  type NavState,
} from '../core/nav';
import { DOOR_HEIGHT_FRAC } from '../core/grid';
import type { CompiledStair } from '../core/house';
import type { CompiledOpening, CompiledRoom, WallSide } from '../core/grid';

// A minimal door fixture — only the fields the nav core reads matter here.
function door(id: string, a: WallSide, b: WallSide): CompiledOpening {
  return {
    id,
    kind: 'door',
    a: [0, 0, 0],
    b: [0, 0, 0.5],
    axis: 'z',
    height: 1.2,
    sill: 0,
    head: 1.2 * DOOR_HEIGHT_FRAC,
    sides: [a, b],
    swing: 'in',
  };
}

const graph = buildNavGraph([
  door('front', 'livingRoom', 'outside'),
  door('kitchen', 'livingRoom', 'kitchen'),
  door('bath', 'livingRoom', 'bathroom'),
]);
const reduce = makeNavReducer(graph);

describe('buildNavGraph', () => {
  it('a door connects both of its sides', () => {
    expect(graph.traverse('outside', 'front')?.to).toBe('livingRoom');
    expect(graph.traverse('livingRoom', 'front')?.to).toBe('outside');
  });

  it('traversing a door from a location it does not touch is undefined', () => {
    expect(graph.traverse('kitchen', 'front')).toBeUndefined();
  });

  it('an unknown door id is undefined', () => {
    expect(graph.traverse('livingRoom', 'nope')).toBeUndefined();
  });

  it('neighbors lists every door touching a location', () => {
    expect(graph.neighbors('livingRoom').map((e) => e.to).sort()).toEqual([
      'bathroom',
      'kitchen',
      'outside',
    ]);
    expect(graph.neighbors('kitchen').map((e) => e.to)).toEqual(['livingRoom']);
  });

  it('windows are not edges', () => {
    const win: CompiledOpening = {
      id: 'w1',
      kind: 'window',
      a: [0, 0, 0],
      b: [0, 0, 0.5],
      axis: 'z',
      height: 1.2,
      sides: ['kitchen', 'outside'],
      sill: 0.4,
      head: 0.9,
    };
    const g = buildNavGraph([win]);
    expect(g.neighbors('kitchen')).toEqual([]);
    expect(g.traverse('kitchen', 'w1')).toBeUndefined();
  });
});

describe('navReducer', () => {
  it('starts outside', () => {
    expect(START_OUTSIDE).toEqual({ tag: 'in', location: 'outside' });
  });

  it('traversing an adjacent door begins a move to the other side', () => {
    const s = reduce(START_OUTSIDE, { tag: 'traverse', edgeId: 'front' });
    expect(s.tag).toBe('moving');
    if (s.tag === 'moving') {
      expect(s.from).toBe('outside');
      expect(s.to).toBe('livingRoom');
      expect(s.edgeId).toBe('front');
    }
  });

  it('arriving settles into the destination', () => {
    const moving: NavState = {
      tag: 'moving',
      from: 'outside',
      to: 'livingRoom',
      via: [0, 0.6, 0],
      edgeId: 'front',
      kind: 'door' as const,
    };
    expect(reduce(moving, { tag: 'arrived' })).toEqual({ tag: 'in', location: 'livingRoom' });
  });

  it('traversing a non-adjacent door does nothing', () => {
    const inKitchen: NavState = { tag: 'in', location: 'kitchen' };
    expect(reduce(inKitchen, { tag: 'traverse', edgeId: 'front' })).toBe(inKitchen);
  });

  it('ignores traverse while already moving', () => {
    const moving: NavState = {
      tag: 'moving',
      from: 'outside',
      to: 'livingRoom',
      via: [0, 0.6, 0],
      edgeId: 'front',
      kind: 'door' as const,
    };
    expect(reduce(moving, { tag: 'traverse', edgeId: 'kitchen' })).toBe(moving);
  });

  it('ignores arrived when not moving', () => {
    expect(reduce(START_OUTSIDE, { tag: 'arrived' })).toBe(START_OUTSIDE);
  });
});

const ROOM_LABELS = {
  en: { name: 'the kitchen', enter: 'Open the door to the kitchen', up: 'Go up to the kitchen', down: 'Go down to the kitchen' },
  es: { name: 'la cocina', enter: 'Abre la puerta de la cocina', up: 'Sube a la cocina', down: 'Baja a la cocina' },
  de: { name: 'die Küche', enter: 'Öffne die Tür zur Küche', up: 'Geh hinauf in die Küche', down: 'Geh hinunter in die Küche' },
};

describe('boundsAt', () => {
  const rooms: readonly CompiledRoom[] = [
    {
      key: 'kitchen',
      labels: ROOM_LABELS,
      cells: [[0, 0]],
      bounds: { min: [0, 0, 0], max: [1, 1.2, 1] },
      floor: [],
    },
  ];

  it('a room gives its bounds', () => {
    expect(boundsAt('kitchen', rooms)).toEqual({ min: [0, 0, 0], max: [1, 1.2, 1] });
  });

  it('the exterior has no bounds', () => {
    expect(boundsAt('outside', rooms)).toBeNull();
  });

  it('an unknown location has no bounds', () => {
    expect(boundsAt('attic', rooms)).toBeNull();
  });
});
describe('buildNavGraph — stairs are edges like doors', () => {
  const stair = (id: string, a: WallSide, b: WallSide): CompiledStair => ({
    id,
    level: 0,
    run: [[1, 0]],
    treads: [[0, 0.6, 0], [0, 1.2, 0]],
    arrival: [0, 1.2, 0],
    rise: 1.2,
    connects: [a, b],
    openSides: ['right'],
  });

  const graph = buildNavGraph(
    [door('front', 'outside', 'livingRoom')],
    [stair('up1', 'livingRoom', 'landing')],
  );

  it('joins two rooms on different storeys, both ways', () => {
    expect(graph.traverse('livingRoom', 'up1')?.to).toBe('landing');
    expect(graph.traverse('landing', 'up1')?.to).toBe('livingRoom');
  });

  it('shows up beside doors in the neighbours of a room', () => {
    expect(graph.neighbors('livingRoom').map((e) => `${e.kind}:${e.to}`).sort()).toEqual([
      'door:outside',
      'stair:landing',
    ]);
  });

  it('is refused from a room it does not touch', () => {
    expect(graph.traverse('outside', 'up1')).toBeUndefined();
  });

  it('carries its kind through the reducer, so the shell knows not to swing a door', () => {
    const reduce = makeNavReducer(graph);
    const moving = reduce({ tag: 'in', location: 'livingRoom' }, { tag: 'traverse', edgeId: 'up1' });
    expect(moving).toMatchObject({ tag: 'moving', to: 'landing', kind: 'stair', edgeId: 'up1' });
    expect(reduce(moving, { tag: 'arrived' })).toEqual({ tag: 'in', location: 'landing' });
  });

  it('routes the camera THROUGH the flight rather than teleporting between floors', () => {
    const y = graph.traverse('livingRoom', 'up1')!.waypoint[1];
    expect(y).toBeGreaterThan(0); // above the lower floor
    expect(y).toBeLessThan(2.4); // below the upper ceiling
  });
});