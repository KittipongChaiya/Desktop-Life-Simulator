# ASSET_VALIDATION_REPORT

> **Status:** The phase-05.6 vertical-slice verdict. The directive's required report (`fix/0.1/5.5Assets I.md`): did the phase-05.5 canon survive contact with production?
> **Owns:** The per-check verification of the golden set, the complete register of canon frictions found while producing it, the recommended documentation updates, the risks, and the phase-06 go/no-go.
> **Does not own:** The canon itself (each finding names its owning doc); the assets (in `assets/src/`, with provenance in `ATTRIBUTION.md` / `GENERATION.md`); the phase's delivery record (`docs/phases/phase-05.6-vertical-slice.md`).

Written at the close of phase-05.6, after 05.6a–d shipped the set and 05.6e added the audio specs. Production mode per the user's governing rule: SCRIPT what honestly reaches production quality, SPEC what cannot, never a low-quality stand-in.

---

## 1. What was validated, and how

**The golden set** — every asset authored strictly from the canon, through the real pipeline (`npm run assets`), with **zero `src/` code changes**:

| Group     | Contents                                                                                               | Mode   |
| --------- | ------------------------------------------------------------------------------------------------------ | ------ |
| terrain   | grass, tilled (new), water, stone, path (new) — 5 seamless tiles                                       | SCRIPT |
| crops     | wheat_0..3 — the golden crop, birthing the fifth atlas                                                 | SCRIPT |
| buildings | tree, rock, bush, flower, storage_shed (production), rest_hut (new)                                    | SCRIPT |
| entities  | worker + player rigs: idle ×4, walk 4×4, harvest ×6 each — 52 frames, 2 sidecars                       | SCRIPT |
| ui-world  | 6 item icons, 4 tool icons, 2 status, 2 chrome, 2 notification — 16                                    | SCRIPT |
| UI set    | panels/buttons/hotbar/tooltip/toast/cursor resolved to `COLOR_PALETTE.md §6` tokens — no bitmap needed | SPEC   |
| portraits | portrait_worker, portrait_player — fully resolved 64×64 prompts                                        | SPEC   |
| audio     | bgm_farm brief + sfx_harvest / step / button / wind / birds briefs                                     | SPEC   |

Totals: **83 sprites, 5 atlases, 18 animations** packed; typecheck/lint/556 tests green at every sub-milestone.

**How verified:** (a) the pipeline's own build-time gates — dimensions, packing, typed manifest keys, animation-frame validation (`ASSETS.md §13, §5`); (b) the deterministic generators — byte-identical re-runs, palette imported by name so an off-palette colour cannot be typed; (c) **the human gate** — four contact-sheet artifacts (world, crop, icons, characters) reviewed against the one-line test at the game's own 4× nearest-neighbour, each sub-milestone paused for the reviewer's verdict.

---

## 2. Per-check verification

| Check                          | Verdict | Evidence                                                                                                                                                                                                                                     |
| ------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Visual consistency**         | PASS    | One shape language across the set (massed lobes: tree → bush → wheat sheaf); 1 px `#3A3640` outline on every standing object, none on tiles (`PIXEL_GUIDE.md §5`); upper-left light everywhere — including mirrored west facings (see §3.11) |
| **Naming consistency**         | PASS    | Every file conforms to `ASSETS.md §6.1` / `NAMING_CONVENTION.md §4.4`; two additive rows were needed (§3.9) and one omission rule recommended (§3.12)                                                                                        |
| **Folder / atlas structure**   | PASS    | Groups per `FOLDER_STRUCTURE.md`; the `crops{tps}/` directory birthed the fifth atlas from the tag alone — `ASSETS.md §4`'s claim, proven live                                                                                               |
| **Palette compliance**         | PASS    | All colour enters tooling as named exports mirroring `COLOR_PALETTE.md`; the retired turnip placeholder's `#D6C4E0` was the only off-palette value found in the repo, and production replaced it (§3.5)                                      |
| **Pixel / size compliance**    | PASS    | Canvases and pivots per `PIXEL_GUIDE.md §2–3` (32² tiles/crops, 64×96 tree, 32×48 characters at the R-07 proportions, 16/24 icons); hard alpha, 1 px safe margins                                                                            |
| **Animation consistency**      | PASS    | All timing in ticks; the calm band held (walk 5 fps, harvest 6×5 t = the exact 30 t sim cost, `ANIMATION_GUIDE.md §2`); tree sway / water shimmer correctly tiered v0.2 — the chunk-baked terrain renderer has no animated path yet          |
| **Style-lock / one-line test** | PASS    | Four human contact-sheet gates; five in-session revisions caught before shipping (mounds invisible on soil, cabbage-read stage 2, merged sheaf heads, hammer-read hoe, monobrow fringe)                                                      |
| **Audio consistency**          | PASS    | Six production briefs (phase doc §05.6e) each against `AUDIO_DIRECTION.md`'s all-day principle; none ship in v0.1 (`VISION.md §5.2`); "Main Theme" translated to `bgm_farm` — this game has no title screen (§3.13)                          |
| **Documentation coverage**     | PASS    | `ATTRIBUTION.md` + `GENERATION.md` cover every file under `assets/src/`; **zero placeholders remain** — terrain, shed, items, and the 16×16 worker were all replaced file-for-file; no undocumented asset exists                             |

