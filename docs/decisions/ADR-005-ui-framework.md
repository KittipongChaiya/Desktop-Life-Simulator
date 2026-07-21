# ADR-005: React for UI, with a Throttled Snapshot Bridge

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-07-21 |
| **Deciders** | Project owner, lead architect |
| **Supersedes** | — |
| **Superseded by** | — |

---

## Context

Two visually distinct things share one window:

1. **The world** — a tile grid with sprites and effects, rendered by PixiJS (ADR-001).
2. **The interface** — HUD readouts, inventory, shop, worker list, settings, notifications. Ordinary reactive UI: lists, forms, buttons, modals.

These have opposite requirements. The world redraws from a scene graph on a dirty gate. The UI is text and controls that need layout, scrolling, focus management, keyboard navigation, and accessibility — things a canvas renderer gives you nothing for and which are miserable to build by hand.

The constraint that shapes this decision: **the simulation ticks at 20 Hz** (ADR-007). A UI naively subscribed to world state would re-render 20 times a second, forever, for a farm where nothing visible changed. In a process with a hard idle CPU budget (`VISION.md` §2.1), that is not a performance nitpick — it is a product failure.

---

## Decision

**React renders the UI. PixiJS renders the world. They never mix, and React is decoupled from the tick by a throttled snapshot bridge.**

### 1. A hard split, not a hybrid

```
BrowserWindow
├── <canvas>            ← PixiJS owns this. React never touches it.
└── <div id="ui">       ← React owns this. Pixi never touches it.
```

React does not render game entities. Pixi does not render buttons. There is no react-pixi reconciler, no React components representing sprites. The two trees are siblings that share nothing but the snapshot bridge.

Elements that appear *over* the world but are conceptually UI — tooltips, context menus, the build ghost's label — are React, positioned using world-to-screen coordinates published in the snapshot. In-world visual affordances — the selection highlight, hover outline — are Pixi's `worldUi` layer (ADR-001 §Layers). The rule: **if it needs text layout or input focus, it is React.**

### 2. The snapshot bridge

This is the load-bearing part of the decision.

```
sim (20 Hz)
  │  produces immutable snapshot slices, only when a slice actually changes
  ▼
SnapshotStore  ──  per-slice versions, per-slice subscribers
  │
  │  coalesced to at most 10 Hz, delivered on rAF
  ▼
React  ──  useSyncExternalStore, subscribed per slice
```

**Sliced.** The snapshot is not one object. It is independent slices — `wallet`, `inventory`, `workers`, `selection`, `notifications` — each with its own version counter. A component subscribes to the slices it reads. Coins changing re-renders the coin readout and nothing else.

**Change-gated.** A slice is republished only when its content actually changes. Most ticks change nothing a human is looking at, so most ticks publish nothing and React does no work at all.

**Throttled and frame-aligned.** Updates are coalesced to **at most 10 Hz** and delivered inside `requestAnimationFrame`. Twenty updates per second is beyond what a person reads off a HUD; ten is imperceptibly different and halves the work. Frame alignment prevents React from rendering between paints.

**`useSyncExternalStore`.** The correct React primitive for an external mutable source — no tearing, no `useEffect` subscription bugs, no extra library.

**Exempt: animated numbers.** A coin counter animating toward its target does so in CSS or a single `rAF`-driven component, not by re-rendering a tree per frame.

### 3. Intents down, never mutation

React dispatches intents; it never calls a system or writes to the world (ADR-003 §5).

```tsx
// The entire surface a component has over the simulation.
const dispatch = useIntentDispatch();
<button onClick={() => dispatch({ type: 'buySeed', seed: 'core:wheat', qty: 10 })} />
```

A component importing from `src/sim/systems/` is a boundary violation and fails `npm run check:boundaries` (`CODE_STYLE.md` §8).

### 4. No state management library

There is nothing for one to do. The world is the state and it lives in `src/sim`; the bridge is ~150 lines of `useSyncExternalStore` plumbing. Redux/Zustand/Jotai would either mirror world state — creating a second source of truth, which is the exact failure ADR-004 §6 exists to prevent — or wrap the bridge in ceremony.

