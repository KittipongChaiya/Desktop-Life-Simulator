# ART_DIRECTION

> **Status:** Authoritative for visual philosophy and intent. The "why" behind every art decision.
> **Owns:** The overall visual philosophy, identity, audience, mood, and the _intent_ behind camera, lighting, atmosphere, and animation.
> **Does not own:** The binding rules that enforce this direction (`STYLE_LOCK.md`); the colour values (`COLOR_PALETTE.md`); sizes and pivots (`PIXEL_GUIDE.md`); the technical facts of tile size, perspective, and rendering (`ASSETS.md §2, §8`); the detailed visual _language_ — shape, material, and composition grammar (`VISUAL_REFERENCE.md`, phase-05.5f).

This document sets the direction. `STYLE_LOCK.md` turns it into rules; the guides turn it into numbers. Read this first to understand _what the game should feel like to look at_ — then obey the documents it points to for _how_.

---

## 1. Overall visual philosophy

**The art exists to be glanced at, not stared at.** Desktop Life Simulator lives at the bottom edge of the screen while the player gets on with real work (`VISION.md §1`). That single constraint drives every visual choice: the art must communicate state — a crop ripened, a worker idle, storage nearly full — in the fraction of a second a glance allows.

Three commitments follow from it:

1. **Readability over richness.** When clarity and detail conflict, clarity wins (`STYLE_LOCK.md R-16`). A sprite that is beautiful up close but ambiguous at overlay scale has failed at its only job.
2. **Warmth over spectacle.** The game is a calm companion, not a demand for attention. The art invites a smile, never a jolt.
3. **Coherence over novelty.** One hand, one world. A hundred future sessions must produce art that looks like it came from a single studio on a single afternoon (`VISION.md §2.5`).

The style is **flat, hand-crafted pixel art** — no realism, no semi-realism (`STYLE_LOCK.md R-01`).

---

## 2. Visual identity

The game should be recognisable from a single tile: **soft, warm pixel art with clean silhouettes and a limited, harmonious palette.** If a player saw one screenshot with no UI, they should read "cozy farm, made with care."

The identity rests on three pillars:

| Pillar              | What it means visually                                             | Enforced by                |
| ------------------- | ------------------------------------------------------------------ | -------------------------- |
| **Clean line**      | One 1 px warm outline on everything that stands up; none on ground | `STYLE_LOCK.md R-03, R-04` |
| **Harmonious hue**  | A limited, warm-leaning palette shared by all art                  | `COLOR_PALETTE.md`, `R-08` |
| **Consistent form** | One perspective, one light, fixed proportions                      | `STYLE_LOCK.md R-05…R-07`  |

None of these are expensive individually; together they are the whole identity, and each is cheap now and ruinous to retrofit.

---

## 3. Target audience

The player is an **adult with a job or study**, comfortable with a computer, who wants a low-pressure companion running beside their work — the same person `VISION.md §1` describes tending a farm "in the gaps between real work." They are not chasing twitch challenge or grind; they want a world that rewards their attention when they give it and never punishes its absence (`VISION.md §2.2`).

The art speaks to that person: **approachable, unintimidating, and quietly charming.** It does not signal "hardcore," "grimdark," or "childish." It signals _welcome back_.

---

## 4. Mood & emotion

The target emotion is **cozy, warm, optimistic, calm** (`VISION.md §2`). The art carries that mood before a single mechanic runs:

- **Cozy** — warm browns and greens, soft light, rounded silhouettes.
- **Optimistic** — bright but not garish; growth and reward are the visual highlights.
- **Calm** — gentle motion, no visual shouting, generous negative space.

The mood has one hard boundary: **nothing in the art produces alarm.** Danger Red is reserved and unused in v0.1 world art (`COLOR_PALETTE.md §5`, `STYLE_LOCK.md R-10`), because the product forbids stress driven by inattention (`VISION.md §2.2`). Reward, not threat, is the emotional engine — the "you gained something" gold (`COLOR_PALETTE.md §4`) is the colour the eye should learn to seek.

---

## 5. Pixel density

**One density, everywhere: the 32 px grid, authored at 1× with a 2× high-DPI variant** (`ASSETS.md §2`). This document does not restate the number; it states the _intent_: a single density is what makes the whole world feel like one physical scale. Mixing densities — chunky sprites beside fine ones — instantly breaks the illusion, so it is forbidden (`STYLE_LOCK.md R-15`). Density is chosen once, here, and never negotiated per asset.

---

## 6. Camera & perspective

The camera is **top-down with a slight 3/4 tilt on things that stand up** (`ASSETS.md §2`; the authoring consequences are in `PIXEL_GUIDE.md §6`). The intent behind that choice:

- **Top-down reads a farm grid instantly.** Rows, plots, and paths are legible from above — exactly the glance the game is built around.
- **A shallow tilt gives objects presence** without the depth-management cost of true isometric. Characters and buildings feel like they occupy the world rather than lying flat on it.

