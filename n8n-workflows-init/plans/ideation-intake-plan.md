# Ideation Intake — n8n routing plan (thin, sequencing X)

---

## ✅ Revision 5 (2026-07-20) — REAL ENDPOINT WIRED; ID1/ID2/ID3 GREEN END-TO-END

User-gated decision: the chat-console lane now hits the **real** turn endpoint. Session state
should live in the clone's own store (n8n_test); only *idea creation* should be real.
Contact `437264483` is authorised for prod writes.

**n8n changes (clone `txiPzSxy3Pclsz6v`, published `d99dfb34`):**
1. `ideate-egress-gate` → mock only when `test_run_id && scope !== 'chat-ui'`. The chat-ui lane
   goes to `ideate-turn-http`; canary/replay lanes stay mocked.
2. `ideate-turn-http` body gains `session_vars: { ideation: <from n8n_test> }` — **flat**, the
   shape the endpoint already expects. `IdeationTurnRequest` is a plain `BaseModel` (no
   `extra="forbid"`), so pydantic ignores it today; it activates the moment sorento reads it.
3. `build-ideate-reply`: accepts BOTH pointer shapes, and no longer double-renders the link.

**Verified end-to-end against the real endpoint** (session `ideate-real-001`):
| turn | result |
|---|---|
| "I want a sales dashboard so I can monitor sales performance" | `collecting` — real extraction: problem statement + proposed solution |
| "impact is to monitor sales, department is project sales" | `review` — all 4 fields accumulated, `missing: []`, "Reply 'confirm'" (D-CONFIRM holds: never auto-submits) |
| "confirm" | `complete` — real Idea `0868ce8f-eedc-4449-ba79-be2d4e6abe6b`, deep link rendered, pointer **cleared in BOTH stores** |

So **ID3 PASSES**. ID4 (duplicate) still untested.

### ⚠️ The session_vars shape mismatch (understand this before promoting)

Prod stores `session_vars = { user_response, variables: { …CRM keys…, ideation } }` (nested,
written by n8n). But `ideation_turn_service.py:177/245` reads and writes
`session_vars["ideation"]` **flat, at the top level**.

An earlier prediction that this would break continuation ("every turn looks like turn 1") was
**WRONG**. The endpoint reads back its own flat key, so it is **self-consistent**: it writes
top-level `ideation` on turn 1 and finds it on turn 2. Continuation works — but it runs
**entirely through prod `respond_contacts`**, in a loop that never touches n8n's session store.
Verified: after turn 2, prod carried top-level `ideation.draft_id`; `variables.ideation` stayed
empty.

Consequences while this stands:
- n8n's `ideation` pointer (the ID2/IU3 round-trip proven in Rev 4) is **decorative on the
  ideate path** — the endpoint ignores what n8n carries and uses its own prod copy.
- Prod session_vars accumulates a stray top-level `ideation` key that nothing in n8n reads.
- `guard-d-record`'s `would_write` claim is **false for ideate turns** — a real prod session
  write happens inside the HTTP call, before n8n's `session-save-gate` is consulted. Do not
  treat the egress log as zero-egress evidence for this branch.
- ideate turns cannot join deterministic replay (state lives outside n8n_test).

**The fix is the sorento half (NOT this repo, per the split agreed 2026-07-20):**
`handle_turn(db, *, respond_io_id, message_text, session_vars=None, ...)` — when the caller
supplies `session_vars`, use it as the state base instead of `contact.session_vars`, and SKIP
`overwrite_for_contact` (caller owns persistence). Keep reading the contact row for
`phone_number` (→ `submitter`); that is a prod READ and is allowed. Default `None` preserves
today's behaviour so live is unaffected until n8n sends the field — which it now already does.
Once landed: clone reads/writes n8n_test only, `create_idea` stays real, prod session untouched,
egress log honest again, and Rev-3.1's single-writer goal is met in live too.

---

## ✅ Revision 4 (2026-07-20) — PARSER SHIPPED ON FORK; ID1/ID2/IU1/IU3/R2 GREEN

**Fork correction (supersedes the Rev-2 handoff step 1).** The clone `txiPzSxy3Pclsz6v`
does NOT call `CpxE8LroLzCkrAQN` (dead wood, upd 2026-07-06). Its
`Call 'sub-query-reformulator'` points at **`wI5RkNGW3EOJfBdo` = "sub-semantic-parser FORK
domain-continuity-carry"** — the fork carrying the signed-off-but-promote-HELD domain-continuity
change. User decision (2026-07-20): **stack `ideate` on that same fork**, accepting that the
promote diff to live `XTODTw` now carries BOTH changes.

