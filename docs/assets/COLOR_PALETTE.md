# COLOR_PALETTE

> **Status:** Canonical. The single source of truth for every colour in the game's art.
> **Owns:** The named colour ramps, their hex values, season/biome/UI palettes, and the contrast/accessibility rules that govern them.
> **Does not own:** How atlases are packed or how the palette is consumed at build time (`ASSETS.md`), the emotional meaning of colour families in the abstract (`VISUAL_REFERENCE.md`, phase-05.5f), the pixel-art rendering rules that keep colour crisp (`ASSETS.md §8`).

**Every authored asset uses only colours named in this document.** A colour that is not here does not exist. Introducing a new colour is a change to _this file_, reviewed like any other — never an ad-hoc choice made inside a single sprite (`STYLE_LOCK.md` R-07). This is what makes a plugin-contributed crop sit beside a core crop without looking foreign (`ASSETS.md §2`).

`ASSETS.md §2` names this file as the palette authority; it replaced the never-created `assets/src/PALETTE.md`.

---

## 1. Why a locked, limited palette

A limited shared palette is the cheapest possible guarantee of visual cohesion, and the most expensive thing to retrofit. Three reasons it is fixed now, before the second sprite:

1. **Cohesion for free.** Hundreds of future AI-generated assets, authored across a hundred phases, read as one world only if they draw from one set of colours. Harmony is a property of the palette, not of any single artist's taste.
2. **Readability under the overlay constraint.** The game is _glanced at_, not stared at (`VISION.md §1`). Gameplay-critical elements must pop against terrain in a fraction of a second. A disciplined palette with reserved accent colours is what buys that instant read.
3. **Mood.** The identity is cozy, warm, optimistic (`VISION.md §2`). A palette that leans warm and slightly desaturated _is_ that mood, expressed before a single shape is drawn.

The palette is **warm-leaning, medium-saturation, and softly shaded** — never neon, never muddy, never photoreal.

---

## 2. Structural colours (locked hardest)

These are not decorative. They are the skeleton of the art style, and they are the least negotiable colours in the project.

| Name        | Hex       | RGB        | Role                                                         |
| ----------- | --------- | ---------- | ------------------------------------------------------------ |
| **Outline** | `#3A3640` | 58, 54, 64 | The one 1 px outline colour for every entity and object.     |
| Ink Shadow  | `#2A2733` | 42, 39, 51 | Deepest cast shadow; the darkest value permitted anywhere.   |
| Soft Ink    | `#4A4557` | 74, 69, 87 | Interior line work and secondary separation inside a sprite. |

**`#3A3640` is already load-bearing.** Every placeholder sprite in the repo outlines with it (`scripts/generate-placeholder-*.mjs`), and `ASSETS.md §2` mandates a "1 px dark outline on entities and objects." Locking the exact value here makes that mandate concrete. A pure-black (`#000000`) outline is **forbidden** (`STYLE_LOCK.md R-03`) — it reads as harsh and cold and breaks the warm identity.

---

## 3. Primary world ramps

The colours the player sees most. Each ramp is shadow → base → light; author with the **base**, shade toward the ramp's shadow, highlight toward its light. Never introduce an intermediate step outside the ramp.

### 3.1 Grass & foliage — the dominant world colour

| Name           | Hex       | Role                                  |
| -------------- | --------- | ------------------------------------- |
| Grass Shadow   | `#3E7A3C` | Foliage in shade, tile-edge darkening |
| **Grass Base** | `#5AA34E` | Default owned & unowned terrain       |
| Grass Light    | `#7BC062` | Sunlit grass, top faces               |
| Leaf Highlight | `#A5D97E` | Rim light on foliage, new growth      |

### 3.2 Soil & wood — the warm browns

| Name          | Hex       | Role                                            |
| ------------- | --------- | ----------------------------------------------- |
| Soil Dark     | `#5A3A28` | Tilled-soil shadow, deep wood                   |
| Tilled Soil   | `#6E5236` | Tilled ground base (`core:tilled`), roof timber |
| Wood Base     | `#96704A` | Structures, fences, tool handles                |
| Wood Light    | `#B58A5E` | Sunlit planks, worn edges                       |
| Straw / Wheat | `#E0C260` | Ripe grain, thatch, hay                         |

### 3.3 Water & sky — the cool relief

| Name        | Hex       | Role                           |
| ----------- | --------- | ------------------------------ |
| Water Deep  | `#2E5A7A` | Deep water, pond centres       |
| Water Base  | `#3E7FA8` | `core:water` decoration        |
| Water Light | `#6BB0D0` | Shallows, ripples, reflections |
| Sky Tint    | `#A9D8E8` | Distant/ambient cool, glass    |

### 3.4 Stone & neutral

