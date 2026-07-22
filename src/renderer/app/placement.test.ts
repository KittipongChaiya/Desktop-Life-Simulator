/**
 * Placement controller tests. Phase-05d.
 *
 * The controller holds ONE thing: which building the player is placing, or
 * null. It is presentation state (like worker selection, ADR-007 §1) shared
 * between the HUD button and the renderer's build ghost, so the contract that
 * matters is: toggling is a proper toggle, and subscribers wake only on a real
 * change.
 */

import { describe, expect, it, vi } from 'vitest';

import { asContentId } from '../../shared/ids';

import { createPlacementController } from './placement';

const SHED = asContentId('core:storage_shed');
const HUT = asContentId('core:hut');

describe('placement controller', () => {
  it('starts inactive', () => {
    expect(createPlacementController().active()).toBeNull();
  });

  it('activates a building on the first toggle', () => {
    const placement = createPlacementController();
    placement.toggle(SHED);
    expect(placement.active()).toBe(SHED);
  });

  it('toggles the same building back off', () => {
    const placement = createPlacementController();
    placement.toggle(SHED);
    placement.toggle(SHED);
    expect(placement.active()).toBeNull();
  });

  it('switches directly from one building to another', () => {
    const placement = createPlacementController();
    placement.toggle(SHED);
    placement.toggle(HUT);
    expect(placement.active()).toBe(HUT);
  });

  it('deactivate clears an active building', () => {
    const placement = createPlacementController();
    placement.toggle(SHED);
    placement.deactivate();
    expect(placement.active()).toBeNull();
  });

  it('notifies subscribers on a toggle', () => {
    const placement = createPlacementController();
    const listener = vi.fn();
    placement.subscribe(listener);
    placement.toggle(SHED);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when deactivating while already inactive', () => {
    const placement = createPlacementController();
    const listener = vi.fn();
    placement.subscribe(listener);
    placement.deactivate();
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const placement = createPlacementController();
    const listener = vi.fn();
    const unsubscribe = placement.subscribe(listener);
    unsubscribe();
    placement.toggle(SHED);
    expect(listener).not.toHaveBeenCalled();
  });
});
