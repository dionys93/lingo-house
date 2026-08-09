// src/scene/ItemPopup.tsx
//
// The core loop's payoff: click an item, read its name in both languages.
//
// Rendered with drei's <Html>, which anchors real DOM to a 3D point. That buys a
// real <button> for the X (focusable, Enter/Space, screen-reader labelled) and
// crisp text at any zoom — none of which a 3D text billboard gives without
// re-implementing it. It only ever shows while you're standing in the item's
// room, so it stays at a constant readable size rather than scaling with
// distance.

import { useEffect } from 'react';
import { Html } from '@react-three/drei';
import type { CompiledItem } from '../core/grid';
import { labelFor, LOCALE_NAMES, type LabelTable, type Locale } from '../core/labels';

export function ItemPopup({
  item,
  labels,
  from,
  to,
  onDismiss,
}: {
  item: CompiledItem;
  labels: LabelTable;
  from: Locale;
  to: Locale;
  onDismiss: () => void;
}) {
  // Escape closes it. A subscription to something outside React is exactly what
  // an effect is for; the dependency array is honest, and the listener is
  // removed on cleanup so a stale handler can't outlive the popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  // Anchor just above the item's top, centred on its footprint. Derived from the
  // compiled bounds, so it follows the item rather than duplicating its position.
  const anchor: [number, number, number] = [
    (item.bounds.min[0] + item.bounds.max[0]) / 2,
    item.bounds.max[1] + 0.12,
    (item.bounds.min[2] + item.bounds.max[2]) / 2,
  ];

  return (
    <Html position={anchor} center zIndexRange={[40, 0]}>
      <div
        // The popup sits over the canvas; without this, clicks and drags meant
        // for the buttons would fall through and orbit the camera instead.
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          minWidth: 172,
          padding: '12px 34px 12px 14px',
          borderRadius: 12,
          background: 'rgba(255,255,255,0.95)',
          boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
          font: '14px/1.35 system-ui, sans-serif',
          color: '#1c1c1e',
          textAlign: 'left',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 0.3, color: '#8a8a8e' }}>
          {LOCALE_NAMES[from]}
        </div>
        <div style={{ marginBottom: 8 }}>{labelFor(labels, from, item.kind)}</div>
        <div style={{ fontSize: 11, letterSpacing: 0.3, color: '#8a8a8e' }}>
          {LOCALE_NAMES[to]}
        </div>
        <div style={{ fontSize: 19, fontWeight: 600 }}>{labelFor(labels, to, item.kind)}</div>

        <button
          type="button"
          aria-label="Close"
          onClick={onDismiss}
          style={{
            position: 'absolute',
            top: 6,
            right: 6,
            width: 24,
            height: 24,
            display: 'grid',
            placeItems: 'center',
            border: 'none',
            borderRadius: 12,
            background: 'transparent',
            color: '#8a8a8e',
            font: '15px/1 system-ui, sans-serif',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
    </Html>
  );
}