# Reviewer DELTA sign-off — `intervention-tickets-s32` (re-review of F1/F2/F3)

Seat: `sorento-reviewer` · Date: 2026-08-13 · Supersedes nothing in
`intervention-tickets-s32-review.md`; it **amends** it. Read-only: **no workflow was edited,
published or executed in this review.** Every MCP call was `get_workflow_details` /
`get_execution` / `search_executions`. One local command was run:
`export-workflows.py --verify` (read-only staleness gate).

## State re-fetched at review time (not taken from any doc)

| artefact | id | state | verdict |
|---|---|---|---|
| live sub (promote target) | `rrYXzE61gCNUck_zmXe-G` | `versionId == activeVersionId == 5018a189-22df-4cb9-aa89-fa509377abe9`, `updatedAt 2026-07-22T01:27:32.239Z` | **UNTOUCHED** ✅ |
| live spine (new promote target) | `9qVyfUxmRQqrpGRMDLRuz` | export `--verify` current at `469e7259-6cfb-4505-bef4-f37a36bf454f` | **UNTOUCHED** ✅ |
| fork (built change) | `vUfFUDjLAuMaeQE6` | `16eadb1e-157b-419a-9441-e6510c40f4fc == activeVersionId`, `updatedAt 2026-08-12T15:04:30.778Z` | unchanged since prior review ✅ |
| clone (F1 fix) | `txiPzSxy3Pclsz6v` | `a01871ab-a36b-484d-849c-a935fd160944`, export current | as described ✅ (one caveat, §A4) |
| throwaway (matrix target) | `mTfA5b9TgHItWo2g` | `f7887fc2-2808-4b87-8fe1-9f11a40d304b == activeVersionId`, `updatedAt 2026-08-13T01:27:51.817Z` | re-swept by me ✅ |
| sink hop 1 | `69RhomhiCH4bpY1w` (BLOBTEST) | `86cc9542-5874-43e0-bb8d-899f67780345 == activeVersionId`, `updatedAt 2026-07-21` | unchanged ✅ |
| sink hop 2 | `tWm5DYLxfypmVC1T` | `ce78408e-c6fd-4378-b2b9-cd6b7e609001 == activeVersionId`, `updatedAt 2026-07-21` | unchanged ✅ |

---

# VERDICT: **APPROVE — with two blocking pre-PUT conditions (D1, D2)**

F1, F2 and F3 are all **discharged in substance**. The `input_message` expression is not just
correct, it is *better* than the canonical form it diverges from, and I can now prove the thing my
prior review could only worry about: the value cannot reach a customer. Zero-egress re-confirmed at
every current versionId, including the two artefacts that moved since the last review.

Approval is of the **diff**. It is not approval of a flip: P1/P2/P7 are peer-side and unmet (PR #137
is open, not merged, not deployed), and D1/D2 below must be cleared before any PUT.

