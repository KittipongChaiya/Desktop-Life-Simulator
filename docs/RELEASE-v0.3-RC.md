# v0.3 Release Candidate — Honest Position

> **Status:** Release candidate. The game is playable end to end, and every
> gate that can be run on this machine has been run — freshly, for this
> document, on 2026-08-17.
> **Scope:** Phases 17–23. `PLAN.md` §4 is the milestone this document closes.
> **The version number:** the repository still says `0.1.0`, deliberately —
> see §4. The bump to `0.3.0` is the signing tripwire's expiry
> (`tests/signing-exception.test.ts`, ADR-028 §5) and happens the day the
> owner's certificate lands, not before.

---

## 1. What v0.3 is

v0.2 was a farm inside a world that moves on its own. v0.3 gives that world
**someone on the other side of the economy**:

| Added            | What it means to a player                                                           |
| ---------------- | ----------------------------------------------------------------------------------- |
| A settlement     | The world widened east; four cottages, a well, a notice board, a castle             |
| Residents        | Marla, Tobin, Prue, and Edwin live there — wake at dawn, walk their days, sleep     |
| Contracts        | The world asks: a neighbour, a quantity, a deadline, a premium — a reason to plant  |
| A dynamic market | Prices swing with the town's wants inside a declared band; a price can be good news |
| Standing         | Every delivery raises your name, nothing lowers it; a proven name sees bigger deals |
| Quests           | Gentle chains that pay for the milestones your deliveries already earned            |

Four schema versions were added (v7 → v10), including the chain's first
**relayout** (the world widening) and its first **re-key** (offer identity) —
both proven against golden fixtures that deliberately carry the data the
links must transform, after the vacuous-fixture trap was caught once and
then designed against.

The version's engineering signature is one sentence: **what is derivable is
derived.** Weather, residents, offers, demand, and standing are pure
functions of (content, seed, tick); the save grew only by promises the
player made and rewards already paid.

## 2. The eight release gates

`PLAN.md` §8. Every row states what was run, not what was intended.

| Gate               | Status  | Evidence                                                                                                                                                                                                            |
| ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save compatibility | **Met** | Chain `v1 → v10`, golden fixture at every version, 45+ compatibility tests green; guarantees stated in `save-compatibility-report.md` §12 (the v0.3 addendum, added at this RC)                                     |
| Performance        | **Met** | Re-measured for this document: tick p99, ambient idle, ambient silence, the combined criterion-12 run, and a heap-soak spot check — §3. The three GPU criteria stay environment-blocked on this machine, as at v0.2 |
| Coverage           | **Met** | **Freshly measured, complete, exit-clean this time**: project 95.26% lines / 86.59% branches; every per-area threshold green, including `src/persistence` at 90.53% branches against its 90% bar — §3               |
| Boundaries         | **Met** | `check:boundaries` and `check:cycles` clean today (318 modules, 1,073 dependencies)                                                                                                                                 |
| Docs               | **Met** | `GAME_DESIGN.md` §6.5–6.6, `SAVE_FORMAT.md` v10, `PERFORMANCE.md`, `CHANGELOG.md`, `LORE_BIBLE.md` current; every phase document closed against evidence                                                            |
| ADRs               | **Met** | ADR-030–034 recorded; ADR-032 amended same-day in the open, per the append-only discipline                                                                                                                          |
| Data loss          | **Met** | Zero known defects. The version's one economy exploit (contract re-acceptance) was caught by live verification minutes after merge and fixed with a new link, never an edit                                         |
| Dead code          | **Met** | No `.only`, no skipped unit tests, no TODO/FIXME in `src/`; the only declared skips are the environment-gated E2E criteria, each stating its reason                                                                 |

Two checks that were findings at v0.2 are now real and clean: `npm audit`
(high, production tree) reports **0 vulnerabilities**, and the
production-build smoke gate runs in CI and before any release.

## 3. What was measured, and the success criteria

