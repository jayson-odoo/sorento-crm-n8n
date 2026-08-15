# Reviewer sign-off — `intervention-tickets-s32` (S3.2 sub-human-intervention rework)

Seat: `sorento-reviewer` · Date: 2026-08-13 · Read-only: **no workflow was edited, published or executed
in this review.** Every MCP call was `get_workflow_details` / `get_execution` / `search_executions` /
`search_workflows`.

| artefact | id | state as reviewed |
|---|---|---|
| fork (built change) | `vUfFUDjLAuMaeQE6` | `versionId == activeVersionId == 16eadb1e-157b-419a-9441-e6510c40f4fc` ✅ re-fetched |
| test double (matrix target) | `mTfA5b9TgHItWo2g` | `2d1c03b3-fa63-44c9-8ff3-9c045e62200e` ✅ |
| live promote target | `rrYXzE61gCNUck_zmXe-G` | `versionId == activeVersionId == 5018a189-22df-4cb9-aa89-fa509377abe9`, `updatedAt 2026-07-22T01:27:32.239Z` — **UNTOUCHED** ✅ re-fetched |
| flip-time change #2 | `-WkzJMQZHmsFQm6A2abLJ` | active, `triggerCount 1`, `updatedAt 2026-07-22T00:47:36.981Z` — untouched |

---

# VERDICT: **REQUEST-CHANGES**

Not on safety. **Zero-egress is clean and I re-proved the whole chain myself** (§B). The rework's
routing logic — items 1, 2, 4, 5, 7 — is correct, well-evidenced, and the matrix that backs it is
the most honest one I have reviewed on this repo: it recorded its own case (f) FAIL, the coder fixed
the *code* rather than the assertion, and the matrix was re-run from scratch against the new
versionId instead of patching a verdict line.

Two verified defects block promotion, and both are in the same blind spot: **everything was verified
against the sub, nothing against its caller.**

| # | severity | finding | one-line |
|---|---|---|---|
| **F1** | **BLOCKER** | `source_message_text` is empty on 100% of production interventions | the live spine never passes `input_message` |
| **F2** | **HIGH (runbook)** | the Step-3 PUT will `400` as written | live's `settings` carry `binaryMode` + `timeSavedMode` |
| **F3** | **MEDIUM (contract)** | already-assigned tickets are owned by the round-robin pick, not the conversation's assignee | undecided in the plan, undiscriminated by the matrix |
| F4 | LOW | the hardening does not close the class it names | `assigned_to_id`, `source_message_id`, and all of `get-round-robin-assignee` are still raw-interpolated |
| F5 | LOW (accept) | fail-loud blast radius is real, bounded, pre-existing | an HI-sub error already fails the parent spine turn today |
| F6 | LOW | fork/throwaway `settings` ≠ live `settings` | matrix ran without live's `timezone` |
| F7 | LOW (accept) | S7a/S7b redis-read gap, third session running | judged **acceptable for this change** — see §B4 |
| F8 | — | plan's open reviewer question, **discharged** | `agent_assignee` has zero readers anywhere |

---

## A. Promotable diff vs the contract (plan §"Business change" items 1–7)

I re-fetched both workflows and diffed them node-by-node myself rather than reading the node-diff.
**The node-diff document is accurate.** Every sha, every claim I could check, checks out.

| item | required | fork state (verified from JSON) | verdict |
|---|---|---|---|
| 1 | `if-conversation-unassigned` → only `is_already_assigned` is-false | exactly one condition, id `83bed6cf-…`; live's second condition `ba3b3fbe-…` (`is_working_hours`) gone; `combinator:"and"`, strict/v3 options untouched | ✅ |
| 2 | FALSE output → `conversation-sla-tracking-create` | `if-conversation-unassigned.main[1] → conversation-sla-tracking-create`; create has exactly two inbound edges (`Assign…`, `if-conversation-unassigned`) | ✅ |
| 3 | URL `/integration`, 7-key body | URL is `…/sla-management/conversation-sla-tracking/integration`; body carries exactly `assigned_to_id, contact_phone_number, agent_code, team_set_code, message_id, source_message_id, source_message_text`; `policy_id` and `current_tier` gone; `message_id` unquoted, `source_message_id` quoted | ✅ shape · ⚠️ see F1/F3/F4 |
| 4 | new `if-in-working-hours` keyed on the **CREATE RESPONSE** | `={{ $('conversation-sla-tracking-create').first().json.in_working_hours ?? 'MISSING_IN_WORKING_HOURS' }}`, strict/v3, boolean-true; **not** `get-round-robin-assignee.is_working_hours` | ✅ |
| 5 | delete `comment-switch`, `Redis`, `Call '…respond'1` | all three absent; zero occurrences of `sorento-respond-assignee-queue` in the fork's JSON; no dangling edges | ✅ |
| 6 | no resolve call in this sub | confirmed — none exists | ✅ |
| 7 | tidy, no generic names | `if-in-working-hours` follows the sibling convention; positions only | ✅ |

