// src/core/describe.ts
//
// Click → words. The one place that decides what a popup says, kept pure so the
// whole reading experience is testable without mounting a scene.
//
// The result is a CHAIN, not a flat list: `subject` is the thing you actually
// clicked and `context` is what it belongs to. That ordering is the point — if a
// click produced three equal-weight words, the learner couldn't tell which word
// names the thing under the cursor, and pointing a word at a visible object is
// the entire advantage of teaching vocabulary inside a 3D house. The popup
// renders `subject` large and `context` small.
//
// The chain is a LIST so it can grow downward without reshaping anything: when
// the surface registry lands, the material ("the linoleum") is one more entry
// under the floor's room.

import type { CompiledGrid, CompiledOpening, Vec3 } from './grid';
import type { DoorGraph, Location } from './nav';
import type { Selection } from './explorer';
import { noun, type Bilingual, type LabelTable, type Locale } from './labels';

// An action the popup offers as a button. `event` is the nav event to dispatch —
// describe() decides WHAT can be done, the shell decides when it happens.
export interface Described {
  readonly subject: Bilingual; // what you clicked
  readonly context: readonly Bilingual[]; // what it belongs to, outermost last
  readonly anchor: Vec3; // where to hang the popup, in world space
  readonly action?: {
    readonly label: Bilingual;
    readonly doorId: string;
  };
}

const midpoint = (a: Vec3, b: Vec3): Vec3 => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
  (a[2] + b[2]) / 2,
];

export function describe(
  selection: Selection,
  where: Location,
  grid: CompiledGrid,
  graph: DoorGraph,
  labels: LabelTable,
  from: Locale,
  to: Locale,
): Described | null {
  const roomLabel = (key: Location, pick: 'name' | 'enter'): Bilingual =>
    key === 'outside'
      ? {
          from: pick === 'name' ? labels[from].outside : labels[from].goOutside,
          to: pick === 'name' ? labels[to].outside : labels[to].goOutside,
        }
      : (() => {
          const room = grid.rooms.find((r) => r.key === key);
          // A compiled grid can't contain a wall side that isn't a room or
          // 'outside', so this only trips if a caller invents a location.
          if (room === undefined) return { from: key, to: key };
          return { from: room.labels[from][pick], to: room.labels[to][pick] };
        })();

  // The room you're standing in — context for everything, and NOT stored in the
  // selection, so walking to another room can't leave a stale label behind.
  const here: readonly Bilingual[] = where === 'outside' ? [] : [roomLabel(where, 'name')];

  switch (selection.on) {
    case 'item': {
      const item = grid.items.find((i) => i.id === selection.id);
      if (item === undefined) return null;
      return {
        subject: noun(labels, from, to, item.kind),
        context: here,
        anchor: [
          (item.bounds.min[0] + item.bounds.max[0]) / 2,
          item.bounds.max[1] + 0.12,
          (item.bounds.min[2] + item.bounds.max[2]) / 2,
        ],
      };
    }

    case 'opening': {
      const opening: CompiledOpening | undefined = grid.openings.find(
        (o) => o.id === selection.id,
      );
      if (opening === undefined) return null;
      const centre = midpoint(opening.a, opening.b);
      const anchor: Vec3 = [centre[0], opening.height * 0.75, centre[2]];
      const base = {
        subject: noun(labels, from, to, opening.kind === 'door' ? 'door' : 'window'),
        context: here,
        anchor,
      };
      if (opening.kind !== 'door') return base;

      // Where this door leads FROM WHERE YOU STAND. The phrase is a fact about
      // the destination, so it comes from the destination's own labels — which
      // is why every door leading to the kitchen says the same thing, and why
      // adding a door costs no new text.
      const edge = graph.traverse(where, opening.id);
      if (edge === undefined) return base; // door doesn't touch this side
      return { ...base, action: { label: roomLabel(edge.to, 'enter'), doorId: opening.id } };
    }

    case 'part': {
      // Every wall is "the wall" — there's no wall to identify, only a place to
      // hang the popup, which is why a part selection carries a point, not an id.
      return {
        subject: noun(labels, from, to, selection.part),
        context: here,
        anchor: selection.at,
      };
    }
  }
}