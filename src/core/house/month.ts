// src/core/house/month.ts
//
// The calendar, as a closed union.
//
// The house is meant to CHANGE through the year — different items, different
// finishes, eventually different layouts — so "which month" is a first-class
// input to the plan rather than a flag bolted onto the shell. Keeping it a
// closed union buys the same guarantee `Locale` and `ItemKind` already buy: a
// `Record<Month, ...>` is complete by construction, so a month cannot exist
// without a name in every language, and the picker cannot drift from the model.
//
// A month deliberately carries NO layout of its own here. Core knows that
// twelve of them exist and what order they come in; WHAT each one looks like is
// content, and lives in src/content — same split as room `color` and item
// factories.

export type Month =
  | 'january'
  | 'february'
  | 'march'
  | 'april'
  | 'may'
  | 'june'
  | 'july'
  | 'august'
  | 'september'
  | 'october'
  | 'november'
  | 'december';

// Calendar order, and the ONE place it is written down. `as const satisfies`
// keeps it a readonly tuple of Month rather than string[], so the picker can't
// list a month the union doesn't have — nor miss one, since the length is
// checked against the union below.
export const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const satisfies readonly Month[];

// Compile-time proof that MONTHS lists EVERY month, not merely valid ones.
// `as const satisfies` alone would accept a list of three. This fails to
// compile if a month is added to the union and not to the array.
type _AllMonthsListed = Month extends (typeof MONTHS)[number] ? true : never;
const _allListed: _AllMonthsListed = true;
void _allListed;
