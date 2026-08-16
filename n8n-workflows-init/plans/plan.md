# Safe Automated Test Harness — `sorento-consume-main`

Status: PLAN (planner deliverable). No workflow has been edited; no execution has been run.
Author: planner agent. Source of truth for node facts: live n8n via `get_workflow_details`
(`9qVyfUxmRQqrpGRMDLRuz`, `tWP33QOFT7SxThfT`, `Fss5aAaXthJSWpZCgKiKR`, `rrYXzE61gCNUck_zmXe-G`).

---

## 1. Goal + hard safety constraint

**Goal.** Give us a repeatable, mostly $0 way to test changes to the chatbot workflow
`sorento-consume-main` (74 nodes, id `9qVyfUxmRQqrpGRMDLRuz`) before they ship to prod, by
driving the dev clone `sorento-consume-main copy 2` (id `txiPzSxy3Pclsz6v`) through its
`executeWorkflowTrigger`, then asserting on node outputs.

**HARD SAFETY CONSTRAINT (non-negotiable).** A test run must **NEVER**:
- send a WhatsApp message or comment to a real respond.io contact;
- assign / reassign a conversation, post an SLA tracking row, or post a PIC comment
  (each of these triggers an email/WhatsApp notification ripple to staff);
- write conversation variables, mutate contact custom fields, or create any CRM record.

Every design choice below exists to preserve that. The enforcement mechanism is a
**central kill-switch (`test_mode`) read at 7 guard points inside the workflow graph**, where
each egress node *no-ops and records* what it would have done instead of performing it.
CRM **reads** against prod are allowed (branch control depends on them); **writes** are not.

---

## 2. Kill-switch architecture

### 2.1 Where `test_mode` is stamped and read — and the #1 reliability risk

> **#1 RISK — the central-state blob does NOT thread to the egress nodes.**
> The locked decision assumed `test_mode` could ride "inside the central-state object that
> `central-exchange` builds and `compile-current-state` carries." **Investigation shows this is
> false and would silently drop the flag.** In `9qVyfUxmRQqrpGRMDLRuz`:
> - `central-exchange` (code) only parses the parser-LLM JSON into `output`. `compile-current-state`
>   (code) **rebuilds a brand-new object** `{ variables:{…}, user_response, quick_reply }` — it does
>   not carry any `test_mode`, and most egress nodes never read `compile-current-state` at all.
> - **Every egress node reaches back to specific *named* upstream nodes**, not a threaded item:
>   - `sorento-sub-respond-sendmsg-respond` reads `$('set-ran-query-formulator')`, `$('tf-message')`,
>     `$('sorento-sub-respond-findcontact-respond')`.
>   - `save-session-vars` does `JSON.stringify($json)` of whatever item arrives at it.
>   - `Call 'sub-human-intervention'` reads `$('sorento-sub-respond-findcontact-respond')` and
>     `$('Call 'sub-query-reformulator'')`.
>   - `update-human-intervened` reads `$json.id`.
>   - `send-message-files/images/video` POST to `https://api.respond.io/.../id:{{ $('…findcontact…').id }}`.
>   Because a brand-new blob is built in `compile-current-state` and the egress nodes ignore it, a
>   `test_mode` placed on that blob is **dropped before it reaches any guard.**

**Decision (SUPERSEDED by §3 — kept for rationale).** The blob doesn't thread, so trigger-anchoring
was the first fix. But MCP `execute_workflow` cannot pass inputs to an `executeWorkflowTrigger`, so the
trigger node is also empty at run time. **Final design (§3): control rides in the redis item and the
clone is fail-closed** (inline guards always block; sub calls pass `is_test=true` literal). Do NOT read
any safety flag from `$('When Executed by Another Workflow')`. The notes below about the sub call sites
already declaring `is_test`/`test_run_id` (currently `removed:true`) still apply — those inputs are now
set to literals/redis-item values, not trigger references.

### 2.2 The egress log (where "what it would have done" is recorded)

A single in-memory array on one item will NOT survive, because egress happens across three separate
workflow executions (consume-main + the send sub + the human-intervention sub), and inline guards
fire on different branches of the same run. Use **two complementary sinks**:

1. **Per-execution node output (primary, for inline guards).** Each inline guard, when `TEST`, emits
   its record as the node's own output item instead of performing the side effect, e.g. the guard
   node returns `{ _test_egress: { guard, action, blocked:true, would_send|would_write, payload } }`.
   The tester reads these directly from `get_execution(includeData:true)` node-output data.
2. **Redis test-egress list (secondary, cross-workflow aggregation).** Redis is already a stack
   dependency and is **not** a real-world side effect. Each guard (including the ones inside the two
   sub-workflows) `RPUSH`es to `test:egress:{test_run_id}` a JSON record:

```jsonc
{
  "guard": "sendmsg-sub | human-intervention-sub | update-human-intervened | save-session-vars | send-message-files | send-message-images | send-message-video",
  "kind": "would_send | would_write",
  "target": "respondio:contact:437264483 | crm:conversation-variables:PUT | respondio:assign | crm:sla-tracking",
  "payload": { /* the exact body/args the node would have used */ },
  "test_run_id": "…",
  "ts": "…"
}
```

The tester pops/reads `test:egress:{test_run_id}` after the run and asserts on it. Using a
`test_run_id`-scoped key keeps runs isolated and never collides with the prod `main-message-list`.

### 2.3 The 7 guard points — how each no-ops + records

| # | Guard (node / workflow)                                   | Type                         | Live side effect today                              | Guarded behaviour when `TEST` |
|---|-----------------------------------------------------------|------------------------------|-----------------------------------------------------|-------------------------------|
| a | **shared send sub** `aoydkG1dbItXR5jXFEQsP` (entry guard, 1 place) | executeWorkflow target | POSTs WhatsApp to the contact; covers all sendmsg callers (`…respond`, `respond2/3/4/5`, `…transcribed-message` in consume-main + `…routed-to-pic/1/2` inside the human-intervention sub) | At the **top** of this sub: if input `test_mode` true → `RPUSH` `{guard:'sendmsg-sub', would_send:{contact_identifer,message,result_set}}` and return a stub success item; never hit the respond.io send node. One guard covers all callers. |
| b | **shared human-intervention sub** `rrYXzE61gCNUck_zmXe-G` (entry guard, 1 place) | executeWorkflow target | assignment + SLA POST + PIC comments + assignee-queue push + PIC sends | At the **top** of this sub (before `get-round-robin-assignee`): if `is_test`/`test_mode` true → `RPUSH` `{guard:'human-intervention-sub', would_write:{contact_id,agent,team,current_assignee}}` and return a stub. Short-circuiting here blocks ALL of: `Assign or unassign a Conversation1` (respondio assign), `conversation-sla-tracking-create` (POST sla), `Call 'sub-add-comment-respond'`/`'1` (id `2l8egTLJbyGOPvG-DbtDX`, PIC comment), the `Redis` push to `sorento-respond-assignee-queue`, and the routed-to-pic sends. |
| c | inline **`update-human-intervened`** (`@respond-io/...respondio`, UPDATE_CONTACT, sets `is_human_intervened`) | respond.io write | mutates contact custom field | Precede with an IF on `test_mode`; on TEST, route around the node to a code node that `RPUSH`es `{guard:'update-human-intervened', would_write:{contactId,fields}}`. |
| d | inline **`save-session-vars`** (`httpRequest` PUT `…/external/conversation-variables/{id}`) | CRM write | persists session vars to prod CRM | IF `test_mode` → skip the PUT, `RPUSH` `{guard:'save-session-vars', would_write:{contact_id,body}}`. (This is the only write on the happy path.) |
| e | inline **`send-message-files`** (`httpRequest` POST `api.respond.io/.../message`) | respond.io send | sends file attachment to contact | IF `test_mode` → skip POST, `RPUSH` `{guard:'send-message-files', would_send:{url,body}}`. |
| f | inline **`send-message-images`** (same) | respond.io send | sends image | same pattern |
| g | inline **`send-message-video`** (same) | respond.io send | sends video | same pattern |

