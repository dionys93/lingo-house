// src/render/ui/MonthBar.tsx
//
// The month picker: a tear-off calendar in the top-left corner that opens a
// grid of twelve.
//
// It shows BOTH languages, like the selection popup does, because the months
// are vocabulary too — the same reason clicking a door teaches you the word for
// it. The button face carries the month you're in, in the language you're
// learning FROM; the open grid pairs each month with its translation, so
// picking one is also a reading.
//
// A DOM overlay rather than drei's <Html>: it belongs to the page, not to a
// point in the scene, so it should not move, scale or z-fight with geometry.
// Same treatment as LanguageBar.

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { MONTHS, type Month } from '../../core/house/month';
import type { LabelTable, Locale } from '../../core/house/labels';

const wrap: CSSProperties = { position: 'absolute', top: 12, left: 12, zIndex: 10 };

// The button is drawn to READ as a calendar at a glance: a coloured header
// band over a white body, the way a desk calendar's month strip sits over the
// date. Without the band it is just a box with text in it.
const button = (open: boolean): CSSProperties => ({
  display: 'block',
  width: 74,
  padding: 0,
  border: 'none',
  borderRadius: 8,
  overflow: 'hidden',
  cursor: 'pointer',
  background: '#fff',
  boxShadow: open ? '0 0 0 2px #b5503f, 0 2px 10px rgba(0,0,0,0.28)' : '0 2px 8px rgba(0,0,0,0.28)',
  font: '13px ui-sans-serif, system-ui',
  textAlign: 'center',
});

const band: CSSProperties = {
  background: '#b5503f',
  color: '#fff',
  font: '600 10px/1 ui-sans-serif, system-ui',
  letterSpacing: '0.09em',
  padding: '5px 0',
  // The two rings of a tear-off calendar's binding.
  boxShadow: 'inset 0 3px 0 -1px rgba(255,255,255,0.35)',
};

const face: CSSProperties = {
  padding: '7px 4px 8px',
  color: '#1c1c1c',
  font: '600 13px/1.15 ui-sans-serif, system-ui',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const sheet: CSSProperties = {
  marginTop: 8,
  padding: 8,
  borderRadius: 10,
  background: 'rgba(255,255,255,0.97)',
  boxShadow: '0 6px 22px rgba(0,0,0,0.3)',
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 4,
  width: 264,
};

const cell = (active: boolean): CSSProperties => ({
  padding: '7px 6px',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  textAlign: 'left',
  background: active ? '#b5503f' : 'rgba(0,0,0,0.05)',
  color: active ? '#fff' : '#1c1c1c',
  font: '600 12px/1.25 ui-sans-serif, system-ui',
});

const gloss = (active: boolean): CSSProperties => ({
  display: 'block',
  font: '400 11px/1.3 ui-sans-serif, system-ui',
  color: active ? 'rgba(255,255,255,0.85)' : '#6b6b6b',
});

export function MonthBar({
  month,
  onPick,
  labels,
  from,
  to,
}: {
  month: Month;
  onPick: (m: Month) => void;
  labels: LabelTable;
  from: Locale;
  to: Locale;
}) {
  const [open, setOpen] = useState(false);
  const name = (m: Month, l: Locale) => labels[l].months[m];

  return (
    <div style={wrap}>
      <button
        type="button"
        style={button(open)}
        aria-expanded={open}
        aria-label={`Month: ${name(month, from)}`}
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        <div style={band}>MONTH</div>
        <div style={face}>{name(month, from)}</div>
      </button>

      {open && (
        <div style={sheet} role="listbox" aria-label="Month">
          {MONTHS.map((m) => {
            const active = m === month;
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={active}
                style={cell(active)}
                onClick={() => {
                  onPick(m);
                  setOpen(false);
                }}
              >
                {name(m, from)}
                <span style={gloss(active)}>{name(m, to)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
