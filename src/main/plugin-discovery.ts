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
import { isAbsolute, join, relative, resolve } from 'node:path';

/** The manifest filename inside a source's directory. */
export const MANIFEST_FILENAME = 'plugin.json';

export interface DiscoveredSource {
  /** Directory name, which is also where the source's files live. */
  readonly directory: string;
  /** The parsed manifest, unvalidated — validation is `src/sim`'s. */
  readonly manifest: unknown;
  /**
   * Contents of each file the manifest named under `content.definitions`,
   * keyed by the path as written. Parsed JSON, unvalidated.
   *
   * Files that escaped the source directory, went missing, or would not parse
   * are absent here and named in `failed` instead — never half-loaded.
   */
  readonly definitions: Readonly<Record<string, unknown>>;
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
 * The definition paths a manifest names, defensively.
 *
 * The manifest is untrusted JSON; this reads `content.definitions` without
 * assuming any of it exists or has the right shape, because validating it is
 * `src/sim`'s job and this layer must not duplicate policy.
 */
function declaredDefinitionPaths(manifest: unknown): string[] {
  if (typeof manifest !== 'object' || manifest === null) return [];
  const content = (manifest as { content?: unknown }).content;
  if (typeof content !== 'object' || content === null) return [];
  const declared = (content as { definitions?: unknown }).definitions;
  if (!Array.isArray(declared)) return [];
  return declared.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Resolves a manifest-declared path inside the source directory, or null.
 *
 * PATH TRAVERSAL IS A REAL RISK HERE and this is the only place that can stop
 * it: the path comes from a downloaded manifest, and `readFileSync` will
 * happily follow `../../../` out of the plugins directory and hand a plugin
 * the contents of anything the app can read. A source may only reach its own
 * files, and an absolute path is refused outright.
 */
function resolveInside(root: string, declared: string): string | null {
  if (isAbsolute(declared)) return null;

  const target = resolve(root, declared);
  const inside = relative(resolve(root), target);
  if (inside.startsWith('..') || isAbsolute(inside)) return null;

  return target;
}

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

    let manifest: unknown;
    try {
      manifest = JSON.parse(text);
    } catch {
      // Reported, not thrown: one unparseable manifest refuses one source and
      // leaves the rest discoverable.
      failed.push({ directory, reason: `${MANIFEST_FILENAME} is not valid JSON` });
      continue;
    }

    const definitions: Record<string, unknown> = {};
    let usable = true;

    for (const declared of declaredDefinitionPaths(manifest)) {
      const target = resolveInside(root, declared);
      if (target === null) {
        failed.push({ directory, reason: `definition path escapes the source: ${declared}` });
        usable = false;
        break;
      }
      if (!existsSync(target)) {
        failed.push({ directory, reason: `definition file is missing: ${declared}` });
        usable = false;
        break;
      }
      try {
        definitions[declared] = JSON.parse(readFileSync(target, 'utf8'));
      } catch {
        failed.push({ directory, reason: `definition file is not valid JSON: ${declared}` });
        usable = false;
        break;
      }
    }

    // All or nothing: a source missing half its content would register a
    // partial world its saves then reference.
    if (usable) sources.push({ directory, manifest, definitions });
  }

  return { sources, failed };
}
