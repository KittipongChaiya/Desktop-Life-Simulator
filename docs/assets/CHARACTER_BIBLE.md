# CHARACTER_BIBLE

> **Status:** Authoritative for how every character looks. The canon a session obeys when generating any person or creature.
> **Owns:** The character visual canon — body proportions, head-to-body ratio, height classes, age groups, face/eye/hair style, clothing-as-role, equipment attachment points, animation personality, emotion style, silhouette rules, colour-usage rules, accessory rules, readability, recognition distance, and future customization rules.
> **Does not own:** Canvas sizes and pivots (`PIXEL_GUIDE.md §2, §3`); the immutable prohibitions (`STYLE_LOCK.md` — especially `R-07`, which points _here_ for proportions); colour hex values (`COLOR_PALETTE.md §2–3`, esp. the skin/hair/cloth values in `§3.5`); animation format and tick timing (`ASSETS.md §7`); character _mechanics_ — worker cost, FSM, energy (`GAME_DESIGN.md §4`); and character _narrative_ — names, families, roles (`LORE_BIBLE.md`).

**Boundary note.** `GAME_DESIGN.md §4` owns what a worker _does_ (hire cost, the five-state machine, energy, carrying capacity). `LORE_BIBLE.md` owns _who_ they are in the fiction. This document owns only what they _look like_ — and, through `STYLE_LOCK.md R-07`, is the fixed authority for character proportions that every future session must match. When a look here would contradict a mechanic there, the mechanic wins and this file is corrected.

The problem this file solves: a worker the player recognises in one glance (`VISION.md §3.1`) must be the same shape in every frame, every animation, and every phase — even though a hundred independent sessions with no shared memory will draw them (`VISION.md §2.5`). Proportion and silhouette are identity; they are fixed here so they never drift.

---

## 1. The roster

| Character         | Status | Rig                        | Notes                                                                                       |
| ----------------- | ------ | -------------------------- | ------------------------------------------------------------------------------------------- |
| **Player avatar** | v0.1   | Standard human rig (§2)    | The hand the player acts through; same rig as workers, one distinguishing accent (§7).      |
| **Worker**        | v0.1   | Standard human rig         | The automation layer (`GAME_DESIGN.md §4`); practical earth-toned dress.                    |
| Villager          | v0.3   | Standard human rig         | Town residents; the widest visual variety.                                                  |
| Merchant          | v0.3   | Standard human rig         | A trade role read by dress + one accent, not a new body.                                    |
| Generic NPC       | v0.3   | Standard human rig         | Any future person reuses the rig (`GAME_DESIGN.md §11` — the FSM generalises to any actor). |
| Monster           | v1.0   | **Own rig** (breaks §2)    | Non-human proportions; still one line, one light, one palette (§12).                        |
| Boss              | v1.0   | **Own rig**, larger canvas | A set-piece silhouette; the only characters allowed to feel imposing.                       |

Everything above **Monster** shares one body — the "standard human rig" of §2. That single shared rig is what makes a villager, a merchant, and a worker look like people of the same world rather than art from three different games.

---

## 2. The standard human rig (the R-07 anchor)

This section is what `STYLE_LOCK.md R-07` protects. The numbers are fixed; a session may not "improve" them.

Authored on the **32 × 48 character canvas, bottom-center pivot `(0.5, 1)`** (`PIXEL_GUIDE.md §2, §3` — this file does not restate canvas or pivot, only what fills it).

- **Standing adult height ≈ 40 px** of the 48 px canvas. The rest is transparent headroom (`PIXEL_GUIDE.md §4`); feet sit on the bottom safe margin so the figure grounds correctly.
- **Figure width ≈ 16–18 px** (`PIXEL_GUIDE.md §2`) — a compact, slightly stocky build that reads at overlay scale.
- **Head-to-body ≈ 1 : 4.** The head is roughly **one quarter of standing height** (≈ 10 px on a 40 px adult). This is a gently large, cozy head — deliberately between realistic (~1 : 7, too austere) and chibi (~1 : 2, too toy-like). It is the single most important proportion in the game and the least negotiable.
- **Simple limbs, no fingers.** Arms and legs are 2–3 px thick; hands are mittened rounds, not articulated. Detail below ~2 px dies at gameplay zoom (`STYLE_LOCK.md R-16`).

