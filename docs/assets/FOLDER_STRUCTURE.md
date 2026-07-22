# FOLDER_STRUCTURE

> **Status:** Authoritative for the conceptual content taxonomy.
> **Owns:** The categories a growing asset library divides into, and which existing atlas **group** each category lives in.
> **Does not own:** The physical build tree (`assets/src/<group>{tps}/`, `assets/dist/`), the `{tps}` tag mechanics, or atlas grouping strategy (`ASSETS.md §4`, `ADR-006 §2, §3`). Those are the single source of truth; this file maps content _onto_ them.

This document exists to answer "where does a new asset go?" without contradicting the pipeline. It is a **map from content categories to the atlas groups that already exist** — not a second directory scheme.

---

## 1. The one rule that overrides intuition: group by co-draw, not by type

The obvious folder tree — `characters/`, `animals/`, `monsters/`, `bosses/`, each its own directory — is **wrong here**, and picking it would silently break the renderer.

Atlases group by **what is drawn together in a frame**, not by what kind of thing an asset is (`ASSETS.md §4`, `ADR-006 §3`). A worker, a chicken, and a slime are all on screen at once, so they share the **`entities`** atlas and batch into few draw calls. Filing them into `characters/` + `animals/` + `monsters/` would scatter co-drawn sprites across atlases, one draw call each — discarding the entire reason PixiJS was chosen (`ADR-001`, `ADR-006 §Context`).

**So this taxonomy is conceptual. The physical home is always an existing atlas group.** A directive wish-list of "sprites / characters / animals / monsters / bosses / portraits / …" (`fix/0.1/5.5Assets A.md`) describes _content categories_, and every one of them resolves to a group below.

---

## 2. Taxonomy → atlas group map

| Content category (conceptual)               | Physical home (`assets/src/…`) | Atlas group | Loaded             |
| ------------------------------------------- | ------------------------------ | ----------- | ------------------ |
| Terrain tiles, soil states, paths           | `terrain{tps}/`                | `terrain`   | Startup            |
| Crops (all growth stages)                   | `crops{tps}/`                  | `crops`     | Startup            |
| Characters — player, workers, villagers     | `entities{tps}/`               | `entities`  | Startup            |
| Animals, monsters, bosses (future)          | `entities{tps}/`               | `entities`  | Startup            |
| Buildings, structures, props                | `buildings{tps}/`              | `buildings` | Startup            |
| In-world UI — selection, ghosts, item icons | `ui-world{tps}/`               | `ui-world`  | Startup            |
| Particles, weather, VFX (v0.2+)             | `effects{tps}/`                | `effects`   | Lazy, v0.2+        |
| Portraits (v0.3+)                           | `portraits{tps}/` (own group)  | `portraits` | Lazy, on dialogue  |
| Fonts                                       | `fonts/` → bitmap-font atlas   | (font)      | Startup            |
| Music, SFX, ambience (v0.2+)                | `audio/` — **not an atlas**    | —           | Lazy, `ADR-006 §8` |

The five startup groups (`terrain`, `crops`, `entities`, `buildings`, `ui-world`) are the ones `ASSETS.md §4` defines today. `effects` is reserved-lazy there. `portraits`, `fonts`, and `audio` are named here as the homes future content will use; each is created when its content first ships, following the same rules.

---

## 3. Notes on the non-obvious homes

- **Animals / monsters / bosses → `entities`.** They are entities that co-draw with characters. If a future scene proves a class is _never_ co-drawn with others (e.g. a boss in a separate arena), only _then_ does a dedicated lazy group become justified — a draw-call decision (§5), not a filing preference.
- **Item / resource icons → `ui-world`.** Small in-world icons batch with selection and ghost art (`ASSETS.md §4`); the shipped `item_*.png` icons already live there.
- **Portraits → their own lazy group.** Portraits are large (64×64, `PIXEL_GUIDE.md §2`), shown one at a time during dialogue, and never co-drawn with the farm. Bundling them into a startup atlas would waste texture memory on art that is rarely visible — the textbook case for a separate lazy group.
- **Audio is not atlased at all.** Music and SFX are not textures; they live in `assets/src/audio/` and the pipeline emits `.ogg` (`ADR-006 §8`). They appear here only so the "where does it go?" map is complete.

---

## 4. `source/` vs `generated/` — committed vs reproducible

The directive's `source/` and `generated/` map onto a decision the pipeline already made (`ADR-006 §2`), not a new one:

| Directive term | Actual path    | Committed?                        |
| -------------- | -------------- | --------------------------------- |
| `source/`      | `assets/src/`  | **Yes** — authored art            |
| `generated/`   | `assets/dist/` | **No** — gitignored, reproducible |

`assets/dist/` is fully reproducible from `assets/src/` by `npm run assets`, so committing it would only create unmergeable binary diffs and let it drift (`ADR-006 §2`). See `ASSETS.md §1` for the pipeline overview; it is not restated here.

---

## 5. Adding a new category

1. **Find its co-draw group.** Which existing atlas holds the things it appears on screen _with_? File it there. This is the default and the answer ~95% of the time.
2. **A new `{tps}` group is a draw-call decision, never a filing one** (`ASSETS.md §4.1`). Create one only when the content is genuinely lazily loaded or genuinely never co-drawn with an existing group — and report its draw-call/texture-memory impact (`PERFORMANCE.md`).
3. **Name the files** per `NAMING_CONVENTION.md` (which defers core naming to `ASSETS.md §6`).
4. **Add an `ATTRIBUTION.md`** to any new directory (`ASSETS.md §11`).

---

## 6. Plugin assets (v0.2, reserved)

Plugin art is **never** repacked into core atlases. A plugin ships its own pre-built atlas and a manifest fragment, namespaced by plugin id (`myMod:dragonfruit_0`), merged at load (`ASSETS.md §10`, `ADR-006 §7`). The taxonomy above governs **core** content; plugins mirror it inside their own namespace.

---

## 7. Related documents

| Document               | Relationship                                                 |
| ---------------------- | ------------------------------------------------------------ |
| `ASSETS.md §4`         | Atlas groups, the `{tps}` tag — the authority this maps onto |
| `ADR-006 §2, §3`       | Committed vs generated; grouping by usage                    |
| `NAMING_CONVENTION.md` | How files in each group are named                            |
| `PIXEL_GUIDE.md §2`    | Canvas sizes that inform lazy-group decisions                |
| `PERFORMANCE.md`       | The draw-call / texture-memory budget new groups report to   |
