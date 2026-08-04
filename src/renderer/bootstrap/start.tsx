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

import { FEATURE_DEBUG, FEATURE_PROFILER } from '@devtools/flags';
import { createDurationHistogram } from '@devtools/metrics/histogram';
import { catchUpWorld, computeElapsedTicks, type CatchUpReport } from '@persistence/catch-up';
import { loadWorld } from '@persistence/load';
import { EMPTY_QUARANTINE, type SaveMeta, type SaveQuarantine } from '@persistence/schema';
import { toSaveDocument } from '@persistence/serialize';
import type { SaveWriteOutcome } from '@shared/ipc/contract';
import { createWorld, type World, type WorldOptions } from '@sim/world/world';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { asTileIndex, type ContentId, type TileIndex } from '../../shared/ids';
import { intensityScale } from '../../shared/motion';
import { createActionFeedback } from '../app/action-feedback';
import { App } from '../app/App';
import { createSoundBus } from '../app/audio';
import { createCompanionController } from '../app/companion-controller';
import { applyMotionAttribute } from '../app/motion-attribute';
import { createOverlayController } from '../app/overlay-controller';
import { createPlacementController } from '../app/placement';
import { createReturnSummary, type ReturnSummaryReport } from '../app/return-summary';
import { createSaveController } from '../app/save-controller';
import { createSeedSelection } from '../app/seed-selection';
import { Sound } from '../app/sounds';
import { AppProviders } from '../app/store-context';
import { createToolSelection } from '../app/tool-selection';
import { watchMajorTransactions } from '../app/transaction-watch';
import { createWorkerSelection } from '../app/worker-selection';
import {
  DEFAULT_SHAKE,
  HARVEST_BURST_MS,
  LARGE_HARVEST_COUNT,
  PLACEMENT_SHAKE,
} from '../render/camera-shake';
import { EffectKind } from '../render/effect-state';
import { FloatingKind } from '../render/floating-number-state';
import { workerAtTile } from '../render/worker-render';

import { createPlayerInputSource } from './command-dispatch';
import { mountDevTools } from './devtools-mount';
import { createGameLoop } from './game-loop';
import { ghostFor } from './placement-preview';
import { createPlayerInput } from './player-input';
import { attachPointerActions, toHighlight } from './pointer-actions';
import { createSnapshotStore } from './snapshot-store';
import { createWebAudioPorts } from './web-audio';
import { countContainers } from './world-counts';
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

/** The offline catch-up result, for the devtools load note. */
let lastCatchUp: CatchUpReport | null = null;

/**
 * The same result as the §9.4 summary shows it (07e).
 *
 * Mapped HERE, at the composition root, because this is the only place that
 * may see both sides: the UI layer cannot import persistence, and persistence
 * has no business knowing a summary exists. The mapping also converts the
 * blocker's absolute `atTick` into ticks-into-the-gap, which is the only form
 * a view can render.
 */
let lastSummary: ReturnSummaryReport | null = null;

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
/**
 * Why the last action was refused (07.5i). Created at module scope because
 * `worldOptions` closes over it before the composition root runs — execution
 * rejections can arrive from the very first tick.
 */
const actionFeedback = createActionFeedback();

