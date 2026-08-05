/**
 * Build-time flags every layer may read. Phase-07.8i, ADR-018 §7.
 *
 * `FEATURE_DEBUG` is declared HERE, not in `devtools/flags.ts`, because the
 * layers that must be able to compile debug code out are not allowed to import
 * devtools — `render` may reach only `shared`, `sim` and `render`, and that
 * boundary is the one phase-01.5 deliverable 8 exists to enforce.
 *
 * Without this, a debug tool that draws INTO THE SCENE (07.8i's chunk overlay,
 * 07.8j's pathfinding overlay) can only be switched off in production, never
 * removed: the render layer would have no literal to fold against, so its hook
 * and null check would ship. Measured, before this existed: 557 bytes.
 *
 * ADR-018 §7 is unchanged — there is still exactly ONE master switch, still a
 * compile-time literal injected by Vite. `devtools/flags.ts` re-exports this
 * one rather than declaring a second, so there is a single source of truth.
 */

/** Master switch. When false, no developer tooling is constructed or bundled. */
export const FEATURE_DEBUG: boolean = __FEATURE_DEBUG__;
