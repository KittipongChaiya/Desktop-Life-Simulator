# ASSET_CATALOG

> **Status:** Authoritative for the asset production _backlog_ — the human plan of what art needs to exist, at what priority, for which phase.
> **Owns:** The catalog of every asset class with its priority, production phase, rough estimate, dependencies, and status.
> **Does not own:** The **generated** `manifest.ts` (`ASSETS.md §5` — that is machine-emitted typed keys, not a plan); sizes (`PIXEL_GUIDE.md §2`); names (`ASSETS.md §6`); atlas homes (`ASSETS.md §4`, `FOLDER_STRUCTURE.md`); the workflow that produces the assets (`AI_ASSET_PIPELINE.md`).

**Not the manifest.** The directive named this `ASSET_MANIFEST.md`; it is deliberately renamed **`ASSET_CATALOG.md`** to avoid colliding with the generated `assets/dist/manifest.ts` (`ASSETS.md §5`), which is a different thing entirely:

|          | `manifest.ts` (`ASSETS.md §5`)            | `ASSET_CATALOG.md` (this file)        |
| -------- | ----------------------------------------- | ------------------------------------- |
| Nature   | Machine-generated, do-not-edit            | Human-authored plan                   |
| Contains | Typed keys for assets that **exist**      | A backlog of assets **needed**        |
| Answers  | "How do I reference this sprite in code?" | "What art is left to make, and when?" |

**No dates** (`PLAN.md` preamble). This is a prioritised backlog, not a schedule. An item is done when its art passes review and enters `assets/src/` (`AI_ASSET_PIPELINE.md`).

---

## 1. How to read the catalog

- **Priority** — `P0` needed now (replace a shipping placeholder, or feed the next phase); `P1` next living-world wave (v0.2); `P2` town/exploration (v0.3–v0.4); `P3` endgame (v1.0).
- **Phase** — the roadmap tier the asset first ships in (`VISION.md §4`, `PLAN.md`).
- **Est** — rough size, not hours: **S** = 1–3 sprites, **M** = a small set/one family, **L** = a large family or many frames.
- **Status** — `placeholder` (exists as programmer art, needs production replacement — `ASSETS.md §7.3`), `needed` (not yet made), `partial` (some exist).

Sizes/names/atlas for every row are owned elsewhere and cited once here: `PIXEL_GUIDE.md §2`, `ASSETS.md §6`, `FOLDER_STRUCTURE.md`.

---

## 2. v0.1 — current backlog (replace placeholders)

The art the shipping game already references as placeholders, plus the small gaps. **These are the P0 that make v0.1 look finished.**

| Class              | Class detail                                                         | Priority | Phase | Est | Status      | Depends on                                 |
| ------------------ | -------------------------------------------------------------------- | -------- | ----- | --- | ----------- | ------------------------------------------ |
| Tiles              | grass, tilled, water, stone, path (`GAME_DESIGN.md §2.2`)            | P0       | v0.1  | M   | partial     | —                                          |
| Crops              | turnip/wheat/carrot/pumpkin × 4 stages (`GAME_DESIGN.md §3.1, §3.3`) | P0       | v0.1  | L   | partial     | tile grid                                  |
| Character (worker) | 4-dir idle + 4-frame walk (`CHARACTER_BIBLE.md`)                     | P0       | v0.1  | L   | placeholder | `CHARACTER_BIBLE.md`, `ANIMATION_GUIDE.md` |
| Character actions  | till/plant/water/harvest one-shots                                   | P1       | v0.1  | M   | needed      | worker rig, `ANIMATION_GUIDE.md`           |
| Buildings          | storage shed (`GAME_DESIGN.md §5`)                                   | P0       | v0.1  | S   | placeholder | `WORLD_BIBLE.md §2`                        |
| Items              | produce + seed icons `item_<name>.png` (`ICON_GUIDE.md`)             | P0       | v0.1  | M   | placeholder | `ICON_GUIDE.md`                            |
| Icons (tools)      | hoe / seed / hand toolbar icons (`GAME_DESIGN.md §8`)                | P0       | v0.1  | S   | needed      | `ICON_GUIDE.md`, `UI_STYLE_GUIDE.md`       |
| UI (world)         | selection, hover, build ghost (`ui-world` atlas)                     | P0       | v0.1  | S   | partial     | `UI_STYLE_GUIDE.md`                        |