**REBASE claim independently confirmed.** The fork's `Call 'sub-add-comment-respond'` `workflowInputs`
block is byte-identical to live's, including the `DateTime.fromISO(…, {zone:'utc'}).setZone('Asia/Kuala_Lumpur')`
form and the `⏰` glyph. So the drift fix promotes as a genuine no-op, as claimed. The comment reads
`initiated_at` / `due_at` / `due_at_resolution` off the create response and the locked `/integration`
response still carries all three — no edit needed there.

**`return-assignee` reads `assigned_to` (the legacy respond-user-id-shaped TEXT), not `assigned_to_id`.**
Unchanged from live. See F8 — this turns out not to matter.

### F1 — BLOCKER: `source_message_text` will be `""` on every real ticket

The new key is specified as *"the worklist enquiry snippet"* — the whole reason it exists. It renders
`JSON.stringify($('When Executed by Another Workflow').first().json.input_message || '')`.

**The live spine does not pass `input_message` to this sub.** Verified three independent ways:

1. `export/live-spine-sorento-consume-main/workflow.json` (export `--verify` run this session: all
   current, spine at `469e7259`). The spine's `Call 'sub-human-intervention'` node has
   `mappingMode: "defineBelow"` and its `workflowInputs.value` keys are exactly:
   `agent, contact, contact_id, contact_phone_number, current_assignee, explicit_assignee_id, message_id, team, turn_id`.
   **No `input_message`.**
2. Real production execution **12199710** (parent `12199704` = live spine `9qVyfUxmRQqrpGRMDLRuz`,
   real contact 445239409): trigger output carries `"input_message": null`.
3. Real production execution **12173314** (parent `12173305`, contact 505044028): same,
   `"input_message": null`.

`JSON.stringify(null || '')` → `""`. So **every** production intervention ticket ships a blank
enquiry snippet. The clone's caller omits it too, so a clone-driven e2e run would not have caught it
either. The matrix could not see it because it pinned the trigger **directly** with a fabricated
`"input_message": "I need help with my order SRT332-GM not delivered"` — a value the real caller
never supplies.

This is LESSONS §70 exactly ("reasoned from the FUNCTION without checking the CALLERS") compounded
with §64 ("a hand-built fixture encodes what the author *believes* state contains"). The node-diff's
own justification — *"`input_message` and `explicit_assignee_id` are both declared inputs on
`When Executed by Another Workflow`, so the new expressions resolve (verified against the trigger's
`workflowInputs.values`)"* — verifies the **declaration**, which was never the question.

Second-order consequence: the peer's contract loop replayed `create-body-sample.json`, whose
`source_message_text` is a full sentence. **The one shape production will actually send — `""` — has
never been replayed against the backend.** If the field carries a `min_length` or is required
non-empty, every intervention 422s at the create node, which (no `onError` on that node) aborts the
sub after the customer has already received the "directing your enquiry" ack.

**Required before promote — pick one and record it:**
- (a) add `input_message` to the live spine's `Call 'sub-human-intervention'` mapping. This makes the
  flip **three** live workflows, not two, and the spine is the highest-blast-radius object in the
  repo — it needs its own hunk, its own byte-gate and its own rollback versionId in the runbook; **or**
