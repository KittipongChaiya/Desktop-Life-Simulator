/**
 * v8 → v9: a delivered contract leaves a record. ADR-032 §2 (as amended),
 * phase-20.
 *
 * v8 deleted a contract on delivery, and the phase's own live verification
 * caught what that costs: the offer's store presence WAS the
 * double-acceptance guard, so a delivered offer reappeared as acceptable and
 * one good deal could be looped all day at premium, bypassing the spot
 * market's decay. v9 keeps the record until the deadline sweep, marked with
 * its delivery tick.
 *
 * The chain gains a second link in one phase — against §11.1's
 * one-per-phase guidance, deliberately: v8 was already merged with its
 * fixture when the hole was found, and ADR-015's append-only and
 * immutability rules are hard where the granularity guidance is soft.
 * Every v8 contract migrates to `fulfilledTick: null`, which is exactly
 * right — a contract that had been delivered would not be in a v8 save.
 */

import type { Migration } from '../migrate';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

export const v8ToV9: Migration = {
  from: 8,
  to: 9,
  describe: 'mark contracts open — delivered ones now persist to their deadline (ADR-032)',

  migrate(document) {
    const world = isRecord(document['world']) ? document['world'] : {};
    const contracts = isArray(world['contracts']) ? world['contracts'] : [];
    return {
      ...document,
      schemaVersion: 9,
      world: {
        ...world,
        contracts: contracts.map((contract) =>
          isRecord(contract) ? { ...contract, fulfilledTick: null } : contract,
        ),
      },
    };
  },
};
