/**
 * Core tile kinds. Phase-08.0d.
 *
 * THE INDEX IS THE SAVE FORMAT. The grid stores one byte per tile holding the
 * kind's registry index (ADR-004 §2), so the order of the list in
 * the core source registers them is on-disk data, not a detail. Inserting a kind
 * anywhere but the end renumbers every kind after it, and every existing save
 * decodes to different terrain than it was written with — grass becoming water
 * under a farm nobody can walk across.
 *
 * The source comment already says "appended, so grass/water/stone keep their
 * indices". This is the test that makes that a rule rather than a note.
 */

import { describe, expect, it } from 'vitest';

import { applyInstalledSources, createInstalledRegistries } from './installed';
import type { TileKindRegistry } from './tile-kinds';
import { CORE_GRASS, CORE_PATH, CORE_STONE, CORE_WATER } from './tile-kinds';

const registered = (): TileKindRegistry => {
  const registry = createInstalledRegistries().tileKinds;
  return registry;
};

describe('the core tile kinds a world is created with', () => {
  it('registers every core kind', () => {
    const registry = registered();
    for (const id of [CORE_GRASS, CORE_WATER, CORE_STONE, CORE_PATH]) {
      expect(registry.has(id), id).toBe(true);
    }
    expect(registry.size).toBe(4);
  });

  it('pins the index of every shipped kind — these bytes are in save files', () => {
    const registry = registered();
    expect(
      [CORE_GRASS, CORE_WATER, CORE_STONE, CORE_PATH].map((id) => registry.indexOf(id)),
    ).toEqual([0, 1, 2, 3]);
  });

  it('refuses a second installation into the same registry, rather than duplicating', () => {
    // A silent duplicate here would leave the grid decoding kind bytes that
    // point at definitions nobody registered.
    const targets = createInstalledRegistries();
    expect(applyInstalledSources(targets).ok).toBe(false);
  });
});

describe('the walkability data movement depends on', () => {
  it('lets workers cross grass and paths, and never water or stone', () => {
    const registry = registered();
    const walkable = (id: Parameters<typeof registry.get>[0]): boolean => {
      const result = registry.get(id);
      return result.ok && result.value.walkable;
    };

    expect([walkable(CORE_GRASS), walkable(CORE_PATH)]).toEqual([true, true]);
    expect([walkable(CORE_WATER), walkable(CORE_STONE)]).toEqual([false, false]);
  });

  it('makes only grass tillable — a farm cannot be planted on stone', () => {
    const registry = registered();
    const tillable = registry.all().filter((kind) => kind.tillable);
    expect(tillable.map((kind) => kind.id)).toEqual([CORE_GRASS]);
  });

  it('gives every walkable kind a positive move cost, and a path the cheapest', () => {
    // A zero cost on a walkable kind would make A* treat it as free and route
    // every worker through it.
    const registry = registered();
    for (const kind of registry.all()) {
      if (!kind.walkable) continue;
      expect(kind.moveCost, kind.id).toBeGreaterThan(0);
    }

    const path = registry.get(CORE_PATH);
    const grass = registry.get(CORE_GRASS);
    expect(path.ok && grass.ok && path.value.moveCost < grass.value.moveCost).toBe(true);
  });

  it('gives every kind a sprite, so no tile can render as nothing', () => {
    for (const kind of registered().all()) {
      expect(kind.sprite.length, kind.id).toBeGreaterThan(0);
    }
  });
});
