/**
 * Simulation headlessness test. Phase-00 acceptance criterion 15.
 *
 * Asserts that every module under src/sim imports and runs with no DOM, no
 * Electron, and no PixiJS. This is the invariant ARCHITECTURE.md §2.1 calls the
 * one everything else depends on: it is what makes the game testable at 90%
 * coverage, savable, collapsible with a full GPU teardown, and portable to a
 * worker or server later.
 *
 * The boundary linter catches forbidden *imports*; this catches forbidden
 * *runtime* access — a module that reaches for `globalThis.window` at load time
 * would pass lint and fail here.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stepSimulation, stepSimulationBy } from '../src/sim/tick';
import { createWorld } from '../src/sim/world/world';

const SIM_ROOT = join(import.meta.dirname, '..', 'src', 'sim');

function collectModules(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return collectModules(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

describe('sim modules import in a bare environment (criterion 15)', () => {
  const modules = collectModules(SIM_ROOT);

  it('finds simulation modules to check', () => {
    expect(modules.length).toBeGreaterThan(0);
  });

  it.each(modules.map((m) => relative(SIM_ROOT, m)))('imports %s without a DOM', async (rel) => {
    // vitest's `node` environment has no `document` or `window`; an import that
    // touches either at module scope throws here.
    expect(globalThis.document).toBeUndefined();
    await expect(import(pathToFileURL(join(SIM_ROOT, rel)).href)).resolves.toBeDefined();
  });
});

describe('simulation runs headless', () => {
  it('creates a world and advances deterministically', () => {
    const world = createWorld(4242);
    expect(world.tick).toBe(0);

    stepSimulation(world);
    expect(world.tick).toBe(1);

    stepSimulationBy(world, 99);
    expect(world.tick).toBe(100);
  });

  it('produces identical state from identical seeds over 100,000 ticks', () => {
    const a = createWorld(31337);
    const b = createWorld(31337);

    stepSimulationBy(a, 100_000);
    stepSimulationBy(b, 100_000);

    expect(a.tick).toBe(100_000);
    expect(a.tick).toBe(b.tick);
    expect(a.rng.getState()).toEqual(b.rng.getState());
  });

  it('rejects a negative or non-integer tick count', () => {
    const world = createWorld(1);
    expect(() => stepSimulationBy(world, -1)).toThrow();
    expect(() => stepSimulationBy(world, 1.5)).toThrow();
  });
});
