/**
 * Phase-13c — sounds as registered content, and the rule that let them be.
 *
 * `registerAudio` exists on an API that lives in `src/sim`, while ADR-023 §6
 * forbids `src/sim` referencing audio. The reconciliation is that a sound
 * definition is DATA — four plain values that cannot make a noise — and the
 * test at the bottom of this file is what keeps that true.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { isSoundCategory, SOUND_CATEGORY_IDS } from '../../shared/audio';

import { createInstalledRegistries } from './installed';
import { createSoundRegistry, isPlayableDefinition, soundId } from './sounds';

const CORE_HARVEST = soundId('core', 'harvest');

describe('the sound registry', () => {
  it('registers and looks up a sound', () => {
    const registry = createSoundRegistry();
    const sound = { id: CORE_HARVEST, category: 'world', gain: 0.35, asset: 'harvest' } as const;

    expect(registry.register(sound).ok).toBe(true);
    expect(registry.get(CORE_HARVEST)).toEqual({ ok: true, value: sound });
  });

  it('refuses a duplicate id, like every other registry', () => {
    const registry = createSoundRegistry();
    const sound = { id: CORE_HARVEST, category: 'world', gain: 0.35, asset: 'harvest' } as const;

    expect(registry.register(sound).ok).toBe(true);
    expect(registry.register(sound).ok).toBe(false);
  });
});

describe('a definition the engine can accept', () => {
  const base = { id: CORE_HARVEST, category: 'world', gain: 0.35, asset: 'harvest' } as const;

  it('accepts the shipped shape', () => {
    expect(isPlayableDefinition(base)).toBe(true);
  });

  it('refuses a category the engine does not have', () => {
    // The set is CLOSED (ADR-023 §2). Silently reassigning to a fallback bus
    // is how a plugin ends up louder than the game.
    expect(isPlayableDefinition({ ...base, category: 'sfx' as never })).toBe(false);
  });

  it('refuses a gain outside 0–1', () => {
    expect(isPlayableDefinition({ ...base, gain: 4 })).toBe(false);
    expect(isPlayableDefinition({ ...base, gain: -1 })).toBe(false);
    expect(isPlayableDefinition({ ...base, gain: Number.NaN })).toBe(false);
  });

  it('refuses a definition naming no asset', () => {
    expect(isPlayableDefinition({ ...base, asset: '' })).toBe(false);
  });
});

describe('core registers its sounds through the public API', () => {
  it('registers all eleven shipped sounds', () => {
    // Read through the installed registries, which is the same path a
    // third-party source takes (ADR-019 §2). Eleven since phase-13d added
    // rain — the first AMBIENT registration, which is what stopped the
    // category being decorative.
    expect(createInstalledRegistries().sounds.size).toBe(11);
  });

  it('registers rain against the ambient category (phase-13d)', () => {
    // `registerAudio` has accepted 'ambient' since 13c and nothing had ever
    // used it, so until now the only thing exercising that path was the
    // unknown-category refusal.
    const rain = createInstalledRegistries()
      .sounds.all()
      .find((s) => s.id.endsWith(':rain'));

    expect(rain?.category).toBe('ambient');
  });

  it('gives every sound a real category and a usable gain', () => {
    for (const sound of createInstalledRegistries().sounds.all()) {
      expect(isSoundCategory(sound.category), `${sound.id} category`).toBe(true);
      expect(sound.gain, `${sound.id} gain`).toBeGreaterThan(0);
      expect(sound.gain).toBeLessThanOrEqual(1);
    }
  });

  it('uses only categories the engine declares', () => {
    const used = new Set(
      createInstalledRegistries()
        .sounds.all()
        .map((s) => s.category),
    );
    for (const category of used) {
      expect(SOUND_CATEGORY_IDS).toContain(category);
    }
  });

  it('carries the shipped mix unchanged', () => {
    // The definitions were generated FROM the catalogue by script, so this
    // pins that the migration moved values rather than retyping them. A
    // transcription slip here would be a silent rebalance nobody could trace.
    const harvest = createInstalledRegistries().sounds.get(CORE_HARVEST);
    expect(harvest.ok && harvest.value.gain).toBe(0.35);
    expect(harvest.ok && harvest.value.category).toBe('world');
  });
});

describe('ADR-023 §6 — no module under src/sim references audio', () => {
  it('is not imported by anything under src/sim outside content', () => {
    // The rule this phase had to reconcile with ADR-019 §3. Carrying data is
    // permitted; DOING anything with it is not, and the way that stays true
    // is that nothing outside the content registries mentions it at all.
    const simRoot = resolve(import.meta.dirname, '..');
    const offenders: string[] = [];

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts') || entry.name.includes('.test.')) continue;
        if (path.includes(join('sim', 'content'))) continue;

        const source = readFileSync(path, 'utf8');
        if (source.includes('shared/audio') || source.includes('content/sounds')) {
          offenders.push(entry.name);
        }
      }
    };

    walk(simRoot);
    expect(offenders).toEqual([]);
  });
});
