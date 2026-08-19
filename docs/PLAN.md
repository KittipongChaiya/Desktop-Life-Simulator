# PLAN

> **Status:** Authoritative roadmap.
> **Owns:** Version milestones, version-level success criteria, release gates, and how this plan changes.
> **Does not own:** Product intent (`VISION.md`), v0.2 phase sequencing and per-phase acceptance (`ROADMAP.md`), per-phase specifications (`docs/phases/`).

**No dates.** This is a sequenced plan, not a schedule. Each milestone completes when its success criteria are met.

---

## 0. Current State

**Machine-checked.** `tests/plan-state.test.ts` fails if this block goes stale
or disagrees with the CURRENT version's phase table — §5A.1 today. It exists because a session can end
at any moment and the next one must resume from the repository, not from the
owner's memory (`AI_RULES.md` §10.4).

|                     |                             |
| ------------------- | --------------------------- |
| **Current version** | **v0.5 — The Playable Cut** |
| **Current phase**   | **45 — Region Composition** |
| **Status**          | **IN_PROGRESS**             |

| Phase | Name                         | Status      |
| ----- | ---------------------------- | ----------- |
| 31    | v0.5 Baseline & evidence     | COMPLETE    |
| 32    | Art Direction & The Palette  | COMPLETE    |
| 33    | The Ground                   | COMPLETE    |
| 34    | Buildings                    | COMPLETE    |
| 35    | The Farm                     | COMPLETE    |
| 36    | Characters & Small Life      | COMPLETE    |
| 37    | Density & The Three Regions  | COMPLETE    |
| 38    | The UI Joins The World       | COMPLETE    |
| 39    | Motion & Overlay-Scale       | COMPLETE    |
| 40    | Depth & Anchors              | COMPLETE    |
| 41    | Footprints                   | COMPLETE    |
| 42    | Buildings At Their Real Size | COMPLETE    |
| 43    | Nature At Their Real Size    | COMPLETE    |
| 44    | Terrain Transitions & Paths  | COMPLETE    |
| 45    | Region Composition           | IN_PROGRESS |
| 46    | World Acceptance & Cost      | PENDING     |
| 47    | Audio That Earns Eight Hours | PENDING     |
| 48    | Zone Painting                | PENDING     |
| 49    | What Now                     | PENDING     |
| 50    | First Run                    | PENDING     |
| 51    | Balance & The Idle Cost      | CONDITIONAL |
| 52    | v0.5 Release Candidate       | PENDING     |

**v0.4 shipped as a release candidate** on 2026-08-18 — phases 24–30, all six
milestones, `RELEASE-v0.4-RC.md`. Its gate results live in that document and are
not repeated here: §0 tracks the CURRENT version, and a §0 that accumulated
every version's history would stop being a resume block.

**Phase 31 — COMPLETE.** ADR-040 fixed the three evidence classes before
anything was measured; the plan-state guard now follows the current version; and
the progression arc was timed for the first time in five versions — **stage 4 in
12 minutes** against a design document claiming 3 hours+. Phase 44 is TRIGGERED
by that, on the opposite reason to the one it was written for.

**THE ART TRACK (32–39) was added mid-version** at the owner's direction: a
cozy-pixel-art revision of the whole visual identity. ADR-041 governs it. The
playability track (40–44) is unchanged and still authoritative — the version
now has two halves serving one goal, which is a game somebody wants to leave
open.

**Phase 32 — COMPLETE.** The foundation every later art phase draws on:

- The **asset audit**. 170 source assets across 5 families. The finding is that
  the LOOK IS A CONSEQUENCE OF THE DRAWING VOCABULARY — `pixel-art.mjs` offered
  `rect`, `ellipse` and `outlineSilhouette`, so every asset is a box or a blob
  in a uniform keyline, and five buildings share one silhouette.
- **ADR-041**. Amends exactly one locked rule (R-04 — outlining becomes
  SELECTIVE), authorises the palette expansion R-08 requires, mandates the new
  vocabulary, and makes density a checkable Tier 1/2/3 hierarchy.
- **The palette**, +14 colours by R-08's reviewed process: a warm stone ramp,
  two more woods, a roof family so the mill and kitchen stop wearing straw,
  creams, and two flower accents.
- **`scripts/lib/pixel-craft.mjs`** — the drawing vocabulary. Ordered dither,
  organic blobs, polygons and lines, five material patterns, selective outline,
  ramp faces. All R-02 safe and deterministic.
- **`tests/palette-lock.test.ts`** — R-08 and R-09 as a test rather than a
  promise. Nothing had ever enforced them, and the first thing it caught was in
  this phase's own work: two proposed flower colours sat inside the reserved
  signal set, and were withdrawn.
- **Three prototypes rendered and reviewed against the old assets**, which cost
  three iterations and produced the ground rules now in `ART_DIRECTION.md`
  §9.2 — chiefly that an ordered dither CANNOT texture a 32 px ground tile.

**Phase 33 — The Ground: IN_PROGRESS.** All six terrain tiles rebuilt on the
new vocabulary, plus the two instruments the rest of the art track needs:

- **`scripts/generate-scene-sheet.mjs`** — composes a real SCENE from shipped
  art at 1× and 2×, and under all four season tints with `--seasons`. The
  contact sheet judges one asset at 4×; it cannot answer the two questions this
  pass is graded on (does Tier 1 survive Tier 3, and does any of it work at
  overlay size), because both are about assets TOGETHER.
- **Ground variants.** `grass_b`, `grass_c`, `wild_b`, chosen per tile by
  `src/renderer/render/tile-variants.ts` — DERIVED from the tile index, never
  stored, the same argument ADR-009 §1 makes for tilled soil. Keys come from
  the generated manifest (ADR-006 §4), so a variant that is named but not
  shipped is a compile error rather than a blank tile.

**What the first reviewed scene changed**, none of which was visible on a
contact sheet:

- The tilled field averaged into ONE FLAT BROWN SLAB at 1×. The furrows were
  scattered pixels; they are full-width corduroy now.
- Wild ground read as orange confetti — straw is nearly a signal against dark
  green, and there was a highlight on every dry tuft. Cut by half.
- **Tier separation PASSES**: crops and workers stand clear of the ground
  texture at 1×, which is the density gate ADR-041 §4 sets.
- **Seasons were nearly indistinguishable.** Measured, then pushed to the edge
  of what a multiply tint can do; the structural limit is recorded in
  `ART_DIRECTION.md` §9.3 along with what it would cost to lift it.

