# ADR-019: Plugin Architecture and the Versioned Public API

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented by Phases 08 and 09
**Bound by (not re-litigated):** ADR-026 (content identity and the isolation invariant — read it first); ADR-003 §6 (the reserved plugin architecture, **amended** by this ADR); ADR-004 §5 (definitions are data); ADR-007 §1 (no clock, no `Math.random()`, tick-only time); ADR-008 (events are facts, with guaranteed publish and registration order); ADR-010 (commands are the only write path, registered explicitly, never discovered); ADR-001 §Implementation note (the strict CSP, and the recorded refusal to relax it); ADR-012 (the freeze this is authored under).
**Amends:** ADR-003 §6 — the reserved architecture becomes a specified, versioned public API, and §6's "what v0.1 does not build" list becomes this ADR's scope. ADR-003 is otherwise unchanged.

---

## Context

ADR-003 §6 committed v0.1 to being _shaped_ for plugins without building a loader, and named the load-bearing design point:

> **`plugins/core/` is registered through the public plugin API but statically imported.** The API is therefore proven sufficient by first-party content before any third party depends on it.

**That did not ship.** `plugins/` contains a README and a manifest schema. Core content registers through `registerCoreCrops(cropRegistry)` and its three siblings, called directly from `src/sim/world/world.ts` (lines 189–198). There is no `PluginApi` object anywhere in the repository.

What _did_ ship is most of the hard part, and it is why this is a gap rather than a rewrite: namespaced permanent IDs, a generic typed `ContentRegistry` with duplicate and malformed-ID rejection, definitions cleanly separated from instances, a typed event bus with ordering guarantees, an explicitly-registered command dispatcher, save partitioning with quarantine, and an eslint boundary zone for `plugins/` that already forbids `pixi.js`, `react`, `electron`, and Node builtins. The registries are plugin-shaped. Only the seam is missing.

Three constraints make the seam non-obvious, and they are why this is an ADR rather than a commit.

**1. The renderer runs under a strict CSP, and relaxing it was already refused.** `index.html` declares `default-src 'self'; script-src 'self'`. ADR-001's implementation note records three PixiJS behaviours that this broke and states the reason the CSP stayed strict: _"the renderer executes plugin code from v0.2 (ADR-003 §6), and eval or blob-workers handed to untrusted content is a far worse trade than three imports."_ Any design that executes arbitrary third-party JavaScript in the renderer must first undo a decision made specifically to protect against it.

**2. A plugin that breaks determinism corrupts saves silently.** `plugins/README.md` already states this. The failure mode is worse than it sounds: a plugin calling `Date.now()` in a growth calculation produces a world that no longer replays, no longer round-trips, and whose divergence appears as _unexplained drift in the player's farm_ rather than as an error. The engine cannot detect it at runtime. Lint catches it in source we can see; it cannot catch it in a module a player downloaded.

**3. First-party and third-party content must share one model** (goal 9). The moment official content gets a privileged path, the public API stops being load-bearing and starts being a compatibility layer nobody dogfoods — which is precisely the outcome ADR-003 §6 designed against and which the missing `plugins/core/` has already begun to demonstrate.

---

## Decision

**The plugin API is an explicitly versioned public contract. Its full capability surface is specified now; API version 1 declares the subset that is safe to ship without executing untrusted code. Compatibility is declared against the API version, never the engine version. `plugins/core/` becomes the API's first consumer, so no capability exists that first-party content has not already used.**

### 1. The API is versioned, and compatibility is declared against it

```
PLUGIN_API_VERSION = 1
```

A source declares the API version it targets. The engine declares which API versions it supports. **Nothing declares a game version.**

| Declared by | Field           | Meaning                                                      |
| ----------- | --------------- | ------------------------------------------------------------ |
| A source    | `apiVersion`    | The API version its manifest and content are written against |
| The engine  | supported range | Which API versions this build can load                       |
| A source    | `version`       | The source's own version — informational, never load logic   |

