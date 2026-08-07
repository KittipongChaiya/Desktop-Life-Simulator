/**
 * Load-order resolution. Phase-09a — ADR-019 §6, ADR-026 §1.
 *
 * Turns a set of manifests into an ordered load list plus a refusal list. Three
 * properties matter more than the algorithm:
 *
 * **It is total.** Every manifest handed in comes back either loaded or refused
 * with a named reason. A source that quietly vanishes is the worst outcome for
 * an author, because the game looks fine and their content is simply absent.
 *
 * **It fails closed, per source.** A cycle, a missing dependency, an
 * unsupported API version, or a namespace collision refuses that source and
 * leaves every other one loaded. One broken plugin must not take the game down,
 * and must not take the other plugins down either.
 *
 * **It is deterministic, and never filesystem order.** Directory enumeration
 * differs by platform and by filesystem, and load order decides registration
 * order, which decides tile-kind indices, which are bytes in every save
 * (ADR-004 §2). Ties are broken by source id ascending, so two machines with the
 * same plugins resolve the same order — which is also what lets ADR-008 §4's
 * "subscribers run in registration order" mean anything across sources.
 */

import { appError, ErrorCode, type AppError } from '../../shared/errors';

import { supportsApiVersion, type SourceManifest } from './manifest';

export interface RefusedSource {
  readonly id: string;
  readonly error: AppError;
}

export interface Resolution {
  /** Sources to load, in load order. */
  readonly loaded: readonly SourceManifest[];
  /** Sources refused, each with the reason, ordered by id. */
  readonly refused: readonly RefusedSource[];
}

/**
 * Whether `version` satisfies `range`.
 *
 * A deliberately small subset of semver: an exact version, `*` for any, and
 * `^major.minor.patch` meaning "at least this, below the next major". Anything
 * else is refused rather than guessed at — a range the engine misreads is worse
 * than one it rejects, because the author is told nothing and the mismatch
 * surfaces as missing content later.
 */
export function satisfiesRange(version: string, range: string): boolean {
  if (range === '*') return true;

  const parse = (text: string): [number, number, number] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
    return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
  };

  const actual = parse(version);
  if (actual === null) return false;

  if (range.startsWith('^')) {
    const wanted = parse(range.slice(1));
    if (wanted === null) return false;
    if (actual[0] !== wanted[0]) return false;
    if (actual[1] !== wanted[1]) return actual[1] > wanted[1];
    return actual[2] >= wanted[2];
  }

  const exact = parse(range);
  return (
    exact !== null && exact[0] === actual[0] && exact[1] === actual[1] && exact[2] === actual[2]
  );
}

/**
 * Resolves manifests into a load order.
 *
 * `preOwned` lets already-installed namespaces (core, installed before any
 * discovery runs) participate in collision detection without being re-resolved.
 */
export function resolveSources(
  manifests: readonly SourceManifest[],
  preOwned: ReadonlyMap<string, string> = new Map(),
): Resolution {
  // Everything below iterates this order, which is what makes the result
  // identical on every machine regardless of how the manifests arrived.
  const byId = [...manifests].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const refused = new Map<string, AppError>();
  const refuse = (id: string, message: string, context: Record<string, string | number> = {}) => {
    if (!refused.has(id))
      refused.set(id, appError(ErrorCode.InvalidIntent, message, { source: id, ...context }));
  };

  // --- duplicate ids: the first wins, later claims are refused -------------
  const seen = new Map<string, SourceManifest>();
  for (const manifest of byId) {
    const existing = seen.get(manifest.id);
    if (existing !== undefined) {
      refuse(manifest.id, 'two sources declare the same id');
      continue;
    }
    seen.set(manifest.id, manifest);
  }

  // --- API version --------------------------------------------------------
  for (const manifest of seen.values()) {
    if (!supportsApiVersion(manifest.apiVersion)) {
      refuse(manifest.id, 'source targets an unsupported plugin API version', {
        apiVersion: manifest.apiVersion,
      });
    }
  }

  // --- namespace ownership ------------------------------------------------
  //
  // A contested namespace refuses EVERY claimant, which is what
  // `plugins/manifest.schema.json` states for the `id` field: "a collision is
  // rejected at load, for both sources".
  //
  // The alternative — first claimant wins — needs a rule for who is first, and
  // the resolver only has manifests. Ordering by id would decide whose content
  // survives by alphabet, and ordering by install time would mean a save made
  // today loads differently tomorrow. Neither is a defensible way to tell an
  // author their content vanished, so nobody wins a contested namespace.
  //
  // A namespace already owned before discovery (core) is not a manifest and
  // cannot be refused; only the claimant is.
  const claimants = new Map<string, string[]>();
  for (const manifest of seen.values()) {
    if (refused.has(manifest.id)) continue;
    for (const namespace of manifest.namespaces) {
      claimants.set(namespace, [...(claimants.get(namespace) ?? []), manifest.id]);
    }
  }

  const owners = new Map<string, string>(preOwned);
  for (const [namespace, contenders] of claimants) {
    const established = preOwned.get(namespace);
    if (established !== undefined) {
      for (const id of contenders) {
        refuse(id, 'namespace is already owned', { namespace, owner: established });
      }
      continue;
    }

    if (contenders.length > 1) {
      for (const id of contenders) {
        refuse(id, 'namespace is claimed by more than one source', {
          namespace,
          claimants: contenders.join(', '),
        });
      }
      continue;
    }

    const sole = contenders[0];
    if (sole !== undefined) owners.set(namespace, sole);
  }

  // --- dependencies: missing, unsatisfied, and cascading refusals ---------
  const available = (id: string): SourceManifest | undefined =>
    refused.has(id) ? undefined : seen.get(id);

  // Repeat until stable: refusing a source can strand its dependents.
  let settled = false;
  while (!settled) {
    settled = true;
    for (const manifest of seen.values()) {
      if (refused.has(manifest.id)) continue;

      for (const [dependency, range] of Object.entries(manifest.dependencies)) {
        const target = available(dependency);
        if (target === undefined) {
          refuse(manifest.id, 'required source is missing or was refused', { dependency });
          settled = false;
          break;
        }
        if (!satisfiesRange(target.version, range)) {
          refuse(manifest.id, 'required source does not satisfy the declared range', {
            dependency,
            required: range,
            found: target.version,
          });
          settled = false;
          break;
        }
      }
    }
  }

  // --- topological order, ties by id -------------------------------------
  const loaded: SourceManifest[] = [];
  const placed = new Set<string>();
  const remaining = [...seen.values()].filter((manifest) => !refused.has(manifest.id));

  while (remaining.length > 0) {
    const ready = remaining.filter((manifest) =>
      Object.keys(manifest.dependencies).every((dependency) => placed.has(dependency)),
    );

    if (ready.length === 0) {
      // Nothing can be placed and sources remain: every one of them sits on a
      // cycle, directly or through one. Refuse them all, by name.
      for (const manifest of remaining) {
        refuse(manifest.id, 'dependency cycle');
      }
      break;
    }

    // `ready` preserves `byId` order, so the tie-break is id ascending.
    const next = ready[0];
    if (next === undefined) break;
    loaded.push(next);
    placed.add(next.id);
    remaining.splice(remaining.indexOf(next), 1);
  }

  return {
    loaded,
    refused: [...refused.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([id, error]) => ({ id, error })),
  };
}
