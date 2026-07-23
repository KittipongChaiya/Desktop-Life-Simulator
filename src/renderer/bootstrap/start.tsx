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

import { loadWorld } from '@persistence/load';
import { EMPTY_QUARANTINE, type SaveMeta, type SaveQuarantine } from '@persistence/schema';
import { toSaveDocument } from '@persistence/serialize';
import { createWorld, type World, type WorldOptions } from '@sim/world/world';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import type { ContentId, TileIndex } from '../../shared/ids';
import { App } from '../app/App';
import { createCompanionController } from '../app/companion-controller';
import { createOverlayController } from '../app/overlay-controller';
import { createPlacementController } from '../app/placement';
import { createSeedSelection } from '../app/seed-selection';
import { AppProviders } from '../app/store-context';
import { createWorkerSelection } from '../app/worker-selection';
import { workerAtTile } from '../render/worker-render';

import { createPlayerInputSource } from './command-dispatch';
import { mountDevTools } from './devtools-mount';
import { createGameLoop } from './game-loop';
import { ghostFor } from './placement-preview';
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

/**
 * The session's save continuity (phase-07c): the loaded header fields that
 * must carry across saves, plus the held quarantine (`SAVE_FORMAT.md` §5.3)
 * — persistence-orchestration state, deliberately NOT on `World` (the sim
 * never learns saves exist).
 */
interface SaveSession {
  createdAtUnixMs: number;
  saveCount: number;
  quarantine: SaveQuarantine;
}

/** Load log, held for the devtools/return-summary surfaces (07e). */
let lastLoadNote: string | null = null;

export function startApplication(): void {
  // Loading is async (an IPC round trip), so the composition happens inside.
  // A boot failure must be VISIBLE, not a blank overlay.
  void bootApplication().catch((error: unknown) => {
    renderFatalError(
      'The game could not start.',
      error instanceof Error ? error.message : String(error),
    );
  });
}

/**
 * `SAVE_FORMAT.md` §4.3: read (main) → migrate → validate → hydrate (here) —
 * or a new game, ONLY when no save file exists at all. A save that exists but
 * cannot be loaded stops with a clear message; silently starting a new game
 * over a broken farm is the forbidden outcome.
 */
async function bootApplication(): Promise<void> {
  // Execution-time command rejections are injected here, at the construction
  // boundary. The world reports a `Command` and an `AppError` and knows nothing
  // about a view; deciding that this becomes a log line is the composition
  // root's job, not the simulation's (ADR-010 §7).
  const worldOptions: WorldOptions = {
    onExecutionRejected: (command, error) => {
      lastCommandRejection = `${command.type}: ${error.code}`;
    },
  };

  const saves = await window.desktopLife.save.load();
  let world: World;
  let session: SaveSession;

  if (saves.missing) {
    // A fresh farm. The seed only needs to be new here — it is authoritative
    // (and deterministic) state from this moment on, carried by every save.
    world = createWorld(Math.floor(Math.random() * 2_147_483_646) + 1, worldOptions);
    session = { createdAtUnixMs: Date.now(), saveCount: 0, quarantine: EMPTY_QUARANTINE };
    lastLoadNote = 'new game';
  } else {
    const loaded = loadWorld(saves.primary, saves.backup, worldOptions);
    if (!loaded.ok) {
      renderFatalError(
        loaded.error.code === 'save_from_newer_version'
          ? 'This save was written by a newer version of the game.'
          : 'Your save could not be loaded, and the backup also failed.',
        `${loaded.error.message} — your save files were left untouched.`,
      );
      return;
    }
    world = loaded.value.world;
    session = {
      createdAtUnixMs: loaded.value.meta.createdAtUnixMs,
      saveCount: loaded.value.meta.saveCount,
      quarantine: loaded.value.quarantine,
    };
    lastLoadNote = [
      loaded.value.usedBackup ? 'loaded from backup' : 'loaded',
      ...loaded.value.migrationsApplied,
      ...loaded.value.repairs.map((repair) => `repair ${repair.rule}: ${repair.detail}`),
    ].join('; ');
  }

  composeApplication(world, session);
}

/** A load/boot failure the player can actually read (ADR-015 §7). */
function renderFatalError(headline: string, detail: string): void {
  const container = document.getElementById('ui');
  if (container === null) return;
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'position:absolute;inset:8px;display:flex;flex-direction:column;gap:4px;' +
    'align-items:center;justify-content:center;text-align:center;color:#f3ead9;' +
    'background:rgba(38,34,44,0.92);border-radius:8px;font:13px system-ui;padding:12px;';
  const title = document.createElement('strong');
  title.textContent = headline;
  const message = document.createElement('span');
  message.textContent = detail;
  box.append(title, message);
  container.append(box);
}

