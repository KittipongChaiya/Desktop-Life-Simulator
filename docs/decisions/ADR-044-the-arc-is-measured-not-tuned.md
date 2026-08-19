# ADR-044: The Arc Is Measured, Not Tuned

**Status:** Accepted — v0.5 Phase 51.
**Date:** 2026-08-20
**Bound by (not re-litigated):** ADR-040 (the three evidence classes, and the rule that human-playtest evidence may never be marked PASS from a session with no human in it); `GAME_DESIGN.md` §1.1 (the four-stage arc); `VISION.md` §6.3 (stage 2 is the emotional core).

---

## Context

`GAME_DESIGN.md` §1.1 has carried a "Roughly" column since v0.1:

| Stage         | Claimed       |
| ------------- | ------------- |
| 1. Manual     | first 10 min  |
| 2. Delegation | 10–30 min     |
| 3. Automation | 30 min – 3 hr |
| 4. Idle       | 3 hr+         |

Four versions were built on that table. **Nobody had ever timed it.**

Phase 31 timed it. `tests/progression-arc.test.ts` drives a model player
through the real economy — real prices, real growth timers, real hire costs —
and that player reaches stage 4 in **about twelve minutes** against a document
claiming three hours. A 15× gap.

Two lines in `GAME_DESIGN.md` tell a reader what to do about a bad arc, and
both assume the same direction:

> "If playtesting shows stage 4 arriving too late to be discovered, the fix is
> lowering the market stall's cost, not adding content." (§1.1)

> "Test balance changes against the stage table in §1.1. If stage 4 moves past
> ~4 hours of play, it will not be discovered." (§9)

Both are about the arc being too SLOW. Nothing anywhere says what to do about
it being too fast, because until phase 31 nobody knew it was.

---

## Decision

### 1. The measurement is a BOUND, and is recorded as one

The model never mis-clicks, never walks anywhere it does not have to, harvests
on the exact tick of maturity, and always knows what to plant next. **Twelve
minutes is therefore the fastest the arc can physically be completed, not a
prediction of what anybody will experience.**

`GAME_DESIGN.md` §1.1 now says this in the document itself, next to the table,
so the next person to read it is not misled by either number — the measured
bound or the invented "3 hr+".

### 2. The balance is NOT changed on this evidence

The obvious move is to raise the market stall's cost until the arc stretches.
It is not taken:

- **Tuning against a perfect-player bound is guessing with arithmetic.** The
  lever is real and well understood; the evidence for how far to move it does
  not exist. A number chosen to make a synthetic player take three hours has no
  claim on what a person takes.
- **How long a real first-time player takes has never been measured, and this
  is human-playtest evidence** in ADR-040's sense. No session without a human
  in it can supply it, and this project's rule is that such evidence is never
  marked PASS from here.
- **Economy costs reach everything.** The stall price sits upstream of
  contracts, factory payback, expedition funding and every "can I afford it"
  judgement in the game. Moving it is a product decision with a blast radius,
  and it belongs to the owner.

### 3. The measurement becomes a GUARD instead

A number that is only written down decays. `tests/progression-arc.test.ts` now
asserts a **floor** as well as its existing four-hour ceiling: a perfect player
must not reach stage 4 in under five minutes.

The floor is set far below the measurement on purpose. It is not a target and
not a balance assertion — it is a tripwire for a future change that collapses
the arc further, which nothing else in the suite would notice. The ceiling
catches an arc that got slower; this catches one that fell over.

---

## What is deliberately NOT done, and why

**No difficulty setting.** "Let the player choose" converts an unanswered
design question into a menu, and it would ship the ambiguity to the person
least equipped to resolve it.

**No content added to fill the gap.** §1.1 already forbids that response for
the slow case, and the reasoning is direction-independent: the arc's shape is a
pacing problem, and pacing is not fixed by having more things.

**No second synthetic profile** ("an average player who mis-clicks 10% of the
time"). It would produce a number that looks like evidence and is a made-up
constant wearing a measurement's clothes.

---

## Consequences

**Good**

- The design document stops asserting a timing nobody measured. That claim had
  survived four versions and would have survived more.
- The arc is now bounded from both sides in CI, so the next economy change
  cannot quietly break it in either direction.

**Bad, and accepted**

- The real question — how long does a person take? — is still open, and v0.5
  ships with it open. It is recorded in `GAME_DESIGN.md` §1.1 rather than
  carried in anybody's head.

**Risky**

- Twelve minutes may well be genuinely too fast, in which case this ADR delayed
  a fix the game needed. That is the trade taken knowingly: a wrong balance
  change is harder to detect afterwards than an unmade one.

## Revisit if

- **Somebody plays it.** A single real first-run timing turns this from an open
  question into a tuning task, and §1.1's existing lever (the stall's cost) is
  the one to reach for.
- The floor ever fires → the arc collapsed; find what changed before adjusting
  the constant, because moving the tripwire to make a suite green is how the
  measurement would be lost a second time.
