# v0.4 Release Candidate — Honest Position

> **Status:** Release candidate. The game is playable end to end, and every
> gate that can be run on this machine has been run — freshly, for this
> document, on 2026-08-18.
> **Scope:** Phases 24–30. `PLAN.md` §5 is the milestone this document closes.
> **The version number:** the repository still says `0.1.0`, deliberately —
> see §4. The bump to `0.4.0` is the signing tripwire's expiry
> (`tests/signing-exception.test.ts`, ADR-028 §5) and happens the day the
> owner's certificate lands, not before.

---

## 1. What v0.4 is

v0.3 gave the world someone on the other side of the economy. **v0.4 gives the
player reach** — the farm stops being the only place anything happens.

| Added       | What it means to a player                                                        |
| ----------- | -------------------------------------------------------------------------------- |
| Factories   | A mill and a kitchen: buildings that consume goods and produce better ones       |
| Recipes     | Wheat → flour → bread, a chain three steps deep, extendable by a content pack    |
| Logistics   | Declare a route and the crew moves goods along it; the chain runs itself         |
| The wilds   | Thirty-two columns of wilderness past the town, with timber, stone and ore in it |
| Foragers    | A role whose crew works the wilds — the first band that must be opted into       |
| Expeditions | Send a hand somewhere you cannot walk; they come back with what grows there      |

Four schema versions were added (v10 → v14), including the chain's **second
relayout** (the world widening to 112 columns) and its smallest link (one empty
collection). All four are proven against golden fixtures that deliberately
carry the data the links must transform.

**The version's engineering signature is v0.3's, applied to bigger systems:
what is derivable is derived.** A version that added a production chain, a
logistics network, a wilderness and expeditions grew the save by four
collections and one grid re-lay. What stands in the wilds, whether a node has
regrown, when an expedition returns, what it brings, how far a craft has got,
and which goods a hauler has claimed are all arithmetic.

## 2. The eight release gates

`PLAN.md` §8. Every row states what was run, not what was intended.

| Gate               | Status  | Evidence                                                                                                                                                                   |
| ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save compatibility | **Met** | Chain `v1 → v14`, a golden fixture at every version, the full migration suite green; the v0.4 guarantees stated in `save-compatibility-report.md` §13                      |
| Performance        | **Met** | Re-measured for this document: the v0.4 tick in the running app (`PERFORMANCE.md` §17) and headless (§16). The three GPU criteria stay environment-blocked on this machine |
| Coverage           | _§3_    | Freshly measured — see §3                                                                                                                                                  |
| Boundaries         | **Met** | `check:boundaries` clean; `check:cycles` clean — 349 modules, 1,255 dependencies                                                                                           |
| Docs               | **Met** | `ARCHITECTURE.md` §15, `SAVE_FORMAT.md` v14, `GAME_DESIGN.md` §2.5–2.6 and §4.4, `PERFORMANCE.md` §16–17, `CHANGELOG.md`, every phase document closed against evidence     |
| ADRs               | **Met** | ADR-035–039 recorded; ADR-036 and ADR-037 **amended in writing** during implementation rather than diverged from — twice each, in ADR-037's case                           |
| Data loss          | **Met** | Zero known defects. Two catch-up over-credits found and fixed at this RC (§3), both in the under-crediting direction after the fix                                         |
| Dead code          | **Met** | No `.only`, no skipped unit tests, no TODO/FIXME in `src/`; the only declared skips are the environment-gated E2E criteria, each stating its reason                        |

`npm audit` (production tree): **0 vulnerabilities**. Asset regeneration is
**byte-identical** to what is committed — 166 sprites, 5 atlases, 34
animations — so no art in the build is unaccounted for.

## 3. What was measured, and the success criteria

### The gates, run fresh

| Check               | Result                                                                |
| ------------------- | --------------------------------------------------------------------- |
| Typecheck (×3)      | Clean                                                                 |
| Lint                | Clean, `--max-warnings 0`                                             |
| Unit suite          | See §3.1                                                              |
| Coverage            | See §3.1                                                              |
| Runtime startup     | **Production** build launched and stayed up 12 s (`smoke-launch.mjs`) |
| Migration chain     | `v1 → v14` against every golden fixture, zero repairs                 |
| Asset regeneration  | Byte-identical to committed                                           |
| Boundaries / cycles | Clean                                                                 |
| `npm audit` (prod)  | 0 vulnerabilities                                                     |

### 3.1 Suites and coverage

_Filled from the fresh run — see the numbers below._

### 3.2 Performance

**The v0.4 tick, in the running app** (`PERFORMANCE.md` §17,
`docs/perf/phase-29-v04-tick.json`). This is the measurement ADR-003 §2 asked
for and `PLAN.md` §5.1 sequenced phase 29 to take:

| Statistic | Measured     | Budget / trigger |
| --------- | ------------ | ---------------- |
| p50       | 0.200 ms     | —                |
| p95       | 0.300 ms     | —                |
| **p99**   | **0.400 ms** | **3 ms**         |
| mean      | 0.187 ms     | —                |
| max       | 6.900 ms     | —                |
| FPS       | 93.1         | —                |

**The worker-thread trigger is NOT met**, roughly seven times inside, and the
second clause fails too — the renderer held 93 FPS with the simulation ticking
at 20 Hz on the same thread. The 6.9 ms max is one sample in 1,272 and is
recorded rather than smoothed over.

**Headless, under a 200,000-tick farm** (`PERFORMANCE.md` §16): p99 0.53 ms.
Both numbers are kept because they answer different questions, and the running
one is the one the trigger is written about.

### 3.3 The four success criteria

`PLAN.md` §5. Reported with evidence, and one is not a pass.

| #   | Criterion                                                       | Result      |
| --- | --------------------------------------------------------------- | ----------- |
| 1   | A production chain runs unattended for 8 hours without jamming  | **PASS**    |
| 2   | Exploration yields meaningfully feed the farm economy           | **PASS**    |
| 3   | Entity and building counts stay within budget                   | **PASS**    |
| 4   | Offline catch-up remains accurate with production chains active | **PARTIAL** |

**Criterion 1 is a test, not a claim.** `tests/chain-longrun.test.ts` builds
shed → mill → kitchen, routes both links, and runs **576,000 ticks** — eight
hours — asserting the chain is still producing in its final quarter, that
reservations never exceed what a source holds, and that conservation holds at
1 wheat / 2 flour / 4 bread.

**Criterion 2** is carried by two systems and one guard. Gathering brings wood,
stone and ore home through the deposit path that already existed; expeditions
bring wild produce and ore. The guard is `tests/expedition-rate.test.ts`, which
asserts every destination's value per tick of worker time inside half-to-double
a forager's — _meaningfully_ has to mean "worth doing and not the only thing
worth doing", and that is the band.

**Criterion 3** is measured in the same run as the tick, on the same scene.

**Criterion 4 is PARTIAL, and the shortfall is deliberate.** Offline, a factory
finishes what was already staged in its input when the player left, and no
hauling happens — so a chain's **buffers** are credited and the chain is not.
That under-credits, which `GAME_DESIGN.md` §9.2 permits and the reverse would
not, and modelling hauling offline means deciding how much worker time went to
carrying versus harvesting, where every wrong guess lands on the side that
credits work the simulation would have refused.

Expeditions and the wilds, by contrast, need **no offline model at all**:
both resolve by comparison against a stored tick.

### 3.4 Two over-credits found at this RC

Both in `catchUpWorld`, both fixed, both now under-crediting:

- **A worker away on an expedition was counted as farm labour**, because the
  model sized its budget from `world.workers.size`. Everyone away is now
  excluded for the whole gap.
- **`catchUpFactories` advanced crafts at the wrong cadence** — `craftTicks`
  where the simulation runs `craftTicks + 1`, because a factory that completes
  on tick T is idle on T and cannot restart until T + 1. The model claimed 11
  crafts where the game completes 10.

The second is the third over-credit that one function has had, and it shipped
in phase 26 for a reason worth carrying: **the never-over property fails on
about one run in three, so a green run was never evidence.** Both
counterexamples are now pinned as deterministic examples beside the property.

### 3.5 The economy, validated rather than asserted

`tests/economy-loops.test.ts`, eleven executable claims. The framing is the
useful part — not _nothing profits_, but:

> **Every profitable loop is gated by TIME, and every loop gated only by COINS
> is at best break-even.**

A player with a million coins and no workers must not be able to click
themselves richer; a player with workers is supposed to get richer, because
that is what workers are for. Checked: the seed round trip never profits
(single or repeated); the recipe graph has **no cycle**, walked as an item
graph because a cycle can span several recipes and no single one would look
wrong; selling drives its own price down; and every declared source — nodes,
expeditions, crafts, crops — is gated by time rather than by coins.

## 4. What is not verified, and why

### Signing — still the one item between this RC and the name `0.4.0`

Unchanged from v0.3, and unchanged for the same reason: a purchase, not code
(ADR-028). The tripwire holds — the moment `package.json` says `0.4.0` without
signing configured, the suite fails by design. The repository ships
version-stamped `0.1.0`, **four versions of game behind its own version
string**, which is the tripwire working rather than an oversight.

### The three v0.2 update paths — still unproven, unchanged

