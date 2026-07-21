/**
 * Renderer entry point.
 *
 * Deliberately trivial, and constrained by the boundary linter to importing
 * exactly one module: the bootstrap composition root.
 *
 * Entry files are the classic hole in a layered architecture — they sit above
 * every layer, so they tend to match no rule and end up able to import
 * anything. That was true here until phase-01.7: `main.tsx` could import
 * `electron` and nothing complained.
 *
 * Rules now enforced on this file:
 *   • may import ONLY the `bootstrap` layer
 *   • may import only bootstrap's declared entry point (`start.tsx`), not its
 *     internals — `boundaries/entry-point`
 *   • may not import electron, pixi.js, react, or react-dom
 *
 * Verified by deliberate-violation tests in tests/boundaries.test.ts.
 */

import { startApplication } from '../bootstrap/start';

startApplication();
