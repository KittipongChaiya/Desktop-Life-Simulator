/**
 * Metric and inspector registry tests. Phase-01.5 deliverables 1 and 4.
 */

import { describe, expect, it } from 'vitest';

import { createInspectorRegistry, field, UNAVAILABLE } from '../inspector/registry';

import { createMetricRegistry, MetricGroup } from './registry';

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
