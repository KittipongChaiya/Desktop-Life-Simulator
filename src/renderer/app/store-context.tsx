/**
 * Dependency injection for the snapshot store and the overlay API.
 *
 * Context rather than a module-level singleton so tests can mount the UI
 * against a stub store without a running simulation or an Electron process.
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { PlayerInputSource } from '../../sim/commands/sources';
import type { SnapshotStore } from '../../sim/snapshot/store-contract';

import type { OverlayController } from './overlay-controller';

interface AppServices {
  readonly store: SnapshotStore;
  readonly overlay: OverlayController;
  /** The player's write path into the simulation — the HUD's hire button, etc. */
  readonly player: PlayerInputSource;
}

const ServicesContext = createContext<AppServices | null>(null);

export interface AppProvidersProps {
  readonly store: SnapshotStore;
  readonly overlay: OverlayController;
  readonly player: PlayerInputSource;
  readonly children: ReactNode;
}

export function AppProviders({ store, overlay, player, children }: AppProvidersProps): ReactNode {
  return (
    <ServicesContext.Provider value={{ store, overlay, player }}>
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
