// src/tests/collide.test.ts
//
// The walking contract. Every row is a plain value assertion — collide.ts has no
// I/O, no React, no three, and no clock, so nothing here needs a harness.
//
// What this pins down:
//   slide(from, to, blockers, radius) never ends up within `radius` of a blocker
//   a glancing approach SLIDES rather than stopping
//   an open door is a real gap; a closed one and a window are not
//   corners don't leak, and degenerate input doesn't produce NaN

import { describe, expect, it } from 'vitest';
import { blockersFor, blocksDoorway, boxSegments, closestOn, cutOpenings, doorwayOf, segmentsCross, slide, stairwellOf, type Segment2, type Vec2 } from '../core/collide';
import type { AABB, CompiledOpening, CompiledWall } from '../core/grid';

const R = 0.18; // player radius, ~36cm across at 1 unit = 2m

/** A wall along X at z = 0, running x ∈ [-1, 1]. */
const WALL_X: Segment2 = { a: [-1, 0], b: [1, 0] };

const distTo = (s: Segment2, p: Vec2): number => {
  const c = closestOn(s, p);
  return Math.hypot(p[0] - c[0], p[1] - c[1]);
};

describe('closestOn', () => {
  it('clamps to the segment ends rather than the infinite line', () => {
    expect(closestOn(WALL_X, [5, 0])).toEqual([1, 0]);
    expect(closestOn(WALL_X, [-5, 0])).toEqual([-1, 0]);
  });

  it('handles a degenerate zero-length segment', () => {
    expect(closestOn({ a: [2, 2], b: [2, 2] }, [0, 0])).toEqual([2, 2]);
  });
});

describe('slide', () => {
  it('leaves a free move untouched', () => {
    expect(slide([0, -1], [0, -0.8], [WALL_X], R)).toEqual([0, -0.8]);
  });

  it('stops short of a wall walked into head-on', () => {
    const end = slide([0, -0.5], [0, 0.1], [WALL_X], R);
    expect(distTo(WALL_X, end)).toBeGreaterThanOrEqual(R - 1e-9);
    expect(end[1]).toBeLessThan(0); // pushed back to the approaching side
  });

  it('SLIDES along a wall approached at an angle instead of stopping dead', () => {
    // Moving mostly +x and slightly +z into the wall: the x travel must survive.
    const end = slide([-0.5, -0.2], [0.1, 0.05], [WALL_X], R);
    expect(distTo(WALL_X, end)).toBeGreaterThanOrEqual(R - 1e-9);
    expect(end[0]).toBeGreaterThan(-0.5); // made forward progress along the wall
  });

  it('does not leak through an inside corner', () => {
    const corner: readonly Segment2[] = [WALL_X, { a: [1, 0], b: [1, 2] }];
    const end = slide([0.5, 0.5], [1.4, -0.4], corner, R);
    for (const s of corner) expect(distTo(s, end)).toBeGreaterThanOrEqual(R - 1e-6);
  });

  // 0.7 units/s at 60fps. Every runtime step is ~15x smaller than the radius,
  // which is why the tunnelling cases above are about pathological dt rather
  // than normal play — but they still have to hold.
  const FRAME = 0.0117;

  it('creeping in at frame-rate comes to rest at about one radius, not short of it', () => {
    let p: Vec2 = [0, -0.9];
    for (let i = 0; i < 300; i += 1) p = slide(p, [p[0], p[1] + FRAME], [WALL_X], R);
    expect(distTo(WALL_X, p)).toBeGreaterThanOrEqual(R - 1e-9);
    expect(distTo(WALL_X, p)).toBeLessThan(R + 0.02);
  });

  it('is not glued: a body resting on a wall can still walk along it', () => {
    let p: Vec2 = [0, -R];
    for (let i = 0; i < 60; i += 1) p = slide(p, [p[0] + FRAME, p[1]], [WALL_X], R);
    expect(p[0]).toBeGreaterThan(0.6);
  });

  it('cannot tunnel even on a pathological timestep', () => {
    // A backgrounded tab resuming with a two-second dt.
    expect(slide([0, -0.5], [0, 40], [WALL_X], R)[1]).toBeLessThan(0);
  });

  it('never produces NaN when starting exactly on a wall line', () => {
    const end = slide([0, 0], [0.2, 0], [WALL_X], R);
    expect(Number.isFinite(end[0])).toBe(true);
    expect(Number.isFinite(end[1])).toBe(true);
  });

  it('keeps a box impassable from every side', () => {
    const box = boxSegments([-0.3, -0.3], [0.3, 0.3]);
    const approaches: readonly [Vec2, Vec2][] = [
      [[0, -1], [0, 0]],
      [[0, 1], [0, 0]],
      [[-1, 0], [0, 0]],
      [[1, 0], [0, 0]],
    ];
    for (const [from, to] of approaches) {
      const end = slide(from, to, box, R);
      const inside = end[0] > -0.3 && end[0] < 0.3 && end[1] > -0.3 && end[1] < 0.3;
      expect(inside).toBe(false);
    }
  });
});

// ── Openings ────────────────────────────────────────────────────────────────

const wall = (a: [number, number], b: [number, number]): CompiledWall => ({
  a: [a[0], 0, a[1]],
  b: [b[0], 0, b[1]],
  height: 1.2,
  axis: a[1] === b[1] ? 'x' : 'z',
  sides: ['outside', 'outside'],
});

const door = (id: string, a: [number, number], b: [number, number]): CompiledOpening => ({
  id,
  kind: 'door',
  a: [a[0], 0, a[1]],
  b: [b[0], 0, b[1]],
  axis: a[1] === b[1] ? 'x' : 'z',
  height: 1.2,
  sides: ['outside', 'outside'],
  swing: 'in',
  sill: 0,
  head: 0.98,
});