**Phase 33 — COMPLETE**, weather included — with a CORRECTION recorded in
phase-39: rain was never invisible. `rain-view.ts` has drawn falling drops
since phase-12d. What is true is that they are ambient motion, so they are off
by default and surrender when the pointer idles — meaning an overlay left open
beside real work shows a clear day whatever the weather. Weather now also
declares a ground tint (`src/renderer/render/tint.ts`), which is the half that
survives that. A tint and
not particles because it costs nothing that survives idle — falling rain is
motion, and motion is phase 39. `ART_DIRECTION.md` §9.3 records what a multiply
CANNOT do: autumn reaches olive but not brown, and winter cannot have snow.

**Phase 34 — Buildings: IN_PROGRESS.** ADR-041's audit said five buildings were
the same building ±10 px, and the contact sheet confirmed it: cottage, storage
shed, rest hut and kitchen were all a brown box under a straw trapezoid, the
mill was a grey tower whose entire mill-ness was a 5 px gear, and the kitchen's
was an orange circle. Six are rebuilt, each on a silhouette argument rather than
a decoration:

- **cottage** — the only half-timbered building: steep terracotta gable, cream
  plaster, chimney with smoke, lit windows, window boxes. It should be the
  warmest thing on screen.
- **storage shed** — the flattest roof in the set and the only building with no
  windows, because it is a place things go rather than a place anyone is.
- **rest hut** — the smallest and the only DOMED roof, in moss, with a bench.
- **seed bin** — deliberately not a building at all: a slatted box with its lid
  propped open at an angle and grain spilling out.
- **mill** — the TALLEST silhouette and the only one with a wheel. A waterwheel
  reads as a mill at any size to anyone; a gear does not.
- **kitchen** — a lopsided mass built round a masonry oven stack with a lit
  mouth and smoke. The one place the game shows fire.

`Roof Slate Deep #46545E` was added by R-08's process: terracotta shipped with
two steps and slate with one, so every slate roof borrowed a timber brown for
its shadow and read muddy. A material with one value cannot be lit.

**Found and fixed while here:** the mill and kitchen had NO row in
`GENERATION.md` — phase-25 shipped them without recording provenance at all.

**Phase 34 — COMPLETE.** The market stall, well and notice board already carry
their own silhouettes and are KEPT — ADR-041 does not license replacing what
fits.

**Phase 35 — The Farm: COMPLETE, and smaller than expected because most of it
was already right.** The audit's honest finding is that the crops are the best
art in the game: four plants that are identifiable at a glance, four stages
that differ meaningfully, and a mature stage that adds the produce in its own
colour. Even stage 0 — which looks identical at a glance — already names its
crop by a seed accent and, for pumpkin, a different mound count, with a comment
saying exactly why. That is the "preserve what fits" rule doing its job, and
rewriting it would have been churn dressed as progress.

What was genuinely missing was **field dressing**. Tilled soil was one tile
repeated, so a field was a grid. It has variants now — a stone turned up by
the plough, a weed nobody has pulled — with ONE caveat recorded in
`tile-variants.ts`: the variants vary the DEBRIS and never the furrows. A field
of furrows is a made thing, and irregular geometry there reads as a mistake
rather than as nature; debris sits on the pattern instead of disturbing it.
Kept dull on purpose, because a bright weed competes with the crop beside it
and the crop is Tier 1.

DEFERRED from 35 to 37, with the reason: the brief asks the farm to show
PROGRESSION — humble early, busy later, clearly lived in at the end. That is
decor placement keyed to how much land the player owns, and decor planning is
phase 37's subject. Today owned tiles carry no decor at all, which is why the
farm reads bare however good the tiles are.

**Phase 36 — Characters: COMPLETE.** Every worker on a farm drew the same
sprites, which is the brief §9 complaint stated literally. There are three
worker rigs now — same hat, same apron, different person underneath — chosen
by `workerRig(id)`, derived from the worker id and never stored, the same
argument the ground variants make.

NOT ROLES, and this is a deliberate reading of the brief rather than a
shortcut. It asks for workers distinguishable BY ROLE; the simulation has no
role to read. `WorkerSchedule.taskKinds` is optional and most workers have
none, so a role-keyed costume would leave the majority identical AND would
change a worker's appearance when the player edited a schedule. Giving the
simulation a real role concept to dress is a gameplay change, which the visual
brief §22 forbids outright. So: people, not job titles.

Villager B stopped wearing the grey-violet STONE ramp — that ramp is for cold
rock and the brief names sterile grey directly. Warming it to cream was the
first attempt and the contact sheet killed it immediately: the two villagers
became one villager with different hair. Blue, which nobody else wears.

**A silent bug, caught by looking:** the two new rigs' sprites generated
correctly and were completely unreachable. `.anim.json` sidecars were authored
BY HAND beside generated art, so the new rigs had none, `ANIMATIONS[key]`
returned undefined, and the renderer drew nothing without erroring.
`writeCharacter` emits the sidecar with the frames now, so art and the manifest
that indexes it cannot drift again.

**Faces are NOT changed, and that is a decision.** The brief asks for
expressive faces. `CHARACTER_BIBLE` §4 says dark-dot eyes and no facial detail,
and at a ~10 px head drawn at 1× on a small overlay it is right — R-16 forbids
detail that dies at gameplay zoom. Expression has to come from silhouette,
costume and motion instead, and motion is phase 39.

**Phase 37 — Density & The Three Regions: COMPLETE.** The phase name was
accurate about what was missing: decor knew about ONE boundary — it stopped at
the wilds — so of three fixed regions only one had an identity.

- **The farm had nothing on it.** Rule 3 kept every prop off owned land, which
  is right for trees and rocks (rule 4 makes them workable) and wrong as a
  blanket ban: the plot was bare grass around the very buildings the player
  chose to place. It draws from its own set now — crates, bales, sacks, tools,
  flowers — never on tilled ground, never under a building, and never anything
  that could be mistaken for a resource.
- **Density rises with the plot**, which is how the brief's PROGRESSION gets
  said with no new state at all: the grid already knows how big the farm is. A
  first-day farm is dressed below the countryside's density and a full one
  above it.
- **The town existed only as a coordinate.** It has benches, lamps, signposts
  and a cat now, at a LOWER density than the countryside — its props are
  taller and the band is already busy with buildings and residents, so density
  that reads as cosy in a meadow reads as clutter in a street.
