# Suggest-on-Miss — shared plan (Sorento CRM ⇄ n8n chatbot)

**Status:** design agreed, not built. **Owners:** CRM backend team + n8n chatbot (Claude).
**Goal:** kill dead-end "no data / not found" replies. On every miss, the bot offers
(a) close alternatives that DO have data, and (b) an escalation option — in ONE
interactive message with quick replies. A follow-up tap/reply is caught and answered
**in the same domain**.

This doc is the contract both sides build against. Split of work is in §7.

---

## 1. Problem (from 120 reviewed transcripts)

Top fixable theme = misses that dead-end. Two distinct miss types collapse into one UX:

- **Miss type 1 — resolution miss.** The token never matched a product/customer/DO
  (typo/dash/suffix: `srtkt71-ss`, `WC 8609`, `CWC707`→`CWCX707`). Bot should say
  "did you mean X, Y?".
- **Miss type 2 — data miss.** The entity resolved to a REAL record, but the asked
  domain has no row for the given filters (no stock / no ETA / no delivery today /
  no image). Bot should suggest the **nearest value on the binding filter** that DOES
  have data.

Cross-domain multi-intent (photo+price+spec in one msg) is a SEPARATE, rare (~2% of
reviewed) problem — **parked**, not in this plan (each domain routes to a different
team → assignment ambiguity).

---

## 2. Two suggestion sources (do not conflate)

| | Miss type 1 (resolution) | Miss type 2 (data) |
|---|---|---|
| Fires | before get-results (token → entity failed) | at get-results (entity ok, query empty) |
| Source | **resolver** `/references/resolve` `matches[]` | **MCP domain tool** `alternatives[]` |
| Owner | CRM (≈90% already built) | CRM (new, per-domain) |
| n8n role | render candidates | render alternatives |

---

## 3. Miss type 1 — resolver contract (mostly EXISTS)

`POST https://fe-sorento.foundryx.my/api/v1/system/references/resolve` already returns
per token: `resolved`, `ambiguous`, `matches[]` with `canonical_code`, `match_tier`
(exact › prefix › substring › trgm › embedding), `similarity`, `display{}`.