**Parser change — SHIPPED + PUBLISHED on `wI5RkNGW3EOJfBdo`** (backup versionId
`711b689c-8feb-4951-89ee-3fa6fe7b4d75`; published `725161ca-ba8e-47a4-8e05-1f5cf058ba6e`):
- `AI Agent.systemMessage`: `submit_idea` added to the intent list; `ideate` added to the
  `domain_hint` enum; new **DECISIVE DOMAIN TERM** block for `ideate / submit_idea` (semantic —
  "a PROPOSAL about the FUTURE", explicitly NOT existing-data questions / complaints / help
  requests); new **`== IDEATION CONTINUATION ==`** section; ROUTING maps `ideate → null/null`.
- `output_exchange.deriveRouting`: unchanged — its `default:` arm already returns
  `{suggested_team: null, suggested_agent: null}` for an unknown domain, which is the required
  pass-through. **One code change**: `submit_idea` added to `_DECISIVE_INTENTS`, so an ideate turn
  is `_explicit` and OVERRIDES a carried CRM domain (else "I have an idea…" right after an order
  query inherits `order`). Bare ideate continuations stay non-decisive → still carry `ideate`.
- ⚠️ **The continuation trap that needed the prompt work:** "it's for the operations team" answers
  *who the idea is for* but names a department — rule 1 would fire `request_for_help`. The
  IDEATION CONTINUATION block carves that out; verified below.

**Spine bug FOUND + FIXED (IU3 was failing).** `compile-current-state`'s carry-forward read
`$('get-session-vars-http')`, but in `chat-stateful` mode the session comes down the **pg lane**
(`pg-get-session`) and both lanes converge on the **`get-session-vars` NoOp**. The http-node
lookup threw, the `catch` returned `null`, and **a CRM question mid-collection WIPED the open
draft** — the exact D8 interrupt-correctness requirement in §5/§7. Fixed to read the converged
`get-session-vars` node. Clone republished (`387445d8-2e94-4f6c-9bb5-a81debe68e15`).
Fail-closed orphans re-confirmed intact after the edit (send-message-files/images/video,
update-human-intervened, save-session-vars, sendmsg-respond3 all still 0-inbound).

**Test results — driven through `zz-chat` (real parser, mock turn endpoint via `test_run_id` →
`ideate-egress-gate`, so 0 prod write):**

| id | result | evidence |
|----|--------|----------|
| **ID1** turn-1 text | ✅ | exec 9240316 — `domain_hint=ideate`, `intent_hint=submit_idea`, If-ideate TRUE → mock; collecting reply rendered |
| **ID2** continuation ("it's for the operations team") | ✅ | exec 9240337 — still `ideate`/`submit_idea`, `message_type=business_query` (**not** request_for_help), `domain_signal_source=intent_explicit`; turn-2 `get-session-vars` carried `draft_id=mock-draft-0001` — pointer round-trip proven |
| **IU1** escalate mid-draft | ✅ | exec 9240786 — `request_for_help`, If2 wins above If-ideate, guarded stub reply; `ideation` pointer **preserved** |
| **IU3** CRM interrupt → resume | ✅ *(after the fix)* | exec 9240705 — stock answered normally AND `ideation.draft_id` survived; was `ideation:null` pre-fix |
| **R2** casual | ✅ | "Hai" → normal greeting, If-ideate FALSE |
| Malay ideate ("cadangan: boleh tak sistem ingatkan…") | ✅ | classified `ideate` — no-overfit holds across language |

**STILL OPEN:**
- **ID3 (review→confirm→complete) / ID4 (duplicate) are NOT tested.** `ideate-turn-mock` is a
  static `collecting` stub, so it cannot exercise the status transitions, the `link` append, or
  the pointer-clear. Needs either a stateful mock or a run against the real turn endpoint
  (a real shared-service write — user-gated).
- **ID5 voice** not tested (round 1 = text only per Rev-3).
- **IU2 idempotent resend** not meaningfully testable against a static mock.
- **R1 golden-master replay** not run.
- Note: on an ideate turn `routing` still resolves to the *prior* team (deriveRouting returns
  nulls → the `?? priorRouting ?? 'customer_service'` fallback chain fills it). Inert — the ideate
  branch never escalates — but it means `variables.routing` is not null on ideate turns.

---

## ⚠️ Revision 2 (2026-07-19) — TRANSPORT CHANGED + build blockers

**Re-grounded against live n8n via MCP (2026-07-19):** spine `9qVyfUxmRQqrpGRMDLRuz`
(active, upd 2026-07-16), TEST clone `txiPzSxy3Pclsz6v` (upd 2026-07-15), canary
`VtIV3TF3aw2Fx8No` — all still exist. The §3/§7 clone+parser strategy stands.

**What changed since Rev 1 — n8n calls sorento over HTTP, NOT the create_idea MCP tool:**
The decided + built-and-tested architecture is a **two-hop HTTP relay**, not a direct
MCP `create_idea` call:

