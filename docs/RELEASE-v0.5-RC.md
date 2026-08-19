# v0.5 Release Candidate — Honest Position

> **Status:** Release candidate. Every gate that can be run on this machine has
> been run — freshly, for this document, on 2026-08-20.
> **Scope:** Phases 31–52. `PLAN.md` §5A is the milestone this document closes.
> **The version number:** the repository still says `0.1.0`, deliberately, for
> the reason v0.4 gave — the bump is the signing tripwire's expiry
> (`tests/signing-exception.test.ts`, ADR-028 §5) and happens the day the
> owner's certificate lands, not before.
> **What this document cannot close:** two of the four success criteria need a
> person. They are reported as open, not as substituted. See §6.

---

## 1. What v0.5 is

v0.4 gave the player reach. **v0.5 is the version where somebody who did not
build it can look at the game and want to play it** — and the work divided
cleanly in two, because the first half turned out not to be enough.

| Added                  | What it means to a player                                                     |
| ---------------------- | ----------------------------------------------------------------------------- |
| A new drawing language | Every asset in the game redrawn: terrain, buildings, crops, workers, props    |
| Real building sizes    | A mill is 3×3 and looks it; a seed bin is one tile and looks it               |
| Depth                  | Things stand in front of and behind each other, on one sort key               |
| Audio that wears       | The same sound stops being bit-identical the four-hundredth time              |
| Zone painting          | A command that shipped in v0.3 and no player could ever reach                 |
| "What now?"            | One line that says the most useful next thing, and nothing when there is none |
| The arc, timed         | For the first time in five versions                                           |

**No schema version was added.** The chain is still `v1 → v14`. A version that
changed how every object in the world is drawn, gave seven buildings multi-tile
footprints and added three player-facing features grew the save file by
nothing — because footprints, tile variants, worker rigs, decor, depth, pitch
offsets and "what to do next" are all derived. `save-compatibility-report.md`
§14 lists what was tempting to store and where each thing actually comes from.

### 1.1 The correction that defines the version

Phases 32–39 rebuilt the art. The owner looked at the running game and said it
still did not look like a world, and the diagnosis in that correction is the
most valuable single finding of the version:

> The problem is architectural, not artistic. The game behaves like _a
> simulation grid with sprites placed inside cells_ instead of _a cozy
> pixel-art world that happens to use a grid internally_. Do NOT attempt to
> solve this only by generating prettier sprites.

That was right, and it was not what the first half had assumed. One tile meant
one object, so a mill and a seed bin were the same size, and no quantity of
better sprites fixes a content model. Phases 40–46 (ADR-042) separated the grid
the simulation needs from the world the player sees **without taking anything
away from the grid** — pathfinding, occupancy, collision, farming, logistics,
worker AI and the save format are untouched.

## 2. The eight release gates

`PLAN.md` §8. Every row states what was run, not what was intended.

| Gate               | Status  | Evidence                                                                                                                                                               |
| ------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save compatibility | **Met** | Chain `v1 → v14` unchanged and green; the one risk v0.5 introduced (legacy overlapping buildings) is now a load-path test — §3.3                                       |
| Performance        | **Met** | Re-measured fresh (`PERFORMANCE.md` §18); every budget passes, and phase 46's reported regression **does not reproduce** — §4                                          |
| Coverage           | **Met** | 94.98% lines / 86.58% branches project-wide, every per-area threshold met, whole suite green under instrumentation — §3.2                                              |
| Boundaries         | **Met** | `check:boundaries` clean; `check:cycles` clean — 358 modules, 1,292 dependencies                                                                                       |
| Docs               | **Met** | `ARCHITECTURE.md` §16, `save-compatibility-report.md` §14, `PERFORMANCE.md` §18, `TESTING.md` §1.2 and §4.1a, `GAME_DESIGN.md` §1.1, `CHANGELOG.md`                    |
| ADRs               | **Met** | ADR-040–044 recorded; **ADR-042 §4 amended in writing** when its description disagreed with the code — §5                                                              |
| Data loss          | **Met** | Zero known defects. The footprint change's one corruption path was closed by decision before implementation and is tested                                              |
| Dead code          | **Met** | No `.only`, no skipped unit tests, no TODO/FIXME in `src/`; the four E2E skips are environment-gated with stated reasons. **Two superseded generators removed** — §3.5 |

`npm audit` (production tree): **0 vulnerabilities**. Asset regeneration is
**byte-identical** to what is committed — 237 sprites, 5 atlases, 52
animations — after **two** separate defects that had made that impossible were
fixed (§3.4, §3.5). It is byte-identical because a test now runs every art
generator and fails on a single moved byte, which is how the second defect was
found: by making the claim before checking it, and then checking it.

