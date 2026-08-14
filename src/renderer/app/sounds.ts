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
  /** A hoe breaking ground. Phase-07.7i. */
  Till: 'till',
  /** A seed going in. Phase-07.7i. */
  Plant: 'plant',
  /**
   * Rain falling — the first ambient BED. Phase-13d, ADR-023 §5.
   *
   * Unlike every sound above it, this is continuous and is not triggered by an
   * event: it sounds for as long as it is raining and the five §5 conditions
   * hold. It is played through `AmbienceDevice`, never through `SoundBus.play`,
   * because a bed has to be adjustable and stoppable.
   */
  Rain: 'rain',
} as const;

/*
 * DELIBERATELY ABSENT (07.7i): worker footsteps and button hover, both of
 * which the phase-07.7 brief §7 names.
 *
 * A FOOTSTEP IS AN AMBIENT BED WEARING A DIFFERENT NAME. A farm exists to run
 * itself, so its workers are walking essentially always; a step sound is
 * therefore continuous sound with extra steps, and this catalogue already
 * rejected continuous sound for the reason below. Coalescing does not save it
 * either — suppressing repeats of a sound that should not be playing at all
 * just makes it intermittent.
 *
 * A HOVER IS NOT AN ACTION. The overlay sits at the bottom of the screen and
 * the pointer crosses it on the way to other windows, so a hover sound fires
 * while the player is doing something else entirely — the precise intrusion
 * `VISION.md` §5.1 forbids. A click is an intent and already has `UiClick`.
 *
 * Both are hooks that could be added the moment something makes them
 * appropriate — a single worker the player is following, a deliberate focus
 * mode. Neither is appropriate now, and a catalogue entry with no honest
 * trigger is the unreachable code Rule 6 forbids.
 */

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
  // Tilling and planting are the actions a player repeats most, so they sit
  // BELOW the harvest that rewards them — the loop should get quieter as it
  // gets more frequent, not louder.
  [Sound.Till]: 0.28,
  [Sound.Plant]: 0.22,
  // The bed sits below everything, and below its own category ceiling: it is
  // the only sound a player hears for an hour at a time, and ADR-023 §2 already
  // ducks it under ui and world. Weather should be behind the farm, not in
  // front of it.
  [Sound.Rain]: 0.18,
};

/**
 * The mix categories. Phase-13b — ADR-023 §2.
 *
 * **Engine-owned and CLOSED.** A content source assigns a sound to one of
 * these; it may not invent one. An open set makes the mix unpredictable and
 * hands every plugin a way to be the loudest thing on someone's desktop.
 *
 * Four is the whole set, and each earns its place by being separately
 * silenceable: a player who wants the farm's sounds without music, or ambience
 * without UI clicks, is expressing a preference the mixer can honour without
 * anyone inventing a fifth bus.
 */
export const AudioCategory = {
  /** Buttons, panels, confirmations — anything the player caused directly. */
  Ui: 'ui',
  /** The farm making noise: harvests, deposits, coins, placement. */
  World: 'world',
  /** Continuous beds. The only category ADR-023 §5's conditions apply to. */
  Ambient: 'ambient',
  /** Music. Nothing registers here yet. */
  Music: 'music',
} as const;

export type AudioCategory = (typeof AudioCategory)[keyof typeof AudioCategory];

export const AUDIO_CATEGORIES: readonly AudioCategory[] = [
  AudioCategory.Ui,
  AudioCategory.World,
  AudioCategory.Ambient,
  AudioCategory.Music,
];

/**
 * Which bus each shipped sound plays on.
 *
 * Exhaustive by type: a new `Sound` without a category fails the build here
 * rather than defaulting into a bus nobody chose for it.
 */
export const SOUND_CATEGORY: Readonly<Record<Sound, AudioCategory>> = {
  [Sound.Harvest]: AudioCategory.World,
  [Sound.Deposit]: AudioCategory.World,
  [Sound.Coin]: AudioCategory.World,
  [Sound.Placement]: AudioCategory.World,
  [Sound.Till]: AudioCategory.World,
  [Sound.Plant]: AudioCategory.World,
  [Sound.Selection]: AudioCategory.Ui,
  [Sound.UiClick]: AudioCategory.Ui,
  [Sound.Notification]: AudioCategory.Ui,
  [Sound.Error]: AudioCategory.Ui,
  [Sound.Rain]: AudioCategory.Ambient,
};

/**
 * Declared ducking: a category attenuates while another is sounding.
 *
 * **A static declaration, not a runtime analyser** (ADR-023 §2). An analyser is
 * a continuously-running signal path, which is precisely what ADR-023 §5 is
 * spending its idle budget on carefully — paying for one so that rain gets
 * quieter under a coin would be the budget spent on the wrong thing.
 *
 * One entry: ambience steps back under anything the player caused or the farm
 * did, then returns. Rain should not compete with the sound of a harvest.
 */
export const AUDIO_DUCKING: readonly {
  readonly category: AudioCategory;
  readonly under: readonly AudioCategory[];
  /** Multiplier applied while any `under` category is sounding. */
  readonly to: number;
}[] = [
  {
    category: AudioCategory.Ambient,
    under: [AudioCategory.Ui, AudioCategory.World],
    to: 0.45,
  },
];

/** How long a sound counts as "recently played" for ducking. */
export const DUCK_HOLD_MS = 400;
