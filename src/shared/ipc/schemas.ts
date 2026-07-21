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
