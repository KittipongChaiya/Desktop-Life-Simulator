# v0.6 Release Candidate — Honest Position

> **Status:** Release candidate. Phases 54–63.
> **Owns:** What v0.6 claims, what it measured, and what it does not claim.
> **Does not own:** The phase records (`docs/phases/phase-5*.md`,
> `phase-6*.md`); the roadmap (`PLAN.md` §5B); the content decision (ADR-046).

**Date:** 2026-08-20

---

## 1. What v0.6 is

**The first version that added no simulation system.**

v0.1 through v0.5 built a farm, a world, a town, automation, and then made all
of it playable and legible. What none of them added was much to _do_. At v0.5's
close the entire content of the game was **4 crops, 6 purchasable buildings, 2
recipes, 1 authored quest chain, 3 expedition sites, 4 residents and 11
placeholder sounds** — five versions of content-_driven_ systems running a
demo-sized table. ADR-035's factory model, built for chains, ran one two-step
chain. Four crops could not fill four seasons.

That is why a perfect player exhausts the progression arc in twelve minutes, and
why `PLAN.md` §2.2's fourth product criterion — _a tester returns unprompted on
a second day_ — had never been closable. **There was no second day in the box.**

| Registry         | v0.5 | v0.6    |
| ---------------- | ---- | ------- |
| Crops            | 4    | **12**  |
| Recipes          | 2    | **9**   |
| Items            | 13   | **36**  |
| Buildings        | 10   | **13**  |
| Expedition sites | 3    | **6**   |
| Authored quests  | 1    | **5**   |
| Sprites          | 242  | **298** |

### 1.1 The constraint that defines the version

ADR-046 §1: no new system, no new command kind, no new save-schema field, no new
extension point. Every phase is a data edit plus the art and audio that data
names.

**It held for the whole version.** `plugins/core` grew; `src/sim` did not, except
for the id constants the data refers to. That is ADR-004 §5 — _definitions are
data, instances reference them_ — paying out six versions after it was written,
and §15 of `save-compatibility-report.md` is what it bought: **no migration, no
schema change, no new save version.**

### 1.2 Scope bounded by rules, not by counts

A content version has no natural end. "Enough crops" is a feeling, and a version
scoped by a feeling either stops early or never stops.

ADR-046 §2 fixed ten rules **before any content was authored** — three plantable
crops per season, no strictly dominated crop, chains with real depth, two recipes
per factory, a ladder above the Market Stall, an authored chain per resident, two
routes to every resource, destinations that are not one ordering, no unreachable
sound, an arc that still clears its bounds.

`tests/content-census.test.ts` carries all ten, gated on `PLAN.md` §0's own phase
table: marking a phase COMPLETE turns its rules into hard assertions, so _"phase
complete"_ and _"the phase's rule holds"_ are one claim rather than two that
drift. **No `it.skip`** — a pending rule still runs, still prints its violations,
and still asserts it is legitimately pending. Verified by inversion at phase 54.

**All ten pass.**

---

## 2. The eight release gates

`PLAN.md` §8, run fresh for this document rather than cited from a phase.

| Gate               | Result                                                          |
| ------------------ | --------------------------------------------------------------- |
| Save compatibility | **PASS**                                                        |
| Performance        | **PARTIAL** — one ceiling exceeded by a single sample; see §3.3 |
| Coverage           | **PASS** — 95.05% lines, 86.63% branches                        |
| Boundaries         | **PASS**                                                        |
| Docs               | **PASS**                                                        |
| ADRs               | **PASS** — ADR-046 written; ADR-028 amended                     |
| Data loss          | **PASS** — zero known defects                                   |
| Dead code          | **PASS** — no placeholders, no skipped tests                    |

---

## 3. What was measured

Every row below is the result of a run made for this document, sequentially,
with nothing else competing — because contention is what corrupted a gate at
phase 54 and it was worth not repeating.

| Check                    | Result                                                    |
| ------------------------ | --------------------------------------------------------- |
| `typecheck` (×3 configs) | **PASS**                                                  |
| `lint`                   | **PASS** — 0 errors, 0 warnings                           |
| `check:cycles`           | **PASS** — 0 violations; 360 modules, 1,298 dependencies  |
| `format:check`           | **PASS**                                                  |
| **Unit suite**           | **PASS** — **3,366 tests, 263 files**, 740.6 s, exit 0    |
| **E2E**                  | **PASS** — **89 passed, 4 skipped, 0 failed**, 10.3 min   |
| **Coverage**             | **PASS** — 3,365 tests, 95.05% lines, 86.63% branches     |
| Save compatibility       | **PASS** — every golden fixture loads; no migration added |
| Package                  | **PASS** — 115,179,549-byte NSIS installer, exit 0        |
| Signature                | **NotSigned**, verified against the artifact — see §5.6   |

