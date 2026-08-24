// src/core/seq.ts
//
// Tiny sequence helpers, so iterating a grid reads as a data pipeline rather than
// a nested for-loop. `pairs` is the ONE place a cartesian product's inner
// iteration lives — named once, so every call site stays flat.

export const range = (start: number, end: number): number[] =>
  Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);

// Every (a, b) combination — the cartesian product of two sequences.
export const pairs = <A, B>(as: readonly A[], bs: readonly B[]): [A, B][] =>
  as.flatMap((a) => bs.map((b): [A, B] => [a, b]));