| # | severity | finding | one-line |
|---|---|---|---|
| **D1** | **BLOCKING on the Step-2c PUT** | `input_message` sits in `workflowInputs.value` while its schema entry says `removed: true` | unprecedented in this repo; unproven that n8n transmits it; the fix has never executed anywhere |
| **D2** | **BLOCKING (runbook)** | the spine is in flip scope but absent from Step 1's backup list, P6 and the Rollback section | a promote target with no recorded rollback pointer |
| D3 | MEDIUM | F2 answered in full — and the two PUT targets have **different** `settings` objects | plus: build the PUT body from 4 keys only; never echo `pinData`/`nodeGroups` |
| D4 | MEDIUM | P1 must be verified against **prod**, on all three response shapes, before Step 3 | the fail-loud sentinel turns a missing `in_working_hours` into a customer dead end |
| D5 | MEDIUM | `assigned_to_id` raw interpolation is now load-bearing (F3's answer promoted it) | and the fixtures suggest the backend **silently substitutes** rather than rejecting a bad id |
| D6 | LOW | `.message.message` dereferenced twice without `?.` | one level deeper than the existing `message_id` read; live evidence says probably benign |
| D7 | LOW (doc) | the matrix's fixture-provenance paragraph is now itself stale, and its 8h-skew narrative is contradicted by the fixture file | a later reader will distrust the now-correct file and believe live shipped wrong deadlines |
| D8 | LOW | P3 (`LLEN sorento-respond-assignee-queue == 0`) is currently **unverifiable** | the redis-read helper is still blocked; a precondition nobody can evaluate is not a precondition |

---

## A. F1 — the `input_message` fix: **CORRECT, and adversarially better than canonical**

The expression, as stored on the clone:

```
={{ $('tf-message').first().json.message.message.text || $('tf-message').first().json.message.message.attachment?.description || '[' + ($('tf-message').first().json.message.message.type || 'unknown') + ' message]' }}{{ $('tf-message').first().json.message.replyTo?.message ? ' reply to: ' + $('tf-message').first().json.message.replyTo.message.text : '' }}
```

**The runbook Step-2c hunk is byte-identical to what was built** — I compared the clone's stored
string against the runbook's code fence programmatically: `True`. No trailing whitespace.

### A1. Where the value actually lands — the question that decides the `[<type> message]` fallback

The brief asked whether the label can leak to a customer-facing surface. **It cannot.** I grepped
every sendmsg variant in the export set:

- `sub-sendmsg` (`aoydkG1dbItXR5jXFEQsP`, live, current at `91171ac3`): `input_message` occurs
  **twice** — once as a trigger input declaration, once inside `pinData`. **No node reads it.**
- `sub-sendmsg-CHAT` (`ublq9nSlrpz63xan`): one occurrence, the trigger declaration. No reader.
- `zz-sub-sendmsg-BLOBTEST` (`69RhomhiCH4bpY1w`): declared on the trigger, no reader.

So the three sendmsg callers inside the HI sub map a field that is **dead on arrival**. After the
flip the value has exactly **one** consumer: `source_message_text` in the create body → the CRM
worklist enquiry snippet, a **staff-facing** field. `[voice message]` / `[attachment message]` is a
sensible worklist label and matches existing house style on this very spine — `send-voice-not-allowed`
already sends `[voice note] {{ … }}` and `sorento-sub-respond-sendmsg-presign-fail` sends
`[attachment-failed follow-up] {{ … }}`. No absurdity, no internals leaked.

(Corollary worth recording: the coder's stated second motive — "the sub's three sendmsg callers
already read `input_message`" — is true of the *mapping* and false of the *consumption*. Fixing it
buys nothing on that path. It buys the ticket snippet, which is the whole point.)

### A2. Dropping `|| $json.message` — **correct, and copying it would have been a bug**

The canonical form used by 4 spine callers is
`… .text || $('tf-message').item.json.message.message.attachment.description || $json.message`.
Those 4 callers are `sorento-sub-respond-sendmsg-respond{,2,4,5}` — i.e. the **outgoing reply**
nodes, where `$json` is the shaped bot reply. So `$json.message` there is the **bot's own text**.
Harmless today only because nothing reads `input_message`; transplanted to the HI caller it would
have put the bot's words into a field labelled "the customer's enquiry" and stamped them onto a CRM
ticket. **Dropping it loses no real case** — the new chain is total (text → caption → type label),
so it can never fall through to a fourth term anyway.

### A3. `attachment?.description` — right, and it exposes a latent live bug (out of scope)

`a || b || c` evaluates `b` only when `a` is falsy. So the canonical unchained
`attachment.description` never fires on a text message — which is why 4 live callers have carried it
for months without incident. On a non-text message with **no** `attachment` key it would dereference
`undefined`. The new form's `?.` removes the question. Note for a separate ticket: the same
unchained form is still live in those 4 callers.

Path shape independently corroborated: `tf-message`'s body is
`if ($input.first().json.message?.message) { return $input.first().json.message.message }` — its
output is the respond.io event, so `.json.message` is the message envelope (which is why the
pre-existing `message_id` mapping reads `$('tf-message').first().json.message.messageId`) and
`.json.message.message` is `{type, text}`. Consistent with the coder's 25/25 observation.

### A4. "Exactly one node changed on the clone" — confirmed as far as it can be, stated honestly

What I verified myself: the clone is at `a01871ab` with the export `--verify` green; it has 148
nodes; `Call 'sub-human-intervention'` carries the new expression and still forces `is_test: true`;
it still targets the **fork** `vUfFUDjLAuMaeQE6`, not live `rrYXzE61…`.

What I could **not** verify: that *only* that node changed. There is no committed export at
`be62b3a8` (HEAD's clone manifest is `bd0023ac`, far older) and the clone's most recent retained
execution is `12183425` @ 2026-08-12T09:36Z, which predates the PUT — so no post-change execution
embeds a `workflowData` to diff against. I accept the coder's param-sha claim, and note the residual.

### D6 (LOW) — `.message.message` without optional chaining

The new expression dereferences one level deeper than the pre-existing `message_id` read: if a
message envelope ever lacks its inner `message`, the base of `.text` is `undefined`. Two live
executions argue this is benign on **this** n8n: in `12261948` and `12184876` the spine maps
`current_assignee: $('sorento-sub-respond-findcontact-respond').first().json.assignee.id` while
`assignee` is `null`, and the result is an **absent key**, not a node error. So member access on a
null base appears to yield `undefined` here rather than throwing. Still, `?.` on the two
`.message.message` bases costs one character each and removes the argument entirely. Recommended,
not required.

### D1 (BLOCKING) — `removed: true` on a key that is present in `value`

This is the one new defect, and it is in the same family as F1 itself.

The clone's `Call 'sub-human-intervention'` now has `input_message` in
`parameters.workflowInputs.value`, while the **same node's** `workflowInputs.schema` entry for
`input_message` carries `"removed": true` (as does `started_at`, which is correctly absent from
`value`). I swept **all 18 exported workflows** for the pattern "a key in `value` whose schema entry
is `removed: true`":

```
('clone-sorento-consume-main-TEST/workflow.json', "Call 'sub-human-intervention'", ['input_message'])
total nodes with value-key marked removed=True: 1
```

Every one of the 7 working precedents on the live spine has `removed: false` (the 4
`sorento-sub-respond-sendmsg-respond*` callers) or **no schema entry at all**
(`send-transcript-confirm`, `send-voice-not-allowed`, `sorento-sub-respond-sendmsg-presign-fail`).
Nothing in this repo demonstrates that a `removed: true` field is still transmitted.

Why it matters: if `removed` is consulted at runtime — or if the next UI save reconciles `value` to
`schema` — the spine hunk is a **silent no-op**, `source_message_text` stays `""`, and F1 ships
unfixed with a review that says it was fixed. That is precisely the class this round exists to close.

Compounding it: **the F1 fix has never been executed anywhere.** The clone has not run since the PUT
(above). The one fork execution after it, `12244984` @ 2026-08-12T21:34Z, has parent
`RnpxEnAV3g20MmKj` (a chat-trigger caller, not the clone) and shows `input_message: null`. And two
**fresh** live-sub executions I pulled today — `12261948` (2026-08-13T00:47Z, parent
`9qVyfUxmRQqrpGRMDLRuz`) and `12184876` — both still show `"input_message": null`, re-confirming the
defect is live and unfixed.

**Required, either:**
- (a) set the schema entry's `removed` to `false` on the clone **and** in the Step-2c spine hunk, so
  the promoted node matches all 7 working precedents; **or**
- (b) prove transmission by execution before the sub flip — see the sequencing recommendation in §D2,
  which gets this for free.

Cheapest correct answer is (a) *and* (b).

---

## B. F2 — the PUT-body question, answered in full (D3)

**Enumerated from live, not from docs.**

| target | live `settings` |
|---|---|
| sub `rrYXzE61gCNUck_zmXe-G` (Step 3) | `{executionOrder:"v1", availableInMCP:true, callerPolicy:"workflowsFromSameOwner", binaryMode:"separate", timeSavedMode:"fixed", timezone:"Asia/Kuala_Lumpur"}` |
| spine `9qVyfUxmRQqrpGRMDLRuz` (Step 2c) | `{availableInMCP:true, binaryMode:"separate", callerPolicy:"workflowsFromSameOwner", executionOrder:"v1"}` — **no `timeSavedMode`, no `timezone`** |

**The two targets need different strip lists.** The runbook's fix (`del(.settings.binaryMode,
.settings.timeSavedMode)`) is right for the sub and over-broad-but-harmless for the spine, where
only `binaryMode` exists.

**Empirical discharge, which is stronger than the schema argument:** the clone PUT that carried this
same fix succeeded, and the clone's post-PUT settings are
`{availableInMCP, binaryMode, callerPolicy, executionOrder}`. That proves `availableInMCP`,
`callerPolicy` and `executionOrder` are **accepted** by the public PUT on this instance — i.e. the
spine's entire settings object minus `binaryMode` is proven-good. For the sub, the only key not
covered by that proof is **`timezone`**, which is a long-standing documented `workflowSettings`
field; risk LOW, and the prior checklist already asserts it survives.

Also note: the clone **retained** `binaryMode` after a PUT that omitted it, so `settings` behaves as
a **merge**, not a replace. Do not expect stripping a key to remove it; assert post-PUT state, not
body content.

**Other top-level keys — the gap the F2 discussion did not cover.** A REST GET (and the export)
returns `id, name, active, versionId, activeVersionId, nodes, connections, settings, staticData,
pinData, meta, description, nodeGroups`. The public PUT accepts a small set. Build the body as
exactly **`{name, nodes, connections, settings}`** and nothing else. Specifically:
- **never echo `pinData`** — pinned data on a live workflow is a real hazard, not a 400. The clone
  carries `pinData`; the live sub does not. Assert `pinData` absent from the payload.
- `nodeGroups`, `meta`, `description`, `staticData`, `active`, `versionId`, `activeVersionId`,
  `id` — strip.

---

## C. F3 — discharged; one residual on the n8n side (D5)

The peer's answer settles both halves:
- `assigned_to_id` **is** honoured, it **is** the CRM `users.id` UUID, and `next-assignee`'s
  `assignee_id` **is** that UUID — corroborated by live exec `12199710`, where `assignee_id` is
  `3760012d-7f5a-4b44-bf1a-e3349f7b398d`, UUID-shaped. So the field n8n sends is the right field in
  the right shape. ✅
- the round-robin pick owning the ticket is now a **decision**, not an accident; and the revised
  contact-first `agent-replied` rule removes the false-breach path I raised (the replier no longer
  has to equal the ticket owner for the clock to stop). ✅ **The consequential half of F3 is gone.**

**Nothing blocking remains on the n8n side.** Two things to record rather than close:

1. **D5 — the raw interpolation is now load-bearing.** The body still renders
   `"assigned_to_id": "{{ $('get-round-robin-assignee').item.json.assignee_id }}"` — raw, between
   quote chars, unlike the three hardened neighbours. Now that the field decides ticket ownership, a
   `null` `assignee_id` renders the literal string `"null"` and ships a bogus owner. My prior review
   filed this as cosmetic (F4.1); the peer's answer upgrades it.
2. **One question the peer's answer does not resolve.** `create-body-sample.json` requested
   `"assigned_to_id": "USR-0042"`; every fixture in `create-response-fixtures.json` comes back
   `"assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"`. If the route honours the field, a bad
   id should have 4xx'd — instead it appears to have **silently substituted**. Ask: what does
   `/integration` do with an unknown or malformed `assigned_to_id`? If it substitutes silently, then
   (1) above has no loud failure mode and the canary assertion on ticket ownership is the only
   detector.

Operational note, not a defect: on the already-assigned path the SLA comment still goes to the
round-robin pick (`user_id: assignee_respond_user_id`), so the human actually holding the
conversation is notified by nothing. That is unchanged from live — the deleted `Call '…respond'1`
also addressed the round-robin pick — so it is not a regression, but it is now the design.

---

## D. The re-run matrix — timestamp assertion restored, staleness handling honest-but-mislabelled

**Yes, the assertion is restored and it is a real assertion.** Both runs assert a genuine +8h
UTC→MYT conversion of values the workflow did not author: old `2026-08-12T13:58:54.229717` →
`21:58:54`; new `2026-08-13T01:25:12.693268` → `09:25:12`. The refresh moved the inputs, not the
meaning, and the run quotes the full rendered comment string rather than a substring — the
"assert at the rendered boundary" standard.

**It also gained coverage it did not have.** The new out-of-hours fixture normalises `due_at` to a
working-window boundary (`2026-08-14T01:00:00`) that lands on a **different calendar day** than
`initiated_at`. The old fixtures never exercised a day rollover; cases (c)/(d) now do, and render it
cleanly. That is real added signal, not a re-run for its own sake.

**I re-verified the tested object myself** (it moved since my last review, so this could not be
carried forward):

- `mTfA5b9TgHItWo2g` @ `f7887fc2… == activeVersionId`, 16 nodes,
  `6 code · 4 if · 3 executeWorkflow · 2 redis · 1 executeWorkflowTrigger`.
- Raw-substring sweep over the full JSON: `@respond-io/…respondio` **0**, `n8n-nodes-base.httpRequest`
  **0**, `memoryPostgresChat` **0**, `n8n-nodes-base.postgres` **0**, `aoydkG1dbItXR5jXFEQsP` **0**,
  `sorento-respond-assignee-queue` **0**. The 2 hits on `2l8egTLJbyGOPvG-DbtDX` are inside the
  comment stand-in's **header comment**, not a node target — I printed the context to confirm.
- All 3 `executeWorkflow` nodes → `69RhomhiCH4bpY1w`. Both `redis` nodes are the harness pair
  (`test-guard-record` → `test:egress:{test_run_id}`, `chat-escalation-push` → `chat:reply:…`),
  neither reachable in any case (`chat?` and `test-guard` both FALSE in all six runData sets).
- **The logic under test is still the fork's own bytes:** `if-in-working-hours` sha `722d7448d591`
  and `if-conversation-unassigned` sha `50391b189ae0` — identical to the fork I re-fetched today.
  The create stand-in's sha moved to `20c67a6b2079`, and I read its `jsCode`: only the `FIXTURES`
  literal changed; `_rendered_body_raw` is still the fork's `jsonBody` verbatim modulo `{{ }}`→`${ }`
  (same `assigned_to_id` raw between quotes, same three `JSON.stringify(x ?? '')`, `message_id`
  unquoted, `source_message_id` quoted, `source_message_text` via `JSON.stringify(x || '')`).

**Zero-egress re-confirmed to the terminal sink**, both hops re-fetched: BLOBTEST `86cc9542` has zero
credentialed send nodes (`Send a Message` and `HTTP Request` are name-preserving **Code** stand-ins)
and both save legs → `tWm5DYLxfypmVC1T`, which is 2 nodes with `list: "sorento-respond-message-TEST"`
as a **plain literal** (no `=` prefix), unchanged since 2026-07-21. The 11 sub-executions the matrix
records are the entire reachable egress, and it terminates in a list no consumer reads.

### D7 (LOW, doc) — the staleness note is now inverted, and the "why" is wrong

The run says `create-response-fixtures.json` "is out of date and carries its own `_STALE_WARNING`".
That was true when written; **the file has since been refreshed**. I diffed it against the
throwaway's embedded `FIXTURES` — all three fixtures match **verbatim**, and there is no
`_STALE_WARNING` key. A later reader following the matrix's instruction will distrust the only
correct copy.

Worse, the two documents disagree on the *reason*. The matrix says the create route "was storing
aware→naive-Malaysia datetimes into naive-UTC columns, an 8h skew". The refreshed file's own
`_timestamp_note` says the opposite and is more specific: the skew lived **only** in
`update_sla_tracking_status_integration` and touched **only** `responded_at`/`resolved_at`;
`initiated_at`/`due_at`/`due_at_resolution` came from `create_tracking` and were always true naive
UTC — *"no staff-facing deadline was ever 8h late"*. The peer's provenance is the authority.
Fix the matrix paragraph, or this repo will carry a belief that live shipped wrong SLA deadlines.

Everything that actually gates the verdict is honest: the run names the throwaway's embedded values
as its authoritative source, quotes them, and I confirmed them against the live JSON myself.

---

## E. Runbook sanity — new scope (Steps 2c, 4b, 4c, P7–P9, PR #137)

**Right, and worth saying so:** the 4b sequencing landmine ("the broken policy predicate is
accidentally narrowing the blast radius — never fix the policy lookup alone") is the sharpest thing
in the document and is stated in the right place. The concurrent-edit warning on `respond-send-user`
is correct and current (export `--verify` confirms it at `9b779edd`). Rejecting the
`is_resolved`-off-a-preferred-row alternative on unowned-`ORDER BY` grounds is still right. The
`open_ticket_count` denominator-collision warning and the `.view`-permission gap are both the kind of
thing that is normally lost in chat.

### D2 (BLOCKING) — the spine joined the flip but not the flip's bookkeeping

Step 2c says "capture it in Step 1 alongside the other two", but:
- **Step 1** still lists two targets and two versionIds.
- **P6** still gates only the sub's versionId.
- **Rollback** still names only two publish-back pointers.

Record explicitly: spine rollback = publish `469e7259-6cfb-4505-bef4-f37a36bf454f`. Also fix the
document header, which still says "two live workflows in one window" — it is now three (spine, sub,
close-convo), four when 4b lands.

**And a sequencing improvement that also settles D1 for free.** The header's "doing only the first is
worse than doing neither" argument binds the **sub** and **close-convo**. It does **not** bind the
spine: adding `input_message` is a strict no-op against today's live sub (which passes it only to
sendmsg, where nothing reads it). So:

> **PUT the spine hunk FIRST, alone, and let it sit.** Then read one real intervention's sub-trigger
> data (`get_execution` on a `rrYXzE61gCNUck_zmXe-G` execution, node `When Executed by Another
> Workflow`). `input_message` non-null and carrying the customer's text = D1 empirically closed and
> F1 proven end-to-end, in production, with **zero** dependency on PR #137 and a one-line rollback.
> Only then open the sub + close-convo window.

Predicted status codes differ per target and the runbook should say so: the spine's triggers are
`scheduleTrigger` + `executeWorkflowTrigger` — **no** respond.io webhook — so expect **200**, same as
the sub. Only Step 4's `respond-close-convo` should expect **409** (LESSONS §60).

### D4 (MEDIUM) — P1 must be checked against prod, on all three shapes

The fail-loud sentinel converts "CRM stopped returning `in_working_hours`" into a hard stop *after*
the customer has been acked and the ticket created. The PR #137 section says `in_working_hours` is
"pinned by contract test on all three response shapes" in **#137**, which is open and undeployed. So
P1's "returns `in_working_hours`" must be verified against the **prod** build, on **fresh in-hours,
fresh out-of-hours, and retry/`already_active`** — not against the dev branch the fixtures came from.
If prod's current `/integration` omits the key on any shape, Step 3 ships a customer-visible dead end
on day one. Make that explicit in P1; today it reads as satisfiable by a single curl.

### D8 (MEDIUM) — P3 is currently unverifiable

P3 requires `LLEN sorento-respond-assignee-queue == 0` at flip time. The runbook's own closing
section documents that no redis read is available and that creating the helper was denied. A
precondition nobody can evaluate is not a precondition. Either unblock `zz-redis-read` (the design in
the runbook — no webhook, key allowlist — is sound and I endorse it) or downgrade P3 to a recorded,
accepted risk with the reason. Do not let it be silently ticked in the window. This is the fourth
session to ask for the helper.

### Smaller runbook items

- Step 4b: add "re-run `export-workflows.py --verify` immediately before building the payload" — it
  catches the concurrent-edit drift mechanically instead of by memory.
- P8b is **satisfied**: fixtures re-captured post-#137 and the matrix re-run fresh (executions
  `12265871`, `12265978`, `12266078`, `12266195`, `12266296`, `12266396`). Mark it green with those ids.
- P9 stands and is correctly framed as a live customer-facing failure, not canary noise. It is also
  upstream of the ticket create, so the flip cannot help the affected contacts.

---

## PROMOTE CHECKLIST — delta

The prior review's checklist stands in full
(`intervention-tickets-s32-review.md` §PROMOTE CHECKLIST). Apply these amendments.

### Cleared — remove from the blocker list
- [x] ⛔ **F1 decision recorded** — option (a), spine mapping. Built, evidenced, hunk byte-verified.
- [x] ⛔ **F2** — `del(.settings.binaryMode, .settings.timeSavedMode)` added to Step 3; see D3 for the
      per-target correction.
- [x] ⛔ **F3** — peer confirmed `assigned_to_id` semantics and ticket ownership; contact-first
      `agent-replied` removes the false-breach path.
- [x] **P5 / P8b** — matrix ALL PASS 6/6 on refreshed fixtures against `f7887fc2`, target re-verified
      by me.
- [x] **Matrix re-run after the change** — done, from scratch, against the new versionId.

### New blockers
- [ ] ⛔ **D1** — set `input_message`'s schema `removed` to `false` on the clone **and** in the
      Step-2c hunk; **or** prove transmission by execution first (see the sequencing item below).
      Do not PUT the spine with `value`/`schema` disagreeing.
- [ ] ⛔ **D2** — add the spine to Step 1 (rollback `469e7259-6cfb-4505-bef4-f37a36bf454f`), to P6,
      and to the Rollback section. Fix the "two live workflows" header.
- [ ] ⛔ **D4** — verify P1 against **prod**, on all three `/integration` response shapes.
- [ ] **D8** — resolve P3: unblock the redis helper, or record it as an accepted risk with a reason.

### Sequencing (replaces "one window" for the spine)
- [ ] Spine hunk **first, alone**. Expect **200** (no respond.io webhook on the spine).
- [ ] Then: one real intervention → `get_execution` on the sub, node `When Executed by Another
      Workflow` → assert `input_message` is non-null and carries the customer's text.
      **This is the D1/F1 proof.** Today's baseline for comparison: `12261948` and `12184876`, both
      `"input_message": null`.
- [ ] Only then open the sub + close-convo window, which remain jointly gated as before.

### PUT-body hygiene (both targets)
- [ ] Body = **`{name, nodes, connections, settings}`** only. Strip `pinData`, `nodeGroups`, `meta`,
      `description`, `staticData`, `active`, `id`, `versionId`, `activeVersionId`.
      **`pinData` is the dangerous one** — it is accepted, not rejected.
- [ ] Spine: strip `binaryMode` (it has no `timeSavedMode`, no `timezone`).
      Sub: strip `binaryMode` **and** `timeSavedMode`; assert post-PUT that `timezone` and
      `callerPolicy` survived. `settings` **merges** — judge by the re-GET, not by the body.
- [ ] Spine hunk touches exactly one key on exactly one node
      (`Call 'sub-human-intervention'.parameters.workflowInputs.value.input_message`). Param-hash
      every other node on both sides and require equality.

### Canary additions (Step 5)
- [ ] `source_message_text` non-empty **and equal to the customer's actual message text** — not just
      non-empty (D1 would fail this).
- [ ] Ticket `assigned_to_id` == the round-robin pick, on both the unassigned and the
      already-assigned path (D5).

### Recommended, not blocking
- [ ] **D6** — `?.` on the two `.message.message` bases in the spine expression.
- [ ] **D5** — harden `assigned_to_id` the way its three neighbours were, and ask the peer what
      `/integration` does with an unknown/malformed id.
- [ ] **D7** — correct the matrix's fixture-provenance paragraph (the JSON file is now current; the
      8h skew never touched `initiated_at`/`due_at`).
- [ ] Ticket: the 4 live spine sendmsg callers still carry unchained `attachment.description`.

---

## Note on process

The F1 fix is right for the reason the previous round was wrong: whoever built it went and looked at
what the caller's upstream node actually emits, chose *against* the copy-paste form on evidence, and
wrote down which part of the choice was observed (text messages, 25/25) and which was carried on
authority (the attachment branch). That is the standard.

D1 is the same lesson one turn later, and it is worth naming plainly: the fix verified the
**expression** and never verified that the platform will **send** the field. `removed: true` is the
new `input_message` — a declaration-vs-behaviour gap, sitting in a state that appears nowhere else in
18 workflows, in a change that has never once executed. One production execution closes it, and the
sequencing above gets that execution for free.
