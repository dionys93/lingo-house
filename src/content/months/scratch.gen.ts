// src/content/months/scratch.gen.ts
//
// A month file that exists so src/tests/emit.test.ts can WRITE one and import
// what it wrote.
//
// The test's whole point is that a saved month actually loads, and the only way
// to find that out is to load it. An emitted file says `from './base'` and
// `from '../furnish'`, so it only resolves from this folder — which is why the
// scratch lives here beside the real months rather than under src/tests.
//
// It is committed rather than generated because `tsc -b` checks the tree as it
// stands, and a module that appears only while vitest is running is a module
// tsc reports as missing. The test overwrites this file, imports it, and writes
// this content back when it is done; if a crash ever leaves it modified,
// `git checkout` on this path is the whole repair.
//
// Nothing imports it. content/house.ts lists the twelve real months.

import type { Storey } from '../../core/house/blocks';
import { BASE_PLAN } from './base';

export const JANUARY_PLAN: readonly Storey[] = BASE_PLAN;
