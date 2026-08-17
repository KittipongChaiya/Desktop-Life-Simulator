# ADR-034: Reputation & Quests

**Status:** Accepted — v0.3 Phase 22.
**Date:** 2026-08-17
**Phase:** v0.3 Phase 22 (Reputation & Quests) — standing with the town, and the first objectives that outlast a single deal.
**Bound by (not re-litigated):** ADR-032 §6 (reputation reads the counters contracts already record); ADR-013 §4 as amended by ADR-033 (declared, bounded, memorizable price rules); ADR-022/031 (what is derivable is derived); ADR-015 (append-only migrations); ADR-010 (every player write is a command); ADR-008 (no consumer-less events, no derivable state stored); `VISION.md` §2.2 (reward presence, never punish absence).

---

## Context

`PLAN.md` §4 asks for two things this phase: _"standing with the town,
gating access"_ and _"simple objective chains"_. Phase 20 planted the seed
deliberately: `contractStats { fulfilled, expired }` went into the save
with the recorded intent that _"reputation will read the same numbers
rather than invent new ones"_ (ADR-032 §6). The question this ADR answers
is what standing IS, what it gates, and how much of a quest is state.

The roadmap's sketch assumed reputation would be new state. Examining what
it needs shows most of it is not — the same finding as ADR-031's residents:
the save already carries the history, so the standing is a **reading** of
it. What genuinely is state is smaller and precisely bounded below.

## Decision

**Standing is derived from `contractStats.fulfilled` — a tier function,
never a stored score. It gates the notice board: the board derives four
slots every day, and tiers unlock the later slots. Quests are content-
defined chains of thresholds over event-maintained counters; the only new
state is a per-chain high-water mark of steps already paid, plus a
per-requester fulfilled counter the chains read. Schema v10 carries the
two additions and re-keys offer identity for the four-slot board.**

### 1. Standing is a reading, not a score

```
standing(stats) = Pillar   if stats.fulfilled ≥ 10
                  Friend   if stats.fulfilled ≥ 3
                  Newcomer otherwise
```

Three tiers, two thresholds, one counter. Deliberately **fulfilled only**:
expiry does not subtract. A missed contract already costs its premium
(ADR-032 §4), and standing that decays while the player is away would
punish absence — `VISION.md` §2.2's forbidden pressure. The player's rule
is memorizable in one sentence: **every delivery raises your name, and
nothing lowers it.**

No stored reputation number exists to drift from the counters, migrate, or
rebalance-break. A save from any version computes its standing on load for
free, and a future rebalance of thresholds applies retroactively and
consistently — the counters are the truth, the tiers are a lens (the
ADR-022 coin, spent a fifth time).

### 2. What standing gates: the board grows with your name

The board derives **four** slots every day. Slots 0–1 are open to
everyone — exactly today's board. Slot 2 requires **Friend**. Slot 3
requires **Pillar** and draws from a **grand** value band
(`400–900` coins of base value against the standard `150–600`), the
town trusting its biggest orders to a proven name. Quantity scales with
the band; the premium stays inside ADR-032 §3's declared `[1.25, 1.50]` —
tiers unlock **more and bigger deals, never better prices**, so the two
memorizable price rules survive this phase untouched.

A locked slot is **visible but not acceptable**: the panel shows what the
town would ask of a Friend or a Pillar, which is the progression made
legible, and `acceptContract` validates the tier so the gate holds at the
command boundary (ADR-010), not in the UI. Deadlines, seasons, demand
weighting (ADR-033 §4), and the docket cap of 3 are unchanged.

### 3. Offer identity widens once: `offerId = day × 4 + slot`

Four derived slots need four id positions per day; `offerId` was
`day × 2 + slot`. The base becomes `BOARD_SLOTS = 4` — sized for this
board, not speculative headroom (a wider board is a rebalance for a
future ADR, and YAGNI holds). Accepted contracts in v9 saves store the
old ids, so **v10 re-keys them**: `day = ⌊id / 2⌋`, `slot = id % 2`,
`newId = day × 4 + slot` — total, collision-free, and preserving the
double-acceptance guard, since open offers keep slots 0–1 in both
schemes. Frozen terms are untouched (ADR-032 §2: the save carries the
deal, not the formula — including the deal's name).

### 4. Quests are thresholds over counters; the state is what has been paid

A quest chain is **content** (`sim/content/quests.ts`): an ordered list of
steps, each a declared threshold over an event-maintained counter — the
town-wide fulfilled count, or one resident's. Chains have no deadlines, no
failure, no branching: presence advances them, absence pauses them
(`VISION.md` §2.2 again).

Progress is therefore **derivable** and never stored — a chain's current
step falls out of comparing counters to thresholds. What is NOT derivable
is whether a step's reward has been **paid**: coins granted once must stay
granted once. The state is a single high-water mark per chain —
`questsPaid: chainId → steps paid` — the smallest fact that makes payment
idempotent (the `cropStats` reasoning a third time: not derivable from
what remains, because the wallet does not remember why it grew).

A `quest` step joins the tick order after `contract`: it compares counters
to thresholds, pays any newly crossed steps through the wallet, advances
the watermark, and publishes a `questCompleted` event the HUD consumes
(toast + the counters' panel — a consumer from day one, ADR-008). Offline
needs no model: nothing fulfills while away (ADR-032 §4), so no step can
cross while away. A **migrated save with prior fulfillments is paid what
its history earned on the first live tick** — deliberate, recorded here:
the counters were honest, so the reward is.

Chains read one new counter family: `contractStats.byRequester`
(resident → fulfilled count), maintained where `fulfilled` is maintained.
It starts empty on migration — per-resident history before v10 was never
recorded, and inventing it would be fiction. The asymmetry is honest: the
town-wide chain credits old saves, the resident chains start fresh.

### 5. Rewards are declared coins, and only coins

Each step's reward is a declared constant in the chain's content, sized
below contract premiums — quests season the contract loop, they must not
replace it. No reward grants standing (standing derives from `fulfilled`;
a quest that granted it would corrupt the derivation), no reward grants
items, and no chain unlocks mechanics — gating is standing's job (§2), so
the player has exactly one progression axis to reason about.

### 6. Schema v10, in one link

- `world.contracts[].offerId` — re-keyed per §3.
- `world.contractStats.byRequester` — added, empty on migration.
- `world.quests` — the paid watermarks, empty on migration.

One migration link, appended (ADR-015). Everything else this phase —
standing, tiers, gating, chain progress — is derivation and carries
nothing.

### 7. What this deliberately is not

- **No penalties, no decay, no negative standing.** §1's one-sentence rule.
- **No per-resident affinity mechanics.** `byRequester` is a counter the
  chains read; residents do not like or dislike the player, and their
  behaviour (ADR-031) is untouched.
- **No dialogue, no quest journal window.** The board panel carries the
  chains — the town asks on paper, in one place.
- **No quest deadlines or failure states.** Chains wait forever.
- **No new sale channel and no price effect.** Standing never touches a
  multiplier; ADR-033's one-owner-per-axis rule stands.

## Consequences

Schema v10 (two small additions and a re-key); one tick step; one event
with a consumer; a tier function and a slot gate; four content chains. The
board panel becomes the phase's whole surface: standing line, locked
rows, chain progress. The cost paid knowingly: `BOARD_SLOTS` is the second
constant frozen into offer identity, and any future change to the board's
width is another re-key migration — accepted, because ids that encode
`(day, slot)` are what keep offers derivable at all (ADR-032 §1).
