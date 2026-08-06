# ADR-026: Content Identity and Provenance

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh)
**Bound by (not re-litigated):** ADR-004 §5 (definitions are data; instances reference them by `ContentId`); ADR-002 §5 and `SAVE_FORMAT.md` §8 (namespaced save partitioning, absent data preserved); ADR-015 §4 (the compatibility matrix, and quarantine for unknown content); `AI_RULES.md` §1.4 (content IDs are permanent); ADR-012 (the freeze this is authored under).
**Related:** ADR-019 is bound by this decision and should be read after it.

---

## Context

v0.1 shipped a content identity that works and is, so far, correct: every crop, item, building, and tile kind is `namespace:name`, validated at registration (`src/sim/content/registry.ts`), permanent by rule, and referenced from saves by ID rather than inlined (ADR-004 §5).

It also carries an assumption that is about to stop being true. Every document that discusses identity discusses it in terms of **two** sources — `core` and "plugins":

- `plugins/README.md` frames namespacing entirely around mods.
- `SAVE_FORMAT.md` §8 partitions save data under a `plugins` key.
- ADR-002 §5 speaks of "a plugin absent on load".

The roadmap needs **five**:

| Source kind            | Example                 | Ships how                   | Trusted? |
| ---------------------- | ----------------------- | --------------------------- | -------- |
| Built-in               | `core:wheat`            | In the application bundle   | Yes      |
| Official content pack  | a first-party expansion | With or after a release     | Yes      |
| Third-party plugin     | `someMod:dragonfruit`   | Installed by the player     | No       |
| Generated content pack | an AI-authored crop set | Generated locally or shared | No       |
| Downloadable content   | a paid or gated pack    | Delivered post-install      | Yes      |

If save compatibility is designed around _plugins_ specifically, then every other source is either a special case with its own rules — two mechanisms that will drift — or it has to masquerade as a plugin, which makes the record lie about where a player's content came from. Both outcomes surface at the worst possible moment: a player opens a save whose content is missing and the game cannot tell them _what_ is missing or _why_.

This ADR exists because identity is the one thing in this project that can never be migrated. A growth time is a data edit; a save field is a migration; a content ID is forever (`AI_RULES.md` §1.4). Deciding the identity model with one source in existence is cheap. Deciding it with five is not possible.

---

## Decision

**There is one content identity model and one isolation guarantee, shared by every source of content the project will ever have. A `ContentId` is `namespace:name`; a namespace is owned by exactly one content source; a content source declares a provenance that the engine records and never branches on. Content from an absent source is isolated, never destroyed, and restored intact when the source returns.**

### 1. Identity is the namespace, and it belongs to a source

```
namespace:name        core:wheat  ·  harvestmoon:sunflower  ·  someMod:dragonfruit
```

Unchanged in form from v0.1 (`src/shared/ids.ts`) — lowercase, alphanumeric plus underscore, exactly one colon. What this ADR adds is the statement above it:

> **A namespace is owned by exactly one content source, permanently. A content source may own more than one namespace. Two sources may never claim the same namespace, and a claim collision is a load failure, not a merge.**

`core` is reserved for built-in content forever. A small set of additional namespaces is reserved for official use so a third party cannot occupy the name a future first-party pack needs; the reserved list lives in `src/shared/ids.ts` beside the validator, because a reservation nobody can check is not a reservation.

### 2. Provenance is recorded, and the engine never branches on it

Every content source declares what kind of thing it is:

```
ContentSource {
  namespaces        the namespaces it owns
  provenance        builtin | official | thirdParty | generated | dlc
  displayName       what the player is told when it is missing
  version           the source's own version, independent of the engine's
}
```

**Provenance exists for three purposes and no others:** telling the player what is missing in words they recognise, deciding trust _at load time_ (ADR-019 §5), and support diagnostics.

> **No simulation system, no command, no registry lookup, and no save-format rule may read provenance.** A system that asks "is this core content?" has the same defect as a system that asks `switch (cropId)` — it is `ARCHITECTURE.md` §3.4's rule with a different disguise.

