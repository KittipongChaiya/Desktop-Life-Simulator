/**
 * Phase-12d — rain against a real dirty gate.
 *
 * The acceptance `ROADMAP.md` §8 states is *"weather visuals on, pointer idle
 * past the timeout → zero `requestAnimationFrame` callbacks"*. That is checked
 * here rather than end-to-end for the reason phase-10c's lighting test gave: the
 * gate is the REAL `createDirtyGate`, so `animationCount()` is the number the
 * render loop consults and the debug overlay prints as `0 anim`, and an e2e
 * would have to wait out an 8-second idle timeout to see the same thing.
 *
 * Rain is ambient — it never ends — so the only thing standing between it and a
 * permanently open frame loop is that it surrenders. Every test below is about
 * surrendering.
 */

import { Container } from 'pixi.js';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDirtyGate, type DirtyGate } from './dirty-gate';
import { createRainRenderer, type RainRenderer } from './rain-view';

let layer: Container;
let gate: DirtyGate;

const build = (): RainRenderer => createRainRenderer({ layer, gate, width: 800, height: 600 });

beforeEach(() => {
  layer = new Container();
  gate = createDirtyGate();
});

describe('claiming its place on layer 4', () => {
  it('parents exactly one object', () => {
    build();
    expect(layer.children.length).toBe(1);
  });

  it('never intercepts a pointer event', () => {
    build();
    expect(layer.children[0]?.eventMode).toBe('none');
  });

  it('starts invisible and holds no lease', () => {
    build();
    expect(layer.children[0]?.visible).toBe(false);
    expect(gate.animationCount()).toBe(0);
  });
});

describe('the ambient surrender (ADR-017 §2 condition 4)', () => {
  it('holds a lease while raining and watched', () => {
    const rain = build();
    rain.update(true, true, 1_000);

    expect(gate.animationCount()).toBe(1);
  });

  it('holds exactly ONE lease however many frames pass', () => {
    const rain = build();
    for (let frame = 0; frame < 100; frame += 1) rain.update(true, true, frame * 16);

    expect(gate.animationCount()).toBe(1);
  });

  it('SURRENDERS when the pointer goes idle, even though it is still raining', () => {
    // The acceptance. `ambient` false is what presence reports past the idle
    // timeout, and the rain must stop paying for frames immediately.
    const rain = build();
    rain.update(true, true, 1_000);
    expect(gate.animationCount()).toBe(1);

    rain.update(true, false, 2_000);

    expect(gate.animationCount()).toBe(0);
  });

  it('draws nothing further once surrendered — ten seconds of frames', () => {
    const rain = build();
    rain.update(true, true, 0);
    rain.update(true, false, 100);
    gate.clearDirty();

    // 10 s at 60 Hz, still raining, nobody watching.
    for (let frame = 0; frame < 600; frame += 1) {
      rain.update(true, false, 200 + frame * (1000 / 60));
    }

    expect(gate.isDirty()).toBe(false);
    expect(gate.animationCount()).toBe(0);
  });

  it('holds nothing when it is not raining, however present the player is', () => {
    const rain = build();
    for (let frame = 0; frame < 50; frame += 1) rain.update(false, true, frame * 16);

    expect(gate.animationCount()).toBe(0);
    expect(layer.children[0]?.visible).toBe(false);
  });

  it('resumes when the pointer returns', () => {
    const rain = build();
    rain.update(true, true, 0);
    rain.update(true, false, 100);
    expect(gate.animationCount()).toBe(0);

    rain.update(true, true, 200);

    expect(gate.animationCount()).toBe(1);
    expect(layer.children[0]?.visible).toBe(true);
  });

  it('releases its lease on destroy', () => {
    // Collapsed mode destroys the renderer on every toggle (ADR-001 §2).
    const rain = build();
    rain.update(true, true, 0);
    expect(gate.animationCount()).toBe(1);

    rain.destroy();
    expect(gate.animationCount()).toBe(0);
  });
});

describe('stopping costs one frame, not every frame', () => {
  it('marks the scene dirty once when the rain stops', () => {
    const rain = build();
    rain.update(true, true, 0);
    gate.clearDirty();

    rain.update(false, true, 16);
    expect(gate.isDirty()).toBe(true);

    gate.clearDirty();
    rain.update(false, true, 32);
    rain.update(false, true, 48);
    expect(gate.isDirty()).toBe(false);
  });
});
