/**
 * Metric and inspector registry tests. Phase-01.5 deliverables 1 and 4.
 */

import { describe, expect, it } from 'vitest';

import { createInspectorRegistry, field, UNAVAILABLE } from '../inspector/registry';

import { createMetricRegistry, MetricGroup, type MetricSample } from './registry';

function metric(id: string, read: () => string, group: MetricGroup = MetricGroup.Performance) {
  return { id, label: id, group, read };
}

describe('metric registry', () => {
  it('starts empty, so an unbuilt metric is absent rather than stubbed', () => {
    expect(createMetricRegistry().sample()).toHaveLength(0);
  });

  it('samples registered metrics', () => {
    const registry = createMetricRegistry();
    registry.register(metric('fps', () => '60.0'));

    expect(registry.sample()).toEqual([
      { id: 'fps', label: 'fps', group: MetricGroup.Performance, value: '60.0' },
    ]);
  });

  it('lets a later phase add metrics without touching the overlay', () => {
    const registry = createMetricRegistry();
    registry.register(metric('fps', () => '60'));
    registry.register(metric('camera', () => '0,0', MetricGroup.Render));

    expect(registry.sample().map((s) => s.id)).toEqual(['fps', 'camera']);
  });

  it('rejects duplicate ids', () => {
    const registry = createMetricRegistry();
    registry.register(metric('fps', () => '1'));

    expect(() => registry.register(metric('fps', () => '2'))).toThrow();
  });

  it('unregisters cleanly', () => {
    const registry = createMetricRegistry();
    const undo = registry.register(metric('fps', () => '1'));
    undo();

    expect(registry.has('fps')).toBe(false);
    expect(registry.sample()).toHaveLength(0);
  });

  it('does not let one broken provider break the overlay', () => {
    const registry = createMetricRegistry();
    registry.register(
      metric('bad', () => {
        throw new Error('nope');
      }),
    );
    registry.register(metric('good', () => 'fine'));

    const values = registry.sample().map((s) => s.value);
    expect(values).toContain('fine');
    expect(values.some((v) => v.includes('error'))).toBe(true);
  });

  it('orders by group, then explicit order', () => {
    const registry = createMetricRegistry();
    registry.register({ ...metric('b', () => '', MetricGroup.Simulation), order: 1 });
    registry.register({ ...metric('a', () => '', MetricGroup.Simulation), order: 0 });
    registry.register(metric('perf', () => '', MetricGroup.Performance));

    expect(registry.sample().map((s) => s.id)).toEqual(['perf', 'a', 'b']);
  });

  it('registerAll undoes every registration at once', () => {
    const registry = createMetricRegistry();
    const undo = registry.registerAll([metric('a', () => ''), metric('b', () => '')]);
    expect(registry.size()).toBe(2);

    undo();
    expect(registry.size()).toBe(0);
  });
});

/**
 * Phase-07.8b. The registry is the API every panel in this phase reads through,
 * and ADR-018 §9 states its contract: a metric is a PULL, it may not mutate
 * anything to compute itself, and it may not be a live reference a panel can
 * write through. Compile-time `readonly` states the last of those; it does not
 * enforce it, so these assert it at runtime.
 */
describe('metric registry — the read-only contract (ADR-018 §9)', () => {
  it('freezes each sample, so a panel cannot write through one', () => {
    const registry = createMetricRegistry();
    registry.register(metric('fps', () => '60'));

    const [sample] = registry.sample();
    expect(sample).toBeDefined();
    expect(() => {
      (sample as { value: string }).value = 'tampered';
    }).toThrow();
  });

  it('freezes the sample list, so a panel cannot splice the overlay', () => {
    const registry = createMetricRegistry();
    registry.register(metric('fps', () => '60'));

    const samples = registry.sample();
    expect(() => {
      (samples as MetricSample[]).push(samples[0] as MetricSample);
    }).toThrow();
  });

  it('leaves the registry untouched by sampling', () => {
    const registry = createMetricRegistry();
    registry.registerAll([metric('a', () => '1'), metric('b', () => '2')]);

    const before = registry.sample().map((s) => s.id);
    registry.sample();

    expect(registry.size()).toBe(2);
    expect(registry.sample().map((s) => s.id)).toEqual(before);
  });

  it('samples the registration set as it was when asked', () => {
    // A provider that registers while being read is violating §9. The sample
    // in flight must not be corruptible by it — iterating the live map would
    // pick the new metric up mid-iteration and read a provider the caller
    // never asked for.
    const registry = createMetricRegistry();
    registry.register(
      metric('a', () => {
        if (!registry.has('smuggled')) registry.register(metric('smuggled', () => 'x'));
        return '1';
      }),
    );

    expect(registry.sample().map((s) => s.id)).toEqual(['a']);
    expect(registry.has('smuggled')).toBe(true);
  });
});

