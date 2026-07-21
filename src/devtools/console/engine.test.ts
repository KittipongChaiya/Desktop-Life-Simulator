/**
 * Console engine tests. Phase-01.5 deliverable 2.
 */

import { describe, expect, it, vi } from 'vitest';

import { createConsoleEngine, tokenize } from './engine';
import { createCommandRegistry, editDistance, OutputKind, resultOf } from './registry';

function engineWith(...names: readonly string[]) {
  const registry = createCommandRegistry();
  for (const name of names) {
    registry.register({ name, summary: `does ${name}`, run: () => resultOf(`${name} ran`) });
  }
  return { registry, engine: createConsoleEngine(registry) };
}

describe('tokenize', () => {
  it('splits on whitespace', () => {
    expect(tokenize('spawn worker 3')).toEqual(['spawn', 'worker', '3']);
  });

  it('honours double-quoted arguments', () => {
    expect(tokenize('say "hello world" now')).toEqual(['say', 'hello world', 'now']);
  });

  it('returns nothing for blank input', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('dispatch', () => {
  it('runs a registered command and records its output', () => {
    const { engine } = engineWith('ping');
    engine.execute('ping');

    const text = engine.output().map((l) => l.text);
    expect(text).toContain('> ping');
    expect(text).toContain('ping ran');
  });

  it('passes arguments through', () => {
    const registry = createCommandRegistry();
    const run = vi.fn(() => resultOf('ok'));
    registry.register({ name: 'echo', summary: 'echo', run });

    createConsoleEngine(registry).execute('echo a b');

    expect(run).toHaveBeenCalledWith(expect.objectContaining({ args: ['a', 'b'] }));
  });

  it('reports an unknown command as an error', () => {
    const { engine } = engineWith('help');
    engine.execute('nope');

    const line = engine.output().at(-1);
    expect(line?.kind).toBe(OutputKind.Error);
    expect(line?.text).toContain('Unknown command');
  });

  it('suggests a near match instead of a bare failure', () => {
    const { engine } = engineWith('resume');
    engine.execute('resmue');

    expect(engine.output().at(-1)?.text).toContain('Did you mean "resume"');
  });

  it('survives a command that throws', () => {
    const registry = createCommandRegistry();
    registry.register({
      name: 'boom',
      summary: 'throws',
      run: () => {
        throw new Error('exploded');
      },
    });
    const engine = createConsoleEngine(registry);

    expect(() => {
      engine.execute('boom');
    }).not.toThrow();
    expect(engine.output().at(-1)?.text).toBe('exploded');
  });

  it('ignores blank input entirely', () => {
    const { engine } = engineWith('ping');
    engine.execute('   ');
    expect(engine.output()).toHaveLength(0);
  });
});

describe('history', () => {
  it('walks backwards through previous entries', () => {
    const { engine } = engineWith('one', 'two');
    engine.execute('one');
    engine.execute('two');

    expect(engine.historyPrevious()).toBe('two');
    expect(engine.historyPrevious()).toBe('one');
    expect(engine.historyPrevious()).toBe('one');
  });

  it('walks forwards and returns to an empty prompt', () => {
    const { engine } = engineWith('one', 'two');
    engine.execute('one');
    engine.execute('two');

    engine.historyPrevious();
    engine.historyPrevious();
    expect(engine.historyNext()).toBe('two');
    expect(engine.historyNext()).toBe('');
  });

  it('does not record consecutive duplicates', () => {
    const { engine } = engineWith('ping');
    engine.execute('ping');
    engine.execute('ping');

    expect(engine.history()).toEqual(['ping']);
  });
});

describe('auto-complete', () => {
  it('completes a unique prefix and appends a space', () => {
    const { engine } = engineWith('profiler', 'pause');
    expect(engine.complete('prof').completed).toBe('profiler ');
  });

  it('completes to the longest common prefix when ambiguous', () => {
    const { engine } = engineWith('reset', 'resume');
    const { completed, candidates } = engine.complete('re');

    // Both share "res", so Tab advances that far and lists the options.
    expect(completed).toBe('res');
    expect(candidates).toEqual(['reset', 'resume']);
  });

  it('offers nothing for an unknown prefix', () => {
    const { engine } = engineWith('help');
    expect(engine.complete('zzz').candidates).toHaveLength(0);
  });

  it('does not complete arguments', () => {
    const { engine } = engineWith('help');
    expect(engine.complete('help me').candidates).toHaveLength(0);
  });
});

describe('registry', () => {
  it('rejects duplicate names', () => {
    const registry = createCommandRegistry();
    registry.register({ name: 'dup', summary: '', run: () => resultOf('') });

    expect(() =>
      registry.register({ name: 'dup', summary: '', run: () => resultOf('') }),
    ).toThrow();
  });

  it('rejects an alias that collides with a name', () => {
    const registry = createCommandRegistry();
    registry.register({ name: 'clear', summary: '', run: () => resultOf('') });

    expect(() =>
      registry.register({ name: 'wipe', summary: '', aliases: ['clear'], run: () => resultOf('') }),
    ).toThrow();
  });

  it('resolves aliases', () => {
    const registry = createCommandRegistry();
    registry.register({ name: 'clear', summary: '', aliases: ['cls'], run: () => resultOf('') });

    expect(registry.get('cls')?.name).toBe('clear');
  });

  it('unregisters cleanly, freeing the name', () => {
    const registry = createCommandRegistry();
    const undo = registry.register({ name: 'temp', summary: '', run: () => resultOf('') });
    undo();

    expect(registry.get('temp')).toBeUndefined();
    expect(() =>
      registry.register({ name: 'temp', summary: '', run: () => resultOf('') }),
    ).not.toThrow();
  });
});

describe('editDistance', () => {
  it('measures single-character edits', () => {
    expect(editDistance('resume', 'resmue')).toBeLessThanOrEqual(2);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
  });
});
