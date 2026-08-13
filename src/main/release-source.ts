/**
 * The release source. Phase-15 — ADR-025 §6, §7.
 *
 * Fetches the published manifest and hands it to `parseReleaseManifest`. This
 * is the one component ADR-025 §7 said would need a dependency, and it turns
 * out to need none: the manifest is a small JSON document over HTTPS, so the
 * transport is `fetch` and the parsing is ours.
 *
 * `electron-updater` still owns the half after this one — download, SHA-512
 * verification, and handoff to the installer for whatever version the policy
 * approved (`TECH_STACK.md` §7.4).
 *
 * ## Failing to answer is not an answer
 *
 * Every failure here REJECTS rather than resolving to `null`, and the
 * distinction is the reason `checkForUpdate` was built the way it was.
 *
 * `null` means "nothing on offer", which is information: it clears a pending
 * announcement, so a withdrawal reaches the installs that had not taken the
 * update yet. A rejection means the check could not be made, which is not
 * information at all — a laptop on a train produces it constantly. Collapsing
 * the two would silently discard an announcement the player had already
 * earned, every time the network hiccuped.
 */

import { parseReleaseManifest } from './release-manifest';
import type { ReleaseSource } from './update-check';

/**
 * The part of a `Response` this needs.
 *
 * Structural rather than the DOM type, so a test can satisfy it with an object
 * literal and the real caller can pass the global `fetch` unchanged. Declaring
 * the three members actually used also documents the contract: the status is
 * checked here rather than by whoever supplied the transport.
 */
export interface ManifestResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/** How the manifest is retrieved. The global `fetch` satisfies this. */
export type ManifestTransport = (url: string) => Promise<ManifestResponse>;

export function createReleaseSource(transport: ManifestTransport, url: string): ReleaseSource {
  return async () => {
    const response = await transport(url);

    // A 404 could be a deleted manifest and could equally be a typo in the url
    // or a CDN having a bad minute. Reading it as a withdrawal would make a
    // permanently broken updater indistinguishable from a permanently quiet
    // one — so it is a failure to answer, and the state is left alone.
    //
    // Withdrawal has its own unambiguous expression, `halted: true`, so
    // ADR-025 §6's halt does not depend on this case being generous.
    if (!response.ok) {
      // Named, because this runs unattended and the status alone would not say
      // which of the application's several fetches went wrong.
      throw new Error(`update manifest request failed with status ${String(response.status)}`);
    }

    return parseReleaseManifest(await response.json());
  };
}
