// src/tests/support.ts
//
// Shared test fixtures. `room()` fills a room's labels in every locale from one
// English name, so a test that doesn't care about language doesn't carry three
// blocks of translations — and so adding a locale, or a field like `up`/`down`,
// doesn't mean editing every test file. Tests that DO care about language pass
// explicit labels instead (see describe.test.ts).

import { defineRoom, type RoomDef, type RoomLabels } from '../core/house/blocks';
import { LOCALES, type Locale } from '../core/house/labels';

const everywhere = (name: string): Record<Locale, RoomLabels> =>
  Object.fromEntries(
    LOCALES.map((l) => [
      l,
      {
        name,
        enter: `Open the door to ${name}`,
        up: `Go up to ${name}`,
        down: `Go down to ${name}`,
      },
    ]),
  ) as Record<Locale, RoomLabels>;

export const room = (key: string, name: string, color?: string): RoomDef =>
  defineRoom({ key, labels: everywhere(name), ...(color === undefined ? {} : { color }) });

/** The same, but open air — a patio, a lawn. See RoomDef.outdoor. */
export const outdoors = (key: string, name: string): RoomDef =>
  defineRoom({ key, labels: everywhere(name), outdoor: true });