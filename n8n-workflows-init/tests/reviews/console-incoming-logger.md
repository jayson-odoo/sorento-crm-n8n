# Review — console-incoming-logger (Gap C / C1 + §22.4 sent_at fix)

**Change-id:** `console-incoming-logger`
**Target:** clone spine `sorento-consume-main TEST` = `txiPzSxy3Pclsz6v` (active versionId **`9eb9762e-d502-4f02-bf9d-d54a344ba699`**, REST-confirmed active+published)
**Scope:** `deterministic` (additive Postgres INSERT + IF gate; parser untouched, driver runs live reformulator 1x/turn)
**Reviewer:** sorento-reviewer · 2026-07-14
**Net change this cycle:** 2 nodes (`console-incoming-gate` IF `550df90b`, `log-incoming-chat-history-n8ntest` Postgres `2ceb90be`) + the `sent_at` ordering fix.

## Verdict: **APPROVE**

Zero-egress re-confirmed both structurally (independent REST inspection) and from the retest run-log (S1–S6 PASS on the active version). The §22.4 pairing invariant that was FAIL in run-1 is FIXED and re-verified in run-2. All acceptance criteria (§22.0–22.5) green or correctly N/A.

---

## What I verified independently (REST GET on the clone, not just tester flags)

**1. Two new nodes — correct.**
- `console-incoming-gate` (IF v2.3): condition = `mode === 'chat-stateful' && !!contact.chat_id` (strict `===`). Fires ONLY for the console lane; deliberately narrower than `session-get-gate` (excludes regress modes) so the console corpus stays clean. FALSE branch (`main[1]`) has **no connection** — a non-console item physically cannot reach the logger.
- `log-incoming-chat-history-n8ntest` (Postgres v2.6): cred = **`Dnnofg8Xb27VQOhI` (n8n_test-db)**, NOT prod `ETJL5KoaA1UpkDip`. INSERT column set identical to the reply logger, `type='incoming'`, `message_id=NULL`, `sent_at = COALESCE(to_timestamp(NULLIF($7,'')::double precision / 1000.0), NOW())`. queryReplacement is a fail-safe IIFE (`|| {}` guards, deep-path `message.message.message.text` per LESSON 12, trailing-epoch extraction `/(\d{10,})$/`).

**2. Connections — additive, existing edge byte-identical.**
`sorento-sub-respond-findcontact-respond`.main[0] = `[is-human-intervened(0), console-incoming-gate(0)]` — the pre-existing `is-human-intervened` edge is still FIRST/untouched; the new gate is appended. `console-incoming-gate`.main[0]=`[log-incoming-chat-history-n8ntest]`, main[1] absent.

