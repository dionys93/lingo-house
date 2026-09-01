// src/render/edit/PlanView.tsx
//
// The house from above, as SVG.
//
// NOT a three.js scene, and that is the decision worth defending. Edit mode
// authors a GRID: cells, sides, offsets in cell fractions. A plan view is the
// drawing that grid actually is, it needs no camera to fight with the pointer,
// and a rectangle at exact world coordinates is easier to hit precisely than a
// mesh under a perspective projection. The roof and item showcases are 3D
// because what they show IS how something looks; this shows where things are.
//
// SVG user units ARE world units, with Z drawn as Y — the plan view's whole
// coordinate system is `x → x, z → y`. So nothing here converts anything: the
// compiled bounds of a sofa are the rectangle, and a click at (x, y) is a point
// at world (x, z) that frame.ts turns back into a cell.

import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { CompiledStorey, CompiledStair } from '../../core/house/house';
import type { WallEdge } from '../../core/edit/edges';
import { CELL, WALL_THICKNESS } from '../../core/house/scale';
import type { Vec2 } from '../../core/house/collide';

export type Hit =
  | { readonly on: 'item'; readonly id: string }
  | { readonly on: 'edge'; readonly edge: WallEdge }
  | { readonly on: 'floor'; readonly at: Vec2 };

export interface PlanSelection {
  readonly item: string | null;
  readonly edgeKey: string | null;
}

// A compiled opening's id is the edge key with its storey prefixed
// (`L0:v:3:2`), because an edge exists at the same coordinates on every floor.
// Dropping the prefix is how an opening on the plan finds the edge it sits on —
// by splitting on the separator rather than by `endsWith`, which would also
// match `v:11:2` against `v:1:2` if the grid ever got that wide.
const edgeKeyOf = (openingId: string): string => openingId.split(':').slice(1).join(':');

const ROOM_INK = '#8a8578';
const WALL_INK = '#3c3a35';

// Items are drawn by what holds them up, because that is what you can and
// cannot drag: a floor item moves anywhere, a wall item slides along its wall,
// and something sitting on a table follows the table.
const ITEM_FILL: Record<'floor' | 'item' | 'wall' | 'inside', string> = {
  floor: '#c98b5e',
  item: '#d9b382',
  wall: '#8fa9c0',
  // Inside something, so its footprint sits within its host's and would
  // otherwise read as a stray rectangle drawn on top of a cupboard. Pale, and
  // like the other non-floor mounts it is selected rather than dragged.
  inside: '#efe0c6',
};

