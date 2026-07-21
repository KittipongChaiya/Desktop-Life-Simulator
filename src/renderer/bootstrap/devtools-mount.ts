/**
 * Mounts developer tooling, if this build has any.
 *
 * Lives in `bootstrap` rather than the renderer entry so the devtools import
 * sits inside a boundary-linted layer. `src/renderer/main.tsx` matches no
 * element pattern and is therefore unconstrained — a gap found by the
 * phase-01.6 architecture review — so entry-point code is kept to a minimum
 * and everything real happens here, where the rules apply.
 *
 * The dynamic import is deliberate and must stay INSIDE the `FEATURE_DEBUG`
 * branch: Vite replaces that flag with a literal, so a production build
 * evaluates `if (false)` and Rollup drops the devtools chunks entirely
 * (src/devtools/flags.ts).
 */

import { FEATURE_DEBUG } from '@devtools/flags';
import { MetricGroup } from '@devtools/metrics/registry';
import type { WorldView } from '@render/world-view';

import type { SimulationControl } from '../../shared/simulation-control';

export interface DevToolsMountOptions {
  readonly simulation: SimulationControl;
  readonly appVersion: string;
  readonly reload: () => void;
  /** The live world view, or null while collapsed. */
  readonly world?: () => WorldView | null;
  /** Last mount failure, if any. Surfaced so a GPU failure is diagnosable. */
  readonly worldError?: () => string | null;
}

/** Resolves once tooling is mounted, or immediately when the build has none. */
export async function mountDevTools(options: DevToolsMountOptions): Promise<void> {
  if (!FEATURE_DEBUG) return;

  const [{ createDevTools }, { DevTools }, { createRoot }, react] = await Promise.all([
    import('@devtools/host'),
    import('@devtools/ui/DevTools'),
    import('react-dom/client'),
    import('react'),
  ]);

  const host = createDevTools(options);

  // PHASE-02 METRICS. Registered here in `bootstrap`, not in devtools: the
  // metrics read the render layer, and `devtools` may not import `render`
  // (CODE_STYLE.md §8.1). Bootstrap may import both, so the wiring belongs
  // here — which is exactly what the registry was built for (phase-01.5).
  const world = options.world;
  if (world !== undefined) {
    const view = (): WorldView | null => world();

    host.metrics.registerAll([
      {
        id: 'render.backend',
        label: 'Backend',
        group: MetricGroup.Render,
        order: 0,
        read: () => view()?.backend ?? options.worldError?.() ?? 'not mounted',
      },
      {
        id: 'render.camera',
        label: 'Camera',
        group: MetricGroup.Render,
        order: 1,
        read: () => {
          const camera = view()?.camera();
          return camera === undefined
            ? 'Unavailable'
            : `x ${camera.x.toFixed(0)} z ${String(camera.zoom)}`;
        },
      },
      {
        id: 'render.chunkRedraws',
        label: 'Chunk Redraws',
        group: MetricGroup.Render,
        order: 2,
        // Zero on a cached frame. A persistently nonzero value means chunk
        // invalidation is running away.
        read: () => String(view()?.lastChunkRedraws() ?? 0),
      },
      {
        id: 'render.visibleTiles',
        label: 'Visible Tiles',
        group: MetricGroup.Render,
        order: 3,
        read: () => (view()?.visibleTileCount() ?? 0).toLocaleString(),
      },
      {
        id: 'render.dirty',
        label: 'Dirty',
        group: MetricGroup.Render,
        order: 4,
        read: () => {
          const gate = view()?.gate;
          if (gate === undefined) return 'Unavailable';
          return `${gate.isDirty() ? 'yes' : 'no'} · ${String(gate.animationCount())} anim`;
        },
      },
    ]);
  }

  host.logs
    .get('renderer')
    .info('developer tools ready', { keys: 'F1 console · F3 overlay · F4 inspector' });

  // A separate React root: devtools must never re-render the game UI, and the
  // game UI must never be able to unmount devtools.
  const container = document.createElement('div');
  container.id = 'devtools';
  document.body.appendChild(container);

  createRoot(container).render(react.createElement(DevTools, { host }));
}
