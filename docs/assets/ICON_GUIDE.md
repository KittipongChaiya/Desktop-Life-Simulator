# ICON_GUIDE

> **Status:** Authoritative for icon design. The canon a session obeys when generating any icon — item, resource, tool, or the RPG icon families to come.
> **Owns:** The design standards for icons across every category: readability at size, silhouette, subject framing, outline, colour usage, and the per-category treatment (items, resources, tools, buildings, skills, weapons, armor, food, quest, status, notifications).
> **Does not own:** Icon _sizes_, _formats_, and _atlas home_ (`ASSETS.md §3`, `PIXEL_GUIDE.md §2`); icon _file names_ (`NAMING_CONVENTION.md`); which atlas an icon packs into (`FOLDER_STRUCTURE.md`, `ASSETS.md §4`); how icons are _placed_ in the interface (`UI_STYLE_GUIDE.md`); the immutable rules every icon obeys (`STYLE_LOCK.md`); colour _values_ (`COLOR_PALETTE.md`).

**Boundary note.** `ASSETS.md §3` fixes the sizes (**16 × 16** small, **24 × 24** large) and destinations (the `ui-world` atlas, or a DOM `<img>`); `NAMING_CONVENTION.md` fixes the file names (`item_<name>.png`, `icon_<category>_<name>.png`); `PIXEL_GUIDE.md §2` lists the icon canvases. This file owns only what those cannot: **how an icon is drawn so it reads instantly and belongs to the world.**

An icon's whole job is to be understood in a fraction of a second at a tiny size — the glance loop, concentrated (`VISION.md §3.1`, `ART_DIRECTION.md §1`). Every rule here serves that.

---

## 1. The size problem governs everything

An item/resource icon is often **16 × 16** (`ASSETS.md §3`). At that size there is room for _one idea_ and almost no detail.

- **One subject, centred.** An icon shows a single object, centred on the canvas with a 1 px safe margin (`PIXEL_GUIDE.md §4`). No scenes, no pairs, no background.
- **Silhouette first.** The shape must be recognisable in pure black before any interior colour — exactly the character-silhouette test (`CHARACTER_BIBLE.md §3`) applied to objects. If two icons share a silhouette, differentiate the shape, not just the colour (`STYLE_LOCK.md R-14`).
- **Detail that survives 16 px only.** Anything below ~2 px is noise at icon scale (`STYLE_LOCK.md R-16`). Larger 24 × 24 icons (toolbar/skill) may carry a little more, but never so much that they stop reading at a glance.
- **Bold, simple forms.** Exaggerate the defining feature (a carrot's taper, a coin's disc) rather than drawing it accurately.

---

## 2. The shared icon rules

Every icon, every category, obeys these — they are what make a hundred independently-authored icons look like one set:

| Rule          | Value                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------- |
| Outline       | Full 1 px `#3A3640` around the subject (`PIXEL_GUIDE.md §5`, `STYLE_LOCK.md R-04`)          |
| Palette       | Only `COLOR_PALETTE.md` colours; reserved accents keep their meaning (§3, `R-08/R-09`)      |
| Light         | One upper-left light, same as everything (`PIXEL_GUIDE.md §7`, `STYLE_LOCK.md R-06`)        |
| Perspective   | A simple, near-front icon read — clarity over the world's 3/4 tilt when it helps legibility |
| Alpha         | Hard-edged silhouette, no soft alpha (`STYLE_LOCK.md R-02`, `PIXEL_GUIDE.md §4`)            |
| Visual weight | Consistent across a family — icons in one row look equally heavy, not some tiny some huge   |

---

## 3. Colour carries meaning, sparingly

The reserved accents (`COLOR_PALETTE.md §4`) do their clearest work in icons — but only if they stay reserved (`STYLE_LOCK.md R-09`):

- **Reward Gold** — coins, currency, and reward icons. The "you gained something" colour; never a decorative choice.
- **Rare Violet** — rarity borders and future magic/enchantment icons; never a common item.
- **Warm produce** — Carrot Orange / Pumpkin / Straw for crops and food, matching the shipped produce placeholders (`COLOR_PALETTE.md §4`).
- **Danger Red** — reserved for genuine error/threat icons only, and unused in routine v0.1 UI (`COLOR_PALETTE.md §5`, `GAME_DESIGN.md §10.1` rule 6).

Rarity, quality, or state shown by colour must **also** be shown by shape/border/symbol — never hue alone (`STYLE_LOCK.md R-14`, `COLOR_PALETTE.md §9`).

---

