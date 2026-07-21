# ADR-001: World Rendering with PixiJS

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-21 |
| **Deciders** | Project owner, lead architect |
| **Supersedes** | — |
| **Superseded by** | — |

---

## Context

The world view is a tile grid rendered inside a docked overlay roughly 220 logical pixels tall and as wide as the primary display. In v0.1 it draws a 64×64 tile farm with animated crops and a handful of workers.

Three forces pull in different directions:

1. **Long-term entity load.** `VISION.md` §4 commits to weather, particles, day/night lighting, many animated entities, and eventually combat VFX and dungeon scenes. This is a long-lived project, and the renderer is the single hardest thing to swap once content is built against it.

2. **The idle constraint.** `VISION.md` §2.1 makes background CPU a product feature. The overlay is visible for eight hours and *changing* for perhaps ten minutes of that. A renderer that burns a frame budget when nothing has moved is a product defect.

3. **Rendering happens in the same process as the simulation.** Whatever the renderer costs, it costs against the same budget as the 20 Hz tick (ADR-007) and the React UI (ADR-005).

The tension is sharp: the highest-headroom option (GPU) is also the one that most tempts you into continuous rendering, and the lowest-idle-cost option (Canvas 2D with dirty rectangles) is the one that runs out of room exactly where the roadmap is heading.

---

## Decision

**PixiJS 8 is the primary and default renderer, with render-on-demand as a hard, enforced requirement.**

Canvas 2D is retained only as a **capability fallback** for machines where neither WebGPU nor WebGL2 initializes. It is not a default, not a parallel full implementation, and not a user-facing setting.

### The three binding constraints

PixiJS is accepted *conditionally*. These constraints are what make the choice compatible with force #2, and abandoning any of them re-opens this decision.

#### 1. Render-on-demand is mandatory

Pixi's shared ticker runs `autoStart: false`. The application maintains an explicit *dirty* flag and an *animating* count:

```
render this frame  ⟺  sceneDirty OR animatingEntityCount > 0
```

- `sceneDirty` is set by the render layer when a world snapshot differs from the last drawn one.
- `animatingEntityCount` is incremented by any effect that must animate continuously (a walking worker, a particle emitter, a weather system) and **decremented when it ends**. Any code path that increments without a guaranteed decrement is a defect.
- When neither holds, `requestAnimationFrame` is not scheduled at all. The GPU goes idle and the process approaches zero CPU.

`CODE_STYLE.md` §10 restates this as a code rule because it is the constraint most likely to erode silently.

#### 2. Collapsed mode tears down the GPU context

When the overlay is collapsed to its status bar, the world is not visible. The Pixi application is **destroyed**, releasing GPU memory and the WebGL/WebGPU context entirely; the status bar is plain DOM. Expanding re-initializes from the world state, which is cheap because the renderer is a pure view (`ARCHITECTURE.md` §Data Flow).

This is the single largest idle-cost win available, and it is only possible because rendering holds no authoritative state.

#### 3. Everything is atlased

No runtime texture construction from loose files. All textures come from generated atlases via the asset manifest (ADR-006, `ASSETS.md`). This keeps draw calls batched, which is the entire reason for choosing a GPU renderer.

### Layer structure

Render order is defined once, here, and implemented as named containers — never implied by `addChild` call order:

| # | Layer | Contents | Typically static? |
|---|---|---|---|
| 0 | `terrain` | Tile base sprites | Yes — redrawn on tile change only |
| 1 | `terrainOverlay` | Tilled soil, moisture, path decals | Yes |
| 2 | `objects` | Crops, buildings, props — y-sorted | On growth-stage change |
| 3 | `entities` | Workers and future NPCs — y-sorted | No, while moving |
| 4 | `effects` | Particles, weather (v0.2+) | No, while active |
| 5 | `lighting` | Day/night tint, light sources (v0.2+) | Slowly |
| 6 | `worldUi` | Selection highlight, hover cursor, build ghost | On interaction |

Layers 4 and 5 are declared now and empty in v0.1. This costs two container allocations and prevents a re-layering migration later.

### Terrain uses a chunked, cached strategy

Terrain is drawn into `RenderTexture` chunks of 16×16 tiles, re-rendered only when a tile inside the chunk changes. A static 64×64 farm therefore costs 16 quads per frame rather than 4,096 sprites — and combined with render-on-demand, usually costs nothing at all.

