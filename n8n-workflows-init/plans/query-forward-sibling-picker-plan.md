# Change: `query-forward-sibling-picker` (incoming empty-exact-miss → sibling-family picker + escalate)

Status: PLAN (planner deliverable). No workflow edited, no execution run.
Scope tag: **`deterministic`** — the business change is Code + HTTP(read) + executeWorkflow(read) nodes on
the spine; **no parser/reformulator prompt is edited** and the pick/escalate reconciliation **reuses the
existing** `suggest-follow-up` node in the reformulator fork (see §6). The chat-webpage driver still runs
the live reformulator once per turn (a *driver* cost, not a scope escalation; parser output asserted
structurally).

Source of truth: live n8n via MCP. Build/test target = the fail-closed clone **`txiPzSxy3Pclsz6v`**
(`sorento-consume-main TEST`, versionId `45699b20-…`). Reformulator fork the clone calls =
**`wI5RkNGW3EOJfBdo`** (`sub-semantic-parser FORK domain-continuity-carry`). Get-results sub =
**`rysSPgUssLDf6xJc`** (`sub-get-results TEST`). NEVER edit live spine `9qVyfUxmRQqrpGRMDLRuz` or live sub
`XTODTw`.

> **Doc-drift flags (verified this session, correct the stale notes):**
> 1. CLAUDE.md says the clone calls the **live** reformulator `XTODTw`. **False on this clone** —
>    `Call 'sub-query-reformulator'` (`7b5def37`) targets the FORK **`wI5RkNGW3EOJfBdo`**. The task brief
>    is correct; CLAUDE.md is stale. A reformulator edit (if ever needed) goes on `wI5RkNGW3EOJfBdo`.
> 2. plan.md §21 references live-spine node IDs (`5928ae64`, `0804657c`) and a "fresh clone NEWID". THIS
>    change targets the **current** clone `txiPzSxy3Pclsz6v`; its node IDs differ (below). No fresh fork.

---

## 0. The gap (grounded)

Today: `check eta cb88ss` → resolver returns exact `CB88SS` **plus** prefix siblings (CB88SS-DIY /
-BL-DIY / -GM-DIY / -H); the gate's exact-match-wins collapses to `compatible_entities:[CB88SS]`;
get-results (`crm_incoming_stock_list`) returns `has_result:false`; flow lands on the not-found path and
`build-suggest-offer` emits `suggest_offer:false` → a bare **"…escalate to purchasing team?"**. The
sibling family (which may have incoming) is never surfaced. Evidence: clone exec **8691536**.

**Want:** when an incoming ETA query resolves ≥1 product **exactly** but that product has **no incoming**,
look forward at the product's full SIBLING family (uncapped), batch-check each for incoming, and offer a
**combined** message: a numbered sibling picker (each annotated has/no-incoming, has-incoming-first) AND
the escalate offer. Reply = a number (pick a sibling → re-query its incoming next turn) OR "yes"
(escalate to purchasing). Incoming domain ONLY. Zero siblings → keep the plain escalate.

---

## 1. Grounded routing (why the hook is `build-suggest-offer`)

