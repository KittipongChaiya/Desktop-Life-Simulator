/**
 * A third-party crop, end to end. Phase-09e — `ROADMAP.md` §5.
 *
 * The acceptance is *"a third-party source adding a crop loads, appears in
 * game, saves, and reloads"*. This runs that whole path against a REAL source
 * directory on disk: manifest and definition files are written to a temp tree,
 * discovered by the main-process reader, validated and resolved by the
 * simulation, installed, and then a world is created and saved.
 *
 * Nothing here is mocked. If a shortcut existed anywhere in that chain, this
 * file could not be written the way it is — which makes it a check on ADR-019
 * §2's no-privileged-path rule as much as on the loader.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { discoverSources } from '../src/main/plugin-discovery';
import { serializeSave, toSaveDocument } from '../src/persistence/serialize';
import { installDiscoveredSources } from '../src/renderer/bootstrap/install-sources';
import { asContentId } from '../src/shared/ids';
import { createWorld } from '../src/sim/world/world';

import type { SaveMeta } from '../src/persistence/schema';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

const MELON = asContentId('moonmelon:melon');
const SEED = asContentId('moonmelon:melon_seed');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dls-e2e-plugin-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes a complete third-party source to disk, as an author would. */
function writeSource(overrides: { definitions?: unknown } = {}): void {
  const root = join(dir, 'moonmelon');
  mkdirSync(root, { recursive: true });

  writeFileSync(
    join(root, 'plugin.json'),
    JSON.stringify({
      id: 'moonmelon',
      name: 'Moon Melons',
      version: '1.0.0',
      apiVersion: 1,
      content: { definitions: ['crops.json'] },
    }),
    'utf8',
  );

  writeFileSync(
    join(root, 'crops.json'),
    JSON.stringify(
      overrides.definitions ?? {
        crops: [
          {
            id: 'moonmelon:melon',
            displayName: 'Moon Melon',
            growthTicks: 1800,
            stageSprites: ['crops:melon_0', 'crops:melon_1', 'crops:melon_2', 'crops:melon_3'],
            harvestYield: [{ item: 'moonmelon:melon', quantity: 1 }],
            seedItem: 'moonmelon:melon_seed',
            seedCost: 8,
            seasons: [],
            tags: ['gourd'],
          },
        ],
        items: [
          {
            id: 'moonmelon:melon',
            displayName: 'Moon Melon',
            sprite: 'items:melon',
            basePrice: 12,
            stackSize: 99,
          },
          {
            id: 'moonmelon:melon_seed',
            displayName: 'Moon Melon Seed',
            sprite: 'items:melon_seed',
            basePrice: 8,
            stackSize: 99,
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );
}

const loadFromDisk = (): ReturnType<typeof installDiscoveredSources> =>
  installDiscoveredSources(discoverSources(dir));

describe('a third-party crop, from disk to a saved farm', () => {
  it('is discovered, validated, resolved, and installed', () => {
    writeSource();
    const outcome = loadFromDisk();

    expect(outcome.refused).toEqual([]);
    expect(outcome.installed).toContain('moonmelon');
  });

  it('appears in a world created afterwards', () => {
    writeSource();
    loadFromDisk();

    const world = createWorld(7);
    expect(world.cropRegistry.has(MELON)).toBe(true);
    expect(world.itemRegistry.has(SEED)).toBe(true);
  });

  it('carries the authored values through, not defaults', () => {
    writeSource();
    loadFromDisk();

    const crop = createWorld(7).cropRegistry.get(MELON);
    expect(crop.ok && crop.value.growthTicks).toBe(1800);
    expect(crop.ok && crop.value.displayName).toBe('Moon Melon');
    expect(crop.ok && crop.value.harvestYield[0]?.quantity).toBe(1);
  });

  it('is named in the save it was present for (ADR-026 §4)', () => {
    writeSource();
    loadFromDisk();

    const document = JSON.parse(serializeSave(toSaveDocument(createWorld(7), META))) as {
      world: { sources: { id: string }[] };
    };

    expect(document.world.sources.map((s) => s.id)).toContain('moonmelon');
  });

  it('sits alongside core rather than replacing it', () => {
    writeSource();
    loadFromDisk();

    const world = createWorld(7);
    expect(world.cropRegistry.has(asContentId('core:wheat'))).toBe(true);
    expect(world.cropRegistry.has(MELON)).toBe(true);
  });
});

describe('a source that gets it wrong is refused, and says why', () => {
  it('refuses a crop declared outside the namespace the source owns', () => {
    // The most important refusal on this path: a manifest claiming `moonmelon`
    // must not be able to ship a `core:` crop and silently shadow the engine's.
    writeSource({
      definitions: {
        crops: [
          {
            id: 'core:wheat',
            displayName: 'Not Actually Wheat',
            growthTicks: 10,
            stageSprites: ['a'],
            harvestYield: [{ item: 'core:wheat', quantity: 99 }],
            seedItem: 'core:wheat_seed',
            seedCost: 0,
            seasons: [],
            tags: [],
          },
        ],
      },
    });

    const outcome = loadFromDisk();
    expect(outcome.installed).toEqual([]);
    expect(outcome.refused).toHaveLength(1);
  });

  it('refuses a malformed definition and names the field', () => {
    writeSource({ definitions: { crops: [{ id: 'moonmelon:melon', displayName: 'M' }] } });

    const outcome = loadFromDisk();
    expect(outcome.installed).toEqual([]);
    expect(outcome.refused[0]?.reason).toContain('growthTicks');
  });

  it('refuses an unsupported content kind rather than ignoring it', () => {
    writeSource({ definitions: { buildings: [] } });

    const outcome = loadFromDisk();
    expect(outcome.refused[0]?.reason).toContain('not a supported content kind');
  });
});
