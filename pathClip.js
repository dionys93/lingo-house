// web/src/utils/pathClip.js
//
// Geometry engine for the "erase area" tool: subtracting a rectangle from
// vector shapes. Filled glyph paths (closed, evenodd) are handled as a true
// boolean difference; open pen strokes are handled as polyline splitting,
// since a stroke isn't a filled region to begin with.
//
// Curves and arcs are flattened to straight-line segments before any of this
// runs — there's no general bezier/arc-vs-rectangle boolean-clip in vanilla
// JS without a full polygon library, so this trades a small amount of
// curve fidelity (only on paths an erase actually touches) for a
// self-contained implementation with no new dependencies.

const DEFAULT_CURVE_STEPS = 32;

// Large fixed world bounds so erasing near the edge of the visible canvas
// never clips away geometry that's merely positioned off-screen.
export const WORLD_BOUNDS = { minX: -10000, minY: -10000, maxX: 10000, maxY: 10000 };

const CMD_REGEX = /([MLQCZmlqczA])([^MLQCZmlqczA]*)/g;

function parseNums(s) {
  return s.trim().split(/\s+|,/).filter(Boolean).map(Number);
}

function quadPoint(p0, p1, p2, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

function cubicPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y,
  };
}

// SVG elliptical-arc endpoint-to-center parameterization (per the SVG spec's
// arc implementation notes), sampled into `steps` points from (exclusive)
// start to (inclusive) end. Verified against known circle arcs.
function arcToPoints(p0, rx, ry, xRotDeg, largeArc, sweep, p1, steps) {
  if (rx === 0 || ry === 0) return [p1];

  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = ((xRotDeg % 360) * Math.PI) / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);

  const dx2 = (p0.x - p1.x) / 2;
  const dy2 = (p0.y - p1.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  let rxSq = rx * rx, rySq = ry * ry;
  const x1pSq = x1p * x1p, y1pSq = y1p * y1p;

  const lambda = x1pSq / rxSq + y1pSq / rySq;
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s; ry *= s;
    rxSq = rx * rx; rySq = ry * ry;
  }

  const sign = largeArc !== sweep ? 1 : -1;
  const num = rxSq * rySq - rxSq * y1pSq - rySq * x1pSq;
  const den = rxSq * y1pSq + rySq * x1pSq;
  const co = sign * Math.sqrt(Math.max(0, num / den || 0));
  const cxp = co * ((rx * y1p) / ry);
  const cyp = co * ((-ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (p0.x + p1.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0.y + p1.y) / 2;

  const angleBetween = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };

  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  const points = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const theta = theta1 + t * dTheta;
    points.push({
      x: cx + rx * Math.cos(phi) * Math.cos(theta) - ry * Math.sin(phi) * Math.sin(theta),
      y: cy + rx * Math.sin(phi) * Math.cos(theta) + ry * Math.cos(phi) * Math.sin(theta),
    });
  }
  return points;
}

