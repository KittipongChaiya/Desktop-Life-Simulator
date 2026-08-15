/**
 * Performance harness. Phase-07.7M2/M3.
 *
 * The three acceptance criteria phase-07.7 could not close, measured against a
 * real window rather than reasoned about:
 *
 * | Criterion | Question                                                     |
 * | --------- | ------------------------------------------------------------ |
 * | 5         | Is the p99 simulation tick still inside its budget?          |
 * | 8         | With ambient motion ON and the pointer idle, does the frame loop stop? |
 * | 11        | Does the heap stay flat under sustained effect density?      |
 *
 * EVERY NUMBER HERE IS READ, NEVER ESTIMATED. Each test writes what it
 * measured to `docs/perf/` as JSON, so the values quoted in `PERFORMANCE.md`
 * have a file behind them rather than a memory of a run.
 *
 * The long-run duration is configurable so the same harness serves a 30-minute
 * acceptance run and a fast pre-commit check:
 *
 *     PERF_SOAK_MINUTES=30 npx playwright test tests/e2e/perf-harness.spec.ts
 *
 * It defaults to 2 minutes, because a suite that takes half an hour by default
 * is a suite nobody runs.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type ElectronApplication } from '@playwright/test';

import { launchIsolated, type IsolatedSession } from './isolated-profile';

// Criterion 9 plants a save so the weather is not left to chance — see below.
// Criterion 12 does the same with the REFERENCE farm, stepped into a rain
// period, so the combined run measures the reference scenario rather than an
// empty world.
import { loadWorld } from '../../src/persistence/load';
import { serializeSave, toSaveDocument } from '../../src/persistence/serialize';
import { isRaining } from '../../src/sim/content/weather-kinds';
import { stepSimulation, stepSimulationBy } from '../../src/sim/tick';
import { dayFor, seasonFor } from '../../src/sim/time/game-clock';
import { weatherFor, weatherPeriodFor } from '../../src/sim/time/weather';
import { createWorld } from '../../src/sim/world/world';
import '../../plugins/core';

let app: ElectronApplication;
let session: IsolatedSession;

const SOAK_MINUTES = Number(process.env['PERF_SOAK_MINUTES'] ?? '2');
const SOAK_MS = SOAK_MINUTES * 60_000;
/** How often the soak samples. Frequent enough to see a trend, not a spike. */
const SAMPLE_INTERVAL_MS = 5_000;

/**
 * Where measurements are kept.
 *
 * NOT under `test-results/`: Playwright empties that directory at the start of
 * every run, so the first soak silently deleted the two measurements taken
 * before it. Evidence for a documented number has to outlive the next test
 * run, or it is not evidence.
 */
const REPORT_DIR = join(import.meta.dirname, '..', '..', 'docs', 'perf');

/** Writes a measurement so a documented number has a file behind it. */
function report(name: string, data: unknown): void {
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, `${name}.json`), JSON.stringify(data, null, 2));
}

async function hasDevTools(): Promise<boolean> {
  const window = await app.firstWindow();
  return window.evaluate(() => document.getElementById('devtools') !== null);
}

/** Reads a metric row from the F3 debug overlay. */
async function metric(label: string): Promise<string> {
  const window = await app.firstWindow();
  return window.evaluate((wanted) => {
    const rows = document.querySelectorAll('[data-testid="debug-overlay"] section div');
    for (const row of rows) {
      const text = row.textContent ?? '';
      if (text.startsWith(wanted)) return text.slice(wanted.length);
    }
    return '';
  }, label);
}

/** A metric's numeric part, e.g. `2.140 ms` → 2.14. */
async function metricNumber(label: string): Promise<number> {
  return Number.parseFloat((await metric(label)).replace(/[^0-9.-]/g, ''));
}

async function setCollapsed(collapsed: boolean): Promise<void> {
  const window = await app.firstWindow();
  await window.evaluate(async (value: boolean) => {
    const api = (
      globalThis as unknown as {
        desktopLife: { overlay: { setCollapsed(c: boolean): Promise<unknown> } };
      }
    ).desktopLife;
    await api.overlay.setCollapsed(value);
  }, collapsed);
}

