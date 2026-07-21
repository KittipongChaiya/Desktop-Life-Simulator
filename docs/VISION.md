# VISION

> **Status:** Authoritative. Changes here ripple into every other document.
> **Owns:** Product intent, design philosophy, core loop, long-term direction, non-goals.
> **Does not own:** Mechanics tuning (`GAME_DESIGN.md`), roadmap dates (`PLAN.md`).

---

## 1. The One-Sentence Vision

**A living little world that lives at the bottom of your screen while you get on with your day.**

Desktop Life Simulator is an idle life-simulation game that runs as a slim overlay docked to the bottom edge of Windows. It is designed to be *glanced at*, not stared at. The player tends a farm, directs workers, and grows an economy in the gaps between real work — a few seconds at a time, dozens of times a day.

---

## 2. Design Philosophy

These five principles resolve disputes. When a design decision is ambiguous, the principle listed first wins.

### 2.1 The Desktop Comes First

The player's actual work is the priority; the game is the guest. This is not a slogan — it is a hard constraint that overrides gameplay ambition:

- The overlay must never steal focus, never raise itself over a fullscreen application, and never interrupt with modal dialogs.
- The game must be collapsible to a thin status bar with a single click, and must survive being ignored for days.
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

The simulation is a pure, deterministic, headless model. Rendering and UI are *views* of it and may be destroyed and rebuilt at any moment without affecting game state.

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

The critical transition is **hiring the first worker**: the moment the player stops performing the loop and starts *designing* it. Everything in v0.1 builds toward that moment, and everything after v0.1 builds on top of it.

---

## 4. Long-Term Direction

The overlay is a permanent constraint. The world behind it is not.

| Horizon | Theme | What it adds |
|---|---|---|
| **v0.1** | Farm & Overlay | The loop above. Proves the overlay is livable. |
| **v0.2** | A Living World | Seasons, weather, day/night, audio, and the plugin loader. The world starts changing on its own. |
| **v0.3** | Town & Trade | NPCs, a settlement, contracts, and a market that moves. The player gains neighbours. |
| **v0.4** | Automation & Exploration | Factories, logistics, and a map beyond the farm. The player gains reach. |
| **v1.0** | Full Life Simulator | RPG progression, dungeons, bosses, city defense, and a mature mod ecosystem. The player gains a life. |

Detailed milestones and success criteria: `PLAN.md`.

### 4.1 Why the Order Is This Order

Each tier is a prerequisite for the next, not an arbitrary sequence:

- **Living world before town.** NPCs need time-of-day and seasons to have schedules and to react to.
- **Town before automation.** Factories need somewhere to sell to and a demand curve worth optimizing against.
- **Automation before RPG.** Combat needs an economy that can equip you and a base worth defending.

Building these out of order produces systems with nothing to connect to. That is the most common failure mode for projects of this shape, and this ordering exists specifically to avoid it.

### 4.2 What "Designed For" Means

The roadmap above informs *architecture* and must never inflate *v0.1 scope*. Concretely, v0.1 pays only these forward-looking costs, each of which is cheap now and expensive to retrofit:

| Cost paid in v0.1 | Enables later |
|---|---|
| Deterministic fixed-tick simulation | Replays, reproducible bugs, multiplayer |
| Seeded injected RNG, no `Math.random()` | Same as above |
| Namespaced content IDs (`core:wheat`) | Mods, plugins, content packs |
| Content registries with a plugin-shaped API | Plugin loader in v0.2, no core rewrite |
| Versioned save schema with a migration chain | Every future feature that touches save data |
| Layered rendering with a GPU-backed renderer | Particles, weather, animated entities, combat VFX |

Every other future system is explicitly **not** paid for in v0.1. If a proposed v0.1 change is justified only by a v0.3+ feature and does not appear in the table above, reject it.

---

## 5. Non-Goals

These are not "later." These are decisions to *not* do the thing, revisited only by amending this document.

### 5.1 Permanent Non-Goals

- **Not a foreground game.** It will never be fullscreen, never demand exclusive attention, never have a "focus mode."
- **Not real-time twitch gameplay.** No mechanic will ever require reaction speed. This is incompatible with §2.1.
- **Not a notification spammer.** The game may change what it displays; it may not push OS notifications for routine events.
- **Not pay-to-win, and not free-to-play-shaped.** No energy meters, no timers sold for money, no dark patterns. The idle mechanics exist to respect the player's absence, not to monetize it.
- **Not cross-platform in the near term.** Windows-first. macOS/Linux overlay semantics are different enough that pretending otherwise would compromise the Windows implementation. Revisit no earlier than v0.3.
- **Not an engine.** We are building one game. Generalization happens when a second concrete use case appears, never in anticipation of one.

### 5.2 Explicitly Deferred for v0.1

Named here so no future session mistakes their absence for an oversight:

Combat · RPG progression · Dungeons · Bosses · City defense · Factory/automation · Town · NPCs · Trading with other actors · Exploration · Multiplayer · Audio · Weather · Seasons · Day/night cycle · Achievements · Plugin *loading* (the plugin *architecture* is in scope; the loader is not)

---

## 6. Success Criteria for the Vision

v0.1 has succeeded as a *product* — separately from shipping its features — if all of the following are true:

1. A developer can run it during a full workday without noticing it in Task Manager.
2. A player returns to it unprompted, more than once, on the second day.
3. The first worker hire produces a visible "oh, I see" moment in playtesting.
4. A new AI session can implement a v0.2 feature using only `docs/` and the codebase, without asking an architectural question that these documents already answer.

Criterion 4 is the one this documentation set exists to satisfy.

---

## 7. Related Documents

| Document | Relationship |
|---|---|
| `PLAN.md` | Turns §4 into dated milestones with success criteria |
| `GAME_DESIGN.md` | Turns §3 into concrete mechanics, numbers, and tables |
| `ARCHITECTURE.md` | Turns §2.4 and §4.2 into enforced module boundaries |
| `AI_RULES.md` | Turns §2.5 into rules binding on every future session |
| `PERFORMANCE.md` | Turns §2.1 into measurable, gated budgets |
