# Phase 25 — Recipes & Factories

> **Delivers:** buildings that consume and produce, a chain three steps deep,
> and the panel that makes a stalled one legible.
> **Governing decisions:** ADR-035; ADR-011 (containers, conservation);
> ADR-010 (commands are the only write path); ADR-008 (no event without a
> consumer); ADR-005 §2 (projections belong to the simulation).
> **Schema:** **v11** — one link: the factory side-table, empty.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                             | Commit    |
| ----- | ---------------------------------------------------- | --------- |
| 1     | ADR-035, before anything moved                       | `6d471c2` |
| 2     | The recipe registry and its door into the plugin API | `222ddb9` |
| 3     | The factory model and the production system          | `0044a1c` |
| 4     | The content chain: wheat → flour → bread             | `abf7862` |
| 5     | Placement, sale, and the recipe command              | `5b20cfe` |
| 6     | The conservation property crafting needed            | `ca80d3d` |
| 7     | The sprite-key gate the live pass earned             | `70b8972` |
| 8     | Schema v11 — a factory survives being saved          | `6b7dba4` |
| 9     | Offline production                                   | `ac29bc3` |
| 10    | The slice and the panel                              | `c71050d` |
| 11    | This close                                           | _this_    |

## The load-bearing decision

**A recipe names its building, not the reverse.** If a `BuildingDefinition`
carried a list of recipes, a content pack adding one to the core mill would
have to edit core content — which a plugin cannot do, and which ADR-019 exists
to make unnecessary. Named this way round, `barleymod:grind_barley` targets
`core:mill` and the mill gains it with no core edit, pinned by a test that does
exactly that.

There is still no `isFactory` flag. A building is a factory because some recipe
names it — the same shape ADR-030 §4 settled when it refused to make "town" a
subclass.

## The jam rules are the phase

v0.4's headline criterion is a chain running eight unattended hours without
jamming, and a jam is not a bug a unit test finds: it is a farm that quietly
stopped while the player was at work. So the rules were written into ADR-035
before a factory existed, and the tests are built around them rather than
around crafting.

The one that matters most is **Rule E, stated as a distinction**: a _stall_ is
a chain stopped by a full downstream, which is correct and self-clearing; a
_jam_ is a stall that outlives its cause. `production.test.ts` blocks a mill
for 500 ticks, empties its output, and asserts it picks itself back up
unprompted. Nothing in the system records that a factory was ever blocked —
which is precisely why it cannot stay blocked.

**Rule A is asked twice**, and the second time is the one that would have been
missed: an output can fill _while_ a craft runs, so a finished product waits
rather than vanishing.

## Conservation needed a second net, not a wider one

ADR-011's conservation property is the most valuable test in the resource half
of this project — and the test implementing it is a property over `transfer`
**alone**. Crafting never calls `transfer`. It would have gone on passing,
fully green, over any quantity bug crafting could cause.

The new property weights each item in units of the chain's raw input (wheat 1,
flour 2), so a craft is an **exchange** rather than a source-and-sink pair,
plus an in-flight term for the craft whose inputs are gone and whose outputs do
not exist yet. It never counts crafts: asking "how many happened" would assert
the implementation against itself.

It arrived one commit later than ADR-035 requires. That slip is recorded rather
than tidied — crafting shipped for one commit with the invariant unwatched.

## What the live pass found, again

Three versions running, looking at the game has caught what the suites
structurally could not.

`buildings:mill` and `buildings:kitchen` do not exist in the atlas, and
`textureFor` resolves an unknown key to `Texture.EMPTY` — so 2,782 green tests
were hiding two **silently invisible** buildings. `tests/sprite-keys.test.ts`
now closes that class permanently, and reproduces the mistake on demand.

Seen on screen and recorded: both factories reach the shop at the right prices
with working Build buttons, both draw, the panel reports a running mill at its
true percentage and an unset kitchen as "Choose what to make" — and the two
stand-in sprites are **near-indistinguishable at gameplay scale**. A player
cannot tell the mill from the kitchen without clicking one. That is a usability
defect the stand-ins cause, and why `ASSET_CATALOG.md` §2.1 lists the art as P0
rather than RC cleanup.

## Offline production is exact, and says where it stops being exact

A factory's three limits are all fixed for the duration of a gap — the ticks
available, the inputs it holds, the space in its output — because nothing
delivers to a factory while the player is away. The smallest of the three is
the answer rather than an estimate of it, which is a better position than the
crop model's.

**Phase 26 ends that**, and the code says so where a future session will read
it: once haulers move goods between buildings, inputs grow during the gap and a
chain must be modelled rather than computed.

## The two events that do not exist

ADR-035 §8 named `craftStarted` and `craftCompleted` and listed the panel as a
consumer. The panel reads the **slice**, so neither event has one, and
`events/types.ts` is explicit that only events with a real producer _and_ a
real consumer may exist. **The ADR guessed and was wrong; the rule beat the
guess.** They arrive with the feedback effects that actually want them.

## Suites at close

2,853 unit tests across 223 files; coverage 95.04% lines / 86.33% branches
(taken mid-phase); typecheck, lint, boundaries and cycles clean; the factory
panel verified on screen.

## Deliberately not in this phase

Logistics of any kind — nothing moves an item into or out of a factory except
the player. That is ADR-036 and phase 26, and phase 25 shipped a factory that
cannot feed itself precisely so the thing that feeds it is designed once, on
purpose, rather than as a mill's private convenience.

Also absent: recipe selection from the panel (the command exists and is tested;
the picker UI is not built), factory sprites of their own, and any second
recipe per building.
