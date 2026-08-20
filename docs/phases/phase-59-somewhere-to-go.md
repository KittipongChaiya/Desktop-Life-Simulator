# Phase 59 — Somewhere To Go

> **Delivers:** three expedition destinations, taking the map from three to six,
> and breaking the single ordering that made it a list. R-07 and R-08 enforced.
> **Governing decisions:** ADR-038 (expeditions; §5 the rate band, §6 locked
> destinations stay visible); ADR-037 (the wilds); ADR-046 §2.
> **Schema:** none.
> **Status:** **Complete.**

---

## Two things were wrong, and they are different problems

**R-07 — half the wilds had no alternative.** The wilds yield wood, stone and
ore. No destination brought wood back at all, and stone came from exactly one.
So for two of the three materials a player gathers, an expedition could not
substitute for a forager — which is the entire proposition of sending somebody
away.

**R-08 — the map was a line.** Sorting the three destinations by travel time
gave precisely the ordering by yield value. That is one axis wearing two names:
"how far can I afford to send someone" had a single correct answer at every
moment, and the map panel was a list with a cursor.

## It turned out to be a constraint problem, not a writing one

Three separate rules bear on every row, and the first draft satisfied none of
them by accident:

1. **The rate band** (ADR-038 §5, `expedition-rate.test.ts`). Net value per tick
   of worker time must sit between half and twice a forager's rate. Below it
   nobody goes; above it every worker goes and the farm stops mattering.
2. **The carry cap** (`isReachableDestination`). Yields scaled by `HAUL_MAX`
   (1.25) must fit inside `WORKER_CARRY_CAPACITY` (20 items).
3. **Distance follows trust** (`expedition-rate.test.ts`): sorted by standing
   tier, travel time must strictly increase, _"or the map reads as arbitrary"_.

**Rules 1 and 2 together cap how long a trip can be, and the cap is lower than
it looks.** The most valuable haul that fits inside a worker is about 640 coins
of ore, and dividing that by the rate floor puts the longest viable journey at
roughly **530 seconds**. The first draft of the Sunken Coast was 600 seconds —
and it is not that its numbers were wrong, it is that no numbers exist for it.

**Rule 3 then rules out a second `pillar` destination entirely.** The Highlands
is pillar at 450 s, so any other pillar site must be longer, and longer than
450 s leaves almost nothing under the rate ceiling. Ashfell was drafted as
pillar and shipped as `friend` for that reason: gated one tier earlier, and
reachable sooner as the price.

The final table was solved numerically against all three rules at once rather
than adjusted until the tests went quiet.

## What shipped

| Destination      | Travel | Yield value | Standing |
| ---------------- | ------ | ----------- | -------- |
| **Thornwood**    | 120 s  | 176         | newcomer |
| River Delta      | 180 s  | 300         | newcomer |
| Old Quarry       | 300 s  | 536         | friend   |
| **Ashfell**      | 360 s  | **590**     | friend   |
| **Sunken Coast** | 400 s  | **548**     | friend   |
| The Highlands    | 450 s  | 880         | pillar   |

**Ashfell is a shorter trip than the Sunken Coast and worth more.** That single
inversion is where R-08 lives: travel time and yield value order the map
differently, so "how far can I afford to send someone" stops having one answer.
The Coast is not a trap — it is the only bulk **flax** in the game, which is the
linen chain's first rung, and it costs nothing to send anyone there.

The Thornwood is the shortest trip in the game and the only one with no
supplies at all. A newcomer's first expedition should be affordable in both
senses.

Resource coverage after: wood from 2 sites, stone from 4, ore from 3.

## What the gates caught, and one I nearly walked past

**The registration gate refused two destinations outright.** The first draft
gave the Sunken Coast 14 stone and 4 flax — 22 items after `HAUL_MAX` — and
Ashfell 18 becoming 21. `isReachableDestination` rejects a haul a worker cannot
carry, which is exactly where ADR-038 §1 wants that argument had.

**I nearly shipped past it, and the reason is worth writing down.** The failure
was a SUITE LOAD error: `createInstalledRegistries()` throws, the file registers
zero tests, and the run prints `Test Files 1 failed` with **no `×` line at
all**. I had been filtering test output for `×` and `Tests`, so an entire
content type failing to register was invisible for one phase.

> **Read the `Test Files` line, not just the `×` lines.** A suite that fails to
> load reports no failing tests, which looks identical to nothing happening.

**Three UI tests were pinning positions.** `map-ui.test.tsx` used
`getAllByRole('Send')[0]` in three places and meant "the River Delta's" — true
while the Delta was first in the list. Putting the Thornwood ahead of it made
all three quietly test a different place, and one of them would have gone
**permanently green for the wrong reason**: the supplies guard, written after a
real bug found on the running app, would have been checking a destination that
needs no supplies and is correctly enabled on an empty farm. They now select by
destination name.

A fourth assertion, `getByText('for friends of the town')`, began throwing on
_multiple_ matches once three destinations waited on `friend` — a failure that
reads as a missing element when it is the opposite.
