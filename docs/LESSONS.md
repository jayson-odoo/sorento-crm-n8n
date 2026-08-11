# LESSONS.md — n8n / MCP gotchas + harness patterns

Hard-won knowledge. Read before editing workflows or building harness pieces — every item here cost real time to discover.

## n8n MCP / API mechanics

1. **MCP `execute_workflow` CANNOT pass custom JSON to an `executeWorkflowTrigger`** (its `inputs` only support chat/form/webhook). So nothing safety-relevant may read `$('When Executed by Another Workflow').…` — it's undefined at run time. **Control rides in the redis item** the clone pops; read it at `$('redis-pop-main-message-list').first().json.message.<field>`. To fire an exec-trigger-only workflow, use a Manual-Trigger wrapper (`zz-canary-run`).
2. **MCP cannot create credentials.** Postgres + n8n-API creds must be made by the user in the n8n UI. Find IDs via `list_credentials`.
3. **`update_workflow` is granular ops only** (max 100, no full-replace). To clone a workflow → **UI Duplicate** (lossless). The SDK has NO raw-JSON import; hand-porting 75+ nodes is lossy — don't.
4. **Avoid `renameNode`** — whether it rewrites `$('X')` expression strings is unverified. To rename a referenced node, use **remove + re-add a NoOp keeping the original name** (refs are plain strings in other nodes' params, untouched by `removeNode`; a new same-named node that executes satisfies them).
5. **You cannot bypass a node that's referenced by `$('X')` elsewhere** — if it doesn't run, `$('X')` returns undefined → errors. Pattern to inject/replace such a node: `IF gate → [fixture/alt branch | real <X>-http] → NoOp named X → downstream`. The NoOp (same name) feeds all `$('X')` refs.
6. **`get_workflow_details` >25k tokens saves to a file** — jq/grep it, never read whole. Diff two workflows by node-name set + per-node `.parameters` sha.
7. **Capture per-node I/O via REST:** `GET {N8N_API_BASE}/executions/{id}?includeData=true` (header `X-N8N-API-KEY`) returns `data.resultData.runData` **including sub-executions**. OUTPUT = `runData[name][run].data.main`; INPUT = resolve from `run.source[].previousNode`'s output (runData doesn't store a separate input). Inside a workflow, use the native `n8n` node (execution:get) bound to an `n8nApi` cred — **a 404 means the credential's Base URL is wrong** (must be `…/api/v1`).
8. **`metadata.subExecution.executionId` is NOT reachable from a downstream Code node** (`$input.first()` exposes only `json`/`pairedItem`). For sequential firing, fetch latest-by-workflowId **+ a self-verify guard**: assert the fetched execution carries the unique marker you injected (`message.test_run_id`), throw on mismatch — refuse to write mis-attributed data.
9. **`manualTrigger` can't take MCP inputs.** Parameterize via the first Code node's defaults; edit those defaults to change run scope (e.g. `limit_conversations`, a stable `run_label` for resumability).
10. **`create_workflow`/`update_workflow` may auto-bind Postgres nodes to the WRONG credential** (the prod `sorento-crm-db`). ALWAYS verify every postgres node points at `n8n_test-db` (`Dnnofg8Xb27VQOhI`), never a prod DB. This is a prod-write footgun.
11. **Schema-qualified table refs:** the DATABASE is `n8n_test` but tables are in schema `public`. `n8n_test.respond_contacts_test` is read as schema=`n8n_test` (doesn't exist) → "relation does not exist". Use unqualified `respond_contacts_test`.
12. **The clone's redis item needs deep nesting** `message.message.message.text` (tf-message reads `…message.message.message.text` via `…json.message.message`). Canary fixtures masked this because mocks bypass that path; the real capture path hit it.
13. **Pre-existing validation warnings — do NOT "fix":** hardcoded `x-api-key` on httpRequest nodes, `DISCONNECTED_NODE` on the deliberately-orphaned egress nodes, OpenAI `builtInTools`, the transcribe expression-prefix. They're in live too.
14. **Permission classifier** auto-denies `execute_workflow` until an allow-rule exists (`.claude/settings.local.json` → `permissions.allow: ["mcp__n8n-mcp__execute_workflow"]`). It also denies prod-host probing and hardcoded-cred use against live — never bypass; report and ask.
15. **Shell var with spaces breaks** in zsh (`PSQL="psql -h …"` then `$PSQL`). Inline the full psql command every call.

## Harness / safety invariants

16. **Fail-closed beats flag-gated** for the clone: orphan egress nodes (0 inbound → physically unreachable) rather than trusting a flag to be set right. Hardcode `is_test=true` on every shared-sub call from the clone.
17. **Shared subs are LIVE-shared.** A top-of-sub `IF is_test` guard is prod-safe ONLY IF no live caller passes it truthy (verify in the live spine). Guards must be **published** (`versionId==activeVersionId`) or `executeWorkflow` calls resolve to the UNGUARDED published version → real egress.
18. **Determinism for golden-master:** pin ALL non-determinism — 2 LLMs (parser gpt-4.1-mini, reformulator gpt-5.4-mini) via mocks; CRM reads (resolve-entity, check-access, get-access-types, get-results) via fixtures; ignore timestamps. `get-rag` runs live in replay (deterministic, no false diffs — not pinned). Session via the `n8n_test` `respond_contacts_test` copy, reset per conversation.
19. **Session-fidelity caveat:** the seed session is empty (real historical session unrecoverable). Golden = clone behavior under a neutral-seed replay of historical MESSAGES, NOT reproduction of historical OUTCOMES (e.g. a bare "Yes" may re-resolve instead of clarifying). Capture↔replay share the identical seed → diffs are apples-to-apples → regression detection (detect CHANGE vs golden) is intact. State this next to any baseline.
20. **Diff keys on `node_id`** (stable UUID from `workflowData.nodes`), not `node_name` — else a rename false-positives as missing+new. Remove+re-add gets a new id (correctly a new node).
21. **Normalization over-stripping is the silent killer** of a golden-master harness — it hides real regressions. Only harness machinery + LLM/live-read SOURCE nodes may be `volatile`; every one must have a non-allowlisted downstream consumer where the business data is re-diffed.
22. **`Basic LLM Chain` (gpt-4.1-mini) is the clarification path**, gated behind `validator.has_result=false` — it is NOT always-on and NOT a bug when it doesn't run. The reformulator (gpt-5.4-mini) is the primary semantic parser that runs every turn.

## Versioning & promotion (draft vs active)

23. **`get_workflow_details` returns the DRAFT *and* the ACTIVE version.** `versionId != activeVersionId` ⇒ an unpublished draft exists. **CORRECTED 2026-07-21:** the response *does* carry an `activeVersion: {nodes, connections}` block, so a full draft-vs-active diff **is** available via MCP — you do NOT need version history or REST. (Earlier text claimed the opposite; it cost a promotion gate.) Practical form, on the saved-to-file output:
    ```
    jq -r '(.workflow.nodes|map({key:.id,value:(.parameters|tojson)})|from_entries) as $d
         | (.workflow.activeVersion.nodes|map({key:.id,value:(.parameters|tojson)})|from_entries) as $a
         | [ ($d|keys)[] | select($a[.] != null and $d[.] != $a[.]) ] | join(",")' FILE
    ```
    Run this immediately before any publish (LESSONS §24 revert-landmine) — it turns "publishing might ship someone else's draft" from an unknowable risk into a one-command check.
24. **`publish_workflow` ships the WHOLE draft, not just your hunk.** Editing a workflow in the n8n UI silently creates/updates a draft; a later `publish` then ships everything in it. This is a **revert-landmine**: a stale draft can undo a prior promotion. Seen twice this session — a UI save reverted the confident parser to its draft state (active stayed correct; only the draft diverged). **Before ANY publish: confirm the draft == intended state** (sha the systemMessage + the node(s) you changed). Re-publishing the active versionId does **NOT** reset the draft (they're independent pointers).
25. **Big-param promotion = byte-exact + sha-gated, never hand-retyped.** For a 20k+ char `systemMessage`/`jsCode`, don't inline it into `setNodeParameter` from memory (transcription drift on box-chars/regex/backticks). Source the exact string from the validated test copy, write it, and **sha-verify the draft BEFORE publish and the active AFTER publish; auto-revert (`publish_workflow` the prior versionId) on any mismatch.** Capture the prior versionId + node bodies as a backup first.
26. **Live-write authorization must be in the agent's INITIAL task, not a relayed follow-up.** The permission classifier treats a coordinator `SendMessage` as non-authoritative and will deny a live write added mid-session (it denied a "third write" this way). Either author the write in the main loop (direct user authorization) or spawn a fresh agent whose opening task IS the authorized write.

## Speed (avoid the slow paths we hit)

27. **Token tax is the #1 slowdown.** `get_workflow_details` (100–230 KB) and `get_execution(includeData=true)` overflow the token limit, dump to a file, and force jq/python extraction *every* call — and every sub-agent re-fetches the same giant workflow. Fixes: (a) keep a **local mirror** of the key workflow JSONs, re-fetch only when `versionId` changes; (b) `get_execution` with **`nodeNames` + `truncateData`** to pull only the nodes you need; (c) `includeData=false` first to check status; (d) pass extracted **IDs/shas** between agents, not whole files.
28. **Deterministic tier is ~0-token / ~35 ms — use it for everything it can cover.** Inject `message.mock_reformulator_output` (consumed by the reformulator sub's `test-reformulator-bypass` when `is_test=true`) to pin parser output and exercise downstream branch logic with zero LLM cost. Reserve real-reformulator runs for cases that must prove emission/extraction. **But a change INSIDE the reformulator (e.g. `output_exchange`/`deriveRouting`) is invisible to the mock** — it needs the real copy. (Note: the active bypass is `mock_reformulator_output`, NOT the clone's `mock_parser_output`/`parser-bypass-gate`, which feeds `Basic LLM Chain`.)
29. **Sample, don't sweep, for routine validation.** Full-corpus golden replay is slow + fragile: the replay orchestrator **wedged at 174/627 turns and sat fake-`running` ~39 h** (status never flipped; no new `replay_node_diffs` rows = dead worker → kill via `POST /executions/{id}/stop`). For most changes, a **small representative sample mined from `chat_histories`** (positive + negative paths, pre-labelled with expected outcome) catches regressions far faster; reserve full-corpus for high-risk changes.
30. **Don't let UAC and replay collide on the redis list.** Both consume `main-message-list-test`; running concurrently makes one pop the other's item, and `zz-canary-seed`'s Clear List corrupts an active replay. Serialize, or give replay its own list. (See harness lesson on contention.)
31. **Clean parser-tier session without touching prod:** `uac` mode reads PROD `conversation-variables` (pollutes via the reuse path, silently dropping new entity fields). Use **`mode=regress-capture`** so session sources from `n8n_test.respond_contacts_test`; reset the contact row to `{"variables":{}}` **between independent cases** (never within a multi-turn sequence) via the in-n8n Postgres cred `Dnnofg8Xb27VQOhI` (host psql is unavailable — repo `.env` password is a placeholder). Injecting `previous_conversation_state` in the redis item does **NOT** work — the reformulator reads it from `get-session-vars`, not the item.

## Efficient n8n-MCP dev loop (research-backed — verify flags against THIS server)

> This server is the **SDK-based** n8n-mcp (`update_workflow` ops, `create_workflow_from_code`, `prepare_test_pin_data`, `test_workflow`). Classic-server features in public blogs — `get_workflow_details` detail/minimal modes, `autofix_workflow`, version `rollback` — are **NOT on this surface**; don't assume them. Refs: github.com/czlonkowski/n8n-mcp (+ docs/workflow-diff-examples.md), n8n 2.0 publishing docs (support.n8n.io/article/understanding-workflow-publishing-in-n-8-n-2-0).

32. **`setNodeParameter` vs `updateNodeParameters` — know which.** `setNodeParameter {nodeName, path:"/json/pointer", value}` writes exactly ONE leaf, byte-exact — the right tool for "change this one string." `updateNodeParameters {nodeName, parameters, replace?}` **deep-merges by default** (`replace:true` = wholesale) — convenient but leaves stale sibling keys. For surgical single-field edits (our systemMessage/jsCode promotions) use `setNodeParameter`.
32b. **`setNodeParameter`'s `path` is a JSON pointer RELATIVE TO `parameters` — never prefix it with
    `/parameters/`.** Writing `path: "/parameters/jsCode"` does **not** overwrite `parameters.jsCode`;
    it silently creates `parameters.parameters.jsCode`. The op returns success, `appliedOperations`
    counts it, validation raises nothing, and a re-fetch shows your value present in the JSON — but
    the node keeps executing the OLD value, because nothing reads that nested key. **Correct form is
    `/jsCode`, `/list`, `/workflowId`, `/workflowInputs/value/data`.** This is a live footgun: it
    looks applied and does nothing, and it cost a wasted UAC run before it was spotted (cycle-2b
    tester finding F8). Detection: after the edit, confirm the ORIGINAL key changed — a stray
    `parameters.parameters.*` in the re-fetched node is the tell. When unsure, use
    `updateNodeParameters {replace:true}` with the full parameters object instead.

33. **Batch edits: ONE `update_workflow` call, ≤100 ops, atomic + ordered.** "rename + rewire 2 connections + patch a param" = one call (one validate, one save, all-or-nothing) — not three round-trips. Public guidance: diff-style ops cut ~80–90% tokens vs full-JSON replacement. Full-JSON only for the initial `create_workflow_from_code`.
34. **Test a node/sub-path WITHOUT a full run: `prepare_test_pin_data` → `test_workflow`.** `prepare_test_pin_data(id)` returns schemas only for nodes that need pinning (triggers, credentialed, HTTP); you supply sample data (`[{json:{…}}]` shape) for those, and **pure-logic nodes (Set/If/Code/Merge) execute for real**. `test_workflow(id, pinData, triggerNodeName?)` runs with externals simulated — lower-egress and far cheaper than seed→execute→get_execution. `setNodeDisabled` (an op) cuts nodes from a path to exercise one segment. **We didn't use this — it would have replaced much of the redis-seed/execute/parse loop.** NOT a substitute for §0 zero-egress (logic nodes still run; pin every node that could call out).
35. **Find-then-fetch for executions.** `search_executions` (metadata: `workflowId` + `status:["error"]` + time window, `lastId` paging ≤200) → ONE targeted `get_execution(includeData:true, nodeNames:[…], truncateData:N)`. Never list-with-data; never `get_execution(includeData)` without `nodeNames` (megabytes for one bug).
36. **Don't re-read the whole workflow to "verify" a test-copy edit** — `update_workflow` is atomic and errors loudly on bad refs; success = applied. (EXCEPTION: a LIVE promotion still warrants a sha-verify of the changed node + publish check — that's a prod-safety gate per lesson 25, not routine verification.)
37. **Publish a sub BEFORE testing the parent.** Parents reference only the **published** version of a sub-workflow; a draft/unpublished sub edit is **invisible** to callers — the spine keeps invoking the OLD published sub (silent stale-dependency). Critical given the spine's 8 shared subs. Stronger form of lesson 17 / the publish-after-update rule: it's not just "active runs old" — it's "the parent literally can't see your draft sub."

## Chatbot parser-change patterns (from member-pick name-resolve, 2026-07)

38. **List-selection by NAME: split LLM=extract / code=resolve — never let the LLM resolve the position.** When the bot presents a numbered list (CS members) and the user may reply with a name/typo/honorific instead of a number, the robust design is: the parser LLM emits ONLY a raw surface field (e.g. `person_mention`, string|null), **always, context-free** (pure NER — it doesn't know or care whether it'll be used); a downstream Code node (`output_exchange`) does the deterministic match against the frozen result-set. LLMs are unreliable at counting/positional resolution and at "only do this when context is X"; they're good at spotting "miss tan pls"→"tan". The frozen `last_result_set` already carries `{idx, label(=name), uuid, respond_user_id}`, so code matches `label` → `uuid`. Code owns normalization (lowercase/trim/strip-one-honorific) + tiered match (exact→token-overlap→substring) + the **ambiguity gate** (>1 label hit → reprompt, NEVER auto-pick — a wrong CS assign triggers staff email/WA ripple).
39. **The `_isNewQuery` gate IS the wrong-assign protection — don't tighten the prompt to defeat it.** A bare ambiguous token that doubles as a customer name ("tan", "Wong") gets classified by the real parser as a new business query (`domain_hint:order` + `current_message` entity) → `_isNewQuery=true` → the name-resolution arm is skipped → fail-safe (searches orders, never assigns). This is the SAME mechanism that stops "any orders for Tan" from wrongly assigning CS-member Tan. Resist "fixing" the bare-surname miss by making the LLM grab bare tokens — it reopens the wrong-assign edge. **Bare-ambiguous-token classification is run/seed-sensitive** (same "Tan" routed to query in one case, to the member arm in another). So write UAC for these as **"resolve OR safe new-query abandon → both PASS; a resolve to the WRONG member = hard fail"** — never a single deterministic expected value.
40. **An always-emitted new parser field → register it in the replay diff as ignored-when-`null` / flagged-when-non-null.** Adding a field that appears on EVERY parser output (e.g. `person_mention`) would otherwise diff on all ~2.2k golden turns. The fix is a one-line rule in the replay orchestrator's `norm()` (`aROEBlQyyoQaB7a1` › `Diff`): drop the key when null on both sides (inert), retain when non-null (surfaces for review). This is the correct middle path — NOT a blanket ignore (hides regressions, lesson 21) and NOT a full re-baseline.
41. **Capturing synthetic UAC turns as golden needs synthetic `chat_histories` FK rows — and they MUST be excluded from full-corpus capture.** New-behavior UAC turns (member_offer name-replies) have no historical golden, so capture fresh via a dedicated per-case `regress-capture` driver; but the `golden_nodes` FK forced 11 synthetic `chat_histories` rows (`conversation_id LIKE 'UAC15-%'`). A later full-corpus capture must `WHERE conversation_id NOT LIKE 'UAC15-%'` (or delete the synthetic run first), else they pollute the baseline as stray 1-turn conversations.
42. **To discover what a turn WOULD write to session vars (without a real write or a 2nd turn), read the orphaned `save-session-vars` input / `would_write` payload in the clone.** `uac` mode can't round-trip state into a following turn (it sources prior state from PROD; redis-item `previous_conversation_state` injection doesn't reach the reformulator — lesson 31). So to confirm e.g. that `last_result_set` carries a `label`/name field, inspect the INPUT to the clone's orphaned prod-PUT node (and `compile-current-state`) in `get_execution` runData — the frozen would-be-written payload is right there, zero egress.

