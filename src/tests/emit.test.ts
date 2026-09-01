// src/tests/emit.test.ts
//
// Does the file edit mode writes actually load?
//
// A serializer checked against a golden string passes while emitting source
// that no longer parses, imports something that moved, or drops a field the
// compiler needed. So this test writes a real month file into the real content
// folder, IMPORTS IT, and requires the house it produces to be the house the
// editor was showing. Vitest transforms it on the way in, so "does it compile"
// is answered by the same toolchain that answers it for every other file.
//
// The file is deleted afterwards. If a crash leaves one behind it is gitignored
// and harmless — it is a valid month file that nothing imports.

import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { emitMonthFile } from '../core/edit/emit';
import { applyEdit, nextItemId } from '../core/edit/plan';
import { compileHouse } from '../core/house/house';
import { houseFor } from '../content/house';
import type { Storey } from '../core/house/blocks';

// A literal path, because vite resolves dynamic imports statically — and a
// COMMITTED file, because `tsc -b` checks the tree as it stands and a module
// that exists only while vitest runs is a module it reports as missing. See the
// header in scratch.gen.ts. Its idle contents are restored afterwards so a test
// run leaves the working tree clean.
const SCRATCH = new URL('../content/months/scratch.gen.ts', import.meta.url).pathname;
const IDLE = readFileSync(SCRATCH, 'utf8');
const write = (source: string) => {
  writeFileSync(SCRATCH, source);
};
afterAll(() => {
  writeFileSync(SCRATCH, IDLE);
});

const compiledOf = (plan: readonly Storey[]) => {
  const c = compileHouse(plan);
  if (!c.ok) throw new Error(JSON.stringify(c.error));
  return c.value;
};

describe('what edit mode saves is what edit mode was showing', () => {
  const start = houseFor('january');

  // ONE test and one import, because vite caches a module by path and a query
  // string to bust that (`?edited`) is a path tsc cannot resolve. It loses
  // nothing: a plan carrying every kind of edit v1 can make still contains
  // every untouched item and opening, so an emitter that drops a field on one
  // of those fails here exactly as loudly.
  it('carries an edited plan through the file and out the other side', async () => {
    const id = nextItemId(start, 'bookshelf');
    let plan = applyEdit(start, {
      tag: 'addItem',
      level: 0,
      // Against the living room's front wall, clear of the door and the windows.
      item: { id, kind: 'bookshelf', mount: { on: 'floor', cell: [11, 6], facing: 'n', offset: [0.15, -0.2] } },
    });
    plan = applyEdit(plan, { tag: 'removeItem', level: 1, id: 'small-nightstand' });
    plan = applyEdit(plan, {
      tag: 'addOpening',
      level: 0,
      opening: { kind: 'window', cell: [8, 0], side: 'left', sill: 0.45, head: 0.95, between: ['livingRoom', 'outside'] },
    });

    const before = compiledOf(plan);
    write(emitMonthFile('january', plan));
    const mod = (await import('../content/months/scratch.gen')) as { JANUARY_PLAN: readonly Storey[] };
    const after = compiledOf(mod.JANUARY_PLAN);

    // Every wall, opening, item and stair, compared as compiled geometry. This
    // is the assertion: a field the emitter forgot to write is a house that
    // differs, whether or not the file still parses.
    expect(after).toEqual(before);

    // …and the edits really are in there, so an emitter that wrote the ORIGINAL
    // plan could not pass by being self-consistent.
    expect(after.storeys[0].grid.items.map((i) => i.id)).toContain(id);
    expect(after.storeys[1].grid.items.map((i) => i.id)).not.toContain('small-nightstand');
    expect(after.storeys[0].grid.openings.length).toBe(
      compiledOf(start).storeys[0].grid.openings.length + 1,
    );
  });
});

describe('the emitted source reads like the file it sits beside', () => {
  const source = emitMonthFile('march', houseFor('january'));

  it('omits offsets that are zero rather than writing them out', () => {
    // Not cosmetic. These files are meant to be read and hand-edited, and a
    // plan where two thirds of the lines carry `offset: [0, 0]` hides the
    // handful that were actually nudged.
    expect(source).not.toContain('offset: [0, 0]');
    expect(source).toContain('offset: [');
  });

  it('writes numbers a person would have typed', () => {
    // frame.ts quantises what a drag produces; this is the check that nothing
    // downstream of it re-introduces float dust like 0.15000000000000002.
    const numbers = [...source.matchAll(/-?\d+\.\d{6,}/g)].map((m) => m[0]);
    expect(numbers).toEqual([]);
  });

  it('names the month it was asked for', () => {
    expect(source).toContain('export const MARCH_PLAN');
  });
});
