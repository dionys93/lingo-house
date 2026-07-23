// web/src/components/house/CameraRig.jsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { LOCATIONS } from './locations.js';
import {
  EXTERIOR,
  EXTERIOR_CAMERA,
  TRANSITION_SPEED,
  TRANSITION_MIN_DURATION,
  TRANSITION_MAX_DURATION,
} from './constants.js';
import { transitionWaypoint } from './transitionWaypoints.js';

const MAX_FRAME_DELTA = 0.1;
const CURVE_ALPHA = 0.5;
const CURVE_SAMPLES_PER_SPAN = 60;

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}
function lerpArray(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const range = (n) => Array.from({ length: n }, (_, i) => i);
const adjacentPairs = (items) =>
  range(Math.max(0, items.length - 1)).map((i) => [items[i], items[i + 1]]);

function catmullRomPoint(p0, p1, p2, p3, t) {
  const knot = (ti, pi, pj) => ti + Math.pow(distance(pi, pj), CURVE_ALPHA);
  const t0 = 0;
  const t1 = knot(t0, p0, p1);
  const t2 = knot(t1, p1, p2);
  const t3 = knot(t2, p2, p3);
  if (t1 === t0 || t2 === t1 || t3 === t2) return p1;

  const tt = t1 + t * (t2 - t1);
  const between = (a, b, ta, tb) =>
    a.map((v, i) => ((tb - tt) / (tb - ta)) * v + ((tt - ta) / (tb - ta)) * b[i]);

  const a1 = between(p0, p1, t0, t1);
  const a2 = between(p1, p2, t1, t2);
  const a3 = between(p2, p3, t2, t3);
  const b1 = a1.map((v, i) => ((t2 - tt) / (t2 - t0)) * v + ((tt - t0) / (t2 - t0)) * a2[i]);
  const b2 = a2.map((v, i) => ((t3 - tt) / (t3 - t1)) * v + ((tt - t1) / (t3 - t1)) * a3[i]);
  return b1.map((v, i) => ((t2 - tt) / (t2 - t1)) * v + ((tt - t1) / (t2 - t1)) * b2[i]);
}

function sampleCurve(points) {
  if (points.length < 3) return points;
  const head = points[0].map((v, i) => 2 * v - points[1][i]);
  const tail = points[points.length - 1].map((v, i) => 2 * v - points[points.length - 2][i]);
  const padded = [head, ...points, tail];

  const spans = range(padded.length - 3);
  const fractions = range(CURVE_SAMPLES_PER_SPAN).map((i) => i / CURVE_SAMPLES_PER_SPAN);
  return [
    ...spans.flatMap((s) =>
      fractions.map((f) =>
        catmullRomPoint(padded[s], padded[s + 1], padded[s + 2], padded[s + 3], f)
      )
    ),
    points[points.length - 1],
  ];
}

function pointAtDistance(segments, travelled) {
  let remaining = travelled;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      return lerpArray(segment.from, segment.to, remaining / segment.length);
    }
    remaining -= segment.length;
  }
  return segments[segments.length - 1].to;
}

export function CameraRig({ fromLocation, transitionTarget, controlsRef, onArrived }) {
  const flight = useRef(null);

  useFrame(({ camera }, delta) => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (!transitionTarget) {
      flight.current = null;
      return;
    }

    if (!flight.current || flight.current.destination !== transitionTarget) {
      const destination = transitionTarget === EXTERIOR ? EXTERIOR_CAMERA : LOCATIONS[transitionTarget].camera;
      // A stair returns two waypoints (bottom, top); a door returns one; both
      // arrive as a `positions` array we splice into the corner list in order.
      const wp = transitionWaypoint(fromLocation, transitionTarget);
      const corners = [
        [camera.position.x, camera.position.y, camera.position.z],
        ...(wp ? wp.positions : []),
        destination.position,
      ];
      const curve = sampleCurve(corners);

      const built = adjacentPairs(curve)
        .map(([from, to]) => ({ from, to, length: distance(from, to) }))
        .filter((segment) => segment.length > 0);

      const segments = built.length > 0
        ? built
        : [{ from: destination.position, to: destination.position, length: Number.EPSILON }];
      const totalLength = segments.reduce((sum, s) => sum + s.length, 0);

      flight.current = {
        destination: transitionTarget,
        segments,
        totalLength,
        fromTarget: [controls.target.x, controls.target.y, controls.target.z],
        toTarget: destination.target,
        duration: Math.min(
          TRANSITION_MAX_DURATION,
          Math.max(TRANSITION_MIN_DURATION, totalLength / TRANSITION_SPEED)
        ),
        elapsed: 0,
        done: false,
      };
    }

    const f = flight.current;
    if (f.done) return;

    f.elapsed += Math.min(delta, MAX_FRAME_DELTA);
    const progress = Math.min(1, f.elapsed / f.duration);
    const eased = easeInOut(progress);

    const position = pointAtDistance(f.segments, eased * f.totalLength);
    camera.position.set(position[0], position[1], position[2]);

    const target = lerpArray(f.fromTarget, f.toTarget, eased);
    controls.target.set(target[0], target[1], target[2]);
    controls.update();

    if (progress >= 1) {
      f.done = true;
      onArrived(transitionTarget);
    }
  });

  return null;
}