# Phase 03.5 — Command Model

> **Status:** Delivered.
> **Decision:** `ADR-010` (Commands as the Only Write Path Into the Simulation).
> **Behaviour change:** None. Phase-03's observable behaviour and its tests are unchanged.

---

## Objectives

Phase-03 shipped `plantCrop`, `harvestCrop`, and `tillTile` as exported functions that validate, mutate, and publish. They worked. They were also indistinguishable from any other exported helper, which meant nothing prevented a future system from writing `world.crops` directly.

Four consumers need the same write path — player input (phase-05), worker AI (phase-04), automation (phase-06), and replay (post-v1.0). This phase installs that path **before** any of them exists, because retrofitting one after three consumers have grown their own is a rewrite of all three.

It also resolves a documented divergence: `ADR-003` §5 and `ARCHITECTURE.md` §4.1 specified tick-boundary application; phase-03 mutated immediately. The docs were aspirational. They are now accurate.

---

## Delivered

### The dispatcher (`src/sim/commands/`)

| Module             | Responsibility                                                           |
| ------------------ | ------------------------------------------------------------------------ |
| `types.ts`         | `Command` union, metadata, results, and the `CommandWorld` write surface |
| `queue.ts`         | FIFO queue with pending-window de-duplication                            |
| `dispatcher.ts`    | Explicit registration, pure validation, queueing, draining               |
| `crop-commands.ts` | The three handlers, their validators, and their registration             |
| `sources.ts`       | Producer interfaces for the four consumers — contracts only              |

`commandSystem` (`src/sim/systems/command.ts`) drains the queue in `preUpdate`, registered **first** in `TICK_SYSTEMS`.

### The lifecycle

```
dispatch(command)                       commandSystem (preUpdate, FIRST)
  ├─ validate  ── pure, no mutation       ├─ re-validate
  ├─ rejected ──► CommandResult           ├─ execute  ── mutates
  │               world untouched         └─ publish  ── queued to the bus
  │               nothing published
  └─ accepted ──► queued                          ↓
                                          eventFlush (postUpdate)
```

### Migration

The three phase-03 functions became **handlers**, keeping their signatures and their immediate semantics. Only two things changed:

1. Their validation halves were extracted, so the _same_ check runs at dispatch (pure, for caller feedback) and again at execution (the world may have changed).
2. Their `World` parameter became `CommandWorld` — a structural view of the five stores a command may touch.

`src/sim/commands/crop-commands.test.ts` was **not modified**. All 26 of its tests pass untouched, which is the acceptance criterion ADR-010 §Consequences set.

### Why `CommandWorld` exists

`world.ts` must import the command layer to wire the dispatcher, so the command layer importing `World` back would be an import cycle (`CODE_STYLE.md` §7.4, enforced by `npm run check:cycles`). A structural view breaks the cycle, and it follows the precedent `TileQuery` already set in `tile-state.ts`.

It earns its place twice over: it is also the written-down answer to "which stores may a command write", which is ADR-010 §1.

---

## Decisions Made Within the ADR's Bounds

The ADR settled the model. Three details it left open were decided here.

### Dispatch validates against committed state

Validation is pure and reads the world **as it is**, so it cannot see queued-but-unexecuted commands. Dispatching `tillTile` and then `plantCrop` on the same tile in one frame therefore **rejects the plant at dispatch** — the tile is not yet tilled.

This follows directly from ADR-010 §3 ("validation is pure"; "dispatch-time validation exists to give the caller immediate feedback, not to guarantee execution"). The alternative — validating against a projected future state — would make dispatch depend on queue contents, which is the timing dependency the ADR exists to remove. Callers re-issue on the next tick. Pinned by test.

### De-duplication is opt-in and scoped to the pending window

A caller may pass a `key`; a second command carrying a key already pending is rejected. Keys clear on every drain, so the set is bounded by one tick's dispatches rather than growing with playtime (`AI_RULES.md` §2.3).

Opt-in rather than automatic, because two identical commands in one tick are sometimes legitimate — selling two of an item — and collapsing them by default would be a silent gameplay bug.

### Execution-time rejections are reported, not swallowed

`onExecutionRejected` mirrors the event bus's `onHandlerError`. A command that passes dispatch and fails execution is ordinary (two workers racing for one crop), but it must never vanish silently (`AI_RULES.md` §2.2). A throwing handler is caught, converted to a rejection, and reported — one bad handler cannot abort the tick for the commands queued behind it.

---

## Out of Scope

Deliberately **not** built, despite each being adjacent:

- **Workers, inventory, economy, UI, rendering, multiplayer.** Phases 04–07 and beyond.
- **Implementations of the four source interfaces.** They are contracts, not stubs. Nothing implements them yet, and nothing should until its phase arrives.
- **A replay recorder or verifier.** ADR-010 §5 observes that determinism already forces the command stream into replay shape. It is explicitly _not_ a commitment to build replay now.
- **Undo.** Commands are not reversible and were not designed to be.

---

## Acceptance Criteria

- [x] All simulation writes go through the dispatcher
- [x] `dispatch` never mutates the world and never publishes
- [x] A rejected command leaves the world byte-identical and queues nothing
- [x] Commands execute in `preUpdate`, first, in FIFO order
- [x] Events publish only on successful execution
- [x] Commands are plain serializable data — JSON round-trip asserted
- [x] The same seed and command stream reproduce identical state and identical command ids
- [x] Phase-03 behaviour unchanged; `crop-commands.test.ts` passes unmodified
- [x] `npm test` green — 364 passing, up from 310: +49 new command tests, +5 from the headless import suite that auto-discovers sim modules
- [x] `npm run typecheck`, `npm run lint`, `npm run check:boundaries`, `npm run check:cycles` clean
- [x] `src/sim/commands` line coverage 98.3% (target 90%)

---

## Testing

49 new tests: `queue.test.ts` (5) · `dispatcher.test.ts` (35) · `sources.test.ts` (4) · `systems/command.test.ts` (5)

Covering: dispatch acceptance and rejection, no-mutation-at-dispatch, queued execution, execution ordering via publish order, two-stage validation under contention, throwing handlers, event publication, rejected-publishes-nothing, metadata (ids, source, tick, no id consumed on rejection), duplicate protection, serialization safety, and deterministic replay.

Two lines remain uncovered, both defensive branches documented as unreachable: a re-lookup after validation proved presence, and a queue entry whose handler vanished.

---

## Future Dependencies

| Phase     | Depends on this how                                                                         |
| --------- | ------------------------------------------------------------------------------------------- |
| 04        | Worker AI implements `WorkerCommandSource` and dispatches `HarvestCrop` — no privileged API |
| 05        | UI implements `PlayerInputSource`; rejections become inline messages                        |
| 06        | Automation implements `AutomationSource`, unattended                                        |
| 07        | Save/load is unaffected: the dispatcher holds no persistent state                           |
| post-v1.0 | `ReplaySource` plays back `seed + ordered command stream`                                   |

**The failure mode to watch for** is a "just for internal callers" variant appearing in phase-04. If worker AI can express something the player's path cannot, replay stops reproducing and multiplayer becomes a rewrite — which is the entire reason ADR-010 was written before phase-04 rather than after.
