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
import type { NewGameController } from './new-game-controller';
import type { OverlayController } from './overlay-controller';
import type { PlacementController } from './placement';
import type { ReturnSummaryController } from './return-summary';
import type { SaveController } from './save-controller';
import type { SeedSelection } from './seed-selection';
import type { ToolSelection } from './tool-selection';
import type { UpdateController } from './update-controller';
import type { WorkerSelection } from './worker-selection';
import type { ZonePaintingController } from './zone-painting';

interface AppServices {
  readonly store: SnapshotStore;
  readonly overlay: OverlayController;
  /** The player's write path into the simulation — the HUD's hire button, etc. */
  readonly player: PlayerInputSource;
  /** The selected worker — shared with the renderer's selection box. */
  readonly selection: WorkerSelection;
  /** The armed building — shared with the renderer's build ghost. */
  readonly placement: PlacementController;
  /** The worker whose zone is being painted — shared with the zone overlay. */
  readonly zonePainting: ZonePaintingController;
  /** The crop the seed tool plants — shared with the click mapping (06e). */
  readonly seeds: SeedSelection;
  /** Desktop-companion state — opacity dial, work mode (01.8a, ADR-014). */
  readonly companion: CompanionController;
  /** Manual save and the failure notification (07e, `SAVE_FORMAT.md` §7.2/§7.3). */
  readonly save: SaveController;
  /** Ending this farm and starting another (ADR-045). Touches no world. */
  readonly newGame: NewGameController;
  /** The offline-progress summary this session came back to (07e, §9.4). */
  readonly returnSummary: ReturnSummaryController;
  /** The sound bus (07.5a, ADR-016). Audibility is decided inside it. */
  readonly sound: SoundBus;
  /** The held tool — shared with the click mapping (07.5h). */
  readonly tools: ToolSelection;
  /** Why the last action was refused (07.5i). Silence was the bug. */
  readonly actionFeedback: ActionFeedback;
  /**
   * The version running, the pin, and what main is announcing (15, ADR-025).
   *
   * Its own service rather than a field on the companion: `CompanionState` is
   * the presence family — how much of your attention the overlay may take —
   * and a version pin intrudes on none of it.
   */
  readonly update: UpdateController;
}

const ServicesContext = createContext<AppServices | null>(null);

export interface AppProvidersProps {
  readonly store: SnapshotStore;
  readonly overlay: OverlayController;
  readonly player: PlayerInputSource;
  readonly selection: WorkerSelection;
  readonly placement: PlacementController;
  readonly zonePainting: ZonePaintingController;
  readonly seeds: SeedSelection;
  readonly companion: CompanionController;
  readonly save: SaveController;
  readonly newGame: NewGameController;
  readonly returnSummary: ReturnSummaryController;
  readonly sound: SoundBus;
  readonly tools: ToolSelection;
  readonly actionFeedback: ActionFeedback;
  readonly update: UpdateController;
  readonly children: ReactNode;
}

export function AppProviders({
  store,
  overlay,
  player,
  selection,
  placement,
  zonePainting,
  seeds,
  companion,
  save,
  newGame,
  returnSummary,
  sound,
  tools,
  actionFeedback,
  update,
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
        zonePainting,
        seeds,
        companion,
        save,
        newGame,
        returnSummary,
        sound,
        tools,
        actionFeedback,
        update,
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

/**
 * Zone painting mode (phase-48). The same shape as `usePlacement`, because it
 * is the same kind of thing: a small observable shared between an arming
 * button in the HUD and a drawer in the renderer.
 */
export function useZonePainting(): ZonePaintingController {
  return useServices().zonePainting;
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

export function useNewGame(): NewGameController {
  return useServices().newGame;
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

export function useUpdate(): UpdateController {
  return useServices().update;
}
