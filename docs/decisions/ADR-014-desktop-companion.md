# ADR-014: The Desktop Companion

|                   |                                                                |
| ----------------- | -------------------------------------------------------------- |
| **Status**        | Accepted                                                       |
| **Date**          | 2026-07-23                                                     |
| **Deciders**      | Project owner (directives `fix/0.1/1.8.md`, `fix/0.1/1.8a.md`) |
| **Supersedes**    | ADR-003 — the window **z-order clause only** (see §2)          |
| **Superseded by** | —                                                              |

> The canonical authority for every desktop-companion feature — window presence, global hotkeys, platform persistence — from phase-01.8 through v1.0+. Authored under the foundation freeze (ADR-012) as its second sanctioned new decision. This ADR defines **platform architecture only**; concrete numbers (the opacity range, the work-mode constant) live in the phase-01.8 specification and the settings schema, not here.
>
> **Amended 2026-07-23** by directive `fix/0.1/1.8a.md`: §4 gains the categorized application settings model; §5 gains the rebindable-shortcut architecture (stable actions, one bindings table, the centralized `ShortcutManager`).

---

## Context

**Where the project stands.** Phases 00–06 shipped the complete v0.1 game loop — the farm runs and earns entirely unattended. Phase-07 (save/load) is the last phase before v0.1 is whole. The directive `fix/0.1/1.8.md` orders the desktop-companion layer built first.

**Why these features are the identity.** The product is "a living little world at the bottom of your screen while you get on with your day" (`VISION.md` §1). Phase-01 made the overlay _unobtrusive_ — docked, frameless, focus-proof, click-through by region. But unobtrusive is the game's promise about itself; a **companion** gives the player the controls: how present the game is (opacity), whether it exists at all right now (quick hide), whether it can be touched (click-through mode), and how much of its interface speaks while its world keeps living (work mode). These are not gameplay systems. They are the platform features that let the game coexist with real work, and they define what this project _is_.

**Why now, before phase-07.** Desktop settings are application preferences, not save data. Deciding that boundary — and shipping the store that embodies it — _before_ the save schema exists guarantees no companion state ever leaks into `SAVE_FORMAT.md`, rather than having to be migrated out later. Phase-07's return summary must also know that work mode exists (a summary suppressed by a hidden HUD must defer, not vanish), which is knowable only if work mode ships first.

**Bound by (not re-litigated):** `VISION.md` §2.1 (the desktop comes first — a hard constraint), §5.1 (never a notification spammer; never a foreground game); ADR-003 (platform behavior lives in the main process; the renderer is untrusted); `ARCHITECTURE.md` §2.1 (the sim is headless and pure — it imports only `shared`); ADR-007 §1 (presentation state never enters the simulation); ADR-012 (the freeze this ADR is authored under).

---

## Decision

**The desktop companion is a platform service in the main process plus presentation responses in the renderer. The simulation never learns any of it exists — no companion concept may appear in `src/sim`, in a snapshot slice, or in the save.**

### 1. Desktop philosophy

The game is a guest on the player's desktop (`VISION.md` §2.1). Phase-01 made the guest quiet; this ADR makes the guest **adjustable** — presence becomes a set of dials the player owns rather than promises the game makes:

| Dial          | Control             | Meaning                                              |
| ------------- | ------------------- | ---------------------------------------------------- |
| How visible   | Opacity slider      | The game fades to taste, never fully invisible       |
| Whether shown | Quick hide (global) | Gone this instant, back exactly as it was            |
| Whether solid | Click-through mode  | Visible but mouse-inert — a picture, not a window    |
| How loud      | Work mode           | The living world stays; every interface element goes |

And one inversion: the overlay now lives **behind** normal application windows. The game is part of the desktop, not part of the workspace — VSCode, the browser, the terminal, and every ordinary window sit above it, always. Fullscreen applications were already protected (phase-01); now everything is.

Through every dial, **the simulation continues**. Hidden, inert, muted — the farm farms. Pausing on any of these would invert the product thesis (`VISION.md` §2.2).

### 2. Window behavior