This is `AI_RULES.md` §1.4's "the plugin-facing API is a contract from the moment it is documented" made mechanical, and it is the direct answer to goal 10. Engine versions move for reasons that have nothing to do with the API — a renderer fix, a settings category, a packaging patch. A plugin pinned to an engine version breaks on all of them; a plugin pinned to an API version breaks only when the contract it actually uses changes.

**The existing manifest schema contradicts this and is amended in the same commit as this ADR.** `plugins/manifest.schema.json` currently requires `gameVersion` — _"semver range of game versions this plugin supports"_ — which is the coupling this section forbids. It becomes `apiVersion`. Its `entry` field, described as _"module exporting register(api)"_, becomes optional, because API v1 sources carry no code (§4).

**Support policy, fixed before v1 ships so it is never negotiated under pressure:** the engine supports every API version it has ever shipped. Removing support for one requires a successor ADR naming the reason, exactly as dropping a migration link does (ADR-015 §4). A capability may be _deprecated_ — marked in `PLUGIN_API.md`, warned at load, and kept working — but the version it belongs to is not withdrawn.

### 2. `plugins/core/` is the API's first consumer

Phase 08 moves the four core registrations behind the public API and into `plugins/core/`, as a content source under ADR-026 §1 owning the `core` namespace.

This is a deliberate, bounded exception to `AI_RULES.md` Rule 1 (never rewrite a working system), authorised here because the rule's own escape clause applies: _the system cannot support a required feature without it_. The requirement is ADR-003 §6's, and it cannot be met by any amount of extending, because the property being bought — _the API is proven by first-party use_ — is unobtainable if first-party content does not use it.

Its bounds are exact, and Phase 08's acceptance is written against them:

- **No behaviour change.** The four `registerCore*` functions keep their bodies; only their call site and the surface they call through move.
- **No save change.** Content IDs, definitions, and every persisted field are untouched.
- **No test change.** The existing content, world, persistence, and determinism suites pass unmodified. A test that has to be edited is evidence the bound was crossed.
- **No new content.** Migration only.

> If a capability is awkward for `plugins/core/`, it is awkward for everyone, and it is fixed before v1 is declared. That is the entire value of doing this first.

### 3. The capability surface

Designed in full so the shape never has to change; **declared in versions** so nothing speculative ships. `AI_RULES.md` §1.5 forbids machinery for imagined needs, and `VISION.md` §4.2's extension-point table is amended in this phase to authorise exactly this specification and no more.

| Capability              | Adds                                                                      | API v1 | Notes                                                          |
| ----------------------- | ------------------------------------------------------------------------- | ------ | -------------------------------------------------------------- |
| `registerContent`       | crops, trees, items, recipes, buildings, tile kinds, decorations, animals | **v1** | Declarative definitions, validated on registration             |
| `registerAssets`        | pre-built atlases and a manifest fragment                                 | **v1** | `ASSETS.md` §10; never repacked into core atlases              |
| `registerAudio`         | sounds against declared categories                                        | **v1** | ADR-023 owns the bus and the registry                          |
| `registerLocalization`  | string tables keyed by content and UI IDs                                 | **v1** | Data only; no format that can execute                          |
| `registerConfiguration` | typed, defaulted settings surfaced in the plugin panel                    | **v1** | Stored under the source's own settings partition               |
| `registerEffects`       | declared visual effects bound to declared event kinds                     | **v1** | Data selecting from engine-provided effect primitives          |
| `registerBehaviors`     | conditions and effects composed from engine primitives                    | **v1** | The declarative vocabulary — §4                                |
| `registerCommands`      | new gameplay actions                                                      | **v2** | Requires executable validate/execute halves — §7               |
| `registerEventListener` | reactions to published facts                                              | **v2** | Requires executable handlers — §7                              |
| `registerPanel`         | UI panels                                                                 | **v2** | Requires executable components; ADR-018 §Future anticipates it |
| `consumeService`        | explicitly exposed engine services                                        | **v2** | The service catalogue is named at v2, not now                  |

