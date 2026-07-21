# Phase 01 — Overlay

> **Delivers:** A docked, transparent, always-on-top overlay that is genuinely livable, plus the snapshot bridge.
> **Runnable at completion:** The overlay docks to the bottom of the screen, collapses and expands, passes clicks through to windows beneath, and keeps simulating while the player works in another application.

---

## Objectives

1. Make the overlay **livable** — the single highest-risk assumption in the product.
2. Prove the simulation keeps ticking while the window is occluded.
3. Build the snapshot bridge before any consumer exists.
4. Establish collapse/expand, which everything after this depends on for its idle cost.

### Why this phase is second and alone

`VISION.md` §2.1 says the desktop comes first. If the overlay is not livable, no amount of good gameplay saves the product — and the failure modes here (focus stealing, fullscreen-app conflicts, DPI bugs, background throttling) are discovered by *living with it*, not by reading documentation.

This phase carries the most product risk in v0.1, so it is faced early, in isolation, with nothing else to blame.

---

## Deliverables

### Overlay window
- [ ] `BrowserWindow`: `frame: false`, `transparent: true`, `alwaysOnTop`, `skipTaskbar`, `resizable: false`
- [ ] `webPreferences` per `TECH_STACK.md` §2.1 — **including `backgroundThrottling: false`**
- [ ] Docked to the bottom edge of `screen.getPrimaryDisplay().workArea`, full work-area width
- [ ] Heights: 220 px expanded, 48 px collapsed (`GAME_DESIGN.md` §10.2)
- [ ] Positioned **above the taskbar**, never overlapping it

### Overlay behavior
- [ ] Click-through: `setIgnoreMouseEvents(true, { forward: true })` in transparent regions, disabled over real controls
- [ ] Renderer hit-testing driving the click-through toggle
- [ ] **Never steals focus** — not on launch, not on any event
- [ ] **Yields to fullscreen applications** — does not draw over a fullscreen game or video
- [ ] Re-docks on display change: resolution, DPI, monitor add/remove
- [ ] Correct geometry at 100%, 125%, 150%, and 200% DPI scaling

### Tray and lifecycle
- [ ] Tray icon with menu: Show/Hide, Collapse/Expand, Quit
- [ ] Single-instance lock — a second launch focuses the first (two instances would race on the save file)
- [ ] Clean shutdown

### Collapse / expand
- [ ] Toggle via tray, HUD button, and `Space`
- [ ] Window resizes and re-docks correctly in both states
- [ ] Collapsed state persists to `settings.json` (UI preference, not game state)
- [ ] Transition under the `PERFORMANCE.md` §7 ceiling

### Snapshot bridge — the architectural deliverable
- [ ] `src/renderer/bootstrap/snapshot-store.ts` — sliced store with per-slice version counters
- [ ] Slices republish **only when content changes** (ADR-005 §2)
- [ ] Coalescing to ≤ 10 Hz, delivered inside `requestAnimationFrame`
- [ ] `useSlice` hook wrapping `useSyncExternalStore`
- [ ] `useIntentDispatch` hook and the intent queue path
- [ ] `snapshotSystem` added to `TICK_SYSTEMS`, last (ADR-007 §4)

### Minimal UI
- [ ] React mounted in a DOM tree sibling to the (empty) canvas element
- [ ] UI root pointer-transparent except over controls — this is what makes click-through work
- [ ] `StatusBar` for collapsed mode showing a live tick counter from a snapshot slice
- [ ] CSS Modules; theme tokens established

### IPC
- [ ] Typed contract in `src/shared/ipc/contract.ts`
- [ ] Preload exposing a narrow enumerated surface — **never `ipcRenderer` directly**
- [ ] Payload validation on receipt in main
- [ ] Channels: collapse/expand, get display geometry, set click-through, quit

---

## Out of Scope

- PixiJS initialization or any world rendering *(phase-02)*
- Tiles, crops, workers, or any game content *(phase-03+)*
- Panels beyond the status bar *(phase-05)*
- Save/load or settings beyond the collapsed-state flag *(phase-07)*
- Global system-wide hotkeys — needs its own design pass *(v0.2, `GAME_DESIGN.md` §8.3)*
- Multi-monitor *selection* (which monitor to dock to) — primary display only in v0.1
- Auto-update *(v0.2)*

