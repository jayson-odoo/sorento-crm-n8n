# Console persistence — stateful chat-console test lane (plan)

**Status:** PLAN (planner deliverable, 2026-07-14). No workflow edited, no execution run.
**Scope tag:** **`deterministic`** — the change is Postgres persistence + IF-gate branching (session
read/save gates, chat_histories logger). No parser prompt is touched. *Driver caveat* (identical to
`incoming-axis-gate-and-partial-message`): the driver is the **chat webpage**, so the live reformulator
`XTODTw-dJcV0uRdC056hG` (gpt-5.4-mini) runs once per turn regardless — a *driver* cost, not a scope
escalation. Parser output is asserted **structurally** (session evolves, entities resolve), never exact.
Multi-turn session evolution **requires** the real reformulator + real CRM reads (there is no mock path
through the console/dispatcher), so this lane cannot run 0-token; it is deterministic-tier by *what it
changes*, driver-priced by *how it runs*.

**Source of truth = live n8n via MCP** (read-only, 2026-07-14). Workflows inspected:
`zz-chat oyYfVvZHRZpWubTy`, `zz-dispatcher-test 2D0cw2Y1aPW2LOlU`, clone spine
`sorento-consume-main TEST txiPzSxy3Pclsz6v` (versionId==active `23d2228d`), send fork
`sub-sendmsg-CHAT ublq9nSlrpz63xan`, logger sub `sub-respond-save-message-redis UrETd-jm46tFj3Xw7w8vL`.

---

## 0. TL;DR — most of this is ALREADY BUILT (plan corrects a stale premise)

The task's premise (from memory `chat-console-harness.md`, "NEXT THREAD") is that the console runs
`mode:'uac'` (session write orphaned, no state) and that buttoned replies bypass logging. **The live
clone no longer matches that premise.** A prior build (out of pipeline order — no plan/UAC/run doc
existed until this one) already wired a stateful lane. Grounded findings:

1. **`zz-chat › build-item` already emits `mode:'chat-stateful'`** (NOT `uac`) and stamps
   `contact.chat_id = sessionId`, `contact.id='437264483'`.
2. **Session R/W already redirects to `respond_contacts_test`** under `chat-stateful`:
   - `session-get-gate` condition = `['regress-capture','regress-replay','chat-stateful'].includes(message.mode)`
     → **TRUE → `pg-get-session`** (`SELECT … FROM respond_contacts_test WHERE respond_io_id=$1`);
     FALSE → `get-session-vars-http` (prod CRM GET).
   - `session-save-gate` (same condition) → **TRUE → `pg-upsert-session`**
     (`INSERT … respond_contacts_test … ON CONFLICT (respond_io_id) DO UPDATE`); **FALSE → (nothing
     connected)**. The prod PUT `save-session-vars` (httpRequest to `fe-sorento …/conversation-variables`)
     has **0 inbound** → fully orphaned → **zero prod session write in every mode.**
3. **chat_histories is already logged to `n8n_test` for BOTH plain-text AND quick_reply** inside the send
   fork `ublq9nSlrpz63xan`. The `chat?` gate (on `contact.chat_id`) TRUE branch runs
   `chat-build-parts → chat-push (redis chat:reply) → console-loggable? → log-chat-history-n8ntest`
   (Postgres `INSERT INTO chat_histories …`). `chat-build-parts` emits a `type:'quick_reply'` item when
   `quick_reply` is present; `console-loggable?` passes on `text` **OR** `quick_reply` non-empty; the
   INSERT stores the buttons in the `result` jsonb (`quick_reply:[...]`). So the
   `quickreply-not-logged` corpus gap is **already closed for the console lane** — via a direct pg
   insert, not via the `save-message-redis` LOGFIX fork.
4. The clone's own orphaned `Call 'sub-respond-save-message-redis'2` (→ `UrETd`) has **0 inbound** (dead),
   and all 6 sendmsg call-sites in the spine target the CHAT fork `ublq9nSlrpz63xan` (not live `aoydkG`).

**Consequence for the pipeline:** the coder's remaining work is *small* (verify creds; optionally add
incoming-message logging; document the live-promote delta). The bigger deliverable is this plan + UAC to
**prove** the already-built lane is correct and **zero-egress**, and to lock the promote design.

