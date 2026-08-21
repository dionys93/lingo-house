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

type Mode = 'house' | 'sandbox' | 'lab';

interface ModeSpec {
  readonly label: string;
  readonly Scene: ComponentType;
}

// A Record over the union, so a fourth mode won't compile until it has a label
// and a scene here — the same trick describeError uses to stay exhaustive.
const MODES: Record<Mode, ModeSpec> = {
  house: { label: 'House', Scene: HouseScene },
  sandbox: { label: 'Sandbox', Scene: Sandbox },
  lab: { label: 'Lights', Scene: LightingLab },
};

// Order is presentation, not data: the real thing first, scratch scenes after.
const ORDER: readonly Mode[] = ['house', 'sandbox', 'lab'];

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