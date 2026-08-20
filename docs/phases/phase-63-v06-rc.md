# Phase 63 — v0.6 Release Candidate

> **Delivers:** every `PLAN.md` §8 gate re-run **fresh**, the ten ADR-046 rules
> reported as enforced rather than pending, the four product criteria against
> their evidence classes, and `RELEASE-v0.6-RC.md`.
> **Governing decisions:** `PLAN.md` §8 (the gates); ADR-040 (evidence classes);
> the standing lesson that a version boundary re-runs rather than cites.
> **Schema:** none.
> **Status:** **Complete.**

---

## Why every gate is run again

The lesson v0.3 closed with, applied at phases 24, 30, 52 and now here: **at a
version boundary, run every check fresh rather than trusting older results.** A
gate cited from a phase document is a claim about the past.

Phase 54 ran them at the version's opening and the coverage gate came back red
for a reason nobody had noticed in five versions. That is the argument for doing
it twice.

## The order matters, and it is not the obvious one

`npm test` runs `devtools-excluded-from-production.test.ts`, which performs a
real **production** `electron-vite build` into `out/`. The E2E suite needs a
**debug** build, because a production build strips devtools by design and every
spec that presses a function key would find nothing there.

So the sequence is: unit suite → `VITE_FEATURE_DEBUG=true npm run build` → E2E →
coverage. `tests/e2e/global-setup.ts` fails fast with the rebuild command if
somebody gets it wrong, which is the only reason that trap is survivable.

**And they were run sequentially, one at a time, with nothing else competing.**
Phase 54's coverage gate went red because a 39-second test had 120 seconds in a
run three times longer than `npm test` — contention, not instrumentation. Having
diagnosed that, running the RC's gates concurrently would have been choosing to
reproduce it.

## The mistake I made anyway, and caught

Six commits landed **while the E2E suite was running**, each one invoking
lint-staged — eslint and prettier, repeatedly, on a machine that was
simultaneously measuring CPU cost to three decimal places.

`PERFORMANCE.md` §18.2 already carries the sentence that condemns this, written
at v0.5 when phase 46 reported a regression built on a reading taken minutes
after a build:

> **A performance number taken on a busy machine is not a performance number.**

The E2E run's performance artefacts were therefore **discarded and re-measured**
with the machine quiet, rather than reported. The numbers are in
`RELEASE-v0.6-RC.md` §3.3 and in `PERFORMANCE.md`.

That is the second time this project has made this exact mistake and the second
time it was caught by its own written record. The record earns its keep.

## What the RC reports

`RELEASE-v0.6-RC.md` is the deliverable and is not summarised here. The
structure it follows is v0.5's: what the version is, the gates as measured, what
the gates found, the decisions, the blockers, and a closing section that states
plainly what the document does **not** claim.

Two things are worth repeating in this record because they are process rather
than result:

**Two of the ten content rules were amended rather than met**, both with the
reasoning written down, both using ADR-046's own Revisit-if clause. A version
that quietly satisfied R-09 by dropping generated audio files into `assets/src/`
would have passed every check and been worth less than one that says why it
could not.

**The two human-playtest criteria are OPEN**, and no substitute was reported in
their place. ADR-040 fixed that rule at the start of v0.5 precisely so it could
not be fudged at the end of a version, and it holds here for the second time.
