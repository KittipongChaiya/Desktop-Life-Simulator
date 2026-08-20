# v0.5 — The Phase Record

> **Status:** Historical. Closed 2026-08-20 as a release candidate.
> **Owns:** What each v0.5 phase found and decided, in the words written as it closed.
> **Does not own:** The gate results and the four product criteria (`RELEASE-v0.5-RC.md`); the phase table and success criteria (`PLAN.md` §5A).

**Why this file exists.** v0.5 ran 23 phases (31–53) and wrote no per-phase
documents — unlike v0.1–v0.4, which have one each in this directory. Its record
accumulated in `PLAN.md` §0 instead, which is the resume block: a section that
must describe the CURRENT version and nothing else, or it stops being a resume
block and becomes an archive nobody reads to the end.

When v0.6 opened, §0 had to be rewritten for the new version. **This file is
what was in it**, moved rather than deleted. The text below is unedited except
for the removal of the resume-block scaffolding — the pointer table, the phase
status table, and the machine-checked note — all of which describe a version
that is no longer current.

The blockers and deferred items listed at the end were carried forward into
`PLAN.md` §0 for v0.6 and are reproduced here as they stood at v0.5's close.

---

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

**Phase 45 — Region Composition: COMPLETE.** Three changes, and two of them
came from looking at the town for the first time.

- **The path plaza had four ruler-straight edges**, which is the most grid-like
  thing a renderer can draw once the buildings are right. Four transparent
  FRINGE overlays now let turf encroach over the path wherever its neighbour is
  not one, and they COMPOSE — a corner draws two. Four sprites instead of the
  sixteen full autotiling would need, baked into the chunk texture, so the whole
  effect costs nothing per frame.
- **The town was eleven rows tall in a five-row window.** The castle sat at
  y=25 and the southern cottages at y=37, so a player could never see two
  cottages at once and the town read as an empty plaza with something
  off-screen. It is laid WIDE now — the window is wide and short, so the town
  is too — with the plaza, well, board and all four cottages inside rows 31–35,
  and the castle the one thing above them. The first attempt compressed it
  vertically and put the castle INSIDE the plaza, which the town's own
  walkability tests caught.
- **The castle is a landmark** (§16): 4×3 tiles, two towers with conical roofs,
  a crenellated curtain wall, a portcullis over a lit passage. It was a 32 px
  grey box that read as a shed with a hat.

Resident homes, town stops and the plaza geometry all moved with the layout.
Three town pathfinding tests failed on the way — each encoding the old
coordinates — and one of them was worth having: it asserts a route cannot end
on a building tile, and the well had moved out from under it.

**Still open in the world track:** rocks, bushes and ore veins are Tier 3 and
still at their old scale (DEFERRED, not done). Phase 46 measures the idle cost
and takes the acceptance picture.

**Phase 46 — World Acceptance & Cost: MEASURED, and the number moved.**

| Measure                   | Before the world track | After    | Budget |
| ------------------------- | ---------------------- | -------- | ------ |
| Simulation tick, average  | 0.063 ms               | 0.104 ms | —      |
| Simulation tick, p99      | 0.2 ms                 | 0.3 ms   | 3 ms   |
| Unattended farm CPU, mean | 0.595%                 | 1.058%   | —      |
| Unattended farm CPU, max  | 0.835%                 | 2.013%   | —      |
| Heap                      | 12.8 MB                | 13.6 MB  | —      |

**Every budget still passes, with roughly 10× headroom on the tick.** But the
tick average is up about 65% and the idle CPU has roughly doubled, and calling
that "within budget" without saying so would be the false completion §44 warns
about.

The first reading was worse (0.133 ms) and was taken while the machine was
building; re-measured idle it is 0.104. So part of the gap is load and part is
real. The most likely cause of the real part is that **footprints make
obstacles bigger**: a 3×3 mill blocks nine tiles where it blocked one, so every
route around it explores more of the grid. That is an inherent consequence of
the change rather than a defect, and it is stated as the likely cause rather
than a proven one — it has not been bisected.

