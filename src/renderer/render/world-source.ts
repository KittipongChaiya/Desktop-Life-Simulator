/**
 * Everything the renderer is allowed to read from the simulation. Phase-29 —
 * ADR-039 §3.
 *
 * ## Why this file exists
 *
 * `world-view.ts` took a `World` and read from it in twenty places. `World` is
 * the whole simulation, so "what does the renderer depend on?" had no answer
 * shorter than reading every line of the view — and the question is not
 * academic: it is exactly the scope of ADR-003 §2's worker-thread migration,
 * whose real cost was never `src/sim` (already pure, already projecting a
 * snapshot) but the renderer reaching past it.
 *
 * The trigger for that migration is **not met** — p99 0.5 ms against 3 ms
 * under full v0.4 load, measured in the running app (`PERFORMANCE.md` §17). So
 * what ships is not the migration but its prerequisite: the dependency, named.
 *
 * ## What this is NOT
 *
 * **It is not a severed boundary, and ADR-039 says so.** `World` satisfies this
 * interface structurally, so a renderer author who wants another field can
 * widen it in one line. That is the intended friction rather than a wall: the
 * act becomes visible in a diff instead of disappearing into a `world.` that
 * offers everything.
 *
 * ## The three groups, and why each is here
 */

import type { PhaseTintRegistry } from '../../sim/content/lighting';
import type { ResourceNodeRegistry } from '../../sim/content/resource-nodes';
import type { SeasonRegistry } from '../../sim/content/seasons';
import type { TileKindRegistry } from '../../sim/content/tile-kinds';
import type { SnapshotState } from '../../sim/snapshot/state';
import type { TileGrid } from '../../sim/world/tile-grid';

export interface WorldRenderSource {
  // ── Immutable setup ────────────────────────────────────────────────────────
  //
  // Fixed for the world's lifetime. A threaded build would pass these once at
  // construction and never again, so they are not what a migration has to
  // solve — and pretending otherwise would overstate the problem.

  /** The world seed. Decor, node placement, and every derived look hash it. */
  readonly seed: number;
  readonly tileKinds: TileKindRegistry;
  readonly seasonRegistry: SeasonRegistry;
  readonly phaseTintRegistry: PhaseTintRegistry;
  readonly resourceNodeRegistry: ResourceNodeRegistry;

  // ── The snapshot ───────────────────────────────────────────────────────────
  //
  // The sanctioned sim→view boundary (ADR-005 §2): versioned, immutable
  // projections that republish only when their content changes. Everything the
  // renderer reads per frame should arrive here, and after phase 29 almost
  // everything does.

  readonly snapshots: SnapshotState;

  // ── The one mutable structure read directly ────────────────────────────────

  /**
   * The dense tile grid — and the whole of what a worker-thread migration
   * would still have to solve (ADR-039 §5).
   *
   * 7,168 tiles across five parallel arrays, read whenever a terrain chunk is
   * re-baked and whenever decor or nodes are re-planned. It cannot become a
   * slice: projecting it would copy the largest structure in the world on
   * every change, which is the cost ADR-004 §2 chose the flat layout to avoid.
   *
   * A threaded build needs either a renderer-side copy kept in step by
   * invalidation messages, or a `SharedArrayBuffer` — which Electron permits,
   * and which would make the grid genuinely shared rather than copied.
   *
   * It is listed last, alone, and with this comment, so that the migration's
   * scope stays one field long and visibly so.
   */
  readonly tiles: TileGrid;
}
