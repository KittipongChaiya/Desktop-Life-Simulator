/**
 * Render layers. ADR-001 §Layers.
 *
 * Order is defined ONCE, here, as named containers — never implied by
 * `addChild` call order scattered across files. Implied ordering is how a
 * renderer ends up with a draw order nobody can predict or change safely.
 *
 * Layer 4 (`effects`) was created and left empty through v0.1's build-out, and
 * phase-07.5b claimed it exactly as intended: the harvest burst and the
 * confirmation ring draw there, with no re-layering migration required. That
 * is what reserving it bought.
 *
 * Layer 5 (`lighting`) was claimed in phase-10c by the day/night tint, on the
 * same terms layer 4 was: reserved empty through v0.1, filled by the feature
 * that needed it, with no re-layering migration. Weather (phase 12) draws here
 * too. Nothing else belongs in it — a layer above the world that is not LIGHT
 * is a layer that will fight the one that is.
 */

import { Container } from 'pixi.js';

export const LAYER_NAMES = [
  'terrain',
  'terrainOverlay',
  'objects',
  'entities',
  'effects',
  'lighting',
  'worldUi',
] as const;

export type LayerName = (typeof LAYER_NAMES)[number];

export type Layers = Readonly<Record<LayerName, Container>>;

/**
 * Creates the layer containers and parents them to `stage` in draw order.
 *
 * `sortableChildren` is enabled only for layers that need y-sorting — it costs
 * a sort per frame, and terrain never overlaps itself.
 */
export function createLayers(stage: Container): Layers {
  const ySorted = new Set<LayerName>(['objects', 'entities']);
  const layers = {} as Record<LayerName, Container>;

  for (const name of LAYER_NAMES) {
    const container = new Container();
    container.label = name;
    container.sortableChildren = ySorted.has(name);
    stage.addChild(container);
    layers[name] = container;
  }

  return layers;
}

/**
 * Destroys every layer and its contents.
 *
 * Pixi holds GPU resources that garbage collection will not reclaim, so
 * teardown must be explicit (CODE_STYLE.md §10). This is the most likely source
 * of a memory-budget failure, because collapsed mode destroys and rebuilds the
 * whole scene (ADR-001 §2).
 */
export function destroyLayers(layers: Layers): void {
  for (const name of LAYER_NAMES) {
    layers[name].destroy({ children: true });
  }
}