async function bootApplication(): Promise<void> {
  // Execution-time command rejections are injected here, at the construction
  // boundary. The world reports a `Command` and an `AppError` and knows nothing
  // about a view; deciding that this becomes a log line is the composition
  // root's job, not the simulation's (ADR-010 §7).
  const worldOptions: WorldOptions = {
    onExecutionRejected: (command, error) => {
      lastCommandRejection = `${command.type}: ${error.code}`;
      // AND tell the player (07.5i). This callback previously only fed a
      // devtools metric, under a comment admitting these had "nowhere to
      // surface until the HUD arrives in phase-05". The HUD arrived; they
      // never surfaced, so a command that failed a tick after the click
      // looked exactly like a dead click.
      actionFeedback.report(error);
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

    // OFFLINE PROGRESS (07d): the one place wall clock meets the world —
    // computed closed-form, capped at 8 hours, never rewinding
    // (`SAVE_FORMAT.md` §6). Runs before the loop's first tick so the
    // player's first frame already shows the caught-up farm.
    // Captured before the advance: the blocker's absolute `atTick` is only
    // meaningful to a player relative to when the gap began.
    const startTick = world.tick;
    const elapsed = computeElapsedTicks(loaded.value.meta.savedAtUnixMs, Date.now());
    if (elapsed > 0) {
      lastCatchUp = catchUpWorld(world, elapsed);
      lastSummary = {
        elapsedTicks: lastCatchUp.elapsedTicks,
        harvests: lastCatchUp.harvests,
        coinsEarned: lastCatchUp.coinsEarned,
        blockedAfterTicks:
          lastCatchUp.blocked === null ? null : Math.max(0, lastCatchUp.blocked.atTick - startTick),
      };
    }

    lastLoadNote = [
      loaded.value.usedBackup ? 'loaded from backup' : 'loaded',
      ...(lastCatchUp !== null
        ? [
            `offline +${String(lastCatchUp.elapsedTicks)}t: ` +
              `${String(lastCatchUp.harvests)} harvested, ` +
              `${String(lastCatchUp.coinsEarned)}g earned` +
              (lastCatchUp.blocked !== null ? ` (blocked: ${lastCatchUp.blocked.reason})` : ''),
          ]
        : []),
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

  // Sound (07.5a, ADR-016). The bus reads the companion's dials at PLAY time,
  // so a volume change or a work-mode toggle takes effect on the next sound
  // without anything re-subscribing. Audio is presentation and reaches the
  // simulation nowhere: the sim cannot know sound exists (ADR-007 §1).
  const sound = createSoundBus(createWebAudioPorts(), {
    volumePercent: () => companion.volumePercent(),
    muted: () => companion.muted(),
    workMode: () => companion.workMode(),
  });
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
    // The accessibility settings, finally reaching the thing they govern
    // (07.7d-bis). Read per animation rather than captured, so toggling
    // Reduced Motion takes effect on the next frame without a remount.
    motionIntensity: () => intensityScale(companion.motion().intensityPercent),
    particlesEnabled: () => companion.motion().particles,
    creaturesEnabled: () => companion.motion().decorativeCreatures,
    shakeEnabled: () => companion.motion().cameraShake,
    environmentEnabled: () => companion.motion().environmental,
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
  // The held tool, shared between the tool bar and the click mapping (07.5h).
  const tools = createToolSelection();
  const playerInput = createPlayerInput({
    source: playerSource,
    seed: () => seeds.selected(),
    tools,
    // Rejected at dispatch: the tile outline alone read as a dead click.
    onRejected: (error) => {
      actionFeedback.report(error);
    },
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

  // TICK INSTRUMENTATION (07.7M1). `FEATURE_PROFILER` is a compile-time
  // literal, so in a release build this is `null`, the loop takes its
  // un-instrumented branch, and Rollup drops the histogram module entirely.
  const tickHistogram = FEATURE_PROFILER ? createDurationHistogram() : null;

  const loop = createGameLoop({
    world,
    store,
    // Returning false when nothing was drawn keeps the FPS metric honest: a
    // static world reads 0 fps, which is the intended behaviour, not a stall.
    onFrame: (alpha, tick) => worldMount.current()?.renderFrame(alpha, tick) ?? false,
    // Absent in a release build, which is what keeps the loop's fast path free.
    ...(tickHistogram === null
      ? {}
      : {
          onTickDuration: (ms: number) => {
            tickHistogram.record(ms);
          },
        }),
  });
  loop.start();

  // The save path (phase-07c): main asks, the renderer answers — every
  // trigger arrives at this ONE serialization site, so there is exactly one
  // place a save document is built. Meta continuity: `createdAtUnixMs` is the
  // loaded value forever; `saveCount` increments only on a successful write;
  // the held quarantine writes back verbatim until its content returns
  // (`SAVE_FORMAT.md` §5.3).
  const writeSave = async (): Promise<SaveWriteOutcome> => {
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
    if (outcome.ok) session.saveCount += 1;
    return outcome;
  };

  // The 07e orchestration: one write in flight, extra triggers coalesced,
  // serialization deferred out of the frame that asked for it, failures kept
  // as status for the notification (`SAVE_FORMAT.md` §7.2/§7.3).
  const save = createSaveController({
    write: writeSave,
    // A macrotask, deliberately not a microtask: a microtask would still run
    // inside the frame that queued it, which is exactly what "off the render
    // path" forbids.
    defer: (run) => {
      setTimeout(run, 0);
    },
  });

  // Trigger 1 — everything main owns: the 60-second cadence, quit,
  // close-to-tray (`save-triggers.ts`).
  window.desktopLife.save.onSaveRequested(() => {
    save.requestSave();
  });

  // Trigger 2 — major transactions, seen in the snapshot rather than guessed
  // from commands, because a rejected purchase must not trigger a save.
  watchMajorTransactions(store, () => {
    save.requestSave();
  });

  // SOUND WIRING (07.5a). Every trigger is something that ALREADY HAPPENED —
  // a published event or a settled snapshot — never an intent, so a rejected
  // command is silent and the farm never lies about what it did.
  /**
   * Throws particles at a tile.
   *
   * Brevity only — the accessibility gate lives in the world view, because the
   * stage-change sparkle is raised inside it and a caller-side check would
   * silently miss that one.
   */
  /** Harvests seen inside the current burst window (07.7g). */
  let harvestBurstCount = 0;
  let harvestBurstStartedAt = 0;

  const emitParticles = (kind: EffectKind, tile: TileIndex, count: number): void => {
    worldMount.current()?.emitParticles(kind, tile, count);
  };

  // Tilled soil. The terrain is cached per 16x16 chunk, so a tile that changes
  // is invisible until its chunk is marked stale — and until now NOTHING in the
  // application called `invalidateTile`, which is why tilling produced no
  // visual change at all. One till costs one chunk redraw, as designed.
  world.events.subscribe('tileTilled', (event) => {
    sound.play(Sound.Till);
    worldMount.current()?.invalidateTile(asTileIndex(event.tile));
    // Turned earth (07.7d). The soil changing colour is the result; the puff
    // is the moment, and it is what makes a hoe feel like it struck something.
    emitParticles(EffectKind.Dust, asTileIndex(event.tile), 5);
  });

  // A seed going in. The crop's own sprite presses in from small (crop-view's
  // spawn curve); this is the soil it disturbed on the way.
  world.events.subscribe('cropPlanted', (event) => {
    sound.play(Sound.Plant);
    emitParticles(EffectKind.Dust, asTileIndex(event.tile), 3);
  });

  world.events.subscribe('cropHarvested', (event) => {
    sound.play(Sound.Harvest);
    // The burst lands on the tile that was actually harvested — the event
    // carries it, so the acknowledgement is never guessed from a selection or
    // a cursor position.
    worldMount.current()?.playEffect('burst', asTileIndex(event.tile));

    // What the harvest actually yielded, over the tile it came from (07.7c).
    // The event carries both, so the number is never guessed from a selection
    // — and a harvest the player did not cause still shows where it happened.
    const gained = event.yields.reduce((total, stack) => total + stack.quantity, 0);
    worldMount.current()?.showNumber(FloatingKind.Item, asTileIndex(event.tile), gained);
    // Foliage disturbed by the pick, on top of the existing burst.
    emitParticles(EffectKind.Leaves, asTileIndex(event.tile), 6);

    // A LARGE harvest shakes the camera — several landing together, which in
    // practice means a mature farm ripening at once or an offline catch-up
    // settling. A single crop is the routine case and must stay silent: a farm
    // that jolts every few seconds is unusable as a companion.
    const now = performance.now();
    if (now - harvestBurstStartedAt > HARVEST_BURST_MS) {
      harvestBurstStartedAt = now;
      harvestBurstCount = 0;
    }
    harvestBurstCount += 1;
    if (harvestBurstCount === LARGE_HARVEST_COUNT) {
      worldMount.current()?.shakeCamera(DEFAULT_SHAKE, event.tile);
    }
  });
  world.events.subscribe('itemSold', (event) => {
    sound.play(Sound.Coin);

    // Coins land where the sale happened (07.7d), which is the market stall —
    // the one place in the world a sale is visible. A manual sale with no
    // stall built has no world location, and gets no world effect: the coin
    // sound and the wallet readout already say it happened, and inventing a
    // position would be the farm pointing at nothing.
    const stall = store.get('buildings').find((b) => b.buildingId === 'core:market_stall');
    if (stall === undefined) return;

    const tile = asTileIndex(stall.tile);
    emitParticles(EffectKind.CoinBurst, tile, 6);
    worldMount.current()?.showNumber(FloatingKind.Coins, tile, event.coins);
  });

  // A deposit is the moment goods reach the player's holdings — which is
  // exactly the inventory slice growing. Harvest fires at the crop and this
  // fires at the shed, far enough apart that they never read as one doubled
  // sound.
  //
  // Counted in QUANTITY, not slots: topping up a partial stack is a deposit
  // the player watched happen, and `usedSlots` would not move for it.
  const heldQuantity = (): number =>
    store.get('inventory').stacks.reduce((total, stack) => total + stack.quantity, 0);
  let held = heldQuantity();
  store.subscribe('inventory', () => {
    const now = heldQuantity();
    if (now > held) sound.play(Sound.Deposit);
    held = now;
  });

  // A building APPEARING — not a placement being attempted. The ghost paints
  // amber for illegal tiles and the dispatch rejects them; neither makes noise.
  let knownBuildings = new Set(store.get('buildings').map((building) => building.id));
  store.subscribe('buildings', () => {
    const current = store.get('buildings');
    // Diffed by ID rather than counted, so the ring lands on the building
    // that actually appeared rather than on the last one in the list.
    const arrived = current.filter((building) => !knownBuildings.has(building.id));
    knownBuildings = new Set(current.map((building) => building.id));
    if (arrived.length === 0) return;

    sound.play(Sound.Placement);
    for (const building of arrived) {
      worldMount.current()?.playEffect('ring', asTileIndex(building.tile));
    }
    // Focus the FIRST arrival only. Placing several at once is possible; a
    // camera that then chases each in turn is motion sickness, not help.
    const first = arrived[0];
    if (first === undefined) return;

    worldMount.current()?.focusOnTile(asTileIndex(first.tile));
    // And one rattle for the batch (07.7g) — a building landing is the
    // heaviest thing the player does, and shaking once per arrival would turn
    // a multi-placement into an earthquake.
    worldMount.current()?.shakeCamera(PLACEMENT_SHAKE, first.tile);
  });

  // The HUD's polish lives in CSS, so the motion setting has to reach CSS
  // (07.7h). Published on change only — a per-frame attribute write would
  // invalidate style every frame, which is a per-frame render wearing a
  // different hat.
  const publishMotion = (): void => {
    applyMotionAttribute(document.documentElement, companion.motion());
  };
  publishMotion();
  companion.subscribe(publishMotion);

  selection.subscribe(() => {
    // Selecting, not clearing: Esc should be quiet and unmarked.
    const selected = selection.selected();
    if (selected === null) return;

    sound.play(Sound.Selection);
    const worker = store.get('workers').find((candidate) => candidate.id === selected);
    if (worker === undefined) return;

    worldMount.current()?.playEffect('ring', asTileIndex(worker.tile));
    // The view declines to move when the worker is already on screen, which is
    // the common case for a worker the player just clicked. It matters for the
    // other route in: selecting from the worker PANEL, where the worker may be
    // anywhere (`fix/0.1/7.5.md` §Camera — focus when a worker is selected).
    worldMount.current()?.focusOnTile(asTileIndex(worker.tile));
  });

  save.subscribe(() => {
    if (save.status().state === 'failed') sound.play(Sound.Error);
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

  // The §9.4 return summary. The controller applies the over-a-minute gate,
  // so a plain relaunch holds nothing and shows nothing.
  const returnSummary = createReturnSummary(lastSummary);
  // The one sound that greets the player rather than answering them. It plays
  // only when there is genuinely something to report — the controller has
  // already applied the over-a-minute gate — so a plain relaunch is silent.
  if (returnSummary.report() !== null) sound.play(Sound.Notification);

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
        save={save}
        returnSummary={returnSummary}
        sound={sound}
        tools={tools}
        actionFeedback={actionFeedback}
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
    ...(tickHistogram === null ? {} : { tickHistogram }),
    // Read-only counts for the overlay (07.8a), built ONLY in a debug build.
    //
    // Spread behind the flag rather than passed unconditionally: an object
    // literal at this call site is constructed whatever `mountDevTools` does
    // with it, so the closures — and `world-counts.ts` with them — would
    // survive into production. ADR-018 §6 says removed, not disabled, and
    // the acceptance check measured 178 bytes of exactly that before this.
    ...(FEATURE_DEBUG
      ? {
          worldCounts: {
            visibleSprites: () => worldMount.current()?.visibleSpriteCount() ?? 0,
            workers: () => store.get('workers').length,
            crops: () => store.get('crops').length,
            buildings: () => store.get('buildings').length,
            // Derived rather than projected, so it lives in a tested module.
            containers: () => countContainers(store.get('workers').length, store.get('buildings')),
            eventQueue: () => world.events.pending(),
            commandQueue: () => world.commands.pending(),
          },
          // What the world and entity inspectors read (07.8c, 07.8d). `World`
          // satisfies the source interfaces structurally, and those interfaces
          // declare only fields the inspectors read — they answer questions and
          // hand back strings, never a store a panel could write through
          // (ADR-018 §2). `views` is the published slice, so picking a worker
          // agrees with the one drawn on screen.
          // The event monitor's subscription (07.8e, ADR-018 §10). A bus and a
          // clock: the monitor consumes and cannot produce.
          eventSource: { bus: world.events, tick: () => world.tick },
          inspectors: {
            source: () => world,
            views: () => store.get('workers'),
            tileAt: (x: number, y: number) => worldMount.current()?.tileAt(x, y) ?? null,
          },
        }
      : {}),
    appVersion: __APP_VERSION__,
    reload: () => {
      window.location.reload();
    },
  });
}
