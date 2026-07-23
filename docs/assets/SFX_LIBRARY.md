# SFX_LIBRARY

> **Status:** Forward-looking catalog. **No sound effects ship in v0.1** (`VISION.md §5.2`); this lists the effects the game will grow into, so v0.2+ sound design works a plan rather than a blank page.
> **Owns:** The catalog of intended sound effects — each effect's event name, context, intent, roadmap tier, and trigger/sync behaviour.
> **Does not own:** The sound _philosophy_ — mixing, never-alarm, loop rules (`AUDIO_DIRECTION.md`); the audio _pipeline/format_ (`ADR-006 §8`, `ASSETS.md §3`); the file-name _grammar_ (`sfx_<event>[_<n>].wav`, `NAMING_CONVENTION.md §4.2`); the actions and their durations that effects sync to (`GAME_DESIGN.md §4.3`, `ANIMATION_GUIDE.md`); the roadmap that schedules features (`VISION.md §4`).

**Boundary note.** Every effect obeys `AUDIO_DIRECTION.md` — soft, satisfying, never alarming, ducked under nothing more important than itself (`AUDIO_DIRECTION.md §7`). This file only says _which_ effects exist, _what each is for_, and _when it fires_. The `Event` column supplies the `<event>` token `NAMING_CONVENTION.md §4.2` builds file names from (`sfx_harvest.wav`, `sfx_step_0.wav`).

All entries are **v0.2 or later** (`VISION.md §5.2`). The tier column is the earliest release an effect can ship in, following the roadmap (`VISION.md §4`): weather/animals/audio arrive in v0.2, contracts in v0.3, mining/factories in v0.4, combat/magic/bosses in v1.0.

---

## 1. Farm actions (v0.2)

One-shots that confirm a worker or player action. Each **syncs to its animation and fills the action's sim duration** (`ANIMATION_GUIDE.md`, `GAME_DESIGN.md §4.3`) — satisfaction, not spectacle (`AUDIO_DIRECTION.md §6`).

| Event     | Ships | Intent                                                 | Trigger / sync         |
| --------- | ----- | ------------------------------------------------------ | ---------------------- |
| `till`    | v0.2  | A gentle, earthy _thunk_ of the hoe                    | Till action (1.5 s)    |
| `plant`   | v0.2  | A soft press of seed into soil                         | Plant action (1.0 s)   |
| `water`   | v0.2  | A light pour and patter                                | Water action (1.0 s)   |
| `harvest` | v0.2  | A crisp, pleasing rustle-and-pluck — the loop's payoff | Harvest action (1.5 s) |
| `deposit` | v0.2  | A soft tumble of goods into storage                    | Deposit action (1.0 s) |

## 2. Movement (v0.2)

| Event  | Ships | Intent                                     | Trigger / sync                                                                                               |
| ------ | ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `step` | v0.2  | Soft, low footfalls — felt more than heard | Worker steps; round-robin variants (`sfx_step_0…`, `NAMING_CONVENTION.md §4.2`) so repetition never patterns |

Footsteps sit at the very bottom of the mix (`AUDIO_DIRECTION.md §7`); with several workers walking, steps thin out rather than stack up.

## 3. Reward & economy (v0.2)

The emotional peak of the mix — the one family the ear learns to want (`AUDIO_DIRECTION.md §6`, mirroring Reward Gold, `COLOR_PALETTE.md §4`).

| Event  | Ships | Intent                                           | Trigger / sync                      |
| ------ | ----- | ------------------------------------------------ | ----------------------------------- |
| `coin` | v0.2  | A warm, pleasant chime — reward, never a jackpot | Sale proceeds / income lands        |
| `buy`  | v0.2  | A soft counter-tap of a purchase made            | Spend confirmed (seeds, hire, land) |

## 4. Building (v0.2)

| Event         | Ships | Intent                                           | Trigger / sync               |
| ------------- | ----- | ------------------------------------------------ | ---------------------------- |
| `build_place` | v0.2  | A settled, wooden _thump_ — something now exists | Building placement confirmed |

## 5. Weather ambience (v0.2)

Loops, not one-shots — layers over the ambient bed, never replacing it (`AUDIO_DIRECTION.md §4`). Long, seamless, hook-free (`AUDIO_DIRECTION.md §8`).

| Event   | Ships | Intent                                                                                | Trigger / sync                               |
| ------- | ----- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| `rain`  | v0.2  | Cozy, soothing rainfall — never gloomy                                                | Rain weather active; loop                    |
| `wind`  | v0.2  | A gentle, low breath through foliage                                                  | Ambient layer; loop                          |
| `birds` | v0.2  | Soft, occasional farm birdsong — sparse, never chattering (`AUDIO_DIRECTION.md §3–4`) | Ambient layer, daytime; loop with long rests |

## 6. UI (v0.2)

Soft, small, and few (`AUDIO_DIRECTION.md §5`); the interface's voice, styled quiet like its look (`UI_STYLE_GUIDE.md`).

