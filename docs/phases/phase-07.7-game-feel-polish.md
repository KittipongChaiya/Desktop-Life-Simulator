# Phase 07.7 — Game Feel Polish

> **Delivers:** The first full game-feel pass. Every action the player takes, and every action a worker takes, is acknowledged with motion.
> **Runnable at completion:** The same game, playing identically, that feels responsive instead of correct-but-inert.
> **Governing decision:** **ADR-017** (game feel — motion classes, the lease rule, pooling, derived randomness). Bound by ADR-001, ADR-005, ADR-007, ADR-008, ADR-014, ADR-016.
> **Status:** **COMPLETE** — closed 2026-08-01 (07.7N). 16 of 16 acceptance criteria PASS.
> **Hard constraint:** **No new gameplay mechanics.** Presentation layer only. A tick's outcome, a save's bytes, and a replay's result are byte-identical before and after this phase — §13 proves it.

---

## Objectives

1. Nothing **teleports**. Workers ease between states; crops arrive and leave with weight; the world responds to being touched.
2. Every action is **acknowledged within one frame** of the event that caused it.
3. The farm reads as **inhabited** — at the player's option, and never at the idle budget's expense.
4. Every guarantee this project already holds survives the phase **unmodified**: determinism, render-on-demand, snapshot separation, resource conservation, save compatibility.

---

## Three corrections to the brief, made before starting

Recorded here because each changes what gets built, and silently "interpreting" any of them would have been the wrong call.

### 1. The ADR number is **017**, not 016

The brief asks for `ADR-016-game-feel.md`. **ADR-016 already exists and is Audio** (accepted 2026-07-27, phase 07.5a). Writing game feel into that number would have overwritten an accepted decision that this phase depends on. The decision is `docs/decisions/ADR-017-game-feel.md`.

### 2. Continuous ambient motion contradicts the brief's own §12 — resolved by ADR-017 §2

§2 of the brief states the rule correctly: _"No continuous animation while idle. Only event-driven."_ §12 requires that nothing violate the idle CPU budget or render-on-demand.

But §3 asks for a windmill that rotates slowly, chimney smoke, and swaying flags; §10 asks for grass sway, butterflies, bird shadows, cloud shadows, and wind gusts. **All of those are unbounded** — they never finish, so they hold the frame loop open forever, and `PERFORMANCE.md` §4.2 makes zero-`requestAnimationFrame`-when-static a named invariant whose test _"deleting or skipping invalidates ADR-001"_.

This is the "irreversible presentation architecture decision" the brief anticipated. ADR-017 §2 resolves it: event-driven motion is unrestricted; ambient motion is off by default, never runs collapsed or in work mode, and **surrenders the frame loop when the player has not moved the pointer recently**. Motion while the player is watching costs nothing while they are not.

### 3. Sound hooks and a particle system **already partly exist** — this phase extends them

- **Sound:** ADR-016 shipped the catalogue in 07.5a — `Harvest`, `Deposit`, `Coin`, `Placement`, `Selection`, `UiClick`, `Notification`, `Error`, all event-triggered. §7 becomes _add the missing hook points_ (till, plant, worker step, button hover), not _build a sound system_.
- **Particles:** `render/effects.ts` already pools a 4-particle burst and a ring, and already holds and releases an animation lease correctly. §6 becomes _generalise it into a reusable pooled manager_, not _introduce one_.

Building either from scratch would have produced a second system beside a working one.

---

## Milestones

Ordered so each depends only on those above it. **07.7a is first because it gates every milestone after it** — an effect built before its off-switch tends never to grow one.

| #     | Milestone                        | Delivers                                                                                                                                   | Status        |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| 07.7a | Accessibility settings           | The six controls of §11 in `settings.json` under the ADR-014 §4 model; Reduced Motion as a master switch; every later milestone reads them | **Delivered** |
| 07.7b | Motion foundation                | Pooled particle manager (dust, leaves, sparkle, coin burst, splash); presentation PRNG; the lease made structural                          | **Delivered** |
| 07.7c | Floating numbers                 | Pooled `+coins` / `+items` risers — fade, drift up, auto-release. XP hook shape only, no XP system                                         | **Delivered** |
| 07.7d | Crop feedback                    | Till puff · plant seed-bounce · stage-change pulse · harvest pop, scale-bounce, fade · coins fly to the wallet                             | **Delivered** |
| 07.7e | Worker animation                 | Idle breathing · arrival easing · walk smoothing · till/plant/harvest/pickup/deposit animations · task-transition blending                 | **Delivered** |
| 07.7f | Worker personality               | Cosmetic idle fidgets — look around, stretch, scratch, sit, celebrate after harvest. Derived variation, never rolled                       | **Delivered** |
| 07.7g | Camera shake                     | Configurable duration/strength/frequency; large harvest and building placement; **off by default**                                         | **Delivered** |
| 07.7h | UI feel                          | Hover and press scale, tooltip fade, inventory slot highlight, selection pulse, hotkey hint fade — **zero per-frame React commits**        | **Delivered** |
| 07.7i | Sound hook extension             | Till, plant, worker step, button hover added to the ADR-016 catalogue and its placeholder generator                                        | **Delivered** |
| 07.7j | Ambient life (opt-in)            | Building motion (§3) and environment motion (§10), behind ADR-017 §2's four conditions, with the idle-surrender behaviour                  | **Delivered** |
| 07.7M | Performance validation           | Tick histogram and heap metric; a repeatable harness; criteria 5, 8 and 11 measured with evidence files                                    | **Delivered** |
| 07.7N | Documentation sync & closure     | Eight documents synchronised, the acceptance audit, the technical-debt register, and this report                                           | **Delivered** |
| 07.7L | Accessibility settings UI        | The six controls exposed in the settings panel, bound to the existing model; `SetMotion` IPC; restart-persistence E2E                      | **Delivered** |
| 07.7k | Measurement, invariants and docs | Budgets measured and recorded; §4.2's second invariant case added; the six documents synchronised; phase report                            | **Delivered** |

---

## Acceptance criteria

A criterion is met when a test proves it and would fail if it broke (`AI_RULES.md` §3.3).

### Simulation is untouched

1. A recorded seed + command stream produces a **byte-identical** world after this phase as before it.
2. `toSave(w)` produces **byte-identical** output before and after, for the same world.
3. Every existing save fixture still migrates and validates.
4. No file under `src/sim/**` gains an import from `src/renderer/**`, and no animation state is readable by the simulation. `check:boundaries` proves it.
5. Tick timing is unchanged: p99 tick time within noise of the 07.5f measurement.

### Motion behaves

6. Every animation acquires a lease on start and **releases it on end** — verified by asserting the gate reports zero animation leases once every effect has expired.
7. With ambient motion **off** (the default), `requestAnimationFrame` callbacks over 10 idle seconds are **zero** — the existing §4.2 invariant, unmodified.
8. With ambient motion **on** and no pointer input past `AMBIENT_IDLE_TIMEOUT_MS`, rAF callbacks also reach **zero** (ADR-017 §2 condition 4). This is the new invariant case.
9. Collapsing the overlay releases every lease and destroys every pooled object; 20 collapse/expand cycles show no growth in retained Pixi objects.

### Pooling holds

10. Particle and floating-number pools **never allocate after construction**. A full pool recycles its OLDEST entry and does not grow.
11. A 30-minute run at maximum effect density shows heap growth within the `PERFORMANCE.md` ceiling.

