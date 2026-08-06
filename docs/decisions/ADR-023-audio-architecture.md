# ADR-023: Audio Architecture

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented by Phase 13
**Bound by (not re-litigated):** ADR-016 (the three-layer split, mute-by-default, work-mode silence, burst coalescing, and the file-drop replacement path — all preserved); ADR-014 §4 (volume is a presence dial in `settings.json`, never save data); ADR-007 §1 (presentation never enters the simulation); ADR-008 (events are facts with a producer and a consumer); ADR-017 §2 (ambient's four conditions), §5 (variation is derived, never rolled); ADR-001 §1 (idle cost is the product's hard constraint); ADR-019 §3 (`registerAudio` as a v1 capability); ADR-012.
**Amends:** ADR-016 §4 — _"No ambient beds, and no continuous audio at all"_ — which deferred continuous audio to v0.2 _"with its own measured budget."_ This ADR supplies that budget and the conditions. ADR-016 is otherwise unchanged and remains authoritative for everything it decided.

---

## Context

Phase-07.5a shipped audio and ADR-016 decided it well: three layers with one job each (catalogue / bus / device), muted by default, silenced by work mode, bursts coalesced at 250 ms, and a replacement path that is a file drop rather than a code change. None of that is in question.

Two of its decisions were explicitly provisional, and both come due now.

**§4 banned continuous audio outright** — and said why it was deferred rather than refused: _"a continuous audio path is an idle-cost commitment that deserves its own measured budget; deferred to v0.2."_

**§Consequences named the device layer's ceiling:** _"`HTMLAudioElement`, not Web Audio. No mixing graph, no per-sound pitch variation, no crossfades... Revisit when real audio arrives."_ And: _"Sounds cannot overlap with themselves. A consequence of one element per sound... a real audio pass may want voice pooling."_

v0.2 arrives with four things that need the graph ADR-016 declined: category buses and a mixer, a sound registry that plugins can register into (ADR-019 §3), weather ambience with a real trigger (ADR-022), and a spatial-audio extension point for a world that will eventually have a town in it.

The constraint that made ADR-016 careful has not relaxed. Sound is the most intrusive channel a background overlay has, and an audio graph — unlike a sprite — keeps a thread alive whether or not anyone is looking at the window. The idle cost of ambience is not a frame; it is a process that never fully sleeps.

---

## Decision

**Audio is an event-driven graph in the renderer: a registry of sounds, a small fixed set of category buses under one master, and a device layer built on Web Audio. Ambient beds are permitted under ADR-017 §2's four conditions plus a measured idle budget. The simulation still never learns audio exists.**

### 1. The three layers survive; the device layer is replaced

ADR-016 §1's split is the reason this change is contained, so it is restated rather than redesigned:

| Layer     | Knows                           | v0.2 change                                        |
| --------- | ------------------------------- | -------------------------------------------------- |
| Catalogue | which sounds exist, and the mix | Becomes a **registry** — plugins may register (§3) |
| Bus       | whether a sound is audible now  | Gains **categories** and a mixer (§2)              |
| Device    | that a sound is a file          | **Web Audio** replaces `HTMLAudioElement` (§4)     |

Call sites still name a sound and learn nothing else. The bus stays pure and unit-testable in Node with no browser — the property that made ADR-016's design worth keeping, and the acceptance test for whether this change was done correctly.

### 2. Category buses and one master

A small, fixed, engine-owned set of categories, each an addressable gain stage under a master gain:

```
   ui ─┐
world ─┤
ambient┼─► master ─► destination
music ─┘
```

- **Categories are engine-owned and closed.** A content source assigns a sound to a category; it may not invent one. An open category set makes the mix unpredictable and gives every plugin a way to be the loudest thing on the desktop.
- **The master is the companion's volume dial**, unchanged from ADR-016 §2 — sanitized in main, persisted in `settings.json`, never in a save, and silenced unconditionally by work mode.
- **Per-category levels are preferences** under the same ADR-014 §4 model. They join the existing `audio` settings category; no new persistence mechanism.
- **Ducking is declared, not computed.** A category may declare that it attenuates while another is active (ambience under a reward sound, say). It is a static declaration on the bus graph, not a runtime analyser — an analyser is a continuously-running signal path, which is the thing §5 is spending its budget on carefully.

### 3. Sounds are registered content

