/**
 * The sound catalogue. Phase-07.5a — ADR-016.
 *
 * Every sound the game can make, named once. The catalogue is deliberately
 * separate from both the bus (which decides whether a sound is audible) and
 * the player (which knows how to make noise): a component asks for
 * `Sound.Harvest` and never learns what file that is, so replacing the
 * placeholder set is a change to the asset pipeline and to nothing else
 * (`fix/0.1/7.5.md` — "future replacement must require no code changes").
 *
 * Per-sound gain lives here rather than in the assets because the placeholders
 * are synthesised at a uniform amplitude; balancing them by editing waveforms
 * would have to be redone the moment real audio arrives. These numbers are the
 * MIX, and they survive the asset swap.
 */

/** Every sound `fix/0.1/7.5.md` §Audio names, and nothing else. */
export const Sound = {
  /** A crop is harvested. The loop's most frequent event. */
  Harvest: 'harvest',
  /** A worker deposits into storage. */
  Deposit: 'deposit',
  /** Coins arrive — a sale, manual or automatic. */
  Coin: 'coin',
  /** A building is placed. */
  Placement: 'placement',
  /** A worker is selected. */
  Selection: 'selection',
  /** Any ordinary UI button. */
  UiClick: 'ui-click',
  /** A player-facing notification — the return summary arriving. */
  Notification: 'notification',
  /** A genuine error. Rare by design (`GAME_DESIGN.md` §10.1 rule 6). */
  Error: 'error',
} as const;

/*
 * DELIBERATELY ABSENT: the ambient beds (wind, birds, grass) `fix/0.1/7.5.md`
 * §Audio also lists.
 *
 * They are continuous sound, and this phase already decided against continuous
 * ambience for the same reason it decided against idle grass sway: a desktop
 * companion that hums to itself beside real work is a background game, not a
 * companion (`VISION.md` §2.1). Catalogue entries with no trigger would also
 * be exactly the unreachable code `AI_RULES.md` Rule 6 forbids — every sound
 * here has a real producer.
 *
 * Recorded in `docs/phases/phase-07.5-vertical-slice.md` as a v0.2 candidate,
 * where ambience belongs behind its own setting and a measured idle budget.
 */

export type Sound = (typeof Sound)[keyof typeof Sound];

/** Every key, for the generator and the exhaustiveness tests. */
export const SOUNDS = Object.values(Sound);

/**
 * The mix, 0–1, applied before the player's master volume.
 *
 * Harvest sits low because it is the sound heard most: at three workers on a
 * mature farm it fires several times a minute, and a companion's most frequent
 * sound must be the one you stop noticing. Error sits highest because it is
 * the rarest and the only one that must not be missed.
 */
export const SOUND_GAIN: Readonly<Record<Sound, number>> = {
  [Sound.Harvest]: 0.35,
  [Sound.Deposit]: 0.3,
  [Sound.Coin]: 0.45,
  [Sound.Placement]: 0.5,
  [Sound.Selection]: 0.25,
  [Sound.UiClick]: 0.2,
  [Sound.Notification]: 0.5,
  [Sound.Error]: 0.6,
};
