# Phase 07.5 — Vertical Slice / First Playable Experience

> **Delivers:** The v0.1 Release Candidate. Every system built so far, made to feel like one game.
> **Runnable at completion:** A first-time player launches the overlay, understands the farm without being told, and leaves it running while they work.
> **Governing directive:** `fix/0.1/7.5.md`. **No new gameplay systems.** Polish only, on what already exists.
> **Governing decisions:** ADR-001 (render-on-demand), ADR-005 (the React/Pixi split), ADR-007 (presentation never enters the simulation), ADR-014 (desktop companion), ADR-016 (audio).

---

## Objectives

1. Make the existing loop **legible** — a first-time player should infer how farming, workers, storage, and the economy work by watching them.
2. Make it **feel** responsive: every action acknowledged, immediately and proportionately.
3. Stay a **desktop companion**. Polish that costs idle CPU, steals focus, or makes noise unasked is not polish here — it is regression.
4. Preserve every architectural guarantee. Nothing in this phase may weaken determinism, render-on-demand, resource conservation, or save compatibility.

---

## Milestones

| #     | Milestone                       | Delivers                                                                                                                                    | Status        |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 07.5a | Audio foundation                | ADR-016; scripted placeholder `.wav` set; the renderer's sound bus wired to real events; volume/mute as app preferences; work mode silences | **Delivered** |
| 07.5b | Feedback effects                | Coin popup, harvest burst, placement confirm, selection pulse, inventory flash — event-driven, render-on-demand intact                      | —             |
| 07.5c | Camera polish                   | Eased follow, zoom limits, edge clamping, drag feel; player input always wins                                                               | —             |
| 07.5d | UI & accessibility polish       | Spacing, hierarchy, typography, contrast, click targets, interaction states, colour-blind-safe indicators                                   | —             |
| 07.5e | World presentation              | Terrain variation, ground decoration and props from the existing art, depth ordering, contact shadows                                       | —             |
| 07.5f | QA, performance & the RC report | Extended validation, the measured budgets, doc synchronisation, the v0.1 Release Candidate report                                           | —             |

### Delivered (07.5a) — audio

- **Three layers, and each knows one thing** (ADR-016): the catalogue (`sounds.ts`) knows which sounds exist and the mix; the bus (`audio.ts`) knows whether a sound is audible right now; the device (`web-audio.ts`) knows a sound is a file. Call sites name `Sound.Harvest` and learn nothing else — which is what makes the bus unit-testable in Node with no browser, and what makes replacing the placeholder set a pipeline change rather than a code change.
- **Every sound is triggered by something that ALREADY HAPPENED** — a published event (`cropHarvested`, `itemSold`) or a settled snapshot (the inventory growing is a deposit; the building count growing is a placement). Never an intent: a rejected purchase and an illegal placement are both silent, so the farm cannot lie about what it did. Nothing reaches `src/sim`; the simulation cannot know sound exists (ADR-007 §1).
- **Muted by default, and silent in work mode.** The bus reads the dials at PLAY time rather than caching them, so a volume change or a mode toggle lands on the next sound with nothing re-subscribing. Volume joins the companion's presence dials — opacity governs intrusion on the eye, volume on the ear — so it inherits main-side sanitization, `settings.json` persistence, and exclusion from the save for free.
- **Bursts coalesce** at 250 ms per sound. Three workers finishing on the same tick is ordinary, not exceptional — the seed bin exists to make it so — and three overlapping samples would turn the loop's best moment into its worst. The window starts when a sound is actually heard, so a muted stretch never swallows the first sound after an unmute.
- **One delegated click listener** rather than a `sound()` call in every button. Panels get added; a per-button rule gets forgotten. This cannot.
- **Placeholders are scripted and replaceable by file drop**: `scripts/generate-audio.mjs` synthesises eight sounds deterministically (16-bit mono PCM, 44.1 kHz, peak-normalised to −3 dBFS so the mix lives in code and survives the swap). Drop a real `assets/src/audio/<name>.wav` in and the script copies it through instead. `ASSETS.md` §3 amended: audio moved from "v0.2+" to shipped.
- **The ambient beds were declined**, not forgotten — see decision 1 below. Continuous audio is the audible form of the idle cost this phase refuses to spend, and a catalogue entry with no trigger would be exactly the unreachable code `AI_RULES.md` Rule 6 forbids.
- **A flake told the truth about a real cost.** Building the eight `Audio` elements at boot turned two E2E specs flaky the day audio landed — different specs each run, both passing in isolation, both waiting on UI that had become slower to reach interactive. Elements are now constructed on first play, so a muted session (the default) constructs none at all. Two clean full E2E runs followed. The eager version was never wrong, only expensive at exactly the wrong moment.

