# ADR-046: The Content Tier

**Status:** Accepted — v0.6 Phase 54.
**Date:** 2026-08-20
**Authorised by:** `VISION.md` §4 (the v0.6 row) and §4.0a, amended before this ADR was written, per `PLAN.md` §9.3.
**Bound by (not re-litigated):** ADR-004 §5 (definitions are data; instances reference them); ADR-026 (content identity, and that the engine never branches on provenance); ADR-019 (the versioned public plugin API, and that first-party content uses it); ADR-044 (the arc is measured, not tuned); ADR-040 (the three evidence classes); ADR-035 (recipes and factories); `PLAN.md` §9.2 (scope moves later, never earlier).

---

## Context

Every version so far added a **system**. v0.6 adds none, and that makes it the
first version whose scope cannot be bounded by "the system works."

At the close of v0.5 the whole of the game's content was:

| Registry         | Entries at v0.5 close                          |
| ---------------- | ---------------------------------------------- |
| Crops            | **4** — turnip, wheat, carrot, pumpkin         |
| Buildings        | 10 registered, of which **6 purchasable**      |
| Items            | 13                                             |
| Recipes          | **2** — grind flour, bake bread                |
| Quest chains     | 5 — **1 authored**, 4 derived one-per-resident |
| Expedition sites | 3                                              |
| Resource nodes   | 3                                              |
| Residents        | 4                                              |
| Worker roles     | 4                                              |
| Sounds           | 11, every one a placeholder                    |

**The building row is the census correcting its author.** The v0.6 scoping
document said "6 buildings", counted by reading `buildings.ts`. There are ten:
the other four are the town's cottage, well, notice board and castle, defined in
`town.ts` and priced at zero because the player never buys them. Six is the
right number for R-05's purposes and ten is the right number for the registry,
and the difference is exactly the kind of thing an instrument catches and a
count-by-hand does not. It is the first thing `content-census.test.ts` found,
before it had a single rule turned on.

And the crop table, which is the entirety of farming:

| Crop    | Growth | Seasons        |
| ------- | ------ | -------------- |
| Turnip  | 90 s   | any            |
| Wheat   | 240 s  | spring, summer |
| Carrot  | 480 s  | summer, autumn |
| Pumpkin | 1200 s | autumn, winter |

**Spring and winter offer two plantable crops; summer and autumn offer three.**
Turnip grows year-round and each of the other three covers two adjacent seasons,
so the calendar is thinnest at both ends of the year.

**That last sentence is the census correcting its author for the second time.**
The scoping note for this version said "in any season the player has exactly two
plantable crops," which is wrong for half the year — and the same note went on
to claim the two are "strictly ordered," meaning one is simply better. The
dominance check written for R-02 disagrees: it passes today. Turnip is cheap and
fast, pumpkin is expensive and slow and pays far more per visit, and neither
beats the other on all three of the axes R-02 measures.

So the honest finding is narrower than the one this version was scoped on, and
it is worth stating precisely, because a rule aimed at the wrong defect authors
the wrong content:

- **The defect is volume, not domination.** Four crops cannot fill four seasons
  with three each. R-01 is the rule that bites today; R-02 passes and is carried
  as a guard against the obvious failure mode of fixing R-01 — twelve crops in a
  neat power ordering would satisfy the count and re-create the problem.
- **A two-item list is a choice in the same sense a coin toss is a decision.**
  It is not that the player picks wrongly; it is that there is not enough there
  to get better at.

Neither correction changes what v0.6 does. Both change what its rules are aimed
at, which is the entire reason ADR-046 §2 was written before any content was.

That is the shape of the whole content set. ADR-035's factory model, built for
chains, runs one two-step chain. ADR-034's reputation system grades one
authored quest chain. ADR-038's expeditions offer three destinations.

### Why this is a decision and not just a backlog

A content version has no natural end. "Enough crops" is a feeling, and a
version scoped by a feeling either stops early because someone got bored or
never stops at all. Both failures are worse than the thin content set, because
both cost the version its credibility as a boundary.

So the scope has to be written down as something checkable **before any content
is authored**, which is what this ADR is for.

---

## Decision

### 1. v0.6 authors content against existing registries and adds no simulation

No new system, no new command kind, no new save schema field, no new extension
point. Every phase in v0.6 is a data edit plus the art and audio that data
names, landing through the same public API `plugins/core` already uses
(ADR-019 §2).

