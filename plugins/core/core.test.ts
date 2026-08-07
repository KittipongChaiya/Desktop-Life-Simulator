/**
 * `plugins/core/` uses the public API and nothing else. Phase-08b — ADR-019 §2.
 *
 * The property under test is not that core content registers — every other
 * suite proves that by using it. It is that core registers **the way a stranger
 * would**, because ADR-003 §6's promise is that the API is proven sufficient by
 * first-party content before any third party depends on it, and an API whose
 * only consumer has a shortcut is not proven by anything.
 *
 * ADR-019 §Alternatives D names the failure this guards: a privileged internal
 * path for official content is how a public API stops being dogfooded, and it
 * makes ADR-026 §2's "the engine never branches on provenance" false at exactly
 * the seam where it matters. The tests below therefore compare core against a
 * fabricated third-party source and require the same answers.
 */

import { describe, expect, it } from 'vitest';

import { ErrorCode } from '../../src/shared/errors';
import {
  createInstalledRegistries,
  installSource,
  installedSources,
} from '../../src/sim/content/installed';
import { createPluginApi, PLUGIN_API_VERSION } from '../../src/sim/content/plugin-api';
import { Provenance, type ContentSource } from '../../src/sim/content/sources';

import { coreBuildings, coreCrops, coreItems, coreTileKinds } from './content';

import { CORE_SOURCE } from './index';

describe('the core source', () => {
  it('is installed, owning only the core namespace', () => {
    const core = installedSources().find((source) => source.id === 'core');
    expect(core).toBeDefined();
    expect(core?.namespaces).toEqual(['core']);
  });

  it('declares itself built-in, which is the only thing provenance is for here', () => {
    expect(CORE_SOURCE.provenance).toBe(Provenance.Builtin);
    expect(CORE_SOURCE.displayName.length).toBeGreaterThan(0);
  });

  it('carries its own version, independent of the engine build', () => {
    // A source's version is the content's (ADR-019 §1). Reading `__APP_VERSION__`
    // here would recreate the coupling the versioned API exists to remove.
    expect(CORE_SOURCE.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('registers every kind of content a v0.1 world needs', () => {
    const registries = createInstalledRegistries();
    expect(registries.crops.size).toBeGreaterThan(0);
    expect(registries.items.size).toBeGreaterThan(0);
    expect(registries.buildings.size).toBeGreaterThan(0);
    expect(registries.tileKinds.size).toBeGreaterThan(0);
  });

  it('puts every definition it ships in the namespace it owns', () => {
    const everything = [...coreCrops(), ...coreItems(), ...coreBuildings(), ...coreTileKinds()];
    expect(everything.length).toBeGreaterThan(0);
    for (const definition of everything) {
      expect(definition.id.startsWith('core:'), definition.id).toBe(true);
    }
  });
});

describe('core has no privileged path', () => {
  const stranger: ContentSource = {
    id: 'stranger',
    namespaces: ['stranger'],
    provenance: Provenance.ThirdParty,
    displayName: 'A Third-Party Source',
    version: '0.1.0',
  };

  it('reaches the same API surface a third-party source reaches', () => {
    const targets = createInstalledRegistries();
    const theirs = createPluginApi(stranger, targets);
    const ours = createPluginApi(CORE_SOURCE, targets);

    expect(Object.keys(ours).sort()).toEqual(Object.keys(theirs).sort());
    expect(ours.apiVersion).toBe(theirs.apiVersion);
    expect(ours.apiVersion).toBe(PLUGIN_API_VERSION);
  });

  it('is refused a namespace it does not own, exactly as a stranger would be', () => {
    const targets = createInstalledRegistries();
    const foreign = { ...coreCrops()[0]!, id: 'stranger:wheat' as never };

    const ours = createPluginApi(CORE_SOURCE, targets).registerContent({ crops: [foreign] });
    expect(ours.ok).toBe(false);
    if (!ours.ok) expect(ours.error.code).toBe(ErrorCode.InvalidIntent);
  });

  it('cannot re-register content that is already registered', () => {
    // No update, no delete, no overwrite — for core no more than for anyone
    // (ARCHITECTURE.md §14.4). Re-applying core's own bundle is refused.
    const targets = createInstalledRegistries();
    const again = createPluginApi(CORE_SOURCE, targets).registerContent({ crops: coreCrops() });

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe(ErrorCode.DuplicateContent);
  });

  it('holds the `core` namespace against a third party claiming it', () => {
    const impostor: ContentSource = { ...stranger, id: 'impostor', namespaces: ['core'] };
    const result = installSource(impostor, () => {
      throw new Error('an impostor must never be asked for content');
    });

    expect(result.ok).toBe(false);
    expect(installedSources().some((source) => source.id === 'impostor')).toBe(false);
  });
});