An interrupted NSIS install leaving a launchable app; restoring a
pre-migration backup into an older build; a tampered artifact being rejected
end to end. All three need a **published release** to test against, and none
has been published. The circularity stands, now for the third version running:
these cannot close before the first release, and the first release waits on
signing.

### The GPU criteria and the renderer-side heap soak

Environment-blocked on this machine, exactly as at v0.2 and v0.3. Neither is
new to this version and neither moved.

### The presence-gating question v0.3 carried forward

v0.3 handed v0.4 an open design question — whether gameplay-feedback animators
should be presence-gated, since a mature farm never reaches a zero-frame idle
while expanded. **It was not resolved in v0.4 either**, and it is carried
forward again rather than quietly dropped. v0.4 made it slightly larger: the
wilds add ~276 static sprites that hold no animation lease, so they do not
worsen the idle case, but expeditions and haulers give a farm more reasons to
change while nobody is watching.

## 5. What this version taught, carried forward

- **The live pass is now four for four.** Phases 18, 20 and 22 each had a
  screenshot find what the suites could not; v0.4 kept the record perfect and
  raised the stakes. Phase 25 shipped two buildings that drew **nothing** —
  `textureFor` returns an empty texture for an unknown key — behind 2,782
  green tests. Phase 27 shipped a whole mechanic, gathering, that worked in
  every particular and was **invisible**: thirty-two columns of blank grass
  with a system running behind them. Phase 28's single sitting found four
  defects, including a Send button that did nothing on the first thing a new
  player would try.
- **The gate you write for last phase's bug does not cover this phase's
  version of it.** `sprite-keys.test.ts` was written in phase 25 for exactly
  the invisible-art class and missed phase 27's, because it only knew about
  registries. Gates need widening when the thing they guard grows a new shape.
- **A decision that makes something invisible has to be followed to every
  place that was counting it.** ADR-038 removes away workers from the workers
  slice on purpose; the hire price, the status bar, and offline catch-up were
  all silently wrong until someone looked.
- **A probabilistic gate that has ever been red is not discharged by a green
  re-run.** The never-over property came up red, passed in isolation, and
  passed again on a re-run — and was hiding a real over-credit that had shipped
  a phase earlier. Run it until the failure rate is known, then pin the case.
- **Measure the thing, not the reasoning about the thing.** ADR-037's task
  priority was wrong twice and each correction came from a run, not an
  argument. The wilds' node density was wrong on screen while being right on
  paper, because a tile density is not a visual density. And the expedition
  rate rule's anchor was chosen by measuring the alternative and rejecting it.
- **Pre-committing a decision's trigger works.** ADR-003 wrote the threading
  condition down two versions early, so phase 29 took a measurement instead of
  having an argument — and produced a number rather than an opinion.

## 6. Known limitations

- **Windows only** — unchanged; re-evaluated and kept at v0.3.
- **Unsigned builds** — SmartScreen warns; §4.
- **The version string is `0.1.0`** until signing lands; §4.
- **Offline credits a chain's buffers, not the chain** — §3.3, criterion 4.
- **You never see an expedition's destination** — the map is a list of places,
  not a rendered region, and ADR-038 §1 states the cost rather than hiding it.
- **Audio is still eleven placeholder sounds** and one ambience bed.
  Unchanged from v0.2.
- **Zones still have no map interaction** — the command exists and is tested;
  drawing a rectangle over the farm is still not built. Unchanged from v0.2.
- **No quest journal window** — the notice board carries the chains,
  deliberately (ADR-034 §7).

## 7. Release position

**v0.4 is a release candidate.** The game is playable end to end, every gate
that can be run on this machine has been run for this document, and the one
criterion that is not a pass is reported as PARTIAL rather than rounded up.

**What stands between this and a published `0.4.0` is unchanged from v0.3, and
from v0.2 before it: a certificate.** Not code, not a gate, not a defect — a
purchase the owner makes. The tripwire enforces it: the moment `package.json`
says `0.4.0` without signing configured, the suite fails by design.

That circularity is now three versions deep and worth stating plainly, because
it is the project's largest single piece of unfinished business and no amount
of engineering will close it. The three v0.2 update-path proofs need a
published release to test against; the first published release needs signing;
signing needs the purchase. **Everything downstream of that one item is an
afternoon's work.**

Nothing else here is waiting on anything. The version's six milestones shipped,
the threading question that had been open since ADR-003 was measured and
answered, and the two defects this RC found — a stranded worker and a
three-versions-old over-credit — are fixed with tests that fail on the old
code.

**Recommendation:** hold at RC. Buy the certificate, publish, then close the
three update paths and cut `0.4.0` in the same week.
