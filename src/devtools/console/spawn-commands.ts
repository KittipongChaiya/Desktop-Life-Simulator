/**
 * Spawn tools. Phase-07.8k, ADR-018 §3.
 *
 * THE FIRST DEBUG TOOL THAT WRITES, which is why the milestone was sequenced
 * last: §3 is the rule ADR-018 calls "most likely to be broken by a
 * well-meaning shortcut", and it lands after the read-only surface settled
 * rather than while it was still moving.
 *
 * EVERY MUTATION IS A COMMAND. This module receives exactly one capability —
 * `submitCommand`, the ordinary player source — so a store, a grid or an entity
 * is not merely off-limits, it is not in scope. There is nothing here to write
 * through even by accident, which is a stronger guarantee than a rule anyone
 * has to remember.
 *
 * It follows the precedent ADR-018 §3 names: the console's `money` command,
 * which dispatches `grantCoins` rather than touching the wallet. Three
 * properties come free and are the reason for the rule — a spawn is
 * REPLAYABLE (it is in the command stream), REJECTABLE (an illegal placement
 * fails like an illegal placement), and INDISTINGUISHABLE from a player action
 * to everything downstream. The command monitor (07.8f) shows each one for the
 * same reason: it wraps the same player source.
 *
 * A batch is N separate commands, never one command with a count. Each is
 * validated against the world as it stands, so the third worker can be refused
 * for want of coins while the first two are hired — which is the truthful
 * outcome, and what a player doing the same thing would get.
 */

import { WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { toIndexUnchecked } from '../../shared/geometry';
import { asContentId, type ContentId } from '../../shared/ids';
import type { Command, CommandResult as DispatchResult } from '../../sim/commands/types';

import {
  linesOf,
  OutputKind,
  resultOf,
  type CommandDefinition,
  type CommandResult,
} from './registry';

export interface SpawnCommandOptions {
  /** The ordinary player source. The ONLY capability this module is given. */
  readonly submitCommand: (command: Command) => DispatchResult;
}

/** Content ids are namespaced (`core:wheat`); a bare word is a typo, not an id. */
function parseContentId(raw: string | undefined): ContentId | null {
  if (raw === undefined || !/^[a-z0-9_]+:[a-z0-9_]+$/.test(raw)) return null;
  return asContentId(raw);
}

/** `x,y` to a tile index, or null when it is not a tile on this map. */
function parseTile(raw: string | undefined): number | null {
  if (raw === undefined) return null;

  const [rawX, rawY] = raw.split(',');
  const x = Number.parseInt(rawX ?? '', 10);
  const y = Number.parseInt(rawY ?? '', 10);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (x < 0 || y < 0 || x >= WORLD_WIDTH || y >= WORLD_HEIGHT) return null;

  return toIndexUnchecked(x, y);
}

function parseCount(raw: string | undefined): number | null {
  if (raw === undefined) return 1;

  const count = Number.parseInt(raw, 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

const USAGE = [
  'spawn worker [count]',
  'spawn crop <contentId> <x,y>',
  'spawn building <contentId> <x,y>',
];

export function createSpawnCommands(options: SpawnCommandOptions): readonly CommandDefinition[] {
  /** Submits one command and renders whatever the dispatcher decided. */
  const submitOne = (command: Command, describe: string): CommandResult => {
    const result = options.submitCommand(command);
    return result.ok
      ? resultOf(describe)
      : resultOf(`refused: ${result.error.message}`, OutputKind.Error);
  };

  const spawnWorkers = (raw: string | undefined): CommandResult => {
    const count = parseCount(raw);
    if (count === null) {
      return resultOf(`Expected a positive integer count, got "${raw ?? ''}"`, OutputKind.Error);
    }

    let hired = 0;
    let refusal: string | null = null;
    for (let i = 0; i < count; i += 1) {
      const result = options.submitCommand({ type: 'hireWorker' });
      if (result.ok) hired += 1;
      else {
        refusal = result.error.message;
        break;
      }
    }

    // Both halves reported: "hired 2 of 3" and the reason the third failed.
    // A tool that reported only the failure would hide the two that landed.
    if (refusal === null) return resultOf(`hired ${String(hired)} worker(s)`);
    return linesOf(
      [`hired ${String(hired)} of ${String(count)}`, `refused: ${refusal}`],
      OutputKind.Error,
    );
  };

  const spawnAt = (
    kind: 'crop' | 'building',
    rawId: string | undefined,
    rawTile: string | undefined,
  ): CommandResult => {
    const id = parseContentId(rawId);
    if (id === null) {
      return resultOf(
        `Expected a namespaced content id like "core:wheat", got "${rawId ?? ''}"`,
        OutputKind.Error,
      );
    }

    const tile = parseTile(rawTile);
    if (tile === null) {
      return resultOf(
        `Expected a tile as "x,y" on the map, got "${rawTile ?? ''}"`,
        OutputKind.Error,
      );
    }

    return kind === 'crop'
      ? submitOne({ type: 'plantCrop', tile, cropId: id }, `planted ${id} at ${rawTile ?? ''}`)
      : submitOne(
          { type: 'placeBuilding', tile, buildingId: id },
          `placed ${id} at ${rawTile ?? ''}`,
        );
  };

  return [
    {
      name: 'spawn',
      summary: 'Spawn a worker, crop or building (dev-only, dispatched as a command).',
      usage: USAGE.join(' | '),
      run: ({ args }) => {
        const [kind, ...rest] = args;

        switch (kind) {
          case undefined:
            return linesOf(USAGE, OutputKind.Info);
          case 'worker':
            return spawnWorkers(rest[0]);
          case 'crop':
          case 'building':
            return spawnAt(kind, rest[0], rest[1]);
          default:
            return resultOf(
              `Unknown spawn kind "${kind}". Try: worker, crop, building.`,
              OutputKind.Error,
            );
        }
      },
    },
  ];
}
