/**
 * Animation lease tests. Phase-07.7b, ADR-017 §1.
 *
 * The gate's animation count is, in its own words, "the fragile half": every
 * acquire must have a matching release, and a source that starts animating and
 * never stops is a permanent frame cost that looks exactly like normal
 * operation. Two call sites hand-rolled the bookkeeping before this module
 * existed; every later effect in phase-07.7 would have been a third, fourth,
 * and fifth chance to get it wrong.
 */

import { describe, expect, it } from 'vitest';

import { bindAnimationLease } from './animation-lease';
import { createDirtyGate } from './dirty-gate';

describe('binding a lease to a liveness flag', () => {
  it('holds nothing until something is alive', () => {
    const gate = createDirtyGate();
    bindAnimationLease(gate);

    expect(gate.animationCount()).toBe(0);
  });

  it('acquires on the transition to alive', () => {
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    lease.sync(true);
    expect(gate.animationCount()).toBe(1);
  });

  it('releases on the transition to done', () => {
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    lease.sync(true);
    lease.sync(false);
    expect(gate.animationCount()).toBe(0);
  });

  it('holds exactly one lease however many frames pass', () => {
    // The leak this module exists to prevent: `acquireAnimation()` called per
    // frame instead of per transition, which counts up forever.
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    for (let frame = 0; frame < 500; frame += 1) lease.sync(true);
    expect(gate.animationCount()).toBe(1);
  });

  it('survives repeated stop and start', () => {
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    for (let cycle = 0; cycle < 50; cycle += 1) {
      lease.sync(true);
      lease.sync(true);
      lease.sync(false);
      lease.sync(false);
    }

    expect(gate.animationCount()).toBe(0);
  });

  it('tolerates being told it is done before it ever started', () => {
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    lease.sync(false);
    expect(gate.animationCount()).toBe(0);
  });
});

describe('release — teardown', () => {
  it('drops a held lease, so a view cannot outlive its own frames', () => {
    // Collapsed mode destroys the renderer on every toggle (ADR-001 §2). A
    // lease that survived would be a permanent cost on the next scene.
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    lease.sync(true);
    lease.release();
    expect(gate.animationCount()).toBe(0);
  });

  it('is idempotent, so a double teardown cannot go negative', () => {
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    lease.sync(true);
    lease.release();
    lease.release();
    expect(gate.animationCount()).toBe(0);
  });

  it('can be re-armed after release', () => {
    const gate = createDirtyGate();
    const lease = bindAnimationLease(gate);

    lease.sync(true);
    lease.release();
    lease.sync(true);

    expect(gate.animationCount()).toBe(1);
  });
});

describe('independence', () => {
  it('counts one lease per source', () => {
    const gate = createDirtyGate();
    const a = bindAnimationLease(gate);
    const b = bindAnimationLease(gate);

    a.sync(true);
    b.sync(true);
    expect(gate.animationCount()).toBe(2);

    a.sync(false);
    expect(gate.animationCount()).toBe(1);
    expect(gate.shouldRender()).toBe(true); // b is still animating

    b.sync(false);
    expect(gate.animationCount()).toBe(0);
  });
});
