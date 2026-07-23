# Phase 05.5 — AI Asset Production Foundation

> **Delivers:** The AI-native creative documentation system — the canon every future AI session obeys when generating art, animation, audio, and gameplay content, so the visual and design identity never drifts across the next 100 phases.
> **Runnable at completion:** Documentation only. No code, no runtime change; every gate that passed at phase-05 still passes, untouched.
> **Governing rule:** Creative documents define artistic and design **intent**. `ASSETS.md` and the ADRs remain the **single source of truth** for pipeline, naming, folders, atlases, import, and build. New docs cross-reference the technical owner; they never duplicate it. Where two docs could overlap, ownership is declared explicitly.

Source directives: `fix/0.1/5.5Assets A–H`. This phase converts those eight directive files into a coherent, non-duplicating documentation set reconciled against the docs that already exist.

---

## Why this phase exists, and why here

`PLAN.md §2.2` makes one documentation criterion binding for v0.1: _"A new AI session can implement a v0.2 feature using only `docs/` and the code."_ For **code** that criterion is largely met. For **art, audio, and content generation** it is not — there is no locked art direction, no style lock, no palette (the `PALETTE.md` that `ASSETS.md §2` points at was never created), no prompt library, no lore. An AI session asked to generate a shop building or a coin icon today would invent a look, and the identity would drift.

Placed **before phase-06 (Economy)** deliberately: economy introduces the first large wave of new art — shop and market buildings, coins, land-expansion tiles, upgrade icons, building UI. Generating that art before the style is locked is precisely how a pixel-art project loses coherence. Locking the creative canon first makes phase-06's art a matter of _following_ the rules, not _inventing_ them.

Recorded per `PLAN.md §9.1` (phases may be inserted/resequenced when a dependency proves real; record why in the phase document). This is an insertion, not a reordering, and it moves **no** feature scope earlier (`PLAN.md §9.2`) — it produces documentation only.

---

## Scope

**In scope** — ~24 creative and design documents (enumerated in _Deliverables_), plus two small consistency edits to existing docs:

- Repoint `ASSETS.md §2`'s palette reference from the never-created `assets/src/PALETTE.md` to the new canonical `docs/assets/COLOR_PALETTE.md`.
- Add the `05.5` row to `PLAN.md §2.1`.

**Explicitly not in scope** (the directives themselves forbid it — file A: _"Your task is NOT to generate artwork / music / sound effects"_):

- No generated art, music, or SFX assets.
- No code, no test, no change to the asset pipeline, atlas config, or manifest generation.
- No new gameplay mechanics — the design docs (F/H) **describe and constrain** future features, they do not schedule or implement them.

Because this phase writes only Markdown, the TDD / coverage / E2E gates do not apply. The rest of the working cadence does (see _Working method_).

---

## Delivery status

| Milestone | Source | Scope                                                                      | Status        |
| --------- | ------ | -------------------------------------------------------------------------- | ------------- |
| **05.5a** | A      | `README` (index + ownership map) + 7 creative-foundation docs              | **Delivered** |
| **05.5b** | B      | `CHARACTER_BIBLE`, `WORLD_BIBLE`, `LORE_BIBLE`                             | **Delivered** |
| **05.5c** | C      | `UI_STYLE_GUIDE`, `ICON_GUIDE`, `ANIMATION_GUIDE`                          | **Delivered** |
| **05.5d** | D      | `ASSET_CATALOG`, `PROMPT_LIBRARY`, `AI_ASSET_PIPELINE`                     | **Delivered** |
| **05.5e** | E      | `AUDIO_DIRECTION`, `MUSIC_LIBRARY`, `SFX_LIBRARY`                          | **Delivered** |
| **05.5f** | G      | `VISUAL_REFERENCE`, `TECHNICAL_ASSET_SPEC`                                 | **Delivered** |
| **05.5g** | F + H  | `DESIGN_PRINCIPLES`, `CONTENT_RULES`, `GAME_LOOPS` + reconciliation report | **Delivered** |

Execution order is dependency-driven: **A first** (every later doc cites `STYLE_LOCK` and `COLOR_PALETTE`), the **reconciliation report last** (it can only summarise finished docs). B–G in between may proceed in file order.