### 2.1 Height classes

All classes keep the **1 : 4 head ratio** — a shorter character has a proportionally similar head, which keeps everyone in the same family. Only the body scales.

| Class        | Standing height | Used by                                |
| ------------ | --------------- | -------------------------------------- |
| Child        | ≈ 30 px         | Village children (v0.3)                |
| **Standard** | ≈ 40 px         | Player, workers, most adults           |
| Tall         | ≈ 44 px         | Occasional NPCs for silhouette variety |

Non-human creatures (monsters, bosses) are **not** height classes — they leave the human rig entirely and are authored on their own canvas (§12).

### 2.2 Age groups

Age is shown by **proportion and shading, never by realism.** Children use the Child class and a slightly larger head within it; elders read through Stone/Parchment hair (`COLOR_PALETTE.md §3.5`), a slight stoop in idle, and a walking staff accessory — never through wrinkles or detailed faces, which do not survive the pixel budget.

---

## 3. Silhouette, readability & recognition distance

A character must be identifiable **by outline alone**, because the outline is what survives the glance (`ART_DIRECTION.md §1`).

- **Silhouette-first.** Before any interior colour, the black-shape read must already say "person," and ideally "which person." Role is carried by silhouette (hat, tool, apron) as much as by colour, so the read survives colour-vision deficiency (`STYLE_LOCK.md R-14`).
- **Recognition distance = one tile.** A character must be told apart from another role at 1× overlay scale from roughly one tile away. If two roles are indistinguishable at that distance, differentiate the silhouette (headwear/tool), not the palette.
- **One clear reading pose.** Each character has an unambiguous facing per direction; limbs never merge into the torso blob at rest.
- **The outline unifies and separates.** Every character carries the shared 1 px `#3A3640` outline (`PIXEL_GUIDE.md §5`, `STYLE_LOCK.md R-04`); it is what guarantees a figure separates from grass or soil regardless of hue (`COLOR_PALETTE.md §9`).

---

## 4. Face

The face is **minimal by mandate.** At ~10 px, a face is a few pixels; over-drawing it produces noise, not expression.

- **Eyes:** two dark dots or 1 px marks (Ink Shadow `#2A2733`). No whites, no iris detail. Spacing and height carry all the character a face needs.
- **Mouth:** usually omitted; a single soft pixel or short line only when an expression genuinely needs it (§5 emotion).
- **No nose, no individual features** at standard scale. Identity comes from hair, headwear, and dress, not facial detail.
- **Front and 3/4 facings** show the face; the back facing shows none. Faces never appear on the pure top-down ground plane — characters stand up (`PIXEL_GUIDE.md §6`).

Portraits (64 × 64, v0.3 — `PIXEL_GUIDE.md §2`) may carry more facial detail; that is a separate, larger canvas and does **not** license more detail on the world sprite.

---

## 5. Hair, skin & colour usage

Colour _values_ live in `COLOR_PALETTE.md §3.5`; this section owns the _rules_ for spending them.

- **Skin:** pick one of the four inclusive tones (`COLOR_PALETTE.md §3.5`); never interpolate a fifth. The cast is diverse by default — no single "default" skin tone is canonical.
- **Hair:** drawn from existing ramps; red hair (Carrot Orange) is the one accent hair may use, sparingly, and only as hair.
- **No character introduces a colour outside the palette** (`STYLE_LOCK.md R-08`). A striking new dye is a reviewed change to `COLOR_PALETTE.md`, never an in-sprite choice.
- **Reserved accents stay reserved.** Reward Gold, Rare Violet, and Danger Red never appear as ordinary clothing (`COLOR_PALETTE.md §4`, `STYLE_LOCK.md R-09`). A merchant's coin-pouch may glint gold; a farmer's shirt may not be gold for decoration.

