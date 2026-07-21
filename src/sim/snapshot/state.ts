/**
 * Versioned slice storage.
 *
 * The simulation writes here; views read. Sim never calls out to a subscriber —
 * that would let view code run inside the tick and break both purity and
 * determinism. Instead each slice carries a monotonic version, and the renderer
 * polls versions per frame (ADR-005 §2).
 */

import { projectStatus, statusEquals, type SliceMap, type StatusSlice } from './slices';

export interface VersionedSlice<T> {
  /** Bumped only when `value` actually changes. Never decreases. */
  version: number;
  value: T;
}

export interface SnapshotState {
  readonly status: VersionedSlice<StatusSlice>;
}

export function createSnapshotState(): SnapshotState {
  return {
    status: { version: 0, value: projectStatus(0) },
  };
}

/**
 * Replaces a slice's value only if it changed, bumping the version if so.
 *
 * @returns true if the slice was republished.
 */
export function publishIfChanged<T>(
  slice: VersionedSlice<T>,
  next: T,
  equals: (a: T, b: T) => boolean,
): boolean {
  if (equals(slice.value, next)) return false;

  slice.value = next;
  slice.version += 1;
  return true;
}

/** Current version of every slice. Used by the renderer to detect changes. */
export function sliceVersions(state: SnapshotState): Record<keyof SliceMap, number> {
  return { status: state.status.version };
}

export { statusEquals, projectStatus };
