/**
 * The rollback boundary. Phase-15a — ADR-025 §2.
 *
 * ADR-025's finding was that **rollback across a schema bump orphans a save**,
 * with every component behaving correctly and the composition losing data: the
 * new build migrates a save forward, the player rolls back, and the old build
 * meets a `schemaVersion` from the future. `SAVE_FORMAT.md` §4.3 makes it
 * refuse to load — correctly, because the alternative is reading a shape it
 * does not understand — so a player who rolled back to escape a bug finds
 * their farm unopenable, which is a worse bug.
 *
 * The guard is therefore on the UPDATER, not the loader. The loader's refusal
 * is right and stays; what must not happen is the rollback that creates the
 * situation.
 *
 * ## Why this is arithmetic and not a policy
 *
 * Two numbers decide it: the schema version of the save on disk, and the
 * `CURRENT_SCHEMA_VERSION` of the build being rolled back TO. If the build is
 * older than the save, it cannot read it, and no amount of care elsewhere
 * changes that. Everything else — which build, when, why — is irrelevant.
 *
 * Because it is arithmetic, it lives here as a pure function and is tested in
 * Node with no installer, no signing, and no update server. That is the same
 * split ADR-016 §1 uses for audio and for the same reason: the part that can
 * be wrong should not need the machinery to check.
 *
 * ## The recovery path already exists
 *
 * Phase-09 ships a pre-migration backup, kept indefinitely (ADR-027), written
 * before any migration runs and structurally exempt from pruning. So a refused
 * rollback is not a dead end: the player restores the backup into the older
 * build and continues. This module names that path in its refusal, because a
 * refusal that does not say what to do instead is just a wall.
 */

/** Why a rollback was refused, in terms a player-facing message can use. */
export interface RollbackRefusal {
  readonly reason: 'save-is-newer';
  /** The schema version found on disk. */
  readonly saveVersion: number;
  /** The schema version the target build can read. */
  readonly targetVersion: number;
  /** Where the pre-migration backup for that version would be, if written. */
  readonly recoveryHint: string;
}

export type RollbackDecision =
  { readonly allowed: true } | { readonly allowed: false; readonly refusal: RollbackRefusal };

/**
 * Whether rolling back to a build is safe for the save on disk.
 *
 * **Equal versions are allowed.** A build with the same schema reads the same
 * shape, and refusing there would block the common case — rolling back a patch
 * release that changed no persisted state, which is most of them.
 *
 * A missing or unreadable save version allows the rollback rather than
 * refusing it: there is no save to orphan, and refusing would strand a player
 * whose install has no farm yet.
 */
export function decideRollback(
  saveVersion: number | null,
  targetVersion: number,
): RollbackDecision {
  if (saveVersion === null || !Number.isFinite(saveVersion)) return { allowed: true };
  if (saveVersion <= targetVersion) return { allowed: true };

  return {
    allowed: false,
    refusal: {
      reason: 'save-is-newer',
      saveVersion,
      targetVersion,
      recoveryHint: `slot-0-v${String(targetVersion)}-premigration.json`,
    },
  };
}

/**
 * The message a player reads.
 *
 * States the fact, the consequence, and the way out — in that order, and
 * without version numbers being the first thing on the line. A player being
 * told they cannot do something needs to know what to do instead more than
 * they need the arithmetic.
 */
export function explainRefusal(refusal: RollbackRefusal): string {
  return (
    `This version of the game is older than your farm and cannot open it. ` +
    `Your save is untouched. ` +
    `To go back, restore the backup made before the update — ` +
    `${refusal.recoveryHint} — from the saves folder, then reinstall this version. ` +
    `(Save format ${String(refusal.saveVersion)}; this build reads ${String(refusal.targetVersion)}.)`
  );
}
