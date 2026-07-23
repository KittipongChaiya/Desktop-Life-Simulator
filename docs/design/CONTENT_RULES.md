# CONTENT_RULES

> **Status:** Binding on every future gameplay feature. The design counterpart of `docs/assets/STYLE_LOCK.md`.
> **Owns:** The content-design rules (C-01..C-21) and **the feature gate** (§3) — the single pre-implementation checklist every proposed feature must pass. `GAME_LOOPS.md` routes here rather than keeping its own checklist.
> **Does not own:** Product intent and non-goals (`VISION.md`), mechanics and balance numbers (`GAME_DESIGN.md`), the loop taxonomy (`GAME_LOOPS.md`), scheduling (`PLAN.md`), scope enforcement per phase (`AI_RULES.md §3.2`).

## 1. Why this exists

This project plans a hundred phases of content built by sessions with no shared memory. The failure mode is not bad features — it is **plausible features**: each individually reasonable, collectively producing feature creep, duplicate systems, currency sprawl, and a game that no longer fits in a 220 px strip. These rules exist to make that drift detectable at design time, the way `STYLE_LOCK.md` makes visual drift detectable at generation time.

Rules are numbered for citation (`C-07`), like `R-nn` and `P-nn`. Each rule states its justification; most compress a decision `VISION.md` or `GAME_DESIGN.md` already made.

---

## 2. The rules

### 2.1 Connection — nothing stands alone

**C-01 — Every feature improves an existing gameplay loop.** Name the loop (`GAME_LOOPS.md`) before designing the feature. A feature that improves no loop is content without gameplay; a feature that needs a brand-new loop must justify the loop first, against `VISION.md §4`'s roadmap. _Why:_ isolated mechanics are how projects of this shape die (`VISION.md §4.1`).

**C-02 — Every system interacts with at least one other system.** An input from, or an output to, something that already exists — named at design time, not discovered later. _Why:_ interaction is where emergent play comes from; a system with no connections is a minigame wearing the game's clothes.

**C-03 — Reuse before new.** Extend an existing mechanic before inventing a parallel one; new systems attach at the pre-declared extension points in `GAME_DESIGN.md §11`. _Why:_ P-15. _Example:_ NPCs reuse the worker state machine; town demand curves reuse dynamic pricing — both already designed for (`GAME_DESIGN.md §11`).

**C-04 — No duplicate systems.** One owner per job. Before adding a mechanic, check whether an existing system already does the job under another name. _Why:_ the container model is the precedent — a worker's hold, the player inventory, and every storage are the same thing (`GAME_DESIGN.md §4.6`, ADR-011), not three inventory systems.

### 2.2 Purpose — everything earns its place

**C-05 — Every item has a gameplay purpose.** It feeds a loop: consumed, built with, traded, equipped, or chosen as expression. Purpose-as-expression is legitimate (cozy games decorate) but must be honest — the player chooses it; it is not drip-fed as filler. _Why:_ P-08; purposeless items are noise in a glanced-at game.

**C-06 — Every building solves a player problem.** State the problem in one sentence before designing the building. _Why:_ every v0.1 building removes one manual chore (`GAME_DESIGN.md §5`) — that is the bar. A building that is only decoration is scenery, and belongs to the world canon (`docs/assets/WORLD_BIBLE.md`), not the shop.

**C-07 — Every resource wants multiple uses.** A new resource ships with at least two sinks, or names the tier that adds its second. _Why:_ single-use resources make the economy a row of disconnected faucets. _Known debt:_ v0.1 crops have exactly one use (selling) — acknowledged in `GAME_LOOPS.md §12`; animals (feed) and cooking are the planned repairs, and new resources must not add to this debt.

**C-08 — No meaningless collectibles.** A collection must feed a loop — completing it yields capability, access, or knowledge, not a checkmark. _Why:_ collection-for-its-own-sake is retention theater, and retention theater is a dark pattern (`VISION.md §5.1`).

### 2.3 Progression — earned, never extracted

