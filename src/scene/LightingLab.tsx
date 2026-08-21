// src/scene/LightingLab.tsx
//
// A THIRD scratch mode, sibling to Sandbox. Sandbox answers "does the roof read
// right on this footprint". This one answers a different question: "is the light
// rig, or the textures, what's making this look flat" — and it answers it by
// letting you change ONE variable at a time and attribute the difference.
//
// Zero new dependencies. Everything here ships in three@0.185 and drei@10
// already, which is the point: if this scene looks good, most of the texture
// work is unnecessary.
//
// Three things it isolates that the app currently conflates:
//
//   RIG        ambient/sun balance. The app runs ambient 0.6 + sun 1.0, i.e.
//              60% of the light has NO DIRECTION. A normal map's whole job is to
//              perturb the light·normal dot product, and ambient has no dot
//              product. Half the relief you're paying to compute is discarded.
//
//   CEILING    the reason "interior or exterior first" is a real question and
//              not pedantry. Ceilings are opaque DoubleSide tiles at wall-top
//              with a roof over them. Turn shadows on and the sun cannot reach
//              the floor: the interior goes black except for ambient. A rig
//              tuned for the exterior blacks out the interior; a rig tuned for
//              the interior washes out the exterior. Toggle it and watch.
//
//   CHAMFER    the cheapest experiment in the whole plan. Two blocks at true
//              wall scale, one square-edged, one chamfered, under identical
//              light. A chamfer catches a highlight along every edge, which is
//              most of what separates "model" from "box". If it wins here, it
//              wins on the house and no texture work is needed to get it.
//
// It also mounts the SurfaceProvider, which Sandbox does not — so the oak,
// walnut and grass surfaces actually build here instead of silently falling
// back to flat colour.

import { useEffect, useMemo, useReducer } from 'react';
import type { CSSProperties } from 'react';
import * as THREE from 'three';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox } from '@react-three/drei';
import { CELL, WALL_HEIGHT, WALL_THICKNESS, compileGrid, roofFor } from '../core/grid';
import { defineRoom, type Grid, type RoomLabels } from '../core/blocks';
import { LOCALES, type Locale } from '../core/labels';
import { assertNever } from '../core/errors';
import { SurfaceProvider, useSurfaceMaterial } from './surfaces/SurfaceProvider';
import type { SurfaceKey } from './surfaces/registry';
import { Ground } from './Ground';
import { Floor } from './Floor';
import { Ceiling } from './Ceiling';
import { Walls } from './Walls';
import { Roof } from './Roof';
import { HouseLights } from './HouseLights';
import { EXTERIOR_RIG, INTERIOR_RIG, type LightRig } from './lights';
import { ScenePost } from './ScenePost';

// ── State ───────────────────────────────────────────────────────────────────
//
// A reducer rather than six useStates: the toggles are one thing with six
// fields, and a pure reducer is testable in the same way core/nav's is.

type RigKey = 'shipping' | 'exterior' | 'interior';
type ToggleKey = 'shadows' | 'ceiling' | 'roof' | 'chamfer' | 'ao';
type ViewKey = 'exterior' | 'interior';

interface LabState {
  readonly rig: RigKey;
  readonly view: ViewKey;
  readonly shadows: boolean;
  readonly ceiling: boolean;
  readonly roof: boolean;
  readonly chamfer: boolean;
  readonly ao: boolean;
}

type LabAction =
  | { readonly tag: 'rig'; readonly rig: RigKey }
  | { readonly tag: 'view'; readonly view: ViewKey }
  | { readonly tag: 'toggle'; readonly of: ToggleKey };

const START: LabState = {
  rig: 'shipping',
  view: 'exterior',
  shadows: false,
  ceiling: true,
  roof: true,
  chamfer: false,
  ao: true,
};

export function labReducer(state: LabState, action: LabAction): LabState {
  switch (action.tag) {
    case 'rig':
      return { ...state, rig: action.rig };
    case 'view':
      return { ...state, view: action.view };
    case 'toggle':
      switch (action.of) {
        case 'shadows':
          return { ...state, shadows: !state.shadows };
        case 'ceiling':
          return { ...state, ceiling: !state.ceiling };
        case 'roof':
          return { ...state, roof: !state.roof };
        case 'chamfer':
          return { ...state, chamfer: !state.chamfer };
        case 'ao':
          return { ...state, ao: !state.ao };
        default:
          return assertNever(action.of);
      }
    default:
      return assertNever(action);
  }
}

// ── Rigs ────────────────────────────────────────────────────────────────────
//
// The presets wrap the ACTUAL rigs from lights.ts, so what you compare here is
// what rigFor(nav) hands HouseScene — not a lookalike. Only `shipping` is local,
// because it's the baseline being argued against and nothing should import it.

const SHIPPING_RIG: LightRig = {
  ambient: 0.6,
  skyFill: 0,
  sun: 1.0,
  sunCastsShadow: false,
  env: null, // no environment, so this really is the before picture
  envIntensity: 0,
  ao: null,
};

