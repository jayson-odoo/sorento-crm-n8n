# promotion-resolution baseline

## Pending run — DO NOT capture an `after` yet

The resolver change is **PR'd, not merged**: `sorento-crm` PR #121, branch
`feat/resolver-and-mode-match-honesty`. Capturing an `after` against a branch measures something
nobody is running. Wait for merge + deploy — and remember the MCP registers tools at process start,
so merged is still not callable until it restarts.

When it lands:

    bash capture.sh after.json && node diff.js baseline.json after.json

Expected: **LOST 0, GAINED 0**, RETIERED on every AND row (`match_semantics` + `token_coverage` are
new metadata on every payload — that is the change working, not a regression). Anything else is
either the parser drift the differ already marks NOT COMPARABLE, or something to send back.

The CRM session ran its own deterministic before/after over 40 real customer phrasings from the
WhatsApp history — 141 AND rows and 86 OR rows compared, `LOST=0 GAINED=0 ORDER-ONLY=0`, uuid /
`match_tier` / `match_field` / per-token sets all byte-identical, ordering checked separately from
set membership. That is the gate; this baseline confirms the end-to-end path independently.

## What this gates — and what it does NOT

Agreed with the CRM session, 2026-08-10. Two gates, different jobs; do not confuse them:

| gate | proves | deterministic? | gates a merge? |
|---|---|---|---|
| CRM pytest (`resolve_references_intersection`, fixed tokens) | resolver row sets + tiers do not move | yes — SQL over a fixed corpus, no LLM in the loop | **yes** |
| this baseline | the END-TO-END path still answers customers correctly | **no** — an LLM parser sits upstream | **no — it informs** |

So a LOST here **must not block a merge on its own.** Send it to the CRM session; they reproduce it
as a pytest case with fixed tokens. Reproduces → real, theirs. Doesn't → the parser. The
NOT COMPARABLE marker exists to keep this baseline honest about being the second kind.

Purpose: make "absolutely no regression to promotion enquiry" a **measurement**. Capture the
resolver's full row set per phrase before a change, capture again after, diff.

    bash capture.sh baseline.json
    # …resolver change…
    bash capture.sh after.json
    node diff.js baseline.json after.json     # exit 1 if any row was LOST

LOST = a promotion the customer could find before and cannot now. That is the only hard failure.
GAINED is reported but not failed — silently widening is how the `ALA-CARTE` rows got in unnoticed.

## 🔴 baseline.CONTAMINATED.json — do NOT use as a baseline

The first capture is void and kept only as evidence. Two phrases came back with tokens that were
never in them:

    "promotion flyer"              -> tokens ['cabana', 'kitchen tap']   n=21
    "any promo for cabana bathtub" -> tokens ['Cabana', 'bathtub']       n=16   (16, not 15)

Cause: **conversation state is per CONTACT, not per sessionId.** `capture.sh` uses a fresh
`sessionId` per phrase, which is not a reset — the entity carry from the previous phrase survives
into the next one, so each capture is polluted by the phrase before it. A baseline that depends on
phrase ORDER cannot prove anything about a resolver change.

Fix before re-capturing: drive each phrase with `previous_conversation_state: {}` rather than
through the stateful chat console — i.e. the `uac` lane per `clone-canary-item-envelope`, via the
runner (`zz-run-promo-picker`, `M5m6EYDLdSc0ofto`), not the `zz-chat` webhook.

This is the same landmine as `uac-mode-reads-prod-session`, arriving from the other direction: there
a missing reset read STALE state; here it writes state that contaminates the NEXT case.

## ✅ baseline.json — 14 phrases, 0 contaminated

Captured through the `uac` runner with `previous_conversation_state: {}` per phrase. The script
FAILS (exit 1) if any resolver token contains a word its phrase does not — the check the first
attempt lacked, which is why it looked healthy while being void.

| phrase | n | tokens |
|---|---|---|
| promo for SRTBF11834 | 10 | `['SRTBF11834']` |
| promo for CBS212-WH | 1 | `['CBS212-WH']` |
| promotion for bathroom furniture | 15 | `['bathroom furniture']` |
| any Cabana promotion | 15 | `['Cabana']` |
| promo for SRTKS6047-NEW | 9 | `['SRTKS6047-NEW']` |
| 6047 promo | 15 | `['6047']` |
| any promo for cabana bathtub | 16 | `['Cabana', 'bathtub']` |
| any promo for cabana car | 21 | `['Cabana', 'car']` |
| cabana kitchen tap promo | 21 | `['cabana', 'kitchen tap']` |
| promotion flyer | 0 | `[]` |
| promo for SRTWC6015-RL-UF | 3 | `['SRTWC6015-RL-UF']` |
| cabana taps promo | 8 | `['cabana', 'taps']` |
| promo MBF97582 | 1 | `['MBF97582']` |
| kitchen sink promo | 15 | `['kitchen sink']` |

