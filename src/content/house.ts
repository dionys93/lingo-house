// src/content/house.ts
//
// Which house you get for a given month.
//
// A COMPLETE record, not a partial table with a fallback. It used to be
// `Partial<Record<Month, HousePlan>>` and `?? BASE_PLAN`, which was the right
// shape while months were authored by hand: twelve months cost one file, and a
// month that didn't differ cost nothing at all.
//
// Edit mode changed what "costs nothing" means. Saving a month has to write a
// file and wire it up, and wiring it up meant editing THIS file — inserting an
// import and a table entry into TypeScript source from a dev server. Rewriting
// a file by hand-parsing it is the kind of machinery that works until the day
// someone reformats the file it parses.
//
// So every month has a file, and every month is imported here, and save only
// ever rewrites a file that already exists and is already reachable. There is no
// registration step to get wrong. The inheritance that made the old design cheap
// is still there — it moved into the month files, which say `= BASE_PLAN` until
// they are edited, and `furnish(BASE_PLAN, …)` after (see content/furnish.ts).
//
// `Record<Month, ...>` complete by construction, like every other closed union
// in this codebase: a thirteenth month cannot exist without a file here.

import type { Month } from '../core/house/month';
import type { Storey } from '../core/house/blocks';
import { JANUARY_PLAN } from './months/january';
import { FEBRUARY_PLAN } from './months/february';
import { MARCH_PLAN } from './months/march';
import { APRIL_PLAN } from './months/april';
import { MAY_PLAN } from './months/may';
import { JUNE_PLAN } from './months/june';
import { JULY_PLAN } from './months/july';
import { AUGUST_PLAN } from './months/august';
import { SEPTEMBER_PLAN } from './months/september';
import { OCTOBER_PLAN } from './months/october';
import { NOVEMBER_PLAN } from './months/november';
import { DECEMBER_PLAN } from './months/december';

/** A whole house: the storeys, bottom to top. */
export type HousePlan = readonly Storey[];

const PLANS: Record<Month, HousePlan> = {
  january: JANUARY_PLAN,
  february: FEBRUARY_PLAN,
  march: MARCH_PLAN,
  april: APRIL_PLAN,
  may: MAY_PLAN,
  june: JUNE_PLAN,
  july: JULY_PLAN,
  august: AUGUST_PLAN,
  september: SEPTEMBER_PLAN,
  october: OCTOBER_PLAN,
  november: NOVEMBER_PLAN,
  december: DECEMBER_PLAN,
};

export const houseFor = (month: Month): HousePlan => PLANS[month];
