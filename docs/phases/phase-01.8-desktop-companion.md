# Phase 01.8 — Desktop Companion

> **Status: Phase 01.8 is complete.** All four milestones delivered; the manual companion-livability pass remains for a human (see Testing Checklist).
>
> **Delivers:** The platform features that define the project's identity — an opacity dial, quick hide, click-through mode, work mode, and z-order control — implemented as a main-process platform service the simulation never learns exists (ADR-014). _(Shipped as always-on-bottom; the 2026-07-23 livability verdict reverted the inversion to always-on-top — see the post-phase notes.)_
> **Runnable at completion:** The game coexists with real desktop work: fade it, banish it, make it untouchable, or strip it to its living world — the farm runs through all of it.
> **Source directives:** `fix/0.1/1.8.md` (the features), `fix/0.1/1.8a.md` (the architecture extension). **Architecture:** ADR-014 (as amended).

---

## Why here in the sequence

Numbered with the overlay family (01.x) because it extends phase-01's platform shell; **built between phase-06 and phase-07** (`PLAN.md` §2.1 ordering note). After 06, so the companion behaviors wrap a complete, earning game rather than a demo. Before 07, so the settings/save boundary (ADR-014 §4: app preferences in `settings.json`, never in the save) is fixed before the save schema exists — and so phase-07's return summary can be designed knowing work mode hides the HUD.

These are **not gameplay systems.** They are platform-level overlay features. The guiding principles, verbatim from the directive: desktop-first, non-intrusive, instant response, minimal CPU overhead, no simulation impact, no rendering regressions, no platform logic inside simulation.

---

## Objectives

