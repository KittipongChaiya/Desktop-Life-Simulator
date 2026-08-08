# PLUGIN_GUIDE

> **Status:** **Outline.** Structure and intent are decided (v0.2 Phase 0); the walkthroughs are written by Phase 09, against a loader that actually loads.
> **Owns:** How to author a content source — the task-oriented guide, with worked examples.
> **Does not own:** The API's normative surface (`PLUGIN_API.md`), why it is shaped this way (ADR-019, ADR-026), the manifest's machine-readable schema (`plugins/manifest.schema.json`).

**The gate this document exists to pass** (`PLAN.md` §3): _a third party writes a plugin adding a crop, using only this documentation._ If they have to read engine source, this document has failed and the failure is recorded, not worked around.

---

## 1. Start here — two things that are unusual

Most modding guides open with a hello-world. Two properties of this game change what you can write before you write anything, so they come first.

**You target an API version, not a game version.** `apiVersion: 1` in your manifest. The engine supports every API version it has ever shipped, so a plugin written today keeps working across engine releases (`PLUGIN_API.md` §1). You never write a game-version range, and there is no field for one.

**Your content is data, not code.** At API v1 a source is a manifest plus definitions, assets, strings, and declared behaviours. The loader validates it; it never executes it.

That is a real constraint and this guide will not pretend otherwise. What it buys you: your plugin **cannot** corrupt a player's save, **cannot** desynchronise their world, and **cannot** be the reason their farm stops. `PLUGIN_API.md` §10 records what API v2 would add and what has to be answered first.

---

## 2. Your first plugin: a crop — _Phase 09_

**Will contain:** the complete worked example, end to end — directory layout, manifest, one crop definition, its sprites through the asset pipeline, installing it, and seeing it in game.

This is the walkthrough the `PLAN.md` §3 gate is measured against, so it is written last, by someone following it.

> **Blocked, and on what.** The engine can already validate a manifest, resolve
> load order, register a third-party crop through the public API, and keep that
> crop safe when the source is uninstalled — `tests/source-isolation.test.ts`
> proves the last one against a real second source. What does not exist yet is
> **discovery**: nothing reads a plugin directory off disk, so "install it and
> see it in game" has no mechanism behind it.
>
> This section stays unwritten until it does. A walkthrough whose final step
> cannot be followed is worse than an absent one — it reads as a working feature
> and costs an author an afternoon before they conclude the fault is theirs.

---

## 3. Choosing your namespace

Read this before you publish anything.

- Your namespace is `[a-z0-9_]+` and it is **yours permanently**. Every content ID and save key derives from it (ADR-026 §5).
- **Changing it orphans every save built with your plugin.** There is no rename path, by design — a save written today references your IDs forever.
- `core` and a small reserved set are unavailable. A collision is refused at load, for both sources.
- One source may own more than one namespace; two sources may never share one.

Pick something you will still want in two years.

---

## 4. Content — _Phase 09_

**Will contain:** per-kind authoring reference with worked examples — crops, trees, animals, items, recipes, buildings, tile kinds, decorations. Field meanings, units, and what each validation rejection means.

**Two rules that will save you time**, both fixed already:

- **Durations are in ticks**, always. 20 ticks = 1 second (ADR-007 §7). Storing seconds and converting at runtime introduces floating-point drift and would break determinism, so the API does not accept them.
- **Quantities are integers.** Never fractional (ADR-011 §1).

---

## 5. Assets — _Phase 09_

**Will contain:** building your atlas, the manifest fragment, key namespacing, and the size and padding rules.

**Fixed already:** you ship a **pre-built** atlas; it is never repacked into a core atlas; your keys namespace by your plugin ID (`ASSETS.md` §10). **Assets carry no logic** — no behaviour hidden in a sidecar (ADR-019 §8). Pixel-art rules (nearest-neighbour, 2px padding with edge extrusion, 32×32 base tile) are in `ASSETS.md` and are not optional if you want your art to look right.

---

## 6. Behaviours — _Phase 09_