> **CORRECTED AT PHASE 52 — the regression above does not reproduce.** Measured
> fresh for the RC on an idle machine, the criterion-5 tick average is
> **0.060 ms** (not 0.104, against a 0.063 baseline) and unattended CPU mean is
> **0.533%** (not 1.058%, against 0.595%). The v0.4 full-load scenario is
> **faster** than it was at v0.4: 0.145 ms average against 0.187 ms.
>
> The paragraph above is left standing rather than rewritten, because what it
> got wrong is worth keeping visible: it identified machine load as a partial
> cause, re-measured once, and still reported a regression from a reading taken
> minutes after a build. Load was not a partial cause, it was the cause. The
> footprint hypothesis is **withdrawn** — nothing measured supports it.
>
> One real increase survives: heap 12.8 → 14.5 MB, consistent across readings,
> most plausibly the art set growing from 166 sprites to 237.
> `PERFORMANCE.md` §18 carries all of it.

**E2E: 81 passed, 4 skipped, 1 known flake** (`criterion 8`, which passes alone
and whose own comments record it failing this way on the 44th sequential
Electron launch). Six specs failed on the first full run: five were load
failures that pass in isolation, and one was real — `v04-tick` placed six
buildings in a single row one tile apart, which footprints no longer allow.

**`worker.spec` was hanging for a reason worth keeping.** Its diagnostic
`page.screenshot()` waits for a frame, and this renderer stops producing frames
once the world settles — so a passing game produced a thirty-second timeout.
`shoot()` in `framing.ts` captures through Electron instead.

**THE PERCEPTUAL ACCEPTANCE OF THE VISUAL WORK IS THE OWNER'S CALL.** §39 of
the brief states the real test as what someone unfamiliar with the code would
call the game, and ADR-040 fixed the rule: human-playtest evidence can never be
marked PASS from an AI session. Everything measurable is measured.

**Phase 47 — Audio That Earns Eight Hours: COMPLETE, with one deliberate gap.**

Every harvest was BIT-IDENTICAL to every other harvest — eleven sounds, one
decoded buffer each. Survivable in a game played for twenty minutes; the whole
problem in one left open beside somebody's work, because identical repetition
is what turns a sound a player liked into a sound they mute, and a muted
companion has lost a channel of feedback for good.

Repeated sounds now vary in pitch by ±6% — about a semitone — derived from a
per-sound play counter through the same hash family the world uses for decor
and tile variants. Never `Math.random`: the same farm must sound the same on
every launch, and a random rule cannot be tested. The counter is per SOUND, so
two effects on one frame do not take correlated rates and sound like a single
event pitched twice.

Signals do not vary. A click, an error and a notification are statements the
player learns as one shape, and a shape that moves reads as a fault. The rule
is by CATEGORY, so a sound added later inherits it without anyone remembering
the module exists.

**The replacement path is verified rather than promised.** `generate-audio.mjs`
has always claimed that dropping a real `.wav` in replaces a placeholder with
no code changes — the entire justification for shipping placeholder sound —
and nothing had ever checked it, in a repository whose history is a catalogue
of documented mechanisms that did not run. It is exercised both ways now.

**DELIBERATELY NOT DONE: the sounds do not sound better.** The obvious next
move is richer synthesis, and **I cannot hear them.** Every other claim here is
checkable by running something; "this sounds nicer" is not, and changing
synthesis blind would be guessing with a straight face. ADR-040's rule applies
unchanged. A second ambient bed is also declined: ADR-023 §5 permits ambience,
singular, and making beds switchable is an amendment to that decision rather
than an implementation detail.

**Phase 48 — Zone Painting: COMPLETE.** `setWorkerZone` has existed and been
tested since phase-14c and **nothing has ever been able to call it**.
`WorkerRoles.tsx` recorded why in its own header: a zone is a set of tiles, so
choosing one is a map interaction, and the panel shipped roles alone rather
than a text box of tile indices that would look like the feature and be
unusable. This is the missing half — arm from the panel, drag a rectangle on
the farm, Shift to erase, Escape to finish.

