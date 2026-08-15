/**
 * Residents against a real dirty gate. Phase-19 — ADR-031 §4.
 *
 * Same reasoning as the rain and lighting tests: the gate is the REAL
 * `createDirtyGate`, so `animationCount()` is the number the render loop
 * consults. What matters here is the lease discipline — a walking villager
 * animates, a standing one does not, and a village gone indoors leaves
 * nothing behind: no sprites, no leases, no cost.
 */

import { Container, Texture } from 'pixi.js';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ResidentView } from '../../sim/snapshot/residents-slice';
import { Direction } from '../../sim/snapshot/workers-slice';

import { createDirtyGate, type DirtyGate } from './dirty-gate';
import { createResidentRenderer, residentAnimation, type ResidentRenderer } from './resident-view';

let layer: Container;
let gate: DirtyGate;

const build = (): ResidentRenderer =>
  createResidentRenderer({ layer, gate, textureFor: () => Texture.WHITE });

beforeEach(() => {
  layer = new Container();
  gate = createDirtyGate();
});

const view = (overrides: Partial<ResidentView> = {}): ResidentView => ({
  id: 'core:resident_marla',
  name: 'Marla',
  costume: 'villager_a',
  tile: 100,
  toTile: 100,
  moveFraction: 0,
  facing: Direction.South,
  ...overrides,
});

const update = (renderer: ResidentRenderer, residents: readonly ResidentView[]): void => {
  renderer.update({ residents, alpha: 0.5, tick: 10, firstColumn: 0, lastColumn: 79 });
};

describe('animation selection', () => {
  it('walking picks the costume walk cycle; standing the idle frame', () => {
    expect(residentAnimation(view({ toTile: 101, facing: Direction.East }))).toBe(
      'villager_a_walk_e',
    );
    expect(residentAnimation(view({ costume: 'villager_b' }))).toBe('villager_b_idle_s');
  });
});

describe('the lease discipline (ADR-001 §1)', () => {
  it('a walking villager holds exactly one lease, however many frames pass', () => {
    const renderer = build();
    for (let frame = 0; frame < 50; frame += 1) {
      update(renderer, [view({ toTile: 101, moveFraction: 0.4, facing: Direction.East })]);
    }
    expect(gate.animationCount()).toBe(1);
  });

  it('a standing villager holds nothing', () => {
    const renderer = build();
    update(renderer, [view()]);
    expect(gate.animationCount()).toBe(0);
  });

  it('stopping releases the lease', () => {
    const renderer = build();
    update(renderer, [view({ toTile: 101, moveFraction: 0.4, facing: Direction.East })]);
    expect(gate.animationCount()).toBe(1);

    update(renderer, [view()]);
    expect(gate.animationCount()).toBe(0);
  });

  it('culling off-screen releases the lease and hides the sprite', () => {
    const renderer = build();
    update(renderer, [view({ toTile: 101, moveFraction: 0.4, facing: Direction.East })]);
    renderer.update({
      residents: [view({ toTile: 101, moveFraction: 0.4, facing: Direction.East })],
      alpha: 0.5,
      tick: 11,
      firstColumn: 60,
      lastColumn: 79, // tile 100 is column 20 — off screen
    });
    expect(gate.animationCount()).toBe(0);
  });
});

describe('the sleeping town costs nothing', () => {
  it('an empty slice removes every sprite and every lease', () => {
    const renderer = build();
    update(renderer, [
      view({ toTile: 101, moveFraction: 0.4, facing: Direction.East }),
      view({ id: 'core:resident_tobin', name: 'Tobin', costume: 'villager_b', tile: 200 }),
    ]);
    expect(renderer.count()).toBe(2);

    update(renderer, []);
    expect(renderer.count()).toBe(0);
    expect(gate.animationCount()).toBe(0);
  });

  it('destroy releases everything', () => {
    const renderer = build();
    update(renderer, [view({ toTile: 101, moveFraction: 0.4, facing: Direction.East })]);
    renderer.destroy();
    expect(gate.animationCount()).toBe(0);
  });
});
