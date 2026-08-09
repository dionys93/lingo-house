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
import type { Locale } from './labels';

export interface ExplorerState {
  readonly from: Locale;
  readonly to: Locale;
  readonly selected: string | null; // CompiledItem['id']
}

export type ExplorerEvent =
  | { readonly tag: 'selectItem'; readonly id: string }
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
    case 'selectItem':
      // Clicking the item that's already open closes it — the popup's X and the
      // item itself are the same toggle, so you never have to aim for the X.
      return { ...state, selected: state.selected === event.id ? null : event.id };
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