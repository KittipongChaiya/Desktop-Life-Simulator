/**
 * Phase-14c — roles as content, and the commands that apply them.
 *
 * A role is *"a named, reusable constraint bundle"* (ADR-024 §2) and needed no
 * new mechanism: a role IS a schedule, named. What is worth testing is the two
 * places that could go wrong — an unsatisfiable role reaching a worker, and a
 * role assignment quietly destroying something it cannot express.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../src/shared/errors';
import { toIndexUnchecked } from '../src/shared/geometry';
import { asContentId, type WorkerId } from '../src/shared/ids';
import { assignRole, setWorkerZone } from '../src/sim/commands/schedule-commands';
import { hireWorker } from '../src/sim/commands/worker-commands';
import { createInstalledRegistries } from '../src/sim/content/installed';
import { createPluginApi } from '../src/sim/content/plugin-api';
import {
  CORE_FARMHAND,
  CORE_GROUNDSKEEPER,
  CORE_HARVESTER,
  createRoleRegistry,
  isSatisfiableRole,
} from '../src/sim/content/roles';
import { Provenance } from '../src/sim/content/sources';
import { addCoins } from '../src/sim/world/wallet';
import { WorkerTaskKind } from '../src/sim/world/worker';
import { createWorld, type World } from '../src/sim/world/world';

function worldWithWorker(): { world: World; worker: WorkerId } {
  const world = createWorld(4);
  addCoins(world.wallet, 500);
  expect(hireWorker(world).ok).toBe(true);
  const worker = [...world.workers.keys()][0];
  if (worker === undefined) throw new Error('setup failed');
  return { world, worker };
}

describe('core ships roles through the public API', () => {
  it('registers three, in a stable order', () => {
    expect(
      createInstalledRegistries()
        .roles.all()
        .map((role) => role.id),
    ).toEqual([CORE_FARMHAND, CORE_HARVESTER, CORE_GROUNDSKEEPER]);
  });

  it('makes the farmhand the identity role, not a special case', () => {
    // It declares no constraints at all, so assigning it returns a worker to
    // exactly the behaviour a new hire has.
    const farmhand = createInstalledRegistries().roles.get(CORE_FARMHAND);

    expect(farmhand.ok && farmhand.value.taskKinds).toBeUndefined();
    expect(farmhand.ok && farmhand.value.shift).toBeUndefined();
  });

  it('declares no zone on any role, because a role cannot know tiles', () => {
    // Tile indices are facts about one farm. A role naming them would be
    // wrong on every world but the author's.
    for (const role of createInstalledRegistries().roles.all()) {
      expect(Object.keys(role)).not.toContain('zone');
    }
  });
});

describe('an unsatisfiable role is refused at REGISTRATION', () => {
  it('rejects a role permitting no task kinds', () => {
    expect(isSatisfiableRole({ id: CORE_FARMHAND, displayName: 'Idle', taskKinds: [] })).toBe(
      false,
    );
  });

  it('rejects a role on shift for no phase', () => {
    expect(isSatisfiableRole({ id: CORE_FARMHAND, displayName: 'Never', shift: [] })).toBe(false);
  });

  it('accepts one that merely constrains', () => {
    expect(
      isSatisfiableRole({
        id: CORE_HARVESTER,
        displayName: 'Harvester',
        taskKinds: [WorkerTaskKind.Harvest],
      }),
    ).toBe(true);
  });

  it('refuses the bundle at the API, so it never reaches a worker', () => {
    // The acceptance `ROADMAP.md` §10 states. Caught where the AUTHOR is
    // told, rather than at selection where a player sees a worker that
    // stopped for no visible reason.
    const api = createPluginApi(
      {
        id: 'mod',
        namespaces: ['mod'],
        provenance: Provenance.ThirdParty,
        displayName: 'Mod',
        version: '1.0.0',
      },
      { ...createInstalledRegistries(), roles: createRoleRegistry() },
    );

    const result = api.registerContent({
      roles: [{ id: asContentId('mod:statue'), displayName: 'Statue', taskKinds: [] }],
    });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe(ErrorCode.InvalidIntent);
  });
});

describe('assigning a role', () => {
  it('applies the constraints a role declares', () => {
    const { world, worker } = worldWithWorker();

    expect(assignRole(world, worker, CORE_HARVESTER).ok).toBe(true);
    expect(world.workers.get(worker)?.schedule.taskKinds).toEqual([WorkerTaskKind.Harvest]);
  });

  it('carries the priority ordering too', () => {
    const { world, worker } = worldWithWorker();
    assignRole(world, worker, CORE_GROUNDSKEEPER);

    expect(world.workers.get(worker)?.schedule.priority).toEqual([WorkerTaskKind.Till]);
  });

  it('PRESERVES the zone, which a role cannot express', () => {
    // Assigning a role must not silently clear where a player told a worker
    // to work. A role replaces everything it can express, and nothing else.
    const { world, worker } = worldWithWorker();
    const tile = toIndexUnchecked(30, 30);

    expect(setWorkerZone(world, worker, [tile]).ok).toBe(true);
    assignRole(world, worker, CORE_HARVESTER);

    expect([...(world.workers.get(worker)?.schedule.zone ?? [])]).toEqual([tile]);
  });

  it('returns a worker to unconstrained via the farmhand role', () => {
    const { world, worker } = worldWithWorker();
    assignRole(world, worker, CORE_HARVESTER);
    assignRole(world, worker, CORE_FARMHAND);

    expect(world.workers.get(worker)?.schedule.taskKinds).toBeUndefined();
  });

  it('refuses an unknown role, typed', () => {
    const { world, worker } = worldWithWorker();

    expect(assignRole(world, worker, asContentId('mod:ghost')).ok).toBe(false);
  });

  it('refuses an unknown worker, typed', () => {
    const { world } = worldWithWorker();
    const result = assignRole(world, 999 as WorkerId, CORE_HARVESTER);

    expect(result.ok === false && result.error.code).toBe(ErrorCode.InvalidIntent);
  });
});

describe('setting a zone', () => {
  it('confines the worker to the tiles given', () => {
    const { world, worker } = worldWithWorker();
    const tile = toIndexUnchecked(29, 30);

    setWorkerZone(world, worker, [tile]);

    expect(world.workers.get(worker)?.schedule.zone?.has(tile)).toBe(true);
  });

  it('CLEARS the zone on an empty list rather than confining to nowhere', () => {
    // The one place absent-versus-empty resolves in the player's favour: a UI
    // handing back an empty selection means "no zone", and reading it as
    // "work nowhere" would idle a worker on a mis-click.
    const { world, worker } = worldWithWorker();
    setWorkerZone(world, worker, [toIndexUnchecked(29, 30)]);

    setWorkerZone(world, worker, []);

    expect(world.workers.get(worker)?.schedule.zone).toBeUndefined();
  });

  it('leaves the rest of the schedule alone', () => {
    const { world, worker } = worldWithWorker();
    assignRole(world, worker, CORE_HARVESTER);
    setWorkerZone(world, worker, [toIndexUnchecked(30, 30)]);

    expect(world.workers.get(worker)?.schedule.taskKinds).toEqual([WorkerTaskKind.Harvest]);
  });
});