- (b) source the snippet from something the sub already receives (nothing in the current envelope
  carries the customer's text — `contact` is the respond.io contact object, not the message); **or**
- (c) accept a permanently blank snippet, say so explicitly in the plan, and have the peer confirm
  `""` is valid on `/integration`.

Whichever is chosen, add a matrix case with `input_message` **absent** (not empty-string — absent, as
live sends it) and assert the rendered body, and have the peer replay that exact body.

### F3 — MEDIUM: which assignee owns the ticket on the already-assigned path?

This is the path the change exists to fix, and the two candidate ids diverge there. From real
production execution **12199710** (`is_already_assigned: true`):

```
assignee_id                  = 3760012d-7f5a-4b44-bf1a-e3349f7b398d   (Jereen Tee — round-robin pick)
conversation_assignee_id     = a72d5838-ceda-4d4a-af7f-1132c798e5fd   (Josephine Ng — actual respond.io assignee)
```

The new body always sends `assigned_to_id = $('get-round-robin-assignee').item.json.assignee_id`,
i.e. **Jereen**, while respond.io keeps the conversation on **Josephine** (item 1 deliberately stops
re-assigning). The node being deleted — `Call 'sub-add-comment-respond'1` — is precisely the one
whose copy said *"the conversation is not assigned to you as it is already assigned to
`${conversation_assignee_name}`"*, so the divergence is not new, but it is now baked into a **CRM
ticket owner** rather than a comment.

Why this matters beyond cosmetics: the runbook's own Step 4b describes the planned
`POST /external/conversation-sla-tracking/agent-replied` gate as *"exactly one open unanswered ticket
for that (contact, user)"*. If Josephine replies but the ticket is owned by Jereen, the match fails
→ `no_open_ticket` → the response clock never stops → **a false SLA breach on exactly the
already-assigned case this change is shipping to fix.**

The matrix is structurally incapable of seeing this: the create stand-in returns the same fixture
regardless of `_case_already_assigned`, so cases (a) and (b) produce identical create responses. That
is the LESSONS §64 "sound assertion that cannot discriminate the two states" class.

Compounding, and worth one question to the peer: the fixtures suggest **the backend may not honour
the requested `assigned_to_id` at all.** `create-body-sample.json` requests `"assigned_to_id": "USR-0042"`;
`create-response-fixtures.json` returns `"assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"` on
every fixture. Either the peer replayed a different body than the one we sent them, or the route
re-resolves the assignee server-side. **If it re-resolves, F3 is moot and the field is decorative; if
it honours, F3 is live.** Nobody currently knows which, and the plan states it as settled.

Required: one line from the peer on `/integration`'s `assigned_to_id` semantics, and an explicit
decision on whether an already-assigned conversation's ticket should be owned by the round-robin pick
or by `conversation_assignee_id`.

---

## B. Zero-egress / safety — **PASS**, re-proved independently

### B1. Live is untouched

Re-fetched `rrYXzE61gCNUck_zmXe-G`: `versionId == activeVersionId == 5018a189-22df-4cb9-aa89-fa509377abe9`,
`updatedAt 2026-07-22T01:27:32.239Z` — the value recorded before the build, unchanged after three fork
PUTs. `nodes == activeVersion.nodes` (no unowned draft). It still carries the OLD url
(`…/conversation-sla-tracking`, no `/integration`), the OLD 7-key body with `policy_id`/`current_tier`,
the two-condition `if-conversation-unassigned`, `comment-switch`, `Redis`
(`list: "sorento-respond-assignee-queue"`) and `Call 'sub-add-comment-respond'1` — i.e. exactly
pre-change live. ✅

### B2. The fork carries no new egress

The rework **removes** one egress node (`Redis` → `sorento-respond-assignee-queue`) and its
`sorento-redis` credential, adds one `if` node, and deletes two others. The only new outbound
capability is a **URL change on an already-existing credentialed httpRequest node** — same node, same
method, same `crm-n8n-auth` binding, a different path on the same host. No new credential, no new
credentialed node, no new sub-call. Net egress surface strictly decreases.

### B3. The matrix ran only against the S8-compliant double, and I verified the whole sink chain

The tester's pre-flight (versionId, S8 sweep, node-type inventory, two named param shas) is recorded
and matches the coder's build doc. I re-verified the two links downstream of the double **myself**,
from JSON, because they are the part of the zero-egress argument that is usually taken on trust:

- **`69RhomhiCH4bpY1w` (`zz-sub-sendmsg-BLOBTEST`)** — re-fetched. Node types are
  `executeWorkflowTrigger ×1, if ×3, code ×3, redis ×1, splitInBatches ×1, executeWorkflow ×2`.
  **Zero** `@respond-io/…respondio`, **zero** `n8n-nodes-base.httpRequest`, **zero**
  `memoryPostgresChat`. `Send a Message` and `HTTP Request` are name-preserving **Code** stand-ins
  emitting a synthetic `{contactId, messageId}` (LESSONS §47 pattern). `versionId == activeVersionId`.
  Its only redis node is `test-guard-record` → `test:egress:{test_run_id}`. Both save legs target
  `tWm5DYLxfypmVC1T`. ✅
- **`tWm5DYLxfypmVC1T` (`sub-respond-save-message-redis TEST`)** — re-fetched. Two nodes total; the
  Redis node is `operation: push`, **`"list": "sorento-respond-message-TEST"` as a plain literal
  string with no `=` expression prefix**, so it cannot be redirected by any caller-supplied value.
  `versionId == activeVersionId`. This discharges UAC §0 S3's *"assert from the workflow JSON, not
  from memory"* clause for this cycle. ✅

So the complete reachable egress of the matrix is: 11 sub-executions into BLOBTEST → RPUSH to
`sorento-respond-message-TEST`, a list no consumer reads
(`redis-consume-queue-mongo` `Srs08P0Ha3Cv--YPx0-Yn` pops `sorento-respond-message` only). Nothing in
the chain can reach respond.io, the CRM, or the prod ingest list. `test-guard-record` and
`chat-escalation-push` were absent from all six runs (structurally — `test-guard` and `chat?` both
FALSE in every case's runData).

Note for the record, not a defect: the HI sub's three sendmsg callers do **not** map `is_test` into
the sendmsg sub, so BLOBTEST's own `test-guard` goes FALSE and its save legs run. That is intended
(the blobs are the evidence) and is the same shape live has — the HI-sub `test-guard` is the only
guard on that path, which is why repointing the callers to BLOBTEST, rather than trusting a flag, is
the correct harness design.

### B4. The throwaway's S8 sweep — re-derived, not accepted on report

I recomputed the fork↔throwaway comparison from two fresh `get_workflow_details` reads:

- **Zero** nodes of any of the three banned types. Type census: `6 code · 3 executeWorkflow ·
  1 executeWorkflowTrigger · 4 if · 2 redis` — matches the coder's and tester's inventory exactly.
- **Node-name sets equal (16/16); `connections` deep-equal; every node `id` EQUAL.**
- Exactly **5** nodes differ, and all five differ *only* by being converted to `n8n-nodes-base.code`:
  `Assign or unassign a Conversation1` (was `respondio`), `conversation-sla-tracking-create`,
  `get-round-robin-assignee`, `get-working-days` (all three were `httpRequest`), and
  `Call 'sub-add-comment-respond'` (was `executeWorkflow` → the **unguarded live** comment sub
  `2l8egTLJbyGOPvG-DbtDX`, correctly neutralised).
- The other **11** nodes carry param shas byte-identical to the fork, including
  `if-in-working-hours` = `722d7448d591` and `if-conversation-unassigned` = `50391b189ae0` — i.e. the
  two `if` nodes carrying the business logic under test are **the fork's own bytes**, not a copy.
- All three sendmsg `executeWorkflow` legs → `69RhomhiCH4bpY1w`. Zero references to
  `aoydkG1dbItXR5jXFEQsP` anywhere in the throwaway.

So the matrix ran against the fork's actual business logic with only egress-capable nodes swapped.
The equality proof in `throwaway-build.md` §6 is confirmed independently.

### F7 — the S7a/S7b redis-read gap: **acceptable for THIS change**, but stop rolling it forward

The tester again could not read redis (`.env` carries only list-name constants; `zz-canary-read` has a
hardcoded key on a non-expression field) and correctly **flagged rather than routed around** it,
scoring the egress line "PASS (structural) / gap noted". Two testers on this slice have now recorded
the same gap.

My judgement: **acceptable here, and not by charity.** S7 exists to defeat *drain-blindness* on a
prod-shared list — a write that lands and is popped between polls. That failure mode requires a node
capable of writing to the prod list. In this graph there is none: the queue-push `Redis` node does not
exist (static, confirmed on the re-fetched JSON), and every reachable RPUSH terminates in
`sorento-respond-message-TEST` via a hardcoded literal I verified myself in B3. A structural
impossibility outranks a sampling gate; measuring a delta would be redundant with, not corroborative
of, the type-level proof.

What is genuinely *not* discharged is S7a's **positive** half — "every save the case expects must
appear in the TEST sink." The evidence is the BLOBTEST sub-execution runData, one hop upstream of the
actual RPUSH, so a broken write inside `tWm5DYLxfypmVC1T` would look identical. Low consequence
(nothing safety-relevant rides on the TEST sink), but it means the harness cannot currently prove a
save *happened*, only that it was *called*.

**Carry as debt, not as a blocker:** build the parameterized redis-read helper (key name as an
expression input) before the next slice. Third recorded ask.

---

## C. Harness / promote separation — strip list is **COMPLETE**

I enumerated fork↔live deltas independently from two re-fetched JSONs rather than from the runbook,
then checked the runbook's Step-2 strip list against my enumeration. I then had the same comparison
recomputed mechanically (param-sha per node keyed by **name**, plus a full `connections` diff) from a
second, independent set of fresh reads. **The two derivations agree on every row**, and the buckets are
exactly: 3 nodes only-in-live, 3 only-in-fork, 6 changed, 7 identical; `id`/`type`/`typeVersion` EQUAL
on all 13 shared nodes. Live and fork are **16 nodes each** (the node-diff's "18 → 16" is the *fork's*
before→after, which is correct and not a live count). Full delta set:

| # | delta | class | in runbook? |
|---|---|---|---|
| 1 | `conversation-sla-tracking-create` url + jsonBody | REWORK | ✅ item 3 |
| 2 | `if-conversation-unassigned` condition | REWORK | ✅ item 1 |
| 3 | `if-in-working-hours` node ADDED | REWORK | ✅ item 4 |
| 4 | `comment-switch` / `Redis` / `Call '…respond'1` DELETED | REWORK | ✅ item 5 |
| 5 | conn `if-conversation-unassigned.main[1]` → create | REWORK | ✅ item 2 |
| 6 | conn `Call 'sub-add-comment-respond'.main[0]` → `if-in-working-hours` (was `return-assignee`) | REWORK | ✅ item 4 |
| 7 | conn `if-in-working-hours` → TRUE `return-assignee` / FALSE `get-working-days` | REWORK | ✅ item 4 |
| 8 | `chat?` node ADDED | **HARNESS** | ✅ strip |
| 9 | `chat-escalation-push` node ADDED | **HARNESS** | ✅ strip |
| 10 | conn trigger → `chat?`, `chat?` → [push],[test-guard] | **HARNESS** | ✅ *explicitly* — "the trigger→test-guard edge stays exactly as live has them" |
| 11 | 3 sendmsg callers `workflowId` `aoydkG1dbItXR5jXFEQsP` → `69RhomhiCH4bpY1w` (+ `cachedResultUrl`/`cachedResultName`) | **HARNESS** | ✅ strip |
| 12 | `test-guard-record.messageData` — fork adds `explicit_assignee_id` to `payload` and a top-level `turn_id` | **HARNESS** | ✅ strip |
| 13 | node `position` on 5 nodes | cosmetic | ⚠️ not listed |
| 14 | workflow `settings` (fork lacks `callerPolicy`, `binaryMode`, `timeSavedMode`, `timezone`) | environment | ⚠️ not listed → **F2/F6** |

**Nothing harness-shaped is missing from the strip list.** Item 10 is the one I expected to find
missing — the connection-level consequence of dropping `chat?` — and the runbook calls it out
explicitly. That is the single highest-risk item and it is handled.

Two residual notes:
- **(13)** positions are cosmetic; if the promoter copies fork positions the live canvas shifts. Say
  "positions: leave live's" so it is a decision rather than an accident.
- **(14)** is the reason Step 2's *"start from live's current GET"* instruction is load-bearing rather
  than stylistic — see F2.

Literal counts over a canonical re-serialisation of `{nodes, connections}` — use these as the
pre/post-PUT gate values:

| literal | live (target state) | fork |
|---|---|---|
| `sorento-respond-assignee-queue` | 1 → **must become 0** | 0 |
| `aoydkG1dbItXR5jXFEQsP` | 6 → **must stay 6** | 0 |
| `69RhomhiCH4bpY1w` | 0 → **must stay 0** | 6 |
| `chat:reply:` | 0 → **must stay 0** | 1 |
| `2l8egTLJbyGOPvG-DbtDX` | 4 → **must become 2** | 2 |
| `is_test` | 4 → **must become 2** | 2 |
| `MISSING_IN_WORKING_HOURS` | 0 → **must become 1** | 1 |
| `/integration` | 0 → **must become 1** | 1 |

Note `aoydkG1dbItXR5jXFEQsP` is **6**, not 3 — each sendmsg caller carries it twice (`workflowId.value`
*and* `cachedResultUrl`). A strip that fixes only `value` leaves a stale `cachedResultUrl` pointing at
BLOBTEST; cosmetic in n8n but it is exactly the kind of half-restore that reads as harness leakage in a
later audit. The `is_test` 4 → 2 drop is entirely the deleted `Redis` node's `messageData`, so the
runbook's "no `is_test` scaffolding beyond what live already carries" assertion is satisfiable as
written. The runbook's existing pre-PUT greps cover the first four rows; add the rest.

---

## D. Runbook executability

**Correct and well sequenced:** rollback versionIds are recorded and I confirmed the sub's
(`5018a189-…`) is still live's current pointer; the "two live workflows in one window" ordering
argument is right (always-create without the close-convo fix = one Respond close resolving every
sibling ticket); the three blocked items are **correctly marked blocked rather than wired**, and
Step 4's refusal to accept the peer's `is_resolved`-off-a-preferred-row alternative — because it
depends on an unowned `ORDER BY` — is exactly the right instinct (LESSONS §70a). P7 correctly makes
the missing `open-count` endpoint a **precondition on the whole flip**, so the runbook is internally
consistent about not shipping half of it.

### F2 — HIGH: the PUT will `400` as written

Live's `settings` are:

```
{executionOrder: "v1", availableInMCP: true, callerPolicy: "workflowsFromSameOwner",
 binaryMode: "separate", timeSavedMode: "fixed", timezone: "Asia/Kuala_Lumpur"}
```

Per LESSONS §55, the public OpenAPI `workflowSettings` schema **omits `binaryMode` and
`timeSavedMode`**, so echoing them back in a PUT body returns
`400 settings must NOT have additional properties`. This sub carries **both**. Step 3 does not
mention `del(.settings.binaryMode, .settings.timeSavedMode)`.

It fails safe (the 400 is pre-write — nothing saves, no pointer moves, a failed attempt is free), so
this is not a correctness hazard. It is a **gated-window hazard**: the operator hits an unexplained
400 mid-flip and has to diagnose it live. Add the `del(…)` to Step 3 and add a post-PUT assertion that
`timezone` and `callerPolicy` survived (`settings` is merged, not replaced, so they should).

### Other runbook gaps

- **P6 gates only the sub's versionId.** Add `-WkzJMQZHmsFQm6A2abLJ` still at
  `4a2e963d-dd2a-443e-bbb1-68b43ee29744` to the same precondition. (It is still `active` with
  `triggerCount 1` and `updatedAt 2026-07-22T00:47:36.981Z`, consistent with the recorded id, but the
  gate should say so.)
- **Step 4 will return `409`, not `200`.** `respond-close-convo` has a live respond.io
  `conversationClosed` webhook trigger (`triggerCount: 1`). LESSONS §60: a REST PUT on an ACTIVE
  respond.io-webhook workflow returns `409 "conflict with one of the webhooks"` **while the write and
  publish persist correctly** — judge by resulting STATE, not by the HTTP code, and have the user
  confirm the trigger re-subscribed in the UI. Not knowing this in the window is how a good change
  gets rolled back for no reason.
- **No draft-vs-active check immediately before the PUT.** Live is currently clean
  (`versionId == activeVersionId`, `nodes == activeVersion.nodes`) so there is no unowned draft today,
  but LESSONS §24/§51 says re-run it at the moment of the PUT, not at review time. Add it to Step 3.
- **Step 5's canary needs a precondition.** Four of the ten most recent live executions of this sub
  errored at `get-round-robin-assignee` with
  `404 "No team found for agent and team_code='purchasing' in company '38db4f20-…'"`. That is ~40%
  of recent interventions failing **before** the change, on a CRM-config cause. Confirm dev contact
  437264483's (agent, team, company) resolves on `/external/next-assignee` before the canary, or the
  canary will fail for an unrelated reason and burn the window.
- **Add to Step 5:** assert the created ticket's `source_message_text` is non-empty (this is the
  assertion that would have caught F1) and its `assigned_to_id` (F3).

---

## E. Adversarial pass on the two fixes

### `JSON.stringify(x ?? '')` on phone / agent / team — **correct, but narrower than advertised**

Mechanically sound. `??` (not `||`) is right: a legitimately falsy-but-present value survives. `null`,
`undefined` and an absent key all render `""` instead of the old raw form's literal `"null"`. Verified
against live payloads (`"+60165622487"`, `"incoming_stock_enquiries"`, `"purchasing"`) that the
rendered body is byte-identical to the pre-hardening form — the create-body sample did not need
regenerating and the peer's fixtures stay valid. The stand-in's `_rendered_body_raw` template literal
is a faithful transplant: I compared it line-by-line against the fork's published `jsonBody` with `=`
stripped and `{{ x }}` → `${ x }` and they are string-equal.

Three residual edges (**F4**), none a regression, all worth recording rather than implying the class
is closed:

1. **`assigned_to_id` and `source_message_id` are still raw-interpolated between quote chars** — the
   exact form §3a condemns. If `message_id` is JSON `null`, `source_message_id` renders the literal
   string `"null"` and is stored as a bogus message reference; same for `assigned_to_id` on a null
   `assignee_id`. (If either is `undefined` rather than `null`, the `"message_id": {{ … }}` line
   already malforms the body and the node throws — loud, and unchanged from live.)
2. **The stated reason for leaving `assigned_to_id` raw does not survive sign-off.** The node-diff
   says it "keeps the throwaway's *malformed body throws* instrument able to go red." The throwaway is
   DISPOSABLE and scheduled for deletion at sign-off, so a harness-shaped rationale is deciding the
   shape of a **live** artifact and the rationale expires the moment the harness does. Keep it raw if
   you like — but on the grounds that its source is a CRM-issued id, not on the grounds of what a
   deleted test double can detect.
3. **`get-round-robin-assignee` still interpolates `contact_phone_number` / `agent` / `team` raw**,
   and it runs *first*. So the hardening's own threat model — *"a `"`, `\` or newline in any of them
   malforms the body"* — is not actually closed: a hostile value malforms the upstream body before
   the hardened one is ever built. Fine as scoped; just do not describe the class as fixed.
4. Minor type note: `JSON.stringify` **preserves the input's JSON type**, whereas the raw form always
   produced a string. If any of the three ever arrives as a number, the CRM now receives a JSON number
   where it used to receive a quoted string. Inert today (all three are strings on live, verified),
   but it is a silent wire-type change, not purely a robustness fix.

### `?? 'MISSING_IN_WORKING_HOURS'` — **correct, and empirically earned**

This is the best-evidenced part of the change. The first matrix run proved the *bare* `leftValue`
does **not** error on an absent key (strict validation rejects a value present-with-wrong-type; it
coerces `undefined` to `false`), the coder corrected the code rather than the assertion, and the
re-run inverted case (f)'s expectation and showed it red-then-green properly.

Enumerating the input shapes the condition can distinguish:

| `in_working_hours` | result | correct? |
|---|---|---|
| `true` | TRUE → PIC copy | ✅ |
| `false` | FALSE → out-of-hours copy (`??` does not coalesce `false`) | ✅ |
| key absent | sentinel string → strict rejects → node error | ✅ verified, exec 12217176 |
| `null` | sentinel → error | ✅ |
| `"true"` / `1` / `0` | present, wrong type → strict rejects → error | ✅ |
| create returns 2xx with empty body | `.first().json.x` undefined → sentinel → error | ✅ |
| create returns non-2xx | httpRequest node has no `onError` → aborts before the If | ✅ |

**Collision is not a real risk.** It requires the CRM to return the literal string
`"MISSING_IN_WORKING_HOURS"` as the value of `in_working_hours`; and if it ever did, the node would
error — the *same* outcome as the absent case. The only cost would be a marginally misleading error
message. No action.

### F5 — the fail-loud trade, quantified

The coder flagged the consequence honestly; here is the measurement it was missing.

An error inside this sub **fails the parent spine execution**: the spine's
`Call 'sub-human-intervention'` has `onError` unset, and live execution 12173314 (sub, error) has
parent 12173305 (spine) with `status: "error"`. So a fail-loud If aborts the whole turn, including
whatever the spine does after the HI call (`→ Execution Data`).

But this is **not a new failure class**: the sub already errors regularly in production — 4 of the 10
most recent executions, all the `next-assignee` 404 above — and already fails the parent when it does.
The delta is *where*: today's error fires **before** any write, the new one fires **after** ack +
assign + ticket-create + SLA comment. So a malformed create response yields a half-completed
intervention — staff notified with a real ticket and comment, customer silent after the ack — instead
of the wrong message. That is the right trade and strictly better than a wrong customer message in
working hours. **Accept**, and write the operator-visible symptom into the runbook rollback criteria
so nobody diagnoses it from scratch at 2am.

### F8 — plan's open reviewer question, **discharged positively**

The plan asks: *"check what the spine caller does with `agent_assignee` (prefer `assigned_to_id` if
user-facing)."* Answer: **nothing.** `agent_assignee` has zero occurrences anywhere in the export set
outside `return-assignee` itself, and the spine node immediately downstream of
`Call 'sub-human-intervention'` is `Execution Data`, which saves only `actual` and `contact_id`. The
`…routed-to-pic` message text does not interpolate it either. So `return-assignee`'s legacy
respond-user-id-shaped value is never rendered to anyone, and the `assigned_to` vs `assigned_to_id`
concern does **not** need addressing here. No change required. (It does *not* discharge F3, which is
about the value we **send**, not the one we read back.)

