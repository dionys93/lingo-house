// src/scene/SelectionPopup.tsx
//
// The language loop's payoff. Renders whatever `describe()` resolved: the word
// for the thing you clicked, the room it's in underneath it, and — on a door —
// the phrase that takes you through.
//
// The chain is rendered as a HIERARCHY, not a list. The subject is large, the
// context is small and muted, so a click that yields several words still points
// each word at something. A flat stack of equal-weight words would leave the
// learner unable to tell which one names the thing under the cursor, which is
// the whole advantage of teaching vocabulary inside a 3D house.
//
// drei's <Html> anchors real DOM to a 3D point, which buys real <button>s for
// the action and the X — focusable, Enter/Space, screen-reader labelled — none
// of which a 3D text billboard gives without re-implementing it.

import { useEffect } from 'react';
import { Html } from '@react-three/drei';
import type { Described } from '../core/describe';
import { LOCALE_NAMES, type Locale } from '../core/labels';

const MUTED = '#8a8a8e';

function Pair({
  value,
  from,
  to,
  primary,
}: {
  value: { from: string; to: string };
  from: Locale;
  to: Locale;
  primary: boolean;
}) {
  return (
    <div style={{ marginBottom: primary ? 10 : 0 }}>
      <div style={{ fontSize: 10, letterSpacing: 0.3, color: MUTED }}>{LOCALE_NAMES[to]}</div>
      <div style={{ fontSize: primary ? 19 : 13, fontWeight: primary ? 600 : 500 }}>{value.to}</div>
      <div style={{ fontSize: primary ? 13 : 11, color: MUTED }} title={LOCALE_NAMES[from]}>
        {value.from}
      </div>
    </div>
  );
}

export function SelectionPopup({
  described,
  from,
  to,
  onAct,
  onDismiss,
}: {
  described: Described;
  from: Locale;
  to: Locale;
  onAct: (edgeId: string) => void;
  onDismiss: () => void;
}) {
  // Escape closes. A subscription to something outside React is exactly what an
  // effect is for; the listener is removed on cleanup so a stale handler can't
  // outlive the popup.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const { subject, context, action } = described;

  return (
    <Html position={[...described.anchor]} center zIndexRange={[40, 0]}>
      <div
        // The popup sits over the canvas; without this, clicks and drags meant
        // for the buttons would fall through and orbit the camera instead.
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          minWidth: 190,
          maxWidth: 260,
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
        <Pair value={subject} from={from} to={to} primary />
        {context.map((c, i) => (
          <Pair key={i} value={c} from={from} to={to} primary={false} />
        ))}

        {action && (
          <button
            type="button"
            onClick={() => onAct(action.edgeId)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 12,
              padding: '9px 10px',
              border: 'none',
              borderRadius: 9,
              background: '#2f6f4f',
              color: '#fff',
              font: 'inherit',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <span style={{ display: 'block', fontWeight: 600 }}>{action.label.to}</span>
            <span style={{ display: 'block', fontSize: 12, opacity: 0.85 }}>
              {action.label.from}
            </span>
          </button>
        )}

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
            color: MUTED,
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