/**
 * Ambient types for renderer-only assets.
 *
 * CSS Modules are resolved by Vite at build time; TypeScript needs to be told
 * what the import evaluates to. Typed as a readonly string map rather than
 * `any` so a typo in a class name is at least a `string | undefined` rather
 * than silently valid (CODE_STYLE.md §1.2 bans `any`).
 */

/*
 * `export default` is banned project-wide (CODE_STYLE.md §1.2) because it
 * breaks rename refactors. Ambient CSS-module declarations are the one place
 * it is unavoidable: Vite's CSS Modules transform emits a default export, and
 * the declaration must match what actually exists at runtime.
 */
/* eslint-disable no-restricted-exports */

declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*.css' {
  const content: string;
  export default content;
}

/* eslint-disable no-restricted-exports */

declare module '*.png' {
  /** Vite rewrites the import to a bundled URL. */
  const url: string;
  export default url;
}

declare module '*.wav' {
  /** Vite rewrites the import to a bundled URL. Phase-07.5a, ADR-016. */
  const url: string;
  export default url;
}
