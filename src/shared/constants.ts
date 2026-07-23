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
export const OPACITY_DEFAULT_PERCENT = 100;
