/**
 * Branded identifier types.
 *
 * Branding makes passing a `WorkerId` where a `TileIndex` is expected a compile
 * error. This class of bug is otherwise invisible and very common in entity
 * systems. Brands are erased at runtime — these are plain numbers and strings.
 * CODE_STYLE.md §1.4.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Index into the flat tile grid: `y * WORLD_WIDTH + x`. */
export type TileIndex = Brand<number, 'TileIndex'>;

/** Generic entity identifier. */
export type EntityId = Brand<number, 'EntityId'>;

export type WorkerId = Brand<number, 'WorkerId'>;
export type BuildingId = Brand<number, 'BuildingId'>;

/**
 * A namespaced content identifier, e.g. `core:wheat`.
 *
 * Permanent once shipped — display names may change, IDs may not.
 * AI_RULES.md §1.4.
 */
export type ContentId = Brand<string, 'ContentId'>;

const CONTENT_ID_PATTERN = /^[a-z0-9_]+:[a-z0-9_]+$/;

/** Returns true if `value` is a well-formed `namespace:name` identifier. */
export function isContentId(value: string): value is ContentId {
  return CONTENT_ID_PATTERN.test(value);
}

/** Splits a content ID into its namespace and name. */
export function splitContentId(id: ContentId): { namespace: string; name: string } {
  const separator = id.indexOf(':');
  return { namespace: id.slice(0, separator), name: id.slice(separator + 1) };
}

/** Unchecked casts. Use only where the value's shape is already guaranteed. */
export const asTileIndex = (value: number): TileIndex => value as TileIndex;
export const asWorkerId = (value: number): WorkerId => value as WorkerId;
export const asBuildingId = (value: number): BuildingId => value as BuildingId;
