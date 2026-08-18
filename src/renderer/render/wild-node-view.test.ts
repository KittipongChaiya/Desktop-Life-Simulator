/**
 * The node layer, drawn. Phase-27.
 *
 * Two things are worth asserting about a Pixi view, and both are about cost.
 * A worked node must LOOK worked, so the mechanic is legible without a tooltip;
 * and nothing may write to four hundred sprites on a frame where nothing
 * changed, because that is how an idle window ends up burning a core
 * (ADR-017 §12).
 */

import { Container, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { TILE_SIZE, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';

import { createDirtyGate } from './dirty-gate';
import { createWildNodeRenderer, type WildNodeRenderer } from './wild-node-view';
import type { WildNodeView } from './wild-nodes';

const TREE = toIndexUnchecked(90, 4);
const ROCK = toIndexUnchecked(92, 7);

const NODES: readonly WildNodeView[] = [
  { tile: TREE, sprite: 'buildings:tree' },
  { tile: ROCK, sprite: 'buildings:rock' },
];

let layer: Container;
let renderer: WildNodeRenderer;

const build = (): WildNodeRenderer => {
  const created = createWildNodeRenderer({
    layer,
    textureFor: () => Texture.EMPTY,
    gate: createDirtyGate(),
  });
  created.set(NODES);
  return created;
};

beforeEach(() => {
  layer = new Container();
});

describe('placing the nodes', () => {
  it('draws one sprite per node', () => {
    renderer = build();
    expect(layer.children.length).toBe(NODES.length);
  });

  it('puts each one on its own tile', () => {
    renderer = build();
    const y = Math.floor(TREE / WORLD_WIDTH);
    const first = layer.children[0]!;

    // Anchored bottom-centre, so the sprite's origin is the tile's bottom edge.
    expect(first.x).toBe((TREE - y * WORLD_WIDTH) * TILE_SIZE + TILE_SIZE / 2);
    expect(first.y).toBe(y * TILE_SIZE + TILE_SIZE);
  });

  it('y-sorts with the buildings and workers it shares a layer with', () => {
    renderer = build();
    expect(layer.children[0]?.zIndex).toBe(Math.floor(TREE / WORLD_WIDTH));
    expect(layer.children[1]?.zIndex).toBe(Math.floor(ROCK / WORLD_WIDTH));
  });

  it('starts every node standing', () => {
    renderer = build();
    for (const child of layer.children) {
      expect(child.alpha).toBe(1);
      expect(child.scale.x).toBe(1);
    }
  });
});

describe('a worked node looks worked', () => {
  it('fades and shrinks the one that was worked', () => {
    renderer = build();

    renderer.setWorked([TREE]);

    expect(layer.children[0]?.alpha).toBeLessThan(1);
    expect(layer.children[0]?.scale.x).toBeLessThan(1);
  });

  it('leaves the others standing', () => {
    renderer = build();

    renderer.setWorked([TREE]);

    expect(layer.children[1]?.alpha).toBe(1);
  });

  it('restores it when the slice says it came back', () => {
    // Regrowth is the half a player waits for, so it has to be visible.
    renderer = build();
    renderer.setWorked([TREE]);

    renderer.setWorked([]);

    expect(layer.children[0]?.alpha).toBe(1);
    expect(layer.children[0]?.scale.x).toBe(1);
  });

  it('does not hide it — an empty tile would say nothing grows here', () => {
    renderer = build();

    renderer.setWorked([TREE]);

    expect(layer.children[0]?.visible).toBe(true);
  });
});

describe('it costs nothing when nothing changed', () => {
  it('ignores the same slice handed back', () => {
    // Change-gated by IDENTITY, like every other view: the slice republishes
    // only when its content moves, so the same array means the same wilds.
    renderer = build();
    const slice: readonly number[] = [TREE];
    renderer.setWorked(slice);

    // Mutating a sprite behind the renderer's back — a second apply would
    // undo this, and nothing here should apply twice.
    layer.children[0]!.alpha = 0.123;
    renderer.setWorked(slice);

    expect(layer.children[0]?.alpha).toBe(0.123);
  });

  it('restores upright exactly once when ambient motion stops', () => {
    renderer = build();
    renderer.sway(1_000, true);

    renderer.sway(2_000, false);
    layer.children[0]!.rotation = 0.9;
    renderer.sway(3_000, false);

    // A second disabled pass must not touch a single sprite.
    expect(layer.children[0]?.rotation).toBe(0.9);
  });
});

describe('what leans and what does not', () => {
  it('leans a tree', () => {
    renderer = build();

    renderer.sway(500, true);

    expect(layer.children[0]?.rotation).not.toBe(0);
  });

  it('never leans a rock', () => {
    renderer = build();

    renderer.sway(500, true);

    expect(layer.children[1]?.rotation).toBe(0);
  });

  it('never leans a felled one', () => {
    // A stump swaying in the wind is a stump pretending to be a tree.
    renderer = build();
    renderer.setWorked([TREE]);

    renderer.sway(500, true);

    expect(layer.children[0]?.rotation).toBe(0);
  });
});

describe('teardown', () => {
  it('leaves the layer empty', () => {
    renderer = build();

    renderer.destroy();

    expect(layer.children.length).toBe(0);
  });
});