`app/sounds.ts`'s catalogue becomes a registry with the same shape as every other (ADR-004 §5, ADR-019 §3): a sound is a definition — id, source asset, category, and its declared playback properties — registered at startup, referenced by ID, never inlined.

- `plugins/core/` registers the eight shipped placeholder sounds through `registerAudio`, so the capability is proven by first-party use before a plugin touches it (ADR-019 §2).
- Plugin audio ships as assets under the plugin's namespace (`ASSETS.md` §10) and registers against an engine category.
- ADR-016 §6's replacement path is preserved exactly: a real `.wav` dropped into the source tree replaces a placeholder with no code change.

### 4. Web Audio, with a voice pool

The device layer moves to Web Audio, which is what buses, ducking, per-sound variation, crossfades, and eventual spatialisation all require. Two consequences of ADR-016's `HTMLAudioElement` choice are resolved by it: sounds may now overlap with themselves (via a bounded voice pool, allocated at construction and recycling its oldest voice — ADR-017 §4's discipline applied to audio), and a sound may vary in pitch.

**Variation is derived, never rolled.** ADR-017 §5's rule generalises unchanged: a footstep's pitch hashes presentation inputs. **It may never draw from `world.rng`** — a decorative pitch shift consuming the simulation's generator would desynchronise every future tick, which is the same defect a decorative particle would cause and is not more acceptable for being inaudible.

**The graph is built lazily and torn down when silent.** Phase-07.5a already found that building audio elements at boot made two E2E specs intermittently slow; the same discipline applies harder to an `AudioContext`, which is a thread. A muted session builds no graph, and a graph with nothing to play suspends.

### 5. Ambient beds — the ADR-016 §4 amendment

Continuous audio is permitted, under **five** conditions. The first four are ADR-017 §2's, adopted verbatim because ambience is the audible form of exactly the same problem:

1. **Off by default.** A fresh install is silent — and stays silent even after unmuting, until the player asks for ambience specifically.
2. **Never while collapsed.** Collapsed mode tears the renderer down (ADR-001 §2); ambience must not be the thing keeping the process warm.
3. **Never in work mode.** Work mode already silences all audio unconditionally (ADR-016 §2).
4. **Surrendered on presence loss.** Ambience stops when the overlay has had no pointer input for `AMBIENT_IDLE_TIMEOUT_MS` — the same signal, and where practical the same `ambient-presence.ts` mechanism, that ADR-017 §2 condition 4 uses for motion. A player looking at the farm hears rain; a player who alt-tabbed hears nothing and the audio thread suspends.
5. **A measured idle budget.** `PERFORMANCE.md` gains an ambient-audio line with a stated ceiling, measured by the existing harness against a real window and written to `docs/perf/`. This is the condition ADR-016 §4 named, and it is what makes this an amendment rather than a reversal: the deferral asked for a measurement, so a number is owed before ambience ships.

**Silence remains the resting state.** ADR-016 §4's principle — _"Every sound that ships is triggered by something that already happened"_ — is unchanged for effects. Ambience is the single declared exception, it is opt-in, and it surrenders when the player is not there.

**The first ambient bed must have a real trigger.** Rain audio arrives with ADR-022's weather, which is why Phase 13 follows Phase 12. ADR-008's rule — never add an event without a producer and a consumer — has an audio analogue that ADR-016 already stated: _"a sound with no trigger is unreachable code."_

### 6. Audio never influences the simulation

Restated because a mixer is a new place for it to erode:

- No module under `src/sim` may reference audio, and the boundary linter already makes it a compile error.
- Audio consumes no `world.rng`, publishes no events (it is a subscriber only, like devtools under ADR-018 §10), and writes nothing back.
- **A muted session and an unmuted session produce byte-identical worlds.** This is a test, not an assumption — the same shape as ADR-017's guard on presentation randomness.

### 7. Spatial audio is an extension point, not a feature

The graph makes panning and distance attenuation possible; v0.2 declares the seam and builds none of it. A spatialised sound would take a world position, and the renderer already computes world→screen for React overlays (ADR-005 §1).

It is named here so §2's graph is not designed in a way that blocks it, and it is not built, because v0.1's world is 220 px tall and a town is a v0.3 concern. `AI_RULES.md` §1.5 governs.

---

## Alternatives Considered

### A. Keep `HTMLAudioElement` and layer categories on top

