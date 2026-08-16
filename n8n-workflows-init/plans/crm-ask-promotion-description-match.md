# CRM ask — promotion `description` matching returns rows that do not match, tagged `match_tier: "and"`

**For:** the `sorento_crm` agent. **Raised from:** `sorento_crm_n8n`, 2026-08-10.
**Endpoint:** the entity resolver (n8n node `resolve-entity-http`), promotion rows,
`match_field: "description"`.

Customer-visible symptom: *"any promo for cabana bathtub"* answers with four Cabana promotions,
**none of them bathtub**. *"any promo for cabana car"* answers with five, one of them a **Sorento**
ceramic sink promo.

## Two defects, both provable from the resolver's own response

### 1. `match_tier: "and"` is asserted on rows where a query word is absent

Query `tokens: ["cabana bathtub"]`, `match_mode: "and"` → 15 promotion rows, every one
`match_field: "description"`, `match_tier: "and"`.

Word-presence check against each row's own `display.description`:

| row description | contains `cabana` | contains `bathtub` | tier claimed |
|---|---|---|---|
| CABANA NEW ARRIVAL CWC7606-SH_16062026 (OFFICE USE).pdf | ✅ | ❌ | `and` |
| CABANA KITCHEN SINK PROMO 27042026 (OFFICE USE).pdf | ✅ | ❌ | `and` |
| CABANA BASIN TAP PROMO_08122025 (END USER).pdf | ✅ | ❌ | `and` |
| CABANA NEW ARRIVAL BATHROOM FURNITURE PROMO CBFAL5572_18062026 | ✅ | ❌ | `and` |
| … 15/15 identical pattern … | ✅ | ❌ | `and` |

**`bathtub` appears in zero of the 15 descriptions**, yet all 15 are tagged as having matched both
words. Confirmation that the word contributed nothing at all: the result set for
`"cabana bathtub"` is **byte-identical (same 15 uuids)** to the set for the token `"Cabana"` alone
(exec `11917835`, where the parser split the phrase and resolved `Cabana` separately).

Consumers cannot distinguish "matched everything you asked" from "matched one word and ignored the
rest", because the tier says the former in both cases.

### 2. Word matching is by SUBSTRING, not word boundary

`"cabana car"` returns three rows that are **not** in the Cabana set:

```
SORENTO UPDATED CERAMIC SINK PROMO (ALA-CARTE & COMBO)_30072026 …
```

`car` matched **`ALA-CARTE`**. Those rows contain **neither** `cabana` **nor** `car` as a word — so
`match_tier: "and"` is false on both counts — and they are Sorento, not Cabana, so a Cabana enquiry
is answered partly with another brand's promotions.

## Reproduction

Resolver responses captured verbatim in n8n execution data:

| execution | tokens | rows | note |
|---|---|---|---|
| `11920606` | `["cabana bathtub"]` | 15, all `description`/`and` | set == `Cabana` alone |
| `11917989` | `["cabana car"]` | 15, all `description`/`and` | includes 3 Sorento `ALA-CARTE` rows |
| `11917835` | `["Cabana", "bathtub"]` | Cabana → 15 (`description`/`prefix`); **bathtub → 1 PRODUCT literally coded `BATHTUB`**, no promotions | AND intersection empty → `fallback_applied: true`, OR-mode |

Note the third row: when the phrase is split, `bathtub` resolves to a product whose code is
literally `BATHTUB`, the AND intersection is empty, and the resolver correctly reports
`fallback_applied: true` + `fallback_match_mode: "or"`. **That path is honest.** The single-token
path is the one that misreports.

## What we would like

1. **`match_tier` must be truthful.** If not every query word is present in the matched field, the
   row is not an `and` match. A separate tier (`partial`, or the count of words matched) would let
   consumers decide; today they cannot tell.
2. **Match on word boundaries, not raw substrings** — or expose which words matched per row, so
   `car` ⇄ `ALA-CARTE` is at least visible.
3. Ideally, **return the unmatched words** for the query. That is the single most useful field for
   us: it lets the bot say *"no promotion matches bathtub"* instead of silently presenting a
   broader list as if it answered.

## Why this matters more than it looks

n8n now echoes the scope back to the customer — *"I found 4 promotions for Cabana, bathtub"* — so a
false match becomes a false statement to the customer rather than a quietly wrong list. We can
suppress it on the split-parse path (a token that contributed nothing is named and escalation is
offered), but on the single-token path the resolver reports full confidence and n8n has nothing to
go on.

## Related, same family, not yet filed separately

`cabana kitchen tap promo` (parser splits into brand `Cabana` + category `kitchen tap`) returns the
**union**: Cabana promotions **plus** `SORENTO NEW KITCHEN TAP PROMO` / `UPDATED SORENTO KITCHEN
MIXER TAP PROMO`. Both tokens genuinely contribute rows, so nothing looks unmet — but no single row
satisfies *both*, which is what the customer asked for. This is the AND→OR fallback again; it is
correctly flagged as `fallback_applied` on the resolver side, and the n8n-side wording for it is
open on our end.

---

## ✅ AGREED CONTRACT (2026-08-10) — `sorento-crm` PR #121, **not yet merged**

