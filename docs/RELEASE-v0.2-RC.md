# v0.2 Release Candidate — Honest Position

> **Status:** Release candidate. The game is playable and every gate that can be
> run here has been run.
> **Scope:** Phases 08.0–16. `ROADMAP.md` §12 is the phase this document closes.
> **Owner decision (2026-08-14):** the third-party plugin-authoring gate is
> **withdrawn** for v0.2 — see §4. Playability is the bar in its place.

---

## 1. What v0.2 is

v0.1 was an overlay with a farm in it. v0.2 is that farm inside a world that
moves on its own and a product that can maintain itself:

| Added                   | What it means to a player                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| Content identity        | Everything in the game has a stable name, so a save survives content changing |
| Plugins                 | The game can load content it did not ship with, and isolate it when removed   |
| Time, seasons, weather  | Days pass, seasons turn, it rains — and crops respond to all three            |
| Audio architecture      | A real mix with categories, and rain you can hear                             |
| Worker scheduling       | You direct the farm: what each worker does, where, and when                   |
| Distribution and update | The game can update itself without endangering a save                         |

Five schema versions were added (v1 → v6) and one field was **removed**, which
is the first time the migration chain has had to do that.

---

## 2. The eight release gates

`PLAN.md` §8. Every row states what was run, not what was intended.

| Gate               | Status                                  | Evidence                                                                                                                                                                                                                   |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save compatibility | **Met**                                 | `tests/save-compatibility.test.ts`, 45 assertions across the whole chain; every prior golden fixture loads                                                                                                                 |
| Performance        | **Partial**                             | Criteria measured to `docs/perf/`, including ambient audio (criterion 9) taken this phase. See §3 for what was **not** re-measured together                                                                                |
| Coverage           | **Met at last measurement, not re-run** | 95.1% lines / 86.41% branches, all per-area and project thresholds, exit 0 — measured 2026-08-14 after the update work landed. **Not re-measured since the ambience work**; three attempts stalled on this machine. See §3 |
| Boundaries         | **Met**                                 | `check:boundaries` and `check:cycles` clean — see §5 on a false failure this gate produces                                                                                                                                 |
| Docs               | **Met**                                 | `ARCHITECTURE.md`, `SAVE_FORMAT.md`, `CHANGELOG.md` current; every phase document closed against evidence                                                                                                                  |
| ADRs               | **Met**                                 | ADR-013–028 recorded; ADR-028 narrows ADR-025 §3 rather than editing it, per the append-only rule                                                                                                                          |
| Data loss          | **Met, with one unproven path**         | Zero known defects. One path is unverified rather than known-bad — §4                                                                                                                                                      |
| Dead code          | **Met**                                 | No skipped tests, no `.only`, no placeholders left in shipped code                                                                                                                                                         |

---

## 3. What is measured, and what is not

**Measured, in `docs/perf/`:** simulation tick p99, ambient motion returning to
a zero-frame idle, ambient audio returning to silence, render budget, heap under
sustained effect density, expand/collapse timing.

**Not measured as `ROADMAP.md` §12 asks:** the ceilings have not been re-taken
**all together** — weather, lighting, and audio active simultaneously on one
run. Individually they hold. The combined figure is the one §12 wanted and it is
not in `docs/perf/`.

That is a real gap and it is stated rather than rounded off. The risk it leaves
open is the one §12 named: budgets that hold individually and not together.

**The coverage gate is also not freshly measured.** It passed cleanly earlier on
2026-08-14 at 95.1% lines and 86.41% branches with every per-area threshold met,
and three attempts to re-run it after the ambience work stalled without
producing a report. Everything added since that run is at 100% on all four
metrics under its own targeted run — `ambience.ts`, `phasesBetween`,
`update-restart.ts`, `updater-config.ts` — and the only production file added
without coverage, `updater.ts`, was already inside the measured run.

So the expectation is that it still passes and the branches figure, the
narrowest of the four at 1.41 points of headroom, is the one to watch. That is
an expectation and not a measurement, and the row above says so.

