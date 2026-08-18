# ADR-036: Logistics and Reservation

**Status:** Accepted — v0.4 Phase 25 (recorded), Phase 26 (implemented).
**Date:** 2026-08-18
**Phase:** v0.4 Phase 26 (Logistics & Reservation) — the system that makes a chain run itself.
**Bound by (not re-litigated):** ADR-035 (a factory's two containers; the jam rules; nothing in the production model knows what a chain is); ADR-011 (§6 the carrier moves and the resource transfers at the endpoints; §7 a full destination blocks and never discards; **§8 reservation is defined and deferred to exactly this consumer**); ADR-010 (commands are the only write path for an actor's intent); ADR-004 (§4 side-tables); ADR-024 (the worker scheduling pipeline: discover → filter → select); ADR-007 (determinism; integers); `VISION.md` §2.2 (reward absence, never punish it).

---

## Context

Phase 25 shipped a factory that **cannot feed itself**, deliberately, so that
the thing which feeds it would be designed once and on purpose rather than as
a mill's private convenience (ADR-035 §9). This is that design.

v0.4's headline success criterion is the one this ADR exists to make
achievable: _"a production chain runs unattended for 8 hours without
jamming."_ Phase 25 established what a single factory does when it cannot
proceed. A chain adds the failure that single factories cannot have — **two
consumers competing for the same goods** — and the mechanism that prevents it
is the one ADR-011 §8 named two versions ago and deliberately did not build:

> a container exposes `available = quantity − reserved`, a reservation
> decrements `available` without transferring ownership, and a fulfilled
> reservation becomes a transfer. This is **documented now and built when a
> consumer exists** (v0.4 logistics / crafting).

The consumer now exists. What has to be decided is what moves goods, what a
reservation is attached to, and — the part that decides whether the eight-hour
criterion is reachable — **what happens to a reservation whose claimant never
comes back.**

---

## Decision

**Goods move by worker haul tasks along player-declared routes. A route is a
standing instruction — from a source container, to a destination container,
for one item. A haul is an ordinary worker task in the existing pipeline, so
it inherits movement, scheduling, zones and shifts unchanged. A reservation is
owned by a specific worker's specific task, is released whenever that task
ends for any reason, and can never outlive it: a reservation whose owner is
gone is not a reservation, and the store is swept for exactly that.**

### 1. No conveyors, no logistics entities

A conveyor belt would be a new entity kind with per-tick movement, a new render
layer, its own save shape and its own determinism story. Worker hauling needs
none of that: ADR-011 §6 already decided that **the carrier moves and the
resource transfers at the endpoints**, and phase-04's workers already move.

The gain is not just economy of mechanism. A hauling worker is _visible_ — the
player watches goods crossing the farm and can see where a chain is starved.
An instant transfer between buildings would make logistics invisible and its
failures inexplicable, which is the same objection §5 of this ADR raises
against the tempting shortcut.

### 2. A route is a standing instruction, and it is stored

```ts
export interface Route {
  readonly id: RouteId;
  readonly from: BuildingId;
  readonly to: BuildingId;
  readonly item: ContentId;
}
```

Small, explicit, and **the player's**, not inferred. A system that guessed
routes from recipes would move goods the player did not ask to move, and the
first surprising delivery would be unexplainable.

Routes are world state, written only by command, and they serialize as a sorted
array — schema v12.

**What a route deliberately is not:** a filter, a priority, a rate limit, or a
threshold. Every one of those is a real want and each can be added as a field
later; shipping them now would be the speculative generality `AI_RULES.md` §1.5
forbids, before a single chain has run.

### 3. A haul is a task in the pipeline that already exists

