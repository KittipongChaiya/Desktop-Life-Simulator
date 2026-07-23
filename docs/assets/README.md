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

### Delivered — phase-05.5f (visual & technical reference)

| Document                  | What it is                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VISUAL_REFERENCE.md`     | The detailed visual _language_ — keywords, inspiration qualities, attention hierarchy, shape/material grammar, composition, and the storytelling grammar `ART_DIRECTION.md §9` promised it. |
| `TECHNICAL_ASSET_SPEC.md` | ROUTER — the one-hop index from any technical concern to its owner; owns only the `GENERATION.md` asset-metadata schema (AI model, prompt/palette versions via git hashes).                 |

### Delivered — phase-05.5g (design canon, `../design/`)

The gameplay-design counterpart of this folder — housed in `docs/design/` because it governs feature design, not asset generation:

| Document                         | What it is                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `../design/DESIGN_PRINCIPLES.md` | The citation-friendly digest of the design philosophy (P-01..P-17); distills and cites `VISION.md`, which wins every conflict.                                |
| `../design/CONTENT_RULES.md`     | The binding content-design rules (C-01..C-21) and **the feature gate** (§3) every future gameplay feature must pass — the design counterpart of `STYLE_LOCK`. |
| `../design/GAME_LOOPS.md`        | The loop taxonomy and tiered loop catalog; resource flows that must pipe back into farming; defers the v0.1 loop itself to `GAME_DESIGN.md §1`.               |

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

_Completed in phase-05.5g, per directive `fix/0.1/5.5Assets H.md`: a summary of every document, every conflicting decision discovered during authoring, and the improvements recommended before generation begins._

### 5.1 Document summaries

**Creative foundation (05.5a).**
`README.md` (this file) is the index and ownership authority: the technical-authority table, the document hierarchy, and the prime directive — creative docs define intent and never restate technical truth. `STYLE_LOCK.md` is the keystone: eighteen immutable prohibitions (R-01..R-18), each with its rationale; any generation request that conflicts with a rule is wrong. `ART_DIRECTION.md` is the visual philosophy — cozy warmth built for the glance loop — and pre-declares the three-way split completed in 05.5f. `COLOR_PALETTE.md` is the canonical palette: the ramps, the shared `#3A3640` outline, season/biome/UI sets, the skin/hair/cloth sub-ramps (§3.5), and the contrast rules; it fills the never-created `PALETTE.md` and `ASSETS.md §2` now points here. `PIXEL_GUIDE.md` fixes per-category canvas sizes, footprints, and pivots, grounded in the shipped renderer. `QUALITY_GUIDELINES.md` is the creative-acceptance review — every rejection maps to a `STYLE_LOCK` rule, and §6 requires the `GENERATION.md` provenance row. `NAMING_CONVENTION.md` layers the extended naming families (audio, portraits, icons, fx) atop `ASSETS.md §6`, which stays authoritative. `FOLDER_STRUCTURE.md` maps the future content taxonomy onto the existing atlas groups — group by co-draw, not by type.

**Bibles (05.5b).**
`CHARACTER_BIBLE.md` fixes the shared human rig — the `1 : 4` proportion `R-07` points to, height classes, silhouette-first readability, role-by-clothing, and emotion without alarm. `WORLD_BIBLE.md` fixes the valley: cozy vernacular architecture, the biome ladder as tints over shared ramps, a pre-industrial tech level, and the rule that home is safe while unease lives at the far edge. `LORE_BIBLE.md` establishes a deliberately light, open fiction (the giving land, the faded First Tenders, the dormant Old Works) with binding consistency rules — unstated lore is open until a session establishes it, then it is canon.

