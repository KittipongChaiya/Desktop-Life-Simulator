# AUDIO_DIRECTION

> **Status:** Authoritative for audio _intent_. **Forward-looking — audio ships in v0.2, not v0.1** (`VISION.md §5.2`). Written now so the first note composed lands inside a locked direction, exactly as the art did.
> **Owns:** The creative direction for all sound — music philosophy, ambient philosophy, per-context ambience (weather, biome), UI sounds, animal/crafting/combat/factory sound intent, and the mixing and loop philosophies.
> **Does not own:** The audio _pipeline and format_ — WAV sources → `.ogg`, lazy-loaded, never blocking startup (`ADR-006 §8`, `ASSETS.md §3`); file _names_ (`bgm_`/`sfx_` families, `NAMING_CONVENTION.md`); the track and effect _catalogs_ (`MUSIC_LIBRARY.md`, `SFX_LIBRARY.md`); volume-settings UI (the v0.2 audio milestone, `PLAN.md §3`); the performance budget audio must fit (`PERFORMANCE.md`).

**Boundary note.** `STYLE_LOCK.md` governs the _visual_ canon; it does not bind audio. Audio's non-negotiable constraints come from the **product** instead: `VISION.md §2.1` (the idle budget and "the desktop comes first") and `§2.2` (reward absence, never alarm). This document is to sound what `ART_DIRECTION.md` is to art — the philosophy; `MUSIC_LIBRARY.md` and `SFX_LIBRARY.md` are the catalogs it governs.

**Why it exists before it is built.** The same logic as the visual canon (`phases/phase-05.5-asset-foundation.md`): v0.2's audio will be authored by sessions with no shared memory (`VISION.md §2.5`). A locked direction is the only way a hundred sounds cohere. It is cheap to write now and impossible to retrofit across a sound library.

---

## 1. The one principle: audio you can leave running all day

The game lives at the bottom of the screen while the player works (`VISION.md §1`). Its sound must survive **eight hours beside real work without becoming annoying** — the single hardest constraint, and the one every rule below serves. Audio is the sonic equivalent of the palette: **warm, calm, and unobtrusive** (`ART_DIRECTION.md §4`).

Three commitments follow:

1. **Ignorable by design.** Sound must be easy to tune out and trivial to mute (the v0.2 volume settings, `PLAN.md §3`). It is a gentle companion, never a demand for attention (`VISION.md §2.1`).
2. **Never alarming.** No sound signals stress, failure, or urgency from inattention — the audio counterpart of the reserved, unused Danger Red (`VISION.md §2.2`, `GAME_DESIGN.md §10.1`). Reward, not threat, is the loudest thing the player hears.
3. **Low-fatigue over long play.** Loops are long, seamless, and free of sharp recurring hooks that grate on the hundredth pass (§8).

---

## 2. Music philosophy

**Sparse, ambient, and optional.** Music sets a mood and then gets out of the way.

- **Gentle and instrumental** — soft acoustic textures (light strings, woodwind, mellow keys, warm pads), never driving percussion or loud melody.
- **It may fall to near-silence.** Long stretches of quiet ambience are correct; wall-to-wall music fatigues over a workday. Music breathes.
- **Cross-fades, never cuts.** Context changes (time of day, biome) cross-fade slowly so the score never jars (§8).
- **Reward is the emotional peak.** The brightest musical moments accompany growth, harvest, and unlocking — the "you gained something" of the palette (`COLOR_PALETTE.md §4`), in sound.

Music is catalogued in `MUSIC_LIBRARY.md`.

---

## 3. Ambient philosophy

Ambience is the world's quiet breath — often more present than music.

- **A soft bed of place.** Gentle wind, birdsong, rustling foliage, distant water — low, continuous, and layered under everything.
- **It tells the same story the art does.** Tended farm ambience is warm and alive; the wild edges (forest, mine) are quieter and older (`WORLD_BIBLE.md §3`). Ambience reinforces "where am I" without a word.
- **It never spikes.** Ambient beds hold a steady, low level; nothing in the bed startles.

---

## 4. Contextual ambience — weather & biome

Parallel to the season/biome _palettes_ (`COLOR_PALETTE.md §7, §8`), ambience is a **layer over a base bed, not a replacement** — the world stays sonically itself as it changes.

- **Weather** (v0.2): soft rain that soothes, distant gentle thunder for storms — never a violent, startling storm (the cozy register, `WORLD_BIBLE.md §5`). Weather ambience auto-mixes with the base bed.
- **Biome** (v0.4): farm birdsong, forest hush, the drip and echo of the mine, lapping water at the lake (`WORLD_BIBLE.md §3`) — each a tint on the ambient bed.

---

## 5. UI sounds