The last three were supplied by the CRM session with counts verified against the live promotions
table. They pin the paths **substring matching exists to protect**, and each returns rows, so each
can actually LOSE them:

- `cabana taps promo` — `_word_variants` plural fallback (`taps` → `TAP`). Replaces my `TT440s`,
  which returned 0 rows AND could never have exercised the path: the variant logic deliberately
  never strips a trailing `s` from a token containing digits.
- `promo MBF97582` — a filename fragment sitting **after an underscore inside a compound**
  (`MBF97581_MBF97582 PROMO 31032026.pdf`). Reachable only by substring; word-boundary and prefix
  matching both lose it.
- `kitchen sink promo` — **the strongest case for loose matching.** 3 of its rows are
  `SORENTO NEW ARRIVAL KITCHEN SINK_22052026 …`. `_` is a word character, so there is no boundary
  after "SINK" and word-boundary matching drops those 3 silently. "Kitchen sink catalogue" and
  "Sorento kitchen sink catalogue" are verbatim customer messages — tightening the matcher would
  have broken a routine question by a fifth, with no error anywhere.

## 🔴 The parser is non-deterministic — the differ accounts for it

Between two captures **with no change on either side**:

    "promotion flyer"          tokens ['flyer'] n=7        ->  tokens [] n=0
    "any promo for cabana car" tokens ['cabana car'] n=15  ->  ['cabana','car'] n=21

The parser is an LLM and does not partition a phrase the same way every run. A naive diff would
report 7 LOST rows on `promotion flyer` and blame the resolver, which never saw the same question.

`diff.js` therefore compares TOKEN SETS first and marks a phrase **NOT COMPARABLE** rather than
counting it. Only phrases where the resolver was asked an identical question produce a verdict.
If a phrase comes back NOT COMPARABLE, re-capture that one before concluding anything — it is
evidence of nothing, in either direction.

## crm-fixture-rows.json

Raw rows for the CRM-side regression test: uuid + description + match_field/tier + company, plus a
`word_present` map computed here. Key fact for `"cabana car"`: **12 rows contain only `cabana`,
3 contain only `car`, ZERO contain both** — returned as one set under `match_tier: "and"`.

## 🔴 Resolver caps without ordering — why this baseline stays promotion-only

Found by the CRM session while chasing the parser non-determinism above, then **corrected by them**
once they noticed their first grep only saw SQLAlchemy `.order_by()` and missed 8 raw-SQL
`ORDER BY` clauses. The corrected picture:

| path | ordering | stable? |
|---|---|---|
| product trgm | `ORDER BY is_variant DESC, sim DESC, product_code` | **yes** — full tiebreak |
| 5 sites (promotion, customer, order, transporter…) | `ORDER BY sim DESC` | only until similarities TIE |
| 10 AND probes | none, `limit(AND_MODE_LIMIT)` = **200** | arbitrary over the cap |
| **29 prefix/substring probes** | none, `limit(PREFIX_LIMIT)` = **20** | arbitrary over the cap |

**The 20-cap on the OR path is what bites first**, not the 200-cap on AND — and OR-mode is the
ordinary per-token resolution most enquiries actually take. A token matching more than 20 rows
returns an arbitrary 20, unordered.

- **Promotions are safe today**: 29 rows against the 200 AND cap, and every phrase here resolves
  well under both limits (`kitchen sink` matches 13).
- **Products, attachments, customers, orders are exposed** — those corpora pass 20 easily.

⚠️ **Do not extend this baseline past promotions without addressing that.** A LOST on a product or
attachment phrase would be unattributable: an arbitrary slice, not a regression. The differ cannot
tell them apart, so the baseline would look like a gate while proving nothing.

✅ **Correction to an earlier draft of this file:** it claimed product did-you-mean was "on sand".
That was wrong and is retracted. The product trgm path carries a full deterministic tiebreak
(`…, product_code`) and is stable. The `ORDER BY sim DESC` paths are unstable only when
similarities tie — a real risk for short generic phrases, low for distinctive ones. Carrying a
warning stricter than the code deserves is its own kind of wrong.
