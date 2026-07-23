# GAME_LOOPS

> **Status:** The loop taxonomy and forward-looking loop designs. Only the v0.1 loops exist; everything else is **designed for, not built** (`VISION.md §4.2`) and tier-tagged with its earliest ship version.
> **Owns:** The loop tier taxonomy (primary/secondary/meta/long-term/endgame), the forward-looking loop and resource-flow designs, the motivation and progression ladders, and the idle-vs-active vocabulary.
> **Does not own:** The canonical v0.1 loop, its diagram, and its numbers (`GAME_DESIGN.md §1`, `VISION.md §3`); the feature gate (`CONTENT_RULES.md §3`); scheduling (`PLAN.md` — loops here **constrain** future features, they never schedule them).

Every future gameplay proposal must name the loop it improves (`CONTENT_RULES.md C-01`). This document is where those names are defined — so that "the fishing loop" means the same thing to a session in phase 40 as it does today, and so that a loop invented ad hoc mid-phase is recognisably a red flag.

---

## 1. Design philosophy

### 1.1 Why loops are the foundation

A feature is a noun; a loop is a sentence the player keeps saying. Content that joins a loop gets replayed, feeds other systems, and compounds; content that doesn't is consumed once and becomes dead weight. In a game meant to run for months at the bottom of a screen (`VISION.md §1`), only loops survive — which is why the roadmap is ordered by what each tier's loops need from the previous tier (`VISION.md §4.1`), and why the feature gate's first question is "which loop?" (`CONTENT_RULES.md §3`).

### 1.2 The tiers

| Tier               | Timescale       | Definition                                                                           | v0.1 instance                                              |
| ------------------ | --------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Primary loop**   | seconds–minutes | The core cycle the game is _about_; every other loop feeds it or automates it        | The farm loop (`GAME_DESIGN.md §1`)                        |
| **Secondary loop** | minutes–hours   | A domain cycle that plugs into the primary loop as input, output, or automation      | Worker, inventory, economy, building loops (§3)            |
| **Meta loop**      | days            | Spending accumulated output to raise the primary loop's ceiling                      | Expansion: land vs workers (`GAME_DESIGN.md §6.3`)         |
| **Long-term loop** | weeks–months    | Arcs that span roadmap tiers: capability unlocks, region access, mastery             | The stage arc (`GAME_DESIGN.md §1.1`), then `VISION.md §4` |
| **Endgame loop**   | self-set        | Self-directed goals once the ladder is climbed: optimisation, completion, expression | None yet — v0.1's arc deliberately terminates (§12)        |

These tiers deliberately extend the three nested timescales `VISION.md §3` already defines: the glance loop is one primary-loop iteration, the session loop is secondary/meta play, the progression loop is the meta and long-term tiers. Same model, finer grain.

### 1.3 How loops interact

Three legal couplings — every future loop must use at least one (`CONTENT_RULES.md C-02`):

1. **Output → input.** One loop's product is another's ingredient (crops → coins → seeds; later: crops → feed → animals → goods → market).
2. **Automation.** One loop removes manual steps from another (workers automate farming; later: logistics automates hauling).
3. **Ceiling raising.** One loop expands another's capacity (land, storage; later: technology, town development).

A proposed loop that couples in none of these ways is an isolated minigame and fails the gate.

---

## 2. The primary loop (v0.1) — deferred

The canonical loop, its diagram, its numbers, and its four-stage progression arc live in `GAME_DESIGN.md §1`, with the product framing in `VISION.md §3`. Not repeated here. What this document adds is the **motivation reading** — why each step pulls toward the next:

| Step (directive form)    | Canonical home                    | What pulls the player forward                                                     |
| ------------------------ | --------------------------------- | --------------------------------------------------------------------------------- |
| Plant crops              | `GAME_DESIGN.md §1` (TILL, PLANT) | Anticipation — a planted tile is a promise                                        |
| Wait / idle              | growth, offline-safe              | Freedom — absence is the _optimal_ strategy (`GAME_DESIGN.md §3.2`)               |
| Harvest                  | HARVEST                           | The gift moment — the payoff `VISION.md §2.2` designs for                         |
| Store resources          | INVENTORY (`§7`)                  | Accumulation made visible; storage pressure motivates the next building           |
| Sell products            | SELL (`§6.2`)                     | Score realised; dynamic prices reward selling _thoughtfully_                      |
| Earn money               | COINS                             | The universal enabler (`C-14` — the only currency)                                |
| Buy upgrades             | HIRE WORKER / BUILD (`§4`, `§5`)  | The decision point — throughput (workers) vs ceiling (land) vs chores (buildings) |
| Expand farm              | land expansion (`§6.3`)           | Visible territorial progress; the farm literally grows                            |
| Unlock new opportunities | stage transitions (`§1.1`)        | Each stage changes _what playing means_, culminating in automation                |
| Repeat                   | —                                 | The loop now runs partly by itself — repetition becomes supervision               |

