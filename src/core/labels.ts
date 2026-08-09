// src/core/labels.ts
//
// The language layer's types. `Locale` and `ItemKind` are both CLOSED unions, so
// a label table typed `Record<Locale, Record<ItemKind, string>>` is complete by
// construction: adding a locale or an item kind won't compile until every cell
// is filled in. That's strictly better than the "missing key surfaced at
// runtime" plan — there is no missing key to surface, and no `UnknownLabel`
// error variant is needed. If labels ever become author-supplied data loaded at
// runtime (rather than a checked-in table), that guarantee goes away and the
// error variant comes back; not today.

import type { ItemKind } from './blocks';

export type Locale = 'en' | 'es' | 'de';

// Ordered for the dropdowns. `as const` keeps it a readonly tuple of Locale,
// not string[], so the menus can't drift from the union.
export const LOCALES = ['en', 'es', 'de'] as const satisfies readonly Locale[];

// Each language named IN ITSELF — how language pickers are conventionally
// labelled, and it avoids privileging English in a language-learning tool.
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};

export type LabelTable = Record<Locale, Record<ItemKind, string>>;

// Total by construction — no lookup can fail, so this returns a string, not a
// Result. Kept as a function anyway so call sites don't index two levels deep.
export const labelFor = (labels: LabelTable, locale: Locale, kind: ItemKind): string =>
  labels[locale][kind];