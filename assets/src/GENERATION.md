# GENERATION

Per-asset generation provenance (`TECHNICAL_ASSET_SPEC.md §3`), beside
`ATTRIBUTION.md`. For **scripted** assets the model column records the
generating script — the script is the editable source and its git history is
its version (`ADR-006 §2`); the Canon column carries the governing docs' short
hashes as designed. Placeholders are exempt (`TECHNICAL_ASSET_SPEC.md §3.3`)
and appear only in `ATTRIBUTION.md`.

| File                                      | AI model                                    | Prompt                     | Canon                                                     | Generated  | Dependencies                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------- | -------------------------- | --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| terrain/grass_tilled_water_stone_path     | scripted — `scripts/generate-world-art.mjs` | — (deterministic painters) | `COLOR_PALETTE.md @ 3650aff` · `PIXEL_GUIDE.md @ e366f4a` | 2026-07-23 | Seamless as a set; tiles carry no outline (`PIXEL_GUIDE.md §5`)                                                                              |
| buildings/tree_rock_bush_flower           | scripted — `scripts/generate-world-art.mjs` | — (deterministic painters) | `COLOR_PALETTE.md @ 3650aff` · `PIXEL_GUIDE.md @ e366f4a` | 2026-07-23 | Standing-object grammar: 1 px outline, upper-left light, contact shadow                                                                      |
| buildings/storage_shed, rest_hut          | scripted — `scripts/generate-world-art.mjs` | — (deterministic painters) | `COLOR_PALETTE.md @ 3650aff` · `PIXEL_GUIDE.md @ e366f4a` | 2026-07-23 | Silhouettes must stay distinct at a glance (gable vs dome); shed replaces the phase-05d placeholder                                          |
| crops/wheat_0..3                          | scripted — `scripts/generate-crop-art.mjs`  | — (deterministic painters) | `COLOR_PALETTE.md @ 3650aff` · `PIXEL_GUIDE.md @ e366f4a` | 2026-07-23 | Stages per `GAME_DESIGN.md §3.3`; mature wheat is Straw (wood-ramp light), Reward Gold stays reserved                                        |
| ui-world/item_wheat_turnip_carrot_pumpkin | scripted — `scripts/generate-crop-art.mjs`  | — (deterministic painters) | `COLOR_PALETTE.md @ 3650aff` · `ICON_GUIDE.md @ 204f7b4`  | 2026-07-23 | Replace the phase-05d placeholder discs file-for-file; turnip is Parchment-bodied — the palette has no turnip blush (validation-report note) |