Build against this shape; every earlier shape in this thread is superseded. One additive field on
AND-shaped responses. **No top-level `match_semantics`. Nothing inside `by_entity_type`, ever** —
both now pinned by a named CRM test (`test_semantics_is_nested_per_token_never_top_level`) carrying
our reasoning, so a future re-flattening fails there instead of surfacing in our spine.

```json
"token_coverage": [
  { "token": "cabana bathtub",
    "match_semantics": "max_coverage",
    "coverage": [
      { "entity_type": "promotion",
        "matched_words": ["cabana"],
        "unmatched_words": ["bathtub"],
        "truncated": false } ] } ]
```

### Reading it without repeating the bug it fixes

Four rules, each of which is a way to turn the honesty field back into a false statement:

1. **Computed over the FINAL rows** — after the access-level filter, promotion expansion and limit.
   Coverage describes exactly what `intersection` contains when we receive it. (The blocker: the
   first build computed it at the resolver boundary, before `references.py` filtered, so an
   entitlement-filtered zero-row result claimed every word matched. `access_levels` is on our
   promo path every turn, so that was our production case.)
2. **Zero rows ⇒ `coverage: []`** — no claims at all. Render the existing empty-result message;
   add nothing.
3. **A type ABSENT from `coverage` means NO CLAIM, not "no match".** Rows synthesized by the
   promotion expander carry no scored text. Treating absence as unmatched would fabricate
   "no promotion mentions X" out of silence.
4. **`truncated: true` changes the WORDING, not just the confidence.** Say *"none of these mention
   X"*, never *"no promotion mentions X"*. Two causes, same handling: (a) rows of that type were
   cut by a cap; (b) **the type contains rows nobody scored** — membership-walk promotions beside
   description-matched ones, expander-synthesized products beside probed ones. The earlier note
   that promotions "will effectively never set it" is WRONG under (b): our commonest phrase shape
   sets it routinely.

5. 🔴 **On a pure `promo for <SKU>` phrase the promotion type is ABSENT from coverage — and that is
   CORRECT.** Every row is membership-derived, nothing was scored, so there is no claim to make
   (rule 3). This matters more than it reads: `promo for <SKU>` is our most common promotion
   query, so `unmatched_words` will simply not be there on the busiest path. **The per-token join
   inference in `promo-picker` is therefore load-bearing, not a fallback** — do not delete it when
   wiring coverage.

   The defect behind this rule, caught on the CRM side by a third adversarial pass: the
   description-fallback fired for every promotion row including membership-walked ones, whose
   descriptions were never scored, inventing `unmatched=[<SKU>]` on exactly that SKU's own
   promotions. We would have told a customer "none of these mention SRTKT1636SS-GM" while showing
   them its three promos. Now gated on `match_field == "description"`.

Also: per entity type, so an unscoped call yields several entries per token — read the one for the
type being presented and **never merge them** (merging is what credited `bathtub` to a product
coded `BATHTUB` while every promotion lacked the word). Words echo as the customer typed them
(`taps` stays `taps`). The field may be absent entirely — coverage failure degrades to omission,
never a 500 — so consume fail-open.

### Where this plugs in on our side

`promo-picker`'s `_unmatchedProducts` currently infers unmet scope by joining shown promotions back
to per-token `resolutions[].matches`. Once `token_coverage` lands, the promotion entry's
`unmatched_words` is the same answer stated by the source rather than inferred — prefer it when
present, keep the inference as the fallback.

### 🔴 RETRACTED: coverage does NOT detect the disjoint-union case

An earlier draft of this section claimed `token_coverage` also fixes `cabana kitchen tap` (both
tokens contributing rows, no single row satisfying both). **That is wrong — do not wire it that
way.** Coverage pools blobs across all rows WITHIN a type, so a word counts matched if ANY row
contains it:

```
promotion rows = {cabana promos} ∪ {sorento kitchen tap promos}
  cabana / kitchen / tap   -> each present in SOME row -> all matched
  coverage: unmatched=[]        …while zero rows satisfy all three
```

Coverage answers a **set-level** question ("is this word absent from everything I'm showing?").
The union gap is a **row-level** question ("does any single row satisfy the whole token?") — which
is precisely the per-row satisfaction `match_tier: "and"` never asserted, and which the CRM
deliberately did NOT expose (the agreed line was fix the reporting, don't touch the matcher).

Wiring coverage as the union detector would have shipped a signal that reads authoritative and
reports something narrower than its name implies — the same failure this whole thread is about,
one level up, and ours jointly. Caught by the CRM session reviewing my summary back to them.

The honest handle, **requested as a follow-up, not in PR #121**: an additive per-entry
`any_single_row_matches_all` boolean, computable from blobs the API layer already holds. `false`
with an empty `unmatched_words` IS the disjoint-union signature — every word landed somewhere, no
row holds them all. Until it exists, **neither signal covers this gap**; keep the per-token join
inference, knowing it is blind here too.

⚠️ Do not wire any of this until it is on main AND the MCP has restarted — tools register at
process start, so merged-but-not-restarted is indistinguishable from not-deployed.
