# Change: `crossdomain-attachment` — deliver the packing list on cross-domain INCOMING turns

**Scope tag: `deterministic`.** No parser edit, no LLM node added. One new Code node, two expression
repoints, one small addition to an existing Code node, two edge moves.

**Status: BUILT ON CLONE 2026-08-04 — `txiPzSxy3Pclsz6v` `a0f434f9` → `de71f2fc-6133-4561-9785-efe0d9906a57`
(draft == active). NOT promoted, NOT UAC-run. Node-diff: `tests/diffs/crossdomain-attachment.md`.
Backup: `backups/clone-txiPzSxy3Pclsz6v-a0f434f9-20260804-xdattach-before.json`.
Live spine `9qVyfUxmRQqrpGRMDLRuz` (@ `a40cd16d`) untouched.**

> ### ✅ Both blocking decisions taken by the user, 2026-08-04 — build proceeded on these
>
> **RISK-A1 / Q10 — `ATTACH FOR EVERYONE`. Blocking status DISCHARGED BY USER DECISION, not by analysis.**
> The user was shown explicitly that this extends the previously-accepted "stock + incoming = one
> entitlement" risk (crossdomain plan Q10/RISK-1) from *text rows* to a **downloadable, forwardable
> document covering the whole container** (`FFAU3176932.xlsx` lists 4 products), reaching contacts that
> hold stock access but not incoming access. They chose to proceed. **No per-agent access re-check is
> built.** Row-level `access_levels` scoping still flows through the probe, so company/brand scoping is
> unchanged; only the per-agent gate is skipped. RISK-A2 (packing-list contents) is therefore accepted on
> the same footing — see §7, where the `check eta` precedent argument was made conditional on this. The
> §11 prerequisite checkbox is satisfied by this decision.
> *Consequence to carry:* partial-access behaviour still cannot be exercised (no partial-access test
> contact exists), so this risk is accepted **unmeasured**, not tested (UAC §XA "Blocked / not covered").
>
> **D-ATTACH-MENTION — `MENTION IT`.** The block announces the file with the direct path's exact sentence
> **`I have attached the file(s) below.`** (CRM `sorento_crm_mcp/presenters.py:708`), superseding the
> proposed `(Packing list attached.)` in §7. ⚠️ **Conditional, never unconditional:** it is emitted only
> when `blocks.length && env.attachments.length` — the on-hand direction probes
> `crm_inventory_stock_balance_list`, whose envelope carries `attachments: []`, so an on-hand block
> (e.g. `pls check eta SRTWT5800`) does **not** gain the sentence. It is appended at the END of
> `_xdBlock.block`, i.e. still above the escalate question on both compose arms; the marker haystack is
> `out.user_response` computed *before* insertion, so the sentence cannot alter placement or become a
> false marker match. Cost, as priced in §7: X1/X3/T1 and the §XA.11 baseline must be re-run/re-baselined.

Companion docs: `plans/cross-domain-stock-incoming-plan.md`, `tests/reviews/cross-domain-stock-incoming.md`
(open item **(d)** is exactly this change), `plans/tool-loop-removal-plan.md`,
`tests/reviews/tool-loop-removal.md`, `tests/pre-promote-manual-tests.md`. UAC: `tests/UAC.md` §XA.

---

## 0. The ask

`check eta SRTWC286-SH-NEW-200` returns the ETA **and** the packing list `FFAU3176932.xlsx`.
`check stock SRTWC286-SH-NEW-200` returns the same incoming facts through the cross-domain block but
**no file**. The user wants the file in both cases, chose **attach it** over text-only, and accepted that
a block covering N products may deliver N files.

---

## 1. 🚩 THE PLAN PREMISE WAS WRONG — corrected here, loudly

The task framing said: *"the crossdomain chain runs before `central-exchange`, so the natural point is to
merge the probe's attachments into the item that flows onward."*

**That cannot work.** On the crux turn `central-exchange` never executes.

```
validator → crossdomain-zeroset → crossdomain-gate ─TRUE→ crossdomain-probe → crossdomain-render ─┐
                                                   └─FALSE──────────────────────────────────────────┴→ If6
If6[0] → central-exchange → { if-got-attachments … ATTACHMENT CHAIN , compile-current-state }   ← ANSWERED only
If6[1] → Aggregate1 → not-found-error-message → sibling-gate → build-suggest-offer → tag-not-found
         → escalate-catalog → cs-offer-gate[1] → compile-current-state                          ← TOTAL MISS
compile-current-state → crossdomain-compose → { sendmsg2 , guard-d-record , session-save-gate }
```

