# Phase 05.6 — Vertical Slice (The Golden Set)

> **Delivers:** The project's first production-quality asset set — a small, complete vertical slice that proves the phase-05.5 canon is complete, consistent, and production-ready before phase-06's art wave.
> **Runnable at completion:** Everything that ran at phase-05.5 still runs. New source art flows through the existing asset pipeline (`npm run assets`); **no renderer, sim, or UI code changes** — assets fill sprite keys the content already references, or create pre-wired keys future phases consume.
> **Governing rule (the user's production mode):** _produce every asset that can honestly meet production quality with the available tooling; for assets that cannot, deliver production-ready specifications and fully resolved generation prompts — never a low-quality stand-in._

Source directive: `fix/0.1/5.5Assets I.md`. This is the "golden set" the phase-05.5 reconciliation report recommended as its first improvement (`docs/assets/README.md §5.3`): find canon gaps on a handful of assets, not during phase-06's forty.

---

## Why this phase exists, and why here

Phase-05.5 wrote ~25 documents asserting that a session with no memory can generate art that lands inside one coherent world. That claim is untested. This phase tests it the only way it can be tested — by production: every asset below is authored strictly from the canon (`STYLE_LOCK.md`, `COLOR_PALETTE.md`, `PIXEL_GUIDE.md`, the bibles, the guides), and every friction, ambiguity, or contradiction met along the way is recorded in `ASSET_VALIDATION_REPORT.md` and fixed **in the documentation**, not routed around (per the directive: _"recommend updates to the documentation rather than inventing new standards"_).

Placed before phase-06 for the same reason 05.5 was: economy art is the first big wave, and the canon must be proven before the wave, not by it.

Recorded per `PLAN.md §9.1` as an insertion; it moves no feature scope earlier (`PLAN.md §9.2`) — it produces assets and specs only.

---

## Production modes

Every deliverable is tagged with one of:

| Mode          | Meaning                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SCRIPT**    | Produced as real PNGs by deterministic pixel-art scripts (`scripts/generate-*-art.mjs`), committed to `assets/src/`, packed by the pipeline. The house already works this way (`ASSETS.md §7.3`); this phase raises it from placeholder to production.                                                                                                       |
| **SPEC**      | A production-ready specification + fully resolved generation prompt (`PROMPT_LIBRARY.md` instance with every value filled in), ready to run through an image model and review through `QUALITY_GUIDELINES.md`. Used where scripted art cannot honestly reach production quality (portraits, organic character detail) or the medium is out of reach (audio). |
| **N/A + why** | The directive item does not exist in this game's canon; the reconciliation table below records the translation.                                                                                                                                                                                                                                              |

**The bar for SCRIPT is the one-line test** (`STYLE_LOCK.md`): _would a player believe the same hand made this and the rest?_ Assets that pass ship; assets that don't are demoted to SPEC rather than shipped weak. The human gate is the contact sheet (§Working method).

---

## Directive → canon reconciliation

The directive's item list predates the canon; names are translated, never copied (`NAMING_CONVENTION.md §2`'s standing rule):