`WorkerTaskKind.Haul`, discovered and filtered exactly like harvest, plant and
till (ADR-024 §1's three stages). It therefore inherits — with no new code —
zones, shifts, roles, priority ordering, the idle back-off, and the rule that a
worker never deadlocks.

A haul is two endpoints and one journey: walk to the source, take up to the
carry capacity, walk to the destination, deposit. The worker's carry container
is the same one it harvests into (ADR-011 §2); a haul is not a special kind of
carrying.

**Priority:** hauling sorts **below** harvesting and above tilling by default,
and the ordering is data (ADR-024 §3) so a role can change it. Rationale: a
rotting-on-the-vine harvest is time-critical in a way a haul is not, and a
farm that stopped harvesting to shuttle flour would be visibly wrong.

### 4. Reservation is owned by a task, not by a route or a building

This is the load-bearing decision, and the alternative is the classic factory
bug.

```
worker claims a haul  →  reserve N of item at source
                          reserve space for N at destination
worker completes it   →  reservations become the transfer
worker abandons it    →  reservations released, unconditionally
worker is dismissed   →  reservations released, unconditionally
```

Owning the reservation at the **task** means there is exactly one lifetime to
reason about, and it is the same lifetime the task already has. A reservation
owned by a route would outlive the worker doing it; one owned by a building
would have no natural end at all.

`available = quantity − reserved` is what discovery reads, so a second worker
sees the first one's claim and looks elsewhere. Two workers can never be sent
for the same wheat.

### 5. The jam this exists to prevent, named

**A leaked reservation is invisible and permanent.** Quantity is still there,
conservation still holds, every container test still passes — and the goods can
never be claimed again, so the chain starves with nothing anywhere to explain
it. It is precisely the failure mode v0.4's eight-hour criterion is written
against, and it will not announce itself.

Three defences, and all three are required:

1. **Release on every exit path**, not just the happy one. A task that ends —
   completed, abandoned, invalidated by a sold building, interrupted by rest —
   releases. This is the `AnimationLease` lesson one system over: phase-07.7
   found that hand-rolled acquire/release bookkeeping at multiple call sites is
   where leaks live, and answered it with one object that owns the transition.
   Reservations get the same treatment.
2. **An invariant test**: for every container, `reserved ≤ quantity`, and every
   reservation names a live worker whose current task is the one that made it.
3. **A sweep**, cheap and per-tick, that releases any reservation failing (2).
   A sweep is not a substitute for (1) — it is the admission that (1) is
   fallible, and the thing that turns a permanent jam into a one-tick hiccup.

Defence 3 is the one worth arguing about, because a sweep can hide a real bug.
It is accepted anyway: an unattended eight-hour run that ends in a starved
chain is a product failure, and a test that catches the leak (2) plus a
mechanism that survives it (3) is strictly better than either alone.

### 6. Offline catch-up graduates from exact to modelled

Phase 25's factory catch-up is **exact** because a factory's inputs cannot
change during a gap. Routes end that: an upstream mill's output becomes a
downstream kitchen's input at a rate that depends on both, and on how many
workers were free to haul.

The model is therefore bound by `GAME_DESIGN.md` §9.2's round-down rule like
worker production is, and it inherits that section's discipline: **where it
cannot be certain, it credits nothing.** A specific consequence, stated so it
is not discovered: haul time is charged against the same worker budget as
harvesting, so a farm that spends its crew hauling must be credited fewer
harvests, not the same harvests plus deliveries.

`tests/catch-up-factories.test.ts` was written to fail rather than go silent
when this changes.

### 7. What this ADR does not decide

- **Route filters, priorities, thresholds, or rates** — §2. Added when a chain
  demonstrably needs one.
- **Any building that is a route endpoint but neither a factory nor a shed** —
  a wagon or a chest is ADR-011 §2's "same container, new owner" and needs no
  decision here.
- **The route-building UI.** Presentation, phase 26.
- **Cross-region logistics.** The wilds arrive in phase 27; whether a route may
  cross regions is that phase's question.

---

## Consequences

**Immediate (phase 26 implements)**

- `reserved` on `Container`, with `available()`; `reserve`/`release` helpers.
- A `routes` store, route commands, and schema **v12** with a golden fixture at
  v11 that **carries a route and a live reservation** — an empty one would make
  the link pass vacuously (the v6→v7 lesson).
- `WorkerTaskKind.Haul` and its discovery band.
- The reservation invariant test and the per-tick sweep.
- **The eight-hour long-run**: a full chain, 576,000 ticks, asserting throughput
  never reaches zero while inputs exist, conservation holds, no reservation
  outlives its task, and the run is deterministic.
- Catch-up extended per §6, with its never-over property re-proven.

**Ongoing**

- **A reservation is always owned by a live task.** Anything that ends a task
  releases; anything that creates a reservation names its task.
- **Routes are the player's.** Nothing infers one.
- **A haul is an ordinary task.** A scheduling concept that does not apply to
  hauling is a bug in the concept, not an exception for hauling.

**Validation**

- `reserved ≤ quantity` for every container, always — property test.
- No reservation outlives its task — invariant test plus the sweep's own test.
- Two workers never claim the same units — the discovery test.
- The eight-hour chain: stalls permitted, a stall that outlives its cause is a
  failure.
- Determinism across a save round-trip with reservations live.

**Revisit if**

- **A chain needs rate control** to stay balanced → a threshold field on
  `Route`, not a new system.
- **Hauling dominates worker time** on a normal farm → the priority ordering is
  data; change the data before changing the model.
- **Reservation contention becomes measurable** → reserve per task rather than
  per stack is already the design; the next lever is fewer, larger hauls.
