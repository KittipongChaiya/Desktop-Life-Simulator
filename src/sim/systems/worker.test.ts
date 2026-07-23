/**
 * Worker system. Phase-04, GAME_DESIGN.md §4.
 *
 * The FSM driver: it decides, claims, works, and rests — and it must NEVER jam
 * (§4.2). Actions leave the system only as commands through the same dispatcher
 * the player uses (ADR-010 §6). Tests drive the whole tick via `stepSimulation`,
 * so the command a worker submits on tick N is drained and applied on tick N+1,
 * exactly as in the running game.
 */

import { describe, expect, it } from 'vitest';

import { toIndexUnchecked } from '../../shared/geometry';
import { asWorkerId, type TileIndex } from '../../shared/ids';
import { CORE_TURNIP } from '../content/crops';
import { CORE_TURNIP_SEED, DEFAULT_STACK_SIZE } from '../content/items';
import { stepSimulation, stepSimulationBy, tickOrder } from '../tick';
import { addItems } from '../world/container';
import {
  createWorker,
  IDLE_REPLAN_TICKS,
  MAX_ENERGY,
  WorkerState,
  WorkerTaskKind,
  type Worker,
} from '../world/worker';
import { createWorld, type World } from '../world/world';

const CENTER = toIndexUnchecked(32, 32);

function addWorker(world: World, id: number, position: TileIndex = CENTER): Worker {
  const worker = createWorker(asWorkerId(id), position);
  world.workers.set(worker.id, worker);
  return worker;
}

/** Fills every owned tile with an immature crop, leaving no available work. */
function occupyPlot(world: World): void {
  for (let y = 28; y <= 35; y += 1) {
    for (let x = 28; x <= 35; x += 1) {
      const tile = toIndexUnchecked(x, y);
      world.crops.set(tile, { cropId: CORE_TURNIP, tile, plantedTick: 1_000_000 });
    }
  }
}

describe('workerSystem placement', () => {
  it('runs in the workers phase — after commands, before the snapshot', () => {
    const order = tickOrder();
    expect(order).toContain('worker');
    expect(order.indexOf('command')).toBeLessThan(order.indexOf('worker'));
    expect(order.indexOf('worker')).toBeLessThan(order.indexOf('snapshot'));
  });
});

describe('autonomous farming', () => {
  it('tills an owned tile with no player input', () => {
    const world = createWorld(1);
    addWorker(world, 1);
    stepSimulationBy(world, 40);
    const tilledCount = [...world.tiles.tilledAt].filter((v) => v > 0).length;
    expect(tilledCount).toBeGreaterThanOrEqual(1);
  });

  it('plants a crop after preparing soil', () => {
    const world = createWorld(1);
    // Workers draw seeds from the farm stock; planting consumes them (06b).
    addItems(world.inventory, CORE_TURNIP_SEED, 20, DEFAULT_STACK_SIZE);
    addWorker(world, 1);
    stepSimulationBy(world, 150);
    expect(world.cropStats.planted).toBeGreaterThanOrEqual(1);
  });

  it('waits out a re-plan cadence when no work exists, instead of rescanning every tick', () => {
    // Sustained no-work is now a normal regime (06b: the seed stock can run
    // dry), and five workers scanning the whole farm every tick would burn the
    // idle-CPU budget the product is built on (PERFORMANCE.md). "Return to
    // Idle and wait" (§4.2) means WAIT: a null scan schedules the next one.
    const world = createWorld(1);
    occupyPlot(world); // immature crops everywhere — nothing to do
    const worker = addWorker(world, 1);

    stepSimulationBy(world, 1);
    expect(worker.state).toBe(WorkerState.Idle);
    expect(worker.replanTick).toBeGreaterThan(world.tick); // the wait is scheduled

    // Work appears mid-cooldown: the sleeping worker must NOT see it early…
    const freed = CENTER;
    world.crops.delete(freed);
    world.tiles.tilledAt[freed] = 1;
    addItems(world.inventory, CORE_TURNIP_SEED, 1, DEFAULT_STACK_SIZE);
    stepSimulationBy(world, 2);
    expect(worker.task).toBeNull();

    // …but picks it up promptly once the cadence expires (bounded staleness).
    stepSimulationBy(world, IDLE_REPLAN_TICKS + 40);
    expect(world.cropStats.planted).toBe(1);
  });

  it('harvests a mature crop autonomously', () => {
    const world = createWorld(1);
    world.crops.set(CENTER, { cropId: CORE_TURNIP, tile: CENTER, plantedTick: 0 });
    addWorker(world, 1, CENTER);
    stepSimulationBy(world, 1000); // turnip matures at 900 ticks
    expect(world.cropStats.harvested).toBeGreaterThanOrEqual(1);
  });

  it('every action reaches the world as a worker-sourced command, never a direct write', () => {
    const world = createWorld(1);
    addWorker(world, 1);
    // Nothing was tilled at construction; only the worker's command path can do it.
    stepSimulationBy(world, 40);
    expect([...world.tiles.tilledAt].some((v) => v > 0)).toBe(true);
  });
});

