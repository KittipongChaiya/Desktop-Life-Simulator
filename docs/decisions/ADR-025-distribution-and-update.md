# ADR-025: Distribution and Update Architecture

**Status:** Proposed — v0.2 Phase 0. Becomes Accepted on approval of the Phase 0 review.
**Date:** 2026-08-06
**Phase:** v0.2 Phase 0 (Architecture Refresh) — implemented by Phase 15
**Bound by (not re-litigated):** ADR-015 §4 (a save at a newer `schemaVersion` is **refused**, never partially loaded), §3 (migration governance and the pre-migration backup), §7 (failure handling); ADR-002 §2 (atomic writes, `.bak` rotation); ADR-014 (the main-process platform service, and its persistence rules); ADR-003 §3 (disk I/O in main only; the renderer is untrusted); `VISION.md` §5.1 (never a notification spammer); `AI_RULES.md` §9 (correctness and data safety outrank everything); ADR-012.

---

## Context

`PLAN.md` §3 already states why auto-update is a v0.2 milestone rather than a v0.1 one:

> auto-update ships here and not in v0.1 deliberately — **an updater that can restart the app is a way to lose player data**, so it follows proven save integrity.

v0.1 delivered that integrity: atomic writes with `.bak` rotation and three rotating backups, crash safety proven by real interruption at each of the six write steps, a quit save that blocks shutdown with a 3-second cap, and a migration runner validated at startup. An updater can now be built on something.

v0.2 also makes the problem harder in a way the original note did not anticipate, and it is the finding that shapes this ADR.

**Rollback across a schema bump orphans the player's save.** ADR-015 §4 is unambiguous: a save whose `schemaVersion` exceeds the build's is _refused_ — with a clear message, never partially loaded, because a partial load would silently destroy the newer session's fields. That rule is correct and is not being changed. But compose it with rollback:

```
player on 0.2.0  (schema 4)  →  updates to 0.2.1 (schema 5)
                             →  save migrates 4 → 5 on first load
                             →  0.2.1 has a defect; roll back to 0.2.0
                             →  0.2.0 sees schema 5, refuses the save
                             →  the farm is unreachable
```

Nothing here is a bug. Every component behaves exactly as designed, and the player loses access to their world anyway. An update system that can move a build backwards but cannot move a save backwards has a data-loss path built out of correct parts, and it is invisible until someone actually rolls back.

v0.2 lands roughly five schema versions (ADR-027), so this is not a theoretical composition.

---

## Decision

**Updating is a capability of the main-process platform service, governed by one precedence rule: save integrity outranks update delivery, always. Packages are signed and installed atomically; an interrupted update is recoverable; rollback is bounded by save schema version; and the player controls whether and when.**

### 1. The precedence rule

> **Save integrity > update correctness > update speed > update convenience.**

Binding on every decision in this system. Where a choice trades any amount of save safety for any amount of delivery, it is already decided. This is `AI_RULES.md` §9's ordering applied to a subsystem that will otherwise be tempted by every one of the usual arguments — background installs, silent restarts, faster rollout.

### 2. Rollback is bounded by schema version

> **A build may be rolled back to only if it supports the `schemaVersion` currently on disk. Below that boundary, the recovery path is the pre-migration backup, not the updater.**

Three mechanisms, together:

- **The updater checks before it acts.** A rollback target that cannot read the current save is refused with a clear explanation, not attempted and then discovered. The check is on `CURRENT_SCHEMA_VERSION`, which every build already declares in `src/persistence/schema.ts`.
- **The pre-migration backup is the escape hatch.** ADR-015 §3 already requires that the first time a real migration runs, the pre-migration original is copied to `backups/slot-0-v<N>-premigration.json`, exempt from autosave pruning — and states that this _"ships with the first real migration, in v0.2."_ That is this version. Rolling back below the schema boundary means restoring that file, which is a documented, player-visible recovery, not a silent one.
- **The two features ship together.** Because §Context's hazard exists only when both rollback and migration exist, Phase 15 may not ship rollback unless the pre-migration backup shipped with the first migration in Phase 09. ADR-027 owns its retention.

**A rollback is never automatic.** An updater that decides on its own to move a player backwards across a schema boundary is the data-loss path with a scheduler attached.

### 3. Packages are signed, and signature failure is fatal to the update