```
n8n (ideate branch)
  → HTTP POST {sorento_fe}/api/v1/external/ideation/turn   (X-API-Key)
      body: { respond_io_id, message_text }
  → sorento turn endpoint: runs its OWN LLM extractor ({fields, remove, confirm}),
      merges session_vars.ideation, calls shared-service create_idea over HTTP
      (Authorization: Bearer workspace key), derives product_id from the
      workspace↔Product binding
  ← { status: "collecting"|"review"|"complete"|"duplicate", reply_text, link,
      session_vars: { variables: { ...CRM keys preserved..., ideation:{draft_id,status,missing,updated_at} } } }
```

Consequences for the sections below (they supersede the stale wording):
- **§1 / §4.2 / §9:** `Call 'sub-ideate'` is a single **HTTP Request** node to the sorento
  **turn endpoint**, NOT an MCP tool call and NOT a call to shared-service directly.
  n8n does NO field extraction and passes NO `product_id`/`draft_id`/`submitter_contact_id`
  computation — the turn endpoint owns all of it. n8n sends `respond_io_id` + the raw
  `message_text` only.
- **§4.3 / §5 (session_vars):** the turn endpoint **returns the full merged `variables`
  blob** (CRM keys preserved + `ideation` pointer). So `build-ideate-reply` no longer
  *computes* `ideation_blob`; it takes `reply_text` (+ `link`) for the reply and hands the
  returned `session_vars.variables` straight to `compile-current-state`/`save-session-vars`.
  The carry-forward-when-inert requirement (non-ideate interrupt keeps the open draft)
  still holds and is now naturally satisfied because the endpoint preserves the CRM keys.
- **`review` status is new** (D-CONFIRM): capture never auto-completes — even a fully
  complete first turn returns `review` and asks to confirm/revise until an explicit
  confirm. §8 needs an **ID-review** case (turn returns `review`; a follow-up "confirm"
  yields `complete`; a "change X to Y" revises then re-reviews).

**BUILD BLOCKERS — do NOT start the build until these clear (user-gated):**
1. **Deployment dependency.** The remote n8n (`automate-sorento.foundryx.my`) must be
   able to reach the turn endpoint. The ideation code currently lives ONLY on the local
   clean branch `feat/ideation-ideate-intent` (sorento) + `feat/ideation-capture-spine`
   (shared-service) — **not deployed**. End-to-end n8n testing is blocked until the
   sorento ideation branch is on a URL the remote n8n can hit (staging/prod FE) OR a
   tunnel is stood up. Local `localhost:3000` is NOT reachable from the remote n8n.
2. **Parser edit = live.** Per repo CLAUDE.md, the clone calls the **LIVE** parser sub
   `XTODTw-dJcV0uRdC056hG` (the fork `SB8wEXKdpITfhYXA` assumed in §2/§7 may be stale —
   re-verify with MCP). Adding `ideate` classification therefore either edits live or
   needs a fresh fork rewired into the clone first. Either way it is **user-gated**.
3. **Workflow mutation + promotion are user-gated.** Building on the clone via MCP, and
   any promote to the live spine/parser, require explicit user go-ahead + a live backup.
4. **Multi-turn draft_id in the clone.** The clone's `save-session-vars` is orphaned
   (fail-closed), so the draft pointer won't persist across turns via the normal path in
   `uac` mode. Decide the test carry mechanism (inject draft_id into the redis item, or
   write to `respond_contacts_test`) before the multi-turn canary — the user's chat-console
   is the intended manual driver.

## HANDOFF BRIEF (for a fresh session booted in this repo — 2026-07-19)

**DONE (banked):** ideate spine branch BUILT + fail-closed + PUBLISHED on clone `txiPzSxy3Pclsz6v`:
`If2 FALSE → If-ideate (domain_hint=="ideate") → ideate-egress-gate (test_run_id? → mock : real)
→ [ideate-turn-mock | ideate-turn-http POST https://fe-sorento.foundryx.my/api/v1/external/ideation/turn
x-api-key] → ideate-turn (NoOp) → build-ideate-reply → compile-current-state`. compile-current-state
got the `_ideate` override (highest-priority manual reply) + `ideation` persist/carry-forward.
Turn endpoint LIVE on prod (verified). Reuse/centralize-at-n8n decision (Rev-3.1) applied.