interface RigPreset {
  readonly label: string;
  readonly rig: LightRig;
  readonly note: string;
}

const RIGS: Record<RigKey, RigPreset> = {
  shipping: {
    label: 'Shipping',
    rig: SHIPPING_RIG,
    note: 'What HouseScene ran before rigFor. 60% of the light is directionless, so normal maps have almost nothing to modulate.',
  },
  exterior: {
    label: 'Exterior',
    rig: EXTERIOR_RIG,
    note: 'EXTERIOR_RIG, what rigFor returns outside. Relief and chamfers read hard. Turn shadows on and step inside: near-black, because the ceiling is opaque and the roof is over it.',
  },
  interior: {
    label: 'Interior',
    rig: INTERIOR_RIG,
    note: 'INTERIOR_RIG, what rigFor returns in a room. Fill-first, sun shadows off — nothing reaches in through the roof anyway. An environment map should take this job over later.',
  },
};

// ── Scene pieces ────────────────────────────────────────────────────────────

// A LAB PROBE, not a fix. Floor/Walls/Ceiling/Roof accept no castShadow or
// receiveShadow props, so there is no declarative way to turn shadows on for
// them from out here. Traversing the scene is how you find out whether shadows
// are worth the work before doing that work. The real fix is props on each
// component — see the todo. Don't copy this into HouseScene.
function ShadowFlagProbe({ on }: { on: boolean }) {
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = on;
        o.receiveShadow = on;
      }
    });
  }, [scene, on]);
  return null;
}

/** One surface at true world scale, so you judge the grain at the size it ships. */
function SurfacePanel({
  surface,
  position,
  size,
}: {
  surface: SurfaceKey;
  position: readonly [number, number, number];
  size: readonly [number, number];
}) {
  const material = useSurfaceMaterial(surface, size);
  return (
    <mesh position={[position[0], position[1], position[2]]}>
      <boxGeometry args={[size[0], size[1], 0.02]} />
      {material ? (
        <meshStandardMaterial {...material} />
      ) : (
        <meshStandardMaterial color="#9c8f7a" />
      )}
    </mesh>
  );
}

const PANEL: readonly [number, number] = [0.36, 0.5];
const PANEL_Y = 0.28;

/** oak | walnut | grass, side by side under whatever rig is selected. */
function SurfaceBench() {
  return (
    <>
      <SurfacePanel surface="wood.oak" position={[-0.42, PANEL_Y, -0.3]} size={PANEL} />
      <SurfacePanel surface="wood.walnut" position={[0, PANEL_Y, -0.3]} size={PANEL} />
      <SurfacePanel surface="grass" position={[0.42, PANEL_Y, -0.3]} size={PANEL} />
    </>
  );
}

const CHAMFER_R = 0.008; // must stay under WALL_THICKNESS / 2 = 0.04
const BLOCK: readonly [number, number, number] = [CELL, WALL_HEIGHT * 0.6, WALL_THICKNESS];
const BLOCK_COLOR = '#dfd3c3'; // HOUSE_SIDING, so this is a fair test of the real wall colour

/**
 * The cheap experiment. Same size, same colour, same light — the only difference
 * is whether the edges are square. Square is on the left.
 */
function ChamferBench({ chamfered }: { chamfered: boolean }) {
  const y = BLOCK[1] / 2 + 0.02;
  return (
    <>
      <mesh position={[-0.35, y, 0.4]}>
        <boxGeometry args={[BLOCK[0], BLOCK[1], BLOCK[2]]} />
        <meshStandardMaterial color={BLOCK_COLOR} roughness={0.85} />
      </mesh>
      {chamfered ? (
        <RoundedBox args={[BLOCK[0], BLOCK[1], BLOCK[2]]} radius={CHAMFER_R} smoothness={3} position={[0.35, y, 0.4]}>
          <meshStandardMaterial color={BLOCK_COLOR} roughness={0.85} />
        </RoundedBox>
      ) : (
        <mesh position={[0.35, y, 0.4]}>
          <boxGeometry args={[BLOCK[0], BLOCK[1], BLOCK[2]]} />
          <meshStandardMaterial color={BLOCK_COLOR} roughness={0.85} />
        </mesh>
      )}
    </>
  );
}

// ── Plan ────────────────────────────────────────────────────────────────────
//
// 4×4 so the interior view has somewhere to stand: cells are centred on the
// origin (xAt = col*CELL - C*CELL/2), so this spans -1..1 and an orbit of 0.7
// around the middle stays inside the walls.

const plain = (name: string) =>
  Object.fromEntries(LOCALES.map((l) => [l, { name, enter: `Go to ${name}` }])) as Record<
    Locale,
    RoomLabels
  >;

const R = defineRoom({ key: 'lab', labels: plain('the lab'), color: '#cbb89a' });
const PLAN: Grid = [
  [R, R, R, R],
  [R, R, R, R],
  [R, R, R, R],
  [R, R, R, R],
];

