/**
 * Metric registry. Phase-01.5 deliverable 1.
 *
 * The debug overlay renders whatever is REGISTERED — it has no hardcoded list.
 * Phase-02 registers camera position, loaded chunks, visible tiles, and dirty
 * regions from the render layer; phase-04 registers entity counts. Neither
 * touches the overlay.
 *
 * This is why 1.5's requested-but-unbuildable metrics are absent rather than
 * stubbed: a metric that does not exist yet simply is not registered, so the
 * overlay shows only true information. An "Unavailable" row would be a
 * placeholder (AI_RULES.md §1.6) that never gets cleaned up.
 *
 * Providers are pull-based and read ONLY when the overlay is visible, which is
 * what keeps the hidden overlay's cost at zero.
 *
 * Phase-07.8b hardened that convention into ADR-018 §9's stated contract:
 * sampling reads a snapshot of the registration set, hands back frozen values
 * no panel can write through, and cannot be left half-registered by a batch
 * that fails. Observation must not perturb the observed, in either direction.
 */

export const MetricGroup = {
  Performance: 'Performance',
  Simulation: 'Simulation',
  World: 'World',
  Render: 'Render',
  Input: 'Input',
} as const;

export type MetricGroup = (typeof MetricGroup)[keyof typeof MetricGroup];

export interface MetricDefinition {
  /** Stable key, unique across the registry. */
  readonly id: string;
  readonly label: string;
  readonly group: MetricGroup;
  /**
   * Reads the current value. Called at most once per overlay repaint, and never
   * while the overlay is hidden — so a provider may do modest work.
   */
  read(): string;
  /** Lower sorts first within a group. */
  readonly order?: number;
}

export interface MetricSample {
  readonly id: string;
  readonly label: string;
  readonly group: MetricGroup;
  readonly value: string;
}

export interface MetricRegistry {
  /** Registers a metric. Returns an unregister function. */
  register(definition: MetricDefinition): () => void;
  /** Registers several at once. Returns a single unregister for all of them. */
  registerAll(definitions: readonly MetricDefinition[]): () => void;
  /** Reads every metric, grouped and ordered for display. */
  sample(): readonly MetricSample[];
  has(id: string): boolean;
  size(): number;
}

/**
 * Display rank per group.
 *
 * A total `Record`, not a list to search: adding a group to `MetricGroup`
 * without ranking it here is a COMPILE error. The list this replaced was
 * searched with `indexOf`, so an unranked group scored -1 and silently sorted
 * ahead of Performance — a wrong overlay that nothing would have failed on.
 */
const GROUP_RANK: Record<MetricGroup, number> = {
  [MetricGroup.Performance]: 0,
  [MetricGroup.Simulation]: 1,
  [MetricGroup.Render]: 2,
  [MetricGroup.World]: 3,
  [MetricGroup.Input]: 4,
};

/** Group, then explicit order, then label. Reads only the definition given. */
function byDisplayOrder(a: MetricDefinition, b: MetricDefinition): number {
  const groupDelta = GROUP_RANK[a.group] - GROUP_RANK[b.group];
  if (groupDelta !== 0) return groupDelta;

  const orderDelta = (a.order ?? 0) - (b.order ?? 0);
  return orderDelta !== 0 ? orderDelta : a.label.localeCompare(b.label);
}

function sampleOf(definition: MetricDefinition): MetricSample {
  let value: string;
  try {
    value = definition.read();
  } catch (error) {
    // A broken provider must never take down the overlay — the overlay is
    // frequently the only way to see what is wrong.
    value = error instanceof Error ? `<error: ${error.message}>` : '<error>';
  }

  // Frozen because ADR-018 §9 says a metric may not be something a panel can
  // write through, and `readonly` says that to the compiler only.
  return Object.freeze({
    id: definition.id,
    label: definition.label,
    group: definition.group,
    value,
  });
}

export function createMetricRegistry(): MetricRegistry {
  const definitions = new Map<string, MetricDefinition>();

  const register = (definition: MetricDefinition): (() => void) => {
    if (definitions.has(definition.id)) {
      throw new Error(`Metric "${definition.id}" is already registered`);
    }
    definitions.set(definition.id, definition);

    return () => {
      // Removes THIS registration and no other. A panel that unmounts holds an
      // undo closure keyed by id; without the identity check, calling it late
      // would delete whatever metric owns that id by then — the next panel's.
      if (definitions.get(definition.id) === definition) definitions.delete(definition.id);
    };
  };

  return {
    register,

    registerAll(list) {
      // Validated as a batch BEFORE anything is registered. Registering as it
      // went left the metrics before a collision permanently registered: the
      // throw replaces the return value, so their undo functions are lost.
      const incoming = new Set<string>();
      for (const definition of list) {
        if (definitions.has(definition.id) || incoming.has(definition.id)) {
          throw new Error(`Metric "${definition.id}" is already registered`);
        }
        incoming.add(definition.id);
      }

      const undo = list.map(register);
      return () => {
        for (const fn of undo) fn();
      };
    },

    sample() {
      // The registration set is snapshotted and ordered BEFORE any provider
      // runs, so which metrics this sample contains is decided by the caller
      // and not by the providers. Iterating the live map would let a provider
      // that registers during its own read — a §9 violation, but one this
      // should survive — appear in the sample it is corrupting.
      const ordered = [...definitions.values()].sort(byDisplayOrder);

      return Object.freeze(ordered.map(sampleOf));
    },

    has: (id) => definitions.has(id),
    size: () => definitions.size,
  };
}
