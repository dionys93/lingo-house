// src/core/house/collide.ts
//
// Walking, as pure geometry. No React, no three, no time — same contract as
// grid.ts and nav.ts, tested the same way.
//
// The MOVE is 2D. A storey is flat, you can't jump, and the camera stands at a
// fixed eye height, so solving the step itself in 3D would mean building a
// physics story about gravity and floor contact for a problem two coordinates
// wide.
//
// Height is consulted for exactly one decision, taken before the move: whether
// a thing is in your way AT ALL. It has to be. Every item used to contribute its
// full footprint as a wall no matter where it sat in the air, which made a 12 mm
// rug an impassable box and hung an invisible barrier under every wall-mounted
// TV. See `obstructs`.
//
// The player is a CIRCLE, not a point. A point squeezes through the zero-width
// gap where two wall segments meet at a corner, which is the classic way to end
// up outside a sealed house.

import type { AABB, CompiledOpening, CompiledWall, Vec3 } from './compiled';

export type Vec2 = readonly [x: number, z: number];

/**
 * An axis-aligned footprint — the thing you can be INSIDE of.
 *
 * Blockers are segments, which is all `slide` needs: you cannot cross into a box
 * without crossing an edge. Recovery needs more, because it asks a question
 * movement never does — "am I already in there?" — and four loose edges cannot
 * answer it. See `canStand`.
 */
export interface Box2 {
  readonly min: Vec2;
  readonly max: Vec2;
}

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
 * Openings you cannot walk through: every window, and every shut door.
 *
 * This ADDS segments; it does not cut them. That inversion was the bug.
 *
 * `compileGrid` excludes an opening's edge from the wall runs — an opening
 * CLAIMS its edge and is emitted separately — so the wall geometry already has a
 * hole at every door and every window. The old `cutOpenings` cut gaps for open
 * doors out of walls that had never covered them, which meant a window and a
 * closed door were exactly as passable as an open one.
 *
 * A window is always solid. It's a hole in the wall from sill height up, and the
 * wall beneath it is not going anywhere; at eye level you'd be climbing, which
 * nothing here models.
 */
export const solidOpenings = (
  openings: readonly CompiledOpening[],
  openDoors: ReadonlySet<string>,
): readonly Segment2[] =>
  openings
    .filter((o) => o.kind !== 'door' || !openDoors.has(o.id))
    .map((o) => ({ a: flat(o.a), b: flat(o.b) }));

/**
 * The rectangle a stair run occupies, as blockers.
 *
 * TWO volumes share one footprint, and both need it:
 *   - on the storey the flight LEAVES, it's the flight itself — solid, because
 *     you climb it by clicking, never by stepping onto a tread.
 *   - on the storey ABOVE, it's the stairwell hole, which has no floor. Nothing
 *     here simulates falling, so an unblocked hole is just a patch of room you
 *     stroll across on nothing.
 *
 * Expanded to CELL edges rather than the flight's own 0.43 width. The 3.5cm
 * either side is the gap between a stringer and the wall, and a gap a body
 * cannot fit through is better closed than defended.
 *
 * Axis-aligned because a run always follows a row or a column, so an AABB over
 * the tread centres is exact rather than an approximation.
 */
export const stairwellBox = (treads: readonly Vec3[], cell: number): Box2 | null => {
  if (treads.length === 0) return null;
  const xs = treads.map((t) => t[0]);
  const zs = treads.map((t) => t[2]);
  const half = cell / 2;
  return {
    min: [Math.min(...xs) - half, Math.min(...zs) - half],
    max: [Math.max(...xs) + half, Math.max(...zs) + half],
  };
};

export const stairwellOf = (treads: readonly Vec3[], cell: number): readonly Segment2[] => {
  const box = stairwellBox(treads, cell);
  return box === null ? [] : boxSegments(box.min, box.max);
};

/**
 * The walker, as the two heights that decide what is in its way.
 *
 * `stepOver` and `headY` are measured from the storey floor, so the same body
 * describes you upstairs and down.
 */
export interface Body {
  readonly floorY: number;
  /** Top out below this and you simply walk over it: a rug, a threshold. */
  readonly stepOver: number;
  /** Start above this and you walk under it: a wall TV, a cabinet, a beam. */
  readonly headY: number;
}

/**
 * Does this box actually stand in a walker's way?
 *
 * The rule is vertical OVERLAP with the body, not mere existence. Without it
 * every item is a wall at any height, which produced two bugs with one cause:
 * a rug 12 mm tall blocked a doorway as effectively as masonry, and a
 * wall-mounted TV projected a solid box across the floor beneath it.
 */
export const obstructs = (b: AABB, body: Body): boolean =>
  b.max[1] > body.floorY + body.stepOver && b.min[1] < body.floorY + body.headY;

/**
 * How much smaller than itself a piece of furniture blocks — 80 mm at 1 unit = 2 m.
 *
 * Not a fudge for bad collision: the AABB it shrinks is the CLICK proxy, which
 * is deliberately generous (it wraps a table's legs and all the air between
 * them) so that aiming at furniture is forgiving. Reusing that same box for
 * movement makes every object walk wider than it looks, and in a corridor two
 * of those overlap into a wall. Clicking stays forgiving; walking gets the
 * tighter box.
 *
 * Never inverts: on a box thinner than twice the margin it shrinks to a sliver
 * instead of turning inside out.
 */
export const ITEM_CLEARANCE = 0.04;