Built as the same shape as building placement, because it is the same kind of
thing: a small observable shared between an arming button and a drawer. The
drag's START is state; the moving corner is not, and keeping it out of the
store is what stops every React subscriber re-rendering on every mouse move.

**Painting REPLACES rather than appends, and the button says "Set zone".**
Seeding from a worker's existing zone needs that zone on the sim→view boundary,
which means comparing a tile SET per worker per tick to decide whether to
republish — the cost ADR-005 §2 exists to prevent. The controller already
accepts a seed, so the day the boundary carries one cheaply this becomes
additive with no other change.

**One real bug, found by building it:** the camera takes `setPointerCapture` on
any drag over the world, and capture fires `pointercancel` on every other
listener — so the painter's rectangle was abandoned before it had a second
corner. `attachInput` now accepts a suppression predicate; while painting is
armed the drag belongs to the painter.

**And one real documentation defect.** `workers-slice.ts` claimed a worker
given a zone reports a `null` role. The matcher deliberately ignores zones and
always did. A test was built on that sentence, failed, and cost an hour
concluding the feature was broken when the comment was. Corrected, with the
history recorded beside it.

Evidence: 14 controller tests, 5 pointer-wiring tests, and an e2e that arms the
mode, drags, and then proves BOTH halves — the command monitor shows
`setWorkerZone` accepted, and the new `render.zone` metric shows the zone is
not empty. That second check matters: an empty tile list is read as "clear the
zone", so a drag that painted nothing produces an accepted command that does
nothing, and the two are indistinguishable without a count.

**Phase 49 — What Now: COMPLETE, and it amends ADR-034 §7.** The game never
told a player what to do next. That is fine for the person who built it and
hostile to everyone else: a farm with money in the bank, an empty field and no
workers looks exactly like a farm that is finished.

One line in the status bar now says the most useful next thing, DERIVED from
the snapshot the HUD already holds — no objective state, no progress record, no
save change, nothing to migrate. A stored quest list would be a second source
of truth for facts the world already answers and would go stale the moment a
player did something it did not expect.

§7 forbade a quest journal window, and that judgement stands — the board
carries the town's asks and a second list would split where a player looks.
This is deliberately smaller than what it forbade: one sentence, no window, no
log, nothing to dismiss. **It renders NOTHING most of the time**, which is what
lets it live in the bar at all.

**Caught by running it:** the first version counted every posted board offer,
so a brand-new farm with an empty inventory was told "the notice board is
asking for something you can deliver". False advice is worse than silence — it
teaches a player the line does not know what it is talking about. It counts
offers the player can actually fulfil now.

**Phase 50 — First Run: COMPLETE, with no tutorial mode.** Onboarding is the
same line, ordered so that each step is the state the previous one leaves
behind: buy seed → plant → wait → sell → hire. The advice moves because the
PLAYER did, not because a script advanced, so there is nothing to skip, resume,
store or migrate — and a returning player mid-farm simply never sees it.

"Wait for growth" is the last rule and only fires for a farm with no workers.
Silence is right for a going concern; to somebody watching their first row it
reads as "you have done something wrong". A farm with staff gets no advice at
all.

**Phase 51 — Balance & The Idle Cost: COMPLETE, and the balance was not
changed.** Phase 31 measured the four-stage arc and found a perfect player
reaching stage 4 in about **twelve minutes** against a design document claiming
"3 hr+" — a 15× gap that four versions were built on top of without anybody
timing it.

**Both numbers are wrong, and for the same reason: neither describes a
person.** Twelve minutes is a LOWER BOUND for a model that never mis-clicks and
harvests on the exact tick of maturity. "3 hr+" was a guess written before the
economy existed. How long a real player takes has never been measured, and
under ADR-040 that is human-playtest evidence, which no session without a human
in it may mark PASS.