**KEY CORRECTION — test path:** the clone is NOT driven by `zz-canary-seed`/`main-message-list-test`
anymore. Current arch: **`zz-chat` (oyYfVvZHRZpWubTy, the Sorento Chat Console)** → `build-item`
pushes to per-contact queue `test:q:{contact_id}` + `ready-contacts-test` → **`zz-dispatcher-test`
(2D0cw2Y1aPW2LOlU)** pops + fires the clone → reply read from `chat:reply:{chat_id}`. `zz-chat` uses
the REAL parser (no mock injection), mode `chat-stateful`. So end-to-end ideate test via `zz-chat`
needs the PARSER FORK done first. (For a branch-only deterministic test, inject
`mock_reformulator_output` into a `test:q:{contact_id}` item instead — NOT main-message-list-test.)

**REMAINING (sequential):**
1. Parser fork `CpxE8LroLzCkrAQN` (rebase on live XTODTw first): add `ideate` to AI-Agent
   systemMessage domain contract + `output_exchange.deriveRouting` pass-through (no team routing).
   Publish the fork; wire the clone's `Call 'sub-query-reformulator'` → the fork.
2. Test via `zz-chat` with ideation-phrased messages → assert If-ideate fires, mock endpoint hit
   (test_run_id present → mock path, 0 prod write), reply renders in the console. Multi-turn
   collect→review→confirm→complete + duplicate.
3. Regression sample (non-ideate turns unchanged) → **user-gated promote** to live parser sub +
   live spine `9qVyfUxmRQqrpGRMDLRuz` (backup versionIds first; publish sub BEFORE spine).

**FOLLOW-UP (sorento):** make the turn endpoint return-only (drop `overwrite_for_contact`) so n8n
is the single session_vars writer (Rev-3.1). Small PR + deploy.

---

**Status: SPINE BRANCH BUILT on clone txiPzSxy3Pclsz6v (2026-07-19).** Added If-ideate +
ideate-turn-http (POST fe-sorento turn endpoint, x-api-key) + build-ideate-reply; rewired
If2 FALSE→If-ideate→If10; If-ideate TRUE→http→reply→compile-current-state (reuses send+save);
compile-current-state got the _ideate override + ideation persistence/carry-forward. NEXT:
deterministic bypass test (mock_reformulator_output domain_hint=ideate) → parser fork
CpxE8LroLzCkrAQN classification → regression → user-gated promote.

**Status: ALIGNED + BUILDING (2026-07-19). Blocker #1 CLEARED — turn endpoint live on prod
(`https://fe-sorento.foundryx.my/api/v1/external/ideation/turn`, verified end-to-end: an idea
was captured through it after seeding idea statuses on shared-service prod).**

