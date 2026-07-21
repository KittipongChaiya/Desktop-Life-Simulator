# ADR-010: Commands as the Only Write Path Into the Simulation

|                   |                               |
| ----------------- | ----------------------------- |
| **Status**        | Accepted                      |
| **Date**          | 2026-07-21                    |
| **Deciders**      | Project owner, lead architect |
| **Supersedes**    | —                             |
| **Superseded by** | —                             |

---

## Context

Phase-03 introduced `plantCrop`, `harvestCrop`, and `tillTile` as exported functions that validate, mutate `World`, and publish events. They work, and their behaviour is tested.

They are also, right now, _a_ write path rather than _the_ write path — nothing prevents a future system from mutating `world.crops` directly, and nothing makes the three functions look different from any other exported helper.

Four consumers are coming, and all four need the same write path:

| Consumer                            | Phase       | Needs                                    |
| ----------------------------------- | ----------- | ---------------------------------------- |
| Player input                        | phase-05 UI | Issue actions, see rejections            |
| Worker AI                           | phase-04    | Issue the _same_ actions autonomously    |
| Automation (seed bin, market stall) | phase-06    | Same again, unattended                   |
| Replay / multiplayer                | post-v1.0   | Serialize and re-apply the action stream |

If those grow separate paths, the simulation has four ways to change and no single place to enforce validation, ordering, or determinism. Worker AI in particular must not get a privileged shortcut — the moment it can do something the player's path cannot express, replay and multiplayer both become impossible without a rewrite.

### A divergence this ADR must resolve

`ADR-003` §5 and `ARCHITECTURE.md` §4.1 specify that intents are **queued and applied on a tick boundary** by `intentSystem` in `preUpdate`. Phase-03's commands **mutate immediately** on call.

That was an unflagged inconsistency, and it matters: immediate mutation means the outcome of a command depends on _when during a frame_ it was called, which is exactly the class of timing dependency ADR-007 §1 rejects. A command issued from a UI event handler and one issued from a system would interleave differently with the tick.

---

## Decision

**All simulation writes go through a command dispatcher. Commands are queued, executed on a tick boundary, and publish events only on success.**

### 1. Commands are the only public write API

`World` and its stores are readable from anywhere. They are **writable only from a command handler**.

This is a rule the boundary linter cannot express — it is about _which functions_ mutate, not which modules import which. It is therefore enforced by convention plus review, with one mechanical aid: mutating helpers live under `src/sim/commands/` and nothing else in `src/sim` writes to a store it does not own (`ARCHITECTURE.md` §3.3).

### 2. Lifecycle: validate → execute → publish

```
dispatch(command)
      │
      ├─ 1. VALIDATE ─── pure, no mutation
      │      │
      │      └─ invalid ──► CommandResult { ok: false, error }
      │                     • world untouched
      │                     • NO events published
      │                     • nothing queued
      │
      ├─ 2. EXECUTE  ─── mutates world state
      │
      └─ 3. PUBLISH  ─── events queued to the bus (ADR-008)
                         dispatched later, in postUpdate
```

**Validation is pure and complete before any mutation.** A command must never half-apply: `plantCrop` checks crop existence, ownership, tilled-ness, and occupancy _before_ touching `world.crops`. A rejected command leaves the world byte-identical, which is asserted by test.

**Events publish only on success.** A rejected command publishes nothing — otherwise subscribers would react to things that did not happen, and the event stream would stop being a record of facts (ADR-008 §2).

### 3. Queued, applied on the tick boundary

```
frame                          tick N
  │                              │
  ├─ input handler               ├─ preUpdate
  │    dispatch(PlantCrop) ──────┤    commandSystem drains the queue
  │    returns Accepted          │      ├─ validate
  │    (queued, not applied)     │      ├─ execute
  │                              │      └─ publish
  ├─ worker AI                   ├─ world / crops / workers / economy
  │    dispatch(HarvestCrop) ────┤
  │                              └─ postUpdate
  └─ …                                ├─ eventFlush  ◄── subscribers run
                                      └─ snapshot
```

This resolves the divergence in §Context. `dispatch` **accepts or rejects immediately** — validation is pure, so the caller learns straight away whether the command was well-formed — but **execution happens in `preUpdate`** of the next tick.

At 20 Hz the worst-case latency is 50 ms, which ADR-007 §2 already established as imperceptible. What it buys is that the outcome no longer depends on where in a frame the call happened.

**Two-stage validation is deliberate.** A command validated at dispatch may still fail at execution, because the world can change in between — two workers targeting the same crop is the obvious case. Handlers therefore re-validate. Dispatch-time validation exists to give the _caller_ immediate feedback, not to guarantee execution.

### 4. Determinism

- The queue is **FIFO**, drained in dispatch order.
- Commands carry no timestamp and read no clock. Their only time reference is `world.tick`.
- Handlers use the seeded RNG or none at all.

Given the same world seed and the same ordered command stream, the resulting state is byte-identical — the property ADR-002, ADR-004, and ADR-007 all rest on.

