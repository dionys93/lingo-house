// src/core/nav.ts
//
// The navigation brain — pure and testable, no React, no three. Doors are the
// ONLY way between rooms, so the door graph IS the navigation graph: a door with
// sides [kitchen, livingRoom] is an edge between those two locations. The reducer
// drives a small state machine (in a location / moving between two), refusing
// illegal moves and refusing to interrupt a transition. The camera movement
// itself is shell work; WHERE it goes and WHEN is decided here.

import type { AABB, CompiledOpening, CompiledRoom, Vec3, WallSide } from './grid';
import { assertNever } from './errors';

// A place the camera can be: inside a room, or 'outside'. Structurally a WallSide,
// because a door's sides are exactly the two locations it connects.
export type Location = WallSide;

export interface DoorEdge {
  readonly to: Location;
  readonly doorId: string;
  readonly waypoint: Vec3; // where the camera passes through the doorway
}

export interface DoorGraph {
  // The far side of `doorId` from `from`, or undefined if that door doesn't touch
  // `from` (or doesn't exist) — this is the adjacency check.
  readonly traverse: (from: Location, doorId: string) => DoorEdge | undefined;
  readonly neighbors: (loc: Location) => readonly DoorEdge[];
}

export type NavState =
  | { readonly tag: 'in'; readonly location: Location }
  | {
      readonly tag: 'moving';
      readonly from: Location;
      readonly to: Location;
      readonly via: Vec3;
      readonly doorId: string; // the door being traversed — the shell swings it open
    };

export type NavEvent =
  | { readonly tag: 'traverse'; readonly doorId: string } // go through a door, from the current side to the other
  | { readonly tag: 'arrived' }; // the transition finished

export const START_OUTSIDE: NavState = { tag: 'in', location: 'outside' };

export function buildDoorGraph(openings: readonly CompiledOpening[]): DoorGraph {
  const byId = new Map<string, { readonly a: Location; readonly b: Location; readonly waypoint: Vec3 }>();
  const adj = new Map<Location, DoorEdge[]>();
  const link = (from: Location, edge: DoorEdge) => {
    const arr = adj.get(from);
    if (arr) arr.push(edge);
    else adj.set(from, [edge]);
  };

  for (const o of openings) {
    if (o.kind !== 'door') continue; // windows are not traversable
    const a = o.sides[0];
    const b = o.sides[1];
    const waypoint: Vec3 = [(o.a[0] + o.b[0]) / 2, o.height * 0.5, (o.a[2] + o.b[2]) / 2];
    byId.set(o.id, { a, b, waypoint });
    link(a, { to: b, doorId: o.id, waypoint });
    link(b, { to: a, doorId: o.id, waypoint });
  }

  return {
    traverse: (from, doorId) => {
      const d = byId.get(doorId);
      if (d === undefined) return undefined;
      if (d.a === from) return { to: d.b, doorId, waypoint: d.waypoint };
      if (d.b === from) return { to: d.a, doorId, waypoint: d.waypoint };
      return undefined;
    },
    neighbors: (loc) => adj.get(loc) ?? [],
  };
}

// The reducer takes its graph by injection, so it stays a pure (state, event)
// function once built. Illegal or busy-time events return the state unchanged.
export function makeNavReducer(graph: DoorGraph): (state: NavState, event: NavEvent) => NavState {
  return (state, event) => {
    switch (event.tag) {
      case 'traverse': {
        if (state.tag !== 'in') return state; // mid-transition: ignore
        const edge = graph.traverse(state.location, event.doorId);
        if (edge === undefined) return state; // door isn't on the current location
        return { tag: 'moving', from: state.location, to: edge.to, via: edge.waypoint, doorId: event.doorId };
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