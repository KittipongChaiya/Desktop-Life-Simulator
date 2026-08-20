# Phase 60 — Sound That Isn't A Placeholder

> **Delivers:** an amended R-09, and the honest reason it had to be amended.
> No new audio.
> **Governing decisions:** ADR-043 (timbre is human-evaluable and this session
> cannot supply it); ADR-040 (evidence classes); ADR-046 §2 and its Revisit-if
> clause.
> **Schema:** none.
> **Status:** **Complete — with the rule changed rather than met.**

---

## The rule was written against the wrong property

R-09 said: _no sound in the catalogue is described as a placeholder_. The census
checked the only thing that sentence can be checked by — whether
`assets/src/audio/<name>.wav` exists, since `generate-audio.mjs` copies a real
file through when one is present and synthesises when it is not.

**That conflates method with quality.** A sound is not a placeholder because it
was synthesised; plenty of shipped games are entirely synthesised. And the
sounds here are not crude: each has a stated intent and a deliberate shape —
`till` is noise-led because earth has no pitch, `plant` is the quietest thing in
the catalogue because it is the action a player repeats most, and the rain bed
carries an equal-power crossfade so its loop point is inaudible.

**What is missing is timbre, and ADR-043 already settled that this cannot be
claimed here:**

> The obvious next move is to make the eleven placeholders sound better...
> **I cannot hear them.** Every other claim in this ADR is checkable by running
> something; "this sounds nicer" is not, and changing synthesis I cannot
> evaluate would be guessing with a straight face.

Nothing has changed about that. Dropping eight generated WAVs into
`assets/src/audio/` would have turned the check green while changing nothing a
player hears, and would have cost the project its one honest sentence about its
own audio. ADR-046's Revisit-if clause names this exact situation: _amend the
rule in writing; do not satisfy it narrowly and move on._

## What R-09 asks now

**That the audio has no holes.** A sound nothing triggers is an asset nobody
hears — the audio equivalent of the missing sprite key `sprite-keys.test.ts` was
written for, and it fails the same way: silently, forever. The census greps the
renderer's `sound.play(...)` sites and requires every registered sound to have
one.

All eleven are reachable. The rule passes, and it now guards something real.

## The finding this produced, which is the phase's actual yield

**The two longest things a player waits for in v0.6 make no sound at all.**

- A **craft completing**. Seven recipes now, up to four minutes of machine time
  each, and the moment the Loom finishes a bolt of cloth is silent.
- An **expedition returning**. Up to ten minutes away, and the worker arrives
  home without a sound.

For an idle game, that is not a polish gap. **The completion sound is the
feedback channel** — it is how a player who is not looking learns that something
happened, and it is the entire mechanism by which the game rewards absence
rather than attention (`VISION.md` §2.2).

**Why it is not fixed here.** `SimEventMap` carries eight events and neither
`craftCompleted` nor `expeditionReturned` is one of them. The renderer can only
hang a sound on something the simulation says happened, so adding these means
adding sim events and emit sites — engine work, which ADR-046 §1 puts outside a
content tier. `types.ts` notes that "adding a member here is all a new event
needs", so the cost is small; the scope is what stops it, not the difficulty.

Recorded for v0.7, with the sounds themselves still honestly described as
placeholders and the replacement path still verified rather than promised.
