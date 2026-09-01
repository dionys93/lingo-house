// src/core/house/labels.ts
//
// The language layer's types.
//
// TWO mechanisms, for one reason. `Locale`, `ItemKind` and `NounKey` are CLOSED
// unions, so `Record<Locale, ...>` over them is complete by construction — add a
// language or a noun and the authoring file stops compiling until every blank is
// filled. ROOMS can't work that way: room keys are authored and open-ended, and
// making `RoomKey` generic would infect Grid, CompiledRoom and nav's Location for
// modest gain. So a room carries its OWN labels (see RoomDef.labels), where you
// already are when you add one, and a room without a name in every language
// doesn't typecheck either. Same guarantee, two shapes.
//
// Neither has a runtime lookup that can fail, so there is no `UnknownLabel`
// variant. That holds only while labels are a checked-in table; if they ever load
// at runtime, the error variant comes back.

import type { ItemKind } from './blocks';
import type { OpenableKind } from './items';
import type { Month } from './month';

export type Locale = 'en' | 'es' | 'de';

// Ordered for the dropdowns. `as const` keeps it a readonly tuple of Locale, not
// string[], so the menus can't drift from the union.
export const LOCALES = ['en', 'es', 'de'] as const satisfies readonly Locale[];

// Each language named IN ITSELF — how language pickers are conventionally
// labelled, and it avoids privileging English in a language-learning tool.
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  de: 'Deutsch',
};

// Everything clickable that isn't a room: the item kinds, plus the parts of the
// building itself. Rooms are excluded on purpose — see the header.
// `frontDoor` is a separate NOUN, not a decorated door. German makes the case
// plainly — die Haustür is its own compound word, not "die Tür" with an
// adjective — and Spanish and English follow with their own forms. A door that
// LOOKS special while the house calls it "a door" teaches the opposite of what
// this app is for.
export type PartKey =
  | 'door'
  | 'frontDoor'
  | 'window'
  | 'wall'
  | 'floor'
  // What you are standing on OUTDOORS. A separate word rather than a second
  // sense of 'floor', because the two are separate words in the languages this
  // teaches — der Boden covers both, but "the floor of the patio" is wrong in
  // English and the whole point is to teach the word a speaker would use. It is
  // never authored: describe() picks it when the place you are standing in is
  // an outdoor room.
  | 'ground'
  | 'ceiling'
  | 'roof'
  | 'stairs';
export type NounKey = ItemKind | PartKey;

export interface LocaleLabels {
  readonly nouns: Record<NounKey, string>;
  // The calendar, in this language. A Record over the closed Month union, so a
  // month cannot exist without a name here — the same guarantee `nouns` gets,
  // and the reason the month picker can render a name without a fallback.
  readonly months: Record<Month, string>;
  // 'outside' is a destination like a room, but it isn't one, so its two strings
  // live here rather than on a RoomDef that doesn't exist.
  readonly outside: string;
  readonly goOutside: string;
  // A door that's already open offers the opposite action, and unlike "go to the
  // kitchen" it names no room — so there's no RoomDef to carry it. Same reason
  // goOutside is here.
  readonly closeDoor: string;
  /**
   * The whole sentence, per openable kind: "Open the cupboard", "Abre el
   * armario de cocina", "Öffne den Küchenschrank".
   *
   * WRITTEN OUT, NEVER COMPOSED. This started as a bare imperative — "Open" /
   * "Abre" / "Öffne" — precisely because gluing a verb to a noun that carries
   * its own article breaks in German the moment you try it: "Öffne" + "der
   * Kleiderschrank" needs the accusative "den". But a bare verb is a worse
   * answer than it looked. German is not going to be the last language here
   * with case, and a learner reading "Abre" learns an imperative with nothing
   * to do; the sentence is the thing worth teaching.
   *
   * So it follows the rule the room phrases already follow, for the same
   * reason: "sube al baño" but "sube a la cocina" is why RoomLabels writes
   * `up`/`down`/`enter` out in full rather than deriving them. Composition is
   * what does not survive a new language; a table of sentences does.
   *
   * Keyed by OPENABLE kind, not by every kind, so the table costs a line per
   * thing that opens rather than per thing that exists — and being a complete
   * Record over a union DERIVED from ITEM_SPECS, marking a new kind openable
   * fails the build here until it has a sentence in every language.
   */
  readonly opens: Record<OpenableKind, { readonly open: string; readonly close: string }>;
}

export type LabelTable = Record<Locale, LocaleLabels>;

// A word in both languages at once — what the popup actually renders. Built in
// one place so no caller re-derives the from/to pairing.
export interface Bilingual {
  readonly from: string;
  readonly to: string;
}

export const bilingual = (
  labels: LabelTable,
  from: Locale,
  to: Locale,
  pick: (l: LocaleLabels) => string,
): Bilingual => ({ from: pick(labels[from]), to: pick(labels[to]) });

// Total by construction — no lookup can fail, so this returns strings, not a
// Result.
export const noun = (labels: LabelTable, from: Locale, to: Locale, key: NounKey): Bilingual =>
  bilingual(labels, from, to, (l) => l.nouns[key]);