A capability absent from a version's declared surface **does not exist** at that version — it is not a stub, not a no-op, and not a documented "coming soon" field on a live interface. That is `AI_RULES.md` §1.6 applied to an API rather than to a function.

### 4. API v1 executes no plugin code

A v1 source is **data**: a manifest, content definitions, asset manifests, string tables, and behaviour declarations. The loader parses and validates it. It never evaluates it.

**Why this is the right v1 rather than a limitation to apologise for:**

| Property                   | What data-only buys                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The CSP survives untouched | No `eval`, no `new Function`, no blob worker, no custom script scheme. ADR-001's recorded refusal stands                       |
| Determinism is structural  | A declaration cannot call a clock or a generator. §Context's silent-corruption failure is **impossible**, not merely forbidden |
| Save safety is structural  | ADR-026 §3's isolation invariant holds without trusting the source to behave                                                   |
| Review is tractable        | A manifest can be read. A minified bundle cannot                                                                               |
| It covers most of the ask  | Crops, trees, animals, items, recipes, buildings, decorations, localization, audio, and visual effects are all content         |

**Behaviors are declarative, and that is a real capability rather than a euphemism.** A behaviour is a `(condition, effect)` pair drawn from an engine-provided vocabulary — the same shape `CropDefinition.tags` and `seasons` already anticipate, and the same shape ADR-013 §4 uses for price modifiers, where the _pipeline_ is engine code and each _modifier_ is declared data. The vocabulary is enumerated in `PLUGIN_API.md`, versioned with the API, and grows by adding primitives whose semantics the engine owns. What a v1 behaviour cannot do is express arbitrary computation, and the honest statement of that limit belongs in `PLUGIN_GUIDE.md` rather than in a workaround.

**What API v2 must decide before code plugins can ship**, named here so the scope is not rediscovered:

1. **Execution mechanism** under the CSP — a privileged scheme registered in main, or an out-of-renderer host. Each is a real widening and needs its own justification.
2. **The trust model** — what a player is agreeing to at install, and what the engine can still guarantee afterwards.
3. **Determinism enforcement** the engine can actually perform, since lint cannot see a downloaded module. Deterministic-replay verification at load is the leading candidate and is not free.
4. **Failure containment** — ADR-008 §7 already isolates a throwing subscriber; a throwing _plugin_ is a larger blast radius.

None of these is stubbed at v1. They are the agenda of a successor ADR.

### 5. What plugins may and may not do

**MAY** — the capability table in §3 is the exhaustive list. A source may register content, assets, audio, localization, configuration, effects, and behaviours at v1; commands, listeners, panels, and service consumption at v2.

**MUST NOT**, with the enforcement named for each, because a rule with no detector is a wish:

| Prohibition                      | Enforced by                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mutate simulation state directly | v1: structural — data cannot mutate. v2: the ADR-010 write path, which has no plugin-visible bypass         |
| Bypass the command dispatcher    | Same. `submitCommand` is the only mutation surface a plugin will ever be handed                             |
| Modify `World` outside a command | Same                                                                                                        |
| Replace an engine service        | The API exposes readers and registrars; it has no setter, no override slot, no interception point           |
| Modify a core registry           | `ContentRegistry.register` rejects duplicates (`src/sim/content/registry.ts`); there is no update or delete |
| Patch internal engine code       | The eslint `plugins` zone limits imports to `shared`, `sim`, and `plugins`; v2's mechanism must preserve it |
| Access private engine APIs       | The API object is the surface. `PLUGIN_API.md` is its specification; anything not in it is not public       |

The registry's lack of an update path is worth naming as a _feature_: rebalancing is a data edit by the definition's own owner (ADR-004 §5), so no source ever needs to reach into another's definition. A source that wants different numbers ships different content under its own namespace.

### 6. Load order is resolved, deterministic, and part of the world

