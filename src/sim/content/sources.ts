/**
 * Content sources and namespace ownership. Phase-08a — ADR-026.
 *
 * Built-in content, official packs, third-party plugins, generated packs, and
 * DLC are **one kind of thing**: a content source. One manifest, one API, one
 * set of rules. `plugins/core/` is the first source registered here and is not
 * privileged for being first (ADR-019 §2).
 *
 * ## The two rules this module enforces
 *
 * **A namespace is owned by exactly one source, permanently.** Two sources
 * claiming one namespace is a load failure, never a merge — a merge would mean
 * two authors' definitions sharing an ID space, and the loser's saved entities
 * silently resolving to the winner's definitions.
 *
 * **Provenance is recorded and never branched on.** It exists for three things
 * and no others: telling a player what is missing in words they recognise,
 * deciding trust at load time, and support diagnostics. No simulation system,
 * command, registry lookup, or save-format rule may read it (ADR-026 §2). A
 * system asking "is this core content?" is `ARCHITECTURE.md` §3.4's forbidden
 * `switch (cropId)` wearing a different disguise — and it is what would make
 * "official and third-party share one extension model" a slogan rather than a
 * fact. That is why `provenance` is on the source and not on a definition:
 * content carries no mark of who shipped it.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isReservedNamespace } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';

/**
 * What kind of thing a source is.
 *
 * A new kind is a new member and a new display string — **never a new isolation
 * rule** (ADR-026 §Ongoing).
 */
export const Provenance = {
  /** Ships with the engine. `plugins/core/` only. */
  Builtin: 'builtin',
  /** First-party content shipped separately from the engine. */
  Official: 'official',
  ThirdParty: 'thirdParty',
  Generated: 'generated',
  Dlc: 'dlc',
} as const;

export type Provenance = (typeof Provenance)[keyof typeof Provenance];

export interface ContentSource {
  /** Stable identifier for the source itself. Permanent, like a content ID. */
  readonly id: string;
  /** The namespaces it owns. At least one; owned exclusively and forever. */
  readonly namespaces: readonly string[];
  readonly provenance: Provenance;
  /** What the player is told when this source is missing. */
  readonly displayName: string;
  /** The source's own version, independent of the engine's (ADR-019 §1). */
  readonly version: string;
}

export interface SourceRegistry {
  /**
   * Claims every namespace the source owns, or claims none of them.
   *
   * All-or-nothing on purpose: a partially registered source owns some of its
   * IDs and not others, which is a state no later code can reason about, and
   * ADR-026 §Validation requires that a collision leave *neither* source
   * partially registered.
   */
  register(source: ContentSource): Result<void>;
  /** The source owning a namespace, or undefined if nobody has claimed it. */
  ownerOf(namespace: string): ContentSource | undefined;
  /** Every registered source, in registration order. */
  all(): readonly ContentSource[];
  get(id: string): ContentSource | undefined;
  readonly size: number;
}

const NAMESPACE_PATTERN = /^[a-z0-9_]+$/;

export function createSourceRegistry(): SourceRegistry {
  const byId = new Map<string, ContentSource>();
  const owners = new Map<string, ContentSource>();
  const order: ContentSource[] = [];

  const validate = (source: ContentSource): Result<void> => {
    if (source.id.length === 0) {
      return err(appError(ErrorCode.InvalidIntent, 'content source has no id'));
    }
    if (byId.has(source.id)) {
      return err(
        appError(ErrorCode.DuplicateContent, 'content source is already registered', {
          source: source.id,
        }),
      );
    }
    if (source.namespaces.length === 0) {
      return err(
        appError(ErrorCode.InvalidIntent, 'content source owns no namespace', {
          source: source.id,
        }),
      );
    }

    for (const namespace of source.namespaces) {
      if (!NAMESPACE_PATTERN.test(namespace)) {
        return err(
          appError(ErrorCode.InvalidIntent, 'malformed namespace', {
            source: source.id,
            namespace,
            expected: 'lowercase alphanumeric or underscore',
          }),
        );
      }

      // Reserved names are first-party ground. Trust is decided here, at load,
      // and nowhere downstream (ADR-026 §2).
      if (isReservedNamespace(namespace) && source.provenance === Provenance.ThirdParty) {
        return err(
          appError(ErrorCode.InvalidIntent, 'namespace is reserved for first-party content', {
            source: source.id,
            namespace,
          }),
        );
      }

      const owner = owners.get(namespace);
      if (owner !== undefined) {
        return err(
          appError(ErrorCode.DuplicateContent, 'namespace is already owned', {
            namespace,
            owner: owner.id,
            claimant: source.id,
          }),
        );
      }
    }

    return ok();
  };

  return {
    register(source) {
      // Validated in full BEFORE anything is written, so a rejected claim
      // leaves the registry exactly as it was.
      const validation = validate(source);
      if (!validation.ok) return validation;

      byId.set(source.id, source);
      for (const namespace of source.namespaces) owners.set(namespace, source);
      order.push(source);
      return ok();
    },

    ownerOf: (namespace) => owners.get(namespace),
    all: () => order,
    get: (id) => byId.get(id),

    get size() {
      return order.length;
    },
  };
}
