# Phase 15 — Distribution & Auto-Update

> **Delivers:** the game can update itself without ever endangering a save.
> **Governing decisions:** ADR-025 (distribution and update), ADR-015 §3–§4 (migration governance and the forward refusal), ADR-027 (the v0.2 schema chain and the pre-migration backup), ADR-014 (the main-process platform service this is a capability of).
> **Schema:** none. This phase adds no persisted world state and no migration.
> **Status:** **In progress.** The machinery is built and live; what remains is proving §4 against a packaged installation.

---

## Commit boundaries

`ROADMAP.md` §11 sets four. They are being built **in the reverse of that order**, and the reason is ADR-025 §7: _"a library that cannot deliver §2's schema-bounded rollback, §4's interruption recovery, and §5's restart discipline is not adopted, and the gaps are implemented rather than the guarantees relaxed."_ A dependency can only be judged against that if the guarantees exist as something executable first. So the rules are written and proven in Node, and `electron-updater` is then measured against a test suite rather than against prose.

The four become fifteen below, and every split falls on the same seam: a rule that can be _proven_ ships separately from the wiring that merely _carries_ it (`AI_RULES.md` §4.2). §11's third boundary — "rollback boundary, pinning, and staged rollout" — is three commits here for exactly that reason; the pin's arithmetic, its announcement rule, and the preference that remembers it fail in different ways and are worth reverting independently.

