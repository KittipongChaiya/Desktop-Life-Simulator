# ANIMATION_GUIDE

> **Status:** Authoritative for how animation _feels_ per action. The canon a session obeys when deciding an animation's frame count, cadence, and loop behaviour.
> **Owns:** The creative per-action recommendations — frame counts, the cadence (`frameTicks`) that produces a feel, and loop-vs-one-shot intent — for every action the game animates.
> **Does not own:** The animation _format_, the tick semantics, and the generated manifest (`ASSETS.md §7` — `*.anim.json`, `frameTicks`, the typed `Animations` const, `{action}_{dir}` naming); the render-on-demand accounting (`ASSETS.md §7.1`); the sim _durations_ an action takes (`GAME_DESIGN.md §4.3`); the animation _philosophy_ (`ART_DIRECTION.md §10`); the at-a-glance core recommendations this file expands (`PIXEL_GUIDE.md §8`); sizes/pivots (`PIXEL_GUIDE.md §2, §3`).

**Boundary note.** Three owners bound this file. `ASSETS.md §7` owns _how animation works_ (frame-based, timed in **simulation ticks not milliseconds**, compiled to a typed `Animations` manifest the renderer selects by name). `GAME_DESIGN.md §4.3` owns _how long an action takes_ in the sim (till 30 t, plant 20 t, harvest 30 t…). `ART_DIRECTION.md §10` owns the _feel_ (gentle, purposeful, calm). This file owns only the bridge: **how many frames, at what cadence, looping or not**, so an animation both feels right and fits its sim duration. `PIXEL_GUIDE.md §8` gives the quick recommendations for the core four; this is the full authority and must agree with it.

---

## 1. The cadence math (read once)

The sim runs at **20 Hz** (`ADR-007`). `frameTicks` is the number of sim ticks each frame holds (`ASSETS.md §7`), so:

```
frames-per-second = 20 / frameTicks
```

| `frameTicks` | fps   | Feel                                     |
| ------------ | ----- | ---------------------------------------- |
| 0            | —     | Single static frame (no animation)       |
| 10           | 2     | Very slow — idle breath, water shimmer   |
| 6            | ~3.3  | Slow, calm                               |
| **4**        | **5** | The default calm gait (placeholder walk) |
| 3            | ~6.7  | Brisker action                           |
| 2            | 10    | Fast — reserved for run/combat only      |

**Calm lives at 2–5 fps.** Anything faster than ~10 fps is outside this game's register and is forbidden by the philosophy (`ART_DIRECTION.md §10`, `VISION.md §2.1`). Keep frame counts small — every playing frame has a render-on-demand cost (`ASSETS.md §7.1`, `PERFORMANCE.md`).

---

## 2. Fit the action's sim duration

An action animation should **visually fill the time the sim gives it** (`GAME_DESIGN.md §4.3`) — the deterministic duration is the truth; the animation dresses it. `frames × frameTicks ≈ the action's tick cost`:

| Action  | Sim cost (`GAME_DESIGN.md §4.3`) | Fits, e.g.                |
| ------- | -------------------------------- | ------------------------- |
| Till    | 30 t (1.5 s)                     | 6 frames × 5 `frameTicks` |
| Plant   | 20 t (1.0 s)                     | 4–5 frames × 4–5          |
| Water   | 20 t (1.0 s)                     | 4–5 frames × 4–5          |
| Harvest | 30 t (1.5 s)                     | 6 frames × 5              |
| Deposit | 20 t (1.0 s)                     | 4 frames × 5              |

A one-shot action that finishes before or after its sim cost looks wrong — the character keeps swinging after the crop is gone, or freezes early. Match them.

---

## 3. Per-action standards

Frames and cadence below are recommendations (`ASSETS.md §7` owns the mechanism; `GAME_DESIGN.md §4.3` the durations). Directions use the `{action}_{dir}` convention (`ASSETS.md §7`). Rows marked _future_ are documented so later content extends this system rather than inventing one.

