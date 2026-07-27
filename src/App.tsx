// src/App.tsx
//
// Thin shell: a toggle between the real explorable house and the roof sandbox.
// Each mode brings its own full-screen Canvas; only one is mounted at a time.

import { useState, type CSSProperties } from 'react';
import { HouseScene } from './scene/HouseScene';
import { Sandbox } from './scene/Sandbox';

const toggle: CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  zIndex: 10,
  padding: '8px 14px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  background: 'rgba(17, 24, 39, 0.8)',
  color: '#fff',
  font: '13px ui-sans-serif, system-ui',
};

export default function App() {
  const [mode, setMode] = useState<'house' | 'sandbox'>('house');
  return (
    <>
      <button style={toggle} onClick={() => setMode((m) => (m === 'house' ? 'sandbox' : 'house'))}>
        {mode === 'house' ? 'Sandbox →' : '← Back to house'}
      </button>
      {mode === 'house' ? <HouseScene /> : <Sandbox />}
    </>
  );
}