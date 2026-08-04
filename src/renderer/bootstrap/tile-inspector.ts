/**
 * World inspector — the tile provider. Phase-07.8c, ADR-018 §2/§4/§5.
 *
 * WHY THIS LIVES IN `bootstrap` AND NOT IN `devtools`. It needs two things at
 * once: the sim's tile queries, and the render layer's screen→tile picking.
 * `devtools` may not import `render` (CODE_STYLE.md §8.1), and `sim` may not
 * know either exists. Bootstrap may import both, so the wiring belongs here —
 * the same reason the phase-02 render metrics are registered from here rather
 * than inside the metric registry.
 *
 * WHAT IT READS, AND WHY NOT A SNAPSHOT. 07.8a took its counts from published
 * slices wherever a slice existed. Almost nothing here has one: tiles are not
 * projected at all, and the crops slice deliberately carries a resolved sprite
 * key rather than an id, an age, or a stage — projecting those would republish
 * the slice every tick (crops-slice.ts). So this reads the world through the
 * sim's own PURE QUERY functions — `tileStateAt`, `isWalkable`, `enterCost`,
 * `stageFor` — which is the same channel the terrain renderer already uses:
 * `WorldView` is handed the world and reads `world.tiles` to draw it.
 *
 * Read-only, and structurally so: `TileInspectSource` declares the fields it
 * reads and nothing that writes. It answers questions and hands back plain
 * data — never a `Crop`, a `Worker`, or a store a panel could write through
 * (ADR-018 §2).
 */

import { field, type InspectProvider, type InspectSection } from '@devtools/inspector/registry';

import { toIndexUnchecked } from '../../shared/geometry';
import type { TileIndex } from '../../shared/ids';
import { isMature, stageFor, type CropRegistry } from '../../sim/content/crops';
import type { TileKindRegistry } from '../../sim/content/tile-kinds';
import { enterCost, isWalkable } from '../../sim/pathing/astar';
import type { BuildingStore } from '../../sim/world/building';
import { elapsedTicks, type CropStore } from '../../sim/world/crop';
import { getKind, isBlocked, isOwned, type TileGrid } from '../../sim/world/tile-grid';
import { tileStateAt, type TileState } from '../../sim/world/tile-state';
import type { WorkerStore } from '../../sim/world/worker';

/**
 * What the inspector reads. `World` satisfies it structurally, which is the
 * idiom the snapshot projections and `PathContext` already use.
 */
export interface TileInspectSource {
  readonly tiles: TileGrid;
  readonly tileKinds: TileKindRegistry;
  readonly crops: CropStore;
  readonly cropRegistry: CropRegistry;
  readonly workers: WorkerStore;
  readonly buildings: BuildingStore;
  readonly tick: number;
}

/** The crop on a tile. `null` fields mean unknowable, not absent. */
export interface TileCropFacts {
  readonly id: string;
  readonly ageTicks: number;
  /** Null when the crop's definition is missing — uninstalled content. */
  readonly stage: number | null;
  /** Null for the same reason. Maturity of an unknown crop is not derivable. */
  readonly mature: boolean | null;
}

export interface TileFacts {
  readonly x: number;
  readonly y: number;
  /** The flat index the sim addresses this tile by. */
  readonly index: number;
  /** Terrain kind id, or null if the kind index resolves to nothing. */
  readonly kind: string | null;
  readonly state: TileState;
  readonly owned: boolean;
  readonly walkable: boolean;
  /** A building sits here. Distinct from unwalkable terrain. */
  readonly blocked: boolean;
  /** Ticks to enter — the A* edge weight, not a distance. */
  readonly enterTicks: number;
  readonly crop: TileCropFacts | null;
  readonly occupants: readonly string[];
}

/** Read, and found to be absent. Distinct from `Unavailable`, which is a failed read. */
const NONE = 'none';