### 5. Replay and multiplayer compatibility

A command is **plain serializable data**: a type tag plus primitive fields. It is never a closure, never a reference into a store.

That makes the command stream the replay format for free:

```
replay  = seed + ordered command stream
verify  = re-apply the stream to a fresh world, compare state
```

**This is not a commitment to multiplayer** (`PLAN.md` §7). It is the observation that determinism already forces commands to be serializable and ordered, so the shape a networked or replayable simulation needs costs nothing extra _provided no system is allowed a side channel_. That proviso is §1, and it is the whole reason this ADR exists now rather than later.

### 6. Worker AI issues identical commands

Phase-04's worker AI dispatches `HarvestCrop` through the same path the player uses. It gets **no privileged API**, no direct store access, and no bypass.

The alternative — workers mutating directly "because they are internal" — is the single most likely way this architecture rots. It would mean automation could reach states the player's path cannot express, and a replay of a session with workers would not reproduce.

### 7. Error handling

Rejections are **typed results, not exceptions** (`CODE_STYLE.md` §1.5). A rejected command is an ordinary outcome — planting on occupied ground is a thing players do — not an exceptional condition.

Handlers may throw only on programming errors (a malformed command that typing should have prevented). The dispatcher catches, converts to a rejection, and reports it, so one bad handler cannot abort a tick.

### 8. No reflection, no runtime discovery, no global state

Handlers are registered explicitly into a dispatcher instance created per world, exactly as systems register into the scheduler (ADR-007 §4a). No decorator scanning, no filesystem discovery, no module singleton.

Runtime discovery would make the command set depend on import order — the same failure the scheduler avoids — and a global dispatcher would prevent two worlds coexisting in one process.

---

## Alternatives Considered

### A. Keep plain exported functions (the phase-03 status quo)

- **For:** simplest possible; no indirection; already works and is tested.
- **Against:** provides no single point to enforce ordering, no serializable action stream, and no way to stop a future system writing directly. Every consumer in §Context would have to re-implement the discipline.
- **Rejected because:** the cost of retrofitting a single write path _after_ worker AI, automation, and UI each have their own is a rewrite of all three. The cost now is a dispatcher.

### B. Direct mutation, with commands as a convention

- **Rejected because:** a convention that nothing enforces and that has a faster alternative available will be violated, and the violation will be invisible until replay or multiplayer needs it.

### C. Immediate execution (no queue)

- **For:** simplest mental model; the caller sees the result synchronously.
- **Against:** outcome depends on when in the frame the call happened — the timing dependency ADR-007 §1 rejects. This is the phase-03 behaviour.
- **Rejected because:** determinism is worth 50 ms of latency. Callers still get immediate _acceptance_, which is what a UI actually needs.

### D. Event-sourced commands (commands ARE events)

- **Rejected because:** it conflates a request with a fact. ADR-008 §2 makes events statements about what _has happened_, which subscribers cannot veto; a command is a request that validation may reject. Merging them means either events become vetoable or commands become unrejectable.

### E. A command bus with runtime handler discovery

- **Rejected because:** §8 — import-order dependence and untestability, for no benefit over explicit registration.

---

## Tradeoffs Accepted

| We accept                                       | To gain                                                      | Mitigation                                                             |
| ----------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Up to one tick (50 ms) before a command applies | Timing-independent, deterministic outcomes                   | Imperceptible (ADR-007 §2); dispatch still accepts/rejects immediately |
| Two-stage validation (dispatch + execute)       | Immediate caller feedback _and_ correctness under contention | Handlers re-validate; §3 states why                                    |
| Indirection over three plain functions          | One write path for four future consumers                     | Handler bodies are unchanged; only the entry point moves               |
| Rule §1 is not linter-enforceable               | A serializable, replayable action stream                     | Mutating code confined to `src/sim/commands/`; review gate             |

---

## Consequences

### Immediate

- `plantCrop`, `harvestCrop`, `tillTile` become **handlers** behind the dispatcher. Observable behaviour is unchanged — the phase-03 tests must pass untouched.
- `commandSystem` runs in `preUpdate`, first (ADR-007 §4a), so a command lands on the tick it was dispatched for.
- `ARCHITECTURE.md` §4.1's intent flow becomes accurate rather than aspirational.

### Ongoing

- **A new gameplay action is a new command**, never a new exported mutator.
- **Nothing outside `src/sim/commands/` writes to a world store it does not own.**
- **Commands stay plain data.** A closure or a store reference in a command payload breaks replay silently — it will serialize, and it will not reproduce.
- Worker AI, automation, and UI dispatch identically. A "just for internal callers" variant is the failure mode to watch for.

### Revisit if

- A gameplay action genuinely cannot tolerate one tick of latency → run it in a mid-tick phase declared in `PHASE_ORDER`, never by bypassing the dispatcher.
- The command queue becomes a measurable cost → pool command objects; the lifecycle does not change.