Registration order is not incidental. ADR-008 §4 guarantees subscribers run in registration order; ADR-010 §8 forbids runtime discovery precisely because import order would otherwise decide behaviour. Plugins make both live concerns.

- **Sources load in a resolved order**: dependency-topological, with ties broken by namespace, ascending. Never filesystem enumeration order, which varies by platform and by disk.
- **Dependency resolution is total and fails closed.** A missing dependency, a cycle, or an unsatisfiable API-version constraint refuses the _source_, names it to the player, and loads the rest. It never partially registers one.
- **The resolved order is world state**, recorded in the save's source manifest (ADR-026 §4), so a world that loads two sources tomorrow resolves them in the same order it did today.

### 7. Enablement is a world-level fact, not a preference

Goal 8 asks for features to be independently enableable. The mechanism is the same one that enables a content source, which is what makes it one model instead of two.

> **A world records which sources and features are enabled. That record is save data, not `settings.json`.**

This follows from ADR-014 §4's boundary rather than contradicting it: opacity changes what the player _sees_, and disabling seasons changes what the world _does_. Two players with one seed and different enablement sets have different worlds, and a preference that silently forks the simulation is exactly the class of thing ADR-007 §1 exists to prevent.

Changing the set is a documented world operation with ADR-026 §3's guarantee: disabling isolates, never destroys; re-enabling restores. ADR-027 owns its persistence and its migration.

### 8. Assets carry no gameplay logic

An asset is pixels, audio samples, and the manifest that names them. Sprite keys, atlas fragments, and audio files are inert (ADR-006 §4, `ASSETS.md` §10).

A source that wants behaviour declares it through `registerBehaviors` — a reviewable, versioned, engine-interpreted declaration — never through metadata smuggled into an asset sidecar. This is stated because sidecar files (`*.anim.json` already exists) are the obvious place for it to creep in, and an executable asset would defeat §4's structural guarantees by the back door.

---

## Alternatives Considered

### A. Ship a code-plugin loader in v0.2 via a privileged scheme

- **For:** everything the roadmap eventually wants, at once. Behaviours are unconstrained.
- **Against:** it requires widening a CSP that ADR-001 narrowed _for this exact reason_, and it hands untrusted code a determinism guarantee the engine cannot enforce. It also lands the hardest unsolved problem in the same version as seasons, weather, audio, and auto-update — a version whose release gate includes _"auto-update never loses a save"_.
- **Rejected because:** the sequencing is wrong, not the destination. §4 names v2's agenda so this is deferred with a plan rather than avoided.

### B. Keep registration inside `src/sim` and expose a thin façade

- **For:** no movement of working code; Rule 1 untouched.
- **Rejected because:** it is the status quo with a wrapper, and it re-buys the exact failure ADR-003 §6 predicted — an API whose first real consumer is a stranger. The missing `plugins/core/` is the evidence that a reserved-but-unused seam does not stay honest.

### C. Version the API implicitly, by engine version

- **Rejected because:** goal 10, and arithmetic. Most engine releases change nothing a plugin can see; pinning to them manufactures breakage. It also makes the compatibility question unanswerable in the one place it matters — a player looking at a plugin page.

### D. Let official packs use a privileged internal path, third parties the public one

- **For:** first-party content moves faster.
- **Rejected because:** it is how the public API stops being dogfooded, and it makes ADR-026 §2's "the engine never branches on provenance" false at the most important seam. If official content needs something, the API needs it.

### E. Allow plugins to override or remove core content

- **For:** the most-requested modding capability in every game that has one.
- **Rejected for v1** because override semantics are a save-compatibility problem wearing a feature's clothes: a save written with an override loads differently once the overriding source is removed, and ADR-026 §3's invariant no longer holds — the removal touched another namespace. If it returns, it returns as a declared, recorded, per-field override with its own persistence, in a successor ADR.

---

## Tradeoffs Accepted

