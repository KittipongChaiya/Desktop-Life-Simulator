# VISUAL_REFERENCE

> **Status:** Authoritative for the detailed visual **language** — the grammar of shape, material, composition, and feel that every future asset speaks.
> **Owns:** Visual keywords, inspiration qualities, the attention hierarchy, shape language, material language, composition rules, the lighting/colour/animation _language_ deltas, and the environmental-storytelling grammar `ART_DIRECTION.md §9` promised to this file.
> **Does not own:** The visual _philosophy_ and intent (`ART_DIRECTION.md`); the binding rules (`STYLE_LOCK.md`); colour values (`COLOR_PALETTE.md`); sizes, pivots, outlines, and the light direction (`PIXEL_GUIDE.md`); the creative review that enforces all of it (`QUALITY_GUIDELINES.md`); per-domain canon (`CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`, `UI_STYLE_GUIDE.md`, `ICON_GUIDE.md`, `ANIMATION_GUIDE.md`).

**Boundary note (the three-document split).** `ART_DIRECTION.md` is the philosophy — _why_ the game looks the way it does. `STYLE_LOCK.md` is the law — _what is forbidden_. This file is the **language** — _how_ to speak the style fluently when inventing something new. When a session generates an asset no guide has anticipated, this is the document that answers "what would this world's version of that look like?" This document is **not** an art prompt; prompts live in `PROMPT_LIBRARY.md` and encode what is written here.

---

## 1. Visual keywords — the shared vocabulary

Nine words describe every asset this project will ever accept. Each earns its place:

| Keyword              | Why it matters                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Cozy**             | The product emotion (`VISION.md §2`); warmth is the identity, delivered by the palette and rounded forms.          |
| **Peaceful**         | Nothing alarms (`VISION.md §2.2`); no asset may look urgent, aggressive, or stressed at home.                      |
| **Optimistic**       | Growth and reward are the visual highlights (`ART_DIRECTION.md §4`); the world always looks like it is going well. |
| **Warm**             | The palette leans warm (`COLOR_PALETTE.md`); even cool relief colours sit inside a warm world.                     |
| **Lively**           | Quiet life — a sway, a breath — keeps the world from feeling frozen (`ART_DIRECTION.md §8`), never busy.           |
| **Readable**         | The glance is the game (`VISION.md §1`); state must read in a fraction of a second (`STYLE_LOCK.md R-16`).         |
| **Charming**         | Small hand-made imperfection over machine precision; the smile is a design goal (`ART_DIRECTION.md §3`).           |
| **Hand-crafted**     | One hand, one world (`ART_DIRECTION.md §1`); flat pixel art, never rendered realism (`STYLE_LOCK.md R-01`).        |
| **Desktop-friendly** | The art lives beside real work at overlay scale (`VISION.md §2.1`); it must be ignorable and legible small.        |

An asset that cannot be described by these nine words does not belong. An asset that needs a word this list forbids — _gritty, epic, realistic, frantic_ — is rejected before it is drawn.

## 2. Inspiration analysis — qualities, not sources

The project learns from **abstract qualities** of the cozy-farm and pixel-art traditions; it copies no game. For every quality: what to learn, and what not to copy.

| Quality admired        | Learn                                                             | Do NOT copy                                                          |
| ---------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Readable environments  | Grid-legible farms; state visible at a glance                     | Any specific tileset, layout, or landmark                            |
| Comfortable colour     | Limited, harmonious, warm-leaning palettes                        | Another game's palette values — ours are locked (`COLOR_PALETTE.md`) |
| Clean silhouettes      | One-glance recognition of every entity (`CHARACTER_BIBLE.md §3`)  | Recognisable character designs or mascots                            |
| Minimal visual noise   | Generous negative space; detail spent only where it reads         | Maximalist decoration, screen-filling clutter                        |
| Consistent proportions | One fixed rig and scale for all characters (`STYLE_LOCK.md R-07`) | Another game's proportions or chibi conventions                      |
| Relaxing atmosphere    | A world that rewards attention and never demands it               | Idle-game juice: screen shake, confetti spam, number fountains       |

