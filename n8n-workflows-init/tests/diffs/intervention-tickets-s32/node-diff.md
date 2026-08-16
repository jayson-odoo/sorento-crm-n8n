# Node diff — S3.2 fork build (`vUfFUDjLAuMaeQE6`, `sub-human-intervention TEST (delta3)`)

Change id: `intervention-tickets-s32`
Plan: `n8n-workflows-init/plans/intervention-tickets-s32.md` § "Business change" items 1–7
Build date: 2026-08-12 · seat: coder · executions run: **3 mechanism-verification runs on the
THROWAWAY only** (see §4a; none on the fork, none on live — the matrix itself remains the tester's slice)
Amended 2026-08-12 (**hardening pass**, plan edit-list item 3 "HARDENING" bullet) — see §3a.
Amended 2026-08-12 (**fail-loud pass**, follow-up to the tester's case (f) FAIL) — see §4a.
Amended 2026-08-16 (**interpolation-hardening pass 2**, codex cross-model review VERDICT: FIX) — see §3b.

| | |
|---|---|
| target | `vUfFUDjLAuMaeQE6` — **fork only** |
| live sub (NOT touched, re-checked after every PUT) | `rrYXzE61gCNUck_zmXe-G` @ `5018a189-22df-4cb9-aa89-fa509377abe9`, `updatedAt 2026-07-22T01:27:32.239Z` — unchanged |
| fork versionId before | `344e1a83-996d-45fb-9e7e-4b3319358811` (matches the plan's recorded fork state) |
| fork versionId after build PUT | `fdc154b5-cb33-416c-a468-517fff59dc5e` |
| fork versionId after **hardening** PUT | `ceb72e9e-d708-4f35-b5ec-9d18286d316d`, `updatedAt 2026-08-12T14:30:50.709Z` |
| fork versionId after **fail-loud** PUT | `16eadb1e-157b-419a-9441-e6510c40f4fc` |
| fork versionId after **interpolation-hardening pass 2** PUT (current, §3b) | **`3186d960-2c39-4bfd-a3b1-9e8d4d5e0295`** — `versionId == activeVersionId` (published; REST PUT auto-publishes) |
| transport | REST `PUT /api/v1/workflows/vUfFUDjLAuMaeQE6`, HTTP **200**, body derived from a fresh REST GET of the same workflow (LESSONS §55) |
| snapshots | `fork-before.json` / `fork-after.json` in this directory (both gitignored — full GET dumps are secrets at rest, LESSONS §59b). ⚠️ **`fork-after.json` is the *build* PUT (`fdc154b5-…`) and is now one version stale**; it was deliberately not refreshed (writing another full-GET dump only adds a secret at rest). Re-GET the fork for the current bytes; the authority for the current state is the sha table below |
| node count | 18 → **16** (+1 added, −3 deleted) |
| credentialed nodes | 7 → 6 — the only loss is the deleted `Redis` node's `sorento-redis`. All 6 survivors re-asserted after the PUT (collateral-credential check, LESSONS §55) |

Bundle key: **HARNESS** = strip at promote · **REWORK** = the promotable business diff · **REBASE** = drift fix (already live's form, so it promotes as a no-op).

Post-build param sha256 (first 12 of `sha256(json.dumps(node.parameters, sort_keys=True))`) is recorded per node so a later test pass can prove the change is still PRESENT (LESSONS §64 rule ii).

---

## REBASE — drift fixed before layering the rework

### `Call 'sub-add-comment-respond'` (executeWorkflow) — param-edit
- **before** `c95e85b1fd17` → **after** `c2cd407558ce`
- **after sha == live's sha for the same node (`c2cd407558ce`)** — the whole `workflowInputs.value` block is now byte-identical to live.
- Only the `comment` leaf changed; `contact_id` and `user_id` were already identical to live.

before (fork drift — Luxon `.toDateTime()` + `.plus({hours: 8})`, inline `//` comments, "Remaining time for response/resolution" lines):
```
=Team: {{ ...team }} \n⏰ SLA Alert: This contact is routed to you at {{   $('conversation-sla-tracking-create').item.json.initiated_at     .toDateTime()                // parse string to Luxon DateTime     .plus({ hours: 8 })          // add 8 hours     .toFormat('yyyy-MM-dd HH:mm:ss') }}.  You have until {{ …due_at… }} to respond. You have until {{ …due_at_resolution… }} to resolve Remaining time for response: {{ $('get-round-robin-assignee').first().json.tier_response_hours }} hour(s) Remaining time for resolution: {{ …tier_resolution_hours… }} hour(s)  Reference message: …
```

after (== LIVE, `DateTime.fromISO(..., {zone:'utc'}).setZone('Asia/Kuala_Lumpur')`, real newlines, no tier-hours lines):
```
=Team: {{ $('When Executed by Another Workflow').item.json.team }}
⏰ SLA Alert: This contact is routed to you at {{ DateTime.fromISO($('conversation-sla-tracking-create').item.json.initiated_at, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') }}.
You have until {{ DateTime.fromISO($('conversation-sla-tracking-create').item.json.due_at, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') }} to respond.
You have until {{ DateTime.fromISO($('conversation-sla-tracking-create').item.json.due_at_resolution, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') }} to resolve.
Reference message: https://app.respond.io/space/364817/inbox/{{ …contact_id }}#{{ …message_id }}
```

**Data-source note (plan-mandated, re-verified):** this expression reads `initiated_at` / `due_at` / `due_at_resolution` off `$('conversation-sla-tracking-create')`. The locked `/integration` response still carries all three, so the rebased expression works unchanged against the new route. No edit needed here for the rework.

---

## REWORK — the promotable business diff

### 1. `if-conversation-unassigned` (if) — param-edit (condition narrowed)
- **before** `647ddf4eb42f` → **after** `50391b189ae0`
- Deleted condition id `ba3b3fbe-0d12-45e2-bccb-e716b5f11081`: `={{ $json.is_working_hours }}` is-true.
- Kept, unmodified, condition id `83bed6cf-b77c-4326-a6db-07240c5366ec`: `={{ $json.is_already_assigned }}` is-false.
- `combinator` stays `"and"` over a single condition; `options` (strict/v3) untouched.
- **Exactly one condition remains** (asserted from the re-fetched JSON).
- Intent: the If now decides *only* "does respond.io need a cosmetic assign?". Working-hours routing moves downstream to the create response (item 4).

### 2. `if-conversation-unassigned` FALSE → `conversation-sla-tracking-create` — rewire
- before `main[1]` → `comment-switch`; after `main[1]` → `conversation-sla-tracking-create`.
- `main[0]` unchanged → `Assign or unassign a Conversation1`.
- **`conversation-sla-tracking-create` now has exactly TWO inbound edges** (asserted from the re-fetched JSON): `Assign or unassign a Conversation1` (assign path) and `if-conversation-unassigned` (FALSE / already-assigned path). This is the lost-enquiry fix — an already-assigned conversation now creates a tracking row.
- By-name resolution on the new path: the create body reads `$('get-round-robin-assignee')` and `$('When Executed by Another Workflow')`, both of which are upstream ancestors on **both** branches, so the FALSE path resolves. `.item` paired-item lineage on the FALSE path is `if-conversation-unassigned ← get-round-robin-assignee`, one hop, unambiguous. (Tester: confirm in runData — TOPOLOGY "reads BY NAME" rule.)
- Only one branch of an If emits per execution, so the create still fires exactly once per turn.

### 3. `conversation-sla-tracking-create` (httpRequest) — param-edit (URL + body, LOCKED shape)
- **before** `cf2d15ffcf8b` → **after** `086487442a3d` → **after hardening `7a6db3f826ef`** (§3a) → **after interpolation-hardening pass 2 (current) `d8d6ac75fb2c`** (§3b)
- URL: `…/api/v1/sla-management/conversation-sla-tracking` → **`…/api/v1/sla-management/conversation-sla-tracking/integration`** (the only route whose response carries `in_working_hours`).
- Method `POST`, `authentication: genericCredentialType`, `genericAuthType: httpHeaderAuth`, `sendHeaders: true` with an empty `headerParameters.parameters` list, `options: {}` — all unchanged.
- Credential unchanged: **`crm-n8n-auth`** (`httpHeaderAuth`, id `mNsZWyU82NYV58k2`).

body before:
```
={
    "policy_id": "{{ $('get-round-robin-assignee').item.json.policy_id }}",
    "current_tier": 1,
    "assigned_to": "{{ $('get-round-robin-assignee').item.json.assignee_id }}",
    "contact_phone_number": "{{ $('When Executed by Another Workflow').first().json.contact_phone_number }}",
    "agent_code": "{{ $('When Executed by Another Workflow').first().json.agent }}",
    "team_set_code": "{{ $('When Executed by Another Workflow').first().json.team }}",
    "message_id": {{ $('When Executed by Another Workflow').first().json.message_id }}
}
```

body after the build PUT (superseded by §3a; sha256(jsonBody) = `2e13312ff20f9efa…`):
```
={
    "assigned_to_id": "{{ $('get-round-robin-assignee').item.json.assignee_id }}",
    "contact_phone_number": "{{ $('When Executed by Another Workflow').first().json.contact_phone_number }}",
    "agent_code": "{{ $('When Executed by Another Workflow').first().json.agent }}",
    "team_set_code": "{{ $('When Executed by Another Workflow').first().json.team }}",
    "message_id": {{ $('When Executed by Another Workflow').first().json.message_id }},
    "source_message_id": "{{ $('When Executed by Another Workflow').first().json.message_id }}",
    "source_message_text": {{ JSON.stringify($('When Executed by Another Workflow').first().json.input_message || '') }}
}
```

Per-key delta:

| key | before | after | note |
|---|---|---|---|
| `policy_id` | present | **dropped** | backend resolves policy from (agent_code, team_set_code) |
| `current_tier` | `1` | **dropped** | backend forces tier 1 |
| `assigned_to` | assignee_id | **renamed → `assigned_to_id`** | same source expression |
| `contact_phone_number` / `agent_code` / `team_set_code` | — | unchanged | — |
| `message_id` | unquoted | unchanged, still unquoted | BeforeValidator coerces |
| `source_message_id` | — | **new**, quoted STRING of the same `message_id` | per locked contract |
| `source_message_text` | — | **new**, `JSON.stringify(... \|\| '')` | becomes the worklist enquiry snippet; the stringify emits its own quotes, so the key is unquoted in the template |

`input_message` and `explicit_assignee_id` are both declared inputs on `When Executed by Another Workflow`, so the new expressions resolve (verified against the trigger's `workflowInputs.values`).

### 3a. `conversation-sla-tracking-create` — HARDENING pass (2026-08-12, second PUT)

Plan authority: `plans/intervention-tickets-s32.md` edit-list item 3, "HARDENING (coder finding
2026-08-12, throwaway build)". Origin: `throwaway-build.md` §10 *Finding* — `contact_phone_number`,
`agent_code` and `team_set_code` were interpolated **raw between quote characters**, so a `"`, `\`
or newline in any of the three malforms the request body. This is latent on **live** today too
(same raw form, see the live-untouched check below); the promotable body now carries the fix.

- **sha** `086487442a3d` → **`7a6db3f826ef`** · `sha256(jsonBody)` `2e13312ff20f9efa…` →
  **`d3b86d1213c6b863…`**
- **Only** `parameters.jsonBody` changed. `url`, `method`, `authentication`, `genericAuthType`,
  `sendHeaders`, `headerParameters`, `options`, the `crm-n8n-auth` credential binding, the node
  `id`/`name`/`position`/`type`/`typeVersion` and **all 15 other nodes' param shas** are unchanged
  (delta table re-run after the PUT: exactly one node CHANGED). `connections` deep-equal to before.

Per-line delta — exactly three lines, all of the same shape:

| key | before | after |
|---|---|---|
| `contact_phone_number` | `"contact_phone_number": "{{ …first().json.contact_phone_number }}",` | `"contact_phone_number": {{ JSON.stringify(…first().json.contact_phone_number ?? '') }},` |
| `agent_code` | `"agent_code": "{{ …first().json.agent }}",` | `"agent_code": {{ JSON.stringify(…first().json.agent ?? '') }},` |
| `team_set_code` | `"team_set_code": "{{ …first().json.team }}",` | `"team_set_code": {{ JSON.stringify(…first().json.team ?? '') }},` |

The template's surrounding `"` characters are **removed** for these three keys — `JSON.stringify`
supplies its own quotes. That is exactly the pattern `source_message_text` already used. The other
four keys (`assigned_to_id`, `message_id`, `source_message_id`, `source_message_text`) are
**byte-identical** to §3.

body after hardening (byte-exact as published; `sha256(jsonBody) = d3b86d1213c6b863…`):
```
={
    "assigned_to_id": "{{ $('get-round-robin-assignee').item.json.assignee_id }}",
    "contact_phone_number": {{ JSON.stringify($('When Executed by Another Workflow').first().json.contact_phone_number ?? '') }},
    "agent_code": {{ JSON.stringify($('When Executed by Another Workflow').first().json.agent ?? '') }},
    "team_set_code": {{ JSON.stringify($('When Executed by Another Workflow').first().json.team ?? '') }},
    "message_id": {{ $('When Executed by Another Workflow').first().json.message_id }},
    "source_message_id": "{{ $('When Executed by Another Workflow').first().json.message_id }}",
    "source_message_text": {{ JSON.stringify($('When Executed by Another Workflow').first().json.input_message || '') }}
}
```

Behaviour notes for the reviewer:

- `?? ''` (not `||`) is what the plan specifies for these three, so a legitimately falsy-but-present
  value would survive; `source_message_text` keeps its pre-existing `|| ''` untouched (out of scope
  — "all other keys byte-identical").
- **Wire shape is unchanged for today's values.** For the recorded sample inputs the rendered body
  is **byte-identical** to the previous version — see the §Create-body sample note. The fix is
  latent-defect removal, not a contract change; the peer's replayed fixtures stay valid.
- `null` / `undefined` / an absent key now render `""` instead of the literal `null` (the old raw
  form produced `"contact_phone_number": "null"` — proven red in the offline probe, see
  `throwaway-build.md` §8).
- ~~**`assigned_to_id` is deliberately NOT hardened**~~ — **SUPERSEDED by §3b (2026-08-16).** This
  bullet argued the remaining raw interpolation was an acceptable known edge, partly because it kept
  the throwaway's "malformed body throws" instrument able to go red. The codex cross-model review
  rejected that trade (and found two worse siblings the bullet did not mention). All three raw
  interpolations are now gone; the instrument was retargeted rather than kept alive by a defect.
- n8n expression support: `??` is evaluated by the Tournament expression engine the same way the
  existing `||` and `?.` forms in this workflow are. Not exercised by an execution here (no
  executions in this seat) — the tester's V2 matrix runs the identical transplanted expression in
  the throwaway's Code stand-in, which is proven mechanically equivalent (`throwaway-build.md` §3).

### 3b. `conversation-sla-tracking-create` — INTERPOLATION-HARDENING PASS 2 (2026-08-16, fourth PUT)

Origin: **codex cross-model review, VERDICT: FIX** (`/codex-review` second opinion over the exported
node bodies). Codex found the first two; the main session found the third while verifying against the
exported fork. §3a hardened the three *trigger-sourced strings* and explicitly left `assigned_to_id`
raw "as a known remaining edge". That judgement was wrong on all three counts below, and the two
siblings were not even in the §3a delta table.

**The three defects, all in the same body, all latent on LIVE today as well:**

| key | pre-fix form | what a missing value rendered | consequence |
|---|---|---|---|
| `message_id` | `{{ … }}` **unquoted** | `"message_id": ,` | **MALFORMED JSON** → the create request fails → the intervention dies silently *after* `…routed-to-pic2` already told the customer "we are directing your enquiry to the correct person" |
| `source_message_id` | `"{{ … }}"` quoted-raw | `""` | **EMPTY IDEMPOTENCY KEY.** This field is the identity of the whole feature — AC-A2 dedups on it. A silently broken dedup is worse than a loud failure |
| `assigned_to_id` | `"{{ … }}"` quoted-raw | the literal string `"undefined"` | backend **400 "User not found for assigned_to_id"** |

Note the n8n rendering rule that makes the first two so quiet: in a multi-part `{{ }}` template n8n
renders a `null`/`undefined` expression result as the **empty string**, so the unquoted key loses its
value entirely and the quoted key keeps its quotes and loses its content. Neither raises anything.

- **sha** `7a6db3f826ef` → **`d8d6ac75fb2c`** · `sha256(jsonBody)` `d3b86d1213c6b863…` →
  **`101c71472e610b88…`** (883 chars)
- **Only** `parameters.jsonBody` changed. `url`, `method`, `authentication`, `genericAuthType`,
  `sendHeaders`, `headerParameters`, `options`, the `crm-n8n-auth` credential binding
  (`mNsZWyU82NYV58k2`), the node `id`/`name`/`position`/`type`/`typeVersion` and **all 15 other
  nodes' param shas** are unchanged (delta table re-run after the PUT: exactly one node CHANGED).
  `connections` deep-equal to before. All 6 fork credentials re-asserted intact after the PUT.

Per-line delta — exactly three lines:

| key | before | after |
|---|---|---|
| `assigned_to_id` | `"assigned_to_id": "{{ $('get-round-robin-assignee').item.json.assignee_id }}",` | `"assigned_to_id": {{ JSON.stringify($('get-round-robin-assignee').item.json.assignee_id ?? '') }},` |
| `message_id` | `"message_id": {{ ….message_id }},` | `"message_id": {{ JSON.stringify(….message_id ?? null) }},` |
| `source_message_id` | `"source_message_id": "{{ ….message_id }}",` | `"source_message_id": {{ ….message_id == null ? 'null' : JSON.stringify(String(….message_id)) }},` |

The other four keys (`contact_phone_number`, `agent_code`, `team_set_code`, `source_message_text`)
are **byte-identical** to §3a.

body after pass 2 (byte-exact as published; `sha256(jsonBody) = 101c71472e610b88…`):
```
={
    "assigned_to_id": {{ JSON.stringify($('get-round-robin-assignee').item.json.assignee_id ?? '') }},
    "contact_phone_number": {{ JSON.stringify($('When Executed by Another Workflow').first().json.contact_phone_number ?? '') }},
    "agent_code": {{ JSON.stringify($('When Executed by Another Workflow').first().json.agent ?? '') }},
    "team_set_code": {{ JSON.stringify($('When Executed by Another Workflow').first().json.team ?? '') }},
    "message_id": {{ JSON.stringify($('When Executed by Another Workflow').first().json.message_id ?? null) }},
    "source_message_id": {{ $('When Executed by Another Workflow').first().json.message_id == null ? 'null' : JSON.stringify(String($('When Executed by Another Workflow').first().json.message_id)) }},
    "source_message_text": {{ JSON.stringify($('When Executed by Another Workflow').first().json.input_message || '') }}
}
```

**Semantics, per key:**

- `assigned_to_id` → `JSON.stringify(x ?? '')`. **Empty string is CORRECT on missing** — the peer
  confirmed empty means *"round-robin server-side"*. It can never again be the literal `"undefined"`
  or `"null"`, and a hostile `"`/`\`/newline in a CRM-issued id no longer malforms the body.
- `message_id` → `JSON.stringify(x ?? null)`. Renders the **bare JSON `null`** when missing (the
  field is **optional** in the contract, so `null` is legal), the number otherwise. It is now
  structurally impossible for this key to emit a malformed slot.
- `source_message_id` → ternary, deliberately **not** `?? ''`. It renders a quoted string
  (`"1786538674000000"`) when present and a **bare JSON `null`** when missing, so the backend
  **rejects the create loudly** (it is a REQUIRED string in the contract) instead of writing a ticket
  with an empty identity. `== null` is load-bearing: it catches `undefined` **and** `null` but NOT
  `0` or `""` — both of those still render as real (quoted) values. Probe-asserted in both
  directions.

**Wire shape is unchanged for today's values — checked, not assumed.** `message_id` arrives from the
spine as `$('tf-message').first().json.message.messageId` (a respond.io numeric id) through a trigger
input declared `type: "any"`, so it is a number in practice: `JSON.stringify(1786538674000000)` emits
exactly the same bare digits the raw form did, and `JSON.stringify(String(x))` exactly the same
quoted literal. Re-rendered through the published stand-in against the recorded sample inputs and
byte-compared with `create-body-sample.json`: **identical, byte for byte** → the file was **NOT**
regenerated and the peer's replayed fixtures stay valid. (One deliberate behaviour change worth
naming: if `message_id` ever arrives as a *string*, `message_id` now renders quoted rather than bare.
That is still valid JSON and the backend's `BeforeValidator` coerces; the previous form would have
emitted an unquoted bare token, which for a non-numeric string is malformed JSON.)

**Every interpolation in this body now passes through `JSON.stringify` or the ternary**, i.e. every
`{{ }}` resolves to a non-empty, syntactically-complete JSON literal. That is the invariant to
re-check if anyone adds a key here: *no raw interpolation, ever* — not even one "whose source is
always present".

### 4. `if-in-working-hours` (if, `n8n-nodes-base.if` typeVersion 2.3) — **ADDED**
- sha `84997fcc6296` at the build PUT → **`722d7448d591`** after the fail-loud PUT (§4a, current).
  Node id `4a9c1e77-2b30-4c58-8f6d-91ae5d0b3c62`, position `[816, 32]` — both unchanged throughout.
- Condition (single, `combinator: "and"`, options `caseSensitive:true / typeValidation:"strict" / version:3` — mirrors the sibling If nodes), operator `{type:"boolean", operation:"true", singleValue:true}`, current `leftValue`:
  ```
  ={{ $('conversation-sla-tracking-create').first().json.in_working_hours ?? 'MISSING_IN_WORKING_HOURS' }}
  ```
- Keyed on the **CREATE RESPONSE's `in_working_hours`**, NOT on `get-round-robin-assignee.is_working_hours` (plan item 4).
- Wiring: `Call 'sub-add-comment-respond'` → `if-in-working-hours`; **TRUE (`main[0]`) → `return-assignee`**, **FALSE (`main[1]`) → `get-working-days`**. Unchanged by §4a.
- **Design intent — fail loud on a malformed create response, and it is now empirically true.**
  `typeValidation: "strict"` alone does NOT deliver this: the tester's matrix case (f)
  (`tests/runs/intervention-tickets-s32-pinmatrix.md`, execution **12210538**, top-level
  `status: "success"`) proved that with the *bare* `leftValue` an **absent** `in_working_hours`
  evaluates as FALSE and routes the out-of-hours copy silently — a wrong customer message in
  working hours with no error anywhere. The build PUT's annotation here ("a non-boolean
  `in_working_hours` errors rather than silently falling to FALSE") was **wrong for the
  key-absent case** and is corrected by §4a: strict validation only rejects a value that is
  *present and of the wrong type*, so the `?? 'MISSING_IN_WORKING_HOURS'` coalesce is what turns
  "absent" into a definite wrong-typed value for it to reject.

### 4a. `if-in-working-hours` — FAIL-LOUD pass (2026-08-12, third fork PUT)

Origin: the tester's V2 matrix **case (f) FAIL** (file above). Applied **identically** to the fork
`vUfFUDjLAuMaeQE6` and the throwaway `mTfA5b9TgHItWo2g` so the §6 equality proof in
`throwaway-build.md` still holds on this node.

- **sha** `84997fcc6296` → **`722d7448d591`** — *the same value on both workflows* (params
  byte-identical, and `id`/`position`/`type`/`typeVersion` identical too).
- **Only** `conditions.conditions[0].leftValue` changed. `operator`, `rightValue`, the condition
  `id`, `combinator`, `conditions.options` (still `typeValidation: "strict"`, `version: 3`) and the
  node's `options: {}` are untouched. `looseTypeValidation` is **not** stored on the node (it shows
  up only as a runtime default inside execution error dumps).

| | before | after |
|---|---|---|
| `leftValue` | `={{ $('conversation-sla-tracking-create').first().json.in_working_hours }}` | `={{ $('conversation-sla-tracking-create').first().json.in_working_hours ?? 'MISSING_IN_WORKING_HOURS' }}` |

Mechanism, and why this form: a missing key yields `undefined`, and n8n's strict boolean filter
accepts `undefined` (it coerces to `false`) — that is case (f)'s finding. `?? 'MISSING_IN_WORKING_HOURS'`
turns the absent/`null` case into a **definite string**, which strict boolean validation must
reject. `??` (not `||`) is deliberate: a real `false` is falsy but present, so it must still route
FALSE, and it does.

**Empirically verified on the THROWAWAY before the fork was touched** (mechanism verification only,
not the official matrix — the matrix is the tester's; the fork itself was NOT executed):

| run | `_case_fixture` | execution | result |
|---|---|---|---|
| (f)-shaped | `missing_in_working_hours` | **12211350** | `status: "error"`, `lastNodeExecuted: "if-in-working-hours"`, that node's `executionStatus: "error"` — `NodeOperationError: Wrong type: 'MISSING_IN_WORKING_HOURS' is a string but was expecting a boolean [condition 0, item 0]`. `get-working-days` and `…routed-to-pic1` **never executed**, so the wrong out-of-hours copy was never produced |
| (a)-shaped | `fresh_insert_in_hours` | **12211487** | TRUE unchanged: `main[0]`=1 item / `main[1]`=`[]` → `return-assignee` (`agent_assignee: "1096809"`) → `…routed-to-pic`; `get-working-days` absent |
| (c)-shaped | `fresh_insert_out_of_hours` | **12211589** | FALSE unchanged: `main[0]`=`[]` / `main[1]`=1 item → `get-working-days` → `…routed-to-pic1` with the `Tuesday - Friday` / `08:00 - 23:59` copy |

**Promote consequence the reviewer must weigh (not a defect — the chosen trade):** on live, a create
response without `in_working_hours` now **fails the execution** at this node. The contact has already
received the `…routed-to-pic2` ack, the conversation has been assigned (if it was unassigned), the
tracking row exists and the SLA comment is posted — but no final routing/out-of-hours message is
sent, and the failure is visible in n8n's execution list instead of being invisible. That is the
plan's stated intent (a bare-route response lacks the key ⇒ misconfiguration, not a runtime state)
and it is strictly better than delivering out-of-hours copy during working hours; it does mean a CRM
contract break degrades to "no final message" rather than "wrong message".

### 5. Deletions
| node | type | sha before | why |
|---|---|---|---|
| `comment-switch` | switch | `519d2200451b` | the A_W / A_NW split is superseded by `if-in-working-hours` on the create response |
| `Redis` | redis | `2c6b8725fad3` | the **`sorento-respond-assignee-queue` RPUSH** — out-of-hours queueing is gone; CRM owns the worklist now. Its `sorento-redis` credential goes with it |
| `Call 'sub-add-comment-respond'1` | executeWorkflow | `6acd5bafbce1` | the already-assigned tag comment; CRM notifies the assignee directly, and the surviving SLA-alert comment now covers both branches |

Reference safety for the deletions (checked against the full workflow JSON, all three forms of by-name read per LESSONS §63):
- zero `$('comment-switch')` / `$("comment-switch")` / two-hop handle binds anywhere;
- zero `$('Redis')` / `$("Redis")`;
- zero references to `Call 'sub-add-comment-respond'1`;
- **zero occurrences of the literal `sorento-respond-assignee-queue` anywhere in the published nodes + connections** (asserted on the re-fetched JSON, not on the sent body);
- removed connection entries: `comment-switch.main` (→ `'…respond'1`, → `Redis`), `Redis.main` (→ `get-working-days`), `Call 'sub-add-comment-respond'1.main` (→ `…routed-to-pic`). `get-working-days` and `…routed-to-pic` both keep an inbound edge from the new routing, so nothing is orphaned.
- `comment-switch`'s renamed outputs (`A_W`, `A_NW`) were not read by name anywhere.

### 6. No resolve call in this sub
Nothing to change here. Resolve-on-close lives in `respond-close-convo` (`-WkzJMQZHmsFQm6A2abLJ`) — a **separate, flip-time change, out of this slice**. Not touched.

### 7. Tidy — positions only (no `parameters` change, so promote-neutral)
| node | before | after |
|---|---|---|
| `if-in-working-hours` | (new) | `[816, 32]` |
| `return-assignee` | `[832, 32]` | `[1040, -64]` |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic` | `[1056, 224]` | `[1264, -64]` |
| `get-working-days` | `[608, 224]` | `[1040, 176]` |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic1` | `[832, 224]` | `[1264, 176]` |

No node was renamed. No generic names introduced (`if-in-working-hours` follows the `if-conversation-unassigned` convention).

---

## HARNESS — untouched, verified still present after the PUT

All five harness hunks carry an **identical param sha before and after**, i.e. this build did not disturb them. Every one of these is stripped at promote.

| node | sha (unchanged) | hunk |
|---|---|---|
| `chat?` (if) | `aab7ec62a352` | chat-console fork: `contact.chat_id` non-empty → chat push, else → `test-guard`. Sits between the trigger and `test-guard` (live wires trigger → `test-guard` directly) |
| `chat-escalation-push` (redis) | `b6f384e4bc9f` | RPUSH `chat:reply:{chat_id}` |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic` | `c92a80efe303` | `workflowId` repointed `aoydkG1dbItXR5jXFEQsP` → **`69RhomhiCH4bpY1w`** (`zz-sub-sendmsg-BLOBTEST`) |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic1` | `ac24ccda63c3` | same repoint |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic2` | `d4b3270a5ffe` | same repoint |
| `test-guard-record` (redis) | `45a71381e314` | egress-log payload wording (`guard: "human-intervention-sub"`) |
| `test-guard` (if) | `4c7e7ac0dcec` | shared with live — not a harness hunk, listed for completeness |

`chat?` → `test-guard` and the `When Executed by Another Workflow` → `chat?` edge are unchanged; the `test-guard` TRUE/FALSE fan-out is unchanged.

---

## Full post-build param-sha table (for the "is the change still present" gate)

Current values, i.e. **after the interpolation-hardening pass-2 PUT** (`3186d960-…`). Computed with
`sha256(json.dumps(node.parameters, sort_keys=True, ensure_ascii=False))[:12]` — `ensure_ascii=False`
is required, see *Reviewer notes* in the plan.

| node | sha256[:12] |
|---|---|
| `Assign or unassign a Conversation1` | `7669b6c4d7cb` |
| `Call 'sub-add-comment-respond'` | `c2cd407558ce` |
| `When Executed by Another Workflow` | `048ecba6eec7` |
| `chat-escalation-push` | `b6f384e4bc9f` |
| `chat?` | `aab7ec62a352` |
| `conversation-sla-tracking-create` | **`d8d6ac75fb2c`** (was `7a6db3f826ef` before the interpolation-hardening pass-2 PUT §3b; `086487442a3d` before the §3a hardening PUT) |
| `get-round-robin-assignee` | `b40f59333e24` |
| `get-working-days` | `47416000dd11` |
| `if-conversation-unassigned` | `50391b189ae0` |
| `if-in-working-hours` | `722d7448d591` (was `84997fcc6296` before the fail-loud PUT, §4a) |
| `return-assignee` | `ac0f05302a93` |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic` | `c92a80efe303` |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic1` | `ac24ccda63c3` |
| `sorento-sub-respond-sendmsg-respond-routed-to-pic2` | `d4b3270a5ffe` |
| `test-guard` | `4c7e7ac0dcec` |
| `test-guard-record` | `45a71381e314` |

## Resulting graph

```
When Executed by Another Workflow
  → chat?                                     [HARNESS]
      TRUE  → chat-escalation-push            [HARNESS, terminal]
      FALSE → test-guard
                TRUE  → test-guard-record     [fail-closed, terminal]
                FALSE → …routed-to-pic2 ("directing your enquiry" ack)
                          → get-round-robin-assignee
                            → if-conversation-unassigned   (is_already_assigned == false)
                                TRUE  → Assign or unassign a Conversation1 ─┐
                                FALSE → ──────────────────────────────────── ┴→ conversation-sla-tracking-create
                                                                                  → Call 'sub-add-comment-respond'
                                                                                    → if-in-working-hours
                                                                                        TRUE  → return-assignee → …routed-to-pic
                                                                                        FALSE → get-working-days → …routed-to-pic1
```
Zero disconnected nodes; every node reachable from the trigger; three terminal leaves (`chat-escalation-push`, `…routed-to-pic`, `…routed-to-pic1`) plus `test-guard-record`.

---

## Create-body sample (for the peer's dev-backend replay, plan P4)

File: `create-body-sample.json` (this directory) — the raw request body, directly replayable.

- Method / URL: `POST https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration`
- Auth: n8n generic **HTTP Header Auth** credential named **`crm-n8n-auth`** (id `mNsZWyU82NYV58k2`) — the same credential `get-round-robin-assignee` and `get-working-days` use. No secret reproduced here.
- Content-Type: `application/json`

Sample input used for the render:

| trigger / upstream field | value |
|---|---|
| `contact_id` | `437264483` |
| `agent` | `"CS"` |
| `team` | `"CS-TEAM"` |
| `contact_phone_number` | `"+60123456789"` |
| `message_id` | `9876543210` |
| `input_message` | `"I need help with my order SRT332-GM not delivered"` |
| `explicit_assignee_id` | `""` |
| `get-round-robin-assignee.assignee_id` | `"USR-0042"` |

Rendered body:
```json
{
    "assigned_to_id": "USR-0042",
    "contact_phone_number": "+60123456789",
    "agent_code": "CS",
    "team_set_code": "CS-TEAM",
    "message_id": 9876543210,
    "source_message_id": "9876543210",
    "source_message_text": "I need help with my order SRT332-GM not delivered"
}
```

Notes for the peer:
- `message_id` is emitted **unquoted** (numeric `9876543210`); `source_message_id` is the **same value as a quoted string**. Both are intentional per the locked contract.
- `explicit_assignee_id` does **not** appear in this body — it is consumed one node earlier by `get-round-robin-assignee` as `preferred_assignee_id`; empty string means "no explicit preference, use round-robin", which is what produced `USR-0042`.
- `source_message_text` is produced by `JSON.stringify(input_message || '')`, so a message containing quotes/newlines stays valid JSON, and an absent `input_message` renders `""` rather than `null`.
- **Unchanged by the 2026-08-12 hardening pass (§3a) — checked, not assumed.** `contact_phone_number`,
  `agent_code` and `team_set_code` are now `JSON.stringify`'d, but for these sample values
  (`"+60123456789"`, `"CS"`, `"CS-TEAM"`) `JSON.stringify` emits exactly the same quoted literal the
  raw form did. Re-rendered through the hardened published stand-in body and byte-compared against
  `create-body-sample.json`: **identical, byte for byte** (and deep-equal as JSON). The file was
  therefore **not regenerated** and the peer's replayed fixtures remain valid. A hostile value
  (`"`, `\`, newline, `null`) is where the two forms diverge — and that is the point of the fix.
- **Unchanged by the 2026-08-16 interpolation-hardening pass 2 (§3b) — checked, not assumed.**
  `assigned_to_id`, `message_id` and `source_message_id` now go through `JSON.stringify` / a ternary,
  but for these sample values (`"USR-0042"`, `9876543210`) they emit exactly the same literals the raw
  forms did. Re-rendered through the pass-2 published stand-in body and byte-compared against
  `create-body-sample.json`: **identical, byte for byte**. The file was therefore **not regenerated**
  (second time running; the check is `cmp`, not inspection). It diverges only on a MISSING value —
  `message_id` absent now yields a bare `null` for both id keys instead of a malformed body / an empty
  string, and a missing `assignee_id` yields `""` instead of `"undefined"`.
- What n8n needs back: the response must carry **`in_working_hours`** (consumed by `if-in-working-hours`), **`initiated_at` / `due_at` / `due_at_resolution`** (consumed by the SLA-alert comment), and **`assigned_to`** (consumed by `return-assignee`). Please also return an `already_active: true` retry example — that is UAC case (e).

---

## Validation performed

### Interpolation-hardening pass-2 PUT (2026-08-16, §3b) — re-verified after the write

Order was deliberate: **throwaway first, then the fork** — the stand-in must render the fork's bytes,
so the mirror lands first and the equality gate is re-proved on both published artifacts afterwards.

- Pre-flight drift gates (the script aborts before any write): fork at
  `16eadb1e-157b-419a-9441-e6510c40f4fc`, throwaway at `f7887fc2-2808-4b87-8fe1-9f11a40d304b`
  (⚠️ **not** the `2d1c03b3-…` recorded in §12 of `throwaway-build.md` — the throwaway had since moved
  on a fixture refresh; the gate was re-pinned to the value a fresh GET actually showed rather than
  the value the doc predicted), `versionId == activeVersionId` on both, and the node's current
  `jsonBody`/`jsCode` byte-compared against the recorded pre-edit strings. The three live ids
  (`rrYXzE61gCNUck_zmXe-G`, `9qVyfUxmRQqrpGRMDLRuz`, `-WkzJMQZHmsFQm6A2abLJ`) are a hard-refused
  target set in the script itself.
- Both PUTs HTTP **200**, bodies `{name, nodes, connections, settings}` only, derived from a fresh
  REST GET of the same workflow (LESSONS §55), `settings.binaryMode` / `settings.timeSavedMode`
  stripped, `pinData` never echoed, zero trailing whitespace in any string parameter.
  Fork `16eadb1e-…` → **`3186d960-2c39-4bfd-a3b1-9e8d4d5e0295`**;
  throwaway `f7887fc2-…` → **`386caa11-7668-4e7b-8ca2-f386f211c6e8`**.
- On a re-GET of each: `versionId == activeVersionId`, `activeVersion.nodes == nodes`, `connections`
  deep-equal to before, node count still 16 on both, and the published `jsonBody` / `jsCode`
  byte-equal to the intended string.
- **Param-sha delta over all 16 nodes, both workflows: exactly ONE node changed** —
  `conversation-sla-tracking-create` (fork `7a6db3f826ef` → `d8d6ac75fb2c`; throwaway
  `20c67a6b2079` → `965659b37b5b`). All 15 others byte-identical.
- Fork credentials re-asserted after the PUT (collateral check, LESSONS §55): 6/6 intact —
  `sorento-api` ×1, `crm-n8n-auth` ×3 (incl. this node's `mNsZWyU82NYV58k2`), `sorento-redis` ×2.
- **Equivalence gate re-proved on the two published artifacts**: fork `jsonBody` minus the leading
  `=`, with `{{ x }}` rewritten to `${ x }`, is **string-equal** to the stand-in's
  `_rendered_body_raw` template literal. Shown able to go red by a control run with one character
  altered on the fork side → MISMATCH.
- **Live untouched, re-checked after both PUTs**: `rrYXzE61gCNUck_zmXe-G` `5018a189-…`
  (`updatedAt 2026-07-22T01:27:32.239Z`), spine `9qVyfUxmRQqrpGRMDLRuz` `469e7259-…`
  (`updatedAt 2026-08-11T16:23:58.052Z`), `-WkzJMQZHmsFQm6A2abLJ` `4a2e963d-…`.
- Offline probe against the published bodies: **197/197 PASS, 0 FAIL**. Red-proof against a
  reconstructed pre-fix body: **30 FAIL** (see `throwaway-build.md` §13).
- **Not performed:** no executions in this seat (tester's slice), no promote.

### Fail-loud PUT (2026-08-12, §4a) — re-verified after the write

Order was deliberate: **throwaway first, executed, then the fork** — the mechanism was proven to
error before the fork was written to at all.

- Pre-flight drift gates (the script aborts on mismatch, before any write): fork at
  `ceb72e9e-d708-4f35-b5ec-9d18286d316d`, throwaway at `040b8fed-912e-4a53-9da9-3ef953136fe7`, and
  the node's current `leftValue` byte-compared against §4's recorded string. The live sub id is a
  hard-refused target in the script itself.
- Both PUTs HTTP **200**. Fork `ceb72e9e-…` → **`16eadb1e-157b-419a-9441-e6510c40f4fc`**;
  throwaway `040b8fed-…` → **`2d1c03b3-fa63-44c9-8ff3-9c045e62200e`**.
- On a re-GET of each: `versionId == activeVersionId`, `activeVersion.nodes == nodes`,
  `activeVersion.connections == connections`, `connections` deep-equal to before the PUT, node
  count still 16, published `leftValue` byte-equal to the intended string.
- **Exactly one node changed on each** (`if-in-working-hours`); the other 15 param shas are
  byte-for-byte the values in the table below (fork) and in `throwaway-build.md` §6 (throwaway).
- **Fork and throwaway `if-in-working-hours` are byte-identical** — same `parameters` (sha
  `722d7448d591` both), same `id`, `position`, `type`, `typeVersion`.
- No trailing whitespace on any line of any string parameter in either PUT body (LESSONS §58b).
- Credential collateral: fork **6/6** intact and unchanged (`crm-n8n-auth` ×3, `sorento-redis` ×2,
  `sorento-api` ×1); throwaway **2/2** (both `sorento-redis`) — no credential gained or lost.
- Throwaway **S8 sweep re-run** on the fresh re-GET over the whole JSON incl. `activeVersion`:
  `@respond-io/n8n-nodes-respond-io.respondio` **0**, `n8n-nodes-base.httpRequest` **0**,
  `@n8n/n8n-nodes-langchain.memoryPostgresChat` **0**; type inventory unchanged at 6 code · 4 if ·
  3 executeWorkflow · 2 redis · 1 executeWorkflowTrigger.
- `sorento-respond-assignee-queue`: **0** occurrences in either workflow's re-fetched JSON.
- Live `rrYXzE61gCNUck_zmXe-G` re-checked after both PUTs: `versionId` still
  `5018a189-22df-4cb9-aa89-fa509377abe9`, `updatedAt` still `2026-07-22T01:27:32.239Z` — **not
  touched**. (It has no `if-in-working-hours` node at all; this If is new in the rework.)
- Executions: **3, on the throwaway only** (12211350 / 12211487 / 12211589, §4a table). Egress from
  them is the sanctioned BLOBTEST sink only — 1 sub-execution for the (f) run (the ack; the run dies
  before the reply leg) and 2 each for the (a)/(c) runs.

### Hardening PUT (2026-08-12, §3a) — re-verified after the write

- Pre-flight drift gate: fork was at `fdc154b5-cb33-416c-a468-517fff59dc5e` (the recorded state) —
  the script aborts if not. Pre-state gate: the node's `jsonBody` was byte-compared against §3's
  recorded body before editing; a mismatch aborts.
- `versionId == activeVersionId == ceb72e9e-d708-4f35-b5ec-9d18286d316d` on a **re-GET after the
  PUT**; `activeVersion.nodes == nodes`; `connections` deep-equal to before; node count still 16.
- **Exactly one node changed** (`conversation-sla-tracking-create`); the other 15 param shas are
  byte-for-byte the values in the table below.
- Published `jsonBody` byte-compared against the intended string: identical.
- No trailing whitespace on any line of any string parameter in the PUT body (LESSONS §58b).
- Credential collateral: **6/6** credentialed nodes intact and unchanged after the PUT
  (`crm-n8n-auth` ×3, `sorento-redis` ×2, `sorento-api` ×1).
- Zero occurrences of `sorento-respond-assignee-queue` in the whole re-fetched JSON (incl.
  `activeVersion`) — **re-asserted**.
- Live `rrYXzE61gCNUck_zmXe-G` re-checked after the PUT: `versionId` still
  `5018a189-22df-4cb9-aa89-fa509377abe9`, `updatedAt` still `2026-07-22T01:27:32.239Z` — **not
  touched**. (Its create node still carries the old URL and the raw-interpolated body, confirming
  the latent defect is a live property this diff fixes on promote.)

### Build PUT (unchanged, for provenance)

- `versionId == activeVersionId == fdc154b5-cb33-416c-a468-517fff59dc5e` on a **re-GET after the PUT** (agent-death landmine, LESSONS §24/§64a). MCP `get_workflow_details` independently confirms the same pair.
- Round-trip byte check: re-fetched `nodes` and `connections` are **identical** to the PUT body; `activeVersion.nodes` identical to `nodes`.
- Graph integrity (asserted on the published JSON): every connection source is a real node; **zero dangling edges**; zero disconnected nodes; `conversation-sla-tracking-create` inbound == exactly `{Assign or unassign a Conversation1, if-conversation-unassigned}`.
- `if-conversation-unassigned` has **exactly one** condition.
- **Zero** occurrences of `sorento-respond-assignee-queue`; **zero** references to any of the three deleted nodes.
- No trailing whitespace on any line of any string parameter in the PUT body (checked programmatically before sending).
- Credential collateral: 6/6 surviving credentialed nodes intact after the PUT.
- No secret literals in either snapshot (scanned for `x-api-key`/`apiKey`/`Authorization`/`api_key` literals; none — all HTTP nodes use the `crm-n8n-auth` credential reference).
- Live `rrYXzE61gCNUck_zmXe-G` re-checked after the PUT: `versionId` still `5018a189-…`, `updatedAt` still `2026-07-22` — **not touched**.

### Not performed / limitations
- **`validate_workflow <id>` is not available on this MCP surface.** This server's `mcp__n8n-mcp__validate_workflow` validates **n8n Workflow SDK source code** (`{code: string}`) and takes no workflow id; there is no id-based validator. The structural assertions above were run in its place. `get_workflow_details` returned no validation/warning block (it does not validate) — only the expected advisory that an `executeWorkflowTrigger` sub has no production trigger.
- **No executions run against the fork or live, ever.** The build and hardening PUTs ran none at
  all; the fail-loud pass (§4a) ran **3 on the THROWAWAY only**, scoped to proving the `??`
  mechanism errors and that true/false still route as before. The official V2 matrix (a)–(f) and the
  V3 fail-closed run remain the tester's slice and must be re-run against
  `mTfA5b9TgHItWo2g` @ `2d1c03b3-…`, whose `if-in-working-hours` is byte-identical to the fork's.
- The `in_working_hours` FALSE path and the `already_active: true` retry path were unexercised by the
  build itself; FALSE is now covered by the (c)-shaped run 12211589, retry still only structurally.