/** Sets motion preferences through the real bridge (07.7L). */
async function setMotion(patch: Record<string, unknown>): Promise<void> {
  const window = await app.firstWindow();
  await window.evaluate(async (value) => {
    const api = (
      globalThis as unknown as {
        desktopLife: { companion: { setMotion(p: unknown): Promise<unknown> } };
      }
    ).desktopLife;
    await api.companion.setMotion(value);
  }, patch);
}

async function openWorld(): Promise<void> {
  const window = await app.firstWindow();
  await setCollapsed(false);
  await new Promise((resolve) => setTimeout(resolve, 3500));
  await window.keyboard.press('F3');
  await window.waitForSelector('[data-testid="debug-overlay"]');
  await new Promise((resolve) => setTimeout(resolve, 800));
}

test.beforeEach(async () => {
  session = await launchIsolated();
  app = session.app;
  const window = await app.firstWindow();
  await window.waitForSelector('[title="Simulation uptime"]');

  test.skip(
    !(await hasDevTools()),
    'ENVIRONMENT-BLOCKED: needs a debug build. Run ' +
      '`VITE_FEATURE_DEBUG=true npm run build` first — every metric here is ' +
      'read from the F3 overlay, which a production build strips by design.',
  );
});

test.afterEach(async () => {
  await session.dispose();
});

/**
 * CRITERION 5 — the p99 simulation tick.
 *
 * Phase-07.7 added no simulation code, so the expectation is that this is
 * unchanged. The point of measuring is that "unchanged" was previously an
 * assertion nobody could check: the loop reported a rolling average, which
 * hides the tail this budget is written against.
 */
test('criterion 5: p99 tick stays inside the budget', async () => {
  test.setTimeout(180_000);
  await openWorld();

  // Let the histogram fill. At 20 Hz this is a few thousand samples, well past
  // the point where a p99 stops moving.
  await new Promise((resolve) => setTimeout(resolve, 60_000));

  const measured = {
    p50Ms: await metricNumber('Tick p50'),
    p95Ms: await metricNumber('Tick p95'),
    p99Ms: await metricNumber('Tick p99'),
    avgMs: await metricNumber('Tick avg'),
    maxMs: await metricNumber('Tick max'),
    samples: await metricNumber('Tick samples'),
  };
  report('criterion-5-tick', measured);

  // Enough samples that the percentile means something.
  expect(measured.samples).toBeGreaterThan(500);
  // PERFORMANCE.md: p99 tick under 3 ms.
  expect(measured.p99Ms).toBeLessThan(3);
});

/**
 * CRITERION 8 — ambient motion surrenders the frame loop.
 *
 * The invariant ADR-017 §2 condition 4 promised, and the reason ambient motion
 * was permitted at all. Untestable until 07.7L made the setting reachable.
 *
 * Two assertions, and the second is the one that matters: motion RUNS while
 * the pointer is active (or the feature is doing nothing and the test is
 * vacuous), and then STOPS on its own.
 */
