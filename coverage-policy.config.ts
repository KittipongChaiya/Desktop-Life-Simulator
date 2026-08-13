/**
 * The coverage policy. Phase-08.0 — `TESTING.md` §4.
 *
 * THIS FILE IS THE POLICY; `TESTING.md` §4 IS ITS PROSE. `vitest.config.ts`
 * derives its thresholds and its exclusion list from here, and
 * `tests/coverage-policy.test.ts` asserts that the document and this file agree
 * path for path and number for number.
 *
 * That circularity is deliberate and is the fix phase-08.0 exists to make. From
 * phase-00 until this file, `TESTING.md` §4 declared seven per-area thresholds
 * and `vitest.config.ts` enforced exactly one global pair — so six of the seven
 * were documentation wearing a gate's clothes, and nobody found out until the
 * v0.1 release gate came due. A number that lives in two places drifts; a number
 * that lives here and is checked against the document cannot.
 *
 * ## What may leave the measured set
 *
 * A module is excluded ONLY when both hold:
 *
 *   1. it is a HOST BINDING — its body exists to call Pixi, Electron, or the
 *      DOM host, and it cannot be imported in the unit environment without one;
 *   2. a named test DOES exercise it, recorded in `detectors` and never empty.
 *
 * This is not a new rule. `save-store.ts` states it as doctrine — "the directory
 * is a parameter, not `app.getPath` — this module is pure Node, so the sequence
 * is testable" — and `TESTING.md` §2 states its consequence: reaching for a mock
 * is a design signal, not a testing need. The split already runs through the
 * renderer, which is why most entries below carry a `logic` counterpart: the
 * decisions were extracted long ago, and what remains is the sprite binding.
 *
 * A module that fails the criterion and is uncovered is a GAP, not an entry.
 * Adding it here to turn the gate green is the one thing this file must not be
 * used for.
 */

export interface HostBinding {
  /** Path from the repository root, forward slashes. */
  readonly path: string;
  /** Why a unit test cannot reach it. */
  readonly reason: string;
  /** Where its testable decisions live, when they were extracted. */
  readonly logic: string | null;
  /** The tests that do exercise it. Never empty. */
  readonly detectors: readonly string[];
}

const RENDER_BUDGET = 'tests/e2e/render-budget.spec.ts';
const OVERLAY = 'tests/e2e/overlay.spec.ts';

/**
 * Excluded from measurement. 23 files, 1,378 lines, of which unit tests reach
 * 34 — the set is denominator with almost no numerator, which is why removing
 * it raises nine thresholds instead of lowering any.
 */
