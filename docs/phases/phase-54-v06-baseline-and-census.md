# Phase 54 — v0.6 Baseline & The Content Census

> **Delivers:** every `PLAN.md` §8 gate re-run **fresh** rather than cited;
> `VISION.md` §4 amended to authorise the v0.6 tier; ADR-046; the ten content
> rules; and `tests/content-census.test.ts`, the instrument that enforces them.
> **Governing decisions:** ADR-046 (the content tier); ADR-026 (content
> identity); ADR-004 §5 (definitions are data); `PLAN.md` §9.3 (a new version
> tier amends `VISION.md` first).
> **Schema:** none. No v0.6 phase has one — that is ADR-046 §1.
> **Status:** **Complete.**

---

## Why a phase document exists again

v0.1 through v0.4 wrote one of these per phase. **v0.5 wrote none**, and its
record accumulated in `PLAN.md` §0 instead — the resume block, which must
describe the current version and nothing else. By the end it was 770 lines, and
when v0.6 opened, every one of them had to move.

They did move, to `docs/phases/v05-phase-record.md`, unedited apart from the
resume-block scaffolding. Nothing was lost. But the reason it had to be rescued
at all is that a section whose job is "where are we now" had been used as
"everything that has happened", and those two jobs pull in opposite directions:
one wants to be short enough to read on arrival, the other wants to be complete.

So v0.6 returns to the older convention. **§0 stays a resume block; each phase
writes its own record here.** That is a decision this document is making, and
the cost of the alternative is measured rather than assumed: 770 lines.

## Re-running the gates rather than citing them

The standing lesson from v0.3, applied at phase 24, again at phase 30, and again
at phase 52: **at a version boundary, run every check fresh.** A gate cited from
a phase document is a claim about the past.

| Gate                     | Result                                                        |
| ------------------------ | ------------------------------------------------------------- |
| `typecheck` (×3 configs) | **PASS**                                                      |
| `lint`                   | **PASS** — 0 errors, 0 warnings                               |
| `check:cycles`           | **PASS** — 0 errors; 361 modules, 1,298 dependencies cruised  |
| `format:check`           | **PASS**                                                      |
| Unit suite               | **PASS** — 3,334 tests, 261 files, 813 s                      |
| Coverage thresholds      | **PASS** — 95.02% lines, 86.61% branches, against 90 / 85     |
| Coverage gate            | **FAIL** — one test timed out; exit 1. Root-caused below      |
| Save compatibility       | **PASS** — the golden-fixture tests are inside the unit suite |
| E2E                      | **DEFERRED** to phase 63 — see below                          |

Nothing was wrong with the build. The findings this phase produced all came from
the census instead, and all three were the instrument disagreeing with a
document.

**This table was briefly wrong, and how is worth recording.** It was drafted
with every row already reading PASS, before coverage and E2E had been run —
which is precisely the failure `AI_RULES.md` §10.6 names, and the reason v0.5's
RC document carries a §3.5 about a claim that was false when written. A gate
table is a set of claims; the only thing that makes it worth reading is that
each one was checked. The rows above are the results of runs, and one of them
is red.

**Coverage is split into two rows on purpose.** The thresholds — the number the
gate exists to produce — are met with room to spare. The RUN exits 1 because a
single test timed out, and reporting that as one combined "coverage: FAIL" would
hide the good number, while reporting "coverage: PASS" would hide the red build.
Both are true and they are different facts.

**E2E is deferred to phase 63 rather than claimed.** It needs a fresh
`electron-vite build`, phase 55 changes the asset atlas, and running it here
would measure a build that no longer exists by the end of the version. `PLAN.md`
§8 requires it at the version boundary, which is phase 63, and that is where it
runs.

## What the census found before it enforced anything

**Ten buildings, not six.** The scoping note for this version counted
`buildings.ts` and reported six. There are ten registered: the other four are
the town's cottage, well, notice board and castle, defined in `town.ts` and
priced at zero because the player never buys them. Six is right for R-05's
purposes and ten is right for the registry — and the difference is exactly what
an instrument catches and a count-by-hand does not.

**Two seasons out of four, not four.** The same note said "in any season the
player has exactly two plantable crops." Turnip grows year-round and each other
crop covers two adjacent seasons, so **spring and winter offer two; summer and
autumn offer three.** R-01 reports two violations, not four.

**The defect is volume, not domination — and that changes what to author.** The
note went on to say the crops in a season are "strictly ordered," meaning one is
simply better. The dominance check written for R-02 **passes today**: turnip is
cheap and fast, pumpkin is expensive and slow and pays far more per visit, and
neither beats the other on all three axes R-02 measures.

