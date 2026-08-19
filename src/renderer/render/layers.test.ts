/**
 * Render layers. Phase-40 — ADR-001 §Layers, ADR-042 §1.
 *
 * ADR-001 says the draw order is "defined ONCE, here, as named containers —
 * never implied by `addChild` call order". Nothing checked that, so the one
 * property the whole renderer's composition rests on was held by a comment.
 * Phase-40 merged two layers into one and no test noticed, which is how this
 * file came to exist.
 */

import { Container } from 'pixi.js';
import { describe, expect, it } from 'vitest';

import { createLayers, destroyLayers, LAYER_NAMES } from './layers';

describe('the layer stack', () => {
  it('parents every layer to the stage in declared draw order', () => {
    // Pixi draws children in index order, so the array IS the draw order.
    const stage = new Container();
    const layers = createLayers(stage);

    expect(stage.children.map((child) => child.label)).toEqual([...LAYER_NAMES]);
    for (const name of LAYER_NAMES) {
      expect(stage.children[LAYER_NAMES.indexOf(name)]).toBe(layers[name]);
    }

    destroyLayers(layers);
  });

  it('keeps ground below the world, and light and UI above it', () => {
    // Stated as relationships rather than indices, so inserting a layer does
    // not fail this test for the wrong reason.
    const order = (name: (typeof LAYER_NAMES)[number]): number => LAYER_NAMES.indexOf(name);

    expect(order('terrain')).toBeLessThan(order('terrainOverlay'));
    expect(order('terrainOverlay')).toBeLessThan(order('world'));
    expect(order('world')).toBeLessThan(order('effects'));
    expect(order('effects')).toBeLessThan(order('lighting'));
    expect(order('lighting')).toBeLessThan(order('worldUi'));
  });

  it('y-sorts the world layer and nothing else', () => {
    // THE PROPERTY PHASE-40 EXISTS FOR. Buildings, props, crops and people
    // share one container precisely so they can sort against each other; two
    // sorted containers meant every entity drew above every object, so a worker
    // could never pass behind a tree.
    //
    // And only that one: sorting costs a pass per frame, and terrain never
    // overlaps itself.
    const stage = new Container();
    const layers = createLayers(stage);

    const sorted = LAYER_NAMES.filter((name) => layers[name].sortableChildren);

    expect(sorted).toEqual(['world']);

    destroyLayers(layers);
  });

  it('has exactly one layer that world objects share', () => {
    // A regression guard with a target: if someone reintroduces a second
    // sorted world container, the occlusion this phase bought silently stops
    // working and nothing else in the suite would say so.
    expect(LAYER_NAMES).toContain('world');
    expect(LAYER_NAMES).not.toContain('objects');
    expect(LAYER_NAMES).not.toContain('entities');
  });
});
