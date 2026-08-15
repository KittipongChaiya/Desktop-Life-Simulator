# WORLD_BIBLE

> **Status:** Authoritative for what the world looks like and how it is put together, physically and visually. The canon a session obeys when generating any place, biome, structure, or natural object.
> **Owns:** The world's visual and physical canon — world philosophy (as a _place_), architecture, regions, biomes, the look of village/farm/forest/mine/lake/mountain/dungeon, natural resources and flora/fauna style, the _visual_ treatment of weather and seasons, technology level, transportation, and future expansion zones.
> **Does not own:** World _mechanics_ — tile grid, tile kinds, crop tables, land expansion (`GAME_DESIGN.md §2, §3, §6.3`); the world's _history and meaning_ (`LORE_BIBLE.md`); colour _values_, including biome and season palettes (`COLOR_PALETTE.md §7, §8`); the product horizon that schedules biomes (`VISION.md §4`, `PLAN.md`); render layers (`ARCHITECTURE.md §5`).

**Boundary note.** Three neighbours divide this space cleanly. `GAME_DESIGN.md` owns the world as a _system_ (an 80 × 64 grid of typed tiles — farm west, village east since v0.3, ADR-030). `LORE_BIBLE.md` owns the world as a _story_ (its history, why the villages are here). This file owns the world as a _picture_ — so that every future asset, from a fence post to a dungeon door, looks like it grew in the same soil. Where a look here would contradict a mechanic in `GAME_DESIGN.md`, the mechanic wins.

The goal, in one line from directive B: **every future asset must belong naturally inside this world.** This document is the test of belonging.

---

## 1. World philosophy — a tended little valley

The world is a **small, warm, hand-kept place at the edge of a gentle wilderness.** It is not an epic continent and not a machine; it is somewhere someone cares for (`ART_DIRECTION.md §8`). The visual thesis follows the product thesis (`VISION.md §1`): a world you glance at should read, instantly and always, as _cozy, safe, and quietly alive_.

Three physical commitments express that:

1. **Tended at the centre, wilder at the edges.** The owned plot looks cared-for; the world beyond it is softer, greener, less ordered. The visual contrast between kept and unkept land _is_ the story of the player's progress (`ART_DIRECTION.md §9`).
2. **Nothing threatens home.** The farm and village are a place of safety by construction. Danger, when the roadmap eventually adds it (v1.0), lives _out there_ — in old ruins and deep places — never on the doorstep (`VISION.md §2.2`). The world's geography encodes that: home is the calm centre; adventure is the far edge.
3. **One physical scale.** Everything is built on the 32 px grid at one density (`ASSETS.md §2`, `STYLE_LOCK.md R-15`), so a barn, a boulder, and a mushroom all feel like they belong to one world of one size.

---

## 2. Architecture — cozy vernacular

Buildings are **rustic, hand-built, and warm** — timber, thatch, stone, and daub, the architecture of a pre-industrial farming people (§10).

- **Materials from the palette's browns and neutrals:** Wood ramp walls and beams, Tilled-Soil/Straw thatch, Stone ramp foundations and chimneys (`COLOR_PALETTE.md §3.2, §3.4`).
- **Rounded, friendly forms.** Roofs are steep and soft-cornered; no hard, cold, or brutalist geometry. Doors and windows are small, warm rectangles with a hint of light within (Sky Tint glass).
- **The one perspective.** Buildings show a shallow front face and a hint of roof-top, lit from the upper-left, never a true elevation or isometric (`PIXEL_GUIDE.md §6`, `STYLE_LOCK.md R-05`). Base-aligned, extending upward from the footprint (`PIXEL_GUIDE.md §3`).
- **Wear tells history.** A patched roof, a worn threshold, a leaning fence read "lived-in" (`ART_DIRECTION.md §9`) — the hand-crafted warmth of the identity, in the buildings themselves.
- **Scale ladder** is set by `PIXEL_GUIDE.md §2` (small 32² shed → medium 64² shop → large 96² barn/hall). This file owns their _look_; that file owns their _size_.

Building _kinds_ arrive with their phases — the storage shed exists (phase-05); the shop, market, and workshop come with phase-06's economy. Each new structure must pass the one-line test against the shed (`STYLE_LOCK.md`).

---

## 3. Regions & biomes

The world is one continuous valley that changes character as it moves outward from home. Biomes are **tints and content sets over the shared ramps, never rival palettes** (`COLOR_PALETTE.md §8`, `STYLE_LOCK.md R-08`) — the valley stays recognisably itself as it varies.

