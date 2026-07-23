// items/index.js  — the catalog registry. Note the name: ITEM_COMPONENTS,
// deliberately NOT `ITEMS`, so it can't collide with the placement DATA list
// in rooms.js (which becomes ITEMS below). Keys match rooms.js `type` values.
import { Toilet } from './toilet/Toilet.jsx';
import { Bath } from './bath/Bath.jsx';
import { Bookcase } from './bookcase/Bookcase.jsx';
import { Staircase } from './staircase/Staircase.jsx';

export const ITEM_COMPONENTS = {
  toilet: Toilet, bath: Bath,
  bookcase: Bookcase, staircase: Staircase,
};