## 3. What was measured

### The gates, run fresh

| Check               | Result                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| Typecheck (×3)      | Clean                                                                           |
| Lint                | Clean, `--max-warnings 0`                                                       |
| Format              | Clean — after fixing 9 files and the reason they had drifted (§3.4)             |
| Unit suite          | **3,309 passed, 0 failed**, 260 files                                           |
| Coverage            | **Green** — see §3.2                                                            |
| Runtime startup     | **Production** build launched and stayed up 12 s (`smoke-launch.mjs`)           |
| E2E suite           | **84 passed, 4 skipped, 0 failed**, 10.1 minutes — every skip environment-gated |
| Migration chain     | `v1 → v14` against every golden fixture, zero repairs                           |
| Asset regeneration  | Byte-identical to committed                                                     |
| Boundaries / cycles | Clean                                                                           |
| `npm audit` (prod)  | 0 vulnerabilities                                                               |

**No flakes.** Phase 46 recorded one known flake (`criterion 8`, which passes
alone); this run had none, on a full sequential suite.

### 3.1 The E2E skips

The same four environment-gated criteria v0.2, v0.3 and v0.4 declared: three
that need a real GPU adapter, and the renderer-side heap soak that needs
`performance.memory`. Each states its reason at the skip. Neither the count nor
the reasons changed in v0.5.

### 3.2 Coverage, and the gate that went red for the wrong reason

**94.98% lines, 86.58% branches, 93.15% statements, 92.81% functions**, with
all nine per-area thresholds met and the whole suite green under
instrumentation.

Getting there took a decision worth recording, because the obvious answer was
wrong. The coverage run came up **red with five failures** — and every one was
a **timeout**, not an assertion. The same tests pass uninstrumented. V8
coverage costs about **3.3×** on the tests that dominate the wall clock:
`chain-longrun`'s eight-hour production run goes 687 s → 1,980 s.

The obvious fix was to exclude the long-runs from the coverage run, exactly as
`memory-longrun` is already excluded, on the same argument: they add no
coverage the ordinary suite does not already have.

**That argument was tested rather than believed, and it is false.** With them
excluded, `src/persistence/**` branches fall to **88.47%** against a 90%
threshold — `catch-up-factories` drives `catch-up.ts` across gaps nothing else
reaches. Excluding them would have traded a visible timeout for an invisible
hole, which is the worse of the two by a distance.

So they stay, and `tests/long-run-budget.ts` gives a long test one budget for
the ordinary run and a multiplied one under coverage. **A timeout detects a
hang; it is not a performance budget** — that is measured separately, in
`PERFORMANCE.md`.

Two of those tests were also sitting at 76–78% of their timeout
_uninstrumented_, which is a coin toss on a slower machine rather than
headroom. They now have real margin, each with the measurement that justified
it written beside it.

### 3.3 The one way v0.5 could have destroyed a farm

Footprints changed what counts as a legal placement, and **every world saved by
v0.1–v0.4 contains buildings placed under the old rule** — a mill one tile from
a shed was perfectly legal when both covered one tile.

ADR-042 §4 decided the answer before the code existed: **loading never fails
and never moves a building.** Occupancy is rebuilt across footprints on load,
overlapping legacy buildings both mark the tiles they cover, and only NEW
placements are validated. Rejecting or relocating a legacy building would have
let a rendering change eat somebody's mill.

`tests/legacy-overlap-load.test.ts` now proves it on the load path rather than
the placement path: a document holding a mill and a shed inside each other
loads, keeps both, moves neither, and blocks every tile both cover — plus the
map-edge case, where a footprint that would fall outside the world blocks the
origin tile rather than clamping to a rectangle smaller than its own art.

### 3.4 Two defects found by running the gates themselves

**Asset regeneration could not have been byte-identical, and had not been for
the whole art track.** `generate-character-art.mjs` emits `.anim.json`
sidecars; `lint-staged` ran Prettier over every `*.json` on commit, which
collapses short arrays onto one line — a shape `JSON.stringify(value, null, 2)`
never produces. So every commit rewrote six files and every regeneration
rewrote them back. ADR-006 §2's whole guarantee is that re-running the art
scripts produces identical bytes so any art change is an intentional diff; a
formatter rewriting generated output defeats it outright. `.prettierignore` now
keeps the formatter out of generated files, and
`tests/generated-assets.test.ts` fails if anything else gets in.

