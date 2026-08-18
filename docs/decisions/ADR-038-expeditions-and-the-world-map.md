# ADR-038: Expeditions and the World Map

**Status:** Accepted — v0.4 Phase 28.
**Date:** 2026-08-18
**Phase:** v0.4 Phase 28 (World Map & Expeditions) — the last of the version's six milestones, and the one that makes "the player gains reach" mean somewhere you cannot walk.
**Bound by (not re-litigated):** ADR-037 (the wilds are walkable ground; **§6 defers exactly this**; existence derived from a hash, not stored); ADR-034 (standing is a reading of recorded history, never a stored score); ADR-024 (the worker pipeline: discover → filter → select); ADR-011 (§4 declared sources and sinks; §7 a full destination blocks and never discards); ADR-010 (commands are the only write path); ADR-007 (determinism; integers; the RNG stream is save state); ADR-005 §2 (a slice that republishes every tick is a defect); `GAME_DESIGN.md` §9.2 (offline may credit less, never more); `VISION.md` §2.2 (reward absence, never punish it).

---

## Context

Five of v0.4's six milestones are shipped. Factories, recipes and logistics
made the farm run itself; the wilds gave the crew somewhere to go. The one
remaining is **expeditions** — `PLAN.md` §5's _"send workers away for timed
returns"_ — and it is paired in the same phase with the **world map**, because
a worker sent away has to be sent somewhere.

ADR-037 §6 deferred this deliberately, in the same words ADR-030 used to defer
the wilds:

> **Expeditions and the world map.** Phase 28. The wilds are walkable ground;
> regions you are _sent_ to are a different mechanism, and conflating them here
> would pre-design phase 28 the way ADR-030 declined to pre-design this one.

So the question this ADR answers is not "how do we add more map". It is: **what
is the difference between somewhere you walk and somewhere you are sent, and
what does that difference buy the player?**

Three constraints shape the answer before any design begins.

**The grid is full and widening it again is expensive.** 112 × 64 today, after
two relayout migrations (`v6 → v7`, `v12 → v13`), each of which had to re-encode
four dense arrays and remap every stored index. A third relayout to hold
"regions" would be the most costly possible way to express _far away_.

**v0.4's success criterion is economic, not cartographic.** It reads
_"exploration yields meaningfully feed the farm economy"_ — not "the player can
see a map". Whatever ships has to move goods into the farm in a way that
matters, and has to do it without becoming the farm's replacement.

**The version's other criterion is that offline catch-up stays accurate.** An
expedition is, by construction, the longest-running thing in the game, so it is
the mechanic most likely to complete while the player is at work. If its
resolution needs a catch-up model, that model is the phase's real risk.

---

## Decision

**A destination is content, not terrain. A worker is sent to one by command,
leaves the grid entirely for a declared duration, and returns with a declared
haul scaled by a factor derived from the departure. The only state stored is
the departure itself; the return tick, the haul, and everything else are
arithmetic on it.**

---

### 1. The map is a list of destinations, not more grid

A destination is a content definition, registered like every other:

```
{ id, displayName, sprite, travelTicks, supplies: ItemStack[], yields: ItemStack[], requires: Standing }
```

The grid is where the farm **is**. Destinations are where the farm **reaches**.
Keeping them in different models is the whole point of the phase:

- No third relayout, no `v14` grid migration, no re-encoding of dense arrays.
- Distance becomes a NUMBER (`travelTicks`) instead of a geometry problem, so
  "further away" is one field rather than a pathfinding cost across empty
  tiles nobody will ever look at.
- A content pack adds a destination without touching the world's dimensions,
  which is the same freedom ADR-019 gives crops and ADR-037 gives node kinds.

**The cost, stated:** you never see the place. A destination is a name, an
icon, and what comes back — the player's mental model of it is built entirely
from its yields. That is a real loss against a rendered region, and it is
accepted because the alternative costs a migration and a screen's worth of art
to express a fact (_it is far_) that one integer already expresses.

### 2. A worker who is away is off the grid

`WorkerState.Away`. While in it, a worker:

- **holds no task and claims no tile**, so nothing else has to know it is gone;
- **is skipped by the FSM entirely** — no pathing, no scanning, no energy;
- **does not appear in the workers slice**, so no sprite is drawn and nothing
  in the renderer needs a special case.

The last point follows the shape ADR-031 already established for residents: the
sleeping town publishes nothing, and empty equals empty. A worker who has left
is absent from the projection rather than present with a flag, so **no view can
draw a worker who is not there**.

