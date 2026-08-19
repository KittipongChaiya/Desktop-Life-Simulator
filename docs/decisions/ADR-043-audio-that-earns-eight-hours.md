# ADR-043: Audio That Earns Eight Hours

**Status:** Accepted — v0.5 Phase 47.
**Date:** 2026-08-19
**Bound by (not re-litigated):** ADR-016 (silence is the resting state; every sound is triggered by something that already happened); ADR-023 §2 (the category mix and ducking), §5 (ambience is permitted under five conditions, and permits _ambience_, not ambiences); ADR-040 (the three evidence classes).

---

## Context

The catalogue is eleven short sounds, each played from one decoded buffer. So
every harvest was **bit-identical to every other harvest**.

That is survivable in a game somebody plays for twenty minutes. It is the whole
problem in one they leave open beside their work for eight hours: identical
repetition is what turns a sound a player liked into a sound they mute, and a
muted companion has lost a whole channel of feedback permanently.

`VISION.md` §2.1 makes not intruding the product's one hard constraint, and an
effect heard four hundred times without changing is intrusive by arithmetic
rather than by volume.

---

## Decision

### 1. Repeated sounds vary in pitch, and the variation is DERIVED

A buffer played at a slightly different rate is a slightly different sound, and
it costs one property on a node that is being allocated anyway. Recording a
dozen variants per effect would cost a dozen times the decode, a dozen times
the memory, and an asset pipeline that has to keep them in step.

The rate comes from a per-sound play counter through MurmurHash3's finalizer —
the same hash family the world already uses for decor and tile variants.
**Never `Math.random`**: the same farm must sound the same on every launch, and
a random rule cannot be tested.

**±6%, about a semitone.** Enough that consecutive plays are audibly not one
recording fired twice; small enough that nothing sounds detuned, which on a
two-note pluck like `coin` would read as a wrong note rather than as variety.

The counter is **per sound**, not global: two effects fired on the same frame
would otherwise take neighbouring sequence numbers and receive correlated
rates, so they would sound like one event pitched twice instead of two events.

### 2. Signals do not vary

A UI click, an error and a notification are STATEMENTS. The player learns each
as one shape, and a shape that moves reads as a fault rather than as life. An
ambient bed must not vary either — a bed whose rate changed would audibly shift
pitch mid-weather.

The rule is **by category**, so a sound added later inherits the right
behaviour without anybody remembering the variation module exists.

### 3. The replacement path is verified rather than promised

`generate-audio.mjs` has always opened with a commitment: drop a real
`assets/src/audio/<name>.wav` in and the script copies it through instead of
synthesising, with no code changes anywhere. That commitment is the entire
justification for shipping placeholder sound — the placeholders are allowed to
be crude because they are cheap to replace.

**Nothing checked it**, in a repository whose history is a series of documented
mechanisms that turned out not to run. It is exercised now, both ways: an
authored file is copied byte-for-byte, and removing it goes back to synthesis.

---

## What is deliberately NOT done, and why

### Timbre is human-evaluable evidence, and this session cannot supply it

The obvious next move is to make the eleven placeholders sound better — richer
layering, longer tails, more body. **I cannot hear them.** Every other claim in
this ADR is checkable by running something; "this sounds nicer" is not, and
changing synthesis I cannot evaluate would be guessing with a straight face.

ADR-040 already fixed the rule this project follows for exactly this shape of
problem: evidence that requires a human may never be marked PASS from a session
that has no human in it. Timbre is that class. The placeholders remain
placeholders, they remain honestly described as such, and the path to replacing
them is now known to work.

### A second bed would need ADR-023 §5 reopened

Night crickets have a real trigger — the day phase — and would be the natural
second bed. But §5 permits _ambience_, singular, and the controller holds one
bed for its whole life by construction. Making beds switchable is a change to a
recorded decision, not an implementation detail, and it is not worth making at
the end of a long session to add a sound nobody has asked for.

---

## Consequences

**Good**

- The most-heard sound in the game stops being the same sound. That is the
  single change with the most effect on whether the audio survives a workday.
- Costs one clamped property per voice; no new assets, no extra decode.

**Bad, and accepted**

- The sounds are still placeholders. This ADR makes them wear better, not
  sound better, and says so.

**Risky**

- ±6% is a judgement made without listening. It is bounded and tested, and it
  is the one number here a person should check by ear before v1.0.

## Revisit if

- Real recorded audio arrives → variation may want to shrink, since a recorded
  sound carries its own noise and needs less help.
- A second bed is genuinely wanted → that is an amendment to ADR-023 §5, and
  the switching rule belongs there rather than here.