---

## 6. Clothing — the role signal

Clothing is how the player reads _what a character is for_ before reading anything else. It is a costume language, kept deliberately small.

- **Workers** wear practical earth tones — Wood/Soil/Straw cloth (`COLOR_PALETTE.md §3.5`): rolled sleeves, an apron or work-vest, a simple hat. They read "here to work."
- **Villagers** wear the widest range within the palette — the everyday people of the world.
- **Merchants** read through a satchel/coin-pouch silhouette and one reserved-accent garment (a gold-trimmed sash), never a whole gold outfit.
- **The player** shares the worker rig but carries **one distinguishing accent garment** (e.g. a single Grass- or Water-ramp scarf/hat) so the player's own avatar is findable at a glance among hired workers. That accent is the player's identity and is not reused on workers.

Silhouette does half the work: a hat brim, an apron line, a slung bag distinguish roles even in monochrome.

---

## 7. Equipment attachment points

Tools and carried items attach at **fixed anatomical points** so any tool fits any character and any future tool fits the existing rig.

| Point           | Location on rig                | Carries                                             |
| --------------- | ------------------------------ | --------------------------------------------------- |
| **Hand (main)** | End of the forward arm         | Hoe, watering can, scythe, sickle — the action tool |
| **Back**        | Upper torso, behind silhouette | Satchel, seed bag, slung tool when idle             |
| **Head**        | Top of head                    | Hat, hood, headwear                                 |
| **Belt/front**  | Waist front                    | Pouch, small held produce                           |

Rules: a character holds **one main-hand tool at a time**, swapped per action (`GAME_DESIGN.md §4.3` timings drive _when_; this owns _where_ it sits). The tool is drawn in the same line and light as the body (`STYLE_LOCK.md R-04, R-06`). Attachment points are fixed pixels on the rig so a new tool authored years later lines up without re-rigging.

---

## 8. Accessories

Accessories add variety **without breaking the rig or the palette.** Permitted: hats, scarves, aprons, bags, glasses (as a 1–2 px mark), staffs. Each must (a) read in silhouette, (b) use only palette colours, (c) sit on a defined attachment point (§7), and (d) never obscure the face-forward read or the feet (the pivot). Accessories are how a crowd of the shared rig becomes a village of individuals.

---

## 9. Animation personality

The _format and timing_ of animation are owned by `ASSETS.md §7` (frame-based, ticks not milliseconds); recommended frame counts by `PIXEL_GUIDE.md §8`; the full per-action feel by `ANIMATION_GUIDE.md` (phase-05.5c). This section owns only the **personality**: how a character _carries itself_.

- **Calm and unhurried.** Movement is gentle and purposeful, matching the world's mood (`ART_DIRECTION.md §10`). Even a busy worker never looks frantic — franticness contradicts the product (`VISION.md §2.1`).
- **Weight and follow-through, lightly.** A till or a harvest has a readable wind-up and a soft settle, so the player understands the action at a glance — but stylised, not laboured.
- **Idle is nearly still.** A breath, an occasional blink or shift of weight. Enough that the world is alive, never enough to pull the eye from the player's real work.
- **Personality by role, within calm.** A merchant's idle is a little more upright and gestural; a child's walk is a touch bouncier. Variation lives inside the calm register, never outside it.

---

## 10. Emotion style

v0.1 has no dialogue and no portraits in world (`GAME_DESIGN.md §8`), so emotion is shown, sparingly, through **pose and symbol**, never text:

- **Body pose** carries baseline mood — a satisfied settle after a harvest, a patient stand while idle.
- **Emote symbols** (a small icon above the head — a "!" of noticing, a "z" of rest, a heart of satisfaction) are the vocabulary for future NPCs (v0.3+). They are drawn as tiny palette-consistent icons, reuse the icon canon (`ICON_GUIDE.md`, phase-05.5c), and follow one hard rule below.
- **No alarm.** No emote, pose, or expression signals distress from player inattention — the world never guilts the player for leaving (`VISION.md §2.2`, `STYLE_LOCK.md R-10`). Emotion trends warm: contentment, curiosity, delight.

