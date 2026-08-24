// src/render/elements/Storey.tsx
//
// Renders one storey. Extracted from HouseScene so the walking view can render
// the same house rather than forking it — the two scenes differ in how the
// camera moves, and nothing else.

import type { CompiledStorey } from '../../core/house/house';
import type { Selection } from '../../core/session/explorer';
import { Floor } from './Floor';
import { Ceiling } from './Ceiling';
import { Walls } from './Walls';
import { Doors } from './Doors';
import { Windows } from './Windows';
import { Items } from './Items';

// Everything that repeats per floor. Each storey draws its own walls, floors,
// ceilings, openings and items, all already in world space — the only thing it
// needs to be told about its level is where the stairwell leaves a gap.
export function Storey({
  storey,
  openDoors,
  selectedItemId,
  select,
}: {
  storey: CompiledStorey;
  openDoors: ReadonlySet<string>;
  selectedItemId: string | null;
  select: (selection: Selection) => void;
}) {
  const { grid, baseY, openFloor, openCeiling } = storey;
  return (
    <>
      <Floor
        grid={grid}
        baseY={baseY}
        skip={openFloor}
        onPick={(at) => select({ on: 'part', part: 'floor', at })}
      />
      <Ceiling
        grid={grid}
        baseY={baseY}
        skip={openCeiling}
        onPick={(at) => select({ on: 'part', part: 'ceiling', at })}
      />
      <Walls grid={grid} onPick={(at) => select({ on: 'part', part: 'wall', at })} />
      <Items
        grid={grid}
        selectedId={selectedItemId}
        onSelect={(id) => select({ on: 'item', id })}
      />
      <Doors grid={grid} openDoors={openDoors} onPick={(id) => select({ on: 'opening', id })} />
      <Windows grid={grid} onPick={(id) => select({ on: 'opening', id })} />
    </>
  );
}