| Directive item                    | Canon resolution                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Crop "Corn"                       | **Wheat** — marked "Example" in the directive; the v0.1 crop table (`GAME_DESIGN.md §3.1`) is turnip/wheat/carrot/pumpkin, and `crops.ts` already references `crops:wheat_0..3`. Adding corn would add content scope (`CONTENT_RULES.md C-16`, `AI_RULES.md §3.2`). |
| Crop "Seed / Stage 1–3 / Harvest" | The **four canonical stages** `wheat_0..3` (seed → sprout → growing → mature, `GAME_DESIGN.md §3.3`). "Seed" is stage 0; "harvest" is the mature stage the harvest action consumes.                                                                                 |
| Crop "Dropped Item"               | **N/A in v0.1** — resources never lie on the ground; transfer is container-to-container (`GAME_DESIGN.md §4.6`, ADR-011). The item icon serves any future ground-drop rendering.                                                                                    |
| "Soil Tile"                       | `tilled.png` — the tilled-soil state (`GAME_DESIGN.md §2.2`), today rendered by nothing.                                                                                                                                                                            |
| "Crop Field" (building)           | **N/A as a building** — a field is tilled tiles; covered by the soil tile above.                                                                                                                                                                                    |
| "Small House"                     | **Rest Hut** (`core:rest_hut`, `GAME_DESIGN.md §5`) — the canon's actual small dwelling-shaped building, and phase-06 content. No generic house exists in v0.1.                                                                                                     |
| "Storage"                         | **Storage Shed** — production upgrade of the shipped placeholder (`buildings:storage_shed`, wired).                                                                                                                                                                 |
| "Player Farmer"                   | The **player avatar** (`CHARACTER_BIBLE.md §2, §7`): the worker rig + one distinguishing accent garment.                                                                                                                                                            |
| "Notification Example"            | The **inline transient message** (`GAME_DESIGN.md §8.2`, §10.1 — no modals); never an OS notification (`VISION.md §5.1`).                                                                                                                                           |
| "Mouse Cursor"                    | Resolved in 05.6c against `UI_STYLE_GUIDE.md` (the UI is DOM, `ADR-005` — a cursor is CSS, not a sprite).                                                                                                                                                           |
| Audio items                       | **SPEC only** — no audio ships in v0.1 (`VISION.md §5.2`); the directive itself asks for the Main Theme as a specification. Each spec is a production brief against `AUDIO_DIRECTION.md` + the libraries.                                                           |
| "Tree / Water animation"          | Validated as **v0.2 specs** (`ANIMATION_GUIDE.md §3` already tiers ambient sway/shimmer at v0.2; the current chunk-baked terrain renderer has no animated-tile path). Static tree and water tiles ship now.                                                         |

Two standing reconciliations for script-authored art, recorded here once:

- **`.aseprite` sources** (`ASSETS.md §12`): a script-authored asset's editable source **is the script**, committed alongside. The `.aseprite` requirement applies to hand- or model-authored art; the validation report carries this note for `ASSETS.md` to adopt.
- **`GENERATION.md` provenance** (`TECHNICAL_ASSET_SPEC.md §3`): for scripted assets the model column records the generating script path (its git history is its version, `ADR-006 §2`); the Canon column records the palette/pixel-guide hashes as designed.

---

## Delivery status

| Milestone | Scope                                                                                                                                                                          | Mode          | Status        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------- |
| **05.6a** | Tooling lib + terrain set (grass, tilled, water, stone, path) + props (tree, rock, bush, flower) + buildings (storage shed, rest hut) + attribution/provenance + contact sheet | SCRIPT        | **Delivered** |
| **05.6b** | The golden crop: `wheat_0..3` (new `crops` atlas) + production `item_*` icons                                                                                                  | SCRIPT        | **Delivered** |
| **05.6c** | Icon set + UI set (panel, buttons, hotbar, tooltip, cursor, notification) per `UI_STYLE_GUIDE`                                                                                 | SCRIPT + SPEC | **Delivered** |
| **05.6d** | Characters: worker + player rigs (idle/walk/harvest), animation metadata; portraits                                                                                            | SCRIPT + SPEC | **Delivered** |
| **05.6e** | Audio production specs + `ASSET_VALIDATION_REPORT.md` + final review; close the phase                                                                                          | SPEC + report | **Delivered** |

**Phase 05.6 is complete.** The verdict lives in `docs/assets/ASSET_VALIDATION_REPORT.md`: **GO for phase-06** — the canon survived production with fifteen small findings (two fixed in-canon during the phase, the rest queued additively), zero placeholders remaining, zero undocumented assets, zero `src/` changes across all five sub-milestones.

Execution order: tooling first (everything else uses it), characters late (hardest SCRIPT call), the report last (it can only validate finished work).

**05.6a delivered** — the production world set, 11 assets through the real pipeline (35 sprites, 4 atlases packed; typecheck/lint/556 tests green; zero `src/` changes):

