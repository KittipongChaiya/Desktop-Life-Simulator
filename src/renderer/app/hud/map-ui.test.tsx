/**
 * @vitest-environment jsdom
 *
 * The map panel. Phase-28 — ADR-038, ADR-010 §6.
 *
 * The panel invents no rules. Destinations, their locks, and who is away all
 * come from the `expeditions` slice; Send disables exactly where the validator
 * would reject; and a locked destination is VISIBLE with what it waits for,
 * because a progression the player cannot read is not a progression.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toIndexUnchecked } from '../../../shared/geometry';
import { ok } from '../../../shared/result';
import { placeBuilding } from '../../../sim/commands/building-commands';
import { sendExpedition } from '../../../sim/commands/expedition-commands';
import { CommandSource, type Command } from '../../../sim/commands/types';
import { hireWorker } from '../../../sim/commands/worker-commands';
import { CORE_STORAGE_SHED } from '../../../sim/content/buildings';
import { CORE_RIVER_DELTA } from '../../../sim/content/expeditions';
import { CORE_WHEAT_SEED } from '../../../sim/content/items';
import { stepSimulation } from '../../../sim/tick';
import { addItems } from '../../../sim/world/container';
import { FRIEND_AT } from '../../../sim/world/reputation';
import { createWorld, type World } from '../../../sim/world/world';
import { createSnapshotStore } from '../../bootstrap/snapshot-store';
import { createActionFeedback } from '../action-feedback';
import { createPlacementController } from '../placement';
import { createSeedSelection } from '../seed-selection';
import { AppProviders } from '../store-context';
import { createToolSelection } from '../tool-selection';
import { createZonePaintingController } from '../zone-painting';

import { MapPanel } from './MapPanel';
import { WorkerPanel } from './WorkerPanel';

/** A world with a hand free to send and the short trip's supplies in stock. */
function readyWorld(): World {
  const world = createWorld(41);
  world.wallet.coins = 100_000;
  addItems(world.inventory, CORE_WHEAT_SEED, 40, 99);
  hireWorker(world, toIndexUnchecked(32, 32));
  return world;
}

/** Mounts the panel against a settled world with a captured command stream. */
function mount(world: World): Command[] {
  stepSimulation(world);
  const store = createSnapshotStore(world.snapshots);
  const submitted: Command[] = [];

  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={store}
        overlay={
          {
            isCollapsed: () => false,
            setCollapsed: vi.fn(),
            toggle: vi.fn(),
            subscribe: () => () => undefined,
            setPointerOverUi: vi.fn(),
            quit: vi.fn(),
          } as never
        }
        player={{
          submit: (command: Command) => {
            submitted.push(command);
            return ok({ id: 1, source: CommandSource.Player, dispatchedTick: 0 });
          },
        }}
        selection={undefined as never}
        placement={createPlacementController()}
        zonePainting={createZonePaintingController()}
        seeds={createSeedSelection()}
      >
        <MapPanel />
      </AppProviders>
    </StrictMode>,
  );

  return submitted;
}

const openPanel = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /^Map/ }));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Mounts the worker panel against a settled world. */
function mountWorkerPanel(world: World): void {
  stepSimulation(world);
  render(
    <StrictMode>
      <AppProviders
        actionFeedback={createActionFeedback()}
        tools={createToolSelection()}
        store={createSnapshotStore(world.snapshots)}
        overlay={{ isCollapsed: () => false, subscribe: () => () => undefined } as never}
        player={{ submit: () => ok({ id: 1, source: CommandSource.Player, dispatchedTick: 0 }) }}
        selection={undefined as never}
        placement={createPlacementController()}
        zonePainting={createZonePaintingController()}
        seeds={createSeedSelection()}
      >
        <WorkerPanel />
      </AppProviders>
    </StrictMode>,
  );
}