The camera holds one projection for the entire game; mixing perspectives is forbidden (`STYLE_LOCK.md R-05`), because a scene that mixes projections cannot be read as one coherent space.

---

## 7. Lighting & shadow rules (intent)

**One soft global light from the upper-left** (`PIXEL_GUIDE.md §7` owns the authoring detail; `STYLE_LOCK.md R-06` locks the direction). The intent:

- Light is **soft and warm**, like an afternoon — never a hard, dramatic key light. Drama is not the mood (§4).
- **Shadows anchor, they do not threaten.** A small, soft contact shadow sits under standing objects so they belong to the ground; there are no long, hard, dramatic cast shadows.
- Shading steps through each colour ramp's shadow tone (`COLOR_PALETTE.md §3`), never a smooth gradient (`STYLE_LOCK.md R-02`).

A single consistent light is the cheapest way to make independently-authored assets share a world.

---

## 8. World atmosphere

The world feels **tended, lived-in, and gently alive.** It is not wilderness and not a machine — it is a small place someone cares for. Atmosphere comes from:

- **Generous negative space.** The world breathes; clutter is the enemy of the glance (`STYLE_LOCK.md R-16`).
- **Soft, saturated-but-not-loud colour.** Grass is the dominant, restful base (`COLOR_PALETTE.md §3.1`); warmth accumulates in the tended areas.
- **Quiet life.** Idle motion (a breath, a sway) keeps the world from feeling frozen without demanding attention (§10).

---

## 9. Environmental storytelling

The world should tell its small story without a word of dialogue. In v0.1 the vocabulary is deliberately modest, but the principle is set now for the town, ruins, and dungeons to come (`WORLD_BIBLE.md`, phase-05.5b):

- **Tended vs untended.** Owned, worked land looks cared-for; the edges of the plot are wilder. The visual contrast _is_ the story of the player's progress.
- **Wear tells history.** A worn path, a patched roof, a well-used tool read as "someone lives here" — the hand-crafted warmth of the identity, expressed through the objects themselves.
- **Reward is legible in the world.** Expansion, new buildings, and full storage are visible at a glance, so progress is felt by looking, not by reading a number.

`VISUAL_REFERENCE.md` (phase-05.5f) will own the detailed grammar of _how_ shape and material carry this storytelling; this section owns only the intent that they must.

---

## 9.1 Density is a hierarchy, not an amount

**Added in v0.5 phase 32 (ADR-041 §4).** §9 asks for environmental
storytelling; this says how much, and where, so that "denser" cannot quietly
become "busier".

| Tier | What                                                     | Must be                        |
| ---- | -------------------------------------------------------- | ------------------------------ |
| 1    | Workers, crops, interactable buildings, resource nodes   | Readable instantly, always     |
| 2    | Buildings, paths, fields, the structure of a region      | Visible, never competing       |
| 3    | Flowers, tufts, props, ambient creatures, ground texture | Enriching, never noticed first |

**A density pass fails when a Tier 1 object is lost inside Tier 3** — not when
a scene "looks empty". That is the test, and it is checked on the contact sheet
at 1×, never at inspection zoom.

## 9.2 The craft floor — what the ground may and may not do

**Added in v0.5 phase 32.** Three findings from prototyping the new vocabulary
against the old assets, recorded because each one cost an iteration and phase 33
onward should not pay for them again:

- **An ordered dither cannot texture a 32 px ground tile.** A 4×4 Bayer matrix
  repeats eight times across the tile, so at any density high enough to see it
  resolves into a visible cross-hatch — a screen door, not grass. Dither is for
  **small faces and transitions** (a roof slope, a soil-to-grass edge, a
  shadowed wall), where it spans a handful of pixels and never repeats enough to
  read as a pattern.
- **Solid tonal blobs on ground read as polka dots.** Large-scale value
  variation across a field is the job of **tile variants and scattered props**,
  not of texture inside a single tile.
- **Ground texture is hand-placed clusters.** Two- and three-pixel marks in a
  low-contrast tone, which the eye reads as blades. Low contrast is the whole
  trick: the ground is Tier 3 and must lose to everything standing on it.

## 9.3 Seasons and weather: what a multiply tint can and cannot do

**Measured in v0.5 phase 33**, by rendering one scene under all four season
tints at 1× (`scripts/generate-scene-sheet.mjs --seasons`) rather than
reasoning about the hex values.

The season is applied as a **multiply over the finished terrain** (ADR-021 §6),
which is why a season change costs a tint assignment per visible chunk and no
chunk redraw at all. That choice has a consequence nobody had looked at:

- **A multiply cannot brighten.** White means "leave the art alone", so the
  brightest season has to be the one that does nothing — which is why summer
  is now the reference and spring carries the cool tint, not the reverse.
