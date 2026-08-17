# Phase 23 — v0.3 Release Candidate

> **Delivers:** the version closed against evidence. Every `PLAN.md` §8 gate
> freshly run on 2026-08-17, all five §4 success criteria judged and ticked,
> the cross-platform question re-evaluated as `VISION.md` §5.1 required, and
> the honest position recorded in `RELEASE-v0.3-RC.md` — including the two
> procurement-shaped items that stand between this candidate and a published
> `0.3.0`.
> **Governing documents:** `PLAN.md` §4/§8; `RELEASE-v0.2-RC.md` (the shape
> this close follows); ADR-028 §5 (the signing tripwire this close honours).
> **Schema:** none.
> **Status:** **Complete.**

---

## What running the gates found

The point of running gates freshly instead of citing last month's numbers is
that fresh runs find things. This one found three:

1. **The coverage gate was red.** `src/persistence` branches sat at 86.55%
   against its 90% bar — the strictest in the project — dragged down by
   exactly what the v0.1 compatibility report predicted: migration guards
   never fed malformed documents, and sort comparators never handed two
   out-of-order entries (every prior suite happened to hold single-entry
   collections). Sixteen adversarial tests closed it at 90.53%
   (`tests/migration-defensive.test.ts`, `tests/serialize-ordering.test.ts`);
   the report's §12.4 records the v0.1 caveat as finally closed, by the exact
   means it prescribed.
2. **A runner allowance had run out of headroom.** The instrumented
   8-hour-idle long-run crossed its 15-minute timeout by eleven seconds —
   the same 576,000 ticks now step contracts, quests, demand, and the town.
   Raised to 30 minutes and re-proven green (908 s). Lesson recorded in the
   RC: runner budgets should gain headroom in the same commit that adds a
   tick system.
3. **The `coverage` script name in this session's muscle memory was wrong**
   (`test:coverage` is real) — trivial, but the kind of thing a checklist
   run surfaces and a citation never would.

## The criteria, and the one that is a decision

Four of the five §4 criteria closed on phase evidence (schedules, the
reason-to-plant, responsive-not-unpredictable with its subjectivity stated,
budgets profiled at every step). The fifth — cross-platform — is a
re-evaluation, and the evaluation is recorded in the RC rather than waved
at: the overlay's identity is Windows-shaped mechanism by mechanism, the
gating procurement (signing) is unfinished even for Windows, and every
measurement in the project is Windows-taken. **Windows-only stands for
v0.3**; the option remains open for v0.4+ and `VISION.md` §5.1 needed no
amendment — it asked for exactly this reconsideration.

## What deliberately did not happen

No version bump. The signing tripwire (`tests/signing-exception.test.ts`)
fails the suite at `0.3.0` until `electron-builder.yml` configures real
signing, and that is the mechanism working: the repository ships
version-stamped `0.1.0` until the owner's certificate lands. The three
v0.2 update-path proofs remain parked behind the first published release,
which itself waits on signing — the RC's closing sentence is that the
critical path to shipping runs through the certificate and nothing else.

## Suites at close

All figures and the full gate table live in `RELEASE-v0.3-RC.md` §2–§3:
2,742 tests in the instrumented run (the timed-out long-run re-proven green
separately under its raised allowance), the full E2E suite, fresh coverage
with every threshold green, boundaries and cycles clean, audit clean, the
production-build smoke gate, and the performance criteria re-taken
including the combined criterion-12 run and a heap-soak spot check.
