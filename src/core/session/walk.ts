// src/core/session/walk.ts
//
// The walking brain. Replaces the discrete graph in nav.ts, which modelled
// navigation as "in a location" or "moving between two" and cannot represent
// standing in a doorway.
//
// The split is the design: CONTINUOUS within a storey, DISCRETE between them.
// Doors are no longer edges you traverse — they're gaps in a collision list you
// walk through. Stairs stay a scripted move, because a staircase is a transition
// between two worlds rather than a corridor.
//
// WHAT IS NOT IN HERE: your position. The camera moves at 60Hz and React has no
// reason to see any of it — dispatching a frame's worth of movement into a
// reducer would re-render the house sixty times a second to no purpose. The
// shell owns the stance in a ref and reports only what actually changes state:
// which room you entered, which door you opened, when a climb finished.

import { assertNever } from '../shared/errors';
import type { Location } from '../house/nav';
import type { Vec2 } from '../house/collide';

/** Where the camera stands. Owned by the shell, passed here only for a climb. */
export interface Stance {
  readonly level: number;
  readonly pos: Vec2;
  readonly yaw: number;
}

export type WalkState =
  | {
      readonly tag: 'walking';
      readonly level: number;
      readonly location: Location;
      readonly openDoors: ReadonlySet<string>;
      readonly openItems: ReadonlySet<string>;
    }
  | {
      readonly tag: 'climbing';
      readonly edgeId: string;
      /**
       * The foot of the flight, on the storey you're leaving.
       *
       * A climb is two legs, not one. Interpolating straight from wherever you
       * clicked to the far landing draws a line THROUGH the staircase — you sink
       * into the middle of the flight and rise out of it diagonally, never
       * touching a tread. Going to the near end first means the second leg runs
       * along the stair rather than across it.
       */
      readonly via: Stance;
      readonly to: Stance;
      readonly toLocation: Location;
      readonly openDoors: ReadonlySet<string>;
      readonly openItems: ReadonlySet<string>;
    };

export type WalkEvent =
  /** The shell noticed you crossed into a different room. Ignored mid-climb. */
  | { readonly tag: 'entered'; readonly location: Location }
  | { readonly tag: 'toggleDoor'; readonly doorId: string }
  // A cupboard, a wardrobe, a drawer. Separate from toggleDoor because the two
  // ids live in different namespaces — an opening's id is derived from its wall
  // edge and an item's is authored — and one set holding both would make
  // "is this open" a question you could ask of the wrong thing and get an
  // answer to.
  | { readonly tag: 'toggleItem'; readonly itemId: string }
  | {
      readonly tag: 'climb';
      readonly edgeId: string;
      readonly via: Stance;
      readonly to: Stance;
      readonly toLocation: Location;
    }
  | { readonly tag: 'arrived' };

export const startWalking = (location: Location): WalkState => ({
  tag: 'walking',
  level: 0,
  location,
  openDoors: new Set(),
  openItems: new Set(),
});

export function walkReducer(state: WalkState, event: WalkEvent): WalkState {
  switch (event.tag) {
    case 'entered':
      // Mid-climb the shell is animating the camera through geometry it doesn't
      // belong to yet; whatever rooms it passes through are not arrivals.
      if (state.tag !== 'walking') return state;
      return state.location === event.location ? state : { ...state, location: event.location };

    case 'toggleDoor': {
      // A door is open or shut, and clicking it swaps the two. The reducer flips
      // unconditionally; whether the flip is ALLOWED is geometry, and geometry
      // needs a position this deliberately doesn't hold. The shell asks
      // `blocksDoorway` before dispatching a close.
      const openDoors = new Set(state.openDoors);
      if (!openDoors.delete(event.doorId)) openDoors.add(event.doorId);
      return { ...state, openDoors };
    }

    case 'toggleItem': {
      // No equivalent of the doorway check below: shutting a cupboard cannot
      // trap you, because a cupboard's footprint blocks you whether it is open
      // or shut. Its door swinging through the air you stand in is a liberty
      // every kitchen takes.
      const openItems = new Set(state.openItems);
      if (!openItems.delete(event.itemId)) openItems.add(event.itemId);
      return { ...state, openItems };
    }

    case 'climb':
      // Refuse to interrupt a climb, exactly as the old reducer refused to
      // interrupt a traverse. Two overlapping camera animations is a bug you
      // can only see and never explain.
      if (state.tag !== 'walking') return state;
      return {
        tag: 'climbing',
        edgeId: event.edgeId,
        via: event.via,
        to: event.to,
        toLocation: event.toLocation,
        openDoors: state.openDoors,
        openItems: state.openItems,
      };

    case 'arrived':
      if (state.tag !== 'climbing') return state;
      return {
        tag: 'walking',
        level: state.to.level,
        location: state.toLocation,
        openDoors: state.openDoors,
        openItems: state.openItems,
      };

    default:
      return assertNever(event);
  }
}

/**
 * Where the light rig and the labels should think you are.
 *
 * `location` lives only on the walking variant, so every reader needs this
 * rather than reaching for the field. Mid-climb it answers with the
 * DESTINATION, which is the same call the old nav reducer made for a traverse
 * and for the same reason: changing the rig as the camera starts moving hides
 * the change under the motion, while changing it on arrival pops it at the exact
 * moment you stop and look.
 */
export function locationOf(state: WalkState): Location {
  switch (state.tag) {
    case 'walking':
      return state.location;
    case 'climbing':
      return state.toLocation;
    default:
      return assertNever(state);
  }
}