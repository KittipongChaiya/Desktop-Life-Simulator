# Content Sources

> **Status for v0.2:** the public plugin API and `plugins/core/` land in **Phase 08**; the loader in **Phase 09** (`ROADMAP.md`).
> **Owns:** the directory, what a content source is, and the concepts a source author needs before reading anything else.
> **Does not own:** the API surface (`docs/PLUGIN_API.md`), how to author one (`docs/PLUGIN_GUIDE.md`), why any of it is shaped this way (ADR-019, ADR-026).

---

## What lives here

A **content source** is anything that adds content to the game. There are five kinds, and **they all use one manifest, one API, and one set of rules** (ADR-026):

| Kind          | Example                 | Trusted at load? |
| ------------- | ----------------------- | ---------------- |
| Built-in      | `core:wheat`            | Yes              |
| Official pack | a first-party expansion | Yes              |
| Third-party   | `someMod:dragonfruit`   | No               |
| Generated     | an AI-authored pack     | No               |
| DLC           | a delivered pack        | Yes              |

**Provenance is recorded and then ignored.** It exists to tell a player what is missing, to decide trust at load time, and for support diagnostics. No simulation system, command, registry lookup, or save-format rule may branch on it — first-party content earns no runtime privilege (ADR-026 §2). That is what makes goal 9 — _official content and third-party plugins share one extension model_ — true rather than aspirational.

## The v0.1 record, corrected

`plugins/core/` was reserved by ADR-003 §6 and **never built**. Core content has registered directly from `src/sim/world/world.ts` since phase-03, so the load-bearing claim — _the API is proven by first-party content before any third party depends on it_ — has not held.

Phase 08 closes it: the public API is built, and `plugins/core/` becomes its first consumer, with **no behaviour change, no save change, and no test change** (ADR-019 §2). This note stays here as the record of why that phase exists.

## Content IDs

```
namespace:name        core:wheat  ·  someMod:dragonfruit
```

Lowercase, alphanumeric plus underscore, exactly one colon. Validated at registration.

- **A namespace is owned by exactly one source, permanently.** A collision is refused at load, for both sources.
- **IDs are permanent.** Display names may change; IDs may not — a save written today references them by ID forever (`AI_RULES.md` §1.4).
- `core` and a small reserved set are unavailable to third parties, so a future official pack cannot be squatted.

## Save data and removal

```jsonc
"plugins": {
  "someMod": { "schemaVersion": 3, "data": { /* opaque to core */ } }
}
```

Core never reads or migrates a source's `data` — sources version themselves.

**The isolation invariant** (ADR-026 §3), which is a property test rather than a promise:

> Removing a content source may affect only entities, containers, side-tables, and save partitions in namespaces that source owns. **Nothing else in the save may change.**

So an uninstalled source's data is preserved and written back untouched, its content is quarantined verbatim rather than deleted, and reinstalling restores it. A player who removes a source to try something else does not lose the farm they built with it.

## API versions

A source declares the **API version** it targets — never a game version. The engine supports every API version it has ever shipped, so an engine release cannot silently break a source (ADR-019 §1, `PLUGIN_API.md` §1).

**API v1 sources are data.** A manifest, content definitions, assets, string tables, and declared behaviours. The loader validates them and never executes them — which is what makes determinism and save safety structural rather than promised (ADR-019 §4).

Code-bearing capabilities — commands, event listeners, UI panels, service consumption — are **specified but not live** at v1. `PLUGIN_API.md` §10 records the four questions a successor ADR must answer before they can ship.

## Directory layout

```
plugins/
├── README.md              this file
├── manifest.schema.json   the content-source manifest schema
└── core/                  first-party content — Phase 08
    ├── manifest.json
    └── content/           crops, items, buildings, tile kinds
```

`plugins/core/` is created in **Phase 08**, the phase that builds the API it registers through. It stays absent until then rather than existing empty — `AI_RULES.md` §1.6 bans placeholders.

## Rules every source inherits

Enforced by the same lint boundaries as core (`eslint.config.js` — the `plugins` zone already exists and is configured):

- No `Math.random()` — determinism is not optional.
- No `Date.now()` or wall-clock reads. Time is the tick counter.
- No `pixi.js`, `react`, `electron`, or Node builtins.
- No I/O.

**A source that breaks determinism breaks save correctness for every player using it** — silently, and unrecoverably. At API v1 this is structural: a declaration cannot call a clock.

## Where to go next

| You want to                    | Read                    |
| ------------------------------ | ----------------------- |
| Author a source                | `docs/PLUGIN_GUIDE.md`  |
| Look up the API surface        | `docs/PLUGIN_API.md`    |
| Validate a manifest            | `manifest.schema.json`  |
| Understand why any rule exists | ADR-019, ADR-026        |
| Know when this ships           | `docs/ROADMAP.md` §4–§5 |
