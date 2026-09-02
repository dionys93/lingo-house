// src/content/months/january.ts
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

export const JANUARY_PLAN: readonly Storey[] = furnish(BASE_PLAN, {
  0: {
    openings: [
      { kind: 'door', cell: [12, 4], side: 'front', swing: 'out', between: ['livingRoom', 'outside'] },
      { kind: 'door', cell: [8, 2], side: 'back', swing: 'in', between: ['livingRoom', 'kitchen'] },
      { kind: 'door', cell: [8, 6], side: 'back', swing: 'in', between: ['livingRoom', 'kitchen'] },
      { kind: 'door', cell: [5, 7], side: 'front', swing: 'in', between: ['bathroom', 'kitchen'] },
      { kind: 'door', cell: [3, 5], side: 'back', swing: 'in', between: ['kitchen', 'patio'] },
      { kind: 'window', cell: [3, 1], side: 'back', sill: 0.45, head: 0.95, between: ['kitchen', 'garden'] },
      { kind: 'window', cell: [4, 0], side: 'left', sill: 0.45, head: 0.95, between: ['kitchen', 'outside'] },
      { kind: 'window', cell: [4, 8], side: 'right', sill: 0.6, head: 1, between: ['bathroom', 'outside'] },
      { kind: 'window', cell: [12, 2], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
      { kind: 'window', cell: [12, 6], side: 'front', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
      { kind: 'window', cell: [9, 8], side: 'right', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
      { kind: 'window', cell: [11, 0], side: 'left', sill: 0.25, head: 1.05, between: ['livingRoom', 'outside'] },
    ],
    items: [
      { id: 'kitchen-fridge', kind: 'fridge', mount: { on: 'floor', cell: [3, 0], facing: 's', offset: [-0.12, -0.095] } },
      { id: 'kitchen-counter-l', kind: 'counter', mount: { on: 'floor', cell: [3, 2], facing: 's', offset: [0, -0.12] } },
      { id: 'kitchen-oven', kind: 'oven', mount: { on: 'floor', cell: [3, 3], facing: 's', offset: [0, -0.12] } },
      { id: 'kitchen-sink', kind: 'kitchenSink', mount: { on: 'floor', cell: [3, 4], facing: 's', offset: [0, -0.12] } },
      { id: 'kitchen-dishwasher', kind: 'dishwasher', mount: { on: 'floor', cell: [3, 6], facing: 's', offset: [0.1, -0.12] } },
      { id: 'kitchen-cupboard', kind: 'cupboard', mount: { on: 'floor', cell: [5, 0], facing: 'e', offset: [-0.12, 0] } },
      { id: 'kitchen-plates', kind: 'plate', mount: { on: 'inside', host: 'kitchen-cupboard', offset: [-0.22, 0] } },
      { id: 'kitchen-cup-a', kind: 'cup', mount: { on: 'inside', host: 'kitchen-cupboard', shelf: 1, offset: [-0.3, 0] } },
      { id: 'kitchen-cup-b', kind: 'cup', mount: { on: 'inside', host: 'kitchen-cupboard', shelf: 1 } },
      { id: 'kitchen-cup-c', kind: 'cup', mount: { on: 'inside', host: 'kitchen-cupboard', shelf: 1, offset: [0.3, 0] } },
      { id: 'dining-table', kind: 'diningTable', mount: { on: 'floor', cell: [7, 3], facing: 's', offset: [0.5, -0.58] } },
      { id: 'dining-chair-a', kind: 'chair', mount: { on: 'floor', cell: [5, 3], facing: 's', offset: [0, 0.13] } },
      { id: 'dining-chair-b', kind: 'chair', mount: { on: 'floor', cell: [5, 4], facing: 's', offset: [0, 0.13] } },
      { id: 'dining-chair-e', kind: 'chair', mount: { on: 'floor', cell: [6, 5], facing: 'w', offset: [-0.15, 0.45] } },
      { id: 'patio-table', kind: 'table', mount: { on: 'floor', cell: [1, 3], facing: 's', offset: [0, 0.2] } },
      { id: 'patio-chair-a', kind: 'chair', mount: { on: 'floor', cell: [1, 2], facing: 'e', offset: [-0.1, 0.2] } },
      { id: 'patio-chair-b', kind: 'chair', mount: { on: 'floor', cell: [1, 4], facing: 'w', offset: [0.1, 0.2] } },
      { id: 'patio-chair-c', kind: 'chair', mount: { on: 'floor', cell: [0, 3], facing: 's', offset: [0, 0.24] } },
      { id: 'patio-plant-a', kind: 'pottedPlant', mount: { on: 'floor', cell: [2, 2], facing: 's', offset: [-0.22, 0.22] } },
      { id: 'patio-plant-b', kind: 'pottedPlant', mount: { on: 'floor', cell: [2, 8], facing: 's', offset: [0.22, 0.22] } },
      { id: 'wc-toilet', kind: 'toilet', mount: { on: 'floor', cell: [3, 7], facing: 's', offset: [0, -0.07] } },
      { id: 'wc-sink', kind: 'sink', mount: { on: 'floor', cell: [5, 8], facing: 'w', offset: [0.195, 0] } },
      { id: 'living-rug', kind: 'rug', mount: { on: 'floor', cell: [10, 4], facing: 's' } },
      { id: 'living-table', kind: 'table', mount: { on: 'floor', cell: [9, 4], facing: 's', offset: [0, -0.15] } },
      { id: 'work-laptop', kind: 'laptop', mount: { on: 'item', host: 'living-table', offset: [-0.2, -0.1] } },
      { id: 'living-sofa', kind: 'sofa', mount: { on: 'floor', cell: [10, 4], facing: 'n', offset: [0, 0.05] } },
      { id: 'living-tv', kind: 'tv', mount: { on: 'wall', cell: [8, 4], side: 'back', height: 0.55 } },
      { id: 'living-bookshelf', kind: 'bookshelf', mount: { on: 'floor', cell: [12, 8], facing: 'w', offset: [0.27, 0] } },
      { id: 'reading-chair', kind: 'chair', mount: { on: 'floor', cell: [8, 8], facing: 's', offset: [0, 0.05] } },
      { id: 'reading-nightstand', kind: 'nightstand', mount: { on: 'floor', cell: [11, 8], facing: 'w', offset: [0.2, 0.05] } },
      { id: 'reading-lamp', kind: 'lamp', mount: { on: 'item', host: 'reading-nightstand' } },
      { id: 'living-floor-lamp', kind: 'floorLamp', mount: { on: 'floor', cell: [8, 1], facing: 's', offset: [0, 0.05] } },
      { id: 'living-plant', kind: 'pottedPlant', mount: { on: 'floor', cell: [12, 0], facing: 's', offset: [0.22, -0.22] } },
    ],
  },
  1: {
    openings: [
      { kind: 'door', cell: [6, 2], side: 'back', swing: 'in', between: ['landing', 'bedroomSmall'] },
      { kind: 'door', cell: [6, 4], side: 'back', swing: 'in', between: ['landing', 'bathroomUp'] },
      { kind: 'door', cell: [7, 2], side: 'back', swing: 'out', between: ['bedroom', 'landing'] },
      { kind: 'window', cell: [3, 1], side: 'back', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
      { kind: 'window', cell: [5, 0], side: 'left', sill: 0.45, head: 0.95, between: ['bedroomSmall', 'outside'] },
      { kind: 'window', cell: [3, 6], side: 'back', sill: 0.6, head: 1, between: ['bathroomUp', 'outside'] },
      { kind: 'window', cell: [4, 8], side: 'right', sill: 0.6, head: 1, between: ['bathroomUp', 'outside'] },
      { kind: 'window', cell: [7, 8], side: 'right', sill: 0.35, head: 1, between: ['bedroom', 'outside'] },
      { kind: 'window', cell: [10, 2], side: 'front', sill: 0.35, head: 1, between: ['bedroom', 'outside'] },
      { kind: 'window', cell: [10, 6], side: 'front', sill: 0.35, head: 1, between: ['bedroom', 'outside'] },
    ],
    items: [
      { id: 'up-bath', kind: 'bathtub', mount: { on: 'floor', cell: [4, 8], facing: 'w', offset: [0.045, 0] } },
      { id: 'up-shower', kind: 'shower', mount: { on: 'floor', cell: [3, 4], facing: 's', offset: [0.03, 0.03] } },
      { id: 'up-sink', kind: 'sink', mount: { on: 'floor', cell: [5, 5], facing: 'n', offset: [0, 0.195] } },
      { id: 'up-toilet', kind: 'toilet', mount: { on: 'floor', cell: [5, 6], facing: 'n', offset: [0, 0.07] } },
      { id: 'bedroom-bed', kind: 'bed', mount: { on: 'floor', cell: [7, 4], facing: 's', offset: [0, 0.58] } },
      { id: 'bedroom-nightstand-l', kind: 'nightstand', mount: { on: 'floor', cell: [7, 3], facing: 's', offset: [0.055, -0.22] } },
      { id: 'bedroom-nightstand-r', kind: 'nightstand', mount: { on: 'floor', cell: [7, 5], facing: 's', offset: [-0.055, -0.22] } },
      { id: 'bedroom-wardrobe', kind: 'wardrobe', mount: { on: 'floor', cell: [9, 8], facing: 'w', offset: [0.12, 0] } },
      { id: 'bedroom-tv', kind: 'tv', mount: { on: 'wall', cell: [10, 4], side: 'front', height: 0.55 } },
      { id: 'bedroom-lamp', kind: 'lamp', mount: { on: 'item', host: 'bedroom-nightstand-l' } },
      { id: 'small-bed', kind: 'bed', mount: { on: 'floor', cell: [4, 0], facing: 'e', offset: [0.58, -0.5] } },
      { id: 'small-nightstand', kind: 'nightstand', mount: { on: 'floor', cell: [3, 2], facing: 's', offset: [0, -0.22] } },
      { id: 'small-wardrobe', kind: 'wardrobe', mount: { on: 'floor', cell: [5, 3], facing: 'n', offset: [0, 0.12] } },
      { id: 'small-lamp', kind: 'lamp', mount: { on: 'item', host: 'small-nightstand' } },
    ],
  },
});
