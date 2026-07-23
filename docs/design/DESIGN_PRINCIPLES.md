# DESIGN_PRINCIPLES

> **Status:** The citation-friendly digest of the project's design philosophy. Consult before proposing any gameplay system or architectural change.
> **Owns:** The memorable principle list (P-01..P-17) — short names, rationale, and practical examples that make the philosophy quotable in reviews and phase docs.
> **Does not own:** The philosophy itself. Product intent and the binding five principles live in `VISION.md §2`; mechanics and numbers in `GAME_DESIGN.md`; visual rules in `docs/assets/STYLE_LOCK.md`. If this document and `VISION.md` ever disagree, **this document is wrong** — fix it here.

The source directive asked for "the highest-level design authority for the entire project." That authority already exists: `VISION.md` is authoritative and self-declares that changes there ripple everywhere. Duplicating it would create the two-owners problem this documentation set exists to prevent. So this document is the **digest**: every principle below distills a decision `VISION.md` or `GAME_DESIGN.md` already made, names it memorably, and cites its source. New authority: none. New usefulness: a future session can write "violates P-02" in a review and everyone knows exactly what that means.

---

## 1. How to use this document

1. **Before proposing a feature or system**, read the principles and note which ones the proposal touches. The feature gate in `CONTENT_RULES.md §3` will ask.
2. **In reviews and phase docs**, cite principles by number (`P-07`) the way visual reviews cite `STYLE_LOCK.md` rules (`R-03`).
3. **In a dispute**, this document never wins on its own — follow the citation to the owner (`VISION.md §2`'s principles resolve disputes in listed order) and argue there.

---

## 2. The principles

### The player's day (product principles)

**P-01 — The Game Is the Guest.**
The player's real work is the host; the game never steals focus, never interrupts, never demands. _Why:_ this is the product's founding constraint, and it overrides gameplay ambition (`VISION.md §2.1`). _In practice:_ no modals, no OS notifications, no focus stealing — and any feature that "just needs the player to look at it" is rejected at design time.

**P-02 — Reward Absence, Never Punish It.**
Every system produces value while the player is away; returning feels like collecting a gift, not triaging a crisis. _Why:_ an idle game that requires attention is a game with a bad UI (`VISION.md §2.2`). _In practice:_ crops wait when mature, workers idle gracefully, a full inventory blocks a harvest instead of discarding it (`GAME_DESIGN.md §7`), and longer crops pay strictly better coins-per-second (`GAME_DESIGN.md §3.2`).

**P-03 — Nothing Is Ever Urgent.**
No mechanic may create time pressure, and nothing routine is ever alarming. _Why:_ urgency is what this product must not create (`VISION.md §5.1` — no twitch gameplay; `GAME_DESIGN.md §10.1` — no countdowns, no red). _In practice:_ progress renders as growth stages and bars, never ticking clocks; the only permitted decay (tilled soil reverting) costs seconds of work, never goods.

**P-04 — Five Seconds Is a Session.**
The most common interaction — notice, click once, feel progress, return to work — must be complete in under five seconds. _Why:_ the glance loop is the loop that actually happens, dozens of times a day, so it must feel best (`VISION.md §3.1`). _In practice:_ one click to the common action (`GAME_DESIGN.md §10.1`), and every new feature must answer "what does this look like in a glance?" before it ships.

**P-05 — Respect the Player's Time.**
No grinding, no artificial waiting, no monetized impatience — the game's time mechanics exist to respect absence, never to exploit it. _Why:_ `VISION.md §5.1` forbids pay-to-win and free-to-play shapes outright. _In practice:_ patience is priced in coins (`GAME_DESIGN.md §3.2` — progression is _affording patience_), never in repetitive labour or a second premium currency.

### The game (design principles)

**P-06 — Small Surface, Deep Interior.**
The visible interface stays tiny; the systems behind it may be arbitrarily deep. _Why:_ this is what lets the roadmap grow for years inside a 220 px strip (`VISION.md §2.3`). _In practice:_ a player who wants one number sees one number; a player who wants to optimize a supply chain opens a panel. "Easy to learn, hard to master" is this principle read from the player's side.

**P-07 — Automation Is Progress.**
The game's core arc is the transition from performing the loop to designing the machine that performs it. _Why:_ hiring the first worker is v0.1's critical transition, and every later tier builds on it (`VISION.md §3.4`; `GAME_DESIGN.md §1.1`). _In practice:_ automation is always earned (stage gates priced in capital), and each automation unlock removes a chore, never the game.

**P-08 — Everything Has a Purpose.**
Every item feeds a loop, every building solves a player problem, every resource wants more than one use. _Why:_ purposeless content is inventory noise, and noise is fatal in a glanced-at game. _In practice:_ each v0.1 building removes one manual chore (`GAME_DESIGN.md §5`) — that table is the proof pattern every future building must match. The binding rules are `CONTENT_RULES.md C-05..C-08`.

**P-09 — Every Playstyle Wins.**
Checking in constantly and vanishing for a day are both legitimate strategies; the game prices the difference, it never punishes the choice. _Why:_ player freedom in an idle game means freedom of attention. _In practice:_ the market stall's 10% auto-sell tax gives the attentive player a small real edge while the absent player still earns 90% of optimal (`GAME_DESIGN.md §5.1`, §3.2).

**P-10 — Always a Next Bottleneck.**
Each unlock relieves one bottleneck and exposes the next; the player is always working toward something specific and always slightly short of it. _Why:_ this is the loop that produces retention (`VISION.md §3.3`). _In practice:_ escalating sinks against linear sources (`GAME_DESIGN.md §6.4`), and land competing with workers for the same coins — neither right on its own.

**P-11 — Systemic, Small, Connected.**
Prefer small features that connect to existing systems over large features that stand alone; prefer emergent behaviour over scripts. _Why:_ systems built out of order have nothing to connect to — the most common failure mode for projects this shape (`VISION.md §4.1`). _In practice:_ dynamic pricing makes the market feel alive with ~ten lines of arithmetic and no script (`GAME_DESIGN.md §6.2`); that is the model.

**P-12 — A Living World.**
The world should visibly live — grow, change, and act — without needing the player. _Why:_ "a living little world at the bottom of your screen" is the one-sentence vision itself (`VISION.md §1`), and v0.2's entire theme (`VISION.md §4`). _In practice:_ workers visibly do their jobs; crops visibly grow; future seasons, weather, and NPCs change the world on their own schedule — all of it glanceable, none of it demanding.

### The craft (engineering & consistency principles)

**P-13 — Readable at a Glance.**
High contrast, few numbers, peripheral legibility — the player is reading while doing something else. _Why:_ `GAME_DESIGN.md §10.1`. _In practice:_ the collapsed bar shows exactly three numbers; the visual canon's attention hierarchy (`docs/assets/VISUAL_REFERENCE.md §3`) exists to serve this read.

**P-14 — Performance Is a Feature.**
Idle CPU and memory are product features, not optimizations. _Why:_ a beautiful game that makes the fan spin is a failed game (`VISION.md §2.1`). _In practice:_ the budgets in `PERFORMANCE.md` are gates, not goals; collapsed mode destroys the renderer entirely. A feature that cannot meet the idle budget is not ready, whatever else it does.

**P-15 — Expand, Don't Rewrite.**
Future systems attach at pre-declared extension points; v0.1 pays only the forward-looking costs that are cheap now and expensive to retrofit. _Why:_ `VISION.md §4.2` bounds exactly which future costs v0.1 pays; everything else is explicitly not paid for. _In practice:_ `GAME_DESIGN.md §11` names where each future system attaches — a proposal that requires rewriting an existing system to attach is wrong by default.

**P-16 — Consistency Above Novelty.**
A new asset, mechanic, or doc that is individually brilliant but inconsistent with the canon is worse than a plain one that belongs. _Why:_ hundreds of assets and features authored by sessions with no shared memory must read as one world — the reason `docs/assets/` exists at all (`docs/assets/README.md`). _In practice:_ `STYLE_LOCK.md` wins over any generation request; this document and `CONTENT_RULES.md` play the same role for design.

**P-17 — Build for the Session After Next.**
Every decision assumes an AI agent with no memory of this conversation extends it six months from now. _Why:_ `VISION.md §2.5`; success criterion 4 (`VISION.md §6`) makes it measurable. _In practice:_ decisions are written down, invariants are enforced by tooling, ownership is declared in every doc header — and mod-friendliness falls out for free, because namespaced IDs and content registries (`VISION.md §4.2`) serve plugins and future sessions alike.

---

## 3. Where each suggested principle landed

The source directive (`fix/0.1/5.5Assets F.md`) suggested ~26 principle names. All are covered; overlapping names were merged so each principle has one home (no duplicate systems — `CONTENT_RULES.md C-04` applies to docs too):

| Directive name                                  | Landed in                                                |
| ----------------------------------------------- | -------------------------------------------------------- |
| Cozy First                                      | P-01, P-03 (product); the visual canon (`ART_DIRECTION`) |
| Player Freedom                                  | P-09                                                     |
| Idle Friendly                                   | P-02                                                     |
| Desktop Friendly                                | P-01                                                     |
| One-Hand Friendly                               | P-04                                                     |
| Easy to Learn / Hard to Master                  | P-06                                                     |
| Relaxation Over Stress                          | P-03                                                     |
| Respect Player Time                             | P-05                                                     |
| Automation Is Progress                          | P-07                                                     |
| Living World                                    | P-12                                                     |
| Everything Has Purpose / No Busywork            | P-08                                                     |
| Meaningful Progression                          | P-10                                                     |
| Meaningful Choices                              | P-09, P-10                                               |
| Visual Clarity / Readable UI                    | P-13                                                     |
| Scalable Architecture                           | P-15, P-17                                               |
| Modding Friendly                                | P-17 (via `VISION.md §4.2`'s paid costs)                 |
| AI-Friendly Development                         | P-17                                                     |
| Systemic Gameplay / Small Features That Connect | P-11                                                     |
| Future-Proof Design / Expand, Don't Rewrite     | P-15                                                     |
| Performance First                               | P-14                                                     |
| Consistency Above Novelty                       | P-16                                                     |

---

## 4. Related documents

| Document                  | Relationship                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| `../VISION.md`            | The authority these principles distill; wins every conflict      |
| `../GAME_DESIGN.md`       | The mechanics and numbers the examples cite                      |
| `CONTENT_RULES.md`        | Turns these principles into binding rules and the feature gate   |
| `GAME_LOOPS.md`           | The loop taxonomy P-07..P-11 operate on                          |
| `../assets/STYLE_LOCK.md` | The visual counterpart: numbered, citable, immutable rules       |
| `../PLAN.md`              | Where accepted features are scheduled (this doc never schedules) |