### 3.1 The E2E suite went green on the first run

**89 passed, 4 skipped, 0 failed** — the same numbers v0.5 closed on, and no
flake. That is worth stating plainly because v0.5 spent fifteen full suite runs
getting there, and the fixes it landed (poll for a condition, never sleep and
assert; `shoot()` rather than `page.screenshot()`; `waitForDevTools` before any
function key) held through a version that changed the content underneath them.

**The 4 skips, named rather than summarised** — the temptation is to write "the
GPU criteria" and be one out:

| Skipped                                                       | Needs                   |
| ------------------------------------------------------------- | ----------------------- |
| criterion 8 — draw calls stay under the ceiling               | a real graphics adapter |
| criterion 12 — expand and collapse timing budget              | a real graphics adapter |
| criterion 18 — twenty collapse/expand cycles do not leak      | a real graphics adapter |
| criterion 11 — heap stays flat under sustained effect density | a real graphics adapter |

Three are the render-budget criteria carried as blocked since v0.4; the fourth
is the effect-density heap check in the perf harness, which is the same
dependency and is easy to forget because it lives in a different file. All four
are blocked, not failing.

### 3.2 Coverage

**PASS**, and green on the first run — which it was not at phase 54.

|            |                                     |
| ---------- | ----------------------------------- |
| Tests      | **3,365 passed**, 262 files, exit 0 |
| Duration   | 2,571.8 s                           |
| Lines      | **95.05%** against a 90% threshold  |
| Branches   | **86.63%** against 85%              |
| Statements | 93.22%                              |
| Functions  | 92.85%                              |

The counts differ from the unit suite's 3,366 across 263 files by exactly one
file and one test: `memory-longrun.test.ts` is excluded here on purpose, because
under V8 instrumentation its heap measurement would be the instrumenter's as
much as the game's (`vitest.coverage.config.ts` says why). It runs unexcluded in
`npm test`, which is where its result means something.

**Phase 54's red gate stayed fixed.** That run failed on a single timeout —
`catch-up.test.ts`'s saturation case at 131 s against a 120 s default that had
never been scaled for a run three times longer than `npm test`. Scaling the
default rather than the one test was the right level to fix it at: five other
files drive tens of thousands of ticks with no declared budget and were one bad
minute from the same failure. None of them tripped.

### 3.3 Performance — measured twice, because the first reading was worthless

Six commits landed **while the E2E suite was measuring CPU to three decimal
places**, each one running eslint and prettier. `PERFORMANCE.md` §18.2 already
carries the sentence that condemns that, written at v0.5 after phase 46 reported
a regression built on a reading taken minutes after a build:

> **A performance number taken on a busy machine is not a performance number.**

Those artefacts were discarded and the suite re-run with nothing else on the
machine. Only the second reading is below.

| Measure                  | v0.5 RC  | **v0.6 RC**                | Budget           |          |
| ------------------------ | -------- | -------------------------- | ---------------- | -------- |
| Tick average             | 0.060 ms | **0.106 ms**               | < 0.5 ms         | PASS     |
| Tick p99                 | 0.2 ms   | **0.3 ms**                 | < 3 ms           | PASS     |
| Tick p99, full v0.4 load | 0.400 ms | **0.600 ms**               | < 3 ms           | PASS     |
| Unattended CPU, mean     | 0.533%   | **0.975%**                 | < 1.0% target    | PASS     |
| Unattended CPU, max      | 0.818%   | **2.026%**                 | **2.0% ceiling** | **OVER** |
| Heap, unattended farm    | 14.5 MB  | **12.8 MB**                | 25 MB            | PASS     |
| Idle frame loop          | quiet    | **0 fps, no dirty frames** | quiet            | PASS     |

**The tick roughly doubled, and that is the version's real cost.** The loop
resolves twelve crops where it resolved four and thirty-six items where it
resolved thirteen. It is visible in four independent scenarios and is still five
times inside the average budget. ADR-003 §2's trigger for moving the simulation
off the main thread stays unmet by a factor of five — though v0.6 halved that
margin.

**One number is over its ceiling and is reported as over.** Unattended CPU max
read 2.026% against 2.0% — 0.026 points, on one sample of sixty, on a metric
whose _mean_ is inside target. The same reading has appeared before (phase 46:
2.013%; v0.5 RC: 0.818%), so it is spiky rather than steady, and **nothing has
bisected the spike.** A ceiling that gets rounded down when it is nearly met is
not a ceiling, so the performance gate is **PARTIAL**, not PASS.