**The format gate had a hole `.mjs` files fell through.** `lint-staged` covered
`*.{ts,tsx}` and `*.{json,md,css,yml}` — not script files — while
`format:check` covers everything. Four art generators had drifted, and nothing
would have caught it until an RC. The glob now includes `js,mjs,cjs`.

Neither is a player-visible bug. Both are the kind of thing that only surfaces
when a gate is actually run instead of cited.

### 3.5 The claim in §2 was wrong when it was written

The gate table above said asset regeneration was byte-identical. **It was not**,
and the way that surfaced is the most useful thing in this document.

Having fixed the Prettier problem in §3.4, the claim was written down and then
verified rather than assumed — every art generator run, `git status` checked.
Twenty-one files came back modified. The cause was not the fix; it was two
scripts nobody had thought about since v0.1:

- `generate-placeholder-worker-art.mjs` (phase-04c)
- `generate-placeholder-item-building-art.mjs` (phase-05d)

Both produced the crude stand-ins whose entire stated purpose was to be
replaced "with no code change" — which happened, in phases 33–36. **But both
still wrote the same filenames as the production generators.** Running the
first reverted the worker rig to 16×16 grey blobs and dropped an animation;
running the second reverted the storage shed and four item icons. They had been
loaded weapons sitting in `scripts/` for four versions, and `docs/ASSETS.md`
§7.3 still described the worker art as placeholders three phases after it
stopped being.

Both are deleted. `tests/art-regeneration.test.ts` now runs every art generator
and fails if one committed byte moves — ADR-006 §2's guarantee as a test rather
than an intention — snapshotting and restoring so a failure reports the drift
instead of leaving the tree holding it. It was checked against a deliberately
corrupted asset to confirm it fails when it should.

**A superseded generator is not harmless because nobody runs it on purpose.**

## 4. Performance — and a correction to phase 46

Phase 46 measured the world track and reported a real regression: tick average
up 65%, unattended CPU roughly doubled. **Re-measured fresh for this document,
on an idle machine, it does not reproduce.**

| Measure                    | Before the world track | Phase 46 | **RC**       |
| -------------------------- | ---------------------- | -------- | ------------ |
| Tick average (criterion 5) | 0.063 ms               | 0.104 ms | **0.060 ms** |
| Tick p99                   | 0.2 ms                 | 0.3 ms   | **0.2 ms**   |
| Unattended CPU, mean       | 0.595%                 | 1.058%   | **0.533%**   |
| Unattended CPU, max        | 0.835%                 | 2.013%   | **0.818%**   |
| Heap, unattended farm      | 12.8 MB                | 13.6 MB  | **14.5 MB**  |

v0.4's own full-load scenario says the same: six workers, 36 crops, 13
buildings, a routed chain, a forager, an expedition out — **0.187 ms average at
v0.4, 0.145 ms now**, with 547 visible sprites.

Phase 46's record noted its first reading (0.133 ms) was taken while the
machine was building, re-measured once, and reported a regression anyway. **The
load was not a partial cause; it was the cause.** The footprint hypothesis — a
3×3 mill blocking nine tiles where it blocked one — was explicitly stated as
unproven and is now withdrawn, in the same place it was made.

**One increase is real:** heap 12.8 → 14.5 MB on the unattended farm,
consistent across readings, most plausibly the art set growing from 166 to 237
sprites. Against `memory-longrun`'s 25 MB ceiling that is comfortable, and the
576,000-tick heap soak still passes.

**ADR-003 §2's trigger for moving the simulation off the main thread (p99 > 3
ms) is unmet by roughly an order of magnitude**, which is why phase 29 was and
remains CONDITIONAL.

## 5. Decisions recorded, and one amended

| ADR     | What it decided                                                                |
| ------- | ------------------------------------------------------------------------------ |
| ADR-040 | Three classes of evidence, and that human-playtest evidence is never PASS here |
| ADR-041 | The cozy pass: a drawing vocabulary, and R-04 amended to selective outlining   |
| ADR-042 | The world is not the grid: footprints, one sorted layer, one anchor            |
| ADR-043 | Audio that earns eight hours: derived pitch variation, by category             |
| ADR-044 | The arc is measured, not tuned                                                 |

**ADR-042 §4 was amended at phase 52 because it described a mechanism the code
does not use.** It said overlapping legacy buildings resolve by "the first
placed keeps it and the later one simply occupies less"; `deserialize.ts`
marks every tile of every rectangle blocked, because the grid records _whether_
a tile is blocked and not _who_ blocked it. The player-visible guarantee is
identical and the mechanism is simpler — but the ADR was wrong and the code was
right, and this project amends ADRs in writing rather than diverging from them
quietly.