### Accessibility works

12. Each of the six settings independently suppresses exactly its own class of motion, with no gameplay difference.
13. **Reduced Motion** overrides all five others without overwriting their stored values; turning it off restores what the player had chosen.
14. Settings live in `settings.json`, never in a save. Loading a save never changes them; deleting a save never deletes them.

### Randomness is derived

15. Two runs from the same seed and the same command stream produce **identical animation choices** — the same fidget, the same puff scatter — proving presentation randomness is hashed, not rolled.
16. `world.rng` is not consumed by any renderer code path. A test asserts the generator's position is unchanged by a frame.

---

## Test plan

| Area                  | Where                                                           | Asserts                                                                        |
| --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Determinism unchanged | `tests/property/` (existing)                                    | Criteria 1, 5, 15, 16                                                          |
| Save byte-stability   | `tests/save-round-trip.test.ts` (existing)                      | Criteria 2, 3                                                                  |
| Lease discipline      | `src/renderer/render/dirty-gate.test.ts` + new per-effect tests | Criterion 6                                                                    |
| Idle invariants       | `tests/e2e/` — the §4.2 spec, extended                          | Criteria 7, 8                                                                  |
| Pool behaviour        | new `particle-pool.test.ts`, `floating-numbers.test.ts`         | Criteria 10, 11                                                                |
| Leak on collapse      | existing collapse-cycle test, extended                          | Criterion 9                                                                    |
| Settings              | `settings-schema.test.ts`, `settings-ui.test.tsx`               | Criteria 12, 13, 14                                                            |
| Visual regression     | `tests/farming-visual.test.ts` (existing)                       | Frames unchanged — polish must not alter the resting look of any farming stage |

The last row matters: the seven reference frames from the visible-farming fix are the guard that a _polish_ phase has not quietly changed what a tile looks like when nothing is happening.

---

## Documentation to synchronise (07.7k)

The brief names six documents. Two of its paths were wrong; corrected here.

| Document                              | Update                                                                                   |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `docs/GAME_DESIGN.md`                 | Game-feel section: what each action acknowledges and how                                 |
| `docs/ARCHITECTURE.md`                | The motion layer and where it sits relative to snapshots                                 |
| `docs/PLAN.md`                        | Phase 07.7 status                                                                        |
| `docs/assets/VISUAL_REFERENCE.md`     | _(brief said `VISUAL_REFERENCE.md`)_ — motion vocabulary, timings, easing curves         |
| `docs/assets/TECHNICAL_ASSET_SPEC.md` | _(brief said `TECHNICAL_ASSET_SPEC.md`)_ — any new animation frames and their provenance |
| `docs/CHANGELOG.md`                   | The phase entry                                                                          |
| `docs/PERFORMANCE.md`                 | §4.2 gains the second invariant case (ADR-017 Consequences)                              |

---

## Rules carried from the brief, restated as checks

- Never move gameplay logic into the renderer → criterion 4
- Renderer reacts only to simulation → criteria 1, 4
- Animations interpolate snapshots only → ADR-007 §5; criterion 5
- Particles originate from events, no polling → ADR-008; criterion 6
- No frame-dependent gameplay → criterion 1
- No random animation without a deterministic seed → ADR-017 §5; criteria 15, 16
- No architecture shortcuts, no temporary implementations → every milestone ships with its tests or does not ship

---

## Status

**Phase opened 2026-08-01.** ADR-017 accepted.

### 07.7a — Accessibility settings · Delivered

`src/shared/motion.ts` (+ `motion.test.ts`), and the `motion` category in `src/main/settings-schema.ts`.

The vocabulary lives in `shared` because both ends hold one — main persists and sanitizes, the renderer applies — and the precedence rule is pure, so it is written once rather than on each side.

Two properties are pinned by test because they are the ones that rot quietly:

- **Override without erasure.** Reduced Motion and work mode suppress motion while the stored settings stay exactly as the player left them, so clearing either restores their choices. This is the discipline `effectiveOpacityPercent` already follows; a mode that rewrote preferences would destroy them on its first toggle.
- **A malformed settings file can never switch unbounded motion ON.** `environmental: 1` and `decorativeCreatures: 'true'` both fall back to `false`, so corruption cannot cost the idle budget.

The category is absent from every `settings.json` written before today, which is the ordinary case and upgrades in place — the tolerant per-category parse defaults it and the next write adds it.

Gates: typecheck · lint · boundaries · cycles clean. Unit suite **90 files / 1110 tests** (from 89 / 1093).

### 07.7b — Motion foundation · Delivered

`presentation-rng.ts`, `particle-pool.ts`, `animation-lease.ts` (each with tests), and five new kinds in `effect-state.ts`.

**The lease became structural rather than a habit.** `dirty-gate.ts` calls its animation count "the fragile half" — every acquire needs a matching release, and a source that never releases is a permanent frame cost that looks exactly like normal operation. Two call sites carried that bookkeeping by hand; this phase would have added five more. `bindAnimationLease` takes a liveness flag per frame and owns the transitions, so there is no longer a place to forget. Both existing sites — `effects.ts` and the camera glide in `world-view.ts` — were migrated onto it, because a rule nothing follows is not a rule.

**The pool allocates nothing after construction.** Parallel typed arrays for state, one reusable view per slot, one reusable result array. The test that matters collects the view objects handed out at capacity, runs three thousand emissions, and asserts that no object outside that original set is ever returned.

**Presentation randomness is a hash, not a generator.** The guarding test interleaves unrelated calls between related ones and asserts the results are unchanged — a generator cannot pass it. That is what lets a butterfly vary its path without consuming `world.rng` and desynchronising every future tick from its own save.

Two judgement calls worth recording:

- **The pool's `activeAt` is deliberately unsorted**, unlike `EffectQueue`'s. Effects are distinct things whose order the player can read; particles are interchangeable specks in one layer, so sorting them would cost an O(n log n) pass every frame and buy nothing.
- **`presentation-rng.ts` is deliberately NOT shared with `decor.ts`.** Their mixers differ numerically (`Math.imul` versus a plain multiply). Unifying them looks like an obvious cleanup and would relocate every tree, rock, and bush in every existing player's world.

ADR-017 §4 was corrected during this milestone: it said a full pool "drops the new effect", but `effect-state.ts` had already decided the opposite in 07.5b with better reasoning — recycle the **oldest**, because it is furthest through its life while the newest is the one the player just caused. The ADR now matches the shipped behaviour.

Gates: typecheck · lint · boundaries · cycles clean. Unit suite **93 files / 1150 tests** (from 90 / 1110). E2E **34 passed, 3 skipped** — run because the lease change touches the camera path the idle invariant depends on.

### 07.7c — Floating numbers · Delivered

`floating-number-state.ts` (+ tests), `floating-numbers.ts`, `scripts/generate-glyph-art.mjs`, eleven glyphs, and the harvest consumer in `start.tsx`.

**The obvious route was a trap.** Pixi's `Text` rasterises a texture per distinct string, so `+12` and `+13` are separate GPU allocations — on the most frequent effect in the game, against ADR-017 §4. Instead: eleven glyph textures, composed into pooled per-digit sprites that are repositioned and retinted rather than created. Painted Parchment and tinted at draw time, so coins and items share one set.

