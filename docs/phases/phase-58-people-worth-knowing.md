# Phase 58 — People Worth Knowing

> **Delivers:** four authored quest chains, one per resident, replacing the
> position where a `RESIDENTS.map()` template was the whole of the town's
> writing. R-06 enforced.
> **Governing decisions:** ADR-034 §4–§5 (quest chains; rewards sized below
> contract premiums); ADR-046 §2 (R-06), §3 (content is added, never removed).
> **Schema:** none.
> **Status:** **Complete.**

---

## What was wrong

Five quest chains existed. One was written — `A Good Neighbour`, the town-wide
chain. **The other four were produced by `RESIDENTS.map()`**: one template, two
steps, thresholds 1 and 3, with a name substituted in.

That is a formula, not content. It gave every resident an identical relationship
with the player and gave the player no reason to prefer one neighbour's notice
to another's. Four people who all want exactly three of anything are one person
with four names.

## What landed

| Chain                  | Steps | Shape                                            |
| ---------------------- | ----- | ------------------------------------------------ |
| Marla's Standing Order | 5     | The longest, the smallest steps — never finished |
| Tobin's Commission     | 3     | Short and steep; pays for urgency, not loyalty   |
| Prue Keeps Count       | 3     | Thresholds ON the standing tiers (3 and 10)      |
| Edwin's Long Account   | 4     | The highest thresholds in the game — 50          |

**Prue's chain reuses `GOOD_NEIGHBOUR`'s trick deliberately**: her thresholds
sit on the standing tiers ADR-034 §1 gates at, so the chain celebrates the same
milestones the gates open at and two systems tell one story.

**Edwin's last step is beyond a first session on purpose.** ADR-034 §5 sizes
quest rewards below contract premiums — quests season the contract loop and must
not replace it — so a longer chain cannot be a bigger prize. What it can be is a
reason the notice board still has something to say to a player on their second
day, which is the criterion v0.6 exists to make askable.

**The template chains are KEPT.** ADR-046 §3 forbids removing content, and every
save holding a partly-finished Errands chain would orphan it. They now read as
the short introduction the longer chain sits behind.

## The test caught the version's own promise being broken

The chains were drafted with rewards rising to **900 coins** on Edwin's last
step — and the paragraph directly above them, written first, says:

> Rewards therefore stay flat-ish per step and the LENGTH carries the
> progression. A chain that scaled its coins with its thresholds would quietly
> become the best income in the game by its last step.

`quests.test.ts` pins ADR-034 §5's ceiling at 400 and failed on the first run.
Every reward was brought under it. **The prose was already right and the numbers
broke it anyway**, which is a fair argument for pinning a constraint in a test
rather than in a sentence.

Two smaller catches from the same run: the ids were drafted as `core:story_*`
and the suite requires every chain id under `core:quest_`; and the coverage test
asserted `requesterChains.length === RESIDENTS.length`, which was true only
while every resident had exactly one chain. That assertion now checks the two
properties it was protecting — nobody is left out, nobody is invented — neither
of which cares how many chains a resident has.