That correction matters more than the other two, because a rule aimed at the
wrong defect authors the wrong content. R-02 is carried anyway — as a guard
against the obvious way to satisfy R-01, which is twelve crops in a neat power
ordering that re-creates the problem R-02 was written to prevent.

## The gate, and why it is not `it.skip`

Nine of the ten rules are false the day they are written. The obvious move is
`it.skip` with a TODO, and it is wrong twice: a skipped test is invisible in a
green run — `PLAN.md` §8's dead-code gate forbids skipped tests outright — and a
TODO is a promise with no mechanism behind it.

**The gate is `PLAN.md` §0's own phase table.** A rule declares the phase that
satisfies it and is enforced once that phase is marked COMPLETE. So:

- Marking phase 55 COMPLETE turns R-01 and R-02 into hard assertions. Marking it
  complete **without** satisfying them turns the suite red — which is the point.
  "Phase complete" and "the phase's rule holds" become one claim rather than two
  that can drift apart.
- A pending rule still runs, still computes its violations and still prints them,
  so progress is visible every run rather than at the end.
- A pending rule also asserts it is **legitimately** pending. It cannot be parked
  by lying about the gate, because the gate and the resume block are the same
  table, and `plan-state.test.ts` already guards that table against drift.

**Verified by inversion**, which is the only way to know a guard works. Marking
phase 55 COMPLETE early fails with:

```
AssertionError: R-01 (three plantable crops per season) is enforced because
PLAN.md §0 marks phase 55 COMPLETE, and it does not hold:
  core:spring has 2 plantable crops
  core:winter has 2 plantable crops
```

The state was restored immediately and the suite returns to 13 passed.

## The floor that makes "add, never rename" real

ADR-026 makes a `ContentId` permanent: an instance in a live save stores the id
and resolves the definition at load. Renaming `core:wheat` orphans every wheat in
every save, and removing it does the same — and `PLAN.md` §8 makes data loss a
blocking gate, always.

`BASELINE` in the census test pins all 73 ids that existed at the v0.6 baseline
— 64 across twelve registries, plus 4 residents and 5 quest chains. Deliberately removing
content in some later version means editing that list, which is exactly the
amount of friction the decision deserves.

## The defect the gate found, and the wrong theory it cost

**`catch-up.test.ts`'s saturation case timed out at 131 s against a 120 s
limit.** It steps 50,000 ticks twice, it has never declared its own timeout, and
it passes in `npm test`.

Phase 52 built `longRunBudget()` for exactly this shape of problem and applied
it to the four tests that **declare** timeouts. Nothing scaled the DEFAULT, so
every test relying on `testTimeout: 120_000` was left with the same allowance in
both runs.

**The obvious explanation was instrumentation, and measuring it falsified that.**

| Run                          | Duration   |
| ---------------------------- | ---------- |
| solo, `vitest.config.ts`     | **38.9 s** |
| solo, coverage config, V8 on | **36.6 s** |
| inside the full coverage run | **131 s**  |

V8 coverage costs this test nothing measurable. What costs it 3.4× is
**contention**: the coverage run is 2,479 s of wall-clock against `npm test`'s
813 s, so the workers overlap three times as long and every CPU-bound test
stretches. A 39-second test under a 120-second timeout has three times headroom,
and a saturated machine eats it.

That correction matters beyond this test. `long-run-budget.ts` describes its own
multiplier as "the cost of instrumentation", and its table was measured the same
way — inside full runs. It is very likely the same effect wearing the same wrong
name, and both files now say so.

**The fix is the mechanism, not the instance.** `vitest.coverage.config.ts` now
scales the default `testTimeout` by the same factor `longRunBudget` uses.
`schedule-determinism`, `expeditions`, `gathering`, `sim-headless` and
`dry-farm` all drive tens of thousands of ticks with no declared budget and are
one bad minute from the identical failure; enumerating and measuring them one at
a time would have fixed five instances and left the mechanism.

**The coverage gate is re-run clean at phase 63**, which is where its result is
claimed. It is reported here as FAIL rather than as fixed, because a fix that
has not been re-run through the gate it was written for is a hypothesis.

## What this phase deliberately did not do

**No content was authored.** Phase 54 is scope and instrument only. Authoring
against a rule that has not been written down is how a content version stops
having an end.

**No balance was changed**, although the authority to do so was granted for this
version (ADR-046 §4). Nothing has been measured yet that requires it, and
ADR-044's standard is unchanged: a balance change needs a measurement it is
responding to.

**The 770 lines of v0.5 narrative were moved, not summarised.** Rewriting
somebody's record into a shorter version of itself loses the parts whose value
was not obvious at the time.
