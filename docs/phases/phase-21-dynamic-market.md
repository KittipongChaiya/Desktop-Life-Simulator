# Phase 21 — Dynamic Market

> **Delivers:** a market that moves on its own. Demand — the third price
> modifier, in the seam `economy.ts` reserved in phase-06 — swings every
> item's price within a declared ±15% band, per two-day spell, derived from
> the seed like the weather. The base price becomes the anchor rather than
> the ceiling, and for the first time a price can be GOOD news.
> **Governing decisions:** ADR-033 (and the ADR-013 anchor amendment it
> carries); ADR-022/031/032 (the derivation discipline); phase-07d's
> conservative-crediting doctrine.
> **Schema:** **none** — the version's second derived-only phase.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                    | Commit    |
| ----- | ------------------------------------------- | --------- |
| 1     | ADR-033, before a price moved               | `7e3d6cb` |
| 2     | Demand, every sale path, the HUD, the tests | `858188f` |
| 3     | This close                                  | _this_    |

## The one deliberate rule change

ADR-013's formal guarantee — every modifier is a declared, bounded band,
floored once over the product — is untouched and remains the predictability
contract. What changed, once and in writing, is the informal reading that
base price is the ceiling: **base is now the anchor.** The player's complete
memorizable price rules after this phase: spot sells at base ±15% by the
town's wants, halved at worst by your own dumping, shaved a tenth out of
season; contracts always pay 25–50% above base. ADR-013 was left out of the
v0.2 freeze precisely because nothing had exercised it; this is the
successor decision that door was held open for.

## The mechanism, and what it cost

A demand spell is a hash of `(seed, item, two-day window)` over a declared
eight-step table whose mean is exactly 1.0 — the market redistributes price
over time, never inflates it. No save field, no migration, no catch-up
model, no RNG consumption, queryable at any tick past or future: the fourth
system bought with ADR-022's coin (weather, residents, offers, now demand).
Nothing the player does moves it — the sale multiplier owns the supply side,
demand owns the town's, one owner per axis, which is how "responsive"
avoids becoming "unpredictable".

Every sale path rides it: manual selling, the stall sweep, and offline
catch-up — where the conservative price point is the **minimum demand across
the spells the gap touched**, computed rather than assumed, because demand
is queryable history. Exact inside one spell; never above any spell seen.
The notice board leans toward wanted crops (3×/2×/1× weighting in the offer
draw); contract rewards stay demand-independent so the two premium bands
never stack.

## Tests moved to found seeds

The exact-arithmetic economy tests pinned coins with demand implicitly at
1.0. They now run on **found demand-neutral seeds** — searched, not
hardcoded, the criterion-9 doctrine — so they keep pinning the sale
multiplier and batch rules with full strength, while demand's own arithmetic
gets its own suite: band membership, mean-1 redistribution, spell constancy,
seed divergence, RNG silence, the sale-rides-demand proof, and the
minimum-bound exactness proof. The pacing floor (a crude greedy player
affording the stall) passes with demand LIVE, which is the mean-1 table
earning its keep.

## Verified live

A found world where wheat is wanted and turnips are quiet, on screen:
**Wheat 35g ↑** in green ("The town wants these — normally 34g") beside
**Turnip 11g ↓** in the amber the HUD already used for recovery. The market
reads at a glance, both directions, no legend needed.

## Suites at close

2,686 unit tests, the full e2e suite, typecheck, lint, the production-build
gate. One process note: a lint auto-fix stripped a type assertion one
tsconfig needed and only the production build caught it — the build-runs-
in-tests gate (phase-16's smoke lesson) did exactly the job it was built
for.

## Deliberately not in this phase

Supply-and-demand simulation (no stock ledgers, no equilibrium), demand
responding to the player, reputation-gated markets (phase 22), and any new
sale channel — demand is a factor in the one pipeline, which is the promise
`economy.ts` has kept since phase-06.
