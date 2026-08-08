/**
 * Parsing declared content files. Phase-09e — ADR-019 §4.
 *
 * A definition file is **data**: the loader parses and validates it and never
 * evaluates it (ADR-019 §4). That is what makes determinism structural rather
 * than promised — a declaration cannot call a clock or a generator — and it is
 * why this module is a validator and not an interpreter.
 *
 * The file's shape is a `ContentBundle` in JSON, so what an author writes maps
 * one-to-one onto the `registerContent` call it becomes:
 *
 * ```json
 * { "crops": [ … ], "items": [ … ] }
 * ```
 *
 * ## Every rejection names the field
 *
 * The author is reading a stack-traceless error in a game's log, possibly
 * relayed by a player. `crops[2].growthTicks must be a positive integer` is
 * actionable; `invalid definition file` is a support ticket. That is the whole
 * reason this is hand-written validation rather than a cast.
 *
 * ## Only crops and items, deliberately
 *
 * ADR-019 §3 lists eight content kinds for `registerContent`. Two are
 * implemented here because two are what a source can currently express:
 * buildings and tile kinds carry engine-side consequences — walkability,
 * storage capacity, the dense kind index that is a byte in every save — and
 * admitting them as plain data needs decisions this phase has not made. An
 * unknown key is REFUSED rather than ignored, so an author who writes
 * `"buildings"` is told it is not supported instead of watching it vanish
 * (`AI_RULES.md` §1.6 applied to a data format).
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isContentId, type ContentId } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';

import type { CropDefinition } from './crops';
import type { ItemDefinition } from './items';
import type { ContentBundle } from './plugin-api';

/** Content kinds a v1 definition file may declare. */
const SUPPORTED_KEYS = new Set(['crops', 'items']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fail = (where: string, wanted: string) =>
  err(appError(ErrorCode.InvalidIntent, `${where} must be ${wanted}`, { field: where }));

const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function requireStringArray(value: unknown, where: string): Result<readonly string[]> {
  if (!Array.isArray(value)) return fail(where, 'an array of strings');
  for (const [i, entry] of value.entries()) {
    if (typeof entry !== 'string') return fail(`${where}[${i}]`, 'a string');
  }
  return ok(value as readonly string[]);
}

function parseItem(value: unknown, where: string): Result<ItemDefinition> {
  if (!isRecord(value)) return fail(where, 'an object');

  const id = value['id'];
  if (typeof id !== 'string' || !isContentId(id)) return fail(`${where}.id`, 'a namespace:name id');

  const displayName = value['displayName'];
  if (typeof displayName !== 'string' || displayName.length === 0) {
    return fail(`${where}.displayName`, 'a non-empty string');
  }

  const sprite = value['sprite'];
  if (typeof sprite !== 'string' || sprite.length === 0) {
    return fail(`${where}.sprite`, 'a non-empty string');
  }

  if (!isNonNegative(value['basePrice'])) return fail(`${where}.basePrice`, 'a number >= 0');
  if (!isPositiveInt(value['stackSize'])) return fail(`${where}.stackSize`, 'a positive integer');

  return ok({
    id: id,
    displayName,
    sprite,
    basePrice: value['basePrice'],
    stackSize: value['stackSize'],
  });
}

function parseCrop(value: unknown, where: string): Result<CropDefinition> {
  if (!isRecord(value)) return fail(where, 'an object');

  const id = value['id'];
  if (typeof id !== 'string' || !isContentId(id)) return fail(`${where}.id`, 'a namespace:name id');

  const displayName = value['displayName'];
  if (typeof displayName !== 'string' || displayName.length === 0) {
    return fail(`${where}.displayName`, 'a non-empty string');
  }

  // Ticks, never seconds (ADR-007 §7): converting at runtime introduces
  // floating-point drift, and drift in a growth time breaks determinism.
  if (!isPositiveInt(value['growthTicks'])) {
    return fail(`${where}.growthTicks`, 'a positive integer of ticks');
  }

  const seedItem = value['seedItem'];
  if (typeof seedItem !== 'string' || !isContentId(seedItem)) {
    return fail(`${where}.seedItem`, 'a namespace:name id');
  }

  if (!isNonNegative(value['seedCost'])) return fail(`${where}.seedCost`, 'a number >= 0');

  const stageSprites = requireStringArray(value['stageSprites'], `${where}.stageSprites`);
  if (!stageSprites.ok) return stageSprites;

  const seasons = requireStringArray(value['seasons'] ?? [], `${where}.seasons`);
  if (!seasons.ok) return seasons;

  const tags = requireStringArray(value['tags'] ?? [], `${where}.tags`);
  if (!tags.ok) return tags;

  const rawYield = value['harvestYield'];
  if (!Array.isArray(rawYield) || rawYield.length === 0) {
    return fail(`${where}.harvestYield`, 'a non-empty array');
  }

  const harvestYield: { item: ContentId; quantity: number }[] = [];
  for (const [i, entry] of rawYield.entries()) {
    const at = `${where}.harvestYield[${i}]`;
    if (!isRecord(entry)) return fail(at, 'an object');

    const item = entry['item'];
    if (typeof item !== 'string' || !isContentId(item)) {
      return fail(`${at}.item`, 'a namespace:name id');
    }
    // Quantities are integers, never fractional (ADR-011 §1).
    if (!isPositiveInt(entry['quantity'])) return fail(`${at}.quantity`, 'a positive integer');

    harvestYield.push({ item: item, quantity: entry['quantity'] });
  }

  return ok({
    id: id,
    displayName,
    growthTicks: value['growthTicks'],
    stageSprites: stageSprites.value,
    harvestYield,
    seedItem: seedItem,
    seedCost: value['seedCost'],
    seasons: seasons.value,
    tags: tags.value,
  });
}

/**
 * Validates one definition file into a bundle ready for `registerContent`.
 *
 * `where` names the file in every error, because an author with three
 * definition files needs to know which one to open.
 */
export function parseDefinitionFile(value: unknown, where: string): Result<ContentBundle> {
  if (!isRecord(value)) return fail(where, 'an object');

  for (const key of Object.keys(value)) {
    if (!SUPPORTED_KEYS.has(key)) {
      return err(
        appError(ErrorCode.InvalidIntent, `${where}: "${key}" is not a supported content kind`, {
          file: where,
          key,
          supported: [...SUPPORTED_KEYS].join(', '),
        }),
      );
    }
  }

  const crops: CropDefinition[] = [];
  const rawCrops = value['crops'];
  if (rawCrops !== undefined) {
    if (!Array.isArray(rawCrops)) return fail(`${where}.crops`, 'an array');
    for (const [i, entry] of rawCrops.entries()) {
      const parsed = parseCrop(entry, `${where}.crops[${i}]`);
      if (!parsed.ok) return parsed;
      crops.push(parsed.value);
    }
  }

  const items: ItemDefinition[] = [];
  const rawItems = value['items'];
  if (rawItems !== undefined) {
    if (!Array.isArray(rawItems)) return fail(`${where}.items`, 'an array');
    for (const [i, entry] of rawItems.entries()) {
      const parsed = parseItem(entry, `${where}.items[${i}]`);
      if (!parsed.ok) return parsed;
      items.push(parsed.value);
    }
  }

  return ok({ crops, items });
}

/** Merges several parsed files into the one bundle a source registers. */
export function mergeBundles(bundles: readonly ContentBundle[]): ContentBundle {
  return {
    crops: bundles.flatMap((bundle) => bundle.crops ?? []),
    items: bundles.flatMap((bundle) => bundle.items ?? []),
  };
}
