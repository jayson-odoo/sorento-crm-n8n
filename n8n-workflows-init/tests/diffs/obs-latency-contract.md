# Node-diff: observability latency contract (C1–C4)

**Change-id:** `obs-latency-contract`
**Date:** 2026-07-21
**Author role:** coder
**Spec (authoritative):** `n8n-workflows-init/plans/obs-latency-contract-build.md`
**Design/recon:** `n8n-workflows-init/plans/obs-latency-contract-plan.md`
**Scope tag:** `deterministic` (no parser / no get-results change; all UAC cases mock the reformulator)
**Status:** built + published on clone/forks. **Not promoted. Nothing live was edited or published.**

---

## 0. What was built, at a glance

| # | Artifact | ID | State |
|---|---|---|---|
| B1 | `sub-respond-save-message-redis TEST` (**new**) | **`tWm5DYLxfypmVC1T`** | published, `versionId == activeVersionId == ce78408e-c6fd-4378-b2b9-cd6b7e609001` |
| B2 | `sub-sendmsg-OBS` (**new**, fresh fork of LIVE `aoydkG1dbItXR5jXFEQsP@8cf1b465`) | **`sJI3DbsLCG01JfRs`** | published, `versionId == activeVersionId == 25b1a299-9de6-4b9e-bf39-bda34bdb7035` |
| B3 | `sorento-consume-main TEST` (clone, edited) | `txiPzSxy3Pclsz6v` | published, `34aedb9f-0974-44b0-8821-a188d7a8223d` (was `5a934898`) |

**Untouched, verified after the change:**

| workflow | id | versionId / activeVersionId | updatedAt |
|---|---|---|---|
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` | `e26437e5…` / `6a0a0a5c…` — **unchanged, exactly as recon recorded** | 2026-07-20T22:04:57Z (pre-dates every write in this session) |
| live sendmsg sub | `aoydkG1dbItXR5jXFEQsP` | `8cf1b465` (draft==active) | 2026-07-14 |
| live save sub | `UrETd-jm46tFj3Xw7w8vL` | `485413d5` (draft==active) | 2026-06-27 |
| `sorento-main` | `NwMOBEQ1NW7LVky5` | untouched, **never opened for write** | 2026-07-13 |
| `sub-sendmsg-CHAT` | `ublq9nSlrpz63xan` | untouched (restore target, V-OBS-i) | 2026-07-14 |

**V-OBS-g re-run (draft-vs-active diff of the live spine), as of this build:** node-id sets identical
(101/101), and **exactly one** node's `parameters` differ — `send-transcript-confirm`
(`97e84805-aaed-4c59-8f56-15dd287af427`), schema-hint only. No new draft delta has appeared. Publishing
the spine is still safe *as of now*; **re-run this check immediately before promote** (LESSONS §24).

---

## 1. B1 — `sub-respond-save-message-redis TEST` (`tWm5DYLxfypmVC1T`) — THE SINK

Purpose (spec §A6): the clone's incoming-save node must actually *execute* so C1's blob is rendered
end-to-end, but must not write to the prod ingest list. Fork the sub; change the list.

**Method:** `create_workflow_from_code` (UI Duplicate is unreachable via MCP; this workflow is 2 nodes,
so hand-porting is lossless — LESSONS §3's "don't hand-port" warning is about 75+ node graphs).

### Nodes (2) — byte-equivalent to live except where marked

| node | type | before (live `UrETd-…`) | after (B1) |
|---|---|---|---|
| `When Executed by Another Workflow` | `executeWorkflowTrigger` v1.1 | inputs: `contact_id, phone_number, message, sent_at, data` | **+ `turn_id` (type `any`)** inserted before `data` — spec B1 |
| `Redis` | `n8n-nodes-base.redis` v1 | `operation:push`, **`list:"sorento-respond-message"`**, `messageData:={{ $json.data }}` | `operation:push`, **`list:"sorento-respond-message-TEST"`**, `messageData` unchanged |

- `list` is a **literal string**, not an expression — no `=` prefix, nothing to fail-render (spec §A6
  rationale: an expression that fails could resolve to an empty/other list name; a literal cannot).
- Credential: `sorento-redis` (`H5w6o7tptzTPMVdy`), auto-assigned on create — same redis instance as
  live, which is required (the sink must live where the tester can `LLEN` it).
- **No consumer reads `sorento-respond-message-TEST`.** `redis-consume-queue-mongo`
  (`Srs08P0Ha3Cv--YPx0-Yn`) is hardcoded to pop `sorento-respond-message` only. Blast radius of any
  mistake here is a growing list nobody reads.

---

## 2. B2 — `sub-sendmsg-OBS` (`sJI3DbsLCG01JfRs`) — C2 + C3

**Fork source: the CURRENT LIVE `aoydkG1dbItXR5jXFEQsP` @ `8cf1b465`** — *not* `sub-sendmsg-CHAT`
(`ublq9nSlrpz63xan`, stale: forked 2026-07-13, predates the 2026-07-14 quick_reply-logger promotion and
has no `Call 'sub-respond-save-message-redis' (quick_reply)` node at all), and *not* the LOGFIX fork
(already merged into live). "Rebase on live then fix."

**Fidelity check:** 17 nodes, same node names, same 17 connections (incl. the `ai_memory` edge
`Postgres Chat Memory1 → Chat Memory Manager`) as live's `activeVersion`. The presence of
`Call 'sub-respond-save-message-redis' (quick_reply)` is itself the proof the rebase was done against
current live and not against CHAT (spec §OBS-6 asks the tester to assert exactly this).

### C2 — new workflow input (business logic, PROMOTES)

`When Executed by Another Workflow` › `workflowInputs.values`: appended **`{ name: "turn_id" }`** after
`is_test`. Purely additive; existing callers that omit it pass `undefined`.

> ⚠️ **Reviewer/tester watch-point.** The spec dictates `{name:"turn_id"}` with **no `type`**, which n8n
> defaults to `string`. I followed the spec literally rather than silently using `type:"any"`. The risk
> this creates is precisely what **§OBS-7** exists to catch: if n8n coerces a *declared-but-unpassed*
> string input to `""` rather than `undefined`, then `?? null` (below) yields `""`, not `null`, and the
> CRM cannot distinguish a proactive send from a turn-bound one. §OBS-7 must assert JSON `null`
> specifically. If it comes back `""`, the fix is `type:"any"` on this input — change it before promote.

### C3 — both save-call data blobs (business logic, PROMOTES)

Applied identically to both save calls. Only the `messageId` source node differs.

| node | `messageId` source |
|---|---|
| `Call 'sub-respond-save-message-redis'1` (text branch, off `Send a Message`) | `$('Send a Message').item.json.messageId` |
| `Call 'sub-respond-save-message-redis' (quick_reply)` (off `HTTP Request`) | `$('HTTP Request').item.json.messageId` |

**`sent_at` — changed.**

```js
// before
"sent_at": new Date().getTime(),
// after
"sent_at": $('<SRC>').item.json.messageId
             ? Math.floor($('<SRC>').item.json.messageId / 1000)
             : new Date().getTime(),