**Session length:** by design, one glance-loop pass is under five seconds and a full session pass is one to three minutes (`VISION.md §3.1–3.2`); the stage arc paces the first idle-capable farm at roughly three hours of cumulative play (`GAME_DESIGN.md §1.1`).

---

## 3. Secondary loops

The catalog. **Exists** marks v0.1 reality; every other loop is a design intent tagged with its earliest tier (consistent with `VISION.md §4` and the tiering in `docs/assets/ASSET_CATALOG.md` / `SFX_LIBRARY.md`). Attachment points cite `GAME_DESIGN.md §11` where one is pre-declared.

| Loop                   | Tier   | Cycle                                                                          | Couples to (§1.3)                                             |
| ---------------------- | ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| **Worker automation**  | v0.1 ✓ | hire → assign by priority → work/rest → throughput → afford next worker        | Automation of the primary loop (`GAME_DESIGN.md §4`)          |
| **Inventory**          | v0.1 ✓ | harvest → stack → capacity pressure → build storage → longer unattended runs   | Ceiling raising (`GAME_DESIGN.md §7`, ADR-011)                |
| **Economy**            | v0.1 ✓ | sell → price dips → diversify/wait → prices recover → sell smarter             | Output→input for everything (`GAME_DESIGN.md §6`)             |
| **Building**           | v0.1 ✓ | identify chore → save → place building → chore removed → new bottleneck        | Automation + ceiling (`GAME_DESIGN.md §5`)                    |
| **Season**             | v0.2   | season turns → crop viability shifts → replan → harvest festival-ready goods   | Growth-rate modifiers (`GAME_DESIGN.md §11`)                  |
| **Animal husbandry**   | v0.2   | buy animal → **feed crops** → collect produce → sell/cook → better breeds      | Output→input; gives crops their second use (C-07 repair)      |
| **Fishing**            | v0.2   | cast → wait (idle-friendly by nature) → catch → sell/cook/log                  | Output→input; the log must feed a loop (`C-08`)               |
| **Achievement**        | v0.2   | play naturally → milestone recognised → (small) capability or cosmetic reward  | Recognition layer over all loops; never a chore list (`C-08`) |
| **Collection**         | v0.2   | encounter variety → log it → completion yields knowledge/access                | Legal only attached to real rewards (`C-08`)                  |
| **NPC relationship**   | v0.3   | meet → gift/help (farm goods!) → bond → unlocks recipes, contracts, favours    | Output→input from farming (`GAME_DESIGN.md §11` — FSM reuse)  |
| **Town development**   | v0.3   | invest goods/coins → town grows → new vendors/demand → invest more             | Ceiling raising; demand curves from dynamic pricing           |
| **Festival**           | v0.3   | season peaks → town gathers → bring your best goods → recognition + rare seeds | Longest dependency chain: needs seasons **and** town (§12)    |
| **Crafting**           | v0.4   | gather → refine → combine → goods worth more than parts → recipes deepen       | Output→input between every resource family (§6)               |
| **Mining**             | v0.4   | dig → ore → smelt → tools/machines → dig deeper                                | Feeds crafting/factory; exploration opens veins               |
| **Exploration**        | v0.4   | venture past the farm → discover region/resource → establish access → venture  | Ceiling raising (grid already 64× the plot, `§11`)            |
| **Factory production** | v0.4   | build chain → consume inputs → produce goods → optimise throughput             | Automation of crafting (`GAME_DESIGN.md §11`)                 |

Two catalog-wide constraints. First, **every loop keeps the primary loop primary** — a secondary loop may be engaging, but if it stops feeding farming/economy it has become a second game (`C-19` states this for RPG; it holds everywhere). Second, **every loop must idle gracefully** — each cycle above has a "wait" step that pays while absent or a state that simply pauses; a secondary loop that decays or fails unattended violates `VISION.md §2.2` and does not ship.