**05.5a delivered** — the creative foundation (`docs/assets/`), 8 documents establishing the canon everything later cites:

- `README.md` — the index, the technical-authority table, the document hierarchy (`VISION → STYLE_LOCK → ART_DIRECTION / COLOR_PALETTE + PIXEL_GUIDE → guides → PROMPT_LIBRARY`), and the reconciliation stub (05.5g).
- `STYLE_LOCK.md` — the keystone: 18 immutable rules (`R-01…R-18`), each a prohibition with a rationale, cited by every other doc.
- `COLOR_PALETTE.md` — the canonical palette; locks the shared outline `#3A3640` (already load-bearing in `scripts/generate-placeholder-*.mjs`), with season/biome/UI sets and WCAG-AA contrast rules. **Fills the never-created `assets/src/PALETTE.md`; `ASSETS.md §2` repointed here.**
- `ART_DIRECTION.md` — visual philosophy/mood/intent, anchored to the glance loop (`VISION.md §1`).
- `PIXEL_GUIDE.md` — per-category canvas sizes, footprints, and pivots grounded in the renderer (entities bottom-center per `worker-view.ts`; tiles/shed top-left per `building-view.ts`).
- `QUALITY_GUIDELINES.md` — creative-acceptance review; every rejection maps to a `STYLE_LOCK` rule and defers automated checks to `ASSETS.md §12, §13`.
- `NAMING_CONVENTION.md` — extended families (audio/portrait/icon/fx); defers core naming to `ASSETS.md §6`; reconciles the directive's non-canonical examples; keeps the shipped `item_<name>.png` form.
- `FOLDER_STRUCTURE.md` — content taxonomy mapped onto the existing atlas groups; states the "group by co-draw, not by type" rule (`ASSETS.md §4`, `ADR-006 §3`).

Ownership discipline held: every doc carries an `Owns / Does not own` header; technical rules are cross-referenced, never duplicated. Docs-only — no code, no runtime change.

**05.5b delivered** — the three bibles (`docs/assets/`), the world's people, place, and story:

- `CHARACTER_BIBLE.md` — the shared human rig and, per `STYLE_LOCK.md R-07`, the fixed **1 : 4 head-to-body** proportion and height classes every future character must match; silhouette/readability/recognition rules, role-by-clothing, equipment attachment points, emotion (no-alarm), and customization rules. Grounded in `PIXEL_GUIDE.md §2` (32 × 48, bottom-center) and `GAME_DESIGN.md §4` (workers).
- `WORLD_BIBLE.md` — the valley's visual/physical canon: cozy vernacular architecture, the biome/region ladder (farm → village → forest/lake/mountain/mine → dungeon) as **tints over the shared ramps**, pre-industrial tech level, and the "home is safe, unease lives at the far edge" rule. Aligned to `COLOR_PALETTE.md §8` biomes and `GAME_DESIGN.md §2, §11`.
- `LORE_BIBLE.md` — a **deliberately light, open** fiction (the giving land, the faded First Tenders, the dormant Old Works) with strong consistency rules: unstated lore is open until a session establishes it, then binds; danger and mystery stay at the frontier and the reserved v1.0 future, never at home. Serves and cites `VISION.md §2.2`.

Consistency edit shipped in the same commit: **`COLOR_PALETTE.md §3.5`** adds the inclusive skin sub-ramp and the hair/cloth mapping, because character colour _values_ are owned by the palette — the bible owns only their _usage_. Reconciliation reason: the directive asked `CHARACTER_BIBLE` to "define skin tones," but hex values live in `COLOR_PALETTE.md` (`STYLE_LOCK.md R-08`); split ownership rather than duplicate.

**05.5c delivered** — the UI, icon, and animation guides (`docs/assets/`), all tightly scoped so no owner is duplicated:

- `UI_STYLE_GUIDE.md` (DEFER+DELTA) — owns only the UI's _look_ (cozy parchment panels, a single warm dark edge, chunky controls, HUD styling). Defers behaviour and layout to `GAME_DESIGN.md §10`, the React/DOM framework and snapshot bridge to `ADR-005`, and colour values to `COLOR_PALETTE.md §6`. The UI is styled to belong to the pixel world, not rendered in it (`ADR-005 §1`).
- `ICON_GUIDE.md` (CREATE) — icon design standards across every category (item, resource, tool, building, food, skill, weapon, armor, quest, status, notification), all governed by the 16 px read: one centred subject, silhouette-first, the shared 1 px `#3A3640` outline, reserved accents kept meaningful. Defers sizes/atlas to `ASSETS.md §3`, names to `NAMING_CONVENTION.md`, placement to `UI_STYLE_GUIDE.md`.
- `ANIMATION_GUIDE.md` (DEFER+DELTA) — owns per-action frame counts, cadence, and loop-vs-one-shot intent; expands `PIXEL_GUIDE.md §8` to the full action list. Two grounding rules: the cadence math (`fps = 20 / frameTicks`, calm at 2–5 fps) and **fit the sim duration** — a one-shot fills the action's tick cost (`GAME_DESIGN.md §4.3`). Defers format, tick semantics, and the manifest to `ASSETS.md §7`.

**05.5d delivered** — the AI production system (`docs/assets/`), turning the canon into a repeatable workflow:

- `AI_ASSET_PIPELINE.md` (DEFER+DELTA) — owns the **authoring** half (concept → prompt → generation → review → approved source PNG) and **routes** the source→runtime half (naming, optimization, atlas packing, import, versioning, release) to `ASSETS.md §1, §4, §5, §6, §11, §12, §13` + `ADR-006`. The seam is a single artifact: an approved source PNG in `assets/src/`. Adds the creative review gate (`QUALITY_GUIDELINES.md`) that precedes the automated build gate.
- `PROMPT_LIBRARY.md` (CREATE) — reusable prompts per class, each prepending a shared **style preamble + palette block + universal negative prompt** so every request starts inside the canon; every `STYLE_LOCK.md` prohibition appears as a negative. Enumerates palette hexes by `COLOR_PALETTE.md §10`'s own instruction, with a sync obligation. Frames the model as a concept generator, not the gate.
- `ASSET_CATALOG.md` (CREATE) — the production backlog (priority/phase/estimate/deps/status), grounded in real v0.1 content and flagging phase-06's economy art as the next P0 wave (the reason 05.5 precedes 06). Renamed from the directive's `ASSET_MANIFEST` and given a header contrasting it with the generated `manifest.ts` (`ASSETS.md §5`), which it must never be confused with.

Reconciliation: `ASSET_MANIFEST` → `ASSET_CATALOG` rename (collision with the generated `manifest.ts`); the directive's single Concept→Release pipeline is split at the source-PNG seam so `AI_ASSET_PIPELINE` never duplicates the build owned by `ASSETS.md`/`ADR-006`.

**05.5e delivered** — the audio canon (`docs/assets/`), written before a single note exists so v0.2's sound lands inside a locked direction, exactly as the art did:

- `AUDIO_DIRECTION.md` (CREATE) — audio _intent_ governed by one principle: **sound you can leave running all day**. Music is sparse/ambient/optional, ambience is the world's quiet breath, nothing ever alarms (`VISION.md §2.1, §2.2` are audio's binding constraints — `STYLE_LOCK.md` binds only the visual canon), mixing keeps the game the guest, and loops are long/seamless/hook-free. Defers pipeline/format to `ADR-006 §8` + `ASSETS.md §3`, names to `NAMING_CONVENTION.md`.
- `MUSIC_LIBRARY.md` (CREATE) — the track catalog by context (time-of-day, weather, season, place, event), each entry carrying mood intent, loop behaviour, and its earliest ship tier per the roadmap (`VISION.md §4`); places match `WORLD_BIBLE.md §3`, and the only uneasy score is the v1.0 dungeon/boss.
- `SFX_LIBRARY.md` (CREATE) — the effect catalog whose `Event` column supplies the `<event>` token `NAMING_CONVENTION.md §4.2` builds `sfx_` file names from; action one-shots sync to the animation and fill the sim duration (`GAME_DESIGN.md §4.3`); tiers follow the feature roadmap (weather/animals v0.2, contracts v0.3, mining/factory v0.4, combat/magic/boss v1.0).