### 2.1 v0.4 — the factories (phase-25)

| Class     | Class detail                                         | Priority | Phase | Est | Status      | Depends on                      |
| --------- | ---------------------------------------------------- | -------- | ----- | --- | ----------- | ------------------------------- |
| Buildings | `mill.png` — the flour factory (ADR-035)             | P0       | v0.4  | S   | placeholder | `WORLD_BIBLE.md §2`, style lock |
| Buildings | `kitchen.png` — the bread factory (ADR-035)          | P0       | v0.4  | S   | placeholder | `WORLD_BIBLE.md §2`, style lock |
| Items     | `item_flour.png`, `item_bread.png` (`ICON_GUIDE.md`) | P0       | v0.4  | S   | needed      | `ICON_GUIDE.md`                 |

**Both buildings currently render a stand-in from the shipped atlas** — the mill draws `storage_shed`, the kitchen draws `cottage` — and the substitution is marked at the definitions in `src/sim/content/buildings.ts`. It is deliberate rather than sloppy: `textureFor` resolves an unknown sprite key to `Texture.EMPTY`, so naming art that does not exist ships a building that is **silently invisible in the running game**, with nothing anywhere to say why. A wrong-looking building is a bug a player reports; an invisible one is a bug nobody can describe.

The item icons have no stand-in and need none — the HUD's item rows degrade to a blank icon slot, which is legible rather than misleading.

**What the phase-25 live pass showed, and it raises the priority.** Both factories appear in the shop at the right prices with working Build buttons, and both draw on the map — so the stand-in decision does its job. But side by side on the plot, `storage_shed` and `cottage` are **near-indistinguishable at gameplay scale**: a player cannot tell which building is the mill and which is the kitchen without clicking one. That is a usability defect the stand-ins cause and the real art fixes, and it is the reason these rows are P0 rather than something to sweep up at the RC.

**A regression gate now exists for the invisible-building case**: `tests/sprite-keys.test.ts` asserts that every declared building, crop-stage and tile sprite key resolves to a real frame in the atlas, resolving keys exactly the way `world-view.ts` does. It reproduces the phase-25 mistake on demand. What it deliberately does **not** check is whether the art is the RIGHT art — a stand-in resolves perfectly well, which is why the catalog rows above, not the test, are what tracks them.

**These are blocking items on the `PLAN.md` §8 "no placeholders" release gate**, and the gate is what must catch them before v0.4 ships. Flip these rows and delete the stand-ins in the same commit as the art (§Rules 3).

---

## 3. Phase-06 — the next production wave

**This wave is the reason phase-05.5 exists before phase-06.** The economy phase introduces the first large batch of _new_ art; the style must be locked before it is generated (`phases/phase-05.5-asset-foundation.md`).

| Class     | Class detail                                         | Priority | Phase | Est | Status | Depends on                           |
| --------- | ---------------------------------------------------- | -------- | ----- | --- | ------ | ------------------------------------ |
| Buildings | shop, market stall (`GAME_DESIGN.md §1.1, §5`)       | P0       | 06    | M   | needed | `WORLD_BIBLE.md §2`                  |
| Icons     | coin / currency (Reward Gold, `COLOR_PALETTE.md §4`) | P0       | 06    | S   | needed | `ICON_GUIDE.md §3`                   |
| Icons     | building-buy & upgrade icons                         | P0       | 06    | M   | needed | `ICON_GUIDE.md`, `UI_STYLE_GUIDE.md` |
| Tiles     | land-expansion edge/ring art (`GAME_DESIGN.md §6.3`) | P1       | 06    | S   | needed | tile family                          |
| UI        | shop / land-expansion panel chrome                   | P1       | 06    | S   | needed | `UI_STYLE_GUIDE.md`                  |

---

## 4. Future — forward-looking backlog (v0.2+)

Documented now so each future phase draws from an existing plan rather than inventing one (`GAME_DESIGN.md §11`, `VISION.md §4.2`). Sizes/atlas per the cited docs.

