/**
 * Generic content registry. ADR-004 §5.
 *
 * Content DEFINITIONS (a kind of thing) are separate from INSTANCES (a specific
 * one). Definitions register here at startup; instances store only a
 * `ContentId` and look the definition up. That split is what lets a plugin add
 * content with no core change, and what makes rebalancing a data edit rather
 * than a save migration.
 *
 * Built in phase-02 because tile kinds are the first real content. Phase-03
 * registers crops, items, and buildings through this same primitive.
 *
 * Systems must NEVER hardcode content — no `switch (id)` anywhere. A system
 * asks the registry and acts on the definition's data (ARCHITECTURE.md §3.4).
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isContentId, type ContentId } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';

/** Every definition carries its own identity. */
export interface ContentDefinition {
  readonly id: ContentId;
}

export interface ContentRegistry<T extends ContentDefinition> {
  /** Registers a definition. Rejects duplicates and malformed IDs. */
  register(definition: T): Result<void>;
  /** Looks a definition up. Returns an error, never `undefined`. */
  get(id: ContentId): Result<T>;
  /** True if the ID is registered. */
  has(id: ContentId): boolean;
  /** Every definition, in registration order. */
  all(): readonly T[];
  /**
   * Dense numeric index for a registered ID.
   *
   * The tile grid stores kinds as `Uint8Array` values, so it needs a compact
   * integer per kind rather than a string (ADR-004 §2).
   */
  indexOf(id: ContentId): number;
  /** Reverse of `indexOf`. */
  byIndex(index: number): T | undefined;
  readonly size: number;
}

export function createContentRegistry<T extends ContentDefinition>(
  kind: string,
): ContentRegistry<T> {
  const byId = new Map<ContentId, T>();
  const order: T[] = [];
  const indices = new Map<ContentId, number>();

  return {
    register(definition) {
      if (!isContentId(definition.id)) {
        return err(
          appError(ErrorCode.InvalidIntent, `malformed ${kind} id`, {
            id: definition.id,
            expected: 'namespace:name',
          }),
        );
      }
      if (byId.has(definition.id)) {
        return err(
          appError(ErrorCode.DuplicateContent, `duplicate ${kind}`, { id: definition.id }),
        );
      }

      indices.set(definition.id, order.length);
      order.push(definition);
      byId.set(definition.id, definition);
      return ok();
    },

    get(id) {
      const definition = byId.get(id);
      if (definition === undefined) {
        return err(appError(ErrorCode.UnknownContent, `unknown ${kind}`, { id }));
      }
      return ok(definition);
    },

    has: (id) => byId.has(id),
    all: () => order,
    indexOf: (id) => indices.get(id) ?? -1,
    byIndex: (index) => order[index],

    get size() {
      return order.length;
    },
  };
}