**UI, icon & animation guides (05.5c).**
`UI_STYLE_GUIDE.md` owns only the interface's look — parchment panels, chunky controls, HUD styling — deferring behaviour to `GAME_DESIGN.md §10`, the framework to `ADR-005`, and values to the palette. `ICON_GUIDE.md` sets icon standards for every category, all governed by the 16 px read: one centred subject, silhouette first, the shared outline. `ANIMATION_GUIDE.md` owns per-action frame counts and cadence — `fps = 20 / frameTicks`, calm at 2–5 fps — with one-shots filling their action's sim duration.

**AI production system (05.5d).**
`ASSET_CATALOG.md` is the human production backlog (priority/phase/estimate/dependencies), renamed from the directive's `ASSET_MANIFEST` to avoid colliding with the generated `manifest.ts`. `PROMPT_LIBRARY.md` provides per-class prompts that each prepend the shared style preamble, palette block, and universal negative prompt — the model is a concept generator; the review is the gate. `AI_ASSET_PIPELINE.md` owns the authoring half (concept → approved source PNG) and routes the build half to `ASSETS.md` + `ADR-006`; the seam is a single artifact.

**Audio canon (05.5e).**
`AUDIO_DIRECTION.md` is governed by one principle — sound you can leave running all day — with `VISION.md §2.1/§2.2` as audio's binding constraints, since `STYLE_LOCK` binds only the visual canon. `MUSIC_LIBRARY.md` catalogs every intended track by context with mood, loop behaviour, and earliest tier. `SFX_LIBRARY.md` catalogs every intended effect; its Event column supplies the `sfx_` name token, and action one-shots sync to their animation and sim duration. All three are forward-looking — no audio ships in v0.1.

**Visual & technical reference (05.5f).**
`VISUAL_REFERENCE.md` is the visual language completing the pre-declared split: keywords, the attention hierarchy and its enforcing tools, shape and material grammar, composition, and the environmental-storytelling grammar — with no values, which stay with their owners. `TECHNICAL_ASSET_SPEC.md` is a ROUTER: a one-hop index from every technical concern to its single owner, with genuinely unowned future concerns marked "no owner yet"; it owns exactly one artifact — the `GENERATION.md` metadata schema recording generation provenance with git hashes as version numbers.

**Design canon (05.5g, `../design/`).**
`DESIGN_PRINCIPLES.md` distills the design philosophy into seventeen citable principles (P-nn), each sourced to `VISION.md`/`GAME_DESIGN.md`, which win every conflict. `CONTENT_RULES.md` turns the philosophy into twenty-one binding rules (C-nn) and the single pre-implementation **feature gate** (§3) every future gameplay feature must pass. `GAME_LOOPS.md` defines the loop taxonomy, the tier-tagged loop catalog, resource flows that must each pipe back into farming, the motivation and progression ladders, the idle-vs-active vocabulary — and an honest weak-point register future sessions inherit.

### 5.2 Conflicting decisions found, and how each was resolved

Every conflict was resolved by **declaring ownership**, never by duplicating. None remain open.

