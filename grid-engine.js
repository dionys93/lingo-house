// web/src/components/house/grid-engine.js
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  THIS IS THE MACHINE. You don't need to read or edit this file.        ║
// ║  To change the house, edit rooms.js — the grid and the door/item       ║
// ║  lists. This file turns that grid into walls, doorways, room           ║
// ║  footprints, and the navigation graph.                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// It's organised as a handful of small functions, each doing one job:
//
//   readRooms      — which rooms exist, from the letters in the grid
//   measureGrid    — how to place the grid in the world (centring)
//   findFootprints — each room's bounding box, in cells
//   findWalls      — every wall, derived from cells that differ
//   buildNavigation— the parent / path / adjacency graph, from the doors
//   placeDoorways  — match each door to its wall and position it
//   placeItems     — resolve a friendly spot ('back-left') to a position
//
// The one genuinely fiddly bit — scanning the grid for walls — is isolated
// in `scanLineForRuns`, written once and used for both directions.

import { EXTERIOR } from './grid-shared.js';

// ── The grid, made safe to poke at ────────────────────────────────────────
// Rows may be authored at different lengths; a Grid wraps that so callers
// just ask "what room key is at (row, col)?" and get null past the edges.
export function makeGrid(cells, isRoom) {
  const rows = cells.length;
  const cols = Math.max(...cells.map((row) => row.length));
  const keyAt = (row, col) => {
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    const cell = cells[row][col];
    return isRoom(cell) ? cell.key : null;
  };
  return { rows, cols, keyAt, cells, isRoom };
}

// ── readRooms: the distinct rooms, in the order first seen ────────────────
// Walk the occupied cells, keep the first of each room key, and shape each
// into a room record. `firstByKey` preserves encounter order (unlike a plain
// Map-then-values, which we'd have to reason about), so the rooms come out in
// the order they first appear in the grid — back-to-front, left-to-right.
export function readRooms(grid) {
  return firstByKey(occupiedCells(grid), (c) => c.key).map(({ row, col }) => {
    const cell = grid.cells[row][col];
    return { id: cell.key, label: cell.name, interiorWallColor: cell.color };
  });
}

// ── measureGrid: where to place the grid so the house sits at the origin ──
// The "body" is the block of columns filled all the way from the back row to
// the front row (the living-room / kitchen stack). We centre that on X = 0,
// and shift Z so the frontmost wall lands at `frontWallZ`. A wing that only
// fills some rows then correctly juts out past centre on its side.
export function measureGrid(grid, cell, frontWallZ) {
  const filledRows = range(grid.rows).filter((row) => rowHasAnyRoom(grid, row));
  const backRow = filledRows[0];
  const frontRow = filledRows[filledRows.length - 1];

  const isBodyColumn = (col) => grid.keyAt(backRow, col) && grid.keyAt(frontRow, col);
  const bodyCols = range(grid.cols).filter(isBodyColumn);
  const bodyLo = bodyCols[0];
  const bodyHi = bodyCols[bodyCols.length - 1] + 1;

  const frontEdgeRow = frontRow + 1; // occupied rows are [backRow, frontRow]

  return {
    xOffset: ((bodyLo + bodyHi) / 2) * cell,     // centres the body on X=0
    zOffset: frontEdgeRow * cell - frontWallZ,   // frontmost wall -> frontWallZ
  };
}

// A set of grid<->world converters bound to one cell size and placement.
export function makeCoords(cell, { xOffset, zOffset }) {
  return {
    xEdge: (col) => col * cell - xOffset, // world X of the line left of `col`
    zEdge: (row) => row * cell - zOffset, // world Z of the line back of `row`
  };
}

// ── findFootprints: each room's bounding box, in cell indices ─────────────
// Group the occupied cells by room, then collapse each group to the box that
// contains all its cells. (colHi/rowHi are exclusive — one past the last
// cell — so a 1-cell room spans [c, c+1].)
export function findFootprints(grid) {
  const byRoom = groupBy(occupiedCells(grid), (c) => c.key);
  return new Map(
    [...byRoom].map(([key, cells]) => [key, boundingBox(cells)])
  );
}

function boundingBox(cells) {
  return {
    colLo: Math.min(...cells.map((c) => c.col)),
    colHi: Math.max(...cells.map((c) => c.col + 1)),
    rowLo: Math.min(...cells.map((c) => c.row)),
    rowHi: Math.max(...cells.map((c) => c.row + 1)),
  };
}

