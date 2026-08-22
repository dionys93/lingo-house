// src/core/collide.ts
//
// Walking, as pure geometry. No React, no three, no time — same contract as
// grid.ts and nav.ts, tested the same way.
//
// Everything here works in 2D. A storey is flat, you can't jump, and the camera
// stands at a fixed eye height, so the third axis carries no information a
// collision needs. Doing this in 3D would mean building a physics story about
// gravity and floor contact to solve a problem that is two coordinates wide.
//
// The player is a CIRCLE, not a point. A point squeezes through the zero-width
// gap where two wall segments meet at a corner, which is the classic way to end
// up outside a sealed house.

import type { AABB, CompiledOpening, CompiledWall, Vec3 } from './grid';

export type Vec2 = readonly [x: number, z: number];

/** A wall run, flattened. Both endpoints, nothing else — height is irrelevant. */
export interface Segment2 {
  readonly a: Vec2;
  readonly b: Vec2;
}

const flat = (v: Vec3): Vec2 => [v[0], v[2]];

/**
 * The four sides of an axis-aligned box.
 *
 * Furniture is a box rather than a segment because you can stand on any side of
 * a table, and a single segment would let you walk into it from the other three.
 */
export const boxSegments = (min: Vec2, max: Vec2): readonly Segment2[] => [
  { a: [min[0], min[1]], b: [max[0], min[1]] },
  { a: [max[0], min[1]], b: [max[0], max[1]] },
  { a: [max[0], max[1]], b: [min[0], max[1]] },
  { a: [min[0], max[1]], b: [min[0], min[1]] },
];

/**
 * Split a wall run around the doorways in it, so an open door is a real gap.
 *
 * A wall and its openings are separate compiled records that happen to share a
 * line, and the gap has to be cut here rather than at render time: "the door is
 * open" has to be a fact collision can see, not a visual state the geometry
 * doesn't know about.
 *
 * Windows never cut a gap. A window opening is a hole in the wall from about
 * sill height up, and the wall below it is solid — flattening to 2D would
 * otherwise let you stroll through one.
 */
export const cutOpenings = (
  wall: CompiledWall,
  openings: readonly CompiledOpening[],
  openDoors: ReadonlySet<string>,
): readonly Segment2[] => {
  const along = wall.axis === 'x' ? 0 : 1;
  const a = flat(wall.a);
  const b = flat(wall.b);

  // Only doors that are open, that lie on this wall's line, and that fall
  // within its run. Sorted so the walk below can march along it.
  const gaps = openings
    .filter((o) => o.kind === 'door' && openDoors.has(o.id) && o.axis === wall.axis)
    .map((o) => ({ lo: Math.min(flat(o.a)[along], flat(o.b)[along]), hi: Math.max(flat(o.a)[along], flat(o.b)[along]), off: flat(o.a)[1 - along] }))
    .filter((g) => Math.abs(g.off - a[1 - along]) < 1e-6 && g.hi > Math.min(a[along], b[along]) && g.lo < Math.max(a[along], b[along]))
    .sort((p, q) => p.lo - q.lo);

  if (gaps.length === 0) return [{ a, b }];

  const fixed = a[1 - along];
  const lo = Math.min(a[along], b[along]);
  const hi = Math.max(a[along], b[along]);
  const at = (t: number): Vec2 => (along === 0 ? [t, fixed] : [fixed, t]);

  const out: Segment2[] = [];
  let cursor = lo;
  for (const g of gaps) {
    if (g.lo > cursor) out.push({ a: at(cursor), b: at(g.lo) });
    cursor = Math.max(cursor, g.hi);
  }
  if (cursor < hi) out.push({ a: at(cursor), b: at(hi) });
  return out;
};

/** Everything on this storey you can walk into. */
export const blockersFor = (
  walls: readonly CompiledWall[],
  openings: readonly CompiledOpening[],
  itemBounds: readonly AABB[],
  openDoors: ReadonlySet<string>,
): readonly Segment2[] => [
  ...walls.flatMap((w) => cutOpenings(w, openings, openDoors)),
  ...itemBounds.flatMap((b) => boxSegments(flat(b.min), flat(b.max))),
];

// ── The move ────────────────────────────────────────────────────────────────
//
// This tests the PATH, not just the destination, and that is the whole design.
//
// The first version of this file resolved after moving: take the step, then push
// out of anything overlapped. It failed three ways, all from the same cause —
// inspecting only where you landed:
//
//   1. Walk head-on at a wall and the destination is already PAST it, so the
//      push-out direction points the wrong way and ejects you out the far side.
//   2. The centre of a box wider than 2·radius is more than radius from all four
//      of its sides, so nothing reports an overlap and the interior is free.
//   3. Any step longer than the radius can jump a wall entirely and land far
//      enough away that nothing fires at all.
//
// Testing whether the path CROSSES a blocker fixes all three at once: you cannot
// end up on the wrong side, inside a box, or beyond a wall without crossing
// something on the way.
//
// Movement is resolved one axis at a time, which is what produces sliding: if X
// is blocked and Z is free, the Z part of the step still happens and you travel
// along the wall instead of stopping dead at it. This assumes an axis-aligned
// world, which this house is — every wall runs along X or Z and every item AABB
// is axis-aligned. A diagonal wall would still block correctly but would slide
// stepwise rather than smoothly.

