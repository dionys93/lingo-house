// web/src/components/house/constants.js
import { GROUND_FLOOR, SECOND_STOREY, DOORS, STAIRS, ITEMS, CELL } from './rooms.js';
import { isRoom } from './blocks.js';
import { WALL_HEIGHT } from './roofGeometry.js';
import { EXTERIOR } from './grid-shared.js';
import {
  makeGrid, readRooms, measureGrid, makeCoords,
  findFootprints, findWalls, buildNavigation, placeDoorways, placeItems, placeStairs,
  findRailings, trimWallsByRailings, placeColumns, floorFootprints, boxToRect,
  roofHeightMap, roofRegions,
} from './grid-engine.js';

export { CELL, DOORS, ITEMS, WALL_HEIGHT, EXTERIOR };

// ── House-wide dimensions ─────────────────────────────────────────────────
export const DOOR_WIDTH = 0.4;
export const DOOR_HEIGHT = 0.75;
export const WALL_THICKNESS = 0.05;
export const GROUND_SIZE = 30;
export const GROUND_THICKNESS = 0.3;
export const LERP_SPEED = 0.08;

const FRONT_WALL_Z_TARGET = 1.25;

// ── Floors: run the engine per floor on ONE shared coordinate frame ────────
const grid = makeGrid(GROUND_FLOOR, isRoom);
const coords = makeCoords(CELL, measureGrid(grid, CELL, FRONT_WALL_Z_TARGET));
const upperGrid = makeGrid(SECOND_STOREY, isRoom);

const FLOOR_HEIGHT = WALL_HEIGHT;
const FLOORS = [
  { level: 0, grid,            baseY: 0 },
  { level: 1, grid: upperGrid, baseY: WALL_HEIGHT },
];
const floorBaseY = (level) => (level <= 0 ? 0 : level * FLOOR_HEIGHT);

const roomLevel = new Map();
FLOORS.forEach((f) => readRooms(f.grid).forEach((r) => roomLevel.set(r.id, f.level)));
const roomFloor = (id) => roomLevel.get(id) ?? 0;

const rooms = FLOORS.flatMap((f) => readRooms(f.grid));
const groundFootprints = findFootprints(grid);
const footprints = new Map([...groundFootprints, ...findFootprints(upperGrid)]);

const groundWalls = findWalls(grid, coords);
const upstairsFP = floorFootprints(upperGrid, grid);
const upperRailings = findRailings(upperGrid, upstairsFP.overhang, coords);
const upperWalls = trimWallsByRailings(findWalls(upperGrid, coords), upperRailings);
const allWalls = [...groundWalls, ...upperWalls];

const nav = buildNavigation(DOORS, STAIRS, rooms);
const doorways = placeDoorways(DOORS, allWalls, nav, CELL, DOOR_WIDTH);
const stairs = placeStairs(STAIRS, footprints, roomFloor, coords, CELL, FLOOR_HEIGHT);
const doorwayRuns = new Set(doorways.map((d) => d.run));

// ── Rooms ─────────────────────────────────────────────────────────────────
export const ROOMS = rooms;
const roomsById = new Map(rooms.map((r) => [r.id, r]));
export const roomById = (id) => roomsById.get(id);
export const roomFloorLevel = roomFloor;

export function roomRect(id) {
  const box = footprints.get(id);
  if (!box) return undefined;
  return {
    centerX: (coords.xEdge(box.colLo) + coords.xEdge(box.colHi)) / 2,
    centerZ: (coords.zEdge(box.rowLo) + coords.zEdge(box.rowHi)) / 2,
    width: (box.colHi - box.colLo) * CELL,
    depth: (box.rowHi - box.rowLo) * CELL,
    baseY: floorBaseY(roomFloor(id)),
  };
}

// ── Walls, doorways, stairs ───────────────────────────────────────────────
export const DOORWAYS = doorways.map((d) => ({
  ...d, level: roomFloor(d.child), baseY: floorBaseY(roomFloor(d.child)),
}));
export const STAIRWAYS = stairs;
export const roomDoorway = (id) => doorways.find((d) => d.child === id);
export const roomStair = (id) => stairs.find((s) => s.child === id);
export const SOLID_WALL_RUNS = groundWalls.filter((run) => !doorwayRuns.has(run));
const upperSolidWalls = upperWalls.filter((run) => !doorwayRuns.has(run));