// ── findWalls: a wall wherever two neighbouring cells hold different rooms ─
// Both directions use the same scan: walk parallel lines, and on each line
// emit a wall segment wherever the cell on one side differs from the other,
// merging neighbours that share the same pair of sides into one long run.
export function findWalls(grid, coords) {
  const vertical = scanLines({
    lines: grid.cols + 1,          // vertical wall lines: 0..cols
    steps: grid.rows,              // each runs along the rows
    sideBefore: (line, step) => grid.keyAt(step, line - 1), // west
    sideAfter: (line, step) => grid.keyAt(step, line),      // east
    toRun: (line, lo, hi, neg, pos) => ({
      axis: 'x',
      at: coords.xEdge(line),
      lo: coords.zEdge(lo),
      hi: coords.zEdge(hi),
      sideNeg: neg, sidePos: pos,
    }),
  });

  const horizontal = scanLines({
    lines: grid.rows + 1,          // horizontal wall lines: 0..rows
    steps: grid.cols,              // each runs along the cols
    sideBefore: (line, step) => grid.keyAt(line - 1, step), // back
    sideAfter: (line, step) => grid.keyAt(line, step),      // front
    toRun: (line, lo, hi, neg, pos) => ({
      axis: 'z',
      at: coords.zEdge(line),
      lo: coords.xEdge(lo),
      hi: coords.xEdge(hi),
      sideNeg: neg, sidePos: pos,
    }),
  });

  return [...vertical, ...horizontal];
}

// The heart of wall-finding, direction-agnostic. For each line, walk its
// steps; a wall exists where the two sides differ; contiguous steps with the
// same (before, after) pair merge into one run.
function scanLines({ lines, steps, sideBefore, sideAfter, toRun }) {
  const runs = [];
  for (let line = 0; line <= lines - 1; line++) {
    let open = null; // the run currently being extended, or null
    for (let step = 0; step <= steps; step++) {
      const before = step < steps ? (sideBefore(line, step) ?? EXTERIOR) : null;
      const after = step < steps ? (sideAfter(line, step) ?? EXTERIOR) : null;
      const isWall = step < steps && before !== after;

      const extendsOpen = isWall && open && open.neg === before && open.pos === after;
      if (extendsOpen) {
        open.hi = step + 1;
      } else {
        if (open) runs.push(toRun(line, open.lo, open.hi, open.neg, open.pos));
        open = isWall ? { lo: step, hi: step + 1, neg: before, pos: after } : null;
      }
    }
    if (open) runs.push(toRun(line, open.lo, open.hi, open.neg, open.pos));
  }
  return runs;
}

// ── buildNavigation: parent / path / adjacency, by walking out from EXTERIOR
export function buildNavigation(doors, stairs, rooms) {
  const links = [...doors, ...stairs].map((d) =>
    d.between.map((s) => (s === 'outside' ? EXTERIOR : s))
  );

  // Breadth-first from the exterior; depth = how many doors deep a room is.
  const depth = new Map([[EXTERIOR, 0]]);
  const queue = [EXTERIOR];
  while (queue.length) {
    const here = queue.shift();
    for (const [a, b] of links) {
      const other = a === here ? b : b === here ? a : null;
      if (other && !depth.has(other)) {
        depth.set(other, depth.get(here) + 1);
        queue.push(other);
      }
    }
  }

  for (const room of rooms) {
    if (!depth.has(room.id)) {
      throw new Error(`rooms.js: room "${room.id}" has no door connecting it (directly or indirectly) to the outside`);
    }
  }

  const parentOf = (id) => {
    if (id === EXTERIOR) return EXTERIOR;
    const link = links.find(([a, b]) => {
      const other = a === id ? b : b === id ? a : null;
      return other != null && depth.get(other) === depth.get(id) - 1;
    });
    return link[0] === id ? link[1] : link[0];
  };

  const pathTo = (id) => {
    const path = [];
    for (let at = id; at && at !== EXTERIOR; at = parentOf(at)) path.unshift(at);
    return path;
  };

  const areAdjacent = (a, b) => links.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const depthOf = (id) => depth.get(id) ?? Infinity;

  return { parentOf, pathTo, areAdjacent, depthOf };
}