The pool adds an obligation the particle pool does not have: **the text is formatted once at emission, never per frame.** A number that formatted itself in `activeAt` would allocate a string per number per frame — the same defect one level down, and harder to see. A test reads the same number across 400 frames and asserts the identical string instance comes back.

Two art decisions made by looking rather than by reasoning:

- A **3×5 core was drawn first and rejected on sight** — with the canon 1 px outline the border is as thick as the strokes, so `+` collapsed into a blob and the digits read only barely. The outline is canon, so the core grew to 5×7.
- A **`×` glyph was drawn and cut.** Its diagonals sit one pixel apart, so the outline closes them into a solid block. Nothing needed it — items and coins both read as `+n` — and a speculative glyph is not worth an illegible one.

**Scope held deliberately:** the wired consumer is `cropHarvested` → `+n` over the harvested tile, which the event already carries. Coins are _not_ wired here — `ItemSold` carries no tile, and "coins fly to the wallet" is 07.7d's stated deliverable. One real consumer proves the system; inventing an anchor for the second would have pre-empted the next milestone.

Gates: typecheck · lint · cycles clean. Unit **94 files / 1166 tests**. E2E **34 passed, 3 skipped**.

### 07.7d — Crop feedback · Delivered

`crop-anim.ts` (+ tests), `particle-view.ts`, an animated `crop-view.ts`, `buildings-slice.test.ts`, and the triggers in `start.tsx`.

**The particle pool finally has a renderer.** 07.7b built the pool and deliberately left it undisplayed; this milestone draws it — as pooled sprites over Pixi's built-in white texture, tinted and scaled per kind, rather than `effects.ts`'s `Graphics`. Redrawing geometry every frame is fine for two shapes and not for a hundred and ninety specks.

**The crop renderer's update is now two methods.** `update` reconciles against the slice and runs only when it republishes; `animate` runs per frame and holds a lease for exactly as long as something is moving. A farm at rest reconciles nothing, animates nothing, and draws nothing — the ADR-017 §1 rule, kept.

**A harvested crop outlives its own data.** It is gone from the snapshot the instant it is harvested, so to animate out at all its sprite must be kept after its entry disappears. Departing sprites move to their own map and are destroyed when the curve ends; `crop-anim.ts` owns _when_ that is, because a mistake there is a leaked sprite rather than a visible glitch. A replant on the same tile destroys the departing sprite immediately rather than fading it over its replacement.

Curves are damped **toward 1** by the intensity setting rather than skipped, so a setting changed mid-animation cannot strand a sprite at the wrong size. The curve tests assert every animation _lands_: a scale ending at 1.04 instead of 1 would leave the whole farm permanently, invisibly wrong with nothing to point at.

**Coins needed an anchor the event does not carry.** `ItemSold` has no tile, so the burst is placed at the market stall — found via a new `buildingId` on `BuildingView`, because matching on the sprite key would break the moment two buildings shared art. A manual sale with no stall built gets **no world effect at all**: the coin sound and wallet readout already say it happened, and inventing a position would be the farm pointing at nothing.

The buildings slice had no test file; it has one now, including the assertion the new field exists for — a `buildingsEqual` ignoring `buildingId` reads a changed kind as "unchanged".

Gates: typecheck · lint · cycles clean. Unit **96 files / 1192 tests**. E2E **34 passed, 3 skipped**.

**Settings connected in 07.7d-bis, below.**

### 07.7d-bis — the settings connected · Delivered

`motion` now rides `CompanionState` beside opacity and volume — the third presence family on the channel it belongs to. Main sends the STORED settings rather than resolved ones, because `effectiveMotion` needs `workMode`, which is on the same object; resolving once in the controller beats shipping both forms.

`intensityScale` turns a level into a multiplier: full 1, subtle 0.5, minimal **0**. Reduced Motion means _still_, not "a very small amount".

**The gate lives in the world view, not at the call sites.** The stage-change sparkle is raised inside `crop-view`'s slice diff, so a caller-side check in the composition root would have silently missed it — every emitter now passes through one internal `emit`.

Two things this surfaced:

- `sameMotion` compares field-wise, because main rebuilds `CompanionState` on every broadcast; a reference check would wake the renderer on every hotkey press for nothing.
- It also tolerates a missing object. The flat comparisons beside it already do — `state.muted === next.muted` is harmlessly false for a partial payload — whereas dereferencing a nested one throws inside a listener. The controller's own test fixture was partial, which is how this was found.

Gates: typecheck · lint · cycles clean. Unit **96 files / 1201 tests**. E2E **34 passed, 3 skipped**.

**Noted, not a regression:** `tests/catch-up.test.ts`'s 50,000-tick property failed once on a full-suite run at 388 s, and passed both in isolation and on a clean re-run. It is CPU-heavy and runs alongside 95 other files; this is a load-dependent timeout, not a behavioural failure. Recorded so the next sighting starts from here.

### 07.7e — Worker animation · Delivered

**The find: a six-frame `harvest` swing shipped with the phase-05.5 character set and nothing ever selected it.** `selectAnimation` mapped `Working` straight through to `idle`, so a worker tilling, planting, or harvesting stood perfectly still for the entire task. Same defect class as the crops — art in the atlas, no code path to it — and the brief's opening complaint that workers "teleport between states" was literally true for the one state where work happens.

One motion covers all three tasks deliberately. The art is a generic work-the-ground swing; inventing a distinct pose per task would mean art that does not exist.

**Arrival easing shapes drawing, never timing.** The simulation still steps a worker at a constant rate; `easedApproach` shapes only where the sprite sits between two snapshots (ADR-007 §5). A linear lerp reads as a slide; easing the tail reads as a step being placed.

**Idle breathing turned out to be ambient, which the brief does not say.** It is listed under §1 beside the finite effects, but an idle worker never stops being idle — so breathing holds the frame loop open for as long as one is on screen, which on a self-running farm is most of the time. It is gated on **Decorative Creatures** and off by default; ADR-017 §2 now records the reasoning and the setting choice, which also puts 07.7f's fidgets under the same switch.

Phase is derived from the worker id so a row does not breathe in lockstep, and derived rather than rolled so the same farm breathes the same way on every launch.

**One existing test asserted the defect.** `selectAnimation(Working, South)` expected `idle_s` under a case named "idles in the facing direction otherwise" — accurate while nothing selected the swing, and wrong the moment something did. Updated rather than worked around, with a note saying why.

Gates: typecheck · lint clean. Unit **96 files / 1212 tests**.

### 07.7f — Worker personality · Delivered

`worker-personality.ts` (+ tests) and the transforms in `worker-view.ts`.

**Three of the brief's five suggestions were built. Two were refused, and that is the finding.** The worker set is four idle poses, four walk cycles, and one work swing — nothing else.

| Suggested    | Built  | Why                                                      |
| ------------ | ------ | -------------------------------------------------------- |
| Look around  | yes    | the four idle facings already exist                      |
| Stretch      | yes    | reads as a vertical reach on any pose                    |
| Celebrate    | yes    | a hop reads without a pose                               |
| Scratch head | **no** | needs a pose; a jitter on the idle frame reads as a bug  |
| Sit          | **no** | needs a pose; a squashed stand reads as a squashed stand |

The two omissions are not deferred work — they are an **art request**. Neither can be faked with a transform, and faking them would look like a rendering defect rather than a personality. This is the same call as cutting the `×` glyph in 07.7c: a speculative effect is not worth an illegible one.

