/**
 * Source manifests, parsed from untrusted JSON. Phase-09a — ADR-019 §1.
 *
 * A manifest is the only thing the engine knows about a source before it
 * decides whether to load it, and it arrives from disk — which `AI_RULES.md`
 * §2.4 defines as an untrusted boundary. Every field is therefore checked here
 * rather than trusted downstream, and a malformed manifest **refuses exactly
 * one source, names it, and leaves the rest loaded** (ADR-019 §6). A loader
 * that throws on the first bad file lets one broken plugin take the game down.
 *
 * `plugins/manifest.schema.json` is the published contract this implements. The
 * schema is authoritative for authors; this module is what actually enforces
 * it, and `manifest.test.ts` pins them to each other — a rule in the schema that
 * nothing checks is a rule that is not enforced.
 *
 * ## `apiVersion` is the only version that drives behaviour
 *
 * Not `version`, which is the source's own and purely informational, and not
 * the engine's, which moves for reasons no source can observe (ADR-019 §1). The
 * engine supports every API version it has ever shipped, so the check is
 * `apiVersion <= PLUGIN_API_VERSION`: a source written against v1 keeps working
 * when v2 arrives, and a source written against v2 is refused by name on a v1
 * engine rather than half-loading and failing later at a missing capability.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isReservedNamespace } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';

import { PLUGIN_API_VERSION } from './plugin-api';
import { Provenance } from './sources';

/** A validated manifest. Every field here has been checked. */
export interface SourceManifest {
  /** The primary namespace, and the source's identity. Permanent. */
  readonly id: string;
  /** Every namespace this source owns, primary first. */
  readonly namespaces: readonly string[];
  readonly name: string;
  readonly version: string;
  readonly apiVersion: number;
  readonly provenance: Provenance;
  /** Source IDs this one requires, mapped to a declared range over their version. */
  readonly dependencies: Readonly<Record<string, string>>;
}

const NAMESPACE = /^[a-z0-9_]+$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

/** Keys the published schema allows. Anything else is a typo or a newer format. */
const KNOWN_KEYS = new Set([
  'id',
  'additionalNamespaces',
  'name',
  'version',
  'apiVersion',
  'provenance',
  'saveSchemaVersion',
  'content',
  'assets',
  'dependencies',
  'entry',
  'description',
  'author',
  'license',
  'homepage',
]);

const PROVENANCES = new Set<string>(Object.values(Provenance));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Names the source in every error, so a refusal says which plugin to fix. */
function reject(id: string, message: string, context: Record<string, string | number> = {}) {
  return err(appError(ErrorCode.InvalidIntent, message, { source: id, ...context }));
}

/**
 * Validates an unknown value as a source manifest.
 *
 * Returns a typed error rather than throwing: refusing one source is a routine
 * runtime condition, not a programming error.
 */
export function parseManifest(value: unknown): Result<SourceManifest> {
  if (!isRecord(value)) {
    return err(appError(ErrorCode.InvalidIntent, 'manifest is not an object'));
  }

  const rawId = value['id'];
  if (typeof rawId !== 'string' || !NAMESPACE.test(rawId)) {
    return err(
      appError(ErrorCode.InvalidIntent, 'manifest id must be a lowercase namespace', {
        id: typeof rawId === 'string' ? rawId : typeof rawId,
      }),
    );
  }
  const id = rawId;

  for (const key of Object.keys(value)) {
    if (!KNOWN_KEYS.has(key)) {
      return reject(id, 'manifest has an unknown field', { field: key });
    }
  }

  const name = value['name'];
  if (typeof name !== 'string' || name.length === 0) {
    return reject(id, 'manifest name must be a non-empty string');
  }

  const version = value['version'];
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    return reject(id, 'manifest version must be major.minor.patch');
  }

  const apiVersion = value['apiVersion'];
  if (typeof apiVersion !== 'number' || !Number.isInteger(apiVersion) || apiVersion < 1) {
    return reject(id, 'manifest apiVersion must be an integer of at least 1');
  }

  const rawProvenance = value['provenance'] ?? Provenance.ThirdParty;
  if (typeof rawProvenance !== 'string' || !PROVENANCES.has(rawProvenance)) {
    return reject(id, 'manifest provenance is not a known kind', {
      provenance: typeof rawProvenance === 'string' ? rawProvenance : typeof rawProvenance,
    });
  }
  const provenance = rawProvenance as Provenance;

  const namespaces = [id];
  const extra = value['additionalNamespaces'];
  if (extra !== undefined) {
    if (!Array.isArray(extra)) return reject(id, 'additionalNamespaces must be an array');
    for (const namespace of extra) {
      if (typeof namespace !== 'string' || !NAMESPACE.test(namespace)) {
        return reject(id, 'additionalNamespaces contains a malformed namespace', {
          namespace: String(namespace),
        });
      }
      if (namespaces.includes(namespace)) {
        return reject(id, 'additionalNamespaces repeats a namespace', { namespace });
      }
      namespaces.push(namespace);
    }
  }

  // Reserved names are refused here as well as at registration. A source that
  // claims one should be told by the loader, which can name the file, rather
  // than by a registry error later (ADR-026 §1).
  if (provenance === Provenance.ThirdParty) {
    const reserved = namespaces.find((namespace) => isReservedNamespace(namespace));
    if (reserved !== undefined) {
      return reject(id, 'namespace is reserved for first-party content', { namespace: reserved });
    }
  }

  const dependencies: Record<string, string> = {};
  const rawDependencies = value['dependencies'];
  if (rawDependencies !== undefined) {
    if (!isRecord(rawDependencies)) return reject(id, 'dependencies must be an object');
    for (const [dependency, range] of Object.entries(rawDependencies)) {
      if (!NAMESPACE.test(dependency)) {
        return reject(id, 'dependency id is not a namespace', { dependency });
      }
      if (typeof range !== 'string' || range.length === 0) {
        return reject(id, 'dependency range must be a string', { dependency });
      }
      if (dependency === id) {
        return reject(id, 'a source may not depend on itself');
      }
      dependencies[dependency] = range;
    }
  }

  const saveSchemaVersion = value['saveSchemaVersion'];
  if (saveSchemaVersion !== undefined) {
    if (
      typeof saveSchemaVersion !== 'number' ||
      !Number.isInteger(saveSchemaVersion) ||
      saveSchemaVersion < 1
    ) {
      return reject(id, 'saveSchemaVersion must be an integer of at least 1');
    }
  }

  return ok({ id, namespaces, name, version, apiVersion, provenance, dependencies });
}

/**
 * Whether this engine can load a source written against `apiVersion`.
 *
 * Every version ever shipped stays supported; withdrawing one needs a successor
 * ADR, exactly as dropping a migration link does (ADR-019 §1).
 */
export function supportsApiVersion(apiVersion: number): boolean {
  return apiVersion >= 1 && apiVersion <= PLUGIN_API_VERSION;
}
