# UI_STYLE_GUIDE

> **Status:** Authoritative for how the UI _looks_. The canon a session obeys when styling any panel, button, or HUD element.
> **Owns:** The visual appearance of the interface — buttons, windows/panels, inventory chrome, tooltips, notifications, typography treatment, spacing/margins, the toolbar/hotbar, cursor, and HUD _look_ — so the DOM interface reads as part of the same cozy pixel world as the canvas beside it.
> **Does not own:** UI _philosophy and behaviour_ — never steal focus, collapsed-default, one-click, no timers, no red (`GAME_DESIGN.md §10.1`); the _layout_ and its sizes (`GAME_DESIGN.md §10.2`); the _framework_, the React/Pixi split, the snapshot bridge, and intents-down (`ADR-005`); the UI colour _values_ (`COLOR_PALETTE.md §6`); icon _design_ (`ICON_GUIDE.md`); any animation (`ANIMATION_GUIDE.md`, `ASSETS.md §7`).

**Boundary note.** This is a narrow creative slice. `GAME_DESIGN.md §10` already owns _what the UI does and where things sit_; `ADR-005` owns _what it is built from_ (React on the DOM, decoupled from the tick by a change-gated snapshot bridge); `COLOR_PALETTE.md §6` owns _the exact colours_. This file owns only the remaining question: **what the interface should look like** so it feels hand-made and warm, not like a generic app bolted onto a pixel game. Where this conflicts with any of those owners, they win.

The interface is **DOM/React, not Pixi** (`ADR-005 §1`). It is _styled_ to belong to the pixel world; it is not _rendered_ in it. Nothing here asks for canvas UI — that path was rejected (`ADR-005 §C`).

---

## 1. The look in one line

**A cozy, sturdy, hand-made interface: warm parchment panels, a single dark warm edge, chunky friendly controls, and generous breathing room** — the palette and identity of the world (`ART_DIRECTION.md §2`, `COLOR_PALETTE.md §6`) expressed as UI. The UI should feel like a well-worn wooden toolbox, not a glass dashboard.

Three commitments, inherited from the art direction:

1. **Legible first.** The player reads the UI peripherally, mid-work (`GAME_DESIGN.md §10.1` rule 4). Clarity always beats decoration (`STYLE_LOCK.md R-16`).
2. **Consistent everywhere.** Every panel shares one look; no panel invents its own (`STYLE_LOCK.md R-13`).
3. **Calm, never alarming.** No red for routine state, no flashing, no urgency (`GAME_DESIGN.md §10.1` rules 5–6, `STYLE_LOCK.md R-10`).

---

## 2. Panels & windows

The panel is the base surface — inventory, shop, worker list all sit on it.

- **Fill:** Panel Base `#E8E0D4` (parchment). **Border:** a solid Panel Edge `#3A3640` — the world's one Outline colour, so a panel edge matches a sprite edge (`COLOR_PALETTE.md §6`). **Inset/groove:** Panel Shadow `#C9BFAE`.
- **Chunky, soft-cornered frames.** A 1–2 px solid dark border with a slightly inset body, echoing the 1 px sprite outline (`STYLE_LOCK.md R-04`) at UI scale. Small corner rounding is allowed (the UI is DOM, not pixel-grid-bound), but the feel stays sturdy and rectangular, never glassy or gradient (`STYLE_LOCK.md R-02` in spirit — no gradients/blur in the UI look either).
- **No drop shadows or blur.** Depth is shown by the inset groove and the solid edge, not by soft shadow — matching the flat pixel identity.
- **Never a modal.** Panels open beside the world, never over it as a focus-stealing dialog (`GAME_DESIGN.md §10.1` rule 1, `ADR-005 §1`).

---

## 3. Buttons & controls

- **Sturdy and finger-friendly.** A button is a filled parchment rectangle with the dark warm edge; hover lifts the fill one step lighter, active presses it one step darker (Panel Shadow). States are shown by _value shift_, not colour change.
- **Primary vs secondary by weight, not by red/green.** A primary action reads through size and a warm accent trim (Carrot Orange as the secondary call-to-action, `COLOR_PALETTE.md §4`), never through an alarming colour.
- **Disabled** uses Panel Shadow fill + Text Muted, and pairs the dim with a reason in a tooltip (§5) — never colour alone (`STYLE_LOCK.md R-14`).
- **Focus is visible.** Keyboard focus draws a clear Selection-green outline — the DOM UI is keyboard-navigable by mandate (`ADR-005 §Validation`, accessibility).

---

## 4. HUD & toolbar

`GAME_DESIGN.md §10.2` owns the HUD's _layout and sizes_ (the 220 px expanded / 48 px collapsed bars and what they contain). This section owns only their _styling_.

- **The three numbers are the loudest thing on screen.** Coins, worker count, and next-harvest read in large, high-contrast numerals (`GAME_DESIGN.md §10.1` rule 4). Coins carry the Reward Gold accent (`COLOR_PALETTE.md §4`) — the one colour the eye is trained to seek.
- **Collapsed is a clean status bar**, not a shrunken panel: three glyph+number pairs and an expand caret, styled plainly so its idle cost stays near the tick alone (`ADR-005 §5`, `GAME_DESIGN.md §10.2`).
- **The toolbar/hotbar** is a row of large icon buttons (tool select — `1` hoe, `2` seed, `4` hand, `GAME_DESIGN.md §8`). The active tool reads through a pressed-in, accent-trimmed state; icons come from `ICON_GUIDE.md`. Hotbar slots are square, evenly spaced (§7), and show their number.

