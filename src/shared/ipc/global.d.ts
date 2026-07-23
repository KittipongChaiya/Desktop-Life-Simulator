/**
 * The `window.desktopLife` global exposed by the preload bridge.
 *
 * Declared here rather than inside the renderer entry so that E2E tests, which
 * drive the real bridge through `page.evaluate`, see the same type. Duplicating
 * it would let the two definitions drift silently.
 */

import type { CompanionState, OverlayState } from './contract';

declare global {
  interface Window {
    readonly desktopLife: {
      readonly overlay: {
        setCollapsed(collapsed: boolean): Promise<OverlayState>;
        getState(): Promise<OverlayState>;
        setClickThrough(enabled: boolean): void;
        onStateChanged(listener: (state: OverlayState) => void): () => void;
      };
      readonly companion: {
        setOpacity(percent: number): Promise<CompanionState>;
        getState(): Promise<CompanionState>;
        toggleHidden(): Promise<CompanionState>;
        toggleClickThrough(): Promise<CompanionState>;
        toggleWorkMode(): Promise<CompanionState>;
        onStateChanged(listener: (state: CompanionState) => void): () => void;
      };
      readonly app: {
        quit(): Promise<void>;
      };
    };
  }
}

export {};