So the lever was left alone. `GAME_DESIGN.md` §1.1's two balance lines both
assume the arc is too SLOW; nothing said what to do about too fast, because
nobody knew it was. Raising the stall's cost until a synthetic player takes
three hours would be guessing with arithmetic, and the stall sits upstream of
contracts, factory payback and expedition funding — a change with that blast
radius is the owner's. Recorded as **ADR-044**.

What the measurement bought instead is a **guard**. The arc test now asserts a
FLOOR as well as its four-hour ceiling: under five minutes fails. The gap
between the floor and the measurement is deliberately wide — it is a tripwire
for a future change that collapses the arc, not a target. The ceiling catches
an arc that got slower; nothing caught one that fell over.

`GAME_DESIGN.md` §1.1 now carries the measurement, the reason neither number is
an answer, and the open question stated so it is not rediscovered.

**Phase 52 — v0.5 Release Candidate: COMPLETE.** `RELEASE-v0.5-RC.md` is the
deliverable and carries the full gate table; this is the short version.

**Every gate re-run fresh rather than cited**, which is the v0.3 lesson v0.4
adopted and this version keeps. Unit **3,309 passed / 0 failed** across 260
files; E2E **84 passed, 4 skipped, 0 failed** in 10.1 minutes with **no
flakes**; a **production** build launched and stayed up; typecheck ×3, lint,
boundaries, cycles, the `v1 → v14` migration chain and `npm audit` all clean.
Coverage **94.98% lines / 86.58% branches** with all nine per-area thresholds
met.

**Three findings, none of which any amount of reading would have produced:**

1. **The coverage gate went red with five timeouts, and the obvious fix was
   wrong.** Instrumentation costs ~3.3×; excluding the long-runs (as
   `memory-longrun` already is) drops `src/persistence` branches to 88.47%
   against a 90% threshold, because `catch-up-factories` reaches
   `catch-up.ts` gaps nothing else does. `tests/long-run-budget.ts` gives a
   test one budget per run instead. Two long-runs were also at 76–78% of their
   timeout UNINSTRUMENTED — a coin toss on a slower machine.

2. **Asset regeneration could not have been byte-identical**, and had not been
   for the whole art track. `lint-staged` ran Prettier over the generated
   `.anim.json` sidecars, which collapses arrays that `JSON.stringify` expands,
   so every commit and every regeneration flipped six files. ADR-006 §2's
   entire guarantee is that a re-run produces identical bytes.
   `.prettierignore` now keeps the formatter out of generated output (the perf
   artefacts had the same problem), and a test fails if anything gets back in.
   The `lint-staged` glob also never covered `.mjs`, which is how four art
   generators drifted unnoticed.

3. **Phase 46's performance regression does not reproduce.** Re-measured on an
   idle machine: tick average **0.060 ms** (reported 0.104, baseline 0.063),
   unattended CPU **0.533%** (reported 1.058%, baseline 0.595%), and v0.4's own
   full-load scenario now **faster than at v0.4** — 0.145 ms against 0.187 ms.
   Phase 46 noticed its first reading was taken mid-build, re-measured once,
   and reported the regression anyway; load was the cause, not a contributor.
   The footprint hypothesis is **withdrawn in the place it was made**. Heap
   12.8 → 14.5 MB is the one real increase, most plausibly 166 → 237 sprites.

4. **The RC's own gate table was wrong, and checking it is what found the
   worst defect of the four.** Having fixed (2), the byte-identical claim was
   written down and then VERIFIED rather than assumed — twenty-one files came
   back modified. Two placeholder generators from phases 04c and 05d were
   still on disk **writing the same filenames as the production generators**:
   running one reverted the worker rig to 16×16 grey blobs and dropped an
   animation, the other reverted the storage shed and four item icons. Four
   versions of loaded weapon in `scripts/`, and `ASSETS.md` §7.3 still calling
   the worker art placeholder three phases after it stopped being. Both
   deleted; `tests/art-regeneration.test.ts` runs every generator and fails on
   one moved byte, checked against a corrupted asset to confirm it bites.

