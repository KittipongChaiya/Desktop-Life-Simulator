/**
 * The load pipeline. Phase-07c — `SAVE_FORMAT.md` §4.3 steps 2–5,
 * acceptance criteria 5, 6, 7 (the pipeline halves).
 *
 * One pure function runs a parsed document through migration → structural
 * validation → semantic repair → hydration, with the `.bak` document as the
 * fallback for every recoverable failure — and one deliberate exception: a
 * NEWER save refuses outright and never falls back, because quietly loading
 * an older backup instead would silently discard the newer session's world.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../shared/errors';
import { createWorld } from '../sim/world/world';

import { loadWorld } from './load';
import type { SaveMeta } from './schema';
import { serializeSave, toSaveDocument } from './serialize';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 3,
};

function parsedDocument(seed: number, tick = 0): unknown {
  const world = createWorld(seed);
  world.tick = tick;
  return JSON.parse(serializeSave(toSaveDocument(world, META)));
}

describe('loadWorld', () => {
  it('loads a valid primary document — world, meta, and quarantine carried out', () => {
    const result = loadWorld(parsedDocument(7, 480), null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.world.tick).toBe(480);
    expect(result.value.world.seed).toBe(7);
    expect(result.value.meta.createdAtUnixMs).toBe(META.createdAtUnixMs);
    expect(result.value.meta.saveCount).toBe(3);
    expect(result.value.quarantine).toEqual({
      crops: [],
      buildings: [],
      stacks: [],
      lastPlanted: [],
    });
    expect(result.value.usedBackup).toBe(false);
    expect(result.value.repairs).toEqual([]);
  });

  it('falls back to the backup when the primary fails, and says so', () => {
    const result = loadWorld({ nonsense: true }, parsedDocument(9, 120));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.world.seed).toBe(9);
    expect(result.value.usedBackup).toBe(true);
  });

  it('refuses a newer primary outright — NEVER falls back to an older backup (criterion 7)', () => {
    const newer = parsedDocument(7, 999) as { schemaVersion: number };
    newer.schemaVersion = 99;
    const result = loadWorld(newer, parsedDocument(9, 120));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.SaveFromNewerVersion);
  });

  it('reports a clear error when both documents are unusable — never a silent new game', () => {
    const result = loadWorld({ junk: 1 }, 'garbage');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(ErrorCode.SaveCorrupt);
  });

  it('surfaces repairs from a damaged-but-recoverable document', () => {
    const damaged = parsedDocument(7, 100) as {
      world: { wallet: { coins: number } };
    };
    damaged.world.wallet.coins = -5;
    const result = loadWorld(damaged, null);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.world.wallet.coins).toBe(0);
    expect(result.value.repairs.some((r) => r.rule === 'coins-negative')).toBe(true);
  });
});
