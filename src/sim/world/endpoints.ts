/**
 * Route endpoints — which container a building offers to logistics.
 * Phase-26, ADR-036.
 *
 * THIS IS THE SEAM THAT KEEPS FACTORIES ENDPOINTS. Logistics knows two
 * questions — "what can I take from this building" and "what can I give it" —
 * and nothing at all about factories, recipes or crafting. A future wagon,
 * chest or market building answers the same two questions and needs no change
 * here beyond its own case.
 *
 * The asymmetry is the whole content of the module:
 *
 * | Building        | Take from        | Give to          |
 * | --------------- | ---------------- | ---------------- |
 * | factory         | its **output**   | its **input**    |
 * | storing         | its storage      | its storage      |
 * | anything else   | —                | —                |
 *
 * A factory's two containers exist precisely so this asymmetry is expressible
 * (ADR-035 §2). With one container a hauler would take back the flour it just
 * delivered, which is the shape of an infinite loop rather than a chain.
 */

import type { BuildingId } from '../../shared/ids';

import type { Container } from './container';
import type { FactoryStore } from './factory';

/** What endpoint resolution reads. `World` satisfies this structurally. */
export interface EndpointSource {
  readonly buildingStorage: Map<BuildingId, Container>;
  readonly factories: FactoryStore;
}

/**
 * The container goods may be TAKEN FROM at this building, or null.
 *
 * A factory offers its output — never its input. Taking from a factory's input
 * would let one route undo another's delivery, and two routes pointed at each
 * other would shuttle the same stack forever.
 */
export function takeFrom(source: EndpointSource, building: BuildingId): Container | null {
  const factory = source.factories.get(building);
  if (factory !== undefined) return factory.output;
  return source.buildingStorage.get(building) ?? null;
}

/**
 * The container goods may be GIVEN TO at this building, or null.
 *
 * A factory accepts into its input — never its output. Delivering into an
 * output would fabricate product the recipe never made.
 */
export function giveTo(source: EndpointSource, building: BuildingId): Container | null {
  const factory = source.factories.get(building);
  if (factory !== undefined) return factory.input;
  return source.buildingStorage.get(building) ?? null;
}
