/**
 * Where the manifest is published. Phase-15 — ADR-025 §6, ADR-028 §2.
 *
 * The URL and the publish target are the same decision written twice — once in
 * `electron-builder.yml`, once in the client that fetches it. They cannot be
 * collapsed into one place: the builder resolves the repository at PUBLISH
 * time and the client needs the address at RUN time, in a bundle built long
 * before. So they are pinned to a single source instead, and this is the test
 * that says so.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { MANIFEST_FILENAME, manifestUrl, REPOSITORY_URL } from './update-feed';

const ROOT = join(__dirname, '..', '..');

function packageRepository(): string {
  const parsed = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    repository?: { url?: string };
  };
  return parsed.repository?.url ?? '';
}

describe('the manifest address', () => {
  it('agrees with the repository electron-builder will publish to', () => {
    // The failure this prevents is silent and total: a client fetching a
    // manifest from a repository nobody publishes to would check forever, find
    // nothing, and look exactly like a product with no updates.
    expect(packageRepository()).toContain(REPOSITORY_URL);
  });

  it('points at the latest release, not a pinned one', () => {
    // `releases/latest/download/...` always resolves to the newest published
    // release, so a client built in v0.2.0 finds the v0.9 manifest without
    // ever being rebuilt. A versioned URL would freeze each build's view of
    // the world at the moment it was compiled.
    expect(manifestUrl()).toBe(`${REPOSITORY_URL}/releases/latest/download/${MANIFEST_FILENAME}`);
  });

  it('is https, because the transport is the whole root of trust now', () => {
    // ADR-028 §3: with the publisher signature deferred, TLS and the release
    // host are what remains. Plain http would not merely weaken that, it would
    // remove it.
    expect(manifestUrl().startsWith('https://')).toBe(true);
  });

  it('names a file a publisher can recognise in a release asset list', () => {
    expect(MANIFEST_FILENAME).toBe('update-manifest.json');
  });

  it('does not point at the repository the builder infers from a git remote', () => {
    // electron-builder can resolve owner/repo from whatever `git remote` says
    // on the publishing machine. That is convenient and it is not a source of
    // truth — a fork, a mirror, or a CI checkout with a rewritten remote would
    // publish somewhere this client never looks. package.json is explicit, and
    // both sides read it.
    expect(REPOSITORY_URL).not.toBe('');
    expect(REPOSITORY_URL.endsWith('.git')).toBe(false);
  });
});