**And one ADR amended**: ADR-042 §4 described legacy overlap resolving by "the
first placed keeps it", which `deserialize.ts` does not do — it marks every
tile of every rectangle blocked, because the grid records whether a tile is
blocked, not who blocked it. Same guarantee, simpler mechanism, and the ADR was
the thing that was wrong. `tests/legacy-overlap-load.test.ts` now pins the
behaviour on the load path, which is where an old save actually arrives.

**TWO SUCCESS CRITERIA ARE OPEN, NOT MET AND NOT SUBSTITUTED.** The "oh, I
see" moment at the first hire, and a tester returning on a second day, are
human-playtest evidence; ADR-040 fixed at phase 31 that such evidence is never
marked PASS from a session with no human in it. **Perceptual acceptance of the
whole visual overhaul is in the same class and is the owner's call.**

**Phase 53 — Start New Game: COMPLETE.** Owner-requested after the RC, so it
sits on v0.5's tail rather than opening a version nobody has scoped. ADR-045
governs.

**The feature asks for what this project's persistence design calls the
catastrophe.** `SAVE_FORMAT.md` and `save-compatibility-report.md` have said
"NEVER a new game" since v0.1, and five versions of load-path engineering exist
to make sure a player with a farm never comes back to an empty one.

The distinction ADR-045 draws is that the prohibition is about a farm
disappearing **without anybody asking** — a corrupt file, a failed parse, a
directory read as "new player". A player deliberately ending their own farm is
the opposite situation. But the prohibition still sets the bar, and two
properties follow from it:

- **The button ARCHIVES, it does not delete.** Every artifact moves to
  `saves/archive/<timestamp>/`, so a player who regrets the click has their
  world in a folder. Nothing this application does removes a farm from disk.
- **It cannot be pressed by accident.** No confirmation primitive exists
  anywhere in `src/` — and a modal in a frameless always-on-top overlay is the
  wrong shape while `window.confirm` would block the thread the simulation runs
  on. So the control arms on the first press and fires on the second, disarming
  on a timeout and whenever the panel closes.

**A latent defect was fixed on the way past.** `pruneBackups` keeps the highest
ticks and a new game starts at tick 0, so a reset that left `backups/` in place
would have kept deleting the NEW farm's copies and retaining a world that no
longer existed — the new farm would have accumulated no backups at all. Moving
the directory is what makes rotation correct, and it is tested by asserting
every surviving backup belongs to the new farm.

**The reset is a RELOAD, not a live world swap.** Every store on `World` is
`readonly` and `seed` is documented "Never changes", so a reset is a new world
rather than a modified one — and swapping one in place means re-binding
roughly fifteen sites in `composeApplication`, with no precedent anywhere in
the codebase. `bootApplication()` already does all of it on every launch, so
the archive is followed by the reload capability that was already there, and
boot takes the `saves.missing` branch that has built every new farm since v0.1.

**The sharpest hazard was the sequencing, and it is the one thing a unit test
could not reach.** The renderer holds the old world while its files move, and
main runs an autosave cadence plus quit and close-to-tray saves; a trigger in
that window writes the old farm straight back over the fresh start. Main now
raises a flag, stops the cadence, then archives — and REFUSES writes until the
reloaded renderer asks for its saves, which is the signal that a new world is
being built. Proven by invoking the two channels in order against the running
app, and checked by inverting the guard to confirm the test fails.

Evidence: 8 archive cases in `save-store.test.ts`, 6 controller tests, 7 button
tests, and 5 E2E against the real application — including that a new farm has a
different SEED (comparing bytes would have passed even with no save at all),
that the old farm is in the archive, that one press does nothing, and that
**accessibility settings survive**, which they do only because they were never
in the save.

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