**Stateless by construction.** A fidget is a pure function of worker id and tick — no timers, no stored schedule, nothing to leak or desynchronise on reload. Time divides into windows; the fidget and its offset within each are derived from the id and window index, so the same farm fidgets identically every launch and no two workers move in lockstep. The tests assert that interleaving five hundred unrelated calls changes nothing.

**Every offset returns to zero.** A fidget that left a sprite one pixel high would accumulate, and after an hour the farm would be staffed by workers hovering above the ground with nothing in the code to point at. Both curves are asserted to start and end on the ground, never go below it, and clamp a late frame to rest.

**The hop is finite, so it is not gated on creatures.** It fires on the Working → not-Working transition — which the view can see because it keeps both snapshots — costs nothing at rest, and is therefore in the finite class alongside the crop curves. The recurring fidgets and the breathing are ambient and stay behind Decorative Creatures.

Gates: typecheck · lint · cycles clean. Unit **97 files / 1229 tests**. E2E **34 passed, 3 skipped**.

### 07.7g — Camera shake · Delivered

`camera-shake.ts` (+ tests), applied in `world-view`, triggered from `start.tsx`.

**The default matters more here than anywhere else in the phase.** Every other effect stays inside the overlay's own bounds; a shake moves the whole world under a window sitting at the bottom of someone's screen while they work. It ships **off**, and the values are small enough — 260 ms, 3 px — that a player who turns it on is not punished for it.

**It must return exactly to zero.** A shake ending a fraction of a pixel off leaves the camera permanently displaced, and every later shake displaces it further: a drift accumulating across a session with no single frame to blame. The endpoint is asserted rather than trusted, including a test that runs a hundred shakes to completion and sums their final offsets.

That test caught a real one. At zero strength the maths returned **`-0`** on the negative half of the wave — arithmetically harmless, but it made "returns exactly zero" a matter of interpretation. Zero strength now short-circuits, which is both honest and cheaper.

**The offset is applied to the stage, never to `camera`.** A shake that moved the camera itself would fight the clamp, survive into the next pan, and drift the view permanently — the same class of bug as the accumulating offset, arriving by a different route.

**What counts as "large" is the interesting decision.** A single crop is the routine case and must stay silent; the camera reacts only when **four harvests land within 700 ms**, which in practice means a mature farm ripening together or an offline catch-up settling. A placement shakes once for the whole batch, not once per building — shaking per arrival would turn a multi-placement into an earthquake.

Gates: typecheck · lint · cycles clean. Unit **98 files / 1246 tests**. E2E **34 passed, 3 skipped**.

### 07.7h — UI feel · Delivered

`motion-attribute.ts` (+ tests), and CSS in `global.css`, `ToolBar.module.css`, `InventoryPanel.module.css`.

**The brief's "no React re-render every frame" is satisfied by making the frame loop not React's business.** Every HUD effect here is a CSS transition on `transform` or `opacity` — both compositor properties, so none of it triggers layout, paint, or a render. React is not involved in the animation at all.

**The gap this closed:** the overlay already honoured the operating system's `prefers-reduced-motion` in two panels, but the game's OWN Reduced Motion switch was invisible to CSS. A player who set it in the settings panel got a still world and a HUD that carried on animating. `motion-attribute.ts` publishes the resolved setting to a root attribute, written only when the value changes — a per-frame attribute write would invalidate style every frame, which is a per-frame render wearing a different hat.

Reduced motion uses a **near-zero duration, not `animation: none`.** Cancelling an animation outright can strand an element on its first frame; a 0.01 ms duration lets it run to its final state instantly, which is the accessible behaviour rather than merely the still one.

**A dead-CSS mistake, caught before commit.** The first pass styled `.slot` for the inventory highlight. There is no `.slot` class — the panel uses `.sellRow` — so the rules would have shipped looking complete and doing nothing. Retargeted, and the transform dropped in favour of background alone, because a full-width row scaled up pushes past the panel edge.

Buttons press to **below** resting size: one that grows under the finger reads as a hover that got stuck.

Gates: typecheck · lint · cycles clean. Unit **99 files / 1256 tests**. E2E **34 passed, 3 skipped**.

### 07.7i — Sound hooks · Delivered

**Two of the brief's four were added. Two were refused, on this catalogue's own stated policy.**

`sounds.ts` already carried the rule: _"a catalogue entry with no trigger would be exactly the unreachable code `AI_RULES.md` Rule 6 forbids — every sound must have a producer."_ It had also already rejected ambient beds, because _"a desktop companion that hums to itself beside real work is a background game, not a companion."_ Both refusals follow directly.

| Asked for    | Added  | Why                                                                                                                                                                                                                                                                                       |
| ------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Till         | yes    | a discrete thing the player did                                                                                                                                                                                                                                                           |
| Plant        | yes    | likewise                                                                                                                                                                                                                                                                                  |
| Worker step  | **no** | a farm exists to run itself, so its workers walk essentially always — a step sound is an ambient bed with extra steps. Coalescing does not save it; suppressing repeats of a sound that should not play at all just makes it intermittent                                                 |
| Button hover | **no** | a hover is not an action. The overlay sits at the bottom of the screen and the pointer crosses it on the way to other windows, so the sound would fire while the player is doing something else — the intrusion `VISION.md` §5.1 forbids. A click is an intent, and already has `UiClick` |

Gains put till and plant **below** the harvest that rewards them: the loop should get quieter as it gets more frequent, not louder.

The `SOUND_URL` map is exhaustive by type, so adding a catalogue entry without a file fails the build rather than playing silence — it caught both new sounds immediately.

**A stronger version of the E2E build finding, found here.** `npm test` _itself_ leaves `out/` production-built: `devtools-excluded-from-production.test.ts` runs `npm run build` in its `beforeAll`, because the only honest way to prove devtools are stripped from a release is to inspect a real artifact. So the unit gate and the build gate BOTH clear the debug build away, and the E2E rebuild must be the last thing before `npm run test:e2e`. The 07.7 work surfaced this by accident and the global-setup guard caught it cleanly, naming the fix. `TESTING.md` and the project memory now record it.

Gates: typecheck · lint clean. Unit **99 files / 1256 tests**. E2E **34 passed, 3 skipped**.

### 07.7j — Ambient life · Delivered

`ambient-presence.ts` (+ tests), sway in `decor-view.ts`, the four conditions resolved in `world-view.ts`.

**The presence mechanism is the milestone.** Every other effect in this phase is finite — it runs and releases its lease. Ambient motion never finishes, so it would hold the frame loop open for as long as it is enabled, on a window that sits on someone's screen for eight hours. Presence is the answer ADR-017 §2 condition 4 promised: motion runs for 8 s after any pointer activity and then **stops**, dropping its lease and leaving the world still. The next mouse movement wakes it.

That restates ADR-001's invariant rather than repealing it — _when the world is static and the player is absent, no frame is drawn_ — which is the difference between an amendment and a hole. Its tests are written around exactly that: the load-bearing case is that presence **goes absent on its own** and stays absent for the rest of the session.

All four conditions are resolved in **one expression, every frame**, and the same answer drives both the drawing and the lease. They cannot disagree: a swaying world with no lease would stutter, and a lease with no sway would be a permanent cost for nothing.

**What the art allowed, and what it did not.** §3 and §10 between them name eleven ambient effects. Two were built.