**Heap went down** — 12.8 MB against 14.5 MB, with 56 more sprites. §18.3
predicted the opposite. No explanation is offered because none was measured.

---

## 4. Two rules were amended rather than met

ADR-046's own Revisit-if clause says: _amend the rule in writing; do not satisfy
it narrowly and move on._ It fired twice.

**R-05 was not checkable.** It asked for three buildings above the Market Stall
"each relieving a distinct bottleneck", and no test can read that sentence. The
obvious implementation counts buildings — which is satisfied by three more
factories at three prices, one rung repeated. A building's KIND is now derived
from its definition the way ADR-035 derives what a factory is: `storageSlots`
makes it storage, a recipe naming it makes it a factory. R-05 requires **two or
more kinds**.

**R-09 asked for something this version could not honestly deliver.** It said no
sound is "described as a placeholder", and the only mechanical reading of that
is whether an authored `.wav` exists. That conflates method with quality — and
ADR-043 settled the quality question at v0.5: _"I cannot hear them... changing
synthesis I cannot evaluate would be guessing with a straight face."_ Nothing has
changed. Dropping generated WAVs into `assets/src/audio/` would have turned the
check green while changing nothing a player hears, and cost the project its one
honest sentence about its own audio.

R-09 now asks that the audio has **no holes**: every sound has a trigger. All
eleven do. The timbre is still placeholder, still honestly described as such.

---

## 5. What the gates found

None of these would have appeared in a passing suite. They are the version's
real yield.

### 5.1 A state the game cannot leave

**Nothing refuses a purchase that leaves the player with no crops, no seeds, and
less than one seed's worth of coins.** From there the farm has no way to earn:
planting needs a seed, a seed needs coins, coins need a harvest.

For a game whose promise is that you can walk away and come back to something
better, a state that never recovers _while it runs_ is worse than an ordinary
bad move. Every other mistake in this design costs time. This one costs the save.

Found because the progression model did it — it bought a seed bin down to 4
coins holding nothing, and a strawberry seed costs 8. **Recorded, not patched**
(`GAME_DESIGN.md` §6.4a, with three candidate fixes): every plausible remedy is
a system, and ADR-046 §1 binds this version to content. **Reachability by a real
player is UNMEASURED.**

### 5.2 The measuring instrument was lying, in the convincing direction

The arc's first run reported `core:strawberry — NEVER, peak 100 coins`, which
reads as _a crop shipped four hours ago is unplayable_. It is not: the same farm
run without the model's building policy earns **66,720 coins** over the same four
hours.

Two bugs, both six versions old. The policy spent past the price of a seed —
invisible while turnip (5) and pea (3) were the only openings cheap enough to
survive it. And `peakCoins` was sampled at the one moment in the cycle when the
purse is always empty, so **every failing run printed `peak 100`**, the starting
float, including runs that had held over a thousand coins. The tell was flax:
stage 4 at 13m, and also `peak 100`.

### 5.3 A suite-load failure is invisible to a `×` filter

Two expedition destinations were refused at registration for over-filling a
worker's bag. `createInstalledRegistries()` throws, the file registers zero
tests, and the run prints `Test Files 1 failed` with **no `×` line at all**. I
had been filtering output for `×`, so an entire content type failing to register
went unnoticed for a phase.

> **Read the `Test Files` line, not just the `×` lines.**

### 5.4 Three UI tests were pinning list positions

`map-ui.test.tsx` used `getAllByRole('Send')[0]` three times and meant _the River
Delta's_. Adding a destination ahead of it made all three test a different place
— and one, the supplies guard written after a real bug on the running app, would
have gone **permanently green for the wrong reason**: it would have been checking
a destination that needs no supplies and is correctly enabled on an empty farm.

### 5.5 The coverage default timeout was never scaled

A 39-second test had 120 seconds in a run that takes three times longer than
`npm test`. **And it is not instrumentation** — measured alone, that test takes
38.9 s plain and 36.6 s with V8 coverage on. The cost is contention. Fixed at the
mechanism: the coverage config now scales the default by the same factor
`longRunBudget` uses.

### 5.6 The build log says it signed the installer, and it did not

`npm run package` logs `signing with signtool.exe` three times.
`Get-AuthenticodeSignature` reports `NotSigned`. Checking the artifact rather
than the log is the whole difference — and a phase whose one job is honesty
about signing could easily have quoted a build log saying the opposite.

---

