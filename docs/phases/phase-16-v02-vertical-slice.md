# Phase 16 — v0.2 Vertical Slice (Release Candidate)

> **Delivers:** proof rather than features. Whether v0.2 is one coherent game, and whether every gate is met with evidence.
> **Governing decisions:** ADR-012 (the freeze this phase extends), ADR-029 (the extension it proposes), `PLAN.md` §8 (the eight release gates).
> **Schema:** none.
> **Status:** **Complete**, with three paths recorded as unproven rather than met — `RELEASE-v0.2-RC.md` §4.

---

## Commit boundaries

`ROADMAP.md` §12 asks for one per deliverable, closing with the RC report.

| Order | Boundary                                                      | Commit    |
| ----- | ------------------------------------------------------------- | --------- |
| 1     | The two failing E2E specs, fixed                              | `51df96a` |
| 2     | The RC report, the foundation extension, and the closed gates | _this_    |

Two rather than six, and the reason is that four of §12's deliverables turned
out to be **the same act**: running the gates and writing down what happened.
Splitting a measurement from the sentence that records it would have produced
commits that cannot be reverted independently, which is the only thing a
boundary is for.

---

## Decisions worth carrying forward

### A gate that cannot be run is reported, not rounded

Three of ADR-025's guarantees have never been exercised against the path that
ships: an interrupted install, a restored pre-migration backup, and a tampered
artifact. All three need a published release to test against, and the release is
what they would gate — which is circular.

The temptation was to tick them on the strength of the unit suites that cover
the _specified_ sequence. `install-store.test.ts` genuinely halts after each
replacement step and re-reads a planted save byte for byte; it is real evidence
of something. It is just not evidence of the NSIS path `electron-updater`
actually uses.

So they are marked unproven, with the distinction between "unproven" and "known
bad" stated explicitly, and with the one thing that IS structural called out:
the updater cannot touch the save directory, because it takes the installation
root as a parameter and has no way to name one.

### The freeze is earned per ADR, not per version

ADR-029 freezes eight of the fifteen v0.2 ADRs and leaves seven, which looks
like fence-sitting and is ADR-012's own logic applied honestly. ADR-012 followed
phase-05.6 rather than preceding it **so that production would have pushed on
what was being protected**.

Fifteen ADRs did not get equal exposure. ADR-015 took five migrations and a
removal; ADR-013 was not touched at all this version. Freezing both because they
share a milestone would protect a claim in one case and a validated rule in the
other, and only the second is what a freeze is for.

ADR-025 is the interesting one: held out for lack of **evidence** rather than
lack of exposure. It is the only ADR in either category that a single afternoon
with a published release would qualify.

### The owner's withdrawal is recorded as a withdrawal

`PLAN.md` §3 asks for a third party to write a plugin from `PLUGIN_GUIDE.md`
alone. That was withdrawn on 2026-08-14 with playability as the bar instead.

It is written down as **withdrawn**, not met, and the consequence is stated: the
plugin API is proven by first-party use — `plugins/core` goes through the same
public capabilities a third party would, which is ADR-019 §2's rule — but nobody
outside the project has tried to follow the guide, so the documentation's
fitness is untested. That is a different claim from "a third party succeeded",
and the register should not blur them.

### Two gates were fiction, and both were found by accident

`TECH_STACK.md` §7.3 promised an `npm audit` CI step that did not exist. Phase
08.0 had already found the same shape in coverage: seven documented thresholds,
one enforced. Both were discovered by tripping them rather than by review, years
of sessions apart, in a project that is unusually careful about this.

The lesson recorded here is not "check the gates" — it is that **a claim in a
document and a step in a pipeline drift silently**, and the only reliable
detector is a failure. The smoke gate added this phase is the third instance:
`npm run build` succeeded on a build that could not start, and nothing in the
pipeline was capable of noticing.

---

## Acceptance

`ROADMAP.md` §12's list.

- [x] All eight `PLAN.md` §8 release gates green, with evidence behind every number — `RELEASE-v0.2-RC.md` §2; performance is marked **partial** there rather than green, because the combined-budget run §12 asked for was not taken
- [ ] Every `PLAN.md` §3 v0.2 success criterion met, **including a third party writing a plugin from documentation alone** — the third-party gate was **withdrawn by the owner** on 2026-08-14; every other §3 criterion is met. Recorded as withdrawn rather than ticked
- [x] A v0.1 save loads in v0.2 through the full chain with no data loss — `tests/save-compatibility.test.ts`, 45 assertions across every prior golden fixture
- [x] Uninstalling a plugin preserves its save data — ADR-026's isolation invariant, asserted at every version in the chain
- [ ] Performance budgets hold with weather, lighting, and audio active — individually yes, and each is in `docs/perf/`. **Together, unmeasured**; §12 named this risk and it is the one that stayed open
  > **Closed in phase-17** (2026-08-15): measured together on the reference farm under rain, lighting, audio, and all motion at once — p99 tick 0.5 ms vs 3 ms, presence surrender intact. `PERFORMANCE.md` §14, `docs/phases/phase-17-v03-baseline.md`. The coverage stall was also re-run quiet and passed (95.07% / 86.56%). This entry stays unticked as the record of what was true when phase-16 closed.
- [ ] Auto-update never loses a save under interrupted-update testing — the executable suite exists and passes against the **specified** sequence; the shipping NSIS path is unproven (`RELEASE-v0.2-RC.md` §4)
- [x] Zero known data-loss defects — none known. Three update paths are unproven, which is stated as unproven rather than counted as clean

---

## Testing strategy

Full unit suite, the E2E suite against a real launched application, the coverage
gate, boundaries and cycles, and the perf harness writing to `docs/perf/`.

**The E2E suite is flaky in bulk on this hardware and is not flaky per spec.**
Every spec passes alone; seventy-plus Electron launches back to back exhaust the
GPU and one graphics-dependent spec fails, moving between runs. That is recorded
in `RELEASE-v0.2-RC.md` §6 rather than fixed, because the fix is a machine with
more headroom and the alternative — loosening a rendering assertion — would cost
a real detector.
