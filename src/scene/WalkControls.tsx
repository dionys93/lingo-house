// src/scene/WalkControls.tsx
//
// Keyboard → movement → camera. The imperative shell around core/collide.ts:
// this file owns the clock, the DOM and the camera object, and nothing else.
// The rule for where you end up lives in `slide`, which has no idea any of those
// exist.
//
// The camera is driven IMPERATIVELY, and that is not a shortcut. R3F applies
// <Canvas camera={…}> once, on mount, and ignores it afterwards — the prop is
// not reactive. Slice 1 changed that prop when you pressed an arrow key, the
// state updated, the label under the scene updated, and the camera never moved.
// That is the bug you just hit. Anything that moves a camera every frame has to
// write to the camera object, not re-render a prop at it.
//
// Position lives in refs rather than state for the same reason: this updates at
// 60Hz and React does not need to know. Nothing renders from it.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { slide, type Segment2, type Vec2 } from '../core/collide';
import type { Stance } from '../core/walk';

/**
 * Eye height in world units. 1 unit = 2m.
 *
 * 0.65 = 1.3m, down a foot from the 0.8 (1.6m adult) this started at. That's
 * roughly a ten-year-old's eye line, which suits a house you're learning the
 * words for — and it buys back some of the tightness of a 6m plan, since a
 * lower viewpoint puts more ceiling in frame and makes a small room read larger.
 */
export const EYE = 0.65;

/** ~1.4 m/s, a walk rather than a jog. */
export const WALK_SPEED = 0.7;

/** Radians per second when turning with the arrow keys. A full turn takes ~2.6s. */
export const TURN_SPEED = 2.4;

/**
 * Drag speed, matching drei's OrbitControls `rotateSpeed` — 1 means a drag of
 * one full viewport height sweeps 2π. Raise it for a twitchier house.
 */
export const ROTATE_SPEED = 1;

/**
 * How far the pointer may travel and still count as a click.
 *
 * DRAG-TO-LOOK, not pointer lock, and the reason is the whole click model.
 * Pointer lock hides the cursor, which means every click has to be aimed with a
 * centre reticle — and clicking a named door is how this app teaches you the
 * word for door. Dragging keeps the cursor, so looking around and clicking
 * things stay two separate gestures on the same button. It's also how the orbit
 * view already behaves, so the house doesn't change its handling when you step
 * inside it.
 *
 * The cost is this threshold: R3F fires onClick whenever pointerdown and
 * pointerup land on the same object, with no notion of a drag in between, so a
 * look-drag that starts and ends over a door would open it. Past this many
 * pixels the click is swallowed in the capture phase before R3F sees it.
 */
const CLICK_SLOP_PX = 5;

/** Just short of straight up/down. At exactly ±90° yaw and pitch degenerate. */
const MAX_PITCH = Math.PI / 2 - 0.05;

/**
 * Body radius, ~36cm across at 1 unit = 2m.
 *
 * A circle rather than a point: a point squeezes through the zero-width gap
 * where two wall segments meet at a corner, which is how you end up outside a
 * sealed house.
 */
export const BODY_RADIUS = 0.18;

/**
 * Longest timestep we will integrate.
 *
 * A backgrounded tab resuming hands you a `delta` of several seconds. `slide`
 * handles it honestly — it refuses to tunnel — but the result is a lurch across
 * the room into the first wall. Clamping turns that into one slow frame.
 */
const MAX_DT = 0.05;

const HELD = new Set<string>();

/**
 * Seconds for a stair climb.
 *
 * Was 1.1, which read as a jump cut rather than a journey — a storey is 2.4m of
 * rise and 3m of run, so 1.1s is about 3.5 m/s, five times a walking pace. 2.4
 * is still generous against the ~4s it would take on foot, but it lets the
 * treads pass under you instead of past you.
 */
const CLIMB_SECONDS = 2.4;

/** Smoothstep — eases both ends, so a climb doesn't start or stop with a jolt. */
const ease = (t: number): number => t * t * (3 - 2 * t);

