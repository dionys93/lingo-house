// src/core/edit/emit.ts
//
// A plan, back out as TypeScript.
//
// This is the half of "save" that can be wrong in interesting ways, so it is
// pure and it is tested by COMPILING WHAT IT WRITES — the test evaluates the
// emitted arrays and requires them to compile to the same house the editor was
// showing. A serializer checked against a golden string passes while emitting a
// plan that no longer loads.
//
// It writes authoring data and nothing else: cells, sides, offsets in cell
// fractions. Never a world coordinate — that rule is the item model's, and the
// editor holds to it by round-tripping every drag through frame.ts before it
// gets here.
//
// The emitted file inherits its grid, rooms and stairs from base.ts through
// `furnish`, so this only ever writes openings and items. That is also why it
// cannot express a change edit mode cannot make.

import type { ItemDef, Opening, Storey } from '../house/blocks';
import type { Month } from '../house/month';

// JSON.stringify would be shorter and would emit `{"kind":"door","cell":[9,4]}`
// — valid TypeScript, and unreadable next to the hand-written base.ts it sits
// beside. These files are meant to be read and hand-edited, so the quoting
// follows the house style: bare keys, single-quoted strings, one entry a line.
const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

// Numbers go through String(), which is already shortest-round-trip in JS —
// 0.05 prints as 0.05, not 0.05000000000000000277. The offsets arriving here
// were quantised by frame.ts, so this is only ever formatting.
const num = (n: number) => String(n);

const tuple = (ns: readonly number[]) => `[${ns.map(num).join(', ')}]`;

const fields = (pairs: readonly (readonly [string, string | null])[]) =>
  pairs.filter((p): p is readonly [string, string] => p[1] !== null).map(([k, v]) => `${k}: ${v}`).join(', ');

function emitOpening(o: Opening): string {
  const common: (readonly [string, string | null])[] = [
    ['kind', str(o.kind)],
    ['cell', tuple(o.cell)],
    ['side', str(o.side)],
  ];
  const rest: (readonly [string, string | null])[] =
    o.kind === 'door'
      ? [['swing', str(o.swing)]]
      : [
          ['sill', num(o.sill)],
          ['head', num(o.head)],
        ];
  // `between` is the author's cross-check that the edge really joins those two
  // rooms. Edit mode places openings by clicking a wall, so it knows both sides
  // for certain and writes them — a placement that later drifts because the
  // grid changed then fails loudly instead of appearing in the wrong wall.
  const between: (readonly [string, string | null])[] = [
    ['between', o.between ? `[${str(o.between[0])}, ${str(o.between[1])}]` : null],
  ];
  return `{ ${fields([...common, ...rest, ...between])} },`;
}

function emitMount(m: ItemDef['mount']): string {
  switch (m.on) {
    case 'floor':
      return `{ ${fields([
        ['on', str('floor')],
        ['cell', tuple(m.cell)],
        ['facing', m.facing ? str(m.facing) : null],
        ['offset', m.offset && (m.offset[0] !== 0 || m.offset[1] !== 0) ? tuple(m.offset) : null],
      ])} }`;
    case 'item':
      return `{ ${fields([
        ['on', str('item')],
        ['host', str(m.host)],
        ['facing', m.facing ? str(m.facing) : null],
        ['offset', m.offset && (m.offset[0] !== 0 || m.offset[1] !== 0) ? tuple(m.offset) : null],
      ])} }`;
    case 'wall':
      return `{ ${fields([
        ['on', str('wall')],
        ['cell', tuple(m.cell)],
        ['side', str(m.side)],
        ['height', num(m.height)],
        ['offset', m.offset !== undefined && m.offset !== 0 ? num(m.offset) : null],
      ])} }`;
  }
}

const emitItem = (i: ItemDef): string =>
  `{ id: ${str(i.id)}, kind: ${str(i.kind)}, mount: ${emitMount(i.mount)} },`;

// Indentation is spelled out rather than accumulated, because these files sit
// beside a hand-written one and get read next to it.
const KEY = ' '.repeat(4);
const ENTRY = ' '.repeat(6);

const list = (name: string, lines: readonly string[]): string =>
  lines.length === 0
    ? `${KEY}${name}: [],`
    : [`${KEY}${name}: [`, ...lines.map((l) => `${ENTRY}${l}`), `${KEY}],`].join('\n');

const CONST = (m: Month): string => `${m.toUpperCase()}_PLAN`;

/**
 * The whole file, ready to write to src/content/months/<month>.ts.
 *
 * Every storey in the plan gets an entry, including ones whose furnishings are
 * untouched. Emitting only the edited storey would leave the others inheriting
 * from base — correct today, and wrong the moment someone edits base, because
 * this month would then half-follow it. A month file says what the month is.
 */
export function emitMonthFile(month: Month, plan: readonly Storey[]): string {
  const byLevel = [...plan]
    .sort((a, b) => a.level - b.level)
    .map((s) =>
      [
        `  ${String(s.level)}: {`,
        list('openings', (s.openings ?? []).map(emitOpening)),
        list('items', (s.items ?? []).map(emitItem)),
        '  },',
      ].join('\n'),
    )
    .join('\n');

  return `// src/content/months/${month}.ts
//
// Written by edit mode. Safe to edit by hand — it is ordinary authoring data,
// and the next save from edit mode rewrites it whole, so hand edits survive
// exactly as long as you don't overwrite them from the editor.
//
// Only the furnishings live here. The grid, the rooms and the staircase come
// from base.ts through \`furnish\`, so changing the shape of the house there
// still reaches this month.

import { furnish } from '../furnish';
import type { Storey } from '../../core/house/blocks';
import { BASE_PLAN } from './base';

export const ${CONST(month)}: readonly Storey[] = furnish(BASE_PLAN, {
${byLevel}
});
`;
}

/** The pass-through a month starts life as, before it has ever been edited. */
export const emitUneditedMonthFile = (month: Month): string => `// src/content/months/${month}.ts
//
// Not customised. This month is the base house.
//
// The file exists so content/house.ts can hold a COMPLETE Record<Month, ...>
// rather than a partial table with a fallback: every month resolves through the
// same static import, and edit mode's save only ever rewrites a file that is
// already there and already wired up. Save a change from edit mode and this
// becomes a \`furnish(BASE_PLAN, …)\` call listing the furnishings.

import type { Storey } from '../../core/house/blocks';
import { BASE_PLAN } from './base';

export const ${CONST(month)}: readonly Storey[] = BASE_PLAN;
`;
