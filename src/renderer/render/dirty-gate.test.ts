/**
 * Dirty gate tests. Phase-02 acceptance criteria 5 and 6.
 *
 * This is the enforcement mechanism for ADR-001. If these fail, PixiJS is
 * drawing every frame over a static farm and the idle CPU budget is gone —
 * a regression that looks completely normal while running.
 */

import { describe, expect, it } from 'vitest';

import { createDirtyGate } from './dirty-gate';

describe('dirty flag', () => {
  it('requires a first frame', () => {
    expect(createDirtyGate().shouldRender()).toBe(true);
  });

  it('stops requesting frames once drawn (criterion 5)', () => {
    const gate = createDirtyGate();
    gate.clearDirty();

    // The static-world case: 600 frames' worth of checks, zero draws.
    for (let frame = 0; frame < 600; frame += 1) {
      expect(gate.shouldRender()).toBe(false);
    }
  });

  it('requests exactly one frame per change (criterion 6)', () => {
    const gate = createDirtyGate();
    gate.clearDirty();

    gate.markDirty();
    expect(gate.shouldRender()).toBe(true);
    gate.clearDirty();
    expect(gate.shouldRender()).toBe(false);
  });

  it('coalesces several changes in one frame into one draw', () => {
    const gate = createDirtyGate();
    gate.clearDirty();

    gate.markDirty();
    gate.markDirty();
    gate.markDirty();

    gate.clearDirty();
    expect(gate.shouldRender()).toBe(false);
  });
});

describe('animation holders', () => {
  it('keeps rendering while an animation is live', () => {
    const gate = createDirtyGate();
    const release = gate.acquireAnimation();
    gate.clearDirty();

    expect(gate.shouldRender()).toBe(true);
    expect(gate.animationCount()).toBe(1);

    release();
    gate.clearDirty();
    expect(gate.shouldRender()).toBe(false);
  });

  it('renders until the LAST animation releases', () => {
    const gate = createDirtyGate();
    const a = gate.acquireAnimation();
    const b = gate.acquireAnimation();
    gate.clearDirty();

    a();
    gate.clearDirty();
    expect(gate.shouldRender()).toBe(true);

    b();
    gate.clearDirty();
    expect(gate.shouldRender()).toBe(false);
  });

  it('draws one final frame when an animation ends', () => {
    // The last frame of an animation still has to reach the screen.
    const gate = createDirtyGate();
    const release = gate.acquireAnimation();
    gate.clearDirty();

    release();
    expect(gate.isDirty()).toBe(true);
  });

  it('treats a double release as a no-op, not a double decrement', () => {
    // A double-decrement would drive the count negative and silently mask a
    // genuinely leaked holder elsewhere.
    const gate = createDirtyGate();
    const a = gate.acquireAnimation();
    const b = gate.acquireAnimation();

    a();
    a();
    a();

    expect(gate.animationCount()).toBe(1);
    b();
    expect(gate.animationCount()).toBe(0);
  });

  it('never reports a negative count', () => {
    const gate = createDirtyGate();
    const release = gate.acquireAnimation();
    release();
    release();

    expect(gate.animationCount()).toBe(0);
    gate.clearDirty();
    expect(gate.shouldRender()).toBe(false);
  });
});
