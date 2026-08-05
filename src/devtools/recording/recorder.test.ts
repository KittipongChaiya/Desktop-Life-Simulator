/**
 * Session recorder. Phase-07.8m.
 *
 * Two properties carry this milestone. The recorder must OBSERVE ONLY — the
 * rings and readers it is handed are its whole world, and ADR-018 §10 forbids
 * it producing anything. And a recording must be HONEST about its own limits:
 * bounded buffers that drop silently would make a recording look complete when
 * it is not, which is worse than one that says what it lost.
 */

import { describe, expect, it, vi } from 'vitest';

import { CommandOutcome, createCommandRing, type CommandRing } from '../commands/ring';
import { createEventRing, type EventRing } from '../events/ring';

import { createRecorder, RECORDING_CAPACITY, type Recorder } from './recorder';

interface Harness {
  readonly recorder: Recorder;
  readonly events: EventRing;
  readonly commands: CommandRing;
  tick: number;
  /** Runs the recorder's performance interval by hand. */
  fire(): void;
}

function harness(): Harness {
  const events = createEventRing(50);
  const commands = createCommandRing(50);
  let fireInterval: (() => void) | null = null;
  let tick = 100;

  const recorder = createRecorder({
    events,
    commands,
    tick: () => tick,
    fps: () => 60,
    frameTimeMs: () => 16,
    heapMb: () => 42,
    appVersion: '0.0.0-test',
    schedule: (callback) => {
      fireInterval = callback;
      return 1;
    },
    cancel: () => {
      fireInterval = null;
    },
  });

  return {
    recorder,
    events,
    commands,
    get tick(): number {
      return tick;
    },
    set tick(value: number) {
      tick = value;
    },
    fire: () => {
      fireInterval?.();
    },
  };
}

function recordEvent(ring: EventRing, name = 'tileTilled'): void {
  ring.record(name, 1, { tile: 1 });
}

function recordCommand(ring: CommandRing, type = 'tillTile'): void {
  ring.record({
    type,
    source: 'player',
    outcome: CommandOutcome.Accepted,
    detail: '',
    tick: 1,
    dispatchMs: 0.2,
    queueDepth: 0,
  });
}

describe('recorder lifecycle', () => {
  it('is not recording until told to', () => {
    const h = harness();

    expect(h.recorder.status().recording).toBe(false);
    expect(h.recorder.stop()).toBeNull();
  });

  it('records the tick it started and stopped on', () => {
    const h = harness();
    h.recorder.start();
    h.tick = 260;

    const recording = h.recorder.stop();

    expect(recording?.startedAtTick).toBe(100);
    expect(recording?.stoppedAtTick).toBe(260);
    expect(recording?.version).toBe(1);
    expect(recording?.appVersion).toBe('0.0.0-test');
  });

  it('captures what happens while it runs', () => {
    const h = harness();
    h.recorder.start();

    recordEvent(h.events);
    recordCommand(h.commands);

    const recording = h.recorder.stop();
    expect(recording?.events).toHaveLength(1);
    expect(recording?.commands).toHaveLength(1);
  });

  it('captures nothing from before the developer pressed record', () => {
    // The rings are always running. A recording that swept up the last two
    // hundred events would be describing a session nobody asked to record.
    const h = harness();
    recordEvent(h.events, 'cropPlanted');
    recordCommand(h.commands, 'plantCrop');

    h.recorder.start();
    recordEvent(h.events, 'tileTilled');

    const recording = h.recorder.stop();
    expect(recording?.events.map((e) => e.name)).toEqual(['tileTilled']);
    expect(recording?.commands).toHaveLength(0);
  });

  it('captures nothing after it stops', () => {
    // One captured during, one after. Asserting the count is still ONE is what
    // separates "stopped capturing" from "captured nothing at all" — a
    // recorder that never worked would also show zero.
    const h = harness();
    h.recorder.start();
    recordEvent(h.events);
    h.recorder.stop();

    recordEvent(h.events, 'itemSold');

    expect(h.recorder.status().events).toBe(1);
    expect(h.recorder.stop()).toBeNull();
  });

  it('discards a previous session rather than merging into it', () => {
    // Two recordings in one file would describe a timeline that never was.
    const h = harness();
    h.recorder.start();
    recordEvent(h.events);
    h.recorder.stop();

    h.recorder.start();
    const second = h.recorder.stop();

    expect(second?.events).toHaveLength(0);
  });

  it('records nothing twice, however often the ring notifies', () => {
    const h = harness();
    h.recorder.start();

    recordEvent(h.events);
    recordCommand(h.commands);
    // A later, unrelated notification must not re-copy what was already taken.
    recordEvent(h.events, 'itemSold');

    const recording = h.recorder.stop();
    expect(recording?.events).toHaveLength(2);
  });

  it('detaches from the rings when it stops', () => {
    const h = harness();
    const spy = vi.spyOn(h.events, 'subscribe');
    h.recorder.start();

    const unsubscribe = spy.mock.results[0]?.value as () => void;
    expect(typeof unsubscribe).toBe('function');

    h.recorder.stop();
    recordEvent(h.events);
    h.recorder.start();
    const second = h.recorder.stop();

    expect(second?.events).toHaveLength(0);
  });
});

describe('performance sampling', () => {
  it('samples on its own interval while recording', () => {
    const h = harness();
    h.recorder.start();

    h.fire();
    h.fire();

    const recording = h.recorder.stop();
    expect(recording?.performance).toHaveLength(2);
    expect(recording?.performance[0]).toEqual({
      tick: 100,
      fps: 60,
      frameTimeMs: 16,
      heapMb: 42,
    });
  });

  it('samples nothing while stopped', () => {
    const h = harness();

    h.recorder.samplePerformance();

    expect(h.recorder.status().performance).toBe(0);
  });
});

describe('bounded, and honest about it', () => {
  it('keeps the newest entries and counts what it dropped', () => {
    const h = harness();
    h.recorder.start();

    // Overflow the recorder's buffer, not the ring's.
    for (let i = 0; i < RECORDING_CAPACITY + 25; i += 1) {
      h.events.record(`event${String(i)}`, 1, { i });
    }

    const recording = h.recorder.stop();

    expect(recording?.events).toHaveLength(RECORDING_CAPACITY);
    expect(recording?.dropped.events).toBe(25);
    // The newest survive: a recording of a crash wants the run-up to it.
    expect(recording?.events.at(-1)?.name).toBe(`event${String(RECORDING_CAPACITY + 24)}`);
  });

  it('reports zero drops for an ordinary session', () => {
    const h = harness();
    h.recorder.start();
    recordEvent(h.events);

    expect(h.recorder.stop()?.dropped).toEqual({ events: 0, commands: 0, performance: 0 });
  });
});

describe('status', () => {
  it('reports what has been captured so far, without stopping', () => {
    const h = harness();
    h.recorder.start();
    recordEvent(h.events);
    h.fire();

    const status = h.recorder.status();

    expect(status.recording).toBe(true);
    expect(status.startedAtTick).toBe(100);
    expect(status.events).toBe(1);
    expect(status.performance).toBe(1);
    // Still running: asking must not end the session.
    expect(h.recorder.status().recording).toBe(true);
  });
});