- **The tree came down**, 64×96 to 48×72. It stood three times the height of a
  cottage, so a Tier 3 prop dominated the Tier 2 structure beside it and the
  village read as a clearing in a forest.
- **The bush and the flower were rebuilt.** They are the two most-placed props
  in the world and both were below the new bar — the flower was a single tall
  daisy that read as a mast with a dish on it, and the bush was two flat
  ellipses. The bush's first rebuild merged into a pad, because adjacent greens
  in the ramp cannot separate over a few pixels; it skips a rung now.
- **One ambient creature, sitting.** Decor is planned once and never moves, so
  a butterfly placed this way would be frozen mid-flight — worse than none. A
  cat sitting still is something that genuinely does that. Curled was the first
  attempt and read as a loaf of bread: at 20 px a cat IS its two pointed ears.

**Two guards were strengthened rather than satisfied.** `decor.test.ts` checked
prop sprites against a hand-kept allowlist two entries long, which went stale
the moment a set was added — it reads the generated manifest now, which is
what its name always claimed. And decor is re-planned when the BUILDINGS slice
changes, not only on land purchase; without that a crate could sit under a new
shed until the next expansion, which might be never.

**Phase 38 — The UI Joins The World: COMPLETE, and it found the same defect one
layer up.** `COLOR_PALETTE.md` §6 has specified a UI palette since phase-05.5c.
**Not one stylesheet used a single value from it.** The HUD was a cool grey
dashboard — `#e8e8ec` on `rgba(20, 22, 28, 0.9)` — while the document described
warm parchment, and nothing checked, for four versions. That is exactly the
brief's §13 complaint ("pixel-art world + generic modern web dashboard") and
exactly ADR-041's finding about the world art: written down, never reached.

`src/renderer/app/tokens.css` is the HUD's palette now, and the only place its
colours are defined. Fourteen stylesheets draw from it.

**The plates stayed DARK, which is a departure from §6's parchment rather than
an oversight.** A bright slab over a dark desktop is a lamp in the corner of
somebody's screen, and `VISION.md` §2.1 makes not intruding the one hard
constraint. What changed is the HUE: blue-black plates became deep timber
brown, near-white text became cream, and the focus ring became `Water Light` —
a colour the world already contains. §6.1 records this, so the document
describes what ships.

**The accessibility gate was measuring a list it admitted could drift.**
`hud-contrast.test.ts` carried its own hex codes, copied by hand out of the
stylesheets, and said so in its own header. It reads `tokens.css` now. It also
measures BOTH extremes — white is the worst case for a dark plate, black is
the worst case for a light one, and it only ever checked white, so a future
light theme would have passed while being illegible on a dark desktop.

A new guard fails on any cool or neutral hex anywhere in the HUD, which is the
drift this phase exists to end.

**Kept, not replaced:** the HUD already draws its coins, items and tools from
the pixel `ui-world` icon set. That half of §13 was right all along.

**Phase 39 — Motion & Overlay-Scale: COMPLETE.** The phase that was supposed to
add ambient motion mostly found things instead, because it is the first one
that ran the game.

**THE LIVE LOOK IS A TEST NOW** — `tests/e2e/visual-review.spec.ts`. Every other
check in this version is machine-verifiable, and the contact sheet and scene
sheet are both COMPOSITES: art arranged by a script that shares none of the
renderer's code. They cannot show a z-order mistake, a tint on the wrong layer,
or a sprite the atlas failed to pack. This drives the packaged app and
photographs it, asserting only what a picture cannot — that the canvas is
painted, and that the overlay is the size the art was judged at.

**What the first photograph showed, in one glance:** the world was DARK
DESATURATED GREEN. `UNOWNED_TINT` was `0x6b7280` — a cool blue-grey at 42%
brightness — multiplied over every tile outside the plot, and since the plot is
a small part of the view that meant almost the whole screen. A grey wash over
the world is exactly the sterile grey the brief forbids, and **no contact sheet
could ever have caught it, because a contact sheet has no owned plot in it.**
Warmed and lifted to `0xc6b49e`: unowned land still reads as not-yours, and
pays far less for saying so.

**A bald strip nobody had looked for.** `MAX_DECOR` is 220 and the world wants
about 300 props — and placement filled from tile 0 and `break`ed, so the last
NINE ROWS of the map had no decoration at all. Every prop set added made the
strip taller, so phase 37 had quietly made it worse. The ceiling is a uniform
thinning now: same cap, whole map, and a small world is untouched by it.

**Ambient motion needed nothing.** Sway already covers the things that bend
(`SWAYS` — flower, bush, tree), and the props phase 37 added are crates, bales,
lamps and benches, which do not. The cat sits still by design. Adding motion
for its own sake would have spent the idle budget on nothing.

**THE IDLE BUDGET DID NOT REGRESS — measured, not assumed** (ADR-041 §5). The
whole art pass, over the full e2e run:

| Measure                   | Before   | After    |
| ------------------------- | -------- | -------- |
| Unattended farm CPU, mean | 0.633%   | 0.595%   |
| Unattended farm CPU, max  | 1.066%   | 0.835%   |
| Heap                      | 15.4 MB  | 12.8 MB  |
| Tick average              | 0.184 ms | 0.175 ms |

Better on every axis, which is not a claim that the art made it faster — the
tree shrinking from 64×96 to 48×72 plausibly helped fill rate, and the rest is
within noise. What it establishes is the thing that mattered: nothing here
bought density with the budget `VISION.md` §2.1 protects.

**E2E: 80 passed, 4 skipped.** One flake seen once and not reproduced —
`criterion 8: ambient motion returns to a zero-frame idle`, which passed alone
and passed on a full re-run. That spec's own comments record it failing this
way before, on the 44th sequential Electron launch, and the cause it names
(the GPU process torn down under a long run) is unrelated to anything here.

**THE WORLD-RENDERING TRACK (40–46) was added mid-version** at the owner's
direction, after looking at the running game. The diagnosis is sharper than the
one the art track acted on: the game reads as _a simulation grid with sprites
placed inside cells_ rather than _a cozy world that happens to use a grid_.
ADR-042 governs it. ADR-041's work is RETAINED in full — palette, outlines,
pipeline, decor determinism, UI tokens, the live-look gate — because none of it
was wrong; it raised the craft of sprites that were all one tile big.

**The measurement that shaped the whole plan.** The overlay is 1920×220 and the
status bar takes ~48 px, so the world viewport is about **172 px — 5.4 tiles at
zoom 1**. Raising camera zoom to 2 leaves 2.7 tiles of height, so a three-tile
building could not fit on screen at all. **Scale therefore comes from FOOTPRINT,
not from zoom**: a 3×3 house at zoom 1 is 96 px, 56% of the viewport against
19% for the sprite it replaces. Zoom stays 1 and stays the player's control.

