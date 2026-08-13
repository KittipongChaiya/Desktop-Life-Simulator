# ADR-028: The v0.2 Signing Exception

**Status:** Accepted — v0.2 Phase 15. Decided by the project owner on 2026-08-13 to unblock the v0.2 release.
**Date:** 2026-08-13
**Phase:** v0.2 Phase 15 (Distribution & Auto-Update)
**Narrows:** ADR-025 §3 (packages are signed, and signature failure is fatal) — **for the v0.2 milestone only, and with an expiry that is enforced in CI rather than remembered.**
**Bound by (not re-litigated):** ADR-025 §1 (save integrity > update correctness > update speed > update convenience); ADR-025 §4 (atomic replacement, interruption recovery, saves outside the blast radius); ADR-025 §2 (schema-bounded rollback); `AI_RULES.md` §9.

---

## Context

ADR-025 §3 states the rule this ADR narrows:

> An unsigned or unverifiable package is never installed, never "installed with a warning", and never gated behind a user override.

That rule is right, and nothing here disagrees with it as a destination. What it did not account for is that **it cannot be satisfied by writing code**. An Authenticode signature requires an OV or EV certificate from a commercial CA, or a cloud signing service; both are procurement, identity verification, and lead time that the project does not control. Every other guarantee in ADR-025 was buildable — and has been built, across eleven commit boundaries in Phase 15.

So the v0.2 release has a choice between shipping unsigned and not shipping. §Alternatives E of ADR-025 already settled the shape of that argument in the other direction:

> a security or data-loss fix cannot reach players who do not check a website, which is a _worse_ save-integrity outcome than a careful updater.

An updater that cannot ship at all is that outcome with extra steps.

---

## Decision

**ADR-025 §3 describes two protections, not one. The publisher signature is deferred to v0.3. Artifact integrity verification is not deferred, and remains fatal to the update.**

### 1. What is deferred

**Publisher signature (Authenticode).** v0.2 artifacts are unsigned. `electron-builder.yml` declares no certificate, and this is a stated absence rather than an oversight — see §4.

### 2. What is not deferred

**Artifact integrity.** The update feed carries a SHA-512 for every artifact, served over HTTPS, and a downloaded package whose hash does not match is discarded before anything on disk is touched. This needs no certificate and is enforced from the first v0.2 release.

ADR-025 §3's operative sentence therefore still holds in the narrowed form that matters most at install time: **verification failure discards the download, leaves the installed application untouched, and reports it.** There is no "install anyway", no warning-with-override, and no dial. §3's reasoning for that — _"the thing being protected is their save and the attacker is not them"_ — is untouched.

### 3. What is actually lost, stated plainly

A SHA-512 from the feed proves the bytes arrived as the feed described them. It does **not** prove who wrote the feed.

| Threat                                              | Signed (v0.3) | Unsigned + hash (v0.2) |
| --------------------------------------------------- | ------------- | ---------------------- |
| Corrupted download                                  | Caught        | **Caught**             |
| Tampering between the feed and the client           | Caught        | **Caught**             |
| Compromise of the publishing account or the release | Caught        | **Not caught**         |
| A trusted-CA MITM rewriting feed and artifact alike | Caught        | **Not caught**         |

The root of trust in v0.2 is the release host and the TLS chain, not the publisher. An attacker who can write to the GitHub release can publish a matching hash for whatever they like, and the client will accept it. That is the whole of the exception, and it is not small — it is accepted for one milestone because the alternative is no delivery channel for fixes at all.

### 4. The absence is declared, not implied

An unsigned build must be distinguishable from a build whose signing configuration silently broke. `electron-builder.yml` therefore carries an explicit marker of the decision rather than merely lacking a certificate field, so a future reader — and the guard in §5 — can tell "deliberately unsigned under ADR-028" from "somebody deleted the cert path".

### 5. The exception expires, and CI is what remembers

A temporary security relaxation that relies on someone remembering it is a permanent one. So the expiry is executable: **a build at version 0.3.0 or above with no signing configuration fails the test suite.**

