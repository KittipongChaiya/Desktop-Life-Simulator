# Phase 20 — Contracts

> **Delivers:** the heart of the version. The notice board posts real requests — a resident, a quantity, a crop, a deadline, a premium — and the player can promise, grow, and deliver. The first coin source above base price, and the first mechanic where the world holds a preference about what gets planted.
> **Governing decisions:** ADR-032 (and its same-day amendment); ADR-013 §4 (the price-band discipline the premium extends); ADR-031/ADR-022 (offers derive); ADR-015 (why the fix was a new link); `VISION.md` §2.2 (why expiry is silent).
> **Schema:** **v7 → v8 → v9** — two links in one phase, and §Two-links below is honest about why.
> **Status:** **Complete.**

---

## Commit boundaries

| Order | Boundary                                            | Commit    |
| ----- | --------------------------------------------------- | --------- |
| 1     | ADR-032, before an offer existed                    | `dba643e` |
| 2     | Schema v8: the world learns to hold a promise       | `6d59618` |
| 3     | Offers, commands, the expiry sweep                  | `e1d15cc` |
| 4     | The board panel and its slice                       | `bcb5458` |
| 5     | Schema v9: the exploit fix live verification earned | `6a98f1a` |
| 6     | This close                                          | _this_    |

## The design, in one line each

- **Offers derive; acceptances are state.** The board is a hash of
  `(seed, day, slot)` — the save never records an offer, and only a player's
  choice becomes a record, with its terms frozen so no rebalance rewrites a
  promise (ADR-020 §2's freezing rule, applied to a deal).
- **Every offer is actionable.** Items are yields of crops plantable in the
  posting day's season; the year-round turnip guarantees the pool — its
  third load-bearing job.
- **The premium is the second memorizable price rule.** `[1.25, 1.50]` over
  base, per-unit floored like the spot path: always above the spot channel's
  ceiling, never more than half again. Delivering does not touch the spot
  multiplier — the demand coupling is phase-21's seam, reserved since
  phase-06.
- **Expiry is silent.** A missed contract is a missed premium, counted and
  nothing more; and because expiry is a tick comparison, offline needs no
  model at all — the first live tick sweeps.
- **Delivery draws what selling draws.** The 07.9 lesson inherited rather
  than re-learned: the drain helpers are shared exports now, so the two
  channels cannot drift.

## Two links in one phase, and why

**The phase's live verification caught an economy-breaking exploit minutes
after v8 merged.** v8 deleted a contract on delivery; the record's store
presence WAS the double-acceptance guard; so a delivered offer reappeared on
the board as acceptable, and one good deal could be looped accept→deliver
all day — selling unlimited stock at 1.5× base with zero multiplier decay,
which defeats `GAME_DESIGN.md` §6.2's entire pricing system.

The fix needs the fulfilled record to outlive delivery, which is a shape
change. Two rules collided: `SAVE_FORMAT.md` §11.1 prefers one schema
version per phase; ADR-015 §3 forbids editing a merged migration, ever. The
hard rule won: **v9 is a new link, not an edit to v8**, and the collision is
recorded here, in the ADR's dated amendment, and in both migration headers.
A fulfilled contract now rides in the store — marked, docket-slot freed,
un-re-acceptable, un-re-deliverable, shown as a receipt — until the deadline
sweep retires it without counting it missed.

Worth naming: the screenshot pass that caught this was the same habit that
caught phase-18's spurious-save trigger. **Two phases running, the live look
found what 2,600 unit tests did not** — unit tests verify the rules you
thought to write, and the running game shows the rule you forgot.

## Verified live

A planted save: Board open → "Prue asks for 34 turnip · by day 4" →
Accept (offer flips to _accepted_, docket badges) → Deliver enables at
34/34 → click → **+612 coins float over the counter** (the existing
`itemSold` consumers, unchanged), "1 fulfilled · 0 missed", the promise row
becomes _delivered ✓_, and the offer stays un-acceptable. Marla's wheat
offer remains independently open.

## Suites at close

2,676 unit tests (39 new across offers, commands, sweep, slice, panel, and
two migration links, including the exploit's named regression), the full e2e
suite, typecheck, lint, boundaries, cycles. The criterion-12 evidence file
refreshes with the suite; the tick budget is untouched by a board that
derives.

## Deliberately not in this phase

Reputation effects and penalties (phase 22, on the §6 counters), the
market's demand response (phase 21), quest chains (phase 22), and any worker
automation of deliveries — promising and delivering are the player's acts,
like accepting.
