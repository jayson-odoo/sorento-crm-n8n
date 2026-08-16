# UAC §DP

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §DP-0 — Preconditions (build-time GO/NO-GO, read-only, run BEFORE any wiring)  `scope: deterministic`

> Change `dym-probe-before-offer`. Design: `plans/dym-probe-before-offer-plan.md`.
> Every §DP case runs against the clone `txiPzSxy3Pclsz6v` in **`mode=regress-capture`** with the
> `respond_contacts_test` row reset between independent cases (LESSONS §31; memory
> `uac-mode-reads-prod-session` — `437264483`'s PROD session is stale-contaminated and `uac` mode reads
> it, which has silently produced wrong-question answers twice). Contact `437264483` (FULL access).
> **§0 applies to every case below.** Each case's §0 line is stated once here and inherited: S1 no send
> (the D1 render never reaches a credentialed send node on the clone); S2 no assign/SLA/PIC; S3 the 5
> orphaned + 1 sinked containment re-asserted from JSON; **S4 the probe tool is a READ tool** — assert
> the `tool` string passed to `dym-probe` is exactly `crm_master_product_attachments_list` or
> `crm_inventory_stock_balance_list` and never a `_create`/write tool; S5 `is_test/test_mode === true`
> on every sub call including `dym-probe`; S6 `deterministic` ⇒ **zero LLM nodes executed**;
> S7a TEST-sink delta accounted, S7b prod-sink delta zero via **both** the per-poll `LLEN` series and the
> per-poll pop payload, execution ids recorded; S8 no `is_test:false` run against any fork containing a
> credentialed node type.
>
> **Assert per-node `runData`, never execution status** (LESSONS §61a, memory
> `unwired-error-output-masks-failure`): an unwired error output makes a failed run report `success`.
> Every case names the node and the key it asserts.

- **§DP-0a (= plan §6-DP-V1) — attachment scoping uuid exists.** From a real live execution of a
  `product_attachment` certificate turn, read `disallowed-entity-gate` runData
  `.compatible_entities`. **Assert:** ≥1 entity with `entity_type ∈ {attachment_type, certificate}` AND
  a UUID-shaped `uuid`. **Report the whole array and its length** — an empty printout is not a pass.
  **FAIL ⇒ `product_attachment` ships DISABLED in `DOMAIN_PROBE`; §DP-1..§DP-4 are then N/A, not
  skipped-green.** Rationale: `disallowed-entity-gate.js:59-64` unions resolver entity types with raw
  parser hints, so the gate can pass with no uuid at all, and the probe then returns every attachment of
  every type → "has certificate" on a brochure-only product.
- **§DP-0b (= §6-DP-V2) — attachment probe envelope.** Read-only `crm_master_product_attachments_list`
  with a known `product_ids` + `attachment_type_ids`. **Assert:** `answers[].title` is a product code
  and `fields` carries both `Product Code` and `Attachment Type`. **Then repeat with
  `attachment_type_ids` OMITTED and assert the rows carry MIXED `Attachment Type` values** — this is the
  positive observation that the false-positive mode is real and is what `dym-annotate` layer 2 keys on.
- **§DP-0c (= §6-DP-V3) — inventory envelope + genuine zero.** Read-only
  `crm_inventory_stock_balance_list`. **Assert:** `Product Code` and `Quantity On Hand` present and
  numeric-parseable. **Find and record at least one product code whose rows sum to 0** — that code is
  the fixture for §DP-14. If no genuine-zero product can be found, §DP-14 is **blocked**, not passed.
