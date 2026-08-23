// src/App.tsx
//
// Thin shell: a switch between the explorable house, the roof sandbox, and the
// light lab. Each mode brings its own full-screen Canvas; only one is mounted at
// a time, so switching tears the old renderer down rather than running two.
//
// The old single cycling button ("Sandbox →" / "← Back to house") named where
// you'd GO rather than where you ARE, which is legible with two modes and
// ambiguous with three — you'd have to press twice to find out. A segmented
// control shows the current mode and reaches any other in one press. Same
// vocabulary as Sandbox's preset bar so it doesn't read as a different app.

import { useState, type ComponentType, type CSSProperties } from 'react';
import { HouseScene } from './scene/HouseScene';
import { Sandbox } from './scene/Sandbox';
import { LightingLab } from './scene/LightingLab';

interface ModeSpec {
  readonly label: string;
  readonly Scene: ComponentType;
}

/**
 * THE ROSTER — one list, and `Mode` is derived from it.
 *
 * This used to be three declarations of the same set: a `Mode` union, this
 * array, and MODES. The record was checked against the union, so ADDING a mode
 * was safe — that's what the old comment here promised, and it was true.
 * REMOVING one wasn't. Deleting WalkScene's entry from MODES left 'walk' in
 * both the union and this array, and the bar rendered a button whose label read
 * `MODES['walk'].label`. Not a click-time crash — a mount-time one, because the
 * map runs for every entry on first paint. White screen.
 *
 * Deriving the union from the array closes it both ways. Add an entry here and
 * MODES won't compile until it has a spec; delete one and the orphaned spec is
 * an excess property, reported on the line that is actually wrong rather than
 * on the Record header. A mode can no longer exist without a button, or a
 * button without a mode.
 *
 * Order is presentation too: the real thing first, scratch scenes after.
 */
const ORDER = ['house', 'sandbox', 'lab'] as const;

type Mode = (typeof ORDER)[number];

const MODES: Record<Mode, ModeSpec> = {
  house: { label: 'House', Scene: HouseScene },
  sandbox: { label: 'Sandbox', Scene: Sandbox },
  lab: { label: 'Lights', Scene: LightingLab },
};

const bar: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 10,
  display: 'flex',
  gap: 6,
  padding: 6,
  borderRadius: 10,
  background: 'rgba(17, 24, 39, 0.8)',
};

const btn = (active: boolean): CSSProperties => ({
  padding: '6px 12px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  font: '13px ui-sans-serif, system-ui',
  background: active ? '#e8e2d6' : 'rgba(255,255,255,0.15)',
  color: active ? '#111' : '#fff',
});

export default function App() {
  const [mode, setMode] = useState<Mode>('house');
  const { Scene } = MODES[mode];

  return (
    <>
      <div style={bar} role="group" aria-label="Scene">
        {ORDER.map((m) => (
          <button
            key={m}
            type="button"
            style={btn(m === mode)}
            aria-pressed={m === mode}
            onClick={() => setMode(m)}
          >
            {MODES[m].label}
          </button>
        ))}
      </div>
      {/* Keyed on the mode so switching unmounts the previous Canvas outright
          rather than reconciling one renderer's tree into another's. */}
      <Scene key={mode} />
    </>
  );
}