`If6` splits on "did the turn return data". `check stock SRTWC286-SH-NEW-200` is a **total miss**
(`has_result:false`), so it takes `If6[1]`. The whole attachment chain hangs off `If6[0]`.

**Evidence (not inference):**

| exec | message | what it proves |
|---|---|---|
| `11083744` (clone) | `check stock SRTWC286-SH-NEW-200` | block delivered, `sorento-sub-respond-sendmsg-respond2` ran at `executionIndex 50` — and **`if-got-attachments` has no runData at all**. The chain never ran. |
| `11140285` (clone) | `check stock SRTWC286-SH-NEW-200` | `validator.attachments = []`; `crossdomain-probe` output carries `attachments:[{url:"https://cdn-sorento.com/packing_list/580150de-…/FFAU3176932.xlsx", filename:"FFAU3176932.xlsx", mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}]`. The file **is** in the probe result and **is** discarded. |
| `11081513` (clone) | `check stock for SRTWT5800-FH and SRTWT5801` | PARTIAL turn: `central-exchange` **did** run, `if-got-attachments` ran at index 48. So on the partial branch the chain is reachable. |
| `11081877` (clone) | certification turn, 2 PDFs | the chain end-to-end: `Loop Over Items1` 3 runs, `guard-g-record` 2 runs, 2 presign calls. Also: `sendmsg2` index **42** < `if-got-attachments` index **47** ⇒ **text before file**, today. |

Live is structurally identical here — same node names, same edges, same expressions
(`central-exchange[0] → if-got-attachments`, `If6[0] → central-exchange`).

**Consequence:** merging into `central-exchange`'s item delivers nothing on the very turn the user asked
about. The chain must be **re-rooted** at a node that runs on both `If6` branches. There is exactly one
such node in the finished-turn region: `crossdomain-compose` (and its successor `sendmsg2`).

### 1b. The second landmine on the same path

Even if you re-root the edge, **rewiring alone is inert** — both chain-entry nodes read their data
**by name**, and the two names disagree:

```
if-got-attachments  ←  {{ $('central-exchange').first().json?.attachments.length }}   // the GATE
Edit Fields         ←  {{ $('validator').first().json.attachments }}                  // the PAYLOAD
```

They agree today only by accident (`central-exchange` is an identity pass-through of the `validator`
payload on the deterministic envelope). After re-rooting:

- `$('central-exchange')` **throws** on the miss branch (node never executed) — and `if-got-attachments`
  uses `typeValidation: strict`, so this is a hard node error, not a silent false.
- `$('validator').attachments` is always `[]` on an inventory-origin turn, so `Edit Fields` would emit an
  empty array and **zero files would be sent while every test looked green** — the exact
  `$('node-name') beats wiring` failure that already cost this project a debugging cycle
  (HANDOFF §7.2, LESSONS "unwired error output masks failure").

Both expressions must be repointed. This is non-optional.

---

## 2. Locked design

