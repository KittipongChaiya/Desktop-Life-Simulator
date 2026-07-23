# ADR-013: The Economic Simulation

|                   |                                               |
| ----------------- | --------------------------------------------- |
| **Status**        | Accepted                                      |
| **Date**          | 2026-07-23                                    |
| **Deciders**      | Project owner, lead economy design (this ADR) |
| **Supersedes**    | —                                             |
| **Superseded by** | —                                             |

> The canonical authority for every economy-related feature, phase-06 through v1.0+. Authored under the foundation freeze (ADR-012) as the sanctioned mechanism for a new foundational decision. This ADR defines **architecture only** — mechanisms, numbers, and content stay with their owners (`GAME_DESIGN.md §6` for v0.1 values, the registries for data); it does not duplicate them.

---

## Context

**Where the project stands.** Phases 00–05 shipped the world, crops, the command model, worker AI, and the container model; phase-05.5/05.6 locked and production-validated the creative canon. Phase-06 opens the economy (`PLAN.md §2.1`: coins, dynamic pricing, shop, land expansion, buildings — delivering **Stage 4, the full idle loop**).

**The current loop and why an economy is required.** The primary loop (`GAME_DESIGN.md §1`) is coins → seeds → crops → coins → workers/buildings/land → more crops. Everything upstream of "→ coins" exists; nothing downstream does. Until money enters, harvests accumulate meaninglessly and the stage arc (`§1.1`: manual → delegation → automation → idle, gated at 100 → 150 → 500–700 → 1,200 coins) cannot be climbed. The economy is the loop's closing arc, and the product thesis — _going away is optimal_ — is only testable once income exists to measure.

**Problems this architecture must solve:**

1. **One model for a dozen future systems.** Crafting, NPCs, trading, factories, dungeons, and possibly multiplayer (`VISION.md §4`, `GAME_LOOPS.md §6.2`) will each touch money and goods. If each invents its own representation, the result is the incompatible-web failure ADR-011 was written to prevent — now with money involved.
2. **Idle and active must both be honest.** Absence must pay (`VISION.md §2.2`), attention must matter a little (`GAME_DESIGN.md §5.1`), and neither may invalidate the other.
3. **Exploit resistance without policing.** A deterministic, offline-progressing single-player sim cannot rely on server authority; safety must come from structure.
4. **Cozy predictability under a living surface.** Prices the player memorizes must stay true; a market that never moves is dead (`C-17`).
5. **Expansion without redesign.** Every family in `GAME_LOOPS.md §6.2` (animals v0.2 through dungeon finds v1.0) must slot in as data and declarations, never as new economic machinery.

**Bound by (frozen, not re-litigated):** ADR-010 (commands are the only write path), ADR-011 (resources are conserved container-owned quantities with declared sources/sinks), ADR-007 §7 (integers only), `CONTENT_RULES.md` C-13..C-15 (no monetization, one currency, escalating sinks), `VISION.md §2.2` (reward absence).

---

## Decision

**The economy is ADR-011 extended to money. Coins are a conserved integer resource in an owner-tagged container (the wallet). All economic activity reduces to three primitives — transfer, conversion, boundary event — executed as commands. Money is created and destroyed only at entries in a declared source/sink registry. Prices are content-defined bases passed through a bounded, deterministic modifier pipeline. The market is a boundary, never an agent.**

### 1. Money is a resource, not a system

Coins are an integer quantity held in the **wallet** — a container like any other (`ARCHITECTURE.md` already names it one). No parallel money code path exists: earning is a transfer in, spending a transfer out, and both are atomic commands (ADR-010). Everything ADR-011 guarantees for goods — conservation, single ownership, no free-standing value, save-format simplicity — is thereby inherited by money for free.

### 2. Currency model

