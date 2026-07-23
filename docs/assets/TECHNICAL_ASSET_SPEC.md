# TECHNICAL_ASSET_SPEC

> **Status:** ROUTER. The one-hop index from any technical asset question to its single authoritative owner.
> **Owns:** **Only** the asset-metadata schema (§3) — the generation-provenance record `AI_ASSET_PIPELINE.md §7` assigns here — and the routing table itself.
> **Does not own:** Everything the routing table points at. Pipeline, formats, atlases, naming, animation format, validation (`ASSETS.md`); why the pipeline is build-time (`ADR-006`); budgets (`PERFORMANCE.md`); render layers (`ARCHITECTURE.md §5`); sizes and pivots (`PIXEL_GUIDE.md`); the creative workflow (`AI_ASSET_PIPELINE.md`).

**Why a router and not a spec.** The directive behind this file asked for "the complete technical specification for every future asset." That specification **already exists** — distributed across owners that are enforced by the build and by tests. Rewriting it here would create a second source of truth that drifts from the first, which is the precise failure this documentation set exists to prevent (`docs/assets/README.md §1`). So this file does the one thing missing: it maps every technical concern to its owner, and it defines the one artifact no owner yet claimed — the AI-generation metadata schema.

**How to use it:** find your concern in §1–§2, open the owner it names, follow that document exactly. If a concern routes to _"no owner yet,"_ the rule genuinely does not exist — it will be specified when its feature arrives (`VISION.md §4.2` forbids paying for it earlier), and inventing it ad hoc is an error.

---

## 1. General & sprite standards — where each rule lives

| Concern                                          | Authoritative owner                                                                                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Target resolution, pixel density, base grid      | `ASSETS.md §2` (32 px tile, 1× + 2×), `PIXEL_GUIDE.md §1`                                                                                |
| Canvas sizes, safe margins, padding per category | `PIXEL_GUIDE.md §2, §4`                                                                                                                  |
| Grid alignment, footprints                       | `PIXEL_GUIDE.md §2`                                                                                                                      |
| Pivots, origins, anchor points                   | `PIXEL_GUIDE.md §3` (grounded in the renderer)                                                                                           |
| Texture filtering, scaling                       | `ASSETS.md §8` (nearest-neighbour, `antialias: false`)                                                                                   |
| Compression & output formats                     | `ASSETS.md §3`, `ASSETS.md §0` (why lossy WebP/downscale pipes are excluded)                                                             |
| Transparency                                     | `PIXEL_GUIDE.md §4`; hard-edged alpha only (`STYLE_LOCK.md R-02`)                                                                        |
| Naming — core families                           | `ASSETS.md §6`; extended families `NAMING_CONVENTION.md`                                                                                 |
| Versioning                                       | Git is the version store: source committed, `dist/` reproducible (`ADR-006 §2`, `AI_ASSET_PIPELINE.md §7`)                               |
| Character / NPC / worker sprites                 | `PIXEL_GUIDE.md §2` + `CHARACTER_BIBLE.md §2` (the rig)                                                                                  |
| Animals, monsters, bosses (future)               | `CHARACTER_BIBLE.md §12` for design; sizes join `PIXEL_GUIDE.md §2` when the category arrives (`FOLDER_STRUCTURE.md §5`)                 |
| Buildings, trees, props                          | `PIXEL_GUIDE.md §2`                                                                                                                      |
| Particles (v0.2+)                                | Naming `NAMING_CONVENTION.md §4.6`; sizes/budget — **no owner yet** (specified with the first particle feature, within `PERFORMANCE.md`) |
| UI panels & HUD art                              | `UI_STYLE_GUIDE.md` (look), `NAMING_CONVENTION.md §4.3` (names), `ADR-005` (framework — UI is DOM, not sprites)                          |
| Icons                                            | `ICON_GUIDE.md`; sizes/atlas `ASSETS.md §3`                                                                                              |
| Portraits (v0.3+)                                | `NAMING_CONVENTION.md §4.5`; canvas joins `PIXEL_GUIDE.md §2` when the feature arrives                                                   |
| Bounding boxes & collision                       | `GAME_DESIGN.md §5.2` (buildings block pathing); sprites carry no collision data — the sim's tile model owns it (`ARCHITECTURE.md §3.1`) |

## 2. Tiles, animation, atlases, import, budgets, layers