Its position is left untouched, which is what it returns to.

### 3. Only the departure is stored

```
Expedition { worker, destination, departedTick }
```

That is the entire persisted shape, and everything else is derived from it:

| Question             | Answer                                                |
| -------------------- | ----------------------------------------------------- |
| When does it return? | `departedTick + travelTicks`                          |
| Is it back yet?      | `tick >= departedTick + travelTicks`                  |
| What does it bring?  | `yields` scaled by `hash(seed, worker, departedTick)` |
| How long is left?    | `departedTick + travelTicks - tick`                   |

**This is ADR-037's model applied to time instead of space**, and it buys the
same thing: an eight-hour absence needs no catch-up model at all, because "has
this returned by tick T" is a comparison, and what it brings back does not
depend on how many ticks were simulated in between.

The wilds are the precedent and the argument. Regrowth is derived, so an
absence of any length resolves exactly; if an expedition's outcome were rolled
on arrival, the roll would have to happen during catch-up, and a catch-up that
performs draws is a catch-up that can drift from a live run.

### 4. The haul is derived from the departure, and consumes no RNG draw

`hash(seed, worker, departedTick)` → a factor in a **declared band**,
`[0.75, 1.25]` around the destination's stated yields, floored per item.

Three properties this has and a roll does not:

- **Exact after any absence.** The answer at tick T is the same whether the
  game ran every tick or was closed for the whole trip.
- **No RNG consumption.** `world.rng` is a stream whose position is part of the
  save (ADR-007). A draw here would make an expedition's result depend on how
  many other things had happened first, and two identical farms would diverge.
  Same reasoning as ADR-037 §3 and ADR-022 §1, third time.
- **Honest to the player.** The band is stated in the UI. _You will get roughly
  this, give or take a quarter_ is a promise the game can keep.

**The band never includes zero, and there is no failure outcome.** A trip that
returned nothing would punish a decision made an hour earlier, which
`VISION.md` §2.2 forbids in as many words. Variance is in _how much_, never in
_whether_.

### 5. Supplies are a sink, the haul is a source, and the worker is the real cost

Both directions are declared (ADR-011 §4): `supplies` leave the farm inventory
at departure, `yields` enter it at return. Neither is a hidden multiplier on a
number that already exists.

**Supplies are consumed at departure and are not refundable.** An expedition
that could be cancelled for a refund would be a free option on a known outcome.
There is no recall.

But supplies are not the balancing lever, and pretending otherwise is how this
mechanic breaks the economy. **The real cost is the worker.** A hand on an
expedition is a hand not harvesting, not hauling and not gathering for the whole
duration, and that is what has to be priced:

> **The rate rule.** An expedition's expected coin value per tick of worker
> time must sit within the band of what the same worker earns on the farm —
> above the low end, so the trip is worth taking, and below the top end, so it
> never becomes the correct thing to do with every worker.

A mechanic that pays better per worker-tick than farming makes farming
pointless; one that pays worse is content nobody uses. This is a **balance
rule with a test**, not a paragraph of intent: the phase ships a test that
computes the rate for every shipped destination and asserts it inside the band.

This is also the phase's answer to the infinite-money question. Every coin an
expedition produces is an item that entered at a declared source and must be
sold through the ordinary channel, at the ordinary decaying multiplier
(ADR-013), against the ordinary demand (ADR-033). Nothing about an expedition
touches price.

### 6. Standing gates destinations

A destination declares a minimum `requires: Standing`, and the gate is enforced
**at the command boundary** — the same place ADR-034 §3 gates the board's
locked slots.

This is deliberate reuse rather than a new progression axis. Standing is
already a reading of recorded history (`contractStats.fulfilled`), already
derived, already surfaced in the HUD, and already means _the town trusts you_.
Somewhere far away opening up because the town vouches for you is the same
sentence.

Locked destinations are **visible with their requirement**, exactly as locked
board slots are, so the progression reads on paper before it is earned.

### 7. Returning is a system, and it is one comparison per expedition

`expeditionSystem` runs each tick over the expedition table — bounded by the
worker count, which is small — and completes any whose return tick has passed.
Completion is a command (ADR-010), so the worker's return and the deposit take
the same path a player action would.

**A full inventory does not lose the haul.** ADR-011 §7: what does not fit is
not discarded, and the worker returns holding it in its own carry hold, which
the ordinary deposit path drains as space appears. A worker who cannot deposit
is a worker who waits, never a haul that vanishes.