| # | question | DECISION | why |
|---|---|---|---|
| A1 | where to inject | **New Code node `attach-merge`, rooted at `sorento-sub-respond-sendmsg-respond2` output 0.** Cut `central-exchange → if-got-attachments`; add `sendmsg2[0] → attach-merge → if-got-attachments`. | the unique root that runs on both `If6` branches *and* makes text-before-file a **data dependency** instead of a canvas-position accident |
| A2 | where the probe's files are stashed | `crossdomain-render` adds `_xdBlock.attachments = env.attachments` | `_xdBlock` is namespaced and is **provably dropped** before the live session PUT — `compile-current-state` builds a whitelisted `{variables, user_response, quick_reply}` object (lines 418–464). Keeps review finding **F2** discharged. |
| A3 | how `attach-merge` knows the block was actually delivered | re-derive: `crossdomain-compose.user_response.includes(_xdBlock.block)` with `_xdBlock.any === true` | `crossdomain-compose` deliberately emits **no marker** (F2 removed `_xdApplied`) and must keep emitting none. The text-containment test needs no new key, is self-evident, and fails safe. |
| A4 | dedupe | **leave it where it already is**: `Remove Duplicates`, key = **`url`**. `attach-merge` does NOT dedupe. | single owner; an assertion on a dedupe that is duplicated in two places proves nothing |
| A5 | direction filter | **none.** Forward whatever the probe returned, both directions. | the on-hand direction is quiet because `crm_inventory_stock_balance_list` returns `attachments:[]`, a **CRM data property, not a code guarantee**. Hardcoding "incoming only" would hide a future change instead of surfacing it. |
| A6 | cap on N | **none, and none hidden.** | LESSONS: no silent caps. `crossdomain-zeroset` applies no cap to `missing[]`/`probe_entities[]` (grepped — the 10-cap the review mentions is #3's *display* cap inside `compile-current-state`, not the probe set). |
| A7 | ordering | text first, file(s) after — enforced structurally by A1 | matches the direct `check eta` path (exec `11081877`: 42 < 47) |
| A8 | mention the file in the block text | **OPEN — decision `D-ATTACH-MENTION`, needs the user.** See §7. | the direct path says `I have attached the file(s) below.`; the cross-domain block would hand over a file with no sentence about it |
| A9 | sequencing | **ship SEPARATELY, third**, after `tool-loop-removal` then `cross-domain-stock-incoming` | §9 |

### 2.1 Why not the alternatives

- **Root at `crossdomain-compose` directly (4th output).** Works, one node earlier — but then text-vs-file
  ordering is decided by n8n v1's canvas-position sort, and a UI drag of `attach-merge` above `sendmsg2`
  would silently send the file first. Recorded as the fallback if `sendmsg2[0]` proves unusable.
- **Keep `central-exchange → if-got-attachments` and add a second root.** Both roots fire on the answered
  branch ⇒ `if-got-attachments` runs twice ⇒ **double send**. Rejected. (It is, however, the perfect
  fail-on-purpose fixture — FPA-1.)
- **A second, parallel attachment chain for the miss branch.** Duplicated nodes, and on partial turns both
  chains fire. Rejected.

---

## 3. Exact node/edge diff, by NAME

Target: clone `txiPzSxy3Pclsz6v`. Every node below exists on live under the identical name — verified
against live `a40cd16d`.

### 3.1 Edges

| op | edge |
|---|---|
| **CUT** | `central-exchange`[0] → `if-got-attachments` |
| **ADD** | `sorento-sub-respond-sendmsg-respond2`[0] → `attach-merge` |
| **ADD** | `attach-merge`[0] → `if-got-attachments` |

`central-exchange`[0] → `compile-current-state` is **kept**. Nothing else moves. `Edit Fields`,
`Split Out`, `Remove Duplicates`, `get-presigned-url`, `Loop Over Items1`, `Switch`, the three real
senders and the three clone guards are **untouched**.

> ⚠️ `sorento-sub-respond-sendmsg-respond2` has `onError: continueErrorOutput` on **both** clone and live.
> Output 0 is the success branch, so a failed text send now also suppresses the file. That is the right
> default (never a file with no message) but it is a behaviour change from today — record it, do not
> discover it.

### 3.2 New node — `attach-merge` (Code, run once for all items)

Position: cosmetic only now that ordering is a data dependency. Suggested clone `[8496, 2450]`,
live `[6256, 2880]` (left of / below `if-got-attachments`). Rename/reposition per the tidy-workflows rule;
no generic names.

Contract: emits exactly ONE item, `{ attachments: [...] }`, and reads everything else by name.

```js
// ── attach-merge ──────────────────────────────────────────────────────────────
// Single entry point for the attachment fan-out. Replaces `central-exchange` as the root of
// `if-got-attachments`, because central-exchange runs ONLY on the answered branch (If6[0]) and the
// cross-domain feature's headline case is a TOTAL MISS (If6[1]) — proven, exec 11083744.
//
// Emits ONE item carrying only `attachments`. It must NOT write onto crossdomain-compose's item:
// on live that item is the body of the conversation-variables PUT (review finding F2).
const MAIN = (() => {
  try {
    const n = $('central-exchange');
    if (!n.isExecuted) return [];                       // total-miss branch: no main-answer files
    const a = n.first().json.attachments;
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
})();

const XD = (() => {
  try {
    const r = $('crossdomain-render');
    if (!r.isExecuted) return [];
    const xb = r.first().json._xdBlock || {};
    const list = Array.isArray(xb.attachments) ? xb.attachments : [];
    if (!list.length) return [];
    if (xb.any !== true || !xb.block) return [];        // renderer produced no block -> nothing to explain a file
    // DELIVERY TEST (decision A3): crossdomain-compose emits no marker by design, so ask the
    // delivered text whether the block actually made it in. Fails safe: no block in the text -> no file.
    const c = $('crossdomain-compose');
    if (!c.isExecuted) return [];
    const txt = c.first().json.user_response;
    if (typeof txt !== 'string' || !txt.includes(xb.block)) return [];
    return list;
  } catch (e) { return []; }
})();

// Order: main-answer files first, cross-domain files after — mirrors the text order.
// NO dedupe here: `Remove Duplicates` (key `url`) owns that, and duplicating it would make the
// UAC assertion on dedupe unfalsifiable.
return [{ json: { attachments: [...MAIN, ...XD] } }];
```

### 3.3 `crossdomain-render` — one added line (stash only)

Inside the existing `out._xdBlock = { … }` literal, add:

```js
  attachments: Array.isArray(env.attachments) ? env.attachments : [],
```

`env` is already the unwrapped probe envelope. The early-return degraded branch
(`{block:'', any:false, degraded:true}`) is left alone — no `attachments` key there means `attach-merge`
sees `[]`, which is correct for a soft-failed probe.

**Residual, recorded not fixed:** `env.attachments` is **envelope-level**, so it covers every product the
probe returned, including any that `crossdomain-render` filtered out (a row whose `product code` is not in
`zs.missing`). Gating on `xb.any === true` means we never attach when *nothing* rendered, but on a mixed
turn a file belonging to a probed-but-unrendered product could ride along. There is no product↔attachment
linkage in the envelope to do better. Bounded by the fact that `probe_entities === missing`, so the probe
is only ever asked about products we intend to render. Watch it in XA-5.

### 3.4 `if-got-attachments` — repoint the gate

```
- leftValue: {{ $('central-exchange').first().json?.attachments.length }}
+ leftValue: {{ $json.attachments.length }}
```
Input is `attach-merge`'s single item. Keeps `typeValidation: strict` and `> 0`. Mandatory: the old
expression throws on the miss branch.

### 3.5 `Edit Fields` — repoint the payload

```
- value: {{ $('validator').first().json.attachments }}
+ value: {{ $json.attachments }}
```
Input is the `if-got-attachments` TRUE item = `attach-merge`'s item. Mandatory: `$('validator')` is `[]`
on every inventory-origin turn, so leaving it produces **zero files with a green execution** (FPA-3).

### 3.6 Untouched but load-bearing — record, verify, do not edit

- `Remove Duplicates` — `compare: selectedFields`, `fieldsToCompare: "url"`, v2 default operation
  (`removeDuplicateInputItems`, within-execution only). **Byte-identical on clone and live.**
- `Switch` — `$('Split Out').item.json.mimeType` contains `image` → out 0, `video` → out 1, else
  `fallbackOutput: extra` → out 2. `.xlsx` is
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` ⇒ **out 2** ⇒ `send-message-files`
  on live / `guard-g-record` on the clone.
- `get-presigned-url` — see §6.

---

## 4. The dedupe answer (question 2, answered with proof)

**Key = `url`.** `Remove Duplicates` v2, `compare: selectedFields`, `fieldsToCompare: "url"`, default
operation = de-duplicate items **within this execution** (no cross-execution state). Same parameters on
clone and live, read from both deployed graphs.

**The key is stable.** At that point in the chain `url` is the raw CDN path
(`https://cdn-sorento.com/packing_list/<uuid>/FFAU3176932.xlsx`), **not** a presigned URL —
`get-presigned-url` runs *after* `Remove Duplicates`. So no signature/nonce/expiry enters the key.
Verified against two real envelopes: probe (`11140285`) and direct (`11081877`).

**But the duplicate the task hypothesised cannot occur.** A turn carries ONE `domain_hint`, and
`crossdomain-zeroset` derives the probe tool from it as a hardcoded ternary:

| origin | main answer comes from | probe comes from |
|---|---|---|
| `incoming` | `crm_incoming_stock_list` — **carries attachments** | `crm_inventory_stock_balance_list` — `attachments: []` in every observed envelope |
| `inventory` | `crm_inventory_stock_balance_list` — `attachments: []` | `crm_incoming_stock_list` — **carries attachments** |

The two sources are **never both non-empty**, so a main↔block duplicate is structurally impossible today.
Specifically, the real case named in the task — `check eta for SRTWT5800 and SRTWC286-SH-NEW-200` — is
`origin = incoming`: the main answer carries `FFAU3176932.xlsx`, the probe is the inventory axis and
carries nothing. **The file is delivered exactly once, by the existing path, with this change inert on
that turn.** UAC XA-3 proves it rather than assuming it.

**The duplicate that CAN occur** is *inside the probe envelope*: two missing products shipping in the same
container. Whether the CRM already collapses that at envelope level is **unknown and must be measured**
(XA-4). Either way `Remove Duplicates` on `url` is the backstop. FPA-2 exists precisely so we can tell
which of the two is actually doing the work — a green XA-4 with the CRM already deduping would otherwise
be misread as "our dedupe works".

---

## 5. Multi-product fan-out (question 3)

Chain behaviour, measured on exec `11081877` (N=2): `Split Out` → N items → `Remove Duplicates` → N′ ≤ N
→ `get-presigned-url` × N′ → `Loop Over Items1` (N′+1 runs) → `Switch` → one send per item. Handles N
cleanly; the only cost is N′ presign POSTs and N′ respond.io sends.

**N is uncapped and deliberately so.** `crossdomain-zeroset` applies no cap to `missing[]`/
`probe_entities[]`. N′ = distinct `url`s across the probe envelope.

**Realistic N:** bounded by what the customer typed — decision D0 in the crossdomain plan (asked products
only; siblings are never cross-probed). A packing list is **per container**, so N′ ≈ distinct containers
among the missing products' incoming rows. Typical 1; 2–3 on a multi-product turn; a pathological
`check stock A, B, C, D, E` where each ships separately could reach 5. Nothing silently truncates. If a
cap is ever wanted it must be **visible in the message text** ("…and 3 more"), never a silent slice.

---

## 6. §0 containment on the clone (question 6)

| gate | instrument | expected |
|---|---|---|
| **S1** | `send-message-files`, `send-message-images`, `send-message-video` inbound-edge count in the **deployed** clone JSON | **0**, unchanged. This change adds no edge to any of them. Assert by enumerating the connection map, not by memory (the tool-loop-removal review's method). |
| **S1** | `Switch` out 2 → `guard-g-record` RPUSH to `test:egress:{test_run_id}` | payload `{"guard":"send-message-files","kind":"would_send","target":"respondio:contact:message","payload":{"presigned_url":…,"filename":…}}` — read byte-exact from the deployed node |
| **S3** | `save-session-vars` inbound | 0, unchanged. `attach-merge` writes nothing onto `crossdomain-compose`'s item, so the live PUT body is byte-identical (**F2 stays discharged**). |
| **S3** | new CRM calls | exactly one: `get-presigned-url` now also fires on cross-domain turns. See below. |
| **S4** | probe tool | unchanged — `crossdomain-zeroset`'s hardcoded ternary, never caller-controlled |
| **S5/S6** | `is_test` census, LLM node count | unchanged; zero LLM nodes added |

### `get-presigned-url` is a CRM **read** — established from the CRM source, not assumed

`POST https://fe-sorento.foundryx.my/api/v1/external/presigned-url`, implemented at
`/Users/tehjayson/Documents/foundryx/sorento_crm/sorento_crm_backend/app/api/v1/external/presigned_url.py`.
The handler does one `db.query(Attachment)` lookup, an optional `EntityAttachmentLink` lookup, an audit
log line, and a signing operation. **No INSERT/UPDATE/DELETE anywhere.** It is therefore a permitted read
under the safety rule. Record the file reference so a reviewer does not have to re-derive it.

### 🚩 Landmine this change makes more likely to bite

`get-presigned-url` has `onError: continueErrorOutput` and its **`main[1]` is unwired** (clone and live).
The endpoint returns **404** when `presigned_require_attachment_row` is on and the path has no attachments
row (`config.py:90`). So a bad path → the file is silently dropped → **the execution still reports
`success`** (LESSONS §61a). Every UAC case below therefore asserts **per-node runData** — `get-presigned-url`
run count and each run's `executionStatus` — and **never** the execution status. FPA-4 proves the assertion
can go red.

### Console lane — a human can eyeball it, but not from the console's egress log

`Switch → guard-e/f/g-record → chat-attach? → chat-attach-push` RPUSHes
`chat:reply:{chat_id}` with `{type:'attachment', text:'[attachment] <filename> <url>', url, filename}`, so
the 📎 appears in `zz-chat`. **Caveat:** `guard-*-record` keys its egress list off
`$('redis-pop-main-message-list')…message.test_run_id`, which the console lane does not seed. **All
egress-log assertions must be driven through `tests/harness/drive-clone.py` (zz-canary-run). The console
is for eyeballing only.**

---

## 7. 🚩 Risks — including two that make this riskier than the task described

**RISK-A1 (NEW, material): RISK-1 is being escalated from text to a downloadable document without
re-consent.** The crossdomain plan's Q10/RISK-1 accepted "no per-agent access re-check": on a
`check stock` turn `check-access` runs against `general_enquiries` only, and the incoming probe is *not*
re-checked against `incoming_stock_enquiries`. For **text rows** the user accepted this. This change
extends the same hole to a **file the customer can download and forward**. A contact holding stock access
but not incoming access would receive an incoming packing list they could not obtain by typing
`check eta`. Row-level `access_levels` scoping still flows through the probe, so company/brand scoping is
preserved — but the per-agent gate is still skipped. **This needs an explicit user decision before build.**
Mitigation if declined: gate `XD` in `attach-merge` on a positive incoming-agent access check, or ship
text-only for the cross-domain block (the user's already-rejected option, but rejected before this
distinction was on the table).

**RISK-A2: packing-list contents.** A container's packing list may list lines for consignees other than
the asking contact. *Counter-argument, and it is a strong one:* the identical file is already deliverable
to the identical contact today by typing `check eta` instead of `check stock`, through the identical
`access_levels` scoping. So this removes an accidental asymmetry rather than creating a disclosure class —
**provided RISK-A1 is resolved**. If RISK-A1 is accepted as-is, RISK-A2 reopens, because then the
`check eta` precedent no longer covers the population.

**RISK-A3: a new real-egress path on live, with no clone analogue.** Live has no `chat-attach?` lane; live
`Switch[2] → send-message-files` is
`POST https://api.respond.io/v2/contact/id:{id}/message` with the real `respondIoApi` credential and body
`{"message":{"type":"attachment","attachment":{"type":"file","url":<presigned>,"fileName":<filename>}}}`.
Read byte-exact from live `a40cd16d`. Every clone test proves the *decision* to send; **none of them proves
the send itself**, because the sender is orphaned. Post-promote verification must be on the specific path
(LESSONS §56).

**RISK-A4: text-send failure now suppresses the file** (§3.1). Behaviour change, judged correct.

**RISK-A5: the `Edit Fields` / `if-got-attachments` repoint is invisible to any status-based check.**
Get it wrong and you get zero files with a green run. FPA-3 is mandatory, not optional.

### Open decision `D-ATTACH-MENTION` (needs the user)

The direct path's message opens `I have attached the file(s) below.` — that sentence comes from the
incoming envelope's `response_intro`, which `crossdomain-render` deliberately discards. So as designed the
customer receives a file with no sentence about it.

Proposal: when `env.attachments.length > 0 && blocks.length > 0`, append one line to `_xdBlock.block`,
e.g. `\n\n(Packing list attached.)`. It sits **inside** the block, above the escalate phrase, so the
marker-placement and frozen-phrase contracts are untouched.

**Cost:** it changes the byte output of already-signed-off cases X1/X3/T1 in the pending
`cross-domain-stock-incoming` promote. So either it rides with a re-run of those, or it is deferred to a
follow-up. **Recommend: take the decision now, implement in this change, re-run X1/X3/T1.** Shipping a
silent file is a worse first impression than a one-line re-run.

---

## 8. Which turns newly send a file (question 5) — the egress-review crux

A file is newly delivered **iff all five** hold:

1. `domain_hint === 'inventory'` and `message_type === 'business_query'` (origin=incoming contributes
   nothing — §4 table);
2. `_xd.active === true` — ≥1 asked product resolved to a uuid and returned zero inventory rows;
3. the incoming probe returned ≥1 renderable row ⇒ `_xdBlock.any === true`;
4. `crossdomain-compose` actually applied the block (total-miss branch: always; partial branch: also needs
   `last_result_set` non-empty and `user_response` non-empty);
5. the probe envelope carried ≥1 `attachments[]` entry.

### Newly sending

| id | turn | today | after |
|---|---|---|---|
| **N1** | total miss, one product — `check stock SRTWC286-SH-NEW-200` | 0 files | **1** (`FFAU3176932.xlsx`) |
| **N2** | total miss, multiple products all empty on hand, ≥1 with incoming | 0 | **1 per distinct container** |
| **N3** | partial inventory turn — `check stock SRTWT5801 and SRTWC286-SH-NEW-200` | 0 | **1** |
| **N4** | dym-picked inventory turn (zeroset's PICKED-strict arm) where the picked code is empty on hand but has incoming | 0 | **1** |

### Explicitly NOT sending

| id | turn | why |
|---|---|---|
| **U1** | **both axes empty** — `check stock SRTWT5800-FH` | `_xdBlock.any=false` ⇒ no block ⇒ `attach-merge` returns `[]`. **Decision (d) preserved: silence, no file, no invented absence.** |
| **U2** | any `check eta …` turn (origin=incoming) | probe = inventory, `attachments: []` ⇒ block-side contributes nothing; main-side behaviour unchanged |
| **U3** | probe soft-failed (`degraded:true`) | no `_xdBlock.attachments`, no block |
| **U4** | every §6 no-op row of the crossdomain plan — domain ∉ {inventory,incoming}; non-business_query; zero-set empty; container-only; `require_specific`; no-access / clarify / not-supported / escalation / declined | `crossdomain-render` never runs ⇒ `attach-merge.attachments === central-exchange.attachments` exactly |
| **U5** | fully answered turn, nothing missing | as U4 |
| **U6** | existing attachment turns (product_attachment / certification, e.g. exec `11081877`) | same files, same order — only the chain's **trigger** moved. This is the regression surface, not a new-send surface. |

**Reachability proof for U6** (why re-rooting cannot lose an existing file): `central-exchange`'s only two
outputs are `if-got-attachments` and `compile-current-state`; `compile-current-state` always feeds
`crossdomain-compose`, which always feeds `sendmsg2`. So every turn that reaches the chain today also
reaches the new root. Asserted statically (edge census) **and** dynamically (XA-9), never assumed.

---

## 9. Sequencing — ship SEPARATELY, third

Recommended order:

1. **`tool-loop-removal`** (APPROVED). It rewrites `If6[1]` from `Loop Over Items` to `Aggregate1` — the
   exact miss edge this feature's reachability argument stands on. Land it first so the topology is settled.
2. **`cross-domain-stock-incoming`** (fixes done, lead-in reworded 2026-08-04, clone `a0f434f9`). Text
   only, zero new egress, already reviewed, and `tests/pre-promote-manual-tests.md` is written against it.
3. **`crossdomain-attachment`** (this change) — the only one of the three that creates a **new real-egress
   path on live**.

**Why not bundled with #2:**

- **Rollback granularity.** Bundled, "stop sending files" means reverting the whole cross-domain feature.
  Separate, it is a three-edge revert plus two expression restores (§10).
- **Attribution.** If complaints follow a bundled promote you cannot tell whether the text block or the
  file caused them.
- **Review class.** #2's review has zero-egress PASS on the basis that it adds no egress surface. This one
  does. Folding them re-opens a settled review.
- LESSONS §51: turn one frightening publish into two boring ones.

**Cost of separateness, stated:** `crossdomain-render` is a #2 artifact, so #3's diff layers on top of it.
#3 **cannot** be promoted before #2, and its clone build must start from #2's published clone version —
not developed in parallel on a fork.

---

## 10. Rollback

**Granular (preferred — leaves #2 in place):**
1. re-add `central-exchange`[0] → `if-got-attachments`;
2. delete `sorento-sub-respond-sendmsg-respond2`[0] → `attach-merge` and `attach-merge`[0] → `if-got-attachments`;
3. delete node `attach-merge`;
4. restore `if-got-attachments.conditions.conditions[0].leftValue` to
   `={{ $('central-exchange').first().json?.attachments.length }}`;
5. restore `Edit Fields.assignments.assignments[0].value` to `={{ $('validator').first().json.attachments }}`;
6. remove the `attachments:` line from `crossdomain-render`'s `_xdBlock` literal (inert if left, but keep
   the artifact clean).

Steps 1–5 are sufficient to stop all new file sends; step 6 is hygiene.

**Coarse:** `publish_workflow` the pre-promote `activeVersionId`. **Note this also reverts #2** if they
were promoted in sequence without an intermediate backup — so capture `activeVersionId` **immediately
after #2's promote and before #3's**, and record it here.

---

## 11. Promote checklist (user-gated — do NOT promote unprompted)

**Prerequisites**
- [x] `D-ATTACH-MENTION` decided (§7) — **MENTION IT**, user 2026-08-04. See the banner at the top.
- [x] **RISK-A1 decided** — **ATTACH FOR EVERYONE**, user 2026-08-04. Accepted unmeasured (no
      partial-access test contact). See the banner at the top.
- [ ] `tool-loop-removal` promoted; `cross-domain-stock-incoming` promoted; live smoke green on both.
- [ ] Live `activeVersionId` **after #2 / before #3** captured and written into §10.

**Build + test (clone only)**
- [ ] Build on clone `txiPzSxy3Pclsz6v`, layered on #2's published version. Never live.
- [ ] Discard the first run after any write (post-publish race — it already produced one false PASS here).
- [ ] Record **case → executionId** for every case (the #2 review's standing complaint).
- [ ] All UAC §XA cases green; all FPA-* fail-on-purpose cases shown **red then restored**.

**Promote**
- [ ] Backup live `activeVersionId`; pre-check live **draft == active** (LESSONS §24/§51).
- [ ] Target nodes by **NAME**, never clone ids; strip trailing whitespace; per-node byte-SHA gate
      draft==file → publish only on match → re-fetch active==file (LESSONS §58).
- [ ] **Do NOT copy `is_test` anywhere** (LESSONS §48a). This change touches no `workflowInputs`.
- [ ] `attach-merge` carries **no credentials** — it is a Code node, a type that cannot accept one. Assert
      on node **type**, not on the absence of a `credentials` block (LESSONS §47).
- [ ] Confirm live `Remove Duplicates` is still `fieldsToCompare: "url"` at promote time (it is the dedupe
      contract; a UI edit would break it silently).
- [ ] Confirm live `send-message-files/images/video` inbound count is unchanged (they must stay fed only by
      `Switch`).
- [ ] `publish_workflow` after `update_workflow`.

**Post-promote (LESSONS §56 — verify the path you changed, not a happy path)**
- [ ] Smoke on the **cross-domain** path against a controlled contact: `check stock SRTWC286-SH-NEW-200`
      → text arrives first, then exactly one `FFAU3176932.xlsx`.
- [ ] Smoke a **pre-existing** attachment turn (certification) → same files, same order. This is the
      re-rooting regression check and it is the one most likely to bite.
- [ ] Smoke **both empty** (`check stock SRTWT5800-FH`) → no file, no block.
- [ ] ⛔ **Do NOT smoke the `yes` leg on a real contact** — carried forward from #2: the escalate phrase now
      arms on turns that returned data, and a bare `yes` is a real staff assignment ripple.
- [ ] Watch `presign_audit` volume for a few days — a spike attributable to `check stock` turns is the
      blast-radius signal.

---

## 12. Verification tasks (plan §6 equivalent — do these before build)

| # | task | why it is not already answered |
|---|---|---|
| **V1** | Confirm the CRM `crm_incoming_stock_list` envelope's `attachments` is **envelope-level, one entry per distinct file** and not repeated per row, on a 2-product-same-container probe | decides whether `Remove Duplicates` is load-bearing (§4) and whether FPA-2 goes red |
| **V2** | Confirm `crm_inventory_stock_balance_list` returns `attachments: []` on a product that *does* have documents (e.g. a certification-bearing code queried by stock) | A5's asymmetry claim is currently supported by three envelopes, all of products without documents |
| **V3** | Confirm n8n v1 execution order is y-ascending on the canvas (the current text-before-file behaviour depends on it) | evidence is consistent (execs `11081877`, `11081513`) but the tie-break rule is unproven. Only matters if the fallback root (§2.1) is used |
| **V4** | Estimate the newly-file-sending population: count turns in `n8n_test` `v_turns`/`chat_histories` whose incoming text matches a stock enquiry and whose reply contains `No stock records found for:` or `No matching results found.` | blast radius is currently "unknown" — that is not good enough for a real-egress promote |
| **V5** | Confirm the live get-results sub `Fss5aAaXthJSWpZCgKiKR` returns `attachments` in the same envelope position as the fork `rysSPgUssLDf6xJc` | the probe is remapped at promote; the shape is proven only on the fork |
| **V6** | Re-read `sorento-sub-respond-sendmsg-respond2` output-0 semantics on live under `onError: continueErrorOutput` | §3.1 / RISK-A4 |

---

## 13. Follow-ups (logged, not built)

1. Product↔attachment linkage in the get-results envelope, so a block can attach only the files belonging
   to the products it actually rendered (§3.3 residual).
2. Wire `get-presigned-url`'s `main[1]` to a visible failure path — pre-existing, instance-wide
   (LESSONS §61a), out of scope here but this change increases its exposure.
3. Revisit RISK-A1 if stock/incoming entitlements are ever split per contact.