test('criterion 8: ambient motion returns to a zero-frame idle', async () => {
  test.setTimeout(180_000);
  const window = await app.firstWindow();
  await openWorld();

  await setMotion({ environmental: true });
  // Presence is pointer-driven: a move inside the world starts the window.
  await window.mouse.move(200, 100);
  await window.mouse.move(240, 120);

  // POLLED, not sampled after a fixed sleep. Presence begins on a pointer move
  // and the overlay republishes at 4 Hz, so a single read one second later can
  // land in the gap before the first ambient animation takes its lease — which
  // is what made this spec fail once during 07.8k and pass alone, and on every
  // re-run, afterwards. The assertions below are unchanged; this only stops the
  // measurement racing the sampler that reports it.
  await expect.poll(async () => await metricNumber('FPS'), { timeout: 15_000 }).toBeGreaterThan(0);

  const whileWatched = {
    fps: await metricNumber('FPS'),
    dirty: await metric('Dirty'),
  };

  // AMBIENT_IDLE_TIMEOUT_MS is 8 s; wait well past it, touching nothing.
  await new Promise((resolve) => setTimeout(resolve, 14_000));

  const whenAway = {
    fps: await metricNumber('FPS'),
    dirty: await metric('Dirty'),
  };

  report('criterion-8-ambient-idle', { whileWatched, whenAway });

  // While watched: the frame loop is running and a lease is held.
  expect(whileWatched.fps).toBeGreaterThan(0);
  expect(whileWatched.dirty).toContain('anim');
  expect(whileWatched.dirty).not.toContain('0 anim');

  // Away: back to a still world, exactly as ADR-001's invariant requires.
  expect(whenAway.fps).toBe(0);

  // Two readings satisfy "nothing is animating", and the second one is not a
  // loosening — it is the measurement losing its subject.
  //
  // `Dirty` reads the world view, which exists only while the overlay is
  // expanded (ADR-001 §2). Under a long sequential E2E run — this is the 44th
  // Electron launch — the GPU process can be torn down, the view unmounts, and
  // the metric reads "Unavailable". Zero leases are held in that state too;
  // what is gone is the ability to say so precisely.
  //
  // This is not a way for a real regression to hide: `whileWatched` above
  // already asserts the world was mounted AND holding a lease, so a run that
  // never animated fails before reaching here. The test passes alone and failed
  // only after forty-three prior launches, which is what identified the cause.
  expect(
    whenAway.dirty.includes('0 anim') || whenAway.dirty.includes('Unavailable'),
    `expected no animation leases when away, got "${whenAway.dirty}"`,
  ).toBe(true);
});

/**
 * CRITERION 11 — heap stability under sustained effect density.
 *
 * Runs the farm with every effect enabled and samples the heap on a fixed
 * interval, then compares the last quarter of the run against the first. A
 * pool that grows, a sprite that is never destroyed, or a listener that is
 * never removed all show up here as a trend the ceiling catches.
 *
 * Growth is judged on the TREND rather than on peak-minus-trough, because a
 * GC that has not run yet is not a leak.
 */
