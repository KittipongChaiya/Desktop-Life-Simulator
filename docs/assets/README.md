# docs/assets — The AI-Native Creative Canon

> **Status:** Index and ownership authority for the creative documentation set.
> **Owns:** What each creative document is, how they rank, and the contract that keeps them from duplicating the technical docs.
> **Does not own:** The technical asset pipeline (`../ASSETS.md`, `../decisions/ADR-006-asset-pipeline.md`), product intent (`../VISION.md`), mechanics (`../GAME_DESIGN.md`).

This folder is the **creative foundation** for Desktop Life Simulator: the canon every future AI session obeys when generating art, animation, audio, and — in the companion `docs/design/` folder — gameplay content. It exists so that hundreds of assets authored across a hundred phases, by sessions with no shared memory (`VISION.md §2.5`), read as **one world**.

Built from the directive series `fix/0.1/5.5Assets A–H` during **phase-05.5** (`../phases/phase-05.5-asset-foundation.md`).

---

## 1. The prime directive: creative intent, not technical truth

These documents define **artistic and design intent**. They are _not_ the source of truth for anything technical. The technical single-sources-of-truth already exist and stay authoritative:

| Concern                                               | Authoritative owner                      |
| ----------------------------------------------------- | ---------------------------------------- |
| Pipeline, naming derivation, atlas groups, validation | `../ASSETS.md`                           |
| Why the pipeline is build-time                        | `../decisions/ADR-006-asset-pipeline.md` |
| Performance & memory budgets                          | `../PERFORMANCE.md`                      |
| Render layer order                                    | `../ARCHITECTURE.md §5`                  |
| UI framework                                          | `../decisions/ADR-005-ui-framework.md`   |
| Mechanics, numbers, UI philosophy                     | `../GAME_DESIGN.md`                      |
| Product intent, non-goals                             | `../VISION.md`                           |

