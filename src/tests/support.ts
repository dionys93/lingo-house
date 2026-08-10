// src/tests/support.ts
//
// Shared test fixtures. `room()` fills a room's labels in every locale from one
// English name, so a test that doesn't care about language doesn't carry three
// blocks of translations — and so adding a locale doesn't mean editing every
// test file. Tests that DO care about language pass explicit labels instead.

import { defineRoom, type RoomDef } from '../core/blocks';
import { LOCALES, type Locale } from '../core/labels';
import type { RoomLabels } from '../core/blocks';

const everywhere = (name: string): Record<Locale, RoomLabels> =>
  Object.fromEntries(
    LOCALES.map((l) => [l, { name, enter: `Open the door to ${name}` }]),
  ) as Record<Locale, RoomLabels>;

export const room = (key: string, name: string, color?: string): RoomDef =>
  defineRoom(color === undefined ? { key, labels: everywhere(name) } : { key, labels: everywhere(name), color });