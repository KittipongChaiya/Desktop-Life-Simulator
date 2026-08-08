/**
 * Finding content sources on disk. Phase-09d — ADR-019 §6.
 *
 * ## Why discovery is HERE and resolution is not
 *
 * `src/main` may not import `src/sim` (the boundary linter enforces it), so
 * this module cannot call `parseManifest` or `resolveSources` — and it should
 * not want to. Reading files is a platform capability; deciding what a manifest
 * means is simulation policy. Splitting them along the boundary that already
 * exists keeps the whole of the interesting logic in a layer that runs headless
 * in a unit test, and leaves this module with the one job only the main process
 * can do.
 *
 * So: **this returns bytes and paths, never judgements.** A directory whose
 * manifest is missing, unreadable, or not JSON comes back as a `failed` entry
 * with its reason rather than being dropped, because a plugin that silently
 * fails to appear is the worst outcome for its author (ADR-019 §6) — and this
 * layer cannot tell "malformed" from "not a plugin directory" without applying
 * policy it is not allowed to know.
 *
 * ## Order is not trusted
 *
 * `readdirSync` order varies by platform and filesystem. It is sorted here so
 * the payload is stable, but that is a convenience for diffing and logging, not
 * a guarantee anything may depend on: load order is decided by dependency
 * resolution in `src/sim/content/resolve.ts`, never by enumeration (ADR-019 §6,
 * and the reason tile-kind indices stay stable across machines).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The manifest filename inside a source's directory. */
export const MANIFEST_FILENAME = 'plugin.json';

export interface DiscoveredSource {
  /** Directory name, which is also where the source's files live. */
  readonly directory: string;
  /** The parsed manifest, unvalidated — validation is `src/sim`'s. */
  readonly manifest: unknown;
}

export interface UnreadableSource {
  readonly directory: string;
  /** Why it could not be read, for the load report. Never silently dropped. */
  readonly reason: string;
}

export interface Discovery {
  readonly sources: readonly DiscoveredSource[];
  readonly failed: readonly UnreadableSource[];
}

const EMPTY: Discovery = { sources: [], failed: [] };

/**
 * Reads every source directory under `pluginsDir`.
 *
 * A missing plugins directory is normal — most players have none — and returns
 * an empty discovery rather than an error.
 */
export function discoverSources(pluginsDir: string): Discovery {
  if (!existsSync(pluginsDir)) return EMPTY;

  let entries: string[];
  try {
    entries = readdirSync(pluginsDir).sort();
  } catch {
    // An unreadable plugins directory is not a reason to refuse to start.
    return EMPTY;
  }

  const sources: DiscoveredSource[] = [];
  const failed: UnreadableSource[] = [];

  for (const directory of entries) {
    const root = join(pluginsDir, directory);

    try {
      if (!statSync(root).isDirectory()) continue; // a stray file is not a source
    } catch {
      continue;
    }

    const manifestPath = join(root, MANIFEST_FILENAME);
    if (!existsSync(manifestPath)) {
      failed.push({ directory, reason: `no ${MANIFEST_FILENAME}` });
      continue;
    }

    let text: string;
    try {
      text = readFileSync(manifestPath, 'utf8');
    } catch {
      failed.push({ directory, reason: `${MANIFEST_FILENAME} could not be read` });
      continue;
    }

    try {
      sources.push({ directory, manifest: JSON.parse(text) });
    } catch {
      // Reported, not thrown: one unparseable manifest refuses one source and
      // leaves the rest discoverable.
      failed.push({ directory, reason: `${MANIFEST_FILENAME} is not valid JSON` });
    }
  }

  return { sources, failed };
}
