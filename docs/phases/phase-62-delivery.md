# Phase 62 — Delivery

> **Delivers:** the version string, four milestones late; ADR-028's signing
> exception extended by the owner with the extension recorded rather than
> assumed; and two new obligations that make the next extension cost something.
> **Governing decisions:** ADR-025 (distribution and update; §3 packages are
> signed); ADR-028 (the v0.2 signing exception, §5 the expiry is executable);
> `project-state.md` (the repository is the source of truth).
> **Schema:** none.
> **Status:** **PARTIAL** — the version shipped and an artifact builds; a signed, publishable build is BLOCKED on the certificate.

---

## The version string had been lying since v0.1

`package.json` read **`0.1.0`**. Five milestones had shipped as release
candidates on top of it.

That is not an oversight, it is a consequence. `tests/signing-exception.test.ts`
fails the suite at `0.3.0` unless signing is configured, because ADR-028 §5 made
the expiry executable — _"a temporary security relaxation that relies on someone
remembering it is a permanent one"_. The certificate was never purchased, so the
guard held, and the version string stayed where it could not trip it.

**The guard worked exactly as designed and the outcome was still wrong.** What
it was built to prevent was an unsigned build shipping quietly. What actually
happened is that the SHIPPING VERSION lied instead: an artifact labelled `0.1.0`
containing v0.5's game, with `app.getVersion()` feeding that number to the
updater's own ordering arithmetic.

The owner extended the exception through v0.6 explicitly. `package.json` now
reads **`0.6.0`**.

## Extending an expiry should cost more than a keystroke

The weakness in §5's mechanism is that the expiry is a constant. A constant can
be raised in one edit by any session that finds it inconvenient — and a
relaxation renewed silently is permanent with a temporary label on it.

Two obligations now come with the exception, both enforced by the guard:

**1. Every extension is a written row.** ADR-028 §5.1 carries a table of when
the exception was extended, to what, by whom, and why. The guard requires the
current `EXPIRES_AT` to appear in that table **with a date**. Raising the number
without writing the row fails the suite.

**2. `PLAN.md` §0 must name code signing as a blocker** for as long as the
exception holds. The resume block is the first thing a returning session reads,
and `project-state.md` makes the repository the source of truth precisely so
nothing important travels only in memory. A session that inherits an unsigned
build now inherits the sentence saying so.

Neither obligation makes the build safer. Both make the decision harder to
forget, which is what §5 was reaching for.

## What did not change

Nothing in ADR-028 §3's threat model. An unsigned build is unsigned: the root of
trust is the release host and the TLS chain rather than the publisher, and a
compromise of the publishing account is still not caught. Artifact integrity —
the SHA-512 per artifact, served over HTTPS, fatal on mismatch — was never
deferred and still is not.

**The exception now blocks publication rather than development**, which is where
the owner asked for it to sit.

## The build was made, and then checked rather than believed

`npm run package` completed, exit 0:

|          |                                                |
| -------- | ---------------------------------------------- |
| Artifact | `release/Desktop Life Simulator-0.6.0-x64.exe` |
| Size     | 115,179,549 bytes                              |
| Target   | NSIS, win32 x64, Electron 43.1.1               |

**The version reached the filename**, which is the first time in five milestones
that an artifact has been named after the game inside it.

**And the build log lies about signing.** It says `signing with signtool.exe`
three times — once for the app, once for `elevate.exe`, once for the installer —
which reads exactly like a build that signed something. It did not:

```
> Get-AuthenticodeSignature "release\Desktop Life Simulator-0.6.0-x64.exe"
Status : NotSigned
```

electron-builder emits that line on its way into the signing step and proceeds
unsigned when it finds no certificate. **Checking the artifact rather than the
log is the whole difference**, and it is the reason this section exists: a phase
whose one job is honesty about signing could very easily have quoted a build log
saying the opposite of the truth.

Two smaller notes from the same run, neither blocking: the default Electron icon
is still used (`application icon is not set`), and electron-builder reports four
duplicate dependency references in the tree.

## Blocked

**A signed, publishable build. BLOCKED on the owner's certificate purchase.**

- **What is needed:** an OV or EV code-signing certificate, or a cloud signing
  service. Procurement and identity verification, not code.
- **What is already done:** everything else ADR-025 asks for. The updater, the
  SHA-512 integrity check, schema-bounded rollback, atomic replacement,
  interruption recovery, and now a versioned artifact that builds clean.
- **What resumes when it clears:** add any signing key to
  `electron-builder.yml`, and `tests/signing-exception.test.ts` goes quiet on
  its own — the guard is written to get out of the way rather than to need
  deleting.

**Also still blocked, unchanged:** the three update-behaviour tests, which need
a published release to run against; and the three GPU render criteria, which
need hardware with a real adapter.

## What this phase does NOT claim

**That the installer works.** It exists, it is the right size, it is named
correctly and it is honestly unsigned. Whether it installs and runs on a clean
Windows machine is untested — this machine is not clean, and installing here
would prove nothing about the machine that matters. `PLAN.md` §5B lists that
criterion as machine-verifiable, and it is **UNTESTED** rather than passed.
