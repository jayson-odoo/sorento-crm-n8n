# User Acceptance Criteria — `sorento-consume-main` test harness

Target: `sorento-consume-main copy 2` (`txiPzSxy3Pclsz6v`), driven via `execute_workflow` →
`get_execution(includeData:true)`. All cases run with `test_mode: true`. See `../plans/plan.md` for the
kill-switch, payload schema, and `scope:` routing.

Notation: **Trigger** = (input message, contact_id, scope, mock?). **Expect-branch** = the path the
run must take. **Expect-output** = structural assertions on the response that *would* have been sent.
Every case is bound by the **§0 shared safety checklist** — that is the acceptance gate; a failure
there is a hard fail regardless of functional correctness.

---

## §0. MANDATORY safety checklist (applies to EVERY case)

A case PASSES only if all of these hold, asserted from `get_execution(includeData:true)` + the Redis
`test:egress:{test_run_id}` list:

- **S1 — Zero real WhatsApp/comment sends.** No execution data shows a respond.io send/comment with a
  2xx response. Every sendmsg path is represented in the egress log as
  `{guard:"sendmsg-sub"|"send-message-files"|"send-message-images"|"send-message-video", blocked:true}`.
  The shared send sub `aoydkG1dbItXR5jXFEQsP` short-circuited (no `api.respond.io/.../message` POST executed).
- **S2 — Zero assignment / escalation writes.** Inside `rrYXzE61gCNUck_zmXe-G`: `Assign or unassign a
  Conversation1`, `conversation-sla-tracking-create` (POST sla), `Call 'sub-add-comment-respond'`/`'1`,
  and the `Redis` push to `sorento-respond-assignee-queue` did **not** execute. If the escalation
  branch was taken, the human-intervention sub recorded `{guard:"human-intervention-sub", blocked:true}`
  and returned before `get-round-robin-assignee`.
- **S3 — Zero CRM/contact writes.** `save-session-vars` (PUT conversation-variables) and
  `update-human-intervened` (respond.io UPDATE_CONTACT) did not execute their real call; each is in the
  egress log as `would_write, blocked:true`.
- **S4 — get-results writes never fired.** No MCP write tool ran; the resolved `tool` passed to
  `Call 'sub-get-results'` is in the read allowlist and is **never** `crm_it_support_ticket_create`
  (see plan §6b). MCP Client1 invoked a read tool only.
- **S5 — `test_mode` provably present.** `When Executed by Another Workflow.json.test_mode === true`,
  and any invoked sub-workflow received `is_test/test_mode === true` in its inputs.
- **S6 — Token sinks bounded by scope** (plan §6c/§8): `deterministic` → no LLM node executed;
  `parser` → only consume-main `gpt-4.1-mini`; `get-results` → only the get-results LLM (if its agent
  path is live).

> If S1–S5 cannot be affirmatively verified for a case, treat as **FAIL and halt the run** — do not
> proceed to later cases (a real egress means the kill-switch is leaking).

---

## §1. Happy path — full-access business query  (contact `437264483`)
- **Trigger:** "Show me incoming stock for product SR-1234." · contact `437264483` (FULL access) ·
  `scope: deterministic` · `mock_parser_output` = business_query / domain `incoming` / entity product SR-1234.
- **Expect-branch:** `central-exchange` → `resolve-entity` (CRM read, 2xx) → access OK
  (`get-access-types`/`check-access` pass, `If5` access-granted side) → `disallowed-entity-gate`
  passes (`incoming` allows `product`) → `Execute 'sub-get-rag'` → `tool-filter` → `Loop Over Items` →
  `Call 'sub-get-results'` (real, read-only) → `output-structurer` → `compile-current-state` →
  `sorento-sub-respond-sendmsg-respond2` (**guarded**) → `save-session-vars` (**guarded**).
- **Expect-output (structural):** egress `sendmsg-sub` record present with a non-empty `message`
  string; if results exist, `compile-current-state.variables.last_result_set` is a non-empty array of
  `{idx,label,…}`; envelope from `output-structurer` has `items[]`/`has_result` shape. Do **not** assert
  exact text (real CRM + possible LLM).
- **Safety:** §0 all. Specifically S3 — `save-session-vars` blocked (it is the only happy-path write).
- **TBD contact needed?** No.

## §2. No-access  (contact `457216562`)
- **Trigger:** same business query as §1 · contact `457216562` (NO access) · `scope: deterministic` ·
  matching `mock_parser_output`.
- **Expect-branch:** `resolve-entity` read → access check fails (`check-access`/`If5` no-access side)
  → access-denied/escalation message path (`Edit Fields*` → `compile-current-state`) → guarded send.
  Must **not** reach `Call 'sub-get-results'`.
- **Expect-output:** the would-send message is an access-denied / "I can't share that" style string
  (assert it is non-empty and that no result set was produced: `last_result_set` empty / absent).
- **Safety:** §0 all. S4 trivially (get-results not reached). S2 — no escalation write.
- **TBD contact needed?** No.

## §3. Escalation / request-for-help  (contact `437264483`)
- **Trigger:** "I need to speak to a human about my order." · contact `437264483` ·
  `scope: deterministic` · `mock_parser_output` with `message_type:"request_for_help"`,
  `domain_hint != "portal_link"` (or `escalation.is_escalation_confirmation:true`).
- **Expect-branch:** `If2` TRUE (escalation gate; condition =
  `escalation.is_escalation_confirmation==true` OR
  `message_type=="request_for_help" && domain_hint!="portal_link"`) → `Call 'sub-human-intervention'`
  (`rrYXzE61gCNUck_zmXe-G`) called with `is_test/test_mode=true` → sub **short-circuits at the top**.
- **Expect-output:** egress log shows `{guard:"human-intervention-sub", blocked:true, would_write:{contact_id,agent,team,current_assignee}}`.
  The user-facing "routing you to a person" message is recorded as a blocked sendmsg, not sent.
