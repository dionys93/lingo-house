// src/content/house.ts
//
// Which house you get for a given month.
//
// THE OVERRIDE MODEL, and why it's a lookup with a fallback rather than twelve
// files: most of the year the house is the same house. A month that genuinely
// differs — a tree in December, the shutters closed in August — gets its own
// file beside base.ts and an entry below. Until it has one it renders the base
// plan, so twelve months cost one file, and adding the thirteenth thing you
// want to vary doesn't mean editing twelve.
//
// `Partial<Record<Month, ...>>` is doing real work: it makes the table
// deliberately incomplete, so `?? BASE_PLAN` is the documented path rather than
// a defensive `??` guarding a case that shouldn't happen.

import type { Month } from '../core/house/month';
import type { Storey } from '../core/house/blocks';
import { BASE_PLAN } from './months/base';

/** A whole house: the storeys, bottom to top. */
export type HousePlan = readonly Storey[];

// Months that differ from the base plan. Empty today, on purpose — every month
// currently renders the same house, and that is a content decision, not a
// missing feature. Add `december: DECEMBER_PLAN` here once the file exists.
const OVERRIDES: Partial<Record<Month, HousePlan>> = {};

export const houseFor = (month: Month): HousePlan => OVERRIDES[month] ?? BASE_PLAN;
