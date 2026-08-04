/**
 * World-inspector tile provider. Phase-07.8c.
 *
 * The facts are DERIVED — tile state is computed rather than stored (ADR-009
 * §1), a crop's stage is computed from its age, and walkability is the tile's
 * own kind plus its blocked bit. Derivation is logic, and logic can be wrong,
 * so it is tested here rather than written inline in the composition root.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asBuildingId, asContentId, asWorkerId } from '../../shared/ids';
import { CORE_WATER } from '../../sim/content/tile-kinds';
import { setBlocked, setKind } from '../../sim/world/tile-grid';
import { TileState } from '../../sim/world/tile-state';
import { createWorker } from '../../sim/world/worker';
import { createWorld, type World } from '../../sim/world/world';

import {
  createTileInspectProvider,
  describeTile,
  readTileFacts,
  type TileFacts,
} from './tile-inspector';

/** The middle of the starting 8×8 plot, which a fresh world always owns. */
const CENTRE_X = 32;
const CENTRE_Y = 32;

function facts(world: World, x = CENTRE_X, y = CENTRE_Y): TileFacts {
  const read = readTileFacts(world, x, y);
  if (read === null) throw new Error(`expected facts for ${x},${y}`);
  return read;
}

function valueOf(facts: TileFacts, label: string): string | undefined {
  return describeTile(facts).fields.find((f) => f.label === label)?.value;
}

describe('readTileFacts', () => {
  it('reports nothing outside the grid, so the panel says so rather than guessing', () => {
    const world = createWorld(1);

    expect(readTileFacts(world, -1, 0)).toBeNull();
    expect(readTileFacts(world, 0, -1)).toBeNull();
    expect(readTileFacts(world, world.tiles.width, 0)).toBeNull();
    expect(readTileFacts(world, 0, world.tiles.height)).toBeNull();
  });

  it('reports coordinates and the flat index the sim uses', () => {
    const world = createWorld(1);
    const read = facts(world, 5, 7);

    expect(read.x).toBe(5);
    expect(read.y).toBe(7);
    expect(read.index).toBe(toIndexUnchecked(5, 7));
  });

  it('describes an untouched tile inside the starting plot', () => {
    const read = facts(createWorld(1));

    expect(read.kind).toBe('core:grass');
    expect(read.state).toBe(TileState.Empty);
    expect(read.owned).toBe(true);
    expect(read.walkable).toBe(true);
    expect(read.blocked).toBe(false);
    expect(read.crop).toBeNull();
    expect(read.occupants).toEqual([]);
  });

  it('reports ownership, which is the difference between the plot and the map', () => {
    const world = createWorld(1);

    expect(facts(world, 0, 0).owned).toBe(false);
    expect(facts(world).owned).toBe(true);
  });

  it('reports a tilled tile as tilled', () => {
    const world = createWorld(1);
    world.tiles.tilledAt[toIndexUnchecked(CENTRE_X, CENTRE_Y)] = 10;

    expect(facts(world).state).toBe(TileState.Tilled);
  });

  it('carries the path cost A* would pay to enter', () => {
    const world = createWorld(1);
    const read = facts(world);

    // The tile's own edge weight, in ticks — not a distance, and not a guess.
    expect(read.enterTicks).toBeGreaterThan(0);
  });

  it('reports an unwalkable tile as unwalkable', () => {
    const world = createWorld(1);
    const kindIndex = world.tileKinds.indexOf(CORE_WATER);
    setKind(world.tiles, toIndexUnchecked(CENTRE_X, CENTRE_Y), kindIndex);

    const read = facts(world);
    expect(read.kind).toBe('core:water');
    expect(read.walkable).toBe(false);
  });

  it('separates blocked from unwalkable, because a building is not terrain', () => {
    const world = createWorld(1);
    setBlocked(world.tiles, toIndexUnchecked(CENTRE_X, CENTRE_Y), true);

    const read = facts(world);
    expect(read.blocked).toBe(true);
    expect(read.walkable).toBe(false);
    expect(read.kind).toBe('core:grass');
  });
});

describe('readTileFacts — crops', () => {
  it('reports the crop, its age, and the stage it has reached', () => {
    const world = createWorld(1);
    const tile = toIndexUnchecked(CENTRE_X, CENTRE_Y);
    world.tiles.tilledAt[tile] = 1;
    world.crops.set(tile, { cropId: asContentId('core:wheat'), tile, plantedTick: 0 });
    world.tick = 0;

    const fresh = facts(world);
    expect(fresh.crop?.id).toBe('core:wheat');
    expect(fresh.crop?.ageTicks).toBe(0);
    expect(fresh.crop?.stage).toBe(0);
    expect(fresh.crop?.mature).toBe(false);
    expect(fresh.state).toBe(TileState.Planted);
  });

  it('tracks the crop forward, so a pinned tile is not a screenshot', () => {
    const world = createWorld(1);
    const tile = toIndexUnchecked(CENTRE_X, CENTRE_Y);
    world.crops.set(tile, { cropId: asContentId('core:wheat'), tile, plantedTick: 0 });

    world.tick = 100_000;
    const grown = facts(world);

    expect(grown.crop?.mature).toBe(true);
    expect(grown.crop?.ageTicks).toBe(100_000);
    expect(grown.state).toBe(TileState.HarvestReady);
  });

  it('reports a crop whose content vanished without inventing a stage', () => {
    // An uninstalled plugin leaves the instance behind (SAVE_FORMAT.md §5.3).
    // The id is real and is reported; the stage is unknowable and says so.
    const world = createWorld(1);
    const tile = toIndexUnchecked(CENTRE_X, CENTRE_Y);
    world.crops.set(tile, { cropId: asContentId('mod:ghost'), tile, plantedTick: 0 });

    const read = facts(world);
    expect(read.crop?.id).toBe('mod:ghost');
    expect(read.crop?.stage).toBeNull();
    expect(read.crop?.mature).toBeNull();
  });
});