The test is one question: could a reviewer trace the borrowed thing to a specific game? If yes, it is a copy, not a quality — reject it (`QUALITY_GUIDELINES.md §2`).

## 3. Visual hierarchy — who wins the glance

When the player glances, their eye must land in this order:

**Workers & characters → interactive/actionable objects (ripe crops, full storage) → buildings → ordinary crops → trees & nature → terrain → background.**

This is the **attention** order, not the render order — draw order (z) is owned by `ARCHITECTURE.md §5` and the two must not be confused: terrain draws first but reads last.

Four tools enforce the hierarchy, each spent from the top down:

- **Colour.** Reserved accents (`COLOR_PALETTE.md §4`) mark only the top tiers — reward on things worth clicking, never on scenery (`STYLE_LOCK.md R-09`). Terrain stays in the restful base ramps.
- **Contrast.** Outlined entities pop against the outline-free ground (`PIXEL_GUIDE.md §5`); the further down the hierarchy, the closer an element's values sit to its neighbours'.
- **Animation.** Motion is the scarcest resource — workers act, actionable states pulse gently at most, and terrain never moves (`ANIMATION_GUIDE.md`). A moving background is a hierarchy violation, not polish.
- **Lighting.** The single soft light (`PIXEL_GUIDE.md §7`) stays uniform; nothing is spot-lit. Hierarchy comes from the three tools above, never from dramatic light (`STYLE_LOCK.md R-06`).

## 4. Shape language

The world's forms follow one axis: **rounded = safe and present; angular = old, wild, or far away.** Home curves; the frontier has corners.

| Category                     | Shape grammar                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Characters                   | Rounded, soft-cornered, compact — the rig and silhouettes are canon (`CHARACTER_BIBLE.md §2–§3`); nothing spiky or gaunt.                |
| Buildings                    | Cozy vernacular (`WORLD_BIBLE.md §2`): gently pitched roofs, slightly plump walls, human doors; hand-built, never machine-straight rows. |
| Nature                       | Organic blobs and tufts — trees are round-crowned, bushes cluster; no fractal spindliness that dies at 1× (`STYLE_LOCK.md R-16`).        |
| Tools                        | Chunky, slightly oversized heads so the tool reads in a worker's hand at overlay scale (`CHARACTER_BIBLE.md §7`).                        |
| UI                           | Chunky rounded panels and controls (`UI_STYLE_GUIDE.md` owns the look; the shape family is the same warm roundness).                     |
| Friendly objects             | Round-dominant, upright, centred mass — things that belong lean toward the viewer's comfort.                                             |
| Dangerous objects (future)   | Angularity is the danger cue — but danger never appears at home (`WORLD_BIBLE.md §1`); sharpness lives at the frontier only.             |
| Ancient structures (future)  | Heavier, squarer, weathered-soft — old stone with the corners worn round (`LORE_BIBLE.md §4`); imposing by mass, not menace.             |
| Industrial structures (v0.4) | Craft, not industry (`WORLD_BIBLE.md §6`): workshop shapes — wheels, bellows, benches — never smokestack grids.                          |
| Magic objects (future)       | Reserved until magic is designed (`WORLD_BIBLE.md §8`); direction only — soft, rounded, gently luminous, never jagged-arcane.            |
| Monsters (v1.0)              | Readable silhouette first (`CHARACTER_BIBLE.md §12`); imposing through size and mass, never through gore or clutter.                     |
| Bosses (v1.0)                | The same rule at larger scale — a boss is a bigger, clearer shape, not a busier one.                                                     |

## 5. Material language

Every material must be recognisable inside a few pixels. The grammar: **one base ramp, stepped shading, one signature cue per material** — the cue is what survives at 16–32 px. Values live in `COLOR_PALETTE.md §3`; this table owns only the _read_.

