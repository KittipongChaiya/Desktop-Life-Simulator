# Plan: v0.7 — "While You Were Away"

**Status:** **PROPOSED — NOT APPROVED.** Three owner decisions are open (§6).
**Do not begin implementation from this file.** It is a proposal, not a mandate.
**Written:** 2026-08-21, immediately after the v0.6 RC closed.
**Complexity:** Large — a version tier, and unlike v0.6 a **systems** tier.

> `PLAN.md` §9.3: a new version tier requires amending `VISION.md` §4 first.
> Nothing here has been written into `VISION.md`, `PLAN.md`, or any ADR.

---

## 1. The finding

v0.6 tripled the content. **The return-to-game moment still describes a v0.1
farm.**

`CatchUpReport` (`src/persistence/catch-up.ts`) already computes:

```
elapsedTicks · harvests · replants · crafts · itemsStored · itemsSold · coinsEarned · blocked
```

`ReturnSummaryReport` (`src/renderer/app/return-summary.ts:30`) exposes **three
of them** — `harvests`, `coinsEarned`, `blockedAfterTicks`. Crafts are computed
and discarded. A player who leaves nine recipes and four factories running comes
back and is told how many turnips they harvested.

It gets worse further down:

| While you are away | What actually happens                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Factories**      | Drain their staged inputs and stop. `catch-up.ts:208` — _"Nothing delivers to a factory while the player is away."_    |
| **Expeditions**    | Do not return. Workers away are excluded from labour; _"the expedition system brings them in on the first live tick."_ |
| **Crafts**         | Counted, never shown                                                                                                   |
| **Quest steps**    | Not counted, not shown                                                                                                 |

And in the **live** game, `SimEventMap` (`src/sim/events/types.ts:110`) has no
`craftCompleted` and no `expeditionReturned` — so the two longest waits in the
game, up to four minutes of machine time and up to ten minutes away, happen in
complete silence. That is `ARCHITECTURE.md` §17.1's second recorded finding.

**This is `VISION.md` §2.2 — "Reward Absence, Don't Punish It" — with a hole in
it.** Every system must produce value while the player is away, and the return
should feel like collecting a gift. The gift is currently a turnip count.

## 2. Why this and not v1.0

The roadmap's next tier is v1.0: RPG progression, combat, dungeons, bosses, city
defense, a mod ecosystem. `PLAN.md` §6.1 already names combat as the place this
project is most likely to betray its own thesis.

The argument for v0.7 first is the same shape as the argument that produced
v0.6: **combat needs an economy to spend on, and this version is the one that
makes the economy work while nobody is looking.** For an idle game the return
moment is not polish — `VISION.md` §3.1 makes the glance loop the loop that
"must feel best, because it is the loop that actually happens".

## 3. Phases

Every item traces to something v0.6 measured or `ARCHITECTURE.md` §17.1
recorded. Numbering continues from v0.6's 63.

| #   | Phase                         | Delivers                                                                              |
| --- | ----------------------------- | ------------------------------------------------------------------------------------- |
| 64  | Baseline & the return audit   | Gates re-run fresh; a MEASURED gap between what happens and what is reported; ADR-047 |
| 65  | The events that were missing  | `craftCompleted`, `expeditionReturned`, and the live signals hung on them             |
| 66  | The summary tells the truth   | Surface the fields `CatchUpReport` already computes                                   |
| 67  | Offline hauling               | A chain keeps running across a gap, still rounding **down**                           |
| 68  | Expeditions come home         | A trip that finishes while you are away has finished                                  |
| 69  | The farm cannot dead-end      | The soft-lock (`GAME_DESIGN.md` §6.4a)                                                |
| 70  | Buildings are data, not names | The `CORE_REST_HUT` hardcode; unblocks content                                        |
| 71  | The spike, bisected           | Closes v0.6's PARTIAL performance gate                                                |
| 72  | v0.7 Release Candidate        | Every gate, every criterion                                                           |

**Ordering that is dictated rather than preferred:**

- **65 and 66 land first because they are cheap.** The data mostly exists and is
  being thrown away. A visible result early, before the two expensive phases.
- **67 before 68.** Offline hauling establishes the never-over-credit property as
  a test; expeditions then inherit it rather than re-deriving it.
- **71 last before the RC**, because content and catch-up changes both move the
  idle cost, and bisecting a spike against a moving target is not bisecting.

## 4. Success criteria

