# Node diff — build-suggest-offer: DYM names the real miss (customer), not the passed-through product

**Date:** 2026-08-20 · **Change:** ONE node (`build-suggest-offer` jsCode), three hunks, on the clone `txiPzSxy3Pclsz6v` only. No other node, no connections, node count 183 unchanged.
**Ordered by the captain in-console** after testing the If3 gate (PR #26): gated turns rendered "Couldn't find \"Srtwc286\"" (the resolved product) while the actual miss — the customer — never rendered; with an exact product code no DYM appeared at all (exec 13186532).

## Versions

| step | version | content |
|---|---|---|
| base (If3 gate) | `f753dd1c` | `build-suggest-offer-BEFORE-f753dd1c.js` (34,733 chars) |
| hunks A+B | `ccd87830` | intermediate (acceptance d4/d5 ran here — hunk C does not affect those paths) |
| hunks A+B+C (final) | `8fc15092` | `build-suggest-offer-AFTER-8fc15092.js` (36,918 chars), sha-verified byte-exact after PUT |

Backups + full unified diff: `n8n-workflows-init/tests/backups/dym-copy-fix-2026-08-20/` (`hunks.diff`). Rollback = PUT `clone-full-get-pre-f753dd1c.json`-derived body (restores the pre-copy-fix graph; the If3 gate expression is unchanged by this change and identical in both).

## The three hunks (all in `build-suggest-offer` jsCode)

**A — F1 derived-token guard: tolerate prefix-stripped tokens.** `_isDerivedQueryToken` matched resolver tokens against parser entity raws by exact string. `resolve-entity` strips qualifier prefixes ("Customer Mastiles Klang" → token "Mastiles Klang"), so the genuinely-sent customer token was classified as the CRM's query-keyed derived resolution and excluded from the DYM (measured: execs 13184999, 13186532). Now a token contained inside one parser raw (≥3 chars) counts as sent; the whole-sentence query resolution can never be a substring of a single entity raw, so F1's original protection stands.

**B — passed-through tokens are not misses.** `missResolutions` counted any `resolved !== true` token with no exact-tier match as a miss — including an ambiguous product whose 10 variants ALL survived to `compatible_entities` and get queried on the answer lane. Now a token with at least one match present in `compatible_entities` (by uuid or code) is skipped: it passed, it is not DYM material. This is what made the gated reply key on "Srtwc286".

**C — customer candidates dedup by display name.** Resolver returns the same customer account multiply-coded (`canonical_code` as debtor NAME, debtor CODE `300-M001`, and a `DBR-…` hash — measured, exec 13186947), so code-keyed dedup rendered one customer as three "codes". Customers now dedup on `display.debtor_name || display.customer_name`; resolver similarity order keeps the name-coded row first, so candidates label as names. Products keep the existing code-keyed dedup byte-identically.

## Acceptance (clone, uac via zz-run-hint, dev contact 437264483, fresh state; zero-egress swept)

| case | exec | version | result |
|---|---|---|---|
| fuzzy product + misspelled customer | 13187399 | 8fc15092 | **"Couldn't find \"Mastiles Klang\". Did you mean MASTILE KLANG SDN BHD, or MASTILE KLANG SDN BHD [A/C I]?"** — product no longer asked about |
| exact product + misspelled customer (captain's 13186532 case) | 13187259 | 8fc15092 | same customer DYM; pickable buttons; `suggest_last_result_set` carries the customer uuids |
| correct spelling (regression) | 13187287 | 8fc15092 | If3 false, exactly order 202608-2349, MASTILE only — unchanged |
| garbage customer + product | 13187014 | ccd87830 | breakdown not-found, no bogus DYM (hunk C can't affect: zero candidates) |
| garbage product alone | 13187038 | ccd87830 | old If3 clause fires, breakdown + escalate — miss lane intact for products |
| pick round-trip (console, chat-stateful, session `dymfix-roundtrip-1`) | rt turns | 8fc15092 | reply "MASTILE KLANG SDN BHD" → next query customer-scoped (customer + product in "Here's what you want"), **zero cross-customer rows**. "No order matched" is correct there: the August order carries variant SRTWC286-SH-NEW, not the pinned -SH-200 |

One rerun (exec 13187240) parsed the same text as domain `incoming` with the customer entity dropped — parser LLM nondeterminism, pre-existing (same text parsed as `order` in 13186947/13187399); the gate still blocked everything (If3 TRUE, no get-results).

Zero-egress: all nine dym-fix executions swept — no forbidden/orphaned egress node ran; external HTTP = CRM reads only; sends via the guarded chat-rendezvous fork.

## Live promote (HELD, captain-gated — and NOT a byte-copy)

Live spine `9qVyfUxmRQqrpGRMDLRuz` (`57e70ce2`) carries a DIFFERENT `build-suggest-offer` body (33,355 chars): the F1 derived-token guard does not exist there (hunk A n/a — that guard is clone-era work not yet promoted), while the hunk B and C anchors (`let missResolutions`, `function tokenCandidates(res)`) are present exactly once each. Promote therefore = re-apply hunks B+C (and A only together with whatever change ships the F1 guard) onto a fresh live GET, never a body copy from the clone. Also note the If3 gate (PR #26) must be live before this copy change matters there at all — without the gate, order turns with a missed customer never reach the miss lane on live; they leak instead.
