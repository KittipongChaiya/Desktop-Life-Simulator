/**
 * The public plugin API. Phase-08b — ADR-019.
 *
 * THIS FILE IS THE PUBLIC SURFACE. Nothing outside `PLUGIN_API.md` is public,
 * however reachable it happens to be (ADR-019 §Ongoing), and `plugins/core/`
 * uses this and nothing else — a first-party shortcut is the failure this
 * architecture exists to prevent, and it will look reasonable when it is
 * proposed (ADR-019 §Alternatives D).
 *
 * ## Why the version is not the game's
 *
 * A source targets `PLUGIN_API_VERSION`, never a game version, because engine
 * releases move for reasons no source can observe (ADR-019 §1). Pinning to the
 * engine manufactures breakage on every patch release and makes the
 * compatibility question unanswerable in the one place it matters — a player
 * looking at a plugin page.
 *
 * ## Why only `registerContent` exists at v1
 *
 * ADR-019 §3 specifies the full capability surface so its SHAPE never has to
 * change, and declares it in versions so nothing speculative ships. v1's
 * declared set is content, assets, audio, localization, configuration, effects,
 * and declarative behaviours — but §Ongoing binds harder than the table:
 *
 * > **No capability ships that `plugins/core/` has not exercised.**
 *
 * At phase-08 the only thing core has to register is content. `registerAudio`
 * arrives with ADR-023's sound registry in phase-13, `registerAssets` when
 * assets are source-supplied, and so on — each with its first consumer. A
 * capability with no caller is a stub, and `AI_RULES.md` §1.6 forbids exactly
 * that: shipping it now would mean six methods nobody has ever called being
 * declared "the v1 surface" a third party is invited to depend on.
 */

import { appError, ErrorCode } from '../../shared/errors';
import { isContentId, splitContentId, type ContentId } from '../../shared/ids';
import { err, ok, type Result } from '../../shared/result';

import type { BuildingDefinition, BuildingRegistry } from './buildings';
import type { CropDefinition, CropRegistry } from './crops';
import type { ItemDefinition, ItemRegistry } from './items';
import type { PhaseTintDefinition, PhaseTintRegistry } from './lighting';
import type { SeasonDefinition, SeasonRegistry } from './seasons';
import type { ContentSource } from './sources';
import type { TileKindDefinition, TileKindRegistry } from './tile-kinds';

/**
 * The API version a source targets.
 *
 * The engine supports every version it has ever shipped; withdrawing one needs
 * a successor ADR, exactly as dropping a migration link does.
 */
export const PLUGIN_API_VERSION = 1;

/** The registries a source's content lands in. Supplied by the world. */
export interface ContentTargets {
  readonly crops: CropRegistry;
  readonly items: ItemRegistry;
  readonly buildings: BuildingRegistry;
  readonly tileKinds: TileKindRegistry;
  readonly phaseTints: PhaseTintRegistry;
  readonly seasons: SeasonRegistry;
}

/**
 * One declarative content bundle.
 *
 * Every field is optional because a source registers what it has — a crop pack
 * declares crops and items and no buildings, and that is not an error.
 */
export interface ContentBundle {
  readonly crops?: readonly CropDefinition[];
  readonly items?: readonly ItemDefinition[];
  readonly buildings?: readonly BuildingDefinition[];
  readonly tileKinds?: readonly TileKindDefinition[];
  /** Phase → tint, for the lighting layer. Presentation only (ADR-020 §4). */
  readonly phaseTints?: readonly PhaseTintDefinition[];
  /**
   * The year's seasons, in the order they occur (ADR-021 §1).
   *
   * Order is significant: it IS the year. Appending is safe; reordering gives
   * every new world a different year to every world made before it.
   */
  readonly seasons?: readonly SeasonDefinition[];
}