---

## F. What the matrix did NOT cover — demand before live

1. **The real caller's envelope.** Every case pinned the trigger with a synthetic payload. Live sends
   `input_message: null`, `test_run_id: null`, `started_at: null`. → **F1.** Add a case built by
   copying a real trigger payload (exec 12199710 is a good donor) and editing it, per LESSONS §64.
2. **`source_message_text: ""` against the real backend.** The only shape production will send, and
   the one the peer never replayed.
3. **`assigned_to_id` on the already-assigned path.** The stand-in returns the same fixture for
   `_case_already_assigned` true and false, so the matrix cannot discriminate. → **F3.**
4. **A create-call failure.** The stand-in always succeeds; no case exercises a 4xx/5xx from
   `/integration`. Given the ~40% `next-assignee` 404 rate on the sibling node, this is not
   hypothetical. Behaviour is unchanged from live (create is already mid-chain), so note-only — but
   record what the operator sees.
5. **`already_active: true` + `in_working_hours: false`** (retry, out of hours) — untested
   combination. Low value: nothing branches on `already_active` (grep-confirmed: zero readers outside
   the create response itself).
6. **Live's `settings`.** The fork and throwaway run without live's `timezone: Asia/Kuala_Lumpur`
   (**F6**). Inert here — the SLA-comment expression pins `{zone:'utc'}` → `setZone('Asia/Kuala_Lumpur')`
   explicitly, and `$now` is only used in `test-guard-record` — but it is an unrecorded environment
   difference between the tested object and the promoted one.
