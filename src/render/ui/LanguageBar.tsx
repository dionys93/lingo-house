// src/render/ui/LanguageBar.tsx
//
// The two dropdowns: the language you know → the one you're learning. Plain
// native <select> — keyboard- and screen-reader-friendly, native pickers on
// mobile, and zero dependencies. Lives OUTSIDE the Canvas as a DOM overlay.
//
// Both menus list every language, including the one currently on the other side:
// picking it is a legitimate move that swaps the pair (see explorerReducer), so
// there's nothing to disable and no option that silently does nothing.

import type { Dispatch } from 'react';
import { LOCALES, LOCALE_NAMES, type Locale } from '../../core/house/labels';
import type { ExplorerEvent } from '../../core/session/explorer';

const selectStyle = {
  appearance: 'none' as const,
  border: '1px solid rgba(0,0,0,0.14)',
  borderRadius: 7,
  background: '#fff',
  color: '#1c1c1e',
  font: '14px/1.2 system-ui, sans-serif',
  padding: '7px 12px',
  cursor: 'pointer',
};

function LocaleSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Locale;
  onChange: (locale: Locale) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      // The DOM hands back a string; LOCALES is the single source of truth for
      // what's valid, so narrow through it rather than casting the event value.
      onChange={(e) => {
        const picked = LOCALES.find((l) => l === e.target.value);
        if (picked) onChange(picked);
      }}
      style={selectStyle}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}

export function LanguageBar({
  from,
  to,
  dispatch,
}: {
  from: Locale;
  to: Locale;
  dispatch: Dispatch<ExplorerEvent>;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.82)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 14px rgba(0,0,0,0.12)',
      }}
    >
      <LocaleSelect
        label="Language you know"
        value={from}
        onChange={(locale) => dispatch({ tag: 'setFrom', locale })}
      />
      <span aria-hidden style={{ color: '#8a8a8e', font: '15px system-ui, sans-serif' }}>
        →
      </span>
      <LocaleSelect
        label="Language you're learning"
        value={to}
        onChange={(locale) => dispatch({ tag: 'setTo', locale })}
      />
    </div>
  );
}