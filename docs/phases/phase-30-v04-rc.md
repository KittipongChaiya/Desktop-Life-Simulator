# Phase 30 — v0.4 Release Candidate

> **Delivers:** every `PLAN.md` §8 gate re-run **fresh** rather than cited, the
> four success criteria reported against evidence, the economy validated
> against infinite-money loops, and `RELEASE-v0.4-RC.md`.
> **Governing decisions:** `PLAN.md` §8 (the gates); the v0.3 lesson that a
> version boundary re-runs every check rather than trusting older results —
> applied at phase 24 and due again here.
> **Schema:** none.
> **Status:** **Complete.**

---

## Why every gate is run again

v0.3 closed with a lesson worth more than the phase that produced it: **at a
version boundary, re-run every check fresh rather than trusting older
results.** Phase 24 applied it before v0.4 added a single system and found
three things. This phase applies it at the other end.

The principle underneath is the one the owner stated for this whole version:
_never accept "documented as implemented" as proof of "actually implemented"_.
A gate cited from a phase document is a claim about the past. A gate run today
is a fact about the repository.

## What running them found

Four things, and the last two are the phase's real yield.

**Nothing was wrong with the build.** Typechecks, lint, boundaries, cycles,
`npm audit`, the migration chain, a production-build startup, and asset
regeneration were all clean on the first run.

**Asset regeneration is byte-identical to what is committed** — every PNG in
the repository is reproducible from its script, so nothing in the build is art
nobody can regenerate.

**A sprite gate that could not have caught the next bug.** The registry-based
checks in `sprite-keys.test.ts` were written in phase 25 for exactly the class
of defect phase 27 then shipped anyway, because the gate enumerated registries
and the resource-node registry was new. A gate that lists what it knows about
cannot know about the next thing. It now scans the **source** for anything
shaped like a sprite key — 54 today, all resolving — which covers registries,
render-time overrides, decor's prop table, and whatever a future view
hardcodes.

**A worker could be stranded for ever by a corrupt save.** Reading phase 28's
own deserializer against the invariant it created found a comment saying _"there
is nothing to reconcile here"_ — and there was. Expeditions introduce a
cross-field invariant, **a worker is `Away` if and only if a trip names them**,
and the loader trusted it. A worker marked away with no trip behind them is
skipped by the FSM by design and brought back by nothing: a hand the player
paid for, permanently unusable, with nothing on screen to explain it.

That is the data-loss class, which §8 makes blocking without exception. Four
corruptions, four repairs, each chosen to restore what was paid for without
inventing anything — and all four tests red with the reconciliation removed.

## The economy, validated rather than asserted

The owner asked for the economy to be checked for infinite-money loops. The
useful part was finding a claim narrow enough to be checkable:

> **Every profitable loop is gated by TIME, and every loop gated only by COINS
> is at best break-even.**

Not "nothing profits" — the whole game is meant to profit. A player with a
million coins and no workers must not be able to click themselves richer; a
player with workers is supposed to get richer, because that is what workers are
for.

`tests/economy-loops.test.ts` checks it in eleven claims: the seed round trip
never profits (single or repeated fifty times); the **recipe graph has no
cycle**, walked as an item graph because a cycle can span several recipes and no
single one would look wrong; selling drives its own price down; and every
declared source — nodes, expeditions, crafts, crops — is gated by time rather
than coins.

One assertion was corrected **against the design rather than the reverse**: the
repeated-sell loop asserted a strict fall every round and failed at round four,
because the multiplier has a floor. The brake is a floor, not a cliff — a glut
is worth less rather than worthless — so it now asserts non-increasing with a
real fall by the end, and says why at the assertion.

## The four success criteria

Three PASS, one PARTIAL, reported in `RELEASE-v0.4-RC.md` §3.3 with evidence.
The PARTIAL is criterion 4, and it is stated as what it is rather than rounded
up: offline, a chain's **buffers** are credited and the chain is not, because
nothing models hauling across a gap. It under-credits deliberately, which
`GAME_DESIGN.md` §9.2 permits and the reverse would not.

The reason that shortfall is acceptable and its opposite would not be: every
wrong guess in a hauling model lands on the side that credits work the
simulation would have refused, which is the 09c over-credit's exact shape.

## The version does not bump

ADR-028's signing tripwire holds `0.4.0` hostage to the owner's certificate,
exactly as it held `0.3.0`. The repository ships version-stamped `0.1.0` —
**four versions of game behind its own version string** — which is the tripwire
working rather than an oversight.

The critical path to a published release still runs through that purchase and
nothing else, and the three v0.2 update-path proofs still wait behind the first
published release, which waits behind signing. Third version running.

## Deliberately not in this phase

- **The version bump.** §above; it is the owner's purchase, not code.
- **Presence-gating of gameplay-feedback animators.** v0.3 handed this forward
  as an open design question and v0.4 did not resolve it either. Carried again,
  explicitly, rather than quietly dropped.
- **A hauling model for offline chains.** Criterion 4 stays PARTIAL until one
  exists and is proven never-over, which is a version's worth of care rather
  than an RC's.