7. **The promote transport itself.** Nothing has exercised a PUT of this body against a workflow with
   live's settings shape. → **F2.**

---

## PROMOTE CHECKLIST

Ordered. Do not start until every ⛔ is cleared.

### Pre-promote — blockers
- [ ] ⛔ **F1**: decide (a) spine mapping / (b) alternative source / (c) accept-blank, and record it in
      the plan. If (a): the spine `9qVyfUxmRQqrpGRMDLRuz` joins the flip — its own hunk, its own
      byte-gate, its own rollback versionId, and its own line in the runbook.
- [ ] ⛔ **F1**: peer replays the create body with `source_message_text: ""` against the dev backend;
      store the response next to the existing fixtures.
- [ ] ⛔ **F3**: peer answers what `/integration` does with `assigned_to_id` (honour vs re-resolve);
      decide round-robin pick vs `conversation_assignee_id` for the already-assigned path.
- [ ] ⛔ **F2**: add `del(.settings.binaryMode, .settings.timeSavedMode)` to the Step-3 PUT recipe.
- [ ] Re-run the matrix on whatever changes, against a re-verified throwaway versionId. If nothing in
      the sub changes, record why the existing matrix still applies.
- [ ] P1–P7 all green, including **P7** (`open-count` endpoint deployed) — it gates the *whole* flip,
      not just Step 4.
