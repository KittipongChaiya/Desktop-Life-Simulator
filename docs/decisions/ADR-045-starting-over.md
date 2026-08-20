# ADR-045: Starting Over

**Status:** Accepted — v0.5+ (post-RC), phase 53.
**Date:** 2026-08-20
**Bound by (not re-litigated):** ADR-002 (the save is the product); ADR-003 §3 (the renderer is untrusted and never derives a filesystem path); ADR-010 §1 (commands are the only write path into a _live_ world); ADR-018 (developer tooling writes only through commands); ADR-027 §2 (pre-migration backups are kept indefinitely); `SAVE_FORMAT.md` §1 and §7.

---

## Context

The owner asked for a **"Start New Game" button in the settings menu**.

That is an ordinary feature request, and this project's persistence design
calls the outcome it produces a catastrophe:

> `SAVE_FORMAT.md` §4 — "parse fails → read `slot-0.json.bak` → still fails
> → clear error, **NEVER a new game**"

> `save-compatibility-report.md` §8 — "Both files corrupt → clear in-overlay
> error. **Never a new game** — that is the forbidden outcome"

> `ADR-018` — "The first `reset world` button that clears stores directly is
> also the first bug report nobody can reproduce."

Five versions of load-path engineering exist to make sure a player who has a
farm never comes back to an empty one. The feature asks for a button that
produces exactly that.

---

## Decision

### 1. A player who chooses this is not the forbidden outcome, and the distinction is the whole design

The prohibition is about **a farm disappearing without anybody asking for it**
— a corrupt file, a failed parse, a missing directory read as "new player".
The player is not present in any of those, which is what makes them
catastrophic: the game silently decided the last three months did not happen.

A player standing in the settings panel deliberately ending their own farm is
the opposite situation, and the same sentence does not cover both.

**But the prohibition sets the bar rather than being irrelevant to it.** Two
properties are required, and everything below follows from them:

- **It must be impossible to do by accident.** One stray click cannot end a
  farm.
- **The farm must survive the button.** "Deliberate" is not the same as
  "irreversible", and a player who meant to click it can still have meant
  something they regret.

### 2. The old farm is ARCHIVED, never deleted

The reset moves every save artifact into `saves/archive/<timestamp>/`:
`slot-0.json`, `slot-0.json.bak`, any stray `.tmp`, and the whole `backups/`
directory including its pre-migration copies.

Three reasons, in order of how much they matter:

**It keeps the farm.** A player who clicks this and changes their mind has
their world sitting in a folder, recoverable by moving one file back. Nothing
the game does destroys months of play.

**It keeps ADR-027 §2's promise.** Pre-migration backups
(`slot-0-v<N>-premigration.json`) are kept _indefinitely_ because they are the
only artifact an older build can read after a rollback across a schema bump.
A delete would take them; a move does not.

**It keeps backup rotation working, which a delete would silently break.**
`pruneBackups` sorts `slot-0-<tick>.json` by the tick in the filename and
removes the LOWEST. A new game starts at tick 0, so its backups sort _below_
the old farm's — after a reset that left `backups/` populated, the rotation
would keep deleting the new game's copies and retaining a farm that no longer
exists. The new game would accumulate no backups at all. Moving the directory
aside is what makes the new farm's rotation correct, and it costs one rename.

### 3. The reset is a RELOAD, not a live world swap

A `World` cannot be reset in place. Every store on it is `readonly`, `seed` is
documented "Never changes", and `ticksPerDay`/`seasons` are frozen at
creation. A reset is a new `World`, not a modified one.

Replacing it inside a running session means re-binding roughly fifteen sites
in `composeApplication` — the snapshot store and its per-slice delivered
versions, the game loop, the Pixi mount, the command dispatcher, five event
subscriptions, the save closure, plus module-scope state and the diff
baselines that would otherwise fire placement sounds for the new town's
buildings. There is no precedent for swapping a live world anywhere in the
codebase.

`bootApplication()` already does all of it, correctly, on every launch. So the
reset archives the save and calls the reload capability that
`start.tsx` already passes to devtools; boot re-runs, finds no save, and takes
the `saves.missing` branch that has built every new farm since v0.1.

