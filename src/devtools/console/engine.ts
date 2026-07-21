/**
 * Console engine: parsing, history, auto-complete, dispatch.
 *
 * Kept separate from the React component so all of it is testable without a
 * DOM, and so the console could be driven from somewhere else later (a remote
 * debug channel, a script runner) without touching the UI.
 */

import {
  editDistance,
  EMPTY_RESULT,
  OutputKind,
  resultOf,
  type CommandRegistry,
  type OutputLine,
} from './registry';

const MAX_HISTORY = 100;
const MAX_OUTPUT = 500;

export interface ConsoleEngine {
  /** Executes a line and appends its output. */
  execute(line: string): void;
  output(): readonly OutputLine[];
  clear(): void;

  /** Previous entry, for Up-arrow. Returns null at the oldest. */
  historyPrevious(): string | null;
  /** Next entry, for Down-arrow. Returns '' past the newest. */
  historyNext(): string | null;
  resetHistoryCursor(): void;
  history(): readonly string[];

  /**
   * Completion for the current input.
   *
   * Returns the longest common prefix plus every candidate, so Tab can complete
   * unambiguously and still show the options.
   */
  complete(input: string): { completed: string; candidates: readonly string[] };
}

function longestCommonPrefix(values: readonly string[]): string {
  if (values.length === 0) return '';
  let prefix = values[0] ?? '';
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix) && prefix.length > 0) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

/** Splits on whitespace, honouring double-quoted arguments. */
export function tokenize(line: string): readonly string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    tokens.push(match[1] ?? match[2] ?? '');
  }
  return tokens;
}

export function createConsoleEngine(registry: CommandRegistry): ConsoleEngine {
  const lines: OutputLine[] = [];
  const entries: string[] = [];
  let cursor = -1;

  const push = (line: OutputLine): void => {
    lines.push(line);
    if (lines.length > MAX_OUTPUT) lines.shift();
  };

  const clear = (): void => {
    lines.length = 0;
  };

  return {
    execute(raw) {
      const line = raw.trim();
      if (line === '') return;

      push({ kind: OutputKind.Input, text: `> ${line}` });

      if (entries[entries.length - 1] !== line) {
        entries.push(line);
        if (entries.length > MAX_HISTORY) entries.shift();
      }
      cursor = -1;

      const [name = '', ...args] = tokenize(line);
      const command = registry.get(name);

      if (command === undefined) {
        const suggestion = registry
          .all()
          .map((candidate) => candidate.name)
          .filter((candidate) => editDistance(candidate, name) <= 2)
          .sort((a, b) => editDistance(a, name) - editDistance(b, name))[0];

        push({
          kind: OutputKind.Error,
          text:
            suggestion === undefined
              ? `Unknown command: ${name}. Type "help" for available commands.`
              : `Unknown command: ${name}. Did you mean "${suggestion}"?`,
        });
        return;
      }

      let result;
      try {
        result = command.run({ args, clear });
      } catch (error) {
        // A throwing command must not take down the console.
        push({
          kind: OutputKind.Error,
          text: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      for (const outputLine of (result ?? EMPTY_RESULT).lines) push(outputLine);
    },

    output: () => lines,
    clear,

    historyPrevious() {
      if (entries.length === 0) return null;
      cursor = cursor === -1 ? entries.length - 1 : Math.max(0, cursor - 1);
      return entries[cursor] ?? null;
    },

    historyNext() {
      if (cursor === -1) return null;
      cursor += 1;
      if (cursor >= entries.length) {
        cursor = -1;
        return '';
      }
      return entries[cursor] ?? null;
    },

    resetHistoryCursor() {
      cursor = -1;
    },

    history: () => entries,

    complete(input) {
      // Only the command name completes; argument completion belongs to whoever
      // owns the argument's meaning, which no command needs yet.
      if (input.includes(' ')) return { completed: input, candidates: [] };

      const candidates = registry.complete(input);
      if (candidates.length === 0) return { completed: input, candidates: [] };
      if (candidates.length === 1) return { completed: `${candidates[0] ?? ''} `, candidates };

      return { completed: longestCommonPrefix(candidates), candidates };
    },
  };
}

export { resultOf };
