/**
 * The node layer's plan. Phase-27.
 *
 * The properties that matter are the ones that keep what the player SEES and
 * what a worker can WORK in step: the plan agrees with `selectGather` about
 * which tiles hold something, it never reaches outside the wilds, and it is the
 * same on every launch — because nothing about it is saved.
 */

import { describe, expect, it } from 'vitest';

import '../../../plugins/core';
import { WILDS_MIN_X, WORLD_WIDTH } from '../../shared/constants';
import { isInWilds, toIndexUnchecked } from '../../shared/geometry';
import { readyNodeAt } from '../../sim/ai/gather';
import { nodeAt } from '../../sim/content/resource-nodes';
import { setBlocked } from '../../sim/world/tile-grid';
import { createWorld } from '../../sim/world/world';

import { planWildNodes } from './wild-nodes';

const plan = (world: ReturnType<typeof createWorld>): ReturnType<typeof planWildNodes> =>
  planWildNodes(world.resourceNodeRegistry, world.seed, world.tiles);

describe('what the node layer draws', () => {
  it('draws something — the wilds are not empty', () => {
    const world = createWorld(4242);
    expect(plan(world).length).toBeGreaterThan(200);
  });

  it('draws every node the simulation says is there', () => {
    // THE ONE THAT MATTERS. A node the player cannot see is content that does
    // not exist as far as they are concerned — which is what phase-27 shipped
    // before this layer: `gatherNode` worked perfectly and the wilds were
    // thirty-two columns of blank grass.
    const world = createWorld(4242);
    const drawn = new Set(plan(world).map((node) => node.tile));

    for (let y = 0; y < world.tiles.height; y += 1) {
      for (let x = WILDS_MIN_X; x < WORLD_WIDTH; x += 1) {
        const tile = toIndexUnchecked(x, y);
        if (nodeAt(world.resourceNodeRegistry, world.seed, tile) === null) continue;
        expect(drawn.has(tile)).toBe(true);
      }
    }
  });

  it('draws nothing the simulation would refuse', () => {
    // The other direction: every sprite is a tile `readyNodeAt` answers for,
    // so nothing on screen is scenery pretending to be work.
    const world = createWorld(4242);

    for (const node of plan(world)) {
      expect(readyNodeAt(world, node.tile)).not.toBeNull();
    }
  });

  it('stays inside the wilds', () => {
    const world = createWorld(4242);
    for (const node of plan(world)) expect(isInWilds(node.tile)).toBe(true);
  });

  it('names a real sprite for every node', () => {
    const world = createWorld(4242);
    for (const node of plan(world)) expect(node.sprite).not.toBe('');
  });

  it('skips a blocked tile, which no worker could reach', () => {
    const world = createWorld(4242);
    const first = plan(world)[0]!;

    setBlocked(world.tiles, first.tile, true);

    expect(plan(world).map((node) => node.tile)).not.toContain(first.tile);
  });
});

describe('the plan is stable', () => {
  it('is the same on every launch', () => {
    // Nothing here is saved, so the layer is re-planned from the seed on every
    // start. A wilderness that rearranged itself between sessions would read
    // as a different world.
    const world = createWorld(4242);
    expect(plan(world)).toEqual(plan(world));
  });

  it('differs between seeds', () => {
    expect(plan(createWorld(1))).not.toEqual(plan(createWorld(2)));
  });

  it('places at most one node per tile', () => {
    const world = createWorld(4242);
    const nodes = plan(world);

    expect(new Set(nodes.map((node) => node.tile)).size).toBe(nodes.length);
  });

  it('leaves most of the wilds walkable', () => {
    // A band packed with nodes is a maze, not a wilderness — and a worker has
    // to cross it to reach the far side (ADR-037 §5).
    const world = createWorld(4242);
    const wildTiles = (WORLD_WIDTH - WILDS_MIN_X) * world.tiles.height;

    expect(plan(world).length).toBeLessThan(wildTiles / 2);
  });
});
