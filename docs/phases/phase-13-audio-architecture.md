# Phase 13 — Audio Architecture

> **Delivers:** the shipped placeholder bus becomes a real audio architecture, and ADR-016 §4's deferred ambient question gets a measurement.
> **Governing decisions:** ADR-023 (audio architecture), ADR-016 (the three layers), ADR-017 §4 (pools) and §5 (derived variation), ADR-019 §2 (proven by first-party use).
> **Schema:** none.
> **Status:** **Complete.** Four boundaries. Ambience ships with the measurement ADR-016 §4 deferred it for, taken against a real window and written to `docs/perf/criterion-9-ambient-audio.json`.

---

## Commit boundaries

`ROADMAP.md` §9 sets four: the Web Audio device layer and voice pool; buses, mixer, and settings; the sound registry and plugin audio; ambience with its measurement.

| Order | Boundary                                           | Commit                          |
| ----- | -------------------------------------------------- | ------------------------------- |
| 1     | Web Audio device layer, and the bounded voice pool | `edc08b0`                       |
| 2     | Category buses, mixer, and per-category settings   | `2a3fd57`                       |
| 3     | The sound registry and `registerAudio`             | `66ca047`                       |
| 4     | Rain ambience, and the measured idle budget        | `db140a0`, `38c285d`, `5c33912` |

---

## Decisions worth carrying forward

### Two ADRs pointed opposite ways, and the routing was forced

ADR-019 §3 puts `registerAudio` on the public plugin API, which lives in `src/sim/content/plugin-api.ts`. ADR-023 §6 says no module under `src/sim` may reference audio, and the boundary linter makes it a compile error. Both cannot hold as written.

It is not a free choice which one bends, because the import rules decide: `plugins/*` may import `shared` and `sim` and **nothing else** — never `renderer` — so first-party content physically cannot register into a renderer-side registry. Every path from `plugins/core` to the audio layer runs through `src/sim`.

The resolution is ADR-019 §4's own rule, **content is data, never code**. A `SoundDefinition` is an id, a category, a gain and an asset key — four plain values that cannot make a noise — and it lives in `src/shared/audio.ts`. `src/sim` carries them exactly as it carries a crop's sprite keys: opaquely, never reading them, never acting on them. The simulation gains no audio _behaviour_, which is what ADR-023 §6 is protecting; everything that can produce sound stays in the renderer.

A test enforces the distinction rather than trusting it: nothing under `src/sim` outside the content registries may mention `shared/audio` or `content/sounds` at all. Carrying is permitted; doing is not.

The same shape will serve `registerEffects`, which ADR-019 §3 also declares v1 and which has precisely this problem.

### A source installs once, so audio registers inside the existing installer

The first attempt called `installSource(CORE_SOURCE, …)` a second time for audio and was refused: `installSource` claims namespaces, and a source claims them once (ADR-026 §1). The refusal was correct and immediate.

Registering audio inside the same installer is also better than a second call would have been, because it makes the two atomic — core supplies its whole surface or none of it, which is the same all-or-nothing rule `registerContent` already applies within a bundle.

### The id and the asset key are deliberately different strings

A content id admits only `[a-z0-9_]`; the catalogue key is a filename stem and uses hyphens. So `core:ui_click` names the sound and `ui-click` names the file. Collapsing them would have meant either an id the registry refuses or renaming a shipped asset — and the registry refused it on the first run, which is the validator doing its job.

### The mix was moved by script, not retyped

Gains and categories were read out of `sounds.ts` and written into `plugins/core` mechanically, the phase-08b discipline. These numbers are the MIX — balanced against placeholders and meant to survive the asset swap — so a transcription slip would have been a silent rebalance nobody could trace. A test pins one of them against its known value as a tripwire.

The bus prefers the registry and falls back to the shipped constants, which both answer identically today _because_ the definitions were generated from those constants. The fallback is what keeps the bus's Node tests free of content wiring, and the registry is what lets a source add a sound the constants have never heard of.

### Ambience defaulting to zero is data, not a check

ADR-023 §5 condition 1 is _"off by default — a fresh install is silent, and stays silent even after unmuting, until the player asks for ambience specifically."_

That could have been a conditional somewhere in the ambience code. It is instead the `ambient: 0` entry in `DEFAULT_CATEGORY_PERCENT` and in the settings defaults, which means a code path that forgets to check still produces silence. The condition holds because the number is zero, not because someone remembered.

### The mixer's category getter is optional, and that is what made this non-breaking

`AudioState.categoryPercent` is optional, so every existing caller of `createSoundBus` kept working untouched and the bus's fourteen Node tests did not change. A state that does not answer is a state where every category is at full — which is exactly the mix that existed before categories did.

That matters more than convenience: ADR-016 §1's property is that the bus stays pure and unit-testable in Node, and it is the acceptance test for whether this rebuild was done right. Fourteen untouched tests passing is that acceptance being met rather than asserted.

### A silenced category does not stamp the coalescing window

The same reasoning the mute check already carried: the 250 ms window starts when a sound is **heard**. Stamping it for a sound suppressed by a category level would mean the first audible sound after turning that category back up gets swallowed by a suppression the player never heard.

### Ducking is a table and a clock, not an analyser