- **Safety:** §0 all, with **S2 the focus**: assert NONE of `Assign or unassign a Conversation1`,
  `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, or the assignee-queue
  `Redis` push executed. This is the highest-risk branch (real assignment → staff notification ripple).
- **TBD contact needed?** No.

## §4. Not-supported-domain  (contact `437264483`)
- **Trigger:** an out-of-scope request, e.g. "What's the weather in KL?" · contact `437264483` ·
  `scope: deterministic` · `mock_parser_output` whose `domain_hint` is unsupported / `not_supported`.
- **Expect-branch:** `not-supported-domain` IF TRUE → canned not-supported message
  (`Edit Fields*`/`access-level-choice-message` path) → `compile-current-state` → guarded send.
  Must not reach resolve/get-rag/get-results.
- **Expect-output:** would-send message is the not-supported canned reply (non-empty); no result set.
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §5. Entity-not-found / clarification  (contact `437264483`)
- **Trigger:** "Tell me about product ZZ-0000" (nonexistent code) · contact `437264483` ·
  `scope: deterministic` · `mock_parser_output` with a product entity that won't resolve.
- **Expect-branch:** `resolve-entity` read returns no match → `not-found-error-message` /
  `disallowed-entity-gate` clarification path (`require_specific` / `compile-current-state`'s
  `manualResponse` branch) → guarded send. May ask the user to clarify rather than escalate.
- **Expect-output:** would-send message is a not-found / clarification prompt; assert
  `compile-current-state` took the `not-found-error-message`/clarification branch (structural), no
  `last_result_set`.
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §6. Ask-for-access / partial-access  (contact = **TBD**)
- **Trigger:** business query requiring an access level the contact only partially holds · contact
  **TBD partial-access** · `scope: deterministic` · matching `mock_parser_output`.
- **Expect-branch:** `get-access-types`/`Aggregate`/`check-access` yield a partial/intersection result
  → `access-level-choice-message` path producing a `quick_reply` choice → guarded send. Must not reach
  get-results for the disallowed scope.
- **Expect-output:** `compile-current-state.quick_reply` is a non-empty array (the access-level
  choice); would-send message asks the user to pick/confirm access. Structural only.
- **Safety:** §0 all.
- **TBD contact needed?** **YES — blocked until the partial-access dev contact exists (plan §7.1).**

## §7. Audio / transcription path  (contact `437264483`)
- **Trigger:** a voice message (synthesized popped item with
  `message.message.attachment` of an audio type) · contact `437264483` · `scope: deterministic` (or
  `parser` if asserting transcription content).
- **Expect-branch:** `if-message-is-audio` TRUE → `Transcribe a recording`
  (`@n8n/n8n-nodes-langchain.openAi`, Whisper — **note: a real transcription API call/cost unless
  stubbed**; flag to coder) → `transcribed-message` → normal pipeline →
  `sorento-sub-respond-sendmsg-respond-transcribed-message` (**guarded**).
- **Expect-output:** the transcribed text feeds `construct-user-prompt`/`tf-message`; would-send
  reply recorded as blocked. Assert the transcribe node ran and a non-empty transcript propagated.
- **Safety:** §0 all. Plus: confirm the transcription call is the only extra external call and is a
  read (no contact send). If transcription cost is unwanted, coder stubs it under `test_mode` with a
  payload-supplied transcript.
- **TBD contact needed?** No.

## §8. Attachment / media-send path  (contact `437264483`)
- **Trigger:** a query that resolves to downloadable resources (product images / files), e.g.
  "send me the catalogue images for SR-1234" · contact `437264483` · `scope: deterministic`.
- **Expect-branch:** results include attachments → `get-presigned-url` (CRM **read**, left live) →
  `send-message-files` / `send-message-images` / `send-message-video` (**guarded e/f/g**).
- **Expect-output:** egress log has one of `send-message-files|images|video` with `blocked:true` and a
  `would_send.body` containing the (real, presigned) media URL(s). Assert the presigned URL is
  well-formed; assert NO real POST to `api.respond.io/.../message` executed.
- **Safety:** §0 all; S1 focus on the three media egress nodes.
- **TBD contact needed?** No.

---

# Change: `fix-gate-render-notfound-msg` (gate render + not-found message)

Plan: `../plans/fix-gate-render-notfound-msg.md`. Two fixes — Fix A (`disallowed-entity-gate` final
require_specific clobber) + Fix B (`not-found-error-message` product_attachment phrasing). **Scope:
`deterministic`** for all cases below; contact `437264483` (FULL access); parser/reformulator bypassed
via `mock_parser_output` (pinned from Step 0 capture, plan §4); `resolve-entity` + get-results run as
real READS (allowed). Every case is still bound by **§0**.

> Redis seed item shape (per plan §3). Push to `main-message-list-test`, then `execute_workflow`,
> then `get_execution(includeData:true)` + read `test:egress:{test_run_id}`:
> ```jsonc
> {
>   "message": { "text": "<user text>", "message": { "message": { "text": "<user text>" } } },
>   "contact": { /* fixture tests/fixtures/contacts/437264483.json: id, phone, assignee.id, customFields */ },
>   "messageId": "test-<test_run_id>", "replyTo": null,
>   "test_run_id": "<id>", "scope": "deterministic",
>   "mock_parser_output": { /* the Step-0 captured reformulator output for this message */ }
> }
> ```
> The captured reformulator output must be injected at the reformulator bypass so
> `$('Call 'sub-query-reformulator'').first().json.output` returns it (clone's `parser-bypass-gate`).

## §9. Two distinct exact codes + missing attachment  (contact `437264483`) — Fix A + Fix B
- **Trigger:** M1 from Step 0 (e.g. "SPAN cert for srtwt03C or SRTUFV101") · `437264483` ·
  `scope: deterministic` · `mock_parser_output` = `tests/fixtures/parser/span-cert-two-codes.json`
  (`domain_hint:"product_attachment"`, two `product` entities raw `SRTWT03C`/`SRTUFV101`, an
  `attachment_type` entity raw `SPAN cert`; plus the descriptor token).
- **Expect-branch:** `resolve-entity` (real read) → `disallowed-entity-gate`: `require_specific === false`,
  `gate_passed === true`, `compatible_entities` = exactly the two exact products
  (SRTWT03C + SRTUFV101 uuids), NO descriptor/union codes. → `If3` FALSE → `Execute 'sub-get-rag'` →
  `tool-filter` → `Loop Over Items` → get-results (real read) → attachment genuinely missing →
  `Aggregate1` → `not-found-error-message` (`require_specific === false`) → Fix-B `else if
  product_attachment` branch → `tag-not-found` → guarded send.
- **Expect-output (structural):**
  - `disallowed-entity-gate.gate_clarification` is empty (no "please choose" / no "search needs to be
    more specific"); `compatible_entities.length === 2`.
  - `not-found-error-message.escalate_message`: does NOT contain substring `product_attachment`;
    contains `product SRTWT03C` and/or `product SRTUFV101` and the attachment-type raw (`SPAN cert`);
    ends with `Would you like me to escalate to ` + a team + ` team?`.
  - The would-send message (egress `sendmsg-sub` record) equals that `escalate_message`.
- **Safety:** §0 all (S1 send blocked; S2 no escalation write — not the escalation branch; S3
  save-session-vars blocked; S4 get-results tool in READ allowlist, never `crm_it_support_ticket_create`;
  S5; S6 deterministic → 0 LLM tokens).
- **TBD contact needed?** No.

## §10. Single exact + variant siblings — no false prompt  (contact `437264483`) — Fix A
- **Trigger:** a product_attachment (or incoming) query for a code with prefix-variant siblings, e.g.
  "image for SRTUB5202" · `437264483` · `scope: deterministic` · `mock_parser_output` with one `product`
  entity raw `SRTUB5202` (resolver returns SRTUB5202 exact + SRTUB5202-* prefix variants).
- **Expect-branch:** gate → `require_specific === false`, exact `SRTUB5202` passes as the sole
  `compatible_entity`; no "please choose". Then normal get-rag/get-results (real read).
- **Expect-output:** `disallowed-entity-gate.require_specific === false`, `gate_clarification` empty,
  `compatible_entities` = [SRTUB5202]; no output string contains "search needs to be more specific".
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §11. Exact-tier discriminator — ambiguity preserved vs exact passthrough  (contact `437264483`) — Fix A regression guard
This case pins the exact-tier discriminator with a matched PAIR: a zero-exact token (must still prompt)
and an exact token (must NOT prompt). Both resolver facts confirmed against the live resolver.

### §11a — genuine ambiguity (token `WC286`, ZERO exact) → SHORT list RETURNED
- **Trigger:** a product_attachment query for `WC286` · `437264483` · `scope: deterministic` ·
  `mock_parser_output` = `tests/fixtures/parser/wc286-ambiguous.json` (one `product` entity raw
  `WC286`; `domain_hint:"product_attachment"`).
- **Resolver fact (pinned):** token `WC286` → 10 matches, ALL `match_tier="substring"`, ZERO exact,
  `ambiguous=true`: `SRTWC286-SH`, `SRTWC286-SH-PP`, `SRTWC286-SH-NEW-150`, `SRTWC286-SH-150`,
  `SRTWC286-SH-NEW-P`, `SRTWC286-SH-NEW-200`, `SRTWC286-SH-NEW`, `SRTWC286-SH-UF`, `SRTWC286-SH-200`,
  `SRTWC286-SH-P`.
- **Expect-branch:** gate → no `exact_entity` for the token → `require_specific === true`,
  `gate_passed === false` → `If3` TRUE → `not-found-error-message` (`require_specific === true` → uses
  `gate.gate_clarification`) → guarded send.
- **Expect-output:** `disallowed-entity-gate.gate_clarification` IS returned (NOT suppressed) and is a
  SHORT "...search needs to be more specific. Multiple matches found — please choose:" list. ASSERT:
  every listed code starts with `SRTWC286` (the token-filter keeps them because each code contains
  `wc286`); the list contains ONLY `WC286`-* variants and NONE of the cross-token union noise (none of
  `AMS-FFAS9859-001500BT0`, `CB114`, `CB111`, `SHU8001`, `SRT0001`); `compatible_entities` are exactly
  those WC286 candidates' uuids; `not-found-error-message.escalate_message === gate.gate_clarification`.
  This proves Fix A did NOT kill legitimate disambiguation.

### §11b — exact token (`SRTUFV101` alone) → direct passthrough, NO prompt
- **Trigger:** a product_attachment query for `SRTUFV101` alone · `437264483` · `scope: deterministic` ·
  `mock_parser_output` with one `product` entity raw `SRTUFV101`.
- **Resolver fact (pinned):** token `SRTUFV101` → `[SRTUFV101 (exact), SRTUFV101-WEPLS (prefix)]` →
  exact-tier short-circuit.
- **Expect-branch:** gate → `require_specific === false`, exact `SRTUFV101` passes as the sole
  `compatible_entity` → `If3` FALSE → get-rag / get-results (real read).
- **Expect-output:** `disallowed-entity-gate.require_specific === false`, `gate_clarification` empty,
  `compatible_entities` = [SRTUFV101]; NO output string contains "please choose" / "search needs to be
  more specific". The `-WEPLS` prefix sibling does NOT trigger a prompt.

The §11a/§11b contrast pins the discriminator: zero-exact ⇒ prompt (preserved); ≥1 exact ⇒ passthrough.
- **Safety:** §0 all (both sub-cases).
- **TBD contact needed?** No.

## §12. Not-found message structure — no literal leak  (contact `437264483`) — Fix B
- **Trigger:** M2 from Step 0 (e.g. "srtufv101 SPAN cert") · `437264483` · `scope: deterministic` ·
  `mock_parser_output` = `tests/fixtures/parser/span-cert-srtufv101.json` (`domain_hint:
  "product_attachment"`, `product` raw `SRTUFV101`, `attachment_type` raw `SPAN cert`).
- **Expect-branch:** gate passes the single exact `SRTUFV101` (`require_specific === false`) → get-results
  (real read) → attachment missing → `not-found-error-message` Fix-B branch → guarded send. (If the
  reformulator's tokens instead drive `If3` TRUE via `unresolved_tokens`, the same Fix-B `else if`
  branch still fires with `require_specific === false`.)
- **Expect-output:** `not-found-error-message.escalate_message` does NOT contain `product_attachment`;
  matches the natural shape "Could not find a SPAN cert for product SRTUFV101. Would you like me to
  escalate to {team} team?" (assert: contains `SPAN cert`, contains `product SRTUFV101`, contains
  `Would you like me to escalate to`, absent `product_attachment`). Compare against the Step-0 BEFORE
  capture (which DID contain `product_attachment`) to prove the fix changed it.
- **Safety:** §0 all.
- **TBD contact needed?** No.

---

## Coverage / blockers summary

| # | Branch                         | Contact      | Scope         | Blocked by |
|---|--------------------------------|--------------|---------------|------------|
| 1 | happy path                     | 437264483    | deterministic | —          |
| 2 | no-access                      | 457216562    | deterministic | —          |
| 3 | escalation / request-for-help  | 437264483    | deterministic | —          |
| 4 | not-supported-domain           | 437264483    | deterministic | —          |
| 5 | entity-not-found / clarify     | 437264483    | deterministic | —          |
| 6 | ask-for-access / partial       | **TBD**      | deterministic | partial-access contact (plan §7.1) |
| 7 | audio / transcription          | 437264483    | deterministic/parser | transcription stub decision (coder) |
| 8 | attachment / media-send        | 437264483    | deterministic | —          |
| 9 | two exact codes + missing attachment (Fix A+B) | 437264483 | deterministic | Step-0 reformulator capture |
| 10| exact + variant siblings, no false prompt (Fix A) | 437264483 | deterministic | — |
| 11| exact-tier discriminator: WC286 ambiguity preserved / SRTUFV101 passthrough (Fix A guard) | 437264483 | deterministic | — |
| 12| not-found message, no literal leak (Fix B) | 437264483 | deterministic | Step-0 reformulator capture |

Cases 9–12 belong to change `fix-gate-render-notfound-msg` (plan `../plans/fix-gate-render-notfound-msg.md`).
Allowed-to-change golden nodes: `disallowed-entity-gate`, `not-found-error-message` + their downstream
cascade on corrected-branch turns ONLY; all unrelated turns must be byte-identical (plan §5.2).

Re-run any deterministic case as `scope: parser` (drop `mock_parser_output`) to validate the live
`gpt-4.1-mini` parser against the same branch, asserting parser output **structurally** (schema +
key fields), never exact text.

---

# Change: `vague-token-clarify-split` (confident-flag-driven not-found clarify)

Plan: `../plans/vague-token-clarify-split.md`. Change 1 (reformulator `XTODTw-dJcV0uRdC056hG`: per-entity
`confident` bool) + Change 2 (clone `not-found-error-message`: vague-token clarify branch). **Change-level
scope: `parser`** (the `confident` signal originates in the reformulator and §13a-parser/§13b/§13f require
the real reformulator). Per-case sub-tier noted below — Change-2 branch-logic cases run `deterministic`
via injected `mock_parser_output` with pinned `confident` flags (0 parser tokens). Contact `437264483`
(FULL access) unless noted. Every case is bound by **§0**.

> The decisive coupling (verified in `escalate-catalog`): `is_escalate_offer = !nf.is_clarification`. So
> the acceptance test for the vague path is: `not-found-error-message.is_clarification === true` ⟹
> `escalate-catalog.is_escalate_offer === false`. No `escalate-catalog`/`If3`/`tag-not-found` edit exists.
>
> Redis seed item shape (per `fix-gate-render-notfound-msg` §3); for `parser` cases OMIT
> `mock_parser_output` so `parser-bypass-gate` is FALSE and the real reformulator runs.

## §13. Vague-token clarify split

### §13a — vague mash → clarify, no escalate offer  (contact `437264483`)
- **Trigger:** `"One siew srtkt72ss already delivered?"` · `437264483`.
  - **§13a-parser** (`scope: parser`): real reformulator runs. **Assert (Change 1):** entities has exactly
    ONE entity, `hint:"order"`, `confident:false` (the qty+name+code mash). Pin this output to
    `tests/fixtures/parser/vague-mash-one-siew.json`.
  - **§13a-det** (`scope: deterministic`): `mock_parser_output = tests/fixtures/parser/vague-mash-one-siew.json`.
- **Expect-branch:** `resolve-entity` (real read) → `unresolved_tokens` contains `"One siew srtkt72ss"`
  → `If3` TRUE → `not-found-error-message`: the new vague-clarify check fires (unresolved token maps by
  `raw` to the `confident:false` entity) → `is_clarification = true` → `tag-not-found` →
  `escalate-catalog` (`not_found` → `is_escalate_offer = !is_clarification = false`) → guarded send.
- **Expect-output (structural):**
  - `not-found-error-message.is_clarification === true`; `not-found-error-message.require_specific`
    falsy → `escalate-catalog.manualResponse === true`.
  - `escalate-catalog.is_escalate_offer === false`.
  - `escalate_message` echoes the captured raw (`One siew srtkt72ss`), states it couldn't tell which part
    is which, and asks for a labeled specific drawn from `ALLOWED.order`
    (`order, customer_order, transporter, customer, or product` — i.e. contains the order/customer/product
    label set). It does **NOT** contain the substring `escalate to` / `Would you like me to escalate`.
  - The would-send egress `sendmsg-sub` record equals that `escalate_message`, `blocked:true`.
- **Safety:** §0 all. S2 — NOT the escalation branch (`If2` not taken), no assignment/SLA/comment write.
- **TBD contact needed?** No.

### §13b — labeled split → both confident → resolves  (contact `437264483`)  — `scope: parser`
- **Trigger:** `"customer one siew, product srtkt72ss"` (turn-2 labeled form) · `437264483` · real
  reformulator.
- **Expect-branch (Change 1):** reformulator SPLITS into ≥2 entities — a `{hint:"customer",confident:true}`
  and a `{hint:"product",confident:true}`. `resolve-entity` resolves an ORDER via `match_mode:"and"`
  (customer ∧ product) → `unresolved_tokens` empty → `If3` FALSE → `Execute 'sub-get-rag'` → get-results
  (real read). NO clarify, NO escalate-offer. Pin reformulator output to
  `tests/fixtures/parser/labeled-split-one-siew.json`.
- **Expect-output (structural):** entities array length ≥2, BOTH `confident:true`, hints `{customer,
  product}`; `resolve-entity.unresolved_tokens` empty (or the order resolved). No node output sets
  `is_clarification=true` for a vague token; no `escalate-catalog.is_escalate_offer` on this turn.
- **Verify-during-build dependency:** V-C1 (resolver ANDs customer+product into an order). If the resolver
  cannot AND-resolve, downgrade the assertion to: entities split + both confident + `If3` direction is the
  get-rag side (not the vague-clarify side). Flag, do not silently pass.
- **Safety:** §0 all. S4 — get-results tool in READ allowlist, never `crm_it_support_ticket_create`.
- **TBD contact needed?** No.

### §13c — clear-but-unresolved single code → escalate offer UNCHANGED  (contact `437264483`)
- **Trigger:** `"status of order SMC202606-9999"` (a clear, well-formed DO that does not exist) ·
  `437264483` · `scope: deterministic` · `mock_parser_output` = one `{hint:"order", raw:"SMC202606-9999",
  confident:true}` entity, `domain_hint:"order"`.
- **Expect-branch:** `resolve-entity` (real read) → `unresolved_tokens` contains `SMC202606-9999` →
  `If3` TRUE → `not-found-error-message`: vague-clarify check does NOT fire (the unresolved token maps to
  a `confident:true` entity) → existing escalate `else` branch → `is_clarification=false` →
  `escalate-catalog.is_escalate_offer = true`.
- **Expect-output:** `is_clarification === false`; `is_escalate_offer === true`; `escalate_message` is the
  unchanged "Could not find order for … Would you like me to escalate to customer_service team?" shape
  (contains `Would you like me to escalate to`). This pins that the change does NOT regress the
  clear-but-missing escalate offer.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §13d — clear-but-no-data → escalate offer, NEVER hits vague-clarify  (contact `437264483`)
- **Trigger:** `"incoming for SRTKT72SS"` (a REAL product code that resolves but yields 0 incoming rows) ·
  `437264483` · `scope: deterministic` · `mock_parser_output` = one `{hint:"product", raw:"SRTKT72SS",
  confident:true}` entity, `domain_hint:"incoming"`.
- **Expect-branch:** `resolve-entity` resolves `SRTKT72SS` → `unresolved_tokens` empty → `If3` FALSE →
  `Execute 'sub-get-rag'` → get-results (real read) → 0 rows → `Aggregate1` re-entry into
  `not-found-error-message`. On this re-entry `unresolved` is empty → vague-clarify check does NOT fire →
  existing escalate branch → `is_escalate_offer = true`.
- **Expect-output:** `not-found-error-message.is_clarification === false`;
  `escalate-catalog.is_escalate_offer === true`; the path went through get-rag/get-results (assert
  get-results node ran), NOT the `If3`-TRUE direct not-found. This proves a data-miss never masquerades as
  a vague-token clarify.
- **Safety:** §0 all. S4 — read tool only.
- **TBD contact needed?** No.

### §13e — multi-word-clear unresolved → escalate, NOT clarify  (contact `437264483`)
- **Trigger:** `"do you have water closet"` (multi-word but ONE clean category referent) · `437264483` ·
  `scope: deterministic` · `mock_parser_output` = one `{hint:"category", raw:"water closet",
  confident:true}` entity (domain e.g. `inventory`/`master_products`) — chosen so resolve-entity leaves it
  unresolved (or set `domain`/code so `If3` TRUE).
- **Expect-branch:** unresolved token `water closet` maps to a `confident:true` entity → vague-clarify
  check does NOT fire → existing escalate offer.
- **Expect-output:** `is_clarification === false`, `is_escalate_offer === true`. **Discriminator:** a
  2-word phrase does NOT trigger clarify — proving vagueness is semantic (`confident`), not word-count.
  Assert the `escalate_message` is the escalate-offer shape, not the "couldn't tell which part is which"
  clarify shape.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §13f — loop: repeated vague stays clarify; request_for_help escalates  (contact `437264483`)
- **Trigger (multi-turn, `scope: parser` for the vague turns):**
  - T1: `"One siew srtkt72ss already delivered?"` → clarify (as §13a).
  - T2: another vague mash, e.g. `"two pintu cks tu macam mana"` → clarify AGAIN (still
    `is_clarification=true`, `is_escalate_offer=false`). Assert NO new state accreted between T1/T2 (the
    only control is the current-turn `confident` flag; no session variable added) and the reformulator did
    NOT read T2 as an escalation confirmation (`If2` NOT taken — proves the dead next-turn-escalation
    worry).
  - T3: `"please get a human to help"` (`request_for_help`) → `If2` TRUE →
    `Call 'sub-human-intervention'` (`rrYXzE61gCNUck_zmXe-G`, `is_test=true`) → sub short-circuits.
- **Expect-output:** T1/T2 each → `is_escalate_offer=false`, NO `escalate to` substring. T3 → egress log
  `{guard:"human-intervention-sub", blocked:true}`.
- **Safety:** §0 all. **S2 is the focus on T3** (highest risk): assert NONE of `Assign or unassign a
  Conversation1`, `conversation-sla-tracking-create`, `Call 'sub-add-comment-respond'`/`'1`, or the
  assignee-queue `Redis` push executed.