All three marked forward-looking — **no audio ships in v0.1** (`VISION.md §5.2`); docs-only, no code, no runtime change.

**05.5f delivered** — the visual language and the technical router (`docs/assets/`):

- `VISUAL_REFERENCE.md` (CREATE) — the visual **language**, completing the three-way split the docs pre-declared (`ART_DIRECTION` = philosophy, `STYLE_LOCK` = rules, this = language): nine visual keywords, inspiration as abstract qualities with learn/never-copy pairs, the attention hierarchy (distinct from the render order, `ARCHITECTURE.md §5`), shape and material grammar per category ("rounded = safe and present; angular = old, wild, or far away"; one signature cue per material at small size), composition rules, the lighting/colour/animation-feel language deltas, and the environmental-storytelling grammar `ART_DIRECTION.md §9` explicitly promised to this file. No values — hexes, sizes, and frame counts stay with their owners.
- `TECHNICAL_ASSET_SPEC.md` (ROUTER) — the one-hop index mapping every technical concern the directive listed to its existing owner (`ASSETS.md`, `ADR-006`, `PERFORMANCE.md`, `ARCHITECTURE.md §5`, `PIXEL_GUIDE.md`…), with unowned future concerns (auto-tiles, hit frames, combat layers) marked **"no owner yet"** as a binding statement rather than invented ad hoc. Owns exactly one thing: the **`GENERATION.md` asset-metadata schema** `AI_ASSET_PIPELINE.md §7` assigned here — per-directory generation provenance (AI model, prompt §+hash, palette/anim canon hashes, date, dependencies) using git hashes as version numbers (`ADR-006 §2`'s "git is the version store" rule reused). Unique ID/category/author/license are deliberately absent — each already has an owner.

Consistency edit in the same commit: `QUALITY_GUIDELINES.md §6` gains the checklist line requiring the `GENERATION.md` row for AI-generated assets, because the reviewer is the gate that enforces it.

**05.5g delivered** — the design canon (`docs/design/`, new directory) and the reconciliation report. **Phase 05.5 is complete.**

- `DESIGN_PRINCIPLES.md` (DEFER+DELTA) — the citation-friendly digest of the design philosophy: seventeen citable principles (P-01..P-17) in three groups (the player's day, the game, the craft), each with rationale, a practical example from the shipped game, and its `VISION.md`/`GAME_DESIGN.md` source. The directive's "highest-level design authority" framing was reconciled: `VISION.md` keeps that authority and wins every conflict — this doc is the digest that makes the philosophy quotable (`P-07` in a review, like `R-03`). A mapping table shows where each of the directive's ~26 suggested principle names landed.
- `CONTENT_RULES.md` (CREATE) — the design counterpart of `STYLE_LOCK.md`: twenty-one binding content-design rules (C-01..C-21) across connection, purpose, progression, economy, scale/identity, and future tiers, plus **the feature gate** (§3) — the single pre-implementation checklist merging file F's review-checklist demand with file H's feature-integration and loop-validation lists (one gate, one owner; `GAME_LOOPS.md §10` routes here). Worked examples show a pass (the market stall), a hard fail (a login streak), and a repairable fail (trophy fish).
- `GAME_LOOPS.md` (DEFER+DELTA) — the loop taxonomy (primary/secondary/meta/long-term/endgame, extending `VISION.md §3`'s three timescales), the three legal loop couplings, a tier-tagged catalog of sixteen secondary loops, the RPG web and city-defense loop with their constitutional constraints (`C-19`/`C-20`; raids may never destroy value while absent), resource-flow families each naming its mandatory pipe back into farming, the motivation and progression ladders, the idle-vs-active vocabulary, and an honest weak-point register (§12). Defers the canonical v0.1 loop, diagram, and numbers to `GAME_DESIGN.md §1`.
- **Reconciliation report** — completed in `docs/assets/README.md §5`: summaries of all twenty-five documents, the eleven conflicts found during authoring and their resolutions (all by ownership declaration, none open), recommended improvements before generation begins (golden set first, append-don't-renumber, prompt-palette sync, assign the "no owner yet" list deliberately), and the closing verdict: phase-06 art generation may begin on this canon.

---

## Document homes

| Directory               | Holds                                                                | Why here                                                                                     |
| ----------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `docs/assets/`          | All art, production, and audio docs (A, B, C, D, E, G)               | File A instructs `docs/assets/`; these govern asset generation.                              |
| `docs/design/` (new)    | The game-design docs (F) and the loop spec (H)                       | These are gameplay-design canon, not asset canon; a session seeking "game loops" looks here. |
| `docs/assets/README.md` | Index + ownership map + cross-reference table; reconciliation report | Anchor created first so cross-references resolve as docs land; report finalised in 05.5g.    |

---

## Ownership map

Each document is **CREATE** (new creative authority), **DEFER+DELTA** (owns only its creative slice; cites the technical owner for everything else), or **ROUTER** (chiefly a cross-reference index into existing docs).

| Document               | Mode        | Owns / defers to                                                                                                                                                                        |
| ---------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ART_DIRECTION`        | CREATE      | Visual philosophy, mood, emotion, lighting/shadow **intent**; cites `ASSETS.md §2` for camera/tile facts.                                                                               |
| `STYLE_LOCK`           | CREATE      | The immutable creative DO-NOTs. Keystone doc; every other doc references it.                                                                                                            |
| `PIXEL_GUIDE`          | DEFER+DELTA | Owns per-category sprite sizes (character/building/tree/crop/object); defers base tile, 1×/2×, rendering to `ASSETS.md §2, §8`.                                                         |
| `COLOR_PALETTE`        | CREATE      | **Canonical palette** (primary/secondary/season/biome/UI + accessibility/contrast). Fills the missing `PALETTE.md`; `ASSETS.md §2` repointed here.                                      |
| `QUALITY_GUIDELINES`   | DEFER+DELTA | Human creative-acceptance review; defers automated/build validation to `ASSETS.md §12, §13`.                                                                                            |
| `NAMING_CONVENTION`    | DEFER+DELTA | Extended families (audio `bgm_`/`sfx_`, portraits, music, icons); defers core sprite/tile/entity naming to `ASSETS.md §6`.                                                              |
| `FOLDER_STRUCTURE`     | DEFER+DELTA | Future **content taxonomy** (characters/animals/monsters/bosses/portraits…); defers build tree + atlas grouping to `ASSETS.md §4`, `ADR-006 §2, §3`.                                    |
| `CHARACTER_BIBLE`      | CREATE      | Character visual canon (proportions, silhouette, readability, customization rules).                                                                                                     |
| `WORLD_BIBLE`          | CREATE      | World visual/physical canon (biomes, architecture, regions).                                                                                                                            |
| `LORE_BIBLE`           | CREATE      | Narrative canon; cites `VISION.md` for tone/product intent.                                                                                                                             |
| `UI_STYLE_GUIDE`       | DEFER+DELTA | Visual UI look (buttons/panels/HUD aesthetics); defers UI **philosophy** to `GAME_DESIGN.md`, framework to `ADR-005`.                                                                   |
| `ICON_GUIDE`           | CREATE      | Icon design standards; cites `ASSETS.md §3` for sizes/atlas.                                                                                                                            |
| `ANIMATION_GUIDE`      | DEFER+DELTA | Creative frame-counts / FPS feel / loop **intent** per action; defers format, tick semantics, manifest to `ASSETS.md §7`.                                                               |
| `ASSET_CATALOG`        | CREATE      | Production backlog (estimate/priority/phase/dependencies). Renamed from `ASSET_MANIFEST` to avoid colliding with the generated `manifest.ts` (`ASSETS.md §5`).                          |
| `PROMPT_LIBRARY`       | CREATE      | Reusable AI generation prompts; embeds `STYLE_LOCK` + `COLOR_PALETTE` + `ASSETS.md §2` so every prompt is self-consistent.                                                              |
| `AI_ASSET_PIPELINE`    | DEFER+DELTA | The **concept → approved source PNG** authorial workflow; defers **source → runtime** (naming/atlas/import/versioning/release) to `ASSETS.md §1` + `ADR-006`.                           |
| `AUDIO_DIRECTION`      | CREATE      | Audio/music/ambience **intent** (v0.2+); cites `ADR-006 §8`, `VISION.md §5.2`.                                                                                                          |
| `MUSIC_LIBRARY`        | CREATE      | Forward-looking music catalog.                                                                                                                                                          |
| `SFX_LIBRARY`          | CREATE      | Forward-looking SFX catalog.                                                                                                                                                            |
| `VISUAL_REFERENCE`     | CREATE      | Detailed visual **language** (shape/material/composition/lighting/color-emotion). Boundary: `ART_DIRECTION` = philosophy, `STYLE_LOCK` = rules, this = language.                        |
| `TECHNICAL_ASSET_SPEC` | ROUTER      | Cross-reference index into `ASSETS.md` / `ADR-006` / `PERFORMANCE.md` / `ARCHITECTURE.md §5`; owns **only** the new asset-metadata schema (AI model, prompt version, palette version…). |
| `DESIGN_PRINCIPLES`    | DEFER+DELTA | A short, memorable principle list that **distills and cites** `VISION.md`; does not restate it.                                                                                         |
| `CONTENT_RULES`        | CREATE      | The feature-gate design checklist; cites `VISION.md` / `GAME_DESIGN.md`.                                                                                                                |
| `GAME_LOOPS`           | DEFER+DELTA | Multi-tier loop taxonomy (primary/secondary/meta/long/endgame) + future loops + resource-flow diagrams; defers the canonical v0.1 loop and its numbers to `GAME_DESIGN.md §1`.          |

---

## Deliverables by sub-milestone

Every doc: states its `Owns / Does not own` header in the house style, cross-references rather than duplicates, and justifies non-obvious decisions (per file H: _"every decision must include justification"_).

### 05.5a — Creative foundation (file A) → `docs/assets/`

- [ ] `README.md` — index, the ownership map above, and the cross-reference contract; reconciliation section stubbed for 05.5g.
- [ ] `ART_DIRECTION.md` — visual philosophy, identity, audience, mood/emotion, pixel density, camera/perspective (citing `ASSETS.md §2`), lighting & shadow intent, atmosphere, environmental storytelling, season feeling, animation philosophy, long-term scalability.
- [ ] `STYLE_LOCK.md` — the comprehensive immutable DO-NOT list; declared the highest creative authority for asset generation.
- [ ] `PIXEL_GUIDE.md` — per-category size table + outline/transparency/layer/frame recommendations; defers base-tile & rendering rules to `ASSETS.md §2, §8`.
- [ ] `COLOR_PALETTE.md` — canonical palette families with hex, emotional rationale, season/biome/UI palettes, accessibility + contrast rules. **Also: repoint `ASSETS.md §2` here.**
- [ ] `QUALITY_GUIDELINES.md` — creative rejection criteria; cites `ASSETS.md §12, §13` for the automated gate.
- [ ] `NAMING_CONVENTION.md` — extended naming families; defers core naming to `ASSETS.md §6`.
- [ ] `FOLDER_STRUCTURE.md` — future content taxonomy; defers build/atlas structure to `ASSETS.md §4`, `ADR-006`.

### 05.5b — Bibles (file B) → `docs/assets/`

- [x] `CHARACTER_BIBLE.md` · [x] `WORLD_BIBLE.md` · [x] `LORE_BIBLE.md` — with explicit consistency rules and a boundary note against `VISION.md`/`GAME_DESIGN.md`. Also: `COLOR_PALETTE.md §3.5` skin/hair/cloth added (character colour values belong in the palette).

### 05.5c — UI, icon & animation guides (file C) → `docs/assets/`

- [x] `UI_STYLE_GUIDE.md` (defers UI philosophy to `GAME_DESIGN.md`, framework to `ADR-005`) · [x] `ICON_GUIDE.md` (cites `ASSETS.md §3`) · [x] `ANIMATION_GUIDE.md` (defers format to `ASSETS.md §7`).

### 05.5d — AI production system (file D) → `docs/assets/`

- [x] `ASSET_CATALOG.md` — full catalog with estimate/priority/production-phase/dependencies; header note distinguishing it from the generated `manifest.ts`. Renamed from `ASSET_MANIFEST`.
- [x] `PROMPT_LIBRARY.md` — reusable prompts per asset class incl. style/perspective/palette/resolution/lighting/negative prompts + consistency rules.
- [x] `AI_ASSET_PIPELINE.md` — the concept→approved-source workflow; defers the build half to `ASSETS.md §1` + `ADR-006`.

### 05.5e — Audio (file E) → `docs/assets/`

- [x] `AUDIO_DIRECTION.md` · [x] `MUSIC_LIBRARY.md` · [x] `SFX_LIBRARY.md` — all marked v0.2+ forward-looking; cite `ADR-006 §8`, `VISION.md §5.2`.

### 05.5f — Visual & technical reference (file G) → `docs/assets/`

- [x] `VISUAL_REFERENCE.md` — the full visual-language bible per file G's section list.
- [x] `TECHNICAL_ASSET_SPEC.md` — a router: each technical concern maps to its owning doc; owns only the new asset-metadata schema and its rationale.

### 05.5g — Design & loops (files F + H) → `docs/design/`

- [x] `DESIGN_PRINCIPLES.md` — distilled principles, each citing its `VISION.md` source.
- [x] `CONTENT_RULES.md` — feature design rules + the pre-implementation review checklist.
- [x] `GAME_LOOPS.md` — the full loop taxonomy and resource-flow diagrams from file H; defers v0.1 loop specifics to `GAME_DESIGN.md §1`.
- [x] **Reconciliation report** in `docs/assets/README.md` — per file H: summarise every document, list any conflicting decisions found, and recommend improvements. Flip this phase's status and close the milestone.

---

## Working method (docs-only cadence)

Adapted from the standing working cadence; the code-specific gates are N/A because no code changes.

1. **One sub-milestone at a time**, each landing as a single clean conventional commit, then pause for "continue".
2. **No TDD, no test/coverage/E2E gates** — Markdown only. The one applicable automated check is that nothing else changed: `git status` clean apart from the intended docs; if any tooling touches these paths, `npm run typecheck`/`lint` must still pass (they should be unaffected).
3. **Every commit updates this doc** — flip the Delivery-status row(s) to Delivered with a one-line summary — and adds a `CHANGELOG.md [Unreleased]` entry.
4. **Ownership discipline is the acceptance bar**: before writing any technical statement, check whether `ASSETS.md`/an ADR already owns it; if so, link instead of restating. A reviewer should find zero duplicated technical rules across the new docs and the existing ones.
5. **Consistency edits are minimal and in the same commit** as the doc that motivates them (the `ASSETS.md §2` repoint ships with `COLOR_PALETTE.md` in 05.5a; the `PLAN.md` row ships with 05.5a or the spec commit).

---

## Cross-reference contract

- Technical single-source-of-truth stays with: `ASSETS.md` (pipeline, naming, atlas groups, animation format, validation), `ADR-006` (why build-time pipeline), `PERFORMANCE.md` (budgets), `ARCHITECTURE.md §5` (render layers), `ADR-005` (UI framework), `GAME_DESIGN.md` (mechanics, numbers, UI philosophy), `VISION.md` (product intent).
- New creative docs **link** to those with section anchors; they never copy their contents.
- Every new doc carries the `Owns / Does not own` header so future overlaps are resolved by declaration, not duplication.

---

## Reconciliation report

**Delivered in 05.5g** — the report lives with the canon it reconciles: `docs/assets/README.md §5`. It contains the per-document summaries, the eleven conflicts found and resolved during authoring, the recommended improvements before generation begins, and the closing verdict.

---

## References

- Source directives: `fix/0.1/5.5Assets A.md` … `H.md`
- Existing owners: `docs/ASSETS.md`, `docs/decisions/ADR-006-asset-pipeline.md`, `docs/decisions/ADR-005-ui-framework.md`, `docs/PERFORMANCE.md`, `docs/ARCHITECTURE.md`, `docs/GAME_DESIGN.md`, `docs/VISION.md`, `docs/PLAN.md`