ADR-023 §2 calls this out and it is worth restating: an analyser is a continuously-running signal path, and ADR-023 §5 is spending its idle budget carefully on the one continuous thing that earns it. Paying for an analyser so rain gets quieter under a coin would be the budget spent on the wrong thing. The rule is a static declaration; applying it costs a map lookup.

### Per-category levels are in the schema but not yet in the panel

The settings schema, its sanitiser, the defaults, and the controller all carry `categoryPercent`; the settings panel that edits it does not exist yet, and the main process does not send it over IPC — the field is optional on `CompanionState` for exactly that reason.

Recorded rather than left implicit: a player cannot currently change these, so the mix is the defaults. Boundary 4 needs the ambience control specifically, and that is where the panel earns its place — a slider for a category with nothing registered in it would be a control that does nothing.

### `HTMLAudioElement` was the right call, and it stopped being one

ADR-016's device layer chose an element per sound and gave a good reason: the bus already coalesces bursts, so nothing needed a mixing graph, and an element is impossible to leak. That held for the whole of v0.1.

ADR-023 §4 changes the requirements rather than the judgement. Category buses, declared ducking, per-sound pitch variation, and two instances of one sound overlapping all need a graph — and an element cannot play twice at once at all. Worth recording as a change of requirements, because "the old choice was wrong" is the version of this story that teaches the wrong lesson.

### The bound moved from "cannot leak" to "cannot allocate unboundedly"

An element is reusable; a `BufferSourceNode` is single-use, so playing a sound now means allocating a node. On a farm harvesting continuously for eight hours that is the heap churn ADR-017 §4 forbids for particles, and audio is not exempt for being inaudible.

`voice-pool.ts` fixes the number in flight at twelve, allocates two typed arrays at construction, and never allocates again. Twelve is generous rather than tight: the bus coalesces repeats within 250 ms, so reaching it needs a dozen genuinely different sounds inside a quarter second.

### The pool is arithmetic, and that is what keeps it testable

ADR-016 §1's property — the interesting part of audio runs in Node with no browser — is the acceptance test for whether this rebuild was done correctly. The pool knows nothing about Web Audio: it hands out slot numbers against times. Thirteen tests run it in Node.

**Recycling is by CLAIM time, not by end time.** A long sound must not be able to shield itself from recycling by outlasting everything else, or one accidental five-minute buffer permanently costs a voice. The test that pins this had to be written twice: the first version left one voice already finished, so the free-slot scan answered before the tie-break ever ran, and it passed for a reason it was not about.

### Nothing is built until something is played

An `AudioContext` is a thread, and sound ships muted (ADR-016 §3), so most sessions must never create one. Phase-07.5a already measured what eager construction costs — it turned two E2E specs flaky the day audio landed. The context, the buffers, and the graph are all built on first play, which also means a muted session builds no graph at all, exactly as ADR-023 §4 requires.

The cost is that the first play of each sound is silent while its fetch and decode run. That is the same one-off cost the element version paid, and better than decoding ten files at boot for a session that is probably muted.

### The coverage gate refused the exclusion, and it was right to

The rebuilt device layer went in at 0% coverage and dropped `src/renderer/bootstrap/**` to 83.24% against its 85% threshold. The tempting fix was to register it as a host binding — it is one, in the sense that its body exists to call Web Audio.

`TESTING.md` §4.2 does not allow that: a file leaves the measured set only if it is a host binding **and** a named test does exercise it. There is no audio e2e spec, so there was no detector to name, and the exclusion would have been a claim with nothing behind it.

Phase-08.0 had already answered this. `docking.ts` and `settings.ts` imported `electron` at module scope and were therefore untestable; they were **parameterised**, not mocked, and neither changed behaviour. The same move applies here — `createWebAudioPorts` takes its context factory and its loader as options, defaulting to the real ones. A hand-written fake of forty lines then covers lazy construction, decode-once, and all three failure paths, taking the file from 0% to 87.5%.

Worth recording because the gate did its job in the way that is easiest to resent: it refused a plausible exclusion and the honest answer turned out to be cheap.

---

## Acceptance

- [x] The bus's unit tests still run in Node with no browser — `audio.test.ts` untouched; `voice-pool.test.ts` joins it
- [x] The voice pool recycles at capacity and never allocates — `voice-pool.test.ts`
- [x] Muted and unmuted sessions produce byte-identical worlds and `world.rng` — `audio-mixer.test.ts`, 200 steps with the bus playing throughout
- [x] A fresh profile is silent, and enabling sound does not enable ambience — `ambience.test.ts`, and proven end to end by criterion 9: unmuting alone left the bed **off**, and it took a second, separate act to start it. That is condition 1 behaving, expressed as data rather than as a check — `DEFAULT_CATEGORY_PERCENT.ambient` is `0`
- [x] Work mode silences everything including ambience — `ambience.test.ts`, in the matrix that proves each of the five conditions is independently sufficient to silence
- [x] Ambience on, pointer idle → audio suspends, measured into `docs/perf/criterion-9-ambient-audio.json` — `on 0.600` while watched, `off` after 14 s untouched, against a farm planted with an already-raining seed so the bed could not read "off" for want of weather. `PERFORMANCE.md` states the ceiling over the source's **existence** rather than its level: a silent-but-running bed would pass a loudness bar and fail this one
- [x] A plugin-supplied sound registers against an engine category, and one naming an unknown category is refused — `src/sim/content/sounds.test.ts`