An update is verified before anything on disk is replaced: publisher signature, then integrity of the downloaded artifact. A failure at either point discards the download, leaves the installed application untouched, and reports it.

An unsigned or unverifiable package is never installed, never "installed with a warning", and never gated behind a user override. This is the one place in the product where the player is not given the dial, because the thing being protected is their save and the attacker is not them.

### 4. Replacement is atomic, and interruption is recoverable

The application is replaced by the same discipline `SAVE_FORMAT.md` §7.1 uses for saves, because it is the same problem: **at no point may a single failure leave zero working states.**

- Download and verify **completely** before touching the installed application.
- Replace atomically; the previous version remains recoverable until the new one has launched successfully.
- **An interrupted update leaves a launchable application** — either the old one or the new one, never a hybrid. This is asserted by interrupting at each step against a real installation, exactly as phase-07c proved crash safety for saves.
- **Saves are never touched by an update.** Not moved, not migrated, not backed up by the updater, not cleaned. The save directory is outside the updater's blast radius by construction, and migration remains the load path's job (ADR-015 §3: _loading never writes_).

### 5. An update never interrupts a save, and never restarts unasked

- **The quit save blocks the restart.** Phase-07e's mechanism is reused unchanged: the save request blocks shutdown, capped at 3 seconds so a wedged renderer can delay a restart but never prevent it. An update restart is a quit, and it takes the same path.
- **The player chooses when.** An update is announced in-overlay and applied when the player says so, or on the next ordinary launch. Never mid-session without consent.
- **Never an OS notification.** `VISION.md` §5.1 forbids the game pushing notifications for routine events, and an update prompt is routine. The announcement is the existing in-overlay toast surface (ADR-014), dismissible and never modal.
- **Never while hidden or in work mode.** Those states are the player saying they are busy (ADR-014 §1). The simulation keeps running; the prompt waits.

### 6. Version pinning and staged rollout

- **Pinning** lets a player hold a version — for a plugin that has not caught up to a new `PLUGIN_API_VERSION` (ADR-019 §1), or simply because their farm works. A pinned build checks for updates and does not apply them. Pinning is an application preference in `settings.json` under ADR-014 §4's model; it changes what the _application_ does, never what the _world_ does, so it is not save data.
- **Staged rollout** is a publish-side property: an update is offered to a declared fraction of installs, raised as it proves itself. The client's contribution is a stable, locally-derived, non-identifying rollout bucket — no telemetry, no account, no server-side identity. `VISION.md` §5.1's non-goals and the project's absence of telemetry both hold.
- **A staged rollout can be halted.** Publishing a halt must be able to stop an in-flight rollout before more installs take it, which is the only mitigation that works after a bad build has been signed.

### 7. Where it lives