- **TBD contact needed?** No.

### Coverage (this change)
| #    | Branch / assertion                                  | Contact   | Sub-scope     | Blocked by |
|------|-----------------------------------------------------|-----------|---------------|------------|
| 13a-parser | reformulator emits `confident:false` (Change 1) | 437264483 | parser        | — |
| 13a-det    | vague → clarify, no escalate offer (Change 2)   | 437264483 | deterministic | 13a-parser fixture |
| 13b  | labeled split → both confident → resolves           | 437264483 | parser        | V-C1 resolver AND |
| 13c  | clear-but-unresolved → escalate UNCHANGED           | 437264483 | deterministic | — |
| 13d  | clear-but-no-data → escalate, never clarify         | 437264483 | deterministic | — |
| 13e  | multi-word-clear → escalate, not clarify            | 437264483 | deterministic | — |
| 13f  | loop: repeated vague clarify; RFH escalates         | 437264483 | parser        | — |

Cases 13a–13f belong to change `vague-token-clarify-split` (plan `../plans/vague-token-clarify-split.md`).
Allowed-to-change golden nodes (plan §7.2): the reformulator parse output (additive `confident` key on
entities) and clone `not-found-error-message` + its downstream cascade ONLY on turns where the vague-clarify
check flips `is_clarification`; every other turn byte-identical except the additive `confident:true` key.

