/**
 * Developer console command registry. Phase-01.5 deliverable 2.
 *
 * Commands register themselves; the console has no hardcoded list. A future
 * system adds `spawn` or `money` by calling `register()` when it lands — no
 * change to the console, and no placeholder entry in the meantime.
 *
 * That is a deliberate choice over stub commands returning "Not implemented":
 * a stub is dead code that reports a capability the build does not have
 * (AI_RULES.md §1.6). An unknown command produces a clear error with
 * near-match suggestions, which is more useful than a lie.
 */

export const OutputKind = {
  Input: 'input',
  Result: 'result',
  Info: 'info',
  Error: 'error',
} as const;

export type OutputKind = (typeof OutputKind)[keyof typeof OutputKind];

export interface OutputLine {
  readonly kind: OutputKind;
  readonly text: string;
}

/** Structured command result. Multi-line output is a list, never embedded "\n". */
export interface CommandResult {
  readonly lines: readonly OutputLine[];
}

export function resultOf(text: string, kind: OutputKind = OutputKind.Result): CommandResult {
  return { lines: [{ kind, text }] };
}

export function linesOf(
  texts: readonly string[],
  kind: OutputKind = OutputKind.Result,
): CommandResult {
  return { lines: texts.map((text) => ({ kind, text })) };
}

export const EMPTY_RESULT: CommandResult = { lines: [] };

export interface CommandContext {
  /** Raw arguments after the command name. */
  readonly args: readonly string[];
  /** Clears the console output. */
  clear(): void;
}

export interface CommandDefinition {
  readonly name: string;
  /** One-line description shown by `help`. */
  readonly summary: string;
  /** Usage string, e.g. `time [ticks]`. */
  readonly usage?: string;
  /** Alternate names. */
  readonly aliases?: readonly string[];
  run(context: CommandContext): CommandResult;
}

export interface CommandRegistry {
  register(definition: CommandDefinition): () => void;
  registerAll(definitions: readonly CommandDefinition[]): () => void;
  get(name: string): CommandDefinition | undefined;
  /** All commands, sorted by name. Aliases are not listed separately. */
  all(): readonly CommandDefinition[];
  /** Names and aliases starting with `prefix`, for auto-complete. */
  complete(prefix: string): readonly string[];
}

export function createCommandRegistry(): CommandRegistry {
  const byName = new Map<string, CommandDefinition>();
  const aliases = new Map<string, string>();

  const claim = (key: string, definition: CommandDefinition): void => {
    if (byName.has(key) || aliases.has(key)) {
      throw new Error(`Command "${key}" is already registered`);
    }
    void definition;
  };

  const register = (definition: CommandDefinition): (() => void) => {
    claim(definition.name, definition);
    for (const alias of definition.aliases ?? []) claim(alias, definition);

    byName.set(definition.name, definition);
    for (const alias of definition.aliases ?? []) aliases.set(alias, definition.name);

    return () => {
      byName.delete(definition.name);
      for (const alias of definition.aliases ?? []) aliases.delete(alias);
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

    get(name) {
      const canonical = aliases.get(name) ?? name;
      return byName.get(canonical);
    },

    all() {
      return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    complete(prefix) {
      const keys = [...byName.keys(), ...aliases.keys()];
      return keys.filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

/** Levenshtein distance, used to suggest a near match for an unknown command. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);

  for (let i = 1; i < rows; i += 1) {
    const current = [i, ...new Array<number>(cols - 1).fill(0)];
    for (let j = 1; j < cols; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = (current[j - 1] ?? 0) + 1;
      const deletion = (previous[j] ?? 0) + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }

  return previous[cols - 1] ?? 0;
}