Updating is a capability of the **main-process platform service** (ADR-014 §6's extensibility table already anticipates this shape) — same process boundary, same IPC contract, same persistence rules, same guarantee that the simulation never learns it exists.

- No update concept appears in `src/sim`, in a snapshot slice, or in the save.
- The renderer presents state and dispatches intent; it performs no download, no verification, and no filesystem work (ADR-003 §3).
- The dependency choice (`electron-updater` being the obvious candidate) is Phase 15's, **constrained by this ADR**: a library that cannot deliver §2's schema-bounded rollback, §4's interruption recovery, and §5's restart discipline is not adopted, and the gaps are implemented rather than the guarantees relaxed.

### 8. Plugins are not updated by this system

A content source has its own version and its own compatibility declaration (ADR-019 §1). Plugin distribution, discovery, and update are **out of scope for v0.2** — `PLAN.md` §6 places a mod registry at v1.0.

What v0.2 owes is that an engine update must not break an installed source silently: the API-version support policy (ADR-019 §1) means an update cannot drop an API version, and a source targeting an unsupported version is refused with its name shown, never partially loaded.

---

## Alternatives Considered

### A. Silent background auto-update, applied on next launch

- **For:** the industry default; highest adoption; no player friction.
- **Rejected because:** §1. It removes the player's control over when their save is migrated, and combined with §Context's rollback hazard it means a defect can reach a farm and become unreachable without the player having made a single decision.

### B. Allow unrestricted rollback and let a refused save fall back to `.bak`

- **For:** simple; the fallback already exists.
- **Rejected because:** it does not work. `.bak` is the _previous save at the same schema version_, so it is refused too. Phase-07c already made the matching call for the load path — _"a newer save refuses outright and never falls back to an older backup"_ — precisely because a fallback here silently discards the newer session. The pre-migration backup is the correct artifact, and §2 uses it.

### C. Make older builds tolerant of newer saves (forward compatibility)

- **For:** rollback would just work.
- **Rejected because:** it requires a build to interpret fields that did not exist when it was compiled, which means guessing — and ADR-015 §4 refuses newer saves for exactly that reason: _"partial load silently destroys the newer session's fields."_ Reversing it would trade a visible refusal for invisible data loss.

### D. Write back the migrated save immediately after migration

- **Rejected by ADR-015 §Alternatives F**, and worth restating because an updater makes it tempting again: it adds a write path that runs before the player has seen the loaded world, at the moment trust in the new build is lowest. Migration is pure and deterministic, so re-running it next launch is free.

### E. Ship no updater; distribute installers only

- **For:** zero new failure modes; the safest possible answer.
- **Against:** a security or data-loss fix cannot reach players who do not check a website, which is a _worse_ save-integrity outcome than a careful updater.
- **Rejected because:** §1 cuts both ways — an unpatched defect is a data-safety problem too.

---

## Tradeoffs Accepted

| We accept                                            | To gain                                               | Mitigation                                                         |
| ---------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| Rollback is bounded and sometimes refused            | A save is never orphaned by a version change          | The pre-migration backup is the documented path below the boundary |
| The player must consent to restart                   | An update never interrupts a session or a save        | Applied on next launch if they never say yes                       |
| Slower rollout than silent auto-update               | A bad build reaches fewer farms before it is halted   | Staged rollout with a halt (§6)                                    |
| No telemetry, so rollout health is coarsely observed | `VISION.md` §5.1's non-goals hold                     | Bucketing is local and non-identifying; halting is publish-side    |
| Plugin updates are out of scope                      | v0.2 ships an engine updater that is actually correct | The API-version policy prevents silent breakage (§8)               |

---

## Consequences

### Immediate (Phase 15 implements)

- The updater is added to the main-process platform service; the IPC contract and `settings.json` gain update state and the pin.
- The schema-bound rollback check reads `CURRENT_SCHEMA_VERSION` from both builds before acting.
- Signing is wired into the `electron-builder` pipeline; CI publishes signed artifacts.
- Interruption recovery is proven against a real installation, at each replacement step.
- `PLAN.md` §3's success criterion — _"auto-update never loses a save under interrupted-update testing"_ — becomes an executable suite.

### Ongoing

- **Never install an unverified package.**
- **Never roll back below the save's schema version.**
- **Never restart without consent, and never during a save.**
- **Never let the updater touch the save directory.**
- **Never use an OS notification for update state.**
- A new update capability inherits §1's precedence rule and states how.

### Validation

- **Interrupted update:** interrupting at each replacement step leaves a launchable application and an untouched save, asserted against a real installation.
- **Rollback boundary:** a rollback to a build with a lower `CURRENT_SCHEMA_VERSION` than the save is refused with a clear message, and the save is untouched.
- **Pre-migration recovery:** restoring the backup produces a save the older build loads and continues correctly.
- **Save-during-update:** an update restart requested mid-save waits for the write and never truncates it.
- **Signature:** a tampered artifact is rejected and the installation is untouched.
- **Presence discipline:** no prompt appears while hidden or in work mode; none is an OS notification.

### Revisit if

- Plugin distribution becomes a requirement → successor ADR; §8 is a scope boundary, not a permanent one.
- A save must be readable by an older build → it must not. Ship the fix forward (ADR-015 §3's repair-forward rule).

---

## Related

| Document                    | Relationship                                                              |
| --------------------------- | ------------------------------------------------------------------------- |
| ADR-015 §3, §4, §7          | Migration governance, forward refusal, and the pre-migration backup       |
| ADR-027                     | The v0.2 schema chain, and the backup retention this ADR depends on       |
| ADR-002 §2                  | The atomic-write discipline §4 mirrors                                    |
| ADR-014                     | The platform service this is a capability of                              |
| ADR-019 §1                  | The API-version support policy that keeps an update from breaking sources |
| `SAVE_FORMAT.md` §7.1, §7.2 | The write sequence and the quit-save trigger §5 reuses                    |
| `PLAN.md` §3                | The success criterion this ADR makes testable                             |
