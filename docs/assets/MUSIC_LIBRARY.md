# MUSIC_LIBRARY

> **Status:** Forward-looking catalog. **No music ships in v0.1** (`VISION.md §5.2`); this lists the tracks the game will grow into, so v0.2+ composition works a plan rather than a blank page.
> **Owns:** The catalog of intended music tracks — each track's context, mood/instrumentation intent, roadmap tier, and loop behaviour.
> **Does not own:** The music _philosophy_ (`AUDIO_DIRECTION.md`); the audio _pipeline/format_ (`ADR-006 §8`, `ASSETS.md §3`); file _names_ (`bgm_` family, `NAMING_CONVENTION.md`); the places tracks evoke (`WORLD_BIBLE.md`); the roadmap that schedules them (`VISION.md §4`).

**Boundary note.** Every track obeys `AUDIO_DIRECTION.md` — gentle, sparse, cross-fading, low-fatigue, ignorable. This file only says _which_ tracks exist and _what each is for_. Moods below are intent, not specification; the direction is the law.

All entries are **v0.2 or later.** The column marks the earliest tier a track ships in (`VISION.md §4`).

---

## 1. Time of day (v0.2)

Day/night is a v0.2 feature (`VISION.md §5.2`); these cross-fade with the cycle (`AUDIO_DIRECTION.md §2`).

| Track   | Ships | Mood intent                                       | Loop               |
| ------- | ----- | ------------------------------------------------- | ------------------ |
| Morning | v0.2  | Fresh, hopeful, waking — light and warm           | Long, seamless     |
| Day     | v0.2  | Calm, content, spacious — the default working bed | Long; may rest     |
| Evening | v0.2  | Softening, golden, winding down                   | Long, seamless     |
| Night   | v0.2  | Still, quiet, safe — near-silence is correct      | Sparse; long rests |

## 2. Weather (v0.2)

Layer over the time-of-day bed, never replacing it (`AUDIO_DIRECTION.md §4`).

| Track | Ships | Mood intent                                       | Loop             |
| ----- | ----- | ------------------------------------------------- | ---------------- |
| Rain  | v0.2  | Cozy, soothing, indoors-feeling — never gloomy    | Long, gentle     |
| Storm | v0.2  | A touch more presence, still calm — never violent | Long; no startle |

## 3. Seasons (v0.2)

Tint the score as the season palettes tint the art (`COLOR_PALETTE.md §7`).

| Track  | Ships | Mood intent                   |
| ------ | ----- | ----------------------------- |
| Spring | v0.2  | Fresh, bright, growing        |
| Summer | v0.2  | Warm, abundant, easy          |
| Autumn | v0.2  | Cozy, golden, harvest-content |
| Winter | v0.2  | Still, soft, hushed           |

## 4. Places (v0.3–v1.0)

Evoke the biomes/regions of `WORLD_BIBLE.md §3`.

| Track   | Ships | Mood intent                                                             |
| ------- | ----- | ----------------------------------------------------------------------- |
| Farm    | v0.2  | The home bed — warm, tended, the core working score                     |
| Village | v0.3  | Neighbourly, gentle, small-community warmth                             |
| Town    | v0.3  | A little livelier, still cozy — market-day feeling                      |
| Mine    | v0.4  | Quiet, echoing, old — sparse and low                                    |
| Dungeon | v1.0  | Gentle mystery, not horror — the one uneasy score (`WORLD_BIBLE.md §9`) |

## 5. Events & states (v0.2–v1.0)

| Track    | Ships | Mood intent                                                                      |
| -------- | ----- | -------------------------------------------------------------------------------- |
| Menu     | v0.2  | Inviting, calm — "welcome back" (`ART_DIRECTION.md §3`)                          |
| Festival | v0.2  | Joyful, communal, the year's celebration (`LORE_BIBLE.md §13`)                   |
| Relax    | v0.2  | The most ambient bed — near-silent, for long idle play                           |
| Victory  | v1.0  | Warm triumph, brief — reward, not fanfare                                        |
| Boss     | v1.0  | Present and driving-but-not-frantic; imposing by scale (`AUDIO_DIRECTION.md §6`) |
| Credits  | v0.2+ | Reflective, warm, a gentle send-off                                              |

---

## 6. Consistency rules

1. **Every track obeys `AUDIO_DIRECTION.md`** — sparse, cross-fading, low-fatigue, mutable. A track that must always play, or carries a sharp recurring hook, is wrong (`AUDIO_DIRECTION.md §8`).
2. **None ship in v0.1** (`VISION.md §5.2`); the tier column is the earliest release.
3. **Names use the `bgm_` family** (`NAMING_CONVENTION.md`); the pipeline is `ADR-006 §8`.
4. **Places match the world** (`WORLD_BIBLE.md §3`); no track invents a locale the world bible has not established.
5. **Reward is the peak, unease the rare exception** — brightness accompanies gain; the only uneasy score is the v1.0 dungeon/boss, and even it stays out of horror.

---

## 7. Related documents

| Document                | Relationship                                      |
| ----------------------- | ------------------------------------------------- |
| `AUDIO_DIRECTION.md`    | The philosophy every track obeys                  |
| `SFX_LIBRARY.md`        | The companion sound-effect catalog                |
| `WORLD_BIBLE.md §3, §9` | The places the location tracks evoke              |
| `COLOR_PALETTE.md §7`   | The season structure the seasonal tracks parallel |
| `VISION.md §4, §5.2`    | The roadmap tiers and the v0.2 audio deferral     |
| `NAMING_CONVENTION.md`  | The `bgm_` naming family                          |
| `ADR-006 §8`            | The audio pipeline                                |
