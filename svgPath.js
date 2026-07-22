// web/src/utils/svgPath.js

// The canvas / viewBox is a fixed square used throughout the glyph
// designer — the <svg> element, its viewBox, and all coordinate math
// share this one constant instead of a repeated magic number.
export const CANVAS_SIZE = 500;

const PATH_COMMAND_REGEX = /([MLQCZmlqczA])([^MLQCZmlqczA]*)/g;

function parseArgs(argsString) {
  return argsString.trim().split(/\s+|,/).filter(n => n !== '').map(Number);
}

// SVG arc commands ("A") pack 7 numbers per point: rx ry x-axis-rotation
// large-arc-flag sweep-flag x y — only the last two are a coordinate we
// ever read or move. Every other command (M L Q C) is a flat sequence of
// (x, y) pairs, including curve control points. This returns the indices
// into `nums` where an x-coordinate starts (its y is always the next slot).
function getXIndices(command, argCount) {
  const isArc = command.toUpperCase() === 'A';
  const stride = isArc ? 7 : 2;
  const xRemainder = isArc ? 5 : 0;
  const indices = [];
  for (let i = 0; i < argCount; i++) {
    if (i % stride === xRemainder && argCount > i + 1) indices.push(i);
  }
  return indices;
}

/** Extracts every (x, y) coordinate from an SVG path's `d` string. */
export function extractCoordinates(pathString) {
  const matches = pathString.match(PATH_COMMAND_REGEX) || [];
  return matches
    .filter(match => match[0].toUpperCase() !== 'Z')
    .flatMap(match => {
      const command = match[0];
      const nums = parseArgs(match.slice(1));
      return getXIndices(command, nums.length).map(i => ({ x: nums[i], y: nums[i + 1] }));
    });
}

// Rewrites every (x, y) coordinate in a path via transformPoint(x, y) => {x, y}.
// translatePath and bakeTransform are both just different transformPoint functions
// over this one rewrite pass.
function mapPathCoordinates(pathString, transformPoint) {
  return pathString
    .replace(PATH_COMMAND_REGEX, (_, command, argsString) => {
      if (command.toUpperCase() === 'Z') return command;
      const nums = parseArgs(argsString);
      if (nums.length === 0) return command;
      const xIndices = new Set(getXIndices(command, nums.length));
      const out = nums.map((num, i) => {
        if (xIndices.has(i)) return transformPoint(num, nums[i + 1]).x;
        if (xIndices.has(i - 1)) return transformPoint(nums[i - 1], num).y;
        return num;
      });
      return `${command} ${out.join(' ')} `;
    })
    .trim();
}

/** Shifts every coordinate in a path by (dx, dy). */
export function translatePath(pathString, dx, dy) {
  return mapPathCoordinates(pathString, (x, y) => ({ x: x + dx, y: y + dy }));
}

/**
 * Bakes a scale-around-(cx, cy)-then-translate transform directly into a
 * path's coordinates, producing a plain `d` string — no SVG `transform`
 * attribute needed. Used when exporting a glyph, since the saved path
 * should be self-contained.
 */
export function bakeTransform(pathString, { tx, ty, scaleX, scaleY, cx, cy }) {
  return mapPathCoordinates(pathString, (x, y) => ({
    x: (x - cx) * scaleX + cx + tx,
    y: (y - cy) * scaleY + cy + ty,
  }));
}

/** Axis-aligned bounding box (plus center and size) across a set of paths. */
export function getBoundingBox(paths) {
  const coords = paths.flatMap(extractCoordinates);
  if (coords.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, cx: CANVAS_SIZE / 2, cy: CANVAS_SIZE / 2, w: 0, h: 0 };
  }
  const xs = coords.map(c => c.x);
  const ys = coords.map(c => c.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

/** Converts a pointer event's client coordinates into the SVG's local coordinate space. */
export function clientToSVG(svgEl, clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * CANVAS_SIZE,
    y: ((clientY - rect.top) / rect.height) * CANVAS_SIZE,
  };
}

/** Builds the SVG `transform` attribute string for a glyph entry's transform object. */
export function svgTransformAttr({ tx, ty, scaleX, scaleY, cx, cy }) {
  return `translate(${cx + tx}, ${cy + ty}) scale(${scaleX}, ${scaleY}) translate(${-cx}, ${-cy})`;
}

/** Computes a glyph entry's on-screen bounding box after its transform is applied. */
export function transformedBBox(entry) {
  const { minX, minY, maxX, maxY } = getBoundingBox(entry.paths);
  const { tx, ty, scaleX, scaleY, cx, cy } = entry.transform;
  const pts = [
    { x: minX, y: minY }, { x: maxX, y: minY },
    { x: maxX, y: maxY }, { x: minX, y: maxY },
  ].map(p => ({
    x: (p.x - cx) * scaleX + cx + tx,
    y: (p.y - cy) * scaleY + cy + ty,
  }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}