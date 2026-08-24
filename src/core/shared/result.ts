// src/core/result.ts
//
// The core's error channel. Fallible operations return a Result rather than
// throwing, so a caller cannot ignore failure — the `ok` discriminant forces a
// branch. Throwing is reserved for genuinely unreachable states (see
// assertNever in errors.ts).
//
// E is generic on purpose. compileScene instantiates it as
// `Result<Scene, readonly HouseError[]>` so a failed compile carries EVERY
// error at once, not just the first one it hit.
//
// No combinators (map/andThen/…) yet — they get added the moment a call site
// actually needs one, not speculatively. A Result type is ~15 lines of our own
// code; a monad library here would be a dependency paying for nothing.

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });