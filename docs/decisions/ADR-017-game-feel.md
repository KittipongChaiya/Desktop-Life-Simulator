# ADR-017: Game Feel — motion, particles, and the idle budget

**Status:** Accepted
**Date:** 2026-08-01
**Phase:** 07.7 (Game Feel Polish)
**Bound by (not re-litigated):** ADR-001 (render-on-demand, and its zero-`requestAnimationFrame`-when-static invariant); ADR-005 §2 (snapshot slices; a slice republishing every tick is a defect); ADR-007 §1 and §5 (presentation never enters the simulation; the renderer interpolates between snapshots and the result never re-enters the sim); ADR-008 (events have a producer and a consumer); ADR-016 (audio — this extends its catalogue, it does not replace it); ADR-012 (the freeze: ADR-001 is frozen, so this is a successor, not an edit).
**Amends:** ADR-001 §1, by adding a bounded exception for _ambient_ motion. ADR-001 is otherwise unchanged and remains authoritative.

---

## Context

Phase 07.7 asks for a full game-feel pass: worker animation, crop and building feedback, camera shake, floating numbers, a particle system, environment life, and accessibility controls over all of it.

Most of that is straightforward under the existing architecture. One part is not, and it is the reason this is an ADR rather than a commit.

**The phase brief asks for two things that cannot both be true as written.** §12 requires that game feel "must not violate: idle CPU budget, render-on-demand". §2 states the correct rule outright — _"No continuous animation while idle. Only event-driven."_ But §3 asks for a windmill that "rotates slowly", chimney smoke, and swaying flags; §10 asks for grass sway, butterflies, bird shadows, cloud shadows, and wind gusts. **Every one of those is continuous by definition.** They do not end, so anything driving them holds the frame loop open forever.

That is not a small overrun. `PERFORMANCE.md` §4.2 makes it a named invariant:

> No `requestAnimationFrame` fires when the world is static (ADR-001 §1) — zero callbacks over 10 s.
>
> **Deleting or skipping either test invalidates ADR-001 or ADR-005 respectively.**

An always-swaying field of grass means rAF fires forever, on a window that `VISION.md` §2.1 says sits at the bottom of the player's screen for eight hours while they do their actual job. The product's one hard constraint is that it is cheap to leave running. Ambient motion, implemented naively, spends that constraint on decoration.

ADR-016 already faced and rejected the same trade in the audio channel: _"Anything that ticks continuously — including an ambient bed — reintroduces the idle cost ADR-001 exists to avoid."_ This ADR gives the visual channel the same answer, and makes the narrow exception explicit rather than letting it arrive by accident inside a polish commit.

---

## Decision

### 1. The animation lease is the only way anything moves

The mechanism already exists: `DirtyGate.acquireAnimation()`, used today by `effects.ts` and the camera glide. It is now the _general_ rule for every moving thing in this phase.

- A moving thing **acquires a lease when it starts** and **releases it the instant it finishes**.
- While any lease is held, the frame loop runs. When the last lease drops, it stops, and the overlay returns to drawing nothing.
- A lease that outlives its animation is a defect of the same class as a slice that republishes every tick.

This keeps every §1–§8 effect — worker animation, crop pops, harvest bursts, floating numbers, camera shake — inside render-on-demand without exception. They are all finite. They all end.

### 2. Motion is one of two classes, and they have different rights

| Class                     | Examples                                                                                                                     | Lease                                         | Default |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| **Event-driven** (finite) | till puff, plant bounce, stage-change pulse, harvest pop, coin fly, deposit, worker task transitions, camera shake, UI press | held for the effect's duration, then released | **on**  |
| **Ambient** (unbounded)   | windmill rotation, chimney smoke, flag/grass/flower sway, butterflies, bird and cloud shadows, wind gusts                    | would be held forever                         | **off** |

**Event-driven motion is unrestricted** (subject to §4 pooling). It is the overwhelming majority of what the phase asks for, and it is free at idle by construction: no event, no lease, no frame.

**Ambient motion is permitted only under all four of these conditions:**

1. **Off by default.** A fresh install has a still world. The player opts in.
2. **Never while collapsed.** Collapsed mode destroys the renderer entirely (ADR-001 §2); ambient motion must not resurrect it.
3. **Never in work mode.** Work mode is the player telling us they are busy (ADR-014). Motion is the first thing to go.
4. **Surrendered on idle.** Ambient motion stops when the overlay has had no pointer input for `AMBIENT_IDLE_TIMEOUT_MS`, and resumes on the next input. A player looking at the farm gets a living world; a player who alt-tabbed away gets a still one, and the frame loop stops.

Condition 4 is what makes this an amendment rather than a hole. The zero-rAF invariant is restated, not repealed: **when the world is static AND the player is not present, no frame is drawn.** Presence, not decoration, is what buys the frames.

### 3. The simulation does not learn that any of this exists

Unchanged from ADR-007 §1, restated because a polish phase is exactly where it erodes:

- Animations read **snapshot slices** and real time. They never read a store, never write one, and their output never re-enters the sim.
- Particles originate from **events** (ADR-008) or from settled snapshot changes — never from polling a store each frame.
- No animation may change a tick's outcome, a save's bytes, or a replay's result. §13's tests exist to prove that and are not optional.

