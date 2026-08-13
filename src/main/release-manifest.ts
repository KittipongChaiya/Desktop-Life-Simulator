/**
 * The update manifest. Phase-15 — ADR-025 §2, §6.
 *
 * ## Why this file exists at all
 *
 * `electron-updater` answers one question — what version exists — and the
 * policy needs four. `TECH_STACK.md` §7.4 records the gap: electron-builder's
 * generated `latest.yml` carries no `schemaVersion`, no halt flag, and no
 * rollout wave that meets §6's no-stored-identifier rule, and there is no
 * supported way to add them.
 *
 * So the other three travel in a small JSON manifest published beside the
 * installer. That is not a workaround; it turns out to be the better shape for
 * the one property §6 insists on. **Halting an in-flight rollout means editing
 * one small file and re-uploading it** — no rebuild, no re-publish of
 * binaries, nothing to sign. §6 requires a halt to stop installs _"before more
 * take it"_, and a halt that needs a release cycle is not one.
 *
 * ## It is untrusted, and it is parsed accordingly
 *
 * This arrives over a network, which `AI_RULES.md` §2.4 defines as untrusted.
 * No `as` cast, no assumption that a field exists because the publisher meant
 * it to. Every deviation answers `null`, and `checkForUpdate` reads null as
 * "nothing on offer".
 *
 * That failure mode is ADR-025 §1 at its cheapest: save integrity outranks
 * update delivery, so a manifest we cannot read is a manifest we do not act
 * on. There is deliberately no repair path — see `parseReleaseManifest`.
 */

import type { OfferedRelease } from './update-policy';

/** The widest a rollout wave can be (ADR-025 §6). */
const ROLLOUT_MAX = 100;

function asRecord(value: unknown): Record<string, unknown> | null {
  // Arrays excluded: a manifest is one release, and `['0.2.1']` reaching the
  // field reads below would silently produce `undefined` for every one.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * A version string, or null.
 *
 * The FORMAT is deliberately not checked here. `compareVersions` accepts
 * strict `major.minor.patch` and answers null for anything else, and that null
 * propagates to a hold — so the rule already exists, one layer in, where the
 * comparison that needs it lives. Restating it here would put the same
 * decision in two places, which is how the two come to disagree.
 *
 * What this answers is narrower: is there a version string at all. Trimming
 * follows `settings-schema.ts`'s reasoning for the pin — whitespace is a
 * publishing typo rather than a different version, and trimming can rescue a
 * value without inventing one.
 */
function version(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** A schema version: a non-negative integer, because that is what one is. */
function schemaVersion(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null;
  return value;
}

/** A rollout wave: a number within 0–100 inclusive. Both ends are meaningful. */
function rolloutPercent(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > ROLLOUT_MAX) return null;
  return value;
}

/**
 * Reads a published manifest, or answers `null`.
 *
 * **One bad field refuses the whole manifest.** There is no repair path, and
 * the two obvious ones are each worse in a specific way:
 *
 * - defaulting `halted` to `false` would let a manifest that _lost_ its halt
 *   flag resume a rollout somebody deliberately stopped — the exact mitigation
 *   §6 exists to provide, failing open;
 * - clamping a nonsense `rolloutPercent` would pick a wave nobody chose, and
 *   deliver a build to a population the publisher did not select.
 *
 * Exactly four fields are read and anything else is ignored. That gives
 * forward compatibility in the safe direction: a future publisher may add a
 * field without older clients refusing every release, while an older client
 * still never guesses at a field it does not understand.
 */
export function parseReleaseManifest(value: unknown): OfferedRelease | null {
  const record = asRecord(value);
  if (record === null) return null;

  const parsedVersion = version(record['version']);
  const parsedSchema = schemaVersion(record['schemaVersion']);
  const parsedRollout = rolloutPercent(record['rolloutPercent']);
  const halted = record['halted'];

  if (parsedVersion === null) return null;
  if (parsedSchema === null) return null;
  if (parsedRollout === null) return null;
  if (typeof halted !== 'boolean') return null;

  return {
    version: parsedVersion,
    schemaVersion: parsedSchema,
    rolloutPercent: parsedRollout,
    halted,
  };
}
