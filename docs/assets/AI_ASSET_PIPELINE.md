# AI_ASSET_PIPELINE

> **Status:** Authoritative for the _authoring_ half of asset production — how a needed asset becomes an approved source PNG.
> **Owns:** The **concept → prompt → generation → review → approved source** workflow: how a session decides what to make, generates it, and gets it to a build-ready source file. The seam where authoring hands off to the build.
> **Does not own:** The **source → runtime** half — naming derivation, optimization, atlas packing, the typed manifest, import, versioning, and release. That is owned by `ASSETS.md` (§1, §4, §5, §6, §8, §12, §13) and `ADR-006`. This file routes to them; it never restates them.

**Boundary note.** The directive (`fix/0.1/5.5Assets D.md`) draws one long pipeline — _Concept → Prompt → Generation → Review → Validation → Naming → Optimization → Atlas Packing → Import → Versioning → Release_. Half of that already has an owner. So this document owns the **left half** (creative authoring, which had no home) and **routes the right half** to the technical owner that already built it. The dividing line is a single artifact: **an approved source PNG** placed in `assets/src/`. Everything before it is here; everything after it is `ASSETS.md` + `ADR-006`.

---

## 1. The whole pipeline, with ownership marked

```
  CONCEPT            ┐
     ↓               │
  PROMPT             │  OWNED HERE
     ↓               │  (creative authoring —
  AI GENERATION      │   had no prior home)
     ↓               │
  REVIEW             ┘
     ↓
 ┌─ APPROVED SOURCE PNG ─┐   ← the seam: a build-ready file in assets/src/
     ↓
  NAMING             ┐
  OPTIMIZATION       │  OWNED BY ASSETS.md + ADR-006
  ATLAS PACKING      │  (the build — already exists,
  IMPORT (manifest)  │   already enforced by tests)
  VALIDATION         │
  VERSIONING         │
  RELEASE            ┘
```

The build half is not re-explained here. It is: place the file per `ASSETS.md §4` (atlas dir) and `§6` (name), commit the `.aseprite` source and the `ATTRIBUTION.md` entry (`§11`), run `npm run assets`, and reference it via `Sprites.*` (`§5`). All of it is the `ASSETS.md §12` checklist, enforced by `ASSETS.md §13` validation and `ADR-006`. This document's job is done when a correct source PNG exists.

---

## 2. Concept — decide what to make

- **Pull the need from `ASSET_CATALOG.md`.** The catalog is the backlog: what is needed, at what priority, for which phase. Production works the catalog, not a session's whim.
- **Read the domain canon before generating.** A character → `CHARACTER_BIBLE.md`; a place/structure → `WORLD_BIBLE.md`; an icon → `ICON_GUIDE.md`; a UI element → `UI_STYLE_GUIDE.md`; anything animated → `ANIMATION_GUIDE.md`. These define what the asset must _be_.
- **Confirm the size and pivot** in `PIXEL_GUIDE.md §2, §3` before generating — the canvas is fixed, not chosen per asset.

---

## 3. Prompt — turn the concept into a generation request

Use the matching entry in `PROMPT_LIBRARY.md`. Every prompt there already embeds the immutable style — the palette (`COLOR_PALETTE.md`), the perspective and outline (`ASSETS.md §2`), and the `STYLE_LOCK.md` prohibitions as negative prompts — so a correctly-used prompt starts inside the canon rather than drifting out of it. Do not hand-write a prompt that bypasses the library; extend the library instead.

---

## 4. AI Generation — produce candidates

- **Generate to the exact canvas** from `PIXEL_GUIDE.md §2`, at 1× (with the 2× variant per `ASSETS.md §2`).
- **The model is a _concept generator_, not an authority.** AI pixel-art output rarely satisfies the hard rules (1 px `#3A3640` outline, hard alpha, exact palette, upper-left light) on the first pass. Expect to clean up in the authoring tool (Aseprite, `ASSETS.md §3`) — snap colours to the palette, fix the outline to 1 px, remove anti-aliasing (`STYLE_LOCK.md R-02, R-04, R-08`). The generator proposes; the human/session disposes.
- **Author the source, not just the pixels.** The deliverable is a clean `.png` **and** its `.aseprite` source (`ASSETS.md §3`, `§12`).

---

## 5. Review — the creative gate before the build

