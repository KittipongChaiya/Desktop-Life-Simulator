# ADR-016: Audio

**Status:** Accepted
**Date:** 2026-07-27
**Phase:** 07.5a (Vertical Slice — `fix/0.1/7.5.md` §Audio)
**Bound by (not re-litigated):** `VISION.md` §2.1 (the desktop comes first), §5.1 (never a notification spammer); ADR-001 (render-on-demand — audio may not cost a frame); ADR-003 (process boundaries); ADR-007 §1 (presentation state never enters the simulation); ADR-014 (the companion's presence dials); ADR-006 (the asset pipeline); ADR-012 (the freeze this is authored under — `ASSETS.md` is a working document, not a frozen one).

---

## Context

v0.1 ships without a single sound. `fix/0.1/7.5.md` asks for placeholder audio across eight events so the loop acknowledges the player, and requires that **replacing the placeholders later needs no code changes**.

`ASSETS.md` §3 previously listed audio as "v0.2+". That row is a working-document expectation rather than a frozen decision, so this ADR moves it forward and says how.

Three things make audio non-obvious here, and they are the reason this is an ADR rather than a commit:

1. **This is a desktop companion.** Sound is the most intrusive channel a background overlay has. A wrong default is not a polish miss; it is the product failing at its one hard constraint.
2. **Render-on-demand.** The overlay draws nothing when nothing changes. Anything that ticks continuously — including an ambient bed — reintroduces the idle cost ADR-001 exists to avoid.
3. **The simulation is pure and headless.** Sound must reach the player without the sim ever learning it exists.

---

## Decision

### 1. Audio lives in the renderer, in three layers

| Layer                                 | Knows                           | Does not know                      |
| ------------------------------------- | ------------------------------- | ---------------------------------- |
| `app/sounds.ts` — the catalogue       | Which sounds exist, and the mix | What a sound is made of            |
| `app/audio.ts` — the bus              | Whether a sound is audible now  | What a sound is, or how to play it |
| `bootstrap/web-audio.ts` — the device | That a sound is a file          | Why it is playing                  |

Call sites name a sound (`Sound.Harvest`) and learn nothing else. That is what makes the bus testable in Node, and what makes the asset swap a pipeline change rather than a code change.

Nothing reaches `src/sim`. The simulation publishes events because events are useful (ADR-008); that a subscriber turns one into a noise is invisible to it (ADR-007 §1).

### 2. Volume is the companion's fifth presence dial

Audio rides the existing companion state and `settings.json` category rather than growing a parallel preference system. Opacity governs how much the overlay intrudes on the eye; volume governs how much it intrudes on the ear. They are the same kind of decision and they get the same treatment: sanitized in main, persisted outside the save, never touched by loading a game (ADR-014 §4).

**Work mode silences audio unconditionally**, by the same precedence that dims the window. A mode whose purpose is to stop the overlay competing for attention cannot keep making noise.

### 3. Sound is off until asked for

`AUDIO_MUTED_BY_DEFAULT = true`.

An overlay that starts making noise the moment it launches — beside a call, a game, an hour of focus — is the most intrusive thing this product could do, and `VISION.md` §5.1 already forbids the milder version of it. The bus is fully wired and one toggle away; this is a default, not an unfinished feature, and reversing it is one constant.

### 4. No ambient beds, and no continuous audio at all

`fix/0.1/7.5.md` lists ambient wind, birds, and grass. They are declined for v0.1, for the same reason phase-07.5 declined idle grass sway: continuous ambience is a background game's behaviour, not a companion's, and a looping bed is the audible form of the idle cost ADR-001 spends its whole design avoiding.

Every sound that ships is **triggered by something that already happened** — a published event or a settled snapshot — so silence is the resting state, exactly as a blank frame is.

### 5. Bursts coalesce

A sound suppresses a repeat of itself for 250 ms. Three workers finishing a harvest on the same tick is ordinary — the seed bin exists to make it so — and three overlapping samples would turn the farm's most satisfying moment into its most irritating one. The window starts when a sound is actually _heard_, so a muted stretch never swallows the first sound after an unmute.

### 6. Placeholders are scripted, and replacement is a file drop

`scripts/generate-audio.mjs` synthesises the set deterministically and writes it to the gitignored `assets/dist/audio/`, exactly as the pixel art is generated: the script is the editable source and its git history is the asset's version (ADR-006 §2).

**The replacement path:** drop a real `assets/src/audio/<name>.wav` into the tree. The script copies it through instead of synthesising. No renderer code, no catalogue entry, and no call site changes — which is the requirement, satisfied structurally rather than by promise.

---

## Consequences

**Good.** The loop acknowledges the player. The sim is untouched. The bus is pure and unit-tested without a browser. Nothing costs a frame or an idle watt. Replacing the placeholder set is a content task with no engineering in it.

**Costs, accepted.**

- **Most players will never hear it**, because it ships muted. That is the correct trade for this product; discoverability is handled by putting the control beside the opacity dial where a player looking for it will look.
- **`HTMLAudioElement`, not Web Audio.** No mixing graph, no per-sound pitch variation, no crossfades. The bus already coalesces, so the graph would buy expressiveness the placeholders cannot use. Revisit when real audio arrives.
- **Sounds cannot overlap with themselves.** A consequence of one element per sound. Correct at v0.1's density; a real audio pass may want voice pooling.
- **`ASSETS.md` moves audio from "v0.2+" to shipped**, with the format row (`.wav` 44.1 kHz) honoured as written.

---

## Alternatives considered

| Alternative                                  | Why not                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Synthesise at runtime from a spec table**  | Replacing a placeholder would then require switching the code to file loading — the opposite of the requirement |
| **Ship audio unmuted at a low volume**       | Unasked-for noise from a background overlay is the product's worst failure mode, not a tuning question          |
| **Web Audio API with a mixing graph**        | Buys expressiveness the placeholder set cannot use, at the cost of a graph to maintain and leak                 |
| **Audio in the main process**                | Main owns platform behaviour, not presentation; and it would need a second copy of every trigger                |
| **Sound triggers inside `src/sim`**          | Forbidden outright — the simulation is pure and headless (ADR-003 §2, ADR-007 §1)                               |
| **Ambient beds behind a setting, in v0.1**   | A continuous audio path is an idle-cost commitment that deserves its own measured budget; deferred to v0.2      |
| **A `sound()` call in every button handler** | A rule that gets forgotten as panels are added; one delegated listener cannot be                                |

---

## References

| Document                                   | Relationship                                                       |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `fix/0.1/7.5.md` §Audio                    | The directive this implements                                      |
| `ASSETS.md` §3                             | Amended: audio moves from "v0.2+" to shipped, format row unchanged |
| ADR-014                                    | The presence-dial family volume joins                              |
| ADR-001                                    | The idle-cost guarantee that rules out continuous ambience         |
| ADR-006                                    | The scripted-asset provenance model the generator follows          |
| `docs/phases/phase-07.5-vertical-slice.md` | The phase, and the matching decision on idle motion                |
