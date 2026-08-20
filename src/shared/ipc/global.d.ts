/**
 * The `window.desktopLife` global exposed by the preload bridge.
 *
 * Declared here rather than inside the renderer entry so that E2E tests, which
 * drive the real bridge through `page.evaluate`, see the same type. Duplicating
 * it would let the two definitions drift silently.
 */

import type { MotionSettings } from '../motion';

import type {
  ApplyUpdateResult,
  ArchiveOutcome,
  CompanionState,
  OverlayState,
  SavesOnDisk,
  SaveWriteOutcome,
  SourceDiscovery,
  UpdateAnnouncement,
  UpdateState,
} from './contract';

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
        setVolume(percent: number): Promise<CompanionState>;
        /** Patches motion preferences (phase-07.7L). Partial by design. */
        setMotion(patch: Partial<MotionSettings>): Promise<CompanionState>;
        setCategoryPercent(category: string, percent: number): Promise<CompanionState>;
        toggleMuted(): Promise<CompanionState>;
        onStateChanged(listener: (state: CompanionState) => void): () => void;
      };
      /** Content sources on disk (phase-09d). Unvalidated; the renderer judges. */
      readonly plugins: {
        discover(): Promise<SourceDiscovery>;
      };
      readonly save: {
        load(): Promise<SavesOnDisk>;
        write(document: unknown): Promise<SaveWriteOutcome>;
        /** Ends the farm: archives every save artifact (ADR-045). */
        archive(): Promise<ArchiveOutcome>;
        onSaveRequested(listener: () => void): () => void;
      };
      /**
       * Updating (phase-15, ADR-025 §5/§6).
       *
       * The pin is POLLED and the announcement is PUSHED, and the asymmetry is
       * the design: a pin is a value the UI reads when it renders, while an
       * announcement is a moment decided in main — the announcer holds an offer
       * while the player is hidden or in work mode and releases it when they
       * return, which a poll would either miss or have to spin to catch.
       */
      readonly update: {
        getState(): Promise<UpdateState>;
        setPinnedVersion(version: string | null): Promise<UpdateState>;
        apply(): Promise<ApplyUpdateResult>;
        onAnnouncement(listener: (announcement: UpdateAnnouncement) => void): () => void;
      };
      readonly app: {
        quit(): Promise<void>;
      };
    };
  }
}

export {};