**C-09 — Automation is earned.** Each automation unlock is priced in capital the loop itself produced (`GAME_DESIGN.md §1.1`'s stage gates). _Why:_ P-07 — the arc from playing the loop to owning the machine is the game; giving automation away skips the game.

**C-10 — Grinding is never mandatory.** Repetition must never be the _efficient_ path — patience and investment always outperform manual labour (`GAME_DESIGN.md §3.2`: longer crops pay strictly better). _Why:_ P-02, P-05. Grinding as a _chosen_ active playstyle is fine (P-09); grinding as the meta is a balance bug (`GAME_DESIGN.md §12.2`).

**C-11 — No artificial waiting.** Waiting that pays while absent is the genre; waiting that demands presence, or exists only to be skipped, is forbidden — and waiting sold for money is doubly forbidden (`VISION.md §5.1`). _Test:_ if a timer's absence would make the game strictly better, the timer is artificial.

**C-12 — Every feature answers "what does the absent player get?"** Offline and unattended behaviour is designed, not patched in (`GAME_DESIGN.md §9`'s per-system catch-up contracts are the pattern). _Why:_ P-02 is a constraint on every system, not a feature of some.

### 2.4 Economy

**C-13 — No pay-to-win, no monetized scarcity.** No energy meters, no premium currency, no timers for sale, no dark patterns — permanent non-goal (`VISION.md §5.1`).

**C-14 — Coins are the currency.** A proposed second currency must prove a coin price cannot express it; "it feels more special" is not proof. _Why:_ currency sprawl is complexity with no decisions attached (`GAME_DESIGN.md §6.1` — one currency, integer only). Special resources should be **items** (tradeable for coins) before they are currencies.

**C-15 — Escalating sinks stay ahead of linear sources.** Every tier ships at least one new escalating sink, or progression terminates (`GAME_DESIGN.md §6.4`, §12.3).

### 2.5 Scale and identity

**C-16 — Depth over quantity.** Ten crops that interact with seasons, cooking, and contracts beat forty crops that differ by sprite and price. Content count is never a goal; new _interactions_ per content item is. _Why:_ P-06, P-11 — and asset budgets are real (`docs/assets/ASSET_CATALOG.md`).

**C-17 — Systemic over scripted.** Prefer rules that produce behaviour over authored sequences; script only what systems genuinely cannot express (a first-run tutorial, a festival's opening moment). _Why:_ P-11; `GAME_DESIGN.md §6.2`'s dynamic pricing is the house example — a living market from arithmetic, not a script.

**C-18 — Every feature survives the glance.** It must be legible (or invisible) in the 220 px overlay, and violate no UI rule (`GAME_DESIGN.md §10.1`). _Why:_ P-01, P-04, P-13 — a feature that only works in a fullscreen game belongs to a different product (`VISION.md §5.1`).

### 2.6 Future tiers

**C-19 — RPG systems serve the farm.** Combat, dungeons, magic, and equipment integrate with farming, economy, and crafting — dungeon loot includes farm inputs (rare seeds), magic boosts growth, equipment comes from the economy. RPG progression that _replaces_ farming as the core is wrong (`VISION.md §4.1`: automation before RPG, an economy that can equip you). Every future resource flow must name how it feeds back into farming (`GAME_LOOPS.md §6`).

**C-20 — Combat strengthens existing systems.** Fighting exists to create demand (equipment, food, repairs, defense) and access (regions, resources) — never a parallel game with its own economy. City defense additionally must not violate P-02: raids may never destroy value while the player is absent (`GAME_LOOPS.md §5`).

**C-21 — Multiplayer never invalidates single-player.** If multiplayer ever arrives (deferred, `VISION.md §5.2`), it extends the deterministic simulation v0.1 already paid for (`VISION.md §4.2`) and adds no mechanic that makes solo play worse or obsolete.

---

## 3. The feature gate

_The single pre-implementation checklist. `GAME_LOOPS.md §10` and future phase docs route here; do not fork this list._

Before implementing any new gameplay feature, answer in the feature's phase doc:

- [ ] **Loop:** Which loop does it improve, by name? (`GAME_LOOPS.md`; C-01)
- [ ] **Connections:** Which existing systems feed it or consume it? At least one, named. (C-02)
- [ ] **Decision:** What new player decision does it create? (P-09, P-10)
- [ ] **Absence:** What does the absent player get? What is its offline catch-up contract? (C-12; `GAME_DESIGN.md §9`)
- [ ] **Automation:** Can it be automated later, and how is that automation earned? (C-09)
- [ ] **Economy:** What are its sources and sinks — and do sinks escalate? (C-15) No new currency without C-14 proof.
- [ ] **Reuse:** Which existing mechanism or extension point does it build on? (C-03, C-04; `GAME_DESIGN.md §11`)
- [ ] **Weight:** Is its complexity paid for by the depth it adds? What was cut to keep it small? (C-16)
- [ ] **Glance:** What does it look like in the collapsed bar and the 5-second interaction? (C-18)
- [ ] **Identity:** Does it strengthen the cozy desktop identity, and could it alarm, pressure, or punish? (P-01..P-03; `docs/assets/STYLE_LOCK.md` for anything visible)
- [ ] **Succession:** Does it invalidate any existing system or prior player investment? (C-19..C-21)
- [ ] **Balance:** Does it preserve the stage arc and the coins/sec ordering? (`GAME_DESIGN.md §12`)

A "no" or "unknown" means the design is not ready — resolve it or descope. The completed gate is part of the feature's phase documentation (`AI_RULES.md §3.2` makes phase scope binding).

---

## 4. Worked examples

**Passes — the market stall** (`GAME_DESIGN.md §5.1`): improves the economy loop; connects storage, workers, and pricing; creates the attend-or-automate decision via the 10% tax; the absent player gets auto-sold income at 90%; it _is_ earned automation (1,200 coins); escalating building costs are the sink; reuses the container + pricing systems; one tile, one number in the HUD. Every box ticks.

**Fails — a daily login streak:** improves no loop (C-01); connects to nothing (C-02); creates no decision; _punishes_ absence by design, the exact inversion of P-02; is pure retention theater (C-08, `VISION.md §5.1`). Rejected at the first box.

**Fails until repaired — trophy fish that do nothing:** collection without a loop (C-08), single-use resource (C-07). The repair is systemic, not cosmetic: a collection log that feeds something real (recipes unlocked by first catch, a contract type, a knowledge bonus) — at which point it passes as part of the fishing loop (`GAME_LOOPS.md §3`).

---

## 5. Related documents

| Document                  | Relationship                                                 |
| ------------------------- | ------------------------------------------------------------ |
| `DESIGN_PRINCIPLES.md`    | The principles (P-nn) these rules operationalize             |
| `GAME_LOOPS.md`           | The loop taxonomy C-01 names; routes its validation here     |
| `../VISION.md`            | Non-goals and philosophy; wins every conflict                |
| `../GAME_DESIGN.md`       | Mechanics, numbers, balance rules the examples cite          |
| `../AI_RULES.md`          | Makes phase scope (and thus the completed gate) binding      |
| `../assets/STYLE_LOCK.md` | The visual counterpart; governs anything the feature renders |