`tests/signing-exception.test.ts` reads the version from `package.json` and the configuration from `electron-builder.yml`, using the project's own `compareVersions` — the same arithmetic the updater uses to order releases. Below 0.3.0 it asserts the marker is present and honest. At 0.3.0 it fails until signing is wired, and its failure message says why.

This is the mechanism `AI_RULES.md` §1.5 prefers over a comment: the decision is enforced where it can be observed, not stated where it can be scrolled past.

---

## Alternatives Considered

### A. Delay v0.2 until a certificate is provisioned

- **For:** ADR-025 §3 holds unmodified; no threat-model regression at any point.
- **Rejected because:** it blocks eleven boundaries of proven work on an external procurement with no date, and it leaves players on v0.1 with no delivery path for a fix. ADR-025 §Alternatives E already weighed exactly this trade and came down on shipping.

### B. Ship v0.2 with no updater; add it in v0.3 alongside signing

- **For:** honest; no update machinery running below its designed threat model.
- **Rejected because:** it discards the guarantee the phase was built for. The updater's other protections — schema-bounded rollback, atomic replacement, interruption recovery, restart discipline — are the ones that protect a **save**, which §1 ranks above everything. Withholding them to avoid a signature regression inverts the precedence rule.

### C. Self-signed certificate

- **For:** produces a signature; satisfies the letter of §3.
- **Rejected because:** it satisfies nothing else. A self-signed certificate is not in any trust store, so it neither removes the SmartScreen warning nor establishes publisher identity — it converts an honest absence into a signature that looks like assurance and is not. Worse than unsigned, because it is harder to notice.

### D. Ship unsigned with a user override to install anyway

- **Rejected by §3's own reasoning, which stands:** the player is not the attacker, so there is nothing for a dial to protect against. An override would also make the hash check advisory, which is the one protection v0.2 still has.

---

## Tradeoffs Accepted

| We accept                                                    | To gain                                                      | Mitigation                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| No publisher identity; the release host is the root of trust | v0.2 ships with a working delivery path for fixes            | SHA-512 verification stays fatal; the exception expires at 0.3.0 (§5)      |
| Windows SmartScreen warns on first install                   | No dependency on certificate procurement lead time           | Documented for players in the release notes rather than hidden             |
| The installer shows "Unknown publisher" at the UAC prompt    | Same                                                         | Same                                                                       |
| ADR-025 §3 is not fully satisfied for one milestone          | The other five guarantees of ADR-025 ship and protect a save | §1's precedence rule is what decides this, and it ranks save integrity top |

---

## Consequences

### Immediate

- `electron-builder.yml` declares no certificate and carries the ADR-028 marker (§4).
- `tests/signing-exception.test.ts` enforces the expiry (§5).
- The v0.2 release notes state that the build is unsigned and that SmartScreen will warn.

### Ongoing

- **Never install an artifact whose hash does not match**, unchanged from ADR-025 §3.
- **Never add an override** that installs an unverified package.
- **Never self-sign** (§Alternatives C).
- v0.3 planning carries certificate procurement as a release blocker, not a nice-to-have.

### Validation

- ADR-025's _"a tampered artifact is rejected and the installation is untouched"_ survives in narrowed form and remains testable: tampering below the feed is caught by the hash.
- The v0.3 expiry is asserted by a test that fails at the version bump, not by a note.

### Revisit if

- A certificate is provisioned before v0.3 → wire it immediately; this ADR's exception ends the moment it is no longer needed, not on a schedule.
- The release host's account security is materially weakened → the exception's only remaining root of trust is gone, and delivery stops until signing lands.

---

## Related

| Document        | Relationship                                                       |
| --------------- | ------------------------------------------------------------------ |
| ADR-025 §3      | The rule this narrows, for one milestone                           |
| ADR-025 §1      | The precedence rule that decides the trade                         |
| ADR-025 §4      | The replacement discipline that is **not** relaxed here            |
| `TECH_STACK.md` | §7.3's security posture, and the dependency record for the updater |
| `ROADMAP.md`    | v0.3 carries certificate procurement as a blocker                  |