```

The `new Date().getTime()` fallback is deliberate and load-bearing: a `NaN`/`null` `sent_at` would break
transcript ordering for **every** user, which is strictly worse than the imprecision being fixed. Degrade
to today's behaviour, never to garbage. (V-OBS-d asserts this across §OBS-1/2/3/5/6.)

**`turn_id` — added**, immediately after the existing `message_id` line:

```js
"turn_id": $('When Executed by Another Workflow').first().json.turn_id ?? null,
```

`?? null` and **not** a backtick template: `` `${undefined}` `` stringifies to `"undefined"`, which would
land in the CRM as a non-null non-id and silently pollute the SLA denominator. This is the exact reason
§OBS-7 is a hard gate.

**Unchanged in both blobs:** `contact_id`, `phone_number`, `message`, `first_name`, `last_name`, `type`,
`message_id` (keeps its existing backtick form — already shipping live), `result`, and `quick_reply` on
the quick_reply blob. The top-level decorative inputs (`contact_id`/`phone_number`/`message`/`sent_at`)
are untouched — only `data` is forwarded by the sub (spec §0.1).

### Build-only changes to B2 — **STRIP BEFORE PROMOTE**

| # | change | why | promote action |
|---|---|---|---|
| G1 | both save calls repointed `UrETd-jm46tFj3Xw7w8vL` → **`tWm5DYLxfypmVC1T`** | §OBS-5/6 run with `is_test:false`, so the save calls really execute; they must not hit the prod ingest list | **revert to `UrETd-jm46tFj3Xw7w8vL`** |
| G2 | `test-guard-record` records `turn_id` — added line: `"turn_id": {{ JSON.stringify($('When Executed by Another Workflow').first().json.turn_id ?? null) }},` between `payload` and `test_run_id` | makes C4's threading assertable from the egress log on a clone run (§OBS-4) | **remove the line** |
| G3 | `Postgres Chat Memory1` bound to **`n8n_test-db` (`Dnnofg8Xb27VQOhI`)**, not the live postgres cred | *not in the spec — my addition.* `Chat Memory Manager` sits on `Loop Over Items`[0] and on `HTTP Request`'s fan-out, so under an `is_test:false` sub-level run (§OBS-5/6) it executes and inserts chat memory. Unbound from prod, that write lands in the isolated test DB. LESSONS §10 prod-write footgun. | **restore the live postgres cred** (read it from live; MCP redacts credentials on GET, so it must be re-bound by hand or simply never touched — the promote diff is param-only onto live, so this node is never written) |
| G4 | 4 legacy **disabled** nodes (`Wait`, `Find a Message`, `Switch1`, `Send Template`) carried over **without credentials** | they are disabled dead code in live too; leaving them uncredentialed means they cannot egress even if someone enables them | n/a — not part of the promote diff |

### ⚠️ LOUD FLAG — `Send a Message` carries the real respond.io credential

I deliberately omitted credentials from `Send a Message` when creating the node. **n8n-MCP auto-assigned
`sorento-api` (`OiS59QkzpKfKSdaa`) anyway** (this is the documented wrong-cred auto-bind behaviour, and
MCP offers no way to unset a credential). Consequence:

> **An unpinned `is_test:false` run of `sub-sendmsg-OBS` is a real WhatsApp send.**

This is exactly the hazard the spec's §C1 anticipated and made **S8** the control for. S8 has been added
verbatim to `tests/UAC.md` §0 with this flag attached. `HTTP Request` was **skipped** by auto-assign and
has **no** credential, so the quick_reply POST would fail auth rather than send — the two branches are
not equally protected, and the tester must not generalise from one to the other.

---

## 3. B3 — clone `txiPzSxy3Pclsz6v` — C1 + C4

All 22 operations applied in **one atomic `update_workflow` call** (LESSONS §33), then published.

### C1 — `Call 'sub-respond-save-message-redis'2` (business logic, PROMOTES)

**`data` blob — 1 line changed, 2 lines added.**

```js
// changed
"sent_at": $('tf-message').first().json.message.messageId
             ? Math.floor($('tf-message').first().json.message.messageId / 1000)
             : new Date().getTime(),      // was: new Date().getTime()
