# ADR-008: In-Simulation Event Bus

|                   |                               |
| ----------------- | ----------------------------- |
| **Status**        | Accepted                      |
| **Date**          | 2026-07-21                    |
| **Deciders**      | Project owner, lead architect |
| **Supersedes**    | —                             |
| **Superseded by** | —                             |

> **Numbering note.** ADR-006 (asset pipeline) and ADR-007 (simulation tick) were already taken. ADRs are append-only (`AI_RULES.md` §5.2), so this is 008. The simulation-loop topics originally proposed as a second ADR were **added to ADR-007** instead, keeping one authoritative source per decision (`AI_RULES.md` §5.3).

---

## Context

By v1.0 the simulation contains farming, workers, inventory, economy, NPCs, factories, combat, and city defense (`VISION.md` §4). Those systems interact: harvesting changes inventory, selling changes the wallet, a worker finishing a task frees it for the next.

Wiring them by direct call produces a dependency graph that grows quadratically and pins systems to each other's shapes. `harvestSystem` calling `inventory.add()` means harvest cannot be tested, reordered, or extended without inventory.

The counter-risk is real: an event bus can become an untraceable "action at a distance" layer where nothing has an obvious cause. This ADR is as much about the constraints that prevent that as about the bus itself.

**Deliberately deferred twice.** Phase-01.6 declined to build it — with one system in existence there were no producers, no consumers, and no direct calls to remove, so the API would have been designed against imagined use cases. It is built now, in phase-02.5, with `simulationTick` as a real producer/consumer pair, and phase-03 gives it `cropHarvested`.

---

## Decision

**A typed, per-world, queue-and-flush event bus. No global state, no async, deterministic order.**

### 1. Queue and flush, never immediate dispatch

`publish` appends to a queue. `flush` drains it, and runs in exactly one place: the `postUpdate` phase, after every system has finished mutating.

Immediate dispatch would let a subscriber mutate state that a system is still iterating. That is a real defect class, and the worst kind: intermittent, order-dependent, and reproducible only under the exact interleaving that caused it.

```
tick N
├─ preUpdate    intents applied      → publish()  ─┐
├─ world                                           │  queued,
├─ crops        growth, harvest      → publish()  ─┤  not yet
├─ workers                                         │  delivered
├─ economy                                         │
└─ postUpdate
   ├─ tickEvent      publish simulationTick       ─┘
   ├─ eventFlush     ◄── every subscriber runs HERE
   └─ snapshot       views observe settled state
```

### 2. Events are facts, not requests

Naming is **PastTense** and describes something that _has happened_: `cropHarvested`, `workerIdle`, `inventoryChanged`. Never `harvestCrop` or `updateInventory`.

A subscriber may react; it can never veto or alter the outcome. That is what keeps a publisher independent of who is listening — and it is why a publisher never inspects the subscriber list or the return value.

### 3. Synchronous, never async

Handlers are synchronous and return `void`. An async handler would resolve at an unspecified later time, outside the tick that produced the event, which breaks determinism and makes save state depend on microtask timing.

Work that genuinely must happen later publishes a follow-up event, which lands in the next flush.

### 4. Ordering guarantees

Two orderings are guaranteed and tested:

- **Publish order** within a flush — events dispatch in the order they were published.
- **Registration order** within an event — subscribers run in the order they subscribed.

Both matter because ADR-002, ADR-004, and ADR-007 all rest on identical inputs producing identical state. A bus dispatching in hash-iteration order would silently break that.

**Events published during a flush are deferred to the next flush**, not appended to the batch in progress. A subscriber that publishes therefore cannot produce an unbounded dispatch loop.

### 5. Event lifetime and memory ownership

An event exists from `publish` until the end of the `flush` that dispatches it, then it is unreferenced. The bus retains nothing.

Payloads are **plain, immutable data owned by the subscriber's read** — never a reference into a live store. Passing a mutable entity would let one subscriber's mutation surprise the next, reintroducing the coupling the bus exists to remove.

### 6. Subscriber lifecycle

`subscribe` returns an unsubscribe function; that is the whole contract. Any component that subscribes owns releasing it — a React panel on unmount, a system on teardown.

**Duplicate subscription is a no-op.** Registering the same handler twice for the same event leaves it registered once and invoked once. A silent doubling of every side effect is far worse than a rejected registration.

Unsubscribing is safe at any time, including twice, including from inside a handler during dispatch — dispatch iterates a snapshot, so mutating the subscriber set mid-flush never skips a handler.

### 7. Error handling

A throwing subscriber must not stop the others and must not abort the tick — one broken listener cannot take down the simulation. It also must not vanish silently (`AI_RULES.md` §2.2), so the bus reports it through an injected `onHandlerError`.

### 8. Tracing and debugging

The bus is injectable and per-world, so tracing is a subscriber, not a feature of the bus. Devtools can subscribe to record a timeline without the bus knowing about devtools — which matters because nothing in the game may import `src/devtools` (phase-01.5 deliverable 8).