**Coverage** closed with a story worth recording. The fresh run failed its
first attempt — `src/persistence` branches at 86.55% against the 90% bar,
the strictest in the project because that code protects player data. The
shortfall was exactly what the v0.1 report predicted it would be: the
defensive arms of the migration links, never fed a malformed document, and
the serializer's sort comparators, never handed two out-of-order entries.
Sixteen adversarial tests later (`migration-defensive.test.ts`,
`serialize-ordering.test.ts`) the area clears its bar at 90.53% — with 0.53
points of headroom, which is thin and stated. One runner allowance also
moved: the instrumented 8-hour-idle long-run crossed its 15-minute timeout
now that the same 576,000 ticks step contracts, quests, demand, and the
town; the allowance was raised to 30 minutes and the test re-proven green
(908 s) — a runner budget, not a simulation budget, exactly as the test's
own comment has said since v0.1.

**Performance**, re-taken for this document on the same machine as every
prior figure (a fast desktop — ceiling checks, not floors):

| Criterion                                                                           | Measured                                                             | Budget   | Status                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------- | ---------------------------------- |
| 5 — tick p99, mature farm                                                           | 0.3 ms (max 7.6 ms, 1,282 samples)                                   | < 3 ms   | **PASS**                           |
| 8 — ambient motion returns to zero-frame idle                                       | zero frames after surrender                                          | 0 frames | **PASS**                           |
| 9 — ambient audio returns to silence                                                | bed off while rain continued                                         | silence  | **PASS**, with a flake noted below |
| 11 — heap under sustained effects (2-min spot)                                      | 13.6 MB flat, first→last quarter growth **0.0 MB**, 95% active share | flat     | **PASS**                           |
| 12 — everything at once (weather, lighting, audio, motion, town, contracts, demand) | p99 0.5 ms (max 8.4 ms, 1,916 samples); away: bed off, leases 5 → 3  | < 3 ms   | **PASS**                           |
| GPU trio (draw calls, expand/collapse, leak)                                        | —                                                                    | —        | **ENVIRONMENT-BLOCKED**            |

**The criterion-9 flake, stated:** it passed three of four runs today and
failed once — in the batch where the heap soak preceded it, the bed read
"on" after the away window with zero pointer events recorded. It passed
immediately in isolation, and criterion 12's own surrender check (same
mechanism, same batch) passed. The surrender is additionally pinned by unit
tests against the real dirty gate, so this reads as measurement-environment
timing, not a regression — but it happened, so it is written down.

The criterion-11 figure is a 2-minute spot check; the 30-minute acceptance
soak was last taken at v0.1 and has not been re-run — stated, not rounded
off. The GPU-dependent render-budget criteria remain blocked on this
machine (no WebGL/WebGPU adapter; Pixi falls back to Canvas, where the
numbers are not meaningful) — the same position v0.2 shipped from, and they
un-skip automatically on GPU hardware.

**The five `PLAN.md` §4 success criteria** (ticked there, evidence here):

1. **Believable daily schedules — met.** Residents wake staggered through
   dawn, spend days among the town's places, are indoors by night, and are
   exactly where their day says after any absence — because they are derived,
   not simulated (ADR-031). Verified live on screen in phase-19.
2. **Contracts create a reason to plant — met.** The premium band is the
   only above-base coin in the game; offers ask for in-season crops; the
   board leans toward what the town wants; standing and quests pay for
   deliveries alone. The reason is structural, not decorative.
3. **Responsive without unpredictable — met, with the claim's nature
   stated.** Demand swings prices in a declared mean-1.0 band on a two-day
   cadence, nothing the player does moves it, one owner per price axis, and
   both directions read at a glance in the sell panel (verified live). No
   external playtesting has judged the _feel_; the evidence is bounded rules
   and legibility, and this sentence is the honesty about that.
4. **Entity counts within budget — met, profiled at every step.** The tick
   was measured before the town (phase-17), after the world widened
   (phase-18), with the population awake (phase-19), and combined at this RC:
   p99 unmoved at 0.2–0.5 ms against a 3 ms budget throughout.