const sub = (p: Vec2, q: Vec2): Vec2 => [p[0] - q[0], p[1] - q[1]];
const add = (p: Vec2, q: Vec2): Vec2 => [p[0] + q[0], p[1] + q[1]];
const scale = (p: Vec2, k: number): Vec2 => [p[0] * k, p[1] * k];
const dot = (p: Vec2, q: Vec2): number => p[0] * q[0] + p[1] * q[1];
const len = (p: Vec2): number => Math.hypot(p[0], p[1]);

/** Closest point on segment `s` to `p`, clamped to the segment's ends. */
export const closestOn = (s: Segment2, p: Vec2): Vec2 => {
  const d = sub(s.b, s.a);
  const dd = dot(d, d);
  if (dd === 0) return s.a; // degenerate; a zero-length wall is still a point
  const t = Math.min(1, Math.max(0, dot(sub(p, s.a), d) / dd));
  return add(s.a, scale(d, t));
};

const distTo = (s: Segment2, p: Vec2): number => len(sub(p, closestOn(s, p)));

const cross = (o: Vec2, a: Vec2, b: Vec2): number =>
  (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/**
 * Do segments p1p2 and p3p4 properly cross?
 *
 * Collinear overlap counts as crossing. It means you are sliding along inside a
 * wall, and treating that as free movement is how you end up travelling down the
 * middle of one.
 */
export const segmentsCross = (p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean => {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  const on = (a: Vec2, b: Vec2, c: Vec2): boolean =>
    Math.abs(cross(a, b, c)) < 1e-9 &&
    c[0] >= Math.min(a[0], b[0]) - 1e-9 && c[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    c[1] >= Math.min(a[1], b[1]) - 1e-9 && c[1] <= Math.max(a[1], b[1]) + 1e-9;
  return on(p3, p4, p1) || on(p3, p4, p2) || on(p1, p2, p3) || on(p1, p2, p4);
};

/**
 * Would stepping a→b hit something?
 *
 * Two rejections, and the second one is subtler than it looks. Rejecting any
 * destination within `radius` would GLUE you to a wall you're already resting
 * against — every sideways step along it is also within radius. So closeness
 * only blocks when the step makes it WORSE. Sliding along at a constant distance
 * is allowed; burrowing further in is not.
 */
const wouldHit = (a: Vec2, b: Vec2, blockers: readonly Segment2[], radius: number): boolean =>
  blockers.some((s) => {
    if (segmentsCross(a, b, s.a, s.b)) return true;
    const db = distTo(s, b);
    return db < radius && db < distTo(s, a);
  });

/**
 * Move from `from` toward `to`, sliding along whatever is in the way.
 *
 * PRECONDITION: `from` is already legal — not inside a blocker. Nothing here
 * rescues a bad start, by design; a spawn point inside a wall is an authoring
 * error and should fail loudly there rather than be silently teleported.
 *
 * The caller must also clamp its timestep. A backgrounded tab resuming with a
 * two-second `dt` produces a step long enough to cross a whole room, and while
 * `segmentsCross` catches that honestly, the result is a step that stops at the
 * first wall rather than the intended one.
 */
export const slide = (
  from: Vec2,
  to: Vec2,
  blockers: readonly Segment2[],
  radius: number,
): Vec2 => {
  let p = from;
  const step = (q: Vec2): void => {
    if (!wouldHit(p, q, blockers, radius)) p = q;
  };
  step([to[0], p[1]]); // X first
  step([p[0], to[1]]); // then Z, from wherever X left us
  return p;
};

/**
 * Would closing this doorway trap someone standing at `pos`?
 *
 * A door that shuts on you is not a cosmetic problem. Closing restores the wall
 * segment through the gap, and `slide` treats a path that starts ON a segment as
 * a collision in every direction — perpendicular crosses it, parallel is a
 * collinear overlap. You would not be pushed out; you would simply stop being
 * able to move at all.
 *
 * The alternative to refusing is ejecting the body to one side, which needs a
 * depenetration pass and has to pick a side. Refusing is both cheaper and more
 * honest: you cannot close a door you are standing in, which is also true of
 * doors.
 */
export const blocksDoorway = (
  pos: Vec2,
  doorway: Segment2,
  radius: number,
): boolean => len(sub(pos, closestOn(doorway, pos))) < radius;

/** The 2D gap an opening leaves in its wall. */
export const doorwayOf = (o: { readonly a: Vec3; readonly b: Vec3 }): Segment2 => ({
  a: flat(o.a),
  b: flat(o.b),
});