// ── placeDoorways: match each door to its shared wall and position it ──────
export function placeDoorways(doors, walls, nav, cell, doorWidth) {
  return doors.map((door) => {
    const [a, b] = door.between.map((s) => (s === 'outside' ? EXTERIOR : s));
    const child = nav.depthOf(a) > nav.depthOf(b) ? a : b;
    const run = matchDoorToWall(door, a, b, child, walls);

    // The door opening (its full width) plus a minimum jamb on each side must
    // fit within the wall it sits in — otherwise the door, or its swing,
    // clips out through the corner. Check before placing so an offset that's
    // too large for its wall is a loud, specific error rather than a door
    // silently poking through an exterior wall.
    const wallSpan = run.hi - run.lo;
    const offsetWorld = (door.offset ?? 0) * cell;
    // Leave a full door-width of wall beside the opening: enough of a jamb
    // that the leaf's swing arc doesn't sweep past the corner (a half-width
    // reveal looks fine at rest but the door still clips out when opened).
    const minJamb = doorWidth;
    const maxOffset = wallSpan / 2 - doorWidth / 2 - minJamb;
    if (Math.abs(offsetWorld) > maxOffset + 1e-9) {
      const maxCells = maxOffset / cell;
      throw new Error(
        `rooms.js: door ${a}<->${b} has offset ${door.offset ?? 0}, which pushes it past its wall ` +
        `(the ${a}/${b} wall is ${wallSpan / cell} cells wide; max offset here is ` +
        `${maxCells >= 0 ? '±' + maxCells.toFixed(1) : '0 (wall too narrow for an offset)'} cells)`
      );
    }

    // Build the doorway in local space (spanning local X, local +Z toward the
    // shallower/parent side), then hand back where to place and rotate it.
    const parentIsPositiveSide = child !== run.sidePos;
    const rotationY = doorFacing(run.axis, parentIsPositiveSide);
    const wallCenter = run.axis === 'x'
      ? [run.at, 0, midpoint(run.lo, run.hi)]
      : [midpoint(run.lo, run.hi), 0, run.at];

    const along = [Math.cos(rotationY), 0, -Math.sin(rotationY)];
    const doorPosition = [
      wallCenter[0] + offsetWorld * along[0],
      0,
      wallCenter[2] + offsetWorld * along[2],
    ];

    return {
      child,
      isExterior: a === EXTERIOR || b === EXTERIOR,
      animation: door.swing === 'in' ? 'swingDoorIn' : 'swingDoorOut',
      span: run.hi - run.lo,
      offset: offsetWorld,
      wallCenter,
      rotationY,
      doorPosition,
      run,
    };
  });
}

// ── placeStairs: authored footprint (dir + width + spot) in the plan overlap
const STAIR_DIRS = {
  north: { axis: 'z', sign: -1 }, south: { axis: 'z', sign: 1 },
  east:  { axis: 'x', sign: 1 },  west:  { axis: 'x', sign: -1 },
};

