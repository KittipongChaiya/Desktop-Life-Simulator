/**
 * Dependency injection for the snapshot store and the overlay API.
 *
 * Context rather than a module-level singleton so tests can mount the UI
 * against a stub store without a running simulation or an Electron process.
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { PlayerInputSource } from '../../sim/commands/sources';
import type { SnapshotStore } from '../../sim/snapshot/store-contract';

import type { ActionFeedback } from './action-feedback';
import type { SoundBus } from './audio';
import type { CompanionController } from './companion-controller';
import type { OverlayController } from './overlay-controller';
import type { PlacementController } from './placement';
import type { ReturnSummaryController } from './return-summary';
import type { SaveController } from './save-controller';
import type { SeedSelection } from './seed-selection';
import type { ToolSelection } from './tool-selection';
import type { WorkerSelection } from './worker-selection';

interface AppServices {
  readonly store: SnapshotStore;
  readonly overlay: OverlayController;
  /** The player's write path into the simulation — the HUD's hire button, etc. */
  readonly player: PlayerInputSource;
  /** The selected worker — shared with the renderer's selection box. */
  readonly selection: WorkerSelection;
  /** The armed building — shared with the renderer's build ghost. */
  readonly placement: PlacementController;
  /** The crop the seed tool plants — shared with the click mapping (06e). */
  readonly seeds: SeedSelection;
  /** Desktop-companion state — opacity dial, work mode (01.8a, ADR-014). */
  readonly companion: CompanionController;
  /** Manual save and the failure notification (07e, `SAVE_FORMAT.md` §7.2/§7.3). */
  readonly save: SaveController;
  /** The offline-progress summary this session came back to (07e, §9.4). */
  readonly returnSummary: ReturnSummaryController;
  /** The sound bus (07.5a, ADR-016). Audibility is decided inside it. */
  readonly sound: SoundBus;
  /** The held tool — shared with the click mapping (07.5h). */
  readonly tools: ToolSelection;
  /** Why the last action was refused (07.5i). Silence was the bug. */
  readonly actionFeedback: ActionFeedback;
}

const ServicesContext = createContext<AppServices | null>(null);

export interface AppProvidersProps {
  readonly store: SnapshotStore;
  readonly overlay: OverlayController;
  readonly player: PlayerInputSource;
  readonly selection: WorkerSelection;
  readonly placement: PlacementController;
  readonly seeds: SeedSelection;
  readonly companion: CompanionController;
  readonly save: SaveController;
  readonly returnSummary: ReturnSummaryController;
  readonly sound: SoundBus;
  readonly tools: ToolSelection;
  readonly actionFeedback: ActionFeedback;
  readonly children: ReactNode;
}

export function AppProviders({
  store,
  overlay,
  player,
  selection,
  placement,
  seeds,
  companion,
  save,
  returnSummary,
  sound,
  tools,
  actionFeedback,
  children,
}: AppProvidersProps): ReactNode {
  return (
    <ServicesContext.Provider
      value={{
        store,
        overlay,
        player,
        selection,
        placement,
        seeds,
        companion,
        save,
        returnSummary,
        sound,
        tools,
        actionFeedback,
      }}
    >
      {children}
    </ServicesContext.Provider>
  );
}

function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (services === null) {
    throw new Error('AppProviders is missing above this component');
  }
  return services;
}

export function useSnapshotStore(): SnapshotStore {
  return useServices().store;
}

export function useOverlay(): OverlayController {
  return useServices().overlay;
}

export function usePlayer(): PlayerInputSource {
  return useServices().player;
}

export function useWorkerSelection(): WorkerSelection {
  return useServices().selection;
}

export function usePlacement(): PlacementController {
  return useServices().placement;
}

export function useSeeds(): SeedSelection {
  return useServices().seeds;
}

export function useCompanion(): CompanionController {
  return useServices().companion;
}

export function useSave(): SaveController {
  return useServices().save;
}

export function useReturnSummary(): ReturnSummaryController {
  return useServices().returnSummary;
}

export function useSound(): SoundBus {
  return useServices().sound;
}

export function useToolSelection(): ToolSelection {
  return useServices().tools;
}

export function useActionFeedback(): ActionFeedback {
  return useServices().actionFeedback;
}