## Chat console / hosted UI (2026-07-13)

43. **A static HTML page served by an n8n webhook CANNOT fetch other n8n webhooks.** n8n force-injects `Content-Security-Policy: sandbox …` (no `allow-same-origin`) on every HTML webhook response → the page runs at a `null` origin; the webhooks' `Access-Control-Allow-Origin` is pinned to the host (setting the webhook's `allowedOrigins:'*'` does NOT change the emitted header) → every `fetch` is CORS-blocked (`origin 'null' … not equal to`). Overriding CSP via the respondToWebhook `responseHeaders` is ignored. Dead end — don't build a custom-HTML chat page this way.
44. **For a chat webpage, use the native `@n8n/n8n-nodes-langchain.chatTrigger`** (`public:true`, `mode:'hostedChat'`, `options.responseMode:'lastNode'`). n8n's first-party widget talks to its own backend → no CORS/CSP fight, real webpage at `/webhook/{chatTriggerWebhookId}/chat`. `lastNode` mode requires the terminal node to emit `{ output: '<text>' }`. For an ASYNC pipeline (our dispatcher→spine reply lands in redis later), make the chat workflow **synchronous**: inject → fire → `Wait`(≈12s) → read the redis rendezvous (`chat:reply:{sessionId}`, redis `get` keyType=`list` = LRANGE) → format `{output}`. The widget shows a spinner then the reply inline. chat_id carrier = the chat `sessionId` stashed into `contact.chat_id`.