| Order | Boundary                                                       | Commit |
| ----- | -------------------------------------------------------------- | ------ |
| 1     | The schema-bounded rollback guard (§4 of the roadmap's set)    | `15a`  |
| 2     | The offer policy: pin, staged rollout, and the boundary        | `15b`  |
| 3     | The announcement gate: when an offer may reach the player      | `15c`  |
| 4     | The pin, as a preference that survives a restart               | `15d`  |
| 5     | Atomic replacement with interruption recovery                  | `15e`  |
| 6     | The announcer: an offer that outlives a busy moment            | `15f`  |
| 7     | The check: the policy, the announcer, and an injected source   | `15g`  |
| 8     | The update state crosses the boundary — IPC, preload, main     | `15h`  |
| 9     | The renderer's view: an announcement that does not expire      | `15i`  |
| 10    | The announcement reaches the player: the slot's second variant | `15j`  |
| 11    | The pin control, and the E2E that proves the boundary          | `15k`  |
| 12    | The signing exception, with an expiry that bites               | `15l`  |
| 13    | The publish target, the dependency, and the §7 measurement     | `15m`  |
| 14    | The release source: a manifest the policy can actually read    | _this_ |
| 15    | The check runs: main's schedule, and a live announcement       | _this_ |

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

### The schema records the request; the policy judges the version

`settings-schema.ts` keeps a pin it cannot parse. That looks like missing validation and is the opposite: the two modules answer different questions, and collapsing them loses the answer that matters.

The schema answers **did the player ask to be held**. `update-policy.ts` answers **can this pin be ordered against this release**, and holds when it cannot. Sanitizing an unreadable pin to `null` in the schema would settle the first question with the second one's evidence — the pin would arrive at the policy as _no pin at all_, the hold would never happen, and a build the player refused would install. That is ADR-025 §1's precedence rule running backwards: update convenience deciding an integrity question.

So exactly one string is treated as no pin: the blank one, because a cleared field is how someone **removes** a pin rather than how they name a version. Trimming is safe for the same reason — it can rescue `' 0.2.1 '`, and it cannot invent a pin that was not written.

### The order of the checks is itself a decision

Four silent holds run before the schema guard, so a refusal — the only verdict a player ever reads — is reserved for a build that could actually have reached them. Warning someone that a release would have orphaned their farm, when a halt or a rollout wave meant they were never going to be offered it, is how an update system teaches people to dismiss its messages.

The test that pins this asserts a `hold`, not a `refuse`, for a release that is both halted and schema-incompatible. Reorder the checks and it fails.

### The rollout carries no identity, and stability is why it works

ADR-025 §6 requires a staged rollout with no telemetry, no account, and no server-side identity. The client's entire contribution is one integer in 0–99, derived locally by FNV-1a over a string the machine already has, never transmitted. The publisher moves `rolloutPercent`; each install answers for itself. **Nothing has to be counted for this to work**, which is what makes it honest rather than merely undeclared.

Stability is the load-bearing property, not the privacy. A bucket that re-rolled per check would let yesterday's excluded installs drift into today's wave, and a halt after a bad build would stop nothing.

### The announcement waits; it never cancels

`announcementTiming` answers `'now'` or `'wait'`, and the missing third value is the point. A player who hides the overlay or enters work mode has said they are busy (ADR-014 §1), not that they decline the update — so the prompt is deferred, and returns the moment they are available to be asked.

It is a **separate function from the verdict**, which is the decision worth carrying. Whether a release applies is settled once per check and does not move until the next one; whether now is a good moment moves every time a hotkey is pressed. Folding them together would re-run the rollout and schema arithmetic on every presence toggle, and would make a presence change look like a change of verdict.

Click-through is deliberately absent. It makes the overlay transparent to the mouse; it does not say the player is busy, and the toast surface is pointer-transparent by construction anyway, so there is nothing for an announcement to interfere with.

### The replacement was proven before the wiring that triggers it

Boundaries 5 and 6 swapped, and the reason is worth recording rather than silently renumbering. The replacement sequence is disk arithmetic and depends on nothing outside itself, so the phase's own rule applied again: build what can be _proven_ before what can only be _reviewed_.

The reason first given for the swap — that "check and apply" was **blocked** on a release source nobody had built — was wrong, and the correction is the more useful half. This project already answers that objection everywhere else: `save-store.ts` and `settings-store.ts` take the path as a parameter rather than calling `app.getPath`, which is what makes them provable without a host. A release source is the same shape. Injected, everything except the fetcher itself is testable today, and the dependency decision shrinks to the one component that genuinely needs it.

It also puts the yardstick before the purchase. ADR-025 §7 says a library that cannot deliver §4's interruption recovery is not adopted; `install-store.test.ts` is what that sentence gets measured with.

### Nothing installed is the window the sequence exists for

`retain` moves the installed directory out of the way before `swap` moves the new one in, which means there is a moment when nothing is installed at all. That looks like the bug and it is the design: the alternative — swap first, retain after — has a moment where the previous version is already gone and the new one is not yet proven, which is a single failure with **zero** launchable states rather than two.

Every step is a directory rename on one volume, so no directory ever holds half of each version. "Never a hybrid" is therefore structural, not asserted — the same property `SAVE_FORMAT.md` §7.1 step 5 buys from NTFS.

### Recovery finishes the update; it does not decide to roll back

A staged package is promoted **only when nothing is installed**. With `current/` present, `staged/` is a download the player has not applied, and installing it on launch would be the unasked-for update ADR-025 §5 forbids. With `current/` absent, the swap was interrupted and finishing it is completion, not a decision — the package was verified before anything moved (§4).

Falling back to `previous/` is the last resort and is **not** ADR-025 §2's forbidden automatic rollback. That rule governs _choosing_ to move a player backwards; here it is the only launchable state that exists, and because the new build never ran, nothing migrated and the retained version still reads its own save. The schema hazard needs a migration to have happened, and an interrupted install is precisely the case where none did.

### Once per version, not once per opportunity

The announcer is the only part of this phase that needs memory, and the memory exists for one rule: a release is announced **once**, however many chances to announce it go by. Presence moves all day and an available release does not, so announcing on every opportunity would turn one release into a toast on every hotkey press — `VISION.md` §5.1's notification spammer arriving through the back door rather than the front.

That is why `announced` stores what was last said rather than a boolean. A release the player has already been told about is not news; a genuinely newer one is.

### A halt has to catch an offer that is still queued

A verdict that earns silence clears anything pending. This is the halt doing exactly what ADR-025 §6 built it for: stopping an in-flight rollout **before more installs take it**. An offer that was queued behind work mode and then announced anyway would be a halt that arrived in time for everyone except the one player it could still have helped — the install that had not taken the update yet.

It also decides what `pending` means. It is not a queue of things that were true once; it is the single thing that is still true and still unsaid, re-derived from the latest check.

### Answering "nothing" is evidence; failing to answer is not

`checkForUpdate` treats a source that returns `null` and a source that rejects as **opposite** cases, and the distinction is the whole reason the function exists.

A source that answers "nothing on offer" has told us something: the release was withdrawn, which is one of the two ways ADR-025 §6 lets a publisher halt a rollout. A queued announcement is dropped, so the halt reaches the installs that had not taken the update yet — the only ones it can still help.

A source that could not answer has told us nothing. A laptop on a train fails this check constantly. Treating that as a withdrawal would silently discard an announcement the player had already earned, and reporting it would be `VISION.md` §5.1's notification spammer with a network error for an excuse. So a failed check leaves the state exactly as it found it and says nothing at all.

### The source is a parameter, which is what makes §7 answerable

ADR-025 §7 says a library that cannot deliver the guarantees is not adopted. That is only a decision anyone can make if the guarantees are executable and the library is separable from them — so the release source is injected, exactly as `save-store.ts` and `settings-store.ts` inject their directories.

What is left needing a dependency is one function that returns a release. Everything upstream of it — the policy, the announcer, the check that composes them — is proven without a network, and whatever eventually fetches releases is measured against these tests rather than trusted to embody them. Validating what comes off the wire belongs to that fetcher: a release crosses a trust boundary (`AI_RULES.md` §2.4), and this module receives it already shaped.

### `UpdateState` is not part of `CompanionState`

The temptation was real — `CompanionState` already carries opacity, volume and motion, and the settings panel hydrates from it, so a pin could have ridden along for free.

It does not, because that object has a stated meaning: the **presence family**. Its own comments justify each addition the same way — opacity governs how much the overlay intrudes on the eye, volume on the ear, motion on the attention. A version pin intrudes on none of them. Adding it would have quietly redefined `CompanionState` as "settings the panel happens to show", and the next unrelated preference would have had no argument against joining.

### The announcement is pushed, because the renderer cannot know when to ask

`GetUpdateState` is a poll and `UpdateAnnounced` is a push, and the asymmetry is not an oversight. The pin is a value the UI reads when it renders. The announcement is a **moment**, and the moment is decided in main: the announcer holds an offer while the player is hidden or in work mode and releases it when they return. A renderer polling for that would either miss it or have to poll constantly to catch it.

The payload restates `Announcement` rather than importing it, because this is a process boundary and a main-side type may not leak across it (ADR-003 §3). A refusal crosses as a finished **message**: the wording belongs with the rule that produced it (`explainRefusal`), and the renderer's job is to show it, not to phrase it.

### The boundary validates shape, and stops there

`validateNullableString` accepts `'the one that works'`. That is not a gap in the guard — it is the same division of labour the settings schema draws, one layer further out. This layer answers _is this the shape of a pin_; `settings-schema.ts` answers _did the player ask to be held_; `update-policy.ts` answers _can it be ordered against a release_.

Rejecting an unparseable pin here would have failed the call, left the old pin in place or none at all, and told the player nothing — an integrity question settled by a type check at the outermost layer that knows the least about it.

### A confirmation expires; a prompt does not

`CompanionToast` clears itself after 2,400 ms, and that is right for what it does: "Work mode on" is a **receipt** for something the player just did, and a receipt should get out of the way.

An update announcement is a **prompt**, and the same behaviour would be a bug. A player who looked away for three seconds would have silently declined an update, and the failure it produces — "the game never updates" — is worse and far harder to notice than the one auto-dismissal exists to prevent. ADR-025 §5 calls the announcement _dismissible_, which only means anything if it is still there to dismiss.

So the two surfaces share a slot and not a lifetime. Both replace rather than queue, because two stacked prompts is exactly the spam this product refuses to become.

### Dismissal is local, and main is never told

Main's announcer already recorded that this version was announced, so it will not offer it again. A dismissal round trip would add no information — only a second place for the two sides to disagree about what the player has seen.

This is the payoff from "once per version, not once per opportunity" being settled in the announcer: because main will not repeat itself, the renderer is free to forget.

### The slot became the component, and the guard moved with it

`CompanionToast.tsx` used to be one occupant of a slot; it is now the slot itself, with two occupants that share a shell and disagree about hit-testing. That is a real change to a stated invariant, so it is recorded here rather than absorbed.

`tests/hud-interactive-panels.test.ts` caught it, which is the system working. Its rule was _"this file contains no `data-interactive` anywhere"_, and the update prompt has to carry one — it is dismissible, and a dismiss button that is not a hit target is precisely the return-summary bug that test was written for.

What replaced it is narrower and truer. The source regex never could say **which** element carried the attribute; it only asked whether the file mentioned it. So the file-level check now asserts that both answers are present — `pointer-events: none` for the confirmation and `auto` for the prompt — and a future edit that made the whole slot interactive, or the prompt untouchable, still fails. Which element gets which is asserted against the rendered DOM in `companion-toast.test.tsx`, where the question is actually answerable.

`SaveNotice` keeps the strict rule, and `ActionNotice` joined it: it was always pointer-transparent and always meant to be, and nothing was holding it there.

### Work mode withholds an announcement it cannot un-announce

The announcer already refuses to deliver while the player is hidden or in work mode. This is the same rule arriving from the other direction: an offer already on screen when work mode **starts**.

It is withheld, not dismissed. ADR-014's rule for a summary suppressed by a hidden HUD is that it _defers rather than vanishes_, and the alternative here is worse than for a summary — the announcement is the only notice the player will get for this version, because main will not repeat itself. Clearing it on a hotkey press would silently spend the one announcement ADR-025 §5 allows.

The confirmation keeps the slot while it lasts, for the mirror-image reason. A receipt is about this second and deferring it would make a hotkey look unregistered; a prompt is not about this second, so it waits underneath and comes back.

### A namespace on the bridge that nothing could reach

Boundary `15h` added the `update` namespace to `src/preload/index.ts` and stopped there. `window.desktopLife` is typed in `src/shared/ipc/global.d.ts` — deliberately, so E2E tests driving the real bridge see the same shape — and that file was not touched, so the renderer could not name the namespace that existed.

Nothing failed. The preload compiles against its own `DesktopLifeApi`, the contract test only checks channel names, and no renderer code had asked for it yet. It surfaced here on the first line that did.

Worth carrying: the boundary is described in three files and a commit that changes two of them is incomplete without saying so. The gap was invisible for exactly as long as nobody used the feature — which is the definition of the kind of gap a type system is supposed to prevent.

### The pin control is a button, because a text field would invite the failure

ADR-025 §6 pins a **version**, so the obvious control is a field to type one into. It is the wrong one.

A player reaching for this is protecting a working farm: a plugin has not caught up, or this build is the one that works. What they mean is _not past here_, and "here" is the version they are running. The panel therefore pins `currentVersion` and clears to `null` — two states, no typing, and no way to produce a pin nobody can parse.

That last part matters more than the convenience. `update-policy.ts` holds on an unreadable pin, which is correct and is also silent: the player would see a pin they believe is protecting them, and the arithmetic behind it would have declined to run. A text field would put the one person least able to notice that in charge of avoiding it.

A pin **ahead** of the running build is still possible — from a hand-edited `settings.json`, or a rollback — and it is named rather than hidden behind an `On`, because "a pin is a ceiling, not a freeze" is invisible otherwise. The panel is the one place that state is ever visible.

The section waits for main before rendering at all. `UNKNOWN_VERSION` is the empty string, and a panel that showed "Version" beside nothing for a frame would be reporting a fact it does not have.

### The exclusion is only honest while the detector exists

`src/main/index.ts` and `src/preload/index.ts` are excluded from coverage, and `coverage-policy.config.ts` allows that **only** when a named test exercises them. Boundary `15h` added handlers to both and named nothing, which left two files carrying new untested lines behind an exclusion written for old ones. That was recorded as deferred rather than done, and `tests/e2e/update.spec.ts` is the payment.

It deliberately runs the whole width rather than a slice: the control, the contextBridge, the handler, the settings schema, the write, and the read back after a restart. Every unit on that path is already proven in isolation — that is what the preceding nine boundaries were. What no unit can answer is whether they are connected, and the failure it actually rules out is the one that leaves every unit test green: a handler registered on a channel nobody calls, or a panel showing a version it made up.

The third case — clearing a pin — is there because `null` has to reach the schema as an explicit value. An absent key would be read as "unchanged" by the next parse, and the pin would become unremovable through the UI that set it.

### The save is outside the blast radius by construction

`install-store.ts` takes the installation root as a parameter, so it has no way to name the save directory — the same structural argument `rollback-guard.ts` makes about not being able to touch a save. The test still plants a real save file beside a real installation and re-reads it byte-for-byte after a halt at every step, because ADR-025 §4 lists four ways an updater could touch one (moved, migrated, backed up, cleaned) and a guarantee worth having is worth failing loudly.

### An unreadable version is never acted on

`compareVersions` accepts strict `major.minor.patch` and answers `null` for anything else — a pre-release suffix, a build tag, a channel name. An updater that guesses at a version it does not understand installs the wrong build, and this project ships no pre-release channel for the guess to serve. `null` propagates to a hold, so the failure mode of not understanding a release is doing nothing.

---

## Acceptance

`ROADMAP.md` §11's list, with what each currently rests on.

- [x] A rollback to a build with a lower `CURRENT_SCHEMA_VERSION` than the save is refused with a clear message, save untouched — `src/main/rollback-guard.test.ts`
- [x] No prompt appears while pinned, halted, outside the rollout wave, hidden, or in work mode — `src/main/update-policy.test.ts`
- [ ] Interrupting the update at each replacement step leaves a launchable application and an untouched save — the sequence is proven against real directories in `src/main/install-store.test.ts`; the box stays open until the **publish** boundary re-runs it against a packaged installation, which is what the criterion says
- [ ] A pre-migration backup restored into the older build loads and continues correctly — the **apply** boundary, once the recovery path is reachable from the UI
- [ ] An update restart requested mid-save waits for the write and never truncates it — the **apply** boundary, reusing phase-07e unchanged
- [ ] A tampered artifact is rejected and the installation is untouched — the **publish** boundary
- [x] No prompt is an OS notification — the surface is `CompanionToast.tsx`, which is in-overlay by construction: it is a `div` inside the React root, and the renderer has no path to a `Notification` at all. `src/renderer/app/hud/companion-toast.test.tsx` asserts what it shows and when
- [x] `PLAN.md` §3's _"auto-update never loses a save under interrupted-update testing"_ is an executable suite — `src/main/install-store.test.ts`

### The library was measured, and it delivers one and a half of three

ADR-025 §7 made the dependency conditional: a library that cannot deliver §2, §4 and §5 is not adopted. That sentence only means something if someone runs the measurement, so here is what it found — recorded in full in `TECH_STACK.md` §7.4.

- **§5 restart discipline — yes, but only against its own defaults.** `autoDownload` and `autoInstallOnAppQuit` both ship as `true`. Out of the box, `electron-updater` _is_ the silent background updater ADR-025 §Alternatives A rejected: it downloads on check and installs on quit, and the second one races the quit-save.
- **§2 schema-bounded rollback — no, and it cannot.** It has no concept of a save. `allowDowngrade: false` blocks an automatic downgrade and says nothing about whether a **forward** build can read the save on disk, which is the case §Context is actually about.
- **§4 interruption recovery — not established.** It verifies the download and hands off to the NSIS installer, which does the replacement. That is not `install-store.ts`'s retain → swap → commit, and "an interrupted update leaves a launchable application" has not been demonstrated for it.

None of this is a mark against the library. It is very good at the half nobody should hand-write — reaching a feed, resumable transfer, SHA-512 before handoff, the Windows elevation dance — and the measurement is what says where its half ends.

It also vindicates the ordering this phase argued for from the first commit. The policy was written and proven before the library existed, so the gaps had answers already; had the dependency come first, §2 would have been "configured" with `allowDowngrade` and the schema hazard would have shipped.

### A setting we override is not the same kind of thing as one we agree with

`updater-config.ts` names the two categories separately, and the distinction is about how each decays.

A setting we merely agree with survives a library upgrade that changes its default — we would start relying on the new value and lose nothing. A setting we **override** is the only thing between this product and behaviour its governing ADR rejected, so an upgrade that flipped the default back would cost a guarantee with nothing to notice.

The module imports nothing at all, least of all `electron-updater`. That is the `save-store.ts` doctrine one more time: the settings carrying §2 and §5 are unit-testable without a host, and the binding that owns the library applies them and decides nothing.

### The audit gate was documentation wearing a gate's clothes

`TECH_STACK.md` §7.3 has said since phase-00 that _"`npm audit` runs in CI; high and critical advisories fail the build"_. There was no audit step in `ci.yml`. None. The claim was false for the entire life of the project.

It was found the only way a claim like that ever gets found — by tripping it. Installing `electron-updater@6.8.9` resolved `js-yaml@4.3.0`, which carries a high advisory, and **promoted it into the shipped dependency tree**, where §7.3's policy applies. Nothing objected, because nothing was watching.

This is precisely the failure phase-08.0 was created to fix for coverage: _"six of the seven were documentation wearing a gate's clothes, and nobody found out until the v0.1 release gate came due."_ The same shape, in the same document, three phases later.

The fix follows 08.0's rule rather than the convenient one: the gate is scoped to what it can honestly enforce (`--omit=dev`, the tree that reaches a player, currently clean at zero) and the document now **states** that the dev tree's asset-pipeline advisories are not gated, instead of implying a coverage it does not have. A narrower true claim beats a broader false one.

### The advisory was fixed by resolution, not by exception

`js-yaml@4.3.1` is outside the advisory range and satisfies `electron-updater`'s own `^4.1.0`. So the lockfile moved and nothing was overridden, pinned against a declared range, or waived.

Worth recording because the alternatives were all available and all worse: an `overrides` entry, an audit exception file, or lowering the gate to `critical`. Each would have left a high advisory in shipped code and a note explaining why that was fine.

### The feed cannot carry the fields the policy needs

The open question this phase now ends on, and it is a design decision rather than a defect.

`OfferedRelease` has four fields. `electron-updater` supplies `version`. The other three do not exist in electron-builder's generated `latest.yml` and there is no supported way to add them:

- **`schemaVersion`** (§2) — the `CURRENT_SCHEMA_VERSION` the offered build reads. Without it the rollback guard has nothing to compare against, and §2 is unenforceable.
- **`halted`** (§6) — the publish-side stop. §6 requires halting an in-flight rollout _"before more installs take it"_, which is the only mitigation that works after a bad build is out.
- **`rolloutPercent`** (§6) — the wave. The library has its own `stagingPercentage`, but it buckets installs by a persistent random id it writes to disk, where ADR-025 §6 requires a bucket derived locally and never stored as an identifier. `deriveRolloutBucket` already satisfies that and is tested.

So the release source needs a source of truth the feed does not provide, and choosing it is boundary 14's decision — not something to settle by writing code and discovering the format afterwards.

### The halt is the reason the manifest is separate

The manifest looked like a workaround for something `latest.yml` could not carry. It is the better shape, and ADR-025 §6 is what says so:

> **A staged rollout can be halted.** Publishing a halt must be able to stop an in-flight rollout **before more installs take it**, which is the only mitigation that works after a bad build has been signed.

Halting therefore means editing four lines of JSON and re-uploading one small file. No rebuild, no re-publish of binaries, nothing to sign, and no release cycle. A halt that had to travel inside the generated feed would have meant regenerating the artifact the download itself depends on — the slowest possible path for the one operation that has to be the fastest.

The second-order benefit is that the format is ours. `schemaVersion` exists because §2's guard needs the **target build's** number, and nothing in electron-builder's output was ever going to grow that field.

### One bad field refuses the whole manifest

There is no repair path, and both obvious ones fail in a specific direction:

- defaulting `halted` to `false` would let a manifest that **lost** its halt flag resume a rollout somebody deliberately stopped — §6's mitigation failing open, which is the one way it must never fail;
- clamping a nonsense `rolloutPercent` would deliver a build to a population the publisher did not choose.

So an unreadable manifest is not acted on, which is ADR-025 §1 at its cheapest: integrity outranks delivery, and doing nothing is always available.

Exactly four fields are read and everything else is ignored. That is forward compatibility in the safe direction — a future publisher can add a field without older clients refusing every release, while an older client still never guesses at something it does not understand (`AI_RULES.md` §2.4).

### The version's format is checked one layer in, and only there

`parseReleaseManifest` accepts `nightly-2026-08-13`. That is not a hole.

`compareVersions` accepts strict `major.minor.patch` and answers `null` for anything else, and a null propagates to a hold — so the rule exists already, at the layer that owns the comparison needing it. Restating it in the parser would put one decision in two places, which is how two places come to disagree.

This is the same division the pin draws three times over: the IPC boundary asks _is this the shape of a version_, the schema asks _did the player ask for it_, and the policy asks _can it be ordered_. Each layer answers the question it can actually answer.

### A 404 is not a withdrawal

The source rejects on any response that is not `ok`, rather than reading a missing manifest as "nothing on offer".

Both readings are defensible and one is much worse when wrong. A deleted manifest and a typo in the URL produce identical evidence, so treating the case as a withdrawal makes a **permanently broken updater indistinguishable from a permanently quiet one** — it would look exactly like a product with no updates to give, forever, and nothing would ever say otherwise.

Withdrawal keeps its own unambiguous expression, `halted: true`, so §6's halt loses nothing by this being strict. And it preserves boundary 7's distinction intact: answering "nothing" is evidence, failing to answer is not.

### §7's dependency turned out not to need one

ADR-025 §7 named the release source as the component that would need `electron-updater`. It needs nothing: the manifest is a small JSON document over HTTPS, so the transport is `fetch` and the parsing is ours — injected, and therefore proven without a host or a network like everything else in this phase.

What the library actually owns is the half after this one: download, SHA-512 verification, and handoff to the installer for the version the policy already approved. That is a narrower dependency than §7 anticipated, and it is narrow in the direction the ADR wanted — the policy is not the library's to hold.

### The service is the only thing in the chain that remembers

Fourteen boundaries produced pure functions of their arguments — the guard, the policy, the announcer, the manifest parser, the check that composes them. `update-service.ts` is the first that holds anything, and it holds exactly two: what the announcer has already said, and the timer.

That is why its tests are the first that could prove certain things at all. "Announce a version once, however many checks go by" is not a property of `announceVerdict` — that function is given a state and returns one. It is a property of the same state surviving twenty-eight six-hourly calls, and only something stateful can be wrong about it.

Its four dependencies are injected, so the real schedule runs against fake timers and never touches Electron. `index.ts` supplies four closures and a transport, and decides nothing.

### The inputs are closures, because both halves move

`inputs` is a function rather than a value, and the reason is a bug that would have been invisible. A pin set at 10am must take effect at 10am, not at the next relaunch — and the save's schema version changes the first time a migration runs, mid-session, which is precisely when the rollback guard most needs the new number.

Capturing either at construction would have produced an updater that was correct on the day it started and quietly wrong afterwards.

### A background check may never reject

`check()` swallows everything, and that is not defensive padding. It runs on a timer with nobody holding the promise, so an unhandled rejection takes down the main process — over a save file that happened to be locked, or a settings read that raced a write.

`checkForUpdate` already absorbs a failing source. This absorbs the rest, and the outcome is identical either way: a check that could not be made changes nothing and says nothing.

### Presence has one funnel, and it was already there

`broadcastCompanionState` is called by work mode and by quick hide, which makes it the single place the player stops being busy. The service's `presenceChanged()` hangs off it rather than off three separate hotkey handlers.

Opacity, volume, and motion changes pass through it too and say nothing, because `announceToPresence` is idempotent — with nothing pending it returns the state it was given. That is the announcer's design paying for itself: the funnel did not have to learn which changes are presence changes.

### The rollout seed is something the machine already has

ADR-025 §6 asks for a bucket that is stable, locally derived, and not an identifier. The profile path satisfies all three without anything being generated or stored: it exists because the app has to write settings somewhere, it survives restarts, and it distinguishes two installs on one machine where a hostname would not.

It never leaves `rolloutSeed()`. `deriveRolloutBucket` reduces it to one integer in 0–99, and even that is never transmitted — the publisher moves `rolloutPercent`, each install answers for itself, and nothing has to be counted.

This is also the concrete contrast with `electron-updater`'s own `stagingPercentage`, which buckets by a random id it writes to disk. That is a persistent per-install identifier, which is the thing §6 declines to create.

### Two minutes, then six hours

Neither number is in the ADR, so both are recorded here.

**Not at launch.** Startup is already contending for disk — the save load, plugin discovery, the renderer's first frame — and ADR-025 §1 ranks update speed below every one of them. A check landing in the first seconds would also announce into a UI still mounting.

**Six hours** is a compromise between two forces pulling opposite ways. A halt only reaches an install on its next check, so a shorter interval propagates one faster; but an updater polling every few minutes is a background process someone will eventually notice in a network monitor, which is its own kind of intrusion. Six hours reaches most installs within a working day, and with `autoDownload` off, every install that has merely been offered a build is still one the halt can help.

### The feed address is written twice on purpose

`electron-builder.yml` resolves the repository at publish time; the client needs the address at run time, from a bundle built long before that release existed. The two cannot be collapsed into one place.

So both read `package.json`'s `repository`, and `update-feed.test.ts` asserts they still agree. The failure it prevents is silent and total: a client fetching from a repository nobody publishes to checks forever, finds nothing, and is indistinguishable from a product that simply has no updates.

`releases/latest/download/...` resolves server-side, so a build from v0.2.0 finds the v0.9 manifest without being rebuilt — a versioned URL would freeze each build's view of the world at the moment it compiled.