| #   | Conflict                                                                                                                                                                               | Resolution                                                                                                                | Recorded in                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | `ASSETS.md §2` referenced a palette file (`assets/src/PALETTE.md`) that was never created                                                                                              | `COLOR_PALETTE.md` created as the canonical palette; `ASSETS.md §2` repointed                                             | 05.5a; the phase doc          |
| 2   | The directive's `ASSET_MANIFEST` name collides with the generated `manifest.ts` (`ASSETS.md §5`)                                                                                       | Renamed `ASSET_CATALOG`, with a header distinguishing backlog from build artifact                                         | `ASSET_CATALOG.md`            |
| 3   | The directive asked `CHARACTER_BIBLE` to define skin tones; colour values are owned by the palette (`R-08`)                                                                            | Values → `COLOR_PALETTE.md §3.5`; usage → the bible                                                                       | Both docs; the phase doc      |
| 4   | The directive's single Concept→Release pipeline would have duplicated the build pipeline (`ASSETS.md §1`, `ADR-006`)                                                                   | Split at the approved-source-PNG seam: authoring in `AI_ASSET_PIPELINE`, build stays with its owners                      | `AI_ASSET_PIPELINE.md`        |
| 5   | Directive naming examples conflicted with shipped, canonical names                                                                                                                     | `ASSETS.md §6` and shipped forms win; extended families layer on top                                                      | `NAMING_CONVENTION.md`        |
| 6   | The directive asked `TECHNICAL_ASSET_SPEC` for a "complete technical specification" — nearly all of it already owned                                                                   | ROUTER mode: a one-hop index plus binding "no owner yet" markers; owns only the `GENERATION.md` schema                    | `TECHNICAL_ASSET_SPEC.md`     |
| 7   | `STYLE_LOCK` is the creative keystone, but it binds only the _visual_ canon — audio needed a binding authority                                                                         | Audio's binding constraints declared as `VISION.md §2.1/§2.2`                                                             | `AUDIO_DIRECTION.md`          |
| 8   | Directives F/H declared `DESIGN_PRINCIPLES` "the highest-level design authority" and `GAME_LOOPS` "the canonical reference" — `VISION.md` and `GAME_DESIGN.md` already own those roles | Both are DEFER+DELTA digests that distill and cite; the owners win every conflict                                         | Both docs' headers            |
| 9   | File F (`CONTENT_RULES`) and file H (`GAME_LOOPS`) each demanded a pre-implementation checklist — a fork waiting to happen                                                             | One gate, one owner: `CONTENT_RULES.md §3`; `GAME_LOOPS.md §10` routes to it                                              | `CONTENT_RULES.md §3`         |
| 10  | File H's city-defense raids collide with the constitution — raids that destroy value while absent violate `VISION.md §2.1/§2.2`                                                        | Defense constrained to opt-in, scheduled, never destructive while absent; flagged for a dedicated design pass before v1.0 | `GAME_LOOPS.md §5, §12`       |
| 11  | File A homed everything in `docs/assets/`, but files F/H produce gameplay-design canon, not asset canon                                                                                | New `docs/design/` directory                                                                                              | The phase doc §Document homes |

### 5.3 Recommended improvements before generation begins

1. **Generate a golden set first.** Before phase-06's economy art wave, run one pilot asset per major class — a full crop cycle, a character, a building, an icon — through `PROMPT_LIBRARY` → `QUALITY_GUIDELINES` → `GENERATION.md`, and fold what the review teaches back into `PROMPT_LIBRARY`. A canon gap found on four assets is cheap; found on forty, it is a re-generation campaign.
2. **Append, don't renumber.** The set is wired together by `§` anchors; renumbering a section silently breaks citations across files. New sections append; renumbering requires checking inbound references.
3. **Keep the prompt palette in sync.** `PROMPT_LIBRARY` embeds palette hexes by `COLOR_PALETTE.md §10`'s instruction — any palette change must touch both in the same commit; a diff-check script is worth writing the first time this drifts.
4. **Assign the "no owner yet" list deliberately.** Auto-tiles/transitions, particle sizes, hit/event frames, and combat layers (`TECHNICAL_ASSET_SPEC.md §1–2`) each need an owner _before_ the first feature that touches them — not during it.
5. **Re-baseline `ASSET_CATALOG` at phase-06 planning**, and build `TECHNICAL_ASSET_SPEC §4`'s automation only when asset volume justifies it.
6. **Track the registered design debts** at each tier's planning: crops' missing second use, the per-tier escalating-sink requirement, and the defense design pass (`GAME_LOOPS.md §12`).

### 5.4 Verdict

Twenty-five documents, one canon. Every overlap discovered during authoring was resolved by ownership declaration; a reviewer should find no technical rule stated twice and no creative question with two answers. The foundation the directives asked for — that a session with no memory can generate an asset or judge a feature and land inside the same world — is in place. **Phase-06 art generation may begin on this canon.**