- **Always-on-bottom, superseding ADR-003's always-on-top clause.** ADR-003 specified "a borderless, transparent, always-on-top window" and phase-01 shipped `setAlwaysOnTop(true, 'floating')`. That clause — and only that clause — is superseded: the overlay must remain behind normal application windows and must never raise itself. Everything else in ADR-003 (process split, Electron choice, IPC discipline) stands untouched. The freeze is honored by this supersession being an ADR (ADR-012 §2).
- **Mechanism, at the decision level:** the window never self-raises (it is already `focusable: false` and shown with `showInactive`) and is pushed to the bottom of the z-order on show and on display changes. If Electron's surface proves insufficient on Windows, a native `HWND_BOTTOM` call is permitted — confined to `src/main`, behind the platform service, with its own review.
- **Quick hide is `hide()`/`showInactive()`** and nothing else. Hiding changes no other state — not opacity, not position, not mode — so restoration is exact _by construction_ rather than by bookkeeping.
- **Opacity is a window property** (`BrowserWindow.setOpacity`), applied immediately on change. Work mode's reduced opacity is a **mode constant deliberately below the slider's floor** — it reads as a different state, not a slider position, and leaving work mode restores the player's own setting.
- **Click-through mode is a main-process override** stacked on phase-01's per-region hit-testing: mode ON forces mouse transparency regardless of what the renderer's hit-testing requests; mode OFF returns control to hit-testing untouched. Two mechanisms, one owner, no negotiation between them.

### 3. Platform boundaries

| Concern                                                      | Owner                                        |
| ------------------------------------------------------------ | -------------------------------------------- |
| Global shortcuts, opacity, z-order, hide/show, click-through | `src/main` — the platform service            |
| Companion preference persistence (`settings.json`)           | `src/main` (the existing phase-01 store)     |
| Work-mode HUD hiding, toasts, the settings section           | `src/renderer/app` — presentation state only |
| Companion state transport                                    | The typed IPC contract, extended (ADR-003)   |
| **Anything at all**                                          | **Never `src/sim`**                          |

The renderer's work-mode state is a presentation store in the placement/seed-selection pattern — it changes what the UI shows, and per ADR-007 §1 it can never enter the simulation. The sim's existing boundary (imports only `shared`, no DOM, no Electron) already makes a violation a compile error; the addition here is the rule that no companion field may be added to `World`, to any snapshot slice, or to the save schema. A future feature that seems to need the sim to know about window state has a design problem, not a plumbing problem.

### 4. Persistence rules