| Asked for                                | Built  | Why                                                                                                                                                                                                                 |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flower / bush / tree sway                | yes    | they are individually-addressable sprites in the `objects` layer                                                                                                                                                    |
| Wind gusts                               | yes    | the same sway, phase-derived per tile so a hedgerow ripples rather than pulsing as one block                                                                                                                        |
| **Grass sway**                           | **no** | terrain is baked into 16×16-tile chunk `RenderTexture`s. Swaying it means re-rendering chunks every frame — the exact budget catastrophe ADR-001 exists to prevent, and far worse than the lease it would also hold |
| Windmill, chimney smoke, flags           | **no** | no windmill, no chimney, and no flag exists in the building set. `storage_shed`, `rest_hut`, `seed_bin`, `market_stall`, `tree`, `rock`, `bush`, `flower` — that is all of it                                       |
| Butterflies, bird shadows, cloud shadows | **no** | no art, and a tinted 2 px speck is not a butterfly                                                                                                                                                                  |

Rocks do not sway, which is the whole of the rule for what does.

The disabled path restores upright **exactly once** and then costs nothing — without that guard it would write a rotation to every plant on every frame of a still world, which is the defect the milestone exists to avoid.

Gates: typecheck · lint · cycles clean. Unit **100 files / 1270 tests**. E2E **34 passed, 3 skipped**.

### 07.7k — Measurement, invariants and docs · Delivered (interim accounting)

> **Superseded by 07.7L, 07.7M and 07.7N.** This section is kept as written
> because it is the record of what was true at the time: three criteria
> unmeasured, six settings unreachable, four documents unsynchronised. All of
> it is now closed — the final position is the acceptance table at the end of
> this document, not this section. The strikethrough below marks the gap 07.7L
> filled.

This milestone's job is accounting, so it reports rather than claims.

#### Acceptance criteria, honestly

| #   | Criterion                                                        | State                                                                                          |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Byte-identical world from the same seed + commands               | **Met** — existing determinism properties, unchanged and passing                               |
| 2   | Byte-identical save                                              | **Met** — `save-round-trip`, `save-compatibility`                                              |
| 3   | Every fixture still migrates                                     | **Met** — `save-fixtures`                                                                      |
| 4   | No `sim` → `renderer` import; no animation state reaches the sim | **Met** — `check:boundaries`, `check:cycles` clean                                             |
| 5   | p99 tick unchanged                                               | **PASS (measured 07.7M)** — 0.100 ms vs 3 ms budget                                            |
| 6   | Every animation releases its lease                               | **Met in unit** — `animation-lease`, and every pool asserts it empties                         |
| 7   | Ambient off (the default): zero frames on a static world         | **Met** — `render-budget.spec.ts`                                                              |
| 8   | Ambient ON + pointer idle: zero frames                           | **PASS (measured 07.7M)** — 0 FPS, 0 leases after 14 s                                         |
| 9   | 20 collapse/expand cycles, no retained growth                    | **Met** — `render-budget.spec.ts` criterion 18, still passing with every new pool              |
| 10  | Pools never allocate after construction                          | **Met** — `particle-pool`, `floating-number-state`                                             |
| 11  | 30-minute run at maximum effect density within the heap ceiling  | **PASS (measured 07.7M)** — 3.2 MB vs 25 MB ceiling                                            |
| 12  | Each setting suppresses exactly its own class                    | **Met in unit** — but not reachable by a player; see the gap                                   |
| 13  | Reduced Motion overrides without overwriting                     | **Met in unit** — same                                                                         |
| 14  | Settings in `settings.json`, never in a save                     | **Met** — `settings-schema`                                                                    |
| 15  | Identical animation choices from the same seed                   | **Met** — `presentation-rng` and `worker-personality` statelessness tests                      |
| 16  | `world.rng` untouched by any renderer path                       | **Met** — nothing under `renderer/render` imports it; `decor`'s generator-position test passes |

**Fourteen met (three measured in 07.7M), two met only in unit.** The two remaining — criteria 12 and 13 — were closed by 07.7L, which made the settings reachable, and are asserted end-to-end in `companion.spec.ts`.

#### The gap that matters most — CLOSED in 07.7L

~~**The six accessibility settings have no user interface.**~~ They are stored, parsed, defaulted, carried across `CompanionState`, resolved through `effectiveMotion`, and they genuinely gate every effect in this phase — but `SettingsPanel` has no controls for them and there is no IPC setter. A player can only change them by hand-editing `settings.json`.

That is the same failure shape this phase kept finding in older code — a complete mechanism with no path to it — and it deserves naming plainly rather than filing under polish. It also blocks criterion 8 end to end: the invariant test needs ambient motion switched on, and nothing can switch it on.

Scope to close it: an `InvokeChannel` setter, a main handler beside `applyVolumePercent`, a controller method, six controls in `SettingsPanel`, and the E2E invariant case that then becomes possible.

#### Documentation

- `PERFORMANCE.md` §4.2 **corrected**. Both zero-work invariants named `tests/e2e/idle-cost.spec.ts`, which does not exist and never has. They are enforced — in `render-budget.spec.ts` — but a reader checking the named file would have found nothing and reasonably concluded the invariants were unguarded. The new ambient-idle case is listed as untested, because it is.
- `CHANGELOG.md` — the phase entry.
- `GAME_DESIGN.md`, `ARCHITECTURE.md`, `PLAN.md`, `VISUAL_REFERENCE.md`, `TECHNICAL_ASSET_SPEC.md` — **not yet updated**.

#### What this phase refused, gathered in one place

Fourteen named effects were not built, each for a stated reason rather than by omission: scratch-head and sit (no pose art); worker-step and button-hover sounds (an ambient bed, and a non-action); grass sway (terrain is baked into chunk textures, so it would mean re-rendering them every frame); windmill, chimney smoke and flags (no such buildings exist); butterflies, bird and cloud shadows (no art); XP floating numbers (no XP system); and the `×` glyph (illegible at this size).

### 07.7L — Accessibility settings UI · Delivered

The gap 07.7k named. Six controls in the settings panel, an Accessibility section, and the `SetMotion` IPC channel that never existed.

**One model change, made deliberately.** The brief asks for Animation Intensity as a **0–100% slider**; 07.7a had modelled it as a three-value enum. That was my choice at the time and it was the wrong one — every curve is damped by multiplication, so any value in between always worked, and the enum only ever limited the UI. It is now a percent dial on the same range and step as opacity and volume, so a player does not have to learn a second kind of control.

That needed a migration, and the migration has a trap worth naming: a bare fallback-to-default would have taken a player who chose `minimal` and jumped them to **full** motion. `LEGACY_INTENSITY` maps the three stored strings onto the dial instead, and a test pins `minimal → 0` specifically.

**The IPC patch is partial by design.** Six independent controls sending the whole object would let two rapid toggles race, the second carrying a stale copy of the first's field. Main merges then re-parses through the same schema the settings _file_ goes through, so a renderer — untrusted by ADR-003 §3, and literally untrusted once v0.2 runs plugin code — cannot write a value a hand-edited file would have been refused.

**Reduced Motion is first in the section and disables the other five**, because it is a master switch rather than a seventh option. The E2E case asserts the property that makes it safe: the controls grey out while their stored values stay put, so clearing it gives the player back exactly what they had.

Every control carries a title, a description, its current value, and a tooltip. The toggles label their **current state** rather than the action they would take, so a screen reader and a glance agree with `aria-pressed`.