- **§DP-0d (= §6-DP-V5) — probe target id.** From the clone workflow JSON (**not** memory, **not** MCP
  `get_workflow_details`'s redacted view): `dym-probe.workflowId.value === 'rysSPgUssLDf6xJc'`, and no
  `probe-incoming` parameter was copied into it. Live target would be `Fss5aAaXthJSWpZCgKiKR`;
  `probe-incoming` and `Call 'sub-get-results'` point at the TEST fork on LIVE and must never be the
  copy source.

## §DP-1 — product_attachment · SOME candidates have the document  `scope: deterministic`

- **Trigger:** `ibwc8315-s10 cert` (contact `437264483`) — a real measured dead-end. Pin
  `mock_reformulator_output`: `message_type:business_query`, `domain_hint:'product_attachment'`,
  entities = `[{raw:'ibwc8315-s10', hint:'product'}, {raw:'cert', hint:'attachment_type'}]`. Pin
  `resolve-entity.resolutions` to ONE genuine-miss token `ibwc8315-s10`, `resolved:false`, no exact
  match, `matches` = 3 non-exact product candidates each with a UUID-shaped `uuid`
  (`IBWC8315-S`, `IBWC8315-SL`, `IBWC8315-S10-P`). Pin `disallowed-entity-gate.compatible_entities` to
  include a UUID-shaped `attachment_type` (or `certificate`) entity. Pin the `dym-probe` answer set so
  **exactly one** candidate (`IBWC8315-SL`) has a row with a non-empty `Attachment Type`.
- **Expected branch/path:** `sibling-gate[1] → dym-transform → dym-gate[0] → dym-probe → dym-annotate →
  build-suggest-offer`. `dym-transform.probe_needed === true`; `dym-gate` takes output 0;
  `dym-annotate.dym_probe_meta.ok === true`.
- **Structural assertions (per-node runData):**
  - `dym-transform`: emits **exactly ONE item**; `probe_tool === 'crm_master_product_attachments_list'`;
    `probe_predicate === 'row_present_with_type'`; `dym_probe_entities` contains all 3 candidate
    products **and** the `attachment_type`/`certificate` entity, every one with a UUID-shaped `uuid`.
  - `dym-probe`: input `tool` equals the string above (**S4**); input `entities` is
    `dym-transform.dym_probe_entities` (not `compatible_entities`).
  - `dym-annotate`: output carries `escalate_message`, `is_clarification` and `found_summary` from
    `not-found-error-message` (**the load-bearing property** — proves the not-found payload was not
    replaced by the probe payload); `dym_available_codes === ['ibwc8315-sl']`;
    `dym_probe_meta.probed` has all 3 codes.
  - `build-suggest-offer`: `suggest_response` contains `IBWC8315-SL — has certificate` and both others
    `— no certificate`; **`IBWC8315-SL` is rendered FIRST** (has-first sort);
    `suggest_offer === true`; `suggest_selection_context === 'suggest_offer'`.
  - **`suggest_quick_reply` is `IBWC8315-SL,IBWC8315-S,IBWC8315-S10-P,Yes escalate,No it's okay`** — bare
    codes, no ` — has …` suffix anywhere in it, no stray comma.
  - `suggest_last_result_set` and `dym_candidates` are rebuilt from the **sorted** picks: entry `idx:1`
    is `IBWC8315-SL` in both, matching rendered line 1.
- **Safety:** §0 all, per §DP-0 preamble.

## §DP-2 — product_attachment · NONE of the candidates have the document  `scope: deterministic`

- **Trigger:** §DP-1 fixture with the probe answer set pinned to `answers: []`.
- **Expected:** offer still shown, all 3 codes labelled `— no certificate`, and the resolver's
  **similarity order is preserved exactly**.
- **🔴 Ordering contract — STABLE PARTITION, no tiebreak** (corrected 2026-08-07, reviewer F-RANK).
  The earlier wording asserted both "original API rank order preserved" **and** "code-order
  tiebreak applies"; those cannot both hold, and the tiebreak clause licensed a real regression —
  a `localeCompare` fallback alphabetically re-sorted a list the resolver had ranked by
  similarity, which is the *majority* annotated outcome. The comparator is now
  `(Number(b.has) - Number(a.has))` **alone**. `Array.prototype.sort` is stable, so:
  - **no candidate has the thing** → every key is equal → **zero movement**; the rendered order
    is byte-identical to the un-annotated (LIVE) order;
  - **some have it** → the has-group moves to the front, and **resolver order is preserved inside
    each group** (has-group and no-group alike).
  Assert the exact rendered order against the resolver order, and assert it equals the order the
  current LIVE `build-suggest-offer` produces on the same pinned input. An alphabetical render is
  a **hard fail**, not a cosmetic difference.
- **Structural assertions:** `dym_available_codes === []`; `dym_probe_meta.ok === true` (the probe
  *succeeded* and found nothing — distinct from a failure); `answer_count === 0`; `suggest_offer ===
  true` (**the offer must NOT be suppressed**); `suggest_quick_reply` bare codes, in the same order
  as `suggest_last_result_set` (§DP-11b).
- **Also assert the some-have case** (belongs here because it is the same comparator): with the
  resolver order `A, B, C` and only `C` having the thing, the render is `C, A, B` — **not** `C`
  followed by an alphabetised `A, B` that happened to coincide. Use a fixture whose resolver order
  is deliberately **not** alphabetical, or the assertion cannot distinguish the two comparators.
- **Safety:** §0 all.

## §DP-3 — product_attachment · probe returns EMPTY / unscoped  `scope: deterministic`

Two sub-cases; both must degrade to today's un-annotated offer.

- **§DP-3a — probe payload has no `answers`/`items` array** (pin `{}`). Assert
  `dym_probe_meta.ok === false`, `reason` non-null, `dym_available_codes === []`, and
  `suggest_response` contains **no** `— has ` or `— no ` substring at all.
- **§DP-3b — unscoped probe detected** (F3 layer 2): pin `answer_count > 0` with **zero** rows carrying
  an `Attachment Type` field. Assert `dym_probe_meta.ok === false`,
  `reason === 'unscoped_probe'`, and **no annotation rendered**. This is the case that stops a
  brochure-only product being labelled "has certificate".
- **Structural assertion for both:** `suggest_response`, `suggest_quick_reply`,
  `suggest_last_result_set` and `dym_candidates` are **byte-identical** to the current LIVE
  `build-suggest-offer` run on the same pinned input.
- **Safety:** §0 all.

## §DP-4 — product_attachment · probe ERRORS  `scope: deterministic`

- **Trigger:** §DP-1 fixture; induce a real `dym-probe` failure (unreachable tool name / forced sub
  error).
- **Expected:** turn completes with today's un-annotated offer. **Never a dead-end.**
- **Structural assertions:**
  - `dym-probe` node config asserted from JSON: `onError === 'continueRegularOutput'`. **Assert it is
    NOT `continueErrorOutput`** — an unwired `main[1]` would make this very case report green while the
    turn silently broke (LESSONS §61a).
  - `dym-annotate` **executed** and emitted `dym_probe_meta.ok === false`; the not-found keys
    (`escalate_message`) survive.
  - `build-suggest-offer` executed and `suggest_offer === true`; `tag-not-found` executed;
    `compile-current-state` produced a non-empty `user_response`.
  - Scored on **runData presence + payload shape**, explicitly **not** on execution status.
- **Safety:** §0 all.

## §DP-5 — inventory · SOME candidates have stock  `scope: deterministic`

- **Trigger:** `Have stock SRTUB2232-1600?` (contact `437264483`) — a real measured dead-end. Pin
  `domain_hint:'inventory'`; `resolve-entity.resolutions` = ONE genuine-miss token with 3 non-exact
  uuid-carrying candidates (`SRTBT2232-1600`, `SRTUB2232-1500`, `SRTUB2232-1800`). Pin the probe answers
  so `SRTUB2232-1800` has rows summing `Quantity On Hand > 0` and the others have **no rows**.
- **Expected:** `dym-transform.probe_tool === 'crm_inventory_stock_balance_list'`,
  `probe_predicate === 'qty_gt_zero'`.
- **Structural assertions:** `dym_available_codes === ['srtub2232-1800']`; `suggest_response` renders
  `SRTUB2232-1800 — has stock` FIRST and the other two `— no stock`; `suggest_quick_reply` is bare
  codes; `dym_probe_entities` contains **only** the 3 product candidates (no attachment entities —
  `requires` is empty for inventory).
- **Safety:** §0 all; S4 asserts the inventory read tool.

## §DP-6 — inventory · NONE have stock  `scope: deterministic`
- As §DP-2 with the inventory fixture: `answers: []` ⇒ all three `— no stock`, `ok:true`,
  `suggest_offer` still true, quick_reply bare.
- **Safety:** §0 all.

## §DP-7 — inventory · probe returns EMPTY  `scope: deterministic`
- As §DP-3a with the inventory fixture: `dym_probe_meta.ok === false` ⇒ no `— has `/`— no ` substring;
  output byte-identical to current LIVE on the same pinned input.
- **Safety:** §0 all.

## §DP-8 — inventory · probe ERRORS  `scope: deterministic`
- As §DP-4 with the inventory fixture. Same `onError` config assertion, same runData-not-status scoring.
- **Safety:** §0 all.

## §DP-9 — ★ HARD GATE: the unscoped-probe guard (F2a)  `scope: deterministic`

The single most dangerous failure in this change: an empty `product_ids` makes
`crm_inventory_stock_balance_list` return **every product × every active warehouse** ("ALL FILTERS
OPTIONAL"), which is both a large unnecessary prod read and a **100 % false-positive** annotation.

- **Trigger:** §DP-5 fixture with every candidate's `uuid` pinned to `null`.
- **Expected:** `dym-transform.probe_needed === false`,
  `probe_skip_reason === 'no_candidate_uuid'`; `dym-gate` takes output **1**.
- **Structural assertions:** **`dym-probe` DID NOT EXECUTE** — assert its absence from `runData`, not
  merely that no rows came back. `build-suggest-offer` output byte-identical to current LIVE.
- **Also assert the mirror for attachments:** §DP-1 fixture with the `attachment_type`/`certificate`
  entity removed ⇒ `probe_needed === false`, `probe_skip_reason === 'no_scoping_entity'`,
  `dym-probe` absent from runData (F3 layer 1).
- **Safety:** §0 all.

## §DP-10 — non-enabled domain unaffected — BYTE-IDENTICAL (regression gate, blocks promote)  `scope: deterministic`

- **Trigger:** one D1 miss per non-enabled domain: `order`, `master_products`, `promotion`, `incoming`.
- **Expected:** `dym-transform` executes (it is on the path) but emits `probe_needed === false` with
  `probe_skip_reason === 'domain_not_enabled'`; `dym-gate` output 1; `dym-probe` and `dym-annotate`
  **absent from runData**.
- **Structural assertions:** run the changed clone `build-suggest-offer` jsCode and the current LIVE
  jsCode against the same pinned input; `suggest_response`, `suggest_quick_reply`,
  `suggest_last_result_set`, `dym_candidates`, `dym_offer` and the full output object are
  **byte-identical**. This is the gate that blocks promote.
- **Safety:** §0 all.

## §DP-11 — 🔴 `suggest_quick_reply` stays BARE CODES (asserted on EVERY annotated case)  `scope: deterministic`

Code mode (`build-suggest-offer.js:274`) uses the codes as **button labels** and the pick round-trips on
that exact string through `output_exchange`'s `tryDymPick`. Annotation belongs in `suggest_response`
ONLY. This is the single easiest way to break the change.

- **§DP-11a — bareness.** On §DP-1, §DP-2, §DP-5 and §DP-6, assert `suggest_quick_reply`:
  matches `^[A-Za-z0-9\-\.\/]+(,[A-Za-z0-9\-\.\/]+)*,Yes escalate,No it's okay$`; contains **none** of
  the substrings `—`, ` has `, ` no `; splits on `,` to exactly `picks.length + 2` entries; and every
  code entry appears verbatim in `suggest_last_result_set[].value`.
- **§DP-11b — order consistency after the has-first sort.** The sort changes button order. Assert
  `suggest_quick_reply.split(',')[i] === suggest_last_result_set[i].value` for every `i < picks.length`,
  **and** that rendered line `i+1` of `suggest_response` names the same code. Then drive the follow-up
  turn: reply with the *second* offered code and assert `output_exchange` resolves that exact code (a
  stale, pre-sort `suggest_last_result_set` would resolve the wrong one).
- **Safety:** §0 all. Note the follow-up turn is multi-turn — do **not** reset
  `respond_contacts_test` between the two turns of §DP-11b (LESSONS §31).

## §DP-12 — coverage boundary: the OTHER two inbounds stay un-annotated (asserted, not assumed)  `scope: deterministic`

`build-suggest-offer` has 4 inbound after this change; only `dym-annotate[0]` and `dym-gate[1]` are new.
D1 can still fire on `annotate-incoming-picker[0]` and `sibling-probe[0]` (D3 returns early only when
`extras.length > 0`), and those turns are **un-annotated by construction**.

- **Trigger:** (a) an `incoming` ambiguous-picker turn reaching `annotate-incoming-picker[0]` whose D1
  fires; (b) a `sibling-probe[0]` turn where `extras.length === 0` so D3 falls through to D1.
- **Expected:** `dym-transform` and `dym-annotate` **absent from runData** on both;
  `build-suggest-offer` output byte-identical to current LIVE.
- **Structural assertion:** static — count inbound edges to `build-suggest-offer` in the clone JSON:
  **exactly 4**, named `sibling-probe[0]`, `annotate-incoming-picker[0]`, `dym-gate[1]`,
  `dym-annotate[0]`; `sibling-gate[1] -> build-suggest-offer` is **gone**.
- **Safety:** §0 all.

## §DP-13 — out-of-scope arms are byte-identical  `scope: deterministic`

- **§DP-13a — multi-token, D1 LANE ONLY** (re-scoped rev 5: the limit is now lane-specific, so this case pins the `d1` lane; the `partial` lane deliberately allows multi-token — §DP-16d). Pin a two-genuine-miss-token `inventory` fixture so
  `_survivors.length === 2`. Assert `dym-transform.probe_needed === false` with
  `probe_skip_reason === 'multi_token'`; `dym-probe`/`dym-annotate` absent from runData; the multi-token
  block's `suggest_response`, the **global contiguous `idx`** in `suggest_last_result_set`, and
  `dym_candidates` are **byte-identical** to current LIVE. (Renumbering across token blocks is the
  round-trip regression this exclusion exists to prevent.)
- **§DP-13b — numbered mode unreachable for the enabled domains.** Static assertion from
  `disallowed-entity-gate.js:6-15`: `allowed_lookup` is `['product','category','brand']` for `inventory`
  and `['product','attachment','attachment_type','category','brand','certificate']` for
  `product_attachment` — **neither contains `promotion`**, and `tokenCandidates()` filters on
  `allowed_lookup`, so no uuid-`canonical_code` candidate can survive. Then the dynamic half: attempt to
  pin a promotion candidate into an `inventory` D1 and assert it is **dropped by `tokenCandidates()`**
  (so numbered mode never renders). If it survives, the static claim is false — **hard fail**, do not
  ship the "unreachable" wording.
- **§DP-13c — D2 untouched.** A data-miss turn with `alternatives[]` in either enabled domain:
  `dym-transform.probe_needed === false` (no genuine-miss token) and D2's output byte-identical to LIVE.
- **Safety:** §0 all.

## §DP-14 — ✅ CLOSED (verified live 2026-08-07): genuine-zero rows are NOT "has stock details"  `scope: deterministic`

> **VERIFIED — this is the observation that proves `qty_gt_zero` is in force rather than
> row-presence.** Exec `11512474`: **`SRTWC8318-RL-BL1`** has exactly **one** stock row with
> `Quantity On Hand: 0`, and the turn rendered **`- no stock details`** with
> `dym_available_codes: []`. A row-presence predicate would have said "has". The discriminating half
> that earlier runs could not establish (their fixtures had genuine zeros *alongside* positive rows
> for the same code) is now settled by a code whose rows are **all** zero.
>
> **Fixtures for re-use, so nobody re-derives them:** `SRTWC8318-RL-BL1` (the one above), and
> `MWC7601-RL-S10`, `SRTWC8318-RL-BL`, `SRTWC8318-RL-GY` also carry 0-qty rows.
>
> See §DP-17 for why the *label* nevertheless says "stock details". That is settled and is not a
> defect.

`crm_inventory_stock_balance_list` "returns a genuine 0", and emits one row **per warehouse**. Row
presence is therefore not has-stock — the property that makes the shipped incoming attribution work does
**not** generalize.

- **Trigger:** §DP-5 fixture, using the genuine-zero product code recorded by §DP-0c. Pin its probe rows
  to `Quantity On Hand: "0"` in two warehouses, `"—"` in a third, and give one other candidate a single
  row of `"4"`.
- **Expected:** the zero product is labelled **`— no stock`**; only the `"4"` product is `— has stock`.
- **Structural assertions:** `dym_available_codes` contains the `"4"` code and **not** the zero code;
  `dym_probe_meta.probed` contains **both** (they were probed, one just has none — a probed-but-zero code
  must render `— no stock`, never be left unlabelled); the `"—"` warehouse row parsed as 0, not NaN, not
  dropped.
- **Safety:** §0 all.

## §DP-15 — ★ F-DUPE: a code behind >1 candidate uuid is EXCLUDED from the probe  `scope: deterministic`

*(Added 2026-08-07, reviewer §6.1. Promote-blocking for both domains.)*

`product_code` is unique **per company** (`app/models/product.py:182`,
`uq_products_company_product_code`), so one code under two uuids is **two different companies'
products** — not a data-entry duplicate, and nothing to clean up. `tokenCandidates()` dedups by
code and discards the second uuid, after which **arrival order decides which company the rendered
line represents**. Both probe tools are company-scoped, so the twin returns zero rows and the line
reads `— no <noun>`: a true statement about *someone else's* product, printed where the customer
reads their own.

The fix is exclusion, **not** a uuid union: the pick path (`output_exchange.applyDymPick`) resolves
a **single** `dym_candidates` uuid, and the probe's render envelope carries **no product id**, so a
union would answer over a set, promise `— has`, and then dead-end on the empty twin — a false
promise on top of the dead-end this change exists to remove.

- **Trigger:** §DP-1 fixture, but `resolve-entity.resolutions[0].matches` carries **four** entries
  where `IBWC8315-SL` appears **twice with different UUIDs**. (Also reproduce in `inventory` — the
  tester saw it there first; there is no per-domain split.)
- **Expected:** probe still runs for the unambiguous siblings; the ambiguous code is offered but
  **unlabelled**.
- **Structural assertions (`dym-transform` runData):**
  - `probe_needed === true`;
  - `dym_excluded_codes === [{ code:'IBWC8315-SL', reason:'multi_uuid_code', uuid_count:2 }]`;
  - `dym_candidate_codes === ['IBWC8315-S','IBWC8315-S10-P']` — the ambiguous code is **not** probed;
  - **neither** twin uuid appears in `dym_probe_entities`, and no entity carries the ambiguous code.
- **Render assertions (`build-suggest-offer`):** the two unambiguous codes carry `— has …`/`— no …`;
  the ambiguous code renders **BARE** — assert it matches **neither** `IBWC8315-SL — has ` nor
  `IBWC8315-SL — no `. It is **still offered**: present in `suggest_quick_reply` and
  `suggest_last_result_set`, `picks.length` unchanged at 3. Exclusion removes the *annotation*,
  never the candidate.
- **§DP-15b — ALL candidates ambiguous.** Every surviving code behind >1 uuid ⇒
  `probe_needed === false`, `probe_skip_reason === 'multi_uuid_code'` (distinct from
  `no_candidate_uuid`), `dym_probe_entities === []`, `dym-probe` **absent from runData**, and the
  render **byte-identical** to current LIVE.
- **§DP-15c — same product at two tiers is NOT ambiguous.** The same uuid returned at `exact` and
  `prefix` tier must **not** trigger exclusion (the census dedups by uuid). Assert
  `dym_excluded_codes === []` and the code is probed normally. Without this, the guard would
  silently delete the feature on ordinary multi-tier resolver output.
- **Safety:** §0 all.

> **Not fixed here, filed separately:** *today, before this change*, a customer offered an
> ambiguous code who picks it is routed to an arbitrary company's product. Some share of the
> measured 67% dead-end rate that motivated this whole change may be that, not missing data. It is
> a resolver/CRM issue and is out of scope for §DP.

## §DP-16 — ★ the SECOND renderer: `compile-current-state` partial-resolution  `scope: deterministic`

*(Added 2026-08-07, rev 4. Found by the user on the chat console, not by any §DP case — §DP-1..§DP-15
only ever exercised `build-suggest-offer` D1.)*

A turn where **some** entities resolved (results came back) and others missed renders its own
did-you-mean from `compile-current-state.js` — independent of D1, with its own `_numbered`/`_dymCands`
and its own global contiguous `idx`. Before rev 4 it was un-annotated, so the bot contradicted itself
depending on whether the turn partially resolved.

**Reachability (settled, do not re-derive):** `dym-annotate` reaches `compile-current-state` **only**
via `cs-offer-gate[1]` (the not-found lane). The partial block fires on the **`central-exchange`**
lane, which `dym-annotate` cannot reach. Hence a second lane:
`central-exchange[0] → dym-transform-partial → dym-gate-partial → dym-probe-partial →
dym-annotate-partial → compile-current-state`, with `dym-gate-partial[1] → compile-current-state`.

- **Trigger:** a partially-resolved turn — one token answered, one genuine miss with 3 candidates
  (the user's real case: `srtwc8317` answered, `srtwc8317-rl1` missed). Run once per enabled domain.
- **Structural assertions:**
  - `dym-transform-partial` emits ONE item, correct `probe_tool`/`probe_predicate`;
    `dym-probe-partial` input `tool` is the read tool (**S4**) and `entities` come from
    `dym-transform-partial`, not `compatible_entities`;
  - `dym-annotate-partial` output carries the **`central-exchange`** payload (`has_result`,
    `response`) — **not** the not-found payload. This is the load-bearing property, mirroring §DP-1.
- **Render assertions:** each candidate line carries ` - has <noun>` / ` - no <noun>`;
  **🔴 the global contiguous `idx` and the candidate ORDER are unchanged from LIVE** — strip the
  suffixes from `user_response` and it must equal LIVE's byte-for-byte. **There is no has-first sort
  on this renderer** and adding one is a round-trip regression.
- **Pick-linkage:** `variables.dym_last_result_set` must equal LIVE's object-for-object, including
  `for_raw`/`for_hint`/`for_canonical` on every row (D1's rows do not carry these; this renderer's
  do, and the annotation must not disturb them).
- **§DP-16b — fail open.** Neither annotate node executed, or `dym_probe_meta.ok === false` ⇒ the
  **whole output object** byte-identical to LIVE.
- **§DP-16c — F-DUPE carries over.** A multi-uuid code renders bare here too, is still offered in
  `dym_last_result_set`, and its siblings are still labelled.
- **§DP-16d — multi-token: LIFTED in rev 5, partial lane only.** The gap recorded here in rev 4 is
  closed. `dym-transform` detects its lane (`$('central-exchange').isExecuted` ⇒ the results arm)
  and allows `_survivors.length > 1` **on the partial lane only**; D1's exclusion is untouched.
  Assert: a two-token miss (e.g. the tester's `R4-Z1`, six candidates) yields
  `probe_lane === 'partial'`, `probe_needed === true`, `dym_candidate_codes` spanning **both**
  tokens, every candidate annotated, and the global contiguous `idx` still LIVE-identical.
  Mirror-assert the same fixture on the D1 lane still reports `probe_skip_reason === 'multi_token'`.
  Fail-safe: if the lane probe throws, the conservative single-token limit applies.
- **Safety:** §0 all. Note this lane puts a CRM read on **answered** turns that carry a genuine miss,
  which plan §3.7's "zero new nodes executed on answered turns" no longer describes.

## §DP-17 — wording + separator — **SETTLED, do not reopen**  `scope: deterministic`

- `has stock details` / `no stock details` (inventory) and `has certificate` / `no certificate`
  (attachment). Suffix separator is `-`, in the suffixes THIS change introduces only.
- **D3's `— has incoming` and the `"<token>" — did you mean:` header are pre-existing and keep their
  em-dash** — assert both, so a future sweep doesn't "normalise" them.
- Re-run §DP-11a/b: `suggest_quick_reply` must contain neither `—` nor ` - has `/` - no `.

### 🔒 Label vs predicate — decided 2026-08-07, with the evidence in hand. Do not file this as a bug.

- The predicate **is** `qty_gt_zero` (summed `Quantity On Hand > 0`), and that is now **verified
  live**, not assumed — see §DP-14 below.
- The label says **"stock details"**, which reads as record presence. The two do not describe the
  same thing, **and that is intentional.** The user was shown the exact discriminating case — a
  product whose only warehouse row carries `Quantity On Hand: 0` renders `- no stock details` even
  though a stock *record* exists — and chose to keep the wording.
- **Rationale, so the reason travels with the instruction:** the customer should not have to parse a
  row-exists / qty-zero / no-row distinction. The label describes **what the customer can act on**
  ("is there stock I can have"), not what the database contains.
- ⇒ **Do not "fix" either side to match the other**, and do not raise the mismatch as a finding.
  A deliberate, informed simplification.

## §DP-18 — ★ the FOURTH surface: the require-specific PICKER  `scope: deterministic`

*(Added rev 5. Found by enumerating **rendered strings** across every Code node — the method that
should have been used from the start; graph-inbound enumeration missed §DP-16 and §DP-18 both.)*

`disallowed-entity-gate.js:209` renders `product_attachment search needs to be more specific.
Multiple matches found — please choose:` + up to 8 numbered bare codes into `gate_clarification`,
which `not-found-error-message.js:175` copies verbatim into `escalate_message`. D1 never fires on
these turns (`requireSpec` suppresses it) — so the **same codes D1 annotates** rendered bare here.
That is the user's original complaint, on a fourth surface. Real case: exec `11512191`,
`cert for SRTWC19`.

**No new nodes and no new lane.** This surface is already downstream of the existing not-found dym
chain (`… → sibling-gate → dym-transform → dym-gate → dym-probe → dym-annotate →
build-suggest-offer`), so only the planner (candidate source) and the renderer changed.
**`If-incoming-picker` / `probe-incoming` / `annotate-incoming-picker` are untouched** — assert
that from JSON, including that `If-incoming-picker`'s domain condition is still exactly `incoming`.

- **Trigger:** `cert for SRTWC19` (contact `437264483`), 8 ambiguous product candidates.
- **Structural assertions (`dym-transform`):** `probe_lane === 'picker'`; `probe_needed === true`;
  `dym_candidate_codes` == all 8 offered codes **in gate order**.
  **🔴 `dym_probe_entities` must contain the `attachment_type` uuid** — on this path
  `compatible_entities` is REPLACED by the option-uuid set (`disallowed-entity-gate.js:215-217`),
  so the scoping entity is **not** there and must come from the resolver flatten. Assert its
  presence explicitly; without it the F3 layer-1 guard fires and the surface silently stays bare.
- **Render assertions (`build-suggest-offer.escalate_message`):** every line gains
  ` - has certificate` / ` - no certificate`; **the header line is unchanged**; **the numbering
  `1..8` is unchanged and NOTHING is reordered** (the numbers are the pick affordance).
  `suggest_offer` stays `false` and **no `suggest_quick_reply` is invented** — this is a numbered
  list, so the respond.io button cap is not engaged. Assert message length stays sane (~700 chars
  for 8 annotated lines).
- **§DP-18b — F-DUPE + fail-open carry over.** A multi-uuid code renders bare; probe failure or
  `ok:false` leaves `escalate_message` **byte-identical to `gate_clarification`**.
- **§DP-18c — `incoming` unaffected.** Its own picker still annotates via
  `annotate-incoming-picker` with its pre-existing `— has incoming` wording. `inventory` is not
  require-specific and must **not** be probed on this surface.
- ⚠️ **Promote note:** this surface reuses the chain whose sibling `probe-incoming` targets
  `rysSPgUssLDf6xJc` on LIVE (the known F6 landmine). That collision is **not** this change's
  promote ruling — §I stands on its own reasoning (scope forwarding), and the two must not be
  conflated.
- **Safety:** §0 all; S4 asserts the attachment read tool.

## §DP-19 — 🔴 RENDERED-TEXT gate: assert what the CUSTOMER receives, per surface  `scope: deterministic`

*(Added rev 6, after the third instance of "computed correctly, rendered bare, every gate green" —
LESSONS §63, plan §8d.)*

`build-suggest-offer` emitted a perfectly annotated picker and **the customer received the bare
8-line list** (exec `11514456`). `escalate-catalog.js:20-23` re-sources `escalate_message` **by name**
from `not-found-error-message` — the node upstream of the entire dym chain — and
`build-suggest-offer` correctly spreads rather than mutates, so the annotated object was simply never
consumed. Every §DP case was green, because they all assert an **intermediate node's output object**.

**Binding rule: every annotated surface needs an assertion on the TERMINAL CONSUMER's text**, in
addition to the producer's object. Producer-only assertions cannot see this class.

| surface | producer (already asserted) | **terminal consumer — MUST also assert** |
|---|---|---|
| D1 (§DP-1) | `build-suggest-offer.suggest_response` | `compile-current-state.user_response` (sources `$('build-suggest-offer')` — the authority; **not exposed**, but assert it) |
| partial (§DP-16) | `compile-current-state` block | `compile-current-state.user_response` (same node appends in place; **not exposed**) |
| picker (§DP-18) | `build-suggest-offer.escalate_message` | **`escalate-catalog.response`** — this is the one that was broken |
| all | — | end-to-end: **`save-session-vars.user_response`** and/or the sendmsg egress payload |

- **§DP-19a — per-surface.** For each of the three, assert the rendered text contains the expected
  ` - has <noun>` / ` - no <noun>` suffixes. **`save-session-vars.user_response` is the ground truth**
  — it is the frozen would-be-written payload and needs no egress (LESSONS §42).
- **§DP-19b — the gate must DISCRIMINATE.** Run the **pre-fix** consumer body against the **post-fix**
  producer output and assert the annotation is **absent**. A rendered-text gate that has never been
  shown to distinguish the two is worth nothing. (Done permanently in-suite: `harness.js` runs both
  `escalate-catalog.js` and `live-ec.js` against the same `build-suggest-offer` output.)
- **§DP-19c — flags stay coherent with the text.** `escalate-catalog` derives `manualResponse` from
  `require_specific` and `is_escalate_offer` from `is_clarification` **on the same object** it took
  the text from. Assert both alongside the text, on whichever source won.
- **§DP-19d — fail-open, three ways.** Preferred source absent / `escalate_message` empty / null ⇒
  the response equals today's `gate_clarification` **exactly**, never empty. And the
  `annotate-incoming-picker` fallback (used when `not-found-error-message` did not execute) must be
  **unchanged** — assert an `incoming` picker still renders its `— has incoming` wording.
- **⚠️ Exercise fail-open for real.** The CRM origin returned Cloudflare 504s during the rev-5 pass
  (two execs died at `check-access-http`, one hung ~4 min — upstream of every dym node, so not caused
  by this change). This change now issues a read on three lanes; **the probe-failure path must be
  observed, not merely configured.** Induce a probe failure and confirm the turn completes with the
  un-annotated offer.
- **Safety:** §0 all.

## §DP-FP — Fail-on-purpose: prove every §DP assertion can go RED  `scope: deterministic`

> Mandatory. This repo has a recurring **"green that cannot fail"** class — four instances in one day
> (LESSONS §61, memory `green-that-cannot-fail`). **An assertion never shown to fail is not an
> instrument.** No §DP case may be signed off until its matching FP below has been observed RED, with
> the execution id recorded.
>
> 🔴 **§0 S9 applies to every step below.** Prove the mutation APPLIED before reading the suite
> result: assert the search string occurs exactly N>0 times **before**, assert the digest **changed**
> after, abort without running the suite if either fails. A suite result obtained without both
> assertions is **void** — this is LESSONS §61b, the fifth instance of the class, and it happened
> *inside this very §DP-FP section* (a mutation targeting `return (hb - ha);` against a source that
> reads `return hb - ha;` printed ALL PASS). Use
> `tests/offline/dym-probe-before-offer/mutate.sh`, which enforces all three and refuses to run the
> suite otherwise.

- **§DP-FP-1 — annotation detector.** Against §DP-1, repin the probe so **all three** candidates have a
  typed attachment row. Confirm §DP-1's `dym_available_codes === ['ibwc8315-sl']` assertion goes **RED**
  (it becomes all three). Proves the code-attribution parser is actually reading the answers and not
  returning a fixed value.
- **§DP-FP-2 — has-first sort.** Repin so only the **last** candidate has the document; confirm the
  "rendered FIRST" assertion goes RED if the sort is removed from the jsCode. Run once with the sort
  deliberately deleted. **Then the F-RANK mirror:** re-add
  `|| String(a.m.canonical_code).localeCompare(String(b.m.canonical_code))` to the comparator and
  confirm §DP-2's ordering assertion goes RED (the all-negative render alphabetises). This is the
  regression the reviewer found on the first build; its gate must be a live instrument.
- **§DP-FP-3 — 🔴 quick_reply bareness.** Deliberately append `— has certificate` to one
  `suggest_quick_reply` entry and confirm the §DP-11a **regex clause** and the **substring clauses**
  (`—`, ` has `, ` no `) go RED. A bareness check that stays green here is worthless.
  - **NARROWED 2026-08-07 (reviewer item 3).** The **entry-count** clause is deliberately **NOT**
    in this must-go-red set. A suffix cannot change `split(',').length` unless it contains a comma,
    and `build-suggest-offer` strips commas from every label
    (`.map(s => String(s).replace(/,/g,''))`), so even a comma-bearing suffix could not move it.
    The clause is a real instrument — for **pick-count / index drift** — and stays as a §DP-11a
    assertion; it is simply not an instrument for annotation leakage. The tester's observation that
    it stayed green was correct and is the "green that cannot fail" discipline working; requiring
    it here would have made §DP-FP-3 itself unfalsifiable.
- **§DP-FP-4 — byte-identity gates.** Introduce a one-character change to the un-annotated render path
  and confirm §DP-3, §DP-10, §DP-12 and §DP-13a all go RED. If any stays green, that gate is comparing
  nothing — fix the gate before scoring the case.
- **§DP-FP-5 — the unscoped-probe guard.** Remove the `no_candidate_uuid` clause from `dym-transform`
  and confirm §DP-9's "`dym-probe` absent from runData" assertion goes RED (the probe fires with empty
  `product_ids`). This is the guard whose absence causes a full-table read; its test must be proven live.
- **§DP-FP-6 — genuine-zero predicate.** Switch `dym-annotate` from `qty_gt_zero` to row-presence and
  confirm §DP-14 goes RED (the zero product becomes `— has stock`).
- **§DP-FP-7 — error-path scoring.** Confirm §DP-4 is scored on runData, not status: change
  `dym-probe.onError` to `continueErrorOutput` with `main[1]` unwired, and verify the execution reports
  **`success`** while §DP-4's `dym-annotate`-executed / `ok:false` assertion goes RED. This reproduces
  the exact defect (LESSONS §61a) and proves the case can see it.
- **§DP-FP-8 — the §0 gate itself.** Per §0, confirm S4 can go red: pin the `tool` string to a write
  tool name in a scratch fixture and verify the S4 assertion fires before the probe runs.
- **§DP-FP-9 — the F-DUPE exclusion.** Neutralise the guard in `dym-transform`
  (`if (uu && uu.size > 1) {` → `if (false) {`) and confirm §DP-15 goes RED — the ambiguous code
  re-enters `dym_candidate_codes`/`dym_probe_entities` and gets a confident suffix decided by
  arrival order. **Observed 2026-08-07: 11 assertions RED.** This is the guard whose absence prints
  another company's answer on the customer's line; its test must be proven, not assumed.
- **§DP-FP-10 — the mutation harness itself.** Run one mutation with a **deliberately wrong** search
  string and confirm the runner **ABORTS** (`occurrences before: 0 (expected 1)`) instead of running
  the suite and printing ALL PASS. **Observed 2026-08-07: aborts, exit 1.** Without this step,
  every other §DP-FP result above is unverified.