**Phase 40 — Depth & Anchors: COMPLETE.** `objects` and `entities` were two
y-sorted layers, and a container draws entirely above the one before it — so
EVERY entity drew above EVERY object and a worker could never pass behind a
tree. One `world` layer now, one sort key in world pixels (`depth.ts`), one
anchor rule: everything stands on its base. Buildings were top-left anchored,
crops centred, and decor bottom-centre only when it swayed. Buildings and crops
also sorted in TILE ROWS while workers sorted in PIXELS, which was survivable
only while they could never meet.

**Phase 41 — Footprints: COMPLETE.** `BuildingDefinition` gained an optional
footprint, DERIVED from the registry and never stored, so **no save format
change**: a save records which building sits on which tile and occupancy is
recomputed on load, exactly as the sprite is. Placement, sale, load and town
founding all work in rectangles now. Legacy overlap is handled rather than
hoped about (ADR-042 §4): loading never fails and never moves a building.

**What footprints found, and it is the interesting part.** Twenty-three tests
failed — every one a fixture that placed buildings two or three tiles apart on
one row, which was correct when a building was a single tile. The one worth
naming: `economy-longrun` reported **"earned 0 coins in eight hours"** rather
than "placement refused", because a silently-rejected building surfaces as an
economic result. The save round-trip caught a genuine one: a fixture that built
its world by hand blocked only the origin tile, so the live world was
under-blocked and hydration correctly disagreed with it.

**Phase 42 — Buildings At Their Real Size: COMPLETE.** Mill (3×3, 96×120 px),
storage shed, kitchen, market stall, rest hut, cottage and castle redrawn at
footprint scale. Canvases are taller than their footprints on purpose — roofs
and chimneys overhang tiles nobody owns (ADR-042 §10). Verified through the
real player path: Shop → arm → click.

**The acceptance instrument, and what it taught.** `visual-review.spec.ts` now
BUILDS a farm and photographs it, because the empty starting farm cannot answer
the question this track exists for. Two things had to be understood first:
click offsets are bounded by the plot (±128 px) AND by the world viewport's
~172 px height, so ±140 silently refused every building; and **a still world
cannot be photographed by Playwright** — `page.screenshot()` waits for a frame,
this renderer stops producing them once the world settles (ADR-001 §1), so the
call times out proving the idle budget works. `BrowserWindow.capturePage()`
returns the last composited image and takes 5 seconds instead of 30.

**Phase 43 — Nature: COMPLETE for trees.** The tree grew back to 64×96 with
canopy, branches, roots and gaps you can see sky through. Phase-37 shrank it to
48×72 because it dwarfed 32 px buildings, which was right then and wrong now:
the constraint that justified it is gone, and a tree shorter than a shed reads
as a shrub. Rocks, bushes and ore veins are still at their old scale — they are
Tier 3 and read acceptably beside the new buildings, so they are DEFERRED
rather than done.

**Phase 44 — Terrain: COMPLETE.** Two changes, both aimed at the ground, which
is what the first built-farm photograph showed was still grid-like once the
buildings were right.

- **The plot boundary was a straight line of brightness**, which is the most
  grid-like thing a renderer can do because nothing in a field has an edge like
  that. Unowned land that TOUCHES the plot now takes a fringe tint halfway to
  the full one, so the boundary is a two-step ramp. One tile wide, not three:
  the viewport is five tiles tall.
- **Five grass faces instead of three**, adding worn earth and long grass. The
  weighting keeps the plain tile winning half the squares, because a field where
  every square is interesting is a field with no ground in it.

The worn patch took two attempts and re-learned a rule this repository has
already written down twice: a dithered blob produced the Bayer cross-hatch
`ART_DIRECTION.md` §9.2 forbids. It is clustered marks now, densest at the
centre — which is also what thinning turf looks like.

**Still open in the world track:** path autotiling (§15) and region composition
(§16) — landmarks, clusters and open space that make farm, town and wilds read
as different places. Phase 46 measures cost and takes the acceptance picture.

**Known blockers** (none stop the remaining phases — `AI_RULES.md` §10.7):

- **Code signing** — BLOCKED on the owner's certificate purchase. Holds the
  `0.4.0` version bump and publication, nothing else.
- **Three update-behaviour tests** — BLOCKED behind a published release.
- **Three GPU render criteria** — BLOCKED on hardware with a real adapter.

**Deferred, with reasons recorded:**

- **Offline hauling** — a chain's buffers are credited across a gap, the chain
  itself is not. Under-credits deliberately (`GAME_DESIGN.md` §9.2); makes §5
  criterion 4 PARTIAL rather than PASS. See `catch-up.ts`.
- **Phase 29** is CONDITIONAL on ADR-003 §2's trigger (p99 tick > 3 ms).
  Last measured **0.048 ms** at phase 27, headless, with a forager crew
  (`PERFORMANCE.md` §15) — not yet measured in the running app under the full
  v0.4 load, which is phase 29's own first job.

---

## 1. Version Roadmap

| Version  | Theme                    | Ships                                                 |
| -------- | ------------------------ | ----------------------------------------------------- |
| **v0.1** | Farm & Overlay           | The core loop, running in a livable overlay           |
| **v0.2** | A Living World           | Seasons, weather, day/night, audio, the plugin loader |
| **v0.3** | Town & Trade             | NPCs, settlement, contracts, a market that moves      |
| **v0.4** | Automation & Exploration | Factories, logistics, a map beyond the farm           |
| **v0.5** | The Playable Cut         | The systems become a game someone can live with       |
| **v1.0** | Full Life Simulator      | RPG, dungeons, bosses, city defense, mod ecosystem    |

**v0.5 was inserted after v0.4 shipped**, and the reason is in §5A. The shipped
versions keep the names they were released under — those names appear in
`RELEASE-v0.2-RC.md`, `RELEASE-v0.3-RC.md`, `RELEASE-v0.4-RC.md` and every
phase document, and renaming a version after its release report is written
makes the record disagree with itself.

Ordering rationale — why each tier is a prerequisite rather than an arbitrary sequence — is in `VISION.md` §4.1.

---

## 2. v0.1 — Farm & Overlay

**Goal:** prove the product thesis. A game you can leave running all day beside real work, which plays itself once you have built it up.