**Directive acceptance criteria:** no placeholder-quality assets ✓ (all retired or SPEC'd, never shipped weak) · no conflicts with documentation ✓ (frictions enumerated below; none blocking, two fixed in-canon) · production-ready ✓ (gates + human review) · no undocumented assets ✓ · documentation updated rather than standards invented ✓ (every fix went through the owning doc).

---

## 3. Canon frictions & gaps — the complete register

Found while producing; each names its owner. **Fixed** = corrected in the owning doc during this phase; **Recommended** = queued for the owner.

| #   | Finding                                                                                                                                                                                                                            | Found in | Owner                                            | Status                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | The palette has no flower accent; the daisy uses Parchment petals + Straw heart. Blossom Pink `#E8A9C0` exists but is season-locked (§7)                                                                                           | 05.6a    | `COLOR_PALETTE.md`                               | Recommended                                                             |
| 2   | `ASSETS.md §11` is ambiguous between one attribution file per directory vs per tree; one-per-tree chosen, matching §11's own path-prefixed rows                                                                                    | 05.6a    | `ASSETS.md`                                      | Recommended                                                             |
| 3   | `ASSETS.md §12` requires `.aseprite` sources; for script-authored art the **script is the editable source** (its git history the version, `ADR-006 §2`)                                                                            | 05.6a    | `ASSETS.md`                                      | Recommended                                                             |
| 4   | `tilled.png` now exists but no tile kind renders it — tilled is per-tile state consumed by nothing; a renderer seam awaits phase-06+                                                                                               | 05.6a    | renderer (code, not canon)                       | Observation                                                             |
| 5   | The phase-05d turnip placeholder's `#D6C4E0` appeared in **no palette table** — an off-palette colour shipped unnoticed; retired by production art                                                                                 | 05.6b    | — (retired)                                      | Closed                                                                  |
| 6   | No turnip blush exists; the production turnip is Parchment/Stone-bodied — palette-pure but colder than the vegetable's iconic read                                                                                                 | 05.6b    | `COLOR_PALETTE.md`                               | Recommended                                                             |
| 7   | The warm-produce accents are single hexes with no shadow steps; icons shade in-family (carrot ← Pumpkin, pumpkin ← Carrot Orange) without the palette blessing it                                                                  | 05.6b    | `COLOR_PALETTE.md`                               | Recommended                                                             |
| 8   | No doc states whether crops receive contact shadows; judgment applied: none while ground-level (stages 0–1), subtle once standing (2–3)                                                                                            | 05.6b    | `PIXEL_GUIDE.md §7`                              | Recommended                                                             |
| 9   | No icon category existed for interface-chrome buttons while `NAMING_CONVENTION.md §4.4` forbids inventing tokens — a dead-end the moment a settings button exists                                                                  | 05.6c    | `ICON_GUIDE.md §4` + `NAMING_CONVENTION.md §4.4` | **Fixed** (UI-chrome category + `icon_ui_`/`icon_notification_` rows)   |
| 10  | `UI_STYLE_GUIDE.md §3` specifies button hover as "one step lighter" than Panel Base, but `COLOR_PALETTE.md §6` defines no Panel Light token                                                                                        | 05.6c    | `COLOR_PALETTE.md §6`                            | Recommended                                                             |
| 11  | Worker animation names are unprefixed (`idle_s`) and baked into `worker-render.ts`; the manifest rejects cross-sidecar duplicates, so the player set **must** prefix (`player_idle_s`) — asymmetric naming born of the placeholder | 05.6d    | `ASSETS.md §7` + code                            | Recommended (rename when a `worker-render.ts` change is next scheduled) |
| 12  | `ASSETS.md §6.1` has no directionless-action filename form; `worker_harvest_0.png` omits the direction token per `ANIMATION_GUIDE.md §3`                                                                                           | 05.6d    | `ASSETS.md §6.1`                                 | Recommended                                                             |
| 13  | "Main Theme" exists in no catalog — the game has no title screen; translated to `bgm_farm` ("the home bed — the core working score", `MUSIC_LIBRARY.md §4`)                                                                        | 05.6e    | — (reconciliation)                               | Closed                                                                  |
| 14  | Birdsong is named by `AUDIO_DIRECTION.md §3–4` but had no `SFX_LIBRARY.md` row                                                                                                                                                     | 05.6e    | `SFX_LIBRARY.md §5`                              | **Fixed** (`birds` row added)                                           |
| 15  | Prettier rewrites bare `*` wildcards in markdown tables when two share a line (`worker_*.png, player_*.png` → emphasis); convention: backtick-wrap wildcard filenames                                                              | cross    | doc authoring                                    | **Fixed** in `ATTRIBUTION.md`; convention noted here                    |

**Canon claims proven live** (positive findings): the `ASSETS.md §7.3` file-for-file placeholder swap worked twice with zero code changes (storage shed; the 16×16 → 32×48 worker); the `{tps}` tag birthed a new atlas with zero config; the typed manifest and animation-frame validation held at every step; the palette was sufficient for five asset categories with only the named gaps.

---

## 4. Recommended documentation updates (priority order)

1. **`COLOR_PALETTE.md`** — one reviewed change covering findings 1/6/7/10: a produce-blush accent (turnip; usable for the flower), a stated in-family shading rule for the warm-produce accents, and a Panel Light hover token in §6.
2. **`ASSETS.md`** — §11 attribution granularity (finding 2), §12 script-as-source note (3), §6.1 directionless-action form (12), §7 note on entity-prefixed animation names for future entities (11).
3. **`PIXEL_GUIDE.md §7`** — one line: crops carry no contact shadow until they stand tall (8).
4. **Code, when next scheduled:** a crop renderer consuming the `crops` atlas + a tilled-state tile path (4); the `worker-render.ts` animation-name prefix rename (11).

None of these block phase-06; all are additive.

---

## 5. Risks for phase-06

- **The art wave outpacing review.** The golden set held quality through per-milestone human gates; phase-06's economy wave must keep the same cadence (contact sheet per batch), or drift returns silently. The gate is cheap — keep it.
- **The crops atlas is packed but unconsumed.** Until a crop renderer lands, wheat renders nowhere; do not mistake "packs clean" for "renders correctly". First render of the crop stages should be eyeballed against the contact sheet.
- **SPEC assets await an image model.** Portraits and audio are production-ready _specifications_; when tooling arrives, they still pass through `QUALITY_GUIDELINES.md` review — a resolved prompt is not an approved asset.
- **Palette debt compounds.** Findings 1/6/7/10 are each small; phase-06 food/shop art will hit the produce-shading gap repeatedly. Do the one palette change first.

---

## 6. Verdict

**GO for phase-06.** The canon survived production: five asset categories were authored strictly from the documents by a session holding only the documents, every friction found was small, additive, and owned — none contradictory, none blocking. The two in-phase canon fixes (icon categories, birds row) and the recommendation list above are the complete cost of the first production pass. The golden set ships with zero placeholders, zero undocumented assets, and zero code changes.

---

## 7. Related documents

| Document                                     | Relationship                                            |
| -------------------------------------------- | ------------------------------------------------------- |
| `docs/phases/phase-05.6-vertical-slice.md`   | The phase this report closes; SPEC artifacts live there |
| `docs/assets/README.md §5`                   | The 05.5 reconciliation this phase was built to test    |
| `assets/src/ATTRIBUTION.md`, `GENERATION.md` | Per-asset provenance                                    |
| `QUALITY_GUIDELINES.md`                      | The review bar the human gates applied                  |
| `fix/0.1/5.5Assets I.md`                     | The source directive (untracked, by convention)         |