- **A multiply cannot move a hue far.** Warm-tinting grass removes blue and
  leaves it green. Autumn CAN reach olive and khaki, and does; it cannot reach
  the browns and reds of actual autumn foliage.
- **Winter has no snow**, and cannot have any by tinting. Cool-tinting green
  gives cold green.

So the tints are pushed to the edge of the mechanism and no further. All four
seasons are now distinguishable at 1×, which they were not before.

### Weather joins the same slot

**Correction, phase-39.** An earlier draft of this section said rain was
"audible and invisible". That was wrong, and the commit that introduced the
weather tint repeats the error: Rain has had a VISUAL since phase-12d — falling drops on layer 4 (`rain-view.ts`, ADR-022 §6). What it did not have is one that survives the way this product is used.

The real gap is narrower and more interesting. Those drops are **ambient
motion** under ADR-017 §2, which means two things: they are OFF BY DEFAULT
(`DEFAULT_MOTION_SETTINGS.environmental` is `false`), and once enabled they
surrender the frame loop the moment the pointer goes idle. Both rules are
right — they are what stops this window burning a core in the corner of
somebody's screen. But together they mean that in the mode the product is
designed for, _left open while you work_, the world looks like a clear day
whatever the weather is.

So weather now also declares a GROUND TINT, multiplied with the season's
(`src/renderer/render/tint.ts`). Not instead of the drops — alongside them.
The tint is the half that can be on always, because it costs one assignment
per visible chunk when the weather turns and no per-frame work at all, which
is precisely what ADR-017 §2 refuses to let a particle layer do.

The rain tint is deliberately gentle. The brief asks for rain that looks cozy,
and this window sits beside real work for hours — so the ground should read as
the same farm under cloud, never as dusk.

**What is deferred, and why it is a decision rather than a task:** foliage that
actually changes colour needs seasonal tile and prop VARIANTS, selected the way
`tile-variants.ts` already selects ground variants. That is affordable — the
machinery exists — but it means the season is baked into cached chunk textures,
and ADR-021 §6 records that invalidating every cached texture four times a year
is _"the one thing this renderer exists to avoid"_. Overriding a recorded
decision belongs in an amendment to it, not in an art phase.

## 10. Animation philosophy

Motion in this game is **gentle, purposeful, and calm** — the moving equivalent of the palette. The philosophy:

- **Idle is nearly still.** A breath, a sway, a blink — just enough that the world is not frozen, never enough to pull the eye from the player's real work (`VISION.md §2.1`).
- **Action is clear, not flashy.** A harvest or a till has a legible wind-up and follow-through so the player understands what happened at a glance, without spectacle.
- **Motion serves the glance.** The most important thing an animation can do is signal a state change worth one click (`VISION.md §3.1`).

The _format and timing_ of animation are owned by `ASSETS.md §7` (ticks, not milliseconds, tied to the deterministic simulation); recommended frame counts are in `PIXEL_GUIDE.md §8`; the full per-action feel is in `ANIMATION_GUIDE.md` (phase-05.5c). This section owns only the _feel_. One hard constraint from the product survives into art: an animation must never cost CPU while off-screen (`STYLE_LOCK.md R-12`), because the idle budget is a feature (`VISION.md §2.1`).

---

## 11. Long-term scalability

This direction is written to survive the whole roadmap (`VISION.md §4`) without a rewrite. The world grows from a farm to a town, then to mines, dungeons, and combat — and every one of those must look like it always belonged.

The scalability strategy is **extend, never replace**:

- **New biomes tint the existing ramps**, they do not introduce a rival palette (`COLOR_PALETTE.md §8`).
- **New content obeys the same line, light, and perspective** as the storage shed — the one-line test in `STYLE_LOCK.md`.
- **Reserved colours already exist for the future** — Rare Violet for magic, Danger Red for the combat and city-defense of v1.0 (`COLOR_PALETTE.md §4`) — so that content arrives into a palette that anticipated it.

The direction is a promise to the session six months from now (`VISION.md §2.5`): follow these documents and your new dungeon will sit beside the first farm as though one hand made both.

---

## 12. Related documents

| Document                      | Relationship                                                 |
| ----------------------------- | ------------------------------------------------------------ |
| `VISION.md`                   | The product intent, audience, and mood this direction serves |
| `STYLE_LOCK.md`               | Turns this philosophy into binding, numbered rules           |
| `COLOR_PALETTE.md`            | The colour values that carry this mood                       |
| `PIXEL_GUIDE.md`              | The sizes, pivots, light direction, and outlines             |
| `ASSETS.md §2, §7, §8`        | Tile size, perspective, animation format, rendering rules    |
| `VISUAL_REFERENCE.md` (05.5f) | The detailed visual language behind this direction           |
| `WORLD_BIBLE.md` (05.5b)      | The world whose atmosphere §8–§9 describe                    |
