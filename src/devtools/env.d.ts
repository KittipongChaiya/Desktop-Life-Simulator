/**
 * Build-time constants injected by Vite `define`.
 *
 * Declared rather than imported: pulling package.json into the renderer would
 * bundle the whole manifest, and computing the flags at runtime would defeat
 * the dead-code elimination they exist to enable (see flags.ts).
 */

declare const __APP_VERSION__: string;
// `__FEATURE_DEBUG__` lives in `shared/env.d.ts` (07.8i): `shared` needs it and
// is compiled by projects that never see this file.
declare const __FEATURE_PROFILER__: boolean;
declare const __FEATURE_CONSOLE__: boolean;
declare const __FEATURE_INSPECTOR__: boolean;