---

## 1. Reconciliation of the three locked decisions vs live reality (flag loudly)

| # | Locked decision | Live reality | Verdict |
|---|---|---|---|
| **1** | TEST persist to `n8n_test` "via **regress-capture** mode" — session→`respond_contacts_test`, chat_histories→`n8n_test.chat_histories` | Implemented via a **new `mode:'chat-stateful'`** added to the same gates (NOT by reusing `regress-capture`) + a **direct pg insert** `log-chat-history-n8ntest` (NOT the `save-message-redis` path) | **DONE, improved.** `chat-stateful` is a *better* choice than reusing `regress-capture`: it keeps the console off the golden-capture orchestrator's redis list + `golden_nodes` FK (avoids the contention/pollution traps in LESSONS 30 & 41). **Endorse.** |
| **2** | Wire the **LOGFIX fork `uoO5eiJFXA8THrry`** into the console send path so buttoned replies persist | Console send path uses fork **`ublq9nSlrpz63xan`** (a *different* fork), whose `chat?`-TRUE branch **already** persists both plain-text and quick_reply to `n8n_test.chat_histories`. `uoO5eiJFXA8THrry` is NOT wired anywhere. | **Intent MET for TEST by a different mechanism.** Decision #2's literal instruction rests on the stale premise (console bypasses logging). The LOGFIX (`save-message-redis` on the quick_reply branch) is a **LIVE-lane** concern — see decision #3. **Recommend: do NOT wire `uoO5eiJFXA8THrry` into the console; retarget decision #2 to the live promote.** User to confirm. |
| **3** | Live-promote: same points call **real CRM** for chat_histories + **prod session R/W**; explicit fail-safe mode duality | The duality exists as **two fail-safe switches** (see §3). Session switch = the `mode` field; send/log switch = the `contact.chat_id` presence. On live (mode absent, chat_id absent) both fall to the prod side. **Two gaps for a faithful live path** (see §4). | **Design present; 2 promote-time gaps to close.** |

> **LOUDEST FLAG:** the whole lane was built ahead of any plan/UAC/tester/reviewer pass. Treat the
> current clone as *unverified* until the UAC below runs green — most importantly the **credential-binding
> gate (§5 S-CRED)**, which is the single point where this design could silently write prod.

---

## 2. The console lane today (grounded topology)

```
zz-chat (chat webpage, sessionId)
  → build-item  [mode:'chat-stateful', contact.id=437264483, contact.chat_id=sessionId,
                 test_run_id=chatui-<ts>, item.message.message.message.text=<typed>]
  → clear-q / clear-lock / clear-ready  (self-heal stale test:q / test:lock / ready-contacts-test)
  → push-queue (RPUSH test:q:437264483 = item)  → push-ready (RPUSH ready-contacts-test = 437264483)
  → call-dispatch  (executeWorkflow zz-dispatcher-test 2D0cw2Y1aPW2LOlU, waitForSubWorkflow:true)
       └─ dispatcher: pop ready → INCR test:lock (fastpath) → call-spine (clone txiPzSxy3Pclsz6v, blocking)
  → read-list (LRANGE chat:reply:{sessionId}) → del-list → format-out {output}  → widget
```

Inside the **clone spine** for this item:
- `redis-pop-main-message-list` pops `test:q:437264483` → `message` (carries mode, chat_id, test_run_id).
- `sorento-sub-respond-findcontact-respond` = **pure passthrough** (`return …message.contact`) → so
  `contact.chat_id` rides untouched into every send call.
- **Session GET:** `sim-inject-gate` (no `previous_conversation_state` → false) → `session-get-gate`
  → **`pg-get-session`** (respond_contacts_test) → `get-session-vars` (NoOp) → reformulator.
- **Session SAVE:** `compile-current-state` → `session-save-gate` → **`pg-upsert-session`**
  (respond_contacts_test). (Prod PUT `save-session-vars` orphaned.)
- **Send + log:** `compile-current-state` → `sorento-sub-respond-sendmsg-respond2` (→ fork
  `ublq9nSlrpz63xan`, `is_test:true`, `contact`=passthrough incl. chat_id). In the fork, `chat?`
  (chat_id present) TRUE → `chat-push` (redis `chat:reply`) + `log-chat-history-n8ntest`
  (`n8n_test.chat_histories`). `test-guard` / real respond.io send are on the FALSE branch — **never
  reached in the console lane.**

