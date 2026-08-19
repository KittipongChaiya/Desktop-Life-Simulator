/**
 * Zone painting mode. Phase-48 — `zone-painting.ts`, ADR-024 §2.
 *
 * The controller is small and every rule in it is a thing a player would
 * notice: a zone silently erased, a drag that only works in one direction, a
 * mode that keeps the last worker's tiles when it opens on a new one.
 */

import { describe, expect, it } from 'vitest';

import { asWorkerId } from '../../shared/ids';

import { createZonePaintingController } from './zone-painting';

const WORKER = asWorkerId(1);
const OTHER = asWorkerId(2);

/** A 10-wide toy world, so tile indices are readable in failures. */
const tileAt = (x: number, y: number): number | null =>
  x < 0 || y < 0 || x >= 10 || y >= 10 ? null : y * 10 + x;

describe('arming', () => {
  it('starts inactive and empty', () => {
    const zone = createZonePaintingController();

    expect(zone.active()).toBeNull();
    expect(zone.tiles().size).toBe(0);
    expect(zone.anchor()).toBeNull();
  });

  it('seeds from the zone the worker already has', () => {
    // THE RULE THAT MATTERS MOST. A player opening the mode to add one field
    // must not silently erase the rest by finishing their drag — the command
    // replaces a zone wholesale, so an empty seed would delete the old one.
    const zone = createZonePaintingController();
    zone.toggle(WORKER, new Set([1, 2, 3]));

    expect(zone.active()).toBe(WORKER);
    expect([...zone.tiles()].sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('toggles off on the same worker, and does not keep their tiles', () => {
    const zone = createZonePaintingController();
    zone.toggle(WORKER, new Set([5]));
    zone.toggle(WORKER);

    expect(zone.active()).toBeNull();
    expect(zone.tiles().size).toBe(0);
  });

  it('switches cleanly to another worker', () => {
    // Carrying tiles across would paint one worker's zone onto another's.
    const zone = createZonePaintingController();
    zone.toggle(WORKER, new Set([7, 8]));
    zone.toggle(OTHER, new Set([1]));

    expect(zone.active()).toBe(OTHER);
    expect([...zone.tiles()]).toEqual([1]);
  });
});

describe('dragging a rectangle', () => {
  it('paints every tile between the corners', () => {
    const zone = createZonePaintingController();
    zone.toggle(WORKER);
    zone.beginDrag({ x: 1, y: 1, erasing: false });
    zone.endDrag(2, 2, tileAt);

    expect([...zone.tiles()].sort((a, b) => a - b)).toEqual([11, 12, 21, 22]);
  });

  it('works dragged from any corner', () => {
    // Up-and-left means the same as down-and-right. A rule that assumed one
    // direction would make half of all drags do nothing.
    const forward = createZonePaintingController();
    forward.toggle(WORKER);
    forward.beginDrag({ x: 1, y: 1, erasing: false });
    forward.endDrag(3, 3, tileAt);

    const backward = createZonePaintingController();
    backward.toggle(WORKER);
    backward.beginDrag({ x: 3, y: 3, erasing: false });
    backward.endDrag(1, 1, tileAt);

    expect([...backward.tiles()].sort((a, b) => a - b)).toEqual(
      [...forward.tiles()].sort((a, b) => a - b),
    );
  });

  it('adds to what is already painted', () => {
    // A zone is usually several rectangles — two fields, not one square.
    const zone = createZonePaintingController();
    zone.toggle(WORKER);
    zone.beginDrag({ x: 0, y: 0, erasing: false });
    zone.endDrag(0, 0, tileAt);
    zone.beginDrag({ x: 5, y: 5, erasing: false });
    zone.endDrag(5, 5, tileAt);

    expect([...zone.tiles()].sort((a, b) => a - b)).toEqual([0, 55]);
  });

  it('erases with the same gesture and a flag', () => {
    const zone = createZonePaintingController();
    zone.toggle(WORKER, new Set([11, 12, 21, 22]));
    zone.beginDrag({ x: 2, y: 1, erasing: true });
    zone.endDrag(2, 2, tileAt);

    expect([...zone.tiles()].sort((a, b) => a - b)).toEqual([11, 21]);
  });

  it('paints what it covered when a drag leaves the map', () => {
    // Dragging past an edge is what a player does when they mean "all of it".
    // Failing the whole drag because one corner is off-world would be hostile.
    const zone = createZonePaintingController();
    zone.toggle(WORKER);
    zone.beginDrag({ x: 8, y: 8, erasing: false });
    zone.endDrag(12, 12, tileAt);

    expect([...zone.tiles()].sort((a, b) => a - b)).toEqual([88, 89, 98, 99]);
  });

  it('ignores a drag that never began', () => {
    const zone = createZonePaintingController();
    zone.toggle(WORKER);
    zone.endDrag(3, 3, tileAt);

    expect(zone.tiles().size).toBe(0);
  });

  it('paints nothing when the mode is not armed', () => {
    const zone = createZonePaintingController();
    zone.beginDrag({ x: 1, y: 1, erasing: false });
    zone.endDrag(2, 2, tileAt);

    expect(zone.tiles().size).toBe(0);
    expect(zone.anchor()).toBeNull();
  });

  it('cancels a drag without painting', () => {
    const zone = createZonePaintingController();
    zone.toggle(WORKER);
    zone.beginDrag({ x: 1, y: 1, erasing: false });
    zone.cancelDrag();

    expect(zone.anchor()).toBeNull();
    expect(zone.tiles().size).toBe(0);
  });
});

describe('subscribers', () => {
  it('wakes on every change a drawer needs to see', () => {
    const zone = createZonePaintingController();
    let woken = 0;
    zone.subscribe(() => {
      woken += 1;
    });

    zone.toggle(WORKER);
    zone.beginDrag({ x: 0, y: 0, erasing: false });
    zone.endDrag(1, 1, tileAt);
    zone.deactivate();

    expect(woken).toBe(4);
  });

  it('does not wake when deactivating an inactive controller', () => {
    // The same guard `PlacementController` makes: an idle store must not
    // re-render the HUD.
    const zone = createZonePaintingController();
    let woken = 0;
    zone.subscribe(() => {
      woken += 1;
    });

    zone.deactivate();

    expect(woken).toBe(0);
  });
});