---

## 5. Tooltips & notifications

- **Tooltips** are small parchment chips with the dark edge and Text Primary, appearing on hover/focus without stealing it. World-anchored labels (the build-ghost label, a context menu) are React positioned by world-to-screen coordinates from the snapshot (`ADR-005 §1`) — this file styles them; the ADR owns the mechanism.
- **Notifications are inline, transient, and quiet** (`GAME_DESIGN.md §10.1` rule 1). A soft parchment toast that fades on its own; positive events may carry the Positive green or Reward Gold, caution the Warning amber — **never** the Negative red for routine events (`GAME_DESIGN.md §10.1` rule 6, `COLOR_PALETTE.md §5`). The game **never** raises an OS notification for routine events (`VISION.md §5.1`).

---

## 6. Typography

The UI is DOM text, so its font is a CSS choice — distinct from the in-world **bitmap font atlas** the pipeline builds for Pixi text (`ASSETS.md §3` owns that; this owns UI text appearance).

- **A clean, legible face for body and numbers.** Readability at small sizes governs (`STYLE_LOCK.md R-16`); a decorative pixel font may head a panel title, but body text and the HUD numerals stay crisply legible — never a hard-to-read pixel font at data sizes.
- **Contrast is a hard rule.** Text Primary `#3A3640` on Panel Base clears WCAG AA (~9:1); Text Muted for secondary only; never body text on a fill darker than Panel Shadow (`COLOR_PALETTE.md §9`).
- **A small type scale.** One body size, one large-numeral size for the three HUD numbers, one small size for hints/counts. Restraint keeps the tiny surface calm.

---

## 7. Spacing, margins & density

- **Generous negative space.** The overlay is a small surface (`VISION.md §2.3`); crowding it makes it feel chaotic (`STYLE_LOCK.md R-13` in spirit). Breathing room is the cozy feel, in the UI as in the world (`ART_DIRECTION.md §8`).
- **One spacing rhythm.** Use a small consistent spacing unit (e.g. multiples of 4 px) for padding, gaps, and margins across every panel, so the whole UI feels set by one hand.
- **Inventory grid** (`GAME_DESIGN.md §7` owns the mechanic; `ADR-005 §2` the slice): even square item cells, each a parchment slot with the dark edge, holding one icon + a corner count. Consistent cell size and gap; the grid never reflows into something dense or ragged.

---

## 8. Cursor

The overlay is pointer-transparent except over actual controls — this is what makes click-through work (`ADR-005 §Consequences`, `phase-01`). Therefore:

- **Over the UI:** the ordinary OS pointer. The UI does not fight the desktop for cursor identity.
- **Over the world:** the active tool is signalled by the in-world hover/selection affordance on Pixi's `worldUi` layer (`ADR-005 §1`, `GAME_DESIGN.md §8`), not primarily by a custom cursor. An optional tool-tinted cursor is permitted but must never obscure the tile under it. Keep cursor behaviour minimal and predictable.

---

## 9. Consistency rules

1. **One UI style, everywhere** (`STYLE_LOCK.md R-13`). A new panel reuses these surfaces, controls, and spacing; it never introduces a rival look.
2. **Colours come only from `COLOR_PALETTE.md §6`.** No ad-hoc UI hues.
3. **State is never hue-alone** (`STYLE_LOCK.md R-14`): pair colour with shape, icon, value, or text.
4. **Never alarming, never focus-stealing** (`GAME_DESIGN.md §10.1`): no red for routine state, no modals, no countdown timers, no OS notifications.
5. **Legibility is the acceptance bar.** If a style choice hurts glance-readability, it is wrong (`STYLE_LOCK.md R-16`, `GAME_DESIGN.md §10.1` rule 4).
6. **Behaviour, layout, framework, and values win.** If this file conflicts with `GAME_DESIGN.md §10` (behaviour/layout), `ADR-005` (framework), or `COLOR_PALETTE.md §6` (values), those own their domains and this file is corrected.

---

## 10. Related documents

| Document                         | Relationship                                                       |
| -------------------------------- | ------------------------------------------------------------------ |
| `GAME_DESIGN.md §10`             | UI philosophy (rules) and layout — owns what the UI does and where |
| `ADR-005`                        | React/DOM UI, the Pixi split, the throttled snapshot bridge        |
| `COLOR_PALETTE.md §6, §9`        | The UI colour values and contrast rules this styling uses          |
| `STYLE_LOCK.md R-13, R-14, R-16` | One UI style; no hue-alone state; readability over richness        |
| `ICON_GUIDE.md`                  | The icons that fill the toolbar, inventory, and HUD                |
| `ASSETS.md §3`                   | The in-world bitmap font pipeline (not the UI's CSS font)          |
| `ART_DIRECTION.md §2, §8`        | The cozy identity and negative-space feel the UI inherits          |
