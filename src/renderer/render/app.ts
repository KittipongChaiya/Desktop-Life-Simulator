/**
 * PixiJS application lifecycle. ADR-001.
 *
 * Every option here is a constraint from that ADR, not a preference:
 *
 *   autoStart: false      — the ticker never runs on its own. Rendering happens
 *                           only when the dirty gate says so. This single flag
 *                           is what makes render-on-demand possible at all.
 *   antialias: false      — pixel art must not be smoothed (ASSETS.md §8).
 *   powerPreference       — 'low-power' so a laptop's discrete GPU is not woken
 *                           for a farm sim (ADR-001 §Tradeoffs).
 *   nearest scaling       — set globally before any texture loads; setting it
 *                           afterwards leaves already-uploaded textures linear.
 *
 * `destroy()` must release everything: collapsed mode tears the whole
 * application down (ADR-001 §2), and anything retained across a
 * collapse/expand cycle leaks on every toggle.
 */

import { Application, Container, TextureSource, type Renderer } from 'pixi.js';
// SIDE-EFFECT IMPORT, and it must come before any renderer is created.
//
// PixiJS generates shader, uniform, and UBO sync code with `new Function()`.
// The renderer runs under a strict CSP with no 'unsafe-eval'
// (src/renderer/index.html), so that generation throws and the renderer never
// initializes. This module installs pre-written polyfills instead.
//
// The alternative — adding 'unsafe-eval' to the CSP — was rejected: the
// renderer will execute plugin code from v0.2 (ADR-003 §6), and handing it
// eval to save one import is a bad trade (TECH_STACK.md §7.3).
//
// Failure mode if removed: "Current environment does not allow unsafe-eval",
// swallowed by the mount's error handler, leaving an overlay with no world and
// no explanation. That is exactly how it presented on the first live check.
import 'pixi.js/unsafe-eval';

import { createLayers, destroyLayers, type Layers } from './layers';

export interface RenderApp {
  readonly app: Application;
  readonly layers: Layers;
  /** The renderer actually in use, for capability reporting. */
  readonly backend: RenderBackend;
  /** Draws one frame. Called only when the dirty gate allows it. */
  render(): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export const RenderBackend = {
  WebGPU: 'webgpu',
  WebGL: 'webgl',
  /** ADR-001 §Fallback: degraded mode, layers 0-3 and 6 only. */
  Canvas: 'canvas',
} as const;

export type RenderBackend = (typeof RenderBackend)[keyof typeof RenderBackend];

export interface RenderAppOptions {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
}

function detectBackend(renderer: Renderer): RenderBackend {
  const type = String(renderer.type);
  if (type.includes('gpu')) return RenderBackend.WebGPU;
  if (type.includes('gl')) return RenderBackend.WebGL;
  return RenderBackend.Canvas;
}

/**
 * Initializes PixiJS.
 *
 * Async because `Application.init` is async in v8 — GPU adapter acquisition
 * cannot be synchronous.
 */
export async function createRenderApp(options: RenderAppOptions): Promise<RenderApp> {
  // MUST precede any texture upload. Textures created before this keep the
  // default linear filtering and render blurry with no obvious cause.
  TextureSource.defaultOptions.scaleMode = 'nearest';

  const app = new Application();

  await app.init({
    canvas: options.canvas,
    width: options.width,
    height: options.height,
    resolution: options.resolution,
    autoDensity: true,

    // The ticker never starts. Frames are driven by the dirty gate.
    autoStart: false,
    sharedTicker: false,

    antialias: false,
    powerPreference: 'low-power',

    // The overlay window is transparent; an opaque background would paint a
    // rectangle over the desktop.
    backgroundAlpha: 0,
    // Required so the canvas can be read back for screenshots and tests.
    preserveDrawingBuffer: true,
  });

  // Belt and braces: init() should not have started it, but a running ticker
  // silently defeats the entire rendering decision.
  app.ticker.stop();

  const layers = createLayers(app.stage);

  return {
    app,
    layers,
    backend: detectBackend(app.renderer),

    render() {
      app.renderer.render(app.stage);
    },

    resize(width, height) {
      app.renderer.resize(width, height);
    },

    destroy() {
      destroyLayers(layers);
      // removeView releases the canvas' GPU context rather than leaving it
      // attached to a detached element.
      app.destroy({ removeView: false }, { children: true, texture: false });
    },
  };
}

/** An empty stage, for tests that need layers without a GPU. */
export function createDetachedStage(): Container {
  return new Container();
}
