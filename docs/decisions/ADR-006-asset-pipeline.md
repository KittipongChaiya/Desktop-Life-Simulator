# ADR-006: Build-Time Asset Pipeline with Generated Atlases

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-21 |
| **Deciders** | Project owner, lead architect |
| **Supersedes** | — |
| **Superseded by** | — |

---

## Context

ADR-001 chose PixiJS specifically for GPU batching — the ability to draw thousands of sprites in a handful of draw calls. **Batching only works when sprites share a texture.** A renderer fed loose PNG files produces one draw call per distinct texture, which discards the entire reason for choosing a GPU renderer. The asset pipeline is therefore not a convenience; it is what makes ADR-001 pay off.

Requirements:

- Pixel art authored at a fixed tile size, rendered crisply with no filtering bleed.
- Sprite animations (crop growth stages, worker walk cycles) that grow substantially across the roadmap — NPCs, monsters, machines, weather.
- Assets addressable by stable, typed identifiers rather than string paths, so a renamed file is a compile error rather than a missing texture at runtime.
- A path for plugin-supplied assets in v0.2 (ADR-003 §6) without a core rewrite.
- Zero runtime cost for pipeline work — the overlay's CPU budget has no room for startup texture packing.

The recurring failure mode in projects of this shape is assets accumulating ad hoc — loose files loaded by hardcoded string paths, no atlasing, no manifest — until the render cost forces a painful retrofit that touches every call site. This ADR exists to prevent that by making the pipeline mandatory from the first sprite.

---

## Decision

**All assets are processed at build time into atlases and a typed manifest. Runtime loads only generated artifacts, never source files.**

```
assets/src/                    →   AssetPack   →   assets/dist/        →  runtime
(authored, committed)              (build step)     (generated, ignored)   (typed manifest)
```

### 1. AssetPack for atlas generation

`@assetpack/core` — Pixi's official asset tooling — generates texture atlases, handles mipmap and resolution variants, and emits a Pixi-compatible manifest. Chosen over hand-rolled packing because it is maintained alongside the renderer it feeds, and over TexturePacker because it is free, scriptable, and runs in CI without a license.

Runs as a build step (`npm run assets`) and as a watcher in development.

### 2. Source assets are committed; generated assets are not

| Path | Committed | Contents |
|---|---|---|
| `assets/src/` | **Yes** | Authored PNGs, `.aseprite` sources, audio sources, `.json` metadata |
| `assets/dist/` | **No** — gitignored | Generated atlases, manifests, compressed audio |

Committing generated atlases would produce enormous, unmergeable binary diffs on every art change and would let `dist` silently drift from `src`. The pipeline is deterministic, so `dist` is always reproducible from `src`. CI rebuilds it; a stale-artifact check fails the build if a committed `dist` ever appears.

### 3. Atlases are grouped by usage, not by type

Atlas membership follows what is drawn together, so a scene's textures live in as few atlases as possible:

| Atlas | Contents | Loaded |
|---|---|---|
| `terrain` | Tile bases, soil states, path decals | Always |
| `crops` | All crop growth-stage frames | Always (v0.1) |
| `entities` | Worker sprites, animation frames | Always |
| `buildings` | Structures, props | Always |
| `ui-world` | Selection, ghosts, in-world icons | Always |
| `effects` | Particles, weather | v0.2+, lazy |

Grouping by type instead (`all-animations`, `all-static`) would scatter simultaneously-drawn sprites across atlases and break batching — the mistake this structure exists to avoid.

**Atlas size cap: 2048×2048.** Safe on effectively all GPUs including the integrated adapters ADR-001 prefers via `powerPreference: 'low-power'`. Overflow splits into a numbered sheet rather than raising the cap.

### 4. A generated, typed manifest

The pipeline emits TypeScript, not a bare JSON blob:

```ts
// assets/dist/manifest.ts — GENERATED, do not edit
export const Sprites = {
  cropWheatStage0: 'crops:wheat_0',
  cropWheatStage1: 'crops:wheat_1',
  workerIdleSouth: 'entities:worker_idle_s',
} as const;

export type SpriteKey = (typeof Sprites)[keyof typeof Sprites];
```

Textures are only ever resolved through `SpriteKey`. **String literal paths at call sites are banned and lint-enforced.** Deleting or renaming a source asset therefore breaks the build at every use site instead of producing an invisible missing texture in one rarely-seen state.

### 5. Pixel-art rendering rules

Binding, because getting these wrong produces subtly blurry or bleeding art that is hard to diagnose later:

- **Nearest-neighbour scaling** (`SCALE_MODES.NEAREST`) globally. Never linear.
- **`antialias: false`** on the Pixi application (ADR-001).
- **2px transparent padding with edge extrusion** on every atlas frame, preventing neighbour-texel bleed at non-integer scales.
- **Base tile size: 32×32** logical pixels. Sprites author at 1× and are provided at 2× for high-DPI displays.
- **Camera positions snap to whole device pixels.** Sub-pixel camera offsets are the most common cause of shimmering pixel art.

### 6. Content declares its own assets

Content definitions reference sprite keys, closing the loop with ADR-004 §5:

```ts
registerCrop({
  id: 'core:wheat',
  growthTicks: 2400,
  stageSprites: [Sprites.cropWheatStage0, Sprites.cropWheatStage1, /* … */],
});
```

The renderer never maps content IDs to sprites through a switch statement or a naming convention. This is what lets a v0.2 plugin add a crop with its own art and have it render with no core change.

### 7. Plugin assets (reserved, not built in v0.1)

The manifest format namespaces by source (`core:`, `<plugin>:`). A v0.2 plugin ships its own pre-built atlas plus a manifest fragment, merged into the registry at load. **v0.1 builds no loading path** — it only guarantees the namespace exists and that nothing assumes assets are exclusively first-party.

### 8. Audio (v0.2+)

Structure declared now, empty in v0.1 (`VISION.md` §5.2). Sources are WAV in `assets/src/audio/`; the pipeline emits `.ogg` for effects and music. Audio is lazily loaded and never blocks startup.

### 9. Licensing

Every asset directory carries an `ATTRIBUTION.md` recording source, author, and license. Assets with unclear provenance do not enter the repository. This is far cheaper to maintain from the first file than to reconstruct before a public release.

---

## Alternatives Considered

### A. Loose files loaded at runtime by path

- **For:** zero build step; drop a PNG in and use it.
- **Against:** one draw call per texture destroys batching and negates ADR-001. String paths give no compile-time safety. No way to detect an unused or missing asset.
- **Rejected because:** it is the failure mode described in §Context. The retrofit cost grows with every asset added.

### B. Runtime atlas packing at startup

- **Rejected because:** it spends CPU and time on every launch to redo work whose inputs never change between builds. Startup cost is especially unwelcome for an app expected to launch with the desktop session.

### C. TexturePacker (commercial)

- **For:** best-in-class packing, mature GUI.
- **Rejected because:** licensing friction for contributors and CI, for a marginal packing improvement over AssetPack at this project's scale.

### D. Hand-maintained sprite sheets with hardcoded coordinates

- **Rejected because:** every art change requires manually updating coordinates, which is tedious and silently error-prone. This is exactly the mechanical work a build step should own.

### E. Vite's asset imports (`import wheat from './wheat.png'`)

- **For:** built into the bundler, gives compile-time reference safety.
- **Rejected because:** it handles *bundling* but not *atlasing* — each import stays a separate texture, so batching still breaks. Solves the smaller half of the problem.

---

## Tradeoffs Accepted

| We accept | To gain | Mitigation |
|---|---|---|
| A build step before art appears | Batching, type safety, no runtime cost | Watch mode in dev; regeneration in seconds |
| Generated code in the repo tree | Compile-time asset safety | Clearly marked generated, gitignored, reproducible |
| Atlas grouping needs occasional thought | Minimal draw calls | Groups documented in `ASSETS.md`; draw calls tracked in `PERFORMANCE.md` |
| Whole atlas loads for one sprite | Fewer, larger requests | Grouped by co-usage, so this is nearly always the right trade |
| A pipeline dependency | Maintained alongside Pixi | Deterministic output; replaceable without touching call sites |

---

## Consequences

### Immediate

- The pipeline is built in **phase-00**, before the first sprite exists. Introducing it after loose-file loading has spread means touching every call site.
- `assets/dist/` is gitignored; `npm run assets` runs automatically before `dev` and `build`.
- Nearest-neighbour scaling and `antialias: false` are set at Pixi initialization in phase-02 (ADR-001).

### Ongoing

- New art goes to `assets/src/`, is assigned to an atlas group, and is referenced via `Sprites`.
- Never reference a texture by string literal. Lint-enforced.
- Texture memory is a tracked budget line (`PERFORMANCE.md`); adding an atlas requires reporting its impact.
- New assets carry attribution at the time they are added, never retroactively.

### Validation

- A build-time check fails if any source asset is unreferenced by the manifest (dead assets) or if any manifest key resolves to a missing frame.
- A test asserts atlas count and total texture memory stay within budget.
- Phase-02 acceptance includes a draw-call count assertion for a static farm scene — the direct measurement of whether atlasing is working.

### Revisit if

- Total texture memory approaches the GPU budget → introduce lazy atlas loading per scene.
- Plugin assets need runtime packing (a mod adding loose art) → build a constrained runtime packer for plugin content only, never for core.