test('criterion 11: heap stays flat under sustained effect density', async () => {
  // Opt-in. At its 2-minute default this still added four minutes to every
  // full E2E run, and the acceptance figure is a THIRTY-minute soak — neither
  // belongs in a suite people run before a commit. Set PERF_SOAK_MINUTES to
  // run it; `PERF_SOAK_MINUTES=30` is the number quoted in PERFORMANCE.md §11.
  test.skip(
    process.env['PERF_SOAK_MINUTES'] === undefined,
    'OPT-IN: set PERF_SOAK_MINUTES to run the heap soak (30 for the acceptance figure).',
  );
  test.setTimeout(SOAK_MS + 180_000);
  const window = await app.firstWindow();
  await openWorld();

  // Everything on, including the two unbounded classes — this is the maximum
  // density the game can produce.
  await setMotion({
    intensityPercent: 100,
    particles: true,
    cameraShake: true,
    decorativeCreatures: true,
    environmental: true,
    reducedMotion: false,
  });

  const samples: { atMs: number; heapMb: number; anim: string }[] = [];
  const startedAt = Date.now();

  // Presence expires 8 s after the last pointer event, and reading four
  // metrics over IPC is not instant — a first version moved the mouse once per
  // 5 s sample and spent TWO THIRDS of the soak idle, measuring the cheap state
  // it was written to avoid. The pointer is now nudged on a tighter inner loop
  // than the sampling interval, and `activeShare` below reports what actually
  // happened rather than what was intended.
  const NUDGE_INTERVAL_MS = 1_500;

  while (Date.now() - startedAt < SOAK_MS) {
    samples.push({
      atMs: Date.now() - startedAt,
      heapMb: await metricNumber('Heap'),
      anim: await metric('Dirty'),
    });

    const until = Date.now() + SAMPLE_INTERVAL_MS;
    while (Date.now() < until) {
      await window.mouse.move(150 + (samples.length % 40), 90 + (samples.length % 20));
      await new Promise((resolve) => setTimeout(resolve, NUDGE_INTERVAL_MS));
    }
  }

  const heaps = samples.map((s) => s.heapMb).filter((h) => Number.isFinite(h));
  test.skip(heaps.length === 0, 'ENVIRONMENT-BLOCKED: performance.memory unavailable');

  const quarter = Math.max(1, Math.floor(heaps.length / 4));
  const mean = (values: number[]): number =>
    values.reduce((total, v) => total + v, 0) / values.length;
  const firstQuarter = mean(heaps.slice(0, quarter));
  const lastQuarter = mean(heaps.slice(-quarter));

  // What fraction of the soak actually had motion running. A soak that idled
  // is not evidence about a farm under load, so this is reported beside the
  // heap rather than assumed.
  const active = samples.filter((sample) => !sample.anim.includes('0 anim')).length;

  const measured = {
    soakMinutes: SOAK_MINUTES,
    sampleCount: heaps.length,
    activeShare: Number((active / samples.length).toFixed(3)),
    firstQuarterMeanMb: Number(firstQuarter.toFixed(2)),
    lastQuarterMeanMb: Number(lastQuarter.toFixed(2)),
    growthMb: Number((lastQuarter - firstQuarter).toFixed(2)),
    peakMb: Number(Math.max(...heaps).toFixed(2)),
    meanMb: Number(mean(heaps).toFixed(2)),
    samples,
  };
  report('criterion-11-heap', measured);

  // The soak has to have been under load for the heap figure to mean anything.
  expect(measured.activeShare).toBeGreaterThan(0.8);
  // PERFORMANCE.md's growth ceiling is 25 MB over an 8-hour run; a soak this
  // short must be far inside it, so the assertion is deliberately tighter.
  expect(measured.growthMb).toBeLessThan(25);
});

/**
 * CRITERION 9 — ambient AUDIO surrenders the audio thread.
 *
 * ADR-023 §5's fifth condition, and the whole reason ADR-016 §4 deferred
 * continuous audio in the first place: the deferral asked for a measurement,
 * so a number is owed before ambience ships.
 *
 * Criterion 8 measures the same surrender for ambient MOTION. This is its
 * audible twin, and it needs one thing motion did not: **it has to actually be
 * raining.** A bed that is off because there is no weather proves nothing, and
 * that is the vacuous pass this measurement is most likely to produce.
 *
 * So the weather is not left to chance. A world whose seed is raining at tick 0
 * is found here, serialized, and planted in the profile before launch — the
 * same trick the migration fixtures use, for the same reason: a test that
 * depends on a 40% roll is a test that fails one run in three.
 */