- **Soft, small, and few.** A gentle click for a button, a light chime for a confirmation, a quiet shuffle for inventory — brief and low (`UI_STYLE_GUIDE.md` styles the UI; this gives it its voice).
- **Never a harsh alert.** Errors are rare and inline (`GAME_DESIGN.md §10.1`); their sound, if any, is a soft neutral tone, never a jarring buzzer (`VISION.md §2.2`).
- **Notifications stay quiet and never spam.** The game does not push OS notification sounds for routine events (`VISION.md §5.1`).

---

## 6. Action, animal, crafting, combat & factory sound

The intent per family; concrete effects are catalogued in `SFX_LIBRARY.md`.

- **Player actions** (harvest, till, plant, water, deposit): soft, satisfying, tactile confirmations that **sync to the animation and its sim duration** (`ANIMATION_GUIDE.md`, `GAME_DESIGN.md §4.3`) — a gentle _thunk_ of a hoe, a light rustle of a harvest. Satisfaction, not spectacle.
- **Coins & reward:** a warm, pleasant chime — the one sound the ear learns to want (mirrors Reward Gold, `COLOR_PALETTE.md §4`).
- **Animals** (v0.2+): soft, occasional, friendly — a distant cluck or low, never a constant demand.
- **Crafting / factory** (v0.4): a steady, cozy rhythm of making — warm and mechanical-as-craft, never industrial noise (`WORLD_BIBLE.md §6`).
- **Combat** (v1.0): clear, readable, and **never twitch or gory** — resolution/tactical audio matching the visual rule (`VISION.md §5.1`, `ANIMATION_GUIDE.md`). Even a boss is imposing through scale, not shock.

---

## 7. Mixing philosophy

- **Generous headroom; nothing loud.** The mix sits comfortably below the player's other audio (music, calls, video). The game is the guest (`VISION.md §2.1`).
- **Duck, don't fight.** Ambience and music duck gently under important one-shots (a reward chime), then return — no clashing layers.
- **A clear hierarchy:** reward/confirmation one-shots read first, then UI, then ambience, then music. The player should always hear "something good happened" and never strain to hear it.
- **Independent volumes.** Music, ambience, SFX, and UI carry separate levels (the v0.2 settings, `PLAN.md §3`), so any layer can go to zero. Muting music entirely must leave a perfectly playable game.

---

## 8. Loop philosophy

Because the game runs all day, **loops are the highest-risk sound** — the audio equivalent of an off-screen animation burning CPU (`STYLE_LOCK.md R-12`, in spirit).

- **Long and seamless.** Loops are long enough that repetition is not obvious, with click-free loop points.
- **No sharp recurring hook.** A catchy motif that repeats every 30 seconds is intolerable by hour three; loop material is gentle and low-contour.
- **Silence is a valid loop state.** Ambience and music may rest; a loop that must always be audible is a defect.
- **Loops respect the budget.** Audio is lazy-loaded and never blocks startup (`ADR-006 §8`); playing audio stays within `PERFORMANCE.md`. Idle audio cost, like idle CPU, is a product concern.

---

## 9. Consistency rules

1. **Ignorable and mutable, always** (§1, §7) — any layer can go to zero and the game still works.
2. **Never alarming** (§1, §5) — no sound trains stress or punishes absence (`VISION.md §2.2`).
3. **Warm, calm, sparse** (§2, §3) — the sonic palette matches the visual one (`ART_DIRECTION.md §4`).
4. **Loops are long, seamless, and hook-free** (§8) — fit for all-day play.
5. **Sync action sound to animation and sim duration** (§6, `ANIMATION_GUIDE.md`, `GAME_DESIGN.md §4.3`).
6. **Pipeline and product win.** If this conflicts with `ADR-006 §8`/`ASSETS.md §3` (format) or `VISION.md §2.1/§2.2/§5.2` (product), those own their domains and this file is corrected.

---

## 10. Related documents

| Document                     | Relationship                                          |
| ---------------------------- | ----------------------------------------------------- |
| `MUSIC_LIBRARY.md`           | The music catalog this direction governs              |
| `SFX_LIBRARY.md`             | The sound-effect catalog this direction governs       |
| `ADR-006 §8`                 | The audio pipeline — WAV → `.ogg`, lazy, non-blocking |
| `ASSETS.md §3`               | Audio source/output formats                           |
| `NAMING_CONVENTION.md`       | The `bgm_`/`sfx_` naming families                     |
| `VISION.md §2.1, §2.2, §5.2` | Idle budget, never-alarm, and audio deferred to v0.2  |
| `ART_DIRECTION.md §4`        | The mood the audio mirrors                            |
| `ANIMATION_GUIDE.md`         | Action animations that sound syncs to                 |
| `PERFORMANCE.md`             | The budget playing audio must fit                     |
