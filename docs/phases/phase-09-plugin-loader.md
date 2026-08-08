# Phase 09 — Plugin Loader & Capability Registry

> **Delivers:** a third party can add content without touching engine source. Includes the first real save migration.
> **Governing decisions:** ADR-019 (plugin architecture), ADR-026 (content identity), ADR-027 (save evolution), ADR-015 (migration).
> **Schema:** v1 → v2.
> **Status:** **Substantially delivered, not closed.** What remains is named in §Remaining.

---

## Commit boundaries, and the order they actually happened in

`ROADMAP.md` §5 sets four: resolution and validation; enablement and persistence; the settings panel; the isolation suite and fixture plugin.

**They were not done in that order, and `PLAN.md` §9.1 requires the reason be recorded here rather than left in commit messages.** Boundary 4's isolation work came third, ahead of the panel, because it is the phase's headline guarantee and entirely self-contained, whereas the panel is UI that depends on the loader existing. Nothing in boundary 4 depended on boundary 3; the reverse was true.

| Order | Boundary                                                 | Commit    |
| ----- | -------------------------------------------------------- | --------- |
| 1     | Manifest validation and load-order resolution            | `77dcd11` |
| 2     | Schema v2, the first migration, the pre-migration backup | `ea9a847` |
| 3     | The isolation invariant, against a real second source    | `4166331` |
| 4     | `PLUGIN_GUIDE.md` §8 — the dependency ranges that work   | `5d4cca1` |
| 5     | Discovery: sources are read from disk and installed      | `0b9e6df` |
| 6     | Content files load; a third-party crop reaches a world   | `a05c1be` |
| 7     | The settings panel lists sources and refusals            | `fadbf85` |

Two defects were fixed mid-phase and are recorded here because they were found by this phase's work: `7ff80bb` and `839e8d1` closed the catch-up over-credit (`phase-07.7` debt #13) and pinned the properties guarding it (#14).

---

## What the phase is really about

One sentence from ADR-019 §6 governs almost every decision below:

> A failure **refuses exactly one source, names it, and leaves the rest loaded.**

Everything else follows. A loader that throws on the first bad manifest lets one broken plugin take the game down. A loader that skips it silently is worse for its author, who cannot tell a typo from an engine bug from having installed it in the wrong folder. So every layer is **total**: every directory handed in comes back installed or refused with a reason, and the reason survives all the way to a panel the player can read.

---

## Decisions worth carrying forward

### A contested namespace refuses every claimant

`plugins/manifest.schema.json` states it for `id`: a collision is rejected _"for both sources"_. `ROADMAP.md` §5's acceptance says "refuse exactly one source", which reads the other way.

**The schema won**, because it is the contract authors write against and because picking a winner needs a rule for who is first. The resolver has only manifests: ordering by id decides whose content survives by alphabet; ordering by install time makes a save load differently tomorrow. Nobody wins a contested namespace.

### Version ranges are refused rather than guessed

`satisfiesRange` understands `*`, an exact version, and `^major.minor.patch`. `>=1.0.0`, `~1.2.3` and `1.x` are refused by name. A range the engine misreads tells the author nothing and surfaces later as content that is simply not there; an outright refusal at load is far cheaper to diagnose. Documented in `PLUGIN_GUIDE.md` §8.1 with an invitation to widen it.

### The v1 → v2 migration invents nothing

`world.sources` migrates to the **empty manifest**, not a synthesised `core` entry. Every v1 save _was_ written by a build with core content, so the invented entry would look right — and would be a lie. The manifest records what was present when the save was written, and a v1 save carries no such record.

`world.disabledSources` records what is **off** rather than what is on. Both migrate to `[]`, but only this direction means "everything keeps working": an `enabled: []` default would silently disable core on every v1 save ever written.

### The pre-migration backup's exemption is structural

ADR-027 §2 requires it be exempt from pruning. Rather than a rule someone must remember, the filename cannot match `pruneBackups`'s `slot-0-<tick>.json` filter — and a test pins the two against each other. It is written from the untouched bytes in `save-store.ts`, because `src/persistence` receives a parsed document and never sees a file.

### Discovery splits along the boundary that already existed

`src/main` may not import `src/sim`, which forced the right shape anyway:

```
main: read bytes  →  parseManifest  →  resolveSources  →  installSource
     (platform)        (policy)          (policy)         (composition root)
```

Reading files is a platform capability; deciding what a manifest means is simulation policy. All the interesting logic stays in a layer that runs headless in a unit test.

### Path traversal was a real vulnerability

Definition paths come from a downloaded manifest, and `readFileSync` will follow `../../../` out of the plugins directory and hand a plugin anything the app can read. Discovery is the only layer that can stop it: a declared path must resolve **inside** the source, and an absolute path is refused. Both are tested, alongside the case that must keep working — a file in a subdirectory.

It existed for exactly as long as the feature did, and would not have been found without writing the file-reading code.

### Only `crops` and `items`, and an unknown kind is refused

Buildings and tile kinds carry engine-side consequences — walkability, storage capacity, the dense kind index that is a byte in every save — and admitting them as plain data needs decisions this phase did not make. An author who writes `"buildings"` is **told**, rather than watching it vanish (`AI_RULES.md` §1.6 applied to a data format).

---

## Acceptance

- [x] A third-party source adding a crop loads, appears in game, saves, and reloads — `tests/third-party-crop.test.ts`, against a real directory on disk
- [x] Removing that source leaves every other namespace byte-identical; re-adding restores its content — `tests/source-isolation.test.ts`
- [x] A dependency cycle, missing dependency, unsupported API version, and namespace collision each refuse and leave the rest loaded
- [x] Both v0.1 golden fixtures migrate `v1 → v2` with **zero repairs** and continue deterministically
- [x] A pre-migration backup is written on the first migration and is not pruned
- [ ] **Written using only `PLUGIN_GUIDE.md`** — §2's walkthrough is unblocked but unwritten, and by its own note should be written by someone following it
- [ ] Two runs from one seed with the same enabled set are byte-identical — untested; needs the enablement path below

---

## Remaining

| Item                                                | Why it is not done                                                                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enable/disable a source                             | World state (ADR-019 §7), so it travels through a **command** (ADR-010 §1), not a checkbox. The command does not exist, and a toggle that silently did nothing would be worse than none |
| Per-source configuration                            | Untouched                                                                                                                                                                               |
| `PLUGIN_GUIDE.md` §2 walkthrough                    | Unblocked by `a05c1be`; should be written by someone following it, which is the gate `PLAN.md` §3 actually measures                                                                     |
| Namespace-scoped quarantine wired to source removal | The index was deferred in phase-08a because its only consumer is source removal; that consumer now exists                                                                               |

**Nothing above is a blocker for phase 10** (time simulation), which depends on phase 08, not 09.