| Action              | Status              | Frames   | Cadence (`frameTicks`)         | Loop  | Feel                                                                                                                   |
| ------------------- | ------------------- | -------- | ------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| **Idle**            | v0.1                | 1–2      | 0 (static) or ~10              | yes   | Nearly still — a breath or blink (`PIXEL_GUIDE.md §8`)                                                                 |
| **Walk**            | v0.1                | 4/dir    | 4 (5 fps)                      | yes   | Legible calm gait (placeholder cadence)                                                                                |
| **Till**            | v0.1                | 4–6      | 4–5                            | no    | Wind-up, strike, settle — fits 30 t (§2)                                                                               |
| **Harvest**         | v0.1                | 4–6      | 4–5                            | no    | Reach, pluck, straighten — fits 30 t                                                                                   |
| **Plant / Water**   | v0.1                | 4–5      | 4–5                            | no    | A single gentle stoop — fits 20 t                                                                                      |
| **Sleeping / rest** | v0.1 (REST state)   | 1–2      | ~12 (very slow)                | yes   | Restful; pairs with a soft "z" emote (`CHARACTER_BIBLE.md §10`). Ties to the worker REST state (`GAME_DESIGN.md §4.2`) |
| Run                 | v0.4                | 4–6      | 2–3                            | yes   | The one fast gait; still not frantic                                                                                   |
| Mining              | v0.4                | 4–6      | 4–5                            | no    | Swing + impact, repeatable                                                                                             |
| Fishing             | v0.2+               | 4–6      | cast one-shot + slow wait loop | mixed | Calm; the wait is patient, never tense                                                                                 |
| Crafting            | v0.4                | 4–6      | 4–6                            | yes   | Steady, absorbed work; loops while active                                                                              |
| Building            | v0.4+               | 4–6      | 4–5                            | no    | A place/hammer beat per step                                                                                           |
| Eating              | v0.2+               | 2–4      | 5–6                            | no    | Short, content                                                                                                         |
| Combat              | v1.0                | 3–6      | 2–4                            | no    | Clear, readable, **never twitch** (`VISION.md §5.1`) — resolution/tactical, one-shot per action                        |
| Boss                | v1.0                | up to ~8 | 3–5                            | mixed | Set-piece; more frames allowed, still tick-timed and calm-registered                                                   |
| Animal              | v0.2+               | 2–4      | 4–8                            | yes   | Small idle/walk; peck, sway, tail-flick                                                                                |
| Weather             | v0.2                | 3–6      | 4–8                            | yes   | Drifting rain/snow on the effects layer (`ARCHITECTURE.md §5`); subtle, ambient                                        |
| Water               | v0.1 (decor) / v0.2 | 2–4      | ~10 (2 fps)                    | yes   | A slow surface shimmer on `core:water`; barely-there                                                                   |
| Trees               | v0.2                | 2–4      | ~10–12                         | yes   | A gentle canopy sway; never a whipping motion                                                                          |

Directions animate only where the action has facing (walk, run, combat); ambient loops (water, trees, weather) do not.

---

## 4. Looping rules

- **Loop** continuous _states_: idle, walk, run, sleeping, crafting-while-active, animal idle/walk, and all ambient motion (water, trees, weather). These play until the state changes.
- **One-shot** discrete _actions_ that resolve: till, plant, water, harvest, deposit, mining swing, building step, eating, each combat action. They play once and return to idle/walk.
- **A one-shot's length matches its sim cost** (§2); a loop's cadence stays in the calm band (§1).
- **Ambient loops are the highest risk.** A swaying tree or rippling water off-screen is a permanent invisible cost — it **must** register/release `animatingEntityCount` and pause when culled (`ASSETS.md §7.1`, `STYLE_LOCK.md R-12`). The idle CPU budget is a product feature (`VISION.md §2.1`).

---

## 5. Consistency rules

1. **Timing is in ticks, never milliseconds** (`ASSETS.md §7`, `STYLE_LOCK.md R-11`) — motion stays tied to the deterministic sim, identical on every machine.
2. **Stay in the calm band** (§1): 2–5 fps for almost everything; ~10 fps only for run/combat; never faster.
3. **Fit the sim duration** (§2): a one-shot animation fills the action's tick cost (`GAME_DESIGN.md §4.3`), no more, no less.
4. **No off-screen animation** (`STYLE_LOCK.md R-12`): every loop pauses when culled and releases its count.
5. **Keep frame counts small** — legibility and the idle budget both reward economy (`ASSETS.md §7.1`, `STYLE_LOCK.md R-16`).
6. **Format, durations, and philosophy win.** If this file conflicts with `ASSETS.md §7` (format), `GAME_DESIGN.md §4.3` (durations), or `ART_DIRECTION.md §10` (feel), those own their domains and this file is corrected.

---

## 6. Related documents

| Document                         | Relationship                                                        |
| -------------------------------- | ------------------------------------------------------------------- |
| `ASSETS.md §7, §7.1, §7.2, §7.3` | Animation format, tick timing, the generated manifest, placeholders |
| `GAME_DESIGN.md §4.3, §4.2`      | The sim action durations and the worker REST state animations fill  |
| `PIXEL_GUIDE.md §8`              | The at-a-glance core-action recommendations this file expands       |
| `ART_DIRECTION.md §10`           | The animation philosophy (gentle, purposeful, calm)                 |
| `STYLE_LOCK.md R-11, R-12, R-16` | Tick timing, no off-screen animation, economy of detail             |
| `CHARACTER_BIBLE.md §9, §10`     | Animation personality and the emote vocabulary                      |
| `ARCHITECTURE.md §5`             | The effects/lighting layers weather and ambient motion use          |
| `PERFORMANCE.md`                 | The idle CPU budget frame economy protects                          |