| Event          | Ships | Intent                                         | Trigger / sync                                                        |
| -------------- | ----- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `button`       | v0.2  | A gentle, low click                            | Button press                                                          |
| `inventory`    | v0.2  | A quiet shuffle of goods                       | Inventory panel open/close                                            |
| `notification` | v0.2  | A soft, brief tone — informative, never urgent | In-game notice; **never** an OS notification sound (`VISION.md §5.1`) |

Errors get at most a soft neutral tone — never a buzzer (`GAME_DESIGN.md §10.1`, `VISION.md §2.2`).

## 7. Animals (v0.2+)

Soft, occasional, friendly — a presence, never a demand (`AUDIO_DIRECTION.md §6`). One event per animal as they arrive; round-robin variants keep calls natural.

| Event           | Ships | Intent                                                                 | Trigger / sync                           |
| --------------- | ----- | ---------------------------------------------------------------------- | ---------------------------------------- |
| `animal_<name>` | v0.2+ | A distant cluck, low, or bleat — one per species (`WORLD_BIBLE.md §4`) | Sparse idle calls; never on a fixed beat |

## 8. Gathering beyond the farm (v0.2+ – v0.4)

| Event     | Ships | Intent                                                     | Trigger / sync                                                |
| --------- | ----- | ---------------------------------------------------------- | ------------------------------------------------------------- |
| `fishing` | v0.2+ | A soft cast and plip; a brighter splash on the catch       | Cast one-shot + catch one-shot (`ANIMATION_GUIDE.md`)         |
| `mining`  | v0.4  | A patient pick-strike with a satisfying crack on the break | Strike per swing, echoing in the mine (`WORLD_BIBLE.md §3.2`) |

## 9. Crafting & factory (v0.4)

A steady, cozy rhythm of making — craft, never industry (`AUDIO_DIRECTION.md §6`, `WORLD_BIBLE.md §6`).

| Event     | Ships | Intent                                                 | Trigger / sync                         |
| --------- | ----- | ------------------------------------------------------ | -------------------------------------- |
| `craft`   | v0.4  | A warm tap-and-fit of something being made             | Craft completes                        |
| `factory` | v0.4  | A low, gentle mechanical loop — a workshop, not a mill | Machine running; loop, rests when idle |

## 10. Quests & contracts (v0.3)

| Event   | Ships | Intent                                                                        | Trigger / sync                                 |
| ------- | ----- | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `quest` | v0.3  | A warm note of acceptance; a brighter one on completion — reward, not fanfare | Contract accepted / fulfilled (`VISION.md §4`) |

## 11. Combat, magic & bosses (v1.0)

Clear, readable, **never twitch or gory** (`VISION.md §5.1`); imposing through scale, not shock (`AUDIO_DIRECTION.md §6`). Magic sounds wait for magic itself, reserved until it is designed (`WORLD_BIBLE.md §8`, `LORE_BIBLE.md §9`).

| Event    | Ships | Intent                                                 | Trigger / sync                 |
| -------- | ----- | ------------------------------------------------------ | ------------------------------ |
| `combat` | v1.0  | Readable hit/resolve tones — tactical clarity, no gore | Combat resolution events       |
| `magic`  | v1.0  | Soft, wondrous, old — the hum of the giving land       | Spell effects (reserved)       |
| `boss`   | v1.0  | Deep, slow presence — big, never startling             | Boss actions; scale over shock |

---

## 12. Consistency rules

1. **Every effect obeys `AUDIO_DIRECTION.md`** — soft, satisfying, ignorable; reward one-shots read first in the mix (`AUDIO_DIRECTION.md §7`), and nothing startles.
2. **None ship in v0.1** (`VISION.md §5.2`); the tier column is the earliest release, and it follows the feature roadmap (`VISION.md §4`) — no effect ships before its feature.
3. **Action sounds sync to the animation and fill the sim duration** (`GAME_DESIGN.md §4.3`, `ANIMATION_GUIDE.md`).
4. **Names use the `sfx_` family** (`NAMING_CONVENTION.md §4.2`); repeated triggers use zero-indexed round-robin variants; the pipeline is `ADR-006 §8` / `ASSETS.md §3`.
5. **Nothing alarms and nothing spams** — errors stay near-silent, notifications stay in-game and quiet (`VISION.md §2.2, §5.1`, `GAME_DESIGN.md §10.1`).

---

## 13. Related documents

| Document                         | Relationship                                                           |
| -------------------------------- | ---------------------------------------------------------------------- |
| `AUDIO_DIRECTION.md`             | The philosophy every effect obeys                                      |
| `MUSIC_LIBRARY.md`               | The companion music catalog                                            |
| `GAME_DESIGN.md §4.3`            | The action timings one-shots fill                                      |
| `ANIMATION_GUIDE.md`             | The animations action sounds sync to                                   |
| `NAMING_CONVENTION.md §4.2`      | The `sfx_<event>[_<n>].wav` naming family                              |
| `ADR-006 §8`                     | The audio pipeline                                                     |
| `ASSETS.md §3`                   | Audio source/output formats                                            |
| `WORLD_BIBLE.md §3, §4, §6, §8`  | The places, animals, tech level, and reserved magic the effects voice  |
| `VISION.md §2.2, §4, §5.1, §5.2` | Never-alarm, the roadmap tiers, non-goals, and the v0.2 audio deferral |
