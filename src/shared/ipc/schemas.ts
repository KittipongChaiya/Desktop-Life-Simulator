/**
 * Runtime validators for IPC payloads.
 *
 * Main validates everything crossing in from the renderer (AI_RULES.md §2.4).
 * TypeScript proves nothing at a process boundary: the payload arrives as
 * structured-cloned data from a process we treat as untrusted.
 *
 * Hand-written rather than schema-library-driven — the surface is tiny, and
 * adding a validation dependency for four channels fails the test in
 * TECH_STACK.md §7.1.
 */

import { appError, ErrorCode } from '../errors';
import { err, ok, type Result } from '../result';

export function validateBoolean(value: unknown, channel: string): Result<boolean> {
  if (typeof value !== 'boolean') {
    return err(
      appError(ErrorCode.IpcRejected, 'expected a boolean payload', {
        channel,
        received: typeof value,
      }),
    );
  }
  return ok(value);
}

export function validateNumber(value: unknown, channel: string): Result<number> {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return err(
      appError(ErrorCode.IpcRejected, 'expected a finite number payload', {
        channel,
        received: typeof value,
      }),
    );
  }
  return ok(value);
}

/**
 * A string or an explicit `null` — the shape of a version pin (ADR-025 §6).
 *
 * Shape only. Whether the string names a real version is deliberately NOT
 * checked here: `settings-schema.ts` keeps a pin it cannot parse so that it
 * still holds, and `update-policy.ts` is what refuses to order it. Rejecting
 * an unparseable pin at this boundary would turn "hold me here" into a failed
 * call and, after it, no pin at all.
 */
export function validateNullableString(value: unknown, channel: string): Result<string | null> {
  if (value !== null && typeof value !== 'string') {
    return err(
      appError(ErrorCode.IpcRejected, 'expected a string or null payload', {
        channel,
        received: value === undefined ? 'undefined' : typeof value,
      }),
    );
  }
  return ok(value);
}

export function validateVoid(value: unknown, channel: string): Result<void> {
  if (value !== undefined && value !== null) {
    return err(
      appError(ErrorCode.IpcRejected, 'expected no payload', {
        channel,
        received: typeof value,
      }),
    );
  }
  return ok();
}