---

## Acceptance Criteria

| # | Criterion | Verified by |
|---|---|---|
| 1 | Overlay docks to the bottom work area, above the taskbar | Manual + E2E |
| 2 | Stays above normal windows | Manual |
| 3 | **Does not draw over a fullscreen game or video** | Manual, both cases |
| 4 | **Never takes focus** — typing in another app is uninterrupted | Manual |
| 5 | Clicks in transparent regions reach the window beneath | Manual + E2E |
| 6 | Clicks on controls are received by the overlay | E2E |
| 7 | Collapse/expand works from all three inputs | E2E |
| 8 | Re-docks correctly on resolution change | Manual |
| 9 | Re-docks correctly on DPI change (100/125/150/200%) | Manual |
| 10 | Re-docks correctly when a monitor is added or removed | Manual |
| 11 | **The tick continues while the window is fully occluded** | E2E — `background-tick.spec.ts` |
| 12 | A second launch focuses the first | E2E |
| 13 | Tray menu works; quit is clean | Manual |
| 14 | Collapsed CPU within `PERFORMANCE.md` §4 over 5 min | Measured |
| 15 | Collapsed RSS within `PERFORMANCE.md` §5 | Measured |
| 16 | Cold start to interactive under ceiling | Measured |
| 17 | **Zero React commits over 10 s with a static world** | E2E — `idle-cost.spec.ts` |
| 18 | A snapshot slice republishes only when its content changes | Unit test |

**Criterion 11 is the one most likely to be skipped and most damaging to miss.** Without `backgroundThrottling: false`, Chromium throttles timers to ~1 Hz in a backgrounded renderer — the *normal* state for this product. The failure is invisible in casual testing and would silently stall the simulation whenever the player did their actual work.

**Criterion 17** enforces ADR-005 §2. Deleting or skipping this test invalidates that ADR.

---

## Testing Checklist

### Automated
- [ ] E2E: window geometry matches work area
- [ ] E2E: tick advances while occluded (11)
- [ ] E2E: zero React commits when static (17)
- [ ] E2E: collapse/expand from each input
- [ ] E2E: second instance focuses the first
- [ ] E2E: quit writes nothing and exits cleanly
- [ ] Unit: slice publishes on change, not on tick
- [ ] Unit: throttling coalesces to ≤ 10 Hz
- [ ] Unit: `useSlice` re-renders only on its own slice change
- [ ] Unit: hit-test regions map correctly to click-through state

### Manual — the livability pass
- [ ] Run for a full working day; note every time it is noticed
- [ ] Type in another app for 5 minutes — no interruption, no focus loss
- [ ] Play a fullscreen game — overlay does not intrude
- [ ] Watch a fullscreen video — no stutter, no overlay
- [ ] Change DPI while running
- [ ] Unplug and replug an external monitor while running
- [ ] Lock and unlock the workstation
- [ ] Sleep and wake the machine
- [ ] Verify Task Manager CPU and memory in both states

The full-day run is not optional. It is the only test that measures what this phase actually delivers.

---

## Future Dependencies

| Deliverable | Depended on by |
|---|---|
| Collapse/expand | 02 — Pixi teardown hooks into collapse (ADR-001 §2) |
| Snapshot bridge | **02–07** — every view consumes it |
| Intent dispatch | 03–06 — every player action |
| Click-through hit-testing | 02 — world clicks must pass through non-interactive regions |
| IPC contract | 07 — save/load channels extend it |
| Docking + display handling | All later phases inherit it |
| `backgroundThrottling: false` | 03+ — all offline and unattended behavior |

---

## Notes

**If the overlay cannot be made livable, stop and escalate.** This phase tests the product thesis. A finding here is far more valuable than a workaround — and ADR-003 documents the Tauri exit criteria for exactly this situation.

Build the snapshot bridge **before** the status bar, not after. Retrofitting throttling once components subscribe directly is a rewrite of every component (ADR-005 §Consequences).