- **For:** no device-layer change; the shipped bus already works.
- **Against:** an element-per-sound has no gain stage to group, no way to duck, no overlap with itself, and no path to spatialisation. Categories would become bookkeeping the device layer cannot honour.
- **Rejected because:** ADR-016 named this exact revisit and its trigger has arrived.

### B. Keep ADR-016 §4's total ban on continuous audio

- **For:** the strongest possible idle guarantee, and the ban has cost nothing so far.
- **Against:** it makes rain silent while rain is visible, which reads as a defect rather than a decision, and it leaves the deferral in §4 permanently unresolved.
- **Rejected because:** §5's five conditions preserve the guarantee for the default install — a fresh profile behaves exactly as it does today — while making ambience available to a player who asks and is present.

### C. Ambience allowed whenever the overlay is expanded

- **Rejected for ADR-017 §Alternatives A's reason, unchanged:** the overlay is expanded for long stretches while the player works in another window, which is the state the product optimises for. It spends the core constraint on something nobody is listening to.

### D. An open category set that plugins may extend

- **For:** maximum flexibility for content sources.
- **Rejected because:** the mix is a product decision. An open set means a plugin can place itself outside every level the player has set, which is the audio equivalent of an unbounded price modifier (ADR-013 §4).

### E. Audio in the main process

- **Rejected for ADR-016's reason, unchanged:** main owns platform behaviour, not presentation, and it would need a second copy of every trigger.

---

## Tradeoffs Accepted

| We accept                                                | To gain                                              | Mitigation                                                          |
| -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| A Web Audio graph to build and tear down                 | Buses, ducking, overlap, variation, spatial later    | Built lazily; suspended when silent; muted sessions build none      |
| Ambience is opt-in, so most players never hear it        | The default install's idle guarantee is unchanged    | The same trade ADR-017 made for ambient motion, deliberately        |
| A closed category set                                    | A predictable mix no plugin can escape               | Sounds choose a category; that is the whole surface                 |
| An ambient-audio budget must be measured before it ships | The deferral in ADR-016 §4 is answered with a number | The phase-07.7M harness already writes measurements to `docs/perf/` |

---

## Consequences

### Immediate (Phase 13 implements)

- The device layer moves to Web Audio with a bounded voice pool; the bus gains categories, a master, and declared ducking.
- The catalogue becomes a registry; `plugins/core/` registers the shipped sounds through `registerAudio`.
- Per-category levels join the `audio` settings category (ADR-014 §4).
- `PERFORMANCE.md` gains the ambient-audio budget line and an idle case; `docs/perf/` gains its measurement.
- Rain ambience is the first bed, gated on ADR-022 shipping weather.

### Ongoing

- **Never register a sound with no trigger.**
- **Never consume `world.rng` for audio.**
- **Never let a plugin define a category.**
- **Never leave an `AudioContext` running with nothing to play.**
- A new continuous audio path re-opens §5's conditions and needs its own measurement.

### Validation

- **Determinism:** muted and unmuted sessions produce byte-identical worlds over a long run; `world.rng` is byte-identical either way.
- **Purity:** the bus's unit tests still run in Node with no browser — the ADR-016 §1 property, preserved.
- **Idle budget:** ambience on, pointer idle past the timeout → audio suspends and idle CPU returns to the measured baseline, written to `docs/perf/`.
- **Default silence:** a fresh profile plays nothing, and enabling sound does not enable ambience.
- **Work mode:** silences everything including ambience, unconditionally.
- **Voice pool:** at capacity, the pool recycles and never allocates — the ADR-017 §4 test shape.

### Revisit if

- The measured ambient budget cannot be met → ambience does not ship, and ADR-016 §4's ban stands. The measurement is the gate, not a formality.
- Spatial audio becomes a requirement → it is the declared seam in §7; no graph change should be needed, and if one is, that is the signal §2 was designed too narrowly.

---

## Related

| Document            | Relationship                                                         |
| ------------------- | -------------------------------------------------------------------- |
| ADR-016             | Amended at §4 only; everything else it decided is preserved          |
| ADR-017 §2, §4, §5  | The ambient conditions, pooling, and derived-variation rules adopted |
| ADR-014 §4          | The preference model volume and category levels live in              |
| ADR-019 §3          | `registerAudio` — the capability plugins use                         |
| ADR-022             | Weather — the first real ambient trigger                             |
| `PERFORMANCE.md`    | Gains the ambient-audio budget this ADR owes                         |
| `ASSETS.md` §3, §10 | Audio formats and plugin asset namespacing                           |