// added, after "type": "incoming"
"message_id": `${$('tf-message').first().json.message.messageId}`,
"turn_id": `${$execution.id}`
```

- `turn_id` **is** templated here, unlike B2's `?? null`. On the spine `$execution.id` always exists, so
  the `undefined`-stringification hazard does not apply. Spine and sub agree in **value** (both produce
  the spine execution id as a string), not in syntax — that agreement is V-OBS-c, the acceptance
  criterion for the whole change.
- `message_id` uses the backtick form, matching the outgoing blobs. On a missing `messageId` it renders
  the literal string `"undefined"` — accepted current behaviour, asserted explicitly by §OBS-2 so a
  future change to it is caught rather than absorbed.
- **Voice-safe** (spec §A4): `tf-message` is resolved by node name, and `patch-transcript` deep-clones
  the queue item and mutates only `E.text/type/attachment` — `messageId` is a sibling one level above
  and is carried through verbatim.
- **Unchanged:** `contact_id`, `phone_number`, `message` (incl. its `isExecuted` ternary),
  `first_name`, `last_name`, `reply_to_message_id`, `reply_to_message`, `type`. V-OBS-e should find
  exactly `+message_id +turn_id` and nothing else.

**Other edits to this node:**
- `workflowInputs.value.turn_id` = `={{ $execution.id }}` — first-class sub input as well as in-blob
  (spec B3; harmless, matches C2's shape).
- `workflowInputs.schema` — `turn_id` descriptor inserted before `data`, so the node's UI matches B1's
  input list. Cosmetic.
- `position` `[-2160, 6000]` → `[-2160, 5820]` — repositioned to sit with its new upstream siblings off
  `if-message-is-audio` rather than floating where an orphan had been parked (repo tidiness rule).

**C1 wiring + targeting — BUILD-ONLY, STRIP BEFORE PROMOTE:**

| # | change | promote action |
|---|---|---|
| G5 | `workflowId` `UrETd-jm46tFj3Xw7w8vL` → **`tWm5DYLxfypmVC1T`** | **revert to `UrETd-jm46tFj3Xw7w8vL`** |
| G6 | **new connection** `if-message-is-audio`[**1**] → `Call 'sub-respond-save-message-redis'2` | **none — do NOT add this to live.** This edge **already exists** on the live spine; only the clone had it removed. Adding it to live would duplicate the connection. |

`if-message-is-audio`[1] now fans out to three nodes: `guard-h-record`, `sim-inject-gate` (both
pre-existing) and the save node. Output 0 (TRUE) remains empty, as on live.

### C4 — 8 sendmsg callers

Every one of the 8 got **two** edits:

| # | caller node | pre-existing inputs | + turn_id | target before → after |
|---|---|---|---|---|
| 1 | `sorento-sub-respond-sendmsg-respond` | contact, contact_identifer, input_message, is_test, message, test_run_id | ✅ | `ublq9nSlrpz63xan` → `sJI3DbsLCG01JfRs` |
| 2 | `sorento-sub-respond-sendmsg-respond2` (quick_reply path) | + quick_reply, result_set | ✅ | ″ |
| 3 | `sorento-sub-respond-sendmsg-respond3` | contact, contact_identifer, is_test, message, test_run_id | ✅ | ″ |
| 4 | `sorento-sub-respond-sendmsg-respond4` | + result_set | ✅ | ″ |
| 5 | `sorento-sub-respond-sendmsg-respond5` | contact, contact_identifer, input_message, is_test, message, test_run_id | ✅ | ″ |
| 6 | `sorento-sub-respond-sendmsg-respond-transcribed-message` | contact, contact_identifer, is_test, message, test_run_id | ✅ | ″ |
| 7 | `send-transcript-confirm` | contact, contact_identifer, input_message, is_test, message, test_run_id | ✅ | ″ |
| 8 | `send-voice-not-allowed` | contact, contact_identifer, input_message, is_test, message, test_run_id | ✅ | ″ |

- `turn_id` value on all 8: **`={{ $execution.id }}`** (V-OBS-f — verified by re-reading the clone JSON
  after publish; all 8 present, none missing, none differing).
- **Caller #9 (`sorento-main` › `Call 'sorento-sub-respond-sendmsg-respond'`) was NOT edited.**
  `sorento-main` (`NwMOBEQ1NW7LVky5`) was never opened for write and was not published; its
  `in-failover?` draft divergence therefore stays harmless (spec §A2/§A5).
- **The repoint to `sJI3DbsLCG01JfRs` is BUILD-ONLY (G7).** Original target `ublq9nSlrpz63xan`
  (`sub-sendmsg-CHAT`) must be restored on the clone after sign-off (**V-OBS-i**) or the chat console
  breaks. Recorded here and in CLAUDE.md.
- `workflowInputs.schema` was **not** amended on these 8 (only `value` was). This is deliberate and
  safe: `send-transcript-confirm` and `send-voice-not-allowed` already pass 6 inputs with a completely
  **empty** schema array today, which is direct evidence that `schema` is UI metadata and `value` is
  what's transmitted. Noted so the reviewer doesn't read it as an omission.

---

## 4. Egress containment after the change — read this before signing off

`tests/UAC.md` §0 S3 has been amended, plus **S7** and **S8** added. `plans/plan.md` §F4 and `CLAUDE.md`
amended to match (V-OBS-h).

### The spec's count was off by one — corrected

`obs-latency-contract-build.md` §D says the state becomes "**4** orphaned + 1 sinked". The true state is
**5 orphaned + 1 sinked**. The spec folded the save node into a 5-node total, but CLAUDE.md listed 5
*other* egress nodes ("`send-message-files/images/video`, `update-human-intervened`, the prod
`save-session-vars` PUT") **plus** the save node = 6. Verified empirically against the clone's own
`DISCONNECTED_NODE` validation output after the change:

- **orphaned (0 inbound):** `send-message-files`, `send-message-images`, `send-message-video`,
  `update-human-intervened`, `save-session-vars` — **5**, unchanged.
- **sinked:** `Call 'sub-respond-save-message-redis'2` — **1**, new.

The docs say 5+1. If the reviewer is checking V-OBS-h against the spec's "4+1" wording, **the docs are
right and the spec is wrong**; please confirm the intent rather than "fixing" the docs back.

### V-OBS-b — sink is real and isolated (verified statically)

- B1's `Redis.list` == `"sorento-respond-message-TEST"`, literal, no `=` prefix. ✅
- Clone JSON: **zero** occurrences of `UrETd-jm46tFj3Xw7w8vL`. ✅
- Clone JSON: **zero** occurrences of the literal `"sorento-respond-message"` as a parameter. The only
  two textual matches are inside a pre-existing guard node's descriptive label
  (`"target": "redis:sorento-respond-message->mongo"` in a `would_log` egress record) — a string
  describing the prod path, not addressing it. ✅

### Also orphaned on the clone — affects §OBS-4 coverage

`sorento-sub-respond-sendmsg-respond3` (caller #3) has **0 inbound connections on the clone** and can
never fire there. The spec's §OBS-4 coverage requirement (callers #1, #2, #7) is unaffected, but caller
#3 is **static-check-only** and no seed will exercise it. Flagged so it isn't chased.

---

## 5. Validation

`update_workflow` on the clone returned 22/22 applied and surfaced only the **pre-existing** warning set
(LESSONS §13 — do NOT "fix" these; they are in live too): `HARDCODED_CREDENTIALS` ×10 on the CRM HTTP
nodes, `MISSING_EXPRESSION_PREFIX` on `Transcribe a recording`, `INVALID_PARAMETER` on
`OpenAI Chat Model.builtInTools`, and `DISCONNECTED_NODE` on the deliberately-orphaned egress nodes.

**Signal in that output:** `Call 'sub-respond-save-message-redis'2` **no longer appears** in the
`DISCONNECTED_NODE` list — the un-orphaning landed.

`sub-sendmsg-OBS` returned two expected warnings: `SUBNODE_NOT_CONNECTED` on `Chat Memory Manager` (an
SDK-shape complaint; the `ai_memory` edge *is* present and matches live byte-for-byte) and
`DISCONNECTED_NODE` on the disabled legacy `Wait` — both true of live as well.

All three workflows have `versionId == activeVersionId` (published; no stale-draft landmine —
LESSONS §24/§37: a parent only ever sees a sub's *published* version).

---

## 6. Promote checklist (user-gated, after reviewer APPROVE — NOT done here)

Sub before spine (LESSONS §37). Back up prior versionIds first; sha-verify the draft pre-publish and the
active post-publish; auto-revert on mismatch (LESSONS §25).

1. **Live sub `aoydkG1dbItXR5jXFEQsP`:** apply C2 (`turn_id` input) + C3 (both blobs). Strip **G1**
   (save calls point at `UrETd-…`), **G2** (`test-guard-record` turn_id line removed). G3/G4 are
   fork-local and never written to live. Publish.
2. **Live spine `9qVyfUxmRQqrpGRMDLRuz`:** apply C1 blob + C4 on the 8 callers. Strip **G5** (save node
   targets `UrETd-…`) and **do not** apply G6 — the `if-message-is-audio`[1] edge already exists on
   live. Re-run **V-OBS-g** immediately before publishing; halt if anything beyond
   `send-transcript-confirm.schema` has appeared in the draft.
3. **Do not touch `sorento-main`.**
4. **V-OBS-i:** repoint the clone's 8 sendmsg callers back to `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`),
   or leave the chat console knowingly broken with the user's agreement.
5. Open question carried from §OBS-7: if `turn_id` serialises as `""` rather than `null` for a
   proactive send, set `type:"any"` on the C2 input **before** promoting.

---

## 7. Not done / deviations

- **`LLEN sorento-respond-message` not measured.** The redis instance is inside the n8n network and is
  not reachable from this host (`.env` carries list/key names only, no redis host or password), and the
  only way to read it via MCP is to *execute* a workflow — which is the tester's job, not mine. The
  invariant is nevertheless satisfied **by construction: I ran zero executions of any workflow.** The
  tester must take the S7 before/after snapshot.
- **G3 (`Postgres Chat Memory1` → `n8n_test-db`) is my addition, not in the spec.** Rationale in §2. If
  the reviewer prefers strict spec fidelity, the alternative is disabling `Chat Memory Manager` in the
  fork; I chose the credential swap because it keeps the graph shape identical to live.
- **Credentials could not be omitted from `Send a Message`** (MCP auto-bind). See the loud flag in §2.
- **No UAC executions run**, per role contract. All verification above is structural.
- Docs corrected as a side-effect of recon: CLAUDE.md's clone-wiring table (reformulator fork is
  `wI5RkNGW3EOJfBdo`, not `XTODTw-dJcV0uRdC056hG`), and LESSONS §23 (`get_workflow_details` **does**
  return `activeVersion` node bodies — draft-vs-active is fully diffable via MCP; a jq one-liner is now
  in the lesson).
- **Still open, out of scope, needs a user decision** (spec §G3): the **live, active** spine's
  `Call 'sub-get-results'` and `probe-incoming` target `rysSPgUssLDf6xJc` = **`sub-get-results TEST`**,
  while `sibling-probe` targets live `Fss5aAaXthJSWpZCgKiKR`. Re-confirmed on the clone during this
  build. Production traffic is running through a workflow named "TEST". Not touched here.