- **Tooling:** `scripts/lib/pixel-art.mjs` (rectangular RGBA PNG encode/decode, the palette imported by name from `COLOR_PALETTE.md`, silhouette-outline / contact-shadow / seeded-PRNG helpers enforcing `PIXEL_GUIDE.md §5–7`) and `scripts/generate-contact-sheet.mjs` (the standing human-gate composer: tiles 2×2 for seam checking, standing art over Grass Base, 4× nearest-neighbour).
- **Terrain (`terrain{tps}/`):** production `grass`, `water`, `stone` replacing placeholders, plus **new `tilled` and `path`** — filling sprite keys `tile-kinds.ts` and the soil state already reference with no art behind them. Seamless, outline-free, low-contrast per the attention hierarchy.
- **Props & buildings (`buildings{tps}/`):** `tree` (64×96, canopy overhang), `rock`, `bush`, `flower` (Parchment-petal daisy — the palette has no flower accent; gap recorded for the validation report), production `storage_shed` (gable, replaces the phase-05d placeholder file-for-file), and **new `rest_hut`** (rounded dome — phase-06 content pre-wired; silhouettes deliberately distinct).
- **Provenance:** `assets/src/ATTRIBUTION.md` (closing the pre-existing `ASSETS.md §11` gap — no attribution file existed anywhere) and `assets/src/GENERATION.md` (`TECHNICAL_ASSET_SPEC.md §3` rows; scripted assets record the generating script as their model, canon hashes as versions).
- **Review:** contact-sheet artifact published for the human gate; iteration already applied once (thatch specks outside silhouettes, eave-wing outline artifacts, dithered dome highlight).

---

## Deliverables by sub-milestone

### 05.6a — World art & tooling

- [x] `scripts/lib/pixel-art.mjs` — the shared production library: rectangular RGBA PNG encoder, the named palette from `COLOR_PALETTE.md` (values imported once, never re-typed per script), outline/contact-shadow/dither helpers enforcing `PIXEL_GUIDE.md §5–7`.
- [x] `scripts/generate-world-art.mjs` — terrain tiles at 32×32, flat top-down, **no outline** (`PIXEL_GUIDE.md §5`): `grass`, `tilled` (new — fills the soil-state gap), `water`, `stone`, `path` (new — fills the `terrain:path` key `tile-kinds.ts` already references). Props on the standing-object grammar (1 px `#3A3640` outline, upper-left light, contact shadow, shallow 3/4 tilt): `tree` (64×96, canopy overhang), `rock`, `bush`, `flower` (32×32). Buildings: production `storage_shed`, new `rest_hut` (32×32, `PIXEL_GUIDE.md §2`).
- [x] `ATTRIBUTION.md` — one file at `assets/src/` covering every group, matching `ASSETS.md §11`'s own path-prefixed example rows (the "per directory vs per tree" ambiguity is recorded for the validation report) — **closing an existing compliance gap**: §11 mandates attribution and none existed.
- [x] `GENERATION.md` beside it per `TECHNICAL_ASSET_SPEC.md §3`.
- [x] `npm run assets` packs clean; manifest keys verified; all gates green; contact-sheet artifact for visual review.

### 05.6b — The golden crop

- [x] `assets/src/crops{tps}/wheat_0..3.png` — the first real occupant of the `crops` atlas group (`ASSETS.md §4`), 32×32, bottom-center growth (`PIXEL_GUIDE.md §2`), stages per `GAME_DESIGN.md §3.3`, filling the `crops:wheat_*` keys `crops.ts` already declares.
- [x] Production `item_wheat.png` (16×16, `ICON_GUIDE.md`) — plus the other three shipped item icons if the same painter honestly generalises; otherwise wheat only.
- [x] Provenance + attribution rows; contact sheet.

**05.6b delivered** — the golden crop plus all four production item icons (the painter generalised honestly), through the real pipeline: 39 sprites, **5 atlases** — the `crops` atlas now exists, born from the new `crops{tps}/` directory alone (the `{tps}` tag is the group boundary, `ASSETS.md §4`; zero config or code changes). `world-view.ts` loads atlases by explicit name, so the crops atlas is packed but unconsumed until phase-06 wires a crop renderer — exactly the pre-wired-seam pattern.