`pending()` and `subscriberCount()` exist for diagnostics and are surfaced as metrics.

### 9. No global state

`createEventBus()` returns an instance; there is no module singleton and no service locator. The bus lives on `World`, so two worlds in one process — a test, a future replay verifier, a headless server — never cross-talk.

This is a direct constraint from the phase-02.5 brief and from `AI_RULES.md` §1.5: a singleton bus is the most common way an event system becomes untestable.

### 10. Future networking

Queue-and-flush with deterministic ordering is the shape a networked simulation needs: the event queue for a tick is a serializable list of facts, which is exactly what a server would broadcast or a replay would store.

This is **not** a commitment to multiplayer (`PLAN.md` §7). It is an observation that the constraints determinism already forces happen to be the ones networking would need, so no extra cost is being paid.

---

## Initial events

Only events with a real producer **and** consumer today:

| Event            | Producer                     | Consumer                         |
| ---------------- | ---------------------------- | -------------------------------- |
| `appStarted`     | bootstrap, after wiring      | devtools logging                 |
| `simulationTick` | `tickEventSystem`, each tick | subscribers needing tick cadence |

`worldLoaded` and `worldSaved` arrive with the save system in **phase-07**, where they immediately gain publishers, subscribers, and tests. Defining them now would create unreachable types — the speculative-API pattern `AI_RULES.md` §1.6 forbids, and the same reasoning that kept `spawn`/`teleport`/`money` out of the phase-01.5 console.

### Worked examples

```ts
// phase-03 — harvest states a fact and moves on.
world.events.publish('cropHarvested', { tile, crop: 'core:wheat', yield: [...] });

// Inventory reacts. Harvest does not know it exists.
world.events.subscribe('cropHarvested', (e) => addToInventory(world, e.yield));

// phase-04 — a worker announcing it has nothing to do.
world.events.publish('workerIdle', { worker: id, at: position });

// phase-05 — inventory announcing a change, without knowing why it changed.
world.events.publish('inventoryChanged', { item: 'core:wheat', delta: +3 });
```

Note the direction in every case: the publisher names what happened to _it_. It never names who should care.

---

## Alternatives Considered

### A. Direct calls between systems

- **For:** trivially traceable; the call stack is the documentation.
- **Against:** the dependency graph grows with every pairing, and ordering becomes load-bearing in a way no one wrote down. `harvestSystem` importing inventory means harvest cannot be tested without it.
- **Rejected because:** it does not survive the v1.0 system count. It remains correct for _intra_-system calls, which is why the bus is not mandatory everywhere.

### B. Immediate (synchronous, un-queued) dispatch

- **For:** simplest; publish and handling are one step.
- **Rejected because:** §1 — a subscriber mutating state mid-iteration is a genuinely nasty bug class, and the whole reason `ARCHITECTURE.md` §3.5 specified queue-and-flush before any code existed.

### C. Async / Promise-based handlers

- **Rejected because:** resolution timing becomes part of the simulation's outcome. Determinism, save round-trips, and property testing all forfeit.

### D. A global singleton bus

- **Rejected because:** untestable in parallel, impossible to reason about with two worlds, and the classic route to hidden coupling. Explicitly forbidden by the phase-02.5 constraints.

### E. An external library

- **Rejected because:** the implementation is ~120 lines with no dependency, and the constraints that matter here — deferred re-entrant publishes, snapshot iteration, duplicate protection, deterministic ordering — are exactly the ones a general-purpose emitter does _not_ guarantee (`TECH_STACK.md` §7.1).

---

## Tradeoffs Accepted

| We accept                                            | To gain                               | Mitigation                                                             |
| ---------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| Indirection: cause and effect are not one call stack | Systems decouple as the roadmap grows | Events are facts; a devtools subscriber can trace the timeline         |
| One tick of latency for cross-system reactions       | Safe mutation ordering                | Fixed and known: reactions land in `postUpdate` of the same tick       |
| A publisher cannot know if anyone listened           | Publishers stay independent           | Deliberate — a publisher that checks is a direct call in disguise      |
| Manual unsubscribe discipline                        | No hidden lifecycle magic             | `subscribe` returns the unsubscribe; duplicate registration is a no-op |

---

## Consequences

### Immediate

- `world.events` exists; `tickEventSystem` and `eventFlushSystem` run in `postUpdate`, before `snapshot`.
- Flush order is asserted by tests, not assumed.

### Ongoing

- A new event is one member added to `SimEventMap` — the bus is generic over it.
- **Never publish from inside a subscriber expecting same-flush delivery.** It lands in the next flush, by design.
- **Never pass a live store reference as a payload.** Payloads are plain data.
- **Never add an event without a producer and a consumer.** The two deferrals of this bus are the precedent.

### Revisit if

- Cross-system latency of one tick proves visible in gameplay → consider a second flush point mid-tick, declared in `PHASE_ORDER`, never ad-hoc dispatch.
- The event volume per tick becomes a measurable cost → pool payload objects; the queue-and-flush shape does not change.