/** Everything true of one tile right now, or null if the tile is off the grid. */
export function readTileFacts(source: TileInspectSource, x: number, y: number): TileFacts | null {
  if (x < 0 || y < 0 || x >= source.tiles.width || y >= source.tiles.height) return null;

  const index = toIndexUnchecked(x, y);
  const path = { tiles: source.tiles, tileKinds: source.tileKinds };
  const kind = source.tileKinds.byIndex(getKind(source.tiles, index));

  return {
    x,
    y,
    index,
    kind: kind?.id ?? null,
    state: tileStateAt(
      {
        grid: source.tiles,
        crops: source.crops,
        cropRegistry: source.cropRegistry,
        tick: source.tick,
      },
      index,
    ),
    owned: isOwned(source.tiles, index),
    walkable: isWalkable(path, index),
    blocked: isBlocked(source.tiles, index),
    enterTicks: enterCost(path, index),
    crop: readCrop(source, index),
    occupants: readOccupants(source, index),
  };
}

function readCrop(source: TileInspectSource, index: TileIndex): TileCropFacts | null {
  const crop = source.crops.get(index);
  if (crop === undefined) return null;

  const ageTicks = elapsedTicks(crop, source.tick);
  const definition = source.cropRegistry.get(crop.cropId);

  // Content that has vanished — an uninstalled plugin — keeps its instance
  // (SAVE_FORMAT.md §5.3 quarantines rather than deletes). The id is real and
  // is reported; the stage depends on a definition that is gone, so it is not
  // guessed at.
  if (!definition.ok) return { id: crop.cropId, ageTicks, stage: null, mature: null };

  return {
    id: crop.cropId,
    ageTicks,
    stage: stageFor(definition.value, ageTicks),
    mature: isMature(definition.value, ageTicks),
  };
}

/** Who is standing here. Names only — never the worker or the building itself. */
function readOccupants(source: TileInspectSource, index: TileIndex): readonly string[] {
  const occupants: string[] = [];

  for (const worker of source.workers.values()) {
    if (worker.position === index) occupants.push(`worker #${String(worker.id)}`);
  }
  for (const building of source.buildings.values()) {
    if (building.tile === index) {
      occupants.push(`${building.buildingId} #${String(building.id)}`);
    }
  }

  return occupants;
}

/** Renders the facts as inspector fields. Every value is a string by here. */
export function describeTile(facts: TileFacts): InspectSection {
  return {
    title: `Tile ${String(facts.x)},${String(facts.y)}`,
    fields: [
      field('Index', () => facts.index),
      field('Kind', () => facts.kind),
      field('State', () => facts.state),
      field('Owned', () => facts.owned),
      // Blocked is called out rather than folded into "no": unwalkable terrain
      // and a building on walkable ground are different problems to debug.
      field('Walkable', () => {
        if (facts.blocked) return 'no · blocked';
        return facts.walkable ? 'yes' : 'no';
      }),
      field(
        'Enter cost',
        () => `${String(facts.enterTicks)} ${facts.enterTicks === 1 ? 'tick' : 'ticks'}`,
      ),
      field('Crop', () => facts.crop?.id ?? NONE),
      field('Stage', () => {
        const crop = facts.crop;
        if (crop === null) return NONE;
        if (crop.stage === null) return null; // reads as Unavailable
        return crop.mature === true ? `${String(crop.stage)} · mature` : String(crop.stage);
      }),
      field('Age', () => (facts.crop === null ? NONE : `${String(facts.crop.ageTicks)} ticks`)),
      field('Occupants', () => (facts.occupants.length === 0 ? NONE : facts.occupants.join(', '))),
    ],
  };
}

export interface TileInspectOptions {
  readonly source: () => TileInspectSource;
  /**
   * Screen → tile, from the live view.
   *
   * Null when the pointer is off the world — which is also how an UNMOUNTED
   * scene reports itself, since collapsed mode destroys the view (ADR-003 §4)
   * and there is then nothing under the pointer to name.
   */
  readonly tileAt: (screenX: number, screenY: number) => { x: number; y: number } | null;
}

/** The provider the inspector registry calls for whatever is under the pointer. */
export function createTileInspectProvider(options: TileInspectOptions): InspectProvider {
  return {
    id: 'world.tile',
    order: 0,
    inspect: (target) => {
      const tile = options.tileAt(target.x, target.y);
      if (tile === null) return null;

      const facts = readTileFacts(options.source(), tile.x, tile.y);
      return facts === null ? null : describeTile(facts);
    },
  };
}