---

# Change: `cert-brand-routing-fix` (deriveRouting isCert widened for brand-named certs)

Plan: `../plans/cert-brand-routing-fix.md`. Single-spot fix in reformulator `XTODTw-dJcV0uRdC056hG`
`output_exchange` → `deriveRouting`: widen the cert-vs-photo discriminator so a certificate named by its
issuing body/brand (SPAN, SIRIM, BOMBA, MS####, Halal) routes to `purchasing_certification` instead of
`marketing_product`. **Change-level scope: `parser`.** The assertion target is the reformulator's own
output `output.output.routing.suggested_team`; the fix lives inside the reformulator, so a `deterministic`
`mock_parser_output` injection at the clone's `parser-bypass-gate` **bypasses the reformulator and CANNOT
exercise `deriveRouting`** — these cases MUST run with the real (rebased) reformulator copy. Build/test
target: a fresh reformulator copy rebased on CURRENT live `XTODTw` + the fix, re-pointed from clone
`txiPzSxy3Pclsz6v` (plan §5). Contact `437264483` (FULL access) for all. Every case bound by **§0**.

> Decisive coupling (plan §0): `deriveRouting` discards the LLM's emitted `routing` and re-derives it
> mechanically (output_exchange lines 386–393), so the ONLY thing that matters is the post-fix
> `deriveRouting` output. Assert on `output_exchange.output.output.routing.suggested_team` from the
> reformulator sub-execution (`get_execution(includeData:true)` on the reformulator copy). Cheapest gate is
> the offline `deriveRouting` unit (plan §6 V-R0); the §14 cases are the end-to-end parser confirmation.
>
> Redis seed shape per `fix-gate-render-notfound-msg` §3; for these `parser` cases OMIT `mock_parser_output`
> so `parser-bypass-gate` is FALSE and the real (rebased) reformulator runs.

## §14. Cert-brand routing

### §14a — `SPAN cert` brand-named certificate → purchasing_certification  (the bug case) — `scope: parser`
- **Trigger:** `"may i have SPAN cert for urinal flush valve srtwt03C or SRTUFV101"` · `437264483` · real
  reformulator copy. (Exact reproduction of live exec `7019613`.)
- **Expect-branch:** reformulator parses `domain_hint:"product_attachment"`,
  `intent_hint:"check_product_attachment"`, an `attachment_type` entity `{raw:"SPAN"}`, and a `user_goal`
  containing `"certificate"`. `deriveRouting` `isCert` fires via BOTH the widened brand regex (`span`) AND
  the semantic fallback → `product_attachment` cert branch.
- **Expect-output (structural):** `output_exchange.output.output.routing.suggested_team ===
  "purchasing_certification"` and `…suggested_agent === "general_enquiries"`. (Pre-fix this was
  `marketing_product` — the regression boundary.) Do NOT assert exact `user_goal` text.
- **Safety:** §0 all. S2 — `suggested_team` must NOT drive a real assignment: the human-intervention sub
  short-circuits (`is_test=true`); no `Assign or unassign a Conversation1`, SLA, or PIC-comment write.
- **TBD contact needed?** No.

### §14b — `SIRIM cert` / `BOMBA cert` (brand word + "cert") → purchasing_certification — `scope: parser`
- **Trigger (run both):** `"SIRIM cert for SRTUFV101"` and `"BOMBA cert for SRTUFV101"` · `437264483` ·
  real reformulator copy.
- **Expect-branch:** `domain_hint:"product_attachment"`, attachment_type entity raw `SIRIM`/`BOMBA` (or
  `"certificate"`), `user_goal` contains `"cert"/"certificate"`. `isCert` fires via brand regex and/or the
  semantic fallback.
- **Expect-output:** `routing.suggested_team === "purchasing_certification"` for each.
- **Safety:** §0 all. S2 focus as §14a.
- **TBD contact needed?** No.

### §14c — bare brand, NO "cert" word → purchasing_certification via brand regex (#1) — `scope: parser`
- **Trigger:** `"SPAN for SRTUFV101"` (no "cert"/"certificate" word) · `437264483` · real reformulator copy.
- **Expect-branch:** route depends ENTIRELY on parser shape (plan §4): the brand-regex fallback (#1) helps
  ONLY IF the parser sets `domain_hint:"product_attachment"` AND emits an `attachment_type` entity
  `{raw:"SPAN"}`. The semantic fallback (#2) cannot help — no cert word in `user_goal`.
- **Expect-output:**
  - IF parser yields `domain_hint:"product_attachment"` + attachment_type `{raw:"SPAN"}` →
    `routing.suggested_team === "purchasing_certification"` (proves trigger #1, brand-regex path).
  - ELSE (parser routes it to `master_products`/null or omits the attachment_type entity) → record the
    observed `domain_hint` + entities, mark **inconclusive-by-parser**, and FLAG (do not pass/fail on a
    wrong premise; the fix is correctly inert for that shape — see plan §4). Does NOT block acceptance,
    which rests on §14a/§14b.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §14d — plain `certificate` / `Ikram cert` → purchasing_certification (UNCHANGED) — `scope: parser`
- **Trigger (run both):** `"certificate for SRTUFV101"` and `"Ikram cert for SRTUFV101"` · `437264483` ·
  real reformulator copy.
- **Expect-branch:** attachment_type entity raw normalizes to `"certificate"`/`ikram`; the ORIGINAL
  `/cert|ikram/` already matched these — proves the widened regex is a strict superset (no regression on
  forms that already worked).
- **Expect-output:** `routing.suggested_team === "purchasing_certification"` for each.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §14e — `photo` / `technical drawing` → marketing_product (UNCHANGED; over-fire guard) — `scope: parser`
- **Trigger (run both):** `"photo for SRTUFV101"` and `"technical drawing for SRTUFV101"` · `437264483` ·
  real reformulator copy.
- **Expect-branch:** `domain_hint:"product_attachment"`, attachment_type raw `photo`/`technical drawing`,
  `user_goal` has NO `cert`/`certificate` word → `isCert=false` (neither trigger fires) → photo branch.
- **Expect-output:** `routing.suggested_team === "marketing_product"` for each. **This is the critical
  guard against `isCert` over-firing** — a genuine photo/drawing request must NOT be pulled to
  `purchasing_certification`.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §14f — non-attachment domain → routing UNCHANGED (no regression) — `scope: parser`
- **Trigger (run both):** `"incoming for SRTKT72SS"` (domain `incoming`) and a promotion query e.g.
  `"any promotion for sorento"` (domain `promotion`) · `437264483` · real reformulator copy.
- **Expect-branch:** `domain_hint` ≠ `product_attachment`, so `deriveRouting` never reads `isCert` →
  routing comes from the domain map only. Proves the fix is inert outside `product_attachment`.
- **Expect-output:** `incoming` → `routing.suggested_team === "purchasing"`,
  `suggested_agent === "incoming_stock_enquiries"`; promotion → `routing.suggested_team` starts with
  `"marketing_promotion_"`. (Assert byte-identical to a pre-fix run of the same message.)
- **Safety:** §0 all.
- **TBD contact needed?** No.

### Coverage (this change)
| #   | Branch / assertion                                          | Contact   | Sub-scope | Blocked by |
|-----|-------------------------------------------------------------|-----------|-----------|------------|
| 14a | SPAN cert → purchasing_certification (the bug, exec 7019613)| 437264483 | parser    | rebased reformulator copy |
| 14b | SIRIM/BOMBA cert → purchasing_certification                 | 437264483 | parser    | rebased reformulator copy |
| 14c | bare brand, no "cert" → purchasing_certification (regex #1) | 437264483 | parser    | parser shape (plan §4) |
| 14d | plain certificate / Ikram cert → purchasing_certification (UNCHANGED) | 437264483 | parser | — |
| 14e | photo / technical drawing → marketing_product (UNCHANGED, over-fire guard) | 437264483 | parser | — |
| 14f | non-attachment domain → routing UNCHANGED                   | 437264483 | parser    | — |

Primary correctness gate is the offline `deriveRouting` unit (plan §6 V-R0); §14a–§14f are the end-to-end
parser confirmation on the rebased copy. Acceptance rests on §14a/§14b/§14d/§14e/§14f; §14c may be
`inconclusive-by-parser` (flagged) without blocking. Plus a **sampled-regression pass** (plan §6 V-R5) over
real attachment/photo/cert traffic: assert the ONLY routing deltas are
`marketing_product → purchasing_certification` on genuine cert turns, zero drift on photo/drawing and
non-attachment turns.

---

# Change: `order-member-pick-name-resolve` (resolve a CS-member pick by NAME — LLM extracts, code resolves)

Plan: `../plans/order-member-pick-name-resolve.md`. Two deltas in reformulator `XTODTw-dJcV0uRdC056hG`:
**Δ-prompt** (`AI Agent.systemMessage`: a `== PERSON-NAME MENTION ==` section + a new `person_mention`
key in the OUTPUT block — the LLM ALWAYS extracts the surface name, never maps to a position, never gates on
context) + **Δ-code** (`output_exchange` Δ3: a new resolution arm — when `selection_context==='member_offer'`
AND `reference_positions` empty AND `person_mention` non-null, normalize + tier-match (exact → token-overlap →
substring) against `last_result_set[].label`; 1 match → resolve, >1 → `member_reprompt:'multi'`, 0 →
`member_reprompt:'out_of_range'`; arm sits inside the existing `!_isNewQuery` gate). **Change-level scope:
`parser`** — `person_mention` is LLM-emitted, so per LESSON 28 a `mock_reformulator_output` injection bypasses
both deltas; §15 cases MUST run the **real, rebased reformulator copy** (plan §6). The numeric/ordinal pick
path is UNCHANGED. Contact `437264483` (FULL access) for all. Every case bound by **§0**.

> **Two assertion layers (plan §6):**
> - **LLM layer** — assert `output.output.person_mention` is the extracted surface string (name turns) or
>   `null` (non-name turns). Real reformulator only.
> - **Code layer** — assert `output_exchange.output.output.escalation` after the resolution arm. Single-match
>   shape is `{ is_escalation_confirmation:true, preferred_assignee_id:<last_result_set[idx].uuid> }` with
>   `entities:[]`. Offline-unit-testable (plan §8 V0) + confirmed in the parser e2e run.
> Assert on the reformulator sub-execution (`get_execution(includeData:true)` → `output_exchange` output). Do
> NOT assert exact `user_goal`/free text.

> **Member_offer state seed (mechanism — plan §6a, LESSON 31).** A pick turn needs
> `previous_conversation_state.{selection_context:"member_offer", last_result_set:[…], domain_hint:"order"}`.
> Injecting it in the redis item does NOT work — the reformulator reads it from `get-session-vars`. **Pre-seed
> `respond_contacts_test` (cred `Dnnofg8Xb27VQOhI`) for `437264483`** and run each case as a single turn in
> **`mode=regress-capture`**, re-seeding between independent cases. The CODE matcher uses `latest_user_message`
> + `last_result_set` only (NOT `response`), so `response` is not load-bearing — seed a realistic one anyway.
> Synthetic uuids are safe (human-intervention sub guarded; no real assign). Two seed lists (validated offline
> against the §4 matcher):
> - **L-distinct** = `[{idx:1,label:"Ms Tan",uuid:"u-tan",respond_user_id:"1097739"},
>   {idx:2,label:"Mr Lee",uuid:"u-lee",respond_user_id:"1097740"},
>   {idx:3,label:"Ms Wong",uuid:"u-wong",respond_user_id:"1097741"}]` (distinct single surnames; "tan"→[1], "wong"→[3]).
> - **L-ambig** = `[{idx:1,label:"Ms Tan Mei",uuid:"u-tan1"},{idx:2,label:"Mr Lee",uuid:"u-lee"},
>   {idx:3,label:"Mr Tan Wei",uuid:"u-tan3"}]` (two compound "Tan"s; "tan" misses exact tier → token tier
>   collects [1,3] → multi).
>
> Capture both into `tests/fixtures/contacts/member-offer-distinct.json` /
> `tests/fixtures/contacts/member-offer-ambig.json`. For these `parser` cases OMIT `mock_reformulator_output`.

## §15. CS member pick by name

### §15a — exact name "Ms Tan"  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"Ms Tan"` · `437264483` · real reformulator · session pre-seeded L-distinct.
- **LLM-layer:** `person_mention === "Ms Tan"` (surface).
- **Code-layer:** normalize → "tan", exact-tier matches idx1 → resolve.
- **Expect-output:** `escalation.is_escalation_confirmation === true`;
  `escalation.preferred_assignee_id === "u-tan"`; `escalation.member_reprompt` ABSENT; `entities === []`.
- **Safety:** §0 all. **S2 focus** — `preferred_assignee_id` set but the human-intervention sub short-circuits
  (`is_test=true`): NONE of `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`,
  `Call 'sub-add-comment-respond'`/`'1`, assignee-queue `Redis` push ran.
- **TBD contact needed?** No.

### §15b — honorific variant "miss tan"  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"miss tan"` (lower-case, "Miss" vs listed "Ms") · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "miss tan"` (surface, NOT normalized by the LLM).
- **Code-layer:** strip honorific "miss" + lowercase → "tan" → exact-tier idx1.
- **Expect-output:** `preferred_assignee_id === "u-tan"`, `is_escalation_confirmation:true`, `entities:[]`.
  Proves honorific/case normalization lives in CODE.
- **Safety:** §0 all (S2 as §15a).
- **TBD contact needed?** No.

### §15c — partial / surname only "tan"  (contact `437264483`) — seed L-distinct — `scope: parser` — **classification-sensitive**
- **Trigger:** `"tan"` (bare surname, unique in L-distinct) · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "tan"`.
- **Code-layer:** "tan" exact-matches only "Ms Tan"(→"tan") → idx1 IF the resolution arm is reached.
- **Observed (golden_run 11, 2026-07-01):** the real parser classifies a bare plausible-customer surname as a
  `current_message` customer entity + `domain_hint:"order"` → `_isNewQuery=true` → Δ3 member-arm **skipped** →
  routes to a new order query (no resolve). This routing is **run/seed-sensitive** (the same token resolved via
  the member arm in §15f). **Accepted safe-direction behavior** (user-confirmed 2026-06-30): bare surname that
  doubles as a customer name fails safe — never wrong-assigns.
- **Expect-output:** EITHER `preferred_assignee_id === "u-tan"` (arm reached) OR no resolve + new-query parse
  (`domain_hint:"order"`, `_isNewQuery=true`) — **both PASS**. A resolve to ANY uuid ≠ "u-tan" IS a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15d — typo "Mss Tann"  (contact `437264483`) — seed L-distinct — `scope: parser` — **best-effort**
- **Trigger:** `"Mss Tann"` (misspelled — "Mss" not a recognized honorific, "Tann" extra letter) · `437264483`.
- **LLM-layer:** `person_mention === "Mss Tann"` (surface).
- **Code-layer (deterministic best-effort, plan §5):** "mss" not stripped → "mss tann"; exact/token miss;
  substring tier: `_q.includes("tan")` (since "tann" contains "tan") → idx1. **Insertion-style typos resolve;
  transposition/deletion typos (e.g. "Tna") do NOT — code matching is not fuzzy.**
- **Expect-output:** PASS if `preferred_assignee_id === "u-tan"`. A **safe miss** (0 match →
  `member_reprompt:'out_of_range'`, no resolve) is **NOT a failure** — record `tolerated-miss`. A *wrong*
  resolve (any uuid ≠ "u-tan") IS a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15e — given/surname only "Wong"  (contact `437264483`) — seed L-distinct — `scope: parser` — **classification-sensitive**
- **Trigger:** `"Wong"` (references idx3 "Ms Wong") · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "Wong"`.
- **Code-layer:** "wong" exact-matches "Ms Wong"(→"wong") → idx3 IF the resolution arm is reached.
- **Observed (golden_run 11, 2026-07-01):** same as §15c — bare plausible-customer surname classified as a new
  order query (`domain_hint:"order"`, `_isNewQuery=true`) → member-arm skipped → no resolve. **Accepted
  safe-direction behavior**; never wrong-assigns.
- **Expect-output:** EITHER `preferred_assignee_id === "u-wong"` OR no resolve + new-query parse — **both PASS**.
  A resolve to ANY uuid ≠ "u-wong" IS a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15f — two-similar-names ambiguity "Tan"  (contact `437264483`) — seed **L-ambig** — `scope: parser`
- **Trigger:** `"Tan"` against L-ambig (idx1 "Ms Tan Mei" AND idx3 "Mr Tan Wei") · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "Tan"`.
- **Code-layer:** "tan" misses the exact tier (labels normalize to "tan mei"/"tan wei"); token tier: "tan" ∈
  both → matches [1,3] → `member_reprompt:'multi'`. **Never auto-picks** (ambiguity gate, plan §4.2).
- **Expect-output:** `escalation.member_reprompt === 'multi'`; `escalation.is_escalation_confirmation ===
  false`; `escalation.preferred_assignee_id` ABSENT; `correction === true`. **HARD invariant:** no single
  `preferred_assignee_id` is ever set for an ambiguous name.
- **Safety:** §0 all. **S2 is the focus** — a wrong CS assign here is the highest-risk failure.
- **TBD contact needed?** No.

### §15g — no-match name "Bob"  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"Bob"` (matches nobody listed) · `437264483` · real reformulator.
- **LLM-layer:** `person_mention === "Bob"` OR `null` — both acceptable (observed `null` in golden_run 11; the
  LLM does not always surface a non-listed name as a person mention).
- **Code-layer:** "bob" misses all three tiers → 0 match → `member_reprompt:'out_of_range'` (reprompt the
  list; plan §4 recommendation — reuses existing render, no clone change), OR a new-query/not-found re-offer.
- **Expect-output:** NO `preferred_assignee_id`; NO `is_escalation_confirmation:true`. Accept any of:
  `member_reprompt:'out_of_range'` reprompt, a clean abandon, or a not-found CS member re-offer (all observed/
  acceptable). A resolve to ANY member is a hard fail.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15h — REGRESSION: plain numeric "2" still resolves  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"2"` · `437264483` · real reformulator.
- **Code-layer:** numeric `_extract` mines `2` → numeric single-pick arm (person_mention arm not reached).
- **Expect-output:** `preferred_assignee_id === "u-lee"` (idx2), `is_escalation_confirmation:true`. Proves the
  numeric path is unbroken by the new deltas. (`person_mention` is `null` for a bare number.)
- **Safety:** §0 all (S2 as §15a).
- **TBD contact needed?** No.

### §15i — REGRESSION: "yes" affirmative → round-robin  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"yes"` · `437264483` · real reformulator.
- **Expect-output:** `escalation.is_escalation_confirmation === true` with NO `preferred_assignee_id`
  (round-robin); `person_mention === null`. Proves affirmative confirmation is unchanged.
- **Safety:** §0 all. S2 — human-intervention sub still short-circuits (no real round-robin assign).
- **TBD contact needed?** No.

### §15j — REGRESSION: unrelated new query (no person) abandons  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"any incoming for CKS315"` (fresh business query, no person named — the Bug-2 case) · `437264483`.
- **Expect-branch:** `person_mention === null` (CKS315 is not a person); LLM parses `domain_hint:"incoming"`,
  entity `CKS315`(`current_message:true`) → `_isNewQuery=true` → Δ3 block skipped → normal new-query parse.
- **Expect-output:** NO `escalation.preferred_assignee_id`; NO `member_reprompt`; `domain_hint === "incoming"`,
  the `CKS315` entity present; `person_mention === null`. Routes to get-results, not re-offer.
- **Safety:** §0 all.
- **TBD contact needed?** No.

### §15k — REGRESSION (NEW): person-naming new query in member_offer → abandons, NOT auto-resolve  (contact `437264483`) — seed L-distinct — `scope: parser`
- **Trigger:** `"any orders for Tan"` (a NEW business query that names a listed member, while member_offer is
  open) · `437264483` · real reformulator. **This pins the §5 residual-risk protection.**
- **Expect-branch:** LLM emits `person_mention === "Tan"` (a person IS named) AND parses a business query
  (`domain_hint:"order"` + a `current_message` entity) → `_isNewQuery === true` → Δ3 block SKIPPED →
  `person_mention` IGNORED → offer abandoned, normal order parse. **The `_isNewQuery` gate (plan §4.1), not the
  LLM, prevents the wrong resolve.**
- **Expect-output:** NO `escalation.preferred_assignee_id` (must NOT resolve to "u-tan"); NO `member_reprompt`;
  `domain_hint === "order"`. **A resolve to any member here is a HARD FAIL** (it would be a wrong CS assign in
  prod). If the LLM fails to set `domain_hint`/entity so `_isNewQuery` is false and the arm resolves, FLAG
  loudly (the §5 lowest-residual edge) — do not silently pass.
- **Safety:** §0 all. **S2 focus** — even on a mis-resolve, the human-intervention sub short-circuits in test;
  assert NO assign/SLA/comment/queue write fired.
- **TBD contact needed?** No.

### Coverage (this change)
| #    | Branch / assertion                                       | Contact   | Seed       | Sub-scope | Note |
|------|----------------------------------------------------------|-----------|------------|-----------|------|
| 15a  | exact name → resolve                                     | 437264483 | L-distinct | parser    | — |
| 15b  | honorific variant → resolve (code normalizes)            | 437264483 | L-distinct | parser    | — |
| 15c  | unique partial/surname → resolve OR safe new-query abandon | 437264483 | L-distinct | parser  | classification-sensitive; both pass, wrong-resolve = hard fail |
| 15d  | typo → resolve                                           | 437264483 | L-distinct | parser    | best-effort (insertion resolves; transposition safe-misses) |
| 15e  | given/surname only → resolve OR safe new-query abandon   | 437264483 | L-distinct | parser    | classification-sensitive; both pass, wrong-resolve = hard fail |
| 15f  | two-"Tan" ambiguity → `multi` reprompt, no auto-pick     | 437264483 | **L-ambig** | parser   | HARD: never single-pick |
| 15g  | no-match name → reprompt / abandon / re-offer, no resolve | 437264483 | L-distinct | parser   | person_mention null-or-"Bob"; wrong-resolve = hard fail |
| 15h  | regression: numeric "2" still resolves                   | 437264483 | L-distinct | parser    | person_mention null |
| 15i  | regression: "yes" → round-robin                          | 437264483 | L-distinct | parser    | person_mention null |
| 15j  | regression: unrelated new query (no person) abandons     | 437264483 | L-distinct | parser    | person_mention null |
| 15k  | regression: person-naming new query in member_offer abandons (§5 guard) | 437264483 | L-distinct | parser | HARD: `_isNewQuery` must gate |

Cheapest gate first: plan §8 V0 (offline `output_exchange` Δ-code unit — single/ambiguity/no-match/`_isNewQuery`
gate, 0-token) before the parser cases. **Golden handling (plan §7):** `person_mention` is additive on EVERY
parser output — register it as **ignored-when-`null`, flagged-when-non-null** in the replay diff (NOT a blanket
ignore; LESSON 21). Allowed-to-change golden nodes: the reformulator parse output (additive `person_mention` +
`escalation`/`correction` on member_offer name-reply turns) + `output_exchange` + the downstream escalation
cascade ONLY on those turns; every other turn byte-identical except the additive `person_mention` key. Name-pick
turns have **no historical golden** — capture §15a–§15k fresh as the new golden. Run V4 (sampled regression) to
prove the always-extract is inert off member_offer turns.

---

# Change: `fix-suggest-offer-uuid-label` (did-you-mean leaks raw UUIDs for promotions)

Plan: `../plans/fix-suggest-offer-uuid-label.md`. Single-node fix in spine `build-suggest-offer`
(id `7972abd8-5d6b-40ff-9d38-152782cd8091`; forked on clone `txiPzSxy3Pclsz6v`). D1 (and D2 defensively)
render a human label instead of a promotion's UUID `canonical_code`, and switch uuid-coded offers to
**numbered buttons + human names in the message text**. **Change-level scope: `deterministic`** — parser
bypassed via `mock_parser_output`; `resolve-entity` + get-results run as real READS. Contact `437264483`
(FULL access). Every case bound by **§0**.

> **Cheapest gate first: the offline `build-suggest-offer` unit (§V0 below) is the PRIMARY correctness
> gate** — it pins the fix against the confirmed resolver match shape with zero dependence on the live
> resolver's miss-vs-pin nondeterminism (plan §5/§7.3). The e2e cases confirm it fires in the real graph.
>
> Redis seed shape per `fix-gate-render-notfound-msg` §3 (push `main-message-list-test` → `execute_workflow`
> → `get_execution(includeData:true)` + read `test:egress:{test_run_id}`). `mock_parser_output` present ⇒
> reformulator bypassed (0 parser tokens).
>
> **UUID regex used in assertions:** `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i`.

## §V0. Offline `build-suggest-offer` unit  (0-token, no seed) — PRIMARY GATE
Feed the node synthetic upstream inputs (`$input.first().json`, `resolve-entity`, `disallowed-entity-gate`,
`Call 'sub-query-reformulator'`, `Call 'sub-get-results'`) and assert its output object.

- **V0-a — promotion D1 (the bug):** `resolve-entity` = one unresolved resolution `{token:"sorento",
  resolved:false, matches:[ {entity_type:"promotion", canonical_code:"406c76cb-…", uuid:"406c76cb-…",
  match_field:"description", display:{description:"SORENTO HIGH BASIN TAP PROMO_24062026 DEALER.pdf"}},
  {entity_type:"promotion", canonical_code:"7e9fee38-…", uuid:"7e9fee38-…", match_field:"description",
  display:{description:"SORENTO SINK MIXER PROMO_… DEALER.pdf"}} ]}`; `gate.gate_debug.allowed_lookup=
  ["product","promotion","category","brand"]`, `require_specific:false`; `q.domain_hint:"promotion"`,
  `q.routing.suggested_team:"marketing_promotion_sorento"`; `out.is_clarification` unset.
  - **Assert:** `suggest_offer===true`; `suggest_response` **contains NO UUID** (regex absent) AND contains
    both descriptions ("SORENTO HIGH BASIN…", "SORENTO SINK MIXER…"); `suggest_quick_reply` picks are
    **numeric** (`"1,2,…"` + Yes + No, each pick title ≤3 chars, no UUID); `suggest_last_result_set[0].uuid
    === "406c76cb-…"` and `[0].label` === the first description (round-trip carries uuid — plan §2.1);
    `suggest_selection_context==="suggest_offer"`.
- **V0-b — product D1 no-regression:** `matches:[{canonical_code:"CWCX605-RL", match_tier:"prefix",
  uuid:"…"}]` (real code, not a uuid). **Assert byte-identical to pre-fix code-mode:** `suggest_quick_reply`
  starts `"CWCX605-RL,…"`, `suggest_response` = "…Did you mean CWCX605-RL? Reply with a code to continue…";
  `suggest_last_result_set[0].label==="CWCX605-RL"`.
- **V0-c — drop-if-uuid-with-no-name:** single candidate `{entity_type:"promotion", canonical_code:"<uuid>",
  uuid:"<uuid>"}` with NO `display`. **Assert** candidate dropped → `suggest_offer===false` (falls through to
  escalate-only; no invented data; no uuid anywhere in output).
- **V0-d — D2 uuid guard:** `Call 'sub-get-results'` alternatives `[{value:"<uuid>", display:"SOME PROMO.pdf"}]`,
  `relaxed_axis:"entity"`. **Assert** no bare uuid rendered (display used / numbered mode). Control:
  `alternatives:[{value:"SRTWC287", display:"SRTWC287 (stock 5)"}]` → unchanged (value is a real code).
- **Safety:** offline unit, no egress at all.

## §16. E2E promotion did-you-mean — no UUID leak  (contact `437264483`) — D1
- **Trigger (E1):** `"any promotion for sorento"` · `437264483` · `scope: deterministic` ·
  `mock_parser_output` with `domain_hint:"promotion"`, a broad promo token entity `raw:"sorento"`,
  `routing.suggested_team:"marketing_promotion_sorento"`. `resolve-entity` runs as a real READ.
- **Expect-branch:** if the resolver MISSES with promotion candidates → `build-suggest-offer` D1 numbered mode
  → `compile-current-state` → guarded `sendmsg` sub. **If the resolver PINS one promo** (valid happy outcome,
  customer would get the PDF) → `suggest_offer` never set → **re-seed a barer token** until D1 fires
  (classification-sensitive, plan §5). D1-fired is required to exercise the assertions.
- **Expect-output (structural, once D1 fires):** the would-send message (egress `sendmsg-sub` record's
  `message`) contains **NO UUID** (regex absent) and contains human promo names (`display.description`
  strings); the egress record's `quick_reply` picks are numeric ("1","2",…) + Yes/No, each ≤3 chars;
  `compile-current-state.variables.last_result_set[i].uuid` is a promo UUID and `.label` is a description.
- **Safety:** §0 all. S1 send guarded; S2 NOT the escalation branch (no assignment write); S4 get-results not
  reached on the miss (or read-only if reached); S6 deterministic → 0 LLM tokens.
- **TBD contact needed?** No.

## §17. Round-trip — numeric pick resolves the promotion by UUID  (contact `437264483`) — D4/round-trip
- **Trigger (E2, turn 2 after §16):** reply `"1"` · `437264483` · `scope: deterministic` · session mid
  `suggest_offer` with the §16 `last_result_set` seeded (pre-seed `respond_contacts_test` for `437264483`
  in `mode=regress-capture`, per LESSON 31 — the reformulator reads `previous_conversation_state` from
  `get-session-vars`, not the redis item). Seed `selection_context:"suggest_offer"`, `domain_hint:"promotion"`,
  and a 2-row `last_result_set` where row1 `{idx:1, label:"SORENTO HIGH BASIN…pdf", value:"SORENTO HIGH
  BASIN…pdf", product:"406c76cb-…", uuid:"406c76cb-…"}`. Real reformulator (this turn asserts the round-trip,
  so run the parser — but the fix itself is scope-deterministic; this case is the round-trip confirmation).
- **Expect-branch:** `suggest-follow-up` sees `reference_positions:[1]` → `output_exchange` REFERENCE-POSITIONS
  block emits an entity carrying `uuid:"406c76cb-…"`, `hint:"promotion"`, domain retained → re-query promotion
  by uuid → get-results (real read) attempts the PDF → guarded send.
- **Expect-output (structural):** the resolved entity for the pick carries `uuid === "406c76cb-…"`
  (from `last_result_set[0].uuid`, plan §2.1); the would-send message contains **NO UUID** shown to the user;
  no `escalation.preferred_assignee_id` set (a promotion pick is a re-query, NOT a CS assign).
- **Safety:** §0 all. **S2 focus** — no assignment/SLA/PIC/queue write (the pick must NOT reach the
  human-intervention sub). S4 get-results read tool only.
- **TBD contact needed?** No.

## §18. No-regression — product fuzzy did-you-mean unchanged  (contact `437264483`) — D1 code-mode
- **Trigger (E3):** `"cwc605-rl have stock?"` (real char diff → resolver returns `CWCX605-RL` candidate) ·
  `437264483` · `scope: deterministic` · `mock_parser_output` `domain_hint:"inventory"`, product entity
  `raw:"cwc605-rl"`. Real `resolve-entity` read.
- **Expect-branch/output:** `build-suggest-offer` D1 **code-mode** — `suggest_quick_reply` picks are the
  product CODE(s) (e.g. `"CWCX605-RL,Yes escalate,No it's okay"`), `suggest_response` = "…Did you mean
  CWCX605-RL? Reply with a code to continue…". Byte-identical to pre-fix. No numbering, no uuid.
- **Safety:** §0 all.
- **TBD contact needed?** No.

## §19. No-regression — happy promo (resolver PINS) returns the PDF  (contact `437264483`)
- **Trigger (E4):** `"Sorento Dealer"` (or another token that PINS one promo) · `437264483` ·
  `scope: deterministic` · `mock_parser_output` `domain_hint:"promotion"`. Real `resolve-entity` read.
- **Expect-branch/output:** `resolve-entity` PINS → normal promotion happy path → the PDF attachment offer;
  `build-suggest-offer` sets `suggest_offer` **false** (no miss) → downstream byte-identical to before the fix.
  Assert `suggest_offer` unset/false and no numbered/did-you-mean render.
- **Safety:** §0 all. S8/media send path (if attachment) guarded (S1); S4 get-results read-only.
- **TBD contact needed?** No.

### Coverage (this change)
| #    | Branch / assertion                                        | Contact   | Scope         | Blocked by |
|------|-----------------------------------------------------------|-----------|---------------|------------|
| V0-a | offline: promotion D1 → human names, no UUID, numeric btns | (offline) | deterministic | — |
| V0-b | offline: product D1 code-mode byte-identical              | (offline) | deterministic | — |
| V0-c | offline: uuid-no-name candidate dropped → escalate-only   | (offline) | deterministic | — |
| V0-d | offline: D2 alternatives uuid guard                       | (offline) | deterministic | — |
| 16   | e2e: promotion did-you-mean, no UUID leak                 | 437264483 | deterministic | resolver miss-vs-pin (token-broaden, plan §5) |
| 17   | e2e: numeric pick resolves promotion by UUID (round-trip) | 437264483 | deterministic | §16 last_result_set seed |
| 18   | no-regression: product fuzzy did-you-mean (code-mode)     | 437264483 | deterministic | — |
| 19   | no-regression: happy promo PINS → PDF, no suggest_offer   | 437264483 | deterministic | — |

Cases V0/§16–§19 belong to change `fix-suggest-offer-uuid-label` (plan `../plans/fix-suggest-offer-uuid-label.md`).
Allowed-to-change golden nodes: `build-suggest-offer` + its downstream cascade (`compile-current-state`,
guarded send) ONLY on promotion-miss turns; product-miss and happy turns byte-identical. Primary correctness
gate is the offline V0 unit; §16–§19 are e2e confirmation. **Open items (plan §7):** respond.io button-vs-list
limit + over-length behavior UNVERIFIED (numbers safe under all interpretations); D2 uuid `value` risk is
data-dependent (V0-d is the synthetic backstop).

---

## §20. `output_exchange` clobber / casual-clear / team fix  (contact `437264483`) — plan `../plans/output-exchange-9-1-10-fix.md`

Scope: **parser** (change is INSIDE the reformulator sub, after the LLM; the deterministic
`mock-reformulator-output` branch bypasses `output_exchange` → real reformulator required). Run on the
fork (`CpxE8LroLzCkrAQN`) / clone (`txiPzSxy3Pclsz6v`) in `uac` mode. **Concrete edits:** #1 gate clobber
(L444–L446), #3 gate casual-clear (L439–L441) + shared engagement block, #4 stop domain bleed
(decision-tree — no-op if draft==active), #5 team = confirm-only (L462–L472 unchanged). **#2 closing
regex backstop is CONTINGENT** — do NOT apply unless the §20 gate-check below fails; prefer a prompt
nudge (out-of-scope, user-gated).

> ⚠️ **Draft≠active:** MCP reads draft `2428b0cd`; the SIM tested active `303a25ec`. Coder must diff
> draft-vs-active for `output_exchange` before editing (plan §0/§4a).

### §20-GATE. Gratitude classification check (run FIRST, after #1+#4)
- **Setup:** apply #1+#3+#4 only. Real reformulator on the fork.
- **T:** T1 `may know delivery for cust yoo living for today` → T2 `okay thankyou` (order prev-state);
  AND T1 `Hi, can send me agreement` → T2 `thank you` (forms prev-state).
- **Expect-output:** raw LLM `message_type=casual` (golden baseline) AND final `output_exchange`
  `message_type=casual`, `domain_hint=null`, **no human-intervention `would_write`**.
- **Decision:** casual + no would-assign → **#2 NOT needed, #9 done.** Still business_query / would-assign
  → **STOP, escalate for the prompt-nudge decision** (do not add the code regex unilaterally).
- **Safety:** §0 all. **S2 is the gate** — a would-assign here is the #9 bug (a plain closing assigning
  staff). Assert NONE of `Assign or unassign a Conversation1`, `conversation-sla-tracking-create`,
  `Call 'sub-add-comment-respond'` executed; human-intervention only `{blocked:true, would_write}`.

### §20a. #9-R / #9-R2 — gratitude → casual (repro must clear)
- **T:** as §20-GATE T2s.
- **Expect:** #9-R `casual`, no would-assign; #9-R2 `casual`, forms NOT re-listed (get-results not reached).
- **Safety:** §0 all; **S2 focus** + S3 (save-session-vars blocked).

### §20b. #9-G1 / #9-G2 / #9-N — continuation + escalation + boundary (must NOT break)
- **T:** G1 `check stock srt86cr` → `and its ETA?`; G2 ZZZ999XX escalate offer → `yes`;
  N `thanks, can you also check SRT79-SS-GM stock`.
- **Expect:** G1 stays business (domain=incoming, `srt86cr` carried); G2 escalation FIRES to purchasing
  (`escalation.is_escalation_confirmation=true`, `_engagesOffer=true` protects it); N business
  (domain=inventory, `SRT79-SS-GM` current) — gratitude+request boundary.
- **Safety:** §0 all. G2: S2 — escalation `would_write` to purchasing is `blocked:true` (no real assign).

### §20c. #1-N + #1 pick-protect — casual-clear boundary
- **T:** N offer pending → T2 bare `hi`; pick-protect: mid-offer reply the LLM mislabels casual but
  carries a resolved position / member-name.
- **Expect:** N entities **cleared** (`_engagesOffer=false`); pick-protect resolved entities / member
  name **NOT wiped** (`_engagesOffer=true`, incl. `_pmNow`), member_offer block resolves.
- **Note:** the sim `#1-R` "retain srt104 GY" is **out of scope** (entity-op `replace` drop, not
  casual-clear) — tracked as known-open, NOT an acceptance gate.
- **Safety:** §0 all.

### §20d. #10-R / #10-G / #10-N — escalation team via inheritance (confirm unchanged)
- **T:** R T1 `check eta SRTWT7448` → T2 `Nobody reply me` (replyTo=incoming); G1 order-miss →
  `Nobody reply me`; G2 `I want to talk to a human` (no ctx); N reply-to on a delivered non-escalation
  answer.
- **Expect:** R `message_type=request_for_help`, `suggested_team=purchasing` **via `priorRouting`
  inheritance** (not `derived`, not replyTo — `_reqHelp` immune to clobber); G1 `customer_service`;
  G2 default CS, no crash; N casual, no forced team.
- **Safety:** §0 all. **S2 focus** — R/G human-intervention writes are `blocked:true`; assert team in the
  `would_write` payload, NOT a real assignment.

### §20e. Regression guard set (must be byte-identical / behavior-identical)
Member-offer name-pick, numbered pick (`reference_positions>0`), escalation yes/no, suggest-offer /
Δ4-merge flows, CS member retarget/decline markers, access-levels carry (L435–L437), date-filter gate
(L587), deriveRouting brand clamp (L28). See plan §5.
- **Safety:** §0 all across the set; S2 the invariant (no member-pick/retarget ever produces a real assign).
