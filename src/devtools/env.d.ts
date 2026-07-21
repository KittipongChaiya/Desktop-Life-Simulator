/**
 * Build-time constants injected by Vite `define`.
 *
 * Declared rather than imported: pulling package.json into the renderer would
 * bundle the whole manifest, and computing the flags at runtime would defeat
 * the dead-code elimination they exist to enable (see flags.ts).
 */

declare const __APP_VERSION__: string;
declare const __FEATURE_DEBUG__: boolean;
declare const __FEATURE_PROFILER__: boolean;
declare const __FEATURE_CONSOLE__: boolean;
declare const __FEATURE_INSPECTOR__: boolean;