### Rev-3 aligned decisions (supersede where they conflict)
- **session_vars = CENTRALIZED AT n8n (reuse), Rev-3.1 (user, 2026-07-19):** reuse the existing
  `compile-current-state → send → save-session-vars` path for ideate too — do NOT build a separate
  send/save. `compile-current-state`, when the ideate branch ran (`$('build-ideate-reply').isExecuted`,
  same pattern as `_sug`/`_mem`), sets `variables` = the endpoint's RETURNED `session_vars.variables`
  (full blob: `ideation` pointer + preserved CRM keys) so n8n's own save persists the correct state.
  Non-ideate turns rebuild as today (already carries CRM keys; `ideation` rides along because the
  ideate turn's save wrote it and `compile` must re-emit it — add `ideation: session_vars.ideation ?? null`).
  FOLLOW-UP (sorento): make the turn endpoint **return-only** (drop `overwrite_for_contact`, keep
  merge+return) so n8n is the single writer — until then both write the same blob (harmless).
- **n8n is a pure relay:** classify ideate → HTTP POST the turn endpoint (`respond_io_id` +
  `message_text`, header `X-API-Key`) → relay `reply_text` (+ `link` on complete) out the existing
  send sub. No extraction, no draft_id, no product — all server-side.
- **Parser:** fork the reformulator sub → wire into TEST clone → prove ideate classification →
  **user-gated promote** to live sub + spine.
- **Round 1 = TEXT ONLY** (voice deferred). Scenarios ID1/ID2(review)/ID3(confirm→complete)/
  ID4(duplicate) via deterministic `mock_reformulator_output` bypass + canary; regression (R1/R2)
  before promote.
- Build strictly per repo `CLAUDE.md` + `docs/LESSONS.md` (MCP source-of-truth, build on clone
  `txiPzSxy3Pclsz6v` + parser fork, verify every Postgres node = `n8n_test-db`, publish sub before
  testing parent, live-write auth in the agent's initial task).

---

**Status:** design, not built. Keys back to the program spine
`foundryx-shared-service/documentation/plans/ideation/PLAN-ideation-to-delivery-program.md`
(**§5.5 is canonical for this file**; also D6, D7, D8, D9, D19, §5.1, §5.2).
**Owners:** n8n chatbot (Claude) — this repo. shared-service owns `create_idea`; sorento owns
the `ideate` intent + the `session_vars.ideation` blob shape.
**Goal:** route a WhatsApp turn classified `domain=ideate` to the shared-service `create_idea`
MCP tool, carry `session_vars.ideation.draft_id` across turns, relay `reply_text` (+ product-domain
`link` on completion). **Thin, additive, guarded** — no new state store in n8n, must not regress any
existing CRM intent.

This is the **X** path (D19): the `ideate` intent lives in the *current* sorento brain now; when the
assistant is later ported to shared-service (Phase 0) this small routing arm is absorbed. n8n does
**not** own idea state — the draft Idea is durable in shared-service (D8); n8n carries only the
pointer.

This doc is grounded against the live spine `sorento-consume-main` (`9qVyfUxmRQqrpGRMDLRuz`) and its
fail-closed TEST clone (`txiPzSxy3Pclsz6v`), plus the reformulator sub (`sub-semantic-parser`
`XTODTw-dJcV0uRdC056hG` live / `SB8wEXKdpITfhYXA` test). Node names below are verbatim from that flow
(see `docs/flows/sorento-consume-main.md` + `docs/flows/sub-query-reformulator.md`).

---

## 1. What n8n does / does NOT do (scope, per §5.5)

**Does:**
1. Detect `domain=ideate` on a turn (via the existing reformulator/parser — new `domain_hint` value).
2. On ideate, invoke the sorento brain path that calls the shared-service `create_idea` MCP tool with
   `session_vars.ideation.draft_id` (absent on turn 1, present on continuation).
3. Persist the returned pointer blob back via the existing `save-session-vars` under a **namespaced
   `ideation` key** (must not clobber CRM keys).
4. Relay `reply_text`; on `status=complete` append the product-domain `link`; on `status=duplicate`
   relay the "similar … upvoted" line.
5. Voice → transcribe (existing node) → text into the turn before classification (D9).

**Does NOT (hard rules from §5.5 + D8):**
- **No new state store in n8n. No PG-memory node.** The draft is system-of-record in shared-service;
  `session_vars.ideation` holds the `draft_id` pointer only.
- No validation / captured-vs-missing / dedup / link-minting logic in n8n — all of that is inside
  `create_idea` on shared-service (D7). n8n is a dumb relay.
- No new egress channel: replies go out the **existing** send-message sub-flow.
- The product is **never** chosen by n8n or the human — `product_id` is derived by shared-service
  from the workspace↔Product binding (D6). n8n does not pass a product.

---

## 2. Where `ideate` is detected — the reformulator

Detection is a **new value of `domain_hint`** emitted by `Call 'sub-query-reformulator'`
(`output.domain_hint == "ideate"`). This is the single classification signal the spine branches on.

- **Parser change (reformulator sub):** add `ideate` to the domain enumeration in the **AI Agent**
  `options.systemMessage` (the domain contract, §5 of `sub-query-reformulator.md`) and allow
  `output_exchange`'s `deriveRouting` to pass it through (no team/agent routing needed — ideate does
  not escalate to a CS team). Ideation turns classify as `message_type == "business_query"` with
  `domain_hint == "ideate"`.
- **Continuity across the collection:** rely on the **existing** domain-carry behaviour
  (`parser-domain-continuity-carry`): a bare continuation reply with no decisive term **keeps the
  previous domain**, so turn-2..N of a collection (a plain answer, or even "yes") still carry
  `domain_hint == "ideate"` and re-enter the ideate branch. This is why the branch must sit **above**
  `If9` (which would otherwise swallow `casual`/`confirmation` continuations) — see §3.
- **No overfit:** treat ideation as a semantic domain ("I have an idea / feature request / it'd be
  great if…"), not a keyword list. Add paraphrase cases to the parser fixtures, not an allowlist
  (per the no-overfit rule).
- Build/test the parser change on the **fork** (`SB8wEXKdpITfhYXA` / re-fork of live
  `XTODTw-dJcV0uRdC056hG`), never on the live sub. The deterministic `test-reformulator-bypass`
  (`mock_parser_output`) lets us inject `domain_hint:"ideate"` to exercise the spine branch with 0
  parser tokens.

---

## 3. Where the branch attaches in `sorento-consume-main`

The post-access branch ladder is a FALSE-chain of `If` gates (first TRUE wins):

```
If5 (access granted?) ─TRUE─▶ If2 (escalation) ─FALSE─▶ If10 (correction) ─FALSE─▶
   If9 (clarify-menu) ─FALSE─▶ If1 (clarification) ─FALSE─▶ not-supported-domain ─FALSE─▶
   If (access-type) ─▶ … ─▶ resolve-entity ─▶ If3 ─▶ get-results (MCP) …
```

**Attach point — insert ONE new gate `If-ideate` between `If2` and `If10`:**

```
If2 ─FALSE(out1)─▶ [If-ideate]
                     ├ TRUE (qf.domain_hint == "ideate") ─▶ Call 'sub-ideate' ─▶ build-ideate-reply ─▶ compile-current-state
                     └ FALSE ─▶ If10   (existing chain, byte-identical from here down)
```

Why exactly here (both bounds matter):
- **Below `If2`** so an explicit escalation / `request_for_help` during a collection still wins and
  routes to `Call 'sub-human-intervention'` (a hand-off mid-draft is legitimate; the draft simply
  stays open in shared-service per D8 — n8n does nothing to it).
- **Above `If10`/`If9`/`If1`/`not-supported-domain`/`resolve-entity`** so ideate turns **never** fall
  into the CRM machinery: `If9` would otherwise catch `casual`/`confirmation`/`business_query+
  domain==null` continuations, and the `resolve-entity → If3 → get-results` path would try to resolve
  ideation prose as product/customer codes. The ideate branch **short-circuits all of it** — no
  `resolve-entity`, no `get-results`, no `not-found-error-message`.

The only edit to the existing ladder is repointing **`If2` FALSE (out1)** from `If10` to `If-ideate`,
and pointing **`If-ideate` FALSE** to `If10`. Every existing gate keeps its exact condition and
targets — a non-ideate turn traverses `If2 → If-ideate(FALSE) → If10 → …` identically to today.

---

## 4. The ideate branch — three nodes

### 4.1 `If-ideate` (new `n8n-nodes-base.if`)
- Condition: `$('Call 'sub-query-reformulator'').first().json.output.domain_hint == "ideate"`
  (single condition; boolean equals, mirrors the other `If` gates).

### 4.2 `Call 'sub-ideate'` (new `executeWorkflow`, or reuse the MCP agent path)
The "sorento brain path that invokes `create_idea`" (§5.5). Two equivalent implementations — pick per
how MCP tools are dispatched today:
- **(a) New thin sub-flow `sub-ideate`** — an `executeWorkflow` node that calls the `create_idea` MCP
  tool directly (same MCP transport `Call 'sub-get-results'` uses). Preferred: keeps the spine lean
  and makes the ideate call independently testable/canary-able.
- **(b) Reuse the existing agent/get-results dispatch** with `create_idea` added to the tool set.
  Only if the current MCP wiring makes a bespoke call awkward.

**Input to `create_idea`** (§5.1 — n8n assembles from turn context, does NOT compute anything):
| field | source in n8n |
|---|---|
| `message_text` | `tf-message.message.message.text` **or** the transcribed text (§6) / `…attachment.description` — the same text the reformulator classified on |
| `submitter_contact_id` | `sorento-sub-respond-findcontact-respond.first().json.id` (the respond.io contact id) |
| `draft_id?` | `get-session-vars.first().json.session_vars.ideation?.draft_id` — **absent on turn 1**, present on continuation (§5) |
| `audio_attachment_ref?` | `tf-message.message.message.attachment.url` when the turn was voice (§6, D9) |
| `product_id` | **NOT sent by n8n** — derived by shared-service from the workspace↔Product binding (D6) |

**Output** (§5.1): `{ draft_id, status: "collecting"|"complete"|"duplicate", captured, missing[],
reply_text, link?, duplicate_of? }`. Idempotent on repeated `draft_id` (D8) — a resend never
double-creates.

### 4.3 `build-ideate-reply` (new `code`)
Mirrors the existing `build-cs-member-offer` / `build-suggest-offer` pattern (a Code node that shapes
the user-facing message + the state the next turn needs, then converges into `compile-current-state`).
It reads `Call 'sub-ideate'` output and emits:
- `ideate_response` — `reply_text`; if `status=="complete"` append `link` (the product-domain deep
  link, e.g. `https://fe-sorento.foundryx.my/ideas/{id}`, §5.3 — displayed verbatim, never a raw
  UUID); if `status=="duplicate"` relay the "similar to … upvoted" line built from `duplicate_of`.
- `ideation_blob` — the §5.2 pointer to persist, or a **clear** sentinel:
  - `collecting` → `{ draft_id, missing, updated_at: <iso> }`
  - `complete` / `duplicate` → **cleared** (so the next turn starts a fresh draft).
- `manualResponse = true` (short pass-through reply, like the escalate/offer branches).

Then `build-ideate-reply → compile-current-state` (direct edge, exactly like
`build-cs-member-offer → compile-current-state`).

---

## 5. session_vars round-trip (the pointer, namespaced)

The spine already round-trips session vars with **zero** extra infrastructure — reuse it verbatim:

```
if-message-is-audio ─▶ get-session-vars (GET /external/conversation-variables/{contact_id})
   ─▶ Call 'sub-query-reformulator' ─▶ … branch … ─▶ compile-current-state
   ─▶ save-session-vars (PUT /external/conversation-variables/{contact_id}, body = JSON.stringify($json))
```

- **Read (turn N):** the ideate branch reads `draft_id` from
  `$('get-session-vars').first().json.session_vars.ideation?.draft_id` (already fetched at the top of
  every turn) and passes it to `create_idea`.
- **Write (turn N):** `compile-current-state` builds `output.variables` (the persisted blob). Add the
  ideate override alongside the existing `_sug` / `_mem` / `_cat` `isExecuted` overrides:
  ```js
  const _ideate = (() => {
    try { return $('build-ideate-reply').isExecuted ? $('build-ideate-reply').first().json : null; }
    catch (e) { return null; }
  })();
  if (_ideate) { response = _ideate.ideate_response; manualResponse = true;
                 includeResponse = true; isEscalateBranch = true; }
  ```
  and, in the `output.variables = { … }` object, add **one namespaced key**:
  ```js
  "ideation": _ideate ? _ideate.ideation_blob : (session_vars.ideation ?? null)
  ```
  - On `collecting` → writes `{draft_id, missing, updated_at}`.
  - On `complete`/`duplicate` → `ideation_blob` is null → key cleared.
  - On a non-ideate turn → `_ideate` is null → **carry the prior `ideation` forward untouched** (so a
    CRM question mid-collection does NOT clear an open draft — interrupt-correctness, D8). This
    requires `compile-current-state` to read the incoming `session_vars` (available via
    `get-session-vars`) and re-emit `ideation` unchanged when the branch didn't run.
- **Non-clobber guarantee:** `ideation` is a **sibling key** added to `output.variables` next to
  `message_type`, `domain_hint`, `entities`, `last_result_set`, `selection_context`, etc. All existing
  keys are still written exactly as today; nothing about the CRM state is touched.

**No PG-memory node, no new table, no redis key** — `session_vars.ideation` is the only n8n-side state
and it is just a pointer to the durable shared-service draft (D8, §5.5).

---

## 6. Voice → text (D9) — reuse existing transcription

Voice is already transcribed **before** classification, so ideation-by-voice needs no new audio node:
- `if-message-is-audio` (existing IF) gates the audio path; `Code in JavaScript` extracts the audio
  URL (`tf-message.message.message.attachment.url`) → `Transcribe a recording`
  (`@n8n/n8n-nodes-langchain.openAi`) → `transcribed-message` (Code) puts the text back onto the turn.
- The reformulator then classifies the **transcribed text**, so a spoken idea reaches
  `domain_hint == "ideate"` exactly like a typed one.
- The **only** ideate-specific addition: pass `audio_attachment_ref = attachment.url` into
  `create_idea` (§4.2) so shared-service keeps the original audio alongside the raw text (D9).

---

## 7. Additive + guarded — regression safety

The live-flow surgery risk (spine §6.6 "Live-flow surgery") is contained by construction:
- **Single-condition gate.** `If-ideate` fires ONLY on `domain_hint == "ideate"`. Every non-ideate
  turn falls through `If-ideate` FALSE to `If10` and is byte-identical to today. No existing gate,
  tag, catalog, or send node is edited (only `If2`'s FALSE edge is repointed).
- **compile-current-state** gains one override branch + one variables key, both guarded by
  `_ideate` / `isExecuted` — inert on every non-ideate turn (same pattern already proven by `_sug`
  and `_mem`).
- **Interrupt correctness (D8):** a CRM question mid-collection routes through the normal ladder;
  because `compile-current-state` re-emits the incoming `ideation` when `_ideate` is null, the open
  draft pointer survives, and the next `ideate` turn resumes by `draft_id`. This must be explicitly
  exercised (§8, IU3).

### Test / canary approach (mirror `suggest-on-miss-plan` §10)
Build and validate on the **TEST clone `txiPzSxy3Pclsz6v`** (fail-closed: `is_test` short-circuits
egress, orphaned egress nodes, zero real send/assign/write) + the reformulator **fork**
(`SB8wEXKdpITfhYXA`). Never edit the live spine/sub directly.

1. **Rebase** the test clone + parser fork on the current live before editing (per
   `[[rebase-on-live-then-fix]]`); confirm the zero-egress safety gate (S1–S6) still holds on the
   fresh fork BEFORE any change.
2. **Deterministic branch test** — inject `mock_parser_output` with `domain_hint:"ideate"` via the
   `test-reformulator-bypass`; assert `If-ideate` fires, `create_idea` is called with the right
   fields, `ideate_response` renders, `ideation_blob` persists — **0 parser tokens, 0 real egress**.
3. **Canary run** (`zz-canary-run` / `test:egress:{run_id}`) for the §8 scenarios — assert
   `would_send` only.
4. **Golden-master replay** (the ~2,216 `n8n_test` turns) — assert **non-ideate turns diff-clean**
   (proves no CRM-intent regression: greetings, stock/eta/order/attachment/cert/promotion/master all
   unchanged). Only intentional ideate turns diff.
5. Reviewer signs the node-diff + re-confirms zero egress from run logs → **user-gated promote**
   (backup live first, then publish spine + parser sub).

---

## 8. Test scenarios (n8n side)

| id | turn(s) | expected |
|----|---------|----------|
| **ID1 turn-1 text** | "I wish the CRM could remind me before a DO's SLA breaches" | classify `ideate`; `If-ideate` TRUE; `create_idea` called **no `draft_id`**; reply = tool `reply_text` (a collecting prompt); `session_vars.ideation = {draft_id, missing, updated_at}` persisted |
| **ID2 continuation** | (next turn) "it's for the operations team" | domain carried → `ideate`; `create_idea` called **with** `draft_id` from session_vars; enriched reply; `missing` shrinks in the blob |
| **ID3 complete** | final answer that satisfies the completion rule | `status=complete`; reply appends product-domain `link` (no raw UUID); `session_vars.ideation` **cleared** |
| **ID4 duplicate** | an idea semantically equal to an existing one | `status=duplicate`; reply = "similar to … upvoted"; blob cleared |
| **ID5 voice idea** | a voice note describing an idea | transcribed (existing nodes) → classify `ideate`; `audio_attachment_ref` passed to `create_idea`; behaves like ID1 |
| **IU1 escalate mid-draft** | mid-collection: "just get me a human" | `If2` wins (above `If-ideate`) → `sub-human-intervention`; draft untouched in shared-service |
| **IU2 idempotent resend** | same message twice with same `draft_id` | second call enriches, does not double-create (asserts §5.1 idempotency wiring, no client-side dedup in n8n) |
| **IU3 interrupt** | ideate turn-1 → a CRM stock query → back to the idea | the CRM turn answers normally AND leaves `session_vars.ideation` intact; the resume turn passes the SAME `draft_id` |
| **R1 no regress** | every §9.2-style working CRM query from the suggest-on-miss golden set | identical output; `If-ideate` never fires; no `ideation` key churn on CRM turns except carry-forward |
| **R2 casual** | "Hai" / thanks / off-topic | classify casual (unchanged); `If-ideate` FALSE; no ideate call |

---

## 9. Task split

### shared-service (owns the tool — not this repo, listed for contract clarity)
- `create_idea` MCP tool per §5.1 (validate, captured/missing, draft-on-turn-1, dedup, link mint,
  idempotent on `draft_id`), reachable over the same MCP transport n8n already calls.

### sorento (owns the intent + blob shape — not this repo)
- Register `ideate` intent semantics; own the `session_vars.ideation` shape (§5.2).

### n8n (this repo — on the TEST clone + parser fork)
1. **§2** Parser: add `ideate` to the `domain_hint` domain contract in the AI Agent systemMessage;
   let `output_exchange` pass it through (no team routing). Add paraphrase fixtures.
2. **§3/§4** Spine: insert `If-ideate` between `If2` and `If10`; add `Call 'sub-ideate'`
   (or reuse the MCP agent path) + `build-ideate-reply`; converge into `compile-current-state`.
3. **§5** `compile-current-state`: add the `_ideate` override + the namespaced `ideation` variables
   key with carry-forward-when-inert semantics.
4. **§6** Pass `audio_attachment_ref` from the existing transcription path into `create_idea`.
5. **§7/§8** Validate: deterministic bypass → canary → golden-master replay → reviewer → user-gated
   promote. Keep all `is_test` egress guards.

### Shared / verify
- Confirm the MCP transport used by `Call 'sub-get-results'` can reach the shared-service
  `create_idea` tool (auth / base URL) before wiring `sub-ideate`.
- Confirm the backend `PUT /external/conversation-variables/{contact_id}` accepts the extra
  `ideation` key without schema rejection (it stores the `variables` blob).
- Confirm `session_vars.ideation` survives a non-ideate interrupt turn (the carry-forward in §5).

---

## 10. Sequenced execution

1. Rebase test clone + parser fork on live; confirm zero-egress (§7.1).
2. Parser `ideate` classification on the fork → deterministic bypass proves `If-ideate` fires (§7.2).
3. `If-ideate` + `sub-ideate` + `build-ideate-reply` + `compile-current-state` override → canary
   ID1/ID2/ID3 (§8).
4. Blob carry-forward + interrupt (IU3) + idempotency (IU2) + escalate-mid-draft (IU1).
5. Voice (ID5) — assert transcription reuse + `audio_attachment_ref`.
6. Golden-master replay (R1/R2) full regression → reviewer → user-gated promote.