| Region              | Status      | Visual character                                                   | Palette method (`COLOR_PALETTE.md §8`)    |
| ------------------- | ----------- | ------------------------------------------------------------------ | ----------------------------------------- |
| **Farm**            | v0.1        | The tended centre: grass, tilled rows, crops, fences, the farmyard | Primary ramps as-is                       |
| **Village**         | v0.3 (town) | Clustered cozy buildings, paths, a well, market stalls, gardens    | Primary ramps; warm accents               |
| **Forest**          | v0.4        | Denser trees, dappled shade, mushrooms, foraging                   | Grass ramp deepened, more Grass Shadow    |
| **Lake / lakeside** | v0.4        | Open water, reeds, a jetty, cool light                             | Water ramp dominant, cool Sky Tint        |
| **Mountains**       | v0.4        | Rising Stone forms, sparse hardy foliage, the way to the mine      | Stone + Ink ramps, sparse Grass           |
| **Mine**            | v0.4        | Rock walls, ore veins, timber supports, lantern-lit interior       | Stone + Ink dominant, rare-ore accents    |
| **Dungeon**         | v1.0        | Deep, old, made-not-grown; the one place allowed a hint of unease  | Ink/Stone dominant; reserved accents (§9) |

The farm is the only biome authored in v0.1; the rest are **designed for, not built** (`VISION.md §4.2`, `GAME_DESIGN.md §11`). They are fixed here so that when a biome ships, its art extends the valley rather than reinventing it.

### 3.1 Farm style (v0.1, the only built biome)

The farm is grass and soil: `core:grass` default terrain, `core:tilled` planting rows, `core:water` and `core:stone` as decoration, `core:path` for worker routes (`GAME_DESIGN.md §2.2` owns these kinds; this owns their look). Visually: neat tilled rows against soft grass, simple wood fences marking the owned plot, crops growing upward in four legible stages (`GAME_DESIGN.md §3.3`), the storage shed and farmyard at the centre. Tilled soil is a warm Tilled-Soil brown; the boundary between owned (kept) and unowned (wilder) land is visible at a glance.

### 3.2 The wild places (forest, mountain, mine, dungeon)

These share a rule: **the further from home, the older and quieter — never the more hostile-looking, until v1.0.** A v0.4 forest or mine is an inviting place to explore and gather, not a threat. Only the v1.0 dungeon is permitted a hint of unease, and even there the mood is _mystery_, not horror (`LORE_BIBLE.md` sets the fiction; this sets the look).

---

## 4. Natural resources, plants & animals

- **Plants:** crops (`GAME_DESIGN.md §3` owns the table; this owns their look — four clear growth stages, upward growth, produce coloured from the warm accents: wheat Straw, carrot Carrot-Orange, pumpkin Pumpkin — matching the shipped placeholders, `COLOR_PALETTE.md §4`). Wild flora — trees (`PIXEL_GUIDE.md §2`: 64 × 96, canopy overhangs), bushes, flowers, mushrooms, reeds — decorate biomes and, later, are foraged.
- **Animals:** farm animals arrive v0.2+ (`PIXEL_GUIDE.md §2` sizes chickens/cows). They share the cozy register — rounded, friendly, calm — and the one rig-per-creature discipline of `CHARACTER_BIBLE.md §12`.
- **Natural resources:** wood (trees), stone and ore (mountains/mine, v0.4), water (the lake). Their look is set by their ramp — Wood, Stone, Water, with rare-ore accents reserved for the mine.

Every natural object obeys the same line and light as a building, so a boulder beside a barn reads as one world (`STYLE_LOCK.md R-04, R-06`).

---

## 5. Weather & seasons (visual treatment)

Weather, seasons, and day/night are v0.2 features (`VISION.md §5.2`); their _mechanics_ are not built in v0.1. This file owns their eventual _look_; the _palette shifts_ are owned by `COLOR_PALETTE.md §7`.

- **Seasons** re-tint the valley without replacing it (`COLOR_PALETTE.md §7`): spring fresh, summer abundant, autumn golden, winter still and soft. The world stays recognisably the same place through the turn.
- **Weather** is gentle: soft rain (which auto-waters — the one mechanic hook, `GAME_DESIGN.md §11`), light snow, drifting cloud shadow. No violent storms in the cozy register; dramatic weather, if ever, belongs to the wild edges.
- **Day/night** is a warm afternoon by default, easing to a soft dusk — lit through render layer 5 when it ships (`ARCHITECTURE.md §5` owns the layer). Never a harsh night; the world stays legible and safe-feeling at all hours.

These are documented now so v0.2 seasonal/weather art extends the established look instead of inventing a second one.

---

## 6. Technology level

**Pre-industrial, cozy-agrarian.** Hand tools, timber and stone building, animal husbandry, a market economy of coins and goods (`GAME_DESIGN.md §6`). Explicitly **absent:** guns, engines, electricity, modern materials, visible high fantasy in the everyday world. This keeps the farm honest and bounds every future asset — a session generating a tool generates a hoe or a scythe, not a machine. Any "advanced" future system (the v0.4 factory) is read as clever hand-built craft — waterwheels, gears, timber contraptions — not industrial technology.