| Material       | Signature cue at small size                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Wood           | Warm brown ramp + one darker grain line per plank; never woodgrain texture noise.                                               |
| Stone          | Cool neutral ramp + irregular block seams; corners chipped soft, not sharp.                                                     |
| Metal          | One crisp highlight pixel-line on the edge — shine is a single step, never a gradient (`STYLE_LOCK.md R-02`).                   |
| Glass          | A diagonal 1-px highlight over a cool tint; transparency implied, never actual soft alpha.                                      |
| Fabric         | Flat colour blocks with a single fold line; drape shown by silhouette, not shading detail.                                      |
| Plants         | The grass/foliage ramps (`COLOR_PALETTE.md §3.1`) in leaf-cluster blobs; individual leaves only where they read.                |
| Water          | The cool relief ramp (`COLOR_PALETTE.md §3.3`) + a sparse moving glint; calm, never white-capped.                               |
| Fire           | Small, warm, contained — a hearth cue, not a hazard; never reads as emergency (`VISION.md §2.2`).                               |
| Soil           | The warm brown ramp (`COLOR_PALETTE.md §3.2`); tilled soil shows row furrows — the state cue farming runs on.                   |
| Grass          | The restful dominant base (`COLOR_PALETTE.md §3.1`); mostly flat with sparse tuft accents — quiet by design.                    |
| Snow (v0.2)    | Season-palette recolour (`COLOR_PALETTE.md §7`) with soft rounded accumulation on top edges.                                    |
| Ice (v0.2)     | Cool tint + the same single diagonal highlight as glass; slick is a shine cue, not a blur.                                      |
| Clouds (v0.2)  | Soft rounded masses in the sky/UI register; shadows they cast, if any, are gentle and slow.                                     |
| Magic (future) | Reserved (`WORLD_BIBLE.md §8`): Rare Violet register (`COLOR_PALETTE.md §4`), soft glow via stepped halo — never particle spam. |

## 6. Composition rules

- **The camera composes for the strip.** The playfield is a wide, shallow overlay (`VISION.md §2.1`); composition reads left-to-right at a glance, and nothing vital hides in corners.
- **Negative space is a material.** The world breathes (`ART_DIRECTION.md §8`); tended plots sit in open ground. Filling every tile is the most common way to destroy the look.
- **Cluster, don't scatter.** Objects group in small, believable clusters (a shed near its plots, trees in twos and threes) with clear gaps between clusters — clusters are what the eye parses, scatter is noise.
- **Silhouette is the unit of readability.** Every standing object must be identifiable from its outline alone at 1× (`CHARACTER_BIBLE.md §3` for characters; the same bar applies to everything).
- **Ground, stage, sky.** The top-down world has its own three planes: terrain (calm, low-contrast), the standing stage (entities and buildings — where all meaning lives), and overlay/sky effects (weather, v0.2 — always translucent-light, never obscuring the stage).

## 7. Lighting language

The physics is owned elsewhere — one soft upper-left light (`PIXEL_GUIDE.md §7`, locked by `STYLE_LOCK.md R-06`), stepped ramp shading (`STYLE_LOCK.md R-02`), intent in `ART_DIRECTION.md §7`. This section owns the **contexts** as they arrive:

- **Outdoor (v0.1)** — the default afternoon warmth; the only lighting that exists today.
- **Indoor (future interiors)** — the same direction, one step warmer and dimmer; a hearth may add a local warm pool, stepped, never a radial gradient.
- **Night (v0.2)** — a cool wash over the world (season-palette machinery, `COLOR_PALETTE.md §7`); windows glow warm — the "home is safe" cue after dark (`WORLD_BIBLE.md §1`).
- **Weather (v0.2)** — rain and overcast desaturate gently; a storm dims, it never blackens (`WORLD_BIBLE.md §5`).
- **Season (v0.2)** — the season palettes are the lighting shift (`COLOR_PALETTE.md §7`); winter light is paler, autumn golden — done by recolour, not by new light sources.
- **Forbidden always:** dramatic key lights, long hard cast shadows, lens effects (flare, bloom, vignette), coloured rim light, real-time light sources, and any gradient-lit surface — each is either realism (`STYLE_LOCK.md R-01`), softness (`R-02`), or a second light (`R-06`).

## 8. Colour emotion