// Walks an SVG path `d` string, tracking current point / subpath start so
// relative (lowercase) commands resolve correctly, and subdividing curves
// and arcs into line segments. Returns [{ points: [{x,y}...], closed }].
function flattenPathToSubpaths(d, { curveSteps = DEFAULT_CURVE_STEPS } = {}) {
  const matches = d.match(CMD_REGEX) || [];
  const subpaths = [];
  let current = null;
  let cur = { x: 0, y: 0 };
  let subpathStart = { x: 0, y: 0 };

  for (const match of matches) {
    const cmd = match[0];
    const isRelative = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();
    const nums = parseNums(match.slice(1));

    if (upper === 'Z') {
      if (current) {
        current.closed = true;
        cur = { ...subpathStart };
      }
      continue;
    }

    if (upper === 'M') {
      // First pair starts a new subpath; subsequent pairs are implicit
      // lineto's per the SVG spec.
      for (let i = 0; i + 1 < nums.length; i += 2) {
        let x = nums[i], y = nums[i + 1];
        if (isRelative) { x += cur.x; y += cur.y; }
        if (i === 0) {
          current = { points: [{ x, y }], closed: false };
          subpaths.push(current);
          subpathStart = { x, y };
        } else {
          current.points.push({ x, y });
        }
        cur = { x, y };
      }
      continue;
    }

    if (!current) {
      // Malformed path (drawing command before any M) — start an implicit
      // subpath at the origin rather than throwing.
      current = { points: [{ x: cur.x, y: cur.y }], closed: false };
      subpaths.push(current);
      subpathStart = { ...cur };
    }

    if (upper === 'L') {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        let x = nums[i], y = nums[i + 1];
        if (isRelative) { x += cur.x; y += cur.y; }
        current.points.push({ x, y });
        cur = { x, y };
      }
    } else if (upper === 'Q') {
      for (let i = 0; i + 3 < nums.length; i += 4) {
        let cx1 = nums[i], cy1 = nums[i + 1], x = nums[i + 2], y = nums[i + 3];
        if (isRelative) { cx1 += cur.x; cy1 += cur.y; x += cur.x; y += cur.y; }
        const p0 = cur, p1 = { x: cx1, y: cy1 }, p2 = { x, y };
        for (let s = 1; s <= curveSteps; s++) current.points.push(quadPoint(p0, p1, p2, s / curveSteps));
        cur = { x, y };
      }
    } else if (upper === 'C') {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        let cx1 = nums[i], cy1 = nums[i + 1], cx2 = nums[i + 2], cy2 = nums[i + 3], x = nums[i + 4], y = nums[i + 5];
        if (isRelative) { cx1 += cur.x; cy1 += cur.y; cx2 += cur.x; cy2 += cur.y; x += cur.x; y += cur.y; }
        const p0 = cur, p1 = { x: cx1, y: cy1 }, p2 = { x: cx2, y: cy2 }, p3 = { x, y };
        for (let s = 1; s <= curveSteps; s++) current.points.push(cubicPoint(p0, p1, p2, p3, s / curveSteps));
        cur = { x, y };
      }
    } else if (upper === 'A') {
      for (let i = 0; i + 6 < nums.length; i += 7) {
        let rx = nums[i], ry = nums[i + 1], rot = nums[i + 2], laf = nums[i + 3], sf = nums[i + 4], x = nums[i + 5], y = nums[i + 6];
        if (isRelative) { x += cur.x; y += cur.y; }
        const pts = arcToPoints(cur, rx, ry, rot, laf !== 0, sf !== 0, { x, y }, curveSteps);
        for (const pt of pts) current.points.push(pt);
        cur = { x, y };
      }
    }
  }

  return subpaths;
}

// Fill rings for boolean-subtraction purposes: every subpath is treated as
// closed regardless of an explicit Z, matching how SVG actually fills paths
// (an unclosed subpath is auto-closed for fill, just not for its stroke).
export function flattenToFillRings(d, opts) {
  return flattenPathToSubpaths(d, opts).map(sp => sp.points).filter(pts => pts.length >= 3);
}

// Open polylines for stroke-splitting purposes — no auto-close.
export function flattenToPolylines(d, opts) {
  return flattenPathToSubpaths(d, opts).map(sp => sp.points).filter(pts => pts.length >= 2);
}

// --- Sutherland-Hodgman: clip a (implicitly closed) polygon to an AABB ---
function intersectVertical(a, b, x) {
  const t = (x - a.x) / (b.x - a.x);
  return { x, y: a.y + t * (b.y - a.y) };
}
function intersectHorizontal(a, b, y) {
  const t = (y - a.y) / (b.y - a.y);
  return { x: a.x + t * (b.x - a.x), y };
}

export function clipRingToRect(points, rect) {
  if (points.length === 0) return [];

  const edges = [
    { inside: p => p.x >= rect.minX, cross: (a, b) => intersectVertical(a, b, rect.minX) },
    { inside: p => p.x <= rect.maxX, cross: (a, b) => intersectVertical(a, b, rect.maxX) },
    { inside: p => p.y >= rect.minY, cross: (a, b) => intersectHorizontal(a, b, rect.minY) },
    { inside: p => p.y <= rect.maxY, cross: (a, b) => intersectHorizontal(a, b, rect.maxY) },
  ];

  let output = points;
  for (const edge of edges) {
    if (output.length === 0) break;
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const curr = input[i];
      const prev = input[(i - 1 + input.length) % input.length];
      const currIn = edge.inside(curr);
      const prevIn = edge.inside(prev);
      if (currIn) {
        if (!prevIn) output.push(edge.cross(prev, curr));
        output.push(curr);
      } else if (prevIn) {
        output.push(edge.cross(prev, curr));
      }
    }
  }
  return output;
}

export function rectsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function normalizeRect(box) {
  return {
    minX: Math.min(box.x0, box.x1),
    minY: Math.min(box.y0, box.y1),
    maxX: Math.max(box.x0, box.x1),
    maxY: Math.max(box.y0, box.y1),
  };
}

