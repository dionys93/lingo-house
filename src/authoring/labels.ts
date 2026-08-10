// src/authoring/labels.ts
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  THIS IS THE FILE YOU EDIT TO CHANGE WHAT THINGS ARE CALLED.          │
// └──────────────────────────────────────────────────────────────────────┘
//
// One row per language, one entry per item kind. The type makes this table
// TOTAL: add a language to `Locale` or an item to `ItemKind` and this file stops
// compiling until every blank is filled. You can't ship a half-translated house.
//
// Articles are included (el/la, der/die/das) because the gendered article is
// part of learning the noun — a bare "mesa" teaches you less than "la mesa".

import type { LabelTable } from '../core/labels';

export const LABELS: LabelTable = {
  en: {
    table: 'the table',
    laptop: 'the laptop',
    tv: 'the television',
  },
  es: {
    table: 'la mesa',
    laptop: 'el portátil',
    tv: 'la televisión',
  },
  de: {
    table: 'der Tisch',
    laptop: 'der Laptop',
    tv: 'der Fernseher',
  },
};