5. **Cross-platform re-evaluated — done; Windows-only stands.** The
   evaluation: the product's identity is its overlay behaviour — work-area
   docking, taskbar absence, focusless click-through, global hotkeys — and
   each of those has a different, incompatible mechanism on macOS/Linux, so
   a port is a design project, not a build target; the platform work that
   actually gates shipping (signing) is not finished even for Windows; and
   every performance and E2E figure in this project is Windows-measured, so
   shipping an unmeasured platform would break the evidence discipline this
   document exists to uphold. The option stays open for v0.4+ under
   `VISION.md` §5.1, which asked for exactly this reconsideration and no
   more.

## 4. What is not verified, and why

### Signing — the one item between this RC and the name `0.3.0`

A purchase, not code (ADR-028): an OV/EV certificate or a cloud-signing
subscription, the owner's to make. The tripwire holds: the moment
`package.json` says `0.3.0` without signing configured, the suite fails by
design. Until then the repository ships version-stamped `0.1.0` — three
versions of game behind its own version string, which is the tripwire
working, not an oversight. SmartScreen will warn on install; artifact
integrity (SHA-512 per artifact) is verified and fatal regardless.

### The three v0.2 update paths — still unproven, unchanged

An interrupted NSIS install leaving a launchable app; restoring a
pre-migration backup into an older build; a tampered artifact being
rejected end-to-end. All three still need a **published release** to test
against, and none has been published. The circularity stands: these cannot
close before the first release, and the first release waits on signing.
An afternoon's work once a release exists, exactly as recorded at v0.2.

### The heap acceptance soak and the GPU criteria

Named in §3. Neither is new to this version and neither moved.

## 5. What this version taught, carried forward

- **The live screenshot pass earns its place in the process.** Three phases
  running it caught what the unit suites structurally could not: a spurious
  launch save (18), a loopable premium exploit minutes after merge (20), and
  a layout overflow (22). It is now institutionalized: the crafted-save
  technique became a permanent E2E (`tests/e2e/board.spec.ts`) — plant a
  save through the launcher's prepare seam, drive the real app, assert the
  exact coin delta on screen.
- **"Derive, don't store" paid five times** — weather, residents, offers,
  demand, standing — each purchase buying zero save impact, zero catch-up
  model, and offline exactness. The counter-lesson is equally recorded: the
  day a resident must _react_, that state graduates into stores with a
  schema bump (ADR-031 stated the price up front).
- **Runner allowances need review when the simulation grows.** The
  instrumented long-run sat within 1.3% of its timeout and tipped on a busy
  run. Budgets that measure the runner, not the game, should gain headroom
  in the same commit that adds a tick system.
- **Presence-gating of gameplay-feedback animators stays an open design
  question** (phase-17's finding: a mature farm never reaches zero frames
  expanded). Assigned to v0.3's NPC work, not resolved by it; carried to
  v0.4 explicitly rather than dropped.

## 6. Known limitations

- **Windows only** — re-evaluated this version and kept (§3, criterion 5).
- **Unsigned builds** — SmartScreen warns; §4.
- **The version string is `0.1.0`** until signing lands; §4.
- **No quest journal window** — the notice board carries the chains,
  deliberately (ADR-034 §7).
- **Zones still have no map interaction** — the command exists and is
  tested; drawing a rectangle over the farm is still not built. Unchanged
  from v0.2.
- **Ambience is still one bed** (rain). Unchanged from v0.2.

## 7. Release position

**This is v0.3, finished as code, and it should ship the moment it can be
signed.** Every gate that can run has run green today; the game loop now
contains a counterparty, a reason to plan, and a name worth earning; four
schema migrations protect every save that came before. The two things
between this document and a published 0.3.0 are both procurement-shaped:
the certificate (owner's purchase, tripwire-enforced) and the three update
proofs that only a published release can exercise — and the second waits on
the first. The critical path to shipping runs through the signing
certificate and nothing else.
