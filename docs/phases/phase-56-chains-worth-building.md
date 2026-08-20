# Phase 56 — Chains Worth Building

> **Delivers:** seven recipes, seven processed goods and two new factories,
> taking production from one two-step chain to four chains — one of them four
> items deep. ADR-046 R-03 and R-04 turn from reported to enforced.
> **Governing decisions:** ADR-035 (recipes and factories; a building is a
> factory because a recipe names it); ADR-046 §1 (no new systems), §2 (the
> rules); ADR-011 §4 (declared sinks and sources).
> **Schema:** none.
> **Status:** **Complete.**

---

## What was wrong

v0.4 built a factory model **for chains** and shipped one two-step chain:
`wheat → flour → bread`. The depth the model was designed for had never once
been exercised, and two things followed.

**A factory with one recipe is not a decision.** The Mill ran `grind_flour` and
nothing else, so owning a Mill was a switch that was either on or off. There was
never a moment where "what is my Mill doing right now" was a question worth
asking. R-04 is that observation stated as a rule: **every factory is named by at
least two recipes.**

**One chain is not a supply line.** ADR-036's logistics, ADR-011's reservations
and the whole factory-container model existed to move goods between stages that
did not exist. R-03 asks for two chains of depth ≥ 3 items and one of depth ≥ 4.

## What landed

| Building            | Recipes                                 |
| ------------------- | --------------------------------------- |
| **Mill**            | Grind Flour · Grind Cornmeal · Ret Flax |
| **Kitchen**         | Bake Bread · Cook Porridge              |
| **Preserving Shed** | Make Jam · Make Sauce                   |
| **Loom**            | Spin Thread · Weave Cloth               |

Four chains, measured in items:

| Chain     | Path                                    | Depth |
| --------- | --------------------------------------- | ----- |
| **Linen** | flax → linen fibre → thread → **cloth** | **4** |
| Bread     | wheat → flour → bread                   | 3     |
| Porridge  | corn → cornmeal → porridge              | 3     |
| Preserves | strawberry → jam · tomato → sauce       | 2     |

**The linen chain is the first thing in the game that asks a player to run two
buildings in series.** Flax is retted at the Mill, spun and then woven at the
Loom — so a player who wants cloth needs both, keeps the Mill busy with
something that is not grain, and has a reason to think about where the
intermediate goes. Cloth at 850 coins is the most valuable item in the game, at
about twelve minutes of machine time from the flax it started as.

**Cook Porridge takes two different inputs** — cornmeal and a leek — and is the
only recipe that does. A queue you have to supply rather than feed is what makes
a Kitchen something a player manages.

## The prices are the v0.4 premium, applied unchanged

`coreItems()` recorded the existing rule when phase 25 wrote it: 4 wheat (136)
→ 2 flour (170) → 1 bread (230). Roughly 1.25× per step and 1.7× across the
chain, _"because a chain that did not add value would be a building with no
reason to exist."_

Every price here is that same step ratio against its own inputs. **Processing
keeps exactly the shape it had** rather than becoming a better deal because it
got longer — which is the failure mode a content pass invites, and the reason
the ratio was copied rather than re-derived.

No infinite-money loop exists: every chain terminates in a good nothing consumes,
and every input traces back to a crop that costs a seed and a growth timer.

## What the gates caught

**`sprite-keys.test.ts` failed the moment the recipes landed**, naming all seven
new goods. That gate was written after phase 25 shipped a mill and a kitchen
pointing at art that did not exist: the renderer resolves a missing key to
`Texture.EMPTY` and draws **nothing**, silently, through a fully green suite. A
wrong-looking building is a bug a player reports; an invisible one is a bug
nobody can describe.

`scripts/generate-item-art-v06.mjs` answers it with seven 16×16 icons. Three of
them are the linen chain's rungs, and they had to be legible **as a chain** — a
player looking at a Loom's queue must see which rung they are short of. They
share a family (pale, fibrous, cream) and separate by form: a loose hank, a
wound spool, a folded bolt. Colour alone would have made three cream smudges.

## What this phase did not do

**No new system.** A recipe is a data literal; a factory is a building a recipe
names. Nothing in `src/sim` changed except the id constants the data refers to.

**No new sound for a craft completing** — see the phase 60 record. It is the
gap this phase most wanted and could not have, because the simulation emits no
event when a craft finishes and adding one is engine work, not content.