A second partial-fixture crash surfaced on the way — `storedMotion()` threw on a payload without a `motion` key, taking the whole panel down. The controller already tolerated absence in `sameMotion` for exactly this reason; the getter now matches. A settings panel that throws on a malformed payload is worse than one showing defaults.

Gates: typecheck · lint · cycles clean. Unit **100 files / 1283 tests**. E2E **36 passed, 3 skipped** (two new).

### 07.7M — Performance validation · Delivered

Instrumentation, then harness, then measurement, in that order. **Every figure is read from a running window and has a file behind it in `docs/perf/`.**

#### The three open criteria, now measured

| #   | Criterion                                 | Result                                                                           | Evidence                                  |
| --- | ----------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| 5   | p99 simulation tick                       | **PASS** — 0.100 ms against a 3 ms budget, 1,287 batches                         | `docs/perf/criterion-5-tick.json`         |
| 8   | Ambient motion returns to zero-frame idle | **PASS** — 100 FPS / 1 lease while watched, **0 FPS / 0 leases** after 14 s idle | `docs/perf/criterion-8-ambient-idle.json` |
| 11  | Heap under sustained effect density       | **PASS** — 3.2 MB growth over 30 min at 99.7% active, against a 25 MB ceiling    | `docs/perf/criterion-11-heap.json`        |

Criterion 8 is the one that matters most: it is ADR-017 §2 condition 4 proven rather than argued, and it is what makes the ambient-motion exception legitimate instead of a hole in ADR-001. It could not be measured until 07.7L made the setting reachable.

#### M1 — what was missing

The tick budget is stated as a **p99** and nothing could measure one. The loop reported a rolling ticks-per-second, which is an average and hides exactly the tail a p99 exists to expose — so "p99 tick unchanged" had never been checkable.

The histogram keeps a ring of the last 4,096 samples rather than bucketed counts: buckets answer with a bucket edge, and this decides whether a budget was met, where _"somewhere between 2.5 and 3 ms"_ is not an answer. Recording is one float write into a pre-allocated array; reading sorts a copy — the right way round when writes happen 20×/second forever and reads happen when someone opens a panel.

It is **absent from production by construction**. `FEATURE_PROFILER` is a compile-time literal, so a release build takes the loop's un-instrumented branch — no clock reads, no call, one comparison — and Rollup drops the module.

#### The first soak was invalid, and that is the useful part

The initial 30-minute run reported a confident **0.00 MB growth**. It was wrong. It moved the pointer once per 5 s sample, and the four IPC metric reads per iteration pushed the gap past the 8 s presence timeout — so **66% of the run was idle** and it measured the cheap state the test exists to avoid.

Nothing about the output looked suspicious. It was caught by checking the `anim` column rather than trusting the number, which is the only reason the corrected run happened. The harness now reports `activeShare` and asserts it exceeds 0.8, so the same mistake fails loudly instead of passing quietly, and the bad run is kept as `criterion-11-heap.INVALID-33pc-active.json`.

The corrected run reached **99.7% active** and told a different story: 3.2 MB of growth rather than none.

#### What the heap number does and does not show

```
11.3 MB ── flat for 20.0 min (198 samples)
            └─ one step at t=19.99 min
14.5 MB ── flat for 10.0 min (100 samples)
```

**One step, then flat — not a trend.** A per-frame or per-effect leak grows progressively. Extrapolating 3.2 MB linearly to eight hours gives ~51 MB and would breach the ceiling; that extrapolation would be **wrong**, because the data shows it is not linear.

`performance.memory.usedJSHeapSize` reported exactly **two distinct values across 298 samples**. Chromium coarsens it deliberately, so the measurement bounds growth below its bucket size but cannot show byte-level stability, and cannot separate a real 3.2 MB allocation from one bucket crossing. The improvement — CDP `Runtime.getHeapUsage` — is recorded in `PERFORMANCE.md` §11 as the thing to do before this figure is trusted more finely than "well under 25 MB".

#### Coverage moved the wrong way, and that is worth stating

**65.37% → 63.41% lines, 64.28% → 63.24% branches**, measured at the phase close against gates of 80% / 75%.

The cause is structural rather than neglectful, and it is the same one recorded at the 07.5f close: a game-feel phase is mostly **view** code, and the Pixi wrappers cannot honestly be unit-tested — `TESTING.md` §4.1 says so, and assigns `renderer/render` a 50% bar precisely because asserting on GPU output in a unit test produces brittle tests that verify nothing.

This phase added roughly a thousand lines of exactly that: `particle-view`, `floating-numbers`, the animated half of `crop-view`, the worker-view transforms, and the settings markup. The pure halves it extracted alongside them — `crop-anim`, `presentation-rng`, `particle-pool`, `floating-number-state`, `worker-personality`, `camera-shake`, `ambient-presence`, `animation-lease`, `histogram` — are all well covered and account for most of the 190 tests added.

The denominator grew faster than the numerator. That is the honest description, and the underlying mismatch is unchanged from 07e and 07.5f: `TESTING.md` §4 sets per-area thresholds and assigns none to devtools, preload, or bootstrap, while the config counts them all toward a single global 80%. Reconciling that is an owner decision, not something a polish phase should quietly work around by writing assertion-free tests to move a number.

#### M4 — no optimisation performed

Nothing exceeded a budget, so nothing was optimised. The brief's rule and the project's own: never optimise speculative code.

#### A pre-existing E2E flake, attributed rather than assumed

`save.spec.ts` "autosave fires on its own cadence" failed during final validation, asserting >1,080 simulated ticks after 60 s and getting 272. It is **not a 07.7M regression**, and that was established by measurement rather than argument:

| Build                                      | Ticks observed |
| ------------------------------------------ | -------------- |
| 07.7M, profiler on                         | 272            |
| 07.7M, profiler off                        | 24             |
| **07.7L (`a29a72b`), before any M change** | **61**         |

It fails identically before the phase, and the spread across runs shows it is sensitive to machine load rather than deterministic — those runs all followed two consecutive 30-minute soaks. **It passed on the final full-suite run**, once the machine had settled, which is the same conclusion from the other direction. The test assumes an unthrottled window sustains ~20 ticks/s for a full minute, which a loaded machine does not guarantee. Logged as a known flake; not chased here, because chasing it inside a performance phase would mean changing test code to make a number look better.

---

## Phase 07.7 Completion Report

**Status: COMPLETE.** Closed 2026-08-01 at `ab70ddf` + this commit.

### Overview

A presentation-only pass over a game that was correct and inert. Seventeen
commits across twelve milestones, adding no gameplay mechanic, no simulation
field, and no event the simulation did not already need.

The through-line was not the effects. It was **finding art and code that
already existed and had never been connected** — three separate instances, each
shipped and invisible:

| Found                                           | Since      | Effect                                        |
| ----------------------------------------------- | ---------- | --------------------------------------------- |
| `tilled.png` never read by the terrain renderer | phase-05.5 | tilling produced no visual change at all      |
| The `crops` atlas never loaded by `world-view`  | phase-05.6 | every crop sprite resolved to `Texture.EMPTY` |
| A six-frame `harvest` swing never selected      | phase-05.5 | workers stood still through every task        |

`WorkerView.invalidateTile` had also existed since phase-02 with **zero callers
in the entire codebase**. The fourth instance arrived during this phase and was
caught before commit: a `.slot` CSS rule for a class the inventory panel does
not have.