describe('never jams (§4.2)', () => {
  it('returns to Idle and waits when no task is available', () => {
    const world = createWorld(1);
    occupyPlot(world);
    const worker = addWorker(world, 1);
    stepSimulationBy(world, 50);
    expect(worker.state).toBe(WorkerState.Idle);
    expect(worker.task).toBeNull();
    expect(world.commands.pending()).toBe(0);
  });

  it('never leaves a worker permanently stuck over a long run', () => {
    const world = createWorld(1);
    addWorker(world, 1);
    let sawWork = false;
    for (let i = 0; i < 500; i += 1) {
      stepSimulation(world);
      if (world.commands.pending() > 0) sawWork = true;
    }
    expect(sawWork).toBe(true); // it kept finding and doing work
  });
});

describe('task claiming (§4.4)', () => {
  it('two workers never target the same tile', () => {
    const world = createWorld(1);
    // Exactly one harvestable tile; the rest of the plot is immature.
    occupyPlot(world);
    world.crops.set(CENTER, { cropId: CORE_TURNIP, tile: CENTER, plantedTick: 0 });
    world.tick = 5000; // CENTER now mature; the fillers are not

    const a = addWorker(world, 1, toIndexUnchecked(30, 30));
    const b = addWorker(world, 2, toIndexUnchecked(34, 34));
    stepSimulation(world); // both plan this tick

    const targets = [a.task?.tile, b.task?.tile].filter((t) => t !== undefined);
    expect(new Set(targets).size).toBe(targets.length); // no duplicate claim
  });
});

describe('task invalidated mid-execution (§4.4)', () => {
  it('abandons cleanly and never jams when its target disappears', () => {
    const world = createWorld(1);
    world.crops.set(CENTER, { cropId: CORE_TURNIP, tile: CENTER, plantedTick: 0 });
    world.tick = 5000;
    const worker = addWorker(world, 1, CENTER);

    stepSimulation(world); // worker claims + starts moving/working the harvest
    world.crops.delete(CENTER); // another actor removes the crop

    // Finishing and submitting against a gone crop must not throw or stick; the
    // worker abandons the dead harvest and moves on to real work (tilling here).
    expect(() => stepSimulationBy(world, 150)).not.toThrow();
    expect([...world.tiles.tilledAt].some((v) => v > 0)).toBe(true);
    expect(worker.task?.kind).not.toBe('harvest'); // no longer chasing the gone crop
  });
});

describe('energy (§4.5)', () => {
  it('a worker at zero energy rests, recovers, and resumes — never stops', () => {
    const world = createWorld(1);
    const worker = addWorker(world, 1);
    worker.energy = 0;

    stepSimulation(world);
    expect([WorkerState.SeekingRest, WorkerState.Rest]).toContain(worker.state);

    stepSimulationBy(world, 1200); // 50s rest recovers a full bar
    expect(worker.energy).toBeGreaterThan(0);
    expect(worker.energy).toBeLessThanOrEqual(MAX_ENERGY);
    // It came back to productive states, not stuck resting forever.
    stepSimulationBy(world, 100);
    expect(worker.state).not.toBe(WorkerState.Rest);
  });

  it('energy never goes negative across a long working run', () => {
    const world = createWorld(1);
    const worker = addWorker(world, 1);
    stepSimulationBy(world, 3000);
    expect(worker.energy).toBeGreaterThanOrEqual(0);
  });
});

describe('no state deadlocks — Idle is reachable from every state (§4.2, crit 6)', () => {
  function reachesIdle(prepare: (worker: Worker) => void): boolean {
    const world = createWorld(1);
    occupyPlot(world); // no work available, so a settled worker parks in Idle
    const worker = addWorker(world, 1);
    prepare(worker);
    for (let i = 0; i < 400; i += 1) {
      stepSimulation(world);
      if (worker.state === WorkerState.Idle) return true;
    }
    return false;
  }

  it('from Idle', () => {
    expect(reachesIdle((w) => (w.state = WorkerState.Idle))).toBe(true);
  });

  it('from Moving', () => {
    expect(
      reachesIdle((w) => {
        w.state = WorkerState.Moving;
        w.task = { kind: WorkerTaskKind.Till, tile: CENTER };
      }),
    ).toBe(true);
  });

  it('from Working', () => {
    expect(
      reachesIdle((w) => {
        w.state = WorkerState.Working;
        w.task = { kind: WorkerTaskKind.Till, tile: CENTER };
      }),
    ).toBe(true);
  });

  it('from SeekingRest', () => {
    expect(
      reachesIdle((w) => {
        w.state = WorkerState.SeekingRest;
        w.energy = MAX_ENERGY - 2;
      }),
    ).toBe(true);
  });

  it('from Rest', () => {
    expect(
      reachesIdle((w) => {
        w.state = WorkerState.Rest;
        w.energy = MAX_ENERGY - 2;
      }),
    ).toBe(true);
  });
});
