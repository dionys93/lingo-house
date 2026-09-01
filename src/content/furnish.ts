// src/content/furnish.ts
//
// How a month's file differs from the base plan: it replaces the furnishings on
// some storeys and inherits everything else.
//
// This exists so the twelve month files can be pure data. Edit mode writes
// them, and a generated file that also contains logic is a file where a bug can
// hide behind a header saying a machine wrote it. The one rule lives here,
// hand-written and tested; each month file is a header, a call, and its arrays.
//
// INHERITANCE IS THE POINT. A month names only what it changes, so the grid, the
// rooms and the staircase still come from base.ts — move a wall there and every
// month moves with it. A month that has never been edited names nothing at all
// and simply IS the base plan.

import type { ItemDef, Opening, Storey } from '../core/house/blocks';

export interface Furnishing {
  readonly openings?: readonly Opening[];
  readonly items?: readonly ItemDef[];
}

/** Keyed by storey LEVEL, not by array position — level is what's authoritative. */
export type Furnishings = Partial<Record<number, Furnishing>>;

export const furnish = (base: readonly Storey[], by: Furnishings): readonly Storey[] =>
  base.map((s) => ({ ...s, ...by[s.level] }));
