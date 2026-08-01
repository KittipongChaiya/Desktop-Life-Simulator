/**
 * The audio device. Phase-07.5a — ADR-016.
 *
 * The ONE place that knows a sound is a file. Everything above it names
 * sounds (`sounds.ts`) or decides audibility (`audio.ts`), which is what keeps
 * both testable in Node and what lets the placeholder set be replaced without
 * a call site changing.
 *
 * `HTMLAudioElement` rather than the Web Audio API: the bus already coalesces
 * bursts, so nothing here needs a mixing graph, and an element per sound is
 * both simpler and impossible to leak. Elements are constructed once at boot
 * and rewound on each play — allocating one per harvest would churn the heap
 * of an app whose whole pitch is that you can leave it running.
 *
 * Every failure is swallowed. A machine with no audio device, a codec the
 * build did not expect, an autoplay policy — none of them are worth a broken
 * farm, and the bus treats silence as a perfectly good degraded state.
 */

import coinUrl from '@assets/audio/coin.wav';
import depositUrl from '@assets/audio/deposit.wav';
import errorUrl from '@assets/audio/error.wav';
import harvestUrl from '@assets/audio/harvest.wav';
import notificationUrl from '@assets/audio/notification.wav';
import placementUrl from '@assets/audio/placement.wav';
import plantUrl from '@assets/audio/plant.wav';
import selectionUrl from '@assets/audio/selection.wav';
import tillUrl from '@assets/audio/till.wav';
import uiClickUrl from '@assets/audio/ui-click.wav';

import type { AudioPorts } from '../app/audio';
import { Sound } from '../app/sounds';

/**
 * Catalogue key → bundled URL.
 *
 * Exhaustive by type: adding a `Sound` without a file fails the build here
 * rather than playing silence in a state nobody tests.
 */
const SOUND_URL: Readonly<Record<Sound, string>> = {
  [Sound.Harvest]: harvestUrl,
  [Sound.Deposit]: depositUrl,
  [Sound.Coin]: coinUrl,
  [Sound.Placement]: placementUrl,
  [Sound.Selection]: selectionUrl,
  [Sound.UiClick]: uiClickUrl,
  [Sound.Notification]: notificationUrl,
  [Sound.Till]: tillUrl,
  [Sound.Plant]: plantUrl,
  [Sound.Error]: errorUrl,
};

export function createWebAudioPorts(): AudioPorts {
  // Elements are built on FIRST PLAY, not at boot.
  //
  // Sound ships muted (ADR-016 §3), so the overwhelming majority of sessions
  // never construct a single one — eight media loads competing with the
  // renderer's first paint, for nothing. Building them eagerly measurably
  // slowed startup under load: it turned two E2E specs flaky the day audio
  // landed, both waiting on UI that took longer to become interactive.
  //
  // The cost is a small delay on the first play of each sound, once per
  // session, on files of a few kilobytes each.
  const elements = new Map<Sound, HTMLAudioElement>();

  const elementFor = (sound: Sound): HTMLAudioElement | undefined => {
    const existing = elements.get(sound);
    if (existing !== undefined) return existing;

    const url = SOUND_URL[sound];
    const created = new Audio(url);
    elements.set(sound, created);
    return created;
  };

  return {
    play(sound, gain) {
      const element = elementFor(sound);
      if (element === undefined) return;

      element.volume = Math.max(0, Math.min(1, gain));
      element.currentTime = 0;
      // `play()` returns a promise that rejects on a blocked autoplay policy.
      // Swallowed here rather than in the bus, because this is the layer that
      // knows the rejection is a device concern and not a game one.
      void element.play().catch(() => undefined);
    },

    now: () => performance.now(),
  };
}
