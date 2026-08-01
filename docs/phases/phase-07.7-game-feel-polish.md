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
| 07.7b | Motion foundation                | `effects.ts` generalised to a pooled particle manager (dust, leaves, sparkle, coin burst, splash); presentation PRNG; lease audit          | **Pending**   |
| 07.7c | Floating numbers                 | Pooled `+coins` / `+items` risers — fade, drift up, auto-release. XP hook shape only, no XP system                                         | **Pending**   |
| 07.7d | Crop feedback                    | Till puff · plant seed-bounce · stage-change pulse · harvest pop, scale-bounce, fade · coins fly to the wallet                             | **Pending**   |
| 07.7e | Worker animation                 | Idle breathing · arrival easing · walk smoothing · till/plant/harvest/pickup/deposit animations · task-transition blending                 | **Pending**   |
| 07.7f | Worker personality               | Cosmetic idle fidgets — look around, stretch, scratch, sit, celebrate after harvest. Derived variation, never rolled                       | **Pending**   |
| 07.7g | Camera shake                     | Configurable duration/strength/frequency; large harvest and building placement; **off by default**                                         | **Pending**   |
| 07.7h | UI feel                          | Hover and press scale, tooltip fade, inventory slot highlight, selection pulse, hotkey hint fade — **zero per-frame React commits**        | **Pending**   |
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

10. Particle and floating-number pools **never allocate after construction**. Exhausting a pool drops the newest effect and does not grow.
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

### Remaining

07.7b–07.7k pending, in the order listed above. Budgets are measured in 07.7k; per `PERFORMANCE.md` §10, **a phase does not complete with an unmeasured budget.**

Budgets are measured and recorded in 07.7k; per `PERFORMANCE.md` §10, **a phase does not complete with an unmeasured budget.**
