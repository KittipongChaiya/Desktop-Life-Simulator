/**
 * The v0.4 tick, in the running app. Phase-29 — ADR-003 §2.
 *
 * **This measurement decides the phase.** ADR-003 pre-committed the trigger for
 * moving the simulation off the main thread — *"a p99 tick exceeding 3 ms, or
 * tick execution measurably delaying frame presentation"* — and sequenced
 * phase 29 here, at the end of v0.4, so the version's own load finally exists
 * to test it against. The number is recorded either way.
 *
 * ## Why this is not criterion 5
 *
 * Criterion 5 measures a v0.2 farm. This measures **everything v0.4 added at
 * once**, in a save the game could genuinely have written:
 *
 * - a mature farm with a crew working it;
 * - a three-step production chain — shed → mill → kitchen — with both links
 *   ROUTED, so haulers are moving goods every tick (phase 26);
 * - a forager working the wilds, so the gather band's scan runs (phase 27);
 * - a hand away on an expedition, so the expedition system has a table to walk
 *   (phase 28);
 * - and accepted contracts, so the docket and quest steps have work.
 *
 * All of it under the same maximum presentation load criterion 12 uses: expanded,
 * every motion class on, the debug overlay open.
 *
 * ## Why it is measured in the APP and not headless
 *
 * `PERFORMANCE.md` §16 has the headless figure (p99 0.53 ms) and it is not the
 * one the trigger is about. ADR-003's second clause — *"tick execution
 * measurably delaying frame presentation"* — only exists where a renderer and a
 * simulation share a thread, which is exactly what this build does and a
 * headless run does not.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type ElectronApplication } from '@playwright/test';

import '../../plugins/core';
import { serializeSave, toSaveDocument } from '../../src/persistence/serialize';
import { WILDS_MIN_X, WORLD_WIDTH } from '../../src/shared/constants';
import { toIndexUnchecked } from '../../src/shared/geometry';
import { placeBuilding } from '../../src/sim/commands/building-commands';
import { acceptContract } from '../../src/sim/commands/contract-commands';
import { plantCrop, tillTile } from '../../src/sim/commands/crop-commands';
import { sendExpedition } from '../../src/sim/commands/expedition-commands';
import { setFactoryRecipe } from '../../src/sim/commands/factory-commands';
import { hireWorker } from '../../src/sim/commands/worker-commands';
import {
  CORE_KITCHEN,
  CORE_MARKET_STALL,
  CORE_MILL,
  CORE_REST_HUT,
  CORE_SEED_BIN,
  CORE_STORAGE_SHED,
} from '../../src/sim/content/buildings';
import { CORE_WHEAT } from '../../src/sim/content/crops';
import { CORE_RIVER_DELTA } from '../../src/sim/content/expeditions';
import { CORE_WHEAT as CORE_WHEAT_ITEM, CORE_WHEAT_SEED } from '../../src/sim/content/items';
import { CORE_BAKE_BREAD, CORE_GRIND_FLOUR } from '../../src/sim/content/recipes';
import { stepSimulationBy } from '../../src/sim/tick';
import { offersForDay } from '../../src/sim/town/offers';
import { addItems } from '../../src/sim/world/container';
import { asRouteId } from '../../src/sim/world/route';
import { WorkerTaskKind } from '../../src/sim/world/worker';
import { createWorld, type World } from '../../src/sim/world/world';

import { waitForDevTools } from './framing';
import { launchIsolated, type IsolatedSession } from './isolated-profile';

let app: ElectronApplication;
let session: IsolatedSession;

const REPORT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'perf');

/** How long the histogram is left to fill. At 20 Hz, ~1,200 samples. */
const SETTLE_MS = 60_000;

function report(name: string, data: unknown): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

/** A metric row from the F3 overlay, as text. */
async function metric(label: string): Promise<string> {
  const window = await app.firstWindow();
  return window.evaluate((wanted) => {
    const rows = document.querySelectorAll('[data-testid="debug-overlay"] section div');
    for (const row of rows) {
      const content = row.textContent ?? '';
      if (content.startsWith(wanted)) return content.slice(wanted.length);
    }
    return '';
  }, label);
}

async function metricNumber(label: string): Promise<number> {
  return Number.parseFloat((await metric(label)).replace(/[^0-9.-]/g, ''));
}

