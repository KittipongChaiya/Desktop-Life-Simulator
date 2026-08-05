# Fix — Phase-03 farming, made visible

> **Completes:** `docs/phases/phase-03-farming.md`. Not a new phase and not new gameplay — the farming systems shipped correct in phase-03 and were never drawn.
> **Delivers:** till, plant, grow, and harvest are each visible on the tile they happen to.
> **Governing decisions:** ADR-001 (render-on-demand), ADR-005 (snapshot slices), ADR-008 (events), ADR-009 (derived tile state).
> **Date:** 2026-08-01

---

## The defect

The owner reported three times that "nothing happens" when farming. Input plumbing was repaired across 07.5g–07.5i; that was never the cause. **The farming loop was invisible end to end.** The simulation was correct throughout — crops grew, yields landed, coins moved — but the renderer had no path to any of it:

| Step    | Simulation                        | What the player saw |
| ------- | --------------------------------- | ------------------- |
| Till    | `tilledAt` set                    | nothing             |
| Plant   | crop created                      | nothing             |
| Grow    | stage advances four times         | nothing             |
| Harvest | yield to inventory, coins on sale | the coin counter    |

Four independent causes, each sufficient on its own:

1. **`terrain-renderer.ts` never read `tilledAt`.** It keyed terrain off `kind` alone, and tilling deliberately leaves `kind` untouched (ADR-009 §1). `tilled.png` had existed since phase-05.5.
2. **Nothing ever called `WorldView.invalidateTile`.** The method was implemented in phase-02 and had **zero callers in the entire codebase**, so a changed tile could not have been redrawn even if the renderer had known about it. Terrain is cached per 16×16 chunk; without invalidation the cached texture stands forever.
3. **No crops snapshot slice existed**, so no renderer could have drawn a crop, and no crop renderer existed to try.
4. **The `crops` atlas was never loaded** by `world-view.ts` — only `terrain`, `entities`, and `buildings`. Every `crops:*` key resolved to `Texture.EMPTY`. And only wheat had art at all, while **turnip is the default seed selection**, so a new player's first crop was blank at every stage even once a renderer existed.

---

## What changed

### 1. Tilled soil (`terrain-tiles.ts`, `tile-kinds.ts`, `terrain-renderer.ts`)

Sprite selection moved into a pure `tileSpriteKey`, unit-tested without a GPU — the split `terrain-chunks.ts` already established. Tilled is applied as a **render-time override**, not a registered tile kind: a `core:tilled` kind would be a second source of truth for a fact `tilledAt` already holds, and the first save migration would drift them apart.

### 2. The missing wire (`events/types.ts`, `crop-commands.ts`, `start.tsx`)

`tillTile` now publishes `tileTilled`; the composition root consumes it and invalidates the tile's chunk — mirroring the existing `cropHarvested` → `playEffect` subscriber. A worker tilling produces the identical event, so autonomous work is drawn on the same path as the player's, with no second route to keep in sync.

An event rather than a slice because `tilledAt` is one byte in a 4,096-tile grid: projecting the whole grid every tick to catch it would cost more, every tick, than the redraw costs once.

### 3. Crops snapshot slice (`crops-slice.ts`)

`CropView` carries `{ tile, sprite }` — the **resolved stage sprite key**, never `plantedTick` or an elapsed count. That is load-bearing, not stylistic: growth advances every tick, so a view carrying elapsed time would differ every tick and republish the slice at 20 Hz forever, the exact failure ADR-005 §2 exists to prevent. A crop has four stages, so the slice republishes exactly four times per crop lifetime. A test asserts precisely that count.

### 4. Crop renderer (`crop-view.ts`, `world-view.ts`)

Follows `building-view.ts` — pooled sprites in the y-sorted `objects` layer, change-gated by reference — with one deliberate difference: **a crop's sprite changes and a building's does not.** The pool reassigns the texture when the stage moves; a create-and-forget copy would have drawn every crop as a seed for the whole of its life. The `crops` atlas is now loaded alongside the other three.

### 5. The twelve missing sprites (`generate-crop-art.mjs`)

Turnip, carrot, and pumpkin across all four stages, following the wheat painter and `GAME_DESIGN.md` §3.3. **Silhouette carries the crop, not colour** — turnip low and wide, carrot thin and feathered, pumpkin a flat sprawl, wheat tall — so stage 2 stays legible before any of them shows its ripe colour. Stage 0 is a sown mound for all four, named only by the seed-speck accent; a seed in soil is a seed in soil.

Wheat's four committed files are **byte-identical** after the change: the shared `sownMound` gained an optional accent that defaults to Straw.

