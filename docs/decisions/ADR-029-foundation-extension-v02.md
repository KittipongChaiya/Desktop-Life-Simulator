# ADR-029: Foundation Extension — v0.2

|                   |                                    |
| ----------------- | ---------------------------------- |
| **Status**        | Proposed — closes `ROADMAP.md` §12 |
| **Date**          | 2026-08-14                         |
| **Deciders**      | Project owner                      |
| **Extends**       | ADR-012 (Foundation Freeze — v0.1) |
| **Supersedes**    | —                                  |
| **Superseded by** | —                                  |

---

## Context

ADR-012 froze the constitutional layer after v0.1, and its timing was the
argument: it followed phase-05.6 rather than preceding it, so what was frozen
had been **validated by production** rather than proposed and protected in
advance.

`ROADMAP.md` §12 asks for the same judgement one version later — _"a
foundation-extension ADR in ADR-012's mould, proposing which of ADRs 013–027
join the frozen set — written here, after production has validated them."_

Fifteen ADRs landed across v0.2. They have not had equal exposure, and treating
them as one block would freeze decisions the code has barely exercised.

---

## Decision

**Freeze the eight ADRs that production actually pushed on. Leave seven
unfrozen, each for a stated reason.**

### Joining the frozen set

| ADR                             | What validated it                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-015** save versioning     | Five migrations, a field **removed**, and 45 compatibility assertions across every prior fixture. §4's forward refusal is what ADR-025 §2 was built around. |
| **ADR-019** plugin architecture | `plugins/core` goes through the public capabilities exclusively; `registerAudio` and `registerContent` both proved by first-party use before exposure.      |
| **ADR-023** audio architecture  | Rebuilt the device layer, category buses, ducking, and the §5 ambience amendment — with the measurement §5 demanded actually taken.                         |
| **ADR-024** worker scheduling   | The three-stage pipeline took roles, zones, shifts and priority without a new stage, which is the claim §2 makes. Determinism proven over 100k ticks.       |
| **ADR-026** content identity    | Every save in the chain round-trips through it; the isolation invariant held across a removal.                                                              |
| **ADR-027** v0.2 save evolution | Its own chain, executed. The pre-migration backup exists because this ADR required it.                                                                      |
| **ADR-020** time simulation     | Seasons and weather both derive from it; `ticksPerDay` is now a creation-time constant carried by every save.                                               |
| **ADR-022** weather simulation  | Survived the removal of `grid.moisture` and the derived-wetness rewrite, and its "no accumulator" rule caught a real defect during phase 12.                |

### Staying unfrozen

| ADR                              | Why not yet                                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ADR-025** distribution         | **Three of its guarantees are unproven** (`RELEASE-v0.2-RC.md` §4). Freezing a decision whose §4 has never been exercised against the shipping install path would protect a claim rather than a validated rule. |
| **ADR-028** signing exception    | Expires at 0.3.0 by construction. A frozen document with a self-destruct date is a contradiction.                                                                                                               |
| **ADR-021** seasonal simulation  | Correct and thin. It has one consumer shape (pricing, planting gates, ground tint) and has not yet been pushed by content that disagrees with it.                                                               |
| **ADR-013** economic simulation  | v0.2 added no economic pressure. It is v0.1's model still, and freezing it would be freezing something this version did not test.                                                                               |
| **ADR-014** desktop companion    | Extended twice in v0.2 (the update capability, per-category audio) and still growing. Freeze it when the extension points stop moving.                                                                          |
| **ADR-016** audio (three layers) | Already amended once by ADR-023 §5, and §4's deferral is only just resolved. Let the amendment settle for a version.                                                                                            |
| **ADR-017** game feel            | Its §2 conditions were reused verbatim by ADR-023 §5, which is evidence they generalise — but that is one reuse, not a pattern.                                                                                 |
| **ADR-018** developer tooling    | Actively changed this phase (the ambience metric). Tooling is the layer that should stay cheapest to change.                                                                                                    |

---

## Alternatives Considered

### A. Freeze all fifteen

- **For:** simple; one line; matches "v0.2 is done".
- **Rejected because:** it inverts ADR-012's own logic. The freeze earns its
  authority from validation, and ADR-025's untested paths, ADR-028's expiry, and
  ADR-013's total absence from this version are three different ways of not
  having been validated.

### B. Freeze none, defer to v0.3

- **For:** maximum flexibility; nothing to unfreeze later.
- **Rejected because:** it wastes the thing ADR-012 was built for. Eight of these
  were pushed hard by production — five migrations and a removal against ADR-015
  alone — and leaving them amendable by ordinary work invites exactly the drift
  the freeze exists to stop.

### C. Freeze by phase rather than by ADR

- **Rejected because:** phases are units of work, not of decision. ADR-016 and
  ADR-023 belong to different phases and the same subject, and one amends the
  other.

---

## Consequences

- The eight above join ADR-012 §The frozen set and take its amendment rules
  unchanged: a successor ADR, never an edit.
- The seven below stay under ordinary change control and should be reconsidered
  at the v0.3 equivalent of this document.
- **ADR-025 is the one to watch.** It is the only ADR held out for lack of
  evidence rather than lack of exposure, and closing the three paths in
  `RELEASE-v0.2-RC.md` §4 is what would qualify it.

### Revisit if

- The three unproven update paths are exercised against a published release →
  ADR-025 qualifies and should be proposed for the frozen set.
- A frozen ADR needs a change → that is the successor-ADR path, exactly as
  ADR-028 did for ADR-025 §3. The mechanism has now been used once in anger and
  worked.

---

## Related

| Document             | Relationship                                            |
| -------------------- | ------------------------------------------------------- |
| ADR-012              | The freeze this extends, and the timing logic it reuses |
| `RELEASE-v0.2-RC.md` | The evidence behind every "validated" claim above       |
| `ROADMAP.md` §12     | The deliverable this document is                        |
