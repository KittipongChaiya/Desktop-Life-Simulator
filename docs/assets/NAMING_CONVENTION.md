# NAMING_CONVENTION

> **Status:** Authoritative for extended asset-naming families.
> **Owns:** Naming patterns for asset categories `ASSETS.md §6` does not yet cover — audio, portraits, UI icons and panels, particles/effects, and future creature art.
> **Does not own:** Core sprite/tile/entity/building file naming and manifest-key derivation (`ASSETS.md §6`); the generated typed manifest itself (`ASSETS.md §5`); folder layout (`FOLDER_STRUCTURE.md`).

Naming is not cosmetic here. A file's name **becomes its typed manifest key** at build time (`ASSETS.md §5, §6`), so a name is an API surface: get it wrong and either the key is ugly forever or a rename breaks the build at every use site. This document keeps the naming of _new_ categories as disciplined as the core, so the manifest stays predictable as the content library grows across a hundred phases.

---

## 1. `ASSETS.md §6` owns the core — read it first

The canonical file-naming patterns and the manifest-key derivation live in **`ASSETS.md §6`** and are **not restated here**. In brief, and by reference only:

- Tiles, crop stages, static and animated entities, and buildings follow the patterns in `ASSETS.md §6.1`.
- Directions are `n` / `s` / `e` / `w`; frames and stages are **zero-indexed**.
- Manifest keys are auto-derived `<group><PascalCaseFilename>` (`ASSETS.md §6.2`) — deterministic, so a given file always yields the same key.

Everything below **extends** those rules to new categories; it never overrides them. Where this doc and `ASSETS.md §6` could appear to overlap, `ASSETS.md §6` wins.

---

## 2. Reconciling the directive's examples

The source directive (`fix/0.1/5.5Assets A.md`) gives illustrative examples that predate the pipeline and **do not all match the canonical form**. They are examples of _intent_, not literal patterns. Resolve each to the `ASSETS.md §6` convention:

| Directive example          | Canonical form         | Why                                                                                                                                                                          |
| -------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `worker_male_walk_down_01` | `worker_walk_s_1`      | Direction codes are `s/n/e/w`, not `down`; frames zero-indexed (`ASSETS.md §6.1`). Variant (`male`) belongs in the entity token per `CHARACTER_BIBLE.md`, not a free suffix. |
| `crop_corn_stage_03`       | `corn_2`               | Crop files are `<crop>_<stage>`, zero-indexed, no `crop_`/`stage_` filler (`ASSETS.md §6.1`).                                                                                |
| `ui_inventory_panel`       | `ui_inventory_panel` ✓ | Already matches the UI-panel family (§4.3).                                                                                                                                  |
| `bgm_morning.ogg`          | `bgm_morning.ogg` ✓    | Matches the music family (§4.1).                                                                                                                                             |
| `sfx_harvest.wav`          | `sfx_harvest.wav` ✓    | Matches the SFX family (§4.2).                                                                                                                                               |

**Rule:** treat the directive's names as descriptions to be translated, never as literals to be copied.

---

## 3. Universal conventions for every family

- **`lower_snake_case` only.** No camelCase, no hyphens, no spaces, no capitals in filenames — the manifest-key derivation depends on it (`ASSETS.md §6.2`).
- **Tokens go general → specific**, left to right: `<category>_<subject>_<qualifier>`. This clusters related assets alphabetically and keeps the derived key readable.
- **Zero-indexed, no zero-padding for pipeline-packed frames** (match `ASSETS.md §6.1`: `_0`, `_1`, … not `_01`).
- **No string-literal paths, ever.** Every asset is referenced through the typed manifest by key (`ASSETS.md §5`); a filename is an input to the build, never a runtime string. Renaming is therefore a compile error, not a silent missing texture.

---

## 4. Extended families (owned here)

### 4.1 Music — `bgm_<scene>[_<variant>].ogg` _(v0.2+)_

Audio is a v0.1 non-goal (`VISION.md §5.2`); the pipeline for it is reserved in `ADR-006 §8`. Named now so v0.2 music does not reinvent the scheme.

| Pattern                     | Example             | Notes                             |
| --------------------------- | ------------------- | --------------------------------- |
| `bgm_<scene>.ogg`           | `bgm_morning.ogg`   | `<scene>` from `MUSIC_LIBRARY.md` |
| `bgm_<scene>_<variant>.ogg` | `bgm_farm_rain.ogg` | Optional weather/mood variant     |

### 4.2 Sound effects — `sfx_<event>[_<n>].wav` _(v0.2+)_

