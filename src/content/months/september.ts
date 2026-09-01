// src/content/months/september.ts
//
// Not customised. This month is the base house.
//
// The file exists so content/house.ts can hold a COMPLETE Record<Month, ...>
// rather than a partial table with a fallback: every month resolves through the
// same static import, and edit mode's save only ever rewrites a file that is
// already there and already wired up. Save a change from edit mode and this
// becomes a `furnish(BASE_PLAN, …)` call listing the furnishings.

import type { Storey } from '../../core/house/blocks';
import { BASE_PLAN } from './base';

export const SEPTEMBER_PLAN: readonly Storey[] = BASE_PLAN;