Traced on `txiPzSxy3Pclsz6v` (node IDs are this clone's):

```
resolve-entity → disallowed-entity-gate (b07ca5db)         [exact-match-wins → compatible=[CB88SS], require_specific=false, gate_passed=true]
  → If3 (b492d421)      [TRUE = gate_passed===false OR (unresolved>0 && compatible==0)]
       TRUE  → If-incoming-picker (4e18b4e7)  [require_specific===true && domain==incoming]  ← the AMBIGUOUS picker (NOT us)
                 TRUE  → probe-incoming (1fe8680b) → annotate-incoming-picker (94f20f3e) → build-suggest-offer
                 FALSE → not-found-error-message (5fabfbe3) → build-suggest-offer
       FALSE → Execute 'sub-get-rag' → Call 'sub-get-results' (326e28f1) → validator (55072517) → If6 (e2a60cb8)
                 If6 [has_result===true && is_valid===true]
                   TRUE  → central-exchange (935931e7) → compile-current-state (7a130a0c)      [HAPPY, has data]
                   FALSE → Loop Over Items → Aggregate1 (a4448717) → not-found-error-message → build-suggest-offer  ← ★ OUR CASE
build-suggest-offer (7972abd8) → tag-not-found (2f33c7f4) → escalate-catalog → cs-offer-gate → compile-current-state
```

The **exact-resolved-but-empty incoming miss** (cb88ss) is `If3 FALSE → get-results has_result:false →
If6 FALSE → Loop → Aggregate1 → not-found-error-message → build-suggest-offer`. That is the SAME
`build-suggest-offer` (7972abd8) node the ambiguous incoming picker converges on. **`build-suggest-offer`
is the single hook.** It already owns D1 (resolver did-you-mean) and D2 (get-results alternatives) and
emits the `suggest_offer` envelope that `compile-current-state` renders via its `_sug` path. We add a **D3
sibling-family arm**.

**Distinguishing our case from the others at `build-suggest-offer`:** incoming domain +
`disallowed-entity-gate.require_specific === false` + `compatible_entities` contains ≥1 `entity_type:'product'`
with a real (non-uuid) code + get-results returned empty. D1 will not fire (the token resolved, so no
miss-resolution); D2 will not fire (the incoming MCP returns `alternatives:[]`). So D3 is additive: on the
exact-empty-incoming signature it builds the picker; otherwise the node is byte-identical to today.

---

## 2. THE CRUX — the uncapped sibling-family lookup (decision + evidence)

Investigated the CRM backend/MCP (`/Users/tehjayson/Documents/foundryx/sorento_crm`, read-only ref).

**Finding: no uncapped prefix-family lookup is reachable by the chatbot as wired today.**
- `resolve-entity` (`POST /api/v1/system/references/resolve`, service `entity_resolver.py`) caps product
  prefix/sibling matches at **`PREFIX_LIMIT = 20`** (`entity_resolver.py:1372`; prefix probe
  `_prefix_probe_product` `:1375` = `product_code ILIKE 'token%'` then `'%token%'`, each `.limit(20)`).
  The endpoint's `limit` (≤200) can only truncate *below* 20 for product prefix — never raise it. The
  resolver DOES already surface siblings on an exact hit (`:3361-3376`) but capped at 20.
- **No MCP tool** exists for product prefix/family/list-all-by-code (`sorento_crm_mcp/.../catalog.py`,
  34 ToolSpecs; `crm_master_products_list` exposes only `page,limit,product_ids,status`).
- `crm_incoming_stock_list` takes a `product_ids` **array** but resolves each id by **EXACT**
  `product_code` match (`identifier_resolver.py:79`) — no prefix expansion. So a family must be enumerated
  first, then all SKUs passed in.
- A real, uncapped family model exists **server-side but is not MCP-exposed**: the `products.variant_of_id`
  self-FK graph (`variant_link_service.py`; `child_ids_of` uncapped) and the list endpoint
  `GET /api/v1/master-data/products` with `query` (substring `ILIKE '%q%'` on product_code, paginated
  `limit` **max 5000**) + `variant_filter=base|variant|all` (`product_service.py:209-273`).

The user **locked "UNCAPPED; do NOT use the capped `resolutions[].matches`"** → the resolver (cap 20) is
disallowed as the source. So:

### DECISION — new direct CRM **read** to the products list endpoint, filtered strict-prefix in n8n
A new `family-fetch` httpRequest node:
`GET https://fe-sorento.foundryx.my/api/v1/master-data/products?query=<baseCode>&variant_filter=all&limit=5000`
(header `x-api-key` = the same key the other spine http nodes use; **prod READ — allowed by safety; no
write, zero egress**). The response is the full product list whose `product_code` **contains** `baseCode`,
uncapped (paginate if `pagination.total` > 5000 — realistically never for one family). Then a Code node
`sibling-transform` filters to the **strict family**:
- keep rows where `norm(product_code) === norm(baseCode)` **or** `norm(product_code).startsWith(norm(baseCode))`
  **with a boundary rule**: the char right after `baseCode` is a non-alphanumeric delimiter (`-`, `/`,
  space) or end-of-string. (Matches the user's family shape CB88SS, CB88SS-DIY, CB88SS-H; excludes an
  unrelated `CB88SS1`/`XCB88SS`.) Coder may tune the boundary set; default = `[-/ ]` or EOS.
- emit `[{ uuid, entity_type:'product', code:product_code }]` (the gate/probe entity shape).

`baseCode` = each exactly-resolved product's `canonical_code` from `disallowed-entity-gate.compatible_entities`
(`entity_type==='product'`). **Multi-product** (requirement #2, e.g. `eta cb88ss srt123` both exact,
both empty): iterate every such product code, fetch each family, **union by uuid**. One `family-fetch` per
base code via a small `Loop Over` (or a single Code node that fans out httpRequest is not possible — use a
splitInBatches loop `family-loop`), then aggregate. (Common case = 1 product → 1 fetch.)

> **Why not the variant graph directly:** it is the server-authoritative family (boundary-correct,
> uncapped) but is exposed on **product DETAIL** (`GET /master-data/products/{id}` → `_populate_variant_graph`,
> `product_service.py:607`), not on a family-list endpoint, and its response shape (does it return the
> full *sibling* set when the queried id is itself a variant?) is unconfirmed. The list-query + strict-prefix
> filter is robust from **any** starting code, uncapped, and reuses an existing endpoint. **Coder verify
> task V-Q1:** confirm the products-list response carries `id`(uuid)+`product_code`; if the variant-graph
> detail endpoint is confirmed to return the full family, it is the preferred (more precise) source and may
> replace the substring+filter — but ship list-query first.

> **Open limitation (flag, low-risk):** if the user typed a **deep variant** exact (e.g. `cb88ss-diy`),
> `baseCode` = `CB88SS-DIY` and the query returns only that sub-tree, missing `CB88SS`/siblings. Mitigation
> (optional, coder): derive a family **root** by stripping the trailing `-<suffix>` segment(s) before
> querying. Default ship: query the exact code as-is (nails the flagship `cb88ss` = a base). Degradation is
> safe (fewer siblings, worst case falls back to plain escalate — never wrong data, never egress).

### The batched incoming annotation — REUSE `probe-incoming` machinery (memory `incoming-picker-availability-shipped`)
A new `sibling-probe` executeWorkflow node (clone of `probe-incoming`, → get-results sub `rysSPgUssLDf6xJc`):
`tool='crm_incoming_stock_list'` (literal), `entities = <sibling family from sibling-transform>`,
`semantic_input` mirroring `probe-incoming`. `entity-ids-transformer` in the sub pools all sibling uuids
into `product_ids` → **one batched read** → returns items only for siblings that **HAVE** incoming
(`title`/`Product Code` field = code). This is exactly how `annotate-incoming-picker` derives its
`hasIncoming` Set; D3 reuses that logic. All shared-sub calls pass **`is_test:true`** (fail-closed).

---

## 3. Topology change (spine side, on the clone)

Insert a gated branch **between `not-found-error-message` and `build-suggest-offer`** (mirrors the existing
`If-incoming-picker → probe-incoming → annotate-incoming-picker → build-suggest-offer` trio):

```
not-found-error-message (5fabfbe3)
  → sibling-gate  [IF, NEW]   domain_hint==='incoming'
                              AND disallowed-entity-gate.require_specific === false
                              AND (disallowed-entity-gate.compatible_entities ∋ entity_type==='product' with non-uuid code)
       TRUE  → family-loop (splitInBatches over product base codes)  [NEW]
                 → family-fetch (httpRequest, products list, READ)     [NEW]
                 → sibling-transform (Code: strict-prefix filter → sibling entities, union) [NEW]
               (loop done) → sibling-probe (executeWorkflow → rysSPgUssLDf6xJc, crm_incoming_stock_list) [NEW]
                 → build-suggest-offer (7972abd8, +D3 arm)
       FALSE → build-suggest-offer (7972abd8)   [unchanged D1/D2/escalate]
```

- `build-suggest-offer` D3 arm is guarded `$('sibling-probe').isExecuted && $('sibling-transform').isExecuted`.
  When not executed → existing behaviour verbatim (deterministic no-op; matches how D1/D2 guard on
  `isExecuted`). No connection into `tag-not-found`/`escalate-catalog` changes (build-suggest-offer stays
  the single downstream); `escalate-catalog`'s `not_found` fallback already reads
  `not-found-error-message` (executed on both branches here), so no `escalate-catalog` edit needed.
- **Minimal single-fetch variant (coder's call):** if the multi-product loop adds too much surface, ship
  the common path first — a single `family-fetch` for `compatible_entities[0]`'s product code (covers the
  flagship + single-product cases), and add the loop for multi-product in a follow-up. UAC §Q4
  (multi-family) is then a KNOWN-DEFERRED until the loop lands. Prefer the loop if feasible.

---

## 4. `build-suggest-offer` D3 arm (spec)

Add, **before** the D1 block returns (or as a first-checked arm), gated by the sibling-probe having run:

```js
// ── D3: incoming sibling-family picker (empty-exact incoming miss) ──
(function tryD3(){
  const probe = (()=>{ try { return $('sibling-probe').isExecuted ? $('sibling-probe').first().json : null; } catch(e){ return null; } })();
  const fam   = (()=>{ try { return $('sibling-transform').isExecuted ? ($('sibling-transform').all().map(i=>i.json)) : null; } catch(e){ return null; } })();
  if (!probe || !Array.isArray(fam) || q?.domain_hint !== 'incoming') return false;

  // family = [{uuid, code, entity_type:'product'}] (union across products, exact ones INCLUDED)
  const norm = s => String(s ?? '').trim().toLowerCase();
  const answers = Array.isArray(probe.answers) ? probe.answers : (Array.isArray(probe.items) ? probe.items : []);
  const hasInc = new Set();
  for (const a of answers) {
    let c = a && a.title;
    if (!c && a && Array.isArray(a.fields)) { const f = a.fields.find(x=>/product\s*code/i.test(x&&x.label)); c = f && f.value; }
    if (c) hasInc.add(norm(c));
  }
  // dedupe by code; drop empties
  const seen = new Set();
  let sibs = fam.filter(e => e && e.code && !seen.has(norm(e.code)) && seen.add(norm(e.code)))
                .map(e => ({ code: e.code, uuid: e.uuid || null, has: hasInc.has(norm(e.code)) }));
  // zero-siblings guard: only the exact code itself (nothing to offer) → keep plain escalate
  const exactCodes = new Set((Array.isArray(gate?.compatible_entities)?gate.compatible_entities:[])
                      .filter(e=>String(e.entity_type).toLowerCase()==='product').map(e=>norm(e.code||e.canonical_code)));
  const extras = sibs.filter(s => !exactCodes.has(norm(s.code)));
  if (extras.length === 0) return false;                    // → suggest_offer stays false → plain escalate

  // SORT: has-incoming first, then code order. No cap.
  sibs.sort((a,b) => (b.has - a.has) || String(a.code).localeCompare(String(b.code)));

  const numbered = sibs.map((s,i)=>`${i+1}. ${s.code} — ${s.has ? 'has incoming' : 'no incoming'}`).join('\n');
  out.suggest_offer = true;
  out.suggest_selection_context = 'suggest_offer';
  out.suggest_response =
    `No incoming stock (ETA) found for ${[...exactCodes].map(c=>c.toUpperCase()).join(', ')}. Related products:\n` +
    `${numbered}\n` +
    `Reply with a number to check its incoming, or reply 'yes' to escalate to ${team} team.`;
  // Long lists → NO per-sibling buttons (button-fatigue / respond.io cap); numbers typed. Only Yes/No buttons.
  out.suggest_quick_reply = [YES, NO].map(s=>String(s).replace(/,/g,'')).join(',');
  out.suggest_last_result_set = sibs.map((s,i)=>({
    idx:i+1, label:s.code, value:s.code, product:s.code, uuid:s.uuid, entity_type:'product',
  }));
  return true;
})() && (function(){ return; })();   // if D3 built the offer, return out (see integration note)
```

Integration note for the coder: place D3 so that, when it builds the offer, `build-suggest-offer` returns
`out` immediately (like D1/D2 do) — i.e. `if (d3Built) return out;` before the D1/D2 code. `team` /
`YES` / `NO` / `out` / `q` / `gate` are the node's existing locals. The picker text + `[YES,NO]`-only
quick-reply + full `suggest_last_result_set` mean an **uncapped** list renders as text with just 2 buttons.

---

## 5. `compile-current-state` — NO edit needed (reuse `_sug`)

`compile-current-state` (7a130a0c) already renders the `suggest_offer` envelope via its `_sug` arm:
`response = _sug.suggest_response`, `quickReply = _sug.suggest_quick_reply`,
`last_result_set = _sug.suggest_last_result_set`, `selection_context = 'suggest_offer'`, then persists
`variables.last_result_set` + `variables.selection_context` (+ `domain_hint:'incoming'`). This satisfies
requirement #6 (saves to `last_result_set` + session vars + chat history) with **zero new code**. On the
clone, the persistence PUT `save-session-vars` is orphaned/guarded (`guard-d-record` records `would_write`);
chat-history logging via the sendmsg logger. The reply is captured from redis `chat:reply` under the chat
driver.

---

## 6. Reconciliation (the pick / escalate) — REUSE `suggest-follow-up` (NO reformulator edit)

The reformulator fork `wI5RkNGW3EOJfBdo` already has a **`suggest-follow-up`** Code node (runs after
`output_exchange`) that implements exactly the dual-reply reconciliation, gated on
`previous_conversation_state.selection_context === 'suggest_offer'`:
- **number/position or a bare code** (`reference_positions.length>0` or an entity `current_message`) →
  *"keep prior domain when the reply carried no decisive domain term"*: `if (!_o.domain_hint) _o.domain_hint = prevState.domain_hint` (= **incoming**), `message_type='business_query'` → normal pipeline re-queries the picked sibling's incoming. Verbatim from the node.
- **"yes"** (`is_affirmative===true`) → `escalation = { is_escalation_confirmation:true }`, `entities=[]`
  → escalate (to `suggested_team` = purchasing for incoming).
- **"no"** (`is_affirmative===false`) → decline + casual ack + stop.

Because D3 emits the **same** `suggest_offer` envelope shape (selection_context `suggest_offer`,
`last_result_set` with `idx/label/value/product/uuid`, quick_reply `[YES,NO]`) that D1/D2 emit, the
continuation is the **already-shipped, proven** suggest_offer round-trip. **No `output_exchange` /
reformulator prompt change is required.** This is why the change stays `scope: deterministic`.

**Verification (V-Q2, continuation turn):** a "2" reply after the picker must, via `output_exchange`
(reference_positions → position 2 → its `product` code as a current_message entity) + `suggest-follow-up`
(domain inherited = incoming), re-resolve that sibling exact and re-query `crm_incoming_stock_list`. Assert
structurally that the continuation turn carries `domain_hint:'incoming'`, `suggest_pick_context:true`, and
resolves position 2's code. If the live fork ever fails to inherit domain (it does today), THAT would be
the only trigger to touch `wI5RkNGW3EOJfBdo` — out of scope unless V-Q2 fails.

---

## 7. Safety (§0) — this is read-forward + a picker message

- **New CRM call `family-fetch`** = `GET /master-data/products` — a **READ**. Allowed. No write, no send.
- **`sibling-probe`** = `crm_incoming_stock_list` via get-results sub — a **READ** (S4: tool in the READ
  allowlist, never `crm_it_support_ticket_create`). `is_test:true` passed (fail-closed).
- No new send/assign/SLA/PIC/CRM-write. The picker message is delivered exactly like every other reply
  (chat driver → redis `chat:reply`; live sends orphaned/guarded on the clone). §0 S1–S6 bind every case.
- Escalation only occurs on a **user "yes"** next turn, via the existing guarded human-intervention fork
  `vUfFUDjLAuMaeQE6` (records `would_write`, never a real assign).

---

## 8. Nodes to touch (promotable business diff)

| # | node | change | id (clone) |
|---|------|--------|-----------|
| 1 | `sibling-gate` | **NEW** IF: incoming + require_specific false + product in compatible_entities | new |
| 2 | `family-loop` | **NEW** splitInBatches over product base codes (multi-product union; optional in phase-1) | new |
| 3 | `family-fetch` | **NEW** httpRequest `GET /master-data/products?query=<base>&variant_filter=all&limit=5000` (READ) | new |
| 4 | `sibling-transform` | **NEW** Code: strict-prefix/boundary filter → `[{uuid,entity_type:'product',code}]`, union | new |
| 5 | `sibling-probe` | **NEW** executeWorkflow → get-results sub, `crm_incoming_stock_list`, entities=family, `is_test:true` | new |
| 6 | `build-suggest-offer` | **EDIT** add D3 arm (§4) | `7972abd8` |
| — | connections | not-found-error-message → sibling-gate; sibling-gate[T]→family path→build-suggest-offer; sibling-gate[F]→build-suggest-offer | — |

`compile-current-state`, `escalate-catalog`, `disallowed-entity-gate`, the reformulator fork = **untouched**.
Everything else (guards, driver, sub `is_test` literals) is the standard clone scaffolding.

---

## 9. Verification tasks (planner-defined)

- **V-Q1 (family-fetch shape):** confirm `GET /master-data/products?query=CB88SS&variant_filter=all&limit=5000`
  (x-api-key) returns items with `id`(uuid)+`product_code`, and that the strict-prefix filter yields
  {CB88SS, CB88SS-DIY, CB88SS-BL-DIY, CB88SS-GM-DIY, CB88SS-H}. Cheap direct read; no LLM.
- **V-Q2 (continuation re-query):** after the picker, a "2" reply inherits `domain_hint:incoming` via
  `suggest-follow-up` and re-queries incoming for position 2's sibling. Structural assertion (§6).
- **V-Q3 (batched probe = 1 read):** `sibling-probe` issues exactly one `crm_incoming_stock_list` with all
  sibling uuids pooled into `product_ids` (reuse of the shipped batched prefetch); annotation matches
  `answers[].title`.
- **V-Q4 (zero-siblings fallback):** an exact incoming code with **no** family (only itself, no incoming)
  → D3 returns false → plain escalate unchanged (byte-identical to today).
- **V-Q5 (§0):** zero egress on every case — `family-fetch`/`sibling-probe` are reads; no send/assign/write.

---

## 10. Acceptance criteria

1. **Single-exact-no-incoming (cb88ss):** `disallowed-entity-gate.require_specific===false`,
   `compatible_entities=[CB88SS]`, get-results empty → sibling-gate TRUE → family-fetch (uncapped) →
   sibling-probe → `build-suggest-offer.suggest_offer===true`. Reply text lists **all** siblings
   (≥5: CB88SS + the 4 variants), each annotated `— has incoming` / `— no incoming` (including the exact
   `CB88SS — no incoming`), **sorted has-incoming-first then code order, no cap**, plus the escalate line
   "reply 'yes' to escalate to purchasing team". `suggest_last_result_set` = all siblings;
   `selection_context='suggest_offer'`; quick_reply = `[Yes, escalate, No, it's okay]` only.
2. **Multi-exact-both-no-incoming (`eta cb88ss srt123`):** BOTH families gathered (union, deduped);
   one combined picker; `not` capped. (Phase-1 single-fetch note in §3 applies if the loop is deferred.)
3. **A sibling that HAS incoming:** annotation correct; that sibling sorts to the top.
4. **Reply "2" → re-query:** continuation carries `domain_hint:incoming` + `suggest_pick_context`,
   resolves position 2's sibling code, re-queries `crm_incoming_stock_list` for it (V-Q2).
5. **Reply "yes" → escalate purchasing:** `is_escalation_confirmation:true` → guarded human-intervention
   (no real assign; `would_write` recorded).
6. **Zero-siblings:** plain escalate unchanged (V-Q4).
7. **Non-incoming / require_specific / D1 / D2 unregressed:** sibling-gate FALSE → `build-suggest-offer`
   byte-identical; the ambiguous incoming picker (`If-incoming-picker`) path unchanged.
8. **§0 S1–S6** hold on every case; the family-fetch + probe are reads; no send/assign/SLA/PIC/CRM-write.
9. Business diff the reviewer promotes = the 5 new nodes + the `build-suggest-offer` D3 edit; no
   parser/reformulator/compile-current-state edit.