/**
 * Phase-07.8b. Registration integrity: 07.8 registers metrics in growing
 * batches from the composition root, and panels arriving later register and
 * unregister as they mount. Both of those made the two defects below reachable.
 */
describe('metric registry — registration integrity', () => {
  it('registers nothing when a batch collides with an existing metric', () => {
    const registry = createMetricRegistry();
    registry.register(metric('taken', () => '1'));

    expect(() =>
      registry.registerAll([
        metric('a', () => ''),
        metric('taken', () => ''),
        metric('b', () => ''),
      ]),
    ).toThrow();

    // The failed batch left nothing behind. Partial registration is worse than
    // none: the throw discards the undo function, so those metrics would be
    // registered permanently with no way to remove them.
    expect(registry.has('a')).toBe(false);
    expect(registry.has('b')).toBe(false);
    expect(registry.size()).toBe(1);
  });

  it('registers nothing when a batch duplicates within itself', () => {
    const registry = createMetricRegistry();

    expect(() =>
      registry.registerAll([
        metric('a', () => ''),
        metric('dup', () => ''),
        metric('dup', () => ''),
      ]),
    ).toThrow();

    expect(registry.size()).toBe(0);
  });

  it('does not let a stale unregister remove a live re-registration', () => {
    const registry = createMetricRegistry();
    const undoFirst = registry.register(metric('fps', () => 'first'));
    undoFirst();

    registry.register(metric('fps', () => 'second'));
    undoFirst(); // stale — the panel that owned the first registration is gone

    expect(registry.has('fps')).toBe(true);
    expect(registry.sample()[0]?.value).toBe('second');
  });
});

describe('metric registry — group ordering', () => {
  it('ranks every declared group', () => {
    // Guards the ordering an added group could silently break. The compile-time
    // half of this is the rank table being total over MetricGroup; this is the
    // half that says what the order actually is.
    const registry = createMetricRegistry();
    for (const group of Object.values(MetricGroup)) {
      registry.register(metric(group, () => '', group));
    }

    expect(registry.sample().map((s) => s.group)).toEqual([
      MetricGroup.Performance,
      MetricGroup.Simulation,
      MetricGroup.Render,
      MetricGroup.World,
      MetricGroup.Input,
    ]);
  });
});

describe('inspector registry', () => {
  const target = { kind: 'pointer', x: 10, y: 20 };

  it('returns nothing when no provider matches', () => {
    const registry = createInspectorRegistry();
    registry.register({ id: 'none', inspect: () => null });

    expect(registry.inspect(target)).toHaveLength(0);
  });

  it('collects sections from every matching provider', () => {
    const registry = createInspectorRegistry();
    registry.register({ id: 'a', inspect: () => ({ title: 'A', fields: [] }) });
    registry.register({ id: 'b', inspect: () => ({ title: 'B', fields: [] }) });

    expect(registry.inspect(target).map((s) => s.title)).toEqual(['A', 'B']);
  });

  it('supports a future subject kind with no change to the registry', () => {
    const registry = createInspectorRegistry();
    registry.register({
      id: 'entity',
      inspect: (t) => (t.kind === 'entity-not-invented-yet' ? { title: 'E', fields: [] } : null),
    });

    expect(registry.inspect({ kind: 'entity-not-invented-yet', x: 0, y: 0 })).toHaveLength(1);
  });

  it('degrades a throwing provider to a visible note', () => {
    const registry = createInspectorRegistry();
    registry.register({
      id: 'broken',
      inspect: () => {
        throw new Error('bad provider');
      },
    });

    expect(registry.inspect(target)[0]?.fields[0]?.value).toBe('bad provider');
  });

  it('honours provider order', () => {
    const registry = createInspectorRegistry();
    registry.register({ id: 'late', order: 10, inspect: () => ({ title: 'late', fields: [] }) });
    registry.register({ id: 'early', order: 0, inspect: () => ({ title: 'early', fields: [] }) });

    expect(registry.inspect(target).map((s) => s.title)).toEqual(['early', 'late']);
  });
});

describe('field()', () => {
  it('reports Unavailable instead of throwing', () => {
    expect(
      field('x', () => {
        throw new Error('no');
      }).value,
    ).toBe(UNAVAILABLE);
  });

  it('reports Unavailable for null and undefined', () => {
    expect(field('x', () => null).value).toBe(UNAVAILABLE);
    expect(field('x', () => undefined).value).toBe(UNAVAILABLE);
  });

  it('stringifies primitives and objects', () => {
    expect(field('n', () => 42).value).toBe('42');
    expect(field('o', () => ({ a: 1 })).value).toBe('{"a":1}');
  });
});