This is the load-bearing half of the decision, and it is what makes goal 9 — _official content and third-party plugins share one extension model_ — true rather than aspirational. First-party content earns no privilege at runtime. If an official pack can do something a third-party pack cannot, the difference is visible at load, in the trust decision, and nowhere downstream.

### 3. The isolation invariant

> **Removing a content source may affect only entities, containers, side-tables, and save partitions whose `ContentId` lies in a namespace that source owns. Nothing else in the save may change.**

This is stated as one sentence because it is meant to be a test. It generalises `SAVE_FORMAT.md` §8 (plugin partitions preserved) and ADR-015 §4 (unknown content quarantined) from two adjacent rules about mods into one rule about content, and it is what makes every row of §Context's table safe.

Concretely, when a source is absent:

| Save content                                   | Behaviour                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| An instance referencing an unknown `ContentId` | Quarantined verbatim with its owning state, restored when the ID returns |
| A container holding stacks of unknown items    | The unknown stacks quarantine; the rest of the container is untouched    |
| A save partition under the source's key        | Preserved byte-for-byte, written back unread (ADR-002 §5)                |
| Anything at all in another namespace           | **Untouched.** This is the invariant                                     |

The quarantine mechanism already exists — phase-07b built it, `SAVE_FORMAT.md` §5.3 specifies it, and the document has carried a `quarantine` section since version 1. v0.2 does not build it; it promotes it from an edge case to the primary guarantee and gives it a namespace-keyed index so "remove everything from this source" is one operation rather than a scan.

### 4. Saves record which sources were present

A save gains a **source manifest**: the list of content sources active when it was written, with their namespaces, provenance, display names, and versions.

It is informational — it never drives load behaviour, exactly as `meta.gameVersion` never does (ADR-015 §2). Its purpose is that a returning player is told _"Harvest Moon Expansion is not installed — 14 crops are being kept safe"_ instead of being shown fourteen orphaned IDs, or worse, nothing at all. Without it, the game knows an ID is unknown but has no way to name the thing that owned it.

It is a `world`-level addition, so it arrives with a schema bump and a migration whose default is the empty manifest (ADR-027).

### 5. Identity is permanent; everything else about content is data

Restating `AI_RULES.md` §1.4 in this ADR's terms, because it is now binding on five kinds of author rather than one:

| Property            | May change?                 | Why                                                           |
| ------------------- | --------------------------- | ------------------------------------------------------------- |
| `ContentId`         | **Never**                   | Saves reference it forever                                    |
| Namespace ownership | **Never**                   | Transfers would orphan every save written before the transfer |
| Display name        | Freely                      | Presentation                                                  |
| Definition fields   | Freely, by the source       | ADR-004 §5 — rebalancing is a data edit, not a migration      |
| Provenance          | Only by the source's author | Trust is decided at load                                      |

A source that needs a different ID ships a **new** ID and, if it wants continuity, its own migration inside its own save partition. Core never migrates another source's data (ADR-002 §5), and this ADR does not change that.

### 6. What this does not decide

Loading, sandboxing, dependency resolution, capability grants, and the API surface are ADR-019's. This ADR decides only what a content identity _is_, who owns it, and what removing its owner may touch — the questions ADR-019 needs answered before it can be written.

---

## Alternatives Considered

### A. Keep the two-source model; treat official packs as first-party plugins

- **For:** no new concept; the `plugins` key already exists.
- **Against:** it makes the save's record of provenance false. A player asking "where did this crop come from" and a support session asking "which build shipped this" both get "a plugin", which is exactly the information they needed. It also invites a privileged-plugin escape hatch the first time an official pack wants something the API does not expose — and that hatch is how the shared extension model dies.
- **Rejected because:** the cost of the honest model is one enum field and a display name.

### B. Numeric content IDs with a save-side mapping table

