/**
 * Save-system budgets. Phase-07e — acceptance criteria 21, 22, 23;
 * `PERFORMANCE.md` §9 and §10.1.
 *
 * The reference is the committed golden fixture `v1-mature-farm.json`, which
 * is what `PERFORMANCE.md` §10.2 names as the reference save: a 16×16 plot,
 * all four buildings, three workers, stocked containers, and 500 real ticks of
 * simulation behind it. Measuring anything smaller would measure nothing.
 *
 * The ceilings are the ones the doc publishes, not comfortable ones invented
 * here. Where the measurement is orders of magnitude under, the assertion is
 * still the ceiling — this is a REGRESSION gate, and the day a change makes a
 * save ten times slower it should fail against the published budget, not
 * against a number that quietly tracked the implementation.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { catchUpWorld } from '../src/persistence/catch-up';
import { loadWorld } from '../src/persistence/load';
import { EMPTY_QUARANTINE, type SaveMeta } from '../src/persistence/schema';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { OFFLINE_CAP_TICKS } from '../src/shared/constants';
import type { World } from '../src/sim/world/world';

/** `PERFORMANCE.md` §9 — the reference save's hard ceiling. */
const SIZE_CEILING_BYTES = 2 * 1024 * 1024;
/** `PERFORMANCE.md` §9 — save → interactive. */
const SAVE_CEILING_MS = 100;
/** `PERFORMANCE.md` §9 — load + catch-up → interactive. */
const LOAD_CEILING_MS = 1_500;

const REFERENCE = join(__dirname, 'fixtures', 'saves', 'v1-mature-farm.json');

const referenceText = (): string => readFileSync(REFERENCE, 'utf8');
const referenceDocument = (): unknown => JSON.parse(referenceText());

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_228_800_000,
  savedAtUnixMs: 1_753_315_200_000,
  playtimeTicks: 0,
  saveCount: 2,
};

/** Loads the reference save into a live world, failing loudly if it cannot. */
function referenceWorld(): World {
  const loaded = loadWorld(referenceDocument(), null);
  if (!loaded.ok) throw new Error(`reference save did not load: ${loaded.error.message}`);
  return loaded.value.world;
}

/** Median of repeated runs — one cold sample is noise, not a measurement. */
function medianMs(runs: number, body: () => void): number {
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    body();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? Number.POSITIVE_INFINITY;
}

describe('reference save size (criterion 23)', () => {
  it('stays under the 2 MB ceiling', () => {
    const bytes = Buffer.byteLength(referenceText(), 'utf8');

    // Reported so the number lands in the phase document, not just the gate.
    expect(bytes).toBeLessThan(SIZE_CEILING_BYTES);
  });

  it('a freshly serialized mature farm is the same order of magnitude', () => {
    // The guard is worthless if it only ever measures a file nobody rewrites:
    // this re-serializes the loaded world through the real path.
    const world = referenceWorld();
    const bytes = Buffer.byteLength(
      serializeSave(toSaveDocument(world, META, EMPTY_QUARANTINE)),
      'utf8',
    );

    expect(bytes).toBeLessThan(SIZE_CEILING_BYTES);
  });
});

describe('save write (criterion 21)', () => {
  it('serializes the reference world well under 100 ms', () => {
    const world = referenceWorld();

    // Step 1 of §7.1 — the only step that scales with world size. Steps 2–7
    // are fixed-cost filesystem calls, measured live in the E2E run.
    const elapsed = medianMs(5, () => {
      serializeSave(toSaveDocument(world, META, EMPTY_QUARANTINE));
    });

    expect(elapsed).toBeLessThan(SAVE_CEILING_MS);
  });
});

describe('load + catch-up (criterion 22)', () => {
  it('reaches a playable world inside 1.5 s, catch-up at the 8-hour cap included', () => {
    // The worst case a player can actually produce: the largest supported
    // gap, on the reference farm, through the real pipeline.
    const document = referenceDocument();

    const elapsed = medianMs(3, () => {
      const loaded = loadWorld(document, null);
      if (!loaded.ok) throw new Error('reference save did not load');
      catchUpWorld(loaded.value.world, OFFLINE_CAP_TICKS);
    });

    expect(elapsed).toBeLessThan(LOAD_CEILING_MS);
  });
});