### 2.1 Phases

| #    | Phase                          | Delivers                                                                                                                                                                                                                                                                     | Independently runnable?                |
| ---- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| 00   | Foundation                     | Toolchain, three tsconfigs, boundary linter, asset pipeline, tick loop, CI                                                                                                                                                                                                   | Empty window, headless sim ticks       |
| 01   | Overlay                        | Docked transparent window, click-through, tray, collapse/expand, snapshot bridge                                                                                                                                                                                             | A livable overlay with a status bar    |
| 01.5 | Developer Infrastructure       | Debug overlay, console, profiler, inspector, logger, feature flags                                                                                                                                                                                                           | Tooling usable in a running app        |
| 01.7 | Entry Boundary                 | Renderer entry constrained; alias-resolution hole closed                                                                                                                                                                                                                     | No behavior change                     |
| 02.5 | Engine Foundations             | Event bus, scheduler, ID allocator, time scaling                                                                                                                                                                                                                             | No gameplay                            |
| 02   | Tile World                     | PixiJS, 7 layers, terrain chunks, camera, render-on-demand                                                                                                                                                                                                                   | A visible, pannable farm plot          |
| 03   | Farming                        | Crops, growth, till/plant/water/harvest, content registries                                                                                                                                                                                                                  | The manual loop is playable            |
| 03.5 | Command Model                  | Command dispatcher, queue, tick-boundary execution, source interfaces                                                                                                                                                                                                        | No behavior change                     |
| 03.6 | Player Interaction             | Tool selection, hover, tile selection, click → command, dispatch feedback                                                                                                                                                                                                    | **The manual loop is playable**        |
| 04   | Worker AI                      | Worker entities, FSM, pathing, task priority, energy                                                                                                                                                                                                                         | **Stage 2 — delegation**               |
| 05   | Resources & Containers         | Container model (ADR-011): items, stacks, capacity, storage buildings                                                                                                                                                                                                        | Unattended runs become possible        |
| 05.5 | AI Asset Production Foundation | Creative canon: art direction, style lock, palette, world/character/lore bibles, prompt library, audio + design docs                                                                                                                                                         | Docs only — no runtime change          |
| 05.6 | Vertical Slice (Golden Set)    | First production asset set validating the 05.5 canon: world/crop/UI/character art, audio specs, validation report                                                                                                                                                            | Assets only — no code change           |
| 06   | Economy                        | Coins, dynamic pricing, shop, land expansion, buildings                                                                                                                                                                                                                      | **Stage 4 — full idle loop**           |
| 01.8 | Desktop Companion              | Opacity dial, quick hide, click-through mode, work mode, z-order control (always-on-top since the 2026-07-23 livability verdict); rebindable-shortcut & categorized app-settings architecture — platform only (ADR-014)                                                      | The overlay coexists with real work    |
| 07   | Save/Load                      | Schema & save identity, atomic writes, migration chain, autosave, offline progress — under the ADR-015 versioning & compatibility contract                                                                                                                                   | The game persists                      |
| 07.5 | Vertical Slice (v0.1 RC)       | Polish only, no new systems: audio (ADR-016), feedback effects, camera focus, accessibility, ground decoration, and the release-candidate report                                                                                                                             | **v0.1 feels like one game**           |
| 07.6 | Visible farming (fix)          | Not a phase — a fix completing phase-03's presentation. Tilled soil, the crops slice and renderer, twelve crop sprites, and visual-regression references. Recorded in `docs/fixes/phase-03-visible-farming.md`                                                               | The farming loop is visible            |
| 07.7 | Game Feel Polish               | Presentation only, no new mechanics (ADR-017): pooled particles and floating numbers, crop and worker animation, camera shake, HUD feel, ambient life behind presence, six accessibility settings, and the measured performance budgets                                      | **The farm responds to being touched** |
| 07.8 | Developer Tools                | Diagnostic tooling only, no gameplay (ADR-018): world and entity inspectors, event and command monitors, pathfinding and chunk visualisation, performance panel, time controls, spawn tools that dispatch commands, recording and screenshot mode — all `FEATURE_DEBUG`-only | The game is diagnosable                |

Phase order is dictated by dependency, not preference. Two orderings are worth stating explicitly:

- **Overlay before world (01 → 02).** If the overlay is not livable, nothing else matters. It carries the highest product risk and is deliberately faced first, alone.
- **Save/load last (07).** Persistence must serialize a _complete_ world. Building it earlier means migrating the schema after every subsequent phase — seven migrations before v0.1 ships, each one an opportunity to lose data. The save **contract** itself — identity header, version separation, the compatibility matrix, migration governance — was decided ahead of implementation (ADR-015), so phase-07 implements a settled contract rather than designing one mid-flight.
- **Resource model before inventory (ADR-011).** Phases 05 (inventory) and 06 (economy), and every resource system after them, share one model fixed before phase-05: resources are conserved quantities owned by containers, moved only by explicit transfer. Deciding it up front prevents each system inventing incompatible resource rules — the same forethought as the command model (03.5) preceding its four consumers.
- **Desktop companion after the loop, before persistence (06 → 01.8 → 07).** Numbered with the overlay family because it extends phase-01's platform shell; built after phase-06 so the companion behaviors wrap a complete, earning game, and before phase-07 so the preference/save boundary (app settings in `settings.json`, never in the save — ADR-014 §4) is fixed in code before the save schema exists, and the return summary can be designed knowing work mode hides the HUD.

### 2.2 Success criteria

v0.1 ships when **all** are true:

**Product**

- [ ] Runs an 8-hour workday without being noticed in Task Manager
- [ ] Reaching stage 4 (`GAME_DESIGN.md` §1.1) takes under ~4 hours of play
- [ ] The first worker hire produces a visible "oh, I see" moment in playtesting
- [ ] A tester returns unprompted on a second day

**Technical**

- [ ] All `PERFORMANCE.md` ceilings measured and met on baseline hardware
- [x] All `TESTING.md` coverage gates met — **phase-08.0**, 95.26% lines / 85.95% branches against a raised 90 / 85
- [x] Determinism test passes at 100k ticks
- [x] Save round-trip and crash-safety tests pass
- [x] Zero known data-loss defects