Also corrected in v0.5, each in the place the error lived: `workers-slice.ts`'s
claim that a zoned worker reports a `null` role (it never did, and a test built
on that sentence cost an hour); `GAME_DESIGN.md` §1.1's "3 hr+" for stage 4;
`TESTING.md` §1.2's suite counts, which had said "~300 tests" since v0.1 while
the suite grew to ten times that; and `vitest.coverage.config.ts`'s claim that
the long-runs' timeouts allowed for instrumentation.

## 6. The four success criteria

`PLAN.md` §5A.2 promoted v0.1's four criteria to v0.5's release gates. They are
reported in the evidence class each belongs to, and **two of them cannot be
closed by this session at all.**

| Criterion                                            | Class              | Status                                                              |
| ---------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| Runs an 8-hour workday without being noticed         | Machine-verifiable | **PASS** — 0.533% CPU mean, 14.5 MB heap, no dirty frames when idle |
| Reaching stage 4 takes under ~4 hours                | AI-observable      | **PASS**, with a caveat that matters — below                        |
| The first worker hire produces a visible "oh, I see" | **Human-playtest** | **OPEN** — needs a person                                           |
| A tester returns unprompted on a second day          | **Human-playtest** | **OPEN** — needs a person                                           |

**On criterion 2.** A perfect player reaches stage 4 in about **twelve
minutes**, which clears a four-hour ceiling by a distance — and that is not the
same as the criterion being satisfied for a human, because the model never
mis-clicks and harvests on the exact tick of maturity. It is a bound, the
document's own "3 hr+" was never measured at all, and how long a real player
takes is unknown. ADR-044 explains why the balance was not changed on that
evidence, and the arc test now guards both ends.

**On criteria 3 and 4.** ADR-040 fixed this rule at the start of the version
precisely so it could not be fudged at the end: evidence that requires a
person's reaction may never be marked PASS from a session with no person in it.
No substitute was reported in their place.

**Perceptual acceptance of the visual work is in the same class.** The whole
point of phases 32–46 is what somebody unfamiliar with the code says when they
look at it. Everything measurable was measured; the judgement is the owner's.

## 7. Known blockers and deferred work

**Blocked, unchanged from v0.4** — none of these stopped any v0.5 phase:

- **Code signing** — BLOCKED on the owner's certificate purchase. Holds the
  `0.4.0` version bump and publication, nothing else.
- **Three update-behaviour tests** — BLOCKED behind a published release.
- **Three GPU render criteria** — BLOCKED on hardware with a real adapter.

**Deferred, with the reason recorded:**

- **Rocks, bushes and ore veins are still at the old scale.** The world track
  gave real size to buildings and trees; the smaller nature props were not
  reached. They look correct beside each other and small beside a 3×3 mill.
- **Seeding zone painting from a worker's existing zone.** The controller
  already accepts a seed; putting the zone on the sim→view boundary means
  comparing a tile SET per worker per tick to decide whether to republish —
  the exact cost ADR-005 §2 exists to prevent. Additive the day that boundary
  carries one cheaply.
- **Audio timbre.** The eleven sounds are still placeholders and are honestly
  described as such. ADR-043 verified the replacement path instead, which is
  the thing that makes the placeholders acceptable.
- **A second ambient bed** (night crickets) would need ADR-023 §5 reopened —
  it permits _ambience_, singular. Not worth amending a recorded decision to
  add a sound nobody asked for.
- **Offline hauling** — a chain's buffers are credited across a gap, the chain
  itself is not. Under-credits deliberately (`GAME_DESIGN.md` §9.2).
- **Phase 29** stays CONDITIONAL on ADR-003 §2's trigger, still unmet.

**Open question, recorded so it is not rediscovered:** how long does a real
first-time player take to reach stage 4? `GAME_DESIGN.md` §1.1 carries it.

## 8. What this release candidate claims

That v0.5's scope is complete, that every gate runnable on this machine was run
fresh for this document and is green, that the two criteria needing a human are
open rather than substituted, and that one previously-reported regression has
been withdrawn on better evidence with the method error stated.

One of this document's own claims was false when first written, was caught by
verifying it after writing it, and is recorded in §3.5 with what it cost rather
than quietly corrected. A gate table is a set of claims; the only thing that
makes it worth reading is that each one was checked.

It does not claim the game looks good. That is not a claim this session is
able to make.
