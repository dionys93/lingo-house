// src/tests/explorer.test.ts
//
// The language loop's whole interaction, tested without React or three: the
// reducer is a pure function, so every rule below is a plain value assertion.

import { describe, it, expect } from 'vitest';
import {
  explorerReducer,
  START_EXPLORER,
  type ExplorerEvent,
  type ExplorerState,
} from '../core/explorer';

const run = (state: ExplorerState, ...events: readonly ExplorerEvent[]): ExplorerState =>
  events.reduce(explorerReducer, state);

describe('explorerReducer — selection', () => {
  it('selects an item', () => {
    expect(run(START_EXPLORER, { tag: 'selectItem', id: 'living-table' }).selected).toBe(
      'living-table',
    );
  });

  it('re-clicking the open item closes it — the item is its own toggle', () => {
    const s = run(
      START_EXPLORER,
      { tag: 'selectItem', id: 'living-table' },
      { tag: 'selectItem', id: 'living-table' },
    );
    expect(s.selected).toBeNull();
  });

  it('clicking a different item switches rather than closing', () => {
    const s = run(
      START_EXPLORER,
      { tag: 'selectItem', id: 'living-table' },
      { tag: 'selectItem', id: 'kitchen-table' },
    );
    expect(s.selected).toBe('kitchen-table');
  });

  it('dismiss clears the selection and is idempotent', () => {
    const once = run(START_EXPLORER, { tag: 'selectItem', id: 'living-table' }, { tag: 'dismiss' });
    expect(once.selected).toBeNull();
    expect(run(once, { tag: 'dismiss' })).toEqual(once);
  });

  it('selection never disturbs the language pair', () => {
    const s = run(START_EXPLORER, { tag: 'selectItem', id: 'living-table' });
    expect([s.from, s.to]).toEqual([START_EXPLORER.from, START_EXPLORER.to]);
  });
});

describe('explorerReducer — the language pair', () => {
  it('sets each side independently when the two differ', () => {
    const s = run(START_EXPLORER, { tag: 'setFrom', locale: 'de' }); // de → es
    expect([s.from, s.to]).toEqual(['de', 'es']);
    const t = run(s, { tag: 'setTo', locale: 'en' }); // de → en
    expect([t.from, t.to]).toEqual(['de', 'en']);
  });

  it('choosing the language already on the other side SWAPS instead of colliding', () => {
    // en → es; ask for "es" on the left. Naively that's es → es (the same word
    // twice); swapping gives es → en, which is what the user meant.
    const s = run(START_EXPLORER, { tag: 'setFrom', locale: 'es' });
    expect([s.from, s.to]).toEqual(['es', 'en']);
    const t = run(START_EXPLORER, { tag: 'setTo', locale: 'en' });
    expect([t.from, t.to]).toEqual(['es', 'en']);
  });

  it('from === to is unreachable, whatever sequence you throw at it', () => {
    const locales = ['en', 'es', 'de'] as const;
    const events: ExplorerEvent[] = locales.flatMap((locale) => [
      { tag: 'setFrom', locale },
      { tag: 'setTo', locale },
    ]);
    // Every prefix of every rotation of that event list.
    for (let rot = 0; rot < events.length; rot++) {
      const seq = [...events.slice(rot), ...events.slice(0, rot)];
      let s = START_EXPLORER;
      for (const e of seq) {
        s = explorerReducer(s, e);
        expect(s.from).not.toBe(s.to);
      }
    }
  });

  it('re-picking the language already on that side is a no-op', () => {
    expect(run(START_EXPLORER, { tag: 'setFrom', locale: 'en' })).toEqual(START_EXPLORER);
    expect(run(START_EXPLORER, { tag: 'setTo', locale: 'es' })).toEqual(START_EXPLORER);
  });

  it('changing languages keeps the popup open — you can compare pairs in place', () => {
    const s = run(
      START_EXPLORER,
      { tag: 'selectItem', id: 'living-table' },
      { tag: 'setTo', locale: 'de' },
    );
    expect(s.selected).toBe('living-table');
    expect([s.from, s.to]).toEqual(['en', 'de']);
  });
});

describe('explorerReducer — purity', () => {
  it('never mutates the state it is given', () => {
    const before = { ...START_EXPLORER };
    explorerReducer(START_EXPLORER, { tag: 'selectItem', id: 'living-table' });
    explorerReducer(START_EXPLORER, { tag: 'setFrom', locale: 'es' });
    expect(START_EXPLORER).toEqual(before);
  });
});