**The cheapest correct path is the one that reuses the code that is already
right**, and a reset that shares the ordinary first-launch path cannot drift
away from it.

### 4. It is not a command, and that is legal

ADR-010 §1 says commands are the only write path into a live world. This
writes no world at all — it ends one process's world and lets boot construct
another, and `town.ts` already states the boundary: _"a world being built or
hydrated is not live yet."_ `createWorld`, `foundTown` and `claimCenteredPlot`
are all construction-time writes on the same footing.

What the reset must NOT do is what ADR-018 warned about: reach into stores and
clear them. It does not touch a store.

### 5. Main stops saving before it archives

The most dangerous bug this feature can have is not losing the old farm — it
is **keeping it**. The renderer holds a live world; main runs an autosave
cadence and fires a save on quit and on close-to-tray. Archive the files while
that world is still in memory and the next trigger writes it straight back,
producing a "new game" that is the old farm with a corrupted-looking archive
beside it.

So the archive handler stops the save coordinator FIRST, and the renderer
reloads immediately after. The window between them is the only moment where a
save must not happen, and nothing may be able to request one inside it.

### 6. The button arms before it fires

There is no confirmation primitive anywhere in this application — no modal, no
`window.confirm`, nothing two-step. That is not an oversight to correct here:
a modal dialog in a frameless, always-on-top overlay is the wrong shape, and
`window.confirm` blocks the renderer thread that is running the simulation.

The control arms on first click and fires on second, disarming on a timeout
and whenever the panel closes. It is the smallest thing that makes an accident
impossible, it needs no new UI vocabulary, and it follows the judgement
`SourcesSection` already makes: **a control should not invite a click it will
refuse.** An armed button invites the second click honestly, and says what it
will do.

---

## What is deliberately NOT done, and why

**No save slots.** `SAVE_FORMAT.md` §1 notes the path shape supports them, and
they are a different feature: slots are about keeping several farms, this is
about ending one. Building slots to serve a reset would be the larger change
justified by the smaller need.

**No in-game archive browser.** Restoring means moving a file back, which is a
rare, deliberate act and is documented. A UI for it is speculative until
somebody needs it.

**No preservation of the disabled-source list.** Which content packs are
switched off lives in the save, so a new game re-enables every installed
pack. That is correct for a fresh world — a new farm should not inherit an
old farm's content decisions — and it is stated here because the alternative
is defensible and someone will wonder whether it was considered.

**Accessibility and companion settings are untouched**, because they were
never in the save. Reduced motion, volume, opacity and the version pin live in
`settings.json`. A player who needs reduced motion needs it in their next farm
too, and losing it to a "new game" would be a genuinely harmful bug rather
than a debatable one. It is asserted in the E2E rather than assumed.

---

## Consequences

**Good**

- The first destructive control in the application is not actually
  destructive. Nothing the button does removes a player's world from disk.
- The reset shares the ordinary first-launch path, so it cannot drift.
- A latent defect is fixed on the way past: backup rotation would have broken
  after any reset that left `backups/` in place.

**Bad, and accepted**

- `saves/archive/` grows without bound. A player who starts over ten times
  keeps ten farms. At the reference farm's ~38 KB that is not a problem worth
  code, and deleting a player's farms to save kilobytes would invert this
  ADR's entire argument.
- Recovering an archived farm is a manual file move, and is documented rather
  than built.

**Risky**

- The stop-saving/reload window (§5). It is small, it is sequenced explicitly,
  and it is proven by an E2E that relaunches the app and asserts the farm did
  not come back — not by reasoning about the ordering.

## Revisit if

- **Save slots arrive** → the archive becomes a slot, and the reset becomes
  "switch to an empty slot". This ADR's §2 argument survives; §3 may not.
- **Players ask to restore from inside the game** → build the browser then,
  against a real request, over an archive format that already exists.
- **The archive is ever found to be growing painfully** → prune by count with
  the same care §2 gives to pre-migration backups, and never silently.