**Will contain:** the condition and effect vocabulary with worked examples, and an honest section on what cannot be expressed at v1 and why.

---

## 7. Localization, configuration, audio, effects — _Phases 09, 12, 13_

**Will contain:** string tables and key namespacing; declaring typed settings that appear in the plugin panel; registering sounds against the engine's closed category set; binding declared visual effects to event kinds.

---

## 8. Dependencies and load order

- Declare other sources you require, with API-version-compatible ranges.
- Resolution is **dependency-topological**, ties broken by namespace ascending — never by filesystem order, so your plugin loads the same way on every machine (`PLUGIN_API.md` §11).
- A missing dependency or a cycle **refuses your source and names it**, then loads everything else. Your plugin failing never takes down someone's game.

### 8.1 Version ranges: only three forms are understood — _shipped, Phase 09_

`dependencies` maps a source id to a range over **their `version`**, and the engine understands exactly three forms:

| Range      | Means                           |
| ---------- | ------------------------------- |
| `"*"`      | Any version                     |
| `"1.2.3"`  | Exactly that version            |
| `"^1.2.3"` | At least `1.2.3`, below `2.0.0` |

**Anything else is refused rather than guessed at** — `>=1.0.0`, `~1.2.3`, `1.x` and `latest` all fail, and your source is refused by name. That is deliberate: a range the engine misreads tells you nothing and surfaces later as content that is simply not there, which is far harder to diagnose than an outright refusal at load.

If you need a form that is not here, say so — widening this is a small change, and guessing at it is not.

### 8.2 What a refusal looks like

Every refusal names your source and the reason, and leaves every other source loaded. The cases you can actually hit:

| Cause                                       | What happens                                                |
| ------------------------------------------- | ----------------------------------------------------------- |
| Dependency missing, or itself refused       | Your source is refused; the dependency is named             |
| Dependency version outside your range       | Refused, with the range you asked for and the version found |
| Dependency cycle                            | Every source on the cycle is refused, by name               |
| `apiVersion` newer than the engine supports | Refused, with the version you targeted                      |
| Your namespace claimed by another source    | **Both** claimants are refused — see §3                     |

The last one is worth reading twice. A contested namespace refuses _everyone_ who claimed it, rather than picking a winner: any tie-break the engine could apply would decide whose content survives by something arbitrary, and the loser's players would silently lose a farm.

---

## 9. Save data, and what happens when a player uninstalls you

The most important section for anyone shipping to real players.

- Your save data lives under your own key. **Core never reads, migrates, or drops it** — you version your own payload.
- If a player uninstalls you, **your data is preserved and written back untouched**, and your content is **quarantined verbatim** rather than deleted.
- Reinstall, and it comes back. A player who removes your plugin to try something else does not lose the farm they built with it.
- **Removing you cannot affect anything outside your namespace** (ADR-026 §3). That is a property test in the engine's suite, not a promise in a document.

Your obligation in return: **never change your content IDs.** Ship new ones instead.

---

## 10. Testing your plugin — _Phase 09_

**Will contain:** validating your manifest, loading in a development build, what each load error means, and checking that removing your source leaves a clean save.

---

## 11. Publishing

**v0.2 has no plugin registry, no discovery, and no plugin auto-update** (ADR-025 §8). `PLAN.md` §6 places a mod ecosystem at v1.0. Distribute your plugin however you like; installation is a documented directory.

What the engine guarantees in the meantime: an engine update **cannot silently break you**. Support for an API version is never dropped without a successor ADR, and a source targeting an unsupported version is refused with its name shown, never partially loaded (ADR-019 §1).

---

## 12. Related

| Document                       | Relationship                                 |
| ------------------------------ | -------------------------------------------- |
| `PLUGIN_API.md`                | The normative reference; this is the guide   |
| `plugins/manifest.schema.json` | Validate your manifest against it            |
| `plugins/README.md`            | Directory layout and content-source concepts |
| `ASSETS.md` §10                | Plugin asset packaging                       |
| ADR-019, ADR-026               | The decisions behind every rule here         |