| Class             | Priority | Phase | Est | Notes                                                                                                    |
| ----------------- | -------- | ----- | --- | -------------------------------------------------------------------------------------------------------- |
| Animals           | P1       | v0.2+ | M   | chicken (32×32), cow (64×48) — `PIXEL_GUIDE.md §2`, `CHARACTER_BIBLE.md §12`                             |
| Particles         | P1       | v0.2  | M   | growth/harvest sparkle, deposit puff — `effects` atlas (`ASSETS.md §4`)                                  |
| Effects / weather | P1       | v0.2  | M   | rain, snow, cloud shadow — effects layer (`ARCHITECTURE.md §5`, `ANIMATION_GUIDE.md`)                    |
| Nature            | P1       | v0.2+ | M   | trees, bushes, flowers, mushrooms, reeds — `WORLD_BIBLE.md §4`                                           |
| Fonts             | P1       | v0.2  | S   | in-world bitmap font atlas — `ASSETS.md §3` (UI text is DOM/CSS, `ADR-005`)                              |
| Portraits         | P2       | v0.3  | L   | NPC/merchant dialogue busts (64×64) — `CHARACTER_BIBLE.md §4`                                            |
| NPC               | P2       | v0.3  | L   | villagers, merchant — shared rig, varied costume (`CHARACTER_BIBLE.md §1`)                               |
| Furniture         | P2       | v0.3+ | M   | town/interior props — `WORLD_BIBLE.md §2`                                                                |
| Resources         | P2       | v0.4  | M   | wood, stone, ore icons & world nodes — `WORLD_BIBLE.md §4`                                               |
| Monsters          | P3       | v1.0  | L   | own rig, gentle-mystery register — `CHARACTER_BIBLE.md §12`, `WORLD_BIBLE.md §9`                         |
| Bosses            | P3       | v1.0  | L   | set-piece silhouettes, larger canvas — `CHARACTER_BIBLE.md §12`                                          |
| Weapons           | P3       | v1.0  | M   | combat gear, cozy-styled — `ICON_GUIDE.md §4`                                                            |
| Armor             | P3       | v1.0  | M   | garment/plate silhouettes — `ICON_GUIDE.md §4`                                                           |
| Icons (RPG)       | P3       | v1.0  | L   | skill, quest, status families — `ICON_GUIDE.md §4`                                                       |
| Animations        | —        | all   | —   | not a class but a property — per-action frames live with each animated class (`ANIMATION_GUIDE.md`)      |
| Audio             | P1       | v0.2  | L   | music & SFX — owned by the audio catalog (`MUSIC_LIBRARY.md`, `SFX_LIBRARY.md`, 05.5e), not counted here |

---

## 5. Consistency & maintenance rules

1. **This is a plan, not a manifest.** Never confuse it with the generated `manifest.ts` (`ASSETS.md §5`); this file is edited by hand, that file is never edited at all.
2. **Every row cites its owners** — size (`PIXEL_GUIDE.md §2`), name (`ASSETS.md §6`), atlas (`FOLDER_STRUCTURE.md`), domain doc — and never restates them.
3. **Update status on entry.** When an asset passes review and lands in `assets/src/` (`AI_ASSET_PIPELINE.md`), flip its row from `placeholder`/`needed` to done in the same commit as the art.
4. **Priority follows the roadmap.** P0 is "this phase or a shipping placeholder"; scope never moves earlier than `VISION.md §4.2` allows.
5. **New need → new row.** A newly discovered asset need is added here first, then produced — the backlog leads production.

---

## 6. Related documents

| Document                                                | Relationship                                              |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `ASSETS.md §5`                                          | The generated `manifest.ts` this catalog is **not**       |
| `AI_ASSET_PIPELINE.md`                                  | The workflow that turns a catalog row into a source asset |
| `PIXEL_GUIDE.md §2`                                     | Sizes for every class                                     |
| `ASSETS.md §4, §6`                                      | Atlas groups and file names                               |
| `FOLDER_STRUCTURE.md`                                   | Which atlas a class packs into                            |
| `GAME_DESIGN.md §2, §3, §5, §11`                        | The mechanics that define what v0.1 and future art serves |
| `VISION.md §4`                                          | The roadmap tiers the Phase column follows                |
| `CHARACTER_BIBLE.md`, `WORLD_BIBLE.md`, `ICON_GUIDE.md` | The domain canon each class obeys                         |
