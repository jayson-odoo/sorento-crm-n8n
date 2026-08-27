# Node diff — ambiguous customer asks which company instead of unioning them

**Date:** 2026-08-20 · **Target:** clone `txiPzSxy3Pclsz6v` (`8fc15092` → `bcc24f17`). Three nodes, small hunks each: `disallowed-entity-gate`, `cs-offer-gate`, `compile-current-state`. Live spine untouched.
**Captain's call, reversing the earlier "leave as is":** *"better to clarify for the customer like let them pick, otherwise those SB smart show up very annoying."*

## The problem

A fuzzy customer token can resolve to several **unrelated companies**. "4 smart delivery status" resolved to 15 accounts spanning 4 SMART PLUS, SB SMART CONCEPT, EUROSMART BATHROOM SOLUTION, DE SMART HOME TRADING, FOUR SMART PLUS ENTERPRISE and V SMART KITCHEN, and the reply listed 16 orders belonging to three of them (exec 13207261). The `If3` miss gate cannot catch this — the customer *did* resolve, just to too many — so this is cross-customer breadth by a second route.

## Why "more than one match" is the wrong trigger

The blessed case (`Customer Mastile Klang Srtwc286 August delivery` → exactly one order) also resolves to **8 distinct names / 9 uuids**: `MASTILE KLANG SDN BHD`, `… [A/C I]`…`[A/C IV]`, `… - [IBORN]`, `… - [CERAMIC]`, `… (CERAMIC & ELLECI)`. Those are accounts of ONE company and must keep answering together.

So grouping is by **base name** — bracketed/parenthesised account suffixes and the SDN BHD form stripped before counting. Verified offline against the three real fixtures before any write: MASTILE → 1 base (answer, unchanged), merged pick → 1 base (unchanged), 4 smart → 6 bases (ask).

## The hunks

**1 · `disallowed-entity-gate` — the ask.** A new block after the existing require-specific section: when the domain allows customer lookups and no other picker claimed the turn, group compatible customer matches by base name; if more than one base survives, set `require_specific` / `gate_passed = false` and render `Which customer do you mean? Please choose:` with up to 8 name-labelled lines. `compatible_entities` becomes one representative row per base, in the same order as the rendered lines, each carrying a `title` (clean company name, account suffix stripped) so the persisted roster labels by name rather than debtor code.
Deliberately NOT done: adding `order` to `REQUIRE_SPECIFIC_DOMAINS`. That set also drives the product choose-list, so it would have started asking users to pick between `SRTWC286-*` variants and broken the blessed case.
Never fires when the customer arrived via an explicit pick (`dym_pick_applied` / `dym_partial_pick` / `reference_positions`) — the captain's rule is that a pick merges the family.

**2 · `cs-offer-gate` — one numbered list per turn.** The first build shipped the picker *and* the CS-member roster in the same message, so the reply carried two competing `1.`–`N.` lists. A fourth condition (`require_specific !== true`) suppresses the member offer on a picker turn. Inert everywhere else: before this change `require_specific` was never true in the order domain.

**3 · `compile-current-state` — let the roster hold customers.** The disambiguation roster was filtered to `entity_type === 'product'` (mirroring the old product-only picker), so the customer rows were dropped, `last_result_set` persisted empty, and the numbered reply had nothing to resolve — the pick died as *"can't be answered with a general search"*. The filter now admits `customer` as well.

## Acceptance (console, clone `bcc24f17`, zero egress)

| case | result |
|---|---|
| `4 smart delivery status` | **asks**: one clean list — 4 SMART PLUS SDN BHD, V SMART KITCHEN (M) SDN BHD, EUROSMART BATHROOM SOLUTION (M) SDN BHD, D & P SMART SUCCESS ENTERPRISE, HOMESMART HARDWARE & ELECTRICAL SDN BHD, BUILDER SMART DESIGN SDN BHD. No second numbered list |
| then `3` | 16 orders, **one company only** (`4 SMART PLUS`) — exec 13210907. Round-trip proven |
| `Customer Mastile Klang Srtwc286 August delivery` (blessed) | unchanged: `require_specific false`, exactly order 202608-2349, MASTILE only |
| misspelled customer + product ×2 | unchanged: If3 TRUE, customer did-you-mean, zero rows |
| `Srtwc286 August delivery` (no customer named) | unchanged: 104 orders across many customers — the block needs a customer entity to fire. That product-only exposure is the plan's deferred D-G policy question, untouched here |

No forbidden or orphaned egress node ran in any run.

## Known limitation (v1)

Picking a company pins the representative account's uuid, so sibling accounts of the SAME base are not merged into that answer (the pick above returned `4 SMART PLUS SDN BHD [A/C III]` rows). Under-inclusive rather than over-inclusive, and the opposite of the leak; if it matters, the follow-up is to resolve the picked row by name so the family merges the way a did-you-mean pick already does.

## Promote (HELD, captain-gated)

Three live nodes. **`disallowed-entity-gate` and `compile-current-state` have drifted between clone and live** (live lost the miss-company rounds on 2026-08-18), so both hunks must be re-applied onto a fresh live GET and re-reviewed against that base — never copied from the clone body. `cs-offer-gate` is a condition append and should port directly, but verify its three existing conditions match first.