## Cross-workflow contracts + promote safety (obs-latency-contract, 2026-07-21)

45. **A zero-egress gate on a resource shared with prod, and drained fast, proves nothing.** UAC §0 S7 was "`LLEN sorento-respond-message` unchanged before/after." That list also carries live traffic AND is drained every 5 s by `redis-consume-queue-mongo`, so the gate is both **false-positive** prone (it tripped on a real customer mid-run) and — the dangerous half — **false-negative** prone: a genuine harness write landing at T and popped at T+3 s reads back 0. *A gate that can report PASS while a prod write occurred is worse than no gate; it manufactures confidence.* Replacement: **sink-delta accounting + payload attribution** — count writes to the harness's own unconsumed sink, and attribute any prod movement by inspecting the blob shape (post-change blobs carry keys the pre-change ones lack). Binding rules: non-zero prod delta **HALTS** pending attribution; an unretrievable consumer execution is **UNATTRIBUTABLE → FAIL**, never inconclusive-pass. Generalises: any zero-egress assertion on a prod-shared resource needs an attribution step, not a count.
46. **Counting consumer executions is a clock, not a leak signal.** The consumer emits one execution per 5 s poll unconditionally (~140/window) — the count is *zero* evidence, not weak evidence. The sound instrument is that same consumer's FIRST node running `LLEN` every 5 s and retaining it: a 5 s-resolution depth series that defeats drain-blindness. **Co-mandatory with the pop payload** — LLEN alone still misses a write landing and popped inside one poll.
47. **n8n-MCP auto-binds credentials and cannot unset them — so forks come out ARMED.** Credentials were deliberately omitted when creating a sendmsg fork; MCP assigned `sorento-api` anyway, making an unpinned `is_test:false` run a **real WhatsApp send**. There is no MCP operation to remove a credential. Worse, `get_workflow_details` **redacts credentials on read**, so "no `credentials` block" is *vacuous* evidence — an armed fork and a clean one look identical. Assert on **node TYPE** instead. Fix pattern: replace the credentialed node with a **name-preserving Code stand-in** (same node name, synthetic output matching the real shape) so `$('Send a Message').item.json.messageId` still resolves in the real node context. Removes the hazard instead of gating it behind pins — and pinning cannot be pre-asserted anyway (`pinData` is a `test_workflow` argument consumed in the same call; `update_workflow` has no pinData op).
48. **NEVER block-copy `workflowInputs.value` from a clone to live.** Two independent outage-grade hazards found in one change: (a) clones carry `is_test:true` → copied to live, the sub's `test-guard` goes TRUE on production traffic and **every reply is logged instead of sent**; (b) a harness fork's `workflowId` copied to live repoints **every production escalation reply at a Code stub** — silent, and escalation-only, so a happy-path post-promote check never sees it. **Add exactly one leaf key per node via `setNodeParameter`.** Note the inverse too: some clone guards must NOT be promoted (deleting the clone's `Respond.io Trigger` was clone-only; removing it from live would blackhole the webhook).
49. **`$execution.id` inside a sub is the SUB's id, not the parent's.** Any cross-workflow correlation id (turn_id) must be **threaded explicitly**: parent computes it, passes it as a declared sub input, sub forwards it onward. A sub that "computes" it locally produces IDs that look right and pair nothing. Corollary: enumerate callers **transitively** — cycle 1 enumerated the spine's 8 sendmsg callers and shipped; the true count was 15, because `sub-human-intervention` calls sendmsg 3× itself. Escalations — the slow turns — were silently excluded from the SLA denominator, biasing p99 **optimistic**, the one direction that hides a problem.
50. **A caller census by `executeWorkflow` node alone under-reports.** Two blind spots: workflows with `availableInMCP` **off** are invisible to MCP entirely (9 of 66 here — the flag is a UI toggle, not settable via MCP); and **HTTP-POST-to-own-webhook** reaches other workflows without any `executeWorkflow` node (`fc-golive-live` → `sorento-main-inject` → real WhatsApp). Keep both patterns in scope or declare the census non-exhaustive.
51. **Stage an unowned draft delta as its own semantic-no-op publish.** `sorento-main`'s draft carried an unattributed `typeValidation: strict` (the n8n editor rewrites this when a v2 filter is re-saved). Publishing the feature would have shipped it as a rider. Correct procedure: (1) revert the stray leaf, re-diff, require **zero differing nodes + byte-identical connections**, publish — a pure pointer move; (2) publish the feature. Converts one frightening publish into two boring ones, and if production moves you know which caused it. Ask for even functionally-inert artifacts (a stray `"options": {}` one side omits) — whatever is in the draft ships.
52. **UI Duplicate copies the DRAFT, regenerates every node id, and regenerates webhook paths.** So: diff clone↔live **by node NAME, not id**; and verify which version you actually cloned (`sorento-main TEST` mirrored the unpublished draft, so its UAC evidence described the draft, not production — fixed by setting the clone's leaf to match active). Also, a duplicated **`respondioTrigger` is a live-traffic hazard even with a distinct URL** — on activation it subscribes the shared credential to the real event stream, which either fans real messages into both workflows or overwrites the live subscription. Delete it in clones; never rely on `active:false` alone.
53. **Check the clone and prod don't share a mutable key namespace.** The rate-limit counter is `INCR` on the bare contact id with `ttl:1` — clone and production hit the **same redis key**. A test run against a real contact increments that customer's live counter and can trip them into the "too many messages" refusal. Low probability is not fail-closed. Namespace it (`test:rl:{id}`) *and* pin the node so it never executes.
55. **REST PUT is the ONLY way to bind a generic-auth credential — and PUT always auto-publishes.** *(Established 2026-07-21 on n8n @ `automate-sorento.foundryx.my`, auth-unification T0; supersedes the earlier "REST GET redacts credentials" claim, which was wrong.)*
    - **MCP cannot bind `httpHeaderAuth` at all.** `setNodeCredential` and `addNode` share a credential-type whitelist that omits generic-auth keys, rejecting with `node type 'n8n-nodes-base.httpRequest' does not accept credential 'httpHeaderAuth'`. n8n itself accepts the binding fine — this is an MCP-side bug, not a constraint. No `update_workflow` op writes a raw node object; `updateNodeParameters` only reaches `parameters`.
    - **REST GET does NOT redact credentials** (MCP's `get_workflow_details` does — §47 is correct about MCP). `GET /workflows/{id}` returns populated `{id,name}` per bound credential: 18 of 135 clone nodes. So a GET→PUT round-trip is **information-preserving** for credentials; an idempotent PUT returned all 4 fork credentials intact with `nodes`+`connections` byte-identical. The 2026-07-20 incident that lost `openAiApi` was a PUT body built from **MCP** output, which does omit them. Real hazard, misattributed cause.
    - **The actual hazard: there is no draft-only PUT.** Even an idempotent PUT moves `activeVersionId`. **Rule: never PUT a body you are not willing to publish, and never PUT a body not derived from a fresh faithful REST GET of that same workflow.** Note an idempotent PUT is idempotent *against the draft only* — if draft ≠ active, PUT publishes the draft.
    - **On a live workflow a PUT *is* the promote** — it cannot be staged for review. Correct sequence: apply non-credential edits via MCP `setNodeParameter` into the draft → review → one final PUT that binds the credential and publishes. Review the PUT body **as bytes** and send it unmodified, and re-run the draft-vs-active diff immediately before, or the reviewed artifact and the published bytes are different objects.
    - **Always assert collateral credentials after any PUT.** Enumerate every node holding a credential before, and re-assert all of them after (T0: 22/22 survived, zero lost). This check is what re-proves the lesson each time rather than trusting it.
    - **`settings` is schema-narrower than storage.** The public OpenAPI `workflowSettings` schema omits `binaryMode` and `timeSavedMode`, so echoing them back 400s with `settings must NOT have additional properties` — 6 of 13 workflows here carry one, **including the live spine**. Stripping is lossless because `settings` is **merged, not replaced** (verified by omitting `availableInMCP` and watching it survive); `pinData` and `staticData` are likewise preserved when not sent. Use `del(.settings.binaryMode, .settings.timeSavedMode)`. The 400 is **pre-write** — nothing saves, versionIds don't move, so a failed attempt is free.
56. **Verify post-promote on the SPECIFIC path you changed.** Cycle 1 verified `turn_id` on a happy-path turn and shipped an escalation gap that survived a full review. Cycle 2's acceptance is explicitly "an ESCALATION turn pairs" and "a RATE-LIMITED turn logs." Related: a sub-workflow resolves the **published** parent at call time, so an execution that started seconds before your publish still runs the old graph — don't read a boundary-case execution as a failed promote. And when a path genuinely cannot be exercised (rate-limit needs >30 msg/min), record it as **unverified**, never infer it from a clean diff.

## Live promote via MCP `update_workflow`/`publish_workflow` (dym+datemiss+state-monitor bundle, 2026-07-22)

57. **Build the promote target as LIVE + your own hunks — NEVER copy the tested clone/fork node verbatim; drift bites in BOTH directions.** A plan's "fork is byte-identical to live" claim decays the moment other work lands on that fork. Two catches in one promote: (a) the tested parser fork `wI5RkNGW3EOJfBdo` carried an unpromoted `_parser_raw` rider (state-monitor C2) absent on live `XTODTw` — block-copying it would drag the diagnostic live; (b) the clone `not-found-error-message` was STALE vs live — live had extra `_ORDER_TYPES`/order-status labeling the clone lacked, so promoting the clone's copy would REGRESS live. Fix: extract each live node body **by name**, re-apply your reviewed hunks to it, then prove `diff live→target` = only your hunks and `diff target→tested-artifact` (comments stripped) = only the foreign delta you deliberately excluded. char-count mismatch between a `jq -r` backup and the MCP body is usually just **bytes-vs-chars** (multibyte `── • § →`) + jq's trailing `\n`, not wrong content — confirm with an independent fresh fetch.
58. **The live-promote transport has three gotchas — handle all three up front, and let the byte-SHA-gate be the backstop.** (a) **Permission:** writes to a live workflow are auto-denied by the auto-mode classifier for BOTH subagents and the main agent until `mcp__n8n-mcp__update_workflow` + `publish_workflow` are in `.claude/settings.local.json` `permissions.allow`; **the assistant cannot self-grant** — editing settings to add the rule is itself classifier-blocked, so the USER adds it (`! python3 …`, `/permissions`, or hand-edit). `sorento-coder` is contractually barred from live — use `general-purpose` or the main agent. (b) **Whitespace:** the tool-call authoring channel right-trims trailing whitespace, so a source with blank-lines-containing-spaces or `}`/`;`-with-trailing-space can't be reproduced byte-exact → the SHA-gate fails on inert bytes. Strip first (`sed -i '' -E 's/[[:space:]]+$//'`; verify `diff -w` empty + `node --check`). (c) **Target by node NAME, not ID:** clone↔live node ids diverge for some nodes (`compile-current-state` clone `7a130a0c`/live `0804657c`; `not-found` clone `5fabfbe3`/live `b5f79139`; but `build-suggest-offer` `7972abd8` is shared) — `setNodeParameter` keys on nodeName (unique). The protocol that worked and made every abort safe: pre-check draft==active → per node: update draft, re-fetch, **byte-gate draft==file, publish ONLY on match, re-fetch active==file** → parser/sub before spine. Each abort (clone-id mismatch, whitespace, permission) halted before any live write with zero mutations — the gate is the reason "stop, don't force" is cheap.

## Census, secrets & verification discipline (auth-unification programme, 2026-07-21/22)

59. **Instance-wide census + secret hygiene — three traps, each of which produces a *false clean*.** (a) **MCP `search_workflows` returns only the non-archived workflows** (70 of 98 here); the 28 archived hold real nodes (26 hardcoded keys). For any audit/census/secret-sweep, enumerate via the **REST API** (`GET /workflows?limit=250`), not MCP. Archived ≠ deleted — a key rotation must account for them. (b) **A full REST GET embeds the `activeVersion` block**, which still carries the literal key on any *unconverted* node — so ANY full-GET dump (`*-before.json`, `*-preflight.json`, raw GETs) is a secret at rest; gitignore them and delete transient ones. This repo already leaked the key to pushed history via the deleted `normalized-workflows/` snapshot — purged with `git filter-repo --replace-text` + force-push (private repo; GitHub keeps unreferenced blobs by SHA until GC, and only key ROTATION invalidates what leaked). (c) **`grep -rl <key>` gives FALSE NEGATIVES on this repo** — it silently returned 0 files while the key was plainly present. Use `find . -path ./.git -prune -o -type f -print | xargs grep -l` for any secret scan; a `grep -rl` that reports clean is not evidence.

60. **REST PUT on an ACTIVE respond.io-webhook workflow returns HTTP 409 `"conflict with one of the webhooks"` — but the data write + publish PERSIST correctly.** The 409 is n8n's webhook *re-registration* step firing AFTER the save+publish (root cause seen: two triggers sharing one `webhookId`). So on webhook-trigger workflows, **judge PUT success by resulting STATE (pointers published, credential bound, collateral intact, gate PASS), NOT by the HTTP code.** A 409 also means re-registration errored, so `active:true` via API is NOT proof the trigger re-subscribed — the user must confirm Active/no-trigger-error in the UI (unverifiable read-only). Schedule/exec-trigger workflows (no webhook) return a clean 200; a 409 there would be anomalous.

61. **The dominant defect class here is verification that CANNOT FAIL — prove every assertion can go red before trusting it.** Four instances in one session, each producing the *comfortable* answer nobody investigates: (a) `continueErrorOutput` nodes with an unwired `main[1]` — a 401 reports `status:success`; **worse than a dead-end, MEASURED** (clone `get-access-types`, exec 9523682): the node emits the AxiosError to the swallowed `main[1]` AND emits `{}` on `main[0]`, which flows downstream to a **confidently WRONG customer reply** ("you have no access levels") with the execution green and `search_executions status:error` seeing zero. (b) `jq … 2>/dev/null || true` treated as PASS — can't tell "nothing changed" from "check didn't run". (c) stale fixtures that still produce plausible runs because a mock fabricates a believable branch. (d) the `grep -rl` false-negative (§59c). **Rules:** assert on **payload shape** (a named domain key present AND `error` explicitly ABSENT), never on execution status; never let empty checker output mean PASS (print the compared-population count); prefer a check whose positive result can't be faked (a 404 body proving auth passed beats a 200 that could be anything); and run the assertion against a real induced fault once — an assertion never shown to fail is not an instrument. This is why the auth gate's payload-shape clause was the only one of four that caught the induced 401.

61b. **FIFTH INSTANCE of §61, and the worst-placed one: the *fail-on-purpose harness itself* was
    uninstrumented** (`dym-probe-before-offer`, 2026-08-07). A mutation step targeted
    `return (hb - ha);`; the source reads `return hb - ha;` (no parentheses). `sed` matched
    nothing, the file was unchanged, the suite ran against pristine code and printed **ALL PASS** —
    a result identical to "the suite genuinely resisted the mutation". Note where this sits: the
    fail-positive procedure exists *specifically* to prove other gates can go red, so a blind
    mutation harness silently certifies every gate it touches. **Binding rule (now UAC §0 S9):
    every mutation must (1) assert the search string occurs exactly N>0 times BEFORE substituting,
    (2) assert the file digest CHANGED after, and (3) abort without running the suite if either
    fails. A suite result obtained without both assertions is VOID, not weak.** Reference
    implementation: `tests/offline/dym-probe-before-offer/mutate.sh` (proven: it aborts on the
    exact no-op above, and goes red on the correct string). Generalises past n8n — it applies to
    any mutation-testing or chaos step anywhere in this repo.

61c. **A "duplicate row" in a multi-tenant CRM is usually not a duplicate — check the uniqueness
    constraint before designing a dedup** (`dym-probe-before-offer` F-DUPE, 2026-08-07).
    `app/models/product.py:182` is `UNIQUE(company_id, product_code)`: product codes are unique
    **per company**, so one code under two uuids is two *different companies'* products, by schema
    invariant. A run log called it "duplicate CRM rows needing cleanup"; there was nothing to clean
    up. Three consequences the wrong root cause would have hidden: (a) the "obvious" fix
    (union the uuids and probe them together) **cannot** work, because the answer envelope carries
    no product id (`presenters.py` emits code/name/type/file fields, never the uuid) while the pick
    path resolves exactly one uuid — so it would promise "has" and then dead-end on the empty twin,
    strictly worse than the silent dead-end being fixed; (b) all unioned entities are `product` and
    mappable, so the unscoped-read guard does **not** catch it — mechanically safe, semantically
    wrong, **it tests green**; (c) the correct fix is to *exclude* the ambiguous code from the
    claim, not to resolve it. Corollary for company-scoped tools: a sub that omits
    `contact_id`/`space_id` calls them **unscoped**, so "which sub does this node target" is a
    correctness question, not a plumbing one.

63. **WRONG-OBJECT ASSERTIONS — a class distinct from §61's "green that cannot fail", and it beat every
    gate in this repo three times in one change** (`dym-probe-before-offer`, 2026-08-07). §61 is about
    assertions that *cannot* go red. This is different and nastier: **the assertions are sound, they
    can go red, they are simply pointed at the wrong OBJECT.** All three instances have the identical
    signature — *computed correctly, rendered bare, every gate green*:
    (a) a second renderer (`compile-current-state`'s partial-resolution block) was never annotated
    because coverage was enumerated by graph inbound; (b) a fourth renderer (the require-specific
    picker in `disallowed-entity-gate`) likewise; (c) worst, the picker annotation was computed
    correctly by `build-suggest-offer` and then **thrown away**, because `escalate-catalog` re-sources
    `escalate_message` **by name** from the node UPSTREAM of the entire chain
    (`$('not-found-error-message')`). Note (c) is just **LESSONS §5 / the TOPOLOGY "Read BY NAME"
    warning** — *`$('x')` reads are NOT redirected by rewiring* — biting on the READ side rather than
    the write side. Reachability analysis proved the payload *reached* the renderer, which was true
    and irrelevant: nothing checked where the **rendered text** was *sourced from* downstream. And
    because the producer correctly **spreads rather than mutates**, the annotated object simply went
    unconsumed — no error, no diff, nothing to see.
    **Rules.** (i) **Assert on what the customer receives** — `save-session-vars.user_response`, the
    sendmsg payload, or the terminal consumer's output — *in addition to* the producing node's object.
    A suite that only asserts the producer cannot see this class at all. (ii) **Enumerate renderers by
    RENDERED STRING** (grep the user-facing phrase across every Code node), never by graph inbound;
    inbound-enumeration missed two of four surfaces here. (iii) For every field you annotate, find who re-sources it **by name**
    downstream — that set, not the edge list, is the true consumer list. **A line-based
    `grep "$('"` is NOT sufficient guidance and will miss the case that caused this defect.**
    Scan for all THREE forms:
      (a) single-hop, same line — `$('X').first().json.key`;
      (b) quote variant — `$("X")` (a single-quote-only grep already produced a wrong answer once,
          LESSONS §62);
      (c) **two-hop, split across lines** — `const v = $('X'); const j = v.first().json; … j.key`.
    Form (c) is what hid the rev-5 defect (`escalate-catalog` binds `nfNode` on one line and reads
    `nf.escalate_message` two lines later) and is exactly what a line-based grep cannot see. Bind
    the node handle to a variable and follow the variable, or grep the FIELD name and walk back to
    its source. Credit: the tester's scan in this form found two further readers
    (`attach-merge.js`, `presign-fail-notice.js`, both reading `user_response` from
    `crossdomain-compose`) that a single-hop scan missed — both were then shown safe from the graph,
    but they were invisible to the search form I had prescribed. (iv) Make the rendered-text gate **discriminating**: run the pre-fix consumer body
    against the post-fix producer output and assert it comes back WITHOUT the annotation, so the gate
    proves it can distinguish the two rather than being taken on trust.

64. **A published change can be SILENTLY REVERTED on the clone by a UI save — and a later fix
    downstream can MASK its absence, so every behavioural check keeps passing.**
    (`carried-certificate-dump` B1, reverted 2026-08-07, found 2026-08-08.) Two mechanisms
    compounding, and the pair is what made it survive a coder, two testers and a reviewer:
    (a) **The revert.** A UI save from a stale editor tab — the same window in which the user
    deliberately removed `get-presigned-url` — rewrote `disallowed-entity-gate` back to its pre-B1
    body. This is LESSONS §24's revert-landmine (*"editing in the UI silently creates/updates a
    draft; a later publish ships everything in it"*) biting the **clone**, where nobody was
    watching for it. Every clone version from `b94eea53` (08-07 07:46) to `879d0f68` (08-08 04:41)
    carried the pre-B1 sha `7626c83e`, for over a day.
    (b) **The mask.** B2′ (parser-side certificate eviction) shipped in between. B2′ removes the
    *cause* — the carried certificate — so the 26-row dump B1 guards against **cannot occur
    whether or not B1 is present**. Every B1 regression check (`srtwc8317-rl1 cert` →
    did-you-mean, no dump) therefore kept passing, **correctly, in both states.**
    **This is a THIRD class, distinct from §61 and §63.** §61 is an assertion that *cannot go red*.
    §63 is a sound assertion pointed at the *wrong object*. This one is a sound assertion, pointed
    at the right object, that simply **cannot discriminate the two states** — the observable it
    reads is identical either side of the thing it is supposed to prove. Redundant fixes for one
    symptom create this hazard **by construction**: the moment two changes independently suppress
    the same user-visible outcome, any test written against that outcome stops being evidence for
    either one.
    **Rules.** (i) **Verify the change is still PRESENT — by node sha against the recorded
    post-build value — at the START of every test pass**, not just that the behaviour looks right.
    "It still behaves correctly" is not evidence the code is still there. Reference:
    `tests/offline/carried-certificate-dump/assert-b1-present.sh` (PASS/`reverted`/`someone else
    edited it` are three distinct outcomes, not two). (ii) **Record the post-build sha in the
    node-diff** so there is a value to check against — a diff without one cannot support this gate.
    (iii) **When two changes suppress the same symptom, at least one assertion per change must key
    on something the OTHER change does not affect.** Here the discriminator is **execution shape,
    not text**: B1 dead-ends before `Call 'sub-get-results'` is invoked, so the sub is **absent
    from runData**; with B1 gone but B2′ active the sub runs and returns a correctly-scoped result
    with the *same* reply text. Prove such an assertion RED against the actual defective artifact
    before trusting it (done here against the live B1-absent clone body). (iv) Assert absence of
    the **node in runData**, never a status and never the rendered string (§61a, §63 rule i).

## Diagnosing "why is this slow" — measure the loop before optimising it (dev-velocity work, 2026-08-04)

62. **A performance diagnosis made from plausibility instead of measurement will point at the wrong thing — and here it pointed at the wrong thing by 4x.** Asked why n8n work is slower than CRM work, I blamed the obvious suspect: MCP round-trips and remote execution. Then I measured, and every number contradicted me. **A single remote clone turn is 8 seconds**, not the 30–45s I'd assumed; the 70-execution tool-loop suite was **~9 min of a 48-min tester run (~19%)**, the 38-execution XA suite **~5 min of 28 (~18%)**, and the three live PUTs that promoted a full day's work cost **~6 min of ~246 min total agent wall-clock**. The write mechanism was never the bottleneck. The real cost was **agent reading and re-derivation, repeated cold on every invocation**: `tests/UAC.md` at 3,986 lines/297 KB, a ~600-line plan, and the live spine JSON at **444 KB** pulled 2–3× per agent. Fourteen agent invocations each re-ingested substantially the same corpus, and ~6 of them independently re-derived the same "who reads `compile-current-state` by name" fact — one getting it **wrong** by grepping only `$('x')` and missing the `$("x")` form. **The fix that follows from the measurement is different from the fix that follows from the guess:** not "fewer/faster remote calls" (worth ~nothing — they're 8s) but **smaller derived artifacts and diffs instead of blobs** — a generated `TOPOLOGY.md` (12 KB, **46× smaller** than the workflow JSON, carrying edges + the by-name reader map + orphans + sub-calls) and a per-family UAC split (**3,986 → ~478 lines**, ~8×). Two corollaries worth keeping: (a) **a local cache of remote truth must carry a loud staleness gate or it is a liability** — `normalized-workflows/` was deleted from this repo precisely because a stale copy got silently trusted, so the export writes `versionId`+per-node sha256 into `MANIFEST.json` and `--verify` exits **1** on drift (proven by corrupting a manifest on purpose); and (b) **artifact-level wins are not end-to-end wins** — 46× on structure and 8× on reading do NOT compose into 46× or 8× overall, because a real share of any session is irreducible *discovery* (the reviewer finding F1 was 4 arms not 1, FP1 exposing that the A-COUNT instrument was blind, my own wrong premise that `central-exchange` runs on a total-miss turn). I claimed ~2x, could only defend 1.2–1.4x, and said so; the honest close is to **bank the baseline (planner ~27m, coder ~15m, tester ~48m, reviewer ~18m) and measure the next change against it, stopping if it doesn't move.** Tooling: `scripts/export-workflows.py`, `scripts/split-uac.py`.

64. **Synthetic prior-state fixtures omit what real session state carries — derive them from a real
    `get-session-vars` payload instead of hand-building them** (`immortal-hint-class`, 2026-08-08;
    **second instance**). M2 hinged on whether `ordinal` persists into the next turn. Every
    `sim-inject` fixture in the harness was hand-built and **all 11 carried zero `ordinal`**, while
    **17 real `pg-get-session` rows carried it** — so the harness could not have reproduced the bug
    it was built to test, and the premise had to be settled from live executions instead
    (`11555030`, `11642553`). The first instance was the same shape: `sim-inject-session` coerces an
    absent `referenced_result_set` to `[]`, and `output_exchange` guards with `Array.isArray(...)`,
    which `[]` passes — so the `prevState.last_result_set` fallback never runs and every positional-
    pick fixture is **silently vacuous while reporting green** (live has that key absent in 62 of 67
    executions, so the shapes genuinely differ). **Rule: seed prior state by copying a real
    `get-session-vars` payload and editing it, never by writing the object from the field list in a
    plan.** A hand-built fixture encodes what the author *believes* state contains, which is exactly
    the belief under test. Corollary: when a fixture and production disagree about whether a key is
    present-but-empty vs absent, the guard style (`Array.isArray` vs truthiness) decides whether the
    difference is inert or fatal — check the guard, not just the key.

## Right assertion, wrong object — and the tests that agree with you (container-status, 2026-08-09)

65. **A measurement is only as good as the object you measured it on, and the clone is not live.** I
    "optimised" `Switch` by replacing `$('Split Out').item` (an n8n paired-item lineage walk, ~1.5 s
    per item across a 148-node run) with `$json.mimeType`, and measured a real 36.7 s → 4.2 s win. It
    was wrong for live. **The clone has `get-presigned-url` DELETED; live has it between
    `Loop Over Items1[1]` and `Switch`** — and the presign response body (`presigned_url`, `file_path`,
    `filename`, `expires_in`, `storage_provider`) carries **no `mimeType`**. On live `$json.mimeType`
    is `undefined`, both rules go false, and every attachment falls to `fallbackOutput`. The paired-item
    walk was not waste — it was *buying the field `$json` genuinely lacks on live*. Worse, no evidence
    on hand could have caught it: across ~30 runs only the files branch ever fired (every fixture was
    xlsx/pdf), so the image and video branches were never executed and the passing observable is
    identical to the broken one. **Rule: before promoting a hunk verified on the clone, diff the
    clone's INBOUND EDGES for that node against live's** — a deleted upstream node changes what `$json`
    means without changing a line of the node you tested. Reverting the clone to live's expression
    beats excluding the hunk at promote time: an exclusion has to survive a checklist, a revert cannot
    leak.

66. **A mutation test pointed at a fixture that cannot discriminate returns the comfortable answer —
    and then you write the wrong conclusion into shipping code.** I built a mutant with the
    `!_isTimeline` denial guard removed, saw the suite stay green, concluded the guard was redundant,
    and put "proven redundant by mutant" in a comment destined for two live subs. Both the conclusion
    and the proof were wrong: `_isTimeline` is `.some(k === '__all__')` — **CONTAINS the sentinel, not
    IS the sentinel alone**. The prompt tells the LLM to emit it alone, but *that is an instruction,
    not an invariant*, and the code tolerates a mixed array on purpose. Under
    `requested_attributes: ['__all__','eta_delay_date']` with that key denied, removing the guard
    **does** emit the note. Every fixture used the sentinel alone — the one shape that cannot see the
    difference. **Rule: a mutant that survives is a claim about your FIXTURES first and your code
    second.** Before concluding "redundant", enumerate the input shapes the guard's condition can
    distinguish and check one of each. Corollary: when a test cannot be made to discriminate, label it
    an INVARIANT in its own name (`T3 [invariant, not discriminating]`) rather than letting a green
    imply proof.

67. **An unknown parameter is dropped SILENTLY, and the tool then answers without ever calling the
    backend.** `crm_resource_attachments_list` takes `attachment_type_id` (singular scalar); we sent
    `attachment_type_ids` (plural array). The unknown key was discarded, taking the only narrowing
    filter with it, so `TOOL_REQUIRED_NARROWING_FILTERS` short-circuited to an empty page **without
    reaching the backend** — rendering as "no such document" for a document sitting in the library.
    Two follow-ons worth more than the fix: (a) the **shape** fails as silently as the **name**, so
    guard both (`SCALAR_PARAMS` set, not a special case); and (b) the discriminator has a blind spot —
    a real call carries `fallback_used` and the short-circuit does not (measured 882 vs 208 bytes),
    **but an `attachment_type_code` naming a type that does not exist does NOT drop the filter**: the
    service substitutes an impossible-id predicate, so the call reaches the backend, `fallback_used`
    is present, and the result is still zero rows. `fallback_used` answers *"did we call the backend"*,
    never *"is this empty legitimate"*.

68. **A filter whose trigger is "the data looks like X" will fire on anything that starts looking like
    X.** The requested-attribute projection was gated on *"does any field carry a `key`"*. When the CRM
    keyed resource attachments (`original_filename`, `uploaded_at`) — neither an identity key nor ever
    requested — the projection would have dropped **both** fields of every document answer and rendered
    a bare `1.`, with `requested_attributes: []`, i.e. the *emptiest* possible request was the most
    destructive. Caught pre-emptively only because a contract change was announced. **Rule: gate on
    what the envelope IS (`result_type === 'incoming_stock'`), not on what its data happens to look
    like.** Also record the load-bearing near-miss: `crm_incoming_stock_by_product` ALSO reports
    `incoming_stock` and IS projected — a no-op today *only* because every field it emits is an
    identity key. One keyed non-identity field added there and it drops silently.

69. **Single-turn fixtures cannot see cross-domain carry — and real usage found it in one turn.**
    Every UAC case, offline probe and e2e run started from clean state, so all of them passed while
    live exec `11818957` failed: a promotion turn left `brand='Sorento'` / `category='pop up waste'` in
    session state, the next turn "Container status report" routed **correctly** to
    `resource_attachment` but carried both (`current_message: false`), `Sorento` fuzzy-matched
    promotion PDFs, and the customer got *"Couldn't pin down Sorento"* + three promo PDFs instead of
    the file. Root cause was one missing pair: `DOMAIN_BLOCKED_HINTS.resource_attachment` blocked 16
    hints but not `brand`/`category`, which `order` and `incoming` already block. The argument for
    blocking rather than patching: **`crm_resource_attachments_list` has no brand or category param at
    all**, so those hints can never narrow a document lookup — only pollute it. **Rule: for any change
    that reads carried state, write at least one regression that INJECTS a realistic
    `previous_conversation_state` from another domain.** Assert on the mechanism (inject the state),
    not by replaying two turns, so the test cannot drift with whatever the previous turn produces —
    and prove it red against the unfixed body before trusting it
    (`tests/offline/container-status/regression-carry-promotion-to-document.py`).

70. **A reviewer finding is a hypothesis too — verify it before acting, and before repeating it.** The
    reviewer called promoting the `contact_id`/`space_id` tail to `Fss5aAa` an outage: `.trim()` on an
    absent `contact_id` throws, and the four probes "pass no `contact_id`". I relayed that to the user
    as a P0. Both of us were wrong: **all six callers pass `contact_id` at TOP LEVEL**
    (`={{ $('sorento-sub-respond-findcontact-respond').first().json.id }} ` — and the trailing space is
    exactly what the `.trim()` cleans), and `semantic_input.space_id` was already `"364817"`, so the
    tail is behaviour-neutral. The finding was reasoned from the FUNCTION without checking the CALLERS
    — correct reading of the code, wrong conclusion about the system, which is the same shape as §65
    pointed the other way. It stayed stripped, but as hygiene (live's `semantic_input?.x` is
    optional-chained and single-sourced), not as an emergency. Related: **merged is not deployed** —
    CRM PR #109 merged and its markers were still absent from the running MCP because FastMCP registers
    tools at startup; assert the CONTRACT against a live envelope, never against a merge commit.

## Patch the outcome, not the mechanism — and assert the WHOLE reply (promo-scope-dym, 2026-08-10)

**§67 — a per-mechanism fix to a shared filter never converges.** `compile-current-state`'s
partial-miss block ("Couldn't find these: … did you mean") had already been patched once, for
container-status, by naming the mechanism that had resolved the token
(`resolved_by === 'document-class-narrowing'`). A second mechanism promoted tokens a different way
— `disallowed-entity-gate` lifting a resolution's ambiguous `matches` straight into
`compatible_entities` — and the bug came back wearing a different hat: `"6047 promo"` returned the
right 10 promotions and then offered three rows **of that same list** back as "did you mean".

The mechanism is not the invariant. The **outcome** is: *a token whose own candidates appear in
the answer was answered, not missed.* One predicate, keyed per token, and a sixth promotion
mechanism needs no sixth patch. When you find yourself adding a second special case to the same
filter, the second special case is the signal — stop and find the property both cases share.

Corollary for the resolver contract: `resolved: false` from `resolve-entity` means *this node did
not resolve it*, **not** *nobody did*. Any downstream node that reads `resolutions[].resolved` as
"the customer got no answer for this token" is reading a node-local fact as a system-wide one —
the same shape as §65.

**§68 — assert the whole customer reply, not the part you built.** 60 offline assertions and a
full end-to-end pass all went green while the customer was reading a wrong paragraph, because
every one of them asserted the promotion list or the picked file. Neither was wrong. Something
*else* was appended underneath, and no assertion looked at the reply as a whole. The cheap
instrument that would have caught it: on every case that claims an answered turn, assert the reply
does **not** contain any other section's marker string (`Couldn't find these`, `Multiple matches
found`, an escalation offer). Add the negative to the positive — a renderer suite that only ever
checks for presence cannot see an intruder.

**§69 — once a fix ships, the export stops being a RED baseline.** An offline suite whose `before`
mode loads the node body from `export/` silently turns green the moment the fix is published: the
export IS the fix. Freeze the pre-fix body as a committed `*.before.js` and read `after` from the
export (byte-gated, `node-source` doctrine §63). Then `before` stays reproducibly red and `after`
stays provably deployed.

## A signal that reads authoritative but reports something narrower than its name (2026-08-10)

**§70.** Two independent bugs the same day, found from opposite directions, same shape:

- CRM `match_tier: "and"` on a promotion row **names the probe that produced it**, not what the row
  satisfied. AND-mode is really max-coverage: `_and_max_tier_filter` keeps rows equal to the GLOBAL
  MAX word-count, so `"cabana bathtub"` (no row has both) keeps every `cabana` row and reports them
  all as `and`. Measured: `"cabana car"` returns 12 rows containing only `cabana` and 3 containing
  only `car` — **zero containing both** — under one `and` label.
- A **fresh n8n `sessionId` claims isolation it does not have.** Conversation state is per CONTACT.
  A resolver baseline captured with one sessionId per phrase was silently polluted by the previous
  phrase: `"promotion flyer"` came back with `tokens: ['cabana','kitchen tap']`.

Both fail GREEN. Neither errors, neither looks wrong in isolation, and both produce output that a
reviewer reads as authoritative because the field name asserts more than the code checks.

The defence is the same in both cases and it is cheap: **assert the name against the thing it
claims.** For the resolver, check the returned row actually contains the queried words (no test did
— that is why it shipped). For the baseline, fail the capture if any resolver token contains a word
its phrase does not. One line each; both were absent precisely because the signal looked
trustworthy.

Corollary for baselines: **a phrase with an empty result set cannot detect a regression** — there
is nothing to lose. `TT440s` was added to pin the plural-fallback path, returns 0 rows, and pins
nothing. Say so in the artifact rather than counting it as coverage.

Corollary for cross-repo work: when a peer session says a change is deployed, check `origin/main`,
not their working tree — and remember an MCP registers tools at process start, so merged + deployed
is still not callable until it restarts. A merged-but-not-restarted MCP is indistinguishable from
not-deployed.

**§70a — third instance, same day: a cap without an ordering.** The CRM resolver caps AND-mode
probes at 200 across 10 unordered call sites, and — the one that actually bites — **prefix/substring
probes at 20 across 29 unordered call sites**, which is the OR-mode path most enquiries take. "The
top 20" is "20 arbitrary ones", and the subset moves with query plans, autovacuum and concurrent
writes. Promotions are immune today (29 rows vs the 200 AND cap); larger corpora pass 20 easily.
Same shape as §70: it fails green — you get rows, they look fine, they are a different 20 next time.
Build a regression baseline over a capped unordered query and a LOST row is unattributable, so the
baseline is decoration.

**§70b — the correction IS the lesson.** Two claims in §70a's first telling were wrong, and both
came from a grep. "Zero `ORDER BY` in the file" was really "zero SQLAlchemy `.order_by()` calls" —
8 raw-SQL `ORDER BY` clauses existed and the grep could not see them, because the thing had two
spellings and the search knew one. On that basis "product did-you-mean is unstable" was one step
from being written down as fact. It is not: that path carries a full tiebreak
(`is_variant DESC, sim DESC, product_code`) and is stable. **A warning stricter than the code
deserves is its own defect** — it gets designed around, and it spends the credibility of the
warnings that are true.

The grep's name promised "all ordering here" and delivered "all ordering of one spelling" — §70's
failure one level up, in the tool used to investigate rather than in the code. It surfaced only
because the finding was relayed to someone who said they had recorded it. **State a finding to a
second party before hardening it into a doc**; that is what caught it, and it is cheaper than the
retraction.

**§70c — two shape constraints on the resolver payload, from the n8n consumer side.** Worth
recording because they are invisible from the CRM repo:

1. **Never add a key inside `by_entity_type`.** `not-found-error-message.js:5` does
   `Object.keys(r.by_entity_type)` and treats every key as a RESOLVED ENTITY TYPE, which is
   rendered to the customer ("Here's what you want: • promotion: …"). A metadata key added there
   would be announced as a type the customer asked for. It is the only key-set iteration over
   resolver output in the whole spine — everything else reads by name.
2. **Top-level keys ride further than you would expect.** `disallowed-entity-gate` does
   `const out = $input.first().json` — it MUTATES the incoming item, so every resolver key is
   carried forward; `build-suggest-offer` then starts from `{...$input.first().json}`. The only
   thing that stops resolver keys reaching the persisted CRM session is `compile-current-state`
   building a FRESH object literal, a hand-maintained invariant whose own header says a spread
   there would persist harness keys into every customer session. So new top-level fields are
   survivable but ride a long chain guarded by one comment; **nested under the per-token structure
   is strictly safer.**

**§70d — a before/after harness needs a control that FAILS.** A peer's no-regression capture
compared only fields provably invariant to the change (the new data was never serialised into
them), so identical output was guaranteed a priori — running old code, new code, or the same code
twice all produced the same green. It could not have detected a regression or proved one absent.
This is the same class as §61 (an assertion never shown red is not an instrument) but one level up:
the *harness* needs a discriminator — a value that changes only when the intended version is
loaded — plus a mutation that it is shown to catch. Sixth instance in one day of a green that meant
"nothing was compared" rather than "nothing changed".

## A promote review built from nodes/*.js is blind to non-Code-node parameters (2026-08-11)

**§71.** The promotion-picker promote shipped 6 Code-node bodies + 1 connection splice and called
that "the whole diff" — because the review compared `export/<wf>/nodes/*.js` (Code nodes only) plus
`connections`. Two load-bearing hunks lived elsewhere and were silently dropped:

1. `If4` — an **If node's** condition (fork: `name.length > 0`, never ask for an access level).
2. `Call 'sub-get-results'` — the S2b entitlement-union expression inside an **executeWorkflow
   node's** `workflowInputs.value.semantic_input`.

Result on live, same day, real customers (477071889, 404285551): S3 had deleted the access-level
carry, so with the prompt-removal hunks missing, every promo follow-up ("all", a numbered pick)
re-asked "Please specify which access level…" forever. The dev contact never hit it — single
entitlement passes the old If4 — so the smoke tests were green while every multi-entitlement
contact was broken. Same failure shape as §61/§70: the artifact reviewed ("the diff") promised
more than the mechanism (Code files + edges) delivered.

Rule: **a promote diff must param-hash EVERY node** (If, Switch, executeWorkflow inputs,
httpRequest bodies/URLs, redis lists, triggers), not just Code bodies. The 10-line sweep:
hash `json.dumps(node.parameters, sort_keys=True)` per node on both sides, then classify each
mismatch as business vs harness BY HAND. That sweep, run after the incident, found exactly the two
missed hunks and nothing else. Candidate tooling fix: export TOPOLOGY.md already lists code-node
inventory — add a per-node param-hash table so `git diff` shows non-Code drift too.

Transport corollary (same promote): hand-transcribing multi-KB node bodies through MCP drifted ±2
chars on long `─` comment banners five times; the byte-gate caught every one. File-driven writes
(GET → replace jsCode from the export file → PUT) are deterministic — prefer them for big bodies,
and keep the byte-gate regardless, because it is the only thing that caught both failure classes.

## The mutation harness itself was the green that could not fail (2026-08-11)

**§72.** `tests/offline/promo-picker/mutate.sh` reported **26/26 mutants caught** while being
structurally incapable of catching any: `path.join(__dirname, '/tmp/mutant')` mangled the absolute
path, the probe crashed on every mutant, and the "did it go red?" grep matched the crash output.
Two compounding faults in the same file:

- the frozen local `promo-picker.js` was **217 lines behind** the published fork, so every
  assertion ran against code nobody was shipping (§64's stale-fixture class, one level up);
- five sed anchors no longer matched anything, so those mutants left the body **byte-identical** —
  a no-op "caught".

This sat in the evidence chain for the promotion-picker promote that went to production. §61 says
an assertion never shown red is not an instrument; §72 is the sharper form: **the instrument built
to prove your assertions can fail is itself an assertion, and it needs the same treatment.**

Two guards, both now in every mutate.sh in this repo:
1. **Zero-byte-mutation hard fail** — `cmp -s` the mutant against the original; identical bytes
   abort the run loudly. A stale anchor can never again be scored as a detection.
2. **Resync before trusting** — diff the frozen offline body against the published node bytes at
   the start of the run. Offline suites are caches; they decay exactly like `normalized-workflows/`
   did (the export `--verify` gate exists for the same reason).

Detection heuristic worth internalising: **a mutation score of exactly 100% on first run is a smell,
not a triumph.** Real suites have at least one mutant that survives and teaches you a missing
assertion — when this harness was repaired, one genuinely-uncatchable mutant (the start-date
tiebreak) surfaced immediately and became a new assertion.