const window_ = (id: string, a: [number, number], b: [number, number]): CompiledOpening => ({
  id,
  kind: 'window',
  a: [a[0], 0, a[1]],
  b: [b[0], 0, b[1]],
  axis: a[1] === b[1] ? 'x' : 'z',
  height: 1.2,
  sides: ['outside', 'outside'],
  sill: 0.4,
  head: 0.9,
});

describe('segmentsCross', () => {
  it('reports a plain crossing', () => {
    expect(segmentsCross([0, -1], [0, 1], [-1, 0], [1, 0])).toBe(true);
  });

  it('reports collinear overlap — sliding INSIDE a wall is not free movement', () => {
    expect(segmentsCross([-0.5, 0], [0.5, 0], [-1, 0], [1, 0])).toBe(true);
  });

  it('does not report a near miss', () => {
    expect(segmentsCross([0, -1], [0, -0.5], [-1, 0], [1, 0])).toBe(false);
  });
});

describe('cutOpenings', () => {
  const w = wall([-1, 0], [1, 0]);
  const d = door('d1', [-0.25, 0], [0.25, 0]);

  it('leaves a wall whole when its door is shut', () => {
    expect(cutOpenings(w, [d], new Set())).toEqual([{ a: [-1, 0], b: [1, 0] }]);
  });

  it('cuts a real gap when the door is open', () => {
    const parts = cutOpenings(w, [d], new Set(['d1']));
    expect(parts).toEqual([
      { a: [-1, 0], b: [-0.25, 0] },
      { a: [0.25, 0], b: [1, 0] },
    ]);
  });

  it('never cuts for a window — the wall under a sill is solid', () => {
    const win = window_('w1', [-0.25, 0], [0.25, 0]);
    expect(cutOpenings(w, [win], new Set(['w1']))).toEqual([{ a: [-1, 0], b: [1, 0] }]);
  });

  it('ignores a door on a different wall line', () => {
    const elsewhere = door('d2', [-0.25, 3], [0.25, 3]);
    expect(cutOpenings(w, [elsewhere], new Set(['d2']))).toHaveLength(1);
  });

  it('lets you walk through the gap it cut, and not through the wall beside it', () => {
    const open = blockersFor([w], [d], [], new Set(['d1']));
    const through = slide([0, -0.5], [0, 0.5], open, R);
    expect(through[1]).toBeGreaterThan(0); // crossed the wall line

    const beside = slide([0.7, -0.5], [0.7, 0.5], open, R);
    expect(beside[1]).toBeLessThan(0); // did not
  });
});

describe('blockersFor', () => {
  it('includes furniture as four sides', () => {
    const bounds: AABB = { min: [-0.2, 0, -0.2], max: [0.2, 0.5, 0.2] };
    const b = blockersFor([], [], [bounds], new Set());
    expect(b).toHaveLength(4);
  });

  it('drops the y axis entirely — a tall item blocks exactly as a short one does', () => {
    const short: AABB = { min: [-0.2, 0, -0.2], max: [0.2, 0.05, 0.2] };
    const tall: AABB = { min: [-0.2, 0, -0.2], max: [0.2, 2.0, 0.2] };
    expect(blockersFor([], [], [short], new Set())).toEqual(
      blockersFor([], [], [tall], new Set()),
    );
  });
});

describe('blocksDoorway', () => {
  const gap = doorwayOf(door('d1', [-0.25, 0], [0.25, 0]));

  it('refuses a close while you are standing in the gap', () => {
    expect(blocksDoorway([0, 0], gap, R)).toBe(true);
    expect(blocksDoorway([0, R * 0.5], gap, R)).toBe(true);
  });

  it('allows a close once you have stepped clear', () => {
    expect(blocksDoorway([0, R * 1.1], gap, R)).toBe(false);
    expect(blocksDoorway([2, 0], gap, R)).toBe(false);
  });

  it('is exactly the condition that would otherwise wedge you', () => {
    // Standing in the doorway, then the wall comes back. Every direction is
    // blocked, which is what the guard exists to prevent.
    const sealed = blockersFor([wall([-1, 0], [1, 0])], [], [], new Set());
    const stuck: Vec2 = [0, 0];
    for (const to of [[0, 0.2], [0, -0.2], [0.2, 0], [-0.2, 0]] as const) {
      expect(slide(stuck, to, sealed, R)).toEqual(stuck);
    }
  });
});

describe('stairwellOf', () => {
  // A three-cell run along z at x = 0, tread centres half a cell apart.
  const treads = [
    [0, 0.4, 0.5],
    [0, 0.8, 0],
    [0, 1.2, -0.5],
  ] as const;
  const well = stairwellOf(treads, 0.5);

  it('closes the flight from every side', () => {
    const inside = (p: Vec2) => p[0] > -0.25 && p[0] < 0.25 && p[1] > -0.75 && p[1] < 0.75;
    const approaches: readonly Vec2[] = [[0, 1.5], [0, -1.5], [1.5, 0], [-1.5, 0]];
    for (const from of approaches) expect(inside(slide(from, [0, 0], well, R))).toBe(false);
  });

  it('covers the whole CELL, not just the flight width', () => {
    // The 3.5cm between a stringer and the wall is a gap no body fits through;
    // leaving it open only creates somewhere to get wedged.
    const xs = well.flatMap((s) => [s.a[0], s.b[0]]);
    expect(Math.min(...xs)).toBeCloseTo(-0.25);
    expect(Math.max(...xs)).toBeCloseTo(0.25);
  });

  it('is empty for a run with no treads rather than throwing', () => {
    expect(stairwellOf([], 0.5)).toEqual([]);
  });
});