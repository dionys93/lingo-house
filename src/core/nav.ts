// src/core/nav.ts
//
// The door/stair GRAPH — pure, no React, no three.
//
// Doors are the horizontal edges and stairs are the vertical ones. A door with
// sides [kitchen, livingRoom] and a stair connecting [livingRoom, landing] are
// the same kind of thing here, which is why they share one edge type and one
// `traverse`. Room keys are unique house-wide, so a location is just a key —
// no level rides along.
//
// ── THIS FILE NO LONGER HOLDS NAVIGATION STATE ──────────────────────────────
//
// The name is now the only thing that suggests it does. It used to own a
// `NavState` machine and `makeNavReducer`, which moved the camera from room to
// room one door at a time. `core/walk.ts` replaced that: you walk continuously,
// and `locate.ts` derives which room you're in FROM YOUR POSITION. Where you
// are stopped being a value something had to keep in sync and became a
// consequence of where you stand.
//
// Three things went with the reducer, and it's worth saying why each one died
// rather than leaving the next reader to wonder:
//
//   boundsAt   stood the camera in the middle of a room. Nothing places the
//              camera any more — you walk it there.
//   waypoint   was the point the camera passed through mid-transition. Walking
//              has no transition to route; you're simply somewhere.
//   NavState   was the answer to "which room am I in". `locationAt` is now.
//
// ── WHAT SURVIVES, AND WHY ──────────────────────────────────────────────────
//
// The graph, because it answers a question walking cannot: WHICH TWO PLACES
// DOES THIS DOOR JOIN? `describe()` asks exactly that — given the room you're
// standing in and the door you clicked, `traverse` returns the far side, and
// that is what turns a popup from a label into an action ("Open the door to the
// kitchen"). Note the direction of the dependency: the graph knows nothing
// about where you are. It is queried, never stepped.

import type { CompiledOpening, WallSide } from './grid';
import type { CompiledStair } from './house';

// A place the camera can be: inside a room, or 'outside'. Structurally a
// WallSide, because a door's sides are exactly the two locations it connects.
export type Location = WallSide;

export interface NavEdge {
  readonly to: Location;
  readonly edgeId: string; // a door's id, or a stair's
  readonly kind: 'door' | 'stair';
}

export interface NavGraph {
  // The far side of `edgeId` from `from`, or undefined if that edge doesn't
  // touch `from` (or doesn't exist) — this is the adjacency check, and it is
  // the whole reason the graph still exists.
  readonly traverse: (from: Location, edgeId: string) => NavEdge | undefined;
  // Everything reachable from `loc` in one step. Currently unread by the shell;
  // kept because it is half of what makes this a graph rather than a lookup,
  // and because "what can I get to from here" is the next question `describe`
  // will want to ask.
  readonly neighbors: (loc: Location) => readonly NavEdge[];
}

interface Span {
  readonly a: Location;
  readonly b: Location;
  readonly kind: 'door' | 'stair';
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

  // Every edge is added from both ends. A door is not directional and neither
  // is a stair — which direction you're travelling is a fact about where you
  // stand, and `describe` works it out from `connects[0]`.
  const add = (id: string, span: Span) => {
    byId.set(id, span);
    link(span.a, { to: span.b, edgeId: id, kind: span.kind });
    link(span.b, { to: span.a, edgeId: id, kind: span.kind });
  };

  for (const o of openings) {
    if (o.kind !== 'door') continue; // windows are not traversable
    add(o.id, { a: o.sides[0], b: o.sides[1], kind: 'door' });
  }

  for (const st of stairs) {
    add(st.id, { a: st.connects[0], b: st.connects[1], kind: 'stair' });
  }

  return {
    traverse: (from, edgeId) => {
      const e = byId.get(edgeId);
      if (e === undefined) return undefined;
      if (e.a === from) return { to: e.b, edgeId, kind: e.kind };
      if (e.b === from) return { to: e.a, edgeId, kind: e.kind };
      return undefined;
    },
    neighbors: (loc) => adj.get(loc) ?? [],
  };
}