---

## Two decisions this phase makes up front

### 1. No continuous idle motion — ambient animation is event-driven

`fix/0.1/7.5.md` asks for "idle world motion — grass sway, crop sway, subtle ambient animation". The same directive's Performance section asks to **"maintain render-on-demand"** and **"no unnecessary redraws"**, and to "preserve every existing guarantee".

Those cannot both be honoured, and the conflict resolves against sway:

- A swaying world draws **every frame, forever**. That is not a small cost on an overlay that spends most of its life visible beside real work — it is the difference between a companion and a background game (`VISION.md` §2.1).
- It would fail two gates that pass today: `PERFORMANCE.md` §10.1's idle-rAF gate ("any frame fires over 10 s with a static world"), and the E2E assertion that a static world draws no frames (phase-02 criterion 5).
- ADR-001 chose render-on-demand as the mechanism that makes the overlay affordable. Spending it on ambience inverts the decision without an ADR.

**What ships instead:** motion that happens _because something happened_ — a harvest burst, a placement confirm, a coin popup, a selection pulse. The dirty gate already wakes for these, so they cost nothing when the farm is idle. The world at rest stays at rest, which is also the honest reading of `GAME_DESIGN.md` §10.1 rule 5 ("no timers counting down" — nothing routine is ever demanding attention).

Continuous ambient motion is recorded as a **v0.2 candidate**, where it belongs behind a setting and a measured budget.

### 2. Audio ships muted by default

The directive asks for placeholder audio across eleven events. It also names **desktop friendliness** as a guiding principle, and `VISION.md` §5.1 forbids being a notification spammer.

An overlay that starts making noise the moment it launches — beside a video call, a game, a focused work session — is the single most intrusive thing this product could do. So:

- **Default: muted.** The sound bus is fully wired and one setting away; nothing is stubbed.
- **Work mode always silences**, regardless of the setting, exactly as it dims the window (ADR-014).
- The volume control sits in the settings panel beside the opacity dial, where a player looking to turn sound on will find it.

This is a **default**, not a limitation, and it is one constant to reverse. Recorded here so it is not mistaken for an unfinished feature.

---

## Out of Scope

Everything `fix/0.1/7.5.md` lists: combat, enemies, RPG systems, skills, NPC dialogue, relationships, weather, seasons, animals, crafting, equipment, quests, dungeons, bosses, multiplayer, exploration.

Also deferred, deliberately:

- **Continuous ambient motion** — v0.2, behind a setting and a budget (see above).
- **Real audio assets** — the placeholders are replaceable without code changes (ADR-016); commissioning the real set is a v0.2 content task.
- **New gameplay rules of any kind.** Bug fixes only.

---

## Acceptance Criteria

| #   | Criterion                                                                              | Verified by |
| --- | -------------------------------------------------------------------------------------- | ----------- |
| 1   | A first-time player can infer farming, workers, storage, and the economy from watching | Manual      |
| 2   | Every player action is acknowledged within one frame                                   | Test        |
| 3   | **Idle CPU is unchanged** — a static world still draws no frames                       | E2E         |
| 4   | Audio plays on every specified event, and is silent when muted or in work mode         | Test        |
| 5   | Placeholder audio is replaceable with no code change                                   | Code review |
| 6   | Every panel meets the contrast and click-target floors                                 | Test        |
| 7   | Camera never fights the player for control                                             | Test        |
| 8   | **No determinism, replay, or save regressions**                                        | Full suite  |
| 9   | All `PERFORMANCE.md` budgets still hold                                                | Measured    |
| 10  | v0.1 feels feature-complete                                                            | RC report   |

---

## Notes

**Polish is where guarantees go to die.** Every item in this phase is small, visible, and satisfying to add, and each one is an opportunity to spend an architectural guarantee for a moment of delight. The guarantees are worth more: they are what lets this thing live at the bottom of a screen all day. Where the two conflict, the guarantee wins and the delight is redesigned to be event-driven.