Values, ramps, and per-family rationale are owned by `COLOR_PALETTE.md`; the reserved-accent law is `STYLE_LOCK.md R-09/R-10`. The one grammar rule this file adds: **temperature tells the story of care.** Warmth accumulates where life is tended — the farm, the hearth, the reward — and cools with distance from home: the wild edge, the deep mine, the frontier (`WORLD_BIBLE.md §3`). Danger Red stays unspent in v0.1, Reward Gold marks gain, Rare Violet waits for magic (`COLOR_PALETTE.md §4–§5`). An asset's temperature should tell you, before anything else does, how close to home it belongs.

## 9. Animation feel

The philosophy is `ART_DIRECTION.md §10`; the numbers are `ANIMATION_GUIDE.md`; character movement personality is `CHARACTER_BIBLE.md §9`. The personality vocabulary this file locks:

- **Relaxed, never snappy.** Motion at a working pace (2–5 fps, `ANIMATION_GUIDE.md §1`); no anticipation-crash-impact timing. The world is never in a hurry.
- **Weight without drama.** A hoe falls with believable weight; a settle frame, not a screen shake, sells the landing.
- **Momentum is gentle.** Starts and stops ease across a frame or two; nothing whips.
- **Idle is a breath.** The idle baseline is near-stillness (`ART_DIRECTION.md §10`); one subtle motion per idle, slow cycle, long rest.
- **Secondary motion is rare seasoning.** A hair bob or tool bounce only where it reads at 1×; if it needs slow-motion to see, cut it (`STYLE_LOCK.md R-16`).
- **Exaggeration stays small.** Squash-and-stretch at most one pixel of deformation — a wink of life, never rubber-hose cartoon physics; forms stay solid (`STYLE_LOCK.md R-07`).
- **Future combat (v1.0)** reads as clear resolution, not twitch: wind-up, strike, settle — legible at a glance, never gory (`VISION.md §5.1`).

## 10. Environmental storytelling grammar

`ART_DIRECTION.md §9` owns the intent (tended vs untended, wear tells history, reward is legible); this is the promised grammar — the concrete cues, context by context:

| Context           | The cues that carry the story                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buildings         | Care shows: patched roof, swept threshold, a full rack by the door. Prosperity is upkeep and additions, never gold trim.                                                    |
| Roads & paths     | Wear is history — paths darken and widen with use; a worn shortcut says "someone walks here daily" without a word.                                                          |
| Farms             | The tended-vs-wild gradient is the player's biography: crisp rows and moist soil at the centre, rougher ground at the owned edge, wild growth beyond (`WORLD_BIBLE.md §1`). |
| Nature            | The wild is older, not hostile — bigger trees, deeper greens, less order; it invites walking in, it never looms.                                                            |
| Ruins (future)    | The past is quiet, not ominous (`LORE_BIBLE.md §4`): worn-soft stone, moss, a fallen lintel — mystery reads as "old and sleeping," never "haunted."                         |
| Weather (v0.2)    | Weather is atmosphere, not obstacle — rain darkens soil and empties yards; nothing about it reads as damage or threat.                                                      |
| NPC spaces (v0.3) | Occupation shows in objects: a baker's flour sacks, a fisher's nets. Role is readable from the doorstep (`CHARACTER_BIBLE.md §6` does the same with clothing).              |
| Dungeons (v1.0)   | The one place unease is allowed (`WORLD_BIBLE.md §9`): the grammar inverts — cooler, more angular, sparser — but even here it is strange-old, never gory.                   |

## 11. The consistency questions

Every future asset answers six questions. The review that enforces them is `QUALITY_GUIDELINES.md`; each question routes to its law:

1. **Does it belong to this world?** — the one-line test (`STYLE_LOCK.md`, `QUALITY_GUIDELINES.md §1`).
2. **Would a player recognise it immediately?** — silhouette and hierarchy (§3–§4 above, `CHARACTER_BIBLE.md §3`).
3. **Does it respect silhouette rules?** — outline and shape (`PIXEL_GUIDE.md §5`, §4 above).
4. **Does it respect palette rules?** — `COLOR_PALETTE.md`, `STYLE_LOCK.md R-08…R-10`.
5. **Does it add unnecessary detail?** — noise check (`STYLE_LOCK.md R-16`, §5–§6 above).
6. **Does it read at gameplay zoom?** — the 1× overlay read (`QUALITY_GUIDELINES.md §3`).

