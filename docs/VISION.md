# VISION

> **Status:** Authoritative. Changes here ripple into every other document.
> **Owns:** Product intent, design philosophy, core loop, long-term direction, non-goals.
> **Does not own:** Mechanics tuning (`GAME_DESIGN.md`), roadmap dates (`PLAN.md`).

---

## 1. The One-Sentence Vision

**A living little world that lives at the bottom of your screen while you get on with your day.**

Desktop Life Simulator is an idle life-simulation game that runs as a slim overlay docked to the bottom edge of Windows. It is designed to be _glanced at_, not stared at. The player tends a farm, directs workers, and grows an economy in the gaps between real work — a few seconds at a time, dozens of times a day.

---

## 2. Design Philosophy

These five principles resolve disputes. When a design decision is ambiguous, the principle listed first wins.

### 2.1 The Desktop Comes First

The player's actual work is the priority; the game is the guest. This is not a slogan — it is a hard constraint that overrides gameplay ambition:

- The overlay must never steal focus, never raise itself over a fullscreen application, and never interrupt with modal dialogs.
- The game must be collapsible to a thin status bar with a single click, and must survive being ignored for days.
- Presence is the player's dial, not the game's: opacity is adjustable, hiding is instant, the overlay can be made mouse-inert, and a work mode strips it to its living world — all while the simulation runs on (ADR-014). The overlay sits on top of the workspace without ever interrupting it — never focused, never in the way; the presence dials, not z-order, are how the player turns it down. _(Phase-01.8 briefly inverted this to behind-normal-windows; the 2026-07-23 livability verdict restored always-on-top — a covered game turned out to be a forgotten game.)_
- Idle CPU and memory consumption are **features**, not optimizations. A beautiful game that makes the fan spin is a failed game. See `PERFORMANCE.md` for the enforced budgets.
- Nothing in the game may ever be time-critical in a way that punishes the player for doing their job. There are no failure states driven by inattention.

### 2.2 Reward Absence, Don't Punish It

An idle game that requires attention is just a game with a bad UI. Every system must produce value while the player is away, and the return-to-game moment should feel like collecting a gift, not triaging a crisis.

- Crops do not wither from neglect in v0.1. Growth completes and waits.
- Workers idle gracefully when out of tasks; they never deadlock or destroy value.
- Offline progress is computed on load and presented as a clear, readable summary.

### 2.3 Small Surface, Deep Interior

The visible interface stays tiny. The systems behind it may be arbitrarily deep. A player who wants to look at one number sees one number; a player who wants to optimize a supply chain can open a panel and do so.

This is what makes the long-term roadmap possible without the overlay ever growing.

### 2.4 Simulation Is the Source of Truth

The simulation is a pure, deterministic, headless model. Rendering and UI are _views_ of it and may be destroyed and rebuilt at any moment without affecting game state.

This separation is non-negotiable and is enforced mechanically (`ARCHITECTURE.md` §Boundaries). It is what makes the game testable, savable, moddable, and — eventually — networkable.

### 2.5 Build for the Session After Next

Every architectural decision assumes an AI agent with no memory of this conversation will extend it six months from now. Decisions are written down (`docs/decisions/`), invariants are enforced by tooling rather than convention, and "obvious" context is made explicit.

---

## 3. Core Gameplay Loop

The loop operates at three nested timescales. All three must be satisfying independently.

### 3.1 The Glance Loop — seconds, dozens of times a day

```
Notice something changed  →  Click once  →  Feel progress  →  Return to work
```

The player's eye catches a crop finishing or a coin counter ticking up. One click collects, plants, or assigns. Total interaction time: **under five seconds.** This is the loop that must feel best, because it is the loop that actually happens.

### 3.2 The Session Loop — minutes, a few times a day

```
Expand overlay  →  Review what accumulated  →  Spend currency  →  Re-plan worker assignments  →  Collapse
```

The player opens the full panel during a break. They harvest, sell, buy a new plot or a new worker, adjust priorities, and collapse it again. Total interaction time: **one to three minutes.**

### 3.3 The Progression Loop — days to weeks

```
Accumulate capital  →  Unlock capability  →  Raise throughput ceiling  →  Face a new bottleneck
```

Each unlock should relieve one bottleneck and expose the next. The player is always working toward something specific and always slightly short of it. This is the loop that produces retention.

### 3.4 The v0.1 Loop, Concretely

