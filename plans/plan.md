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
