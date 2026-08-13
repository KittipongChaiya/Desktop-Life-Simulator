/**
 * The settings `electron-updater` is held to. Phase-15 — ADR-025 §2, §5.
 *
 * Data, not wiring. This module imports nothing — in particular not
 * `electron-updater` itself — so the settings that carry two of ADR-025's
 * guarantees are unit-testable without a host, exactly as `save-store.ts`
 * takes a directory rather than calling `app.getPath`. The thin binding that
 * owns the library applies these; it decides nothing.
 *
 * ## Why a constant needs a file and a test
 *
 * `electron-updater` ships defaults that are, for this product, precisely the
 * behaviour ADR-025 §Alternatives A rejected: it downloads on check and
 * installs on quit, both without asking. That is a reasonable default for most
 * applications and is disqualifying for one whose premise is sitting quietly on
 * someone's desktop next to a save it must not endanger.
 *
 * So these are not preferences. Two of them are the difference between the
 * library's shipped behaviour and ADR-025's, and a dependency upgrade that
 * changed a default back would otherwise be silent.
 *
 * Defaults checked against `electron-updater@6.8.9`.
 */

/**
 * The settings that must hold, whatever the library's defaults are.
 *
 * Each is asserted individually with its reason in `updater-config.test.ts`,
 * and the SET is pinned there too — a fifth setting cannot arrive without
 * someone stating why it is safe.
 */
export const REQUIRED_UPDATER_CONFIG = {
  /**
   * ADR-025 §5. Library default: `true`.
   *
   * A check must not become a download. The player has not been told a version
   * exists yet, and the announcer may be holding the offer because they are in
   * work mode (§5) — spending their bandwidth to prepare something they have
   * not been asked about is the "update convenience" §1 ranks last.
   */
  autoDownload: false,

  /**
   * ADR-025 §5 — "never restart unasked". Library default: `true`.
   *
   * The most dangerous of the four. Left alone, every quit becomes an install,
   * which also means every quit races the quit-save (`SAVE_FORMAT.md` §7.2).
   * Consent to restart is the player's, and it is asked for explicitly.
   */
  autoInstallOnAppQuit: false,

  /**
   * ADR-025 §2 — "a rollback is never automatic". Library default: `false`.
   *
   * Agreed with rather than overridden, and pinned anyway because the failure
   * is invisible: an older build may not read the save the newer one migrated,
   * so this flag is §Context's entire hazard behind a boolean. The rollback
   * decision belongs to `rollback-guard.ts`, which can refuse it.
   */
  allowDowngrade: false,

  /**
   * Library default: `false`.
   *
   * This project ships no pre-release channel, and `compareVersions` refuses
   * anything that is not strict `major.minor.patch` — a refusal propagates to
   * a hold. Enabling this would produce releases the policy is structurally
   * unable to order, so every one would be silently held: a channel that looks
   * live and delivers nothing.
   */
  allowPrerelease: false,
} as const;

/**
 * The subset above that fights a default rather than agreeing with one.
 *
 * Worth naming separately because the two categories decay differently. A
 * setting we agree with survives a library upgrade that changes its default —
 * we would simply start relying on the new value. A setting we override is the
 * only thing standing between this product and behaviour its governing ADR
 * rejected, so it is where an upgrade can quietly cost a guarantee.
 */
export const UPDATER_DEFAULTS_OVERRIDDEN = ['autoDownload', 'autoInstallOnAppQuit'] as const;