/**
 * A world with everything v0.4 shipped, running at once.
 *
 * Built by playing it rather than by writing state: every building is placed
 * through its command, every crop planted through its command, and the whole
 * thing is stepped so workers, factories and haulers hold believable state.
 * A hand-assembled save would measure a shape the game cannot reach.
 */
function v04World(): World {
  const world = createWorld(4242);
  world.wallet.coins = 5_000_000;
  addItems(world.inventory, CORE_WHEAT_SEED, 99, 99);
  addItems(world.inventory, CORE_WHEAT_ITEM, 99, 99);

  // The farm's own buildings, then the chain.
  // The starting plot is 8x8 centred at (32, 32), so x and y both run 28..35.
  //
  // FOOTPRINT-AWARE since phase-41 (ADR-042 §3). These used to sit in a single
  // row one tile apart, which was correct when every building was one tile;
  // the shed is 2x2 now, the stall and kitchen 3x2, the hut 2x2 and the mill
  // 3x3, and a footprint grows UP and RIGHT from its origin. Three rows, with
  // each origin checked against its neighbours' rectangles.
  const shed = placeBuilding(world, toIndexUnchecked(28, 30), CORE_STORAGE_SHED);
  placeBuilding(world, toIndexUnchecked(30, 30), CORE_SEED_BIN);
  placeBuilding(world, toIndexUnchecked(32, 30), CORE_REST_HUT);
  const mill = placeBuilding(world, toIndexUnchecked(28, 33), CORE_MILL);
  const kitchen = placeBuilding(world, toIndexUnchecked(31, 33), CORE_KITCHEN);
  placeBuilding(world, toIndexUnchecked(31, 35), CORE_MARKET_STALL);
  expect([shed.ok, mill.ok, kitchen.ok]).toEqual([true, true, true]);

  const ids = [...world.buildings.entries()];
  const shedId = ids.find(([, b]) => b.buildingId === CORE_STORAGE_SHED)![0];
  const millId = ids.find(([, b]) => b.buildingId === CORE_MILL)![0];
  const kitchenId = ids.find(([, b]) => b.buildingId === CORE_KITCHEN)![0];
  expect(setFactoryRecipe(world, millId, CORE_GRIND_FLOUR).ok).toBe(true);
  expect(setFactoryRecipe(world, kitchenId, CORE_BAKE_BREAD).ok).toBe(true);

  // Both links ROUTED, so haulers work every tick (phase 26).
  world.routes.set(asRouteId(1), {
    id: asRouteId(1),
    from: shedId,
    to: millId,
    item: CORE_WHEAT_ITEM,
  });
  const grind = world.recipeRegistry.get(CORE_GRIND_FLOUR);
  expect(grind.ok).toBe(true);
  if (!grind.ok) throw new Error('core:grind_flour must be registered');
  world.routes.set(asRouteId(2), {
    id: asRouteId(2),
    from: millId,
    to: kitchenId,
    item: grind.value.outputs[0]!.item,
  });
  addItems(world.buildingStorage.get(shedId)!, CORE_WHEAT_ITEM, 200, 99);

  // A planted farm.
  for (let i = 0; i < 36; i += 1) {
    const tile = toIndexUnchecked(28 + (i % 6), 30 + Math.floor(i / 6));
    tillTile(world, tile);
    plantCrop(world, tile, CORE_WHEAT);
  }

  // Six hands: four on the farm, one foraging the wilds, one going away.
  for (let i = 0; i < 6; i += 1) {
    expect(hireWorker(world, toIndexUnchecked(34, 28)).ok).toBe(true);
  }
  const crew = [...world.workers.values()];
  crew[4]!.schedule = { taskKinds: [WorkerTaskKind.Gather] };

  // Let it run so nothing is in a first-tick state.
  stepSimulationBy(world, 4_000);

  // Contracts on the docket, so the board and quest steps have work.
  for (const offer of offersForDay(world, 0)) acceptContract(world, offer.offerId);

  // And a hand away — done last, since it needs an empty hold.
  const traveller = crew.find((worker) => worker.carrying.stacks.length === 0);
  if (traveller !== undefined) sendExpedition(world, traveller.id, CORE_RIVER_DELTA);

  return world;
}