export function placeStairs(stairs, footprints, roomFloor, coords, cell, floorHeight) {
  return stairs.map((stair) => {
    const [x, y] = stair.between;
    const [lower, upper] = roomFloor(x) < roomFloor(y) ? [x, y] : [y, x];
    const a = footprints.get(lower), b = footprints.get(upper);
    if (!a || !b) throw new Error(`rooms.js: stair ${x}<->${y} names a room not in the grid`);

    const oColLo = Math.max(a.colLo, b.colLo), oColHi = Math.min(a.colHi, b.colHi);
    const oRowLo = Math.max(a.rowLo, b.rowLo), oRowHi = Math.min(a.rowHi, b.rowHi);
    if (oColHi <= oColLo || oRowHi <= oRowLo)
      throw new Error(`rooms.js: stair ${lower}<->${upper} — those rooms don't overlap in plan`);

    const dir = STAIR_DIRS[stair.dir ?? 'north'];
    const widthCells = Math.max(1, stair.width ?? 1);
    // The run occupies the overlap's full length along the climb axis; width is
    // the authored cell count across it. Then anchor the box by spot.
    const runIsZ = dir.axis === 'z';
    const overlapW = oColHi - oColLo, overlapD = oRowHi - oRowLo;   // in cells
    const wCells = Math.min(widthCells, runIsZ ? overlapW : overlapD);
    const runCells = runIsZ ? overlapD : overlapW;

    // spot picks which corner the width-band hugs; run fills the overlap length.
    const back = /back|left/.test(stair.spot ?? 'back-left');
    let colLo, colHi, rowLo, rowHi;
    if (runIsZ) {
      rowLo = oRowLo; rowHi = oRowHi;
      colLo = back ? oColLo : oColHi - wCells; colHi = colLo + wCells;
    } else {
      colLo = oColLo; colHi = oColHi;
      rowLo = back ? oRowLo : oRowHi - wCells; rowHi = rowLo + wCells;
    }

    const rect = boxToRect({ colLo, colHi, rowLo, rowHi }, coords, cell);
    const lowerY = roomFloor(lower) * floorHeight, upperY = roomFloor(upper) * floorHeight;
    return {
      lower, upper, child: upper,
      dir: stair.dir ?? 'north', climbAxis: dir.axis, climbSign: dir.sign,
      footprintBox: { colLo, colHi, rowLo, rowHi },   // for the floor hole
      position: [rect.centerX, lowerY, rect.centerZ],
      rise: upperY - lowerY,
      rect,
      // Two waypoints so the camera walks the flight: bottom of stairs, then top.
      waypointBottom: [rect.centerX, lowerY + 0.15, rect.centerZ + (runIsZ ? -dir.sign : 0) * rect.depth * 0.4],
      waypointTop: [rect.centerX, upperY + 0.2, rect.centerZ + (runIsZ ? dir.sign : 0) * rect.depth * 0.4],
    };
  });
}

// Find the one wall run a door belongs in. Usually two rooms share exactly
// one wall; if they share several (a room wrapping around another), the door
// must name which side, and we match that.
function matchDoorToWall(door, a, b, child, walls) {
  const shared = walls.filter((run) => joins(run, a, b));
  if (shared.length === 0) {
    throw new Error(`rooms.js: door ${a}<->${b}, but those rooms don't share a wall in the grid`);
  }
  if (shared.length === 1) return shared[0];

  if (!door.side) {
    throw new Error(`rooms.js: door ${a}<->${b} could go in ${shared.length} different shared walls; add side:'front'|'back'|'left'|'right'`);
  }
  const onSide = shared.filter((run) => wallIsOnSide(run, child, door.side));
  if (onSide.length !== 1) {
    throw new Error(`rooms.js: door ${a}<->${b} side:'${door.side}' doesn't match exactly one wall`);
  }
  return onSide[0];
}

const joins = (run, a, b) =>
  (run.sideNeg === a && run.sidePos === b) || (run.sideNeg === b && run.sidePos === a);

// `side` names which wall OF THE CHILD room the door sits in. A room's front
// wall is on its +Z edge, so on that wall the child is the negative side.
function wallIsOnSide(run, child, side) {
  switch (side) {
    case 'front': return run.axis === 'z' && run.sideNeg === child;
    case 'back': return run.axis === 'z' && run.sidePos === child;
    case 'left': return run.axis === 'x' && run.sidePos === child;
    case 'right': return run.axis === 'x' && run.sideNeg === child;
    default: return false;
  }
}

// Rotation so local +Z faces the parent side of the wall.
function doorFacing(axis, parentIsPositiveSide) {
  if (axis === 'z') return parentIsPositiveSide ? 0 : Math.PI;
  return parentIsPositiveSide ? Math.PI / 2 : -Math.PI / 2;
}

// ── placeItems: friendly spot -> world position inside the room ───────────
const SPOTS = {
  'center': (r) => ({ x: r.centerX, z: r.centerZ, rotationY: 0 }),
  'back-left': (r) => ({ x: r.centerX - r.width / 2 + 0.3, z: r.centerZ - r.depth / 2 + 0.3, rotationY: 0 }),
  'back-right': (r) => ({ x: r.centerX + r.width / 2 - 0.3, z: r.centerZ - r.depth / 2 + 0.3, rotationY: 0 }),
  'right-wall': (r) => ({ x: r.centerX + r.width / 2 - 0.35, z: r.centerZ, rotationY: 0 }),
  'left-wall': (r) => ({ x: r.centerX - r.width / 2 + 0.35, z: r.centerZ, rotationY: Math.PI }),
};