/**
 * The footprint an item actually BLOCKS with — its bounds, flattened and pulled
 * in by ITEM_CLEARANCE.
 *
 * The one definition of that box. `blockersFor` draws its four edges and
 * `canStand` tests its interior, and those two must agree exactly: if recovery
 * used the full bounds it would call you "inside" the furniture while standing
 * legally in the 80 mm the blockers leave you, and shove you off it.
 */
export const blockingFootprint = (b: AABB, m: number = ITEM_CLEARANCE): Box2 => {
  const mx = Math.min(m, (b.max[0] - b.min[0]) / 2 - 1e-3);
  const mz = Math.min(m, (b.max[2] - b.min[2]) / 2 - 1e-3);
  return {
    min: [b.min[0] + mx, b.min[2] + mz],
    max: [b.max[0] - mx, b.max[2] - mz],
  };
};

/** Everything on this storey you can walk into. */
export const blockersFor = (
  walls: readonly CompiledWall[],
  openings: readonly CompiledOpening[],
  itemBounds: readonly AABB[],
  openDoors: ReadonlySet<string>,
  body: Body,
): readonly Segment2[] => [
  // Walls are already opening-free, so they pass through untouched. They are
  // NOT shrunk: clipping into masonry is worse than any tight squeeze.
  ...walls.map((w) => ({ a: flat(w.a), b: flat(w.b) })),
  ...solidOpenings(openings, openDoors),
  ...itemBounds
    .filter((b) => obstructs(b, body))
    .flatMap((b) => {
      const { min, max } = blockingFootprint(b);
      return boxSegments(min, max);
    }),
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
// ── Recovery: restoring the precondition ────────────────────────────────────
//
// `slide` documents a precondition — the position it starts from is legal — and
// deliberately refuses to rescue a bad one. That is right for MOVEMENT: silently
// teleporting a walker out of a wall would hide authoring bugs, which is exactly
// what the comment above says.
//
// But the precondition can be broken by something other than a bad spawn: the
// WORLD can change while you stand still. Switch the month and the house
// recompiles; place a wall in edit mode and it appears around you. Neither is an
// authoring error and neither can be blamed on `slide`, so rather than weaken
// the precondition, these two make it checkable and restorable at the moment it
// is broken.
//
// WHY `solids` AND NOT JUST `blockers`. Being too close to something is a
// distance question and the segments answer it. Being INSIDE something is not:
// the centre of a box wider than 2·radius is more than radius from all four of
// its sides, so a distance test reports it clear. That is failure mode 2 from
// the move design, and at this scale it is not hypothetical — a bed's inset
// footprint is 0.62 m across the short way against a 0.36 m body, and the
// stairwell is 0.50. Recovery is given the boxes so it can ask about interiors.

const inside = (b: Box2, p: Vec2): boolean =>
  p[0] > b.min[0] && p[0] < b.max[0] && p[1] > b.min[1] && p[1] < b.max[1];

/**
 * Is `p` a legal place to be — the precondition `slide` assumes?
 *
 * Legal means clear of every blocker by at least `radius` and inside none of the
 * solids. Note that the first half is not merely "not touching": movement can
 * never bring you closer than `radius` to a blocker (see `wouldHit`), so any
 * position nearer than that is one movement did not produce.
 *
 * The epsilon is floating-point slack, not tolerance for being slightly inside
 * something. Walking up to a wall leaves you resting at exactly `radius`, and
 * this is consulted every time the blockers change — every door you open. An
 * exact comparison would let the last bit of a float decide, and answer "you
 * are stuck" for a walker who is simply standing against a wall.
 */
export const canStand = (
  p: Vec2,
  blockers: readonly Segment2[],
  solids: readonly Box2[],
  radius: number,
): boolean =>
  !solids.some((b) => inside(b, p)) &&
  blockers.every((s) => distTo(s, p) >= radius - 1e-6);

/**
 * The nearest legal place to `p`, or null if there is none within `reach`.
 *
 * A lattice search rather than a push-out along a normal: with several blockers
 * overlapping — which is the case that strands you — there is no single normal
 * to push along, and pushing out of one can push you into another. Candidates
 * are sorted by true distance, so "nearest" means nearest rather than
 * first-found-in-some-ring.
 *
 * HONEST LIMITATION: this can put you on the far side of a wall that has just
 * appeared, because the nearest legal point may simply be there. It preserves
 * your position, not which room you were in. For a month switch or a dev-time
 * edit that is the right trade; it would not be for gameplay.
 */
export const nearestStandable = (
  p: Vec2,
  blockers: readonly Segment2[],
  solids: readonly Box2[],
  radius: number,
  { step = 0.1, reach = 2.5 }: { step?: number; reach?: number } = {},
): Vec2 | null => {
  if (canStand(p, blockers, solids, radius)) return p;
  const rings = Math.max(1, Math.round(reach / step));
  const candidates: { readonly at: Vec2; readonly d2: number }[] = [];
  for (let i = -rings; i <= rings; i++) {
    for (let j = -rings; j <= rings; j++) {
      if (i === 0 && j === 0) continue;
      const at: Vec2 = [p[0] + i * step, p[1] + j * step];
      candidates.push({ at, d2: (i * step) ** 2 + (j * step) ** 2 });
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2);
  for (const c of candidates) {
    if (c.d2 > reach * reach) break;
    if (canStand(c.at, blockers, solids, radius)) return c.at;
  }
  return null;
};

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