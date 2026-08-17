# ADR-032: Contracts

**Status:** Accepted — v0.3 Phase 20.
**Date:** 2026-08-17
**Phase:** v0.3 Phase 20 (Contracts) — the heart of the version: the world starts asking the player for things.
**Bound by (not re-litigated):** ADR-013 §4 (prices are declared, bounded bands a player can memorize); ADR-010 (every write is a command); ADR-031/ADR-022 (what is derivable is derived; a hash, never a draw); ADR-015 (schema discipline); ADR-011 (goods move only by explicit transfer); `VISION.md` §2.2 (reward absence, never punish it).

---

## Context

Everything v0.2 built makes the world move on its own; nothing yet makes it
**ask**. `PLAN.md` §4's criterion — _"contracts create a reason to plant
specific crops"_ — is the first mechanic where the world holds a preference
about what the player grows, and the first coin source that is not the spot
market.

Two prior decisions shape the design space. ADR-031 established that what is
derivable from `(content, seed, tick)` should be derived — and a notice
board's daily offers are exactly that shape. And ADR-019 §7 established the
template for what is NOT derivable: _"two players with one seed and different
sets have different worlds"_ — a player's **choice** is world state. An offer
nobody accepted is scenery; an accepted contract is a promise.

## Decision

**Offers are derived; acceptances are state. The board's daily offers are a
pure function of `(seed, day, season)`, costing the save nothing. Accepting
one materializes the deal — item, quantity, reward, deadline, requester —
into world state (schema v8) with its terms frozen forever. Delivery draws
from everything selling draws from and pays a declared premium over base
price. Expiry is silent and gentle: the contract leaves, nothing else
happens.**

### 1. The board is derived; the deal is state

Each day `D` the board posts `OFFERS_PER_DAY = 2` offers, hashed from
`(seed, D, slot)` with `mix32` — never `world.rng` (ADR-022 §1, ADR-031 §2).
An offer's item is a crop yield **plantable in day D's season** (the turnip's
year-round eligibility guarantees the pool is never empty — the same
load-bearing role it plays for workers, ADR-021 §4), so a contract is always
an invitation the player can act on from a standing start. Quantity targets a
hash-drawn value band; the requester is one of the four residents (ADR-031),
which is attribution and warmth, not mechanics.

Offers exist only while their day does, and only in derivation. The save
never records an offer — a reload recomputes the same board.

### 2. Acceptance freezes the terms

`acceptContract` copies the offer's RESOLVED terms into `world.contracts`:
item, quantity, `rewardCoins`, `deadlineTick`, requester, the offer's
identity (`offerId = day × OFFERS_PER_DAY + slot`, which also blocks
double-acceptance), and the acceptance tick. Frozen deliberately: a content
rebalance or a derivation change must never rewrite a promise a player
already holds — the save carries the deal, not the formula (the ADR-020 §2
freezing rule, applied to an agreement).

At most `MAX_ACTIVE_CONTRACTS = 3` run concurrently: enough to plan around,
too few to hoard the board.

### 3. The money: a declared premium, above base by design

```
rewardCoins = quantity × floor(basePrice × premium),   premium ∈ [1.25, 1.50]
```

Per-unit flooring, matching the spot path exactly. The premium band is
declared and bounded like every ADR-013 modifier — but it sits **above** the
base price the spot market treats as a ceiling, and that is the point, not a
violation: ADR-013 §4's ceiling is a property of the SPOT channel (prices
recover to the memorized value). Contracts are a second channel with its own
memorizable rule — **a contract always pays more than base, never more than
half again** — so the §4 predictability guarantee extends rather than
breaks: the player now knows the worst and best case of both ways to sell.

Delivering does NOT depress the spot multiplier. Goods sold to a named
neighbour never touched the open market; the coupling between contracts and
market demand is phase-21's seam (the `economy.ts` header has reserved it
since phase-06) and is deliberately not pre-built here.

### 4. Expiry is silent, and offline costs nothing extra

A `contract` step in the tick order removes any contract whose
`deadlineTick` has passed and counts it in `contractStats.expired`. Nothing
else happens — no fee, no penalty, no message chasing the player. A missed
contract is a missed premium, which is `VISION.md` §2.2's only permitted
pressure: opportunity, never loss.

Because expiry is a comparison against the tick, **offline needs no model at
all**: a save loaded after three days simply sweeps its overdue contracts on
the first live tick. No catch-up code, no crediting question (delivery is a
player act; nothing can fulfill while away), no conservative-model proofs.

### 5. Delivery draws what selling draws

`deliverContract` validates against the same aggregate `sellItems` uses —
player inventory plus storage sheds, in the same deterministic order — and
drains identically. Phase-07.9 already learned this lesson for selling
("what the panel offers and what the command accepts are the same set of
goods"); contracts inherit it rather than re-learn it. Payment is the frozen
`rewardCoins`; the fact is published as the existing `itemSold` event, so
audio and number feedback work unchanged and no consumer-less event is
invented (ADR-008's rule).

Contracts with an item whose content has vanished are KEPT, logged, and left
to expire — never quarantined: the reward was never the player's yet, so
nothing of value is being protected, and an un-deliverable contract resolves
itself by the ordinary rule.

### 6. Stats are recorded because the UI reads them now

`contractStats { fulfilled, expired }` — event-maintained counters in the
save (the `cropStats` pattern: not derivable from what remains). The board
panel displays them from day one, so they are not dead state waiting for
phase-22; reputation will read the same numbers rather than invent new ones.

### 7. What this deliberately is not

- **No penalties, no reputation effect.** Standing with the town is
  phase-22's, built on the §6 counters.
- **No demand coupling.** Phase-21 owns the market's reaction.
- **No NPC delivery theatre.** Goods leave, coins arrive, the resident's
  name says who is grateful. A walking hand-off is presentation the derived
  residents (ADR-031 §5) cannot do, and the phase does not need.
- **No worker automation of deliveries.** Delivering is a player decision,
  like accepting.

## Consequences

Schema v8 (contracts + stats — the version's first bump, phase-19 having
needed none); two commands; one small tick step; a board panel. The economy
gains its first above-base coin source, bounded and declared. The derivation
half reuses ADR-031's machinery and discipline wholesale; the state half is
deliberately tiny — a promise, two counters, and the sweep that retires it.
