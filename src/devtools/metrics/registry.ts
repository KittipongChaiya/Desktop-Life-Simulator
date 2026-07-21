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

const GROUP_ORDER: readonly MetricGroup[] = [
  MetricGroup.Performance,
  MetricGroup.Simulation,
  MetricGroup.Render,
  MetricGroup.World,
  MetricGroup.Input,
];

export function createMetricRegistry(): MetricRegistry {
  const definitions = new Map<string, MetricDefinition>();

  const register = (definition: MetricDefinition): (() => void) => {
    if (definitions.has(definition.id)) {
      throw new Error(`Metric "${definition.id}" is already registered`);
    }
    definitions.set(definition.id, definition);
    return () => {
      definitions.delete(definition.id);
    };
  };

  return {
    register,

    registerAll(list) {
      const undo = list.map(register);
      return () => {
        for (const fn of undo) fn();
      };
    },

    sample() {
      const samples: MetricSample[] = [];

      for (const definition of definitions.values()) {
        let value: string;
        try {
          value = definition.read();
        } catch (error) {
          // A broken provider must never take down the overlay — the overlay is
          // frequently the only way to see what is wrong.
          value = error instanceof Error ? `<error: ${error.message}>` : '<error>';
        }
        samples.push({
          id: definition.id,
          label: definition.label,
          group: definition.group,
          value,
        });
      }

      return samples.sort((a, b) => {
        const groupDelta = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
        if (groupDelta !== 0) return groupDelta;

        const orderDelta =
          (definitions.get(a.id)?.order ?? 0) - (definitions.get(b.id)?.order ?? 0);
        return orderDelta !== 0 ? orderDelta : a.label.localeCompare(b.label);
      });
    },

    has: (id) => definitions.has(id),
    size: () => definitions.size,
  };
}
