// web/src/components/house/blocks.js
//
// The little building blocks you place in the grid. `defineRoom` makes a
// reusable room marker you drop into cells; EMPTY marks a cell with no room.
//
// A room marker is deliberately a plain tagged object, not a React element:
// the grid is DATA the house reads to build geometry, not something rendered
// cell-by-cell. Keeping these as data (rather than <Cell/> elements) is what
// lets the same marker appear in a hundred cells cheaply and lets the
// derivation inspect them freely.

export const EMPTY = null;

// A stable id per room key, so two cells holding the "same" room compare
// equal by key. Colour is optional — omitted means "use the house siding
// colour inside too", which reads as a plain painted wall.
export function defineRoom({ key, name, color }) {
  if (!key) throw new Error('defineRoom needs a key');
  return { kind: 'room', key, name: name ?? key, color: color ?? null };
}

// Is this grid cell a room (vs empty)?
export function isRoom(cell) {
  return cell != null && cell.kind === 'room';
}