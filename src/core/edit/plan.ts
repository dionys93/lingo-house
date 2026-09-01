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
      case 'removeItem':
        return { ...s, items: (s.items ?? []).filter((i) => i.id !== action.id) };
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