```
        ┌──────────────────────────────────────────────┐
        │                                              │
        ▼                                              │
   Till a tile ──► Plant a seed ──► Crop grows ────► Harvest
                        ▲            (real time,          │
                        │             offline-safe)       │
                        │                                 ▼
                   Buy seeds ◄── Spend coins ◄──── Sell produce
                        │                                 │
                        │                                 ▼
                        └──────── Hire worker ──► Worker automates
                                                   till/plant/harvest
```

The critical transition is **hiring the first worker**: the moment the player stops performing the loop and starts _designing_ it. Everything in v0.1 builds toward that moment, and everything after v0.1 builds on top of it.

---

## 4. Long-Term Direction

The overlay is a permanent constraint. The world behind it is not.

| Horizon  | Theme                    | What it adds                                                                                              |
| -------- | ------------------------ | --------------------------------------------------------------------------------------------------------- |
| **v0.1** | Farm & Overlay           | The loop above. Proves the overlay is livable.                                                            |
| **v0.2** | A Living World           | Seasons, weather, day/night, audio, and the plugin loader. The world starts changing on its own.          |
| **v0.3** | Town & Trade             | NPCs, a settlement, contracts, and a market that moves. The player gains neighbours.                      |
| **v0.4** | Automation & Exploration | Factories, logistics, and a map beyond the farm. The player gains reach.                                  |
| **v0.5** | The Playable Cut         | The systems stop being systems and become a game. Nothing new is simulated; everything is finished.       |
| **v0.6** | The Second Day           | Content depth. The game acquires a reason to still be open tomorrow, and a build that can reach a player. |
| **v1.0** | Full Life Simulator      | RPG progression, dungeons, bosses, city defense, and a mature mod ecosystem. The player gains a life.     |

Detailed milestones and success criteria: `PLAN.md`.

**v0.5 and v0.6 were both inserted after v0.4 shipped**, and this table is where
that is authorised — `PLAN.md` §9.3 requires it, because `PLAN.md` implements
this roadmap rather than defining it.

**v0.5's row was added late, at the opening of v0.6.** The rule was not followed
when v0.5 opened: the version was scoped, built and released as a candidate
while this table still showed v0.4 handing straight to v1.0. Recorded here
rather than backdated, because a process rule that gets quietly repaired the
next time it is remembered is not a rule. What it cost was nothing this time and
the reason to keep it is unchanged: a version tier is product direction, and
product direction lives in this document.

### 4.0a Why v0.6 exists

v0.5 finished the game's surfaces. It did not — and was bindingly not allowed
to — add anything for the player to do, and at its close the whole of the game's
content was **4 crops, 6 purchasable buildings, 2 recipes, 1 authored quest
chain, 3 expedition sites, 3 resource nodes, 4 residents and 11 placeholder
sounds.**

Five versions built content-_driven_ systems: namespaced content identity, a
versioned plugin API, recipes and factories, contracts, reputation and quests,
expeditions, logistics. **The machine is finished. The content running on it is
a demo.** ADR-035's factory model, built for chains, runs one two-step chain,
and four crops cannot fill four seasons — spring and winter offer two plantable
crops each.

That is why a perfect player exhausts the progression arc in twelve minutes
(`GAME_DESIGN.md` §1.1), and it is why §6's fourth product criterion — _a tester
returns unprompted on a second day_ — has never been closable. There is no
second day in the box.

v0.6 puts one there. It is a **content tier, not a systems tier**: it authors
against registries that already exist and adds no simulation. The v1.0 systems
below are untouched by it — §4.1's ordering is the reason, and pulling any of
them earlier is the failure mode §4.2 exists to prevent.

### 4.1 Why the Order Is This Order

Each tier is a prerequisite for the next, not an arbitrary sequence:

- **Living world before town.** NPCs need time-of-day and seasons to have schedules and to react to.
- **Town before automation.** Factories need somewhere to sell to and a demand curve worth optimizing against.
- **Automation before RPG.** Combat needs an economy that can equip you and a base worth defending.
- **Playable before deep.** v0.5 before v0.6: adding content to a game nobody
  can read produces more of what was already unreadable. The surfaces had to
  finish first.
- **Deep before combat.** v0.6 before v1.0, and this one is a correction rather
  than a preference. v1.0's premise is that the player _gains a life_ — levels,
  equipment, a base worth defending. All three are things you spend an economy
  on, and an economy with two recipes in it has nothing to spend. Shipping
  combat on top of a demo-sized content set would give the player a sword and
  nowhere that a sword matters.

Building these out of order produces systems with nothing to connect to. That is the most common failure mode for projects of this shape, and this ordering exists specifically to avoid it.

### 4.2 What "Designed For" Means

The roadmap above informs _architecture_ and must never inflate _v0.1 scope_. Concretely, v0.1 pays only these forward-looking costs, each of which is cheap now and expensive to retrofit:

| Cost paid in v0.1                            | Enables later                                     |
| -------------------------------------------- | ------------------------------------------------- |
| Deterministic fixed-tick simulation          | Replays, reproducible bugs, multiplayer           |
| Seeded injected RNG, no `Math.random()`      | Same as above                                     |
| Namespaced content IDs (`core:wheat`)        | Mods, plugins, content packs                      |
| Content registries with a plugin-shaped API  | Plugin loader in v0.2, no core rewrite            |
| Versioned save schema with a migration chain | Every future feature that touches save data       |
| Layered rendering with a GPU-backed renderer | Particles, weather, animated entities, combat VFX |

Every other future system is explicitly **not** paid for in v0.1. If a proposed v0.1 change is justified only by a v0.3+ feature and does not appear in the table above, reject it.

### 4.3 What v0.2 Pays Forward

v0.2 is where this project stops being an application and becomes **an engine with a game on top of it**. That is a deliberate widening of §4.2's rule, authorized here and bounded by the same discipline: these costs are cheap now and expensive to retrofit, and nothing else is paid for.

| Cost paid in v0.2                              | Enables later                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| A generalized content-identity model (ADR-026) | Official packs, third-party plugins, generated packs, DLC — one model, not five |
| An explicitly **versioned** public plugin API  | Engine releases stop breaking plugins; API v2 without a rewrite                 |
| Extension points on every major system         | Content lands as data rather than as engine changes                             |
| Enablement as world state                      | Features that turn off without forking a save                                   |

**The API's capability surface is specified in full; only version 1's subset ships** (ADR-019 §3). A capability absent from a version does not exist at that version — no stub, no no-op, no "coming soon" field. That is `AI_RULES.md` §1.6 applied to a public interface, and it is what keeps this widening from becoming the speculative generality §1.5 forbids.

**The extension model is shared.** First-party content registers through the same public API a third party uses, and provenance is never read at runtime (ADR-026 §2). An official pack that could do something a third-party pack cannot is how the public API stops being dogfooded — which is exactly what happened to the `plugins/core/` seam in v0.1 (`ARCHITECTURE.md` §8.1).

---

## 5. Non-Goals

These are not "later." These are decisions to _not_ do the thing, revisited only by amending this document.

### 5.1 Permanent Non-Goals

- **Not a foreground game.** It will never be fullscreen, never demand exclusive attention, never have a "focus mode."
- **Not real-time twitch gameplay.** No mechanic will ever require reaction speed. This is incompatible with §2.1.
- **Not a notification spammer.** The game may change what it displays; it may not push OS notifications for routine events.
- **Not pay-to-win, and not free-to-play-shaped.** No energy meters, no timers sold for money, no dark patterns. The idle mechanics exist to respect the player's absence, not to monetize it.
- **Not cross-platform in the near term.** Windows-first. macOS/Linux overlay semantics are different enough that pretending otherwise would compromise the Windows implementation. Revisit no earlier than v0.3.
- **Not an engine.** We are building one game. Generalization happens when a second concrete use case appears, never in anticipation of one.

### 5.2 Explicitly Deferred for v0.1

Named here so no future session mistakes their absence for an oversight:

Combat · RPG progression · Dungeons · Bosses · City defense · Factory/automation · Town · NPCs · Trading with other actors · Exploration · Multiplayer · Audio · Weather · Seasons · Day/night cycle · Achievements · Plugin _loading_ (the plugin _architecture_ is in scope; the loader is not)

---

## 6. Success Criteria for the Vision

v0.1 has succeeded as a _product_ — separately from shipping its features — if all of the following are true:

1. A developer can run it during a full workday without noticing it in Task Manager.
2. A player returns to it unprompted, more than once, on the second day.
3. The first worker hire produces a visible "oh, I see" moment in playtesting.
4. A new AI session can implement a v0.2 feature using only `docs/` and the codebase, without asking an architectural question that these documents already answer.

Criterion 4 is the one this documentation set exists to satisfy.

---

## 7. Related Documents

| Document          | Relationship                                          |
| ----------------- | ----------------------------------------------------- |
| `PLAN.md`         | Turns §4 into dated milestones with success criteria  |
| `GAME_DESIGN.md`  | Turns §3 into concrete mechanics, numbers, and tables |
| `ARCHITECTURE.md` | Turns §2.4 and §4.2 into enforced module boundaries   |
| `AI_RULES.md`     | Turns §2.5 into rules binding on every future session |
| `PERFORMANCE.md`  | Turns §2.1 into measurable, gated budgets             |