### Architecture impact

**One new decision: ADR-017**, numbered 017 rather than the 016 the brief asked
for, because ADR-016 is Audio and this phase depends on it.

It exists because the brief contradicted itself: §12 forbids violating
render-on-demand while §3 and §10 ask for a rotating windmill, drifting clouds,
and swaying grass — all unbounded. The resolution splits motion into finite
(free at idle, on by default) and ambient (off by default, and **surrendering
the frame loop when the pointer goes idle**), which restates ADR-001's invariant
rather than repealing it.

ADR-017 amends ADR-001 §1 and extends ADR-016 §6. ADR-001 through ADR-011 are
frozen (ADR-012), so amending ADR-001 by successor ADR is the sanctioned path
and was taken deliberately rather than by editing a frozen document.

Everything else is additive and confined to `src/renderer/render` plus the
settings model. `check:boundaries` and `check:cycles` are clean.

### Accessibility

Six controls, all reachable, all persisted, all gating real behaviour:

| Control           | Type          | Default | Governs                             |
| ----------------- | ------------- | ------- | ----------------------------------- |
| Reduced motion    | toggle        | off     | master switch over the five below   |
| Animation         | slider 0–100% | 100%    | how far every finite curve travels  |
| Particles         | toggle        | on      | dust, leaves, sparkles, coin bursts |
| Camera shake      | toggle        | **off** | large harvests and placements       |
| Ambient animation | toggle        | **off** | plant sway                          |
| Living details    | toggle        | **off** | worker breathing and fidgets        |

Reduced Motion and work mode **override without overwriting**: the stored values
survive, so clearing either returns exactly what the player chose. That property
is asserted in unit and end-to-end.

The three unbounded classes default off because they hold the frame loop open —
the accessibility default and the performance default are the same decision.

### Game feel

Till, plant, grow, harvest and sell each acknowledge themselves; workers swing,
ease, hop and fidget; the HUD lifts and presses. Full inventory in
`GAME_DESIGN.md` §Game feel and `VISUAL_REFERENCE.md` §Motion vocabulary.

### Performance validation

Measured, never estimated. Evidence in `docs/perf/*.json`, methodology and
caveats in `PERFORMANCE.md` §11.

| Criterion                              | Result                                 |
| -------------------------------------- | -------------------------------------- |
| 5 — p99 tick                           | **PASS** 0.100 ms vs 3 ms              |
| 8 — ambient returns to zero-frame idle | **PASS** 0 FPS, 0 leases after 14 s    |
| 11 — heap under load                   | **PASS** 3.2 MB vs 25 MB, 99.7% active |

No optimisation was performed: nothing exceeded a budget.

### Documentation changed

`PLAN.md`, `ARCHITECTURE.md` (§12, the motion layer), `GAME_DESIGN.md`,
`PERFORMANCE.md` (§4.2 corrected, §11 added), `PROJECT_STRUCTURE.md`,
`VISUAL_REFERENCE.md`, `TECHNICAL_ASSET_SPEC.md`, `CHANGELOG.md`, this phase
document, and `ADR-017`.

---

## Final acceptance table

Nothing here is ambiguous.

| #   | Criterion                                               | Verdict  | Evidence                                    |
| --- | ------------------------------------------------------- | -------- | ------------------------------------------- |
| 1   | Byte-identical world from seed + commands               | **PASS** | existing determinism properties             |
| 2   | Byte-identical save                                     | **PASS** | `save-round-trip`, `save-compatibility`     |
| 3   | Every fixture migrates                                  | **PASS** | `save-fixtures`                             |
| 4   | No sim→renderer import; sim cannot read animation state | **PASS** | `check:boundaries`, `check:cycles`          |
| 5   | p99 tick unchanged                                      | **PASS** | `docs/perf/criterion-5-tick.json`           |
| 6   | Every animation releases its lease                      | **PASS** | `animation-lease`, per-pool emptiness tests |
| 7   | Ambient off: zero frames on a static world              | **PASS** | `render-budget.spec.ts`                     |
| 8   | Ambient on + idle: zero frames                          | **PASS** | `docs/perf/criterion-8-ambient-idle.json`   |
| 9   | 20 collapse/expand cycles, no retained growth           | **PASS** | `render-budget.spec.ts` crit 18             |
| 10  | Pools never allocate after construction                 | **PASS** | `particle-pool`, `floating-number-state`    |
| 11  | 30-min run at max density within ceiling                | **PASS** | `docs/perf/criterion-11-heap.json`          |
| 12  | Each setting suppresses its own class                   | **PASS** | `settings-ui`, `companion.spec.ts`          |
| 13  | Reduced Motion overrides without overwriting            | **PASS** | `companion.spec.ts`                         |
| 14  | Settings in `settings.json`, never a save               | **PASS** | `settings-schema`, `companion.spec.ts`      |
| 15  | Identical animation choices from the same seed          | **PASS** | `presentation-rng`, `worker-personality`    |
| 16  | `world.rng` untouched by any renderer path              | **PASS** | boundary + `decor` generator-position test  |

**16 PASS · 0 BLOCKED · 0 N/A.**

---

## Technical debt register

Recorded, not fixed — this phase fixes nothing.