| Name        | Hex       | Role                                   |
| ----------- | --------- | -------------------------------------- |
| Stone Dark  | `#5C5A66` | `core:stone`, rock shadow, metal shade |
| Stone Base  | `#7D7A88` | Rock, cobble, raw metal                |
| Stone Light | `#A6A2B0` | Sunlit stone, polished metal           |
| Parchment   | `#E8E0D4` | Lightest neutral; UI panel base (§6)   |

### 3.5 Character colours — skin, hair, cloth

Characters are drawn from the world's own ramps so a person reads as belonging to the same hand as the fence behind them (`CHARACTER_BIBLE.md` owns _how_ these are used; this table owns the values). The one genuinely new family is **skin**, added here so no session mints a skin tone inside a sprite (`STYLE_LOCK.md R-08`).

**Skin — a small, inclusive, warm set.** Author picks one tone per character and shades base → shadow; never interpolate an intermediate tone. A sunlit rim may tip the topmost pixels toward Parchment `#E8E0D4`; there is no separate highlight hex.

| Name           | Base      | Shadow    |
| -------------- | --------- | --------- |
| Skin I (fair)  | `#F0D0A8` | `#D0A778` |
| Skin II (warm) | `#D8A878` | `#B07E50` |
| Skin III (tan) | `#B07E50` | `#8A5E38` |
| Skin IV (deep) | `#7A5232` | `#5A3A22` |

**Hair and cloth introduce _no new hue_** — they reuse the ramps above. Hair may borrow one accent (Carrot Orange) for red hair only; clothing may carry a single reserved accent as a role signal, never across a whole outfit (`CHARACTER_BIBLE.md`, `STYLE_LOCK.md R-08`).

| Feature                       | Colours (existing ramps)                                 |
| ----------------------------- | -------------------------------------------------------- |
| Hair — dark                   | Ink Shadow `#2A2733`, Soft Ink `#4A4557`                 |
| Hair — brown                  | Soil Dark `#5A3A28`, Wood Base `#96704A`                 |
| Hair — blonde / straw         | Straw `#E0C260`, Wood Light `#B58A5E`                    |
| Hair — red (sparingly)        | Carrot Orange `#E68436` — hair only, never as decoration |
| Hair — grey / white           | Stone Base `#7D7A88`, Stone Light `#A6A2B0`, Parchment   |
| Cloth — earth (workers)       | Wood & Soil ramps, Straw                                 |
| Cloth — cool                  | Water ramp, Sky Tint `#A9D8E8`                           |
| Cloth — leaf                  | Grass ramp                                               |
| Role accent (player/merchant) | one reserved accent (§4), a single garment only          |

---

## 4. Accent colours (reserved — spend them deliberately)

Accents are the readability budget. They are **reserved for meaning** and must never be used as ordinary decoration, or the signal they carry is lost (`STYLE_LOCK.md R-08`).

| Name           | Hex       | Reserved meaning                                             |
| -------------- | --------- | ------------------------------------------------------------ |
| Reward Gold    | `#F2C24C` | Coins, currency, rewards — the "you gained something" colour |
| Gold Highlight | `#FFE08A` | Sparkle/glint on reward and rare items                       |
| Carrot Orange  | `#E68436` | Warm produce; secondary call-to-action                       |
| Pumpkin        | `#CE6C22` | Deep warm produce, autumn                                    |
| Rare Violet    | `#9B6FC4` | Rarity / future magic — never a common object                |
| Rare Light     | `#C9A6E8` | Rare-item rim, enchantment glow (future)                     |
| Danger Red     | `#C8443C` | Threat, error, loss — **v0.1 forbids in-world use** (§5)     |
| Danger Deep    | `#8E2A26` | Danger shadow (future combat/city-defense)                   |

The item placeholders already sample this family — wheat `#E0C260`, carrot `#E68436`, pumpkin `#CE6C22` (`scripts/generate-placeholder-item-building-art.mjs`) — so the reserved accents are consistent with what currently renders.

---

## 5. Danger red is special

`VISION.md §2.2` forbids failure states driven by inattention, and `GAME_DESIGN.md §10.1` forbids a red placement ghost (legality is shown green/amber, never red). Therefore **Danger Red is reserved and unused in v0.1 world art.** It is documented now so that future combat and city-defense content (v1.0) has a canonical threat colour — and so that no one reaches for red to mean "invalid" in the meantime. Using red for routine negative feedback would train players to feel stress, which is the opposite of the product (`STYLE_LOCK.md R-09`).

---

## 6. UI palette

The UI is DOM/React, not Pixi (`ADR-005`), but it shares the world's palette so the overlay reads as one artifact. `UI_STYLE_GUIDE.md` (phase-05.5c) owns UI _appearance_; this table owns the _values_ it draws from.