describe('a hand who is away is still a hand you hired', () => {
  it('keeps counting toward the hire price', () => {
    // FOUND ON THE RUNNING APP. `hireWorker` charges `hireCost(workers.size)`,
    // which counts everyone; the panel priced off the workers SLICE, which
    // excludes anyone away (ADR-038 §2). Sending a hand out would have quoted
    // a cheaper hire than the command charges, and enabled a button the
    // validator refuses — the one rule every control in this HUD follows.
    const world = readyWorld();
    mountWorkerPanel(world);
    const before = screen.getByRole('button', { name: /^Hire/ }).getAttribute('title');
    expect(before).toBe('Hire a worker');
    const priced = screen.getByRole('button', { name: /^Hire/ }).textContent;
    cleanup();

    sendExpedition(world, [...world.workers.values()][0]!.id, CORE_RIVER_DELTA);
    mountWorkerPanel(world);

    expect(screen.getByRole('button', { name: /^Hire/ }).textContent).toBe(priced);
  });

  it('says where they are rather than saying they are gone', () => {
    const world = readyWorld();
    sendExpedition(world, [...world.workers.values()][0]!.id, CORE_RIVER_DELTA);
    mountWorkerPanel(world);

    expect(screen.getByRole('button', { name: '1 worker · 1 away' })).toBeDefined();
  });
});