---

## 4. Future RPG loops (v1.0)

One interconnected web, not eleven features. The binding rule is `CONTENT_RULES.md C-19`: **RPG progression supports farming instead of replacing it.** The fiction hooks — the dormant Old Works, the wild frontier — are already canon (`docs/assets/LORE_BIBLE.md`), as is the rule that danger stays at the frontier, never at home.

```
            EQUIPMENT ◄── crafting + economy (the farm equips you)
                │
                ▼
COMBAT ──► DUNGEON ──► RARE LOOT ──► ENCHANTING / MAGIC
  ▲            │            │               │
  │            │            ├── rare seeds ─┼──► BETTER FARMING
  skills       │            └── materials ──┘         │
  (mastery     ▼                                      ▼
   by doing)  BOSSES ──► legendary gear ──► deeper frontier access
                                                      │
                              richer economy ◄────────┘
```

- **Combat / skills:** capability grows by doing (mastery), gated by equipment the economy produces — never by grinding levels (`C-10`).
- **Equipment / legendary gear:** crafted from farm-economy materials plus dungeon finds; demand for gear is combat's gift _to_ the economy (`C-20`).
- **Dungeons / bosses / ancient ruins:** scheduled, opt-in expeditions into the frontier (`LORE_BIBLE`'s reserved deep places); never time-pressured, never punishing absence.
- **Rare loot / rare seeds:** the deliberate pipe back home — the best reward a dungeon can give is a better _farm_ (a crop no market sells, a growth-charm essence). This single design choice is what keeps v1.0 a life simulator rather than an action game with a farm attached.
- **Enchanting / magic:** magic essence is an **item**, not a currency (`C-14`), harvested from rare crops and ruins, spent on farm and tool enhancement.

---

## 5. Future city defense loop (v1.0)

```
prosperity rises → raid foretold (in-fiction, scheduled, opt-in)
   → prepare: walls (stone), guards (trained, fed), equipment (crafted)
   → the raid resolves → repairs (wood/stone) + rewards (renown, materials)
   → town expands → prosperity rises …
```

Defense is the economy's stress test and its celebration: walls consume stone, guards consume food and equipment, repairs consume wood — demand for nearly every production chain (`C-20`).

**The constitutional constraint, stated now so no v1.0 session discovers it mid-implementation:** `VISION.md §2.1/§2.2` outrank this loop. Raids must be **opt-in and scheduled** (the player chooses readiness and timing in advance), must **never resolve destructively while the player is absent**, and a lost defense costs opportunity (a smaller reward, a delayed expansion), never accumulated value. A raid that can burn the farm during a workday is not a feature of this game; it is a different game. Designing defense inside that envelope is the hard problem, and it is flagged as such in §12.

---

## 6. Resource flow

### 6.1 The general pattern

Every resource family follows one shape — a family that cannot fill in this chain is not ready (`C-07`):

```
SOURCE ──► RAW RESOURCE ──► REFINEMENT ──► USE (consume / build / trade)
   ▲                                            │
   └────── reinvestment: capability that ◄──────┘
           unlocks a richer source
```

The v0.1 instance is canonical in `GAME_DESIGN.md §6.4` (sources/sinks) and §1 (the loop): coins → seeds → crops → coins → workers/buildings/land → more crops.

### 6.2 The families

Tier-tagged intents. The last column is mandated by `C-19`: every family names its pipe back into farming.

| Family        | Tier | Flow                                                                          | Feeds farming via                                 |
| ------------- | ---- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| Crops         | v0.1 | seeds → crops → sell → reinvest                                               | — (it _is_ farming)                               |
| Animals       | v0.2 | animal + **crop feed** → produce (eggs/milk/wool) → sell/cook → better breeds | Crops gain their second sink                      |
| Wood          | v0.2 | trees → lumber → construction / fences / repairs                              | Farm buildings and expansion get a material cost  |
| Food/Cooking  | v0.3 | crops + produce → dishes → NPC gifts / contracts / worker meals               | Crops gain a third, higher-value sink             |
| Stone         | v0.4 | quarry → stone → paths, foundations, walls                                    | Farm infrastructure; later, defense demand        |
| Ore/Metal     | v0.4 | mine → ore → smelt → tools, machines, equipment                               | Better farm tools; factory machines               |
| Crafted goods | v0.4 | raw materials → intermediates → goods                                         | Multiplies the value of everything the farm grows |
| Equipment     | v1.0 | metal + wood + leather → gear → combat capability                             | Frontier access → rare seeds and essences         |
| Magic         | v1.0 | rare crops + ruins → essence (an item, `C-14`) → enchanting                   | Growth charms, tool enchants — magic serves crops |
| Dungeon finds | v1.0 | expeditions → rare loot                                                       | Rare seeds: the dungeon's best reward is a crop   |

Chains deepen with the tiers: in v0.2 wood is tree → lumber; by v0.4 the same wood feeds crafting intermediates. Extending an existing family's chain is always preferred over introducing a new family (`C-03`, `C-16`).

---

## 7. Player motivation

| Horizon         | The goal shape                                        | Served by                                           |
| --------------- | ----------------------------------------------------- | --------------------------------------------------- |
| **Short-term**  | The next harvest, the next 50 coins                   | Glance loop (`VISION.md §3.1`)                      |
| **Medium-term** | The next worker, building, expansion                  | Session + meta loops; the stage arc (`§1.1`)        |
| **Long-term**   | The self-running farm; each roadmap tier's promise    | Stage 4, then `VISION.md §4`                        |
| **Lifetime**    | The finished valley — every region reached and tended | The tier ladder as a whole                          |
| **Achievement** | Milestones recognised without being demanded          | Achievement loop (v0.2), inside `C-08`              |
| **Collection**  | Complete logs that unlock knowledge and access        | Collection loop (v0.2), inside `C-08`               |
| **Mastery**     | Optimisation: layout, throughput, market timing       | Endgame tier; needs no content, only depth (`C-16`) |

The ladder must stay **continuous**: at any moment the player has one goal within minutes, one within days, one within weeks (`VISION.md §3.3` — always slightly short of something). A tier that ships long-term goals without short-term rungs produces a dead patch, which is how idle games lose players.

---

## 8. Progression by domain

Where each domain's ladder starts (v0.1) and climbs (tiers per `VISION.md §4`, attachment points per `GAME_DESIGN.md §11`):

| Domain        | v0.1                              | Progression axis                  | Future rungs                                           |
| ------------- | --------------------------------- | --------------------------------- | ------------------------------------------------------ |
| Farm          | 8×8 → 18×18 via expansions        | Area, then territory              | Regions beyond the plot (v0.4 exploration)             |
| Workers       | 1 → 5+, rest huts, paths          | Throughput                        | Configurable priorities (v0.2), specialisation (v0.3+) |
| Tools         | Four fixed tools                  | — (fixed)                         | Material tiers via smithing (v0.4), enchants (v1.0)    |
| Buildings     | Four chore-removers               | Chores removed                    | Production buildings (v0.4), civic buildings (v0.3)    |
| Economy       | One market, dynamic prices        | Price mastery                     | Town demand curves, contracts (v0.3)                   |
| Technology    | —                                 | —                                 | Only if a real unlock-tree need emerges (YAGNI)        |
| Town          | —                                 | —                                 | Development stages (v0.3), defense (v1.0)              |
| Relationships | —                                 | —                                 | NPC bonds → recipes, favours, contracts (v0.3)         |
| Combat/Magic  | —                                 | —                                 | Mastery-by-doing, equipment tiers (v1.0)               |
| Automation    | Workers + seed bin + market stall | Fraction of the loop self-running | Logistics, factories (v0.4)                            |

---

## 9. Idle vs active

The vocabulary, so future designs can be precise:

| Term            | Meaning                                                                                 | Canon                         |
| --------------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| **Manual**      | The player performs loop steps by hand (stage 1); actions are instant                   | `GAME_DESIGN.md §8.1`         |
| **Active**      | The player is present and engaged — planning, optimising, or manually working           | `VISION.md §3.2`              |
| **Passive**     | The app runs unattended; the simulation continues identically — there is no "idle mode" | `GAME_DESIGN.md §9.1`         |
| **AFK/offline** | The app is closed; closed-form catch-up on return, capped at 8 h                        | `GAME_DESIGN.md §9.2–9.3`     |
| **Automation**  | Workers and buildings perform loop steps (stages 2–4); earned, priced in capital        | `GAME_DESIGN.md §1.1`, `C-09` |

**When should the player interact?** Whenever they want to — and the game's job is to make the wanting pleasant, never necessary. Designed moments: the glance collect (seconds), the planning session (minutes), the attentive-play edge (`GAME_DESIGN.md §5.1`'s 10% — being present pays a little, by design). **When should the game play itself?** Always, increasingly: from stage 2 onward automation carries more of the loop, and at stage 4 the game genuinely plays itself — which is the product thesis, not a failure of engagement. Player choice between these is priced, never punished (`P-09`).