---

## 3. Mode matrix — every persistence egress point × {TEST, LIVE}  (THIS IS THE PROMOTE DESIGN)

Two independent, **fail-safe** switches (absent signal ⇒ live behavior):
- **Session switch** = redis-item `message.mode ∈ {chat-stateful, regress-capture, regress-replay}`.
- **Send/log switch** = `contact.chat_id` present (set only by `build-item`; absent on real traffic).

| # | Persistence point | Gate / node | **TEST** (chat-stateful · chat_id present) | **LIVE** (mode absent · chat_id absent) |
|---|---|---|---|---|
| P1 | **Session GET** | `session-get-gate` | TRUE → `pg-get-session` → **`n8n_test.respond_contacts_test`** (SELECT) | FALSE → `get-session-vars-http` → **prod CRM** GET `/conversation-variables/{id}` |
| P2 | **Session SAVE** | `session-save-gate` | TRUE → `pg-upsert-session` → **`n8n_test.respond_contacts_test`** (UPSERT) | FALSE → **prod CRM** PUT `/conversation-variables/{id}` (`save-session-vars`) — **⚠ FALSE branch currently unconnected in the clone; wired in the live spine** (see §4 gap A) |
| P3 | **chat_histories — plain text** | fork `ublq9` `chat?` | TRUE → `log-chat-history-n8ntest` → **`n8n_test.chat_histories`** (INSERT, type=outgoing) | FALSE → `Send a Message` → `Call save-message-redis'1` → redis `sorento-respond-message` → CRM |
| P4 | **chat_histories — quick_reply** | fork `ublq9` `chat?` | TRUE → `chat-build-parts`(quick_reply item) → `console-loggable?` → `log-chat-history-n8ntest` → **`n8n_test.chat_histories`** (buttons in `result` jsonb) | FALSE → `HTTP Request` (respond.io quick_reply) → **⚠ NO logger** — this is the `quickreply-not-logged` bug; needs the LOGFIX port (see §4 gap B) |
| P5 | **chat_histories — incoming (user turn)** | *(none in console lane)* | **⚠ NOT logged** — only outgoing replies persist today (see §4 gap C / decision) | on live, incoming is logged by the producer/CRM pipeline, not this lane |
| — | Reply delivery | fork `ublq9` `chat?` | TRUE → redis `chat:reply:{chat_id}` (viewer) | FALSE → real respond.io / WhatsApp send |

**The promote is a mode/branch flip, not a rewrite:** on the live spine the same gates exist; `mode`
absent routes P1/P2 to prod CRM, `chat_id` absent routes P3/P4 to the redis→CRM logger. The clone
deliberately orphans the prod arms of P2 (and the console never reaches the WhatsApp arm of P3/P4), which
is exactly the fail-closed posture we want for test.

---

## 4. Remaining work (coder change-list — small)

**Gap A — LIVE session-save arm (promote-only, do NOT add to the clone).** In the clone,
`session-save-gate` FALSE is intentionally unconnected (zero prod write). The **live spine already has**
`get-session-vars`/`save-session-vars` wired to prod; the promote must ensure the live `session-save-gate`
FALSE branch reaches the real prod PUT (verify at promote — the live spine already does this pre-console;
the console change must not orphan it). *No clone edit.*

**Gap B — LIVE quick_reply logger (promote-only).** For the WhatsApp/live lane, the `chat?`-FALSE
quick_reply path (`HTTP Request`) still has **no** `save-message-redis` call → buttoned WhatsApp replies
stay unlogged (the `quickreply-not-logged` bug). At promote, port the single additive node from LOGFIX
fork `uoO5eiJFXA8THrry` (`Call 'sub-respond-save-message-redis' (quick_reply)`, fan-out off `HTTP
Request`, per `tests/diffs/quickreply-logging-fix.md`) into whichever send sub is promoted to live.
**This is the correct home for decision #2** — the console/test lane does not need it (P4 already covers
the corpus via `log-chat-history-n8ntest`). *No clone edit needed for the test harness; documented for
promote.*

