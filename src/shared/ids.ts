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

/**
 * Namespaces no third-party source may claim. Phase-08a — ADR-026 §1.
 *
 * A namespace belongs to exactly one content source, permanently, and a claim
 * collision is a load failure rather than a merge. These are held back so a
 * third party cannot occupy the name a future first-party pack needs — and once
 * one is occupied there is no taking it back, because transferring a namespace
 * would orphan every save written before the transfer (ADR-026 §5).
 *
 * The list lives here, beside the validator, for the reason ADR-026 §1 gives:
 * **a reservation nobody can check is not a reservation.**
 *
 * Deliberately short. Reserving names speculatively is the same mistake as
 * building machinery for imagined needs (`AI_RULES.md` §1.5) — and every entry
 * costs a third-party author a name they might reasonably want.
 */
export const RESERVED_NAMESPACES: readonly string[] = [
  // Built-in content. Reserved forever (ADR-026 §1).
  'core',
  // Official packs and DLC, whatever they end up being called.
  'official',
  'dls',
  // Names that would let a source pass itself off as the engine.
  'engine',
  'system',
];

const RESERVED = new Set(RESERVED_NAMESPACES);

/** True if `namespace` is held for first-party use. */
export function isReservedNamespace(namespace: string): boolean {
  return RESERVED.has(namespace);
}

/** Unchecked casts. Use only where the value's shape is already guaranteed. */
/**
 * Asserts a string is a well-formed content ID.
 *
 * Throws rather than returning a Result: content IDs are authored as literals
 * in source, so a malformed one is a programming error caught at startup, not a
 * runtime condition to handle.
 */
export function asContentId(value: string): ContentId {
  if (!isContentId(value)) {
    throw new Error(`malformed content id "${value}" — expected namespace:name`);
  }
  return value;
}

export const asTileIndex = (value: number): TileIndex => value as TileIndex;
export const asWorkerId = (value: number): WorkerId => value as WorkerId;
export const asBuildingId = (value: number): BuildingId => value as BuildingId;