**Match-quality contract the spine branches on, per token:**
- `exact`  → proceed to get-results (today's happy path, unchanged).
- `fuzzy`  → `resolved:false` **with** `matches[]` present → render "did you mean …".
- `none`   → `resolved:false`, `matches:[]` → no candidates (escalation-only offer).

### CRM change 3a — dash/whitespace/case normalization is part of the EXACT tier
Today exact strips whitespace `\s+` only, NOT dashes. Extend exact-tier normalization
to also strip `-` (and match dash-insensitively):
- `srtkt71-ss` = `SRTKT71SS`, `SRTWT7438GM` = `SRTWT7438-GM`, `SRTWC-8517` = `SRTWC8517`
  → **exact**, proceed silently (no "did you mean").
- **Collision rule:** dash-insensitive match is `exact` **only when it flattens to
  exactly ONE distinct code**. If it hits 2+ distinct codes → demote to
  `ambiguous`/fuzzy → "did you mean X, Y?". (Never silently return the wrong SKU.)
- Real character diffs stay fuzzy: `CWC707`→`CWCX707` (inserted `X`),
  `…-250` when only `-200` exists.

Applies to ALL entity types (product, customer, order/DO — DO already normalizes
`2026-06-3640`↔`202606-3640`).

---

## 4. Miss type 2 — MCP tool contract (NEW, CRM)

When a get-results MCP domain tool returns **0 rows**, it must ALSO return alternatives
by **relaxing the binding filter** — the axis actually causing the emptiness — and
suggesting the nearest value on that axis that HAS data.

### Response shape (added to every read tool's empty path)
```json
{
  "rows": [],
  "alternatives": [
    { "relaxed_axis": "entity", "value": "SRTWC286-SH", "display": "SRTWC286-SH (stock 12)" },
    { "relaxed_axis": "entity", "value": "SRTWC287",    "display": "SRTWC287 (stock 5)" }
  ],
  "relaxed_axis": "entity"        // dominant axis relaxed, for phrasing
}
```
`relaxed_axis` ∈ `entity | date | type | active`. Each alternative carries its
distinguishing value so n8n phrases correctly:
- axis `entity` → "no stock for {code}, but {alt.value} has stock"
- axis `date`   → "no delivery on {date}, but {alt.value} has delivery"

### Per-domain relaxation map (priority order)
| Domain | Relax axes (priority) | Neighbour fn |
|---|---|---|
| stock / eta (inventory, incoming) | **entity** | base-stem sibling codes with data |
| order / delivery | **date** (same customer, nearest date w/ DO) → other open DOs | nearest ±date row |
| promotion | **entity** (product/brand neighbour) → **date / active** | neighbour brand/product promo; nearest active in window |
| product_attachment / cert | **entity** (neighbour product w/ that doc) → **type** | base-stem sibling w/ attachment; else same product other types |
| master_products (price/dimension) | **entity** | base-stem sibling |

### "Similar" = same base-stem, trigram to rank/widen
- **Sibling key** = shared **base-stem** (strip trailing variant-suffixes:
  `SRTWC8517-SH-UF-200` → stem `SRTWC8517`), NOT product category/family.
- Rank/widen with **pg_trgm** on `product_code`, above a similarity floor (reuse the
  resolver's existing trigram machinery). Anchor on base-stem so "1 char off = unrelated
  product" noise is excluded.
- **"Has data" filter is per-domain** — enforced inside each tool (only the stock tool
  knows stock, only incoming knows ETA). Do NOT build a central similar-with-data service.
- Deterministic only — no LLM inside the tool. Date relaxation window (e.g. ± N days /
  next occurrence) is a CRM-chosen constant; document it.

Applies to ALL entity types.

---

## 5. UX — combined offer + quick replies

**Every miss → ONE interactive message** carrying both alternatives and escalation:

> SRTWC286-GM has no stock.
> • no stock now — pick a similar one, or escalate to warehouse.
> [Yes, escalate] [No, it's okay] [SRTWC286-SH] [SRTWC287] [SRTWC8517]

Rules:
- **Escalation offered on every miss, all domains** → to that domain's team (reuse the
  reformulator routing map: stock→warehouse, order→customer_service, attachment→
  marketing_product, cert→purchasing_certification, promotion→marketing_promotion_<brand>,
  eta/incoming→purchasing, master_products→purchasing_product).
- **Suggestions capped at 3** → 5 quick replies total: `Yes, escalate`,
  `No, it's okay`, + up to 3 suggestions.
- **Suggestion button title = the canonical code** (or date value for date-axis). This
  makes the tap **self-resolving** (see §6).

### Quick-reply infra — EXISTS
`sorento-sub-respond-sendmsg-respond` (`aoydkG1dbItXR5jXFEQsP`) already has a
`quick_reply` input → `POST api.respond.io/v2/contact/id:{id}/message`
`{"message":{"type":"quick_reply","title":..,"replies":[...]}}`. n8n only needs to
populate `quick_reply` with the comma-joined button titles.

### ⚠ Open feasibility item (verify before build)
respond.io `quick_reply` likely maps to WhatsApp **reply buttons = max 3**, not 10.
If so, 5 options won't fit → switch to a WhatsApp **list message** (max 10 rows) or
trim to 3 buttons total. Also verify button-title length limit (codes up to ~20 chars;
list rows allow title 24 + description 72 — put code in title, `display` in description).
**Owner: n8n, verify with respond.io API docs / a test send.**

---

## 6. Catching the follow-up — reuse existing machinery (n8n)

No new state object. The spine already persists `domain_hint` + `last_result_set`
(`compile-current-state`) and the reformulator already resolves positional picks
(`reference_positions`) and **keeps the previous domain when the reply has no decisive
term**.

**One spine change:** on a miss-with-candidates turn, write the candidates/alternatives
into `last_result_set` (indexed, each `{idx, canonical_code, display}`) and keep the
domain in state. Then the follow-up resolves for free:

| User reply | Path | Domain |
|---|---|---|
| taps a suggestion (title = code) → incoming `"SRTWC286-SH"` | fresh resolve → exact → get-results | retained (bare code, no decisive term) |
| types `"1"` / "the SH one" | `reference_positions:[1]` → candidate[0].code → get-results | retained |
| `Yes, escalate` (or plain "yes") | escalation path (`is_escalation_confirmation`) | — |
| `No, it's okay` | decline, ack, stop | — |
| new topic w/ decisive term | domain flips, candidates dropped | new |

**Plain-yes rule:** `yes` = **escalate, always** (the yes-button is literally
"Yes, escalate"). Picking a candidate requires a tap or a typed code/number — never a
bare yes. Kills single-candidate ambiguity.

Reformulator work is minimal (behaviour mostly already correct); build/test the parser
change on the **clone's fork** `CpxE8LroLzCkrAQN`, not live `XTODTw-…`.

---

## 7. Task split

### CRM backend
1. **3a** Exact-tier normalization strips `-` too; dash-insensitive-unique = exact,
   multiple = ambiguous. (all types)
2. **§3** Ensure `resolved:false` returns `matches[]` when candidates exist (already
   does via `ambiguous`); expose `match_tier` for phrasing.
3. **§4** Add `alternatives[]` + `relaxed_axis` to every read MCP tool's empty path,
   per the per-domain relaxation map. Base-stem + trigram sibling fn; per-domain
   has-data filter; date-relaxation window constant.

### n8n chatbot (Claude, on the TEST clone `txiPzSxy3Pclsz6v` → promote reviewed)
4. **§3/§4 render** Consume resolver `matches[]` and tool `alternatives[]`; stop
   dead-ending — build the combined suggestion+escalation message.
5. **§5** Populate `quick_reply` (≤5, titles = codes/date values). Verify respond.io
   button/list limit first.
6. **§6** Persist candidates → `last_result_set` on miss turns; confirm
   `reference_positions` + keep-domain catch the follow-up. Parser tweak on fork
   `CpxE8LroLzCkrAQN` if needed.
7. Escalation team per domain from the routing map.

### Shared / verify
- respond.io quick-reply vs list limit + title length (§5).
- Date-relaxation window value (§4).
- **Regression guard:** exact-resolve + has-data paths must stay byte-identical; new
  behaviour fires ONLY on miss. Validate against the golden-master (`n8n_test`) replay.
- **Safety:** all build/test on the clone; escalation egress stays guarded (`is_test`),
  no real contact/assignment writes.

---

## 8. Phasing (suggested)
1. CRM 3a (dash normalization) — smallest, kills a big slice of resolution misses alone.
2. n8n §3 render of existing resolver `matches[]` — turns current dead-ends into
   "did you mean" with zero new CRM data work.
3. CRM §4 `alternatives[]` per domain (stock/eta first, then order-date, then rest).
4. n8n §4 render + quick replies + catch.
5. Regression replay + UAC on the clone → user-gated promote.

---

## 9. Test data — REAL cases (from `chat_histories` sheet, exported 2026-07-04)

All rows below are verbatim user messages from production history (sheet id in `.env`).
`[id]` = sheet row id. Two sets: **9.1 must-improve** (misses this plan should fix or
gracefully soften) and **9.2 must-not-regress** (working queries that MUST stay
byte-identical). 9.4 = real misses this plan does NOT fix (scope honesty).

### 9.1 Must-IMPROVE (acceptance)

**M1 — dash/whitespace normalization → EXACT (CRM §3a).** Currently dead-ends on dash
placement; after 3a must resolve exact and answer normally (if data exists).
| [id] | message | today | expected after |
|---|---|---|---|
| 37925/37930 | `Can check stock balance srtkt71-ss` | no match (dash) | `srtkt71-ss`≡`SRTKT71SS` exact → normal stock answer |
| 37886 | `Can check this d/o 2026-06-3640 already send out ?` | no match | `2026-06-3640`≡`202606-3640` exact → DO status |
| 38117/38165 | `SRTWT7438GM old list price?` | no match | `SRTWT7438GM`≡`SRTWT7438-GM` exact → resolve (price-history itself = §9.4) |

**M2 — fuzzy "did you mean" (resolver `matches[]`, §3).** Real char diff → candidates.
| [id] | message | expected after |
|---|---|---|
| 38031 | `cwc605-rl have stock?` | actual `CWCX605-RL` → "did you mean CWCX605-RL?" |
| 38506 | `I need the certificate of WC 8609` | actual `MWCY8609` → "did you mean MWCY8609?" |
| 38157/38163 | `Srtwc8517-250mm got stock？` / `…-SH-UF -250 got eta？` | only `-200` exists → "did you mean SRTWC8517-SH-UF-200?" |

**M3 — sibling-with-data (data miss, §4 entity axis).** Entity resolves, domain empty →
suggest base-stem sibling that has data + escalate.
| [id] | message | expected after |
|---|---|---|
| 38239 | `srtwt2206 stock available?` | no stock → siblings w/ stock (if any) + escalate warehouse |
| 38533 | `SRTJC3305 got stock?` | no stock → siblings w/ stock + escalate |
| 38105/38278 | `SRTBF11705 coming soon?` / `got eta?` | no eta on base → suggest `SRTBF11705-NEW` variant (has data) + escalate |

**M4 — date-relax (data miss, §4 date axis).** Customer resolves, no row on that date →
suggest neighbouring dates.
| [id] | message | expected after |
|---|---|---|
| 38519/38521/38103 | `Living Portal got delivery today?` / `ada hantar barang hari ini?` | no delivery today → "no delivery today; Living Portal has delivery on {nearest date}" + escalate CS |
| 38167 | `Popular Sanitary got delivery today?` | no delivery today → nearest date w/ DO + escalate |

**M5 — attachment/cert sibling+escalate (§4 entity/type + §5).**
| [id] | message | expected after |
|---|---|---|
| 38183 | `Pls share SRTWT2207 image with description` | image bound to `SRTWT2207-NL` → suggest that sibling |
| 38513/38517 | `WB7630 certificate` / `MHS1028 certificate` | no cert → sibling product w/ cert (if any) + escalate purchasing_certification |
| 38487 | `…Srtwc8518-SH Ikram…escalate?` | keep escalate, ADD sibling-with-cert suggestion in same message |

### 9.2 Must-NOT-REGRESS (real working queries — output must be identical)

These resolve exact AND have data today → the suggestion/relaxation path must NOT be
entered; reply unchanged.
| domain | real message(s) |
|---|---|
| stock (has data) | `Want check stock for srtwb1610` · `Can check Srtwb7109 have stock ?` |
| stock multi-line | `SRTWT5879-GM` + `Stock check 9 nos` |
| eta/incoming | `Check srtmcb6083 BL ETA` · `pleas check eta for cwc7601-rl` · `any incoming for CKS315` |
| order/DO | `do you have deliveyr to hanlim today` · `do you have DO to hanlim last week?` |
| photo | `Please share SRTSS8750 photo` |
| drawing | `can i have technical drawing for M9713SS` |
| cert (has data) | `have cwc7606-sh certificate?` |
| price/master | `Can send list price for SRTWT7301 ?` |
| catalogue | `SRTWT7301 product catalogue` |
| promotion | `Srtwc8517 promotion` |
| customer scope | `Please check for customer : syntalun` |
| casual (NO suggestion) | `Hai` · `What's the score of netherland vs morocco` · `i just say thankyou for the information` |

### 9.3 Regression invariants (assert in replay/UAC)
- **R1 — has-data ⇒ identical.** Any query returning ≥1 row today produces the exact
  same reply. Suggestion/alternatives path entered ONLY on empty results.
- **R2 — exact stays exact.** Dash-normalization (§3a) must not turn a today-exact code
  into ambiguous. `srtwb1610`, `cwc7601-rl`, `srtmcb6083`, `SRTSS8750`, `cwc7606-sh`
  must still resolve to the SAME single code. (Collision rule §3a is the guard.)
- **R3 — non-business untouched.** Greetings / thanks / off-topic (`Hai`, sports,
  "thankyou") classify casual as today — no suggestion or escalation injected.
- **R4 — existing escalation preserved.** Attachment/cert misses that escalate today
  still escalate (now possibly + siblings; escalation option never removed).
- **R5 — golden-master replay.** Replay all 2,216 `n8n_test` turns: non-miss turns must
  diff-clean; only intentional miss-turns diff, each manually reviewed. (Alternatives
  come from live resolver/tool, so miss-turn diffs need re-capture, not pinned replay.)

### 9.4 OUT OF SCOPE — real misses this plan does NOT fix (do not claim)
| [id] | message | why out of scope |
|---|---|---|
| 38097/38406 | `photo, list price and technical drawing for SRTWT7301` | cross-domain multi-intent — PARKED (§1) |
| 38176 | `What material is CKS6407?` | unsupported capability (material) — separate |
| 38148/38165 | `…price history` / `old list price` | price-history not supported — separate backend feature |
| 38262/38476 | `…PO outstanding delivery status` / `Paramount PO-013741 DO numbers` | DO-by-PO not supported — separate backend feature |
| — | `1` / `5` / `DO` / `PS202605-0020` (Lost Context rows) | multi-turn memory bug — separate fix |

---

## 10. n8n build + validation plan (Claude side)

Backend is DONE (`NEIGHBOUR-API.md`): no new endpoint; two extra fields arrive in calls
we already make — `matches[]` on `resolve-entity`, and `alternatives[]`+`relaxed_axis`
(+`suggested_escalation`) on the domain tool. **With-data responses are byte-identical**
→ render is gated on the new keys, happy path untouched. This is what makes R1 cheap.

### 10.0 Reference pattern (already shipped) — copy it
`build-cs-member-offer` already does the whole shape we need: turn a candidate list into
a numbered/quick-reply offer, keep the not-found preamble, set `*_last_result_set`
(indexed `{idx,label,uuid,…}`) + `selection_context`, and let `compile-current-state`
persist it so NEXT turn's `reference_positions`/name-pick resolves. We mirror this twice
(resolution-miss, data-miss). Send subs already accept `quick_reply`.

### 10.1 Rebase test flows on live (per `[[rebase-on-live-then-fix]]`)
Re-fork CURRENT live into the test targets so changes layer on latest, not stale:
- clone `sorento-consume-main TEST` (`txiPzSxy3Pclsz6v`) ← re-fork spine `9qVyfUxmRQqrpGRMDLRuz`.
- reformulator fork `CpxE8LroLzCkrAQN` ← live `XTODTw-dJcV0uRdC056hG` (if drifted).
- human-intervention fork `vUfFUDjLAuMaeQE6` ← live `rrYXzE61…` (if drifted).
- Keep all guards (`is_test` short-circuits, 5 orphaned egress nodes). Verify §0 S1–S6
  zero-egress still holds on the fresh fork BEFORE any edit.

### 10.2 Changes — node-level (on the clone only)
| # | Node / where | Change |
|---|---|---|
| D1 | `not-found-error-message` (after `If3`, resolution miss) | when `resolve-entity` returns `matches[]` (unresolved/`ambiguous` WITH candidates) → build "did you mean {matches[].canonical_code}" ; set `quick_reply` titles = `canonical_code` (≤3) + `Yes, escalate` + `No, it's okay`; persist candidates as `last_result_set` (`{idx,label:code,value:code}`) + `selection_context:'suggest_offer'`. Keep existing escalation preamble (combined message). |
| D2 | NEW code node after `Call 'sub-get-results'`, gated `response.alternatives != null` | data miss: build offer by `relaxed_axis` — `entity`→"no {stock/…} for {code}, but {alt.value}"; `date`→"no delivery on {asked}, {customer} has {alt.value}". quick_reply titles = `alt.value` (≤3) + escalate + no. Persist as `last_result_set` + `selection_context:'suggest_offer'`. Compose `suggested_escalation`. |
| D3 | `Call 'sub-get-results'` / `tool-filter` | verify the static `domain→tool` map (NEIGHBOUR-API §3) matches what get-results calls; alternatives ride back automatically — likely no change. |
| D4 | reformulator fork `CpxE8LroLzCkrAQN` | confirm bare code / bare position after an offer keeps prev domain (no decisive term) → `reference_positions` or fresh exact resolve. Add `selection_context:'suggest_offer'` handling to the position-pick resolver (mirror member-pick). |
| D5 | `tag-escalate-offer` / catch | plain "yes" on a `suggest_offer` → escalation (NOT a pick); "no" → decline+ack; tapped code/number → pick→re-query in retained domain. |
| D6 | send path | cap quick_reply ≤5; verify respond.io button(3) vs list(10) limit → switch to list-message if needed (NEIGHBOUR-API §5). |

Guardrails from `NEIGHBOUR-API §6`: no `alternatives` key ⇒ render "no similar with data,
escalate?" (don't invent); multi-product miss ⇒ no alternatives; never read `alternatives`
off `resolve`; never display `id`/`uuid`.

### 10.3 Validation — 3 gates (all on the clone, zero real egress)

**Gate A — chat-histories sheet (§9 cases), `uac` mode.**
Seed each real message → fire `zz-canary-run` → read `test:egress:{run_id}`.
- §9.1 M1–M5 → assert the NEW branch fires: correct render text, `quick_reply` present
  with expected candidate codes/dates, escalation composed, candidates persisted to
  `last_result_set`. Then seed the follow-up (tap=code / "1" / "yes") → assert it
  resolves in the SAME domain and answers.
- §9.2 → assert happy path UNCHANGED: no `alternatives` render, no `quick_reply` on
  has-data replies; casual (`Hai`, sports, thanks) → no suggestion/escalation.
- Every case: assert egress log = `would_send` only, 0 real send/assign/write.

**Gate B — golden-master replay (past 2,216 turns), `n8n_test`.**
- `regress-replay` (pinned externals) → assert **non-miss turns diff-clean** → proves
  R1/R3 and that the render gate didn't perturb happy paths.
- **R2 (exact stays exact):** diff `resolve-entity` output for the §9.2 working codes —
  same single `canonical_code`, no new `ambiguous`. (dash-normalize is CRM-side, but the
  clone must not mis-handle it.)
- Miss-turns that now render alternatives = EXPECTED diffs. Pinned replay can't produce
  live `alternatives`, so re-run the miss subset in `regress-capture` (real reads) →
  manually review each new offer. Log the miss-turn count; no silent pass.

**Gate C — formal UAC (`tests/UAC.md`).**
Add UAC cases mirroring M1–M5 + R1–R4 invariants; run the tester's §0 S1–S6 zero-egress
safety gate; record per-case results in `tests/runs/`. Reviewer signs the node-diff +
re-confirms zero egress from run logs.

### 10.4 Promote (user-gated)
Reviewed business-logic diff only, guards stripped, backup live first, then publish +
`publish_workflow`. Never edit live spine directly.

### 10.5 Sequenced execution
1. Rebase (10.1) + confirm zero-egress on fresh fork.
2. D1 resolution-miss render → Gate A on M1/M2 + R (fastest visible win, no data dep).
3. D2 data-miss render (entity axis: stock/eta first) → Gate A on M3/M5.
4. D2 date axis (order) → Gate A on M4.
5. D4/D5 catch + plain-yes → Gate A follow-up asserts.
6. D6 quick-reply limit resolution.
7. Gate B replay (full regression) + Gate C UAC → reviewer → user-gated promote.
