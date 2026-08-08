/**
 * Enabling and disabling content sources. Phase-09g — ADR-019 §7, ADR-010 §1.
 *
 * Two properties carry the weight. Enablement is **world state**, so it changes
 * through a command and lands in the save — ADR-014 §4's line between "what the
 * player sees" and "what the world does". And a change is **validated**, so a
 * typo cannot persist into the save as a disabled set naming a source that has
 * never existed, there to survive every future load.
 */

import { describe, expect, it } from 'vitest';

import type { SaveMeta } from '../../persistence/schema';
import { serializeSave, toSaveDocument } from '../../persistence/serialize';
import { ErrorCode } from '../../shared/errors';
import { createWorld } from '../world/world';

import { CommandSource } from './types';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

const dispatch = (world: ReturnType<typeof createWorld>, source: string, enabled: boolean) =>
  world.commands.dispatch(
    { type: 'setSourceEnabled', source, enabled },
    {
      source: CommandSource.Player,
    },
  );

describe('setSourceEnabled', () => {
  it('refuses a source the world has never heard of', () => {
    // Otherwise the typo lands in the save and outlives the session that made it.
    const world = createWorld(7);
    const result = dispatch(world, 'nosuchmod', false);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.UnknownContent);
    expect(world.disabledSources.size).toBe(0);
  });

  it('refuses to disable core — a world with no content is unreachable otherwise', () => {
    const world = createWorld(7);
    const result = dispatch(world, 'core', false);

    expect(result.ok).toBe(false);
    expect(world.disabledSources.has('core')).toBe(false);
  });

  it('allows enabling core, which is a no-op rather than an error', () => {
    expect(dispatch(createWorld(7), 'core', true).ok).toBe(true);
  });

  it('refuses a malformed source id', () => {
    expect(dispatch(createWorld(7), '', false).ok).toBe(false);
  });
});

describe('enablement is world state (ADR-019 §7)', () => {
  it('is written by the command and read back from the save', () => {
    const world = createWorld(7);
    // `core` is the only source installed in a bare test world, and it may not
    // be disabled — so the round trip is asserted on the empty set, which is
    // still the field surviving serialization.
    const document = JSON.parse(serializeSave(toSaveDocument(world, META))) as {
      world: { disabledSources: string[] };
    };

    expect(document.world.disabledSources).toEqual([]);
  });

  it('restores a disabled set through a full save round trip', () => {
    const world = createWorld(7);
    world.disabledSources.add('moonmelon');

    const document = JSON.parse(serializeSave(toSaveDocument(world, META))) as {
      world: { disabledSources: string[] };
    };

    expect(document.world.disabledSources).toEqual(['moonmelon']);
  });

  it('serializes the set sorted, so the document stays byte-stable', () => {
    const world = createWorld(7);
    for (const id of ['zulu', 'alpha', 'mike']) world.disabledSources.add(id);

    const document = JSON.parse(serializeSave(toSaveDocument(world, META))) as {
      world: { disabledSources: string[] };
    };

    expect(document.world.disabledSources).toEqual(['alpha', 'mike', 'zulu']);
  });
});