export function WalkControls({
  blockers,
  start,
  startYaw = 0,
  level,
  baseYOf,
  climbTo = null,
  climbVia = null,
  onArrived,
  onMoved,
}: {
  blockers: readonly Segment2[];
  start: Vec2;
  startYaw?: number;
  /** Which storey you're on. */
  level: number;
  /** Floor height of a level. Passed in rather than imported: only the shell has
   *  the compiled house, and this file's job is to be told, not to look things up. */
  baseYOf: (level: number) => number;
  /** Non-null hands the camera over: input is ignored until the climb lands. */
  climbTo?: Stance | null;
  /** The near end of the flight — walked to first, so leg 2 runs ALONG the stair. */
  climbVia?: Stance | null;
  onArrived?: () => void;
  /** Called only when the position actually changes, not every frame. */
  onMoved?: (pos: Vec2) => void;
}) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const pos = useRef<Vec2>(start);
  const yaw = useRef(startYaw);
  const pitch = useRef(0);
  // A climb is animated here rather than in a reducer: it's a camera movement,
  // and the camera has never been React's to hold.
  const climb = useRef<{
    readonly legs: readonly { from: Stance; to: Stance; secs: number }[];
    leg: number;
    t: number;
  } | null>(null);
  const lastReported = useRef<Vec2>(start);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Arrows scroll the page otherwise, which fights the movement.
      if (e.key.startsWith('Arrow')) e.preventDefault();
      HELD.add(e.key);
    };
    const up = (e: KeyboardEvent) => HELD.delete(e.key);
    // Held keys survive a tab switch as phantom input — you come back walking.
    const clear = () => HELD.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      HELD.clear();
    };
  }, []);

  // Mouse-look. Lives here rather than in its own component because this is the
  // one place that owns camera orientation; splitting yaw across two owners is
  // how they drift apart.
  useEffect(() => {
    let dragging = false;
    let travelled = 0;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      travelled = 0;
      lastX = e.clientX;
      lastY = e.clientY;
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      travelled += Math.abs(dx) + Math.abs(dy);
      if (travelled > CLICK_SLOP_PX) dom.style.cursor = 'grabbing';

      // OrbitControls' exact formula: 2π per viewport height, normalised by
      // HEIGHT on both axes so a diagonal drag doesn't skew on a wide window.
      const k = (2 * Math.PI * ROTATE_SPEED) / dom.clientHeight;

      // THE TWO AXES HAVE OPPOSITE SIGNS. That is not a mistake, and assuming
      // they must match is what got this wrong twice. OrbitControls moves a
      // camera in spherical coordinates around a target, and theta and phi do
      // not map onto a first-person yaw and pitch the same way:
      //
      //   drag RIGHT -> theta decreases -> the camera slides to its own left
      //                 -> the world appears to move RIGHT
      //                 -> first-person: turn LEFT, and positive yaw is left.
      //                    yaw += dx
      //
      //   drag DOWN  -> phi decreases -> the camera RISES above the target
      //                 -> you look down and see more of the model's top
      //                 -> first-person: pitch DOWN, and positive pitch is up.
      //                    pitch -= dy
      //
      // Horizontal inverts because the WORLD moves opposite to the camera;
      // vertical doesn't because rising and looking down are the same gesture.
      yaw.current += dx * k;
      pitch.current = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch.current - dy * k));
    };

    const onUp = () => {
      dragging = false;
      dom.style.cursor = 'auto';
    };

    // CAPTURE phase, on the canvas's parent: this runs before R3F's own listener
    // on the canvas itself, so stopping here means R3F never raises the click at
    // all. Doing it any later and the door has already opened.
    const swallowDragClick = (e: MouseEvent) => {
      if (travelled > CLICK_SLOP_PX) {
        e.stopPropagation();
        travelled = 0;
      }
    };

    dom.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    dom.parentElement?.addEventListener('click', swallowDragClick, true);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      dom.parentElement?.removeEventListener('click', swallowDragClick, true);
      dom.style.cursor = 'auto';
    };
  }, [dom]);

  // Latch a new climb target. Captures the CURRENT stance as the start, which is
  // why it can't be computed in the reducer — only the shell knows where you
  // were standing when you clicked.
  useEffect(() => {
    if (climbTo === null || climbVia === null) {
      climb.current = null;
      return;
    }
    // LEVEL COMES FROM `via`, NOT FROM THE `level` PROP, and that's the whole
    // fix for the launch-then-fall glitch.
    //
    // `level` is walkLevel, which reads walk.to.level the moment the state
    // becomes 'climbing' — so by the time this effect runs it already names the
    // DESTINATION storey. Leg 1 was therefore interpolating height from the top
    // of the stairs down to the bottom before leg 2 climbed back up.
    //
    // Leg 1 is a flat walk across the storey the flight leaves from, by
    // definition, so its level is via's. Taking it from anywhere else is asking
    // a question that already has an answer.
    const here: Stance = { level: climbVia.level, pos: pos.current, yaw: yaw.current };
    // Leg 1 is an ordinary walk, so it's timed like one — a click from across
    // the room takes longer to reach the stairs than a click from beside them,
    // which is what stops the approach reading as a teleport. Floored, or a
    // click while already standing on the mat produces a zero-length leg and a
    // divide by zero.
    const approach = Math.hypot(climbVia.pos[0] - here.pos[0], climbVia.pos[1] - here.pos[1]);
    climb.current = {
      legs: [
        { from: here, to: climbVia, secs: Math.max(0.3, approach / WALK_SPEED) },
        { from: climbVia, to: climbTo, secs: CLIMB_SECONDS },
      ],
      leg: 0,
      t: 0,
    };
  }, [climbTo, climbVia]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, MAX_DT);

    const c = climb.current;
    if (c !== null) {
      const leg = c.legs[c.leg]!;
      c.t = Math.min(1, c.t + dt / leg.secs);
      // Eased per LEG, so the camera settles at the foot before starting up. The
      // beat there is doing work: it's the difference between walking to the
      // stairs and being flung at them.
      const k = ease(c.t);
      pos.current = [
        leg.from.pos[0] + (leg.to.pos[0] - leg.from.pos[0]) * k,
        leg.from.pos[1] + (leg.to.pos[1] - leg.from.pos[1]) * k,
      ];
      // Shortest way round, or a turn that crosses the -π/π seam spins the long
      // way about.
      const d = Math.atan2(Math.sin(leg.to.yaw - leg.from.yaw), Math.cos(leg.to.yaw - leg.from.yaw));
      yaw.current = leg.from.yaw + d * k;
      pitch.current += (0 - pitch.current) * k * 0.25; // level out on the way
      // Y rises with the storey, so the climb is a climb rather than a glide
      // through a floor. Leg 1 has from.level === to.level, so it stays flat.
      const y0 = baseYOf(leg.from.level);
      const y1 = baseYOf(leg.to.level);
      camera.position.set(pos.current[0], EYE + y0 + (y1 - y0) * k, pos.current[1]);
      camera.rotation.order = 'YXZ';
      camera.rotation.set(pitch.current, yaw.current, 0);
      if (c.t >= 1) {
        if (c.leg < c.legs.length - 1) {
          c.leg += 1;
          c.t = 0;
        } else {
          climb.current = null;
          onArrived?.();
        }
      }
      return; // input is ignored while the camera is not yours
    }

    const held = (...keys: readonly string[]): number =>
      keys.some((k) => HELD.has(k)) ? 1 : 0;

    // Arrows turn, WASD walks. Not mouse-look: clicking a specific door needs a
    // cursor you can aim, and pointer lock takes it away.
    yaw.current += (held('ArrowLeft') - held('ArrowRight')) * TURN_SPEED * dt;

    const fwd = held('w', 'W', 'ArrowUp') - held('s', 'S', 'ArrowDown');
    const strafe = held('d', 'D') - held('a', 'A');

    if (fwd !== 0 || strafe !== 0) {
      const s = Math.sin(yaw.current);
      const c = Math.cos(yaw.current);
      // three's camera looks down -Z, so yaw 0 faces -Z. Pitch is deliberately
      // ignored: you're on foot, so looking at the ceiling shouldn't launch you
      // at it.
      let dx = -s * fwd + c * strafe;
      let dz = -c * fwd - s * strafe;
      // Normalise, or holding forward+strafe is 1.41x faster than either alone.
      const m = Math.hypot(dx, dz);
      if (m > 0) {
        dx /= m;
        dz /= m;
      }
      const step = WALK_SPEED * dt;
      pos.current = slide(
        pos.current,
        [pos.current[0] + dx * step, pos.current[1] + dz * step],
        blockers,
        BODY_RADIUS,
      );
    }

    camera.position.set(pos.current[0], EYE + baseYOf(level), pos.current[1]);
    // YXZ, not the default XYZ. With XYZ the pitch is applied before the yaw and
    // the horizon rolls as you turn while looking up.
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch.current, yaw.current, 0);

    // Report only real movement. locationAt is cheap but it feeds React, and
    // React should not hear from a camera that hasn't gone anywhere.
    const moved =
      Math.abs(pos.current[0] - lastReported.current[0]) > 1e-4 ||
      Math.abs(pos.current[1] - lastReported.current[1]) > 1e-4;
    if (moved) {
      lastReported.current = pos.current;
      onMoved?.(pos.current);
    }
  });

  return null;
}