export interface PluginApi {
  /** The version this API implements. A source declares what it targets. */
  readonly apiVersion: number;
  /** The source this API is bound to. It cannot register as anyone else. */
  readonly source: ContentSource;
  /**
   * Registers declarative content.
   *
   * All-or-nothing: the whole bundle is checked before anything is written, so
   * a rejected bundle leaves the registries exactly as they were. A source that
   * registered three of its four crops is a source whose save references
   * definitions that do not exist.
   */
  registerContent(bundle: ContentBundle): Result<void>;
}

interface BundleEntry {
  readonly id: ContentId;
  /** Which registry it lands in. A crop and an item may share an id --
   * `core:wheat` is both the crop you plant and the thing it yields -- so
   * uniqueness is per registry, never across the bundle. */
  readonly kind: string;
  /** Whether that registry already holds this id. */
  readonly taken: () => boolean;
  readonly register: () => Result<unknown>;
}

/**
 * Every definition in a bundle, paired with the registry it belongs to.
 *
 * Tile kinds come first and the order within each kind is the author's. That
 * ordering is on-disk data: the grid stores a kind's registry INDEX as one byte
 * per tile (ADR-004 §2), so a source whose kinds registered in a different
 * order on a later load would decode a saved farm to different terrain.
 */
function entriesOf(bundle: ContentBundle, targets: ContentTargets): BundleEntry[] {
  const of = <T extends { id: ContentId }>(
    kind: string,
    definitions: readonly T[] | undefined,
    registry: { has(id: ContentId): boolean; register(definition: T): Result<unknown> },
  ): BundleEntry[] =>
    (definitions ?? []).map((definition) => ({
      id: definition.id,
      kind,
      taken: () => registry.has(definition.id),
      register: () => registry.register(definition),
    }));

  return [
    ...of('tileKind', bundle.tileKinds, targets.tileKinds),
    ...of('crop', bundle.crops, targets.crops),
    ...of('item', bundle.items, targets.items),
    ...of('building', bundle.buildings, targets.buildings),
    ...of('phaseTint', bundle.phaseTints, targets.phaseTints),
    ...of('season', bundle.seasons, targets.seasons),
  ];
}

/**
 * Binds the API to one source and one world's registries.
 *
 * The source is captured rather than passed per call, which is what makes
 * "a source may only register content in namespaces it owns" enforceable at all
 * — there is no argument a caller could supply to claim someone else's.
 */
export function createPluginApi(source: ContentSource, targets: ContentTargets): PluginApi {
  const owns = new Set(source.namespaces);

  return {
    apiVersion: PLUGIN_API_VERSION,
    source,

    registerContent(bundle) {
      const entries = entriesOf(bundle, targets);
      const seen = new Set<string>();

      // Ownership first, across the whole bundle, before anything registers.
      for (const entry of entries) {
        if (!isContentId(entry.id)) {
          return err(
            appError(ErrorCode.InvalidIntent, 'malformed content id', {
              source: source.id,
              id: entry.id,
              expected: 'namespace:name',
            }),
          );
        }

        const { namespace } = splitContentId(entry.id);
        if (!owns.has(namespace)) {
          return err(
            appError(ErrorCode.InvalidIntent, 'source does not own this namespace', {
              source: source.id,
              id: entry.id,
              namespace,
            }),
          );
        }

        // Duplicates are checked here rather than left to `register`, so the
        // loop below cannot fail partway and leave half a bundle installed.
        const key = `${entry.kind}:${entry.id}`;
        if (entry.taken() || seen.has(key)) {
          return err(
            appError(ErrorCode.DuplicateContent, 'content is already registered', {
              source: source.id,
              id: entry.id,
            }),
          );
        }
        seen.add(key);
      }

      for (const entry of entries) {
        const result = entry.register();
        // Unreachable: ownership and duplication are settled above. Handled
        // over asserted (`CODE_STYLE.md` §1.2) — and if it ever fires, the
        // bundle really is partly registered and the message should say so.
        if (!result.ok) return err(result.error);
      }

      return ok();
    },
  };
}