## 6. The seven success criteria

`PLAN.md` §5B, each reported in the evidence class ADR-040 assigns it.

| Criterion                                           | Class              | Status             |
| --------------------------------------------------- | ------------------ | ------------------ |
| All ten ADR-046 §2 content rules pass               | Machine-verifiable | **PASS**           |
| The v0.5 golden save fixture loads unchanged        | Machine-verifiable | **PASS**           |
| Idle cost inside `PERFORMANCE.md` budgets           | Machine-verifiable | **PARTIAL** — §3.3 |
| The arc clears both floor and ceiling after content | Machine-verifiable | **PASS**           |
| A build installs and runs on a clean machine        | Machine-verifiable | **UNTESTED**       |
| The first worker hire produces "oh, I see"          | **Human-playtest** | **OPEN**           |
| A tester returns unprompted on a second day         | **Human-playtest** | **OPEN**           |

**On the installer.** It exists, it is the right size, it is named `0.6.0` and
it is honestly unsigned. Whether it installs and runs on a clean Windows machine
is untested, and installing it _here_ would prove nothing about the machine that
matters — this one has the toolchain, the runtime and the project on it. Marked
UNTESTED rather than PASS.

**On the two human criteria.** ADR-040 fixed this rule at the start of v0.5
precisely so it could not be fudged at the end of a version: evidence requiring a
person's reaction may never be marked PASS from a session with no person in it.
No substitute is reported in their place, for the second version running.

**What v0.6 changes about them is that they are now askable.** The fourth
criterion — _a tester returns unprompted on a second day_ — was not merely
unmeasured before this version; it was **unaskable**, because a perfect player
exhausted the content in twelve minutes and there was no second day to return
to. There is now content to come back to and an artifact to come back with.
Whether anybody does is still a question only a person can answer.

**Perceptual acceptance of the art remains the owner's**, as it was at v0.5. The
56 new sprites were reviewed on contact sheets and five were redrawn on that
evidence — which is AI-observable in ADR-040's sense, not a claim that they look
good.

---

## 7. Decisions recorded

- **ADR-046 — The Content Tier.** What a content version is, the ten rules, the
  add-never-rename constraint, and the delegated balance authority.
- **ADR-028 §5.1 — the signing exception, extended and made expensive.** The
  expiry moves to `0.7.0` by the owner's direction, and extending it now costs a
  written row with a date plus a blocker line in `PLAN.md` §0. Verified by
  inversion.
- **`VISION.md` §4 amended** to authorise the tier, as `PLAN.md` §9.3 requires —
  and the amendment records that the same rule was **not** followed when v0.5
  opened, rather than backdating the row.
- **ADR-044 upheld.** The arc was re-measured and did not move, so **no balance
  was changed.** The authority to change it existed; the evidence did not ask.

---

## 8. Known blockers and deferred work

**Blocked:**

- **Code signing** — the owner's certificate purchase. Now blocks _publication_
  rather than development. Everything else ADR-025 asks for is built.
- **Three update-behaviour tests** — need a published release.
- **Three GPU render criteria** — need hardware with a real adapter.
- **Two product criteria** are human-playtest and can never be closed by a
  session with no person in it (ADR-040).

**Deferred, with reasons:**

- **The soft-lock** (§5.1) — needs a system; recorded in `GAME_DESIGN.md` §6.4a.
- **`worker.ts` recognises the Rest Hut by hardcoded id**, which
  `ARCHITECTURE.md` §3.4 forbids. It makes a second rest building impossible as
  content, and is why the ladder has two kinds rather than three.
- **No `craftCompleted` or `expeditionReturned` event**, so the two longest
  waits in the game are silent. For an idle game the completion signal is the
  feedback channel.
- **Audio timbre** — unchanged, and unchangeable by a session that cannot hear
  it.
- **Rocks, bushes and ore veins at the old scale** — carried from v0.5.
- **Offline hauling** — carried from v0.4.
- **Phase 29** — still CONDITIONAL on ADR-003 §2's unmet trigger.

---

## 9. What this release candidate claims

That v0.6's scope is complete; that all ten content rules pass and are enforced
rather than reported; that no save schema changed and every prior fixture loads;
that the arc was re-measured and left alone because the measurement said to; and
that two of the ten rules were **amended in writing** rather than met, both with
the reasoning recorded.

It does not claim the installer works on a clean machine — that is untested. It
does not claim the audio sounds good. It does not claim the soft-lock is
unreachable. And it does not close either human-playtest criterion.

What v0.6 changes about those two is that they are now **askable**: there is
content to come back to, and an artifact to come back with.
