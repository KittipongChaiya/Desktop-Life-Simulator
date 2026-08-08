/**
 * Turning discovered files into installed content. Phase-09d — ADR-019 §6.
 *
 * This is the seam the boundary linter forces and the architecture wants. Main
 * finds files and may not import `src/sim`; the simulation validates and
 * resolves and may not touch a filesystem. The composition root is the one
 * place allowed to see both, so the pipeline lives here:
 *
 * ```
 *   main: read bytes  →  parseManifest  →  resolveSources  →  installSource
 *        (platform)        (policy)          (policy)          (ambient set)
 * ```
 *
 * **Every source is accounted for.** A manifest that will not parse, a
 * dependency that is missing, a cycle, an unsupported API version, a contested
 * namespace — each comes back named, with a reason, and never stops the others
 * loading. A plugin that vanishes with no explanation is the outcome ADR-019 §6
 * exists to prevent, because its author cannot tell a typo from an engine bug.
 *
 * Core is already installed by the time this runs: `plugins/core/` installs
 * itself on import, and it owns `core` before discovery begins — which is why
 * its namespaces are passed to the resolver as pre-owned, so a third party
 * claiming `core` is refused here rather than at registration.
 */

import { installedSources, installSource } from '../../sim/content/installed';
import { parseManifest } from '../../sim/content/manifest';
import type { SourceManifest } from '../../sim/content/manifest';
import { resolveSources } from '../../sim/content/resolve';
import type { ContentSource } from '../../sim/content/sources';

/** What main hands over: bytes and paths, no judgements. */
export interface DiscoveredPayload {
  readonly sources: readonly { readonly directory: string; readonly manifest: unknown }[];
  readonly failed: readonly { readonly directory: string; readonly reason: string }[];
}

export interface InstallOutcome {
  /** Sources installed, in resolved load order. */
  readonly installed: readonly string[];
  /** Everything refused, each with the reason an author would need. */
  readonly refused: readonly { readonly source: string; readonly reason: string }[];
}

/** A manifest becomes the source record the registry owns. */
function toContentSource(manifest: SourceManifest): ContentSource {
  return {
    id: manifest.id,
    namespaces: manifest.namespaces,
    provenance: manifest.provenance,
    displayName: manifest.name,
    version: manifest.version,
  };
}

/**
 * Validates, resolves, and installs every discovered source.
 *
 * Content registration itself is deferred: `installSource` records the source
 * and its installer, and the installer runs per world (`createWorld`). At API
 * v1 a source is data, so there is nothing to execute here — phase-09's loader
 * parses and validates, and never evaluates (ADR-019 §4).
 */
export function installDiscoveredSources(discovered: DiscoveredPayload): InstallOutcome {
  const refused: { source: string; reason: string }[] = discovered.failed.map((failure) => ({
    source: failure.directory,
    reason: failure.reason,
  }));

  const manifests: SourceManifest[] = [];
  for (const found of discovered.sources) {
    const parsed = parseManifest(found.manifest);
    if (!parsed.ok) {
      refused.push({ source: found.directory, reason: parsed.error.message });
      continue;
    }
    manifests.push(parsed.value);
  }

  // Namespaces already owned before discovery — core, and anything a previous
  // call installed. Passing them in is what makes a third-party claim on `core`
  // a refusal with a named owner rather than a registration error later.
  const preOwned = new Map<string, string>();
  for (const source of installedSources()) {
    for (const namespace of source.namespaces) preOwned.set(namespace, source.id);
  }

  const resolution = resolveSources(manifests, preOwned);
  for (const refusal of resolution.refused) {
    refused.push({ source: refusal.id, reason: refusal.error.message });
  }

  const installed: string[] = [];
  for (const manifest of resolution.loaded) {
    // A v1 source registers no content of its own yet: definition FILES are
    // named in the manifest and loading them is the next capability, not this
    // commit's. Installing the source claims its namespaces and puts it in load
    // order, which is what makes it visible to the save's source manifest.
    const result = installSource(toContentSource(manifest), () => ({ ok: true, value: undefined }));

    if (result.ok) installed.push(manifest.id);
    else refused.push({ source: manifest.id, reason: result.error.message });
  }

  return { installed, refused };
}