### 8. What this ADR deliberately does not decide

- **Parties.** One worker per expedition. A party is a scheduling feature with
  no consumer until there is something out there that needs more than one
  person, and there is not.
- **Danger, injury, or anything that fights back.** Out of scope for v0.4 by
  the owner's standing constraint, and §4's no-failure rule would refuse it
  anyway.
- **Choosing what to bring.** Supplies are declared by the destination. A
  loadout is a decision with no consequence until outcomes vary by input.
- **A rendered map screen.** The map is a panel listing destinations. Travel
  is a progress readout, not an animation across a canvas.
- **Destinations that change over time.** No seasonal or event-driven
  availability. `requires` is the only gate.

---

## Amendment — the carry cap, and the invariant §3 created

Written during implementation, in the same phase.

### §5 said supplies are not the lever. The CARRY CAP turned out to be one.

A worker carries twenty items, and nothing in the decision above accounted for
that. Its consequences were both structural and both had to be built:

- **`isReachableDestination` refuses a destination whose BIGGEST possible haul
  cannot fit an empty hold.** Not the declared figure — the top of §4's band,
  since a yield that just fits still overflows a quarter of the time. Without
  this, a return would have more than the hold can take, and ADR-011 §7 leaves
  no third option: a conserved quantity may not be silently discarded.
- **A worker leaves empty-handed**, refused by `validateSendExpedition`
  otherwise. That is what makes the guarantee above hold at runtime rather than
  on paper, and it is the legible rule anyway: you drop off, then you go.

**And the cap chose the content.** Wood at 8 and stone at 14 cap a full pack at
a few hundred coins, so a wood-and-stone destination would have to be under two
minutes away to satisfy §5's rate rule — which is a walk, not an expedition.
The shipped destinations pay in ore and wild produce for that reason, not for
flavour, and the wilds already supply the rest so no destination competes with
the band next door.

### §3 created a cross-field invariant, and the loader has to repair it

**A worker is `Away` if and only if a trip names them.** Both halves are written
together, so a document breaking it is corrupt rather than old — and
`SAVE_FORMAT.md` §5.3's doctrine is that the loader repairs rather than trusts.

The expensive direction was missed on the first pass and its comment said so
out loud (_"there is nothing to reconcile here"_): **`Away` with no trip strands
the hand for ever.** The FSM skips an away worker by design and only
`expeditionSystem` brings one back, so a worker the player paid for becomes
permanently unusable with nothing on screen to explain it.

The repairs, each chosen to restore what was paid for without inventing
anything:

| Corruption              | Repair                                     |
| ----------------------- | ------------------------------------------ |
| `Away`, no trip         | Back to `Idle` — the hand is returned      |
| Trip, worker not `Away` | Honoured — the supplies were already spent |
| Trip naming no worker   | Dropped — there is nobody to bring home    |
| Departure after `tick`  | Clamped to now — home on schedule, never   |

---

## Consequences

**Good**

- The version's last milestone lands with **no schema relayout** — the
  expedition table is a side-table (ADR-004 §4), appended.
- Offline catch-up needs **no expedition model**: the criterion "offline
  catch-up remains accurate" survives the mechanic most likely to break it.
- The town's reputation gains a second consumer, so standing stops being a
  board-only stat.
- `travelTicks` is the extension point a future expedition post, party size, or
  vehicle would modify, without any of them being built now.

**Bad, and accepted**

- **You never see the place.** §1's stated cost.
- **A worker away is invisible**, which means the player can lose track of one.
  Mitigated by the panel, not by the world view — and a worker who has been
  away too long is a UI problem, not a simulation one.
- **The rate rule is a balance claim that will need re-tuning** as v1.0 adds
  item sinks. It is a test, so it will fail loudly rather than drift.

**Risky**

- **The derived haul makes an expedition's result knowable in advance** by
  anyone reading the hash. That is true of the wilds, the weather, demand and
  the board already; the project's position is that determinism is worth more
  than concealment, and nothing here is competitive.

---

## Revisit if

- A destination needs an outcome that depends on what happened **while** the
  worker was away → the derived-at-departure model is wrong and the ADR needs
  a successor.
- Expeditions become the dominant income at any farm size → the rate rule's
  band is wrong, and the test should be the thing that says so.
- A future version wants a real region to walk in → that is a grid relayout and
  a new ADR, not an amendment to this one.