| We accept                                                | To gain                                                      | Mitigation                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------ |
| API v1 cannot express arbitrary behaviour                | Determinism and save safety are structural, not promised     | The declared vocabulary covers content; v2's agenda is named (§4)        |
| Phase 08 moves working v0.1 code                         | The API is proven by first-party use, as ADR-003 §6 required | Four exact bounds (§2), and unmodified tests as the acceptance proof     |
| The full capability surface is specified before it ships | The API shape never has to break                             | Only v1's subset is live; absent capabilities do not exist (§3)          |
| A support policy that never drops an API version         | Plugin authors can rely on the contract                      | Deprecation is available; withdrawal needs a successor ADR               |
| Two version numbers a source author must understand      | Engine releases stop breaking plugins                        | `PLUGIN_GUIDE.md` leads with it; the manifest requires only `apiVersion` |

---

## Consequences

### Immediate (Phases 08–09 implement)

- `plugins/manifest.schema.json` is amended in this phase: `gameVersion` → `apiVersion`, `entry` optional. This is documentation-phase work because the schema is a published contract, not code.
- Phase 08 delivers the `PluginApi` surface, the content-source registry (ADR-026 §1), and `plugins/core/` — with the four bounds of §2 as its acceptance criteria.
- Phase 09 delivers discovery, manifest validation, dependency resolution, enablement, the plugin settings panel, and the save-side isolation tests.
- `PLUGIN_API.md` becomes the API's specification and the authority for what is public; `PLUGIN_GUIDE.md` is the author-facing document.

### Ongoing (binding on every future session)

- **A new capability is a new API version**, specified in `PLUGIN_API.md` before it is built.
- **Nothing outside `PLUGIN_API.md` is public**, however reachable it happens to be.
- **`plugins/core/` uses the public API only.** A first-party shortcut is the failure mode this ADR exists to prevent, and it will look reasonable when it is proposed.
- **No capability ships that `plugins/core/` has not exercised**, unless no first-party content plausibly could — and then the ADR authorising it says so.

### Validation

- **Zero-diff migration:** Phase 08's content, world, persistence, and determinism suites pass byte-identically before and after `plugins/core/` exists.
- **Boundary:** `check:boundaries` covers `plugins/**` today and must stay clean; a source may not import `pixi.js`, `react`, `electron`, or Node builtins.
- **Determinism across sources:** two runs from one seed with the same enabled set produce byte-identical state, including registration and subscriber order.
- **Resolution:** dependency cycles, missing dependencies, unsupported API versions, and namespace collisions each refuse exactly one source and leave the rest loaded.
- **Isolation:** ADR-026 §Validation's property tests, run against a real second source.
- **No privileged path:** a test asserts core content registers through the same entry point a third-party source uses.

### Revisit if

- A required v0.2 feature genuinely cannot be expressed declaratively → that is API v2's trigger, and it arrives as a successor ADR with §4's four questions answered, not as an exception.
- Behaviour declarations grow into a general-purpose language → stop. A language needs a runtime, which is API v2 wearing a disguise.

---

## Related

| Document                           | Relationship                                                       |
| ---------------------------------- | ------------------------------------------------------------------ |
| ADR-026                            | Content identity and the isolation invariant this API is built on  |
| ADR-027                            | The schema bump carrying enablement and the source manifest        |
| ADR-003 §6                         | Amended — the reserved architecture becomes this specified API     |
| ADR-004 §5, ADR-008, ADR-010       | The registries, bus, and dispatcher the API exposes and constrains |
| ADR-001 §Implementation note       | The CSP, and the recorded reason it stays strict                   |
| ADR-018 §Future extensions         | Plugin-contributed panels — deferred to API v2 by §3               |
| `PLUGIN_API.md`, `PLUGIN_GUIDE.md` | The specification and the author's guide                           |
| `plugins/manifest.schema.json`     | Amended by §1                                                      |
| `VISION.md` §4.2                   | The extension-point table amended to authorise this specification  |