export function placeItems(items, rectOf) {
  return items.map((item) => {
    const rect = rectOf(item.room);
    if (!rect) throw new Error(`rooms.js: item "${item.type}" names room "${item.room}", which isn't in the grid`);
    const place = SPOTS[item.spot] ?? SPOTS['center'];
    return { type: item.type, ...place(rect), length: item.length, room: item.room };
  });
}

// ── tiny shared helpers ───────────────────────────────────────────────────
const range = (n) => Array.from({ length: n }, (_, i) => i);
const midpoint = (a, b) => (a + b) / 2;

// The grid as a flat list of its occupied cells: { row, col, key }, in
// reading order (back-to-front, left-to-right). Empty cells are dropped, so
// callers can map/filter/reduce over rooms without minding the blanks. This
// is what lets the cell-walking derivations be transform chains instead of
// nested loops — each occupied cell contributes independently.
function occupiedCells(grid) {
  return range(grid.rows).flatMap((row) =>
    range(grid.cols)
      .map((col) => ({ row, col, key: grid.keyAt(row, col) }))
      .filter((c) => c.key !== null)
  );
}

function rowHasAnyRoom(grid, row) {
  return range(grid.cols).some((col) => grid.keyAt(row, col));
}

// Group items by a key, preserving insertion order within each group.
function groupBy(items, keyOf) {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    (groups.get(key) ?? groups.set(key, []).get(key)).push(item);
  }
  return groups;
}