---

## 12. Consistency rules

1. **Language, not law.** Where this file and `STYLE_LOCK.md` disagree, the lock wins; where it and `ART_DIRECTION.md` seem to differ, philosophy outranks grammar and this file is corrected.
2. **Grammar extends, canon decides.** For characters, world, UI, and icons, the domain bibles/guides are authoritative; this file supplies the connective grammar between them, never overrides them.
3. **Every future category speaks this language first.** A new category (monster, vehicle, ruin) starts from §4–§5 before its own guide exists — that is this document's job.
4. **No values here.** This file contains no hex, no pixel dimensions, no frame counts — those owners (`COLOR_PALETTE.md`, `PIXEL_GUIDE.md`, `ANIMATION_GUIDE.md`) hold the numbers.

---

## 13. Related documents

| Document                                                     | Relationship                                     |
| ------------------------------------------------------------ | ------------------------------------------------ |
| `ART_DIRECTION.md`                                           | The philosophy this language expresses           |
| `STYLE_LOCK.md`                                              | The binding rules; always outrank this file      |
| `COLOR_PALETTE.md`                                           | The colour values and ramps §5 and §8 speak in   |
| `PIXEL_GUIDE.md`                                             | Sizes, pivots, outlines, and the light direction |
| `QUALITY_GUIDELINES.md`                                      | The review that enforces §11                     |
| `CHARACTER_BIBLE.md` / `WORLD_BIBLE.md` / `LORE_BIBLE.md`    | The domain canon the grammar serves              |
| `UI_STYLE_GUIDE.md` / `ICON_GUIDE.md` / `ANIMATION_GUIDE.md` | Domain guides sharing this shape/feel vocabulary |
| `PROMPT_LIBRARY.md`                                          | Encodes this language into generation prompts    |
| `VISION.md`                                                  | The product intent behind every keyword in §1    |

---

## Motion vocabulary (phase-07.7, ADR-017)

Durations are real milliseconds, not ticks: these acknowledge something to a
person, so they must not stretch when the simulation is time-scaled.

| Motion          | Duration            | Shape                                                              |
| --------------- | ------------------- | ------------------------------------------------------------------ |
| Crop spawn      | 280 ms              | from 0.4×, overshooting to ~1.12×, settling on 1                   |
| Crop pulse      | 240 ms              | one half-sine to 1.18×, ending where it started                    |
| Crop depart     | 300 ms              | swells to 1.25× while lifting 0.35 tile and fading                 |
| Dust            | 300 ms              | shortest — it fires on every till and footfall                     |
| Sparkle         | 380 ms              | a growth stage reached                                             |
| Splash          | 360 ms              | water                                                              |
| Burst           | 420 ms              | the existing harvest acknowledgement (07.5b)                       |
| Coin burst      | 440 ms              | a sale                                                             |
| Leaves          | 460 ms              | longest — foliage settles slowest                                  |
| Floating number | 900 ms              | full opacity for the first half, then fades while rising 0.75 tile |
| Camera shake    | 260 ms / 320 ms     | 3 px at 24 Hz; 4 px at 20 Hz for a placement                       |
| Worker hop      | 420 ms              | two bounces, the second smaller                                    |
| Worker fidget   | ~1.2 s, every ~12 s | look-around or stretch                                             |
| Worker breath   | ~3 s cycle          | ±1 px, phase derived per worker                                    |
| Plant sway      | 3.4 s cycle         | ±0.035 rad, phase derived per tile                                 |

**Every curve returns to its resting value.** A spawn that ended at 1.04×, a
fidget that left a sprite a pixel high, or a shake that ended a fraction off
would accumulate — after an hour the farm would be visibly wrong with nothing
in the code to point at. Each is asserted at its endpoint rather than trusted.

**Two colours are reserved and used once each:** Reward Gold for the coin burst
and coin numbers (the currency accent, `STYLE_LOCK.md` R-09), and Leaf Highlight
for the growth sparkle.
