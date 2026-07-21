# ASSETS

> **Status:** Authoritative for asset authoring, pipeline, and conventions.
> **Owns:** Asset formats, sizes, naming, atlas groups, the build pipeline, attribution.
> **Does not own:** Why a build-time pipeline (`decisions/ADR-006-asset-pipeline.md`), render layer order (`ARCHITECTURE.md` §5).

**Never load an asset by string path.** Every texture is referenced through the generated typed manifest (§5). This is lint-enforced, and it is what makes a renamed asset a compile error instead of an invisible missing sprite.

---

## 1. Pipeline Overview

```
assets/src/          npm run assets          assets/dist/              runtime
─────────────  ──────────────────────────▶  ──────────────────  ────────────────────
 authored art        AssetPack                <atlas>.png         Pixi loads atlases
 [committed]         · pack atlases           <atlas>.json        code uses Sprites.*
                     · extrude edges          manifest.ts         (typed keys only)
                     · emit manifest         [gitignored]
```

Runs automatically before `dev` and `build`; watches in development. Regeneration takes seconds.

`assets/dist/` is **gitignored and fully reproducible** from `assets/src/`. Committing generated atlases would produce unmergeable binary diffs on every art change and allow `dist` to silently drift from `src` (ADR-006 §2).

---

## 2. Art Direction

| Property | Value |
|---|---|
| Style | Pixel art |
| Base tile | 32 × 32 logical px |
| Resolutions | 1× authored, 2× provided for high-DPI |
| Palette | Limited, shared across all sprites — defined in `assets/src/PALETTE.md` |
| Perspective | Top-down, slight 3/4 tilt for objects and entities |
| Outlines | 1 px dark outline on entities and objects; none on terrain |
| Authoring tool | Aseprite (`.aseprite` sources committed alongside PNGs) |

A shared palette is what makes plugin-contributed art blend with core art. It is far cheaper to establish now than to retrofit across a content library.

---

## 3. Formats

| Kind | Source (`assets/src/`) | Output (`assets/dist/`) |
|---|---|---|
| Sprites | `.png` (32-bit RGBA) + `.aseprite` | Packed into atlas `.png` + `.json` |
| Tiles | `.png`, exactly 32×32 | Terrain atlas |
| UI icons | `.png`, 16×16 or 24×24 | `ui-world` atlas or DOM `<img>` |
| Audio (v0.2+) | `.wav` 44.1 kHz | `.ogg` |
| Fonts | `.ttf` / bitmap font | Bitmap font atlas |

**PNG only for source art.** JPEG is lossy and destroys pixel-art edges; WebP source complicates Aseprite round-tripping. Compression is the pipeline's job.

---

## 4. Atlas Groups

Atlases group by **what is drawn together**, not by asset type. Grouping by type scatters simultaneously-drawn sprites across atlases and breaks batching — which would negate the entire reason for choosing PixiJS (ADR-001, ADR-006 §3).

| Atlas | Source directory | Contents | Loaded |
|---|---|---|---|
| `terrain` | `assets/src/terrain/` | Tile bases, soil states, path decals | Startup |
| `crops` | `assets/src/crops/` | All crop growth-stage frames | Startup |
| `entities` | `assets/src/entities/` | Worker sprites and animation frames | Startup |
| `buildings` | `assets/src/buildings/` | Structures and props | Startup |
| `ui-world` | `assets/src/ui-world/` | Selection, ghosts, in-world icons | Startup |
| `effects` | `assets/src/effects/` | Particles, weather | v0.2+, lazy |

### 4.1 Constraints

| Constraint | Value | Reason |
|---|---|---|
| Max atlas dimension | 2048 × 2048 | Safe on all integrated GPUs (ADR-006 §3) |
| Padding | 2 px transparent | Prevents neighbour bleed |
| Extrusion | 1 px edge repeat | Prevents seams at non-integer scales |
| Power-of-two | Not required | Modern GPUs do not need it |
| Overflow | Split into `<atlas>-1.png` | Never raise the size cap |

**Adding an atlas group is a draw-call decision, not a filing decision.** Each additional atlas is a potential extra draw call per frame. Add one only when the content is genuinely lazily loaded or genuinely never co-drawn.

---

## 5. The Generated Manifest

The pipeline emits TypeScript, not bare JSON:

```ts
// assets/dist/manifest.ts — GENERATED, do not edit
export const Sprites = {
  terrainGrass:      'terrain:grass',
  terrainTilled:     'terrain:tilled',
  cropWheatStage0:   'crops:wheat_0',
  cropWheatStage3:   'crops:wheat_3',
  workerIdleSouth:   'entities:worker_idle_s',
  workerWalkSouth0:  'entities:worker_walk_s_0',
} as const;

export type SpriteKey = (typeof Sprites)[keyof typeof Sprites];
```

### 5.1 Usage

```ts
// Correct
import { Sprites } from '@assets/manifest';
const sprite = createSprite(Sprites.cropWheatStage0);

// BANNED — lint error
const sprite = createSprite('crops:wheat_0');
const sprite = Sprite.from('./assets/wheat.png');
```

Deleting or renaming a source asset therefore breaks the build **at every use site**, rather than producing a missing texture in a state nobody tests.

---

## 6. Naming

### 6.1 Files