describe('readTileFacts — occupants', () => {
  it('names a worker standing on the tile', () => {
    const world = createWorld(1);
    const tile = toIndexUnchecked(CENTRE_X, CENTRE_Y);
    const worker = createWorker(asWorkerId(3), tile);
    world.workers.set(worker.id, worker);

    expect(facts(world).occupants).toEqual(['worker #3']);
  });

  it('names a building occupying the tile', () => {
    const world = createWorld(1);
    const tile = toIndexUnchecked(CENTRE_X, CENTRE_Y);
    world.buildings.set(asBuildingId(7), {
      id: asBuildingId(7),
      tile,
      buildingId: asContentId('core:storage_shed'),
    });

    expect(facts(world).occupants).toEqual(['core:storage_shed #7']);
  });

  it('sees an empty tile as empty rather than unreadable', () => {
    const world = createWorld(1);
    const tile = toIndexUnchecked(CENTRE_X, CENTRE_Y);
    const worker = createWorker(asWorkerId(1), toIndexUnchecked(CENTRE_X + 1, CENTRE_Y));
    world.workers.set(worker.id, worker);

    expect(facts(world, CENTRE_X, CENTRE_Y).occupants).toEqual([]);
    expect(readTileFacts(world, CENTRE_X + 1, CENTRE_Y)?.occupants).toEqual(['worker #1']);
    expect(tile).toBeGreaterThan(0);
  });
});

describe('describeTile', () => {
  it('titles the section with the tile it describes', () => {
    expect(describeTile(facts(createWorld(1), 5, 7)).title).toBe('Tile 5,7');
  });

  it('renders every fact the brief asks for', () => {
    const read = facts(createWorld(1));
    const labels = describeTile(read).fields.map((f) => f.label);

    expect(labels).toEqual([
      'Index',
      'Kind',
      'State',
      'Owned',
      'Walkable',
      'Enter cost',
      'Crop',
      'Stage',
      'Age',
      'Occupants',
    ]);
  });

  it('says "none" for what it read and found absent', () => {
    // Distinct from "Unavailable", which means the read itself failed. A panel
    // that conflates the two makes an empty tile look like a broken one.
    const read = facts(createWorld(1));

    expect(valueOf(read, 'Crop')).toBe('none');
    expect(valueOf(read, 'Occupants')).toBe('none');
  });

  it('reports an unknowable stage as Unavailable', () => {
    const world = createWorld(1);
    const tile = toIndexUnchecked(CENTRE_X, CENTRE_Y);
    world.crops.set(tile, { cropId: asContentId('mod:ghost'), tile, plantedTick: 0 });

    expect(valueOf(facts(world), 'Crop')).toBe('mod:ghost');
    expect(valueOf(facts(world), 'Stage')).toBe('Unavailable');
  });

  it('states the enter cost in ticks, so the number means something', () => {
    expect(valueOf(facts(createWorld(1)), 'Enter cost')).toMatch(/^\d+ ticks?$/);
  });
});

describe('createTileInspectProvider', () => {
  const world = createWorld(1);

  it('describes the tile under the pointer', () => {
    const provider = createTileInspectProvider({
      source: () => world,
      tileAt: () => ({ x: 5, y: 7 }),
    });

    expect(provider.inspect({ kind: 'pointer', x: 100, y: 100 })?.title).toBe('Tile 5,7');
  });

  it('says nothing when the pointer is off the world', () => {
    const provider = createTileInspectProvider({ source: () => world, tileAt: () => null });

    expect(provider.inspect({ kind: 'pointer', x: 0, y: 0 })).toBeNull();
  });

  it('says nothing when the tile is off the grid', () => {
    const provider = createTileInspectProvider({
      source: () => world,
      tileAt: () => ({ x: -1, y: 0 }),
    });

    expect(provider.inspect({ kind: 'pointer', x: 0, y: 0 })).toBeNull();
  });

  it('passes the pointer position through to the picker unchanged', () => {
    const seen: Array<readonly [number, number]> = [];
    const provider = createTileInspectProvider({
      source: () => world,
      tileAt: (x, y) => {
        seen.push([x, y]);
        return { x: 0, y: 0 };
      },
    });

    provider.inspect({ kind: 'pointer', x: 640, y: 200 });
    expect(seen).toEqual([[640, 200]]);
  });
});
