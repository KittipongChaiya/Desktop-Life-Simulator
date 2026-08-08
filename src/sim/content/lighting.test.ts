/**
 * Phase-10c — the phase→tint registry, and the rule it must not break.
 *
 * ADR-020 §4: no simulation system may read lighting. The registry lives in
 * `src/sim/content` because that is where registries a source writes to live,
 * and a test at the bottom of this file keeps that from quietly becoming
 * permission for a system to read it.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { asContentId } from '../../shared/ids';
import { DAY_PHASES, DayPhase } from '../time/game-clock';

import { createInstalledRegistries } from './installed';
import { createPhaseTintRegistry, phaseTintId, tintFor } from './lighting';

const NIGHT = {
  id: phaseTintId('core', DayPhase.Night),
  phase: DayPhase.Night,
  color: 0x1b2a6b,
  alpha: 0.4,
};

describe('phaseTintId', () => {
  it('produces a namespaced id, so a tint is owned like any other content', () => {
    expect(phaseTintId('core', DayPhase.Dawn)).toBe(asContentId('core:dawn_tint'));
    expect(phaseTintId('moonmelon', DayPhase.Night)).toBe(asContentId('moonmelon:night_tint'));
  });

  it('produces a distinct id per phase', () => {
    const ids = new Set(DAY_PHASES.map((phase) => phaseTintId('core', phase)));
    expect(ids.size).toBe(DAY_PHASES.length);
  });
});

describe('tintFor', () => {
  it('finds the tint registered for a phase', () => {
    const registry = createPhaseTintRegistry();
    registry.register(NIGHT);

    expect(tintFor(registry, DayPhase.Night)).toEqual(NIGHT);
  });

  it('returns undefined for a phase nothing registered', () => {
    // Not a default colour: a missing tint means the layer paints nothing,
    // which is the correct degradation. A guess would paint a colour no
    // content asked for.
    const registry = createPhaseTintRegistry();
    registry.register(NIGHT);

    expect(tintFor(registry, DayPhase.Dawn)).toBeUndefined();
  });

  it('returns undefined on an empty registry', () => {
    expect(tintFor(createPhaseTintRegistry(), DayPhase.Day)).toBeUndefined();
  });

  it('refuses a duplicate id, like every other registry', () => {
    const registry = createPhaseTintRegistry();
    expect(registry.register(NIGHT).ok).toBe(true);
    expect(registry.register(NIGHT).ok).toBe(false);
  });
});

describe('core ships a tint for every phase', () => {
  it('leaves no phase unpainted', () => {
    // A gap here is invisible until a player reaches that hour: the previous
    // phase's tint would simply persist, or none would ever appear.
    //
    // Read from the INSTALLED registries rather than by importing
    // `plugins/core` — that is the set a world actually receives, through the
    // same public API a third-party source would use.
    const registry = createInstalledRegistries().phaseTints;

    for (const phase of DAY_PHASES) {
      expect(tintFor(registry, phase), `no tint for ${phase}`).toBeDefined();
    }
  });

  it('registers daylight explicitly as transparent rather than omitting it', () => {
    const registry = createInstalledRegistries().phaseTints;

    // Omitting `day` would mean "no content supplied one" and leave dawn's
    // tint painted through the afternoon.
    expect(tintFor(registry, DayPhase.Day)?.alpha).toBe(0);
  });
});

describe('ADR-020 §4 — no simulation system reads lighting', () => {
  it('is not imported by anything under src/sim/systems', () => {
    const systems = resolve(import.meta.dirname, '..', 'systems');
    const offenders: string[] = [];

    for (const file of readdirSync(systems).filter((name) => name.endsWith('.ts'))) {
      const source = readFileSync(join(systems, file), 'utf8');
      if (source.includes('content/lighting')) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