---

## 10. Feature integration and validation — routed

The feature-integration questions and the loop-validation checklist live in **`CONTENT_RULES.md §3`** — one gate, one owner, cited by every future phase doc. This document's role in that gate is definitional: it is where the loop named in the first checkbox must already exist, or be added _to this taxonomy_ with justification before the feature proceeds.

---

## 11. Expansion strategy

How future systems join this document (compressing `VISION.md §4.1–4.2` + `CONTENT_RULES.md`):

1. **Extend an existing loop before adding one.** Most "new loop" proposals are a missing rung on an existing ladder (`C-03`).
2. **Deeper interactions over new currencies** (`C-14`) **and over bigger numbers** — a new coupling between two existing loops is worth more than either loop growing alone.
3. **Ship in dependency order.** A loop lands only when the loops it couples to exist (`VISION.md §4.1`); the festival loop's chain (seasons + town) is the cautionary example.
4. **Register here first.** A new loop or resource family gets its row in §3/§6 — tier, cycle, couplings, farming pipe — in the same change that designs it. This table is the registry `C-01` checks against.

---

## 12. Summary, weak points, and recommendations

**Summary:** v0.1 ships one primary loop and four secondary loops (worker, inventory, economy, building) plus the meta expansion loop — a complete, closed, idle-honest arc from manual play to automation. Tiers v0.2–v1.0 add fifteen-plus loops, every one coupled back to the farm by output, automation, or ceiling, with the RPG and defense webs explicitly subordinated to the farming core.

