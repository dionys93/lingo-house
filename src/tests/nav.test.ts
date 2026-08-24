// src/tests/nav.test.ts
//
// The door/stair graph. Two describes, both about `buildNavGraph`: doors first,
// then stairs, which are the same thing with a different `kind`.
//
// What used to be here and isn't: `navReducer` (six tests) and `boundsAt`
// (three), deleted alongside the reducer they covered — see the header of
// `core/nav.ts`. Plus one stair test that asserted the mid-flight waypoint,
// which only meant something while the camera teleported between floors.
//
// A NOTE ON THE `stair` FIXTURE BELOW. It was missing `departure` for as long
// as that field has existed, and every test in this file passed anyway —
// vitest transpiles through esbuild and does not typecheck, and `buildNavGraph`
// never reads the field. The first `npx tsc -b` on this project found it. Which
// is the argument for running `tsc -b && vitest run` as ONE command: two checks
// that can each pass while the other fails aren't two checks.

import { describe, it, expect } from 'vitest';
import { buildNavGraph } from '../core/house/nav';
import { DOOR_HEIGHT_FRAC } from '../core/house/grid';
import type { CompiledStair } from '../core/house/house';
import type { CompiledOpening, WallSide } from '../core/house/grid';

// A minimal door fixture — only the fields the graph reads matter here.
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

describe('buildNavGraph — stairs are edges like doors', () => {
  // `connects` is [lower, upper], so `arrival` is the top and `departure` the
  // foot. Both ends are required: a flight you can climb but not descend is
  // what `departure` was added to make unrepresentable.
  const stair = (id: string, lower: WallSide, upper: WallSide): CompiledStair => ({
    id,
    level: 0,
    run: [[1, 0]],
    treads: [[0, 0.6, 0], [0, 1.2, 0]],
    arrival: [0, 1.2, 0],
    departure: [0, 0, 0],
    rise: 1.2,
    connects: [lower, upper],
    openSides: ['right'],
  });

  const stairGraph = buildNavGraph(
    [door('front', 'outside', 'livingRoom')],
    [stair('up1', 'livingRoom', 'landing')],
  );

  it('joins two rooms on different storeys, both ways', () => {
    expect(stairGraph.traverse('livingRoom', 'up1')?.to).toBe('landing');
    expect(stairGraph.traverse('landing', 'up1')?.to).toBe('livingRoom');
  });

  it('shows up beside doors in the neighbours of a room', () => {
    expect(stairGraph.neighbors('livingRoom').map((e) => `${e.kind}:${e.to}`).sort()).toEqual([
      'door:outside',
      'stair:landing',
    ]);
  });

  it('is refused from a room it does not touch', () => {
    expect(stairGraph.traverse('outside', 'up1')).toBeUndefined();
  });

  it('carries its kind, so a caller can tell a flight from a doorway', () => {
    // Was routed through the reducer, which used `kind` to decide whether to
    // swing a door open. The reducer is gone; the distinction still has to
    // survive `traverse`, because `describe` picks "Go up to…" over "Open the
    // door to…" on exactly this field.
    expect(stairGraph.traverse('livingRoom', 'up1')?.kind).toBe('stair');
    expect(stairGraph.traverse('livingRoom', 'front')?.kind).toBe('door');
  });
});