---

## 7. Transportation

On foot is the rule. Workers and villagers walk (`GAME_DESIGN.md §4.3` timings); `core:path` tiles speed movement and read visually as worn trails (`GAME_DESIGN.md §2.2`). Goods move by hand and simple cart/wheelbarrow (the carrying/deposit loop, `GAME_DESIGN.md §4.6`). Future reach (v0.4 world map, expeditions) is by foot, cart, and small boat on the lake — never mechanised vehicles (§6).

---

## 8. Magic (reserved, future)

The everyday world shows **no overt magic.** The valley is warm and natural; wonder is quiet (the fiction is owned by `LORE_BIBLE.md`). Magic is reserved for future RPG content (v1.0), and its visual signature is pre-allocated: **Rare Violet** and its glow (`COLOR_PALETTE.md §4`), used never for a common object. When magic arrives it will read as gentle enchantment and old mystery — a soft violet shimmer on an ancient thing — not spectacle. Reserving the colour now means future magic arrives into a palette that anticipated it (`ART_DIRECTION.md §11`).

---

## 9. The look of unease (v1.0 dungeons only)

The one place the cozy rule bends. Dungeons and deep ruins may feel _old and uncertain_ — Ink/Stone-dominant, low warm light, the occasional reserved accent (Rare Violet for the mysterious, Danger Red for genuine v1.0 threat, `COLOR_PALETTE.md §4, §5`). Even here the ceiling is **mystery, not horror** — no gore, no cheap shock; the game never betrays its warm identity, only deepens it. This is reserved and specified when dungeons are designed; it is fixed here only so the boundary is explicit: unease is a far-edge, late-game exception, never the world's default.

---

## 10. Future expansion zones

The valley is built to grow outward, in the roadmap's order (`VISION.md §4`, `GAME_DESIGN.md §11`), each zone extending the last:

| Zone             | Ships | Extends                                            |
| ---------------- | ----- | -------------------------------------------------- |
| Village / town   | v0.3  | Cozy architecture (§2) clustered into a settlement |
| Forest & lake    | v0.4  | The wild edge, for foraging and gathering          |
| Mountains & mine | v0.4  | The vertical, stone frontier and its resources     |
| World map        | v0.4  | The valley set within a wider region to explore    |
| Ruins & dungeons | v1.0  | The old, deep places — the one home of unease (§9) |

Because the grid is already 64 × the starting plot (`GAME_DESIGN.md §2.1`), these zones extend the existing world rather than requiring a new one. Each is fixed in _look_ here so its art, whenever authored, sits beside the first farm as though one hand made both (`ART_DIRECTION.md §11`).

---

## 11. Consistency rules

Binding on every future session generating a place or natural object:

1. **Extend the valley, never replace it.** New biomes tint the shared ramps (`COLOR_PALETTE.md §8`); they never introduce a rival palette (`STYLE_LOCK.md R-08`).
2. **One line, one light, one perspective** across every structure and natural object (`STYLE_LOCK.md R-04, R-05, R-06`).
3. **Home is safe by construction.** The farm and village never look threatening; unease is a v1.0 far-edge exception only (§9), and never driven by player inattention (`VISION.md §2.2`).
4. **Technology stays pre-industrial** (§6). No machines, guns, or electricity in the everyday world.
5. **Mechanics and lore win.** If this file conflicts with `GAME_DESIGN.md §2–3` (the grid/tiles/crops) or `LORE_BIBLE.md` (history/meaning), those own their domains and this file is corrected.
6. **The belonging test.** Before shipping any environmental asset, ask: _does this look like it grew in the same valley as the storage shed?_ If not, a rule above is being broken (`STYLE_LOCK.md`, the one-line test).

---

## 12. Related documents

| Document                           | Relationship                                                     |
| ---------------------------------- | ---------------------------------------------------------------- |
| `GAME_DESIGN.md §2, §3, §6.3, §11` | The world's mechanics — grid, tiles, crops, expansion, hooks     |
| `LORE_BIBLE.md`                    | The world's history and meaning                                  |
| `COLOR_PALETTE.md §7, §8`          | Season and biome palette _values_ this file's looks use          |
| `ART_DIRECTION.md §8, §9, §11`     | World atmosphere, environmental storytelling, scalability        |
| `STYLE_LOCK.md`                    | The immutable rules every place obeys                            |
| `PIXEL_GUIDE.md §2, §3, §6`        | Building/tree/tile sizes, pivots, and perspective                |
| `ARCHITECTURE.md §5`               | Render layer order (lighting/effects layers seasons/weather use) |
| `CHARACTER_BIBLE.md`               | The people who must look native to this world                    |