**This is what makes the version cheap**, and it is a consequence of ADR-004 §5
rather than an aspiration: definitions are data, instances store a `ContentId`,
and no definition is ever written to a save. **Adding content is therefore not
a migration.** If a proposed piece of content would require a save migration, it
is not v0.6 content — it is a system, and it belongs to a later version.

### 2. "Enough" is defined as RULES, not counts

A target count is arbitrary and invites authoring to the number. Each rule
below states a property the content set must have; the count falls out.

| #    | Rule                                                                                                                      | Phase |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ----- |
| R-01 | Every season offers **at least three** plantable crops                                                                    | 55    |
| R-02 | Within a season, **no crop is strictly dominated** — none worse-or-equal on every axis than another available that season | 55    |
| R-03 | At least **two** chains of depth ≥ 3 items, and **one** of depth ≥ 4 (`wheat→flour→bread` is 3)                           | 56    |
| R-04 | Every factory building is named by **at least two** recipes                                                               | 56    |
| R-05 | At least **three** purchasable buildings above the Market Stall, from **two or more kinds** (storage / factory / utility) | 57    |
| R-06 | Every resident has an **authored** quest chain — not only the derived one                                                 | 58    |
| R-07 | Every resource node kind is reachable from **at least two** expedition sites                                              | 59    |
| R-08 | Expedition sites differ on **more than one axis** — duration, yield and risk are not one ordering                         | 59    |
| R-09 | Every sound is **reachable** — it has a trigger — and every event the renderer observes that deserves one has one         | 60    |
| R-10 | The progression arc still clears both its floor and its ceiling                                                           | 61    |

**Two rules need their metric stated, because the number is meaningless
without it.**

