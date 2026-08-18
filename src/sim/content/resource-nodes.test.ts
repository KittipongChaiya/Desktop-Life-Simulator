import { describe, expect, it } from 'vitest';

import { asContentId, asTileIndex } from '../../shared/ids';

import {
  createResourceNodeRegistry,
  isNodeReady,
  isSpawnableNode,
  nodeAt,
  type ResourceNodeDefinition,
} from './resource-nodes';

function node(patch: Partial<ResourceNodeDefinition> = {}): ResourceNodeDefinition {
  return {
    id: asContentId('test:timber'),
    displayName: 'Timber',
    sprite: 'buildings:tree',
    yields: [{ item: asContentId('test:wood'), quantity: 2 }],
    gatherTicks: 60,
    regrowTicks: 6_000,
    density: 0.1,
    ...patch,
  };
}

function registryWith(...nodes: ResourceNodeDefinition[]) {
  const registry = createResourceNodeRegistry();
  for (const definition of nodes) registry.register(definition);
  return registry;
}

describe('nodeAt — existence is derived, never stored (ADR-037 §3)', () => {
  it('gives the same answer for the same seed and tile, always', () => {
    // The property the whole design rests on. If this were not stable, the
    // wilds would change shape on every load.
    const registry = registryWith(node());
    for (const tile of [0, 1, 500, 4_321]) {
      const first = nodeAt(registry, 99, asTileIndex(tile));
      const second = nodeAt(registry, 99, asTileIndex(tile));
      expect(second).toBe(first);
    }
  });

  it('gives different worlds different wilds', () => {
    const registry = registryWith(node({ density: 0.5 }));
    const a = Array.from({ length: 200 }, (_, i) => nodeAt(registry, 1, asTileIndex(i)) !== null);
    const b = Array.from({ length: 200 }, (_, i) => nodeAt(registry, 2, asTileIndex(i)) !== null);

    expect(a).not.toEqual(b);
  });

  it('lands near the declared density over many tiles', () => {
    const registry = registryWith(node({ density: 0.25 }));
    let hits = 0;
    for (let tile = 0; tile < 4_000; tile += 1) {
      if (nodeAt(registry, 7, asTileIndex(tile)) !== null) hits += 1;
    }

    // A hash is not a uniform generator; ±5 points is the tolerance that keeps
    // this a distribution check rather than a pin on one implementation.
    expect(hits / 4_000).toBeGreaterThan(0.2);
    expect(hits / 4_000).toBeLessThan(0.3);
  });

  it('leaves most of the wilds empty with no kinds registered', () => {
    const registry = createResourceNodeRegistry();
    expect(nodeAt(registry, 7, asTileIndex(10))).toBeNull();
  });

  it('splits tiles between kinds in registration order', () => {
    const registry = registryWith(
      node({ id: asContentId('test:a'), density: 0.3 }),
      node({ id: asContentId('test:b'), density: 0.3 }),
    );
    const seen = new Set<string>();
    for (let tile = 0; tile < 500; tile += 1) {
      const found = nodeAt(registry, 3, asTileIndex(tile));
      if (found !== null) seen.add(found.id);
    }

    expect(seen.size).toBe(2);
  });
});

describe('isSpawnableNode — refused at registration, not discovered as an empty wilderness', () => {
  it('accepts an ordinary node', () => {
    expect(isSpawnableNode(node())).toBe(true);
  });

  it.each([0, -0.1, 1, 1.5, Number.NaN])('refuses a density of %p', (density) => {
    // Zero never spawns; one or more fills every tile, leaving no floor to
    // walk on — a wilderness that is solid rock is not a wilderness.
    expect(isSpawnableNode(node({ density }))).toBe(false);
  });

  it.each([0, -5, 1.5])('refuses gatherTicks of %p', (gatherTicks) => {
    // A zero-tick node completes on the tick it starts, so one worker could
    // strip the whole band in a single tick.
    expect(isSpawnableNode(node({ gatherTicks }))).toBe(false);
  });

  it('refuses a node that yields nothing', () => {
    expect(isSpawnableNode(node({ yields: [] }))).toBe(false);
  });

  it('accepts a node that never regrows', () => {
    // Deliberately legal: `regrowTicks: 0` is "always available", which is a
    // balance choice for content rather than a malformed definition.
    expect(isSpawnableNode(node({ regrowTicks: 0 }))).toBe(true);
  });
});

describe('isNodeReady — regrowth is arithmetic, so an absence needs no model', () => {
  it('is ready when it has never been worked', () => {
    expect(isNodeReady(node(), undefined, 0)).toBe(true);
  });

  it('is not ready immediately after being worked', () => {
    expect(isNodeReady(node(), 1_000, 1_001)).toBe(false);
  });

  it('is ready again exactly one regrow period later', () => {
    expect(isNodeReady(node(), 1_000, 1_000 + 6_000)).toBe(true);
  });

  it('is ready after an eight-hour absence, with no catch-up involved', () => {
    // The point of deriving regrowth: returning from a gap is a comparison,
    // not a simulation.
    expect(isNodeReady(node(), 10, 576_000)).toBe(true);
  });
});