**Mechanic for the inline guards (c–g).** Do **not** put logic inside the egress node. Insert an
`IF (test_mode)` immediately upstream; the TRUE branch goes to a small code node that records to the
egress log (and mimics the node's normal output shape so downstream nodes still run), the FALSE branch
goes to the real egress node. This keeps the egress node byte-identical to prod, so the node-diff the
reviewer sees is "added IF + record", never "modified the live send".

### 2.4 `get-presigned-url` — confirmation (the "anything else?" check)

`get-presigned-url` is `httpRequest POST https://fe-sorento.foundryx.my/api/v1/external/presigned-url`.
It **returns** a signed URL; it does not message a contact and does not mutate CRM state — it is a
**READ**. **Finding: no guard needed.** Leave it live so the attachment branch produces realistic
URLs for structural assertions. (Recorded as the answer to "confirm whether get-results needs
anything" on the egress side.)

### 2.5 Parser bypass (0-cost deterministic path)

The parser LLM in consume-main is `Basic LLM Chain` → `OpenAI Chat Model` (**`gpt-4.1-mini`**) →
`central-exchange`. Its prompt is built by `construct-user-prompt` and fed to `Basic LLM Chain.text`.

Bypass rule (coder implements as an IF in front of the chain):

```
IF  test_mode === true  AND  payload.mock_parser_output present
THEN feed payload.mock_parser_output straight into `central-exchange` (which already tolerates an
     object on input.output) and SKIP `Basic LLM Chain` + `OpenAI Chat Model`.
ELSE run the real chain (only when scope = parser).
```

`central-exchange`'s first branch (`if (input.output && typeof input.output === 'object')`) already
accepts a pre-parsed object, so the bypass injects `{ output: <mock_parser_output> }`.

> Note: `compile-current-state` and several branch nodes (`disallowed-entity-gate`,
> `construct-user-prompt`, the `Call 'sub-get-results'` input) read the parser via
> **`$('Call 'sub-query-reformulator'')`**, a *separate* `executeWorkflow`, not `central-exchange`.
> So a faithful deterministic test must inject the mock at **both** entry points the code reads from,
> or (preferred) also stub `sub-query-reformulator` under `test_mode`. The coder must confirm whether
> `sub-query-reformulator` is itself an LLM call (it would be a third token sink) — see §6c.

---

## 3. Test injection — control rides in the redis item (NOT the trigger payload)

**Why not the trigger payload.** MCP `execute_workflow` cannot pass custom JSON inputs to an
`executeWorkflowTrigger` (its `inputs` only accept chat/form/webhook). So nothing safety-relevant may
depend on `$('When Executed by Another Workflow').…` — at run time those fields are undefined. ALL
control + message data therefore travels inside the single redis item the tester pushes.

**Mechanism.** The clone's `Schedule Trigger` is **deleted** (clone must have ZERO schedule trigger,
re-confirm each cycle) and `redis-pop-main-message-list` is repointed to pop the separate list
`main-message-list-test` (never the shared prod `main-message-list`). Per case the tester:
1. `RPUSH main-message-list-test <item>` (shape below), then
2. `execute_workflow(txiPzSxy3Pclsz6v)` (no inputs needed — the run pops the item), then
3. `get_execution(includeData:true)` + read redis `test:egress:{test_run_id}` → assert.

**Pushed item** (control fields are siblings of `message`/`contact`, readable at
`$('redis-pop-main-message-list').first().json.message.<field>`):

```jsonc
{
  "message": { /* whatsapp event; tf-message reads .message.message */ "text": "<user text>" },
  "contact": { /* respond.io contact fixture: id, phone, assignee.id, customFields */ },
  "messageId": "test-<test_run_id>",
  "replyTo": null,

  "test_run_id": "uac-happy-001",        // scopes redis egress list test:egress:{id}
  "scope": "deterministic",              // deterministic | parser | get-results (see §8)
  "mock_parser_output": { /* … */ },     // present ⇒ parser LLM bypassed (0 token). Omit for scope=parser
  "mock_reformulator_output": { /* … */ }// present ⇒ reformulator (gpt-5.4-mini) bypassed. Omit for live parser
}
```

**FAIL-CLOSED clone (safety invariant).** Because `execute_workflow` can't be trusted to set a flag,
the clone is made structurally incapable of real egress, independent of any field:
- inline egress guards (c–g) **always** take the record/block branch — the real send/write nodes are
  unreachable on the clone;
- every executeWorkflow call site on the clone passes **`is_test = true` (literal)** to the shared subs
  (`aoydkG1…`, `rrYXzE61…`, `XTODTw…`), so the published subs' guards always short-circuit;
- `mock_*`, `test_run_id`, `scope` are read from the redis item and affect only LLM bypass + log
  labelling, never the safety branch.
Live `sorento-consume-main` is unaffected (it passes no `is_test` → subs' real branch).

---

## 4. Agent pipeline I/O contracts

State passes as **files under `tests/`** (git-tracked) plus the live n8n execution store + the Redis
egress list. Roles are sequential; each consumes the previous role's files.

### planner → (this document)
- **Inputs:** the locked decisions, live workflow facts.
- **Outputs:** `plans/plan.md` (this file), `tests/UAC.md`, and per-change a `scope:` tag (§8).
- **Done when:** both docs exist, all 7 guards + parser-bypass + payload schema are specified, and
  the three verification tasks (§6) are defined.

### coder
- **Inputs:** `tests/plan.md`, `tests/UAC.md`, the change request (with its `scope:` tag).
- **Works on:** `txiPzSxy3Pclsz6v` (copy 2) ONLY. Never `9qVyfUxmRQqrpGRMDLRuz`.
- **Outputs:**
  - the guard edits (7 guards + parser-bypass + trigger-payload message injection) on copy 2;
  - a human-readable **node-diff** written to `tests/diffs/{change-id}.md` (node names + before/after
    of each changed node) for the reviewer;
  - the workflow JSON re-snapshotted into the subrepo (see §5 / §7).
- **Done when:** copy 2 validates (`validate_workflow`), the guard nodes read `test_mode` from the
  trigger (consume-main) or input (subs), and a dry structural self-check passes.

### tester
- **Inputs:** `tests/UAC.md`, the case files `tests/cases/*.json`, parser fixtures
  `tests/fixtures/parser/*.json`, contact fixtures `tests/fixtures/contacts/*.json`.
- **Mechanism (mandatory):** for each case →
  `execute_workflow(txiPzSxy3Pclsz6v, <case payload>)` →
  `get_execution(executionId, includeData:true)` → read node outputs + read
  `test:egress:{test_run_id}` from Redis → assert against UAC.
- **Tier routing by `scope`:** `deterministic` → require `mock_parser_output`, expect the parser LLM
  bypassed; `parser` → omit mock, expect `Basic LLM Chain`/`OpenAI Chat Model` to have executed;
  `get-results` → always allow the real get-results call, assert **structurally** (shape / required
  fields / branch), never exact text.
- **Outputs:** `tests/runs/{test_run_id}.json` (per-case pass/fail + the egress log + which nodes
  executed) and a roll-up. Optionally insert into the `test_results` table
  (`test-framework/001_create_test_results.sql`).
- **Done when:** every UAC case has a verdict AND the shared safety checklist (UAC §0) passes for
  **every** case. Any real egress observed = hard fail, halt.

### reviewer
- **Inputs:** `tests/diffs/{change-id}.md`, the copy-2 JSON, `tests/runs/*`, this plan + UAC.
- **Reviews:** (1) the node-diff for correctness and that no egress node was structurally altered
  away from "guarded passthrough"; (2) plan adherence (all 7 guards present + anchored on the
  trigger, parser-bypass correct, message injection off the shared queue); (3) **re-confirms
  zero-egress** from the run logs (egress list shows only `blocked:true`; no respond.io 2xx send; no
  assignment/SLA/PUT writes).
- **Outputs:** `tests/reviews/{change-id}.md` with APPROVE / REQUEST-CHANGES + the promote checklist.
- **Done when:** approved AND zero-egress re-confirmed. Only then may the user promote.

---

## 5. Cycle workflow (with sync + promote)

```
STEP 0  SYNC = RE-CLONE live (DECISION: wholesale, not in-place patch — MCP has no full-replace
        and the SDK can't import raw JSON, so do a lossless UI Duplicate of live):
        - In the n8n UI, Duplicate `9qVyfUxmRQqrpGRMDLRuz` → fresh clone (new ID), inactive,
          enable "Available in MCP". This becomes the new TEST clone; archive the old copy2.
        - On the clone, via MCP: DELETE the `Schedule Trigger` node (clone must have ZERO schedule
          trigger so it can never poll the shared `main-message-list`), then rewire
          `When Executed by Another Workflow → redis-pop-main-message-list-test → tf-message` and point
          `findcontact-respond` at `…-test` (§3). VERIFY zero schedule trigger before any further edit.
        - Then RE-APPLY the harness guard layer (guards live only on the clone).  [RISK, §7]

STEP 1  CODE     coder edits the clone (scaffolding + guards present from step 0), implements the change.
STEP 2  TEST     tester runs all applicable UAC cases via execute_workflow + get_execution;
                 asserts node outputs + Redis egress list. Zero-egress is a gate.
STEP 3  REVIEW   reviewer checks node-diff + plan adherence + re-confirms zero-egress.
STEP 4  SNAPSHOT export copy2 (or the promoted live) into the subrepo via
                 scripts/export-and-stage.sh, git diff, commit.   (see §7 — snapshot note)
STEP 5  PROMOTE  (manual, USER-GATED). Strip the harness guard layer, take the reviewed
                 node-diff, apply to live 9qVyfUxmRQqrpGRMDLRuz. Deploy via scripts/deploy.sh
                 (backup-first, cred-remap, PUT, re-activate).
                 LIVE is ACTIVE prod (1s redis poll) — never edited mid-cycle.
```

**Promote is never automatic.** The reviewed change is a diff on the *business logic*, not on the
guard scaffolding; the guards stay on copy2. The user runs `scripts/deploy.sh 9qVyfUxmRQqrpGRMDLRuz`
(or the staged file) after approval.

---

## 6. Verification tasks

### (a) `test_mode` survives to all 7 guards
Run one happy-path case and one escalation case with `test_mode:true`; from
`get_execution(includeData:true)` assert: (i) `When Executed by Another Workflow.json.test_mode===true`;
(ii) each reachable guard node emitted `blocked:true` (or its IF took the record branch); (iii) the
Redis `test:egress:{id}` list contains exactly the guards on that branch and **nothing** marks a real
send/write. Specifically prove the flag reaches the two sub-workflows by asserting the
`Call 'sub-human-intervention'` / sendmsg-sub inputs carried `is_test/test_mode === true` in the
execution data.

### (b) `tool-filter` never emits the MCP write tool `crm_it_support_ticket_create`
**Finding from planning (recorded):** this is **NOT structurally guaranteed today.**
- `tool-filter` (consume-main) is effectively a **passthrough**: it computes `hasProduct` but
  **does not use it** and returns `{ tools: raw_tools }` where
  `raw_tools = $("Execute 'sub-get-rag'").first().json.tools` unchanged.
- `sub-get-rag` (`tWP33QOFT7SxThfT`) derives tool names from pgvector:
  `SELECT … FROM embedding_chunks WHERE source_type='mcp_tool' AND source_id LIKE '%'||domain||'%'`,
  top-5 by cosine similarity; the final code node sets `name = source_id.split('::')[1]`.
- `sub-get-results` (`Fss5aAaXthJSWpZCgKiKR`) constrains tools to exactly the passed name:
  `MCP Client` uses `include:"selected", includeTools: {{ trigger.tool.trim().split() }}`, and the
  **live executed path** `MCP Client1` calls the single tool `{{ trigger.tool.trim() }}` directly.
- Therefore `crm_it_support_ticket_create` is excluded **only** if it is not indexed as an `mcp_tool`
  chunk whose `source_id` domain-substring matches a queried `domain_hint` and ranks top-5 — a
  **data-dependent** property of `embedding_chunks`, not a code guarantee.

**Verification step (required):**
1. Query `embedding_chunks` for any `source_type='mcp_tool'` row whose
   `split('::')[1] = 'crm_it_support_ticket_create'`; record whether it exists and under which domain.
2. Across every happy-path / get-results UAC run, assert from execution data that the resolved `tool`
   input passed to `Call 'sub-get-results'` (`{{ $json.name }}`) is in a READ allowlist and **never**
   equals `crm_it_support_ticket_create`.
3. **DECISION (final): verify-only, no code change.** The user opted to leave `tool-filter` as-is.
   No `WRITE_TOOL_DENYLIST`. Enforcement is purely by assertion: steps 1–2 above MUST run on every
   happy-path / get-results case, and a resolved `tool` outside the READ allowlist (or equal to
   `crm_it_support_ticket_create`) is a HARD FAIL. **Open risk accepted:** a future indexed write tool
   that ranks top-5 reopens the hole — the per-run allowlist assertion is the only backstop (§7.4).

### (c) The two LLM nodes are the only token sinks
Expected sinks: consume-main `OpenAI Chat Model` (`gpt-4.1-mini`, parser) and sub-get-results
`OpenAI Chat Model` (`gpt-5.4-mini`, agent).
**Findings to verify (two surprises):**
- **get-results agent may be DEAD today.** In live `Fss5aAaXthJSWpZCgKiKR`, the trigger connects to
  `entity-ids-transformer → MCP Client1 → output-structurer` (deterministic single MCP call). The
  `AI Agent` (gpt-5.4-mini) node has **no incoming `main` connection** (orphaned) and its output goes
  to `output_exchange`. So as wired, **get-results spends ZERO LLM tokens** and the gpt-5.4-mini sink
  is not on the path. Verify which path copy2 executes; if the agent is genuinely orphaned, the
  "always real micro-cost" assumption is moot (cost is $0) and assertions should target
  `output-structurer`'s envelope, not `output_exchange`.
- **`sub-query-reformulator` is an unaudited possible third sink.** consume-main reads the parser via
  `$('Call 'sub-query-reformulator'')` in many nodes; confirm whether that sub is itself an LLM call.
  If so, deterministic tests must stub it too (else it spends tokens and is nondeterministic). List as
  a coder task; planner did not open that sub.
Assert from `get_execution` that, for `scope:deterministic`, neither `Basic LLM Chain` nor any LLM
node executed; for `scope:parser`, only the consume-main parser ran; for `scope:get-results`, only
the get-results LLM (if live) ran.

---

## 7. Prerequisites & open risks

1. **Partial / ask-for-access contact = TBD.** UAC §6 (ask-for-access) needs a dev contact whose
   `contact-access-types/active` + `access-agent/check` yield a partial/clarification result. Jayson
   full-access `437264483` and no-access `457216562` are known; the partial one must be created/found
   in respond.io + Sorento before that case can run. **Prerequisite, blocks UAC §6.**
2. **copy2 is `active:true`.** It reports `triggerCount:0`, but confirm its `Schedule Trigger` is
   disabled so it is not also polling the shared `main-message-list` (which would steal prod messages
   or process stale ones). Step 0 of every cycle must re-verify this.
3. **Send sub `aoydkG1dbItXR5jXFEQsP` internals are not readable via MCP** ("not available in MCP").
   The coder must enable MCP access on its card (or open it in the UI) to add the entry guard. Until
   then guard (a) cannot be implemented. **Prerequisite.**
4. **Write-tool exclusion is data-dependent, not structural** (see §6b). Open risk until a denylist
   lands in `tool-filter`.
5. **Hardcoded prod CRM creds.** `x-api-key: ***REMOVED-CRM-API-KEY***` and base
   `https://fe-sorento.foundryx.my` are inlined in `save-session-vars`, the SLA POST, `next-assignee`,
   `work-calendar`, etc. Tests therefore hit **prod** CRM for reads. Acceptable for reads; the guards
   must ensure the **write** endpoints (conversation-variables PUT, sla-tracking POST,
   conversation-assignee) are never reached. If any direct CRM read is added to the harness itself it
   needs the same `EXTERNAL_API_KEY` — surface it as env, do not inline new copies.
6. **`sub-query-reformulator` not audited** (§6c) — possible third LLM sink and a second parser
   injection point. Coder must open it.
7. **Contact fixtures.** `findcontact-respond` needs a `contact` object with at least `id`, `phone`,
   `assignee.id`. Capture one fixture per test contact into `tests/fixtures/contacts/{id}.json` once;
   do not fetch live per-run (keeps determinism + zero respond.io reads).
8. **Snapshot path.** `scripts/export-and-stage.sh` writes into `normalized-workflows/`, which does
   **not currently exist** in the subrepo (only `scripts/`, `test-framework/`, `plans/`, `tests/`).
   The script creates per-id files on first run; confirm the directory gets created and that copy2
   (`txiPzSxy3Pclsz6v`) and the guarded subs are staged distinctly from the live ids so a guarded
   clone is never deployed to prod by accident. Test artifacts live under `tests/`, separate from the
   deployable `normalized-workflows/`.

### Artifact layout (under `n8n-workflows-init/tests/`)
```
tests/
  plan.md                      (this file)
  UAC.md
  cases/        {case}.json     # one per UAC case: test_mode, scope, contact_id, message, mock_parser_output?, expected
  fixtures/
    parser/     {name}.json     # recorded parser outputs (mock_parser_output bodies)
    contacts/   {id}.json       # captured respond.io contact objects for 437264483 / 457216562 / TBD
  uac/          {branch}.md     # optional per-branch UAC detail
  diffs/        {change}.md     # coder node-diff for reviewer
  runs/         {run-id}.json   # tester per-run output incl. egress log
  reviews/      {change}.md     # reviewer verdict
```

---

## 8. `scope:` convention (change-aware tier routing)

Every change request and every case carries exactly one `scope:` tag; the tester routes on it:

| `scope`         | What the change touches                          | Parser LLM    | get-results        | Cost   | Assertions |
|-----------------|--------------------------------------------------|---------------|--------------------|--------|------------|
| `deterministic` | branching, formatting, gates, egress, state, RAG selection — anything *except* the parser prompt | **bypassed** (inject `mock_parser_output`) | real (read-only) | ~$0    | exact on deterministic nodes; structural on get-results |
| `parser`        | the `Basic LLM Chain` prompt / `gpt-4.1-mini` parsing behaviour | **live** (`gpt-4.1-mini`) | real | parser tokens | structural/tolerant on parser output (schema + key fields), not exact text |
| `get-results`   | the get-results sub (`Fss5aAaXthJSWpZCgKiKR`) prompt/tooling | bypassed (mock) unless also parser | **live** (`gpt-5.4-mini` IF the agent path is wired — see §6c) | get-results tokens | structural only (shape/required fields/branch) |

Default for an unscoped change is `deterministic` (cheapest, most deterministic). A change spanning
two tiers carries both behaviours: e.g. a parser+formatting change runs the parser live AND structural
get-results.

> **`parser` tier covers BOTH parser LLMs — and code INSIDE the reformulator sub is mock-blind.** The
> `parser` row above names consume-main `Basic LLM Chain` (`gpt-4.1-mini`), but the reformulator /
> semantic-parser sub (`XTODTw-dJcV0uRdC056hG`, `gpt-5.4-mini`) is a second `parser`-tier target. Its
> Code nodes — `output_exchange`, `deriveRouting` — run AFTER the LLM (`AI Agent -> output_exchange`),
> and the deterministic bypass `mock_reformulator_output` feeds a **sibling branch that skips
> `output_exchange` entirely** (LESSON 28). So a change to `output_exchange`/`deriveRouting` is
> `scope: parser` and REQUIRES the real reformulator; it CANNOT be exercised by any mock. (The tester
> may still pin the raw LLM JSON via `prepare_test_pin_data`→`test_workflow` to run the pure-code
> transforms cheaply, but LLM-classification assertions — e.g. gratitude→casual — need a live emission.)
> First such change: `plans/output-exchange-9-1-10-fix.md` (issues #9/#1/#10), UAC §20.

---

# Change: `incoming-axis-gate-and-partial-message` (Option B — axis matrix + partial not-found)

Status: PLAN (planner deliverable). No workflow edited, no execution run.
Scope tag: **`deterministic`** (the change is Code-node gate + response-formatting logic; the parser is
NOT edited — parser hints are already correct). Driver caveat: because the chosen driver is the **chat
webpage** (decision #2), the live reformulator (`XTODTw-dJcV0uRdC056hG`, gpt-5.4-mini) runs once per
turn regardless — that is a *driver* cost, not a scope escalation, and parser output is asserted
**structurally** (axis hints present), never exact. Source of truth: live spine `9qVyfUxmRQqrpGRMDLRuz`
(active versionId `bcdb5633-f760-451b-b0a8-fc03a0d884c8`), grounded repro clone exec **8519391** on
`txiPzSxy3Pclsz6v`.

## B0. The bug (grounded, exec 8519391)

Message: *"check the ETA for two incoming containers to Sorento warehouse."*
Live reformulator was **correct**: `domain_hint=incoming`, `match_mode=and`, `entities =`
`[{raw:BMOU649395378,hint:inbound_shipment}, {raw:WHSU5485370,hint:inbound_shipment}, {raw:"Sorento warehouse",hint:warehouse}]`,
zero product hints.
`resolve-entity` (node `a2bed208`) returned OR-mode `resolutions[]` (`fallback_match_mode:"or"`):
- `BMOU649395378` → `resolved:false, matches:[]` (also in `unresolved_tokens`).
- `WHSU5485370` → `resolved:true`, one **exact `inbound_shipment`** match (uuid `9e038abe-…`, ETA `2026-07-18`).
- `Sorento` (truncated from raw "Sorento warehouse") → `resolved:false, ambiguous:true`, greedy fallback:
  1 transporter, 5 customers, 2 promotions, **4 prefix-tier `product`s** (SORENTO CATALOGUE / SORENTOBAG /
  SORENTO SP0100 / SORENTO188).

`disallowed-entity-gate` (node **`5928ae64-39d2-4d5d-bd85-f9ea47901f8b`**) has `incoming` in
`REQUIRE_SPECIFIC_DOMAINS`. Its OR-mode loop kept the 4 `product`s of the "Sorento" token (product IS in
`ALLOWED.incoming`), saw multiple products with no single exact-tier → `stillAmbiguous` → built a
"pick a product 1–4" picklist → `require_specific=true` → `gate_passed=false`. That set
`compatible_entities` to **only the 4 Sorento products** — WHSU's real inbound_shipment resolution was
**discarded**, BMOU ignored. Wrong: the user asked for two container ETAs and got a product picklist.

**Root cause:** the gate conflates "ambiguous token under this domain" with "search-by-**product** needs
disambiguation". `incoming`'s real search axis is **inbound_shipment**; the parser hinted zero products;
"Sorento warehouse" is a destination qualifier that greedily fell back to products. The
require_specific machinery is product-shaped and fired on noise.

## B1. Fix — Option B: axis matrix keyed off PARSER HINTS

Rewrite the `disallowed-entity-gate` require-specific logic (the `REQUIRE_SPECIFIC_DOMAINS` block only;
the earlier ALLOWED/ALLOWS_EMPTY/REQUIRED_TYPES compatibility logic is unchanged). Add an AXIS map and
a whole-query mode selector so the "any product hint?" test **sidesteps per-token raw↔token mapping**
for the common case.

```
// ── AXIS matrix (search axis per domain) ──
const AXIS = {
  incoming:           ['inbound_shipment'],
  order:              ['order','customer_order','order_number'],
  master_products:    ['product'], inventory: ['product'],
  promotion:          ['product'], product_attachment: ['product'],
};
const PRODUCT_FAMILY = new Set(['product','category','brand']);

const parserHints = (parser.entities ?? []).map(e => e.hint);
const axisTypes   = new Set(AXIS[domain] ?? []);
const isIdentifierAxis = axisTypes.size > 0 && !axisTypes.has('product');   // incoming / order
const hasProductFamilyHint = parserHints.some(h => PRODUCT_FAMILY.has(h));

// MODE SELECTION (whole-query — no per-token mapping needed here):
//   PRODUCT MODE    ⇐ parser hinted ≥1 product/category/brand entity  → KEEP current
//                     product-disambiguation logic verbatim (OR/AND branches, FIX A/D).
//   IDENTIFIER MODE ⇐ domain axis is an identifier (incoming/order) AND NO product-family hint.
```

**IDENTIFIER MODE (new):**
```
if (isIdentifierAxis && !hasProductFamilyHint) {
  // 1. compatible set = resolver matches whose entity_type ∈ axisTypes ONLY.
  //    (Drops Sorento's products/customers/transporters — they are not the axis type.
  //     This is the get-results-shape-independent way to shed the greedy noise.)
  compatible_entities = entities.filter(e => axisTypes.has(e.entity_type));

  // 2. partition the parser's AXIS-hinted tokens into found / not-found.
  //    A parser entity is an axis token when its hint ∈ axisTypes (BMOU, WHSU: inbound_shipment).
  //    Match a token to a resolution via the includes() fuzzy rule (parser raw
  //    "Sorento warehouse" ⊃ resolver token "Sorento"; "WHSU5485370" == token exact).
  const norm = s => String(s||'').toLowerCase().trim();
  const axisParserEnts = (parser.entities ?? []).filter(e => axisTypes.has(e.hint));
  const resolvedAxisRaws = new Set();
  for (const e of axisParserEnts) {
    const raw = norm(e.raw);
    const hit = (resolver.resolutions ?? []).some(r =>
       (raw.includes(norm(r.token)) || norm(r.token).includes(raw)) &&
       (r.matches ?? []).some(m => axisTypes.has(m.entity_type)));   // matched AS the axis type
    if (hit) resolvedAxisRaws.add(raw);
  }
  const not_found_axis_tokens = axisParserEnts
      .filter(e => !resolvedAxisRaws.has(norm(e.raw)))
      .map(e => e.raw);                       // → ["BMOU649395378"]

  // 3. NEVER build a product picklist in identifier mode.
  require_specific = false;
  specific_options = [];
  // 4. gate_passed: proceed when ≥1 axis token resolved; else fall to normal not-found.
  gate_passed = compatible_entities.length > 0
     ? true
     : (ALLOWS_EMPTY[domain] === true ? gate_passed : false);
  gate_reason = compatible_entities.length > 0
     ? `identifier-axis '${domain}': ${compatible_entities.length} axis match(es); `
       + `${not_found_axis_tokens.length} not found; noise tokens dropped`
       : `identifier-axis '${domain}': no axis token resolved`;

  // 5. carry the not-found set forward for the partial-message hook (B2).
  out.not_found_axis_tokens = not_found_axis_tokens;   // added to the returned item
  // (skip the entire REQUIRE_SPECIFIC_DOMAINS OR/AND product block below)
}
```

- **Noise tokens** (parser hint not an axis type and not product-family, e.g. `warehouse`) are dropped
  silently — step 1 already excludes them from `compatible_entities`, step 2 never counts them as
  requested. "Sorento warehouse" never surfaces as a picklist nor as a not-found item.
- **PRODUCT MODE is byte-identical to today** — cases 1–5 (ETA for products) and case 7 (stock) keep
  the exact OR/AND product-disambiguation, `FIX A`/`FIX D`, and (for incoming) the downstream
  `If-incoming-picker` availability annotation. Only identifier-axis + no-product-hint changes.
- **Why whole-query mode selection is safe against the raw↔token truncation gotcha:** the mode gate
  ("did the parser hint ANY product?") reads `parser.entities[].hint` directly — it never needs to map
  a truncated resolver token back to a parser raw. The per-token `includes()` fuzzy match is used ONLY
  inside identifier mode to decide found-vs-not-found, where a false "resolved" would merely omit a
  not-found line (never re-introduce egress or a wrong picklist).

## B2. Partial messaging (the real new work) — hook in `compile-current-state`

Today the itemized not-found lives in **`not-found-error-message`** (`b5f79139`), which only fires on the
`If3` **not-found branch** (`Aggregate1 → not-found-error-message`, i.e. NOTHING resolved). The
found-with-partial case (WHSU resolved + BMOU not) routes the **happy path**
(`If3[1] → get-rag → … → Call 'sub-get-results' → validator → If6[0] → central-exchange →
compile-current-state`), so the container/ETA path has **no** partial-itemization today — BMOU is
silently dropped even after the gate fix.

**Hook = a new IIFE in `compile-current-state` (`0804657c-f600-450b-8ae9-17972406f0e9`)**, mirroring the
existing "friendly domain disclaimers" IIFE at the bottom of that node (same append-to-`userResponse`
pattern, same happy-path guards). It already has every input needed: `qf` (parser), `resolve-entity`,
`getResultObj()` (get-results `answers`/items), `reconciledEntities`, and now
`disallowed-entity-gate.not_found_axis_tokens`.

```
// ── partial not-found itemization (identifier-axis happy path) ──
(() => {
  const answered = !isEscalateBranch && includeResponse
    && typeof userResponse === 'string' && userResponse.trim().length > 0
    && Array.isArray(last_result_set) && last_result_set.length > 0;
  if (!answered) return;
  const NOUN = { incoming: 'incoming shipment', order: 'order' };
  const noun = NOUN[qf.domain_hint]; if (!noun) return;   // identifier-axis domains only

  // primary source: gate's deterministic not-found axis tokens (shape-independent)
  const gate = (() => { try { return $('disallowed-entity-gate').first().json; } catch(e){ return {}; } })();
  let notFound = Array.isArray(gate.not_found_axis_tokens) ? [...gate.not_found_axis_tokens] : [];

  // refinement (OPTIONAL, coder-confirm answer shape): a token that RESOLVED but produced
  // zero get-results rows → also not-found. Match resolved axis tokens against the returned
  // answers by identifier (item.title / fields[].value contains the token, or by resolved uuid).
  // If the answer shape can't be confirmed, ship with the primary source only.

  if (notFound.length === 0) return;
  const list = notFound.map(t => `• ${t}`).join('\n');
  userResponse += `\n\nI couldn't find any ${noun} matching:\n${list}`;
})();
```

- This **extends** the not-found-itemize behaviour (memory `not-found-itemize-shipped`) into the
  **found-with-partial** happy path. The all-not-found path (`not-found-error-message`) is untouched.
- Per-domain "WHERE it lives": for **incoming/order** partials it lives here (happy path). For the
  all-miss case it stays in `not-found-error-message`. No new branch node is added — reuse the existing
  compile-current-state append point (lowest-risk: no connection surgery, no new `escalate-catalog`
  fallback wiring like the incoming-picker branch needed).
- **Open risk (answer-shape):** the optional resolved-but-empty refinement needs the get-results
  `answers[]` identifier field for incoming ETA (items carry `fields:[{label,value}]` per
  `output-structurer`; the container-number label is unconfirmed). The **primary** source
  (`gate.not_found_axis_tokens`) needs no shape and covers the flagship repro; ship that first.

## B3. Rebase topology — FRESH FORK of live + re-apply the chat-console guard layer

Per decision #1, do **not** reuse the stale `txiPzSxy3Pclsz6v`; fork **current** live so the test
artifact carries every post-clone live fix (lesson `rebase-on-live-then-fix`). Then re-apply the exact
guard/gating layer enumerated below (verified present on the current clone `txiPzSxy3Pclsz6v`,
versionId `7d37e22e-…`) so **zero real egress** is preserved. This layer is safety-critical.

**Step F1 — fork.** UI-Duplicate live `9qVyfUxmRQqrpGRMDLRuz` (lossless; MCP has no raw-JSON import) →
new inactive clone `NEWID`, enable "Available in MCP". Archive `txiPzSxy3Pclsz6v` after cutover.

**Step F2 — driver rewiring (chat webpage).** Confirm the fork has **zero Schedule Trigger** (delete
`Schedule Trigger` `14884141` if the duplicate carried it). Point `redis-pop-main-message-list`
(`680febfe`) at list **`main-message-list-test`** (never prod `main-message-list`). The chat webpage
`zz-chat` (`oyYfVvZHRZpWubTy`) → dispatcher (`2D0cw2Y1aPW2LOlU`) drives it (decision #2).

**Step F3 — re-apply chat-console egress gates (EXACT, from the current clone):**

| # | Re-apply on the fresh clone | Current-clone fact (verified) |
|---|---|---|
| G1 | **6 sendmsg executeWorkflow calls → fork `ublq9nSlrpz63xan`** (sub-sendmsg-CHAT), each passing `is_test:true` (literal) + `test_run_id` + the whole `contact` obj (chat_id rides inside it). | Nodes: `sorento-sub-respond-sendmsg-respond`, `-respond2`, `-respond3`, `-respond4`, `-respond5`, `-respond-transcribed-message` — all `workflowId=ublq9nSlrpz63xan`. |
| G2 | **`Call 'sub-human-intervention'` → fork `vUfFUDjLAuMaeQE6`** (HI fork carries the chat gate + `is_test` short-circuit). | `Call 'sub-human-intervention'` `workflowId=vUfFUDjLAuMaeQE6`. |
| G3 | **Audio-echo contact fix** — the transcribed-message sendmsg must be passed the `contact` obj (audio call-site otherwise drops it → chat_id lost). | `Transcribe a recording → sorento-sub-respond-sendmsg-respond-transcribed-message`; confirm `contact` present in its `workflowInputs`. |
| G4 | **3 inline-attachment chat gates:** `chat-attach?` IF (`findcontact.chat_id notEmpty`) + `chat-attach-push` redis, inserted on the attachment path so images/video/files route to redis `chat:reply` not respond.io. | `Switch[0/1/2] → guard-e/f/g-record → chat-attach? →([0] chat-attach-push / [1]) Loop Over Items1`. |
| G5 | **The `chat?` / `test-guard` branch on `contact.chat_id`** lives INSIDE the forks `ublq9nSlrpz63xan` + `vUfFUDjLAuMaeQE6` (chat? IF inserted BEFORE test-guard so it fires despite `is_test=true`). The fresh clone re-uses these existing shared forks unchanged — no fork rebuild, only the G1/G2 repoints. | Forks pre-exist and are shared; do not re-fork them. |

**Step F4 — re-apply the fail-closed egress-record layer (so `test:egress:{id}` exists for §0).** The
current clone writes the egress log via 6 redis record nodes; re-create them on the fresh clone at the
same wiring so the tester's §0 `test:egress` assertions work:
`guard-c-record` (`is-human-intervened[1]`), `guard-d-record` (`compile-current-state[0]` → before
`save-session-vars`), `guard-e/f/g-record` (`Switch[0/1/2]` → attachment sends), `guard-h-record`
(`if-message-is-audio[1]`, audio path). The real-egress nodes (`save-session-vars`, `update-human-intervened`,
`send-message-files/images/video`) stay **orphaned/blocked**.

> ⚠️ **AMENDED 2026-07-21 (obs-latency-contract C1).** `Call 'sub-respond-save-message-redis'2` is no
> longer orphaned. The clone's containment is now **5 orphaned + 1 sinked**: that node is wired from
> `if-message-is-audio` output **1 (FALSE)** — mirroring the live spine — and repointed to the fork
> **`tWm5DYLxfypmVC1T` (`sub-respond-save-message-redis TEST`)**, whose only egress is an RPUSH to the
> literal list `sorento-respond-message-TEST`, which **no consumer reads**. Containment is now "what
> the node can reach" rather than disconnection — the stronger form, but it must be asserted from the
> workflow JSON every run (UAC.md §0 S3 amendment) and backstopped empirically by **S7** (`LLEN
> sorento-respond-message` unchanged before/after every run). Never let this node point at the live
> save sub `UrETd-jm46tFj3Xw7w8vL` while it is wired.
>
> ⚠️ **FURTHER AMENDED 2026-07-21 (turn-id-threading-completion — cycle 2).** S7 as written is
> **unsound** and must not be used as the backstop: an equality invariant on the continuously-drained
> shared list `sorento-respond-message` can report PASS while a prod write occurred. Replace with
> sink-delta + payload attribution (reviewer H1) before the next run — see UAC.md §0. Separately, S8's
> runtime **pinning** is superseded by reviewer H2: credentialed `Send a Message`/`HTTP Request` nodes
> are **removed and re-added as name-preserving Code-node stand-ins**, so containment is structural
> rather than runtime-gated. Full spec: `plans/turn-id-threading-completion.md`.
>
> **Caller census correction (same change).** This plan and the cycle-1 spec both assumed the spine was
> the only relevant caller of the shared subs. It is not. The instance-wide census found **15 callers of
> sendmsg `aoydkG1dbItXR5jXFEQsP`** (not 9) and **4 callers of the save sub `UrETd-jm46tFj3Xw7w8vL`**
> (not 3) — including three inside `sub-human-intervention`, one in a daily Schedule worker, one in
> `respond-close-convo`, one in `sorento-main-INJECT`, and a direct save-sub call from
> `respond-send-user` that writes rows with **no `type` and no `turn_id`**. Any future change to a
> shared sub's input contract must start from that census, not from the spine.
>
> **Open decision for the coordinator:** if a chat-only harness is preferred (reply captured from redis
> `chat:reply`, egress proven purely by the forks' `is_test` short-circuit + orphaned real-send nodes),
> F4 may be dropped and §0 assertions read `chat:reply` + "no fork reached its real-send node" instead
> of `test:egress`. Flagged loudly — pick one before the coder starts.

**Step F5 — sub-call targets (verify on the fresh clone):** all shared-sub calls pass `is_test:true`.
`Call 'sub-query-reformulator'` → **`XTODTw-dJcV0uRdC056hG`** (the CURRENT clone calls the **live
published reformulator**, NOT the fork `CpxE8LroLzCkrAQN` that CLAUDE.md lists — **doc drift, flag it**;
either is guarded, and this change needs no parser edit so keep the live sub). `Call 'sub-get-results'`
+ `probe-incoming` → **`rysSPgUssLDf6xJc`** (get-results fork). `Execute 'sub-get-rag'` →
`tWP33QOFT7SxThfT`.

**Step F6 — repoint the driver to `NEWID`:** dispatcher `2D0cw2Y1aPW2LOlU` and console `zz-chat`
`oyYfVvZHRZpWubTy` must target the fresh clone `NEWID` (they currently target `txiPzSxy3Pclsz6v`).

**Step F7 — apply the business change:** the B1 gate rewrite on `disallowed-entity-gate`
(`5928ae64`) + the B2 IIFE on `compile-current-state` (`0804657c`). These are the ONLY two
business-logic node edits; everything else is guard/driver scaffolding.

## B4. Acceptance criteria

1. **Repro fixed (case 6):** message *"check ETA for BMOU649395378 and WHSU5485370 to Sorento warehouse"*
   → **no product picklist**; `gate.require_specific===false`; `compatible_entities` = the single
   `inbound_shipment` (WHSU uuid `9e038abe-…`); `not_found_axis_tokens===["BMOU649395378"]`; get-results
   runs; `userResponse` contains WHSU's ETA **and** an itemized "couldn't find … BMOU649395378"; the
   string "Sorento" never appears as a picklist option.
2. **Product cases unregressed (1–5, 7):** any parser output carrying a `product`/`category`/`brand`
   hint takes PRODUCT MODE → gate output byte-identical to pre-change on those inputs (vague→picklist,
   exact→proceed, incoming vague→`If-incoming-picker` availability annotation intact).
3. **Multi-token product ambiguity = ONE consolidated picklist** (coordinator refinement): two vague
   product tokens produce a **single** numbered choose-list containing all candidates for all ambiguous
   tokens (current OR-mode already flattens `specific_options` into one numbered list — assert it is not
   split per token).
4. **Zero egress (§0 S1–S6)** on every case; the chat reply is captured from redis `chat:reply` (and/or
   `test:egress:{id}` per the F4 decision); no `api.respond.io/.../message` POST, no assignment/SLA/PIC
   write, no CRM write executed.
5. **Only the two Code nodes changed** in the business diff the reviewer promotes (gate + compile);
   guard/driver scaffolding stays on the clone.

## B5. Verification tasks (planner-defined)

- **V-B1 (gate unit):** via `prepare_test_pin_data`→`test_workflow`, pin the exec-8519391 parser +
  resolver JSON into the fresh clone and assert `disallowed-entity-gate` emits
  `require_specific:false`, `compatible_entities=[WHSU inbound_shipment]`,
  `not_found_axis_tokens:["BMOU649395378"]` — cheap, no LLM.
- **V-B2 (mode-selection regression):** pin a product-hinted incoming parser output (hint `product`) and
  assert PRODUCT MODE fires (picklist or proceed unchanged) — proves the axis switch doesn't leak.
- **V-B3 (partial message end-to-end):** case 6 through the chat webpage; assert `userResponse` carries
  both the found ETA and the itemized not-found; §0 holds.
- **V-B4 (noise-drop):** assert no resolver `product`/`customer`/`transporter` from the "Sorento" token
  appears in `compatible_entities`, `last_result_set`, or the reply.

---

# Change: `query-forward-sibling-picker` (incoming empty-exact-miss → sibling-family picker + escalate)

Status: PLAN. Full design in **`query-forward-sibling-picker-plan.md`**; UAC in `../tests/UAC.md`
"Change: query-forward-sibling-picker" (§Q1–Q7). **Scope: `deterministic`** (Code + HTTP-read +
executeWorkflow-read on the spine; parser NOT edited; pick/escalate reconciliation REUSES the existing
`suggest-follow-up` node in the reformulator fork). Build/test target = current clone `txiPzSxy3Pclsz6v`.

**One-paragraph summary.** When an incoming ETA query resolves a product **exactly** but that product has
**no incoming** (today → bare "escalate to purchasing?"), look forward at the product's full SIBLING
family (**uncapped**), batch-check each for incoming, and offer a combined message: a numbered sibling
picker (each `— has/no incoming`, has-incoming-first, no cap) AND the escalate line. Reply = a number
(re-query that sibling's incoming next turn) or "yes" (escalate purchasing). Hook = `build-suggest-offer`
(the exact-empty incoming miss already lands there via `If6[FALSE] → Aggregate1 → not-found-error-message`)
+ 4–5 new nodes on the not-found path (`sibling-gate` IF → `family-fetch` httpRequest → `sibling-transform`
Code → `sibling-probe` executeWorkflow). **Crux decision:** no uncapped prefix-family lookup is reachable
via MCP or the resolver (resolver caps product prefix at `PREFIX_LIMIT=20`; `crm_incoming_stock_list`
exact-matches each code). The uncapped family comes from a NEW direct CRM **read** —
`GET /api/v1/master-data/products?query=<baseCode>&variant_filter=all&limit=5000` (x-api-key) — filtered
strict-prefix in n8n. Batched incoming annotation reuses the shipped `probe-incoming` machinery
(`incoming-picker-availability-shipped`). Reconciliation is FREE: the reformulator fork's `suggest-follow-up`
already inherits `domain_hint:incoming` on a suggest_offer number-pick and escalates on "yes". `compile-current-state`
renders it via the existing `_sug` path (no edit). See the dedicated plan for node IDs, the D3 code spec,
verification tasks, and acceptance criteria.

> **Doc-drift correction (verified this session):** the clone `txiPzSxy3Pclsz6v` calls the reformulator
> **FORK `wI5RkNGW3EOJfBdo`** (not live `XTODTw` as CLAUDE.md states) and get-results **`rysSPgUssLDf6xJc`**;
> business node IDs on this clone: `disallowed-entity-gate`=`b07ca5db`, `build-suggest-offer`=`7972abd8`,
> `compile-current-state`=`7a130a0c`, `not-found-error-message`=`5fabfbe3`, `If-incoming-picker`=`4e18b4e7`,
> `probe-incoming`=`1fe8680b`.

---

# Change: `dym-candidate-map` (did-you-mean pick RETAINS prior customer + date)

**Scope tag: `parser`** (the reconciliation lives in the reformulator fork `output_exchange`, which is
mock-blind — LESSON 28; the build/store hunks are deterministic spine Code, unit-testable offline). Full
design, code hunks, edge cases, precedence, and verification tasks: **`plans/dym-candidate-map-plan.md`**.
UAC: **`tests/UAC.md` §V-DYM0 + §24**. Bug: live `XTODTw` exec 8666864. Related-but-distinct:
[[backlog-post-resolve-entity-reconciliation]], [[parser-domain-continuity-carry]].

**The bug:** T1 ambiguous "Srtwc286" (order query, customer "I bath studio" + date 13-15/07) → not-found →
`build-suggest-offer` D1 "Did you mean SRTWC286-SH…" (merged with a CS member roster →
`selection_context=member_offer`). T2 user types "SRTWC286-SH"; LLM emits `replace_combine` +
`scope_exclusive=true` → `output_exchange` `keptPrior=[]` drops the customer, and `replace_combine`
(unlike `reuse`) carries no date → the date window is lost.

**The fix (3 nodes, 6 hunks):**
1. **`build-suggest-offer` (`7972abd8`, clone)** — when D1/D2 build a suggestion, also emit a LABELED
   `out.dym_candidates = [{code, uuid, entity_type, for_raw, for_hint, for_canonical}]` (one per offered
   code). `for_raw` = the source token (`d1.token` / D2 `askedCode`); the linkage is captured at build
   time, so a FUZZY suggestion (`cwc2816`→`cwcx2816`, non-prefix) is handled without any string match.
2. **`compile-current-state` (`7a130a0c`, clone)** — persist `variables.dym_candidates` (from `_sug`,
   survives the member `_merge` case); ALWAYS write `[]` when no offer → clears after one turn. Round-trips
   whole (`previous_conversation_state` = the entire `variables` object — no whitelist).
3. **`output_exchange` (`847a1173`, fork `wI5RkNGW3EOJfBdo`)** — on the pick turn, if the message matches a
   `dym_candidates[].code`, REPLACE the `for_raw` prior entity in-place with the picked code, RETAIN all
   other prior entities + the prior date, force `scope_exclusive=false`, ignore the LLM's mis-hint; guard
   the `member_offer` block so a code pick isn't mis-consumed. Precedence on a merged turn: code→did-you-mean,
   number/name→member pick, "yes"→escalate.

**Build/test on clone + fork; NEVER live spine `9qVyfUxmRQqrpGRMDLRuz` / live sub `XTODTw`.** Multi-turn
state round-trip ⇒ `chat-stateful` (or `regress-capture`) driver + real reformulator; replay is blind to
the `output_exchange` edit. Zero egress structural (Code-only nodes; §0 S1-S6). Promotion user-gated
(two diffs: spine + parser sub).

---

# Change: `chat-console-replyto-parity` (2 deltas + 1 assessment)

Status: PLAN (planner deliverable, 2026-07-31). No workflow edited, no execution run.
Full design: **`plans/chat-console-replyto-parity-plan.md`**. UAC: **`tests/UAC.md` §25 / §26 / §DC**.

| delta | scope tag | build target | touches LIVE? |
|---|---|---|---|
| **A** — zz-chat quote-reply parity | **`deterministic`** (driver-priced: the console driver runs the real reformulator fork once per turn; structural assertions only) | `zz-chat oyYfVvZHRZpWubTy`, `sub-sendmsg-CHAT ublq9nSlrpz63xan`, clone spine `txiPzSxy3Pclsz6v` | **NO** |
| **B** — delete the `reply to:` text concatenation | **`parser`** (the change is the LLM prompt; `mock_reformulator_output` skips `output_exchange` entirely — LESSON 28 — so no mock can see it) | clone spine `txiPzSxy3Pclsz6v` → promote live `9qVyfUxmRQqrpGRMDLRuz`, one leaf, **user-gated** | **YES** |
| **C** — pointer payload gap (`dym_offer`/`entities`/`domain` not carried) | assessment only, no build | — | no |
| **DC-1 / DC-2** — canaries owed by the live `tryDymPick` prior-domain deletion | **`parser`** | clone spine + parser fork | no |

**A (test lane).** The console has zero reply-to capability today at **three** independent layers, all
measured live: (1) `build-item` puts `replyTo` at `item.message.replyTo`, but every spine consumer reads
`$('tf-message')…json.message.replyTo` — one level deeper — so it is **undefined** (clone exec `10626106`);
(2) `sub-sendmsg-CHAT` › `log-chat-history-n8ntest` writes `message_id` as the literal **`NULL`** and
`result` as an **object**, while the CRM contract requires a top-level **array** (`isinstance(raw, list)`
or `None`); (3) the console lane's session read is `pg-get-session` (Postgres), so the CRM's `?message_id=`
node never runs, and `pg-upsert-session` never persists a `referenced_result_set` key. Fix = mint a
per-bubble `message_id`, persist it with an **array** `result` carrying the same per-bubble `idx` subset the
live splitter computes, add a `message_id`-aware SELECT that mirrors the CRM clause-for-clause, and set
`replyTo` at the **correct depth**. Affordance = a `/reply` / `/replyid` slash command (the n8n hosted-chat
widget has no DOM hook and LESSONS 43 forecloses self-served HTML; a real quote chip needs a
locally-hosted page — deferred).

**B (live).** `Call 'sub-query-reformulator'` › `/workflowInputs/value/latest_user_message` line 2 appends
`reply to: <bot's own text>`, and `AI Agent.text` interpolates it RAW as `Current user message:`. The
parser's 30k systemMessage contains **zero** references to `reply to` / `quoted` / `referenced_result_set` —
the suffix is uninstructed noise. Structured `referenced_result_set` already carries the reference and is
already *preferred* (`output_exchange:369/403`). The three `output_exchange` `split(/\s*reply to:/i)[0]`
sites are **strippers, not readers** → no-ops after deletion; the four sendmsg `input_message` copies of
the suffix are **DEAD** (`input_message` is read by zero nodes in `aoydkG1dbItXR5jXFEQsP`). Two *unstripped*
readers do change, both toward correctness: `MENU_LABELS[userMsg]` (L123/131) and
`_extract(latest_user_message, …)` (L649, member-pick positional scan over the quoted text).

**⛔ BLOCKER for DC-1/DC-2:** the clone's parser fork `wI5RkNGW3EOJfBdo` **still contains** the
`tryDymPick` prior-domain overwrite the user deleted from live `XTODTw` (fork L210; everything else is
whitespace). Any canary for that deletion run on the clone today exercises the OLD code. Re-sync the fork
first (plan §5.2 / V-DC0).

**Safety.** A introduces no new egress class, but the S-CRED gate widens to **six** Postgres nodes —
`chat_histories` exists in BOTH `n8n_test` and the prod CRM DB, so a mis-bound node **silently writes
prod** (LESSON 10) and MCP redacts credentials (LESSON 47) → REST-verify `Dnnofg8Xb27VQOhI` or HALT.
B's live promote follows the LESSON-58 byte-SHA protocol, targets the node by **NAME**, is its own publish
(no riders — LESSON 51), and is verified post-promote **on a quote-reply turn** (LESSON 56).

---

# Change: `quoted-turn-state-pointer` (a quote-reply resolves to the quoted turn's STATE)

Status: PLAN (planner deliverable, 2026-07-31). No workflow edited, no CRM file edited, no execution run.
Full design: **`plans/quoted-turn-state-pointer-plan.md`**. UAC: **`tests/UAC.md` §27**.
Predecessor: `plans/chat-console-replyto-parity-plan.md` §4 (was "delta C — assessment only").

**USER DECISION:** this ships **BEFORE** the quoted-text deletion (that plan's delta B). Analysed against
the live graph in §7 of the design and **confirmed safe** — the transitional double-channel can only
*suppress* the rebase (via `_explicit`), never invert it, so the worst case is today's behaviour. One class
of benefit is provably masked until B lands; UAC §27.9 exists to make that masking visible.

| delta | side | scope tag | build target | touches LIVE? |
|---|---|---|---|---|
| **C1** — CRM returns `session_vars.referenced_state` on `?message_id=` | **CRM** | n/a for the n8n tester; CRM pytest (design §4.4) | `conversation_variables_service.py`, `conversation_variables.py`, `tests/test_chat_history_result_set.py`. **No Alembic migration.** | CRM deploy, **user-gated** |
| **C2** — parser declares `referenced_state` + the one-place REBASE | **n8n** | **`parser`** | fork `wI5RkNGW3EOJfBdo` → promote live parser `XTODTw-dJcV0uRdC056hG` | **YES**, user-gated |
| **C3** — spine passes `referenced_state` (one leaf) | **n8n** | **`deterministic`** | clone `txiPzSxy3Pclsz6v` → promote live spine `9qVyfUxmRQqrpGRMDLRuz` | **YES**, one leaf, user-gated |
| **C4** — harness: inject `referenced_state` via `sim-inject-session` | **n8n** | **`deterministic`** | clone only | **NO** |

Promote order fixed by LESSON 37: **C2 (published) → C3**. C1 is order-independent (design §6 proves all
six crossed-version combinations degrade to today's behaviour, so CRM and n8n may deploy in either order).

**The design in one paragraph.** `?message_id=` already returns `session_vars.referenced_result_set` (the
quoted bubble's own `chat_histories.result`), and `output_exchange` L369/L403 already *prefer* it over
`prevState.last_result_set`. C widens that pointer from "which list" to "which turn": the outgoing row's
`turn_id` joins to the same turn's **incoming** row's `state_trace->'after'`, and the CRM returns a
**4-key projection** — `{domain_hint, intent_hint, entities, dym_offer}` — as
`session_vars.referenced_state`. The parser then **REBASES** once, at the top of `output_exchange`
(immediately after the `let parent_input = …` binding, before the first read at L76/L100 and before
`tryDymPick`'s invocation at L218), by *rebinding* `parent_input.previous_conversation_state`. Because all
17 downstream reads resolve through that `let`, every existing gate — the entity-op executor's `prior`,
`tryDymPick`'s `_prev`, carry site 1 (L313–321), `prevState` (L354), carry site 2 (L501–527) — is rebased
for free. **Zero n8n writer change is needed**: `state_trace`'s `trim()` collapses only `last_result_set`,
`referenced_result_set` and `dym_candidates`, and only at top level, so `dym_offer.candidates`,
`entities`, `domain_hint` and `intent_hint` all survive intact.

**REBASE, not merge — and NO fourth carry site.** For the four whitelisted keys the quoted value
*replaces* the recent one (including `null`/`[]`; a union would reintroduce the recency contamination the
pointer exists to remove — hence the CRM must always emit all four keys explicitly, so object-spread is
exact). The rebase writes only the **input** side; it never assigns `output.output.domain_hint` /
`intent_hint`. `_explicit` (L236, rev4 `_DECISIVE_INTENTS`) keeps deriving from the current turn only, and
both gate bodies stay byte-unchanged — so "a carry fills holes and never overwrites what the current turn
supplied" holds by construction, and the carry-site count stays at **two**. The invariant is enforced as a
static gate (UAC §27.3 / V-C2): the set of lines assigning `output.output.domain_hint|intent_hint` must be
identical before and after C2. A new match is REQUEST-CHANGES, no discussion.

**Whitelist is FOUR keys, and two exclusions are safety properties, not tidiness.**
`last_result_set` is excluded because `trim()` destroys it (`{n, first}`) — the untrimmed quoted set is
already delivered by `referenced_result_set`. `selection_context` is excluded because rebasing it *without*
`last_result_set` is a **wrong-CS-assign bug**: L617–619 would take `'member_offer'` from an old bubble but
resolve the number against the *current* roster → wrong `uuid` → real assign → staff ripple. `response` is
excluded so a quoted "yes" cannot confirm an escalation the customer did not just see. `access_levels` is
excluded so a quote can never re-grant revoked access. **Emergent theorem, asserted in §27.7:** every input
to the member-pick arm is outside the whitelist, and `_hasPickSignal` is evaluated before `_isNewQuery`, so
C2 **cannot cause an assign that would not otherwise happen and cannot change which member is assigned**.

**Fail-safe.** Thirteen enumerated miss paths (design §9) all collapse to one guard — `_refStateOk` false →
no rebase → baseline = current session = today's behaviour, never null/stateless. The sharpest one:
`state_trace->'after' = json null` means *the turn wrote no state* (no-access refusal, LLM fallback,
documented as meaningful in the model and migration) → the CRM returns **`None`, never `{}`**; returning
`{}` would WIPE continuity, strictly worse than today. Both deploy orders are safe (§6 matrix).

**⛔ PLAN-PREMISE CORRECTIONS (design §0 — five stale premises, read before scheduling):**
(a) **Outgoing `turn_id` on the ESCALATION path is NO LONGER NULL** — `Call 'sub-human-intervention'` passes
`turn_id = $execution.id`, the sub declares it, all **three** of its sendmsg calls forward it, and both
sendmsg loggers write it. The predecessor plan's blocker #1 is **CLOSED**; memory `obs-latency-contract`
is stale on this point. (b) **Live parser DOES emit `_parser_raw`** (`output_exchange` L76/L737) — LESSON
57(a)'s "fork is ahead by `_parser_raw`" is stale. (c) **The fork re-sync is ONE hunk**: `diff -w`
live↔fork `output_exchange` is *exactly* the 2 deleted `tryDymPick` lines (fork L209–210); the 30k
`systemMessage` is byte-identical (sha1 `8bdf51dc…`) and trigger declarations match. (d) **NEW:** the fork
carries an extra **orphaned `Postgres Chat Memory`** node live lacks (`ai_memory: [[]]`, so unreachable;
MCP credential evidence is vacuous per LESSON 47 → REST-verify). (e) **LESSON 31 is stale for the clone** —
`sim-inject-gate` → `sim-inject-session` now injects `previous_conversation_state` + `referenced_result_set`
from the redis item straight into the `get-session-vars` NoOp, which is what makes C4 cheap and decouples
C2/C3 testing from the C1 CRM deploy.

**⛔ BLOCKER (unchanged, still hard):** the clone's parser fork `wI5RkNGW3EOJfBdo` still contains the
`tryDymPick` prior-domain overwrite deleted from live. **Every** §27 case touches did-you-mean or domain
continuity, so §27 is **VOID** until the fork is re-synced and published (design §5.1 / V-C0).

**What shrinks (carried forward, not relitigated).** `ttl` **cannot** be retired — unquoted bare-code picks
are the majority and mandating quote-reply is a product decision. What shrinks: for a *quoted* pick,
lifecycle rules 2 (domain switch), 5 (`_answered`) and 6 (`ttl<=1`) can no longer cause a miss, so the
offer's session lifetime stops being the limiting factor. **Zero code is deleted.** Correction to the
predecessor's §4.3: `dym_slot` tier-0 resolution stays **fully required even for quoted picks** — the
pointer supplies the offer, not which prior entity the suggestion was FOR.

**Safety.** No new egress class on either side; CRM **reads** only, GET never writes. S-CRED widens to
include fork `wI5RkNGW3EOJfBdo`'s orphaned Postgres node. Both live promotes follow the LESSON-58 byte-SHA
protocol, target nodes by **NAME**, are **separate publishes** (LESSON 51), build the target as **live +
own hunks** never a fork copy (LESSON 57 — the fork has that extra node), and are verified post-promote on
a real **quote-reply** turn (LESSON 56). Live writes are **user-gated**; `sorento-coder` is barred from
live (LESSON 58a/26).

---

# Change: `dym-zerostock-itemize` (#3) — name resolved-but-empty products on an answered stock turn

**Scope: `deterministic`.** Full design, resolved design-questions (esp. the variant-matching guard),
exact `compile-current-state` code + placement, verification tasks, and the §ZS UAC binding:
**`plans/dym-zerostock-itemize-plan.md`** (UAC §ZS in `tests/UAC.md`).

One-node business diff: spine Code `compile-current-state` (live `0804657c` / clone `7a130a0c`). On an
answered inventory/incoming turn (`business_query`, `!manualResponse`, `!isEscalateBranch`, ≥1 returned row),
append the locked line `No stock records found for: <codes>.` naming resolved products
(`disallowed-entity-gate.compatible_entities`, entity_type product) whose `code` is absent from the returned
rows' `Product Code` fields (exact case-insensitive match; **no variant expansion** — proven from the CRM
`incoming_for_product` service + presenters). Writes ONLY `user_response` → byte-identical no-op when no
empties. **Bundled with #1 (`dym-multitoken`, build-suggest-offer) and #2 (`dym-partial-disambiguation`,
parser + compile-current-state)** but promotes independently; if #2 lands in the same window, build target as
live + both hunks and re-diff (LESSON 57). No parser / get-results-sub / output_exchange edit.

---

# Change: `tool-loop-removal` — delete the per-tool loop from the spine

**Scope: `deterministic`** (this file §8's `deterministic` row names "RAG selection" verbatim). Full design,
decision table, exact by-NAME node/edge diff, the enforcement point for the 1-tool invariant, rollback,
promote checklist, blast radius, and sequencing vs `cross-domain-stock-incoming`:
**`plans/tool-loop-removal-plan.md`** (UAC **§TL** in `tests/UAC.md`).

Two-node deletion on the path **every answered turn and every miss turn** takes, for **all 7 domains**:
`tool-filter` returns exactly ONE flat tool item (highest `similarity`, tiebreak `name` ASC, explicit sort);
`Split Out1` and `Loop Over Items` are removed; **`If6 out1` takes over the loop's `out0` and feeds
`Aggregate1` directly** — that new edge is the miss-path join, and omitting it dead-ends every not-found turn
*with a green execution*. `Aggregate1`, `Execute 'sub-get-rag'`'s `limit:5`, and
`Call 'sub-get-results'`'s `tool: {{ $json.name }}` are all deliberately UNCHANGED. Empirical basis:
`plans/evidence-rag-tool-fanout-20260803.md`.

Findings that amend earlier documents — each is load-bearing:
- **`build-suggest-offer` (live `7972abd8`, ~L294–309) explicitly iterates the loop's runs**
  (`node.all(0, ri)`) to scan every tool's `alternatives[]`. It is the ONE functionally load-bearing use of
  the loop, it degrades correctly to run 0 without a code edit, and its comment ("Multi-tool queries run
  get-results MORE THAN ONCE") becomes false — fix the comment in the same diff. UAC §TL-D2.
- **`response_intro` — the only field `Aggregate1` aggregates — has ZERO consumers** on live and clone, so
  the array-length change on inventory turns is inert. `Aggregate1`'s real role is item-collapse +
  payload-narrowing, which is why deleting it as well is rejected.
- **`sub-get-rag` SUMS `similarity` across `source_id`s** when collapsing to a tool name, so `tools[0]` is
  not provably the maximum → the sort must be explicit, and `limit: 5 → 1` is rejected as a *competing*
  enforcement point that can disagree with it.
- **The 1-tool premise is not yet observed on LIVE.** Live exec `11059966` @ 2026-08-03T11:01:39Z still
  returned 2 inventory tools; clone exec `11061831` @ 11:23:22Z returned 1. Prerequisite **P1**.
- 🚩 **§6 P0 (UNRELATED, HIGH):** live `Call 'sub-get-results'` **and** `probe-incoming` point at
  **`rysSPgUssLDf6xJc` (`sub-get-results TEST`)**, not `Fss5aAaXthJSWpZCgKiKR` — present in live's published
  `activeVersion a40cd16d` and in the 2026-07-23 backup. Production's main CRM read runs through the harness
  fork (LESSONS §48b), which also means the 2026-08-02 alloc-badge promote onto `Fss5aAaXthJSWpZCgKiKR` is
  inert on that path. **Report; do NOT bundle or silently correct it in this diff** (LESSONS §51).

Sequencing: **loop removal promotes FIRST, on its own** — it makes crossdomain's F3 (probe per tool) and F4
(false cross-domain block on an answered turn) *impossible by construction*, and keeps rollback attributable.
Then crossdomain re-tests (plan §9 Amendment B) and promotes. Amendment A: drop the now-dead
`crossdomain-probe.executeOnce`, and do **not** add the proposed `{{ $runIndex }} === 0` gate to
`crossdomain-gate` — post-removal it can never go false.

---

# Change: `dym-probe-before-offer` — did-you-mean candidates are annotated with whether they HAVE the thing

**Scope: `deterministic`** (this file §8 — gates/branching/formatting; parser pinned via
`mock_reformulator_output`, get-results real/read-only). Build target: the clone `txiPzSxy3Pclsz6v`
**only**; promotion user-gated and out of scope. Full design, domain map, node/edge diff, fail-open
contract, prerequisites and verification tasks: **`plans/dym-probe-before-offer-plan.md`**
(UAC **§DP** in `tests/UAC.md` / `tests/uac/DP.md`).

`build-suggest-offer` D1 suggests on **lexical code similarity only** — `tokenCandidates()`
(live `f03086ac`, `build-suggest-offer.js:138-152`) never checks whether a suggested product HAS the
thing asked for. Measured 2026-08-07 over 354 live executions (~16 h prod traffic, dev contact excluded):
35 dym offers, 9 code picks, **6 dead-ended (67 %)**, 22 ignored. A generic, map-driven
probe-before-offer primitive is added for two domains (`product_attachment`, `inventory`); a third is a
one-line `DOMAIN_PROBE` entry. **Annotate, never drop** — a hard filter would hide a real document
whenever the parser's `attachment_type` scoping is wrong, and under-offering is invisible.

Template is the shipped incoming sibling picker. Four new nodes —
`dym-transform` (pure, lifts `tokenCandidates()`, emits ONE item so the probe batches) →
`dym-gate` (If `probe_needed`) → `dym-probe` (copy of `sibling-probe`) → `dym-annotate` — with
`sibling-gate[1]` re-pointed at `dym-transform` and both `dym-gate[1]` and `dym-annotate[0]` landing on
`build-suggest-offer` (**4 inbound, was 3**). `dym-annotate` is load-bearing: `build-suggest-offer.js:6`
spreads `$input.first().json` and expects the **not-found** payload, so the probe result cannot be wired
in directly without losing `escalate_message` on the D1 fall-through.

**Findings that AMEND the settled design — two are blockers, each would have shipped a confidently
wrong feature rather than an inert one:**

- 🚩 **The specified attachment tool is wrong.** `crm_resource_attachments_list` does not accept
  `product_ids` (`server.py:60-63` narrowing filters are `attachment_ids`/`directory_id`/
  `attachment_type_id`/`uploaded_by`), is hard-pinned `direct_access_only=true` (`server.py:120`), and
  its renderer `_resource_attachments` (`presenters.py:564-572`) emits `title = filename` with only a
  `File Name` field — **no product code anywhere**, so the reused attribution parser can never match and
  **every candidate would be labelled "no certificate"**. Correct tool:
  **`crm_master_product_attachments_list`** — accepts `product_ids` + `attachment_type_ids` +
  `certificate_ids`, and `_product_attachments` renders `title = product_code` plus `Product Code` and
  `Attachment Type` fields.
- 🚩 **`crm_inventory_stock_balance_list` fails OPEN and returns genuine zeros.** "ALL FILTERS OPTIONAL —
  call with none to span every product + active warehouse" ⇒ an empty `product_ids` returns the whole
  stock table and marks **every** candidate "has stock"; and "a genuine 0 is still returned" ⇒ row
  presence ≠ has stock. So `probe_needed` hard-gates on ≥1 UUID-shaped candidate uuid, and the inventory
  predicate is **summed `Quantity On Hand` > 0**, not row presence. *This is why the sibling-picker
  attribution cannot be block-copied:* it works only because `crm_incoming_stock_list` returns a row
  solely where incoming exists — a property that does not generalize. `predicate` is therefore a
  first-class field of `DOMAIN_PROBE`.
- **The `attachment_type`-uuid landmine is a FALSE POSITIVE, not a no-op.** `disallowed-entity-gate.js:59-64`
  satisfies the `product_attachment` required-type check from a union of resolver entity types **and raw
  parser hints**, so the gate can pass with zero attachment_type uuid; the probe is then scoped by
  `product_ids` only and returns every attachment of every type, labelling a brochure-only product "has
  certificate". Two mandatory layers: fail-closed `probe_needed` on a UUID-shaped
  `attachment_type`/`certificate` entity, plus an `Attachment Type`-presence cross-check in
  `dym-annotate`. Verification task **§6-DP-V1** makes it a GO/NO-GO, not an assumption — a fail ships
  `product_attachment` disabled.
- **Coverage boundary, asserted not assumed:** `build-suggest-offer` has 3 inbound and D1 can fire on all
  three (D3 returns early only when `extras.length > 0`). Only `sibling-gate[1]` is rewired, so D1 offers
  arriving via `annotate-incoming-picker[0]` / `sibling-probe[0]` are **un-annotated by construction**
  (UAC §DP-12).
- **Multi-token D1, numbered mode and D2 are explicitly OUT of scope** and must be byte-identical:
  multi-token assigns a global contiguous `idx` that `suggest_last_result_set` + `dym_candidates` key on
  (has-first sorting would renumber across blocks — a round-trip regression risk, and all 6 measured
  dead-ends were single-token); numbered mode needs a uuid `canonical_code` i.e. a promotion, which
  neither enabled domain's `allowed_lookup` permits (asserted unreachable, §DP-13b); D2's alternatives
  already came back from the domain tool, so probing them is redundant.
- 🔴 **`suggest_quick_reply` must stay bare codes** — code mode (`:274`) uses them as button labels and
  the pick round-trips on that exact string. Annotation goes in `suggest_response` text ONLY. Single
  easiest way to break this change; §DP-11 asserts it and §DP-FP-3 proves the assertion can go red.
- **Fail-open is structural:** `dym-probe` uses `onError: continueRegularOutput` — explicitly **not**
  `continueErrorOutput`, whose unwired `main[1]` makes a failed run report success (LESSONS §61a).
  Failure is detected by payload shape, never node status.

**Read-only investigations recorded, deliberately NOT fixed here (LESSONS §51):**

- `disallowed-entity-gate.js` flattens `resolutions[].matches` with **no `match_tier` filter** — line
  **28-35** on live `f03086ac` (the change request's `26-33` is stale). Confirmed, but domain-dependent:
  for the two `REQUIRE_SPECIFIC_DOMAINS` (`incoming`, `product_attachment`) lines 215-221 later overwrite
  `compatible_entities` with the option-uuid set or `exact_entities`, so fuzzy matches do **not** reach
  the lookup there. For every **other** domain — including `inventory`, one of the two enabled here —
  they **do**. Real defect, separate change. This change is insulated: it sources candidate uuids from
  `tokenCandidates()`, not from `compatible_entities`.
- 🚩 Live `Call 'sub-get-results'` **and** `probe-incoming` still point at `rysSPgUssLDf6xJc`
  (`sub-get-results TEST`) on `f03086ac` — the known landmine, re-confirmed. `sibling-probe` and
  `crossdomain-probe` correctly point at `Fss5aAaXthJSWpZCgKiKR` on live and at the TEST fork on the
  clone, which is exactly why `sibling-probe` is the copy template and `probe-incoming` must never be.
- The live spine moved `24888eca → f03086ac` while this change was being specified; the export was stale
  and `--verify` refused. Re-exported before any line number here was taken.

---

# Appendix Z — index of active per-change plans (added 2026-08-07)

Per-change design now lives in its own `plans/<change>.md` with its own `tests/uac/<FAMILY>.md`; this
document stays the **harness** plan (kill-switch, egress log, tiers, agent contracts). Do not append new
change designs here, and do not edit the 4,000-line `tests/UAC.md` monolith — it is provenance only.

| change | plan | UAC | scope tag(s) | status |
|---|---|---|---|---|
| `dym-probe-before-offer` | `plans/dym-probe-before-offer-plan.md` | `tests/uac/DP.md` | `deterministic` | reviewed APPROVE (rev 7, clone `5d6f9593`); promote **held by the user** |
| `multi-company-resolution` | `plans/multi-company-resolution-plan.md` | `tests/uac/MC.md` | `deterministic` | PLAN. 🔴 Promote gated on **CRM A-0** — `entity_resolver.py`'s raw `text()` probes bypass company isolation (a multi-tenant leak, not a display bug) |
| `carried-certificate-dump` | `plans/carried-certificate-dump-plan.md` | `tests/uac/CD.md` | **B1** `deterministic` (spine `disallowed-entity-gate`) · **B2** `parser` (parser sub `output_exchange`) | PLAN. Root cause reproduced end-to-end with a control (execs `11509873` / `11509954`). 🔴 **B2′ as built carries a defect** — §3.7, the `ordinal` exemption is permanent |
| `immortal-hint-class` | `plans/immortal-hint-class-plan.md` | `tests/uac/IH.md` | **C1** `parser` · **C2** `parser` (same `output_exchange` write) · **C3** `deterministic` (spine `dym-transform`/`dym-annotate`/`build-suggest-offer`) | PLAN. Root cause established from `_parser_raw` on exec `11554793`: the domain-named hint is written by **code** (`output_exchange` reference-positions `hint = domain_hint`), **not** the LLM |

Corrections to standing documentation, established 2026-08-07/08 and recorded in the plans
above so they are not re-derived:

- 🔴 **`tests/UAC.md` is STALE and `scripts/split-uac.py` MUST NOT be re-run.** It regenerates
  `tests/uac/*` **from** the monolith, which is missing `§MC` entirely (0 vs 48 refs), `§CD-11`
  (0 vs 15), `§DP-19` (0 vs 6), `§CD-BLIND` (0 vs 6). Re-running it would destroy that work. The
  split files are now the source of truth; write `tests/uac/<FAMILY>.md` directly.
  `plans/immortal-hint-class-plan.md` §0.3.
- **The entity `hint` field is enum-validated NOWHERE** — no whitelist exists in the parser sub, the
  spine or the clone (`grep -rnE "VALID_HINTS|ALLOWED_HINTS|HINT_ENUM|KNOWN_HINTS"` → zero hits).
  The prompt's enum is prose enforced by nothing, and `reconcileEntities` only corrects a bad hint
  when the token **resolves** — so bad hints are permanent on exactly the unresolved population the
  did-you-mean flow is made of. `plans/immortal-hint-class-plan.md` §1.3.

- **LESSONS §31 is stale** where it says injecting `previous_conversation_state` in the redis item does
  not work — the clone's `sim-inject-gate → sim-inject-session → get-session-vars` lane makes it work,
  mode-independently. `plans/carried-certificate-dump-plan.md` §4.1.
- **The live `sub-get-results` (`Fss5aAaXthJSWpZCgKiKR`) is NOT unscoped.** It forwards
  `contact_id`/`space_id` from `semantic_input` at `entity-ids-transformer.js:80-81`, and every spine
  caller populates them. CLAUDE.md, memory `live-calls-getresults-test-fork`,
  `dym-probe-before-offer-plan.md` §9 and that change's review §6.2/§9.5-D14 all state the opposite.
  `plans/multi-company-resolution-plan.md` §8.
