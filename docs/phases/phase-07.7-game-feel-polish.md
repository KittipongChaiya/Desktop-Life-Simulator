# Phase 07.7 — Game Feel Polish

> **Delivers:** The first full game-feel pass. Every action the player takes, and every action a worker takes, is acknowledged with motion.
> **Runnable at completion:** The same game, playing identically, that feels responsive instead of correct-but-inert.
> **Governing decision:** **ADR-017** (game feel — motion classes, the lease rule, pooling, derived randomness). Bound by ADR-001, ADR-005, ADR-007, ADR-008, ADR-014, ADR-016.
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
| 07.7i | Sound hook extension             | Till, plant, worker step, button hover added to the ADR-016 catalogue and its placeholder generator                                        | **Pending**   |
| 07.7j | Ambient life (opt-in)            | Building motion (§3) and environment motion (§10), behind ADR-017 §2's four conditions, with the idle-surrender behaviour                  | **Pending**   |
| 07.7k | Measurement, invariants and docs | Budgets measured and recorded; §4.2's second invariant case added; the six documents synchronised; phase report                            | **Pending**   |

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

### Remaining

07.7e–07.7k pending, in the order listed above. Budgets are measured in 07.7k; per `PERFORMANCE.md` §10, **a phase does not complete with an unmeasured budget.**

Budgets are measured and recorded in 07.7k; per `PERFORMANCE.md` §10, **a phase does not complete with an unmeasured budget.**
