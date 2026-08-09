/**
 * Cross-cutting constants.
 *
 * Tick-related values are fixed by ADR-007. `TICKS_PER_SECOND` is effectively
 * frozen once content ships: content authors durations in ticks and saves store
 * tick counts, so changing it rescales every balance number and invalidates the
 * meaning of every persisted tick. See ADR-007 §7.
 */

/** Simulation rate. ADR-007. Do not change after content exists. */
export const TICKS_PER_SECOND = 20;

/** Milliseconds per simulation tick. */
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/**
 * Maximum ticks the accumulator may run in a single frame.
 *
 * Caps how much a stall can be made up at once. Without it a long pause makes
 * the next frame run hundreds of ticks, which takes longer than a frame, which
 * grows the backlog further — the spiral of death. Time beyond this cap is
 * discarded and handled by offline catch-up instead. ADR-007 §3.
 */
export const MAX_CATCHUP_TICKS = 5;

/** Autosave cadence. SAVE_FORMAT.md §7.2. */
export const AUTOSAVE_INTERVAL_TICKS = TICKS_PER_SECOND * 60;

/** Offline progress is capped at 8 hours. GAME_DESIGN.md §9.3. */
export const OFFLINE_CAP_TICKS = TICKS_PER_SECOND * 60 * 60 * 8;

/**
 * Shortest gap that earns a return summary. GAME_DESIGN.md §9.4.
 *
 * Below a minute there is nothing to report — a relaunch, an alt-tab, a
 * crash-and-restart — and a summary for it would be exactly the interruption
 * §10.1 forbids. Deliberately its own constant rather than a reuse of the
 * autosave interval they happen to share: one is a cadence, the other a
 * threshold, and they are free to diverge.
 */
export const RETURN_SUMMARY_MIN_TICKS = TICKS_PER_SECOND * 60;

/** World grid dimensions. GAME_DESIGN.md §2.1. */
export const WORLD_WIDTH = 64;
export const WORLD_HEIGHT = 64;
export const WORLD_TILE_COUNT = WORLD_WIDTH * WORLD_HEIGHT;

/** Tile edge length in logical pixels. ASSETS.md §2. */
export const TILE_SIZE = 32;

/** Overlay heights in logical pixels. GAME_DESIGN.md §10.2. */
export const OVERLAY_HEIGHT_EXPANDED = 220;
export const OVERLAY_HEIGHT_COLLAPSED = 48;

/** Maximum rate at which snapshot slices are delivered to React. ADR-005 §2. */
export const UI_UPDATE_HZ = 10;

/**
 * The desktop-companion opacity dial (phase-01.8, ADR-014 §2).
 *
 * Shared because both sides hold an end of it: the settings slider (renderer)
 * renders the range and the platform service (main) sanitizes against it.
 * Work mode's 25% is deliberately NOT here — it is a mode constant below this
 * floor, owned by the main-process schema, never a position on this dial.
 */
export const OPACITY_MIN_PERCENT = 30;
export const OPACITY_MAX_PERCENT = 100;
export const OPACITY_STEP_PERCENT = 5;
/**
 * Opens at the FLOOR of the dial, so a first launch is as unobtrusive as the
 * companion can be and the player dials presence UP if they want it.
 *
 * Two consequences worth knowing, neither a defect:
 * work mode's 25% now sits only one notch below the resting state, so entering
 * it is a subtle change rather than the obvious one ADR-014 §2 describes; and
 * the dial cannot move DOWN from its default, which is why the slider tests
 * step up.
 */
export const OPACITY_DEFAULT_PERCENT = OPACITY_MIN_PERCENT;

/**
 * The volume dial (phase-07.5a, ADR-016) — the companion's FIFTH presence
 * dial, and the audible sibling of the opacity one above.
 *
 * Unlike opacity it reaches zero: silence is a position a player may want
 * without reaching for the mute toggle.
 */
export const VOLUME_MIN_PERCENT = 0;
export const VOLUME_MAX_PERCENT = 100;
export const VOLUME_STEP_PERCENT = 5;
export const VOLUME_DEFAULT_PERCENT = 60;

/**
 * Sound is OFF until asked for.
 *
 * An overlay that starts making noise the moment it launches — beside a call,
 * a game, a focused hour — is the most intrusive thing this product could do
 * (`VISION.md` §5.1: never a notification spammer). The bus is fully wired and
 * one toggle away; nothing about this default is unfinished. Flipping it is a
 * one-constant decision, deliberately recorded as such.
 */
export const AUDIO_MUTED_BY_DEFAULT = true;

/**
 * The day's length for a NEW world, in ticks. Phase-10b — ADR-020 §2.
 *
 * 24,000 ticks is twenty minutes at 20 Hz. It is a DEFAULT, not a constant the
 * simulation reads: every world freezes its own value at creation, so changing
 * this rebalances new worlds without touching anyone's past (ADR-020 §2).
 */
export const DEFAULT_TICKS_PER_DAY = 24_000;

/**
 * The season's length for a NEW world, in days. Phase-11a — ADR-021 §1.
 *
 * Seven days is two hours twenty of real time at the default day length, so a
 * full four-season year is nine hours twenty — just over the working day
 * `VISION.md` §2.1 says this window sits beside. A player who leaves it running
 * for a day sees a whole year, which is what makes a seasonal restriction feel
 * like a choice rather than a lockout.
 *
 * The longest crop, `core:pumpkin`, matures in exactly one day, so a season
 * holds seven of them end to end (`GAME_DESIGN.md` §3.1).
 *
 * A DEFAULT, not a constant the simulation reads: every world freezes its own
 * value at creation, because changing it on a live world renumbers every season
 * the player has already lived through (ADR-021 §1, ADR-020 §2).
 */
export const DEFAULT_DAYS_PER_SEASON = 7;

/**
 * The weather period's length for a NEW world, in ticks. Phase-12a — ADR-022 §1.
 *
 * 6,000 ticks is five real minutes — a quarter of a day, so a day sees four
 * weather periods just as it sees four phases. **This is the whole persistence
 * mechanism**: each period's weather is drawn independently, so the period's
 * length is what stops rain flickering. Five minutes of rain reads as weather;
 * five seconds reads as a bug.
 *
 * A DEFAULT, not a constant the simulation reads: every world freezes its own
 * value at creation, because changing it re-derives every past period and so
 * changes the rainfall history that wetness is computed from (ADR-020 §2's rule,
 * one system along).
 */
export const DEFAULT_TICKS_PER_WEATHER_PERIOD = 6_000;
