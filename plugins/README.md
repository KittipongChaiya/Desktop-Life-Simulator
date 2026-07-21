# Plugins

> **Status for v0.1:** the plugin _architecture_ is in scope; the plugin _loader_ is not (ADR-003 §6).
> Content here is statically imported. Dynamic loading arrives in v0.2 (`PLAN.md` §3).

---

## Why this exists before there is a loader

`VISION.md` §4 commits to mod support. Retrofitting extensibility into a core that assumes it owns all content is a rewrite, so v0.1 pays a small, bounded cost to be _shaped_ for plugins.

The load-bearing decision: **`plugins/core/` registers through the public plugin API while being statically imported.** First-party content is the API's first consumer, so the API is proven sufficient before any third party depends on it. Adding the v0.2 loader changes _how content arrives_ — not the shape of the content system.

## What v0.1 guarantees

| Guarantee                                                    | Where                           |
| ------------------------------------------------------------ | ------------------------------- |
| Content IDs are namespaced (`core:wheat`) and permanent      | `src/shared/ids.ts`             |
| All content registers through a typed registry API           | `src/sim/content/` _(phase-03)_ |
| A typed event bus with documented hook points                | `src/sim/events/` _(phase-03)_  |
| Save data is namespaced per plugin and preserved when absent | `SAVE_FORMAT.md` §8             |
| Assets namespace by plugin ID                                | `ASSETS.md` §10                 |

## What v0.1 does NOT build

Dynamic loading · sandboxing · a permission model · dependency resolution · a settings UI · hot reload.

## Content IDs

```
namespace:name        e.g.  core:wheat, myMod:dragonfruit
```

Lowercase, alphanumeric plus underscore, exactly one colon. Validated at registration.

**IDs are permanent.** Display names may change; IDs may not — a save written today references them by ID forever (`AI_RULES.md` §1.4).

## Save data

```jsonc
"plugins": {
  "myMod": { "schemaVersion": 3, "data": { /* opaque to core */ } }
}
```

Core never reads or migrates plugin `data` — plugins version themselves. **Data from an absent plugin is preserved and written back**, so uninstalling a mod to try something else never destroys the farm built with it.

## Directory layout

```
plugins/
├── README.md              this file
├── manifest.schema.json   manifest schema (the v0.2 loader consumes it)
└── core/                  first-party content — statically imported in v0.1
    ├── manifest.json
    ├── index.ts           register() entry point
    └── content/           crops, items, buildings, tile kinds
```

`plugins/core/` is populated in **phase-03**, the first phase that defines content. It is deliberately absent until then rather than existing empty — `AI_RULES.md` §1.6 bans placeholders.

## Constraints on plugin code

Plugins run inside the simulation and inherit its rules (`AI_RULES.md` §2.1), enforced by the same lint boundaries as core:

- No `Math.random()` — use the injected seeded RNG. Determinism is not optional.
- No `Date.now()` or wall-clock reads. Time is the tick counter.
- No `pixi.js`, `react`, `electron`, or Node builtins.
- No I/O.

A plugin that breaks determinism breaks save correctness for every player using it.