- [ ] P3: `LLEN sorento-respond-assignee-queue == 0`, **during working hours**.
- [ ] Confirm dev contact 437264483's (agent, team, company) resolves on `/external/next-assignee`
      (the ~40% 404 rate above).

### Build the payload (Step 2) — LIVE + own hunks, never a fork copy
- [ ] Start from a fresh REST GET of `rrYXzE61gCNUck_zmXe-G`. Confirm
      `versionId == activeVersionId == 5018a189-…` and `nodes == activeVersion.nodes` **at that moment**.
- [ ] Apply the five REWORK hunks by node **NAME** (§C rows 1–7). `if-in-working-hours` params must
      byte-match fork sha `722d7448d591`, including the `?? 'MISSING_IN_WORKING_HOURS'` sentinel.
- [ ] STRIP, all of: `chat?`, `chat-escalation-push`, the trigger→`chat?` and `chat?`→… edges
      (**restore live's trigger→`test-guard` edge**), the 3 sendmsg `workflowId` repoints (live keeps
      `aoydkG1dbItXR5jXFEQsP` incl. `cachedResultUrl`/`cachedResultName`), the fork's
      `test-guard-record` wording (live keeps its own — no `explicit_assignee_id`, no top-level
      `turn_id`). Leave live's node **positions** as they are.