| Kind | Pattern | Example |
|---|---|---|
| Tile | `<kind>.png` | `grass.png` |
| Crop stage | `<crop>_<stage>.png` | `wheat_2.png` |
| Static entity | `<entity>_<action>_<dir>.png` | `worker_idle_s.png` |
| Animated frame | `<entity>_<action>_<dir>_<frame>.png` | `worker_walk_s_0.png` |
| Building | `<building>.png` | `storage_shed.png` |

Directions: `n`, `s`, `e`, `w`. Frames are zero-indexed. Stages are zero-indexed and must match the crop's `stageSprites` array order (`GAME_DESIGN.md` §3.3).

### 6.2 Manifest keys

Auto-derived: `<group><PascalCaseFilename>` → `crops/wheat_2.png` becomes `cropsWheat2`. Deterministic, so the same file always yields the same key.

---

## 7. Animation

Frame-based, defined in a sidecar JSON beside the frames:

```jsonc
// assets/src/entities/worker.anim.json
{
  "walk_s": { "frames": ["worker_walk_s_0", "worker_walk_s_1", "worker_walk_s_2"],
              "frameTicks": 4, "loop": true },
  "idle_s": { "frames": ["worker_idle_s"], "frameTicks": 0, "loop": false }
}
```

`frameTicks` is in **simulation ticks**, not milliseconds (ADR-007 §7). At 20 Hz, `frameTicks: 4` is 5 frames per second. Using ticks keeps animation speed tied to game time rather than display refresh.

### 7.1 Animation and render-on-demand

Every playing animation **must** increment `animatingEntityCount` and decrement it when it stops (ADR-001 §1). A looping animation on an off-screen entity is a permanent frame cost — the highest-risk way to silently break the idle CPU budget (`PERFORMANCE.md` §4.2).

Animations on culled entities are paused, not merely hidden.

---

## 8. Pixel-Art Rendering Rules

Binding, from ADR-006 §5. Getting these wrong produces subtly blurry or shimmering art that is difficult to diagnose after the fact.

| Rule | Setting |
|---|---|
| Scaling | `SCALE_MODES.NEAREST` globally — never linear |
| Antialiasing | `antialias: false` on the Pixi application |
| Camera | Snaps to whole device pixels |
| Zoom | Integer multiples only (1×, 2×, 3×) |
| Rotation | Avoided on pixel art; use pre-rotated frames |
| Tinting | Permitted — does not resample |

Sub-pixel camera offsets are the most common cause of shimmering pixel art, which is why §8 makes camera snapping a rule rather than a nicety.

---

## 9. Content-Driven Assets

Content definitions reference sprite keys directly (ADR-006 §6):

```ts
registerCrop({
  id: 'core:wheat',
  growthTicks: 2400,
  stageSprites: [
    Sprites.cropsWheat0, Sprites.cropsWheat1,
    Sprites.cropsWheat2, Sprites.cropsWheat3,
  ],
});
```

**The renderer never maps content IDs to sprites** — no switch statements, no naming conventions resolved at runtime. This is what lets a v0.2 plugin add a crop with its own art and have it render with zero core changes.

---

## 10. Plugin Assets (v0.2)

Reserved now, not implemented (ADR-006 §7):

- A plugin ships a **pre-built** atlas plus a manifest fragment.
- Keys namespace by plugin ID: `myMod:dragonfruit_0`.
- Fragments merge into the sprite registry at load.
- Plugin atlases are separate — never repacked into core atlases.

v0.1 builds no loading path. It only guarantees the namespace exists and that nothing assumes assets are exclusively first-party.

---

## 11. Attribution and Licensing

Every asset directory carries an `ATTRIBUTION.md`:

```markdown
| File | Source | Author | License |
|---|---|---|---|
| crops/wheat_*.png | Original | <name> | CC0 |
| entities/worker_*.png | opengameart.org/… | <name> | CC-BY 3.0 |
```

**Assets with unclear provenance do not enter the repository.** Reconstructing attribution before a public release is far more expensive than recording it at the time — and in the failure case, impossible.

Acceptable licenses: CC0, CC-BY (with attribution shipped), and original work. **GPL-family asset licenses are rejected**, consistent with `TECH_STACK.md` §7.1.

---

## 12. Adding an Asset — Checklist

- [ ] Authored at 32×32 (or an exact multiple) in the shared palette
- [ ] Placed in the correct atlas group directory (§4)
- [ ] Named per §6.1
- [ ] `.aseprite` source committed alongside the `.png`
- [ ] `ATTRIBUTION.md` updated in the same commit
- [ ] `npm run assets` run; manifest key confirmed
- [ ] Referenced via `Sprites.*`, never a string literal
- [ ] Registered in a content definition if it is content art
- [ ] Animation registers/releases `animatingEntityCount` (§7.1)
- [ ] Texture memory impact checked against `PERFORMANCE.md` §6

---

## 13. Validation

Enforced by the build and by tests:

| Check | Fails when |
|---|---|
| Orphan assets | A source asset is unreferenced by any manifest key |
| Dangling keys | A manifest key resolves to a missing frame |
| Dimension check | A tile sprite is not exactly 32×32 |
| Atlas budget | Total texture memory exceeds `PERFORMANCE.md` §6 |
| Draw calls | The static reference farm exceeds 30 draw calls |
| Attribution | An asset directory has files not listed in `ATTRIBUTION.md` |

The draw-call check is the one that matters most: it is the direct measurement of whether atlas grouping is actually delivering batching, which is the entire justification for ADR-006.