> **Phase-08.0 closed the coverage gate**, the last of the eight §8 release gates to go green. The cause was not neglect: six of the seven published per-area thresholds had never been enforced by the config, and 1,378 lines of Pixi and Electron binding sat in the denominator contributing 34 covered lines. `TESTING.md` §4.2 now states the criterion for what is measured, and a test fails if the document and the config ever disagree again.
>
> **One correctness defect is open and is not a data-loss defect**: catch-up over-credits by one harvest on a specific farm (`phase-07.7` debt #13, `PLAN.md` §8 criterion 14). The player gains rather than loses and nothing on disk is damaged, so the §8 data-loss gate stands — but the criterion itself does not hold, and it is the recommended next work.

**Documentation**

- [ ] A new AI session can implement a v0.2 feature using only `docs/` and the code, without asking a question these documents already answer

The last criterion is what this documentation set exists to satisfy (`VISION.md` §6.4).

### 2.3 v0.1 is explicitly not

Combat · RPG · dungeons · bosses · city defense · factory · town · NPCs · trading · exploration · multiplayer · audio · weather · seasons · day/night · achievements · plugin _loading_ · auto-update · telemetry · non-Windows platforms

---

## 3. v0.2 — A Living World

**Goal:** the world changes on its own, and other people can add to it.

v0.2 is also where this project stops being an application and becomes **an engine with a game on top of it**. Seasons and weather are how that gets proven; the plugin architecture is the work. Ten architectural goals govern the version and are stated in `ROADMAP.md` §1.

### 3.1 Phases

Sequencing, dependencies, deliverables, risks, acceptance criteria, testing strategy, and commit boundaries: **`ROADMAP.md`**.

| #    | Phase                                | Schema | Delivers                                           | Decided by       |
| ---- | ------------------------------------ | ------ | -------------------------------------------------- | ---------------- |
| 08.0 | Coverage Reconciliation              | —      | The v0.1 release gate turns green                  | §8, `TESTING.md` |
| 08   | Content Identity & Plugin Foundation | —      | The public API, and `plugins/core/`                | ADR-026, ADR-019 |
| 09   | Plugin Loader & Capability Registry  | v2     | Third-party content actually loads                 | ADR-019, ADR-027 |
| 10   | Time Simulation                      | v3     | The day cycle, and lighting layer 5                | ADR-020          |
| 11   | Seasonal Simulation                  | v4     | The calendar means something                       | ADR-021          |
| 12   | Weather Simulation                   | v5     | Rain, derived and exact                            | ADR-022          |
| 13   | Audio Architecture                   | —      | Buses, a mixer, and the first ambient bed          | ADR-023          |
| 14   | Worker Scheduling                    | v6     | The player directs the farm                        | ADR-024          |
| 15   | Distribution & Auto-Update           | —      | The game can safely update itself                  | ADR-025          |
| 16   | v0.2 Vertical Slice (RC)             | —      | It feels like one game, and the gates are measured | —                |

Three orderings are dictated by dependency rather than preference, and `ROADMAP.md` §2.1 states them: the plugin foundation precedes every content system (08 before 10, 11, 12, 14); time precedes seasons precedes weather; and weather precedes audio, because rain is the first ambient bed with a real trigger.

**Worker scheduling, not worker priorities.** The milestone was _"player-configurable task priority"_; a reorderable list answers one of the six scheduling concepts on the roadmap and makes the other five special cases. ADR-024 replaces it with a three-stage pipeline in which zones, roles, permissions, shifts, and emergency overrides each arrive as data.

**Success criteria**

- [ ] A third party writes a plugin adding a crop, using only `PLUGIN_GUIDE.md`
- [ ] A v0.1 save loads in v0.2 with no data loss, through the full five-link chain
- [ ] Uninstalling a plugin preserves its save data (`SAVE_FORMAT.md` §8) and touches no other namespace (ADR-026 §3)
- [x] Performance budgets hold with weather, lighting, and audio active — measured **together** in phase-17 (criterion 12): p99 tick 0.5 ms vs 3 ms with rain, lighting, audio, and all motion simultaneously live on the reference farm (`PERFORMANCE.md` §14)
- [ ] Auto-update never loses a save under interrupted-update testing

**Note:** auto-update ships here and not in v0.1 deliberately — an updater that can restart the app is a way to lose player data, so it follows proven save integrity. v0.2 sharpens that: it also lands five schema versions, and ADR-025 §2 shows that **rollback across a schema bump orphans a save** unless the updater is bounded by schema version. Phase 15 therefore follows every shape-changing phase.

---

## 4. v0.3 — Town & Trade

**Goal:** the player gains neighbours, and the economy gains a counterparty.

| Milestone      | Delivers                                 | Depends on                                    |
| -------------- | ---------------------------------------- | --------------------------------------------- |
| NPCs           | NPC entities with schedules and needs    | v0.2 time of day; v0.1 worker FSM generalized |
| Settlement     | A town area, buildings, residents        | v0.1 building model                           |
| Contracts      | Timed delivery requests with rewards     | v0.1 economy                                  |
| Dynamic market | Demand curves replacing flat multipliers | v0.1 price multipliers                        |
| Reputation     | Standing with the town, gating access    | New                                           |
| Quests         | Simple objective chains                  | New                                           |

**Success criteria** (closed by phase-23; evidence in `RELEASE-v0.3-RC.md` §3)

- [x] NPCs follow believable daily schedules — **phase-19**: dawn-staggered wakes, day itineraries over the town's places, indoors by night; derived, so offline-exact (ADR-031)
- [x] Contracts create a reason to plant specific crops — **phases 20–22**: the premium band is the only above-base coin; the board leans toward wanted crops; standing and quests pay for deliveries alone
- [x] The economy feels responsive without becoming unpredictable — **phase-21**: demand moves prices inside a declared mean-1 band, one owner per axis; "feels" is evidenced by bounded rules and on-screen legibility, not playtesting, and the RC says so
- [x] Entity counts stay within `PERFORMANCE.md` — profiled at **every** addition (phases 17, 18, 19, 21) and re-taken combined at the RC; §14
- [x] Cross-platform is re-evaluated here — **re-evaluated and kept Windows-only** for v0.3; the evaluation is recorded in `RELEASE-v0.3-RC.md` §3, and v0.4 may revisit

---

## 5. v0.4 — Automation & Exploration

**Goal:** the player gains reach.

| Milestone   | Delivers                                 | Depends on                                |
| ----------- | ---------------------------------------- | ----------------------------------------- |
| Factories   | Buildings that consume and produce items | v0.1 inventory + buildings                |
| Logistics   | Item routing between buildings           | v0.1 worker movement                      |
| Recipes     | Multi-input crafting chains              | v0.1 item registry                        |
| World map   | Regions beyond the farm                  | v0.1 grid (already 64× the starting plot) |
| Expeditions | Send workers away for timed returns      | v0.1 worker tasks + offline catch-up      |
| Resources   | Mining, foraging, gathering              | v0.1 tile kinds                           |

### 5.1 Phases

| #   | Phase                    | Schema | Delivers                                            | Decided by |
| --- | ------------------------ | ------ | --------------------------------------------------- | ---------- |
| 24  | v0.4 Baseline            | —      | Every gate re-measured fresh; the production model  | ADR-035    |
| 25  | Recipes & Factories      | v11    | Buildings that consume and produce; a 3-step chain  | ADR-035    |
| 26  | Logistics & Reservation  | v12    | The chain runs itself; the 8-hour unattended proof  | ADR-036    |
| 27  | The Wilds & Resources    | v13    | Walkable land past the town; mining, foraging       | ADR-037    |
| 28  | World Map & Expeditions  | v14    | Regions as destinations; workers sent away and back | ADR-038    |
| 29  | Simulation Threading     | —      | The renderer's world reference severed; the thread  | ADR-039    |
| 30  | v0.4 Vertical Slice (RC) | —      | It feels like one game, and the gates are measured  | —          |

Three orderings are dictated by dependency rather than preference:

- **The production model before any factory (24 → 25).** The jam rules are the
  part that cannot be retrofitted — a chain that stalls forever is invisible
  to every test that does not already know to look for it — so ADR-035 states
  them before a factory exists.
- **Factories before logistics (25 → 26).** Logistics is designed once, on
  purpose, against endpoints that already exist. Phase 25 deliberately ships a
  factory that cannot feed itself, so that "how items get there" is not
  invented as a mill's private convenience (ADR-035 §9).
- **Threading last, and conditional (29).** ADR-003 §2 pre-committed the
  migration trigger — p99 tick > 3 ms — and v0.3 measured 0.2–0.5 ms. Phase 29
  is sequenced where the version's load finally exists to test that trigger
  against. Its first half (severing the renderer's direct `world` reference,
  which is where the migration's real cost sits — not `src/sim`, which is
  already pure) is worth doing whether or not the trigger fires; its second
  half runs only if it does, or if a successor ADR replaces the trigger. **The
  RC records the measured number either way.**

**Success criteria** — closed at phase 30, with evidence in
`RELEASE-v0.4-RC.md` §3.3.

- [x] A production chain runs unattended for 8 hours without jamming —
      `tests/chain-longrun.test.ts`, 576,000 ticks, three claims asserted
- [x] Exploration yields meaningfully feed the farm economy — gathering and
      expeditions both reach storage through the existing deposit path, and
      `tests/expedition-rate.test.ts` holds every destination inside
      half-to-double a forager's rate
- [x] Entity and building counts stay within budget — **515 visible sprites**
      under full v0.4 load (`PERFORMANCE.md` §17). The worker-thread migration
      did **not** land here: ADR-003 §2's trigger was measured and **not met**
      (p99 0.4–0.5 ms against 3 ms), and ADR-039 records the decision
- [ ] Offline catch-up remains accurate with production chains active —
      **PARTIAL**. A chain's buffers are credited; the chain is not, because
      nothing models hauling offline. It under-credits deliberately, which
      `GAME_DESIGN.md` §9.2 permits and the reverse would not

---

## 5A. v0.5 — The Playable Cut

**Numbered 5A rather than renumbering §6 onward**, so that every existing
reference to §6, §7 and §8 — the release gates most of all — keeps pointing at
what it always pointed at.

**Goal:** the game stops being system-complete and starts being _playable_.

v0.1 through v0.4 built a farm, a world, a town, and automation. Not one of
them closed **v0.1's four product criteria** (§2.2), which have been carried
unmet through four versions. The technical gates have been green since phase
08; the product gates have never been measured at all, and none of them can be
closed by a test.

That is what this version is for. **No new simulation system ships in v0.5.**

| Milestone         | Delivers                                                        | Depends on               |
| ----------------- | --------------------------------------------------------------- | ------------------------ |
| Audio worth hours | Real synthesis, per-play variation, beds that now have triggers | v0.2 audio wiring        |
| Zone painting     | Drawing a worker's zone on the map                              | v0.2 `setWorkerZone`     |
| "What now?"       | One surface answering what is in flight and what is next        | v0.3 contracts, v0.4 map |
| First run         | The opening minutes teach themselves                            | "What now?"              |
| Balance           | The stage arc measured, and tuned only if the number says so    | v0.4's five income paths |
| The idle cost     | The presence-gating question, resolved with measurement         | v0.3's open question     |

### 5A.1 Phases

Three tracks, one goal. The **art track** (32–39) and the **world-rendering
track** (40–46) were both added mid-version at the owner's direction; the
**playability track** (47–51) is the version's original scope and is unchanged
except in numbering.

The two visual tracks are not competing systems, and ADR-042 opens by saying so:
ADR-041 raised the CRAFT of individual sprites and was right to. What it could
not fix is that every object in the world was one tile, because that is a
rendering and content-model fact rather than an art one.

| #   | Phase                        | Track       | Delivers                                             | Decided by |
| --- | ---------------------------- | ----------- | ---------------------------------------------------- | ---------- |
| 31  | v0.5 Baseline & evidence     | —           | Evidence classes; the arc timed for the first time   | ADR-040    |
| 32  | Art Direction & The Palette  | Art         | The palette, the drawing vocabulary, the rules       | ADR-041    |
| 33  | The Ground                   | Art         | Grass, soil, wild ground, paths; season and weather  | ADR-041    |
| 34  | Buildings                    | Art         | Every structure its own silhouette                   | ADR-041    |
| 35  | The Farm                     | Art         | Crops with growth personality; field dressing        | ADR-041    |
| 36  | Characters & Small Life      | Art         | Workers readable by role; ambient creatures          | ADR-041    |
| 37  | Density & The Three Regions  | Art         | Props and decor; farm / town / wilds identity        | ADR-041    |
| 38  | The UI Joins The World       | Art         | Panels and icons that belong to the same place       | ADR-041    |
| 39  | Motion & Overlay-Scale       | Art         | Ambient motion; the consistency and cost pass        | ADR-041    |
| 40  | Depth & Anchors              | World       | One y-sorted layer, one sort key, one anchor rule    | ADR-042    |
| 41  | Footprints                   | World       | Buildings that stand on more than one tile           | ADR-042    |
| 42  | Buildings At Their Real Size | World       | The art that fills those footprints                  | ADR-042    |
| 43  | Nature At Their Real Size    | World       | Trees with volume; nature that overlaps              | ADR-042    |
| 44  | Terrain Transitions & Paths  | World       | Ground that connects instead of tiling               | ADR-042    |
| 45  | Region Composition           | World       | Landmarks and clusters; farm / town / wilds read     | ADR-042    |
| 46  | World Acceptance & Cost      | World       | The real game, looked at; the idle budget, measured  | ADR-042    |
| 47  | Audio That Earns Eight Hours | Playability | Layered synthesis, derived variation, triggered beds | ADR-043    |
| 48  | Zone Painting                | Playability | The map interaction the command has waited for       | ADR-044    |
| 49  | What Now                     | Playability | The objectives surface; ADR-034 §7 amended           | ADR-045    |
| 50  | First Run                    | Playability | Onboarding that teaches by playing                   | ADR-045    |
| 51  | Balance & The Idle Cost      | Playability | **TRIGGERED** by phase 31's arc measurement          | ADR-046    |
| 52  | v0.5 Release Candidate       | —           | Every gate, and the four product criteria            | —          |

Three orderings are dictated rather than preferred:

- **The palette and the library before any asset (32 → 33–38).** ADR-041's
  finding is that the vocabulary is the ceiling; authoring assets against the
  old one would produce the old look more expensively.
- **The ground before everything standing on it (33 → 34–37).** Grass is the
  most-repeated pixel in the game, and every other asset is judged against it.
- **"What now?" before first run (42 → 43).** Onboarding teaches a player to
  read the game; it cannot teach them to read a surface that does not exist.

### 5A.2 The three classes of evidence

The product criteria are not tests, and pretending otherwise is the one way
this version can lie. ADR-040 defines three classes, and every criterion is
reported in exactly one:

| Class                  | Means                                                  | May I mark PASS? |
| ---------------------- | ------------------------------------------------------ | ---------------- |
| **Machine-verifiable** | A test or measurement asserts it, repeatably           | Yes              |
| **AI-observable**      | I drove the app and observed it; the judgement is mine | Yes, labelled    |
| **Human-playtest**     | Requires a person's reaction                           | **Never**        |

**Success criteria** — v0.1's four, promoted to v0.5's release gates:

- [ ] Runs an 8-hour workday without being noticed in Task Manager —
      _machine-verifiable_
- [ ] Reaching stage 4 (`GAME_DESIGN.md` §1.1) takes under ~4 hours of play —
      _AI-observable_, with a machine-verifiable bound
- [ ] The first worker hire produces a visible "oh, I see" moment —
      **human-playtest**
- [ ] A tester returns unprompted on a second day — **human-playtest**

The last two **cannot be closed by this session**, and the v0.5 report will say
so rather than reporting a substitute and calling it the criterion.

### 5A.3 Out of scope, bindingly

No RPG progression, combat, dungeons, bosses, or city defense. No new
simulation systems. No factories beyond v0.4's model, and no world-map
expansion. Those are v1.0's (§6), and this section does not move them.

---

## 6. v1.0 — Full Life Simulator

**Goal:** the player gains a life.

| Milestone       | Delivers                                            | Depends on         |
| --------------- | --------------------------------------------------- | ------------------ |
| RPG progression | Character levels, skills, equipment                 | v0.4 resources     |
| Combat          | `health` side-table over entity stores (ADR-004 §4) | v0.1 entity model  |
| Dungeons        | Generated encounters with rewards                   | v0.4 expeditions   |
| Bosses          | Set-piece encounters                                | Combat             |
| City defense    | Waves threatening the settlement                    | v0.3 town + combat |
| Mod ecosystem   | Registry, discovery, versioning                     | v0.2 loader        |

**Success criteria**

- [ ] Combat integrates without violating `VISION.md` §5.1 — **no mechanic requires reaction speed**
- [ ] A v0.1 save still loads, through every intervening migration
- [ ] The overlay constraint still holds under the heaviest content
- [ ] A meaningful third-party mod ecosystem exists

### 6.1 The v1.0 risk, named now

Combat is the most likely place this project betrays its own thesis. `VISION.md` §5.1 permanently forbids twitch mechanics, so v1.0 combat must be **resolution-based or tactical-pause**, never real-time action.

If v1.0 combat cannot be made satisfying without reaction speed, the correct outcome is **shipping without real-time combat** — not relaxing the non-goal. The non-goal is the product.

---

## 7. Post-v1.0 (Unscheduled)

Named to show they were considered, and deliberately left unplanned:

Multiplayer · cross-platform (macOS/Linux) · Steam release · cloud saves · mobile companion

**Multiplayer** deserves a note: the determinism work in v0.1 (ADR-007) makes it _possible_, not _planned_. It would require netcode, an authoritative server, anti-cheat, and infrastructure — a larger project than everything above it combined. Determinism was paid for because it is cheap now and impossible to retrofit, not because multiplayer is committed.

---

## 8. Release Gates

Binding at every version boundary. No exceptions, and none of these may be waived to hit a date — there are no dates (§Preamble).

| Gate               | Requirement                                                                                                                                                     |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save compatibility | Every prior version's golden fixture loads (`SAVE_FORMAT.md` §4.4, ADR-015 §4); the version's guarantees stated and evidenced in `save-compatibility-report.md` |
| Performance        | All ceilings measured on baseline hardware (`PERFORMANCE.md` §10)                                                                                               |
| Coverage           | All thresholds met (`TESTING.md` §4)                                                                                                                            |
| Boundaries         | `check:boundaries` and `check:cycles` clean                                                                                                                     |
| Docs               | `ARCHITECTURE.md`, `SAVE_FORMAT.md`, `CHANGELOG.md` current                                                                                                     |
| ADRs               | Every architectural change recorded                                                                                                                             |
| Data loss          | **Zero known defects. Blocking, always.**                                                                                                                       |
| Dead code          | None; no placeholders; no skipped tests                                                                                                                         |

---

## 9. How This Plan Changes

1. **Phases may be resequenced within a version** when a dependency proves wrong — record why in the phase document.
2. **Scope moves later, never earlier.** Pulling a v0.3 feature into v0.1 is the failure mode `VISION.md` §4.2 exists to prevent.
3. **A new version tier requires amending `VISION.md` §4 first.** This document implements that roadmap; it does not define it.
4. **Success criteria are not negotiable downward.** If a criterion cannot be met, that is information about the design, not about the criterion.
