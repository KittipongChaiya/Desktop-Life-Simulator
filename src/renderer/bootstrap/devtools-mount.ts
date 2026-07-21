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

import type { SimulationControl } from '../../shared/simulation-control';

export interface DevToolsMountOptions {
  readonly simulation: SimulationControl;
  readonly appVersion: string;
  readonly reload: () => void;
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
