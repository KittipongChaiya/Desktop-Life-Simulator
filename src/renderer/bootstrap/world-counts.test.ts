/**
 * World count tests. Phase-07.8a.
 *
 * Only the container count is tested, because it is the only one that is not a
 * `length`. It is derived from two slices, so it can be wrong in ways a lookup
 * cannot — and a debug overlay that quietly under-reports is worse than one
 * that shows nothing, since it is trusted while being read.
 */

import { describe, expect, it } from 'vitest';

import type { BuildingView } from '../../sim/snapshot/buildings-slice';

import { countContainers } from './world-counts';

const building = (buildingId: string, id = 1): BuildingView => ({
  id,
  buildingId,
  tile: 100 + id,
  sprite: '',
});

const SHED = 'core:storage_shed';
const STALL = 'core:market_stall';

describe('counting containers', () => {
  it('counts the player inventory on an empty farm', () => {
    // It exists before any worker is hired and cannot be removed.
    expect(countContainers(0, [])).toBe(1);
  });

  it('counts one hold per worker', () => {
    expect(countContainers(3, [])).toBe(4);
  });

  it('counts one per storage building', () => {
    expect(countContainers(0, [building(SHED, 1), building(SHED, 2)])).toBe(3);
  });

  it('ignores buildings that hold nothing', () => {
    // A market stall sells from the player's inventory rather than owning a
    // container, so counting it would over-report.
    expect(countContainers(0, [building(STALL, 1), building(STALL, 2)])).toBe(1);
  });

  it('adds the three sources together', () => {
    const buildings = [building(SHED, 1), building(STALL, 2), building(SHED, 3)];
    expect(countContainers(2, buildings)).toBe(1 + 2 + 2);
  });

  it('never reports fewer than the player inventory', () => {
    // A negative count would mean a slice was misread; the overlay should show
    // the floor rather than an impossible number.
    expect(countContainers(-5, [])).toBe(1);
  });

  it('is stable — reading it twice does not change it', () => {
    // ADR-018 §9: a metric is a read-only snapshot, and observation must not
    // perturb the observed.
    const buildings = [building(SHED, 1)];
    expect(countContainers(1, buildings)).toBe(countContainers(1, buildings));
    expect(buildings).toHaveLength(1);
  });
});