| Concern                                          | Authoritative owner                                                                                               |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Tile size & the one perspective                  | `ASSETS.md §2`                                                                                                    |
| Terrain & tile kinds (incl. roads — `core:path`) | `GAME_DESIGN.md §2.2`                                                                                             |
| Crop tiles & growth stages                       | `GAME_DESIGN.md §3.3`; content declares its own assets (`ASSETS.md §9`)                                           |
| Auto-tiles, transitions, cliffs, fences          | **No owner yet** — no such feature exists; specified when terrain blending arrives (v0.2+)                        |
| Frame naming & ordering                          | `ASSETS.md §6.1–§6.2` (zero-indexed frames, `n/s/e/w` directions)                                                 |
| Animation format, strips, the animation manifest | `ASSETS.md §7, §7.2` (`*.anim.json` sidecars, tick-based timing)                                                  |
| Frame counts & cadence                           | `ANIMATION_GUIDE.md` (creative), `PIXEL_GUIDE.md §8` (recommendations)                                            |
| Loop vs one-shot intent                          | `ANIMATION_GUIDE.md §3–§4`                                                                                        |
| Event / hit / interaction frames (v1.0)          | **No owner yet** — designed with combat, not before                                                               |
| Atlas grouping strategy                          | `ASSETS.md §4` + `ADR-006 §3` (group by co-draw); taxonomy map `FOLDER_STRUCTURE.md §2`                           |
| Atlas padding, bleed prevention, max size        | `ASSETS.md §4.1`                                                                                                  |
| Atlas generation & tooling                       | `ADR-006 §1` (AssetPack), `ASSETS.md §1`                                                                          |
| Atlas naming & versioning                        | Generated artifacts — named by group (`ASSETS.md §4`), never hand-versioned (`ADR-006 §2`)                        |
| Runtime loading & reference                      | The generated manifest, `Sprites.*` keys only (`ASSETS.md §5, §5.1`)                                              |
| Folder mapping (source → atlas)                  | `ASSETS.md §4`, `FOLDER_STRUCTURE.md §2, §4`                                                                      |
| Import procedure                                 | `ASSETS.md §12` — the checklist, followed exactly (`AI_ASSET_PIPELINE.md §6`)                                     |
| Automated validation                             | `ASSETS.md §13` (orphans, dangling keys, dimensions, atlas budget, draw calls, attribution)                       |
| Creative validation                              | `QUALITY_GUIDELINES.md`; the split between the two gates is `QUALITY_GUIDELINES.md §5`                            |
| Texture memory & draw-call budgets               | `PERFORMANCE.md §5–§6`; enforced via `ASSETS.md §13`                                                              |
| CPU cost of animation (idle budget)              | `PERFORMANCE.md §4`, `ASSETS.md §7.1` (`animatingEntityCount`), `STYLE_LOCK.md R-12`                              |
| Render layer order (terrain → effects)           | `ARCHITECTURE.md §5`                                                                                              |
| UI / cursor / selection layers                   | UI is DOM above the canvas (`ADR-005`, `ARCHITECTURE.md §6`); in-world selection/highlights `GAME_DESIGN.md §8.1` |
| Debug layers                                     | Dev-only overlay tooling (`ARCHITECTURE.md §5`); excluded from production builds                                  |
| Future combat layers (v1.0)                      | **No owner yet** — `ARCHITECTURE.md §5` gains layers when combat is designed                                      |
| Attribution & licensing                          | `ASSETS.md §11` (`ATTRIBUTION.md` per directory; provenance or no entry)                                          |

---

## 3. The asset-metadata schema (owned here)

The one gap in the technical record: **which canon an AI-generated asset was made under.** `ASSETS.md §11` records _legal_ provenance (source, author, license). Nothing records _generation_ provenance — the model, the prompt, and the palette/canon versions in force when the asset was approved. Without it, "was this sprite made before the palette changed?" is unanswerable, and the re-review obligation in `AI_ASSET_PIPELINE.md §7` cannot be targeted.

### 3.1 The record

Each atlas-group directory that contains AI-generated assets carries a **`GENERATION.md`** beside its `ATTRIBUTION.md`, in the same table form:

```markdown
| File                | AI model   | Prompt                      | Canon     | Generated  | Dependencies      |
| ------------------- | ---------- | --------------------------- | --------- | ---------- | ----------------- |
| crops/pumpkin_*.png | <model id> | PROMPT_LIBRARY §4 @ a1b2c3d | @ e4f5a6b | 2026-08-02 | matches wheat set |
```

| Column         | Contents                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `File`         | The source file(s), same globbing convention as `ATTRIBUTION.md`.                                                                                                |
| `AI model`     | The exact model identifier used for the accepted candidate.                                                                                                      |
| `Prompt`       | The `PROMPT_LIBRARY.md` section used + the short git hash of `PROMPT_LIBRARY.md` at generation time (`git log -1 --format=%h -- docs/assets/PROMPT_LIBRARY.md`). |
| `Canon`        | The short git hash of `COLOR_PALETTE.md` at generation time; for animated assets, append the `ANIMATION_GUIDE.md` hash (`palette / anim`).                       |
| `Generated`    | Date the accepted candidate was produced (ISO `YYYY-MM-DD`).                                                                                                     |
| `Dependencies` | Assets this one must visually match (e.g. `matches worker rig`, `pairs with shed`), or `—`.                                                                      |

