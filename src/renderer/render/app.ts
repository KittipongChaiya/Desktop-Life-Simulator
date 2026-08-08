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

import { Application, Container, RendererType, TextureSource, type Renderer } from 'pixi.js';
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

/**
 * Maps Pixi's renderer type to our backend name.
 *
 * `RendererType` is a NUMERIC enum (WEBGL=1, WEBGPU=2, CANVAS=4). An earlier
 * version string-matched `String(renderer.type)` for 'gl'/'gpu', which never
 * matched "1" or "2" and so reported `canvas` unconditionally — the metric
 * confidently reported a fallback that was not happening.
 */
function detectBackend(renderer: Renderer): RenderBackend {
  // Compared numerically rather than with a switch: `renderer.type` is widened
  // to `number` on the union of renderer classes, so a switch over the enum
  // members is flagged as an unsafe enum comparison.
  const type: number = renderer.type;
  if (type === Number(RendererType.WEBGPU)) return RenderBackend.WebGPU;
  if (type === Number(RendererType.WEBGL)) return RenderBackend.WebGL;
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

    // ADR-001 §Fallback, implemented as a preference CHAIN rather than a
    // hand-written backend. Pixi 8 ships a CanvasRenderer, so the degraded path
    // is a configuration choice: try WebGPU, then WebGL, then Canvas. A machine
    // with no working GPU path still gets a playable game.
    //
    // The canvas renderer has no filters or blend modes, which is exactly the
    // "reduced visual fidelity, layers 0-3 and 6" scope the ADR describes.
    // Layer 5's day/night tint is deliberately a plain alpha-filled rectangle
    // rather than a blend mode, so the degraded path gets a dimmer night rather
    // than no night at all (phase-10c).
    preference: ['webgpu', 'webgl', 'canvas'],

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