**Gap C — incoming-message logging (DECISION, test-side).** Today only the **outgoing** reply lands a
`chat_histories` row; the **incoming** user turn is not logged in the console lane, so the n8n_test corpus
built from console sessions is reply-only (no paired incoming). If the goal is a faithful multi-turn
corpus (the memory says "persists conversation state **+ chat history**"), add an incoming logger:
- **Option C1 (recommended):** a Postgres INSERT into `n8n_test.chat_histories` (type=`incoming`) in the
  clone spine, gated on `chat-stateful`, sourced from `redis-pop … message.message.message.text` +
  `findcontact` contact — placed early (e.g. off `tf-message`), cred `n8n_test-db`. Mirrors P3/P4's
  direct-insert style; keeps the pairing (incoming then outgoing) in `sent_at` order.
- **Option C2:** log incoming inside `build-item`/`zz-chat` before dispatch (simpler, but puts corpus
  writes in the console workflow rather than the spine — less faithful to where prod logs).
- **Option C3 (defer):** skip incoming logging for v1; the lane still satisfies "session evolves + both
  reply types persist". Flag corpus as reply-only.
- **Blocker:** user/coder to pick C1/C2/C3. Plan **recommends C1**; UAC §22 covers both "outgoing logged"
  (mandatory) and "incoming logged" (conditional on C1/C2 being built).

**Housekeeping (optional, low priority):** the redis `chat:reply` list has **no EXPIRE** (LESSONS note);
add a TTL on `chat-push` so abandoned sessions self-clean. Not safety-relevant.

**No new nodes are required to make the TEST lane function** — P1–P4 are already wired. The mandatory
coder/tester action before anything is trusted is the **credential verification (§5 S-CRED)**.

---

## 5. Zero-egress safety — the ONE real risk + the binding gate

The console lane deliberately runs the send/log on the `chat?`-TRUE branch, which **bypasses
`test-guard`** entirely (no `is_test` check on that branch). That is fine *iff* its two egress sinks are
both non-prod: `chat-push` (redis, harmless) and `log-chat-history-n8ntest` (Postgres). The Postgres sink
is the risk.

**S-CRED (MANDATORY, blocks the whole UAC):** every Postgres persistence node must bind to
**`n8n_test-db` = `Dnnofg8Xb27VQOhI`** (host `72.62.195.19`, db `n8n_test`), **never** the prod CRM
`sorento-crm-db` = `ETJL5KoaA1UpkDip`. The three nodes:
- fork `ublq9nSlrpz63xan` › **`log-chat-history-n8ntest`** ← the #1 footgun
- clone spine › **`pg-get-session`**, **`pg-upsert-session`**

**Why this is the crux:** the target table `chat_histories` **exists in BOTH** `n8n_test` (CSV corpus)
**and the prod CRM DB**. A mis-bind of `log-chat-history-n8ntest` to `sorento-crm-db` would **silently
INSERT into prod** — no "relation does not exist" error to catch it (LESSON 10 = create/update_workflow
can auto-bind to the wrong postgres cred). Contrast `pg-get/upsert-session`: they hit
`respond_contacts_test`, which does **not** exist in prod → a mis-bind there fails loudly (lower risk, but
still verify).

**How to verify** (`get_workflow_details` STRIPS credentials — MCP cannot show the binding; you must use
the n8n REST API): `GET {N8N_API_BASE}/workflows/ublq9nSlrpz63xan` and `…/txiPzSxy3Pclsz6v` (header
`X-N8N-API-KEY`) → assert `nodes[].credentials.postgres.id == "Dnnofg8Xb27VQOhI"` on all three nodes.
Fail-closed: if the id is `ETJL5KoaA1UpkDip` or missing, **HALT** — do not run any UAC case.

**Corroborating check (defense in depth):** after a console turn, `psql` `n8n_test` shows a new
`chat_histories` row (source='chat-console'); this proves writes reach n8n_test but does **not** by itself
prove prod is untouched — the REST cred check is the authoritative gate.

### §0 mapping for this lane
- **S1 (no WhatsApp send):** on `chat?`-TRUE the fork never reaches `Send a Message`/`HTTP Request`; reply
  is redis `chat:reply` only. Assert no `api.respond.io/.../message` POST in the execution.