### 6. Visual regression references (`tests/farming-visual.test.ts`)

Seven reference frames — empty, tilled, seed, sprout, growing, mature, harvested — composed from the same two functions the renderer uses (`tileSpriteKey`, `projectCrops`), driven by a real simulation and compared byte-for-byte.

Two further assertions guard the specific failure this fix exists to end:

- **no two steps of the loop may render identically**, and
- **a harvested tile returns to the tilled frame**, not to bare ground — it stays ready to replant, and has to look that way or the player re-tills for nothing and the game rejects it.

> **Superseded by 07.9** (`docs/phases/phase-07.9-gameplay-polish.md`). The second assertion is now its own inverse: harvesting clears the tilling, so the reference frame returns to BARE GROUND and the test asserts that instead (`GAME_DESIGN.md` §3.6). The reasoning above still holds — the frame must match what the commands will accept — and it is the reason the assertion was inverted rather than deleted.

Regenerate after an intentional change, then review by eye:

```bash
UPDATE_FARMING_REFERENCE=1 npx vitest run tests/farming-visual.test.ts
```

**Scope limit, stated plainly:** these frames prove what the game _decides_ to draw and what the art behind it looks like. They do not exercise a GPU, so z-ordering within the `objects` layer, camera transforms, the dirty gate, and atlas packing are not covered and remain the Playwright suite's job.

---

## Verification

| Gate                       | Result                          |
| -------------------------- | ------------------------------- |
| `npm run typecheck`        | clean (sim, main, renderer)     |
| `npm run lint`             | clean, `--max-warnings 0`       |
| `npm run check:boundaries` | clean                           |
| `npm run check:cycles`     | no violations                   |
| `npm test`                 | 89 files, 1093 tests, 0 skipped |

Unit suite grew from 86 files / 1068 tests to 89 / 1093.

---

## The 8 E2E failures — root cause found, and it was not order

Diagnosed the same day, after the rendering work landed. **The failures were never order-dependent.** They were dependent on which artifact sat in `out/`.

The suite launches `electron .`, which runs the built app. Eight specs drive it through the F1 developer console — `money`, `tick` — because nothing else can fund a farm or skip 900 ticks from outside the process. `electron.vite.config` derives `__FEATURE_DEBUG__` from `!isProduction`, so **`npm run build` compiles the console out entirely**, and Rollup drops every module behind it. That elimination is deliberate and separately asserted by `tests/devtools-excluded-from-production.test.ts`.

`TESTING.md` §7.1 lists the `npm run build` gate on the line immediately above the E2E gate. Running the gates in the documented order therefore guarantees these eight specs fail — each waiting the full 30 s for a `getByLabel('Developer console input')` that is not in the bundle.

Proven in both directions, by experiment rather than inference:

| Build in `out/`                         | `placement.spec.ts` run **entirely alone** |
| --------------------------------------- | ------------------------------------------ |
| `npm run build` (production)            | fails — `locator.fill` timeout, 30.4 s     |
| `VITE_FEATURE_DEBUG=true npm run build` | passes, 1.1 s, spec untouched              |

A single spec run in complete isolation fails identically against a production build. That falsifies "passes in isolation, so it is order-dependent" — the isolation runs that appeared to pass were simply made against a different build. Profile carry-over was already ruled out (`isolated-profile.ts` mkdtemps per launch), and window focus was never the cause: Playwright dispatches keys over CDP, which does not require OS foreground.

**Fixed by** `tests/e2e/global-setup.ts`, which inspects the built renderer for the console and refuses to start without it, naming the command to run. Eight silent 30-second timeouts become one instant, self-explaining failure. `TESTING.md` §7.1 now records the prerequisite.

**Full suite after the fix: 34 passed, 3 skipped, 0 failed.**

### Still outstanding

**One intermittent in `companion.spec.ts`** — the opacity-slider assertion (`expect(getByText('70%'))`) failed once in a full run and passed in the next full run and in all 8/8 isolated runs. Genuinely flaky rather than build-dependent, and unrelated to the above. Not chased; recorded here so the next sighting starts with this note rather than from zero.

**Coverage remains below the gate** at 65.37% lines / 64.28% branches against 80/75. Pre-existing and repo-wide. The modules added here are well covered (`crops-slice.ts` 100%/85.7%, `tile-kinds.ts` 90.9%); only the 45-line pixi wrapper `crop-view.ts` is at 0%, consistent with every other `-view.ts`.

**`npm run format:check` fails on 18 files**, all pre-existing and none touched by this work.