### 4. Everything visual is pooled, and nothing allocates per frame

Particles, floating numbers, and personality sprites come from **pre-allocated pools** with a fixed ceiling. A full pool **recycles its oldest entry** — it never grows and never allocates mid-frame. A dropped sparkle is invisible; a GC pause on a 20 Hz overlay is not.

_Oldest, not newest._ `effect-state.ts` already made this call in 07.5b and its reasoning governs here: the oldest effect is furthest through its life and the least likely to be under the player's eye, while the newest is the one they just caused and are most likely watching. A mature farm can harvest several crops on one tick and an offline catch-up can credit hundreds at the load boundary, so the cap is reached in ordinary play, not just under abuse.

This extends the discipline `terrain-renderer.ts` and `building-view.ts` already follow, and the reason is the one `CODE_STYLE.md` §10 gives: Pixi objects hold GPU memory that GC will not reclaim, and collapsed mode destroys and rebuilds the scene on every toggle, so a leak here is paid on every collapse for the life of the session.

### 5. Randomness in presentation is derived, never rolled

Any animation that varies — a butterfly's path, a dust puff's scatter, which idle fidget a worker plays — derives its variation from a **hash of presentation inputs** (tile index, event tick, entity id) through a presentation-only PRNG.

**It may never draw from `world.rng`.** That is not style: consuming the simulation's generator desynchronises every future tick from a saved game (ADR-007), so a decorative butterfly would corrupt determinism. `decor.ts` already establishes the pattern and the reason — _"It is derived, never rolled"_ — and this ADR generalises it to all of game feel.

### 6. Sound hooks extend the existing catalogue

§7 asks for sound hooks and forbids adding audio assets. The catalogue already exists (ADR-016, `app/sounds.ts`): `Harvest`, `Deposit`, `Coin`, `Placement`, `Selection`, `UiClick`, `Notification`, `Error`. This phase **adds hook points** — till, plant, worker step, button hover — to that catalogue and its placeholder generator. It does not build a second sound system.

### 7. Accessibility settings are presentation preferences, and nothing else

The six controls §11 asks for (Animation Intensity, Particles, Camera Shake, Decorative Creatures, Environmental Animation, Reduced Motion) are **application preferences** under the ADR-014 §4 model, stored in `settings.json`. They are never game state, never in a save, and never visible to the simulation — so no two players' worlds can diverge because one turned off butterflies.

**Reduced Motion is a master switch**, not a seventh toggle: it forces animation intensity to its minimum, disables particles, camera shake, decorative creatures, and ambient motion, and overrides their individual settings without overwriting them.

---

## Consequences

- **Ambient life is opt-in, and most players will never see it.** Accepted deliberately. A desktop companion that costs measurable CPU while idle has failed at the thing that makes it a companion; one whose grass does not sway has merely failed to impress.
- **Idle cost is unchanged for the default install.** The §4.2 invariant holds unmodified when ambient motion is off, which is every fresh profile.
- **The invariant test must grow a second case.** `PERFORMANCE.md` §4.2's zero-rAF assertion now needs a companion assertion: with ambient motion ON and the pointer idle past the timeout, rAF must also reach zero. Without it, condition 4 is an unenforced promise.
- **Pool ceilings are a tuning surface, and dropping effects under load is correct behaviour**, not a bug to be "fixed" later by growing the pool.
- **A future session that adds a moving thing without a lease will pass every test except the idle one.** That is the trap this ADR exists to mark.

---

## Alternatives considered

**A. Allow ambient motion whenever expanded.** Simplest, and what the brief literally asks for. Rejected: the overlay is expanded for long stretches while the player works in another window, which is precisely the state `VISION.md` §2.1 optimises for. This spends the product's core constraint on decoration the player is not looking at.

**B. Drive ambient motion from the simulation tick instead of rAF.** Rejected twice over: it puts presentation in the simulation (ADR-007 §1), and 20 Hz motion looks worse than none.

**C. Drop §3 and §10 entirely.** Honest and cheap, and it was the fallback if the idle question had no answer. Rejected because condition 4 gives a real one: motion while the player is present costs nothing while they are not.

**D. A global "low graphics" mode that disables ambient motion.** This is what §10 asks for ("must automatically disable on Low graphics"), and it is _insufficient on its own_ — it makes stillness the exception rather than the default, so the common install pays. Kept as a subordinate rule under §2's condition 1, not as the mechanism.

---

## Related

| Document                                     | Relationship                                       |
| -------------------------------------------- | -------------------------------------------------- |
| ADR-001                                      | Amended by §2 of this ADR; otherwise authoritative |
| ADR-005, ADR-007, ADR-008                    | Constrain this ADR; not modified                   |
| ADR-016                                      | Extended by §6; not modified                       |
| ADR-014                                      | Supplies the settings model used by §7             |
| `PERFORMANCE.md` §4.2                        | Gains a second invariant case (see Consequences)   |
| `docs/phases/phase-07.7-game-feel-polish.md` | The phase this governs                             |