**3. Zero-egress structural argument (verified, not trusted).**
- All 4 Postgres persistence nodes bind **`Dnnofg8Xb27VQOhI`**: clone `pg-get-session`, `pg-upsert-session`, `log-incoming-chat-history-n8ntest`, and send-fork `ublq9` `log-chat-history-n8ntest` (the #1 footgun — re-checked, clean). **None** bind prod `ETJL5KoaA1UpkDip`.
- Orphaned (0-inbound) egress nodes: `send-message-files/images/video`, `update-human-intervened`, prod `save-session-vars` (PUT), and `Call 'sub-respond-save-message-redis'2` — all 0 inbound, physically unreachable.
- Every egress-capable sub-call passes `is_test:true`: human-intervention → guarded fork `vUfFUDjLAuMaeQE6`; reformulator → live-guarded `XTODTw-dJcV0uRdC056hG`; all 6 sendmsg → CHAT fork `ublq9nSlrpz63xan`. `is-human-intervened` is a read IF (flag check), not a write.

**4. §22.4 sent_at fix — correct.**
Incoming is stamped from the injection-time `messageId`/`test_run_id` epoch (before pop/parse, ~5–7 s before the reply send), so `incoming.sent_at < its own outgoing.sent_at` regardless of the fact that the gate branch executes AFTER the send fork's INSERT. Retest evidence: per-turn margins 4.85/4.71/6.83 s, incoming epochs clean-ms (`to_timestamp`), outgoing micro-fractional (`NOW()`) — distinct clock sources prove the fix. `v_turns` pairs each incoming with its OWN turn's reply (no off-by-one, last incoming not NULL). Both `timestamp`-coerced through the same server-tz path so ordering holds.

**5. Run-log zero egress (retest, active version 9eb9762e).** S1 no respond.io send POST; S2 no assign/SLA/PIC; S3 prod PUT orphaned + all pg writes to n8n_test-db; S4 get-results read-only (`crm_incoming_stock_list`, never `crm_it_support_ticket_create`); S5 mode=chat-stateful + chat_id + is_test present; S6 only the driver reformulator fired 1x/turn. Regression spot-check PASS (session evolution + plaintext + quick_reply logging intact).

---

## Live-mode duality — the important check (no leak either direction)

**This cycle's change promotes NOTHING to the live spine.** The Gap-C incoming logger is a **test-corpus-fidelity feature, clone-only**. Per the plan mode-matrix row P5, on LIVE the incoming turn is logged by the producer/CRM pipeline, not this lane. So `console-incoming-gate` + `log-incoming-chat-history-n8ntest` (and the session-pg nodes and the CHAT fork) must **never** be ported to the live spine `9qVyfUxmRQqrpGRMDLRuz`.

**Can a test node fire in live?** No — double fail-safe:
1. The nodes live only on the clone (separate workflow); a correct promote ports only reviewed business-logic, and none of these are business-logic.
2. Even if accidentally copied, `console-incoming-gate` needs `mode === 'chat-stateful'` AND `contact.chat_id`, neither of which live traffic ever stamps → the gate is dead in live, no egress. The session gates (`session-get/save-gate`) likewise route to the pg arm only for `{chat-stateful,regress-capture,regress-replay}`; live traffic (mode absent) falls to the prod-CRM FALSE arm. Absent signal ⇒ live behavior — the switch is fail-safe.

**Can a live-egress node fire in the clone?** No — the clone orphans the prod arms (`save-session-vars` 0 inbound; the WhatsApp send arms sit on the `chat?`-FALSE branch never reached in the console lane).

Design duality is clean.

---

## Non-blocking observations (do not gate approval)

- **Fallback fragility (note, not a defect):** the fix depends on `messageId`/`test_run_id` carrying a trailing `\d{10,}` epoch (set by `build-item`). If a future console change drops that format, `$7=''` → `NOW()` fallback → the OLD mis-pairing returns *silently*. This is fail-safe (never crashes, never egresses; corpus-fidelity only). Recommend a guard/assert if `build-item` is ever refactored.
- **ID-map drift (doc):** the clone's get-results sub is `rysSPgUssLDf6xJc` (also used by `probe-incoming`); CLAUDE.md lists `Fss5aAaXthJSWpZCgKiKR`. Read-only, resolved `crm_incoming_stock_list` — not a defect for this change. Update CLAUDE.md.
- `get-rag`, `get-results`, and orphaned `save-message-redis'2` do not pass `is_test` — acceptable (read-only subs / dead node).

---

## PROMOTE CHECKLIST (user-gated; NOTHING here is authorized by this review)

> The Gap-C incoming logger under review is **clone-only and is NOT promoted**. This checklist is the full console-persistence lane's live-promote design for when the user chooses to ship it.

**Stays clone-only (do NOT port to live `9qVyfUxmRQqrpGRMDLRuz`):**
- `console-incoming-gate` + `log-incoming-chat-history-n8ntest` (this cycle's nodes) — test corpus only; live incoming is logged by the producer/CRM.
- `pg-get-session`, `pg-upsert-session` (n8n_test session R/W) — live uses prod CRM `conversation-variables` GET/PUT.
- The CHAT send fork `ublq9nSlrpz63xan` and its `log-chat-history-n8ntest` — test reply capture only.
- The `chat-stateful` mode value and `contact.chat_id` carrier.

**Promote-time work (per plan §3 matrix / §4 / §7.6):**
1. **Backups first (LESSON 25):** capture live spine `9qVyfUxmRQqrpGRMDLRuz` current versionId + the bodies of any node you touch, and the target send sub's versionId, before any write.
2. **Gap A — live session-save arm:** verify the live `session-save-gate` FALSE branch reaches the real prod PUT `save-session-vars` (`/conversation-variables/{id}`). The live spine already wires this pre-console; the promote must not orphan it. Mode absent ⇒ FALSE ⇒ prod PUT (fail-safe switch — keep, do not strip).
3. **Gap B — LOGFIX for live buttoned replies:** port the single additive `Call 'sub-respond-save-message-redis' (quick_reply)` node from LOGFIX fork `uoO5eiJFXA8THrry` (fan-out off the `HTTP Request` quick_reply node, per `tests/diffs/quickreply-logging-fix.md`) into whichever send sub is promoted to live — closes `quickreply-not-logged` on the WhatsApp lane. This is the correct home for the original "decision #2"; the console/test lane does NOT need it.
4. **Mode-switch guards — keep, don't strip:** the session switch (`mode ∈ {chat-stateful,regress-capture,regress-replay}`) and the send/log switch (`contact.chat_id` present) are fail-safe by absence. On live, mode+chat_id absent route to the prod arms automatically. These gates STAY (they are the duality); only the clone-only pg/chat-fork *targets* are excluded from the port.
5. **Repoint + wire:** console driver repointed to the live producer; live send sub used; confirm no test node (§ "stays clone-only") leaked into the live graph.
6. **Publish discipline (LESSON 24/25/37):** publish subs before the parent; sha-verify the changed node in the draft BEFORE publish and in the active AFTER; auto-revert on mismatch. Never edit live mid-cycle.

**Zero-egress re-confirmed. §22.4 fixed. Approved for the clone; live promotion remains user-gated.**
