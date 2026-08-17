# ADR-033: Demand

**Status:** Accepted — v0.3 Phase 21.
**Date:** 2026-08-17
**Phase:** v0.3 Phase 21 (Dynamic Market).
**Amends:** ADR-013 §4's ceiling reading — see §2, which is the one deliberate change to a shipped rule. ADR-013 was left **out** of ADR-029's freeze precisely because v0.2 never exercised it; this is the successor decision that freeze held the door open for.
**Bound by (not re-litigated):** ADR-013 §4's actual formal guarantee (every modifier is a declared, bounded band, floored once over the product); ADR-022/031/032 (what is derivable is derived, by hash, never `world.rng`); ADR-021 §2 (the seasonal modifier keeps its own rule); `VISION.md` §2.2 (absence is never punished); phase-07d's doctrine (offline crediting is provably conservative).

---

## Context

`PLAN.md` §4: _"Dynamic market — demand curves replacing flat multipliers"_,
with the criterion _"the economy feels responsive without becoming
unpredictable."_ Today the market only ever answers the PLAYER: dumping
depresses a multiplier, time recovers it, the season shaves a tenth. Nothing
makes the town **want** something — prices sit still until pushed, and every
push is downward. The seam has been reserved since phase-06: `economy.ts`'s
header names "v0.3 demand" as a future modifier that extends the pipeline
and never replaces it.

The design question with teeth is the ceiling. `economy.ts` reads ADR-013 §4
as "the base price is the ceiling — prices recover to the memorized value,"
and ADR-021 §2 refused a seasonal premium on that ground. A demand system
whose prices can only fall is not a market that moves; it is a second
penalty. Something above base must exist somewhere — phase-20 already put
contracts there — and the question is whether the SPOT channel may follow.

## Decision

**Demand is the pipeline's third modifier: a declared band `[0.85, 1.15]`
around base, derived per `(seed, item, spell)` — a spell is two days — by
the same hash discipline as weather and offers. The town's wants are its
own: nothing the player does moves demand. The base price's role changes,
once and explicitly, from CEILING to ANCHOR.**

### 1. Derived, in spells

```
spell  = floor(day / DEMAND_SPELL_DAYS),  DEMAND_SPELL_DAYS = 2
demand = DEMAND_STEPS[mix32(mix32(seed, hash(item)), spell) % steps]
DEMAND_STEPS = [0.85, 0.90, 0.95, 1.00, 1.00, 1.05, 1.10, 1.15]
```

Piecewise-constant like the weather, so a spell READS as the town's mood
rather than jitter — two days is 40 real minutes, long enough to act on.
The table's doubled `1.00` is the declared distribution: steady is the
commonest state, and the table IS the tuning surface (ADR-004 §5). Seeds
and non-yield items answer `1.00`, the seasonal modifier's own guard for
the same reason. No save field, no migration, no catch-up model, queryable
at any tick past or future — ADR-022 §1's whole table of benefits, bought
the same way.

### 2. The anchor amendment, stated plainly

ADR-013 §4's formal guarantee — _the effective price cannot leave the
product of the declared bands_ — is untouched and remains the predictability
contract. What changes is the informal ceiling reading: **base price is now
the anchor, not the maximum.** The player's memorizable rules, after this
ADR, in full:

| Channel   | Rule the player memorizes                                                                     |
| --------- | --------------------------------------------------------------------------------------------- |
| Spot      | Base, swung ±15% by the town's wants; your dumping can halve it; out-of-season shaves a tenth |
| Contracts | Always 25–50% above base (ADR-032 §3)                                                         |

The spot band becomes `[0.50 × 0.90 × 0.85, 1.15]` of base ≈ `[0.38, 1.15]`.
Wider than v0.1's — and still a product of declared bands a player can hold
in their head, which is what §4 always actually promised. ADR-021 §2's
seasonal no-premium rule is NOT reopened: the season still never pays a
bonus; wanting is demand's job.

### 3. Nothing the player does moves demand

Deliveries, dumping, and stockpiling leave demand untouched, deliberately.
The sale multiplier already answers the player's supply; demand is the
town's side of the ledger, and a player-movable demand would be either an
exploit surface (pump it) or a punishment (crash it) — both re-litigate
ground the sale multiplier already owns. "Responsive without unpredictable"
is exactly this split: the market responds along two independent axes, each
with one owner and one declared band.

### 4. Demand reaches every sale path, and the board leans with it

- `sellItems` and the stall sweep price with the demand factor — one
  pipeline, no channel forgotten (the phase-07.9 lesson, again).
- **Offline catch-up credits at the demand FLOOR (`0.85`)**, joining the
  worst-multiplier doctrine: a gap's sales happened at unknowable spells,
  and conservative is the only provable direction (phase-07d).
- The notice board's item pool WEIGHTS toward wanted crops (3× at high
  demand, 2× steady, 1× quiet) — derived from derived, still pure. Contract
  REWARDS stay demand-independent: the premium band is its own frozen rule,
  and stacking bands multiplies exploit surfaces.
- The HUD says so: the sell interface marks wanted (↑) and quiet (↓) goods,
  because a market the player cannot read is random, not responsive.

### 5. What this deliberately is not

- **Not supply-and-demand simulation.** No stock levels, no NPC consumption
  ledger, no equilibrium solver. The town wants things because towns do;
  the fiction is a hash wearing a market's clothes, exactly as the weather
  is a hash wearing a sky's.
- **Not a new channel.** Demand is a factor in the existing pipeline —
  `economy.ts`'s header kept its promise.
- **Not reputation-gated.** Phase-22 may let standing unlock better boards;
  demand itself stays impartial.

## Consequences

No schema change (the version's second derived-only phase). Catch-up credits
drop slightly under the demand floor — under-crediting is the doctrine's
accepted direction. The economy slice's integer prices now move with spells,
which is the visible point; the republish discipline holds because a spell
changes at most every two days. `GAME_DESIGN.md` §6.2 and `economy.ts`'s
ceiling comment are updated to the anchor reading in this phase.