- **One currency: coins** (`GAME_DESIGN.md §6.1`, `C-14`). A proposed second currency must pass C-14's proof; until then, special resources are _items_ priced in coins (the `C-14` essence precedent, `GAME_LOOPS.md §6.2`).
- **Premium currency is permanently forbidden** — architecture, not just policy (`C-13`, `VISION.md §5.1`). No future tier, event, or platform port may introduce one; this line is not revisitable without superseding this ADR _and_ the vision.

### 3. The source/sink registry

Money enters and leaves the world **only** at declared registry entries (the ADR-011 mechanism, applied to coins):

- **v0.1 registry** — canonical in `GAME_DESIGN.md §6.4`: sources = crop sales + starting capital; sinks = seeds (recurring), workers (escalating), buildings (one-time), land (escalating, ×1.8).
- **Future entries** — quest rewards (v0.3), NPC rewards (v0.3), dungeon rewards (v1.0); sinks: tool upgrades, decorations, transportation, town upgrades, maintenance, salaries — each arrives as _a new registry entry_, reviewed by the `CONTENT_RULES.md §3` gate's economy box, never as an inline mutation.
- **Invariant (C-15, architectural):** every tier ships at least one escalating sink; sink growth stays ahead of source growth, or the tier is unfinished.
- **Passive production produces goods, never coins.** No building, worker, or charm mints money directly; income always passes through a sale or reward boundary. This single rule is most of the inflation control (§12).

### 4. Pricing: content base × bounded modifier pipeline

`price = floor(basePrice × Π bounded modifiers)`

- **`basePrice` is content data** in the item registry (ADR-004 §5) — stable, memorizable, rebalanced by data edit.
- **Modifiers are deterministic, per-declared, and bounded.** Each has a floor, a cap, and a tick-derived recovery rule. v0.1 ships exactly one: the per-item `priceMultiplier` (`GAME_DESIGN.md §6.2`, band [0.50, 1.00], recovery +0.005/20 t).
- **Future pricing features are new modifiers in the same pipeline,** never new pipelines: regional pricing (v0.3+) = a per-region modifier; supply & demand (v0.3+) = the existing multiplier's band and curve deepened into demand curves (`GAME_DESIGN.md §11` anticipates exactly this); contracts and events = temporary declared modifiers.
- **The predictability guarantee:** the effective price can never leave the product of the declared bands. A player who knows the base price always knows the worst and best case. Cozy is a bound, not a vibe.

### 5. The market is a boundary, not an agent

- **NPC buying is an infinite-liquidity sink** at the pipeline price. No simulated NPC wallets, needs, or stock in the core — a "market" is arithmetic at a declared boundary. (Future NPC shops may _present_ personality over that arithmetic; the books stay boundary math.)
- **Player selling:** manual sale at the pipeline price; the market stall auto-sells at 90% (`GAME_DESIGN.md §5.1`).
- **The attentive-edge bound (architectural invariant):** the stall's 10% tax is the canonical width of the attention premium. Across all future features combined, optimal active play may outperform pure idle play by a _bounded, small_ margin of this order — never by multiples (`GAME_LOOPS.md §12`'s "lone 10% edge", `VISION.md §2.2`). Any feature that widens the gap materially fails the gate.
- **Future player trading (v0.3+ NPC contracts, later players):** an atomic escrowed swap — two transfers executed as one command — built entirely from existing primitives. An auction house is a queue of such swaps. No new value representation, ever.

### 6. Offline income

