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

import { createWorldView, type WorldView } from '@render/world-view';

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
  readonly viewport: () => { width: number; height: number; resolution: number };
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
  readonly onError?: (error: unknown) => void;
}

export function createWorldMount(options: WorldMountOptions): WorldMount {
  let view: WorldView | null = null;
  let detachInput: (() => void) | null = null;
  // Guards against a second mount starting while the first is still awaiting
  // GPU init — a fast collapse/expand toggle would otherwise create two apps.
  let mounting: Promise<void> | null = null;

  const build = async (): Promise<void> => {
    const size = options.viewport();
    try {
      view = await createWorldView({
        canvas: options.canvas,
        world: options.world,
        width: size.width,
        height: size.height,
        resolution: size.resolution,
        atlas: options.atlas,
        selectedWorkerId: options.selectedWorkerId,
        motionIntensity: options.motionIntensity,
        particlesEnabled: options.particlesEnabled,
        creaturesEnabled: options.creaturesEnabled,
        shakeEnabled: options.shakeEnabled,
        environmentEnabled: options.environmentEnabled,
      });
      detachInput = view.attachInput(options.inputTarget);
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
      mounting ??= build();
      await mounting;
    },

    unmount() {
      // If a mount is still in flight there is nothing to destroy yet; the
      // caller re-checks collapse state once it resolves.
      if (view === null) return;
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
