# QUALITY_GUIDELINES

> **Status:** Authoritative for creative acceptance review.
> **Owns:** The criteria a human (or reviewing session) uses to **reject** an asset on visual grounds, and how creative review divides from automated validation.
> **Does not own:** The automated/build checks — orphan assets, dangling keys, dimension check, atlas budget, draw calls, attribution presence (`ASSETS.md §12, §13`); the rules themselves (`STYLE_LOCK.md`); the values (`COLOR_PALETTE.md`, `PIXEL_GUIDE.md`).

This document is the **eyes** stage of asset acceptance. The build already refuses assets that are technically wrong (`ASSETS.md §13`); this catches the ones that pass the build but are _visually_ wrong — off-palette, mixed perspective, style-drifted. Every rejection here maps to a specific `STYLE_LOCK.md` rule, so "I don't like it" is never the reason — a broken rule is.

---

## 1. The one-line test

Before anything else, ask the `STYLE_LOCK.md` test: **"Would a player believe the same hand made this and the storage shed?"** If no, a rule below is being broken. Find which one. This single question catches most drift faster than any checklist.

---

## 2. Reject-when catalogue

Each row: the visible symptom, the rule it violates, and what to look for. Reject on any single row — quality is conjunctive, not a score to average.

| Reject when…           | Violates                                                    | What to look for                                                                               |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Blurry / soft**      | `R-02`, `R-16` · `ASSETS.md §8`                             | Anti-aliased or feathered edges, gradients, soft alpha, detail that mush at 1×.                |
| **Wrong palette**      | `R-08`, `R-09` · `COLOR_PALETTE.md §3–4`                    | Any hex not in a named ramp; reserved accents (gold/violet/red) spent on décor.                |
| **Mixed perspective**  | `R-05` · `PIXEL_GUIDE.md §6`                                | Isometric or front-elevation object among top-down; ground showing side faces.                 |
| **Wrong pixel size**   | `R-15` · `PIXEL_GUIDE.md §1–2`                              | Off-grid density, wrong canvas for the category, non-integer up/downscaling.                   |
| **Broken animation**   | `R-11`, `R-12` · `PIXEL_GUIDE.md §8`                        | Jitter, ms-based timing, popping frames, or a loop that never releases `animatingEntityCount`. |
| **Style drift**        | `R-01`, `R-04`, `R-07`, `R-17`                              | Realistic shading, variable line weight, off proportions — "different hand" feel.              |
| **Incorrect shadows**  | `R-06` · `PIXEL_GUIDE.md §7`                                | Light not from upper-left; hard drop shadow instead of a soft contact ellipse.                 |
| **Incorrect outlines** | `R-03`, `R-04` · `PIXEL_GUIDE.md §5`, `COLOR_PALETTE.md §2` | Pure-black outline, ≠ 1 px weight, variable thickness, or outlined terrain.                    |

Any symptom not listed still fails if it breaks a `STYLE_LOCK.md` rule — the catalogue is the common set, not the whole law.

---

## 3. Blurry, wrong-size, and drift: the three that slip through

Most rejected assets fail one of three ways, so they get extra scrutiny:

- **Blur (`R-02`).** The most common AI-generation failure. Zoom to 1× (never judge at 4×). If any silhouette pixel is partially transparent or any shade is a smooth gradient rather than a ramp step (`COLOR_PALETTE.md §3`), reject.
- **Wrong size (`R-15`).** The build catches a tile that is not exactly 32×32 (`ASSETS.md §13` dimension check); it does **not** catch a character authored at the wrong canvas or a 16-grid sprite dropped among 32-grid art. That is this review's job (`PIXEL_GUIDE.md §2`).
- **Drift (`R-17`).** The subtlest. Place the candidate beside an accepted asset of the same category and look for a change in line weight, proportion, or shading logic. Drift is invisible alone and obvious side-by-side.

---

## 4. Accessibility is a rejection criterion

State conveyed by **hue alone is a defect**, not a preference (`R-14`, `COLOR_PALETTE.md §9`). Positive/negative, valid/invalid, common/rare must also differ in **shape, icon, or value** — a check vs an X, a glint vs none — so the ~8% of players with a colour-vision deficiency read the same signal. Reject any asset or state pair that separates only by colour.

---

## 5. Creative review vs build validation — who owns what

The two stages are complementary and must not duplicate. If a check can be automated, it belongs to the build; if it needs a trained eye, it belongs here.

| Creative review owns (this doc)                                   | Build validation owns (`ASSETS.md §13`)               |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| Palette adherence — is this a _named_ colour, used _meaningfully_ | Orphan assets — is it referenced at all               |
| Perspective, proportion, silhouette readability                   | Dangling keys — does the manifest key resolve         |
| Shading & light direction, contact shadows                        | Dimension check — is a tile exactly 32×32             |
| Style cohesion / drift ("same hand" test)                         | Atlas budget — texture memory within `PERFORMANCE.md` |
| Animation _feel_ and legibility                                   | Draw calls — the reference farm ≤ 30                  |
| Accessibility (never hue-alone)                                   | Attribution present in `ATTRIBUTION.md`               |

The build is the gate that cannot be skipped; creative review is the gate that cannot be automated. An asset ships only when it clears **both**.

---

## 6. Creative reviewer checklist

Complements the build-side checklist in `ASSETS.md §12` (naming, atlas dir, `.aseprite` source, attribution, `Sprites.*` reference) — do not re-run those here; run these:

- [ ] Judged at **1× on the overlay zoom**, not enlarged.
- [ ] Every colour traces to a named ramp or a meaning-carrying accent (`COLOR_PALETTE.md`).
- [ ] Outline is `#3A3640`, exactly 1 px, silhouette-only; terrain has none (`PIXEL_GUIDE.md §5`).
- [ ] One perspective, one upper-left light, correct category canvas & pivot (`PIXEL_GUIDE.md §2–3, §6–7`).
- [ ] Proportions match `CHARACTER_BIBLE.md`; silhouette reads in one glance.
- [ ] Animation timing is tick-based and legible; releases `animatingEntityCount` when idle (`ASSETS.md §7.1`).
- [ ] No state communicated by hue alone (`§4`).
- [ ] Passes the "same hand made the storage shed" test (`§1`).

---

## 7. Related documents

| Document                     | Relationship                                           |
| ---------------------------- | ------------------------------------------------------ |
| `STYLE_LOCK.md`              | The rules every rejection cites                        |
| `COLOR_PALETTE.md`           | Palette, contrast, and accessibility values            |
| `PIXEL_GUIDE.md`             | Sizes, outlines, pivots, light, animation frames       |
| `ASSETS.md §12, §13`         | The build-side checklist and automated validation gate |
| `ART_DIRECTION.md`           | The intent this review protects                        |
| `CHARACTER_BIBLE.md` (05.5b) | Proportion reference for drift checks                  |
