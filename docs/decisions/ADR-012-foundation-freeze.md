# ADR-012: Foundation Freeze — v0.1

|                   |               |
| ----------------- | ------------- |
| **Status**        | Accepted      |
| **Date**          | 2026-07-23    |
| **Deciders**      | Project owner |
| **Supersedes**    | —             |
| **Superseded by** | —             |

---

## Context

The project's foundations are finished and, uniquely, **tested**. Phase-05.5 wrote the creative and design canon (~25 documents under `docs/assets/` and `docs/design/`); phase-05.6 validated that canon the only way it can be validated — by production: the golden set was authored strictly from the documents, and `docs/assets/ASSET_VALIDATION_REPORT.md` returned **GO** with every finding small, additive, and owned.

The risk this ADR closes is drift. Development from phase-06 onward is carried out by many sessions with no shared memory (`VISION.md §2.5`), and each session is capable of "improving" a foundation document mid-task — a rewording here, a re-litigated decision there. Foundations that are edited casually stop being foundations; every downstream citation (`R-xx`, `P-xx`, `C-xx`, ADR sections) silently loses its anchor. The canon exists precisely so a hundred sessions cohere; that only holds if the canon itself stops moving.

The moment is deliberate: **after** validation proved the foundations sufficient for production, **before** phase-06 opens the first big gameplay wave that would otherwise be tempted to bend them.

---

## Decision

**The following documents are stable and canonical as of v0.1. Further modification requires a new ADR or an explicit, recorded migration. Gameplay development continues from phase-06 onward on these foundations without redefining them.**

### The frozen set

**Architecture:**

- `docs/decisions/ADR-001` through `ADR-011`
- `docs/AI_RULES.md`

**Creative & design foundation:**

- `docs/assets/STYLE_LOCK.md`
- `docs/assets/WORLD_BIBLE.md`
- `docs/assets/CHARACTER_BIBLE.md`
- `docs/assets/ART_DIRECTION.md`
- `docs/design/GAME_LOOPS.md`
- `docs/design/DESIGN_PRINCIPLES.md`
- `docs/design/CONTENT_RULES.md`

### What the freeze means

1. **Normative content is fixed.** No session may change a rule, value, proportion, prohibition, decision, or boundary in a frozen document as part of ordinary work. The change path is a new ADR (for a decision) or an explicit migration (for a mechanical restructuring), reviewed like this one.
2. **The existing supersession mechanism is the amendment mechanism.** ADRs already carry `Supersedes` / `Superseded by`; a frozen ADR is amended only by a successor ADR that names it. The creative/design documents are amended only when a new ADR grants the specific change.
3. **Editorial repair is not modification.** Fixing a typo, a broken link, or a formatting artifact that changes no rule remains routine maintenance — the freeze protects meaning, not markdown.
4. **Documents outside the list keep their existing regimes.** `VISION.md` and `GAME_DESIGN.md` remain the product authorities they already are; the working guides (`COLOR_PALETTE.md`, `PIXEL_GUIDE.md`, `ICON_GUIDE.md`, `NAMING_CONVENTION.md`, the catalogs and libraries) remain amendable through their own documented change rules (e.g. `COLOR_PALETTE.md §10`). The freeze list is deliberately the _constitutional_ layer, not the working layer — the validation report's queued recommendations all target unfrozen documents and proceed normally.
5. **Frozen documents win conflicts by standing still.** Where a frozen document and a working document disagree, the working document is corrected — unless a new ADR decides otherwise.

---

## Consequences

- **Stable anchors.** `STYLE_LOCK.md R-01..R-18`, `DESIGN_PRINCIPLES.md P-01..P-17`, `CONTENT_RULES.md C-01..C-21`, the R-07 rig proportions, and every ADR section become permanent citation targets. Review gates, generation prompts, and future phase docs may cite them without fear of silent re-anchoring.
- **Phase-06 onward is gameplay, not philosophy.** Sessions build content and systems _on_ the foundations; a session that finds itself wanting to edit a frozen document has found an ADR to propose, not an edit to make.
- **The feature gate stands.** `CONTENT_RULES.md §3` is now the fixed pre-implementation checklist every phase-06+ feature passes — frozen, so it cannot be weakened by the feature it is gating.
- **Cost accepted:** genuine foundation improvements now pay ADR overhead. That is the point — the overhead is the review that separates improvement from drift.

---

## Related

| Document                                   | Relationship                                         |
| ------------------------------------------ | ---------------------------------------------------- |
| `docs/assets/ASSET_VALIDATION_REPORT.md`   | The production validation that earned this freeze    |
| `docs/assets/README.md §5`                 | The reconciliation that closed the canon's conflicts |
| `docs/phases/phase-05.6-vertical-slice.md` | The vertical slice this freeze follows               |
| `docs/PLAN.md`                             | Phase-06 onward proceeds on the frozen foundations   |
