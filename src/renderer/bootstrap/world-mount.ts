/**
 * Mounts and unmounts the world view in response to collapse state.
 *
 * COLLAPSED MODE DESTROYS THE PIXI APPLICATION ENTIRELY (ADR-001 §2). The
 * overlay spends roughly 85% of its life collapsed (PERFORMANCE.md §3), and
 * tearing down the GPU context there is the single largest idle-cost win
 * available. It is only possible because the renderer holds no authoritative
 * state — rebuilding from world state is lossless (ADR-003 §4).
 *
 * Because this destroys and rebuilds on every toggle, it is also the most
 * likely place for a leak. Everything acquired in `mount` is released in
 * `unmount`, and phase-02 acceptance criterion 18 cycles it 20 times.
 */

import { createWorldView, type WorldView, type WorldViewOptions } from '@render/world-view';

import type { World } from '../../sim/world/world';

export interface WorldMount {
  /** Creates the view if absent. Safe to call repeatedly. */
  mount(): Promise<void>;
  /** Destroys the view if present. Safe to call repeatedly. */
  unmount(): void;
  /** The live view, or null while collapsed. */
  current(): WorldView | null;
  resize(width: number, height: number): void;
}

export interface WorldMountOptions {
  readonly canvas: HTMLCanvasElement;
  readonly world: World;
  readonly atlas: string;
  readonly viewport: () => {
    width: number;
    height: number;
    resolution: number;
    /** Logical pixels of viewport hidden behind the status bar (07.9). */
    topInset: number;
  };
  /**
   * Whether a drag currently belongs to something other than the camera
   * (phase-48). Zone painting answers true while armed: the camera captures
   * the pointer, and capture cancels every other listener's gesture.
   */
  readonly suppressDrag?: () => boolean;
  /** Element that receives drag-to-pan and wheel-to-zoom. */
  readonly inputTarget: HTMLElement;
  /** The selected worker id, forwarded to the view's selection box. */
  readonly selectedWorkerId: () => number | null;
  /** Motion strength 0–1, forwarded to every animated renderer (ADR-017 §7). */
  readonly motionIntensity: () => number;
  /** Whether particles may be thrown (ADR-017 §7). */
  readonly particlesEnabled: () => boolean;
  /** Whether living things move on their own (ADR-017 §2). */
  readonly creaturesEnabled: () => boolean;
  /** Whether the camera may shake (ADR-017 §7). */
  readonly shakeEnabled: () => boolean;
  /** Whether ambient environment motion may run (ADR-017 §2). */
  readonly environmentEnabled: () => boolean;
  /** In-world debug overlays (07.8i, 07.8j). Absent in a build with no tooling. */
  readonly debug?: WorldViewOptions['debug'];
  readonly onError?: (error: unknown) => void;
}

export function createWorldMount(options: WorldMountOptions): WorldMount {
  let view: WorldView | null = null;
  let detachInput: (() => void) | null = null;
  // Guards against a second mount starting while the first is still awaiting
  // GPU init — a fast collapse/expand toggle would otherwise create two apps.
  let mounting: Promise<void> | null = null;
  // Set when a collapse lands while a build is still in flight. The build
  // cannot be cancelled, so the world it produces is thrown away instead.
  let abandoned = false;

  const build = async (): Promise<void> => {
    const size = options.viewport();
    try {
      const built = await createWorldView({
        canvas: options.canvas,
        world: options.world,
        width: size.width,
        height: size.height,
        resolution: size.resolution,
        viewportTopInset: size.topInset,
        atlas: options.atlas,
        selectedWorkerId: options.selectedWorkerId,
        motionIntensity: options.motionIntensity,
        particlesEnabled: options.particlesEnabled,
        creaturesEnabled: options.creaturesEnabled,
        shakeEnabled: options.shakeEnabled,
        environmentEnabled: options.environmentEnabled,
        debug: options.debug,
      });
      // Collapsed while this was building: discard it before it is anything
      // the rest of the app can see. Destroying here rather than adopting it
      // is what keeps ADR-001 §2's promise literal — collapsed holds no GPU
      // context — and it happens before input is attached, so no listener is
      // ever bound to a world that is about to go.
      if (abandoned) {
        built.destroy();
        return;
      }

      view = built;
      detachInput = view.attachInput(options.inputTarget, options.suppressDrag);

      // The window is a different size now than when this build started —
      // routinely, on every expand. Collapse state is applied optimistically
      // in the renderer (the UI must not wait on IPC), so the mount begins
      // while the window is still at its COLLAPSED height and main resizes it
      // a moment later. That resize arrives while this build is still awaiting
      // the GPU, where `resize` has no view to forward it to and drops it.
      //
      // So the size sampled before the await is not evidence of anything: read
      // the viewport again now that the view exists. A resize that lands after
      // this point finds a live view and applies normally, so between the two
      // every ordering is covered.
      //
      // Without this, expanding after a collapse left a renderer the height of
      // the collapsed bar inside the expanded window, and the world below the
      // status bar was simply not drawn — reported as "the game screen turned
      // black".
      const current = options.viewport();
      if (current.width !== size.width || current.height !== size.height) {
        view.resize(current.width, current.height);
      }
    } catch (error) {
      // A GPU failure must not take the application down; the UI and the
      // simulation keep working without a world view.
      options.onError?.(error);
      view = null;
    } finally {
      mounting = null;
    }
  };

  return {
    async mount() {
      if (view !== null) return;
      // An expand that arrives before an in-flight build resolves keeps that
      // build: the world it is producing is the one now wanted.
      abandoned = false;
      mounting ??= build();
      await mounting;
    },

    unmount() {
      // A build still in flight has nothing to destroy YET — but it will, and
      // by then nobody is asking for it. Mark it so the build discards its own
      // result rather than leaving a live GPU context behind a status bar.
      if (view === null) {
        if (mounting !== null) abandoned = true;
        return;
      }
      // Detach BEFORE destroying: a listener firing against a destroyed view
      // would throw on every pointer move.
      detachInput?.();
      detachInput = null;
      view.destroy();
      view = null;
    },

    current: () => view,

    resize(width, height) {
      view?.resize(width, height);
    },
  };
}