- **Derived, not accumulated,** wherever possible (ADR-009 §2's exact-growth precedent). The per-system catch-up contracts are canonical in `GAME_DESIGN.md §9`: multipliers recover exactly; auto-sell applies to catch-up harvests at recovered prices; the away-summary reports coins earned and what blocked progress.
- **Simulation limits:** catch-up cost is bounded by the contracts themselves (closed-form derivation, no tick-replay of absent time); any contract that cannot be computed closed-form must declare its error bound (the moisture ≤ 5% precedent).
- **Anti-exploit safeguards are structural, not detective:** (a) integer conservation + command validation makes duplication impossible by construction; (b) offline progress is _the intended game_ — advancing the clock earns what waiting earns, so there is nothing to exploit, and clock manipulation is explicitly not treated as cheating in a single-player game; (c) price recovery is tick-derived from persisted state, so save/reload cannot reset a dumped market; (d) the registry is the complete audit surface — a conservation test can verify that no command changes total value except at declared entries (§Final Review).

### 7. The three primitives

Every economic mechanic present or future is one of:

| Primitive          | Definition                                                           | Covers                                                                     |
| ------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Transfer**       | Atomic stack movement between two containers (ADR-011 §3)            | Carrying, depositing, storage, gifting, trading legs                       |
| **Conversion**     | Atomic consume-inputs-produce-outputs at a declared conversion point | Crafting, cooking, smelting, processing, factory steps — all one primitive |
| **Boundary event** | Creation/destruction at a source/sink registry entry                 | Sales, purchases, rewards, maintenance, losses                             |

Production is conversion (or growth, already owned by ADR-009); consumption is conversion or a sink; trading is paired transfers; **losses and maintenance are declared sinks** — and, constitutionally, no loss may destroy value while the player is absent (`VISION.md §2.2`; the blocked-not-discarded inventory rule, `GAME_DESIGN.md §7`, is the template). A mechanic that fits none of the three primitives requires a successor ADR before implementation.

### 8. Worker economy

- **Hiring** is the escalating sink it already is (`GAME_DESIGN.md §1.1`). **v0.1 running cost is zero coins** — energy/rest is the operating cost, by design.
- **Future salaries** (if a tier adopts them) are a recurring boundary sink with an absence guarantee: a farm that cannot cover salaries idles its workers; it never goes negative and never liquidates assets while unattended.
- **Efficiency, happiness, specialization** (future) are data modifiers on production rates — they change how fast goods appear, never how money moves. They are worker-system features, not economy architecture.

### 9. Item categories

Categories — raw materials, processed goods, crafted goods, luxury goods, quest items, equipment, collectibles, future legendary — are **registry tags** (ADR-004 §5) that pricing, sinks, and UI read. They are data, never code branches; adding a category is a content change. `C-05` (every item has a purpose) and `C-08` (no meaningless collectibles) gate what may carry a tag at all.

### 10. Inventory economics

Fixed already; cited, not restated: stacks, slots, capacity, and blocked-not-discarded overflow are `GAME_DESIGN.md §7` under ADR-011. Storage expansion is an escalating building sink; future warehouses are larger containers of the same type. Nothing here is new architecture.

### 11. Progression

The stage arc (`GAME_DESIGN.md §1.1`) is the progression spine: **early** = manual sales fund the first worker; **mid** = delegation funds automation buildings; **late** = the stall closes the idle loop; **end (v0.1)** = land and workers saturate and progression _terminates by design_ (`GAME_LOOPS.md §12.2`) — v0.1's arc is hours-scale, and each later tier re-opens the ceiling with its mandatory escalating sink (C-15). The strategic content is the land-vs-workers tension (`GAME_DESIGN.md §6.3`): ceiling versus throughput, competing for the same coins.

### 12. Inflation strategy

**Inflation exists as pressure and is structurally contained; there is no price inflation.**

- Base prices never move — they are content data. The one v0.1 modifier is _deflation-only_ under supply pressure (band capped at 1.00), so dumping is self-limiting and prices recover to the memorized value.
- Wealth accumulation is real (sources run while absent) and is absorbed by geometrically escalating sinks (land ×1.8 is the template; C-15 generalizes it per tier).
- **Money never earns money:** no interest, no coin-producing assets (§3). The wealth curve is bounded by the goods the farm can grow and sell, which land/worker sinks gate.
- If a tier's wealth outruns its sinks, the fix is that tier's missing sink — never a global price rebase, which would break every memorized number and punish savers.

### 13. Balancing philosophy (constraints on every future economy feature)

1. **Patience outperforms grinding, always** (`C-10`; the coins/sec ordering of `GAME_DESIGN.md §3.2/§12.2` is load-bearing and must be preserved).
2. **The absent player earns ≥ ~90% of optimal** (§5's attentive-edge bound).
3. **Planning is rewarded systemically** — crop diversity via multiplier arithmetic, land-vs-worker allocation — never via bonus labels (`C-17`).
4. **Automation is earned in capital the loop produced** (`C-09`) and never given away.
5. **No mandatory optimization:** the game is completable at every tier by a player who never reads a wiki; optimal play is a hobby, not a requirement (`DESIGN_PRINCIPLES.md`).

### 14. Future expansion map

| Future system          | Arrives as                                                                                      | New architecture needed                             |
| ---------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| NPC shops (v0.3)       | Boundary endpoints with their own modifier sets and registry entries                            | None                                                |
| Trade routes (v0.3+)   | Regional modifiers + a transportation sink                                                      | None                                                |
| Crafting (v0.4)        | Conversion points + processed/crafted price bases                                               | None                                                |
| Factory (v0.4)         | Chained conversions with container buffers (`GAME_LOOPS.md §6.2`)                               | None                                                |
| Auction house (future) | Queued escrowed swaps (§5)                                                                      | None                                                |
| Guild/multiplayer      | **Optional**; trades cross an explicit audited boundary pair; the local sim stays authoritative | Successor ADR for the netcode, none for the economy |
| Live events (future)   | Temporary declared modifiers/sources — never premium, never FOMO-priced (`C-11`, `C-13`)        | None                                                |

---

## Alternatives Considered

| Model                  | Description                                                                | Verdict                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fixed economy**      | Static prices, no market state                                             | Maximum predictability, zero life; the canon already ships the multiplier, and `C-17` prefers systemic aliveness. Rejected.                                                           |
| **Dynamic economy**    | Endogenous prices from open-ended supply/demand feedback                   | Alive but illegible, tuning-fragile, and exploit-prone; unbounded prices violate the predictability guarantee (§4). Rejected.                                                         |
| **Simulation economy** | NPC agents with wallets, needs, and stock                                  | The deepest option and the most expensive: perf, testing, determinism, and drift across memory-less sessions. Rejected for the core; may return as _presentation_ over boundary math. |
| **Regional economy**   | Per-region markets as the primary structure                                | Premature before towns exist (v0.3); reserved as a modifier class inside the pipeline instead. Deferred.                                                                              |
| **Hybrid (chosen)**    | Content-data bases × bounded deterministic modifiers × declared boundaries | Predictable core, living surface, three primitives, every future family lands as data. Chosen.                                                                                        |

---

## Trade-offs

- **Complexity:** three primitives and one registry — deliberately less machinery than the systems it serves. The cost is discipline (declaring, not hacking), which the `CONTENT_RULES.md §3` gate already collects.
- **Performance:** sale-time arithmetic and per-item multiplier recovery; no agent simulation, no market ticks beyond recovery. Fits `PERFORMANCE.md` idle budgets by construction.
- **Maintainability:** the registry is the single audit surface; a conservation test covers the whole economy at once.
- **Scalability:** ten future families (`GAME_LOOPS.md §6.2`) each reduce to tags, bases, conversion points, and registry entries.
- **Player experience:** prices are learnable and stable; the market moves visibly but boundedly. The deliberate sacrifice: no scarcity drama, no speculation gameplay — this is a cozy farm, not a trading sim.
- **AI-assisted development:** the invariants (three primitives, declared boundaries, bounded modifiers, the attentive-edge bound) are short enough for every future memory-less session to hold — this ADR is to the economy what `STYLE_LOCK.md` is to art.

---

## Consequences

**Positive:** the loop closes and Stage 4 becomes reachable; money inherits every container guarantee for free; exploits are structurally impossible rather than patched; every future economy feature has a one-paragraph answer to "where does this fit"; the vision's non-monetization stance is load-bearing architecture.

**Known limitations:** the market has no memory of _who_ or _where_ until regional modifiers arrive; NPC economic personality is presentational; v0.1 progression terminates when sinks saturate (accepted, `GAME_LOOPS.md §12.2`).

**Technical implications:** phase-06 implements the wallet container, the sell/buy/expand commands, per-item multiplier state in the save (persisted per `GAME_DESIGN.md §6.2`; schema home `SAVE_FORMAT.md`), the price pipeline, and the §6.4 registry — all inside existing ADR-010/011 machinery.

**Migration strategy:** deepening ships as new modifiers, conversion points, and registry entries (data). Only two futures require a successor ADR: a fourth primitive, or networked trading. Nothing else re-opens this decision.

---

## Final Review

**Summary.** One currency in one container model; three primitives; a declared source/sink registry; content-defined base prices under a bounded deterministic modifier pipeline; the market as an agent-less boundary; offline income by exact derivation; inflation contained by escalating sinks and the no-money-from-money rule; the attentive edge bounded at the stall's 10% precedent.

**Architectural risks:**

1. **Sink-escalation discipline is procedural, not mechanical** — C-15 relies on the gate being run every tier. Mitigation: the gate's economy checkbox names this ADR.
2. **The multiplier may over-tax large idle harvests** — a long-absent player's stall dumps everything at once. `GAME_DESIGN.md §9` recovers prices during catch-up, which should neutralize this; it must be _verified_, not assumed (checkpoint 4).
3. **The attentive-edge bound erodes by accumulation** — each small active-play bonus is individually harmless. Mitigation: the bound is audited per tier, not per feature.

**Validation checkpoints for phase-06:**

1. **Conservation property test:** no command changes total value (coins + goods at base valuation) except declared registry entries.
2. **Determinism/replay:** identical command streams produce identical wallets and multipliers, including across save/load and offline catch-up.
3. **The §6.2 arithmetic test:** the 100-wheat dump lands at 0.80× and recovers in ~40 s of ticks, exactly.
4. **The absent-player E2E:** hours-scale offline run with a stall earns ≥ 90% of the attended equivalent, and the away-summary reports it.
5. **The stage-arc pacing check:** 100 → 150 → 500–700 → 1,200 coins arrive on the `GAME_DESIGN.md §1.1` timescales in live play.

**Assumptions to verify before coding:**

- The wallet container does not yet exist in `src/` (phase-05 built goods containers; coins were never needed) — confirm, and confirm `SAVE_FORMAT.md`'s wallet sketch matches the container shape.
- Starting capital (100 coins) enters as a declared source at world creation, not as initialized state.
- Per-item multiplier state has a save-format home and a catch-up contract entry (`GAME_DESIGN.md §9` row exists; schema does not yet).
- The shop/buy UI surface fits the 220 px overlay rules (`GAME_DESIGN.md §10`) without a modal.

---

## Cross References

| Document                                       | Relationship                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| ADR-011                                        | The container/conservation model this ADR extends to money            |
| ADR-010                                        | Commands — the only write path money moves through                    |
| ADR-009 §2, ADR-002                            | Derived offline progress the income rules inherit                     |
| ADR-004 §5                                     | Registries — where bases, tags, and categories live                   |
| ADR-012                                        | The freeze this ADR is authored under                                 |
| `GAME_DESIGN.md §1, §3, §5, §6, §7, §9`        | The v0.1 numbers and mechanisms (owner; this ADR never restates them) |
| `GAME_LOOPS.md §6, §12` (frozen)               | Resource families, the C-19 farm pipes, and the inherited weak points |
| `CONTENT_RULES.md C-05..C-15, §3` (frozen)     | The per-feature gate that enforces this ADR's invariants              |
| `DESIGN_PRINCIPLES.md`, `VISION.md §2.2, §5.1` | The product constraints (reward absence; never monetize)              |
| `ARCHITECTURE.md`, `SAVE_FORMAT.md`            | Wallet-as-container; persistence homes                                |
