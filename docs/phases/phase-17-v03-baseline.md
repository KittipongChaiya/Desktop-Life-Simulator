# Phase 17 — v0.3 Baseline

> **Delivers:** the two v0.2 leftovers that were code rather than money, closed with evidence; and the combined performance baseline v0.3's entity growth will be measured against.
> **Governing decisions:** `PLAN.md` §4 (v0.3 success criteria — _"profile before adding more"_), `PERFORMANCE.md` §9 (methodology), phase-16 §Acceptance (the two criteria that stayed open).
> **Schema:** none.
> **Status:** **Complete.** Two items remain parked with named owners (§4).

---

## 1. The coverage gate, re-run and green

Phase-16 recorded the coverage gate as untested: it passed in isolation but
stalled three times when run as part of the full suite under load. The cause
was attributed to machine contention, not code — an attribution that was
itself unproven until now.

Re-run on a quiet machine, nothing else scheduled:

|          | Result                                       |
| -------- | -------------------------------------------- |
| Tests    | **2,567 / 2,567 passed** (193 files)         |
| Lines    | **95.07%** against the 90% threshold         |
| Branches | **86.56%** against the 85% threshold         |
| Exit     | 0 — every configured per-area gate satisfied |
| Duration | 787 s                                        |

The attribution was correct: same code, quiet machine, clean pass. The gate
is green, and the stall is understood as a tooling-under-load limit rather
than a product defect — exactly as phase-16 suspected but could not show.

## 2. The combined budget run (criterion 12)

Phase-16 §Acceptance, verbatim: _"Performance budgets hold with weather,
lighting, and audio active — individually yes. Together, unmeasured."_ This
phase took the measurement. Harness: `tests/e2e/perf-harness.spec.ts`
criterion 12; evidence: `docs/perf/criterion-12-combined.json`;
figures recorded in `PERFORMANCE.md` §14.

The run is arranged so nothing is left to chance, extending criterion 9's
planted-save trick to the reference scenario: the `v1-mature-farm` fixture is
loaded through the real pipeline (migrations included), stepped to the exact
start of a weather period that rains — derived from the seed, never rolled —
and planted in the profile. Rain then holds for a full five-minute period,
longer than the whole measured window. Lighting needs no arranging (layer 5
is live whenever the overlay is expanded), the ambient bed is raised through
the real bridge, and every motion class is enabled including both unbounded
ones.

**Question 1 — the tick budget under everything at once: PASS.** p99 tick
**0.5 ms** against the 3 ms budget (1,937 samples over 90 s of sustained
activity), p50 0.2 ms, max 2.4 ms. Six-fold headroom with weather, lighting,
audio, motion, and a full working farm simultaneously active. This is the
number v0.3 must protect: NPCs and a settlement will grow it, and this is
what it was before they existed.

**Question 2 — the presence-gated surrender under full load: PASS.** With the
pointer idle past the timeout, the ambient bed read **off** while it was
still raining — so "off" can only mean presence expired, never that the
weather stopped. Animation leases fell from 5 to 3 as rain and decor sway
released. Rain's visual surrender is separately pinned against the real
dirty gate in `rain-view.test.ts`.

## 3. The finding: a mature farm has no idle

The first execution of criterion 12 asserted that the frame loop stops when
the pointer leaves — the invariant criteria 8 and 9 each proved alone — and
**failed**: 100 FPS, 14 seconds after the last pointer event, with three
animation leases still held.

That failure is the most useful number the run produced, and it is not a
defect. Workers keep farming whether or not anyone watches; each harvest
re-arms a transient animator — a crop's departure tween, a floating coin
number, burst particles — faster than the previous one finishes, and worker
movement marks the world dirty every tick regardless. Render-on-demand is
drawing a world that genuinely changes. ADR-001 §1's zero-frame invariant is
a claim about a **static** world, and criteria 8 and 9 proved it on worlds
where nothing else moved. A mature farm is never static.

The consequence for the budget model: `PERFORMANCE.md` §3's "expanded idle"
state — _"world visible, nothing moving or growing visibly"_ — **does not
occur on a mature farm**. An expanded, unattended farm is permanently in the
"expanded active" cost profile, at the display's full frame rate. Collapsed
mode is unaffected (Pixi is destroyed there, ADR-001 §2), and collapsed is
where the product lives 85% of the day — but v0.3 is about to add NPCs with
daily routines, which are more always-moving entities on exactly this path.

Two things follow, and both are v0.3's to carry:

1. **The entity-budget criterion in `PLAN.md` §4 must be profiled against
   "expanded + unattended", not "expanded idle".** The cheap state does not
   exist once the world is sufficiently alive; pretending it does would
   under-count every NPC added.
2. **Whether gameplay-feedback animators should be presence-gated is now a
   design question with data behind it** — the same question ADR-017
   answered for ambient motion, one category over. It is deliberately not
   answered in this phase: it changes game feel, deserves an ADR, and v0.3's
   NPC work is the right moment to take it, when the cost of "everything
   animates for nobody" either grows into a problem or measurably does not.

## 4. Parked, with owners

Recorded as parked rather than forgotten — both were named in the v0.3 plan:

| Item                                         | Why parked                                                                                                                                | Owner         |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Code-signing certificate                     | A purchase, not code. The tripwire stands: bumping to 0.3.0 fails the suite until signing is sorted.                                      | Project owner |
| Three update paths (`RELEASE-v0.2-RC.md` §4) | Need a **published** release to run against — the NSIS path cannot be exercised from a working tree. An afternoon's work once one exists. | Next release  |

## 5. Commit boundary

One commit: the criterion-12 harness, its first evidence file, this document,
and the `PERFORMANCE.md` §14 record land together — the measurement and the
sentences that quote it are one act, the same reasoning as phase-16's
boundary collapse.