describe('MapPanel', () => {
  it('lists every destination the slice carries', () => {
    const world = readyWorld();
    mount(world);
    openPanel();

    expect(screen.getAllByTestId('destination').length).toBe(world.expeditionRegistry.size);
  });

  it('names the place and how long a hand is gone', () => {
    mount(readyWorld());
    openPanel();

    expect(screen.getByText('River Delta', { exact: false })).toBeDefined();
    // 180 seconds, worded — never a bare tick count.
    expect(screen.getByText('· 3m away', { exact: false })).toBeDefined();
  });

  /**
   * The Send button belonging to a NAMED destination.
   *
   * Three tests below used `getAllByRole('Send')[0]` and meant "the River
   * Delta's" — true while the Delta was the first destination in the list.
   * Phase-59 put the Thornwood ahead of it (registration order is travel time
   * ascending, which `expedition-rate.test.ts` depends on), and all three
   * silently started testing a different place. One of them, the supplies
   * guard, would have gone permanently green for the wrong reason: the
   * Thornwood costs nothing to send to, so its button is CORRECTLY enabled on
   * a farm with an empty larder.
   *
   * Selecting by name costs a helper and cannot drift.
   */
  function sendFor(destination: string): HTMLElement {
    const row = screen
      .getAllByTestId('destination')
      .find((element) => element.textContent?.includes(destination));
    expect(row, `no destination row for ${destination}`).toBeDefined();
    const send = row?.querySelector('button');
    expect(send, `${destination} has no Send button`).not.toBeNull();
    return send as HTMLElement;
  }

  it('sending submits the command for the destination and a free hand', () => {
    const world = readyWorld();
    const submitted = mount(world);
    openPanel();

    fireEvent.click(sendFor('River Delta'));

    expect(submitted).toEqual([
      { type: 'sendExpedition', worker: 1, destination: CORE_RIVER_DELTA },
    ]);
  });

  it('shows a locked destination with what it waits for', () => {
    // Visible, never hidden (ADR-038 §6): the progression reads on paper
    // before it is earned, exactly as a locked board slot does.
    mount(readyWorld());
    openPanel();

    // getAllByText, because three destinations now wait on `friend` and
    // `getByText` throws on more than one match — a failure that reads as a
    // missing element when it is the opposite.
    expect(screen.getAllByText('for friends of the town').length).toBeGreaterThan(0);

    // FEWER SEND BUTTONS THAN DESTINATIONS, rather than exactly one. The
    // assertion used to be `toBe(1)`, which was a way of saying "only the
    // Delta is open" while the Delta was the only newcomer destination.
    // Phase-59 added a second one, and a rule that counts unlocked places
    // needs editing every time the map grows — which is how a test stops being
    // about the thing it names. What ADR-038 §6 actually asks is that a locked
    // place is VISIBLE with its requirement rather than hidden, so that is what
    // is checked: some rows have Send, some say what they wait for, and every
    // destination is on screen either way.
    const rows = screen.getAllByTestId('destination');
    const sendable = screen.queryAllByRole('button', { name: 'Send' }).length;
    expect(sendable).toBeGreaterThan(0);
    expect(sendable).toBeLessThan(rows.length);
  });

  it('opens a destination the moment standing reaches it', () => {
    const world = readyWorld();
    world.contractStats.fulfilled = FRIEND_AT;
    mount(world);
    openPanel();

    expect(screen.queryAllByRole('button', { name: 'Send' }).length).toBeGreaterThan(1);
  });

  it('disables Send when the farm cannot outfit the trip, and says why', () => {
    // FOUND ON THE RUNNING APP, not here. The button was enabled with no seed
    // in stock, the click was refused as `MissingItem`, and nothing happened —
    // on the very first thing a new player would try, since a fresh world
    // starts with 100 coins and nothing else.
    const world = createWorld(41);
    world.wallet.coins = 100_000;
    hireWorker(world, toIndexUnchecked(32, 32));
    mount(world);
    openPanel();

    // NAMED, because this test is only meaningful for a destination that
    // actually costs something to reach. The Thornwood is now first in the list
    // and needs no supplies at all, so its Send is rightly enabled on an empty
    // farm — reading index 0 would have turned this guard green while the bug
    // it was written for went unwatched.
    const send = sendFor('River Delta');
    expect(send.hasAttribute('disabled')).toBe(true);
    expect(send.getAttribute('title')).toContain('supplies');
  });

  it('counts supplies sitting in a shed, not just the player inventory', () => {
    // The phase-06 defect, one system later: building a shed is a thing the
    // game encourages, and it must not silently turn Send off. The command
    // draws from `sellableContainers`, and so does this.
    const world = readyWorld();
    const shed = placeBuilding(world, toIndexUnchecked(30, 32), CORE_STORAGE_SHED);
    expect(shed.ok).toBe(true);
    world.inventory.stacks = [];
    const storage = [...world.buildingStorage.values()][0]!;
    addItems(storage, CORE_WHEAT_SEED, 20, 99);

    mount(world);
    openPanel();

    expect(screen.getAllByRole('button', { name: 'Send' })[0]!.hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('disables Send when nobody is free, and says why', () => {
    // The rule every button in this HUD follows: disable where the validator
    // would reject anyway, and never leave a dead control unexplained.
    const world = createWorld(41);
    addItems(world.inventory, CORE_WHEAT_SEED, 40, 99);
    mount(world);
    openPanel();

    const send = screen.getAllByRole('button', { name: 'Send' })[0]!;
    expect(send.hasAttribute('disabled')).toBe(true);
    expect(send.getAttribute('title')).toContain('Nobody is free');
  });

  it('does not count a hand who is already away as free', () => {
    // A worker on a trip is ABSENT from the workers slice (ADR-038 §2), so
    // this needs no special case — which is the point of that decision.
    const world = readyWorld();
    sendExpedition(world, [...world.workers.values()][0]!.id, CORE_RIVER_DELTA);
    mount(world);
    openPanel();

    expect(screen.getAllByRole('button', { name: 'Send' })[0]!.hasAttribute('disabled')).toBe(true);
  });

  it('lists who is away and when they are back', () => {
    const world = readyWorld();
    sendExpedition(world, [...world.workers.values()][0]!.id, CORE_RIVER_DELTA);
    mount(world);
    openPanel();

    expect(screen.getAllByTestId('trip').length).toBe(1);
    expect(screen.getByText('back in', { exact: false })).toBeDefined();
  });

  it('badges the toggle while anyone is out', () => {
    const world = readyWorld();
    sendExpedition(world, [...world.workers.values()][0]!.id, CORE_RIVER_DELTA);
    mount(world);

    expect(screen.getByRole('button', { name: 'Map · 1' })).toBeDefined();
  });

  it('says nothing on the toggle when everyone is home', () => {
    mount(readyWorld());

    expect(screen.getByRole('button', { name: 'Map' })).toBeDefined();
  });
});