1. Give the player the four presence dials (ADR-014 §1): opacity, quick hide, click-through mode, work mode.
2. Invert the z-order: the game lives **behind** normal application windows (ADR-014 §2, superseding ADR-003's always-on-top clause). _(Delivered, lived with, and reverted by the 2026-07-23 livability verdict — always-on-top stands again.)_
3. Prove the simulation runs unaffected through every dial — hidden, inert, muted.
4. Fix the preference/save boundary in code before phase-07 builds the save.

---

## Features

Exactly these five. No additional desktop features (Out of Scope is binding).

### 1. Transparency slider

- Range **30%–100%**, step **5%**, default **100%**.
- Applies immediately (`BrowserWindow.setOpacity`); the UI shows the current percentage.
- Persists in `settings.json`. **Loading a save must not affect opacity** — opacity is an application setting, not game state.

### 2. Quick hide — global `F10` _(rebound from the directive's `F12` — owner decision, 2026-07-23)_

- Hides the overlay window immediately; `F10` again restores it.
- Restore is exact — position, opacity, mode — **by construction**: hiding changes no other state (ADR-014 §2).
- Response feels instantaneous. The simulation continues while hidden; the game is never paused.

### 3. Click-through mode — global `Ctrl+Shift+C`

- Toggles Interactive Mode ↔ Click Through Mode.
- When enabled: mouse clicks pass through the whole window; the overlay stays visible; global hotkeys keep working.
- A main-process **override** above phase-01's per-region hit-testing — mode ON forces mouse transparency; mode OFF returns control to hit-testing untouched (ADR-014 §2).
- A brief toast confirms the current mode on each toggle.

### 4. Always on bottom _(reverted post-phase — see the 2026-07-23 note below)_

- The game window remains behind normal application windows — VSCode, browsers, Explorer, terminals, Office apps always appear above it.
- Never steals focus (already `focusable: false`); never self-raises; pushed to the z-order bottom on show and display changes.
- Replaces `setAlwaysOnTop(true, 'floating')` — the phase-01 deliverable this reverses, sanctioned by ADR-014's supersession of ADR-003's z-order clause.

### 5. Work mode — global `F11`

- Toggles Normal Mode ↔ Work Mode. Purpose: reduce distraction while keeping the simulation alive.
- Work mode: opacity to **25%** (a mode constant, deliberately below the slider floor — not a slider position), all HUD panels hidden, inventory hidden, worker panels hidden, notifications hidden, debug overlays hidden, selection outlines hidden, non-essential animations off.
- Keeps only: **world, workers, crops, buildings.** Simulation, economy, and workers continue normally.
- `F11` again restores the previous state. Last work-mode state persists (relaunch resumes it).

### Supporting surfaces

- **Settings — Desktop Companion section:** opacity slider + current %, and the shortcut reference (`F11` work mode, `F10` quick hide, `Ctrl+Shift+C` click-through — rendered from the bindings table, so the rebind reached it with zero component changes). Minimal interface, inside the 220 px overlay (`GAME_DESIGN.md` §10).
- **Toasts:** brief, auto-dismissing, in-overlay confirmations for work-mode toggle, click-through toggle, and quick-hide restore. Never OS notifications (`VISION.md` §5.1).

---

## Resolved interpretations

Recorded before implementation; changing one is a spec edit, not a coding choice.

1. **Work mode implies the expanded overlay** — it must show the living world, which collapsed mode has torn down (ADR-001 §2). `F11` while collapsed expands into work mode; leaving work mode returns to the prior presence state.
2. **Work mode's 25% never touches the slider.** Precedence: work mode active → mode constant; otherwise → slider value. Leaving work mode restores the player's own setting untouched.
3. **Click-through mode composes over any base state** (expanded, collapsed, work). It owns nothing but mouse transparency.
4. **Hidden changes nothing else**, so quick-hide restore needs no bookkeeping. Other global hotkeys still fire while hidden (a player may toggle work mode blind; the state is applied on restore).
5. **Persistence set:** opacity, work-mode last state, and the existing collapsed flag. **Hidden and click-through have no persisted representation at all** — they reset by not existing (ADR-014 §4).
6. **Toast triggers are exactly three:** work-mode toggle, click-through toggle, quick-hide restore. In work mode, the work-mode toast itself still shows (the player must see the mode change land); all other notifications are hidden.
7. **"Non-essential animations"** = presentation effects: hover/selection highlights and the coin-counter tween. Worker walk animation stays — workers are on the keep list, and a frozen walker reads as a jam.
8. **Global hotkeys are OS-global** per the directive. Registration failure is logged and non-fatal (tray remains the fallback); the `F12`-shadows-devtools cost is accepted for v0.1 and rebinding is ADR-014 §6's first future item. _(01.8b superseded the premise: Windows refuses to register F12 at all — see the 01.8b delivered note. The shadowing concern never arises; the availability concern replaced it, and the default-binding decision sat with the project owner.)_ **Resolved 2026-07-23:** the owner rebound quick hide to **`F10`** — one line in `shared/shortcuts.ts`, exactly the rebinding path the 01.8a2 architecture promised (its unit test had already exercised it). All three defaults now register on Windows; the E2E hotkey assertion is un-hedged.

---

## Milestones

| #      | Milestone                                      | Delivers                                                                                                                                                                                                                                                              | Status        |
| ------ | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 01.8a  | The platform service & the presence dial       | `src/main/desktop-companion.ts`; `settings.json` schema extension (opacity, work mode); IPC contract extension; opacity applied instantly + persisted; Settings panel with the Desktop Companion section (slider, %, shortcut reference)                              | **Delivered** |
| 01.8a2 | The architecture extension (`fix/0.1/1.8a.md`) | `ShortcutAction` stable identifiers + the one-place default bindings table (`shared/shortcuts.ts`); the centralized pure `ShortcutManager`; the categorized application settings model (`overlay`/`desktop`, legacy files migrate in place); ADR-014 §4/§5 amendments | **Delivered** |
| 01.8b  | The instant handles                            | Global `F12` quick hide/restore and `Ctrl+Shift+C` click-through mode; the toast surface (auto-dismiss, in-overlay); reset-on-launch semantics; hidden-tick proof                                                                                                     | **Delivered** |
| 01.8c  | Work mode & the z-order inversion              | Global `F11` work mode (25%, HUD stripped, world kept, last state persisted); always-on-bottom replacing always-on-top; E2E suite; phase close-out                                                                                                                    | **Delivered** |

### Delivered (01.8a) — the platform service & the presence dial

- **The preference schema is pure and unit-tested** (`src/main/settings-schema.ts`): tolerant per-field parse — a phase-01 `settings.json` holding only `collapsed` upgrades in place; one corrupt field never discards its neighbours. The opacity sanitizer clamps to the dial and snaps to the 5% step. `effectiveOpacityPercent` carries the mode-precedence rule now (work mode's 25% constant overrides the slider without moving it), so 01.8c only wires the toggle. `settings.ts` keeps only the disk I/O.
- **`desktop-companion.ts` opens with `applyOpacity`** — the `overlay-window.ts` split held: `index.ts` owns the one settings record (updated immutably, always persisted whole — the old `saveSettings({ collapsed })` calls would have silently erased the new fields on every collapse) and this module owns the window call. Opacity applies before first show, so the window never flashes 100% on its way to the preference.
- **IPC**: `companion:set-opacity` / `companion:get-state` behind a new `validateNumber`, with `companion:state-changed` broadcasting for the hotkeys arriving in 01.8b/c. Preload + ambient types extended; the renderer's `companion-controller.ts` mirrors the overlay controller (hydrate, optimistic answer, external-change follow, dedupe).
- **`SettingsPanel`** — the Desktop Companion section: slider on the shared dial constants (`shared/constants.ts` — the slider renders the range, main sanitizes against it, neither invents its own), live `%` readout, and the ADR-014 §5 shortcut reference. The one panel whose writes never touch the world: no slice, no command, only the companion bridge. Idle-cost safe: hydration at the default state dedupes to zero notifies.
- **The `DESKTOP_LIFE_USER_DATA` seam**: an env override for `userData`, set before the single-instance lock (which lives there too). The companion E2E runs against an isolated temp profile — never the developer's real `settings.json` — and test instances cannot quit against a running dev instance. Latent E2E hazard closed.
- **E2E** (`tests/e2e/companion.spec.ts`, 3 tests): default 100% and instant apply via a real slider keypress (crit 1); cross-launch persistence — slider → `settings.json` in the isolated profile → relaunch opens at 70% before any UI runs (crit 2); the shortcut reference visible.
- Gates: typecheck, lint, **700** unit/integration (was 674), **19 E2E passed / 3 GPU-skipped** on a fresh debug build. `src/sim` untouched (crit 10 holding by construction).

### Delivered (01.8a2) — the architecture extension (`fix/0.1/1.8a.md`)

Infrastructure only, landed deliberately **before 01.8b registers the first hotkey**:

- **`src/shared/shortcuts.ts`** — `ShortcutAction` stable identifiers (`workMode`/`quickHide`/`clickThrough`) and the default bindings table: **the only place physical keys exist**. Main registers from it; the settings panel's shortcut reference now renders from it (its hardcoded key list from 01.8a is gone — the directive's "no duplicated key constants" caught a one-milestone-old duplication). `Ctrl` rather than `CommandOrControl` deliberately: Windows-first (`VISION.md` §5.1).
- **`src/main/shortcut-manager.ts`** — the centralized manager, **pure** (the electron `globalShortcut` adapter lives in `desktop-companion.ts` and is injected), so every acceptance criterion is a unit test: registers each action against its configured binding exactly once; a keypress resolves to its action's handler through the manager alone; failed registrations are reported and degrade only their own feature (ADR-014 §5.2); **a replaced bindings config re-keys actions with no other change** — the future rebinding path, executed in a test. Consumer note: 01.8b's wiring injects the real handlers; the manager ships one milestone ahead by explicit directive.
- **The categorized application settings model** — `AppSettings { overlay: { collapsed }, desktop: { opacityPercent, workMode } }`; future categories (input, audio, graphics, language, accessibility) parse-tolerantly ignored until owned. Legacy files migrate in place: phase-01's `{collapsed}` and 01.8a's flat trio read through a per-category flat fallback and re-write categorized; a present category wins over stray flat fields. Save-separation criteria (survive save deletion / new world; saves hold only gameplay state) hold **by construction** — settings.json and `saves/` never meet — and phase-07 will re-assert them against a real save system.
- **ADR-014 amended** (§4 the settings model and the save-may-never-touch rule; §5 the four explicit statements: defaults only, stable identifiers, replaceable configuration, future rebinding UI without architectural change); `ARCHITECTURE.md` §7, `PLAN.md`, `PROJECT_STRUCTURE.md` updated per the directive.
- Gates: typecheck, lint, **708** unit/integration, **19 E2E passed / 3 GPU-skipped** on a fresh debug build. `src/sim` untouched.

### Delivered (01.8b) — the instant handles

- **Quick hide and click-through mode are ACTIONS with three inputs each** — the global hotkey (resolved through the ShortcutManager), the tray, and an IPC toggle — exactly the action/input split `fix/0.1/1.8a.md` demanded for keys, applied to whole features. The tray gains **Show/Hide overlay**, honoring ADR-014 §5.2's "the tray remains the universal fallback" _and_ closing a phase-01 tray-spec gap in the same stroke. The IPC toggles are the E2E's drivable path per the honesty note.
- **`CompanionState` carries `clickThrough`/`hidden` as runtime state**: it crosses IPC so the UI can toast the toggles, and is never persisted — both reset by not existing anywhere at launch. E2E leaves _both_ engaged, relaunches, and finds both off (and the window visible).
- **The override composition bug that never shipped**: main records every per-region hit-testing request even while the mode overrides it, and lifting the mode replays the newest — without this, the renderer's dedupe cache goes stale and the overlay stays mouse-inert until the pointer happens to cross a UI boundary. Two mechanisms, one owner (ADR-014 §2), held in six lines of `index.ts`.
- **`CompanionToast`** — one slot (a new toast replaces the current; nothing queues), auto-dismissing, pointer-transparent _by construction_ (a confirmation must never intercept a click nor flip the hit-testing it is confirming). The click-through toast names the way back out **from the bindings table, never hardcoded**. Hiding never toasts — the window is invisible, there is nobody to tell; the restore does.
- **The hidden-tick proof (crit 7)**: hide → 1.5 s → restore, and the tick advanced ≥ 30 at rate — **ADR-014 assumption 1 discharged**: rAF keeps firing under `window.hide()` with `backgroundThrottling: false`; the injectable-`schedule` fallback stays unused. Restore exactness (checkpoint 5) asserted on a non-default opacity.
- **F11 is not swallowed**: the manager's partial registration leaves the work-mode action unbound until 01.8c — E2E asserts `isRegistered('Ctrl+Shift+C')` true and `isRegistered('F11')` **false**. `will-quit` disposes every key back to the OS.
- **⚠ Platform finding — Windows refuses the `F12` binding.** `RegisterHotKey` reserves F12 for the debugger at all times; `globalShortcut.register('F12', …)` returns false on the target OS (confirmed by direct probe: F7 registers, F12 does not). The ADR-014 §5.2 degradation path fired in production the first time it existed — warning logged, the quick-hide _action_ fully reachable through the tray and IPC inputs (E2E-proven). The E2E deliberately does not assert F12's registration outcome. **Decision escalated to the project owner**: keep F12 as the shipped default (the hotkey path stays dead on Windows; tray/future-rebinding carry the feature) or amend the default binding — a one-line change in `shared/shortcuts.ts` now that bindings are replaceable configuration (ADR-014 §5, amended), but a spec edit against `fix/0.1/1.8.md`'s letter.
- **Watch item**: render-budget criterion 5 (static world draws no frames) flaked once during a full E2E run on this GPU-constrained machine (which already GPU-skips three render tests, and logs `GPU state invalid` on app close); it passes in isolation and passed the final full run. Nothing in 01.8b touches the render loop; watching for recurrence.
- Gates: typecheck, lint, **716** unit/integration, **22 E2E passed / 3 GPU-skipped** on a fresh debug build. `src/sim` untouched.

### Delivered (01.8c) — work mode & the z-order inversion (phase close-out)

- **Work mode is real, and it is mostly absence.** `F11` (the third and last hotkey, joining the manager) flips `desktop.workMode`; the schema's precedence rule — written and unit-tested back in 01.8a — drops the window to the 25% mode constant without touching the slider; the broadcast state reaches the renderer and **React's whole job is to get out of the way**: status bar, shop, inventory, worker panels, settings — all unmounted (unmounted components are structurally incapable of committing, which is the idle-cost argument in one line). The world, workers, crops, and buildings are PixiJS and keep living. The composition root strips what the unmount cannot reach: selection box cleared, build ghost disarmed, tool dropped.
- **Presence memory (resolved interpretation 1)**: entering work mode from collapsed expands the overlay (the mode exists to show the world, which collapse has torn down); leaving restores the prior presence — E2E drives collapsed → work (expanded, 220 px) → normal (collapsed again, 48 px). The memory is runtime-only: across a relaunch, leaving work mode simply stays expanded.
- **Last state persists**: quit in work mode, relaunch — the window opens at 25% with the HUD stripped _before any UI interaction_, and the launch toast explains the stripped screen ("Work mode on — F11 to leave", the way out named from the bindings table). Leaving restores the player's own dial exactly.
- **Always-on-bottom shipped as never-raise.** Electron exposes no push-to-bottom on Windows, so the mechanism is the honest one: `setAlwaysOnTop(false)`, unfocusable, shown with `showInactive` (`SW_SHOWNA` keeps z-position), and **no code path raises the window** — every window the player touches rises above the overlay and stays there. The launch instant is the accepted residue; the native `HWND_BOTTOM` escape hatch stays deliberately unexercised in v0.1 (no native dependencies; the livability pass judges the residue). ADR-014 §2 carries the delivered-reality note; the overlay E2E's phase-01 `alwaysOnTop === true` assertion is formally flipped.
- **F12 remained the shipped default** per the directive's letter — no rebind decision had been received at close-out; the binding stays one line in `shared/shortcuts.ts` whenever it comes. _(It came: see the post-phase fix note below.)_
- Gates: typecheck, lint, **720** unit/integration, **24 E2E passed / 3 GPU-skipped** on a fresh debug build. `src/sim` untouched across the entire phase — criterion 10 held from first commit to last.

### Post-phase reversal (2026-07-23) — always-on-top restored: the livability verdict

The 01.8c close-out left one judgment explicitly to a human: whether always-on-bottom is livable. **The verdict came back: it is not.** A maximized window covers the game entirely — collapsed status bar included — and a covered game turned out to be a forgotten game, exactly the trade-off ADR-014 §Trade-offs had accepted with eyes open. The owner reverted the inversion: `overlay-window.ts` is back to `setAlwaysOnTop(true, 'floating')` (phase-01's original level — above normal windows, below OS-critical surfaces, still covered by fullscreen apps), the phase-01 overlay E2E assertion is flipped back to `true`, and ADR-003's z-order clause stands restored (ADR-014 carries the amendment). **What did not revert:** the window is still unfocusable and shown with `showInactive` — on-top and focus-proof are independent, and only the z-order changed. The presence dials this phase built (opacity, quick hide, click-through, work mode) are now the player's _only_ way to turn the game down, which strengthens their reason to exist; behind-normal-windows remains available to a future version as an opt-in presence mode (ADR-014 §6). Acceptance criterion 6 and the manual always-on-bottom checklist item are discharged by this verdict — the pass ran, and its answer was the reversal.

### Post-phase fix (2026-07-23) — quick hide rebound `F12` → `F10`

The owner's decision on the 01.8b escalation: quick hide's default binding is **`F10`**. The change was, as designed, **one line in `shared/shortcuts.ts`** — the manager registers the new key, the settings panel's reference re-renders from the table, and no component, handler, or test helper changed behavior. F10 registers successfully on Windows, so the E2E hotkey test now asserts all three registrations outright (the platform hedge is gone), and the manual pass's physical-keypress item covers all three keys for the first time. ADR-014 carries the matching amendment note; `GAME_DESIGN.md` §8.3/§10.3 updated.

---

## Out of Scope

Binding (`AI_RULES.md` §3.2). From the directive's restriction list — these belong to future versions and arrive, if ever, per ADR-014 §6:

Multi-monitor support · Always On Top · window resizing · streaming mode · screenshot mode · presentation mode · auto-hide · focus detection · idle detection · **additional hotkeys**

Also out of scope: any change to `src/sim` (ADR-014's boundary makes this structural, not aspirational); pausing or throttling the simulation in any companion state; OS notifications.

---

## Acceptance Criteria

| #   | Criterion                                                                                                                                                      | Verified by                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Opacity changes instantly                                                                                                                                      | E2E + manual                       |
| 2   | Opacity persists between launches                                                                                                                              | E2E (relaunch)                     |
| 3   | `F10` hides and restores the window, state exact _(rebound from `F12`)_                                                                                        | E2E (service) + manual (hotkey)    |
| 4   | `Ctrl+Shift+C` toggles click-through                                                                                                                           | E2E (service) + manual (hotkey)    |
| 5   | `F11` toggles work mode; previous state restored on exit                                                                                                       | E2E (service) + manual (hotkey)    |
| 6   | Always-on-bottom: VSCode/browser/Explorer/terminal/Office sit above the game _(discharged by the 2026-07-23 livability verdict — the answer was the reversal)_ | Manual                             |
| 7   | **Simulation continues while hidden** — tick advances through hide/restore                                                                                     | E2E                                |
| 8   | No gameplay regressions                                                                                                                                        | Full existing suite green          |
| 9   | No architecture violations                                                                                                                                     | `check:boundaries`, `check:cycles` |
| 10  | **No simulation awareness of platform features** — `src/sim` untouched                                                                                         | Diff + sim suite byte-identical    |
| 11  | All existing tests pass                                                                                                                                        | Full gates                         |

**E2E honesty note:** Playwright cannot synthesize OS-level global keypresses. E2E drives the platform service's toggle functions directly (via the Electron main-process handle) and asserts hotkey **registration** (`globalShortcut.isRegistered`); the physical keypress path is the manual checklist's job. The wiring between them is one `register(key, fn)` call.

**Close-out status:** criteria 1–5 and 7–11 are discharged by the automated gates above (the hotkey halves of 3/4/5 via registration + the shared toggle path; the physical keypresses join the manual pass — where, at close-out, **F12 would not fire on Windows**, the recorded platform finding; the post-phase `F10` rebind has since restored the hotkey path, so all three keys are exercisable). Criterion 6 (always-on-bottom against real applications) is inherently the manual pass's. Criterion 10 held from the phase's first commit to its last: `src/sim` has zero changes across 01.8a–01.8c.

---

## Testing Checklist

### Automated

- [x] Unit: settings round-trip with the extended schema; missing fields → defaults (first-run and upgrade-in-place) _(01.8a)_
- [x] Unit: companion state model — precedence (work-mode opacity over slider) _(01.8a2)_; orthogonality and restore exactness _(01.8b — runtime states compose as independent booleans; restore exactness asserted E2E on a non-default opacity)_
- [x] Unit: toast lifecycle (appears, auto-dismisses, never queues unbounded) _(01.8b — plus: hide never toasts, restore does)_
- [x] Unit: work-mode store hides exactly the listed surfaces; world view untouched _(01.8c — `app-work-mode.test.tsx`: every HUD surface unmounted, returns on exit; the world is PixiJS and outside React's tree by construction)_
- [x] E2E: opacity set → `getOpacity` reflects it; relaunch → persisted _(01.8a — against an isolated userData profile)_
- [x] E2E: hide → wait → restore → tick advanced continuously (crit 7; ADR-014 assumption 1 made testable) _(01.8b — ≥30 ticks over 1.5 s hidden; the rAF fallback stays unused)_
- [x] E2E: click-through ON → clicks pass; OFF → hit-testing behavior identical to pre-phase _(01.8b — state, toast, override composition, and reset E2E'd; the physical click pass-through is OS-level and stays on the manual pass)_
- [x] E2E: work mode ON → HUD absent, world present, sim advancing; OFF → prior state _(01.8c — including collapsed → work → collapsed presence restore, and cross-launch resumption at 25%)_
- [x] E2E: all three hotkeys registered; loading a save (once phase-07 exists) leaves opacity untouched _(01.8c — `F11` and `Ctrl+Shift+C` asserted registered; `F12`'s outcome was platform-dependent — Windows refuses it, see the 01.8b finding. **Post-phase fix:** quick hide rebound to `F10`, which registers — all three now asserted outright. The save half falls due in phase-07 and is structurally true today: settings.json and saves never meet)_
- [x] Idle-cost E2E still passes in work mode (ADR-014 checkpoint 3) _(01.8c — structurally: work mode strictly UNMOUNTS components, and unmounted components cannot commit; the existing idle-cost tests bound the superset UI. A dedicated in-work-mode measurement joins the manual CPU pass)_

### Manual — the companion livability pass

- [ ] Each hotkey pressed physically, from another application's focus, in and out
- [x] Always-on-bottom against each named app class: VSCode, browser, Explorer, terminal, Office _(ran as the livability verdict, 2026-07-23 — the outcome was the always-on-top reversal; the item is complete, its answer just wasn't "keep")_
- [ ] `F10` conflict observation: note what breaks in other apps while the game runs (`F10` reaches the menu bar in some Windows apps — feeds the rebinding priority, ADR-014 §5.3)
- [ ] A working day in work mode: is 25% + world-only genuinely non-distracting?
- [ ] Task Manager before/after: companion features add no measurable idle cost

---

## Performance

Effectively zero simulation cost, per the directive: no polling loops, event-driven throughout, no unnecessary redraws, render-on-demand maintained. Opacity and z-order are window-manager operations; work mode _removes_ React surfaces (fewer commits, never more); toasts are transient DOM. The one risk — the rAF loop under `window.hide()` — has a named fallback seam (`game-loop.ts`'s injectable `schedule`, ADR-014 assumptions).

---

## Future Dependencies

| Deliverable                    | Depended on by                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------- |
| Settings/save boundary in code | Phase-07 — the save schema is authored against a world with no preference state |
| Work mode's HUD suppression    | Phase-07's return summary — must defer while HUD is hidden, not vanish          |
| The platform service           | Every ADR-014 §6 future feature (rebinding, profiles, monitor selection)        |
| Toast surface                  | Any future transient confirmation (`GAME_DESIGN.md` §10.1 — never modal)        |

---

## Final deliverable

Stop only at a clean commit boundary, all quality gates green, all existing tests passing (the standing cadence). The close-out report summarizes: architecture changes, the companion features, performance impact, platform limitations, known issues, and compatibility notes — per the directive.