- **Desktop settings are application preferences** in `settings.json` — the phase-01 store, extended. Persisted: opacity, work-mode last state, and the existing collapsed flag. They are **not** save data: loading a save never touches them, and no save field may mirror them.
- **The settings file is a categorized application settings model** _(amended per `fix/0.1/1.8a.md`)_: preferences group into categories — `overlay` (window arrangement) and `desktop` (the companion dials) today; input bindings, audio, graphics, language, and accessibility arrive as new categories. The parse is tolerant per category and per field, so a future category never breaks an old build and an old file upgrades in place on its next write. The schema lives pure and unit-tested in `src/main/settings-schema.ts`.
- **The save system may never touch this file**: loading a save never overwrites desktop settings, deleting a save never deletes them, and creating a new world preserves them. Phase-07 is built against this rule, not merely reminded of it.
- **Hidden state and click-through mode have no persisted representation at all** — the strongest form of "reset on launch." A player must never start the app invisible or untouchable; those states exist only between a toggle and its counter-toggle.
- Preferences keep their existing regime: cheap to lose, re-derivable from defaults, plain writes — never the atomic machinery saves require (ADR-002 §2, `src/main/settings.ts`'s recorded stance).

### 5. Shortcut policy

`GAME_DESIGN.md` §8.3 deferred global hotkeys to v0.2 pending "its own design pass." **This is that pass**, and it lands exactly three:

| Hotkey         | Action             | Why it must be global                              |
| -------------- | ------------------ | -------------------------------------------------- |
| `F12`          | Quick hide/restore | Must work when the window is hidden                |
| `Ctrl+Shift+C` | Click-through mode | Must work when the window ignores the mouse        |
| `F11`          | Work mode          | Must work without giving the overlay focus (never) |

The policy:

1. **Global registration is reserved** for actions that must function while the overlay is not interactive. In-game keys (`1`–`4`, `Space`, `F1`/`F3`/`F4`) stay window-local; a global expand hotkey remains v0.2.
2. **Registration failure is non-fatal.** A hotkey already claimed by another application is logged and skipped; the feature degrades, the app never crashes, and the tray remains the universal fallback.
3. **The cost is named honestly:** a global `F12` shadows other applications' `F12` (browser devtools among them) while the game runs. v0.1 accepts the directive's bindings; rebindable shortcuts are the first item in §6.
4. **Three is the number.** Adding a fourth global hotkey requires amending this ADR — the directive's restriction list ("no additional hotkeys") is adopted as an architectural bound.

**The rebindable architecture** _(amended per `fix/0.1/1.8a.md`)_. Four statements, explicit and binding:

- **The table above lists defaults only.** The keys are v0.1's fixed bindings, not the features' identity.
- **Shortcut actions are stable identifiers** (`ShortcutAction.WorkMode` / `QuickHide` / `ClickThrough`, `src/shared/shortcuts.ts`) — the names any future rebinding configuration keys on; they never change once shipped.
- **Key bindings are replaceable configuration.** Physical keys exist in exactly one place — the bindings table beside the actions — and every registration passes through the centralized `ShortcutManager` (`src/main/shortcut-manager.ts`); no `if key == F11` exists anywhere. v0.1's configuration source is the default table itself.
- **A future rebinding UI requires no architectural change**: it replaces the configuration source (an `input` settings category feeding the manager and the settings panel's reference, which already render from the table) and touches nothing else.

### 6. Future extensibility

Every restricted feature in the directive arrives, if it ever arrives, as a new capability of the same platform service — behind the same IPC contract, the same persistence rules, and the same sim-invisibility guarantee. None requires new architecture:

| Future feature                                                | Arrives as                                                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Rebindable shortcuts                                          | An `input` settings category replacing the default bindings table as the `ShortcutManager`'s configuration source — built, see §5's amendment |
| Multi-monitor selection                                       | A docking-service parameter (phase-01's `docking.ts` owns geometry)                                                                           |
| Always-on-top opt-in, streaming/screenshot/presentation modes | New presence states in the same state model (§Trade-offs table)                                                                               |
| Auto-hide, focus/idle detection                               | New _inputs_ to the same state model — never new state kinds                                                                                  |
| A second work-mode-like profile                               | Work mode generalizes to named presentation profiles (visibility set + opacity); the first profile ships in 01.8                              |

---

## Alternatives Considered

| Alternative                                                                 | Verdict                                                                                                                                                                                                |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Renderer-owned companion logic** (CSS opacity, DOM hiding as "hide")      | Rejected. CSS opacity leaves an invisible click-target ghost; a hide must remove the _window_; global hotkeys must outlive an unfocusable, hidden window. Platform behavior belongs to main (ADR-003). |
| **Keep always-on-top, add yield heuristics** (auto-minimize when "working") | Rejected. Heuristics guess at the player's intent; z-order states it plainly. Behind-normal-windows is the identity, not an optimization to approximate.                                               |
| **Persist every state, including hidden/click-through**                     | Rejected, and forbidden by the directive. Launching invisible or untouchable is indistinguishable from a broken install.                                                                               |
| **OS notifications for mode toggles**                                       | Forbidden (`VISION.md` §5.1 — not a notification spammer). Confirmation is an in-overlay toast that dismisses itself.                                                                                  |
| **Pause the simulation when hidden or in work mode**                        | Rejected. The product thesis is the opposite: absence earns (`VISION.md` §2.2). The companion changes what the player _sees_, never what the world _does_.                                             |

---

## Trade-offs

- **Behind-normal-windows means a maximized window covers the game entirely** — including the collapsed status bar. Accepted, with eyes open: that is what "guest" means, and it is the directive's explicit intent. The game is visible exactly when the player's layout leaves it visible; the tray and the global hotkeys are the handles that never disappear. The glance loop (`VISION.md` §3.1) now happens on the player's terms, not the game's.
- **Global hotkey shadowing** — `F12`/`F11` are meaningful in other applications. Accepted for v0.1 per the directive; rebinding is the first extensibility item and the mitigation is that the hotkeys exist only while the game runs.
- **Two opacity sources** (slider and work-mode constant) — resolved by one precedence rule: work mode active → mode constant; otherwise → slider. No blending, no memory of anything but the slider value.
- **Presence states multiply** (expanded / collapsed / work / hidden / click-through). Contained by orthogonality: hidden and click-through compose over any base state; work mode is a variant of expanded. The state model is small and is tested as a unit.

---

## Consequences

**Positive:** the features that define the project's identity exist; the player — not the game — owns how present the game is; the sim is untouched, so there is zero determinism or gameplay risk by construction; the settings/save boundary is fixed _before_ phase-07 freezes the save schema; every future platform feature has a named home.

**Known limitations:** visibility depends on the player's window layout (accepted above); hotkeys are fixed bindings in v0.1; primary display only, as since phase-01.

**Technical implications:** phase-01.8 implements the platform service in `src/main` (global shortcuts, opacity, quick hide, click-through override, z-order), the `settings.json` schema extension, the IPC contract extension, and the renderer's work-mode store, toast surface, and Desktop Companion settings section. `docs/phases/phase-01.8-desktop-companion.md` owns the concrete numbers and the milestone plan.

**Migration strategy:** none for saves — nothing here touches them, which is the point. `settings.json` gains fields with defaults; the existing tolerant loader (missing fields → defaults) makes that a non-event.

---

## Final Review

**Summary.** A main-process platform service plus renderer presentation responses; always-on-bottom superseding ADR-003's z-order clause; four player-owned presence dials with the simulation running through all of them; preferences in `settings.json`, never in the save; hidden and click-through deliberately unpersisted; exactly three global hotkeys under a stated policy; every future companion feature a capability of the same service.

**Validation checkpoints for phase-01.8:**

1. **Boundary:** no module in `src/sim` references any companion concept; the sim test suite passes byte-identical before and after the phase.
2. **Hidden-tick E2E:** hide the window, wait, restore — the tick advanced continuously (the rAF assumption below, made testable).
3. **Idle cost:** work mode does not raise idle CPU — fewer visible elements must never mean more work; the zero-rAF idle test holds in work mode.
4. **Persistence:** opacity and work-mode state survive relaunch; hidden and click-through always reset; loading a save changes neither.
5. **Restore exactness:** hide → toggle nothing → restore reproduces the identical window state (position, opacity, mode), asserted rather than assumed.

**Assumptions to verify before coding:**

- The rAF-driven game loop keeps ticking under `window.hide()` with `backgroundThrottling: false`. If it does not, the fallback is already a seam: `game-loop.ts` takes an injectable `schedule`, and main can signal hidden-state driver swaps over IPC.
- `BrowserWindow.setOpacity` behaves on a transparent, frameless window on Windows (platform quirks are documented around this combination).
- Electron can hold the window at the bottom of the z-order without native code; if not, the `HWND_BOTTOM` escape hatch (§2) is exercised inside main only.
- `globalShortcut` registration of the three bindings succeeds on the target machine; failure paths degrade per §5.2.

---

## Cross References

| Document                                      | Relationship                                                                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ADR-003                                       | Amended: the z-order clause. Everything else — process split, IPC, Electron choice — is the foundation this service stands on |
| ADR-012                                       | The freeze this ADR is authored under; supersession is its sanctioned path                                                    |
| ADR-007 §1                                    | Presentation state never enters the sim — the rule the work-mode store obeys                                                  |
| ADR-005                                       | The React UI work mode hides; the snapshot bridge it must not disturb                                                         |
| ADR-001 §2                                    | Collapse tears Pixi down; work mode deliberately does **not** — the world stays alive and visible                             |
| ADR-002 §2                                    | The atomic save machinery preferences deliberately do not use                                                                 |
| `VISION.md` §2.1, §2.2, §5.1                  | The product constraints: desktop first, reward absence, never spam                                                            |
| `GAME_DESIGN.md` §8.3 (amended), §10          | The shortcut design pass this ADR performs; the UI philosophy toasts obey                                                     |
| `PROJECT_STRUCTURE.md` §7                     | `settings.json` — the preference home                                                                                         |
| `docs/phases/phase-01-overlay.md`             | The shell this service extends (and whose z-order deliverable it reverses)                                                    |
| `docs/phases/phase-01.8-desktop-companion.md` | The implementing phase — concrete numbers, milestones, acceptance                                                             |
| `fix/0.1/1.8.md`                              | The source directive                                                                                                          |
