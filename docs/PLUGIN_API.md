# PLUGIN_API

> **Status:** **Outline.** The section structure and ownership below are decided (v0.2 Phase 0); the normative content of §3–§9 is written by Phase 08 as the API is built, and completed by Phase 09.
> **Owns:** The public plugin API — its surface, its version, its capability set, and the compatibility policy. **Anything not specified here is not public**, however reachable it happens to be.
> **Does not own:** Why the API is shaped this way (ADR-019), what a content ID is (ADR-026), how to write a plugin (`PLUGIN_GUIDE.md`), the manifest's machine-readable schema (`plugins/manifest.schema.json`).

This document is a **contract**. `AI_RULES.md` §1.4: _"The plugin-facing API is a contract from the moment it is documented, even before the loader exists."_

---

## 1. Versioning

```
PLUGIN_API_VERSION = 1
```

A content source declares the **API version** it targets. It never declares a game version — engine releases move for reasons no plugin can observe, and pinning to them manufactures breakage (ADR-019 §1).

| Declared by | Field           | Drives behaviour?                    |
| ----------- | --------------- | ------------------------------------ |
| A source    | `apiVersion`    | **Yes** — the only version that does |
| A source    | `version`       | No — informational                   |
| The engine  | supported range | Yes                                  |

**Support policy.** The engine supports every API version it has ever shipped. Removing support requires a successor ADR naming the reason. A capability may be deprecated — marked here, warned at load, kept working — but a version is not withdrawn.

---

## 2. The capability set

Designed in full so the shape never breaks; declared per version so nothing speculative ships. **A capability absent from a version's surface does not exist at that version** — not a stub, not a no-op, not a documented "coming soon" field.

| Capability              | v1  | Section |
| ----------------------- | --- | ------- |
| `registerContent`       | ✅  | §3      |
| `registerAssets`        | ✅  | §4      |
| `registerAudio`         | ✅  | §5      |
| `registerLocalization`  | ✅  | §6      |
| `registerConfiguration` | ✅  | §7      |
| `registerEffects`       | ✅  | §8      |
| `registerBehaviors`     | ✅  | §9      |
| `registerCommands`      | v2  | §10     |
| `registerEventListener` | v2  | §10     |
| `registerPanel`         | v2  | §10     |
| `consumeService`        | v2  | §10     |

### 2.1 What a source may never do

Binding at every version. Each prohibition names the mechanism that enforces it, because a rule with no detector is a wish (ADR-019 §5).

| Prohibition                      | Enforced by                                                                 |
| -------------------------------- | --------------------------------------------------------------------------- |
| Mutate simulation state directly | v1: structural — data cannot mutate                                         |
| Bypass the command dispatcher    | `submitCommand` is the only mutation surface a source is ever handed        |
| Modify `World` outside a command | Same                                                                        |
| Replace an engine service        | The API has no setter, override slot, or interception point                 |
| Modify a core registry           | `ContentRegistry.register` rejects duplicates; there is no update or delete |
| Patch internal engine code       | The eslint `plugins` boundary zone                                          |
| Access private engine APIs       | This document is the surface                                                |

### 2.2 Determinism obligations

A source inherits `src/sim`'s rules in full (`AI_RULES.md` §2.1): no `Math.random()`, no clock reads, no I/O, no imports of `pixi.js`, `react`, `electron`, or Node builtins. **A source that breaks determinism breaks save correctness for every player using it**, silently and unrecoverably.

At API v1 this is structural — a declaration cannot call a clock. At v2 it becomes a trust problem, which is why v2 is a successor ADR rather than a later phase.

---

## 3. `registerContent` — _Phase 08_

**Will own:** the definition shape per content kind (crops, trees, animals, items, recipes, buildings, tile kinds, decorations), the registration contract, validation rules and their typed rejections, and the rule that instances reference definitions by `ContentId` and never inline them (ADR-004 §5).

---

## 4. `registerAssets` — _Phase 08_

**Will own:** the manifest-fragment format, plugin atlas namespacing (`myMod:dragonfruit_0`), and the guarantee that plugin atlases are never repacked into core atlases. Cross-references `ASSETS.md` §10.