// Keep the first item seen for each key, in first-seen order.
function firstByKey(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Balcony geometry: overhangs → railings + support columns ──────────────

// An upper-floor cell with nothing beneath it on the floor below is
// cantilevered. Returns a Set of "row,col" keys. No floor below → empty set.
export function findOverhangs(grid, gridBelow) {
  const over = new Set();
  if (!gridBelow) return over;
  for (const { row, col } of occupiedCells(grid)) {
    if (gridBelow.keyAt(row, col) === null) over.add(`${row},${col}`);
  }
  return over;
}

// The outer edges of the overhang — cantilevered on one side, open air on the
// other — become railings. Edges where the balcony meets the enclosed part of
// its own floor are neither over-vs-air, so they stay open (a threshold onto
// the deck). Runs match wall-run shape, so trimWallsByRailings can subtract them.
export function findRailings(grid, overhang, coords) {
  const over = (r, c) => overhang.has(`${r},${c}`);
  const air = (r, c) => grid.keyAt(r, c) === null;
  const rail = (ar, ac, br, bc) =>
    (over(ar, ac) && air(br, bc)) || (over(br, bc) && air(ar, ac));

  const runs = [];
  for (let col = 0; col <= grid.cols; col++)
    mergeRuns(grid.rows, (r) => rail(r, col - 1, r, col), (lo, hi) =>
      runs.push({ axis: 'x', at: coords.xEdge(col), lo: coords.zEdge(lo), hi: coords.zEdge(hi) }));
  for (let row = 0; row <= grid.rows; row++)
    mergeRuns(grid.cols, (c) => rail(row - 1, c, row, c), (lo, hi) =>
      runs.push({ axis: 'z', at: coords.zEdge(row), lo: coords.xEdge(lo), hi: coords.xEdge(hi) }));
  return runs;
}

function mergeRuns(steps, present, emit) {
  let open = null;
  for (let s = 0; s < steps; s++) {
    if (present(s)) open = open ? { lo: open.lo, hi: s + 1 } : { lo: s, hi: s + 1 };
    else if (open) { emit(open.lo, open.hi); open = null; }
  }
  if (open) emit(open.lo, open.hi);
}

// A wall run that coincides with a railing (same line, overlapping span) is an
// open balcony edge, not a wall — subtract the railing's interval, splitting
// the wall into 0, 1, or 2 shorter runs. This is what stops an overhang from
// getting both a wall AND a railing, wherever the overhang happens to be.
export function trimWallsByRailings(walls, railings) {
  const EPS = 1e-6;
  let result = walls;
  for (const r of railings) {
    result = result.flatMap((w) => {
      if (w.axis !== r.axis || Math.abs(w.at - r.at) > EPS) return [w];
      const lo = Math.max(w.lo, r.lo), hi = Math.min(w.hi, r.hi);
      if (hi - lo <= EPS) return [w];
      const pieces = [];
      if (w.lo < lo - EPS) pieces.push({ ...w, hi: lo });
      if (hi < w.hi - EPS) pieces.push({ ...w, lo: hi });
      return pieces;
    });
  }
  return result;
}

// A post at every corner of the balcony edge, plus evenly-spaced intermediates
// so no bay exceeds maxSpan. Corners are shared between adjacent runs, so the
// dedupe collapses them to one. Each post drops from the ground to the deck.
export function placeColumns(railings, deckBaseY, maxSpan) {
  const seen = new Set(), columns = [];
  const add = (x, z) => {
    const key = `${x.toFixed(3)},${z.toFixed(3)}`;
    if (seen.has(key)) return;
    seen.add(key);
    columns.push({ x, z, height: deckBaseY });
  };
  for (const run of railings) {
    const L = run.hi - run.lo;
    const n = Math.max(1, Math.ceil(L / maxSpan));
    for (let k = 0; k <= n; k++) {
      const t = run.lo + (L * k) / n;
      run.axis === 'x' ? add(run.at, t) : add(t, run.at);
    }
  }
  return columns;
}

// Split an upper floor's cells into its grounded box and its overhang box
// (either may be null), so callers can floor the whole deck but ceiling only
// the enclosed part — an overhang is open to the sky.
export function floorFootprints(grid, gridBelow) {
  const overhang = findOverhangs(grid, gridBelow);
  const cells = occupiedCells(grid);
  const grounded = cells.filter((c) => !overhang.has(`${c.row},${c.col}`));
  const over = cells.filter((c) => overhang.has(`${c.row},${c.col}`));
  return {
    overhang,
    groundedBox: grounded.length ? boundingBox(grounded) : null,
    overhangBox: over.length ? boundingBox(over) : null,
  };
}

// A cell bounding box -> a world-space rect (matches roomRect's shape).
export function boxToRect(box, coords, cell) {
  return {
    centerX: (coords.xEdge(box.colLo) + coords.xEdge(box.colHi)) / 2,
    centerZ: (coords.zEdge(box.rowLo) + coords.zEdge(box.rowHi)) / 2,
    width: (box.colHi - box.colLo) * cell,
    depth: (box.rowHi - box.rowLo) * cell,
  };
}

// ── Roof regions: cap each column at its topmost floor, group by height ────

export function roofHeightMap(floors, overhangsByFloor) {
  const cap = new Map(); // "row,col" -> { row, col, y }
  floors.forEach((floor, fi) => {
    const overhang = overhangsByFloor[fi] ?? new Set();
    for (const { row, col } of occupiedCells(floor.grid)) {
      const key = `${row},${col}`;
      if (overhang.has(key)) { cap.delete(key); continue; } // balcony: roofless
      cap.set(key, { row, col, y: floor.topY });            // higher floor overwrites
    }
  });
  return cap;
}

export function roofRegions(cap, coords, cell) {
  const claimed = new Set();
  const at = (r, c) => cap.get(`${r},${c}`);
  const regions = [];

  const keys = [...cap.values()].sort((a, b) => a.row - b.row || a.col - b.col);
  for (const start of keys) {
    if (claimed.has(`${start.row},${start.col}`)) continue;
    const y = start.y;

    let width = 1;
    while (at(start.row, start.col + width)?.y === y &&
           !claimed.has(`${start.row},${start.col + width}`)) width++;

    const rowMatches = (r) => {
      for (let c = start.col; c < start.col + width; c++)
        if (at(r, c)?.y !== y || claimed.has(`${r},${c}`)) return false;
      return true;
    };
    let height = 1;
    while (rowMatches(start.row + height)) height++;

    for (let r = start.row; r < start.row + height; r++)
      for (let c = start.col; c < start.col + width; c++)
        claimed.add(`${r},${c}`);

    const box = {
      colLo: start.col, colHi: start.col + width,
      rowLo: start.row, rowHi: start.row + height,
    };
    const w = width * cell, d = height * cell;
    regions.push({
      baseY: y,
      rect: boxToRect(box, coords, cell),
      ridgeAxis: d >= w ? 'z' : 'x',
      gableSpan: Math.min(w, d),
      ridgeLength: Math.max(w, d),
    });
  }
  return regions;
}