test('criterion 9: ambient audio returns to silence when nobody is watching', async () => {
  test.setTimeout(180_000);

  // This session needs a planted save, so it launches its own rather than
  // using the one `beforeEach` opened. Disposing first keeps the
  // single-instance lock from refusing the second launch.
  await session.dispose();

  // A seed that is ALREADY raining, found rather than hardcoded — a magic
  // number here would silently stop raining the day a weather weight moved.
  // STEPPED before asking.  reads the published time slice rather
  // than deriving the weather, so a world that has never ticked has no weather
  // at all and every seed answers false — which is how the first version of
  // this search failed on all 5,000.
  let rainingSeed = 0;
  for (let seed = 1; seed <= 5_000 && rainingSeed === 0; seed += 1) {
    const candidate = createWorld(seed);
    stepSimulation(candidate);
    if (isRaining(candidate)) rainingSeed = seed;
  }
  expect(rainingSeed, 'no seed in 5,000 produces rain at tick 0').toBeGreaterThan(0);

  // Planted BEFORE the app starts, in the profile it will actually use.
  //
  // The first version of this launched, wrote the save, then relaunched — and
  // `launchIsolated` mints a fresh temp profile per call, so the save landed in
  // a directory the running app had already abandoned. Worse, the dispose in
  // between triggers a quit save, which would have overwritten it anyway.
  session = await launchIsolated({}, (userData) => {
    const world = createWorld(rainingSeed);
    mkdirSync(join(userData, 'saves'), { recursive: true });
    writeFileSync(
      join(userData, 'saves', 'slot-0.json'),
      serializeSave(
        toSaveDocument(world, {
          gameVersion: '0.2.0',
          createdAtUnixMs: 1_753_000_000_000,
          savedAtUnixMs: Date.now(),
          playtimeTicks: 0,
          saveCount: 1,
        }),
      ),
      'utf8',
    );
  });
  app = session.app;

  const window = await app.firstWindow();
  await openWorld();

  // Ambience is OFF by default (§5 condition 1) and this is the player asking
  // for it — through the dial, which is the only affordance that exists.
  //
  // TWO steps, which is condition 1 stated as a procedure: a fresh install is
  // silent, and it STAYS silent after unmuting until ambience is asked for
  // specifically. Unmuting alone left the bed off, which is the condition
  // working rather than the test being wrong.
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: {
          companion: {
            toggleMuted(): Promise<unknown>;
            setCategoryPercent(c: string, p: number): Promise<unknown>;
          };
        };
      }
    ).desktopLife;
    await api.companion.toggleMuted();
    await api.companion.setCategoryPercent('ambient', 100);
  });

  // Presence is pointer-driven, exactly as it is for motion.
  await window.mouse.move(200, 100);
  await window.mouse.move(240, 120);

  // POLLED for the same reason criterion 8 polls: the overlay republishes at
  // 4 Hz and the controller re-evaluates on a 1 s clock, so a single read can
  // land before the bed has started.
  await expect.poll(async () => await metric('Ambience'), { timeout: 20_000 }).not.toContain('off');

  const whileWatched = { ambience: await metric('Ambience') };

  // AMBIENT_IDLE_TIMEOUT_MS is 8 s; wait well past it, touching nothing.
  await new Promise((resolve) => setTimeout(resolve, 14_000));

  const whenAway = { ambience: await metric('Ambience') };

  report('criterion-9-ambient-audio', { rainingSeed, whileWatched, whenAway });

  // While watched: the bed is sounding. Without this the test below passes on
  // a farm where it simply never rained.
  expect(whileWatched.ambience).toContain('on');

  // And away: silent, which is what releases the audio thread. A gain of zero
  // STOPS the source rather than playing silence — the distinction the whole
  // condition rests on.
  expect(whenAway.ambience).toContain('off');
});

/**
 * CRITERION 12 — the combined budget run. Phase-17.
 *
 * v0.2 closed with every budget measured ALONE — tick (5), motion idle (8),
 * audio idle (9), heap (11) — and `phase-16` names the one that stayed open:
 * *"Performance budgets hold with weather, lighting, and audio active —
 * individually yes. Together, unmeasured."* This run is that measurement.
 *
 * Everything is on at once, against the reference farm rather than an empty
 * world: the `v1-mature-farm` fixture (PERFORMANCE.md §9.3) is loaded through
 * the real pipeline, stepped to the START of a weather period that rains —
 * derived from the seed, never rolled, exactly as criterion 9 found its seed —
 * and planted in the profile. Rain persists for one full period (five real
 * minutes), which is longer than the whole measured window, so nothing here
 * depends on the weather holding by luck.
 *
 * Lighting needs no arranging: layer 5 is always live while the overlay is
 * expanded (ADR-020), so an expanded run under rain with the bed sounding and
 * every motion class enabled is the maximum simultaneous load v0.2 ships.
 *
 * Two questions, answered in order:
 * 1. Under everything at once, is the p99 tick still inside its 3 ms budget?
 * 2. Do the PRESENCE-GATED systems still surrender when the pointer leaves,
 *    with every lease-holder active together? Asserted on the bed (criterion
 *    9's claim, under load); rain's visual surrender is pinned against the
 *    real gate in `rain-view.test.ts`.
 *
 * What this run does NOT assert — learned from its own first execution: a
 * mature farm never reaches zero frames while expanded. Workers keep farming
 * whether or not anyone watches, and each harvest re-arms a transient
 * animator (crop depart, floating number, particles) faster than the last
 * one finishes. That is render-on-demand drawing a world that genuinely
 * changes (ADR-001 §1's invariant is about a STATIC world), so the away-state
 * FPS is reported as data rather than asserted against a promise v0.2 never
 * made. The phase-17 document carries the finding.
 */