This is the decisive step this document adds. Before an asset becomes a source file, it passes **`QUALITY_GUIDELINES.md`** — the creative rejection review, every criterion of which maps to a `STYLE_LOCK.md` rule. The one-line test governs (`STYLE_LOCK.md`): _would a player believe the same hand made this and the storage shed?_

- **Reject and regenerate** on any style-lock violation — that is cheaper than a foreign-looking asset entering the library.
- **Record provenance now** (`STYLE_LOCK.md R-18`, `ASSETS.md §11`): source, author, license. An asset of unclear origin does not proceed — reconstructing it later is impossible.
- **Approved output = a build-ready source PNG** (+ `.aseprite` + attribution) that satisfies the whole style canon. This is the seam (§1).

The review here is the **human/creative** gate; it is distinct from and precedes the **automated build** gate (`ASSETS.md §13` — orphan/dangling/dimension/atlas-budget/draw-call/attribution checks). Both must pass; this doc owns only the first.

---

## 6. Hand-off to the build (routed, not owned)

At the seam, follow `ASSETS.md §12` exactly — this document does not duplicate it:

1. Place in the correct atlas-group directory — `ASSETS.md §4`, `FOLDER_STRUCTURE.md`.
2. Name per `ASSETS.md §6.1`.
3. Commit the `.aseprite` source and update `ATTRIBUTION.md` — `ASSETS.md §11`.
4. Run `npm run assets`; confirm the generated `Sprites.*` key — `ASSETS.md §5`.
5. Reference by manifest key only, never a string literal — `ASSETS.md §5.1`.
6. For animation, ensure the `*.anim.json` sidecar and `animatingEntityCount` accounting — `ASSETS.md §7, §7.1`.

Why the build half is not ours: it is already specified, already enforced by tests, and already justified by `ADR-006`. Restating it would create a second source of truth — the exact failure this whole phase exists to prevent.

**Replacing a placeholder is the common case and needs no code change:** drop a production PNG with the same filename into its atlas dir and run `npm run assets` (`ASSETS.md §7.3`). The worker sprites and item icons currently in the repo are placeholders awaiting exactly this.

---

## 7. Versioning & release (routed)

- **Source is committed; generated `dist/` is not** (`ADR-006 §2`, `ASSETS.md §1`) — `dist/` is gitignored and fully reproducible, so an asset "version" is just its committed source under normal git history. There is no separate asset version store.
- **Release** carries no extra asset step beyond the standing gates: the `ASSETS.md §13` validation and the `PLAN.md §8` release gates (attribution complete, texture budget met, draw-call check green). Assets ride the normal build.
- **Palette/prompt versioning** is the one authoring-side version concern: when `COLOR_PALETTE.md` changes, `PROMPT_LIBRARY.md` and `STYLE_LOCK.md` update with it (`COLOR_PALETTE.md §10`), and prior assets are re-reviewed against the new palette. `TECHNICAL_ASSET_SPEC.md` (phase-05.5f) owns the asset-metadata schema that records which palette/prompt version an asset was made under.

---

## 8. Consistency rules

1. **Work the catalog, read the canon** (§2) — never generate an asset the backlog didn't ask for or the domain doc didn't define.
2. **Prompt from the library** (§3) — never a hand-rolled prompt that bypasses the embedded style.
3. **The model proposes; review disposes** (§4, §5) — no AI output enters `assets/src/` without passing `QUALITY_GUIDELINES.md`.
4. **Provenance before entry** (`STYLE_LOCK.md R-18`, `ASSETS.md §11`) — unclear-origin assets never proceed.
5. **The seam is a source PNG.** Everything past it is owned by `ASSETS.md` + `ADR-006`; this file routes, never restates.

---

## 9. Related documents

| Document                                  | Relationship                                                      |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `ASSET_CATALOG.md`                        | The backlog this workflow consumes (what to make, when)           |
| `PROMPT_LIBRARY.md`                       | The prompts step §3 uses                                          |
| `QUALITY_GUIDELINES.md`                   | The creative review gate §5 runs                                  |
| `ASSETS.md §1, §4, §5, §6, §11, §12, §13` | The build half this file routes to                                |
| `ADR-006`                                 | Why the build half is build-time; source-committed/dist-generated |
| `PIXEL_GUIDE.md §2, §3`                   | The canvas/pivot fixed before generation                          |
| `STYLE_LOCK.md`                           | The rules the review enforces (R-02, R-04, R-08, R-17, R-18)      |
| `TECHNICAL_ASSET_SPEC.md` (05.5f)         | The asset-metadata schema (model/prompt/palette version)          |