export const HOST_BINDINGS: readonly HostBinding[] = [
  {
    path: 'src/main/index.ts',
    reason: 'The main-process composition root: app lifecycle, IPC handlers, tray, window wiring.',
    logic: null,
    detectors: [
      OVERLAY,
      'tests/e2e/background-tick.spec.ts',
      'tests/e2e/save.spec.ts',
      'tests/e2e/companion.spec.ts',
      'tests/e2e/update.spec.ts',
    ],
  },
  {
    path: 'src/main/overlay-window.ts',
    reason: 'Constructs the BrowserWindow. Every line is an Electron window option.',
    logic: null,
    detectors: [OVERLAY],
  },
  {
    path: 'src/main/settings.ts',
    reason:
      'Answers only where `userData` is — `app.getPath`. Phase-08.0c moved the read and write themselves into `settings-store.ts`, which takes the directory as a parameter and is unit-tested against real temp directories.',
    logic: 'src/main/settings-store.ts',
    detectors: ['tests/e2e/companion.spec.ts', OVERLAY],
  },
  {
    path: 'src/preload/index.ts',
    reason: 'The contextBridge surface. Exists only in a preload realm.',
    logic: 'src/shared/ipc/contract.ts',
    detectors: [OVERLAY, 'tests/e2e/companion.spec.ts', 'tests/e2e/update.spec.ts'],
  },
  {
    path: 'src/renderer/entry/main.tsx',
    reason:
      'The renderer entry. One call, constrained by the boundary linter to import exactly one module.',
    logic: null,
    detectors: ['tests/boundaries.test.ts', OVERLAY],
  },
  {
    path: 'src/renderer/bootstrap/start.tsx',
    reason:
      'The renderer composition root: mounts React and Pixi and wires every subsystem to the host.',
    logic: null,
    detectors: [OVERLAY, 'tests/e2e/hud-layout.spec.ts'],
  },
  {
    path: 'src/renderer/bootstrap/world-mount.ts',
    reason: 'Creates and destroys the Pixi application on collapse (ADR-001 §2).',
    logic: null,
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/bootstrap/devtools-mount.ts',
    reason: 'Mounts the devtools React tree behind the build flags.',
    logic: null,
    detectors: [
      'tests/devtools-excluded-from-production.test.ts',
      'tests/e2e/inspector.spec.ts',
      'tests/e2e/performance-panel.spec.ts',
    ],
  },
  {
    path: 'src/renderer/render/app.ts',
    reason: 'Constructs the Pixi Application and its renderer backend.',
    logic: null,
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/layers.ts',
    reason: 'Declares the Pixi container stack.',
    logic: null,
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/world-view.ts',
    reason: 'The scene graph: containers, sprites, and the frame loop it drives.',
    logic: 'src/renderer/render/dirty-gate.ts',
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/worker-view.ts',
    reason: 'Binds worker snapshots to sprites.',
    logic: 'src/renderer/render/worker-render.ts',
    detectors: ['tests/e2e/worker.spec.ts', RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/crop-view.ts',
    reason: 'Binds crop snapshots to sprites.',
    logic: 'src/renderer/render/crop-anim.ts',
    detectors: ['tests/e2e/economy.spec.ts', RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/building-view.ts',
    reason: 'Binds building snapshots to sprites.',
    logic: null,
    detectors: ['tests/e2e/placement.spec.ts', RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/building-ghost.ts',
    reason: 'The placement ghost sprite.',
    logic: null,
    detectors: ['tests/e2e/placement.spec.ts'],
  },
  {
    path: 'src/renderer/render/decor-view.ts',
    reason: 'Binds decor placements to sprites.',
    logic: 'src/renderer/render/decor.ts',
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/particle-view.ts',
    reason: 'Draws pooled particles.',
    logic: 'src/renderer/render/particle-pool.ts',
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/terrain-renderer.ts',
    reason: 'Bakes terrain chunks into RenderTextures.',
    logic: 'src/renderer/render/terrain-chunks.ts',
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/floating-numbers.ts',
    reason: 'Draws floating numbers as Pixi text.',
    logic: 'src/renderer/render/floating-number-state.ts',
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/effects.ts',
    reason: 'Draws the effect sprites.',
    logic: 'src/renderer/render/effect-state.ts',
    detectors: [RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/highlight.ts',
    reason: 'Draws the tile highlight graphic.',
    logic: null,
    detectors: ['tests/e2e/inspector.spec.ts', RENDER_BUDGET],
  },
  {
    path: 'src/renderer/render/chunk-debug.ts',
    reason: 'Draws the chunk overlay.',
    logic: null,
    detectors: ['tests/e2e/chunk-debug.spec.ts'],
  },
  {
    path: 'src/renderer/render/path-debug.ts',
    reason: 'Draws routes and the heatmap.',
    logic: null,
    detectors: ['tests/e2e/path-debug.spec.ts'],
  },
  {
    path: 'src/renderer/render/world-debug.ts',
    reason: 'Draws the in-world inspector tool.',
    logic: null,
    detectors: ['tests/e2e/inspector.spec.ts'],
  },
];

export interface AreaThreshold {
  /** Matched against paths relative to the repository root (`pathe`, forward slashes). */
  readonly glob: string;
  readonly lines: number;
  readonly branches: number;
}

/**
 * Per-area gates. Each is set below the measurement it was derived from, so an
 * ordinary change does not flip a row red — and never below what the area
 * already achieves.
 *
 * `src/preload/**` has no entry because every file in it is a host binding;
 * `TESTING.md` §4 carries its row, and the register test asserts that an area
 * documented as E2E-gated has no measured file left behind.
 */
export const AREA_THRESHOLDS: readonly AreaThreshold[] = [
  { glob: 'src/sim/**', lines: 90, branches: 85 },
  { glob: 'src/persistence/**', lines: 95, branches: 90 },
  { glob: 'src/shared/**', lines: 90, branches: 85 },
  { glob: 'src/renderer/app/**', lines: 85, branches: 75 },
  { glob: 'src/renderer/render/**', lines: 95, branches: 85 },
  { glob: 'src/renderer/bootstrap/**', lines: 85, branches: 75 },
  { glob: 'src/main/**', lines: 90, branches: 80 },
  { glob: 'src/devtools/**', lines: 85, branches: 75 },
  { glob: 'plugins/**', lines: 90, branches: 85 },
];

/** The gate `PLAN.md` §8 delegates to `TESTING.md` §4. */
export const PROJECT_THRESHOLD = { lines: 90, branches: 85 } as const;

/** Areas whose every file is a host binding, gated by E2E instead of a number. */
export const E2E_GATED_AREAS: readonly string[] = ['src/preload'];
