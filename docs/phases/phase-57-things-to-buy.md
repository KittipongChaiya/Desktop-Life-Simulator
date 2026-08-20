# Phase 57 — Things To Buy

> **Delivers:** a purchasable ladder above the Market Stall, and R-05 rewritten
> so that "distinct bottleneck" is derived from the data rather than asserted in
> prose.
> **Governing decisions:** ADR-046 §2 (R-05); ADR-035 §1 (a building is a
> factory because a recipe names it); ADR-011 (containers).
> **Schema:** none.
> **Status:** **Complete.**

---

## What was wrong

The Market Stall costs 1,200 coins and is stage 4's unlock — the last rung of
the arc `GAME_DESIGN.md` §1.1 describes. **Exactly one purchasable building cost
more than it:** the Kitchen, at 1,600.

That is the shape of a game that ends. A player who reaches the arc's last rung
has, near enough, finished spending — and an idle game where money stops having
a use is a game where the money stops mattering, which is the same thing as the
game stopping.

## The ladder

| Building            | Cost  | Kind    | Relieves                        |
| ------------------- | ----- | ------- | ------------------------------- |
| Market Stall        | 1,200 | storage | (the arc's last rung)           |
| **Kitchen**         | 1,600 | factory | processing — existing           |
| **Preserving Shed** | 1,800 | factory | one cooker being the only one   |
| **Granary**         | 2,000 | storage | 150 slots against the shed's 50 |
| **Loom**            | 2,400 | factory | chain depth — the linen chain   |

The Granary is the one that is not more processing. A farm running twelve crops
and seven recipes fills fifty slots long before it runs out of things to do with
them, and **a full container is the one bottleneck that makes a player's absence
worse instead of better** — `VISION.md` §2.2 inverted exactly.

## R-05 was rewritten, because "distinct bottleneck" is not checkable

As drafted, R-05 asked for three buildings above the Market Stall "each
relieving a distinct bottleneck". A test cannot read that sentence. The obvious
implementation counts buildings, and a count is satisfied by three more
factories at three prices — which is one rung repeated, and misses the entire
point of the rule.

**The kind is now derived from the definition**, the same way ADR-035 derives
what a factory is: a building that declares `storageSlots` is storage, one a
recipe names is a factory, one that is neither is a utility. R-05 requires three
buildings above the stall drawn from **at least two kinds**.

That is checkable, it cannot be satisfied by a count, and it needs no field
nobody would otherwise write. ADR-046 §2 carries the metric beside R-02's and
R-03's, for the same reason all three needed one: a rule whose measurement is
unstated gets measured by whatever is easiest.

## What this phase did not do

**It did not add a second rest building.** Worker energy is a real bottleneck
and the obvious fourth rung — and `worker.ts` recognises the Rest Hut by
`building.buildingId === CORE_REST_HUT`, a hardcoded id of exactly the kind
`ARCHITECTURE.md` §3.4 forbids ("A system asks the registry and acts on the
definition's data — no `switch (id)` anywhere"). Making a second rest building
possible means adding a `restRecovery` field and reading it, which is engine
work rather than content.

Recorded here rather than fixed: **the hardcode is a real violation of a stated
rule**, it is not v0.6's to repair under ADR-046 §1, and it is the reason the
ladder has two kinds on it rather than three.