test('the v0.4 tick against ADR-003 §2, in the running app', async () => {
  test.setTimeout(300_000);

  const world = v04World();
  // The wilds must actually hold something, or the gather band measures nothing.
  let nodes = 0;
  for (let y = 0; y < world.tiles.height; y += 1) {
    for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
      if (world.harvestedAt.has(toIndexUnchecked(x, y))) nodes += 1;
    }
  }

  session = await launchIsolated({}, (userData) => {
    mkdirSync(join(userData, 'saves'), { recursive: true });
    writeFileSync(
      join(userData, 'saves', 'slot-0.json'),
      serializeSave(
        toSaveDocument(world, {
          gameVersion: '0.4.0',
          createdAtUnixMs: 1_753_000_000_000,
          // Now, so loading performs no catch-up: this measures the LIVE tick.
          savedAtUnixMs: Date.now(),
          playtimeTicks: world.tick,
          saveCount: 1,
        }),
      ),
      'utf8',
    );
  });
  app = session.app;

  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');
  await waitForDevTools(window);
  const hasDevTools = await window.evaluate(() => document.getElementById('devtools') !== null);
  test.skip(
    !hasDevTools,
    'ENVIRONMENT-BLOCKED: needs `VITE_FEATURE_DEBUG=true npm run build` — every ' +
      'metric here is read from the F3 overlay, which a production build strips.',
  );

  // Expanded, every motion class on, overlay open — criterion 12's load.
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: {
          overlay: { setCollapsed(c: boolean): Promise<unknown> };
          companion: { setMotion(p: unknown): Promise<unknown> };
        };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(false);
    await api.companion.setMotion({
      environmentEnabled: true,
      effectsEnabled: true,
      shakeEnabled: true,
      reducedMotion: false,
    });
  });
  await window.waitForTimeout(3_500);
  await window.keyboard.press('F3');
  await window.waitForSelector('[data-testid="debug-overlay"]');
  await window.waitForTimeout(SETTLE_MS);

  const measured = {
    scenario: 'v0.4 full load — chain routed, forager, expedition out, contracts accepted',
    workers: world.workers.size,
    crops: world.crops.size,
    buildings: world.buildings.size,
    routes: world.routes.size,
    expeditions: world.expeditions.size,
    workedWildTiles: nodes,
    p50Ms: await metricNumber('Tick p50'),
    p95Ms: await metricNumber('Tick p95'),
    p99Ms: await metricNumber('Tick p99'),
    avgMs: await metricNumber('Tick avg'),
    maxMs: await metricNumber('Tick max'),
    samples: await metricNumber('Tick samples'),
    fps: await metricNumber('FPS'),
    // The renderer's own account of itself, recorded so a zero below is
    // self-explaining. `Backend` reads the live view, falling back to the last
    // mount error and then to "not mounted" — so a run where the GPU went away
    // says which of those happened instead of leaving a bare 0 to be guessed
    // at. This spec once failed on `visibleSprites` alone and the reason had
    // to be reconstructed from the source.
    backend: await metric('Backend'),
    // v0.4 criterion 3 — "entity and building counts stay within budget".
    // Read from the same overlay, in the same run, so the tick figure and the
    // scene it was measured against are one measurement rather than two.
    visibleSprites: await metricNumber('Visible sprites'),
    liveWorkers: await metricNumber('Workers'),
    liveCrops: await metricNumber('Crops'),
    liveBuildings: await metricNumber('Buildings'),
    containers: await metricNumber('Containers'),
  };
  report('phase-29-v04-tick', measured);

  // Enough samples that the percentile means anything.
  expect(measured.samples).toBeGreaterThan(500);
  // ADR-003 §2's trigger. This assertion PASSING means phase 29's second half
  // does not run; it failing means the worker migration is due, and either
  // outcome is the phase's deliverable.
  expect(measured.p99Ms).toBeLessThan(3);

  // v0.4 criterion 3. `PERFORMANCE.md` §65's draw-call ceiling is written on
  // BATCHES rather than sprites, and sprites are what the overlay exposes —
  // so this is asserted against the scene-graph ceiling the decor system's own
  // `MAX_DECOR` reasoning uses: a few hundred is a batch, thousands is a
  // rewrite. The wilds alone add ~276 static nodes, which is the number this
  // criterion existed to catch.
  expect(
    measured.visibleSprites,
    `no sprites in the scene; the renderer reports backend "${measured.backend}"`,
  ).toBeGreaterThan(0);
  expect(measured.visibleSprites).toBeLessThan(2_000);
});

test.afterEach(async () => {
  // Guarded: the world builder runs BEFORE the app launches, so a failure
  // there leaves no session to dispose and an unguarded teardown replaces the
  // real error with a TypeError.
  await session?.dispose();
});
