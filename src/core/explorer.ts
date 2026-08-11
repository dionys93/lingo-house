// src/core/explorer.ts
//
// The language loop's state: which pair of languages is showing, and which item
// (if any) is popped up. Pure reducer, same shape as nav — a plain function of
// (state, event), no React, no I/O, so the whole interaction is testable without
// mounting anything.
//
// Deliberately SEPARATE from nav: nav answers "where am I", this answers "what
// am I reading". They meet only in the shell, and only by DERIVING — the popup
// is shown when the selected item's room is the room you're standing in, which
// is computed during render rather than synced by an effect. That's why there's
// no 'leftRoom' event here to keep in step with the door graph.
//
// `from`/`to` are the two dropdowns: from = the language you know, to = the one
// you're learning.

import { assertNever } from './errors';
import type { Locale, PartKey } from './labels';
import type { Vec3 } from './grid';

// WHAT was clicked. A union rather than a bare id, because the four things you
// can click are identified differently: items and openings have ids, but a wall
// or a floor tile has no identity worth carrying — every wall is "the wall", so
// the only thing needed is where to hang the popup. The room you're standing in
// is NOT stored here; it's read from nav at render time, so the two can't
// disagree.
export type Selection =
  | { readonly on: 'item'; readonly id: string }
  | { readonly on: 'opening'; readonly id: string }
  | { readonly on: 'stair'; readonly id: string }
  | { readonly on: 'part'; readonly part: PartKey; readonly at: Vec3 };

export interface ExplorerState {
  readonly from: Locale;
  readonly to: Locale;
  readonly selected: Selection | null;
}

// Structural identity, so re-clicking the same thing toggles it shut. Parts
// compare by position: clicking the SAME floor tile closes, clicking the next
// one along moves the popup.
export const sameSelection = (a: Selection, b: Selection): boolean => {
  if (a.on !== b.on) return false;
  if (a.on === 'part' && b.on === 'part') {
    return a.part === b.part && a.at.every((v, i) => v === b.at[i]);
  }
  return 'id' in a && 'id' in b && a.id === b.id;
};

export type ExplorerEvent =
  | { readonly tag: 'select'; readonly selection: Selection }
  | { readonly tag: 'dismiss' }
  | { readonly tag: 'setFrom'; readonly locale: Locale }
  | { readonly tag: 'setTo'; readonly locale: Locale };

export const START_EXPLORER: ExplorerState = { from: 'en', to: 'es', selected: null };

// A pair where from === to would render the same word twice — legal to express
// in the types, useless on screen. Rather than police it with a runtime guard or
// a validating smart constructor, the reducer makes it UNREACHABLE: choosing the
// language that's already on the other side swaps the two, the way translation
// UIs do. Every state this reducer can produce is a state worth rendering.
export function explorerReducer(state: ExplorerState, event: ExplorerEvent): ExplorerState {
  switch (event.tag) {
    case 'select':
      // Clicking the thing that's already open closes it — the popup's X and the
      // thing itself are the same toggle, so you never have to aim for the X.
      return {
        ...state,
        selected:
          state.selected !== null && sameSelection(state.selected, event.selection)
            ? null
            : event.selection,
      };
    case 'dismiss':
      return { ...state, selected: null };
    case 'setFrom':
      return event.locale === state.to
        ? { ...state, from: event.locale, to: state.from }
        : { ...state, from: event.locale };
    case 'setTo':
      return event.locale === state.from
        ? { ...state, to: event.locale, from: state.to }
        : { ...state, to: event.locale };
    default:
      return assertNever(event);
  }
}