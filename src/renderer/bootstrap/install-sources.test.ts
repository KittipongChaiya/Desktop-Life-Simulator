/**
 * Discovered files become installed content. Phase-09d — ADR-019 §6.
 *
 * The pipeline's contract, and the thing worth testing, is that it is TOTAL:
 * every directory main handed over comes back either installed or refused with
 * a reason. A plugin that vanishes silently is what ADR-019 §6 exists to
 * prevent — its author cannot tell a typo from an engine bug from having put it
 * in the wrong folder.
 *
 * `core` is installed before any of this runs (`plugins/core/` installs itself
 * on import, and the test runner loads it through `setupFiles`), which is what
 * lets the reserved-namespace case below be real rather than simulated.
 */

import { describe, expect, it } from 'vitest';

import { installedSources } from '../../sim/content/installed';

import { installDiscoveredSources, type DiscoveredPayload } from './install-sources';

const manifest = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  name: `Source ${id}`,
  version: '1.0.0',
  apiVersion: 1,
  ...extra,
});

const payload = (
  sources: { directory: string; manifest: unknown }[],
  failed: { directory: string; reason: string }[] = [],
): DiscoveredPayload => ({ sources, failed });

describe('installDiscoveredSources', () => {
  it('installs a well-formed source and reports it by id', () => {
    const outcome = installDiscoveredSources(
      payload([{ directory: 'alpha', manifest: manifest('alpha') }]),
    );

    expect(outcome.installed).toContain('alpha');
    expect(installedSources().some((source) => source.id === 'alpha')).toBe(true);
  });

  it('carries the manifest through to the installed source record', () => {
    installDiscoveredSources(
      payload([{ directory: 'named', manifest: manifest('named', { name: 'A Readable Name' }) }]),
    );

    const source = installedSources().find((s) => s.id === 'named');
    expect(source?.displayName).toBe('A Readable Name');
    expect(source?.version).toBe('1.0.0');
  });

  it('accounts for EVERY directory — nothing installed is silently dropped', () => {
    const outcome = installDiscoveredSources(
      payload(
        [
          { directory: 'good', manifest: manifest('good') },
          { directory: 'malformed', manifest: { id: 'Bad Id' } },
        ],
        [{ directory: 'unreadable', reason: 'no plugin.json' }],
      ),
    );

    const accounted = [...outcome.installed, ...outcome.refused.map((r) => r.source)].sort();
    expect(accounted).toEqual(['good', 'malformed', 'unreadable']);
  });

  it('passes main’s read failures straight through, with their reasons', () => {
    const outcome = installDiscoveredSources(
      payload([], [{ directory: 'broken', reason: 'plugin.json is not valid JSON' }]),
    );

    expect(outcome.refused).toEqual([
      { source: 'broken', reason: 'plugin.json is not valid JSON' },
    ]);
  });

  it('refuses a malformed manifest and names the directory it came from', () => {
    // The directory is what an author can act on — the manifest has no usable
    // id precisely because it is malformed.
    const outcome = installDiscoveredSources(
      payload([{ directory: 'typo_folder', manifest: { name: 'no id at all' } }]),
    );

    expect(outcome.installed).toEqual([]);
    expect(outcome.refused[0]?.source).toBe('typo_folder');
  });

  it('refuses a third party claiming a namespace core already owns', () => {
    const outcome = installDiscoveredSources(
      payload([
        {
          directory: 'impostor',
          manifest: manifest('impostor', { additionalNamespaces: ['core'] }),
        },
      ]),
    );

    expect(outcome.installed).toEqual([]);
    expect(outcome.refused).toHaveLength(1);
    expect(installedSources().some((s) => s.id === 'impostor')).toBe(false);
  });

  it('refuses an unsupported API version while installing everything else', () => {
    const outcome = installDiscoveredSources(
      payload([
        { directory: 'fine', manifest: manifest('fine') },
        { directory: 'future', manifest: manifest('future', { apiVersion: 99 }) },
      ]),
    );

    expect(outcome.installed).toContain('fine');
    expect(outcome.refused.map((r) => r.source)).toContain('future');
  });

  it('installs dependencies before the sources that need them', () => {
    const outcome = installDiscoveredSources(
      payload([
        { directory: 'addon', manifest: manifest('addon', { dependencies: { base_pack: '*' } }) },
        { directory: 'base_pack', manifest: manifest('base_pack') },
      ]),
    );

    expect(outcome.installed.indexOf('base_pack')).toBeLessThan(outcome.installed.indexOf('addon'));
  });

  it('is a no-op for an empty discovery — most players have no plugins', () => {
    expect(installDiscoveredSources(payload([]))).toEqual({ installed: [], refused: [] });
  });
});