function composeApplication(world: World, session: SaveSession): void {
  const store = createSnapshotStore(world.snapshots);
  const overlay = createOverlayController(window.desktopLife.overlay);
  // Desktop-companion state (01.8a): app preferences behind main-process IPC —
  // the one controller whose writes never touch the world (ADR-014 §3).
  const companion = createCompanionController(window.desktopLife.companion);
  // Worker selection is presentation state, shared by the renderer (which draws
  // the selection box) and React (which shows the selected worker's state/task).
  const selection = createWorkerSelection();
  // Placement mode is the same kind of shared presentation state: React's build
  // button arms a building, the renderer's ghost previews it. The hovered tile
  // lives here in the wiring, not in the store, so React does not re-render on
  // pointer movement.
  const placement = createPlacementController();
  let hoveredTile: TileIndex | null = null;

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
    selectedWorkerId: () => selection.selected(),
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
  // and automation will use — no privileged variant exists (ADR-010 §6). Shared
  // between tile interaction and the HUD (the hire button dispatches through it).
  const playerSource = createPlayerInputSource(world.commands);
  // Which crop the seed tool plants — presentation state shared between the
  // shop panel's selector and the click mapping (06e).
  const seeds = createSeedSelection();
  const playerInput = createPlayerInput({
    source: playerSource,
    seed: () => seeds.selected(),
    onChange: (state) => worldMount.current()?.setHighlight(toHighlight(state)),
  });

  // The build ghost. `syncGhost` resolves the armed building's sprite and asks
  // the command validator whether it may go on the hovered tile, then pushes
  // the result to the view. Legality is `preview` — the same rule the placement
  // dispatch runs (ADR-010 §6) — so a green ghost is exactly a tile that places.
  const spriteFor = (buildingId: ContentId): string => {
    const definition = world.buildingRegistry.get(buildingId);
    return definition.ok ? definition.value.sprite : '';
  };
  const syncGhost = (): void => {
    const ghost = ghostFor(
      placement.active(),
      hoveredTile,
      (command) => world.commands.preview(command),
      spriteFor,
    );
    worldMount.current()?.setGhost(ghost);
  };
  // Arming a building drops any held tool — you place or you till, not both —
  // and re-pushes the ghost (clearing it when disarming).
  placement.subscribe(() => {
    if (placement.active() !== null) playerInput.selectTool(null);
    syncGhost();
  });

  // Teardown is intentionally not held: these listeners live for the process,
  // exactly like the resize handler below. Pointer actions stay attached while
  // collapsed, where `tileAt` returns null and every click is a no-op.
  attachPointerActions({
    target: document.body,
    input: playerInput,
    view: () => worldMount.current(),
    // A click on a worker selects it (and does not act on the tile); Esc clears.
    selectWorkerAt: (tile) => {
      const id = workerAtTile(world.snapshots.workers.value, tile);
      if (id === null) return false;
      selection.select(id);
      return true;
    },
    clearSelection: () => {
      selection.select(null);
    },
    placement: {
      active: () => placement.active() !== null,
      hover: (tile) => {
        hoveredTile = tile;
        syncGhost();
      },
      place: (tile) => {
        const buildingId = placement.active();
        if (buildingId === null) return;
        // The same write path as every other action (ADR-010 §6): submit and
        // let validation decide. An invalid tile — one the ghost paints amber —
        // is simply rejected. Placement stays armed for the next tile.
        playerSource.submit({ type: 'placeBuilding', tile, buildingId });
      },
      cancel: () => {
        placement.deactivate();
      },
    },
  });

  // A selection change is a scene change even when the worker is standing still,
  // so wake the render-on-demand gate to draw (or clear) the selection box.
  selection.subscribe(() => worldMount.current()?.gate.markDirty());

  // Work mode strips presentation adornments the React unmount cannot reach:
  // the selection box, the armed tool's hover highlight, and the build ghost
  // all live in the world view (fix/0.1/1.8.md §5 — hide selection outlines,
  // disable non-essential effects). Idempotent and cheap, so it simply runs
  // on every companion notify while the mode is active.
  companion.subscribe(() => {
    if (!companion.workMode()) return;
    selection.select(null);
    placement.deactivate();
    playerInput.selectTool(null);
  });

  const loop = createGameLoop({
    world,
    store,
    // Returning false when nothing was drawn keeps the FPS metric honest: a
    // static world reads 0 fps, which is the intended behaviour, not a stall.
    onFrame: (alpha, tick) => worldMount.current()?.renderFrame(alpha, tick) ?? false,
  });
  loop.start();

  // The save path (phase-07c): main asks, the renderer answers — every
  // trigger (quit, tray, the 07e autosave timers) arrives as this ONE
  // request, so there is exactly one serialization site. Meta continuity:
  // `createdAtUnixMs` is the loaded value forever; `saveCount` increments
  // only on a successful write; the held quarantine writes back verbatim
  // until its content returns (`SAVE_FORMAT.md` §5.3).
  const performSave = async (): Promise<void> => {
    const meta: SaveMeta = {
      gameVersion: __APP_VERSION__,
      createdAtUnixMs: session.createdAtUnixMs,
      savedAtUnixMs: Date.now(),
      playtimeTicks: world.tick,
      saveCount: session.saveCount + 1,
    };
    const outcome = await window.desktopLife.save.write(
      toSaveDocument(world, meta, session.quarantine),
    );
    if (outcome.ok) {
      session.saveCount += 1;
    } else {
      // Recorded, not discarded — the player-facing notification is 07e's.
      lastLoadNote = `save failed: ${outcome.error}`;
    }
  };
  window.desktopLife.save.onSaveRequested(() => {
    void performSave();
  });

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
      <AppProviders
        store={store}
        overlay={overlay}
        player={playerSource}
        seeds={seeds}
        selection={selection}
        placement={placement}
        companion={companion}
      >
        <App />
      </AppProviders>
    </StrictMode>,
  );

  void mountDevTools({
    simulation: loop,
    world: () => worldMount.current(),
    worldError: () => lastWorldError,
    commandRejection: () => lastCommandRejection,
    saveNote: () => lastLoadNote,
    // The console's `money` command submits through the ordinary player
    // source — no privileged write path (ADR-010 §6).
    submitCommand: (command) => playerSource.submit(command),
    appVersion: __APP_VERSION__,
    reload: () => {
      window.location.reload();
    },
  });
}
