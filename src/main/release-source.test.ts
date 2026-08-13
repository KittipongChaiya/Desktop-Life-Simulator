/**
 * The release source. Phase-15 — ADR-025 §6, §7.
 *
 * The transport is a parameter for the same reason `save-store.ts` takes a
 * directory: it makes the whole thing provable without a host or a network.
 * What is left needing either is nothing at all — the real source passes the
 * global `fetch`, which satisfies the structural contract below.
 */

import { describe, expect, it, vi } from 'vitest';

import { createReleaseSource, type ManifestResponse } from './release-source';

const URL = 'https://example.invalid/update-manifest.json';

const MANIFEST = {
  version: '0.2.1',
  schemaVersion: 5,
  rolloutPercent: 25,
  halted: false,
};

const respondWith = (body: unknown, ok = true, status = 200): ManifestResponse => ({
  ok,
  status,
  json: () => Promise.resolve(body),
});

describe('a manifest that arrives', () => {
  it('becomes the offered release', async () => {
    const source = createReleaseSource(() => Promise.resolve(respondWith(MANIFEST)), URL);

    await expect(source()).resolves.toEqual(MANIFEST);
  });

  it('is requested from the url it was given', async () => {
    const transport = vi.fn(() => Promise.resolve(respondWith(MANIFEST)));

    await createReleaseSource(transport, URL)();

    expect(transport).toHaveBeenCalledWith(URL);
  });

  it('answers nothing when it cannot be read', async () => {
    // A malformed manifest is a publishing mistake, and `checkForUpdate` reads
    // null as "withdrawn" — which clears a pending announcement. That is the
    // safe direction: a manifest nobody can parse stops an offer rather than
    // delivering one, which is ADR-025 §1's ordering.
    const source = createReleaseSource(() => Promise.resolve(respondWith({ version: 1 })), URL);

    await expect(source()).resolves.toBeNull();
  });
});

describe('a manifest that does not arrive is not an answer', () => {
  // The distinction boundary 7 built `checkForUpdate` around: a source that
  // says "nothing on offer" has told us something, and a source that could not
  // answer has not. Swallowing these into `null` would convert a laptop on a
  // train into a withdrawal, silently discarding an announcement the player
  // had already earned.
  //
  // So every failure below REJECTS, and `checkForUpdate` leaves the state
  // exactly as it found it and says nothing at all.

  it('propagates a transport failure', async () => {
    const source = createReleaseSource(() => Promise.reject(new Error('ENOTFOUND')), URL);

    await expect(source()).rejects.toThrow('ENOTFOUND');
  });

  it('rejects a response that is not ok, rather than reading it as a withdrawal', async () => {
    // A 404 could be a deleted manifest, and it could equally be a typo in the
    // url or a CDN having a bad minute. Reading it as a withdrawal would make
    // a permanently broken updater look exactly like a permanently quiet one.
    //
    // Withdrawal has its own expression — `halted: true` — which is deliberate
    // and unambiguous. ADR-025 §6's halt does not depend on this case.
    const source = createReleaseSource(
      () => Promise.resolve(respondWith(MANIFEST, false, 404)),
      URL,
    );

    await expect(source()).rejects.toThrow(/404/u);
  });

  it('rejects a body that is not JSON', async () => {
    const source = createReleaseSource(
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error('Unexpected token <')),
        }),
      URL,
    );

    await expect(source()).rejects.toThrow('Unexpected token <');
  });

  it('names the manifest in the failure, because a check runs unattended', async () => {
    const source = createReleaseSource(
      () => Promise.resolve(respondWith(MANIFEST, false, 500)),
      URL,
    );

    await expect(source()).rejects.toThrow(/manifest/iu);
  });
});
