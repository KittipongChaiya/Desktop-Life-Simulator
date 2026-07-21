/**
 * Crop activity counters — the consumer for `cropPlanted` / `cropHarvested`.
 *
 * ADR-008 requires every event to have an immediate producer AND consumer.
 * The commands publish; this consumes. It exists as a real subscriber rather
 * than a derived count because the counts are CUMULATIVE — how many crops have
 * ever been harvested cannot be recomputed from the current crop map, so it is
 * genuine state that only the event stream can maintain.
 *
 * Deliberately not inventory, economy, or yields: those are phases 05-06.
 * This counts occurrences and nothing else.
 */

import type { EventBus } from '../events/bus';

export interface CropStats {
  planted: number;
  harvested: number;
  /** Tick of the most recent crop event, or 0. */
  lastActivityTick: number;
}

export function createCropStats(): CropStats {
  return { planted: 0, harvested: 0, lastActivityTick: 0 };
}

/**
 * Subscribes the counters to the bus. Returns teardown.
 *
 * Called once at world creation. Handlers run during `eventFlush`, after every
 * system has finished mutating (ADR-008 §1).
 */
export function attachCropStats(bus: EventBus, stats: CropStats, tickOf: () => number): () => void {
  const offPlanted = bus.subscribe('cropPlanted', () => {
    stats.planted += 1;
    stats.lastActivityTick = tickOf();
  });

  const offHarvested = bus.subscribe('cropHarvested', () => {
    stats.harvested += 1;
    stats.lastActivityTick = tickOf();
  });

  return () => {
    offPlanted();
    offHarvested();
  };
}