// Stair holes in an upper room's floor slab (world rects), for cutting the floor.
export const stairHolesFor = (roomId) =>
  stairs.filter((s) => s.upper === roomId).map((s) => boxToRect(s.footprintBox, coords, CELL));

export function sideColor(spaceId, colors) {
  // The balcony is really outdoors, so walls facing it wear house siding, not
  // an interior liner — matching the exterior.
  if (spaceId === EXTERIOR || spaceId === 'balcony') return colors.wall;
  return roomsById.get(spaceId)?.interiorWallColor ?? colors.wall;
}

// ── Second storey bundle ──────────────────────────────────────────────────
export const UPSTAIRS = {
  baseY: WALL_HEIGHT,
  ceilingColor: roomById('bedroom')?.interiorWallColor,
  roomRect: upstairsFP.groundedBox && boxToRect(upstairsFP.groundedBox, coords, CELL),
  balconyRect: upstairsFP.overhangBox && boxToRect(upstairsFP.overhangBox, coords, CELL),
  walls: upperSolidWalls,
  railings: upperRailings,
};
export const UPSTAIRS_COLUMNS = placeColumns(upperRailings, WALL_HEIGHT, 2 * CELL);

// ── Navigation re-exports ─────────────────────────────────────────────────
export const parentOf = nav.parentOf;
export const pathTo = nav.pathTo;
export const areAdjacent = nav.areAdjacent;
export const depthOf = nav.depthOf;

// ── Roof extents (GROUND footprints only) ─────────────────────────────────
export const ROOT_ID = doorways.find((d) => d.isExterior).child;

const footprintBox = [...groundFootprints.values()].reduce(
  (box, b) => ({
    colLo: Math.min(box.colLo, b.colLo), colHi: Math.max(box.colHi, b.colHi),
    rowLo: Math.min(box.rowLo, b.rowLo), rowHi: Math.max(box.rowHi, b.rowHi),
  }),
  { colLo: Infinity, colHi: -Infinity, rowLo: Infinity, rowHi: -Infinity }
);

export const HOUSE_LEFT_X = coords.xEdge(footprintBox.colLo);
export const HOUSE_RIGHT_X = coords.xEdge(footprintBox.colHi);
export const FRONT_WALL_Z = coords.zEdge(footprintBox.rowHi);
export const HOUSE_BACK_Z = coords.zEdge(footprintBox.rowLo);
export const HOUSE_CENTER_X = (HOUSE_LEFT_X + HOUSE_RIGHT_X) / 2;
export const HOUSE_CENTER_Z = (FRONT_WALL_Z + HOUSE_BACK_Z) / 2;

const houseWidth = HOUSE_RIGHT_X - HOUSE_LEFT_X;
const houseDepth = FRONT_WALL_Z - HOUSE_BACK_Z;
export const RIDGE_AXIS = houseDepth >= houseWidth ? 'z' : 'x';
export const GABLE_SPAN = Math.min(houseWidth, houseDepth);
export const RIDGE_LENGTH = Math.max(houseWidth, houseDepth);
export const MAIN_COLUMN_WIDTH = houseWidth;

// ── Items ─────────────────────────────────────────────────────────────────
export const PLACED_ITEMS = placeItems(ITEMS, roomRect);

// ── Camera ────────────────────────────────────────────────────────────────
export const CAMERA_EYE_HEIGHT = 0.75;
export const DOORWAY_CLEARANCE = 0.15;
export const DOORWAY_WAYPOINT_Y = DOOR_HEIGHT - DOORWAY_CLEARANCE;

export const EXTERIOR_CAMERA = { position: [5.5, 3.5, 8], target: [0.5, 0, -0.5] };
export const EXTERIOR_MIN_DISTANCE = 4;
export const EXTERIOR_MAX_DISTANCE = 16;
export const INTERIOR_MIN_DISTANCE = 0.3;
export const INTERIOR_MAX_DISTANCE = 3.5;
export const ROOM_BOUNDS_MARGIN = 0.15;

export const TRANSITION_SPEED = 4.5;
export const TRANSITION_MIN_DURATION = 1.8;
export const TRANSITION_MAX_DURATION = 2.2;

// ── Roof regions ──────────────────────────────────────────────────────────
const floorsForRoof = [
  { grid, topY: 0 },
  { grid: upperGrid, topY: UPSTAIRS.baseY },
];
const overhangsForRoof = [new Set(), upstairsFP.overhang];
const roofCap = roofHeightMap(floorsForRoof, overhangsForRoof);
export const ROOF_REGIONS = roofRegions(roofCap, coords, CELL);