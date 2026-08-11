# Container status — n8n side

Implements `sorento_crm/documentation/plans/purchasing/n8n-container-status-integration-spec.md`
(CRM side merged, PR #105 + #108). **Read that spec first** — this plan records only what n8n does,
the corrections to the spec, and the measured baselines.

Status: ✅ **PROMOTED LIVE 2026-08-09 13:01–13:02Z**, reviewer-approved (APPROVE after two rounds).

| workflow | id | before → after |
|---|---|---|
| spine | `9qVyfUxmRQqrpGRMDLRuz` | `d7a819fc` → **`d1b3f29e`** (6 code nodes) |
| parser | `XTODTw-dJcV0uRdC056hG` | `659b7576` → **`eec40a48`** (`AI Agent.systemMessage` leaf ONLY) |
| get-results | `Fss5aAaXthJSWpZCgKiKR` | `61b65e5f` → **`a25dfdfb`** (2 nodes, harness tail STRIPPED) |
| get-results TEST (live path) | `rysSPgUssLDf6xJc` | `da0644da` → **`bb8f909e`** (2 nodes, harness tail KEPT) |

**Rollback = republish the "before" ids above.** Backups: `backups/PROMOTE-*.json`.

Every node byte-gated against `tests/diffs/container-status-node-diff.md` source shas; per target
`draft==active`, node count, credential count and connections all unchanged. `Switch` and
`get-presigned-url` verifiably untouched on the spine; parser `output_exchange` byte-identical to
pre-promote (the fork's copy is BEHIND live and was never copied).

⚠️ **Post-promote verification still OUTSTANDING** — the promote completed at 13:02Z and the most
recent live execution was 12:47Z, so **no live traffic has exercised the new code yet**. Verify on the
changed paths: one incoming-attribute turn, one `__all__` timeline turn, one `container status list`
document turn, one product_attachment did-you-mean turn, and a stock→incoming crossdomain pivot.
That last one is the only path with NO live evidence at all (offline-only) — but note it DOES occur in
real traffic: exec `11793468` (08:10:45Z, pre-promote) ran `crossdomain-render`, so it will be
exercised naturally rather than needing to be manufactured.

> ⚠️ **"Nothing promoted" was written before this plan's own session published four workflows.**
> That session (`335b90f0`, 2026-08-08 05:50–06:39) died mid-sentence on the user's quota and never
> recorded what it shipped. Rebaselined against live 2026-08-09 — **§0b below is the true state.**

## 0b. Actual build state (rebaselined 2026-08-09, all exports refreshed + `--verify` green)

Every target checked for `versionId == activeVersionId` (`agent-death-leaves-active-mutated`): **all
clean, no orphaned draft, no mutated ACTIVE.** The 08-08 06:2x–06:3x bumps are this plan's own session,
not an unexplained edit.

| step | target | state |
|---|---|---|
| S1a | parser fork `wI5RkNGW3EOJfBdo` @ `228f39a9` (06:33) | ✅ **BUILT** — prompt only |
| S2a | same | ✅ **BUILT** — emits all 20 CRM field keys verbatim |
| S1b | clone `txiPzSxy3Pclsz6v` @ `d40fb616` (06:28) | ✅ **BUILT** — document-class precision in `disallowed-entity-gate` |
| S1c | **new fork `t4QvrtrPnTwRU6br` (`sub-get-results CS-BUILD`)** @ `3fddef92` (06:36) | ✅ **BUILT** |
| S2b | same | ✅ **BUILT** — projection + denied-vs-not-reached |
| S0 | live spine | ❌ not started |

`CS-BUILD` also resolves §3: the clone's `Call 'sub-get-results'` now points at `t4QvrtrPnTwRU6br`, so
`rysSPgUssLDf6xJc` is no longer being edited under live. **Promotion still targets BOTH**
`Fss5aAaXthJSWpZCgKiKR` and `rysSPgUssLDf6xJc`.

### What the fork prompt actually shipped (S1a + S2a)

- `resource_attachment` decisive for "container status list / report / sheet / shipping schedule",
  incl. `senarai status kontena`, plus the explicit carve-out *"The word 'container' alone does NOT make
  it incoming: incoming answers a question ABOUT one shipment, this domain hands over the FILE."*
- `incoming` decisive for the clearance checkpoints — CIDB inspection/approval, gatepass, warehouse
  arrival, collection, loading, ETC, ETD, liner, forwarders, consignee, delivery warehouse, free days,
  location, stacked, COA permit.
- ⚠ explicit *"'cleared CIDB' on a SHIPMENT is incoming; a CIDB certificate DOCUMENT for a product is
  product_attachment"* — this is B2's fix.
- `requested_attributes` enumerates all 20 keys with trigger phrases, and instructs **emit EVERY key
  asked about**: "has it cleared CIDB" → `inspection_date` AND `approval_date`.

### 🔴 Open gaps after rebaseline

1. **R1 row 3 is NOT handled.** "container status for ABCD1234" hits the `container status` decisive
   term and routes to `resource_attachment`; the user ruled it `incoming`. The prompt has no
   entity-presence carve-out. **Fix as a code guard in `output_exchange`, not prompt text** — nothing in
   `output_exchange` enforces any of S1a/S2a today, it is prompt-only.
2. **The projection matches on DISPLAY LABEL**, carrying a hand-copied 20-row key→label table whose own
   comment admits the hazard: *"If that tuple changes this map is stale."* That is R2's drift, built in.
   → **Delete it once CRM PR #109 lands** (see §2c) and match on `f.key`.
3. **S0 not built.**

## 2c. CRM side — PR #109, built independently, NOT merged

The CRM `container-status` worktree session shipped `d2ccc0fed` *"feat(mcp): emit the CRM field key on
every render field"* on `docs/n8n-container-status-spec` — exactly R2's ask, reached from the same
label-drift argument. `_Builder.item` now takes pairs **or** triples:

```python
key, lbl, val = pair if len(pair) == 3 else (None, *pair)
```

Contract details that bind our code:

- **`key` is OMITTED, never null**, when a presenter has no source key → test `"key" in f`, never
  `f.key !== null`.
- Converted call sites so far: **`_incoming_list` and `_incoming_by_product` only.** Orders,
  certificates, attachments and stock still emit unkeyed fields.
- Identity fields are keyed too (`product_code`, `shipment_number`, `shipping_container_number`,
  `remaining_incoming_quantity`, …), not just the gated ones.
- Label strings byte-identical → R3's render-parity holds by construction on their side.
- **FastMCP registers tools at startup: the MCP process must be restarted before it serves keys.**
  Against a stale process the projection intersects to empty and reads as a parser bug.

⚠️ **PR #109 is unmerged — CI running, user has not signed off. Do not build against it as landed.**

Requested as a follow-up: key `_stock` (`quantity_on_hand`) so **both** `crossdomain-render` sort
branches can key instead of one being patched — see the S0 detail below.

---

## 0. Corrections to the spec (verified against `origin/main` + live n8n, 2026-08-08)

| spec says | actually |
|---|---|
| **N3** — add the new agent to the `escalated_agent` enum | **Obsolete. Do not build.** Migration `313_agent_field_access` *drops* `container_status_enquiries`; D38-revised superseded it. No new agent exists. Also, that enum lives in `sub-get-results`' `AI Agent` node, which has **0 inbound edges** — dead code. Live path is `entity-ids-transformer → MCP Client1 → output-structurer`. |
| §2.2 label vocabulary | Correct, but **only for `crm_incoming_stock_list`**. `crm_incoming_stock_by_product` and `crm_incoming_stock_shipments` carry **no** clearance fields and still label ETA `Estimated Arrival Date`. Incoming resolves to one tool (`crm_incoming_stock_list`), so N1 lands right — but the probe paths are a separate question. |
| §5 case 4 — "every case still returns … `ETA`" | False. `227c13d0f` moved ETA **out** of the identity block into `_CLEARANCE_PAIRS` (gated, `DEFAULT_ALLOWED`). An admin can revoke it, which makes case 4 fail by design. |
| §2.2 "Always present (identity — never gated)" | Misleading. Empty pairs are dropped before the item is built (§2.1 says so). Measured: a real ETA turn returned **4 fields**, not 8 — `Shipment`, `Batch`, `Warehouse Allocations`, `Unallocated Quantity` were all absent because empty. |
| §4 C1 — `attachment_type` resolution is exact-match only, **blocker for N2** | **Not a blocker.** PR #108 added `attachment_type_code`, which "takes the document class **by name** … case-insensitive" (`catalog.py:319`). n8n passes the string; no resolver, no type UUID, no keywords column needed. |
| §4 C2 — `attribute` not a resolvable reference type | Still true, still fine. Hardcoded vocabulary in the parser prompt is the interim, as the spec says. |

### Regression the CRM PR caused, not in the spec

`227c13d0f` renamed `Estimated Arrival Date` → `ETA` in `crm_incoming_stock_list`. One n8n reader keys
the old string:

- `live-spine/nodes/crossdomain-render.js:69` — `fieldVal(it, 'estimated arrival date')` is now always
  `''`, so the incoming-row ETA sort never fires and cross-domain rows render in CRM jitter order.
  Silent. **Live today.** → **S0**.

---

## 1. Measured baselines (clone `txiPzSxy3Pclsz6v`, `uac` mode, clean injected session)

Driven per `clone-canary-item-envelope`, with `previous_conversation_state: {}` so the run does **not**
inherit 437264483's stale prod session (`uac-mode-reads-prod-session`).

| # | message | today's result | verdict |
|---|---|---|---|
| B1 | "please send me the container status list" | `domain_hint: incoming`, `intent_hint: check_incoming`, `entities: []` → *"Could not find incoming for the requested item. Would you like me to escalate to purchasing team?"* | **N2 broken.** "container" drags it into `incoming`. Cause is the parser's DECISIVE DOMAIN TERMS — **not** the blocklist. |
| B2 | "has SRTSH1040 cleared CIDB and when can I collect it" | `domain_hint: product_attachment`, entity `{raw:"certificate", hint:"attachment_type", canonical_code:"Certification"}` → did-you-mean over product certificates | **N1 has a routing prerequisite.** CIDB clearance is an *incoming shipment* checkpoint; the parser reads it as a product certificate. |
| B3 | "when is SRTSH1040 arriving" | `Product Code` / `Container` / `Incoming Quantity` / `ETA: 2026-08-13` + PENDING ALLOCATION | Happy path works. **Only 4 fields** — the 20 clearance fields are empty, no `field_access` block returned. |

**B3 matters for scoping: the 20-field dump N1 prevents is not visible yet.** It appears the moment the
container-status workbook is imported. N1 is preventative, not corrective — which is why it must land
before the import, not after.

---

## 2. Why `attachment_type` stays blocked in `resource_attachment` (G5, investigated)

The parser's `attachment_type` hint does **not** mean "document class". Prompt defines it as the
*product* document kind, closed 5-value enum:

```
attachment_type → photo | image | technical drawing | 3D model | certificate
```

That belongs to `product_attachment`. `DOMAIN_BLOCKED_HINTS.resource_attachment` blocks it on purpose:
unblocking would let a carried `cert`/`photo` from a prior product turn narrow a catalogue request to
the wrong class. **The blocklist is correct. Leave it.**

The company document library already has its own hint:

```
attachment → a named document resource (catalogue, warranty, price tag template)
```

So Container Status is an `attachment`, carrying a `canonical_code` document class, delivered to the CRM
as `attachment_type_code` — the name param, not a UUID. No blocklist edit, no resolver work, no C1.

Residual risk for UAC: `attachment` **is** in `DOMAIN_BROADEN_BLOCKED_HINTS.resource_attachment`. If the
parser reads "container status **list**" as `scope_intent: broaden`, the entity is stripped → unfiltered
call → the empty-page-without-backend-call failure the spec warns about in §N2.1. The prompt says broaden
requires "no narrowing value", so it should read `specific` — **assert it, don't assume it**.

---

## 0c. END-TO-END VERIFIED against production, 2026-08-09

CRM PR #109 is deployed — **keys are live in production**. Driven through the clone against the real
CRM (reads only, `mode:uac`, `previous_conversation_state:{}`). Runs in
`tests/runs/container-status-e2e/`, driver in `tests/offline/container-status/e2e-driver.py`.

| # | typed | routed | result |
|---|---|---|---|
| 01 | when is SRTSH1040 arriving | `incoming` | ✅ identity + ETA, `keys_served:true` |
| 02 | has SRTSH1040 cleared CIDB **and when can I collect it** | `incoming` | ✅ 4 attrs (inspection/approval/gatepass/collection) |
| 03 | who is the forwarder for SRTSH1040 | `incoming` | ✅ both forwarders |
| 04→11 | please send me the container status **list** | `resource_attachment` | ✅ **after two fixes** — returns the xlsx, clean |
| 05 | SRTWC193 got stock? | `inventory` | ✅ regression, no keys, no notes |
| 06 | please send me the catalogue | `resource_attachment` | ✅ PDF |
| 07 | container status for TCNU1851000 | `resource_attachment` | ✅ xlsx (R1-withdrawn behaviour, as ruled) |
| 12 | srtwc8317-rl1 cert | `product_attachment` | ✅ dym intact, `- has certificate` annotations intact |
| 13 | SRTWC19301 got stock? | `inventory` | ✅ dym intact, `- has/no stock details` intact |
| 14 | (contact 457216562, no access) | — | dead-ends at `check-access`, 21 nodes, get-results never runs |

Proven: parser `requested_attributes` → CRM keys → key-based projection → clean render, on real data.
`keys_served: true`, and **zero CRM field keys reach the customer**.

### 🔴 Two bugs found by the E2E run, both fixed

**F-PARAM — wrong parameter name, silent.** `entity-ids-transformer` sent `attachment_type_ids`
(plural array). `crm_resource_attachments_list` exposes **`attachment_type_id`** — singular, scalar.
An unknown key is DROPPED, taking the only narrowing filter with it, so
`TOOL_REQUIRED_NARROWING_FILTERS` short-circuits to an empty page **without calling the backend** —
rendering as "no such document" for a document that exists.

> **Discriminator (worth keeping, but it does NOT cover every empty):** a real backend call carries
> `fallback_used` in the raw MCP response; the narrowing short-circuit does not. Measured: 208 bytes
> vs 882.
>
> ⚠️ **It only detects a MISSING filter, not a filter that matched nothing.** An
> `attachment_type_code` naming a type that does not exist does NOT drop the filter — `resources_service`
> deliberately substitutes an impossible-id predicate (`Attachment.id = 00000000-…-0000`) so a bad hint
> can never leak the wrong files. That call REACHES the backend, so `fallback_used` is PRESENT and the
> result is still zero rows. Same customer-visible nothing, opposite verdict from the discriminator.
> Use it to answer "did we call the backend", never "is this empty legitimate".

Fixed with a `SCALAR_PARAMS` set rather than a special case — the array-vs-string *shape* fails the
same silent way as a wrong *name*. Multi-value truncation is recorded in `_diagnostics.scalar_truncated`
rather than dropped silently.

**F-DYM4 — the gate's decision was invisible to every renderer.** After F-PARAM the reply contained the
correct file AND, beneath it, *"Couldn't find these: 'container status list' — did you mean Packing List,
Stock_List, container_status"*. Right answer, message reads as broken.

Cause: the gate narrows `compatible_entities`, but every did-you-mean builder binds
`$('resolve-entity')` — the RAW resolver — so the narrowing was invisible. **There were FOUR builders**
(`dym-transform`, `dym-transform-partial`, `build-suggest-offer`, `compile-current-state`), and the one
the customer actually saw was the fourth. Patching the first three changed nothing.

⇒ recurring class confirmed again: **enumerate renderers by RENDERED STRING, not by graph inbound**
(`dym-blind-suggestion-measured`). `grep -rln "Couldn't find these"` found it in one command; graph
reasoning did not.

Fix: the gate stamps `resolved_by: 'document-class-narrowing'` on the resolution it settled; each
builder drops only tokens carrying that exact stamp. Regression-checked on cases 12 and 13 — genuine
misses still offer candidates with their probe annotations.

### ⚠️ The one branch NOT proven

**`field_access.denied` is proven against synthetic envelopes only.** It needs a caller holding the
incoming agent but lacking a clearance-field grant. `CONTACT_FULL_ACCESS` holds everything;
`CONTACT_NO_ACCESS` dead-ends at `check-access` before get-results runs (case 14 — different mechanism,
NOT coverage). The CRM-side method (call with no `contact_id` → staff RBAC path denies all 20) needs a
CRM credential, which lives inside n8n and is not available to this session. Creating a partly-granted
contact would be a prod CRM write — forbidden.

Do **not** let "we tried a no-access contact" read as coverage of field-level denial.

### CRM-side outcome of this run

The type-filter investigation surfaced a defect in the CRM **tool description** — it had advised
"pass `contact_id` and NOTHING ELSE… read the returned file names and pick", which would answer a
named-document request with a 10-file directory listing. Corrected by the CRM owner to route on what
the person named: class → `attachment_type_code` (the NAME) / no class → `contact_id` fallback /
specific file → `attachment_ids`. Worth noting the class of defect: **a wrong tool description fails as
a judgement call**, so it presents as the model being unhelpful rather than as a contract bug.

**Follow-up (not in this bundle) — and it is a ONE-code change, not five.** Moving from
`attachment_type_id` (uuid) to `attachment_type_code` (name) is *not* a like-for-like swap. The real
attachment-type list was probed 2026-08-09 (against a production COPY — **re-diff against prod before
acting**):

```
'container status'    -> MATCH  (Container Status / container_status, 1 file)
'catalogue'           -> NO MATCH
'warranty'            -> NO MATCH
'price tag template'  -> NO MATCH
'brand guarantee'     -> NO MATCH
```

Only `container_status` is a real document class. The other four are **not types at all** — they live
inside the `Direct Access` type (`is_direct_access: true`, the 9-file baseline every contact sees),
which is exactly why "please send me the catalogue" works today via the **file-uuid** path (E2E case 06).

⇒ **Those four must STAY file-level resolutions.** Converting them to type codes would send them into
the no-match branch, which returns zero rows via the impossible-id predicate above — a silent nothing
that the `fallback_used` discriminator would wrongly clear as a real call.

The matcher is more permissive than assumed (case-insensitive `code`, then case-insensitive `type_name`,
then a catalog/catalogue spelling-variant pass), so `container status` / `Container Status` /
`CONTAINER_STATUS` all land. It simply cannot match a name that does not exist.

Also note "no match" means *today*: C1's keywords column, if it ever lands, is the mechanism that would
let "container status list" or "shipping schedule" resolve without adding new types.

---

## 0d. FULL TIMELINE + rendering rules (user, 2026-08-09) — BUILT

### R5 — "container status of X" is a QUESTION, "container status list" is a FILE

Supersedes R1's withdrawal, but by parser **vocabulary**, not the rejected code guard. The
discriminator is the **document noun**, not the phrase:

| user says | domain | |
|---|---|---|
| container status **list / report / sheet / file / softcopy** | `resource_attachment` | hands over the xlsx |
| **bare** "container status of SRTWC286" / "for TCNU1851000" | `incoming` + `requested_attributes:["__all__"]` | full timeline |

⚠️ **This is LLM semantic judgement, not string matching.** Nothing in code matches document nouns —
verified by grep across every clone + CS-BUILD code node. The prompt's word list *guides*, it does not
*constrain*: `softcopy` appears nowhere in the prompt and routes correctly (e2e-24). Adding a phrasing
needs no code change; the flip side is there is no exhaustive list to audit, so the guarantee is the
UAC cases, not the vocabulary.

### R6 — timeline suppresses BOTH "not recorded" and "cannot share"

A customer who asked for *everything* named no field. So:
- absent checkpoints are **not** itemised (they would be pure filler), and
- denied checkpoints are **not** announced — advertising a restriction in answer to a question nobody
  asked is worse than silence.

Naming a field explicitly turns both messages back on. Pinned by T2/T3 (suppressed) vs T4 (explicit ask
still gets both). Sentinel is `requested_attributes: ["__all__"]`, reusing all existing plumbing.
⚠️ Without sentinel support the old body rendered it as a field labelled `"  all  "` (T1 on the old body).

### R7 — rendering order

- **Rows**: ascending by ETA; rows with no usable ETA sort LAST, never first.
- **Fields, timeline mode only**: non-date facts keep CRM order at the TOP, then every date ascending.
  A field is a date **by its VALUE** (`/^\d{4}-\d{2}-\d{2}/`), never by key name — key-name matching
  would be another vocabulary to maintain and would wrongly catch `free_days_available: 21` and `loc`.
- Non-timeline answers keep CRM order untouched (W5).

### R8 — absence is per-ROW, denial is per-CONTACT

Measured on SRTWC286-SH-NEW: four containers, one carried an ETA Delay. A single trailing note reads as
if it applies to the whole answer and leaves the other three looking unanswered. So absence annotates
each row; denial — identical for every row — stays one line.

## 0e. LATENCY — paired-item lookups, 36.7s → 4.2s

`$('NodeName').item` forces n8n to walk the item-lineage graph backwards per item; across a 148-node
execution that dominated the run. `$json` already carried every field being reached for (verified on
exec 11786421), so the lookups bought nothing.

| node | before | after |
|---|---|---|
| `Switch` (**ON LIVE**) | 5969 ms ×4 | **10 ms** |
| `guard-g-record` (clone) | 3231 ms ×4 | **37 ms** |
| `chat-attach-push` (clone) | 19406 ms ×4 | same fix |
| wall clock | 36.7 s | **4.2 s** |

🚩 `Switch` is on the **live spine** — live pays ~1.5 s per attachment today. That fix is in this bundle.
Also fixed in passing: `chat-attach-push` read `presigned_url`, but items only ever carry `url`, so every
chat attachment line rendered with an empty link. Now `($json.presigned_url || $json.url)`.

## 2b. Design rulings (user, 2026-08-09)

### R1 — `container status` vs `incoming`, mutual exclusion

"container" is in the live parser's incoming vocabulary and must STAY (it serves "is there incoming for
container X"). The discriminator is a different axis: **named-document request vs data query.**

| message | domain | rationale |
|---|---|---|
| "send me the container status list/sheet" | `resource_attachment` (`attachment` hint, `canonical_code: Container Status`) | naming a document in the company library |
| "is there incoming for container ABCD1234" | `incoming` | container **number** = data query |
| ~~"container status for ABCD1234"~~ | ~~`incoming`~~ | **RULING WITHDRAWN by user, same day — see below** |

### R1 row 3 — withdrawn 2026-08-09, do NOT build

Briefly ruled `incoming`, then reversed by the user before any code was written. **Current behaviour
stands: "container status for ABCD1234" routes to `resource_attachment` and hands over the sheet.**

Reason for the reversal (user): the phrase *is* naming the document, and a code guard keyed on
"bigram present AND no container-number entity" is an overfit — a rule tuned to three examples that
misfires on the fourth. The sheet also contains that container, so the answer is not wrong, just
broader than the narrowest possible reading.

⇒ **No `output_exchange` guard for container-status routing.** The parser's decisive terms (S1a) are
the whole mechanism and that is deliberate. This is a case where prompt-only is the RIGHT answer and
the usual prompt→code escalation (`dym-blind-suggestion-measured`) does not apply — that lesson is
about enforcing a rule you have already decided, not about hardening a judgement call.

If real traffic later shows customers naming a container number and wanting its dates, revisit with
measured examples rather than reasoning.

### R2 — `requested_attributes` cannot be matched on display labels

Measured on `origin/main`:

1. `crm_incoming_stock_list` accepts `product_ids, shipment_ids, supplier_ids, eta_from, eta_to, page,
   limit, contact_id, space_id` — **no field-projection param.** Confirmed by user: the tool returns every
   field the contact is entitled to. Projection is n8n-side, unavoidably.
2. `presenters.py:190` — `fields = [{"label": lbl, "value": val} …]`. **The key is dropped**; n8n only ever
   sees display text.
3. CRM already carries **two divergent label vocabularies** — `presenters._CLEARANCE_PAIRS` vs
   `field_access.FIELD_LABELS`: `CIDB Inspection`/`CIDB inspection`, `ETA Delay`/`ETA delay`,
   `COA Permit No.`/`COA permit no.`, and `ETC` vs `ETC (estimated time of container closing)`.

⇒ matching on label means duplicating a 20-row table in n8n that S0 has already proven will drift, with a
worse failure mode: S0 mis-sorts, this would report "no CIDB approval date" for a date that exists.

**Ask CRM to emit the key** — `fields: [{key, label, value}]`, one line at `presenters.py:190`.
`requested_attributes` are already CRM field keys, so they match directly with **no translation table
anywhere**, and S0 becomes permanently fixed (sort on `estimated_arrival_date`) rather than patched.
Cross-repo item; n8n cannot land it.

### R3 — the key must not reach the customer

User's concern, and it is the right class. **Verified: adding `key` renders byte-identical today** — all
12 consumers of `it.fields` name `.label` / `.value` explicitly (`output-structurer:69`,
`crossdomain-render:48,73`, `compile-current-state:123,141`, `crossdomain-zeroset:26`, `dym-annotate` +
`-partial:53,61`, `annotate-incoming-picker:13`, `build-suggest-offer:75`), and nothing does
`Object.entries` / `Object.keys` / spread / `JSON.stringify` over a field.

That is a property of today's code, not a guarantee. **Guard = render-parity at the customer boundary:**
the same envelope with and without `key` must produce a byte-identical outgoing message, asserted per
domain, offline via `tests/offline/node-source.js`. Plus a standing grep for structural dumps over `fields`.

**Rejected alternative:** strip `key` in `output-structurer` after projecting. Structurally leak-proof, but
`crossdomain-render` is downstream and needs the key for the S0 sort — it would trade a provable guard for
a re-broken sort.

### R4 — projection is presentational, not a security control

Because CRM returns every entitled field regardless, gating is CRM's job and already works. No n8n bug can
leak an unentitled field; but a projection bug **can hide an entitled one**. Hence the three-branch phrasing
in S2b must read `field_access.denied` (passthrough at `presenters.py:102`) and never infer from absence —
`_filled(val)` drops empty fields, so absent and denied are indistinguishable inside `fields`:

| state | reply |
|---|---|
| key present | the value |
| absent AND in `field_access.denied` | "I can't share that" |
| absent, not denied | "not recorded / not yet reached" |

Collapsing the middle into the third is the exact failure `catalog.py:595` warns about.

---

## 3. 🔴 Build blocker: live and the clone share `sub-get-results TEST`

```
LIVE   Call 'sub-get-results'  -> rysSPgUssLDf6xJc  (sub-get-results TEST)   ← MAIN ANSWER PATH
LIVE   probe-incoming          -> rysSPgUssLDf6xJc
LIVE   sibling/crossdomain/dym -> Fss5aAaXthJSWpZCgKiKR  (sub-get-results)
CLONE  all 6 callers           -> rysSPgUssLDf6xJc
```

S1c and S2b both edit that sub. As written they ship to production **ungated**, while the §0 clone
safety checklist still passes green. Extends memory `live-calls-getresults-test-fork`.

That memory's "byte-identical today, so no defect" is **no longer true**:

```js
// sub-get-results TEST only — appended AFTER the semantic_input assignments, so these win
out.contact_id = $input.first().json.contact_id.trim().toString()
out.space_id   = "364817"
```

`space_id` hardcoded to the live workspace; `contact_id` read from a different source; `.trim()` throws
if a caller omits it.

**Mitigation:** fork get-results for this build, repoint the clone's 6 callers at the fork, leave
`rysSPgUssLDf6xJc` untouched. **Promotion targets BOTH** `Fss5aAaXthJSWpZCgKiKR` **and**
`rysSPgUssLDf6xJc`, since live uses both — and each promote must be LIVE + own hunks, never a
block-copy (`stale-byte-identical-fork-claim`).

---

## 4. Build set

| step | target | edit |
|---|---|---|
| S0 | live spine `9qVyfUxmRQqrpGRMDLRuz` | `crossdomain-render.js:69` ETA label — **bundled into this plan's promote** (user, 2026-08-09) |
| S1a | parser fork `wI5RkNGW3EOJfBdo` | `resource_attachment` decisive terms + `attachment` hint `canonical_code` document classes |
| S1b | clone `txiPzSxy3Pclsz6v` | `semantic_input.document_class` passthrough |
| S1c | new get-results fork | `attachment` canonical_code → `attachment_type_code` |
| S2a | parser fork | `requested_attributes` → the 20 CRM field keys; CIDB / gatepass / collection / forwarder decisive for `incoming` |
| S2b | new get-results fork | carry `field_access`; project `fields` to identity ∪ requested; denial-vs-empty phrasing |

### S0 detail (re-verified 2026-08-09, live spine export `d7a819fc` CURRENT)

`crossdomain-render.js` sorts the cross-domain pivot block only — the CRM returns unstable row order
between calls, so the block sorts rather than inherit the jitter. Two label-matched branches:

```js
const _qty = it => Number(fieldVal(it, 'quantity on hand') ?? NaN);
const _eta = it => String(fieldVal(it, 'estimated arrival date') ?? '');
```

In the **stock→incoming** direction BOTH branches are dead:

- `crossdomain-zeroset.js:16` sets `OTHER_TOOL = crm_incoming_stock_list` → presenter `_incoming_list()`
  (`presenters.py:348`), which draws its ETA label from `_CLEARANCE_PAIRS[0]` = `("estimated_arrival_date",
  "ETA")` since `227c13d0f`. The old string never matches → `_eta` is `''` for every row.
- The qty branch cannot cover for it: incoming rows label quantity **`Incoming Quantity`**
  (`presenters.py:359`), not `Quantity On Hand` → `_qty` is `NaN` for every row.

⇒ no sort at all; raw CRM order. Silent, cosmetic (no row or field is lost), bites only when one product
has 2+ incoming shipments. The reverse direction is unaffected — `_stock()` still emits
`Quantity On Hand` (`presenters.py:678`).

Fix, tolerant in both directions (survives a rename back, and covers `_incoming_by_product` /
`_incoming_shipments` which still carry the old label at `:382` / `:402`):

```js
const _eta = it => String(fieldVal(it, 'eta') ?? fieldVal(it, 'estimated arrival date') ?? '');
```

### Where the projection goes, and why only there

`output-structurer` sets `answers: e.items`, and that array is consumed by `crossdomain-render`,
`dym-annotate`, `annotate-incoming-picker`, `build-suggest-offer` and `compile-current-state`. Projecting
`e.items[].fields` **once**, before `msg` and `answers` are built, covers every renderer surface —
enumerated by rendered string, not by graph inbound (`dym-blind-suggestion-measured`).

Identity fields stay unconditionally: five nodes look up `product code` by label, and
`crossdomain-render` sorts on ETA. Dropping either breaks them silently.

### Parser promote hazard

Fork `wI5RkNGW3EOJfBdo` is **stale vs live `XTODTw`** by exactly two lines — `resource_attachment` is
missing from `DOMAIN_BLOCKED_HINTS.order` and `.incoming`. Prompts are byte-identical
(`sha f5c6458aba47`, 30,906 chars). Block-copying the fork to live would silently regress those two
lines. Build the live target as **LIVE + own hunks, by node name**, and re-diff at promote time.

⚠️ **That two-line measurement is now STALE (2026-08-09) — re-measure before building.** Both sides
moved after it was taken: live `XTODTw` was promoted to `659b7576` (dym probe-before-offer bundle), and
`export --verify` reports the fork STALE at `184882c1` vs live `228f39a9`. The *rule* still holds —
LIVE + own hunks, never a block-copy (`stale-byte-identical-fork-claim`) — only the delta size is
unknown. Same applies to §3's get-results divergence: re-diff, don't trust the quoted hunk.
