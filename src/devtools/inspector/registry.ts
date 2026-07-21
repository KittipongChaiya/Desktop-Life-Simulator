/**
 * World inspector. Phase-01.5 deliverable 4.
 *
 * Providers describe how to inspect a SUBJECT (a tile, an entity, the world).
 * The panel renders whatever they return, so "the inspector must automatically
 * support future entity types" holds by construction: phase-02 registers a tile
 * provider, phase-04 an entity provider, and this file never changes.
 *
 * A field whose value cannot be read reports "Unavailable" rather than throwing
 * — 1.5's explicit requirement. Note the difference from the metric registry:
 * there, an absent metric is simply not registered; here, a provider that
 * exists but cannot resolve one field still renders the rest. Both avoid
 * showing a value that is not real.
 */

export const UNAVAILABLE = 'Unavailable';

export interface InspectField {
  readonly label: string;
  readonly value: string;
}

export interface InspectSection {
  readonly title: string;
  readonly fields: readonly InspectField[];
}

/** What the pointer is over. `kind` is open so future subjects need no change. */
export interface InspectTarget {
  readonly kind: string;
  /** Screen-space position, used to resolve what is under the cursor. */
  readonly x: number;
  readonly y: number;
}

export interface InspectProvider {
  readonly id: string;
  /** Lower runs first; the first provider returning a section wins its slot. */
  readonly order?: number;
  /** Returns null when this provider has nothing to say about the target. */
  inspect(target: InspectTarget): InspectSection | null;
}

export interface InspectorRegistry {
  register(provider: InspectProvider): () => void;
  /** Every section any provider produces for the target. */
  inspect(target: InspectTarget): readonly InspectSection[];
  size(): number;
}

export function createInspectorRegistry(): InspectorRegistry {
  const providers = new Map<string, InspectProvider>();

  return {
    register(provider) {
      if (providers.has(provider.id)) {
        throw new Error(`Inspect provider "${provider.id}" is already registered`);
      }
      providers.set(provider.id, provider);
      return () => {
        providers.delete(provider.id);
      };
    },

    inspect(target) {
      const ordered = [...providers.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const sections: InspectSection[] = [];

      for (const provider of ordered) {
        let section: InspectSection | null;
        try {
          section = provider.inspect(target);
        } catch (error) {
          // A failing provider degrades to a visible note; it never breaks the
          // panel, which is often the only view into what is wrong.
          section = {
            title: provider.id,
            fields: [
              {
                label: 'error',
                value: error instanceof Error ? error.message : UNAVAILABLE,
              },
            ],
          };
        }
        if (section !== null) sections.push(section);
      }

      return sections;
    },

    size: () => providers.size,
  };
}

/** Reads a value defensively, reporting `Unavailable` instead of throwing. */
export function field(label: string, read: () => unknown): InspectField {
  try {
    const value = read();
    if (value === undefined || value === null) return { label, value: UNAVAILABLE };
    if (typeof value === 'object') return { label, value: JSON.stringify(value) };
    if (typeof value === 'string') return { label, value };
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return { label, value: value.toString() };
    }
    // Symbols and functions have no useful rendering; report rather than
    // stringify them into "[object Object]"-shaped noise.
    return { label, value: UNAVAILABLE };
  } catch {
    return { label, value: UNAVAILABLE };
  }
}
