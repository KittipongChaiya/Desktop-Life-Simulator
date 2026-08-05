/**
 * Build-time constants every layer may read.
 *
 * `__FEATURE_DEBUG__` is declared HERE rather than in `devtools/env.d.ts`
 * (07.8i) because `shared/build-flags.ts` reads it, and `shared` is compiled by
 * the sim and main TypeScript projects too — which never see the devtools
 * declarations. The devtools-only flags stay where they were.
 */

declare const __FEATURE_DEBUG__: boolean;
