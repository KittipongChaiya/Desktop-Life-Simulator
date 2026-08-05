/**
 * Discriminated result type for boundary returns.
 *
 * Inside a module, throw freely. At a boundary — IPC, disk, plugin code, user
 * input, save parsing — return a `Result` so callers cannot forget to handle
 * failure and so the value survives a process boundary. CODE_STYLE.md §1.5.
 */

import type { AppError } from './errors';

export type Result<T, E = AppError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok(): Result<void, never>;
export function ok<T>(value: T): Result<T, never>;
export function ok<T>(value?: T): Result<T | undefined, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Narrows to the success branch. */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

/** Narrows to the failure branch. */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Unwraps a success value, throwing on failure.
 *
 * For use in tests and at the top of call stacks where a failure genuinely is
 * unrecoverable. Never use this to avoid handling an error at a boundary.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrap called on a failed Result: ${JSON.stringify(result.error)}`);
}