export function PlanView({
  storey,
  stairs,
  edges,
  selection,
  showEdges,
  onHit,
  onDragItem,
}: {
  storey: CompiledStorey;
  stairs: readonly CompiledStair[];
  edges: readonly WallEdge[];
  selection: PlanSelection;
  /** Wall edges are only drawn as targets while an opening is being placed. */
  showEdges: boolean;
  onHit: (hit: Hit) => void;
  /** Called continuously while dragging: the item's new world (x, z). */
  onDragItem: (id: string, at: Vec2) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<string | null>(null);

  // Framed on every room, NOT on `footprint.bbox`. The footprint is the outline
  // the roof sits on — the building — and since the plan became the plot it no
  // longer contains the patio or the garden. Framing by it crops off exactly the
  // rows you added.
  const bounds = storey.grid.rooms.reduce(
    (a, r) => ({
      x0: Math.min(a.x0, r.bounds.min[0]),
      z0: Math.min(a.z0, r.bounds.min[2]),
      x1: Math.max(a.x1, r.bounds.max[0]),
      z1: Math.max(a.z1, r.bounds.max[2]),
    }),
    { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity },
  );
  const pad = CELL;
  const view = `${String(bounds.x0 - pad)} ${String(bounds.z0 - pad)} ${String(bounds.x1 - bounds.x0 + pad * 2)} ${String(bounds.z1 - bounds.z0 + pad * 2)}`;

  // Client pixels → SVG user units → world (x, z). getScreenCTM is the only
  // thing that knows how the viewBox got fitted into the element, so this is
  // done by asking rather than by recomputing the scale from the bounding rect.
  const worldAt = (e: ReactPointerEvent): Vec2 | null => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const id = dragging.current;
    if (id === null) return;
    const at = worldAt(e);
    if (at) onDragItem(id, at);
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (dragging.current === null) return;
    dragging.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <svg
      ref={svg}
      viewBox={view}
      style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none', background: '#f4f1ea' }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // A click on the background is a click on the FLOOR, which is how an item
      // gets placed. It has to be the last word — every shape above stops
      // propagation — so it lives on the root rather than on a backdrop rect.
      onPointerDown={(e) => {
        const at = worldAt(e);
        if (at) onHit({ on: 'floor', at });
      }}
    >
      {/* ── Rooms: one tile per cell, so the grid you are authoring is visible
          rather than implied by the walls around it. ── */}
      {storey.grid.rooms.map((room) => (
        <g key={room.key}>
          {room.floor.map((t, i) => (
            <rect
              key={i}
              x={t[0] - CELL / 2}
              y={t[2] - CELL / 2}
              width={CELL}
              height={CELL}
              fill={room.color ?? '#e6e1d6'}
              fillOpacity={0.55}
              stroke={ROOM_INK}
              strokeWidth={0.006}
              strokeOpacity={0.5}
            />
          ))}
        </g>
      ))}

      {/* ── Stairwells. Drawn because they are the one part of the floor that
          isn't floor, and dropping a wardrobe into one is otherwise invisible
          until you walk into it. ── */}
      {stairs
        .filter((s) => s.level === storey.level || s.level + 1 === storey.level)
        .map((s) => (
          <g key={s.id}>
            {s.treads.map((t, i) => (
              <rect
                key={i}
                x={t[0] - CELL / 2}
                y={t[2] - CELL / 2}
                width={CELL}
                height={CELL}
                fill="none"
                stroke={WALL_INK}
                strokeWidth={0.012}
                strokeDasharray="0.06 0.04"
              />
            ))}
          </g>
        ))}

      {/* ── Walls, at their true thickness. ── */}
      {storey.grid.walls.map((w, i) => (
        <line
          key={i}
          x1={w.a[0]}
          y1={w.a[2]}
          x2={w.b[0]}
          y2={w.b[2]}
          stroke={WALL_INK}
          strokeWidth={WALL_THICKNESS}
          strokeLinecap="butt"
        />
      ))}

      {/* ── Openings, over the wall they cut. A door reads as a gap with a
          leaf; a window as a pale bar. ── */}
      {storey.grid.openings.map((o) => {
        const key = edgeKeyOf(o.id);
        const on = key === selection.edgeKey;
        return (
          <line
            key={o.id}
            x1={o.a[0]}
            y1={o.a[2]}
            x2={o.b[0]}
            y2={o.b[2]}
            stroke={on ? '#b5503f' : o.kind === 'door' ? '#f4f1ea' : '#7fb3d5'}
            strokeWidth={o.kind === 'door' ? WALL_THICKNESS * 1.4 : WALL_THICKNESS}
            strokeLinecap="butt"
            style={{ cursor: 'pointer' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              const edge = edges.find((x) => x.key === key);
              if (edge) onHit({ on: 'edge', edge });
            }}
          />
        );
      })}

      {/* ── Every wall edge, while an opening is being placed. Not drawn
          otherwise: sixty dashed lines over the plan is noise when you are
          moving furniture. ── */}
      {showEdges &&
        edges.map((e) => (
          <line
            key={e.key}
            x1={e.a[0]}
            y1={e.a[1]}
            x2={e.b[0]}
            y2={e.b[1]}
            stroke="#b5503f"
            strokeOpacity={0.9}
            strokeWidth={WALL_THICKNESS * 1.6}
            strokeLinecap="butt"
            strokeDasharray="0.08 0.06"
            style={{ cursor: 'pointer' }}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              onHit({ on: 'edge', edge: e });
            }}
          />
        ))}

      {/* ── Items, as their true compiled footprint. Same rectangle the
          collision code uses, so what you see blocking a doorway is what
          blocks it. ── */}
      {storey.grid.items.map((it) => {
        const on = it.id === selection.item;
        const [w, d] = [it.bounds.max[0] - it.bounds.min[0], it.bounds.max[2] - it.bounds.min[2]];
        return (
          <g key={it.id}>
            <rect
              x={it.bounds.min[0]}
              y={it.bounds.min[2]}
              width={w}
              height={d}
              fill={ITEM_FILL[it.mountedOn]}
              fillOpacity={on ? 0.95 : 0.75}
              stroke={on ? '#b5503f' : WALL_INK}
              strokeWidth={on ? 0.03 : 0.012}
              style={{ cursor: it.mountedOn === 'floor' ? 'grab' : 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                onHit({ on: 'item', id: it.id });
                // Only a floor item can be dragged to a point. A wall item
                // slides along its wall and an item on a table follows the
                // table; both are edited in the inspector, where the thing
                // they are relative to is named.
                if (it.mountedOn !== 'floor') return;
                dragging.current = it.id;
                e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
              }}
            />
            {/* Which way it faces: a tick on the front edge. Yaw 0 is 's' —
                toward the FRONT of the house, which is +Z, which is down. */}
            <line
              x1={it.position[0]}
              y1={it.position[2]}
              x2={it.position[0] + Math.sin(it.yaw) * 0.14}
              y2={it.position[2] + Math.cos(it.yaw) * 0.14}
              stroke={WALL_INK}
              strokeWidth={0.02}
              strokeLinecap="round"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </svg>
  );
}
