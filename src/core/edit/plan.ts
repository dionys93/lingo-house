// src/core/edit/plan.ts
//
// Editing a house, as a pure function of the plan and one action.
//
// The working value IS `readonly Storey[]` — the same type content authors and
// the same type compileHouse takes. That is deliberate and it is the whole
// design: there is no editor-shaped model that has to be converted to authoring
// data on save and back on load, so there is nothing to convert wrongly. Every
// edit produces a plan you could paste into a month file, and the compiler that
// validates it is the one the app runs on.
//
// WHAT IS NOT EDITABLE HERE, and why. The grid, the rooms and the stairs are
// untouched by every action below. Rooms carry labels in three languages and a
// stair rewrites the storey above it; both are decisions with consequences a
// drag-and-drop surface cannot show you. Openings and items are placements —
// they move, and the worst a bad one does is fail to compile, which the editor
// shows you before you save. That line is where v1 stops.

import type { Cell, Side } from '../shared/errors';
import type { ItemDef, ItemKind, Mount, Opening, Storey } from '../house/blocks';
import { ITEM_SPECS } from '../house/items';
import { edgeKey } from './edges';

export type EditAction =
  | { readonly tag: 'addItem'; readonly level: number; readonly item: ItemDef }
  | { readonly tag: 'setMount'; readonly level: number; readonly id: string; readonly mount: Mount }
  | { readonly tag: 'removeItem'; readonly level: number; readonly id: string }
  | { readonly tag: 'addOpening'; readonly level: number; readonly opening: Opening }
  // Openings have no authored id — they are addressed by the wall edge they sit
  // on, which the compiler already guarantees is unique per storey (two on one
  // edge is OpeningsOverlap). So the edge IS the identity, and there is no id to
  // keep in step with a move. `cell`/`side` here is a NAME for that edge, and
  // an edge has two: matching them literally misses an opening the author wrote
  // from the other side, which is what the base plan's bathroom door does.
  | { readonly tag: 'removeOpening'; readonly level: number; readonly cell: Cell; readonly side: Side };

const sameEdge = (o: Opening, cell: Cell, side: Side): boolean =>
  edgeKey(o.cell, o.side) === edgeKey(cell, side);

/** What an item is mounted on, when it is mounted on another item. */
const hostOf = (i: ItemDef): string | null =>
  i.mount.on === 'item' || i.mount.on === 'inside' ? i.mount.host : null;

/**
 * An item and everything that would be left hanging without it.
 *
 * Deleting a cupboard with cups in it used to leave the cups behind, mounted on
 * a host that no longer existed — so the plan stopped compiling, and the error
 * it gave named the CUP. You would be told about a cup you never touched while
 * looking at the cupboard you had just deleted.
 *
 * Transitive, because a lamp on a nightstand is one link and a cup on a shelf in
 * a cupboard is another, and nothing stops the two composing.
 */
function withDependents(items: readonly ItemDef[], id: string): ReadonlySet<string> {
  const doomed = new Set([id]);
  // Repeat until nothing new falls: a dependent may be listed before its host.
  for (let grew = true; grew; ) {
    grew = false;
    for (const i of items) {
      const host = hostOf(i);
      if (host !== null && doomed.has(host) && !doomed.has(i.id)) {
        doomed.add(i.id);
        grew = true;
      }
    }
  }
  return doomed;
}

/** Apply one action. Unknown levels and ids are no-ops: the plan is the truth. */
export function applyEdit(plan: readonly Storey[], action: EditAction): readonly Storey[] {
  const onStorey = (s: Storey): Storey => {
    switch (action.tag) {
      case 'addItem':
        return { ...s, items: [...(s.items ?? []), action.item] };
      case 'setMount':
        return {
          ...s,
          items: (s.items ?? []).map((i) => (i.id === action.id ? { ...i, mount: action.mount } : i)),
        };
      case 'removeItem': {
        const items = s.items ?? [];
        const doomed = withDependents(items, action.id);
        return { ...s, items: items.filter((i) => !doomed.has(i.id)) };
      }
      case 'addOpening':
        return { ...s, openings: [...(s.openings ?? []), action.opening] };
      case 'removeOpening':
        return {
          ...s,
          openings: (s.openings ?? []).filter((o) => !sameEdge(o, action.cell, action.side)),
        };
    }
  };
  return plan.map((s) => (s.level === action.level ? onStorey(s) : s));
}

/** Where on a host a thing can go. */
export type HostSlot = 'top' | 'inside';

/**
 * What a host can take, best first — empty if it can take nothing.
 *
 * A nightstand offers BOTH, and 'top' comes first because dropping something
 * onto a piece of furniture means putting it on the surface; you have to say
 * "in the drawer" to mean the other thing. That ordering is the whole of the
 * placement rule in edit mode, and it lives here rather than in the component
 * so it can be checked without a browser.
 */
export const slotsOf = (kind: ItemKind): readonly HostSlot[] => {
  const spec = ITEM_SPECS[kind];
  return [
    ...(spec.supportsTop !== null ? (['top'] as const) : []),
    ...(spec.opens !== undefined ? (['inside'] as const) : []),
  ];
};

/**
 * The mount that puts something on (or in) `host`, or null if it cannot go
 * there.
 *
 * Null rather than a nearest-legal guess: a lamp dropped on a rug should fail
 * to attach and stay on the floor, not silently become a lamp mounted on
 * something that cannot hold it — which is a plan that compiles into
 * ItemNotMountable and blames the lamp.
 */
export function mountOnto(
  host: ItemDef,
  slot: HostSlot,
  shelf = 0,
): Mount | null {
  if (!slotsOf(host.kind).includes(slot)) return null;
  return slot === 'top'
    ? { on: 'item', host: host.id }
    : { on: 'inside', host: host.id, shelf };
}

/**
 * An id nothing else in the house is using.
 *
 * Ids are authored, so they collide by accident — which is why DuplicateItemId
 * exists as a compile error at all. Edit mode is the one place adding an item is
 * a click rather than a decision, so it names them, and it names them after the
 * kind because `chair-4` in a diff says what moved and `item-17` does not.
 *
 * Scoped to the WHOLE plan, not the storey: item ids are unique across the
 * house, so a chair upstairs and a chair down cannot both be `chair-1`.
 */
export function nextItemId(plan: readonly Storey[], kind: ItemKind): string {
  const taken = new Set(plan.flatMap((s) => (s.items ?? []).map((i) => i.id)));
  for (let n = 1; ; n += 1) {
    const id = `${kind}-${String(n)}`;
    if (!taken.has(id)) return id;
  }
}

/** The items on one storey, whatever the storey left undefined. */
export const itemsOn = (plan: readonly Storey[], level: number): readonly ItemDef[] =>
  plan.find((s) => s.level === level)?.items ?? [];

/** The openings on one storey. */
export const openingsOn = (plan: readonly Storey[], level: number): readonly Opening[] =>
  plan.find((s) => s.level === level)?.openings ?? [];
