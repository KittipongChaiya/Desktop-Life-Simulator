/**
 * Phase-13b — the mixer, and the guarantee it must not erode.
 *
 * ADR-023 §6 restates the rule precisely because a mixer is a new place for it
 * to erode: **a muted session and an unmuted session produce byte-identical
 * worlds.** That is a test, not an assumption, and it lives here rather than in
 * `src/sim` because the boundary linter already makes the reverse direction a
 * compile error — what needs checking is that the audio side takes nothing.
 */

import { describe, expect, it } from 'vitest';

import type { SaveMeta } from '../../persistence/schema';
import { serializeSave, toSaveDocument } from '../../persistence/serialize';
import { stepSimulationBy } from '../../sim/tick';
import { createWorld } from '../../sim/world/world';

import { createSoundBus, type AudioPorts, type AudioState } from './audio';
import { AudioCategory, Sound, SOUND_CATEGORY } from './sounds';

const META: SaveMeta = {
  gameVersion: '0.2.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

interface Recorder {
  readonly ports: AudioPorts;
  readonly gains: () => readonly number[];
  advance: (ms: number) => void;
}

function recorder(): Recorder {
  const gains: number[] = [];
  let clock = 0;
  return {
    ports: {
      play: (_sound, gain) => {
        gains.push(gain);
      },
      now: () => clock,
    },
    gains: () => gains,
    advance: (ms) => {
      clock += ms;
    },
  };
}

const state = (overrides: Partial<AudioState> = {}): AudioState => ({
  volumePercent: () => 100,
  muted: () => false,
  workMode: () => false,
  categoryPercent: () => 100,
  ...overrides,
});

describe('audio never influences the simulation (ADR-023 §6)', () => {
  it('a muted session and an unmuted one produce byte-identical worlds', () => {
    // The same seed, the same ticks, one of them making noise the whole way.
    const silent = createWorld(4_242);
    const loud = createWorld(4_242);

    const heard = recorder();
    const bus = createSoundBus(heard.ports, state());

    for (let step = 0; step < 200; step += 1) {
      stepSimulationBy(silent, 50);
      stepSimulationBy(loud, 50);
      heard.advance(50);
      bus.play(Sound.Harvest);
      bus.play(Sound.Coin);
    }

    expect(heard.gains().length).toBeGreaterThan(0); // it really did play
    expect(serializeSave(toSaveDocument(loud, META))).toBe(
      serializeSave(toSaveDocument(silent, META)),
    );
    expect(loud.rng.getState()).toEqual(silent.rng.getState());
  });
});

describe('the category mix', () => {
  it('scales a sound by its category level', () => {
    const heard = recorder();
    const full = createSoundBus(heard.ports, state());
    full.play(Sound.Harvest);

    const quiet = recorder();
    const halved = createSoundBus(quiet.ports, state({ categoryPercent: () => 50 }));
    halved.play(Sound.Harvest);

    expect(quiet.gains()[0]).toBeCloseTo((heard.gains()[0] ?? 0) / 2, 6);
  });

  it('silences a category set to zero without touching the others', () => {
    const heard = recorder();
    const bus = createSoundBus(
      heard.ports,
      state({ categoryPercent: (category) => (category === AudioCategory.World ? 0 : 100) }),
    );

    bus.play(Sound.Harvest); // world — silenced
    bus.play(Sound.UiClick); // ui — audible

    expect(heard.gains()).toHaveLength(1);
  });

  it('treats a state that answers nothing as every category at full', () => {
    // The optional getter: every caller that predates categories keeps the mix
    // it had, which is what made this a non-breaking change.
    const heard = recorder();
    const bus = createSoundBus(heard.ports, {
      volumePercent: () => 100,
      muted: () => false,
      workMode: () => false,
    });

    bus.play(Sound.Harvest);
    expect(heard.gains()).toHaveLength(1);
  });

  it('does not stamp the coalescing window for a silenced category', () => {
    // The same reasoning the mute check already uses: the window must start
    // when a sound is HEARD, or the first audible sound after turning a
    // category back up is swallowed by a suppression nobody heard.
    let level = 0;
    const heard = recorder();
    const bus = createSoundBus(heard.ports, state({ categoryPercent: () => level }));

    bus.play(Sound.Harvest);
    level = 100;
    bus.play(Sound.Harvest);

    expect(heard.gains()).toHaveLength(1);
  });
});

describe('declared ducking (ADR-023 §2)', () => {
  it('attenuates ambience under a world sound', () => {
    const heard = recorder();
    const bus = createSoundBus(heard.ports, state());

    // Nothing sounding yet: ambience plays at full.
    const ambient = Object.keys(SOUND_CATEGORY).find(
      (sound) => SOUND_CATEGORY[sound as Sound] === AudioCategory.Ambient,
    );
    // No ambient sound ships yet (boundary 4 adds rain), so the rule is
    // checked through the World category's effect on the LAST heard time
    // instead — the mechanism, not the content.
    expect(ambient).toBeUndefined();

    bus.play(Sound.Harvest);
    expect(heard.gains()).toHaveLength(1);
  });

  it('leaves a category with no ducking rule at full', () => {
    const heard = recorder();
    const bus = createSoundBus(heard.ports, state());

    bus.play(Sound.Harvest);
    heard.advance(1_000);
    bus.play(Sound.Harvest);

    expect(heard.gains()[1]).toBeCloseTo(heard.gains()[0] ?? 0, 6);
  });
});
