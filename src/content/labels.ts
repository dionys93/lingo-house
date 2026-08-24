// src/content/labels.ts
//
// ┌──────────────────────────────────────────────────────────────────────┐
// │  THIS IS THE FILE YOU EDIT TO CHANGE WHAT THINGS ARE CALLED.          │
// └──────────────────────────────────────────────────────────────────────┘
//
// One block per language: a noun for every item kind and every part of the
// building, plus the two words for 'outside' (which is a destination but not a
// room). Room names live on the rooms themselves in rooms.ts. The type makes this table
// TOTAL: add a language to `Locale` or an item to `ItemKind` and this file stops
// compiling until every blank is filled. You can't ship a half-translated house.
//
// Articles are included (el/la, der/die/das) because the gendered article is
// part of learning the noun — a bare "mesa" teaches you less than "la mesa".

import type { LabelTable } from '../core/house/labels';

export const LABELS: LabelTable = {
  en: {
    nouns: {
      table: 'the table',
      laptop: 'the laptop',
      tv: 'the television',
      door: 'the door',
      frontDoor: 'the front door',
      window: 'the window',
      wall: 'the wall',
      floor: 'the floor',
      ceiling: 'the ceiling',
      roof: 'the roof',
      stairs: 'the stairs',
    },
    outside: 'outside',
    goOutside: 'Go outside',
    closeDoor: 'Close the door',
  },
  es: {
    nouns: {
      table: 'la mesa',
      laptop: 'el portátil',
      tv: 'la televisión',
      door: 'la puerta',
      frontDoor: 'la puerta principal',
      window: 'la ventana',
      wall: 'la pared',
      floor: 'el suelo',
      ceiling: 'el techo',
      roof: 'el tejado',
      stairs: 'la escalera',
    },
    outside: 'afuera',
    goOutside: 'Sal afuera',
    closeDoor: 'Cierra la puerta',
  },
  de: {
    nouns: {
      table: 'der Tisch',
      laptop: 'der Laptop',
      tv: 'der Fernseher',
      door: 'die Tür',
      frontDoor: 'die Haustür',
      window: 'das Fenster',
      wall: 'die Wand',
      floor: 'der Boden',
      ceiling: 'die Decke',
      roof: 'das Dach',
      stairs: 'die Treppe',
    },
    outside: 'draußen',
    goOutside: 'Geh nach draußen',
    closeDoor: 'Schließ die Tür',
  },
};