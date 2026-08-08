/**
 * Phase-10c — layer 5, against a real dirty gate.
 *
 * This file exists because of one acceptance criterion: *zero frames with a
 * static world, including across a phase boundary once the transition ends*
 * (ADR-020 §Validation). The gate here is the REAL `createDirtyGate`, so
 * `animationCount()` is the same number the render loop consults and the same
 * one the devtools overlay reports as `0 anim`.
 *
 * Pixi objects are real too. `Graphics` builds a geometry without a renderer,
 * so the binding needs no GPU to exercise — which is why this module stays in
 * the measured set instead of joining the host-binding exclusions in
 * `coverage-policy.config.ts`. A lease leak is exactly the defect an e2e
 * detector would take twenty seconds to notice and this notices in a
 * millisecond.
 */

import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createPhaseTintRegistry,
  phaseTintId,
  type PhaseTintRegistry,
} from '../../sim/content/lighting';
import type { TimeView } from '../../sim/snapshot/time-slice';
import { DayPhase } from '../../sim/time/game-clock';

import { createDirtyGate, type DirtyGate } from './dirty-gate';
import {
  createLightingRenderer,
  PHASE_TRANSITION_MS,
  type LightingRenderer,
} from './lighting-view';

const NIGHT = { color: 0x1b2a6b, alpha: 0.4 };
const DUSK = { color: 0xff8c5a, alpha: 0.22 };

const at = (phase: DayPhase, day = 0): TimeView => ({ day, phase });

let layer: Container;
let gate: DirtyGate;
let registry: PhaseTintRegistry;

function build(intensity?: () => number): LightingRenderer {
  return createLightingRenderer({
    layer,
    registry,
    gate,
    width: 800,
    height: 600,
    ...(intensity ? { intensity } : {}),
  });
}

beforeEach(() => {
  layer = new Container();
  gate = createDirtyGate();
  registry = createPhaseTintRegistry();

  for (const [phase, tint] of [
    [DayPhase.Dusk, DUSK],
    [DayPhase.Night, NIGHT],
  ] as const) {
    const registered = registry.register({ id: phaseTintId('core', phase), phase, ...tint });
    expect(registered.ok).toBe(true);
  }
});

describe('claiming layer 5', () => {
  it('parents exactly one object to the lighting layer', () => {
    build();
    expect(layer.children.length).toBe(1);
  });

  it('never intercepts a pointer event', () => {
    // The overlay covers the whole world. Interactive, it would put every tile
    // out of reach — a bug indistinguishable from the game ignoring the player.
    build();
    const overlay = layer.children[0];

    expect(overlay?.eventMode).toBe('none');
    expect(overlay?.interactiveChildren).toBe(false);
  });

  it('releases its lease on destroy', () => {
    // Collapsed mode destroys the renderer on every toggle (ADR-001 §2); a
    // lease outliving its view is a permanent cost on the next scene.
    const lighting = build();
    lighting.update(at(DayPhase.Dusk));
    lighting.update(at(DayPhase.Night));
    lighting.animate(0);
    expect(gate.animationCount()).toBe(1);

    lighting.destroy();
    expect(gate.animationCount()).toBe(0);
  });
});

describe('the idle invariant across a phase boundary (ADR-020 §Validation)', () => {
  it('holds no lease before any phase change', () => {
    const lighting = build();
    lighting.update(at(DayPhase.Night));
    lighting.animate(0);

    expect(gate.animationCount()).toBe(0);
  });

  it('holds exactly one lease while the transition runs', () => {
    const lighting = build();
    lighting.update(at(DayPhase.Dusk));
    lighting.animate(0);
    lighting.update(at(DayPhase.Night));

    lighting.animate(10);
    expect(gate.animationCount()).toBe(1);

    // Still one, not two: the lease is acquired on the transition into alive,
    // never per frame.
    lighting.animate(20);
    expect(gate.animationCount()).toBe(1);
  });

  it('RELEASES the lease once the transition ends', () => {
    const lighting = build();
    lighting.update(at(DayPhase.Dusk));
    lighting.animate(0);
    lighting.update(at(DayPhase.Night));
    lighting.animate(100);

    lighting.animate(100 + PHASE_TRANSITION_MS);

    expect(gate.animationCount()).toBe(0);
  });

  it('draws nothing further once settled — ten seconds of frames, no dirt', () => {
    const lighting = build();
    lighting.update(at(DayPhase.Dusk));
    lighting.animate(0);
    lighting.update(at(DayPhase.Night));
    lighting.animate(100);
    lighting.animate(100 + PHASE_TRANSITION_MS);
    gate.clearDirty();

    // 10 s at 60 Hz with a static world and no phase change.
    for (let frame = 0; frame < 600; frame += 1) {
      lighting.update(at(DayPhase.Night));
      lighting.animate(1000 + frame * (1000 / 60));
    }

    expect(gate.isDirty()).toBe(false);
    expect(gate.animationCount()).toBe(0);
  });
});

describe('the first tint of a session', () => {
  it('snaps, so a world resuming at night IS dark', () => {
    const lighting = build();
    lighting.update(at(DayPhase.Night));
    lighting.animate(0);

    // Snapped: nothing left to animate on the very next frame.
    expect(gate.animationCount()).toBe(0);
  });

  it('marks the scene dirty so the tint is actually drawn', () => {
    const lighting = build();
    gate.clearDirty();

    lighting.update(at(DayPhase.Night));

    expect(gate.isDirty()).toBe(true);
  });
});

describe('reduced motion', () => {
  it('snaps instead of fading — no lease at all', () => {
    const lighting = build(() => 0);
    lighting.update(at(DayPhase.Dusk));
    lighting.animate(0);
    lighting.update(at(DayPhase.Night));

    lighting.animate(10);

    expect(gate.animationCount()).toBe(0);
  });
});

describe('change gating', () => {
  it('does nothing when the phase has not moved', () => {
    const lighting = build();
    lighting.update(at(DayPhase.Night));
    lighting.animate(0);
    gate.clearDirty();

    lighting.update(at(DayPhase.Night, 1));
    lighting.update(at(DayPhase.Night, 2));

    expect(gate.isDirty()).toBe(false);
  });
});

describe('a phase with no registered tint', () => {
  it('paints nothing rather than guessing a colour', () => {
    // Dawn is deliberately not registered in this suite's fixture.
    const lighting = build();
    lighting.update(at(DayPhase.Night));
    lighting.animate(0);

    lighting.update(at(DayPhase.Dawn));
    lighting.animate(10);
    lighting.animate(10 + PHASE_TRANSITION_MS);

    // It settled, and it settled on transparent.
    expect(gate.animationCount()).toBe(0);
  });
});

describe('resize', () => {
  it('repaints at the new size and asks for a frame', () => {
    const lighting = build();
    lighting.update(at(DayPhase.Night));
    lighting.animate(0);
    gate.clearDirty();

    lighting.resize(1024, 768);

    expect(gate.isDirty()).toBe(true);
    expect(gate.animationCount()).toBe(0);
  });
});