## 4. Category standards

Sizes and names per `ASSETS.md §3` and `NAMING_CONVENTION.md`; this table owns the _design_ intent. Categories marked _future_ are documented now so the RPG UI arrives into an established system, not a blank one.

| Category            | Status | Design intent                                                                                                                                                                                          |
| ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Item / resource** | v0.1   | Single produce/material, 16 × 16, warm accent, bold silhouette. Files `item_<name>.png` (`NAMING_CONVENTION.md`), packed in `ui-world` (`FOLDER_STRUCTURE.md`). Matches shipped `item_*` placeholders. |
| **Tool**            | v0.1   | Hoe, watering can, hand — the toolbar set (`GAME_DESIGN.md §8`). Readable as an implement in silhouette; the same tool the character holds (`CHARACTER_BIBLE.md §7`), simplified to an icon.           |
| **Building**        | v0.1+  | A tiny front-face of the structure (shed, shop) as a menu/buy icon — the building's silhouette, not a full sprite. Reads as "the thing you place."                                                     |
| **Food**            | v0.2+  | Prepared/edible produce; warm, appetising, drawn from the produce accents. Distinct silhouette from the raw crop item.                                                                                 |
| **Skill**           | v1.0   | RPG skills — 24 × 24 (`ASSETS.md §3`), a single clear emblem per skill; a consistent family look.                                                                                                      |
| **Weapon**          | v1.0   | Combat gear; still cozy-styled, never gritty. One-line silhouette per weapon type.                                                                                                                     |
| **Armor**           | v1.0   | As weapons; a garment/plate silhouette. Reserved accents for rarity, not for decoration.                                                                                                               |
| **Quest**           | v0.3+  | A marker/scroll emblem; a single recognisable "there is something here" shape, paired with position, not colour alone.                                                                                 |
| **Status**          | v0.2+  | Small state emblems (rested, watered, growing). Each pairs a shape with its colour (`STYLE_LOCK.md R-14`); warm, never alarming (`VISION.md §2.2`).                                                    |
| **Notification**    | v0.1+  | Inline-toast glyphs (`UI_STYLE_GUIDE.md §5`): a positive tick, a caution mark. Never a red alarm for routine events (`GAME_DESIGN.md §10.1` rule 6).                                                   |

---

## 5. Icons vs sprites

An icon is **not** a shrunk sprite. A world sprite is drawn for its place in the scene (3/4 tilt, contact shadow, animation); an icon is drawn for instant symbolic reading at a fixed tiny size. The same crop has a growth-stage _sprite_ (`GAME_DESIGN.md §3.3`, world) and an inventory _icon_ (`item_<name>.png`, UI) — related in style, authored separately for their jobs. When in doubt, an icon favours the clearer read over scene-accuracy.

---

## 6. Consistency rules

1. **One subject, centred, silhouette-first** (§1) — every icon, every category.
2. **The shared rules are non-negotiable** (§2): 1 px `#3A3640` outline, palette-only colour, upper-left light, hard alpha.
3. **Reserved accents stay reserved** (§3): gold = reward, violet = rare, red = genuine error only.
4. **State/rarity is never hue-alone** (`STYLE_LOCK.md R-14`).
5. **A family looks like a family:** icons in one category share visual weight and treatment.
6. **Sizes, names, atlas, and placement are owned elsewhere** — this file never restates them, it cites `ASSETS.md §3`, `NAMING_CONVENTION.md`, `FOLDER_STRUCTURE.md`, `UI_STYLE_GUIDE.md`.

---

## 7. Related documents

| Document                               | Relationship                                                |
| -------------------------------------- | ----------------------------------------------------------- |
| `ASSETS.md §3, §4`                     | Icon sizes/formats and the `ui-world` atlas home            |
| `PIXEL_GUIDE.md §2, §4, §5`            | Icon canvases, safe margin, and the outline rule            |
| `NAMING_CONVENTION.md`                 | `item_<name>.png` / `icon_<category>_<name>.png` file names |
| `FOLDER_STRUCTURE.md`                  | Which atlas group an icon packs into                        |
| `COLOR_PALETTE.md §4, §9`              | The reserved accents icons spend, and contrast rules        |
| `STYLE_LOCK.md R-04, R-09, R-14, R-16` | Outline, reserved accents, no-hue-alone, readability        |
| `UI_STYLE_GUIDE.md`                    | How icons are placed in the toolbar, inventory, and HUD     |
| `CHARACTER_BIBLE.md §7`                | The held tools that tool icons mirror                       |