| Criterion                                                                                | Class              |
| ---------------------------------------------------------------------------------------- | ------------------ |
| A craft finishing and an expedition returning each emit an event and a signal            | Machine-verifiable |
| The return summary reports every field `CatchUpReport` computes                          | Machine-verifiable |
| A chain across an 8-hour gap is credited **no more** than the live simulation would give | Machine-verifiable |
| No reachable state leaves a farm unable to earn                                          | Machine-verifiable |
| A second rest building is possible as pure content                                       | Machine-verifiable |
| Unattended CPU max inside its 2.0% ceiling, **or the spike explained**                   | Machine-verifiable |
| Returning after a gap feels like collecting a gift                                       | **Human-playtest** |

## 5. Patterns to mirror

| Category          | Source                                               | Pattern                                                                |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------------- |
| Events            | `src/sim/events/types.ts:110`                        | _"Adding a member here is all a new event needs"_ — the bus is generic |
| Event → signal    | `src/renderer/bootstrap/start.tsx:805`               | `world.events.subscribe(...)` then `sound.play` + `emitParticles`      |
| Catch-up accuracy | `src/persistence/catch-up.ts`, `GAME_DESIGN` §9.2    | Statistical, **rounded down**, never over-credits                      |
| Content over id   | `ARCHITECTURE.md` §3.4                               | A system reads the definition; no `switch (id)` anywhere               |
| Doc-and-machine   | `tests/content-census.test.ts`, `plan-state.test.ts` | A fact lives in one place and is read from there                       |

## 6. Owner decisions — OPEN

**1. Is v0.7 this?** The alternative is jumping to v1.0's RPG track. Recommended
against, for the reason in §2.

**2. Which soft-lock remedy?** `GAME_DESIGN.md` §6.4a lists three, ranked by how
little they change:

- (a) the shop refuses a purchase that would cross the line, with the reason shown
- (b) a standing minimum — the player cannot spend below the price of a seed
- (c) **the wilds become the floor** — a worker with no seeds gathers wood, which
  sells

**Recommended: (c).** ADR-037 already put free material on the map, and it needs
no new rule for the player to learn.

**3. Does the 8-hour offline cap stay?** `GAME_DESIGN.md` §9.3 calls it "a
content constant, raisable later". Raising it makes absence more rewarding and
widens the catch-up error band. **Recommended: leave it**, and revisit once
offline hauling has been measured.

## 7. Risks

| Risk                                                              | Likelihood | Mitigation                                                                                                            |
| ----------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| **Offline hauling over-credits** — §9.2's one inviolable property | **High**   | A property test: catch-up ≤ live simulation over the same gap, for every chain. This is phase 67's actual deliverable |
| A new save field is needed (unlike v0.6)                          | Medium     | ADR-047 decides up front; the migration chain and golden fixtures are the gate                                        |
| The CPU spike is not bisectable in reasonable time                | Medium     | Time-box it. An honest "here is what it is not" is a valid outcome — v0.5 shipped four disproved theories             |
| Making absence more rewarding unbalances the arc                  | Medium     | Phase 72 re-measures; ADR-044's standard holds                                                                        |
| Scope creep into v1.0's RPG track                                 | Low        | Bindingly out of scope, as in v0.6                                                                                    |

## 8. On approval, before any code

1. `VISION.md` §4 — the v0.7 row (required first, `PLAN.md` §9.3)
2. `PLAN.md` §0 resume block + a new §5C with the phase table
3. **ADR-047** — what an offline guarantee is, and the never-over-credit rule
   written as a testable property rather than a sentence
4. Per-phase documents in `docs/phases/`, as v0.6 did

Validation each phase, unchanged: `typecheck` · `lint` · `check:boundaries` ·
`check:cycles` · `test` · `test:coverage` · `build` → `test:e2e` — in that order,
because `npm test` rebuilds `out/` for production and clobbers the debug build
E2E needs (`TESTING.md` §6.5).

## 9. What this plan inherits, unchanged

Carried into v0.7 whatever is decided:

- **Code signing** — BLOCKED on the certificate. ADR-028's exception expires at
  `0.7.0`, so **this is the version where that guard fires**. Extending it again
  costs a written row in §5.1 plus a `PLAN.md` §0 blocker line.
- **Two human-playtest criteria** — OPEN for a third version.
- **The installer on a clean machine** — UNTESTED.
- Rocks/bushes/ore veins at the old scale (v0.5); phase 29 CONDITIONAL (v0.4).