- **S2 (no assign/SLA/PIC):** escalation still goes through `Call 'sub-human-intervention'` = guarded fork
  `vUfFUDjLAuMaeQE6` (`is_test` short-circuit); assert the human-intervention guard recorded, no
  round-robin/assign/SLA executed.
- **S3 (no prod CRM/session write):** `save-session-vars` (prod PUT) has 0 inbound (never executes);
  session write goes to `respond_contacts_test` via `pg-upsert-session`. **S-CRED** is the S3 gate for the
  chat_histories write.
- **S4 (no MCP write tool):** get-results reads only; unchanged by this lane.
- **S5 (`test_mode`/`is_test` present):** fork receives `is_test:true`; irrelevant on the chat branch but
  must still be present (proves the item is a test item).
- **S6 (token sinks by scope):** `deterministic` scope, but the **chat-webpage driver runs the live
  reformulator once/turn** (allowed, structural assertions only). No other LLM should fire unless the turn
  legitimately hits the clarification `Basic LLM Chain` (gated on `validator.has_result=false`).

---

## 6. Verification tasks (planner-defined)

- **V-CP0 (S-CRED — run FIRST, gates everything):** REST-API-verify the 3 Postgres nodes bind
  `Dnnofg8Xb27VQOhI`. HALT on any prod/`ETJL5KoaA1UpkDip`/missing binding.
- **V-CP1 (session evolves in respond_contacts_test):** reset the console contact's session row to
  `{"variables":{}}`; run turn-1 (a query that resolves a result set); `psql` assert
  `respond_contacts_test.session_vars` now carries `variables.last_result_set` (non-empty) for
  `respond_io_id=437264483`; run turn-2 that *references* turn-1's set (e.g. a numeric pick / "the second
  one") and assert the reply resolves against the persisted set (proves the pg round-trip fed the next
  turn's reformulator — the thing `uac` mode could never do, LESSON 31).
- **V-CP2 (plain-text reply logged to n8n_test):** after a plain-text answer turn, `psql` assert a new
  `chat_histories` row (type=`outgoing`, `result.source='chat-console'`, `contact_id='437264483'`).
- **V-CP3 (quick_reply reply logged to n8n_test):** drive a turn that yields buttons (did-you-mean /
  escalate offer / picker); assert a `chat_histories` row whose `result.quick_reply` array is non-empty
  (the `quickreply-not-logged` gap is closed for the corpus).
- **V-CP4 (incoming logged — CONDITIONAL on Gap-C C1/C2):** if incoming logging is built, assert a
  type=`incoming` row paired (same conversation, earlier `sent_at`) with the outgoing row.
- **V-CP5 (zero egress, §0):** for every case, execution shows no respond.io send POST, no
  assign/SLA/PIC, no prod CRM/session write; reply only in `chat:reply`; S-CRED green.
- **V-CP6 (contention note, not a gate):** the console writes session for **437264483**, the *same* row
  used by regress-capture/replay of Jayson's corpus → never run a golden capture/replay on 437264483
  concurrently with console use (session collision, cf. LESSON 30/41). Recommend documenting; optionally
  give the console a distinct `respond_io_id` (e.g. `chat-437264483`) to fully isolate — **open decision**.

---

## 7. Open build-time confirmations (for coder/tester)

1. **S-CRED** (§5) — the blocking gate.
2. **Gap-C decision** — incoming logging C1/C2/C3 (planner recommends C1).
3. **Decision #2 retarget** — confirm the LOGFIX (`uoO5eiJFXA8THrry`) is a *promote* deliverable, not a
   console edit (planner recommendation).
4. **Session-isolation decision** (V-CP6) — reuse `437264483` vs a console-only `respond_io_id`.
5. **`respond_contacts_test` reset policy for the console** — where/when the row is reset between
   independent test conversations (must NOT reset mid-multi-turn; cf. LESSON 31). Recommend a helper
   (extend `zz-canary-seed`) or a documented psql one-liner.
6. **Promote checklist (deferred):** on live promote, confirm (a) live `session-save-gate` FALSE → prod
   PUT wired (Gap A), (b) LOGFIX ported (Gap B), (c) console repointed to the live producer, (d) live
   send sub used, (e) backups taken (LESSON 25).
</content>
</invoke>
