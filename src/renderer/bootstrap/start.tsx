/**
 * Application composition root.
 *
 * The ONE function the renderer entry may call. Everything that wires the
 * simulation, the snapshot bridge, React, and the developer tooling happens
 * here, inside a boundary-linted layer.
 *
 * This exists so `src/renderer/entry/main.tsx` has nothing internal to reach
 * into: the entry imports this module and nothing else, which is enforced by
 * `boundaries/entry-point` rather than by convention.
 */

import { CORE_WHEAT } from '@sim/content/crops';
import { createWorld } from '@sim/world/world';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '../app/App';
import { createOverlayController } from '../app/overlay-controller';
import { AppProviders } from '../app/store-context';

import { createPlayerInputSource } from './command-dispatch';
import { mountDevTools } from './devtools-mount';
import { createGameLoop } from './game-loop';
import { createPlayerInput } from './player-input';
import { attachPointerActions, toHighlight } from './pointer-actions';
import { createSnapshotStore } from './snapshot-store';
import { createWorldMount } from './world-mount';

import '../app/global.css';

/**
 * Boots the application.
 *
 * Composition order is load-bearing: the loop starts before React mounts so the
 * first render already has a settled snapshot, and devtools mount last so a
 * failure there can never prevent the game from starting.
 */
/** Last world-view mount failure, surfaced as a devtools metric. */
let lastWorldError: string | null = null;

/**
 * Last command rejected at execution, surfaced as a devtools metric.
 *
 * Dispatch-time rejections reach the player through the highlight; these
 * happen a tick later, when the world has changed since the click, and have
 * nowhere to surface until the HUD arrives in phase-05. Recording them beats
 * discarding them (`AI_RULES.md` §2.2).
 */
let lastCommandRejection: string | null = null;

export function startApplication(): void {
  // Fixed seed until phase-07 introduces save/load.
  //
  // Execution-time command rejections are injected here, at the construction
  // boundary. The world reports a `Command` and an `AppError` and knows nothing
  // about a view; deciding that this becomes a log line is the composition
  // root's job, not the simulation's (ADR-010 §7).
  const world = createWorld(1, {
    onExecutionRejected: (command, error) => {
      lastCommandRejection = `${command.type}: ${error.code}`;
    },
  });
  const store = createSnapshotStore(world.snapshots);
  const overlay = createOverlayController(window.desktopLife.overlay);

  const canvas = document.getElementById('world');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('#world canvas is missing from index.html');
  }

  const worldMount = createWorldMount({
    canvas,
    world,
    atlas: 'terrain',
    // The canvas is pointer-transparent so clicks fall through to the desktop
    // (App.module.css); pan/zoom therefore listen on the window and the UI
    // layer stops events over real controls.
    inputTarget: document.body,
    viewport: () => ({
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: window.devicePixelRatio,
    }),
    // A GPU failure must be VISIBLE. Swallowing it leaves the overlay running
    // with no world and no explanation, which is what happened on the first
    // live check of phase-02.
    onError: (error) => {
      lastWorldError = error instanceof Error ? error.message : String(error);
    },
  });

  // The player's write path into the simulation. The same dispatcher worker AI
  // and automation will use — no privileged variant exists (ADR-010 §6).
  const playerInput = createPlayerInput({
    source: createPlayerInputSource(world.commands),
    seed: CORE_WHEAT,
    onChange: (state) => worldMount.current()?.setHighlight(toHighlight(state)),
  });
  // Teardown is intentionally not held: these listeners live for the process,
  // exactly like the resize handler below. Pointer actions stay attached while
  // collapsed, where `tileAt` returns null and every click is a no-op.
  attachPointerActions({
    target: document.body,
    input: playerInput,
    view: () => worldMount.current(),
  });

  const loop = createGameLoop({
    world,
    store,
    // Returning false when nothing was drawn keeps the FPS metric honest: a
    // static world reads 0 fps, which is the intended behaviour, not a stall.
    onFrame: () => worldMount.current()?.renderFrame() ?? false,
  });
  loop.start();

  // The world view exists only while expanded. Collapsing destroys the GPU
  // context entirely (ADR-001 §2).
  const syncWorldToOverlay = (): void => {
    if (overlay.isCollapsed()) {
      worldMount.unmount();
    } else {
      void worldMount.mount();
    }
  };
  overlay.subscribe(syncWorldToOverlay);
  syncWorldToOverlay();

  window.addEventListener('resize', () => {
    worldMount.resize(window.innerWidth, window.innerHeight);
  });

  const container = document.getElementById('ui');
  if (container === null) throw new Error('#ui root is missing from index.html');

  createRoot(container).render(
    <StrictMode>
      <AppProviders store={store} overlay={overlay}>
        <App />
      </AppProviders>
    </StrictMode>,
  );

  void mountDevTools({
    simulation: loop,
    world: () => worldMount.current(),
    worldError: () => lastWorldError,
    commandRejection: () => lastCommandRejection,
    appVersion: __APP_VERSION__,
    reload: () => {
      window.location.reload();
    },
  });
}