- **R-02's axes.** A crop is strictly dominated when another crop available in
  the same season is at least as good on **all three** of: value per tick
  (the active player's axis), value per harvest (the idle player's — fewer
  returns for the same money), and seed cost (the poor player's), and strictly
  better on at least one. Three axes rather than one is the whole point: a crop
  that is slower but pays more per visit is not worse, it is _for someone else_,
  and a rule with a single axis would delete exactly the crops that make a
  season a choice.
- **R-05's "distinct bottleneck" is derived from the data, not asserted.** A
  building's KIND is what its definition makes it: one that declares
  `storageSlots` is storage, one a recipe names is a factory (ADR-035 §1 — what
  makes a building a factory is that a recipe names it), and one that is neither
  is a utility. R-05 requires three buildings above the Market Stall drawn from
  **at least two** kinds. Three more processing buildings at three prices are
  three of the same rung, and would satisfy a count while missing the point.
- **R-09 WAS AMENDED AT PHASE 60, and this is that amendment rather than a
  quiet edit.** As written it said "no sound in the catalogue is described as a
  placeholder", and `content-census.test.ts` checked the only thing that
  sentence can be checked by: whether `assets/src/audio/<name>.wav` exists,
  since `generate-audio.mjs` copies a real file through when one is present and
  synthesises otherwise.

  **That conflates method with quality, and the version cannot honestly satisfy
  it either way.** A synthesised sound is not a placeholder because it was
  synthesised. And ADR-043 already settled the harder half, at the end of v0.5:

  > The obvious next move is to make the eleven placeholders sound better...
  > **I cannot hear them.** Every other claim in this ADR is checkable by
  > running something; "this sounds nicer" is not, and changing synthesis I
  > cannot evaluate would be guessing with a straight face.

  Nothing about that has changed. Dropping eight generated WAVs into
  `assets/src/` would have turned the check green while changing nothing a
  player hears, and would have cost the project its one honest sentence about
  its own audio.

  **What replaces it is the property v0.6 can actually establish**: that the
  audio has no HOLES. A sound nothing triggers is an asset nobody hears, and an
  event that deserves a sound and gets silence is worse — in a game built on
  glancing back at what happened while you were away, the completion sound IS
  the feedback channel. Both are machine-checkable, and the second one found
  something (see the phase 60 record).

- **R-03's depth is counted in ITEMS, not recipes.** `wheat → flour → bread` is
  depth 3 and is the chain that already exists, which is why R-03 asks for two
  of them plus one deeper. Counting recipes instead would let the existing chain
  satisfy the rule by itself.

**A rule is turned on in the phase that satisfies it**, not before.
`tests/content-census.test.ts` carries all ten from phase 54, with the
unsatisfied ones gated against a phase table the test reads as data. **`it.skip`
is not used**: a rule that is off is off for a stated reason that the test
prints, rather than by a commented-out line (`AI_RULES.md` §1.5 — enforce where
it can be observed). The gate is a one-line edit per phase, and a rule cannot be
quietly lost because the file always lists all ten.

### 3. Content is ADDED. It is never renamed and never removed

ADR-026 makes a `ContentId` a permanent identifier: instances in a live save
store the id and resolve the definition at load. Renaming `core:wheat` orphans
every wheat in every save; removing it does the same.

So within v0.6:

- **Adding a definition is always safe.** A v0.5 save loads into v0.6 and simply
  never refers to the new ids.
- **Renaming or removing one is forbidden**, and `content-census.test.ts` pins
  the v0.5 id set as a floor: every id that existed at the v0.6 baseline must
  still resolve. Deliberately removing content in some later version means
  editing that floor, which is exactly the amount of friction it deserves.
- **Changing a definition's numbers is a balance change**, permitted under §4,
  and is not an identity change.

### 4. Balance within v0.6 is measurement-driven, and the authority is delegated

The project owner delegated balance authority for v0.6 on 2026-08-20: costs,
prices, rewards, growth times, recipe values and contract values may be tuned
**when the measurements show tuning is required**, without per-change approval.

ADR-044 is not weakened by this and remains the standard of evidence. What it
refused was tuning against a perfect-player bound with no other information;
what it established was that the arc has a guard with a floor and a ceiling. So
the rule for v0.6 is:

> **A balance change requires a measurement it is responding to, the smallest
> edit that answers it, and the reasoning recorded.**

Instinct is not evidence. "This feels expensive" is not a measurement. A failing
or near-failing bound in `progression-arc.test.ts`, a crop dominated under R-02,
or an economy test showing an unbounded income loop all are.

### 5. Two things v0.6 does not get to do

- **It does not touch v1.0's systems.** No RPG progression, combat, dungeons,
  bosses, city defense, or world-map expansion. `PLAN.md` §9.2 — scope moves
  later, never earlier — and `VISION.md` §4.1 now records why content precedes
  combat specifically.
- **It does not close a human-playtest criterion.** ADR-040 is unchanged and
  absolute: evidence requiring a person's reaction may never be marked PASS from
  a session with no person in it. v0.6 exists partly to make those two criteria
  _closable_; closing them is still not something this session can do.

---

## What is deliberately NOT done, and why

**No content-authoring DSL, editor, or spreadsheet importer.** The obvious
reaction to "we need more content" is to build a faster way to make content.
That is a system, it is the speculative generality `CODE_STYLE.md` forbids, and
the actual cost of a crop today is a data literal plus a generator entry —
measured in phase 55 rather than assumed. Revisit only if authoring cost is
shown to be the binding constraint.

**No count targets in this document.** See §2. The rules are the scope, and a
version that satisfies all ten with fewer definitions than expected has
succeeded rather than cut corners.

**No relaxation of the "no new systems" line for a tempting near-miss.** Several
pieces of content would be better with one small system behind them — crop
quality tiers, resident gift preferences, weather-modified yields. Each is a
save-schema change wearing a content costume. They are recorded as v1.0
candidates and not built here.

---

## Consequences

- **v0.6 has a checkable end.** The version closes when all ten rules pass and
  the `PLAN.md` §8 gates are green — not when the content feels sufficient.
- **The census becomes a permanent instrument.** `content-census.test.ts`
  records the size of every registry, so "the content is thin" stops being an
  anecdote that has to be rediscovered by counting, and a future version can see
  at a glance what it inherited.
- **The plugin API gets its first volume test.** `plugins/core` has always used
  the public surface (ADR-019 §2), but it has only ever carried a demo-sized
  table. Substantially growing what it registers is the first evidence that the
  API is sufficient for real content rather than merely for a sample of it.
- **Save compatibility is expected to be trivially preserved**, and that
  expectation is a claim to be tested rather than assumed — the v0.5 golden
  fixture must load into v0.6 unchanged.
- **The economy will move.** More sinks and more sources mean the arc, the
  market, and the contract premiums all shift. Phase 61 exists for this and is
  scheduled after all authoring, deliberately, because tuning a moving target
  mid-authoring is how a balance pass becomes a rebalance loop.

## Revisit if

- Authoring cost, measured, becomes the binding constraint on content volume —
  then reconsider the tooling refused above.
- A rule in §2 turns out to describe the wrong property. Amend the rule in
  writing; do not satisfy it narrowly and move on.
- A piece of content genuinely requires a save migration and is still judged
  essential to v0.6 — then §1 is what is being amended, and the version is no
  longer a content tier.