---

## 11. Per-class identity summary

A one-line silhouette test per class — "what tells me which this is, from a tile away":

| Class    | Reads as         | Primary tell (silhouette first)              |
| -------- | ---------------- | -------------------------------------------- |
| Player   | you              | The one distinguishing accent garment (§6)   |
| Worker   | your hired hand  | Apron/work-hat + the tool in hand            |
| Villager | a resident       | Everyday dress; the broadest variety         |
| Merchant | a trader         | Satchel/coin-pouch + gold-trim accent        |
| Elder    | an old resident  | Stoop, staff, Stone/Parchment hair           |
| Child    | a young resident | Child height class, larger head-within-class |

---

## 12. Non-human creatures (v1.0)

Monsters and bosses leave the human rig — but not the style. They still obey the whole of `STYLE_LOCK.md`: one 1 px `#3A3640` outline, one upper-left light, palette-only colour, the one perspective (`STYLE_LOCK.md R-01…R-08`). Bosses may use a larger canvas (`PIXEL_GUIDE.md §2` "building — large" scale as a ceiling reference) and are the **only** characters permitted to feel imposing — and even then through scale and silhouette, never through gore or the reserved Danger Red used as decoration. Their look is reserved for v1.0 and will be specified when combat is designed; this file fixes only that they inherit the style, not the rig.

---

## 13. Future customization rules

When player/character customization arrives (post-v0.1), it stays inside this canon:

1. **Swap within the rig, never the rig.** Customization changes hair, skin, cloth colour, headwear, and accessories — all from the palette and the attachment points above. It never changes proportions (`STYLE_LOCK.md R-07`) or the outline.
2. **Every combination is palette-legal by construction.** Options are drawn only from `COLOR_PALETTE.md`, so no customization can produce a foreign-looking character.
3. **Silhouette legibility survives every option.** No accessory combination may break the one-tile recognition read (§3) or hide the pivot.
4. **Role reads survive customization.** A customised worker still reads as a worker; customization is identity, not disguise.

---

## 14. Consistency rules

Binding on every future session generating a character:

1. **Proportion is fixed.** The 1 : 4 head ratio and the height classes (§2) are locked by `STYLE_LOCK.md R-07`. Changing them is a project decision recorded in `STYLE_LOCK.md`, not an art choice.
2. **Reuse the shared rig** for every human. A new person is a new costume + accessories on the existing body, never a new body.
3. **Colour comes only from `COLOR_PALETTE.md`** (§3.5 for skin/hair/cloth). No in-sprite hues.
4. **Silhouette carries role**, so the read survives at a glance and without colour (§3, `STYLE_LOCK.md R-14`).
5. **No character produces alarm** (§10). Warmth is the emotional register.
6. **Mechanics and lore win.** If this file conflicts with `GAME_DESIGN.md §4` (behaviour) or `LORE_BIBLE.md` (identity), those own their domain and this file is corrected.

---

## 15. Related documents

| Document                     | Relationship                                                   |
| ---------------------------- | -------------------------------------------------------------- |
| `STYLE_LOCK.md`              | `R-07` fixes proportions here; `R-04/R-06/R-08/R-14` bind this |
| `PIXEL_GUIDE.md §2, §3, §5`  | Character canvas, pivot, and outline this rig fills            |
| `COLOR_PALETTE.md §3.5`      | The skin/hair/cloth values §5–§6 spend                         |
| `ART_DIRECTION.md §10`       | The animation philosophy §9 applies to characters              |
| `ASSETS.md §7`               | Animation format & tick timing (not owned here)                |
| `GAME_DESIGN.md §4, §11`     | Worker mechanics and how the actor model generalises           |
| `WORLD_BIBLE.md`             | The world these characters must look native to                 |
| `LORE_BIBLE.md`              | Who these characters are in the fiction                        |
| `ANIMATION_GUIDE.md` (05.5c) | Full per-action animation feel                                 |