| Token           | Hex       | Use                                        |
| --------------- | --------- | ------------------------------------------ |
| Panel Base      | `#E8E0D4` | Panel/background fill (Parchment)          |
| Panel Shadow    | `#C9BFAE` | Panel inset, groove, disabled fill         |
| Panel Edge      | `#3A3640` | Panel border (the Outline colour)          |
| Text Primary    | `#3A3640` | Body text on light panels                  |
| Text Muted      | `#6B6577` | Secondary text, counts, hints              |
| Text Inverse    | `#F4EFE6` | Text on dark chips                         |
| Positive        | `#5AA34E` | Gains, confirmations (Grass Base)          |
| Warning / Amber | `#E0A93E` | Caution, "storage nearly full"             |
| Negative        | `#C8443C` | Errors only — never for routine state (§5) |
| Selection       | `#7BC062` | Valid selection/placement tint (green, §5) |

---

## 7. Season palettes (forward-looking, v0.2+)

Seasons are a v0.2 non-goal for v0.1 (`VISION.md §5.2`), documented here so seasonal art in v0.2 does not reinvent them. Each season is a **tint and swap set** layered over the primary ramps, not a replacement palette — the world stays recognisably itself as it turns.

| Season | Grass shifts toward   | Signature accent              | Feeling            |
| ------ | --------------------- | ----------------------------- | ------------------ |
| Spring | `#7BC062` brighter    | Blossom pink `#E8A9C0`        | Fresh, hopeful     |
| Summer | `#5AA34E` saturated   | Sky `#A9D8E8`, gold `#F2C24C` | Warm, abundant     |
| Autumn | `#8A9B3C` golden      | Pumpkin `#CE6C22`             | Cozy, harvest      |
| Winter | `#B7C4CC` desaturated | Ice `#CFE6EE`                 | Still, soft, quiet |

Blossom Pink and Ice are **season-only** additions; they are not part of the base palette and must not appear outside seasonal content.

---

## 8. Biome palettes (forward-looking, v0.4+)

The starting farm is the only biome in v0.1. Future biomes (`WORLD_BIBLE.md`, phase-05.5b) tint the primary ramps rather than introducing unrelated colours, so the world coheres as it expands:

| Biome    | Method                                       | Status       |
| -------- | -------------------------------------------- | ------------ |
| Farm     | The primary ramps as-is                      | v0.1         |
| Forest   | Grass ramp deepened, more Grass Shadow       | v0.4 planned |
| Mine     | Stone + Ink ramps dominant, rare-ore accents | v0.4 planned |
| Lakeside | Water ramp dominant, cool Sky tint           | v0.4 planned |

Biome palettes will be specified in full when the biome ships; the rule fixed now is **tint, don't replace.**

---

## 9. Contrast & accessibility

Readability under the glance loop is an accessibility requirement, not a nicety.

- **Gameplay elements clear terrain by ≥ 3:1 luminance contrast.** A crop, worker, or interactive object must separate from grass/soil at a glance. This is the single most important palette rule for playability.
- **Never rely on hue alone.** ~8% of players have a colour-vision deficiency. Positive/negative state must also differ in **shape, icon, or value** — e.g. a checkmark vs an X, not just green vs amber (`QUALITY_GUIDELINES.md`).
- **UI text meets WCAG AA:** Text Primary `#3A3640` on Panel Base `#E8E0D4` ≈ 9:1 (passes AA for normal text). Text Muted `#6B6577` on Panel Base ≈ 4.7:1 (passes AA). Do not place body text on any fill darker than Panel Shadow.
- **The Outline does the heavy lifting.** The 1 px `#3A3640` outline guarantees every entity separates from any background regardless of hue — which is exactly why it is locked (§2).

---

## 10. Adding or changing a colour

1. It must belong to an existing ramp (extend shadow↔light) or a reserved accent with a _meaning_, not a fourth free-floating hue.
2. Add it to the correct table with hex, role, and rationale.
3. Confirm it clears the §9 contrast rules against grass and soil.
4. Update any doc that enumerates the palette (`STYLE_LOCK.md`, `PROMPT_LIBRARY.md`).
5. A new colour with no stated meaning is rejected in review (`QUALITY_GUIDELINES.md`).

---

## 11. Related documents

| Document                      | Relationship                                             |
| ----------------------------- | -------------------------------------------------------- |
| `ASSETS.md §2`                | Names this file as the palette authority; build pipeline |
| `STYLE_LOCK.md`               | Turns these values into immutable rules                  |
| `PIXEL_GUIDE.md`              | Sizes and outlines that carry these colours              |
| `VISUAL_REFERENCE.md` (05.5f) | The emotional language behind the colour families        |
| `UI_STYLE_GUIDE.md` (05.5c)   | How the UI palette (§6) is applied                       |
| `PROMPT_LIBRARY.md` (05.5d)   | Embeds these hex values into generation prompts          |