| Pattern               | Example           | Notes                                                   |
| --------------------- | ----------------- | ------------------------------------------------------- |
| `sfx_<event>.wav`     | `sfx_harvest.wav` | `<event>` from `SFX_LIBRARY.md`                         |
| `sfx_<event>_<n>.wav` | `sfx_step_0.wav`  | Zero-indexed round-robin variants for repeated triggers |

Author as `.wav`; the pipeline emits `.ogg` (`ASSETS.md §3`, `ADR-006 §8`).

### 4.3 UI panels & HUD — `ui_<panel>.png`

| Pattern                 | Example                  | Notes                                     |
| ----------------------- | ------------------------ | ----------------------------------------- |
| `ui_<panel>.png`        | `ui_inventory_panel.png` | Full panels, frames, HUD backdrops        |
| `ui_<panel>_<part>.png` | `ui_button_hover.png`    | State/part variants (`UI_STYLE_GUIDE.md`) |

### 4.4 Icons

Sized per `ASSETS.md §3` (16×16 or 24×24) and grouped in the `ui-world` atlas.

Item and resource icons keep the **established `item_<name>.png` form already shipped** in `ui-world{tps}/` (e.g. `item_wheat.png`, `scripts/generate-placeholder-item-building-art.mjs`) — do **not** rename these to an `icon_` prefix. Other UI-icon categories use `icon_<category>_<name>.png`:

| Pattern                  | Example                  | Category source   |
| ------------------------ | ------------------------ | ----------------- |
| `item_<name>.png`        | `item_wheat.png`         | Items / resources |
| `icon_tool_<name>.png`   | `icon_tool_hoe.png`      | Tools             |
| `icon_status_<name>.png` | `icon_status_energy.png` | Status / HUD      |

Categories are enumerated in `ICON_GUIDE.md`; do not invent a category token not listed there.

### 4.5 Portraits — `portrait_<character>[_<emotion>].png` _(v0.3+)_

| Pattern                              | Example                       | Notes                                |
| ------------------------------------ | ----------------------------- | ------------------------------------ |
| `portrait_<character>.png`           | `portrait_merchant.png`       | Neutral default                      |
| `portrait_<character>_<emotion>.png` | `portrait_merchant_happy.png` | Emotion set per `CHARACTER_BIBLE.md` |

### 4.6 Particles & effects — `fx_<effect>[_<frame>].png` _(v0.2+)_

Lives in the lazily-loaded `effects` atlas (`ASSETS.md §4`).

| Pattern                   | Example            | Notes                         |
| ------------------------- | ------------------ | ----------------------------- |
| `fx_<effect>_<frame>.png` | `fx_sparkle_0.png` | Zero-indexed animation frames |

### 4.7 Future creatures — reuse the entity pattern

Animals, monsters, and bosses are **entities** and follow the entity naming of `ASSETS.md §6.1` (`<entity>_<action>_<dir>[_<frame>]`) with no new scheme:

| Example                     | Meaning                      |
| --------------------------- | ---------------------------- |
| `chicken_idle_s.png`        | Animal, idle, facing south   |
| `slime_walk_e_2.png`        | Monster, walk, east, frame 2 |
| `boss_golem_attack_s_3.png` | Boss, attack, south, frame 3 |

---

## 5. Adding a new category

1. Check whether an existing family in §4 (or `ASSETS.md §6`) already fits — **extend, do not invent.**
2. If genuinely new, choose a short `<category>` token, define `<category>_<subject>_<qualifier>` here with a rationale and an example, and confirm the derived manifest key (`ASSETS.md §6.2`) is clean.
3. Register the category in the guide that owns its content (`ICON_GUIDE.md`, `SFX_LIBRARY.md`, etc.).
4. A file whose name does not match a documented family is rejected in review (`QUALITY_GUIDELINES.md`).

---

## 6. Related documents

| Document                     | Relationship                                      |
| ---------------------------- | ------------------------------------------------- |
| `ASSETS.md §5, §6`           | Core naming + manifest-key derivation (the owner) |
| `FOLDER_STRUCTURE.md`        | Where each named file lives                       |
| `ICON_GUIDE.md` (05.5c)      | Icon category tokens                              |
| `MUSIC_LIBRARY.md` (05.5e)   | Music `<scene>` names                             |
| `SFX_LIBRARY.md` (05.5e)     | SFX `<event>` names                               |
| `CHARACTER_BIBLE.md` (05.5b) | Character/emotion tokens for portraits & variants |
