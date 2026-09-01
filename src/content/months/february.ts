// src/content/months/february.ts
//
// Written by edit mode. Safe to edit by hand — it is ordinary authoring data,
// and the next save from edit mode rewrites it whole, so hand edits survive
// exactly as long as you don't overwrite them from the editor.
//
// Only the furnishings live here. The grid, the rooms and the staircase come
// from base.ts through `furnish`, so changing the shape of the house there
// still reaches this month.

import { furnish } from '../furnish';
import type { Storey } from '../../core/house/blocks';
import { BASE_PLAN } from './base';

export const FEBRUARY_PLAN: readonly Storey[] = furnish(BASE_PLAN, {
  0: {
    openings: [
      { kind: 'door', cell: [9, 4], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
      { kind: 'door', cell: [5, 2], side: 'back', swing: 'in', between: ['livingRoom', 'kitchen'] },
      { kind: 'door', cell: [5, 6], side: 'back', swing: 'in', between: ['livingRoom', 'kitchen'] },
      { kind: 'door', cell: [2, 7], side: 'front', swing: 'in', between: ['bathroom', 'kitchen'] },
      { kind: 'window', cell: [0, 1], side: 'back', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
      { kind: 'window', cell: [0, 5], side: 'back', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
      { kind: 'window', cell: [1, 0], side: 'left', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
      { kind: 'window', cell: [1, 8], side: 'right', sill: 0.6, head: 1, between: ['bathroom', 'outside'] },
      { kind: 'window', cell: [9, 2], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
      { kind: 'window', cell: [9, 6], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
      { kind: 'window', cell: [6, 8], side: 'right', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
      { kind: 'window', cell: [8, 0], side: 'left', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
    ],
    items: [
      { id: 'kitchen-fridge', kind: 'fridge', mount: { on: 'floor', cell: [0, 0], facing: 's', offset: [-0.12, -0.095] } },
      { id: 'kitchen-counter-l', kind: 'counter', mount: { on: 'floor', cell: [0, 2], facing: 's', offset: [0, -0.12] } },
      { id: 'kitchen-oven', kind: 'oven', mount: { on: 'floor', cell: [0, 3], facing: 's', offset: [0, -0.12] } },
      { id: 'kitchen-counter-r', kind: 'counter', mount: { on: 'floor', cell: [0, 4], facing: 's', offset: [0, -0.12] } },
      { id: 'kitchen-dishwasher', kind: 'dishwasher', mount: { on: 'floor', cell: [0, 6], facing: 's', offset: [0.1, -0.12] } },
      { id: 'dining-table', kind: 'diningTable', mount: { on: 'floor', cell: [4, 3], facing: 's', offset: [0.5, -0.58] } },
      { id: 'dining-chair-a', kind: 'chair', mount: { on: 'floor', cell: [2, 3], facing: 's', offset: [0, 0.13] } },
      { id: 'dining-chair-b', kind: 'chair', mount: { on: 'floor', cell: [2, 4], facing: 's', offset: [0, 0.13] } },
      { id: 'dining-chair-e', kind: 'chair', mount: { on: 'floor', cell: [3, 5], facing: 'w', offset: [-0.21, 0.42] } },
      { id: 'wc-toilet', kind: 'toilet', mount: { on: 'floor', cell: [0, 7], facing: 's', offset: [0, -0.07] } },
      { id: 'wc-sink', kind: 'sink', mount: { on: 'floor', cell: [2, 8], facing: 'w', offset: [0.195, 0] } },
      { id: 'living-rug', kind: 'rug', mount: { on: 'floor', cell: [7, 4], facing: 's' } },
      { id: 'living-table', kind: 'table', mount: { on: 'floor', cell: [7, 4], facing: 's' } },
      { id: 'work-laptop', kind: 'laptop', mount: { on: 'item', host: 'living-table', offset: [-0.2, -0.1] } },
      { id: 'living-sofa', kind: 'sofa', mount: { on: 'floor', cell: [8, 4], facing: 'n' } },
      { id: 'living-tv', kind: 'tv', mount: { on: 'wall', cell: [5, 4], side: 'back', height: 0.55 } },
      { id: 'living-bookshelf', kind: 'bookshelf', mount: { on: 'floor', cell: [9, 8], facing: 'w', offset: [0.27, 0] } },
      { id: 'reading-chair', kind: 'chair', mount: { on: 'floor', cell: [7, 7], facing: 'w', offset: [-0.1, 0.25] } },
    ],
  },
  1: {
    openings: [
      { kind: 'door', cell: [3, 2], side: 'back', swing: 'in', between: ['landing', 'bedroomSmall'] },
      { kind: 'door', cell: [3, 4], side: 'back', swing: 'in', between: ['landing', 'bathroomUp'] },
      { kind: 'door', cell: [4, 2], side: 'back', swing: 'out', between: ['bedroom', 'landing'] },
      { kind: 'window', cell: [0, 1], side: 'back', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
      { kind: 'window', cell: [2, 0], side: 'left', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
      { kind: 'window', cell: [0, 6], side: 'back', sill: 0.6, head: 1, between: ['bathroomUp', 'outside'] },
      { kind: 'window', cell: [1, 8], side: 'right', sill: 0.6, head: 1, between: ['bathroomUp', 'outside'] },
      { kind: 'window', cell: [4, 8], side: 'right', sill: 0.35, head: 1, between: ['bedroom', 'outside'] },
      { kind: 'window', cell: [7, 2], side: 'front', sill: 0.35, head: 1, between: ['bedroom', 'outside'] },
      { kind: 'window', cell: [7, 6], side: 'front', sill: 0.35, head: 1, between: ['bedroom', 'outside'] },
    ],
    items: [
      { id: 'up-bath', kind: 'bathtub', mount: { on: 'floor', cell: [1, 8], facing: 'w', offset: [0.045, 0] } },
      { id: 'up-shower', kind: 'shower', mount: { on: 'floor', cell: [0, 4], facing: 's', offset: [0.03, 0.03] } },
      { id: 'up-sink', kind: 'sink', mount: { on: 'floor', cell: [2, 5], facing: 'n', offset: [0, 0.195] } },
      { id: 'up-toilet', kind: 'toilet', mount: { on: 'floor', cell: [2, 6], facing: 'n', offset: [0, 0.07] } },
      { id: 'bedroom-bed', kind: 'bed', mount: { on: 'floor', cell: [4, 4], facing: 's', offset: [0, 0.58] } },
      { id: 'bedroom-nightstand-l', kind: 'nightstand', mount: { on: 'floor', cell: [4, 3], facing: 's', offset: [0.055, -0.22] } },
      { id: 'bedroom-nightstand-r', kind: 'nightstand', mount: { on: 'floor', cell: [4, 5], facing: 's', offset: [-0.055, -0.22] } },
      { id: 'bedroom-wardrobe', kind: 'wardrobe', mount: { on: 'floor', cell: [6, 8], facing: 'w', offset: [0.12, 0] } },
      { id: 'bedroom-tv', kind: 'tv', mount: { on: 'wall', cell: [7, 4], side: 'front', height: 0.55 } },
      { id: 'small-bed', kind: 'bed', mount: { on: 'floor', cell: [1, 0], facing: 'e', offset: [0.58, -0.5] } },
      { id: 'small-nightstand', kind: 'nightstand', mount: { on: 'floor', cell: [0, 2], facing: 's', offset: [0, -0.22] } },
      { id: 'small-wardrobe', kind: 'wardrobe', mount: { on: 'floor', cell: [2, 3], facing: 'n', offset: [0, 0.12] } },
    ],
  },
});
