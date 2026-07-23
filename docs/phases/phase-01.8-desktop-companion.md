# Phase 01.8 — Desktop Companion

> **Delivers:** The platform features that define the project's identity — an opacity dial, quick hide, click-through mode, work mode, and always-on-bottom — implemented as a main-process platform service the simulation never learns exists (ADR-014).
> **Runnable at completion:** The game coexists with real desktop work: fade it, banish it, make it untouchable, or strip it to its living world — the farm runs through all of it.
> **Source directive:** `fix/0.1/1.8.md`. **Architecture:** ADR-014.

---

## Why here in the sequence

Numbered with the overlay family (01.x) because it extends phase-01's platform shell; **built between phase-06 and phase-07** (`PLAN.md` §2.1 ordering note). After 06, so the companion behaviors wrap a complete, earning game rather than a demo. Before 07, so the settings/save boundary (ADR-014 §4: app preferences in `settings.json`, never in the save) is fixed before the save schema exists — and so phase-07's return summary can be designed knowing work mode hides the HUD.

These are **not gameplay systems.** They are platform-level overlay features. The guiding principles, verbatim from the directive: desktop-first, non-intrusive, instant response, minimal CPU overhead, no simulation impact, no rendering regressions, no platform logic inside simulation.

---

## Objectives

1. Give the player the four presence dials (ADR-014 §1): opacity, quick hide, click-through mode, work mode.
2. Invert the z-order: the game lives **behind** normal application windows (ADR-014 §2, superseding ADR-003's always-on-top clause).
3. Prove the simulation runs unaffected through every dial — hidden, inert, muted.
4. Fix the preference/save boundary in code before phase-07 builds the save.

---

## Features

Exactly these five. No additional desktop features (Out of Scope is binding).

### 1. Transparency slider

- Range **30%–100%**, step **5%**, default **100%**.
- Applies immediately (`BrowserWindow.setOpacity`); the UI shows the current percentage.
- Persists in `settings.json`. **Loading a save must not affect opacity** — opacity is an application setting, not game state.

### 2. Quick hide — global `F12`

- Hides the overlay window immediately; `F12` again restores it.
- Restore is exact — position, opacity, mode — **by construction**: hiding changes no other state (ADR-014 §2).
- Response feels instantaneous. The simulation continues while hidden; the game is never paused.

### 3. Click-through mode — global `Ctrl+Shift+C`

- Toggles Interactive Mode ↔ Click Through Mode.
- When enabled: mouse clicks pass through the whole window; the overlay stays visible; global hotkeys keep working.
- A main-process **override** above phase-01's per-region hit-testing — mode ON forces mouse transparency; mode OFF returns control to hit-testing untouched (ADR-014 §2).
- A brief toast confirms the current mode on each toggle.

### 4. Always on bottom

- The game window remains behind normal application windows — VSCode, browsers, Explorer, terminals, Office apps always appear above it.
- Never steals focus (already `focusable: false`); never self-raises; pushed to the z-order bottom on show and display changes.
- Replaces `setAlwaysOnTop(true, 'floating')` — the phase-01 deliverable this reverses, sanctioned by ADR-014's supersession of ADR-003's z-order clause.

### 5. Work mode — global `F11`

- Toggles Normal Mode ↔ Work Mode. Purpose: reduce distraction while keeping the simulation alive.
- Work mode: opacity to **25%** (a mode constant, deliberately below the slider floor — not a slider position), all HUD panels hidden, inventory hidden, worker panels hidden, notifications hidden, debug overlays hidden, selection outlines hidden, non-essential animations off.
- Keeps only: **world, workers, crops, buildings.** Simulation, economy, and workers continue normally.
- `F11` again restores the previous state. Last work-mode state persists (relaunch resumes it).

### Supporting surfaces

- **Settings — Desktop Companion section:** opacity slider + current %, and the shortcut reference (`F11` work mode, `F12` quick hide, `Ctrl+Shift+C` click-through). Minimal interface, inside the 220 px overlay (`GAME_DESIGN.md` §10).
- **Toasts:** brief, auto-dismissing, in-overlay confirmations for work-mode toggle, click-through toggle, and quick-hide restore. Never OS notifications (`VISION.md` §5.1).

---

## Resolved interpretations

Recorded before implementation; changing one is a spec edit, not a coding choice.

1. **Work mode implies the expanded overlay** — it must show the living world, which collapsed mode has torn down (ADR-001 §2). `F11` while collapsed expands into work mode; leaving work mode returns to the prior presence state.
2. **Work mode's 25% never touches the slider.** Precedence: work mode active → mode constant; otherwise → slider value. Leaving work mode restores the player's own setting untouched.
3. **Click-through mode composes over any base state** (expanded, collapsed, work). It owns nothing but mouse transparency.
4. **Hidden changes nothing else**, so `F12` restore needs no bookkeeping. Other global hotkeys still fire while hidden (a player may toggle work mode blind; the state is applied on restore).
5. **Persistence set:** opacity, work-mode last state, and the existing collapsed flag. **Hidden and click-through have no persisted representation at all** — they reset by not existing (ADR-014 §4).
6. **Toast triggers are exactly three:** work-mode toggle, click-through toggle, quick-hide restore. In work mode, the work-mode toast itself still shows (the player must see the mode change land); all other notifications are hidden.
7. **"Non-essential animations"** = presentation effects: hover/selection highlights and the coin-counter tween. Worker walk animation stays — workers are on the keep list, and a frozen walker reads as a jam.
8. **Global hotkeys are OS-global** per the directive. Registration failure is logged and non-fatal (tray remains the fallback); the `F12`-shadows-devtools cost is accepted for v0.1 and rebinding is ADR-014 §6's first future item.

---

## Milestones

| #     | Milestone                                | Delivers                                                                                                                                                                                                                                 | Status  |
| ----- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 01.8a | The platform service & the presence dial | `src/main/desktop-companion.ts`; `settings.json` schema extension (opacity, work mode); IPC contract extension; opacity applied instantly + persisted; Settings panel with the Desktop Companion section (slider, %, shortcut reference) | Planned |
| 01.8b | The instant handles                      | Global `F12` quick hide/restore and `Ctrl+Shift+C` click-through mode; the toast surface (auto-dismiss, in-overlay); reset-on-launch semantics; hidden-tick proof                                                                        | Planned |
| 01.8c | Work mode & the z-order inversion        | Global `F11` work mode (25%, HUD stripped, world kept, last state persisted); always-on-bottom replacing always-on-top; E2E suite; phase close-out                                                                                       | Planned |

---

## Out of Scope

Binding (`AI_RULES.md` §3.2). From the directive's restriction list — these belong to future versions and arrive, if ever, per ADR-014 §6:

Multi-monitor support · Always On Top · window resizing · streaming mode · screenshot mode · presentation mode · auto-hide · focus detection · idle detection · **additional hotkeys**

Also out of scope: any change to `src/sim` (ADR-014's boundary makes this structural, not aspirational); pausing or throttling the simulation in any companion state; OS notifications.

---

## Acceptance Criteria

| #   | Criterion                                                                    | Verified by                        |
| --- | ---------------------------------------------------------------------------- | ---------------------------------- |
| 1   | Opacity changes instantly                                                    | E2E + manual                       |
| 2   | Opacity persists between launches                                            | E2E (relaunch)                     |
| 3   | `F12` hides and restores the window, state exact                             | E2E (service) + manual (hotkey)    |
| 4   | `Ctrl+Shift+C` toggles click-through                                         | E2E (service) + manual (hotkey)    |
| 5   | `F11` toggles work mode; previous state restored on exit                     | E2E (service) + manual (hotkey)    |
| 6   | Always-on-bottom: VSCode/browser/Explorer/terminal/Office sit above the game | Manual                             |
| 7   | **Simulation continues while hidden** — tick advances through hide/restore   | E2E                                |
| 8   | No gameplay regressions                                                      | Full existing suite green          |
| 9   | No architecture violations                                                   | `check:boundaries`, `check:cycles` |
| 10  | **No simulation awareness of platform features** — `src/sim` untouched       | Diff + sim suite byte-identical    |
| 11  | All existing tests pass                                                      | Full gates                         |

**E2E honesty note:** Playwright cannot synthesize OS-level global keypresses. E2E drives the platform service's toggle functions directly (via the Electron main-process handle) and asserts hotkey **registration** (`globalShortcut.isRegistered`); the physical keypress path is the manual checklist's job. The wiring between them is one `register(key, fn)` call.

---

## Testing Checklist

### Automated

- [ ] Unit: settings round-trip with the extended schema; missing fields → defaults (first-run and upgrade-in-place)
- [ ] Unit: companion state model — precedence (work-mode opacity over slider), orthogonality (hidden/click-through over any base state), restore exactness
- [ ] Unit: toast lifecycle (appears, auto-dismisses, never queues unbounded)
- [ ] Unit: work-mode store hides exactly the listed surfaces; world view untouched
- [ ] E2E: opacity set → `getOpacity` reflects it; relaunch → persisted
- [ ] E2E: hide → wait → restore → tick advanced continuously (crit 7; ADR-014 assumption 1 made testable)
- [ ] E2E: click-through ON → clicks pass; OFF → hit-testing behavior identical to pre-phase
- [ ] E2E: work mode ON → HUD absent, world present, sim advancing; OFF → prior state
- [ ] E2E: all three hotkeys registered; loading a save (once phase-07 exists) leaves opacity untouched
- [ ] Idle-cost E2E still passes in work mode (ADR-014 checkpoint 3)

### Manual — the companion livability pass

- [ ] Each hotkey pressed physically, from another application's focus, in and out
- [ ] Always-on-bottom against each named app class: VSCode, browser, Explorer, terminal, Office
- [ ] `F12` conflict observation: note what breaks in other apps while the game runs (feeds the rebinding priority, ADR-014 §5.3)
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