- **`scripts/generate-crop-art.mjs`** — wheat's four stages tell the growth story by silhouette alone: sown mounds (fresh-turned Wood Base earth + Straw seed specks) → shoots rising from those same mounds (Leaf Highlight new growth) → a waist-high fan of blades (first Straw hints at two tips) → the full golden sheaf (massed-lobe silhouette — the 05.6a tree/bush shape language — Straw over Wood Light, kernel speckle, awn ticks, visible stalks to the ground). Mature wheat is Straw, the light end of the wood ramp (`COLOR_PALETTE.md §3.2`); **Reward Gold stays reserved** (`STYLE_LOCK.md R-09`).
- **Item icons** (`ICON_GUIDE.md`): tied sheaf / pale round root with leafy crown / tapering carrot / squat ribbed pumpkin — four distinct silhouettes (`R-14`), full 1 px outline, upper-left light, hard alpha, comparable visual weight.
- **Contact-sheet composer** gained `soil:` (crops judged over the game's own tilled tile — the ground they are planted on) and `ui:` (icons on the Parchment panel base) modes.
- **Review iteration applied once:** mounds were invisible on the tilled tile (Tilled Soil on tilled soil — recoloured to fresh-turned Wood Base); stage 2's lobe mass read as a cabbage (redesigned as a blade fan); the icon sheaf's three heads merged (respaced with internal-outline gaps).
- **Canon frictions recorded for the validation report:** the phase-05d turnip placeholder's `#D6C4E0` was **off-palette** (no table lists it); the palette has no turnip blush, so the production turnip is Parchment/Stone-bodied — palette-pure but colder than the vegetable's iconic read; the warm-produce accents have no shadow steps (the carrot shades with Pumpkin, the pumpkin lightens with Carrot Orange — in-family adjacency the palette never blesses); no doc says whether crops receive contact shadows (judgment: none while ground-level at stages 0–1, subtle at stages 2–3).

### 05.6c — Icons & UI

- [x] Icon set per `ICON_GUIDE.md` categories and `NAMING_CONVENTION.md §4.4` naming — the directive's corn/wood/stone/money/water/worker/inventory/settings translated to canon items and categories (money → the coin/Reward-Gold read; wood/stone tier-tagged as future-content icons).
- [x] UI set resolved against `UI_STYLE_GUIDE.md` + `ADR-005`: what the DOM styles with CSS tokens is **spec'd as tokens**, what needs bitmap art (9-slice frames, cursor, hotbar cells) is scripted. Inline-notification example follows `GAME_DESIGN.md §8.2`.

**05.6c delivered** — twelve production icons (SCRIPT) and the UI set fully resolved (SPEC): 51 sprites, 5 atlases; typecheck/lint/556 tests green; zero `src/` changes.

**The icons** (`scripts/generate-icon-art.mjs`, all in `ui-world{tps}/`):

| Directive item | Delivered as                            | Notes                                                                                     |
| -------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| corn           | `item_wheat.png`                        | Delivered in 05.6b                                                                        |
| wood, stone    | `item_wood.png`, `item_stone.png`       | Tier-tagged future-content (no v0.1 item exists); stone reuses the rock prop's facet read |
| money          | `icon_status_coin.png`                  | The one deliberate **Reward Gold** spend (`ICON_GUIDE.md §3`); Gold Highlight glint       |
| water          | `icon_tool_can.png`                     | The `3` toolbar slot (`GAME_DESIGN.md §8.3` names the tool "can")                         |
| worker         | `icon_status_worker.png`                | Earth-cloth tunic bust (`COLOR_PALETTE.md §3.5`)                                          |
| inventory      | `icon_ui_inventory.png`                 | New **UI chrome** category (below)                                                        |
| settings       | `icon_ui_settings.png`                  | Stone-ramp gear ("raw metal" role), punched hub                                           |
| — (UI set)     | `icon_tool_hoe/seed/hand.png`           | Completing the `1`–`4` toolbar at 24×24                                                   |
| — (UI set)     | `icon_notification_success/caution.png` | The `ICON_GUIDE.md §4` Notification glyphs: green tick, calm amber mark — never red       |

**Canon fixed in this commit** (working method rule 5 — small fix in the owning doc): `NAMING_CONVENTION.md §4.4` forbids inventing category tokens and `ICON_GUIDE.md §4` enumerated no category for interface-chrome buttons — a real gap the moment a settings button exists. Added the **UI chrome** category row to `ICON_GUIDE.md §4` and the `icon_ui_<name>.png` + `icon_notification_<name>.png` rows to the `NAMING_CONVENTION.md §4.4` table.

**The UI set, resolved (SPEC — no bitmap art needed anywhere):** the interface is DOM/React (`ADR-005`) and every directive UI item resolves to existing tokens — `COLOR_PALETTE.md §6` values applied per `UI_STYLE_GUIDE.md`:

| UI item                         | Resolution                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Panel frame                     | CSS: Panel Base fill, 2 px Panel Edge border, Panel Shadow inset groove, small radius, no shadow/blur (`UI_STYLE_GUIDE.md §2`). No 9-slice bitmap — CSS achieves the look; `ui_<panel>.png` stays reserved.  |
| Buttons                         | Parchment fill + dark edge; hover one step lighter, active Panel Shadow, disabled Panel Shadow + Text Muted + tooltip reason, focus 2 px Selection outline, primary trim Carrot Orange (`§3`)                |
| Hotbar                          | CSS square cells on the 4 px rhythm, `icon_tool_*` sprites inside, slot number, active = pressed + accent trim (`§4`)                                                                                        |
| Tooltip                         | Parchment chip, 1 px edge, Text Primary, no shadow (`§5`)                                                                                                                                                    |
| Notification                    | Inline transient parchment toast (`GAME_DESIGN.md §8.2`, `§10.1` rule 1): `icon_notification_*` glyph + text, self-fading, positive may carry Positive green / Reward Gold, caution Warning Amber, never red |
| Cursor                          | **No sprite.** OS pointer over UI; the in-world hover/selection affordance (shipped in phase-03.6) signals the tool (`UI_STYLE_GUIDE.md §8`); optional tool-tint stays deferred                              |
| Mouse cursor sprite (directive) | **N/A** — resolved by the row above; a cursor is CSS/OS in this architecture                                                                                                                                 |

**Canon friction recorded for the validation report:** `UI_STYLE_GUIDE.md §3` specifies hover as "one step lighter" than Panel Base, but `COLOR_PALETTE.md §6` defines no Panel Light token — the nearest value is Text Inverse `#F4EFE6`, a text colour. Recommend §6 add a dedicated hover/lift step.

**Review iteration applied once:** the first hoe read as a hammer (symmetric head atop the handle); redrawn as the Γ profile — flat collar off the handle tip, thin blade sweeping down.

### 05.6d — Characters

- [x] Production worker rig at 32×48 (`PIXEL_GUIDE.md §2`, `CHARACTER_BIBLE.md`): idle + 4-frame walk × 4 directions (replacing the 16×16 placeholders, same filenames — `ASSETS.md §7.3`), **new harvest one-shot** (4–6 frames fitting 30 t, `ANIMATION_GUIDE.md §2–3`), `worker.anim.json` updated.
- [x] Player avatar: the worker rig + the one accent garment (`CHARACTER_BIBLE.md §7`), same animation set, pre-wired for the future player entity.
- [x] SCRIPT/SPEC decision recorded per asset against the one-line test; portraits (64×64, `PIXEL_GUIDE.md §2`) are **SPEC** — fully resolved prompts.

**05.6d delivered** — 52 character frames (SCRIPT) from one shared rig painter, two portrait prompts (SPEC): 83 sprites, 5 atlases, 18 animations; typecheck/lint/556 tests green; zero `src/` changes.

- **One rig, two costumes** (`scripts/generate-character-art.mjs`): the standard human rig exactly per the `R-07` anchor — 32×48 canvas, ≈40 px standing height, **1:4 head** (≈10 px), 16 px figure, mittened limbs, dark-dot eyes. The **worker** wears the §6/§11 tells (straw work-hat + apron over earth cloth, warm skin, brown hair — matching the `icon_status_worker` bust); the **player** is the same body with bare dark hair and the **one accent garment**: a Water-ramp scarf (`CHARACTER_BIBLE.md §6` — the accent is the player's identity, never reused on workers). Both replace/land at production 32×48; the worker's 16×16 placeholders were replaced **file-for-file with zero code changes** — live validation of the `ASSETS.md §7.3` / `PIXEL_GUIDE.md §2` canvas-swap claim.
- **Animation sets:** idle (static ×4 dirs) + the calm 5 fps walk (4 frames ×4 dirs) + the **new harvest one-shot** — 6 frames × 5 `frameTicks` = exactly the 30 t sim cost (`ANIMATION_GUIDE.md §2`): dip, reach, pluck at the ground, lift the sheaf, carry at the chest, settle. Harvest is directionless per `ANIMATION_GUIDE.md §3` (directions animate only where the action has facing). `worker.anim.json` gains `harvest`; new `player.anim.json` carries the full player set.
- **The light never mirrors:** west views mirror the east geometry, then a **world-fixed shading pass** applies the upper-left light after mirroring — every facing shares one sky (`STYLE_LOCK.md R-06`).
- **SCRIPT/SPEC decisions:** worker rig SCRIPT (passes — a cozy person of the same hand as the world); player rig SCRIPT; **portraits SPEC** — a 64×64 bust with "a little more facial detail" (`CHARACTER_BIBLE.md §4`) is exactly the organic detail deterministic painters cannot honestly reach; demoted per the governing rule, never shipped weak.
- **Review iteration applied once:** the first paint's hair fringe touched the eye row and read as a monobrow; the fringe was raised so a forehead row separates them.
- **Canon frictions recorded for the validation report:** (a) the worker sidecar's animation names are unprefixed (`idle_s`) and baked into `worker-render.ts`; a second entity therefore **must** prefix (`player_idle_s`) because the manifest rejects duplicate names — asymmetric naming born of the placeholder; recommend entity-prefixed names whenever a code change is next scheduled for `worker-render.ts`. (b) `ASSETS.md §6.1`'s pattern has no directionless-action form — `worker_harvest_0.png` omits the direction token per `ANIMATION_GUIDE.md §3`; recommend §6.1 document the omission rule.

**Portrait SPECs (fully resolved, paste-ready — `PROMPT_LIBRARY.md` §1 preamble + §1.1 palette block + body + §1.2 negative):**

> **`portrait_worker.png`** (64×64, v0.3, `NAMING_CONVENTION.md §4.5`):
> _Cozy hand-crafted pixel art, flat shading, single warm dark outline. One soft light from the upper-left. Hard-edged pixels — no anti-aliasing, no blur, no gradients. Limited warm palette only. 1-pixel outline in #3A3640, never black. Warm, calm, optimistic mood._
> _A warm character portrait bust of the farm worker: an adult with warm skin #D8A878 (shadow #B07E50), brown hair #5A3A28 under a straw work-hat #E0C260 (shade #B58A5E), practical earth-toned work clothes — #96704A tunic with a #B58A5E apron strap. A little more facial detail than the world sprite but still simple: two dark #2A2733 eyes, soft content smile, no nose realism. 64×64, centred bust, plain transparent background._
> _NEGATIVE: anti-aliasing, blur, soft edges, gradients, drop shadow, glow, black outline (#000000), variable line weight, realistic or 3D rendering, photorealism, high detail, colours outside the palette, neon, muddy tones, text, watermark._

> **`portrait_player.png`** (64×64, v0.3):
> _Same preamble and negative as above._
> _A warm character portrait bust of the player avatar: an adult with tan skin #B07E50 (shadow #8A5E38), dark hair #4A4557, and the water-blue scarf #3E7FA8 (light #6BB0D0) as the single accent garment over a #96704A earth tunic. A little more facial detail than the world sprite but still simple: two dark #2A2733 eyes, calm friendly expression. 64×64, centred bust, plain transparent background._

### 05.6e — Audio specs, validation report, close

- [x] Production briefs for: Main Theme, harvest SFX, footstep SFX, button SFX, ambient wind, bird ambience — each a complete, self-sufficient spec against `AUDIO_DIRECTION.md` / `MUSIC_LIBRARY.md` / `SFX_LIBRARY.md` (tempo/key/instrumentation intent, loop points, file name per `NAMING_CONVENTION.md §4.1–4.2`, tier).
- [x] `docs/assets/ASSET_VALIDATION_REPORT.md` — the directive's required report: per-check verification (visual/naming/folder/palette/pixel/animation/style/audio consistency, documentation coverage), every canon gap or friction found while producing 05.6a–d, missing documentation, recommended doc updates, risks, and the phase-06 go/no-go.
- [x] Flip this phase's status; CHANGELOG; close.

**05.6e delivered** — six audio production briefs (below), the validation report, two small canon fixes (`SFX_LIBRARY.md §5` gains the `birds` row `AUDIO_DIRECTION.md §3–4` already promised; `ATTRIBUTION.md`'s prettier-mangled `*` wildcards repaired with the backtick convention). Two directive reconciliations: **"Main Theme" → `bgm_farm`** — this game has no title screen; its main theme is the home bed, "the core working score" (`MUSIC_LIBRARY.md §4`); **"bird ambience" → `sfx_birds`** via the new catalog row. All audio is SPEC — none ships in v0.1 (`VISION.md §5.2`); every brief obeys the one principle: _audio you can leave running all day_ (`AUDIO_DIRECTION.md §1`).

**Audio production briefs (SPEC — WAV source → `.ogg` via `ADR-006 §8`, lazy-loaded, never blocking startup; all v0.2):**

> **`bgm_farm.ogg`** — the main theme (`MUSIC_LIBRARY.md §4`: warm, tended, the core working score). Tempo ≈ 68–76 BPM, unhurried; a soft pastoral major (F or G). Instrumentation per `AUDIO_DIRECTION.md §2`: nylon guitar and warm felt piano carrying gentle fragments, light strings and a low warm pad beneath, distant woodwind colour — **no driving percussion, no loud melody**. Structure: a 3–4 minute seamless loop of long, low-contour phrases that **falls to near-silence at least once mid-loop** (music breathes, §2); no motif recurring sharply enough to grate on the hundredth pass (§8). Loop point lands on a sustained pad tone, click-free. Mix: generous headroom, comfortably below the player's other audio (§7) — muting it entirely must leave a perfectly playable game.

> **`sfx_harvest.wav`** — the loop's payoff (`SFX_LIBRARY.md §2`: a crisp, pleasing rustle-and-pluck). Syncs to the 30-tick harvest animation (`GAME_DESIGN.md §4.3`, `ANIMATION_GUIDE.md §2`): total ≤ 1.5 s; a dry-grass rustle rises through the reach, one soft rounded pluck transient lands on the ground-touch beat (≈ 0.6–0.9 s in — frames 2–3 of the one-shot), a light straw-settle tail as the sheaf lifts. Satisfaction, not spectacle (`AUDIO_DIRECTION.md §6`); no metallic ring, nothing sharp. Sits above ambience, below the reward chime in the §7 hierarchy.

> **`sfx_step_0..3.wav`** — footfalls felt more than heard (`SFX_LIBRARY.md §3`). Four zero-indexed round-robin variants (`NAMING_CONVENTION.md §4.2`) so repetition never patterns. Each ≤ 150 ms: a soft soil thud, low-passed, no heel click. Steps land on the walk's contact frames (0 and 2 of the 5 fps gait). The very bottom of the mix; with several workers walking, steps thin out rather than stack.

> **`sfx_button.wav`** — the interface's voice (`SFX_LIBRARY.md §6`: a gentle, low click). ≤ 80 ms, a woody/felt tick — a well-worn toolbox latch, never a digital beep. Quiet by default; never a harsh alert (`AUDIO_DIRECTION.md §5`).

> **`sfx_wind.wav`** — the ambient bed's base layer (`SFX_LIBRARY.md §5`: a gentle, low breath through foliage). A ≥ 60 s seamless loop: soft low-passed air with occasional unhurried foliage rustle; **no gust ever spikes** (`AUDIO_DIRECTION.md §3` — nothing in the bed startles). Click-free splice; holds a steady low level under everything.

> **`sfx_birds.wav`** — farm birdsong (`SFX_LIBRARY.md §5`, the row added this phase). A ≥ 90 s loop that is **mostly rests**: two or three distant, distinct chirp phrases separated by long silence — sparse, never chattering, no alarm calls (silence is a valid loop state, `AUDIO_DIRECTION.md §8`). Daytime farm layer over the wind bed (§4).

---

## Working method

Adapted from the standing cadence; declared here as the phase doc of record:

1. **One sub-milestone at a time**, one clean conventional commit each, pause for "continue" between.
2. **No sim/renderer/UI code changes.** Generator scripts are build tooling (like the placeholder scripts they succeed); they are exercised by their output, which the pipeline itself validates (`ASSETS.md §13` — dimensions, packing, manifest). If any phase task turns out to require touching `src/`, that task stops and is re-scoped — it does not proceed quietly.
3. **Gates before every commit:** `npm run assets` packs clean, `npm run typecheck`, `npm run lint`, `npm run test` all green; `git status` clean apart from intended files.
4. **The human gate:** every SCRIPT sub-milestone publishes a contact-sheet artifact (sprites at 4×, against grass and parchment backgrounds) for visual review against `QUALITY_GUIDELINES.md`. "Production-ready" is the reviewer's verdict, not the script's claim.
5. **Canon feedback loop:** any ambiguity the canon fails to answer while producing is recorded in the validation report **and** fixed in the owning doc in the same commit when the fix is small; larger fixes are recommended in the report.
6. **Every commit updates this doc** (status row + summary) and adds a `CHANGELOG.md [Unreleased]` entry.

---

## References

- Source directive: `fix/0.1/5.5Assets I.md`
- The canon under test: `docs/assets/*` (05.5a–f), `docs/design/*` (05.5g)
- Technical owners: `docs/ASSETS.md`, `ADR-006`, `docs/PERFORMANCE.md`, `docs/GAME_DESIGN.md`
- Recommendation this phase fulfils: `docs/assets/README.md §5.3` (golden set first)
