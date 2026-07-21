# Phase 03.6 — Player Interaction

> **Status:** Delivered.
> **Delivers:** The first real consumer of the command dispatcher. Click a tile, something happens.
> **Runnable at completion:** Select a tool with `1`/`2`/`4`, click owned ground, and till → plant → harvest through the command path alone.

---

## Why this phase exists

Phase-03.5 built the command dispatcher and asserted its properties in tests. But **nothing outside `src/sim` dispatched a single command** — `PlayerInputSource` was a contract with no implementation, and `PLAN.md`'s claim that phase-03 made "the manual loop playable" was not true: there was no way to till, plant, or harvest.

This phase is an **architectural bridge**. It validates the command pathway with a real, interactive consumer _before_ autonomous agents depend on it. Worker AI is the phase that cannot afford to discover the pathway is wrong — by then three consumers would be built on it.

That validation immediately paid for itself. See §Correction.

---

## Delivered

| Module                                       | Responsibility                                          |
| -------------------------------------------- | ------------------------------------------------------- |
| `src/renderer/bootstrap/command-dispatch.ts` | The player's `CommandProducer` — binds the `player` tag |
| `src/renderer/bootstrap/player-input.ts`     | Tool / hover / selection state; maps intent to commands |
| `src/renderer/bootstrap/pointer-actions.ts`  | DOM events → intent; interaction state → highlight      |
| `src/renderer/render/highlight.ts`           | Hover, selection, and rejection boxes in `worldUi`      |

### The pathway

```
click → tileAt() → (tool, tile) → Command → PlayerInputSource.submit()
     → dispatcher.dispatch(cmd, { source: 'player' })   → accept/reject NOW
     → queue → preUpdate next tick → execute → events
```

### Interaction model

Tool-gated, per `GAME_DESIGN.md` §8.1 and §8.3 — explicit intent, never inferred:

| Key   | Tool | Command       |
| ----- | ---- | ------------- |
| `1`   | hoe  | `TillTile`    |
| `2`   | seed | `PlantCrop`   |
| `3`   | can  | **unbound**   |
| `4`   | hand | `HarvestCrop` |
| `Esc` | —    | deselect      |

`3` is deliberately unbound: no water command exists in v0.1, and a tool that silently does nothing is worse than a tool that is not offered. This also resolves a tension between §8.1 (which implies harvest is contextual) and §8.3 (which lists a hand tool) in favour of explicit intent.

---

## The correction this phase forced

Phase-03.5 defined `CommandProducer.take(): readonly Command[]` — a **pull** model, where something drains each source per tick. Its first real consumer rejected that shape.

ADR-010 §3's own diagram shows the input handler calling `dispatch` **during the frame** and receiving accept/reject immediately, which is what `GAME_DESIGN.md` §8.2 promises the player. A pull model defers validation to the next poll, so a click handler cannot report a rejection at the moment the player acted.

The pull shape fitted worker AI, which decides inside a tick system. Phase-03.5 generalised from that one imagined case to all four sources, on an assumption of symmetry that does not hold.

**`take()` is deleted. Every source now pushes**, including the tick-driven ones — a system-based source simply submits from inside its system. `CommandDispatcher` remains the single entry point for all submission.

**ADR-010 itself needed no change.** The ADR never specified pull or push; `take()` was an implementation invention, and §6 already said worker AI "dispatches through the same path the player uses". The decision was right and the code was wrong, so the code moved (ADRs are append-only — `AI_RULES.md` §5.2).

---

## Design rules this phase establishes

### The input layer decides intent, not rules

`commandFor(tool, tile, seed)` is pure and **total**: every tool yields a command for any tile. It never asks whether the tile is owned, tilled, empty, or ripe.

That restraint is load-bearing, and a test enforces it — clicking unowned ground must still produce a command and still be rejected by validation. The moment the UI starts pre-checking legality, the player and worker AI run two rule sets that agree today and diverge at the first change, and automation reaches states the player cannot express. That is exactly what ADR-010 §6 exists to prevent.

### Interaction state never enters the world

Tool, hover, and selection are presentation state, held in the renderer. Hover changes at pointer rate; if the tick could observe it, mouse movement would be a simulation input and determinism would be gone (ADR-007 §1). A test drives 50 hover events and asserts the queue stays empty and the tick does not advance.

### Feedback is injected at the construction boundary

`createWorld(seed, options)` takes `onExecutionRejected`. No mutable setter: a world's dependencies are fixed the moment it exists.

The callback carries **simulation types only** — a `Command` and an `AppError`. The world does not know a view exists, so nothing about the UI reaches the domain layer.

---

## Out of Scope

Deliberately **not** built:

- **Worker AI, automation, inventory, economy.** Phases 04–06.
- **New gameplay systems.** The three phase-03 commands are the entire vocabulary; watering was not added to give the can tool something to do.
- **React / HUD changes.** No tool chrome, no inline text message. Tool identity is carried by the highlight tint, which keeps this phase an architectural bridge rather than a UI phase, and avoids inventing a shared view-state contract between `render/` and `app/` (which cannot import each other) before the HUD needs one.
- **A fading rejection flash.** The rejection box persists until the next action rather than clearing on a timer — no timer lifecycle to leak on teardown. `GAME_DESIGN.md` §10.1's transient inline message arrives with the HUD in phase-05.

---

## Acceptance Criteria

- [x] Player input reaches the simulation only through `CommandDispatcher`
- [x] Every submission is tagged `player`, leaving the pathway attributable for worker/automation/replay
- [x] All sources push; no `take()` remains anywhere
- [x] The input layer contains no game rules — an illegal click is still submitted and still rejected
- [x] Interaction state never enters `World`; hover queues nothing and does not tick
- [x] Feedback is injected at construction; the world depends on no UI callback
- [x] Clicking applies on the next tick, never during the click
- [x] `npm test` — 393 passing, up from 365
- [x] `npm run typecheck`, `lint`, `check:boundaries`, `check:cycles` clean

---

## Testing

28 new tests: `player-input.test.ts` (16) · `command-dispatch.test.ts` (5) · `sources.test.ts` (9 total, rewritten for push, +5) · `dispatcher.test.ts` (+2, for `createWorld` options).

The two that matter most:

- **"still submits an illegal action and lets validation reject it"** — fails if the input layer ever learns a game rule.
- **"produces an identical world from an identical click sequence"** — two runs with differing hover noise produce byte-identical tile state, proving pointer movement is not a simulation input.

---

## Future Dependencies

| Phase | Depends on this how                                                                      |
| ----- | ---------------------------------------------------------------------------------------- |
| 04    | Worker AI implements `WorkerCommandSource` with the same `submit` shape, from a system   |
| 05    | HUD renders tool chrome and turns rejections into inline messages; inventory gates seeds |
| 06    | Automation implements `AutomationSource`, unattended, through the same dispatcher        |

**The failure mode to watch for in phase-04** is unchanged and now concretely testable: if worker AI needs anything the player's path cannot express, the architecture has rotted. The player path is now the reference implementation to compare against.
