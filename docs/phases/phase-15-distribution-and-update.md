# Phase 15 — Distribution & Auto-Update

> **Delivers:** the game can update itself without ever endangering a save.
> **Governing decisions:** ADR-025 (distribution and update), ADR-015 §3–§4 (migration governance and the forward refusal), ADR-027 (the v0.2 schema chain and the pre-migration backup), ADR-014 (the main-process platform service this is a capability of).
> **Schema:** none. This phase adds no persisted world state and no migration.
> **Status:** **In progress.** The decisions are landed; the machinery is not.

---

## Commit boundaries

`ROADMAP.md` §11 sets four. They are being built **in the reverse of that order**, and the reason is ADR-025 §7: _"a library that cannot deliver §2's schema-bounded rollback, §4's interruption recovery, and §5's restart discipline is not adopted, and the gaps are implemented rather than the guarantees relaxed."_ A dependency can only be judged against that if the guarantees exist as something executable first. So the rules are written and proven in Node, and `electron-updater` is then measured against a test suite rather than against prose.

| Order | Boundary                                                    | Commit |
| ----- | ----------------------------------------------------------- | ------ |
| 1     | The schema-bounded rollback guard (§4 of the roadmap's set) | `15a`  |
| 2     | The offer policy: pin, staged rollout, and the boundary     | _this_ |
| 3     | Check, announce, and apply — IPC, settings, and the toast   | —      |
| 4     | Atomic replacement with interruption recovery               | —      |
| 5     | Signing and the publish pipeline                            | —      |

---

## Decisions worth carrying forward

### The guard is on the updater, not on the loader

ADR-025 §Context's hazard is built entirely out of correct parts: the new build migrates, the player rolls back, and the old build meets a `schemaVersion` from the future. `SAVE_FORMAT.md` §4.3's load sequence makes it refuse — correctly, because the alternative is reading a shape it does not understand — and the farm is unopenable.

The loader's refusal is right and stays. What must not happen is the **rollback that creates the situation**, so the check moved to the only component that can prevent it rather than report it.

### It is arithmetic, so it needs no installer to be proven

Two numbers decide a rollback: the schema version of the save on disk, and the `CURRENT_SCHEMA_VERSION` of the build being rolled back to. Everything else — which build, published when, signed by whom — is irrelevant to the question. So `rollback-guard.ts` takes two numbers and returns a decision, and its test asserts _"the save is untouched"_ by the module having no way to touch a save at all.

This is `voice-pool.ts`'s split reused, for the same reason ADR-016 §1 gives: the part that can be wrong should not need the machinery to check.

### The schema boundary is not a rollback rule

`decideOffer` runs the guard on **forward** updates too, and that is not defensive padding. A version number can advance while a schema moves backwards — a build that reverted a migration, published by mistake — and calling the check a "rollback guard" would have left exactly that case uncovered while every test still passed.

The rule is therefore stated over builds, not over directions: **a build may be applied only if it can read the save on disk.** Rolling back is one way to violate it, not the definition of it.

### A pin is a ceiling, not a freeze

ADR-025 §6 gives pinning a version rather than a boolean, and the version is what makes the useful reading possible. A player who pinned `0.2.2` because a plugin has not caught up still receives `0.2.1`; what they will not receive is anything past the line they drew. A frozen install would have made the pin a decision to stop receiving fixes, which is the opposite of what someone protecting a working farm wants.

An **unreadable** pin holds. A pin nobody can parse is still a player saying "hold me here", and ignoring it moves a farm that was asked not to move.

### The order of the checks is itself a decision

Four silent holds run before the schema guard, so a refusal — the only verdict a player ever reads — is reserved for a build that could actually have reached them. Warning someone that a release would have orphaned their farm, when a halt or a rollout wave meant they were never going to be offered it, is how an update system teaches people to dismiss its messages.

The test that pins this asserts a `hold`, not a `refuse`, for a release that is both halted and schema-incompatible. Reorder the checks and it fails.

### The rollout carries no identity, and stability is why it works

ADR-025 §6 requires a staged rollout with no telemetry, no account, and no server-side identity. The client's entire contribution is one integer in 0–99, derived locally by FNV-1a over a string the machine already has, never transmitted. The publisher moves `rolloutPercent`; each install answers for itself. **Nothing has to be counted for this to work**, which is what makes it honest rather than merely undeclared.

Stability is the load-bearing property, not the privacy. A bucket that re-rolled per check would let yesterday's excluded installs drift into today's wave, and a halt after a bad build would stop nothing.

### An unreadable version is never acted on

`compareVersions` accepts strict `major.minor.patch` and answers `null` for anything else — a pre-release suffix, a build tag, a channel name. An updater that guesses at a version it does not understand installs the wrong build, and this project ships no pre-release channel for the guess to serve. `null` propagates to a hold, so the failure mode of not understanding a release is doing nothing.

---

## Acceptance

`ROADMAP.md` §11's list, with what each currently rests on.

- [x] A rollback to a build with a lower `CURRENT_SCHEMA_VERSION` than the save is refused with a clear message, save untouched — `src/main/rollback-guard.test.ts`
- [x] No prompt appears while pinned, halted, or outside the rollout wave — `src/main/update-policy.test.ts`; the presence half (hidden, work mode) is boundary 3
- [ ] Interrupting the update at each replacement step leaves a launchable application and an untouched save — boundary 4, against a real installation
- [ ] A pre-migration backup restored into the older build loads and continues correctly — boundary 3, once the recovery path is reachable from the UI
- [ ] An update restart requested mid-save waits for the write and never truncates it — boundary 3, reusing phase-07e unchanged
- [ ] A tampered artifact is rejected and the installation is untouched — boundary 5
- [ ] No prompt is an OS notification — boundary 3
- [ ] `PLAN.md` §3's _"auto-update never loses a save under interrupted-update testing"_ is an executable suite — boundary 4