// ── UI ──────────────────────────────────────────────────────────────────────
//
// Deliberately the same vocabulary as Sandbox's preset bar — 13px system sans,
// dark translucent, 6px radii. A dev panel that looks like a different app is a
// panel you misread.

const panel: CSSProperties = {
  position: 'absolute',
  top: 12,
  left: 12,
  width: 268,
  padding: 12,
  borderRadius: 10,
  background: 'rgba(17, 24, 39, 0.82)',
  color: '#fff',
  font: '13px/1.5 ui-sans-serif, system-ui',
};
const group: CSSProperties = { display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' };
const legend: CSSProperties = {
  display: 'block',
  marginBottom: 5,
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.55)',
};
const btn = (active: boolean): CSSProperties => ({
  padding: '5px 10px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  font: '12px ui-sans-serif, system-ui',
  background: active ? '#e8e2d6' : 'rgba(255,255,255,0.14)',
  color: active ? '#111' : '#fff',
});
const note: CSSProperties = {
  margin: 0,
  paddingTop: 9,
  borderTop: '1px solid rgba(255,255,255,0.14)',
  fontSize: 12,
  color: 'rgba(255,255,255,0.72)',
};

// Explicit rather than Object.keys(RIGS) — no cast, and the order is an argument:
// what ships, then what the exterior wants, then the compromise that serves neither.
const RIG_ORDER: readonly RigKey[] = ['shipping', 'exterior', 'interior'];

const TOGGLES: readonly { readonly of: ToggleKey; readonly label: string }[] = [
  { of: 'shadows', label: 'Shadows' },
  { of: 'ceiling', label: 'Ceiling' },
  { of: 'roof', label: 'Roof' },
  { of: 'chamfer', label: 'Chamfer' },
  // No-op on Shipping, which has ao: null — that preset is the before picture.
  { of: 'ao', label: 'AO' },
];

export function LightingLab() {
  const [state, dispatch] = useReducer(labReducer, START);
  const rig = RIGS[state.rig];

  const result = useMemo(() => compileGrid(PLAN), []);
  const compiled = result.ok ? result.value : null;
  const roof = useMemo(() => (compiled ? roofFor(compiled.footprint) : null), [compiled]);

  const inside = state.view === 'interior';

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {/*
        Keyed on `shadows`. Toggling shadowMap.enabled mid-session leaves every
        already-compiled material on its old shader variant, so the honest way
        to A/B it is a fresh renderer. Costs you the camera position on toggle;
        acceptable in a lab, and clearly a lab-only concession.
      */}
      <Canvas
        key={state.shadows ? 'shadows-on' : 'shadows-off'}
        shadows={state.shadows}
        camera={{ position: inside ? [0.5, 0.7, 0.5] : [3, 2.4, 3.6], fov: 50 }}
      >
        <color attach="background" args={['#dce8f5']} />
        {/* The SAME component HouseScene renders, so the lab can't light its
            scene differently from the house — including the sun's position,
            which lives in lights.ts now. The shadow toggle overrides the
            preset's own value so shadows stay an independent variable here. */}
        <HouseLights rig={{ ...rig.rig, sunCastsShadow: state.shadows }} />
        <Ground />
        <SurfaceProvider>
          {compiled && (
            <>
              <Floor grid={compiled} />
              {state.ceiling && <Ceiling grid={compiled} />}
              <Walls grid={compiled} />
              {state.roof && roof && <Roof roof={roof} />}
              <SurfaceBench />
              <ChamferBench chamfered={state.chamfer} />
            </>
          )}
          <ShadowFlagProbe on={state.shadows} />
        </SurfaceProvider>
        <ScenePost ao={state.ao ? rig.rig.ao : null} />
        <OrbitControls
          enablePan={false}
          target={[0, inside ? 0.6 : 0.5, 0]}
          minDistance={inside ? 0.15 : 1.5}
          maxDistance={inside ? 0.7 : 20}
          maxPolarAngle={inside ? Math.PI - 0.05 : Math.PI / 2 - 0.05}
        />
      </Canvas>

      <div style={panel}>
        <span style={legend}>Light rig</span>
        <div style={group}>
          {RIG_ORDER.map((key) => (
            <button
              key={key}
              style={btn(key === state.rig)}
              onClick={() => dispatch({ tag: 'rig', rig: key })}
            >
              {RIGS[key].label}
            </button>
          ))}
        </div>

        <span style={legend}>Stand</span>
        <div style={group}>
          {(['exterior', 'interior'] as const).map((v) => (
            <button key={v} style={btn(v === state.view)} onClick={() => dispatch({ tag: 'view', view: v })}>
              {v === 'exterior' ? 'Outside' : 'Inside'}
            </button>
          ))}
        </div>

        <span style={legend}>Isolate</span>
        <div style={group}>
          {TOGGLES.map((t) => (
            <button key={t.of} style={btn(state[t.of])} onClick={() => dispatch({ tag: 'toggle', of: t.of })}>
              {t.label}
            </button>
          ))}
        </div>

        <p style={note}>{rig.note}</p>
      </div>
    </div>
  );
}