**The rule (the user's explicit instruction):** if a technical spec already exists in `ASSETS.md` or an ADR, creative docs **reference** it — they never rewrite it. Where two docs could overlap, ownership is **declared**, not duplicated. Every doc carries an `Owns / Does not own` header so the boundary is always explicit.

---

## 2. Document hierarchy

When documents appear to conflict, the higher authority wins:

```
VISION.md  (product intent — outranks everything creative)
      │
      ▼
STYLE_LOCK.md  (immutable creative rules, R-01..R-18)
      │
      ▼
ART_DIRECTION.md  (visual philosophy)  ·  COLOR_PALETTE.md + PIXEL_GUIDE.md  (the hard values)
      │
      ▼
the guides & bibles  (apply the above to a domain)
      │
      ▼
PROMPT_LIBRARY.md  (encodes all of the above into generation prompts)
```

`STYLE_LOCK.md` is the keystone: any generation request that conflicts with a rule there is wrong, and the rule wins.

---

## 3. The documents

### Delivered — phase-05.5a (creative foundation)

| Document                | What it is                                                            |
| ----------------------- | --------------------------------------------------------------------- |
| `STYLE_LOCK.md`         | **Keystone.** The immutable "never do this" rules (R-01..R-18).       |
| `ART_DIRECTION.md`      | Visual philosophy, identity, mood, camera/lighting intent.            |
| `COLOR_PALETTE.md`      | The canonical palette — every colour, ramp, season/biome/UI set.      |
| `PIXEL_GUIDE.md`        | Canvas sizes, footprints, pivots, outline application.                |
| `QUALITY_GUIDELINES.md` | The creative rejection criteria — the review that enforces the rules. |
| `NAMING_CONVENTION.md`  | Extended naming families atop `ASSETS.md §6`.                         |
| `FOLDER_STRUCTURE.md`   | The content taxonomy mapped onto the atlas groups.                    |

### Delivered — phase-05.5b (bibles)

| Document             | What it is                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHARACTER_BIBLE.md` | Character visual canon — the shared human rig, the `1 : 4` proportion `STYLE_LOCK.md R-07` fixes, silhouette/readability, and customization rules. |
| `WORLD_BIBLE.md`     | World visual/physical canon — architecture, biomes, regions, and the "does it belong in the valley?" test.                                         |
| `LORE_BIBLE.md`      | Narrative canon — a deliberately light, open fiction (cozy present, faded past, dormant frontier) with binding consistency rules.                  |

Shipped with a consistency edit to `COLOR_PALETTE.md §3.5` (the inclusive skin sub-ramp + hair/cloth mapping), because character colour _values_ belong in the palette, not in the bible.

### Delivered — phase-05.5c (UI, icon & animation guides)

| Document             | What it is                                                                                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `UI_STYLE_GUIDE.md`  | UI _appearance_ only — cozy parchment panels, chunky controls, HUD look; defers behaviour/layout to `GAME_DESIGN.md §10`, framework to `ADR-005`, values to `COLOR_PALETTE.md §6`. |
| `ICON_GUIDE.md`      | Icon design standards across every category (item→boss), built for the 16 px read; defers sizes/atlas to `ASSETS.md §3`, names to `NAMING_CONVENTION.md`.                          |
| `ANIMATION_GUIDE.md` | Per-action frame counts, cadence, and loop intent; the cadence math and the "fit the sim duration" rule; defers format to `ASSETS.md §7`, durations to `GAME_DESIGN.md §4.3`.      |

### Delivered — phase-05.5d (AI production system)

| Document               | What it is                                                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASSET_CATALOG.md`     | The production _backlog_ (priority/phase/estimate/deps) — explicitly **not** the generated `manifest.ts`; renamed from ASSET_MANIFEST to avoid that collision. |
| `PROMPT_LIBRARY.md`    | Reusable prompts per class, each prepending a shared style preamble + palette block + negative prompt so a request starts inside the canon.                    |
| `AI_ASSET_PIPELINE.md` | The concept→approved-source workflow; owns authoring (concept→prompt→generation→review) and routes source→runtime to `ASSETS.md §1` + `ADR-006`.               |

### Delivered — phase-05.5e (audio)

| Document             | What it is                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AUDIO_DIRECTION.md` | Audio _intent_ (v0.2+) — the "leave it running all day" principle, music/ambient/mixing/loop philosophies; defers pipeline/format to `ADR-006 §8`, `ASSETS.md §3`. |
| `MUSIC_LIBRARY.md`   | The forward-looking music catalog — every intended track with context, mood intent, roadmap tier, and loop behaviour.                                              |
| `SFX_LIBRARY.md`     | The forward-looking SFX catalog — every intended effect with its `sfx_` event name, intent, tier, and trigger/sync behaviour.                                      |

### Pending — later 05.5 sub-milestones

| Document                         | Sub | What it will be                                      |
| -------------------------------- | --- | ---------------------------------------------------- |
| `VISUAL_REFERENCE.md`            | f   | The detailed visual _language_                       |
| `TECHNICAL_ASSET_SPEC.md`        | f   | Router into technical owners + metadata schema       |
| `../design/DESIGN_PRINCIPLES.md` | g   | Distilled principles (cite `VISION.md`)              |
| `../design/CONTENT_RULES.md`     | g   | Feature-gate design checklist                        |
| `../design/GAME_LOOPS.md`        | g   | Loop taxonomy (defers v0.1 loop to `GAME_DESIGN.md`) |

The full per-document ownership map (CREATE / DEFER+DELTA / ROUTER, with each cross-reference target) lives in `../phases/phase-05.5-asset-foundation.md`.

---

## 4. Using this canon to generate an asset

1. Read `STYLE_LOCK.md` — the binding rules.
2. Read the domain doc (e.g. `CHARACTER_BIBLE.md` for a villager).
3. Pull colours from `COLOR_PALETTE.md` and size/pivot from `PIXEL_GUIDE.md`.
4. Use the matching entry in `PROMPT_LIBRARY.md` (phase-05.5d).
5. Name and file per `NAMING_CONVENTION.md` + `FOLDER_STRUCTURE.md` (which defer to `ASSETS.md §4, §6`).
6. Review against `QUALITY_GUIDELINES.md` before the build validation in `ASSETS.md §12, §13`.

---

## 5. Reconciliation report

_To be completed in phase-05.5g, per directive `fix/0.1/5.5Assets H.md`._

Will contain: a one-paragraph summary of each of the ~24 documents; every conflicting decision discovered during authoring; and recommended improvements to resolve before art/audio generation begins in phase-06 and v0.2. Until then, known reconciliations already applied are recorded in the phase doc (palette-file repoint; `ASSET_MANIFEST`→`ASSET_CATALOG` rename; `DESIGN_PRINCIPLES`/`GAME_LOOPS` distill-and-cite `VISION.md`/`GAME_DESIGN.md`).
