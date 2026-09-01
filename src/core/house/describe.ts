// src/core/house/describe.ts
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

import type { CompiledOpening, Vec3 } from './compiled';
import type { RoomLabels } from './blocks';
import type { CompiledHouse } from './house';
import type { NavGraph, Location } from './nav';
import type { Selection } from '../session/explorer';
import { noun, type Bilingual, type LabelTable, type Locale } from './labels';
import { CELL } from './scale';

// An action the popup offers as a button. `event` is the nav event to dispatch —
// describe() decides WHAT can be done, the shell decides when it happens.
export interface Described {
  readonly subject: Bilingual; // what you clicked
  readonly context: readonly Bilingual[]; // what it belongs to, outermost last
  readonly anchor: Vec3; // where to hang the popup, in world space
  readonly action?: {
    readonly label: Bilingual;
    readonly edgeId: string; // hand this to nav's `traverse`
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
  house: CompiledHouse,
  graph: NavGraph,
  labels: LabelTable,
  from: Locale,
  to: Locale,
  // Which doors are already open. Seven positional parameters was already the
  // edge of reasonable and this is the eighth — if a ninth ever shows up, this
  // wants to become an options object rather than growing again.
  openDoors: ReadonlySet<string>,
): Described | null {
  // Room keys are unique across the WHOLE house (see the M2 gate decision), so
  // a flat search over every storey is unambiguous — no level needed, which is
  // exactly what that decision bought.
  const rooms = house.storeys.flatMap((s) => s.grid.rooms);
  const openings = house.storeys.flatMap((s) => s.grid.openings);
  const items = house.storeys.flatMap((s) => s.grid.items);

  const stairs = house.stairs;

  const roomLabel = (key: Location, pick: keyof RoomLabels): Bilingual =>
    key === 'outside'
      ? {
          from: pick === 'name' ? labels[from].outside : labels[from].goOutside,
          to: pick === 'name' ? labels[to].outside : labels[to].goOutside,
        }
      : (() => {
          const room = rooms.find((r) => r.key === key);
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
      const item = items.find((i) => i.id === selection.id);
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
      const opening: CompiledOpening | undefined = openings.find((o) => o.id === selection.id);
      if (opening === undefined) return null;
      const centre = midpoint(opening.a, opening.b);
      // Dead centre of the opening itself — horizontally the midpoint of its
      // span, vertically the middle of its own sill→head extent. Not a fraction
      // of the WALL height, which for a door put the popup up at the lintel.
      const anchor: Vec3 = [centre[0], (opening.sill + opening.head) / 2, centre[2]];
      const base = {
        // An exterior door is the front door. Derived, not authored — the
        // compiler already resolved both sides of every opening, and
        // faceColors makes the same test three lines into wallMaterials.
        subject: noun(
          labels,
          from,
          to,
          opening.kind !== 'door'
            ? 'window'
            : opening.sides.includes('outside')
              ? 'frontDoor'
              : 'door',
        ),
        context: here,
        anchor,
      };
      if (opening.kind !== 'door') return base;

      // Where this door leads FROM WHERE YOU STAND. The phrase is a fact about
      // the destination, so it comes from the destination's own labels — which
      // is why every door leading to the kitchen says the same thing, and why
      // adding a door costs no new text.
      // An OPEN door offers the opposite action, and that action names no room:
      // you close a door, you don't close it "to the kitchen". So it skips the
      // graph entirely — no destination to look up, and it works even from a
      // side the graph doesn't join.
      if (openDoors.has(opening.id)) {
        return {
          ...base,
          action: {
            label: { from: labels[from].closeDoor, to: labels[to].closeDoor },
            edgeId: opening.id,
          },
        };
      }

      const edge = graph.traverse(where, opening.id);
      if (edge === undefined) return base; // door doesn't touch this side
      return { ...base, action: { label: roomLabel(edge.to, 'enter'), edgeId: opening.id } };
    }

    case 'stair': {
      const stair = stairs.find((s) => s.id === selection.id);
      if (stair === undefined) return null;
      // Halfway along the FLIGHT, not the middle tread: with an even number of
      // treads there is no middle one, and lifting off a tread top by a fixed
      // amount pushed the popup above the topmost step, so it read as sitting at
      // the top of the stairs rather than on them.
      const first = stair.treads[0];
      const last = stair.treads[stair.treads.length - 1];
      const mid = midpoint(first, last);
      const base = {
        subject: noun(labels, from, to, 'stairs'),
        context: here,
        anchor: [mid[0], mid[1] + 0.18, mid[2]] as Vec3,
      };
      const edge = graph.traverse(where, stair.id);
      if (edge === undefined) return base; // you're not at either end of it
      // Which phrase depends on the DIRECTION of travel, which is a fact about
      // where you're standing — not about the stair.
      const goingUp = where === stair.connects[0];
      return {
        ...base,
        action: { label: roomLabel(edge.to, goingUp ? 'up' : 'down'), edgeId: stair.id },
      };
    }

    case 'part': {
      // Every wall is "the wall" — there's no wall to identify, only a place to
      // hang the popup, which is why a part selection carries a point, not an id.
      //
      // The one exception is the floor, which is two words: the same tile mesh
      // is the floor of a kitchen and the ground of a patio. The shell
      // dispatches 'floor' for both because it is one component, and the word is
      // chosen here.
      //
      // Decided by what you CLICKED, not by where you stand — `selection.at` is
      // the point on the tile, so the room under it is the room the word is
      // about. Reading `where` instead is subtly wrong in both directions:
      // clicking the patio from the lawn would say "the floor", and clicking the
      // kitchen floor through the open back door while standing on the patio
      // would say "the ground". Pointing a word at the thing under the cursor is
      // the entire premise.
      const clicked = rooms.find((r) =>
        r.floor.some(
          (t) =>
            Math.abs(t[0] - selection.at[0]) <= CELL / 2 &&
            Math.abs(t[2] - selection.at[2]) <= CELL / 2,
        ),
      );
      // No room under it means the lawn, which is outdoors by definition.
      const outdoors = clicked === undefined || clicked.outdoor === true;
      const part = selection.part === 'floor' && outdoors ? 'ground' : selection.part;
      return {
        subject: noun(labels, from, to, part),
        context: here,
        anchor: selection.at,
      };
    }
  }
}