/**
 * Subtracts eraseRect from a set of fill rings by tiling (bounds - eraseRect)
 * into up to 4 non-overlapping rectangles and clipping every ring against
 * each one independently. Because those 4 regions never overlap,
 * concatenating their clip results reconstructs the correct evenodd-filled
 * remainder without needing a general polygon-union algorithm — verified
 * against a reference evenodd point-sampler across squares, an annulus
 * (existing hole), a concave L-shape, and corner/edge-only overlaps.
 */
export function subtractRectFromRings(rings, eraseRect, bounds = WORLD_BOUNDS) {
  const strips = [];
  if (eraseRect.minY > bounds.minY) {
    strips.push({ minX: bounds.minX, minY: bounds.minY, maxX: bounds.maxX, maxY: eraseRect.minY });
  }
  if (eraseRect.maxY < bounds.maxY) {
    strips.push({ minX: bounds.minX, minY: eraseRect.maxY, maxX: bounds.maxX, maxY: bounds.maxY });
  }
  if (eraseRect.minX > bounds.minX) {
    strips.push({ minX: bounds.minX, minY: eraseRect.minY, maxX: eraseRect.minX, maxY: eraseRect.maxY });
  }
  if (eraseRect.maxX < bounds.maxX) {
    strips.push({ minX: eraseRect.maxX, minY: eraseRect.minY, maxX: bounds.maxX, maxY: eraseRect.maxY });
  }

  const result = [];
  for (const ring of rings) {
    for (const strip of strips) {
      const clipped = clipRingToRect(ring, strip);
      if (clipped.length >= 3) result.push(clipped);
    }
  }
  return result;
}

function ringToPathD(ring) {
  const [first, ...rest] = ring;
  return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(' ') + ' Z';
}
export function ringsToPathD(rings) {
  return rings.map(ringToPathD).join(' ');
}

// --- Open-polyline "keep outside the rect" clipping (for pen strokes) ---
function isPointInRect(p, rect) {
  return p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY;
}

// Liang-Barsky: returns [t0, t1] in [0,1], the portion of segment p0->p1
// that lies INSIDE rect, or null if the segment never enters it.
function segmentInsideInterval(p0, p1, rect) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  let t0 = 0, t1 = 1;
  const checks = [
    [-dx, p0.x - rect.minX],
    [dx, rect.maxX - p0.x],
    [-dy, p0.y - rect.minY],
    [dy, rect.maxY - p0.y],
  ];
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  if (t0 > t1) return null;
  return [t0, t1];
}

function lerp(p0, p1, t) {
  return { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) };
}

/**
 * Splits an open polyline into the runs that survive outside eraseRect,
 * breaking the line wherever it enters/exits the rectangle. A stroke that's
 * fully inside the rect vanishes entirely (returns []); a stroke untouched
 * by it comes back as a single run equal to the input.
 */
export function subtractRectFromPolyline(points, rect) {
  if (points.length === 0) return [];
  if (points.length === 1) return isPointInRect(points[0], rect) ? [] : [points];

  const runs = [];
  let current = [];

  const pushPoint = (pt) => {
    const last = current[current.length - 1];
    if (!last || last.x !== pt.x || last.y !== pt.y) current.push(pt);
  };
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  if (!isPointInRect(points[0], rect)) pushPoint(points[0]);

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const interval = segmentInsideInterval(p0, p1, rect);

    if (!interval) {
      pushPoint(p1);
      continue;
    }

    const [t0, t1] = interval;
    if (t0 > 0) pushPoint(lerp(p0, p1, t0));
    flush();

    if (t1 < 1) {
      current = [lerp(p0, p1, t1)];
      pushPoint(p1);
    } else {
      current = [];
    }
  }
  flush();
  return runs;
}

export function polylineToPathD(points) {
  const [first, ...rest] = points;
  return `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(' ');
}

// --- Public, entry-level operations used by the component ---

/** Erases eraseRect from a glyph entry's (already transform-baked, absolute-coordinate) fill paths. */
export function eraseRectFromGlyphPaths(paths, eraseRect, curveSteps = DEFAULT_CURVE_STEPS) {
  const survivingPaths = [];
  for (const d of paths) {
    const rings = flattenToFillRings(d, { curveSteps });
    const clipped = subtractRectFromRings(rings, eraseRect);
    if (clipped.length > 0) survivingPaths.push(ringsToPathD(clipped));
  }
  return survivingPaths;
}

/** Erases eraseRect from a stroke entry's `d`, returning 0+ new stroke `d` strings. */
export function eraseRectFromStroke(d, eraseRect, curveSteps = DEFAULT_CURVE_STEPS) {
  const polylines = flattenToPolylines(d, { curveSteps });
  return polylines.flatMap(pts => subtractRectFromPolyline(pts, eraseRect)).map(polylineToPathD);
}