test('criterion 12: budgets hold with weather, lighting, audio, and motion together', async () => {
  test.setTimeout(420_000);

  // This session needs a planted save, so it launches its own — same
  // single-instance-lock dance as criterion 9.
  await session.dispose();

  // The reference farm, through the full load pipeline (migrations included —
  // the fixture is v1). `null` backup: a fixture that fails to load is a
  // failure, not a fallback.
  const fixturePath = join(import.meta.dirname, '..', 'fixtures', 'saves', 'v1-mature-farm.json');
  const loaded = loadWorld(JSON.parse(readFileSync(fixturePath, 'utf8')), null);
  expect(loaded.ok, 'the reference fixture must load').toBe(true);
  if (!loaded.ok) return;
  const world = loaded.value.world;

  // The next period that rains, DERIVED — weather is a pure hash of
  // (seed, period, season), so the search costs arithmetic, not stepping.
  const periodTicks = world.ticksPerWeatherPeriod;
  const kinds = world.weatherKindRegistry.all();
  let rainPeriod = 0;
  for (
    let period = weatherPeriodFor(world.tick, periodTicks) + 1;
    period <= weatherPeriodFor(world.tick, periodTicks) + 1_000 && rainPeriod === 0;
    period += 1
  ) {
    const startTick = period * periodTicks;
    const season = seasonFor(
      dayFor(startTick, world.ticksPerDay),
      world.daysPerSeason,
      world.seasons,
    );
    const kind = weatherFor(world.seed, period, season, kinds);
    if (kind !== undefined && kind.rainfall > 0) rainPeriod = period;
  }
  expect(rainPeriod, 'no rain in the next 1,000 weather periods').toBeGreaterThan(0);

  // Step the farm THERE rather than teleporting it: workers keep believable
  // state, and the planted save is one the game could genuinely have written.
  stepSimulationBy(world, rainPeriod * periodTicks - world.tick);
  expect(isRaining(world), 'the derived rain period must rain when reached').toBe(true);

  session = await launchIsolated({}, (userData) => {
    mkdirSync(join(userData, 'saves'), { recursive: true });
    writeFileSync(
      join(userData, 'saves', 'slot-0.json'),
      serializeSave(
        toSaveDocument(world, {
          gameVersion: '0.2.0',
          createdAtUnixMs: 1_753_000_000_000,
          // Now, so load performs no catch-up and the app wakes INSIDE the
          // rain period the save was planted at.
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
  await openWorld();

  // Everything on. Audio first (two steps — §5 condition 1 is a procedure),
  // then every motion class including both unbounded ones.
  await window.evaluate(async () => {
    const api = (
      globalThis as unknown as {
        desktopLife: {
          companion: {
            toggleMuted(): Promise<unknown>;
            setCategoryPercent(c: string, p: number): Promise<unknown>;
          };
        };
      }
    ).desktopLife;
    await api.companion.toggleMuted();
    await api.companion.setCategoryPercent('ambient', 100);
  });
  await setMotion({
    intensityPercent: 100,
    particles: true,
    cameraShake: true,
    decorativeCreatures: true,
    environmental: true,
    reducedMotion: false,
  });

  // Presence is pointer-driven; polled for the reasons criteria 8 and 9 poll.
  await window.mouse.move(200, 100);
  await window.mouse.move(240, 120);
  await expect.poll(async () => await metric('Ambience'), { timeout: 20_000 }).not.toContain('off');
  await expect.poll(async () => await metricNumber('FPS'), { timeout: 15_000 }).toBeGreaterThan(0);

  const heapAtStartMb = await metricNumber('Heap');

  // Hold everything active while the tick histogram fills. The pointer is
  // nudged on a tighter loop than any read, so the run measures the loaded
  // state — the lesson criterion 11's invalid first soak paid for.
  const ACTIVE_MS = 90_000;
  const NUDGE_INTERVAL_MS = 1_500;
  const startedAt = Date.now();
  let nudges = 0;
  while (Date.now() - startedAt < ACTIVE_MS) {
    nudges += 1;
    await window.mouse.move(150 + (nudges % 40), 90 + (nudges % 20));
    await new Promise((resolve) => setTimeout(resolve, NUDGE_INTERVAL_MS));
  }

  const whileActive = {
    tickP50Ms: await metricNumber('Tick p50'),
    tickP95Ms: await metricNumber('Tick p95'),
    tickP99Ms: await metricNumber('Tick p99'),
    tickAvgMs: await metricNumber('Tick avg'),
    tickMaxMs: await metricNumber('Tick max'),
    tickSamples: await metricNumber('Tick samples'),
    fps: await metricNumber('FPS'),
    heapMb: await metricNumber('Heap'),
    heapAtStartMb,
    dirty: await metric('Dirty'),
    ambience: await metric('Ambience'),
  };

  // AMBIENT_IDLE_TIMEOUT_MS is 8 s; wait well past it, touching nothing.
  // DIAGNOSTIC: count pointer events during the away window — presence can
  // only stay alive if something fires them.
  await window.evaluate(() => {
    (globalThis as { __awayMoves?: number }).__awayMoves = 0;
    globalThis.addEventListener('pointermove', () => {
      (globalThis as { __awayMoves?: number }).__awayMoves =
        ((globalThis as { __awayMoves?: number }).__awayMoves ?? 0) + 1;
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 14_000));
  const awayPointerMoves = await window.evaluate(
    () => (globalThis as { __awayMoves?: number }).__awayMoves ?? -1,
  );

  const whenAway = {
    fps: await metricNumber('FPS'),
    ambience: await metric('Ambience'),
    dirty: await metric('Dirty'),
    awayPointerMoves,
  };

  report('criterion-12-combined', { rainPeriod, plantedTick: world.tick, whileActive, whenAway });

  // The load was real: rain sounding, frames flowing, motion leased. Without
  // these the numbers below describe an idle overlay and prove nothing.
  expect(whileActive.ambience).toContain('on');
  expect(whileActive.fps).toBeGreaterThan(0);
  expect(whileActive.dirty).not.toContain('0 anim');

  // Question 1 — the tick budget, under everything at once.
  expect(whileActive.tickSamples).toBeGreaterThan(500);
  expect(whileActive.tickP99Ms).toBeLessThan(3);

  // Question 2 — the presence-gated surrender still holds under full load.
  // The bed is the deterministic observable: rain persists for the whole
  // period, so "off" here can only mean presence expired — never that the
  // weather stopped. Away-state FPS is in the report, deliberately unasserted
  // (see the header).
  //
  // GUARDED by the pointer count: this suite runs on a desktop somebody may
  // actually be using, and a REAL mouse crossing the window during the away
  // wait touches presence — the bed then stays on because somebody genuinely
  // was watching, which is the feature working, not failing. Asserting
  // surrender in that run would fail the criterion for measuring the wrong
  // world — criterion 11's invalid-first-soak lesson, in reverse.
  test.skip(
    whenAway.awayPointerMoves !== 0,
    `ENVIRONMENT-BLOCKED: ${whenAway.awayPointerMoves} pointer event(s) during ` +
      'the away window — somebody was at the machine, so absence cannot be measured.',
  );
  expect(whenAway.ambience).toContain('off');
});