- [ ] Pre-PUT literal counts on the payload, per the §C table: `69RhomhiCH4bpY1w` **0**,
      `chat:reply:` **0**, `sorento-respond-assignee-queue` **0**, `aoydkG1dbItXR5jXFEQsP` **6**
      (not 3 — `value` *and* `cachedResultUrl` per caller), `2l8egTLJbyGOPvG-DbtDX` **2**,
      `is_test` **2**, `MISSING_IN_WORKING_HOURS` **1**, `/integration` **1**.
      No trailing whitespace in any expression.
- [ ] Quote the heredoc delimiter (`<<'PY'`) if the payload is built in one — this body is `$`-dense
      (LESSONS, access-tier D14).

### PUT + verify (Step 3)
- [ ] PUT. Expect **200** (this sub has no webhook trigger). Re-GET: `versionId == activeVersionId`,
      new versionId recorded, five hunks present.
- [ ] Credentials: `crm-n8n-auth ×3`, `sorento-api ×1`, `sorento-redis ×1` (one fewer — the deleted
      `Redis` node's). `settings.timezone` and `settings.callerPolicy` survived the merge.
- [ ] Param-hash **every** node on both sides, not just Code bodies (LESSONS §71) — this diff is
      mostly `if` conditions, an `httpRequest` body and `executeWorkflow` inputs, i.e. exactly the
      node classes a Code-only diff is blind to.
- [ ] Topology assertion: no node reachable from itself; `conversation-sla-tracking-create` inbound ==
      `{Assign or unassign a Conversation1, if-conversation-unassigned}`; zero dangling edges; zero
      disconnected nodes.

### Step 4 (`respond-close-convo`) — same window
- [ ] Blocked until P7. Do **not** wire a placeholder.
- [ ] Expect **409**, not 200 (active respond.io webhook trigger, LESSONS §60). Judge by resulting
      state; have the user confirm in the UI that the trigger re-subscribed with no error.

### Canary (Step 5) — dev contact 437264483 only
- [ ] Ticket row appears in the CRM worklist; in-hours copy chosen; SLA comment carries MYT times.
- [ ] **The point of the change:** a second enquiry while the first is open creates a SECOND ticket.
- [ ] **New:** the ticket's `source_message_text` is non-empty (F1) and its `assigned_to_id` is the
      intended user (F3).
- [ ] `python3 n8n-workflows-init/scripts/export-workflows.py` and commit.

### Rollback
- [ ] `rrYXzE61gCNUck_zmXe-G` → publish `5018a189-22df-4cb9-aa89-fa509377abe9`
- [ ] `-WkzJMQZHmsFQm6A2abLJ` → publish `4a2e963d-dd2a-443e-bbb1-68b43ee29744`
- [ ] Rolling back the sub alone is safe. Rolling back close-convo alone is **not**.
- [ ] Operator symptom of the fail-loud path (F5), so it is not diagnosed from scratch: execution
      errors at `if-in-working-hours` with `Wrong type: 'MISSING_IN_WORKING_HOURS' is a string but was
      expecting a boolean`; contact has the ack, ticket + comment exist, no final message; the parent
      spine turn is also `error`. Cause = the CRM stopped returning `in_working_hours`. Fix the CRM;
      do not "fix" the If.

### After sign-off
- [ ] Delete the throwaway `mTfA5b9TgHItWo2g`.
- [ ] Build the parameterized redis-read helper (F7) — third session asking.
- [ ] `sub-add-comment-respond` (`2l8egTLJbyGOPvG-DbtDX`) is an UNGUARDED live sub with no `is_test`
      check at all. Not a flip blocker; it is why V2 needed a full test double. Own ticket.
- [ ] Remove the now-dead drain leg from `schedule-working-day-detection`.

---

## Note on process

The tester's case (f) FAIL is the most valuable single artefact in this slice — a negative case that
went red, was believed, and changed the code rather than the assertion. The build then re-ran the
matrix from scratch against the new versionId instead of reusing rows. That is the standard.

F1 and F3 both sit in the one place none of the three seats looked: **the caller**. The plan verified
the sub's trigger declaration, the coder verified the sub's expressions, the tester pinned the sub's
trigger — three independent verifications of the same object, and the payload the object actually
receives in production was never fetched. It cost two MCP calls to settle. Worth adding to the
harness contract: *for any change that reads a field off the trigger, fetch one real production
execution of that workflow and read the field off it.*
