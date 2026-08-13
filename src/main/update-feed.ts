/**
 * Where the update manifest is published. Phase-15 — ADR-025 §6, ADR-028 §2.
 *
 * The address and the publish target are one decision that has to be written
 * in two places, and they cannot be collapsed: `electron-builder.yml` resolves
 * the repository at PUBLISH time, while a client needs the address at RUN
 * time, from a bundle built long before that release existed.
 *
 * So `package.json`'s `repository` is the single source both read, and
 * `update-feed.test.ts` asserts they still agree. The failure it prevents is
 * silent and total — a client fetching from a repository nobody publishes to
 * checks forever, finds nothing, and is indistinguishable from a product that
 * simply has no updates.
 */

/**
 * The published repository, without the `.git` suffix `package.json` carries.
 *
 * Written out rather than read from `package.json` at runtime: the main bundle
 * does not ship `package.json`, and reading one from disk at startup would be
 * a file the updater does not need to depend on.
 */
export const REPOSITORY_URL = 'https://github.com/KittipongChaiya/Desktop-Life-Simulator';

/** The release asset the manifest is published as. */
export const MANIFEST_FILENAME = 'update-manifest.json';

/**
 * The manifest for whatever the newest published release is.
 *
 * `releases/latest/download/...` resolves server-side, so a build from v0.2.0
 * finds the v0.9 manifest without ever being rebuilt. A versioned URL would
 * freeze each build's view of the world at the moment it was compiled, which
 * is the opposite of what an updater is for.
 */
export function manifestUrl(): string {
  return `${REPOSITORY_URL}/releases/latest/download/${MANIFEST_FILENAME}`;
}
