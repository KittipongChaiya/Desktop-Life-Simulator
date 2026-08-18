# ADR-040: Three Classes of Evidence for a Product Claim

**Status:** Accepted — v0.5 Phase 31.
**Date:** 2026-08-18
**Phase:** v0.5 Phase 31 (Baseline & evidence) — written first, because every later phase in this version reports against it.
**Bound by (not re-litigated):** `AI_RULES.md` §19 (never claim PASS without the evidence; use PASS / BLOCKED / DEFERRED / UNTESTED / PARTIAL honestly); `PLAN.md` §2.2 (the four product criteria); `VISION.md` §2.1 (the overlay sits on a working desktop for eight hours); ADR-003 §2 and ADR-039 (the precedent for pre-committing a decision's evidence).

---

## Context

Four versions have shipped. Every **technical** gate in `PLAN.md` §8 has been
green since phase 08, re-run fresh at each version boundary and evidenced with
files on disk.

Not one of v0.1's four **product** criteria has ever been measured:

- Runs an 8-hour workday without being noticed in Task Manager
- Reaching stage 4 takes under ~4 hours of play
- The first worker hire produces a visible "oh, I see" moment in playtesting
- A tester returns unprompted on a second day

They were written in v0.1 and carried, unmet, through v0.2, v0.3 and v0.4 —
not out of neglect, but because **nothing in the process knows what to do with
a criterion a test cannot close.** The machinery this project is good at is
exactly the machinery these four resist.

v0.5 makes them its release gates, which forces the question this ADR answers:
**what counts as evidence for a claim about how a game feels?**

The failure mode is specific and this project is well set up to commit it. Faced
with "a tester returns unprompted on a second day", the tempting move is to
build a proxy — a retention model, a simulated session, a heuristic — measure
the proxy, and report the criterion as met. That is not a shortcut; it is a
different claim wearing the criterion's name.

---

## Decision

**Every product claim is reported in exactly one of three evidence classes, and
the class is stated beside the verdict rather than inferred from it. The third
class can never be marked PASS by an AI session.**

---

### 1. Machine-verifiable

A test or an instrumented measurement asserts the claim, repeatably, from a
command anyone can run. The evidence is a file on disk and a number in a
document.

This is what the project already does well, and the bar does not move: a
measurement that cannot be re-run is not machine-verifiable, it is a memory.

**May be reported PASS.**

### 2. AI-observable

I drove the real application, observed the result, and am reporting a judgement
about it. Screenshots, metric readouts, and a described sequence of actions are
the evidence; the _interpretation_ is mine.

This class exists because it is genuinely more than nothing — four phases
running, a live screenshot pass caught defects that green suites could not
(phases 18, 20, 22, 25, 27, 28) — and genuinely less than a person. An
AI-observable PASS says **"I looked, and here is what I saw"**, not "this is
good".

**May be reported PASS, always labelled with the class.** A reader must be able
to discount it without having to work out that they should.

### 3. Human-playtest

The claim is about a person's reaction, and only a person can supply it.

**Never PASS from an AI session. Not PARTIAL, not "effectively met", not a
proxy.** The honest states are **UNTESTED** (nobody has played it) or **BLOCKED
ON PLAYTEST** (everything that could be prepared has been, and a human is the
remaining input).

If a session finds itself constructing a metric that would let a human-playtest
criterion be reported PASS, that is the signal it has changed the criterion.

---

### 4. Which class each of the four criteria is in, decided now

Pre-committed here rather than argued at the RC, for the reason ADR-003 §2
pre-committed the threading trigger: **a session that classifies its own
evidence after seeing the result will classify it favourably.**

| Criterion                                            | Class                  | Why                                                                                                |
| ---------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------- |
| 8-hour workday without being noticed in Task Manager | **Machine-verifiable** | CPU and memory over a long run, against `PERFORMANCE.md` ceilings that already exist               |
| Stage 4 in under ~4 hours of play                    | **AI-observable**      | I can drive a competent-player path and time it; "4 hours of PLAY" still assumes a human's choices |
| First worker hire is an "oh, I see" moment           | **Human-playtest**     | It is a reaction. I can make the moment legible and show that it happens; I cannot feel it         |
| A tester returns unprompted on a second day          | **Human-playtest**     | It is a person choosing to come back. There is no proxy for wanting to                             |

**Criterion 2's split is deliberate.** The machine-verifiable half is a
**bound**: the fastest a perfectly-informed player could reach stage 4, measured
headlessly. A real player is slower, so a bound above four hours FAILS the
criterion outright and a bound below it proves only that the ceiling is
reachable — which is why the criterion itself stays AI-observable.

### 5. What this obliges the v0.5 report to say

For every product criterion: the verdict, the class, the evidence, and — for
anything not PASS — what specifically is missing.

Two of the four will be reported **BLOCKED ON PLAYTEST** unless the owner plays
the game before the RC is written. That is not a failure of the version; it is
the version telling the truth about what an AI session can close. A v0.5 report
claiming four PASSes would be a worse outcome than one claiming two, because it
would mean the classification was abandoned the moment it cost something.

---

## Consequences

**Good**

- The four criteria stop being unactionable. Two become work; two become a
  clearly-stated ask of the owner rather than an item that silently rolls
  forward for a fifth version.
- "I looked at it" is admissible evidence, at its own weight, with a name.
  The live screenshot pass has been the most productive defect-finder in this
  project for four versions and has never had a status.
- The RC's honesty is structural rather than a matter of care on the day.

**Bad, and accepted**

- **The version cannot fully close its own gates.** By construction. The
  alternative is a version that closes them dishonestly.
- **AI-observable is a judgement call**, and two sessions could disagree. The
  mitigation is that its evidence is always an artefact — a screenshot, a
  recorded sequence — that a person can check.

**Risky**

- **Class inflation.** The pressure at an RC is to promote a human-playtest
  criterion to AI-observable "just this once". §4 is pre-committed for exactly
  that moment, and the classification is in this ADR rather than in the report,
  so moving one is an ADR amendment in the open.

---

## Revisit if

- A criterion's class is genuinely wrong — amend this ADR in writing, before
  the measurement, never after seeing the result.
- The project gains real playtesters → some human-playtest criteria become
  routinely closable, and the class stays but stops being a blocker.