| #   | Item                                                                                       | Reason                                                                                                                                                                                                                                                                                                                                                                                                                      | Impact                                                                                                                                              | Recommended action                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | ~~**Coverage 63.41% / 63.24% vs 80% / 75%**~~ — **RESOLVED (phase-08.0)**                  | The cause was three things, not one: six of the seven published thresholds were never enforced by the config; 1,378 lines of Pixi and Electron binding sat in the denominator contributing 34 covered lines; and real gaps hid behind that arithmetic                                                                                                                                                                       | —                                                                                                                                                   | Closed at **95.26% / 85.95%** against a raised 90 / 85 project gate. Every area threshold went up or stayed; none went down. `tests/coverage-policy.test.ts` now fails if `TESTING.md` §4 and the config disagree, so the drift cannot recur silently                                                                                                                                    |
| 2   | **`performance.memory` is quantised** — two distinct values across 298 samples             | Chromium coarsens `usedJSHeapSize` deliberately                                                                                                                                                                                                                                                                                                                                                                             | Criterion 11 bounds growth below the bucket size but cannot show byte-level stability                                                               | Re-measure with CDP `Runtime.getHeapUsage` before trusting the figure more finely than "well under 25 MB"                                                                                                                                                                                                                                                                                |
| 3   | **Performance figures come from one 28-core desktop**                                      | Only hardware available                                                                                                                                                                                                                                                                                                                                                                                                     | A ceiling check, not a floor; says nothing about a low-end laptop                                                                                   | Re-run the harness on the lowest target spec before v0.1 ships                                                                                                                                                                                                                                                                                                                           |
| 4   | **`save.spec.ts` autosave-cadence flake**                                                  | Assumes an unthrottled window sustains ~20 ticks/s for 60 s; a loaded machine does not guarantee it. Fails identically at the pre-phase commit (61 ticks)                                                                                                                                                                                                                                                                   | Intermittent red on a loaded machine                                                                                                                | Replace the wall-clock assumption with a tick-count wait, or mark it load-sensitive                                                                                                                                                                                                                                                                                                      |
| 5   | **`companion.spec.ts` opacity-slider flake**                                               | Observed once in one of two full runs during 07.6; passes in isolation 8/8                                                                                                                                                                                                                                                                                                                                                  | Rare intermittent                                                                                                                                   | Investigate on next sighting; note carried since 07.6                                                                                                                                                                                                                                                                                                                                    |
| 6   | **Scratch-head and sit fidgets not built**                                                 | Need pose art that does not exist; a transform fake reads as a rendering defect                                                                                                                                                                                                                                                                                                                                             | Two of five suggested idle behaviours absent                                                                                                        | Art request: four poses (× four facings for sit)                                                                                                                                                                                                                                                                                                                                         |
| 7   | **Windmill, chimney smoke, flags not built**                                               | No such buildings exist — the set is shed, hut, seed bin, market stall, tree, rock, bush, flower                                                                                                                                                                                                                                                                                                                            | §3 of the brief is unbuilt                                                                                                                          | Art request, gated on those buildings existing                                                                                                                                                                                                                                                                                                                                           |
| 8   | **Butterflies, bird and cloud shadows not built**                                          | No art; a tinted 2 px speck is not a butterfly                                                                                                                                                                                                                                                                                                                                                                              | Part of §10 absent                                                                                                                                  | Art request                                                                                                                                                                                                                                                                                                                                                                              |
| 9   | **Grass sway not built**                                                                   | Terrain is baked into 16×16 chunk `RenderTexture`s; swaying it means re-rendering chunks every frame                                                                                                                                                                                                                                                                                                                        | The most-requested ambient effect is absent                                                                                                         | **Architectural**, not art: needs a different terrain renderer, and would trade away what makes the overlay cheap. Do not attempt as polish                                                                                                                                                                                                                                              |
| 10  | **Worker-step and button-hover sounds refused**                                            | A footstep is an ambient bed with extra steps; a hover is not an action and fires while the player reaches for another window                                                                                                                                                                                                                                                                                               | Two of four requested hooks absent                                                                                                                  | Revisit only if a focus mode or single-worker follow makes them appropriate                                                                                                                                                                                                                                                                                                              |
| 11  | **XP floating numbers are shape-only**                                                     | No XP system exists                                                                                                                                                                                                                                                                                                                                                                                                         | `FloatingKind.Xp` has no producer                                                                                                                   | Wire when an XP system lands; the call site is the only change                                                                                                                                                                                                                                                                                                                           |
| 12  | **GC frequency and CPU% not measured**                                                     | No instrumentation exists; both need CDP traces                                                                                                                                                                                                                                                                                                                                                                             | Two of 07.7M's requested metrics unmeasured                                                                                                         | Add via CDP if a budget is ever written against them — none currently is                                                                                                                                                                                                                                                                                                                 |
| 13  | ~~**Catch-up over-credits**~~ — `PLAN.md` §8 criterion 14. **RESOLVED (phase-09c)**        | One symptom, TWO defects. (a) `planted`: a final replant was credited that the window had no time for, then back-dated to `end` with a `Math.min` — a clamp accepting an impossible timestamp instead of refusing the action. (b) `harvested`: tiles were scheduled independently at full cadence, as though a worker were dedicated to each, so a one-worker two-tile farm was credited a cycle only two workers could run | —                                                                                                                                                   | Closed. Both counterexamples are pinned regressions, each with a mutation control. A cycle now counts only if it completes STRICTLY inside the gap, which restores the margin worker-sharing consumes. Modelling sharing properly was rejected as far too conservative — offline progress that reads as broken is worse than one that slightly under-counts                              |
| 14  | ~~**The two `assertNeverOver` properties carry no pinned seed**~~ **RESOLVED (phase-09c)** | They sampled fresh farms every run, against `TESTING.md` §6.2, so the gate passed by sampling for months with debt 13 latent beneath it and was green or red between runs on one commit                                                                                                                                                                                                                                     | —                                                                                                                                                   | Both pinned to `PROPERTY_SEED`. The trade is recorded in the file rather than hidden: a pinned seed no longer discovers counterexamples on its own, which is right for a release gate whose job is to answer the same question every time. Broad exploration is now a deliberate act — change the constant, run it, pin what it finds. Verified across five unseeded runs before pinning |
| 15  | **`tsconfig.tools.json` is never typechecked**                                             | `npm run typecheck` runs the sim, main and renderer projects only                                                                                                                                                                                                                                                                                                                                                           | No test file is type-checked in CI; `tsc -p tsconfig.tools.json` reports 210 pre-existing errors, mostly a missing `jsx` flag for `.test.tsx` files | Add the tools project to the `typecheck` script, then fix what it names. Nothing phase-08.0 added contributes to the count                                                                                                                                                                                                                                                               |

---

## Quality summary

| Gate                            | Result                                              |
| ------------------------------- | --------------------------------------------------- |
| Typecheck (sim, main, renderer) | clean                                               |
| Lint (`--max-warnings 0`)       | clean                                               |
| Boundaries                      | clean                                               |
| Cycles                          | no violations (212 modules)                         |
| Unit                            | **101 files / 1,299 tests**, 0 skipped              |
| E2E                             | **38 passed, 4 skipped**                            |
| Build                           | clean, production and debug                         |
| Coverage                        | **63.41% / 63.24%** against 80% / 75% — see debt #1 |

Unit suite grew from 89 files / 1,093 tests at phase start: **+12 files, +206
tests.**

**Known skips**, all deliberate and all self-explaining: three E2E cases need a
GPU adapter this environment lacks, and the heap soak is opt-in behind
`PERF_SOAK_MINUTES` because a thirty-minute run does not belong in a pre-commit
suite.

**Known flakes:** debt items 4 and 5.

---

## Lessons

**The recurring defect in this codebase is not broken code — it is finished code
with no path to it.** Four instances in one phase: tilled soil, the crops atlas,
the worker swing, and a CSS rule for a class that does not exist. Each looked
complete from every angle except the one where a player stands. The cheap check
that catches all four is _"what actually reads this?"_ — asked of the consumer,
not the producer.

**A measurement that looks clean can be measuring the wrong thing.** The first
30-minute soak reported a confident 0.00 MB growth and had spent 66% of its run
idle. Nothing about the output was suspicious. It was caught by checking a
column nobody was asserting on, which is now asserted (`activeShare > 0.8`).

**Refusing is part of delivering.** Fourteen named effects were not built, each
with a stated reason. A speculative `×` glyph that reads as a block, a scratch
pose faked with a jitter, or a footstep that never stops would each have been
worse than the absence — and a phase that quietly built them would have looked
more complete while being less honest.

**Write the off-switch first.** 07.7a shipped the accessibility settings before
any effect existed. Every milestone after it was gated by construction rather
than retrofitted — and the one thing that was retrofitted (reaching the settings
from the UI) is exactly the thing that went missing for four milestones.

---

## Recommendations for the next phase

The brief asks for "recommendations for Phase 07.5", which is already closed
(the v0.1 RC, 2026-07-27). Reading that as _the next phase_:

1. **Reconcile the coverage gate before anything else.** It is the only gate
   still red, it has now moved the wrong way twice in a row for the same
   structural reason, and no feature work will fix it. It is an owner decision
   about what the threshold should measure.
2. **Re-measure on the lowest target hardware.** Every performance figure here
   comes from a 28-core desktop.
3. **Do not attempt grass sway as polish.** It is a terrain-renderer
   architecture change (debt #9).
4. **The art requests (debt #6–8) are the cheapest remaining visual wins**, and
   all three are blocked on assets rather than code.
