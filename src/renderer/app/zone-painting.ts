/**
 * Zone painting mode — presentation state. Phase-48 — ADR-024 §2, §4.
 *
 * `setWorkerZone` has existed and been tested since phase-14c, and nothing has
 * ever been able to call it. `WorkerRoles.tsx` says why in its own header: a
 * zone is a set of TILES, so choosing one is a map interaction rather than a
 * dropdown, and the panel deliberately shipped roles without it rather than
 * offering a text box of tile indices that would look like the feature and be
 * unusable. This is the missing half.
 *
 * ## The same shape as placement, for the same reasons
 *
 * WHICH WORKER is being zoned is a VIEW concern (ADR-007 §1) and never enters
 * `World`. It is shared between the worker panel that arms it and the renderer
 * that draws the rectangle, so it lives in one small observable both read —
 * exactly like `PlacementController`.
 *
 * ## The drag lives here; the hover does not
 *
 * A drag has a START and an END, and the start must survive between pointer
 * events, so it is state. The CURRENT pointer tile is not: it changes at
 * pointer rate, and keeping it here would re-render every React subscriber on
 * every mouse move. The renderer tracks the moving end itself and asks this
 * store only where the drag began — the same split placement made.
 *
 * ## Painting is additive, and erasing is the same gesture with a modifier
 *
 * A zone is usually several rectangles — the two fields a worker tends, not one
 * square — so each drag ADDS to what is there. Dragging with the erase flag
 * removes instead, because a player who paints one tile too many should not
 * have to start again. Both end in a single `setWorkerZone` command carrying
 * the whole resulting set: the command replaces a zone wholesale, and building
 * the new set here keeps that contract intact.
 */

import type { WorkerId } from '../../shared/ids';

/** Where a drag began, in tile coordinates. */
export interface ZoneAnchor {
  readonly x: number;
  readonly y: number;
  /** True when this drag removes tiles rather than adding them. */
  readonly erasing: boolean;
}

export interface ZonePaintingController {
  /** The worker whose zone is being painted, or null when not in the mode. */
  active(): WorkerId | null;
  /** The tiles painted so far this session, as the command will receive them. */
  tiles(): ReadonlySet<number>;
  /** Where the current drag started, or null when no drag is in progress. */
  anchor(): ZoneAnchor | null;

  /**
   * Arms painting for a worker, seeded with the zone they already have.
   *
   * Seeded rather than started empty: a player opening the mode to add one
   * field to an existing zone must not silently erase the rest by finishing
   * their drag. Toggling the same worker again leaves the mode, like the build
   * button.
   */
  toggle(worker: WorkerId, existing?: ReadonlySet<number>): void;

  beginDrag(anchor: ZoneAnchor): void;
  /** Commits a drag over the rectangle between the anchor and this tile. */
  endDrag(x: number, y: number, tileAt: (x: number, y: number) => number | null): void;
  cancelDrag(): void;

  /** Leaves the mode. Bound to `Esc` and to a successful apply. */
  deactivate(): void;
  subscribe(listener: () => void): () => void;
}

export function createZonePaintingController(): ZonePaintingController {
  let active: WorkerId | null = null;
  let painted = new Set<number>();
  let anchor: ZoneAnchor | null = null;
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    active: () => active,
    tiles: () => painted,
    anchor: () => anchor,

    toggle(worker, existing) {
      if (active === worker) {
        active = null;
        painted = new Set();
        anchor = null;
        notify();
        return;
      }
      active = worker;
      painted = new Set(existing ?? []);
      anchor = null;
      notify();
    },

    beginDrag(next) {
      if (active === null) return;
      anchor = next;
      notify();
    },

    endDrag(x, y, tileAt) {
      const from = anchor;
      anchor = null;
      if (active === null || from === null) {
        notify();
        return;
      }

      // A rectangle from either corner: a player dragging up and left means the
      // same thing as one dragging down and right.
      const minX = Math.min(from.x, x);
      const maxX = Math.max(from.x, x);
      const minY = Math.min(from.y, y);
      const maxY = Math.max(from.y, y);

      const next = new Set(painted);
      for (let ty = minY; ty <= maxY; ty += 1) {
        for (let tx = minX; tx <= maxX; tx += 1) {
          const tile = tileAt(tx, ty);
          // `null` is off-world. A drag that leaves the map paints what it
          // covered rather than failing, which is what a player expects from
          // dragging past an edge.
          if (tile === null) continue;
          if (from.erasing) next.delete(tile);
          else next.add(tile);
        }
      }

      painted = next;
      notify();
    },

    cancelDrag() {
      if (anchor === null) return;
      anchor = null;
      notify();
    },

    deactivate() {
      if (active === null && anchor === null) return;
      active = null;
      painted = new Set();
      anchor = null;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