---

## 4. What was not verified, and why

Three things. None is a known defect; all three are **unproven**, which is a
different and honest claim.

### The updater's install step, interrupted

`install-store.ts` proves the retain → swap → commit sequence against real
directories, halting after each step and re-reading a planted save byte for
byte. **That sequence is not the one that ships.** `electron-updater` hands off
to the NSIS installer, which performs the replacement its own way, and nobody
has interrupted a real packaged install.

If that path is not atomic, an interrupted update could leave an installation
that does not launch. **It cannot corrupt a save** — the updater never touches
the save directory, which is structural rather than asserted: the module takes
the installation root as a parameter and has no way to name the save directory.

### Restoring a pre-migration backup into an older build

The backup is written and the rollback refusal names it. Nobody has restored one
and played on.

### A tampered artifact being rejected

The mechanism is wired — a SHA-512 per artifact in the feed, verified before the
package is marked ready — and has never been fed a corrupted file.

All three need a published release to test against. `ROADMAP.md` §11 carries
them; none is a v0.2 blocker under the owner decision recorded at the top of this
document, and all three should be closed before v0.3.

### The withdrawn gate

`PLAN.md` §3 asks for a third party to write a plugin from `PLUGIN_GUIDE.md`
alone. **The owner withdrew this on 2026-08-14**, with playability as the bar
instead. The plugin API is proven by first-party use — `plugins/core` goes
through the same public capabilities a third party would — but nobody outside
the project has tried to follow the guide, so the documentation's fitness is
untested. Recorded as withdrawn rather than met.

---

## 5. Two findings worth carrying into v0.3

### A build that succeeds is not a build that runs

`import { autoUpdater } from 'electron-updater'` — a CommonJS package named into
an ESM bundle — passed typecheck, lint, boundaries, cycles, 2,553 unit tests and
`npm run build`, then threw at load. **The application did not start for two
commits.** Every gate was structurally incapable of seeing it: `src/main` is a
host binding no unit test imports, and a module-format mismatch is not a type
error.

`npm run smoke` now launches the production build and asserts it survives, in CI
and before any release publishes. It was verified by reintroducing the bug.

### A documented gate that does not exist is worse than no gate

`TECH_STACK.md` §7.3 claimed since phase-00 that `npm audit` ran in CI and failed
on high advisories. There was no audit step. It was found by tripping it —
adopting `electron-updater` pulled a high advisory into the **shipped** tree with
nothing objecting.

This is the second time the same failure shape has appeared in this project
(phase-08.0 found the first, in coverage). Both were found late and by accident.

---

## 6. Known limitations

- **Windows only.** Deliberate (`VISION.md` §5.1); macOS and Linux overlay
  semantics differ enough that pretending otherwise would compromise Windows.
- **Unsigned builds.** ADR-028 defers the publisher signature to v0.3. SmartScreen
  will warn on first install. Artifact integrity is still verified and still fatal.
- **Ambience is one bed.** Rain only. Wind, birds and grass have no trigger, and
  ADR-016's rule is that a sound with no trigger is unreachable code.
- **Zones have no map interaction.** The command exists and is tested; choosing a
  zone means dragging a rectangle over the farm, which is not built.
- **E2E is flaky in bulk on modest hardware.** Every spec passes alone; running
  seventy-plus Electron launches back to back exhausts the GPU and one
  graphics-dependent spec fails, moving between runs. Not a game defect.

---

## 7. Release position

**Ship it, with the three unproven update paths stated in the release notes.**

The reasoning is ADR-025 §1's own ordering — save integrity above update
delivery. Everything that protects a save is proven: the schema-bounded rollback
guard, the atomic write sequence, the quit save that blocks shutdown, the
migration chain across every fixture, and the updater's structural inability to
reach the save directory. What is unproven is whether an interrupted **install**
leaves a launchable application, which costs a reinstall rather than a farm.

Holding v0.2 back until a release exists to test against is circular: the paths
in §4 cannot be exercised without publishing one.