### 3.2 Why these choices

- **Git hashes are the version numbers.** The repo's standing rule is that git history _is_ the version store (`ADR-006 §2`, `AI_ASSET_PIPELINE.md §7`). Hashing the canon docs reuses that rule — no new version registry, deterministic, and `git show <hash>:<path>` reproduces the exact canon an asset was built against.
- **A markdown table, not JSON.** It mirrors `ATTRIBUTION.md` (`ASSETS.md §11`) — reviewed by the same eyes at the same gate, greppable, and diffable. If a future tool wants JSON, it parses this table; the human-owned record stays human-readable.
- **Fields the directive asked for that are deliberately absent** — each already has an owner, and repeating it here would fork it: unique ID → the generated manifest key (`ASSETS.md §5, §6.2`); category → the directory itself (`FOLDER_STRUCTURE.md §2`); author & license → `ATTRIBUTION.md` (`ASSETS.md §11`). Free-form tags are omitted entirely: nothing consumes them, so recording them now is speculation (`AI_RULES.md`-grade YAGNI); add a column when a tool needs one.

### 3.3 Lifecycle

1. **Written at review time.** The row is added when the candidate passes the creative gate (`AI_ASSET_PIPELINE.md §5`), in the **same commit** as the asset and its `ATTRIBUTION.md` row.
2. **Placeholders are exempt** — the current hand-made placeholder art (`ASSETS.md §7.3`) predates the schema; each gains its row when its production replacement lands.
3. **Palette changes target re-review.** When `COLOR_PALETTE.md` changes (`COLOR_PALETTE.md §10`), assets whose `Canon` hash predates the change are the re-review set `AI_ASSET_PIPELINE.md §7` requires. The metadata turns "re-review everything" into a targeted list.
4. **Missing metadata blocks like missing attribution.** The creative reviewer checks the row exists (`QUALITY_GUIDELINES.md §6`); a future automated check mirrors the attribution check in `ASSETS.md §13`.

---

## 4. Future automation (designed-for, not built)

Per `VISION.md §4.2`, v0.1 pays only the cheap-now-expensive-later costs; the schema above is that payment. **No tool is built now.** What the record makes mechanically possible later:

| Future tool                        | What enables it                                                                                           |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Missing-metadata detection         | The `GENERATION.md` presence rule (§3.3) — same shape as the existing attribution check (`ASSETS.md §13`) |
| Palette-violation detection        | Every sprite pixel is checkable against the locked hex set (`COLOR_PALETTE.md`, `STYLE_LOCK.md R-08`)     |
| Style-drift flagging               | `Canon` hash ≠ current hash → the asset joins the re-review list (§3.3.3)                                 |
| Duplicate detection                | Source files are committed PNGs (`ADR-006 §2`) — content-hash comparison needs no new data                |
| Thumbnails, previews, release prep | Pure functions of the committed sources + the generated manifest (`ASSETS.md §5`)                         |
| Incorrect-naming detection         | Already enforceable from `ASSETS.md §6` + `NAMING_CONVENTION.md` grammar                                  |

Atlas packing and build validation are **already automated** (`ADR-006 §1`, `ASSETS.md §13`); nothing here replaces them.

---

## 5. Consistency rules

1. **This file never states a technical rule.** It points. If a statement here disagrees with an owner it cites, the owner is right and this file is corrected.
2. **"No owner yet" is binding.** It means the rule must not be invented ad hoc; it gets an owner when its feature is designed (`VISION.md §4.2`).
3. **The schema is the only owned content.** Any growth of this document beyond routing + §3 is scope drift and should be rejected in review.
4. **`GENERATION.md` never duplicates `ATTRIBUTION.md`.** Legal provenance stays in attribution (`ASSETS.md §11`); generation provenance stays here; a file appears in both when both apply.

---

## 6. Related documents

| Document                                       | Relationship                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| `ASSETS.md`                                    | The primary technical owner most rows route to                             |
| `ADR-006`                                      | Why the pipeline is build-time; source-committed versioning                |
| `PERFORMANCE.md`                               | The budgets every asset must fit                                           |
| `ARCHITECTURE.md §5`                           | Render layer order                                                         |
| `PIXEL_GUIDE.md`                               | Sizes, pivots, padding, outlines                                           |
| `AI_ASSET_PIPELINE.md`                         | The workflow that writes §3's record at its review gate                    |
| `QUALITY_GUIDELINES.md`                        | The creative gate that checks the record exists                            |
| `NAMING_CONVENTION.md` / `FOLDER_STRUCTURE.md` | Extended names and the taxonomy the router cites                           |
| `ASSET_CATALOG.md`                             | The production backlog — _what_ to make; this file is _how it is recorded_ |