**Fixed already (ADR-019 §8):** assets are inert. Sprite keys, atlases, and sidecars carry no gameplay logic. Behaviour is declared through §9, never smuggled into an asset.

---

## 5. `registerAudio` — _Phase 13_

**Will own:** the sound definition shape and the engine's **closed** category set. A source assigns a sound to a category; it may not invent one (ADR-023 §2).

---

## 6. `registerLocalization` — _Phase 09_

**Will own:** string-table format and key namespacing for content and UI strings. Data only, in a format with no executable surface.

---

## 7. `registerConfiguration` — _Phase 09_

**Will own:** typed, defaulted settings surfaced in the plugin panel and stored under the source's own settings partition — never in the save, never mixed with another source's.

---

## 8. `registerEffects` — _Phase 12_

**Will own:** declarative binding of engine-provided visual effect primitives to declared event kinds. Effects inherit ADR-017 in full: pooled, leased, and derived-not-rolled randomness.

---

## 9. `registerBehaviors` — _Phase 09_

**Will own:** the `(condition, effect)` vocabulary — the enumerated primitives, their semantics, their composition rules, and their bounds.

**The shape is fixed (ADR-019 §4):** the engine owns the vocabulary and evaluates it; a source composes from it. This is the same split ADR-013 §4 uses for price modifiers, where the pipeline is engine code and each modifier is data.

**The limit is stated honestly:** a v1 behaviour cannot express arbitrary computation. That is what makes determinism and save safety structural rather than promised.

---

## 10. API v2 — commands, listeners, panels, services

**Not specified, and not stubbed.** These capabilities do not exist at v1.

ADR-019 §4 names the four questions a successor ADR must answer before any of them can ship:

1. **Execution mechanism** under the strict CSP — a privileged scheme in main, or an out-of-renderer host. Each is a real widening.
2. **The trust model** — what a player agrees to at install, and what the engine can still guarantee afterwards.
3. **Determinism enforcement** the engine can actually perform, since lint cannot inspect a downloaded module.
4. **Failure containment** — ADR-008 §7 isolates a throwing subscriber; a throwing plugin is a larger blast radius.

---

## 11. Load lifecycle — _Phase 09_

**Will own:** discovery, manifest validation, dependency resolution, registration, and enablement, plus each failure's behaviour.

**Fixed already (ADR-019 §6):**

- Resolution is **dependency-topological, ties broken by namespace ascending** — never filesystem enumeration order.
- Resolution is **total and fails closed**: a missing dependency, a cycle, or an unsatisfiable API-version constraint refuses that source, names it to the player, and loads the rest. It never partially registers one.
- **The resolved order is world state**, recorded in the save's source manifest (ADR-026 §4).

---

## 12. Save data and isolation

**Fixed already**, and this section will not grow much:

- A source's save data lives under its own key (`SAVE_FORMAT.md` §8). Core never reads, migrates, or drops it.
- Data from an absent source is **preserved and written back untouched** (ADR-002 §5).
- Content from an absent source is **quarantined verbatim and restored when the source returns** (`SAVE_FORMAT.md` §5.3).
- **The isolation invariant** (ADR-026 §3): removing a source may affect only entities, containers, side-tables, and partitions in namespaces that source owns. Nothing else in the save may change.
- Sources version their own payloads. Core never migrates them.

---

## 13. Related

| Document                       | Relationship                                              |
| ------------------------------ | --------------------------------------------------------- |
| ADR-019                        | The decision this specifies                               |
| ADR-026                        | Content identity, provenance, and the isolation invariant |
| ADR-023                        | The audio categories §5 registers into                    |
| `PLUGIN_GUIDE.md`              | The author-facing guide; this is the reference            |
| `plugins/manifest.schema.json` | The machine-readable manifest schema                      |
| `SAVE_FORMAT.md` §5.3, §8      | Quarantine and plugin partitions                          |
| `ASSETS.md` §10                | Plugin asset packaging                                    |
