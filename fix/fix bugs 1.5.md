Perform a small architecture hardening pass before starting Phase-02.

Requirements:

1. Introduce a lightweight event bus.

- Create a central typed EventBus.
- Systems must communicate through events where appropriate instead of directly calling unrelated systems.
- Initial events should support future expansion (HarvestCompleted, InventoryChanged, SaveRequested, WorkerStateChanged, NotificationRequested, etc.).
- Do NOT over-engineer. No external libraries. No full message framework.
- Existing behavior must remain unchanged.

2. Introduce a central GameClock.

- Create a GameClock abstraction.
- Replace any direct Date.now(), new Date(), performance.now() usage inside game simulation with GameClock where appropriate.
- GameClock must support:
  - current simulation time
  - delta time
  - game day
  - future season support
  - offline progress calculations
- Keep rendering timing independent.

3. Introduce an Asset Registry.

- No gameplay code should reference raw filenames like "corn.png".
- Create typed asset identifiers (AssetId / AssetRegistry).
- Asset loading should resolve filenames internally.
- Existing assets must continue working unchanged.

4. Move gameplay constants into data.

- Eliminate hardcoded gameplay values where practical.
- Crop growth time, worker speed, inventory limits, economy tuning, etc. should come from configuration/data files instead of source constants.
- Do not redesign systems—only move tunable values into data.

5. Architecture review.

- Verify that no system violates the project architecture introduced in Phase-00.
- Remove obvious direct dependencies that should become events.
- Keep changes minimal.
- Do not introduce speculative abstractions.

Constraints:

- No gameplay changes.
- No visual changes.
- No new features.
- No regressions.
- Keep backward compatibility.
- Existing tests must continue passing.
- Add tests where appropriate.
- Update all affected documentation (ARCHITECTURE.md, AI_RULES.md, ADRs, and phase documents) if architectural decisions change.

Deliverables:

- Atomic commits.
- Summary of every architectural improvement.
- List every direct dependency removed.
- List every new event introduced.
- List every GameClock replacement.
- List every Asset Registry migration.
- Confirm that gameplay behavior is identical before and after the refactor.