Genuinely local UI state (which panel is open, a form's draft value) uses `useState`. It is not game state and is not saved.

### 5. Collapsed mode

When the overlay collapses, Pixi is destroyed entirely (ADR-001 §2) and React renders only the status bar. Snapshot subscriptions for hidden panels unsubscribe, so the sim stops producing snapshots nobody reads. Idle cost in collapsed mode approaches the cost of the tick alone.

---

## Alternatives Considered

### A. Vanilla TypeScript + templates

- **For:** no framework payload, total control over every DOM write, the theoretical minimum footprint — attractive given the memory budget.
- **Against:** you hand-roll state binding, list reconciliation, and event delegation for every panel. That code is not smaller than React's runtime once a dozen panels exist; it is just untested and yours. Each new v0.2+ system adds panels, so the cost compounds exactly as the project grows.
- **Rejected because:** the savings are real but small (~45 KB gzipped), while the maintenance cost grows without bound. The throttled bridge (§2) already neutralizes React's main runtime cost, which was the strongest argument against it.

### B. Svelte

- **For:** compiled, minimal runtime, excellent memory profile — arguably the best technical fit for an overlay's budget.
- **Against:** materially smaller pool of familiarity for the AI sessions that will do most of the work here (`VISION.md` §2.5). Fewer worked examples for the awkward integrations. The benefit over React-with-a-throttled-bridge is real but modest.
- **Rejected because:** `VISION.md` §2.5 explicitly optimizes for the session after next, and that tilts toward the more widely-documented framework. This was the closest call in this ADR.

### C. Rendering the UI inside PixiJS

- **Rejected because:** it means reimplementing text layout, scrolling, focus, IME input, and accessibility on a canvas. The DOM already does all of this correctly. It would also couple UI availability to GPU availability, so a fallback-renderer machine (ADR-001 §Fallback) would lose its interface.

### D. React for everything, including tiles (react-pixi or DOM tiles)

- **Rejected because:** it puts a reconciler between the world state and the screen at 60 Hz, which defeats ADR-001's dirty gate. DOM tiles fail past a few hundred nodes.

### E. React subscribed directly to the world at tick rate

The "obvious" implementation, named here so it is explicitly forbidden rather than accidentally built.

- **Rejected because:** it re-renders at 20 Hz forever and blows the idle CPU budget. This is the failure mode §2 exists to prevent, and any future change that bypasses the bridge reintroduces it.

---

## Tradeoffs Accepted

| We accept | To gain | Mitigation |
|---|---|---|
| ~45 KB gzipped React runtime | Productive, well-understood UI development | Small against an Electron install |
| Bridge complexity (~150 lines) | Decoupling from the tick | Written once in phase-01, covered by tests |
| Up to 100 ms UI latency | Halved UI work | Imperceptible for HUD data; interactions are optimistic |
| Two rendering technologies in one window | Each does what it is good at | Strict split (§1); no shared state but the snapshot |
| No time-travel debugging from a store | No duplicated state | The sim is deterministic and replayable, which is better |

---

## Consequences

### Immediate

- Phase-01 builds the snapshot bridge before any panel exists. Retrofitting throttling after components subscribe directly is a rewrite of every component.
- `src/renderer/app/` may not import `pixi.js`; `src/renderer/render/` may not import `react`. Lint-enforced.
- The canvas and the UI root are siblings in one HTML document, with the UI root pointer-transparent except over actual controls — this is what makes click-through work (`phase-01`).

### Ongoing

- Every new panel subscribes to slices, never to the world.
- Every new snapshot slice declares its change condition. A slice that republishes every tick is a defect.
- No `useEffect` for derived state (`CODE_STYLE.md` §9).
- Any continuously animating UI element must justify itself against the idle budget.

### Validation

- **Automated:** with a static world and the overlay expanded, zero React commits occur over a 10-second window. This test is the enforcement mechanism for §2 — deleting or skipping it invalidates this ADR.
- React Profiler is run once per phase; unexpected re-renders are treated as defects, not noise.
- Accessibility: panels are keyboard-navigable and screen-reader-labelled — the reason for choosing DOM over canvas UI (§C) only pays off if it is actually used.

### Revisit if

- React runtime cost measurably threatens the memory budget → alternative B.
- The UI grows past ~30 panels and bundle size matters → re-evaluate, likely still React.
- A future headless or server mode is needed → unaffected; the UI is already a disposable view (ADR-003 §4).