---

## Alternatives Considered

### A. Canvas 2D with dirty rectangles

The original recommendation, and genuinely the better fit for v0.1 *in isolation*.

- **For:** zero dependencies, near-zero idle cost by construction, trivially debuggable, no GPU context, no driver variability, smallest memory footprint.
- **Against:** the ceiling is real and arrives on the roadmap, not after it. Per-pixel effects (lighting, weather, shaders) are impractical. Thousands of animated sprites exceed a software blitter. Crossing that ceiling mid-project means rewriting the renderer *and* every piece of content built against it.
- **Rejected because:** the cost of switching later is far higher than the cost of the discipline required to make PixiJS idle-cheap now. The idle problem is solvable with §Decision constraints 1–3; the ceiling problem is not solvable without a rewrite.

### B. PixiJS with a continuously running ticker

The conventional way to use Pixi, and what most tutorials show.

- **Rejected because:** it directly violates `VISION.md` §2.1. A continuous 60 Hz ticker on an idle farm is a measurable, permanent CPU cost for zero visual benefit. This is precisely the failure mode that makes desktop widgets unwelcome.

### C. Three.js / raw WebGL

- **Rejected because:** Three.js is a 3D engine; its 2D story is worse than Pixi's and its payload is larger. Raw WebGL means writing batching, atlasing, and text rendering by hand — a large amount of low-level code with no product value.

### D. DOM elements as tiles

- **Rejected because:** it does not survive a few hundred nodes, gives no path to effects, and makes the renderer's cost a function of the browser's layout engine.

### E. Hybrid — Canvas 2D for v0.1, PixiJS at v0.3

- **Rejected because:** it guarantees paying for two renderers and a migration. Deferring a known-necessary decision to a point where more content depends on it is strictly worse than making it now.

---

## Tradeoffs Accepted

| We accept | To gain | Mitigation |
|---|---|---|
| ~400 KB dependency | Batching, effects, long-term headroom | Acceptable against a desktop app's install size |
| GPU context memory (~30–60 MB) | GPU-accelerated compositing | Destroyed entirely in collapsed mode (§2) |
| Driver and GPU variability | Hardware acceleration | WebGL2 fallback, then Canvas 2D fallback; capability logged at startup |
| Discipline required to stay idle-cheap | A renderer that lasts to v1.0 | Enforced by code rules + an automated idle-CPU test (`TESTING.md`) |
| Higher debugging complexity than Canvas 2D | — | Pixi devtools; render layer is pure and snapshot-testable |
| Risk of a laptop's discrete GPU being woken | — | Prefer integrated adapter via `powerPreference: 'low-power'` |

---

## Consequences

### Immediate (phase-02)

- PixiJS bootstraps with `autoStart: false`, `powerPreference: 'low-power'`, and an explicit `antialias: false` for crisp pixel art.
- The seven layers above are created as named containers at startup.
- The dirty/animating render gate is implemented **before** the first sprite is drawn, not retrofitted.
- Terrain chunking with `RenderTexture` is implemented in phase-02, not deferred.

### Ongoing constraints

- Every new visual effect must declare its animating lifetime and release it.
- Every display object needs an explicit `destroy()` path (`CODE_STYLE.md` §10).
- Texture memory is a tracked budget line (`PERFORMANCE.md`).
- The renderer stays a pure function of world snapshots. If rendering ever holds authoritative state, constraint §2 breaks and this ADR is violated.

### Fallback scope (explicit)

The Canvas 2D fallback renders **layers 0–3 and 6 only**, without lighting or particles, at reduced visual fidelity. It exists so the game is playable on a machine with no working GPU path — not so it is equivalent. It is implemented in phase-02 as a thin alternative backend behind the same renderer interface, and it is a **degraded mode**, which the player is told about once.

### Validation

- Phase-02 acceptance requires: idle CPU with a static world at or below the `PERFORMANCE.md` ceiling, verified with the app running and untouched for five minutes.
- An automated test asserts zero `requestAnimationFrame` callbacks fire over a 10-second window with no world changes. **This test is the enforcement mechanism for the entire decision** — if it is ever deleted or skipped, this ADR has failed.

### Revisit if

- Idle CPU cannot be brought within budget after honest optimization → reconsider alternative A.
- WebGPU/WebGL2 initialization failures exceed a meaningful share of real users → promote the Canvas 2D fallback's scope.
