/**
 * Rain on layer 4. Phase-12d — ADR-022 §6.
 *
 * > Rain, snow, and wind particles are **ambient** by ADR-017 §2's definition —
 * > they do not end. They therefore inherit all four conditions unchanged.
 *
 * So this adds no mechanism. It asks the SAME `ambientAllowed` the swaying
 * decor asks, every frame, and draws only when the answer is yes — which means
 * off by default, never while collapsed, never in work mode, and surrendered
 * once the pointer has been idle past `AMBIENT_IDLE_TIMEOUT_MS`. A player
 * watching the farm sees rain; a player who alt-tabbed sees a still world and
 * the frame loop stops.
 *
 * That last property is the acceptance: **weather visuals on, pointer idle →
 * zero `requestAnimationFrame` callbacks.** It holds because the lease is
 * synced from the same boolean that decides whether to draw, so the two cannot
 * disagree.
 *
 * The drops are a fixed pool allocated once (ADR-017 §4) and positioned by a
 * hash rather than a generator (ADR-017 §5) — see `rain-state.ts`.
 */

import { Graphics, type Container } from 'pixi.js';

import { bindAnimationLease, type AnimationLease } from './animation-lease';
import type { DirtyGate } from './dirty-gate';
import { dropDrift, dropFall, RAIN_DROPS } from './rain-state';

/** Drop size in CSS pixels. Thin and short — rain, not hail. */
const DROP_WIDTH = 1;
const DROP_HEIGHT = 7;
const DROP_COLOUR = 0xaecbe8;
const DROP_ALPHA = 0.5;

export interface RainRendererOptions {
  readonly layer: Container;
  readonly gate: DirtyGate;
  readonly width: number;
  readonly height: number;
}

export interface RainRenderer {
  /**
   * Draws a frame of rain, or none.
   *
   * `raining` is simulation state (the weather kind's rainfall); `ambient` is
   * the presence answer. Both must be true — the first says there is rain to
   * draw, the second says anyone is there to see it.
   */
  update(raining: boolean, ambient: boolean, nowMs: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export function createRainRenderer(options: RainRendererOptions): RainRenderer {
  const sheet = new Graphics();
  // Rain must never intercept a click — it covers the whole viewport.
  sheet.eventMode = 'none';
  sheet.interactiveChildren = false;
  sheet.visible = false;
  options.layer.addChild(sheet);

  const lease: AnimationLease = bindAnimationLease(options.gate);

  let width = options.width;
  let height = options.height;
  let drawing = false;

  return {
    update(raining, ambient, nowMs) {
      const live = raining && ambient;

      if (!live) {
        // Clearing once on the transition out, not every frame: a hidden sheet
        // costs nothing, and clearing per frame would be work done precisely
        // when the point is to do none.
        if (drawing) {
          sheet.clear();
          sheet.visible = false;
          drawing = false;
          options.gate.markDirty();
        }
        lease.sync(false);
        return;
      }

      sheet.visible = true;
      drawing = true;
      sheet.clear();

      for (let index = 0; index < RAIN_DROPS; index += 1) {
        const x = dropDrift(index, nowMs) * width;
        const y = dropFall(index, nowMs) * height;
        sheet.rect(x, y, DROP_WIDTH, DROP_HEIGHT);
      }
      sheet.fill({ color: DROP_COLOUR, alpha: DROP_ALPHA });

      options.gate.markDirty();
      lease.sync(true);
    },

    resize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      options.gate.markDirty();
    },

    destroy() {
      lease.release();
      sheet.destroy();
    },
  };
}
