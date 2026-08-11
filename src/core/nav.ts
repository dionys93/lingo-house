// src/core/nav.ts
//
// The navigation brain — pure and testable, no React, no three. Doors are the
// horizontal edges of the graph and STAIRS are the vertical ones; a door with
// sides [kitchen, livingRoom] and a stair connecting [livingRoom, landing] are
// the same kind of thing to the reducer, which is why they share one edge type
// and one `traverse` event. Room keys are unique house-wide, so a location is
// still just a key — no level rides along. The reducer
// drives a small state machine (in a location / moving between two), refusing
// illegal moves and refusing to interrupt a transition. The camera movement
// itself is shell work; WHERE it goes and WHEN is decided here.

import { openingFloorY, type AABB, type CompiledOpening, type CompiledRoom, type Vec3, type WallSide } from './grid';
import type { CompiledStair } from './house';
import { assertNever } from './errors';

// A place the camera can be: inside a room, or 'outside'. Structurally a WallSide,
// because a door's sides are exactly the two locations it connects.
export type Location = WallSide;

export interface NavEdge {
  readonly to: Location;
  readonly edgeId: string; // a door's id, or a stair's
  readonly kind: 'door' | 'stair';
  readonly waypoint: Vec3; // where the camera passes on its way through
}

export interface NavGraph {
  // The far side of `edgeId` from `from`, or undefined if that edge doesn't touch
  // `from` (or doesn't exist) — this is the adjacency check.
  readonly traverse: (from: Location, edgeId: string) => NavEdge | undefined;
  readonly neighbors: (loc: Location) => readonly NavEdge[];
}

export type NavState =
  | { readonly tag: 'in'; readonly location: Location }
  | {
      readonly tag: 'moving';
      readonly from: Location;
      readonly to: Location;
      readonly via: Vec3;
      readonly edgeId: string; // the door or stair being used — the shell swings a door open
      readonly kind: 'door' | 'stair';
    };

export type NavEvent =
  | { readonly tag: 'traverse'; readonly edgeId: string } // use a door or a stair, from the current side to the other
  | { readonly tag: 'arrived' }; // the transition finished

export const START_OUTSIDE: NavState = { tag: 'in', location: 'outside' };

interface Span {
  readonly a: Location;
  readonly b: Location;
  readonly kind: 'door' | 'stair';
  readonly waypoint: Vec3;
}

export function buildNavGraph(
  openings: readonly CompiledOpening[],
  stairs: readonly CompiledStair[] = [],
): NavGraph {
  const byId = new Map<string, Span>();
  const adj = new Map<Location, NavEdge[]>();
  const link = (from: Location, edge: NavEdge) => {
    const arr = adj.get(from);
    if (arr) arr.push(edge);
    else adj.set(from, [edge]);
  };
  const add = (id: string, span: Span) => {
    byId.set(id, span);
    link(span.a, { to: span.b, edgeId: id, kind: span.kind, waypoint: span.waypoint });
    link(span.b, { to: span.a, edgeId: id, kind: span.kind, waypoint: span.waypoint });
  };

  for (const o of openings) {
    if (o.kind !== 'door') continue; // windows are not traversable
    add(o.id, {
      a: o.sides[0],
      b: o.sides[1],
      kind: 'door',
      waypoint: [(o.a[0] + o.b[0]) / 2, openingFloorY(o) + o.height * 0.5, (o.a[2] + o.b[2]) / 2],
    });
  }

  for (const st of stairs) {
    // Halfway up the flight: the camera should rise THROUGH the stairwell rather
    // than teleport between two floors.
    const mid = st.treads[Math.floor(st.treads.length / 2)];
    add(st.id, {
      a: st.connects[0],
      b: st.connects[1],
      kind: 'stair',
      waypoint: [mid[0], mid[1] + 0.5, mid[2]],
    });
  }

  return {
    traverse: (from, edgeId) => {
      const e = byId.get(edgeId);
      if (e === undefined) return undefined;
      const base = { edgeId, kind: e.kind, waypoint: e.waypoint } as const;
      if (e.a === from) return { ...base, to: e.b };
      if (e.b === from) return { ...base, to: e.a };
      return undefined;
    },
    neighbors: (loc) => adj.get(loc) ?? [],
  };
}

// The reducer takes its graph by injection, so it stays a pure (state, event)
// function once built. Illegal or busy-time events return the state unchanged.
export function makeNavReducer(graph: NavGraph): (state: NavState, event: NavEvent) => NavState {
  return (state, event) => {
    switch (event.tag) {
      case 'traverse': {
        if (state.tag !== 'in') return state; // mid-transition: ignore
        const edge = graph.traverse(state.location, event.edgeId);
        if (edge === undefined) return state; // that door/stair isn't here
        return {
          tag: 'moving',
          from: state.location,
          to: edge.to,
          via: edge.waypoint,
          edgeId: event.edgeId,
          kind: edge.kind,
        };
      }
      case 'arrived': {
        if (state.tag !== 'moving') return state;
        return { tag: 'in', location: state.to };
      }
      default:
        return assertNever(event);
    }
  };
}

// The bounds of a location — a room's AABB, or null for the exterior. Used to
// place the camera inside a room (stand near the back, look toward the front).
export function boundsAt(location: Location, rooms: readonly CompiledRoom[]): AABB | null {
  if (location === 'outside') return null;
  const room = rooms.find((r) => r.key === location);
  return room ? room.bounds : null;
}