# Phase 24 — v0.4 Baseline

> **Delivers:** every gate re-measured from zero at the version boundary; the
> production model recorded before a factory exists; a v0.3 leftover closed
> with evidence; and two documents corrected against the artefacts they
> describe.
> **Governing decisions:** ADR-035 (written here); `PLAN.md` §5 and §8;
> `PERFORMANCE.md` §9 (methodology); the v0.3 lesson that a version boundary
> re-runs every check rather than trusting older results.
> **Schema:** none.
> **Status:** **Complete.**

---

## 1. Why re-measure everything

v0.3 closed with a lesson worth more than the phase that produced it: **at a
version boundary, re-run every check fresh rather than trusting older
results.** Doing exactly that caught two problems in phase 23 alone. This
phase applies it before v0.4 adds a single system, on the principle that the
number you compare against has to be a number you just took.

It found three things, and none of them was a regression.

## 2. The gates, taken fresh

| Gate               | Result                                                             |
| ------------------ | ------------------------------------------------------------------ |
| Typecheck (×3)     | clean                                                              |
| Lint               | clean, `--max-warnings 0`                                          |
| Boundaries         | clean                                                              |
| Cycles             | clean — 318 modules, 1,073 dependencies                            |
| Unit suite         | **2,748 passed** (214 files), 282 s                                |
| Coverage           | **95.04% lines / 86.33% branches** vs 90 / 85; every area gate met |
| E2E suite          | **78 passed, 3 skipped**, 39.1 min                                 |
| Criterion 5 — tick | p99 **0.2 ms** vs 3 ms (1,286 samples)                             |
| Criterion 8        | ambient surrender intact: 29.4 FPS watched → **0 FPS, 0 leases**   |
| Criterion 12       | p99 **0.6 ms** with weather, lighting, audio, motion and town live |

The three skips are the GPU trio, environment-blocked on this machine exactly
as at v0.2 and v0.3. They un-skip on hardware with a real adapter.

The coverage run was taken **after** phase 25's first commits landed, so the
figure includes the recipe registry, the factory model, and the production
system: `production.ts` measures 100% lines / 93.75% branches, and the whole
project cleared every per-area gate on the first attempt — unlike v0.3, where
`src/persistence` branches came in under the bar and took sixteen adversarial
tests to clear. Branches at 86.33% against an 85% bar is **1.33 points of
headroom**, which is thin and stated, exactly as v0.3 stated its 0.53.

**The tick number is worth stating on its own: 0.2 ms against a 3 ms budget
is fifteen times under ADR-003 §2's worker-migration trigger.** That is the
measurement phase 29's decision turns on, and it is recorded here so the
decision is made against a number rather than an expectation (`PLAN.md` §5.1).

## 3. Criterion 11 — the acceptance soak, finally taken

v0.3 shipped this as unproven and said so: the 2-minute spot check passed,
and the 30-minute acceptance soak _"was last taken at v0.1 and has not been
re-run — stated, not rounded off."_

Re-run here at full length:

|                         | Result      |
| ----------------------- | ----------- |
| Duration                | 30 minutes  |
| Samples                 | 298         |
| Active share            | **99.7%**   |
| First-quarter mean heap | 14.5 MB     |
| Last-quarter mean heap  | 10.7 MB     |
| **Growth**              | **−3.8 MB** |

**PASS**, and not marginally: the heap ended _lower_ than it started. The
99.7% active share matters as much as the growth figure — criterion 11's own
history includes an invalid soak that ran 33% active and measured an idle
overlay, and that file is still in `docs/perf/` as the reminder.

One of v0.3's two partial measurements is therefore closed. The other, the
GPU trio, needs hardware and stays open.

## 4. ADR-035 — the production model, before any factory

Recorded first, because the part that cannot be retrofitted is not crafting —
it is **what happens when production cannot proceed**. v0.4's headline
criterion is a chain running eight unattended hours without jamming, and a jam
is not a bug a unit test finds: it is a farm that quietly stopped while the
player was at work.

The four decisions carrying weight are in the ADR; the two worth repeating are
that **a recipe names its building** (so a content pack extends `core:mill`
with no core edit), and that a factory's containers stay **out of**
`world.buildingStorage` (because `selectStorageTarget` picks nearest-with-space
blind to kind, so a mill listed there fills with turnips and starves its own
recipe, with no error anywhere to explain the stop).

## 5. The two documents that were describing things that do not exist

### 5.1 `PERFORMANCE.md` §9.3 — the reference scenario

Since v0.1 this section has described `v1-mature-farm` as _"16×16 owned plot,
200 planted crops of mixed types, 5 workers, 4 buildings, ~40 inventory
stacks, 8 hours of playtime."_

The fixture is **12×12, 24 crops, 3 workers, 4 buildings, 2 inventory stacks,
tick 500**. Every quantity was wrong except the building count, and the farm is
roughly **eight times lighter in crops** than the document claimed.