Known weak points, recorded now so future sessions inherit the worry and not just the plan:

1. **Crops are single-use in v0.1** (sell only) — `C-07` debt. _Repair:_ animals (feed, v0.2) then cooking (v0.3). No new single-use resources in the meantime.
2. **v0.1 progression terminates.** Once land and workers saturate, sinks are exhausted (`GAME_DESIGN.md §6.4` — no prestige, no reset). Acceptable for v0.1's hours-scale arc; every later tier must ship at least one escalating sink (`C-15`) or the game goes flat at that tier's end.
3. **Achievement/collection loops are the `C-08` risk zone.** They are cheap to add badly. Recommendation: neither ships until it names the capability or access its completion grants.
4. **The festival loop has the longest dependency chain** (seasons → day/night → town → NPCs). Do not promise it before v0.3, and treat it as the integration test of those four systems rather than a feature of its own.
5. **City defense vs the constitution** is the hardest future design in the game (§5): threat and cozy absence-safety pull opposite directions. Recommendation: a dedicated design pass with `VISION.md §2.1/§2.2` as hard constraints _before_ any v1.0 implementation phase touches it.
6. **Single-currency pressure grows with the tiers.** Magic essence will tempt a second currency; `C-14`'s answer (essence is an item) is recorded in §4 and §6.2 — hold that line.
7. **The attentive-play edge is one number** (the 10% auto-sell margin). As automation deepens through v0.4, each new automation layer needs its own small, real reason to occasionally be present, or active play loses meaning and `P-09` collapses into "absence always wins."

---

## 13. Related documents

| Document                     | Relationship                                                          |
| ---------------------------- | --------------------------------------------------------------------- |
| `../GAME_DESIGN.md`          | Owns the v0.1 loops, numbers, and extension points this doc defers to |
| `../VISION.md`               | Owns the three timescales, roadmap tiers, and non-goals               |
| `CONTENT_RULES.md`           | Owns the feature gate (§3) this taxonomy plugs into                   |
| `DESIGN_PRINCIPLES.md`       | The quotable principles (P-nn) the loop constraints cite              |
| `../PLAN.md`                 | Owns scheduling; nothing in this document is a commitment to build    |
| `../assets/LORE_BIBLE.md`    | The fiction hooks the frontier loops (§4–§5) hang from                |
| `../assets/ASSET_CATALOG.md` | Tier tags here align with the production backlog's phases             |
