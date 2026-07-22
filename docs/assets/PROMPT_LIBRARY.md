# PROMPT_LIBRARY

> **Status:** Authoritative for reusable generation prompts. The starting point for every AI-generated asset.
> **Owns:** The reusable prompt templates per asset class, and the shared **style preamble** that embeds the canon into every prompt so a generation request starts inside the style, not outside it.
> **Does not own:** The rules the prompts encode (`STYLE_LOCK.md`); the colour _values_ they cite (`COLOR_PALETTE.md` — this file enumerates them by that file's instruction, `§10`, and must be kept in sync); sizes (`PIXEL_GUIDE.md §2`); the domain canon each prompt draws on (`CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`, the guides); the workflow that uses these prompts (`AI_ASSET_PIPELINE.md`).

**Boundary note.** These prompts are **concept generators, not authorities.** AI pixel-art output rarely satisfies the hard rules on the first pass; the binding gate is the review (`QUALITY_GUIDELINES.md`, `AI_ASSET_PIPELINE.md §5`), not the model. A prompt's job is to get the model close and inside the palette; the human/session cleans up in Aseprite and the review rejects what drifts (`STYLE_LOCK.md`).

**Sync obligation.** This file enumerates palette hexes because `COLOR_PALETTE.md §10` requires prompt updates when the palette changes. `COLOR_PALETTE.md` is the source of truth; if a value here ever disagrees with it, that file wins and this one is corrected.

---

## 1. The shared style preamble

**Prepend this to every prompt.** It encodes the immutable style once, so no per-class prompt re-argues it.

```
Cozy hand-crafted pixel art, flat shading, single warm dark outline.
Top-down view with a slight 3/4 tilt on things that stand up; ground is flat top-down.
One soft light from the upper-left. Hard-edged pixels — no anti-aliasing, no blur, no gradients.
Limited warm palette only (see palette block). 1-pixel outline in #3A3640, never black.
Warm, calm, optimistic mood. Clean readable silhouette. Authored on a 32px grid at 1x.
```

### 1.1 Palette block (paste with the preamble)

Core values (full set and rationale in `COLOR_PALETTE.md`):

```
Outline #3A3640 · Ink Shadow #2A2733 · Soft Ink #4A4557
Grass #5AA34E (shadow #3E7A3C, light #7BC062) · Soil/Wood #6E5236/#96704A/#B58A5E
Water #3E7FA8 (deep #2E5A7A, light #6BB0D0) · Stone #7D7A88 · Parchment #E8E0D4
Straw #E0C260 · Carrot #E68436 · Pumpkin #CE6C22
Reward Gold #F2C24C (reserved: currency/reward) · Rare Violet #9B6FC4 (reserved: rarity/magic)
Danger Red #C8443C (reserved: v1.0 threat only — do not use in v0.1)
Skin: #F0D0A8 / #D8A878 / #B07E50 / #7A5232 (COLOR_PALETTE §3.5)
```

### 1.2 The universal negative prompt (append to every prompt)

```
NEGATIVE: anti-aliasing, blur, soft edges, gradients, drop shadow, glow,
black outline (#000000), variable line weight, isometric/45° perspective,
front-elevation, realistic or 3D rendering, photorealism, high detail,
colours outside the palette, neon, muddy tones, text, watermark, signature.
```

Each `STYLE_LOCK.md` prohibition appears here as a negative (R-01 realism, R-02 AA/blur/gradient, R-03 black outline, R-04 variable weight, R-05 mixed perspective, R-08 off-palette).

---

## 2. Per-class prompts

Each entry = **preamble + palette block + the body below + negative prompt.** Sizes come from `PIXEL_GUIDE.md §2`; the domain canon each cites defines the subject.

### Characters & people

- **Character / worker** (`CHARACTER_BIBLE.md`, 32×48, bottom-center): _"A single {role} villager, cozy farming style, ~1:4 head-to-body proportion, compact stocky build ~40px tall, simple dark-dot eyes, no facial detail, practical earth-toned clothing, 1px outline, feet at bottom-center, clear silhouette, four-direction ready."_ Role dress per `CHARACTER_BIBLE.md §6`.
- **NPC / merchant / villager** (`CHARACTER_BIBLE.md §1, §6`): as character, plus the role tell in silhouette — merchant with satchel/coin-pouch and a single gold-trim garment; villager in everyday palette dress. _Same rig, new costume — never a new body._
- **Monster** (`CHARACTER_BIBLE.md §12`, `WORLD_BIBLE.md §9`, v1.0): _"A gentle-mystery creature of the deep places, non-human but same cozy pixel style, one warm outline, upper-left light, palette-only, more curious than frightening — no gore, no horror."_
- **Boss** (v1.0): as monster, larger canvas, imposing through scale and silhouette only; reserved accents (Rare Violet/Danger Red) permitted here and nowhere routine.

### World & nature

- **Building** (`WORLD_BIBLE.md §2`, size per `PIXEL_GUIDE.md §2`): _"A cozy rustic {building}, timber and thatch and stone, rounded friendly forms, small warm windows, shallow front face + hint of roof, upper-left light, 1px outline, base-aligned."_
- **Tree / foliage** (`WORLD_BIBLE.md §4`, 64×96): _"A soft rounded tree, deep-green canopy from the grass ramp, simple trunk, canopy overhang, gentle stepped shading, 1px outline, no individual leaves."_
- **Flowers / small nature** (32×32): _"A small cluster of {flower}, bright but palette-bound, bold simple shapes, 1px outline, reads at a glance."_
- **Tile** (`GAME_DESIGN.md §2.2`, exactly 32×32, **no outline** — `PIXEL_GUIDE.md §5`): _"A seamless top-down {grass/soil/water/stone/path} tile, flat, tileable edge-to-edge, no outline, subtle within-ramp variation, no strong features that repeat visibly."_

### Objects, icons & UI

- **Weapon** (`ICON_GUIDE.md`, v1.0): _"A single {weapon} icon/sprite, cozy-styled not gritty, clear implement silhouette, 1px outline, palette-only, rarity by border shape not just colour."_
- **Icon** (`ICON_GUIDE.md`, 16×16 or 24×24): _"A single centered {subject} icon, bold silhouette, readable at 16px, 1px outline, one warm accent, no scene, no background."_ Reserved accents keep their meaning (`ICON_GUIDE.md §3`).
- **Portrait** (`CHARACTER_BIBLE.md §4`, 64×64, v0.3): _"A warm character portrait bust of {character}, cozy pixel style, a little more facial detail than the world sprite but still simple, palette-only, upper-left light."_
- **UI element** (`UI_STYLE_GUIDE.md`): _"A cozy parchment UI {panel/button}, warm #E8E0D4 fill, single dark #3A3640 edge, sturdy hand-made feel, flat — no gloss, no gradient, no drop shadow."_ (UI is DOM/React — `ADR-005`; prompts here are for any in-world/decorative UI art only.)

### Audio & animation

- **Music / Sound** (v0.2+): audio prompt templates are owned by the audio docs (`AUDIO_DIRECTION.md`, `MUSIC_LIBRARY.md`, `SFX_LIBRARY.md`, phase-05.5e). Stubbed here so the class exists; the detail lands with those docs. Register: warm, calm, unobtrusive (`VISION.md §2.1`).
- **Animation** (`ANIMATION_GUIDE.md`): prompts generate _frames_, not motion — request a labelled frame set (e.g. _"4-frame walk cycle, side view, consistent silhouette across frames"_). Cadence/loop are authored per `ANIMATION_GUIDE.md`, not by the model.

---

## 3. The seven prompt ingredients (directive checklist)

Every prompt in §2 combines these, so none is forgotten:

| Ingredient          | Source                                                  |
| ------------------- | ------------------------------------------------------- |
| **Style**           | Preamble §1 (flat cozy pixel art, `STYLE_LOCK.md R-01`) |
| **Perspective**     | Preamble (top-down + 3/4 tilt, `ASSETS.md §2`, `R-05`)  |
| **Palette**         | Palette block §1.1 (`COLOR_PALETTE.md`, `R-08`)         |
| **Resolution**      | Per-class size (`PIXEL_GUIDE.md §2`), 1× on the 32 grid |
| **Lighting**        | Preamble (soft upper-left, `PIXEL_GUIDE.md §7`, `R-06`) |
| **Negative prompt** | §1.2 (every `STYLE_LOCK.md` prohibition as a negative)  |
| **Consistency**     | §4 below                                                |

---

## 4. Consistency rules

1. **Always prepend the preamble + palette block + negative prompt** (§1). A prompt without them is not a library prompt.
2. **The model is a concept generator, not the gate** (`AI_ASSET_PIPELINE.md §4, §5`). Assume cleanup; enforce the rules at review, never assume them from output.
3. **Cite the domain canon** for the subject (`CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`, `ICON_GUIDE.md`, …) — the prompt sets the _style_; the domain doc sets the _thing_.
4. **Keep the palette block in sync** with `COLOR_PALETTE.md` (`§10`). A palette change updates this file and `STYLE_LOCK.md` in the same commit.
5. **Reserved accents stay reserved in prompts too** — never prompt Reward Gold, Rare Violet, or Danger Red as decoration (`STYLE_LOCK.md R-09`, `COLOR_PALETTE.md §4, §5`).
6. **Extend, don't bypass.** A new asset class gets a new library entry; sessions do not hand-roll prompts around the library.

---

## 5. Related documents

| Document                                                   | Relationship                                                |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| `STYLE_LOCK.md`                                            | The rules these prompts encode as positives and negatives   |
| `COLOR_PALETTE.md`                                         | The palette values §1.1 enumerates (source of truth, `§10`) |
| `PIXEL_GUIDE.md §2, §7`                                    | Per-class sizes and the light direction                     |
| `AI_ASSET_PIPELINE.md`                                     | The workflow these prompts sit inside (concept → review)    |
| `QUALITY_GUIDELINES.md`                                    | The review that enforces what prompts only request          |
| `CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`                     | The domain subjects prompts describe                        |
| `ICON_GUIDE.md`, `UI_STYLE_GUIDE.md`, `ANIMATION_GUIDE.md` | Class-specific canon                                        |
| Audio docs (05.5e)                                         | Own the music/sound prompt detail stubbed in §2             |