No published number is invalidated — each was a real measurement of a real
farm, and all of them sit far inside their budgets. What was wrong is the
**headroom**, which has been read against a scenario that never existed. It is
the same shape as the defect phase-08.0 found in the coverage gate: a document
wearing a gate's clothes.

**The fixture is not the thing to change.** It is also the **v1 anchor of the
save-compatibility chain** (ADR-015, `SAVE_FORMAT.md` §4.4), so regenerating it
would rewrite the evidence that every migration link is exercised against real
v1 data. §9.3 now describes the fixture truthfully, and §9.3.1 describes the
heavy scenario the harness constructs on top of it.

### 5.2 `ASSET_CATALOG.md` — the factories have no art

`buildings:mill` and `buildings:kitchen` do not exist, and `textureFor`
resolves an unknown sprite key to `Texture.EMPTY` — so naming them would ship
two buildings that are **silently invisible in the running game**. The mill
draws `storage_shed` and the kitchen draws `cottage` as marked stand-ins;
both, plus the flour and bread icons, are logged in `ASSET_CATALOG.md` §2.1 and
are blocking items on the `PLAN.md` §8 no-placeholders gate.

A wrong-looking building is a bug a player reports. An invisible one is a bug
nobody can describe.

## 6. The design question v0.3 handed forward, and why it is still open

Phase-17 found that a mature farm never reaches a zero-frame idle — workers
keep farming whether or not anyone watches, and every harvest re-arms a
transient animator faster than the last finishes. It asked: **should
gameplay-feedback animators be presence-gated the way ADR-017 §2 gates ambient
motion?**

This phase built a measurement for it, ran it four times, and **does not answer
it**. Each attempt failed differently, and every failure was silent:

1. Fast-forwarding 20,000 ticks "into steady state" drained the fixture's 25
   wheat seeds and measured a four-crop farm.
2. An A/B/A drift control was added, and immediately disqualified its own run —
   the two A readings differed by more than A differed from B.
3. Building the §9.3-scale field back-dated `plantedTick` below zero, so 200
   crops sat 10% grown and the farm never worked at all.
4. With a genuinely ripe field, 200 simultaneously-mature crops turned out to be
   a **burst** rather than a steady state: the population fell monotonically
   through all three arms, and the effect came out **negative** — feedback-on
   measuring cheaper than feedback-off — with an error bar three quarters its
   own size.

**The conclusion is about the instrument, not the question.** A crop farm is not
a stationary workload over the minutes a multi-arm comparison needs: it drains,
or it ripens in waves, and either way the load at the end is not the load at the
start. Summed `percentCPUUsage` across Electron processes cannot resolve a
sub-1% effect against that.

So the comparison was **removed rather than tuned**, and criterion 13 now
measures what it can prove:

| Unattended producing farm, feedback on | Measured      | Budget |
| -------------------------------------- | ------------- | ------ |
| CPU mean                               | **1.175%**    | < 5%   |
| CPU max                                | 1.808%        | —      |
| FPS mean                               | 92            | —      |
| Animation leases (mean / max)          | 3.72 / 9      | —      |
| Heap                                   | 12.1 MB, flat | —      |

**The position taken:** gating gameplay feedback is **not urgent** — the
absolute cost is comfortably inside the §4 expanded-active ceiling — and it is
not decided on a measurement that cannot support it. The question moves to
**phase 26**, where a production chain at steady state is a stationary workload
_by construction_ (ADR-035), which is precisely the instrument this measurement
wanted and the farm cannot provide.

### The premise is asserted now, not reported

The trimmed test failed its own crop-population check on first run, catching a
**fifth** arrangement error: advancing the clock three growth periods while
staggering plantings over one ripens the whole field and makes the stagger a
no-op — and a fully ripe field drains, because task priority is harvest before
plant before till, so the crew never reaches the tilling that would replant.
Staggering across exactly one period roughly halved the drain (193 → 143 over
ninety seconds, where it had been 170 → 83).

That failure is the most useful thing the criterion produced. Two earlier
executions reported confident numbers about farms that were doing nothing, and
both passed. **A premise that is reported rather than asserted is not a
premise** — the same lesson criterion 11's invalid soak taught, relearned one
criterion over.

## 7. What this phase deliberately did not do

No gameplay, no schema change, no new system. ADR-035 is recorded here and
**implemented in phase 25** — this phase draws the boundary and does not fill
it.

## 8. Carried forward

- **The signing certificate** — the owner's purchase, and still the entire
  critical path. Unchanged.
- **Three update-behaviour tests** — still blocked on a published release.
- **The GPU trio** — environment-blocked; needs a machine with a real adapter.
- **The presence-gating question** — reassigned to phase 26 with a stated
  reason, not dropped (§6).
- **Factory art** — `mill.png`, `kitchen.png`, `item_flour.png`,
  `item_bread.png`; §5.2.