- **For:** compact saves; renames become free.
- **Against:** the mapping table becomes save state that can itself rot, and a corrupted table orphans _everything_ rather than one namespace — the opposite of §3's invariant. It also makes a save unreadable by eye, which is the property ADR-002 chose JSON for.
- **Rejected because:** it trades the one property that makes broken saves diagnosable for a size saving `SAVE_FORMAT.md` §3.4 shows is unnecessary.

### C. Per-source ID spaces (a source's IDs are meaningful only within it)

- **Rejected because:** a recipe from one source could not name an item from another, which forecloses the cross-pack composition that makes an ecosystem worth having. One flat namespaced space is what lets `someMod:pie` require `core:wheat`.

### D. Infer provenance from install location

- **For:** no declaration to maintain.
- **Rejected because:** it is not durable — a save outlives the directory layout that produced it, and a player who moves a folder changes what the game believes about their content. Provenance travels with the source and into the save, or it is not a record.

### E. Delete unknown content on load, with a warning

- **Rejected outright.** `user saves are user data` (ADR-015 §4). A player who uninstalls a pack to try something else, then reinstalls it, must find their farm intact. This alternative is named only so no future session proposes it as a simplification.

---

## Tradeoffs Accepted

| We accept                                                  | To gain                                           | Mitigation                                                        |
| ---------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------- |
| A source manifest in every save                            | Missing content can be named, not just detected   | A handful of small records; informational, so it never gates load |
| Namespace reservations must be maintained by hand          | A third party cannot squat a future official name | The reserved list sits beside the validator and is tested         |
| Quarantine must index by namespace, not just by unknown ID | "Remove this source" is one operation, not a scan | Built once, in Phase 08, before any second source exists          |
| Five provenance kinds exist before three of them do        | The model never has to be widened later           | It is one enum with no behaviour attached — §2 forbids branching  |

---

## Consequences

### Immediate (Phase 08 implements)

- A `ContentSource` record and a source registry join `src/sim/content/`; `plugins/core/` is the first source registered through it (ADR-019 §2).
- The reserved-namespace list and its validator land in `src/shared/ids.ts`.
- Quarantine gains a namespace index. No behaviour changes for existing saves — v0.1 saves contain exactly one namespace.
- The save's source manifest is specified in `SAVE_FORMAT.md` and delivered under ADR-027's schema bump.

### Ongoing (binding on every future session)

- **Never branch on provenance** outside the load-time trust decision and player-facing display.
- **Never transfer a namespace** between sources. A new owner means new IDs.
- **Never resolve an unknown ID by discarding it.** Quarantine, always.
- A new source kind is a new enum member and a new display string — never a new isolation rule.

### Validation

- **Isolation property test:** for an arbitrary world containing content from two sources, removing either source leaves every entity, container, side-table, and partition belonging to the other byte-identical.
- **Round-trip through absence:** save with a source, remove it, load, save, restore the source, load — the world equals the original.
- **Collision test:** two sources claiming one namespace fail the load with a typed error, and neither is partially registered.
- **Provenance-blindness test:** a grep-level assertion that no module under `src/sim` reads a provenance field, in the spirit of the existing boundary checks.

### Revisit if

- A content source genuinely needs to own a namespace another source created → it does not. Ship new IDs and migrate inside the source's own partition.
- Save size from the source manifest becomes measurable → it will not; but the cap in `SAVE_FORMAT.md` §3.4 already governs it.

---

## Related

| Document                  | Relationship                                                            |
| ------------------------- | ----------------------------------------------------------------------- |
| ADR-019                   | The plugin API, bound by this model                                     |
| ADR-027                   | The schema bump carrying the source manifest, and the isolation testing |
| ADR-004 §5                | Definitions vs instances — the split this identity rides on             |
| ADR-002 §5, ADR-015 §4    | The preservation and quarantine rules this generalises                  |
| `SAVE_FORMAT.md` §5.3, §8 | The specification updated by this decision                              |
| `plugins/README.md`       | Rewritten from a mod document into a content-source document            |
