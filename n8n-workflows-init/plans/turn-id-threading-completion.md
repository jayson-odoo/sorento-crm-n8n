# turn_id threading — completion plan (obs-latency-contract, cycle 2)

**scope: `deterministic`** — no parser change, no get-results change. Every clone case injects
`mock_reformulator_output`; zero parser tokens.

Status: **PLAN ONLY.** Nothing built, nothing edited, nothing executed, nothing published in
producing this document. Recon date 2026-07-21, all facts read live from MCP on that date.

Predecessors: `obs-latency-contract-plan.md` (design), `obs-latency-contract-build.md` (C1–C4
build spec), `tests/reviews/obs-latency-contract.md` (APPROVE + H1–H5).

---

## REV 2 — USER DECISIONS FOLDED IN (2026-07-21)

This document was amended after a user review of the rev-1 classification. Four decisions, and one
recon finding that reorders the whole change:

| # | decision | effect on rev 1 |
|---|---|---|
| 1 | #13 `respond-close-convo` — no turn_id | **confirms** rev 1. No change |
| 2 | #12 `schedule-working-day-detection` — **not logged at all** | **stronger** than rev 1 (which logged with null turn_id). Scoped as §2.2 hunk **H6**. I recommend AGAINST it — see §2.2 |
| 3 | #14 `sorento-main` rate-limit — **RECLASSIFIED TURN-BOUND** | reverses rev 1 §2. New Hop 3, §3.3 |
| 4 | #15 `sorento-main-INJECT` — same treatment? | **YES, and it goes first.** See §2.4 |

**Recon finding that dominates everything below:** `sorento-main-INJECT` is not a dormant twin. It
is carrying **100 % of production ingress right now**. In a 55-execution sample spanning 19.1 h,
**every single `sorento-main` execution terminated at `in-failover?` on the TRUE (drop) branch**;
the paired `sorento-main-INJECT` execution ~3 s later enqueued normally (e.g. `sorento-main`
`9402932` drops @ 03:33:08.873Z → INJECT `9402938` reaches `Redis2` @ 03:33:11.941Z, same
`messageId` `1784604785000000`, contact `438930735`). `get-set` returns ~77 contact ids, which is
approximately the whole active roster.

So `sorento-main` is currently **inert** and `sorento-main-INJECT` is **the live path**. Any plan
that fixes only `sorento-main` fixes the workflow that is not running. This is why §2.4 recommends
INJECT first, and it is also the reason the `sorento-main` draft blocker (§7.6) is worth resolving
carefully rather than rushing.

Rev-1 text is retained below wherever it still holds; superseded passages are marked **[SUPERSEDED
REV 2]**.

---

## 0. Why this exists

C1–C4 shipped live today. Post-promote verification found outgoing rows with `turn_id: null` on
the **escalation** path (spine `9398636` → `sub-human-intervention` `9398642` → sendmsg
`9398643`/`9398647`).

The cause is a scoping failure in cycle 1, not a coding error. Cycle 1 enumerated *the spine's*
callers of the sendmsg sub, plus `sorento-main`. **Nobody enumerated callers of the sendmsg sub
from other subs, or callers of the save sub from anywhere.** `sub-human-intervention`
(`rrYXzE61gCNUck_zmXe-G`) calls sendmsg three times, accepts no `turn_id`, and passes none — so
C3's `?? null` correctly writes `null`.

This matters more than a generic coverage gap. **Escalations are the slow turns.** Silently
dropping them from the CRM's SLA denominator biases p99 *optimistic* — the one direction that
makes a latency problem invisible. A denominator that is incomplete in a way correlated with
slowness is worse than no denominator.

The census below is exhaustive by construction: all 66 workflows on the instance were enumerated
via `search_workflows`, then each read via `get_workflow_details` (draft **and** `activeVersion`)
and matched on `parameters.workflowId.value` plus a raw substring grep for both sub IDs.

**CENSUS CLOSED (rev 2).** The nine previously-unreadable workflows were re-scanned after the user
enabled `availableInMCP`. **None of them contains any `executeWorkflow` node at all**, so none can
be a caller of either sub. The census is therefore exhaustive over **66 of 66** workflows, and the
counts below are final: **15 sendmsg callers, 4 save-sub callers.** V-T-g is **CLOSED — PASS**.

---

## 1. EXHAUSTIVE CALLER CENSUS

### 1.1 Callers of sendmsg `aoydkG1dbItXR5jXFEQsP` (a)

Live/published workflows only. Draft == active on **every** workflow in this table (no divergence
anywhere), except `sorento-main`, whose divergence is unrelated (`in-failover?` typeValidation).

| # | host workflow | host kind | node (id) | passes `turn_id`? | has spine exec id? |
|---|---|---|---|---|---|
| 1 | `9qVyfUxmRQqrpGRMDLRuz` spine | **origin** | `sorento-sub-respond-sendmsg-respond` `e0088d37` | ✅ `{{ $execution.id }}` | ✅ is the origin |
| 2 | " | " | `…respond2` `326f449a` | ✅ | ✅ |
| 3 | " | " | `…respond3` `0a2497d0` | ✅ | ✅ |
| 4 | " | " | `…respond4` `f0a30b9c` | ✅ | ✅ |
| 5 | " | " | `…respond5` `7eaf5764` | ✅ | ✅ |
| 6 | " | " | `…respond-transcribed-message` `4db2df34` | ✅ | ✅ |
| 7 | " | " | `send-transcript-confirm` `97e84805` | ✅ | ✅ |
| 8 | " | " | `send-voice-not-allowed` `298d0b7e` | ✅ | ✅ |
| **9** | **`rrYXzE61gCNUck_zmXe-G` sub-human-intervention** | **sub** | `…routed-to-pic2` `a1ea185e` | ❌ **GAP** | ❌ no input carries it |
| **10** | " | " | `…routed-to-pic1` `c5dd9961` | ❌ **GAP** | ❌ |
| **11** | " | " | `…routed-to-pic` `0ca5413f` | ❌ **GAP** | ❌ |
| **12** | **`ss9S83XF7ZtmnaUyFtYZc` schedule-working-day-detection** | **top-level Schedule (08:00 MYT)** | `…routed-to-pic` `c38fc3e2` | ❌ | ❌ no parent at all |
| **13** | **`-WkzJMQZHmsFQm6A2abLJ` respond-close-convo** | **top-level respondio trigger** | `sorento-sub-respond-sendmsg-respond` `f8bc2be8` | ❌ | ❌ no parent |
| 14 | `NwMOBEQ1NW7LVky5` sorento-main | ingress/producer | `Call 'sorento-sub-respond-sendmsg-respond'` `0204df88` | ❌ **deliberate** | ❌ runs *before* any spine exec exists |
| **15** | **`sk0zN90Cas4Y6Y2w` sorento-main-INJECT** | ingress (failover twin) | `Call 'sorento-sub-respond-sendmsg-respond'` `0204df88` | ❌ **deliberate** | ❌ same |

Callers **9–13 and 15 were entirely absent from cycle 1's matrix.** Cycle 1 counted 9; the true
count is 15.

Harness forks (build targets, not live callers): `vUfFUDjLAuMaeQE6` (HI TEST fork) carries the
same 3 sendmsg calls; the clone `txiPzSxy3Pclsz6v`'s 8 callers point at `ublq9nSlrpz63xan`
(sub-sendmsg-CHAT).

### 1.2 Callers of save sub `UrETd-jm46tFj3Xw7w8vL` (b)

| # | host workflow | node (id) | passes `turn_id`? | notes |
|---|---|---|---|---|
| 1 | `9qVyfUxmRQqrpGRMDLRuz` spine | `Call 'sub-respond-save-message-redis'2` `f99f1e4b` | ✅ top-level input **and** in `data` blob, `` `${$execution.id}` `` | `type:"incoming"`. C1, shipped |
| 2 | `aoydkG1dbItXR5jXFEQsP` sendmsg sub | `Call '…redis'1` `fc0b22ca` (text) | ⚠️ **in the `data` blob only** | C3, shipped |
| 3 | " | `Call '…redis' (quick_reply)` `c2985929` | ⚠️ **blob only** | C3, shipped |
| **4** | **`eG3AA-TWo17-E1-DlHLnH` respond-send-user** | `Call 'sub-respond-save-message-redis'` `041460f0` | ❌ **and no `type` key at all** | **NEW — see §5** |

On #2/#3 the asymmetry is inert and deliberate (reviewer F6): `UrETd`'s Redis node forwards only
`{{ $json.data }}`, so the top-level input is decorative. Do not "tidy" it.

Harness forks calling (b): `ublq9nSlrpz63xan` ×1, `uoO5eiJFXA8THrry` ×2, `sJI3DbsLCG01JfRs` ×2
(the last repointed to the TEST sink `tWm5DYLxfypmVC1T`).

---

## 2. PROACTIVE vs TURN-BOUND classification

**[REVISED REV 2]**

| caller | class | gets turn_id? | logged at all? | reasoning |
|---|---|---|---|---|
| 1–8 spine | turn-bound | ✅ already | ✅ | direct bot reply to a customer turn |
| **9–11 sub-human-intervention** | **turn-bound** | ✅ **Hop 1** | ✅ | synchronous bot reply, same customer turn, same spine execution. Their absence is the reported defect |
| **12 schedule-working-day-detection** | PROACTIVE | ❌ | ❌ **NOT LOGGED — user decision 2, hunk H6** | rev 1 had it logging with null turn_id. User decision is stronger: no chat-log write at all. **I recommend against — §2.2** |
| 13 respond-close-convo | PROACTIVE | ❌ | ✅ (null turn_id) | fires on `conversationClosed`, `closedBy` = staff/API/n8n. No customer message participates; `contact_identifer` comes from `Update a Contact`, not any inbound message. **User decision 1 confirms rev 1** |
| **14 sorento-main** | **TURN-BOUND** | ✅ **Hop 3** | ✅ **both rows** | **RECLASSIFIED, user decision 3.** The whole turn is handled inside `sorento-main`; turn_id = `sorento-main`'s own `$execution.id`. §2.3 |
| **15 sorento-main-INJECT** | **TURN-BOUND** | ✅ **Hop 3** | ✅ **both rows** | identical gate, identical node ids. **And it is the live path — §2.4.** Must ship first, not second |

### 2.1 Why #12 is proactive **for turn_id purposes** (rev 1, still holds)

*(rev-1 text retained — the turn_id half of this argument was accepted by the user and is unchanged.
Only the "does it get a row at all" half is superseded; see §2.2.)*

#12 is the next-morning follow-up: when escalation happens outside working hours,
`sub-human-intervention` pushes to redis `sorento-respond-assignee-queue`, and this Schedule
worker drains it at 08:00 MYT and sends "your inquiry has been routed to the PIC".

It *does* trace back to a real customer turn, so threading it is technically possible (§3, Hop 2).
I recommend against it, on three grounds:

1. **The turn was already answered.** `…routed-to-pic1` (caller #10) replies synchronously
   out-of-hours ("we are outside our working hours…"). That reply is the turn's response and it
   *will* carry the turn_id after this change. #12 is a **second** outgoing message for the same
   turn.
2. **Threading it would corrupt the metric it feeds.** Two outgoing rows sharing one turn_id makes
   pairing ambiguous, and the second row's latency is ~8–14 hours by construction. Whichever the
   CRM resolver picks, p99 moves for reasons that have nothing to do with bot performance —
   pessimistic this time, but equally wrong. Excluding it keeps the denominator "one turn, one
   bot response".
3. **The mechanism is hostile.** `parse-json` on the schedule side is literally
   `return JSON.parse($('pop').first().json[''].replace('"is_test": ,', ""))` — string surgery
   repairing a malformed-JSON payload built by an unquoted expression. Adding a field to that
   payload is a live edit to a fragile parser, on a daily-cron path, for a row we do not want.

**Consequence to document for the CRM side:** outgoing rows from #12 carry `turn_id: null` *by
design*, exactly like #13. **[REV 2: #14/#15 are no longer in this set — they are turn-bound.]**
Null turn_id must mean "deliberately outside the denominator", never "unknown". If the CRM
currently treats null as unknown, that is a contract mismatch to fix on their side.

---

## 2.2 USER DECISION 2 — #12 not logged at all (hunk **H6**) — SCOPED, BUT I RECOMMEND AGAINST

**The ask:** the 08:00 cron follow-up must produce **no chat-log write at all**, not merely a row
with `turn_id: null`.

### 2.2.1 What it would take (this is not a small edit)

The send is performed by the **shared live sub** `aoydkG1dbItXR5jXFEQsP`, and the outgoing row is
written **inside that sub** (C3, nodes `fc0b22ca` text / `c2985929` quick_reply). #12 does not own
its own save call, so suppression cannot be done at the caller. It requires editing the shared sub:

1. **New trigger input** on `When Executed by Another Workflow` (`752fab22`): append an 11th entry
   `{"name": "skip_log"}`, **untyped** (F4: untyped renders JSON `null` when unmapped, so all 14
   other callers are unaffected and mean "do log").
2. **quick_reply path — easy.** `c2985929` is a terminal leaf off `HTTP Request` output 0,
   alongside `Chat Memory Manager`. Insert `IF skip_log` between them; TRUE → nothing, FALSE → save.
3. **Text path — a trap, and this is the real cost.** `fc0b22ca` sits **on the loop-back edge**:
   `Loop Over Items`[1] → `Send a Message` → `Call '…redis'1` → **back to `Loop Over Items`**. It is
   the *only* edge returning control to the loop. Bypassing or deleting it **stalls the loop after
   the first chunk and silently truncates every multi-part message**. A correct suppression must be
   `Send a Message → IF → [TRUE] Loop Over Items` **and** `[FALSE] Call '…redis'1 → Loop Over Items`
   — both branches must re-enter the loop. Any coder who treats this as "add an IF before the save"
   ships message truncation to production.
4. Add `skip_log: true` to caller #12's input shape — which means touching `schedule-working-day-
   detection`'s 2-key node, and that workflow's payload is built by the malformed-JSON string
   surgery described in §2.1.3.

So H6 is: **one new input + two new IF nodes + three connection rewires on the live shared sub that
every bot reply flows through**, including a loop-back edge whose failure mode is silent truncation.
That is comfortably the highest-risk edit in this entire change — higher than Hop 1 and Hop 3
combined, both of which are additive and touch no connections on a shared sub.

### 2.2.2 The transcript consequence — and why it is the mirror image of decision 3

A customer receives a real WhatsApp message ("your inquiry has been routed to the PIC") that exists
nowhere in `chat_histories`. A staff member or auditor reading that conversation sees: the customer's
escalation → the out-of-hours reply → **nothing** → the customer replying to a message that is not
there. The gap is not neutral; it is actively misleading, because the customer's *next* message will
often be a response to the invisible one.

**This is precisely the defect decision 3 exists to fix, pointed the other way.** Decision 3's
reasoning was: *a customer message that never reaches the log is wrong, even though it was
deliberately dropped, because the transcript must be faithful and the latency must be measurable.*
H6 asserts the opposite for the outbound direction: *a bot message the customer demonstrably
received may be deliberately absent from the log.* Both cannot be right. The two decisions are in
direct tension on the same principle, and I do not think the tension is resolvable by appealing to
"#12 is a cron job" — #14's rate-limit notice is equally machine-generated and equally
non-conversational, and decision 3 says log it.

### 2.2.3 The distinction that I think actually resolves it

There are **two different consumers** of `chat_histories` and rev 1 conflated them:

| consumer | wants | correct lever |
|---|---|---|
| CRM SLA / p99 latency | one turn, one bot response, no double-count | **`turn_id: null` = excluded from the denominator** |
| conversation transcript / audit | every message the customer sent or received | **row present** |

`turn_id: null` **already fully satisfies the first consumer** — that contract is stated in §2.1 and
is what decision 1 (#13) accepts. H6 buys nothing the null turn_id does not already buy, and pays for
it with a transcript hole plus the riskiest edit on the board.

If the real motivation is "#12 shouldn't clutter the customer transcript with bot noise", the right
lever is a **classification** — a `type`/`category` value or a flag column distinguishing
system-notice from conversational reply — not absence. Absence is unrecoverable; a flag is filterable
by whoever wants it filtered, and still lets an auditor reconstruct what the customer saw.

### 2.2.4 Recommendation

**Do not take H6.** Leave #12 logging with `turn_id: null` (rev-1 behaviour, which is also the
current post-C3 behaviour once H4 lands — see §4, #12 is in the contactless set and today produces
**no row anyway, via a crash**, which is the accidental version of H6 and is not evidence for it).

H6 is nonetheless **fully specified above** so the user can take it as a **separately-labelled,
independently-rejectable hunk**, exactly like H4. If it is taken:
- it must be its own publish of `aoydkG1dbItXR5jXFEQsP`, **not** bundled with H4;
- the loop-back rewire (§2.2.1 step 3) is a hard review gate — reject any diff that leaves the
  FALSE branch dangling;
- UAC case **§OBS-17** (§9.2) must pass, including the multi-part-message control.

**Open question for the user, and the cheapest way to settle this:** is the objection to #12 that it
pollutes the *latency metric*, or that it pollutes the *transcript*? If the former, `turn_id: null`
already handles it and H6 should be dropped. If the latter, a flag beats deletion. H6 is only the
right answer if the requirement is genuinely "this message must be unrecoverable from the log", and I
can see no reading of the observability goal that wants that.

---

## 2.3 USER DECISION 3 — the rate-limit turn is TURN-BOUND (Hop 3)

### 2.3.1 Confirmed: those customer messages are absent from `chat_histories` entirely

Verified against the live graph (`NwMOBEQ1NW7LVky5`, active version `952fc09a`) and real executions.
The rate-limited turn produces **zero rows — no incoming and no outgoing**, by two independent
mechanisms:

**No incoming row.** The gate is `Redis1` (INCR on key `"{{ $('If1').first().json.id }}"`, `expire:
true`, **`ttl: 1`**) → `If` (`{{ $json[$json.keys()[0]] }} <= 30`). On FALSE, control goes to the
sendmsg call and **`Redis2` never runs**. `Redis2` is the only push to `main-message-list`, so no
spine execution is ever created, so the spine's C1 incoming-save (`f99f1e4b`) never runs. The
message is not "unpaired" — it is **absent**. Confirmed structurally; the branch is a hard
either/or on `If`.

**No outgoing row either.** The rate-limit sendmsg call (`0204df88`) passes exactly two keys —
`contact_identifer` and a literal `message` — and **no `contact` object**. Both of the sub's save
blobs dereference `contact.phone` / `contact.firstName` / `contact.lastName` **unguarded** (8 sites
across the two nodes). So the save node throws. Note the ordering: `Send a Message` runs
*before* `Call '…redis'1`, so the customer **does receive** the notice and *then* the save crashes.
This is independently corroborated by reviewer finding F5, which names "#9 (rate-limit)" as one of
the three callers producing no outgoing row (crash observed at exec `9392251`).

**Net today:** the customer sends a message, receives "you sent too many messages", and *neither*
message exists in the log. The turn is invisible in both directions. Decision 3 is correct and the
rev-1 classification was wrong — and note that the current state is *also* an unintentional instance
of exactly the transcript hole H6 would make deliberate (§2.2.2).

**Empirical caveat, stated honestly.** I could not observe a rate-limited execution in production,
because I could not observe *any* execution reaching the gate: 55/55 sampled `sorento-main`
executions over 19.1 h dropped earlier, at `in-failover?` (§REV 2 header). Execution retention for
this workflow is a rolling ~19 h window (168 executions retained), so a longer historical search is
not available. The threshold is **>30 messages in a 1-second TTL window**, which no human reaches
via WhatsApp — see §5b for why the *injector* can, and why that matters. The absence claim above
therefore rests on the graph (which is decisive — `Redis2` and the sendmsg call are on opposite
branches of one IF) rather than on a captured rate-limited run. Verification task **V-T-j** forces
the branch on the clone and confirms empirically.

### 2.3.2 Where `messageId` lives in `sorento-main` (it is NOT `$('tf-message')`)

`tf-message` is spine-only. Established from real execution `9402932`, node `consolidate`, the
respond.io webhook body is:

```
{ event_type, event_id,
  contact: { id, firstName, lastName, phone, email, ... },
  message: { messageId: 1784604785000000,     <- microseconds
             channelMessageId, contactId, channelId,
             traffic: "incoming",
             timestamp: 1784604785000,        <- ms; == messageId/1000
             replyTo: <present on INJECT, absent on live webhook>,
             message: { type: "text", text: "SMC202607-0057\n..." } },
  channel: {...}, sender: {...} }
```

**The path equivalence that makes this safe.** The spine's C1 blob reads `$('tf-message').first()
.json`, and `tf-message` returns `redis-pop.json.message.message` — i.e. the queue item's `.message`
key, which `concat_queue_body` sets to `$('consolidate').first().json`. Therefore:

> **`$('tf-message').first().json` in the spine ≡ `$('consolidate').first().json` in `sorento-main`.**

Every C1 expression can be mirrored by substituting that one node reference. Verified field by field
against exec `9402932`: `.message.message.text` = the text ✓, `.message.messageId` = `1784604785000000` ✓,
`.message.replyTo?.id` → `null` when absent ✓.

Likewise the spine's contact source `$('sorento-sub-respond-findcontact-respond')` is a Code node
returning `redis-pop.json.message.contact`, which `concat_queue_body` sets to `$('If1').first().json`.
Therefore:

> **`$('sorento-sub-respond-findcontact-respond').first().json` in the spine ≡ `$('If1').first().json`
> in `sorento-main`.**

`If1` runs *upstream* of `Redis1`/`If`, so it is available on the rate-limited branch. This is the
key structural fact that makes Hop 3 cheap: **at the moment the gate rejects the message,
`sorento-main` already holds the fully-assembled queue body** — the exact object the spine would
have popped.

### 2.3.3 Improvement on the proposed shape: pass `contact`, don't rely on H4

The user's proposed shape (save the incoming + log the outgoing, both with
`turn_id = {{ $execution.id }}`) is correct. One improvement:

> **Also pass `contact: {{ $('If1').first().json }}` on the sendmsg call.**

Rationale: without it, the outgoing row depends on H4 landing (else it crashes as today), and even
with H4 the row is null-filled — `phone_number`, `first_name`, `last_name` all `null`. But
`sorento-main` *has* the enriched contact record from the findcontact sub at `$('If1')`, in exactly
the shape the sub's blobs expect (`.phone`, `.firstName`, `.lastName`). Passing it yields a
**complete** outgoing row and makes Hop 3 independent of whether H4 is accepted.

**Consequence: H4 is no longer a prerequisite for decision 3.** It remains strongly recommended
(§4) for the genuinely contactless callers #12/#13, but Hop 3 no longer depends on it. That is a
deliberate decoupling — it means the reviewer can reject H4 without breaking the rate-limit fix.

### 2.3.4 Exact node changes — `sorento-main` `NwMOBEQ1NW7LVky5`

Four operations. **Note this is NOT param-only** (unlike the spine promote) — it includes connection
changes. Flagged for the coder and the reviewer.

**3a. ADD node `save-ratelimit-incoming`** — `n8n-nodes-base.executeWorkflow` typeVersion `1.3`,
targeting `UrETd-jm46tFj3Xw7w8vL`, `mappingMode: "defineBelow"`. Mirrors the spine's C1
(`f99f1e4b`) with the two node-reference substitutions from §2.3.2.

Top-level keys (decorative — per reviewer F6, `UrETd`'s Redis node forwards only `{{ $json.data }}`;
included for shape parity with the spine, **do not "tidy" them away**):

```
contact_id   : ={{ $('If1').first().json.id }}
phone_number : ={{ $('If1').first().json.phone }}
message      : ={{ $('consolidate').first().json.message.message.text }}
sent_at      : ={{ new Date().getTime() }}
turn_id      : ={{ $execution.id }}
```

`data` (load-bearing). Mirrors C1 key-for-key, same order, same `"incoming"` type:

```
={{ JSON.stringify({
  "contact_id": `${$('If1').first().json.id}`,
  "phone_number": $('If1').first().json.phone,
  "message": $('consolidate').first().json.message.message.text,
  "sent_at": $('consolidate').first().json.message.messageId
             ? Math.floor($('consolidate').first().json.message.messageId / 1000)
             : new Date().getTime(),
  "first_name": $('If1').first().json.firstName,
  "last_name": $('If1').first().json.lastName,
  "reply_to_message_id": $('consolidate').first().json.message.replyTo?.id ?? null,
  "reply_to_message": $('consolidate').first().json.message.replyTo?.message?.text ?? null,
  "type": "incoming",
  "message_id": `${$('consolidate').first().json.message.messageId}`,
  "turn_id": `${$execution.id}`
}) }}
```

Deliberate deviations from C1, each with a reason:
- **`message` is not the C1 ternary.** C1's is `$('tf-message').isExecuted ? A : A || attachment
  .description || $json.message` — degenerate (both arms start with the same `A`) and its fallbacks
  exist for the spine's voice/attachment paths, which cannot occur here. Straight text read.
  **Attachment-only rate-limited messages will store `undefined` for `message`** — accepted, and
  noted as V-T-m; matching C1's dead ternary would not fix it either.
- **`sent_at` units follow C1 exactly** (`messageId / 1000`). Empirically `messageId` is
  **microseconds** (`1784604785000000`) and `messageId/1000` is **milliseconds**
  (`1784604785000` == the body's own `timestamp` field), so C1's variable name notwithstanding this
  yields ms. Mirroring C1 byte-for-byte is the point: incoming rows from both paths agree by
  construction. **Do not "correct" the units here** — that is a separate, CRM-coordinated change.

**3b. REWIRE** `If` output index **1** (FALSE / rate-limited): target changes from
`Call 'sorento-sub-respond-sendmsg-respond'` to `save-ratelimit-incoming`.

**3c. ADD connection** `save-ratelimit-incoming` → `Call 'sorento-sub-respond-sendmsg-respond'`.

Order is deliberate: **save the incoming, then send.** It puts the rows in chronological order and
means a send failure still leaves the incoming recorded. It also guarantees `$execution.id` is
identical for both (same execution, trivially).

**3d. EDIT** `Call 'sorento-sub-respond-sendmsg-respond'` (`0204df88`) — add **two** keys to
`workflowInputs.value`, leaving the existing two untouched:

```
turn_id : ={{ $execution.id }}
contact : ={{ $('If1').first().json }}
```

**No edit to either sub is required for Hop 3.** `aoydkG1dbItXR5jXFEQsP` already declares both
`contact` (type `object`) and `turn_id` (untyped) as trigger inputs, and both save blobs already
read `turn_id ?? null` (C3). `UrETd-jm46tFj3Xw7w8vL` already declares `turn_id`. Like Hop 1, Hop 3
lights up plumbing that already exists.

**Build caution for the coder:** the caller sets `convertFieldsToString: true` and
`attemptToConvertTypes: false`. Copy the **exact expression form** used by one of the spine's eight
sendmsg callers for its `contact` key — do not invent it — and assert at runtime that the sub
receives `contact` as an **object**, not a stringified object (V-T-k). Also add `contact` and
`turn_id` to the node's `schema` array or leave it alone consistently with how the spine's callers
do it; C1 itself has `turn_id` in `value` but absent from `schema` and works, so schema entries are
not load-bearing — but be consistent, do not half-do it.

### 2.3.5 turn_id semantics for this turn

`$execution.id` in both 3a and 3d is **`sorento-main`'s own execution id**, since both nodes run
inside that execution. The two rows therefore share it by construction — there is no forwarding hop
and no way for them to diverge.

n8n execution ids are a **single global sequence across all workflows on this instance** (evidenced
by `sorento-main` `9402932` and INJECT `9402938` interleaving with spine ids in the same range), so
a `sorento-main`-minted `turn_id` can never collide with a spine-minted one. The CRM cannot tell
which workflow minted a given `turn_id`, and does not need to: the contract is "rows sharing a
non-null `turn_id` are one turn". That contract holds unchanged.

**What the CRM will now measure for these turns:** `outgoing.sent_at − incoming.sent_at` = the
latency of the rate-limit notice, which is the correct and desired quantity — these turns *were*
answered, just not by the bot proper. They should sit at the fast end of the distribution, which is
the honest picture. Worth telling the CRM side that a new, very-low-latency population is entering
the denominator (V-T-l).

## 2.4 USER DECISION 4 — `sorento-main-INJECT` (#15): SAME TREATMENT, AND IT GOES FIRST

**Recommendation: YES — apply Hop 3 identically to `sk0zN90Cas4Y6Y2w`, and promote it BEFORE
`sorento-main`.**

**It has the same gate, node for node.** Verified against the live graph: identical `Redis1`
(`93fd0569`, INCR, `ttl: 1`), identical `If` (`cfad4b98`, `<= 30`), identical rate-limit sendmsg
caller — **same node id `0204df88`**, same 2-key shape, same literal message text. The only
structural difference is upstream: INJECT has **no** `get-set` / `restore` / `in-failover?` (it goes
`consolidate` → findcontact directly), which is correct, since it *is* the failover path.
`concat_queue_body`, `If1` and `consolidate` are byte-identical, so **every expression in §2.3.4
transfers unchanged**. Both also INCR the *same* redis key namespace (bare contact id), so the two
paths share one counter.

**Three reasons it must not be skipped, in increasing order of force:**

1. **Semantic parity (the user's stated concern).** Without it, failover-injected traffic has
   different chat-history semantics from live traffic: a rate-limited turn logs two rows on one path
   and zero rows on the other. The CRM cannot distinguish them, so the denominator would be
   silently non-uniform — the same class of correlated-incompleteness bias that commissioned this
   whole change (§0).

2. **INJECT is the live path today.** 55/55 sampled `sorento-main` executions dropped at
   `in-failover?`; the paired INJECT executions enqueued. Fixing only `sorento-main` would ship a
   fix to the workflow that is currently **inert** and leave the one actually serving customers
   unfixed. The rev-1 framing of INJECT as "the twin" is exactly backwards right now.

3. **INJECT is the only path where the gate is plausibly reachable at all** — see §5b. >30 messages
   in one second is unreachable for a human on WhatsApp but entirely reachable for a poller
   replaying a backlog.

**And it is the cleaner promote:** INJECT's `versionId == activeVersionId == fa27e066`, i.e. **no
draft divergence** — none of the §7.6 blocker applies. `sorento-main` is the one carrying the
unowned draft delta.

**Sequence: INJECT first, then `sorento-main`.** Cleanest workflow first, live path first, and it
decouples the feature from the draft-blocker resolution — if §7.6 stalls, the fix is already on the
path that matters.

---

## 3. THREADING DESIGN — every hop

`$execution.id` inside a sub is the **sub's** id, not the spine's. So every intermediate sub must
*accept* `turn_id` as a declared input and *forward* it. There is exactly one hop to build.

### Hop 1 — spine → `sub-human-intervention` → sendmsg  (the fix)

Three edits, all additive, all param-only, zero connection changes.

**1a. Spine `9qVyfUxmRQqrpGRMDLRuz` › `Call 'sub-human-intervention'` (`726da5dc`)** — add one
key to `workflowInputs.value`:

```
"turn_id": "={{ $execution.id }}"
```

Identical in form and value to the 8 sendmsg callers, so incoming and outgoing agree by
construction. The node currently maps 8 of the sub's 12 declared inputs; this makes 9 of 13.

**1b. `rrYXzE61gCNUck_zmXe-G` › `When Executed by Another Workflow` (`9c94bf98`)** — append to
`workflowInputs.values`:

```
{"name": "turn_id"}
```

**Untyped**, matching cycle 1's F4 finding (settled at exec `9392400`: an untyped input renders
JSON `null` when unmapped; `type:"any"` was explicitly rejected). Additive — existing callers that
omit it pass `undefined`.

**1c. `rrYXzE61gCNUck_zmXe-G` › all three sendmsg callers** (`a1ea185e`, `c5dd9961`, `0ca5413f`) —
add one key each:

```
"turn_id": "={{ $('When Executed by Another Workflow').first().json.turn_id }}"
```

This is a copy of the pattern all three already use for `test_run_id` / `started_at` / `contact`.

**No change is needed in the sendmsg sub.** Live `aoydkG1dbItXR5jXFEQsP` already declares the
`turn_id` input (C2) and both save blobs already read
`$('When Executed by Another Workflow').first().json.turn_id ?? null` (C3). Hop 1 lights up the
existing plumbing. That is why this change is small despite the diagnosis sounding large.

**Value identity:** the spine's `$execution.id` is the same string written by C1 into the incoming
row. So an escalation turn's incoming and outgoing rows pair on the same `turn_id`. That is §6.

### Hop 2 — HI → redis `sorento-respond-assignee-queue` → schedule worker  (NOT BUILT)

Documented so the next agent does not re-derive it, and knows it was a decision rather than an
oversight. Would require: add `"turn_id": "{{ … }}"` (**quoted** — an unquoted empty render is
exactly the malformed JSON `parse-json`'s `.replace` exists to patch) to the `Redis` push
(`669a96c8`); extend `parse-json` (`8efd0aa6`) to survive it; add the key to caller #12's 2-key
input shape. **Rejected per §2.1.**

### Hop 3 — the rate-limit turn, self-contained inside the ingress workflow  (**NEW, rev 2**)

Full design in **§2.3.4** (`sorento-main`) and **§2.4** (`sorento-main-INJECT`, identical).

Summary: there is no *hop* at all. Because no spine execution exists and the entire turn is handled
inside the ingress workflow, `turn_id` is **minted locally** as that workflow's `$execution.id` and
consumed by two nodes in the same execution — a new incoming-save call and the existing sendmsg
caller. Nothing to forward, nothing to declare on a sub, no sub edits.

### Hops that do not exist

**[REVISED REV 2]** #13 only. `respond-close-convo` is a top-level `conversationClosed` trigger with
no parent execution and no participating customer message — nothing to thread, a classification
outcome rather than a gap (user decision 1 confirms).

#12 is likewise unthreaded (§2.1), but for a different reason: a parent turn *does* exist, and Hop 2
below describes how it could be reached. It is rejected on metric-correctness grounds, not on
impossibility.

**#14 and #15 have moved out of this section** — they are Hop 3.

---

## 4. H4 BUNDLING — recommendation: **BUNDLE, as a separately-labelled hunk**

Reviewer F5/H4: callers passing no `contact` object crash both sendmsg save blobs on
`contact.phone`/`firstName`/`lastName`, so those sends produce **no outgoing row at all**.

**The census enlarges the affected set.** The reviewer knew of #5, #6, #9. The true contactless
set is **#5, #6, #12, #13, #14, #15** — six callers, including the two proactive ones cycle 1
never saw. (#9–#11, the HI callers, *do* pass `contact`, so Hop 1 is unaffected by F5.)

**[REV 2 — the set shrinks to four, and H4 is decoupled from the rest of this change.]** Hop 3
(§2.3.3) makes #14 and #15 pass a real `contact` object sourced from `$('If1')`, so they leave the
contactless set and their rows become **complete**, not merely non-crashing. The remaining
contactless callers are **#5, #6, #12, #13**.

Two consequences:
- **H4 is no longer a prerequisite for anything in this change.** Hop 1 never needed it (#9–#11 pass
  `contact`); Hop 3 no longer needs it. The reviewer can reject H4 and both hops still ship intact.
- **The argument for bundling it weakens slightly but survives.** Point 3 below still holds for #5
  and #6 — real bot replies on the no-access and transcribed-message paths that produce no outgoing
  row at all. Those are ordinary customer-facing replies, not proactive notices, so their absence
  biases the denominator in the same optimistic direction. #12/#13 are proactive and would only gain
  a `turn_id: null` row (and #12 not even that, if H6 is taken — §2.2).

### The case against bundling
A wider diff on a live shared sub is a wider blast radius. H4 also changes *row volume*, not just
row content: rows that today do not exist start existing. That is a data-shape change the CRM
side must be told about before it lands, whereas turn_id threading is purely additive to rows that
already exist. Two different kinds of change in one publish is normally poor discipline.

### The case for bundling — which I find decisive

1. **Same two blobs, same sub, same publish.** H4 is `contact?.phone` — three optional-chains ×
   two blobs in `aoydkG1dbItXR5jXFEQsP`. Optional chaining cannot break a caller that currently
   works: where `contact` exists, behaviour is byte-identical. This is the lowest-risk edit shape
   available.
2. **Each live publish of that sub is an independent draft-revert dice roll** (LESSONS §24 — a
   stale UI draft silently shipping on publish; seen twice this project). Two gated promote cycles
   over the same node in the same week means rolling that die twice for one line of work.
3. **The decisive reason: unbundled, we ship a denominator that looks fixed and isn't.** Hop 1
   makes escalation rows appear. The CRM side will reasonably read that as "the escalation gap is
   closed" and resume trusting p99. But #12/#13/#14/#15 still produce *no outgoing row*, and #5/#6
   still crash. We would have converted a known-incomplete denominator into a
   **believed-complete-but-incomplete** one — the same optimistic-bias failure mode this whole
   change exists to correct, re-introduced by a different route. Fixing half of a
   correctness-of-measurement problem is worse than fixing none, because it removes the caller's
   reason for suspicion.

### Recommendation
Bundle H4 into this change as **hunk H4**, explicitly labelled in the coder's node-diff and
separable: the reviewer must be able to reject H4 and still promote Hop 1. Both live-sub edits go
in one publish of `aoydkG1dbItXR5jXFEQsP`.

Bundling H4 also **retires §OBS-7's "known secondary outcome"** — the case that previously
expected a crash now expects a clean row with `turn_id: null`. Update it (§5 of UAC, `§OBS-14`).

---

## 5. DISCOVERED DEFECT — `respond-send-user` writes unattributable outgoing rows

**Out of scope. Do not fix here. But it is material to the commissioning work and must be raised
with the CRM side now.**

`eG3AA-TWo17-E1-DlHLnH` (`respond-send-user`) calls the save sub directly off a respond.io
`newOutgoingMessage` trigger with `eventSource: ["user","api"]`. Its `data` blob:

```
{contact_id, phone_number, message, sent_at, first_name, last_name}
```

Three problems, in order of severity:

1. **No `type` key.** Every other caller sets `type` explicitly (`"incoming"` on the spine,
   `"outgoing"` in sendmsg). Whatever lands in `chat_histories` comes from the save sub's default,
   not from this caller.
2. **`"api"` is the source respond.io stamps on messages sent through its API — which is how the
   sendmsg sub delivers bot replies.** So bot replies plausibly re-enter and are saved a *second*
   time. The save branch fires unconditionally off the trigger; the `If ($json.source == "User")`
   node gates only the SLA/human-intervened branch, **not** the save.
3. **No `turn_id`.** So any such duplicate row is unattributable.

If (2) holds, the CRM's outgoing row count is inflated with duplicate, type-ambiguous,
turn_id-less rows — which corrupts the same SLA denominator from the opposite direction to the one
we are fixing. **This is a hypothesis from static reading, not a confirmed behaviour.** Confirm
empirically against `chat_histories` (look for two outgoing rows, same text and contact, sent_at
within seconds, one with `turn_id` and one without) before designing anything. It also uses
`$json.message.timestamp` for `sent_at` — a field the cycle-1 recon established respond.io does
not send on the incoming webhook shape; whether it exists on the outgoing shape is unverified.

Raise as a separate gated change. Verification task V-T-h.

---

## 5b. DISCOVERED DEFECT — the rate-limit gate punishes the customer for the injector's burst

**Out of scope. Do not fix here. Raise with the user and the failover owner.**

The gate counts **>30 messages per 1-second TTL window per contact**. Two problems fall out once
§2.4 establishes that INJECT carries production traffic:

1. **The notice text is wrong on both axes.** It reads *"MAXIMUM 10 messages … every minute"*; the
   code enforces 30 per second. Neither number nor window matches. Cosmetic, but it is the message
   a real customer receives.

2. **The material one: the failover injector replays backlogs.** When failover drains a queue of
   missed messages for one contact, a burst >30/s is entirely achievable — that is what a catch-up
   replay *is*. Current behaviour in that case: the excess injected messages are **silently
   discarded** (no `Redis2` push, no spine run) **and the customer receives "you sent too many
   messages"** — which they did not do. The injector did. So a failover recovery can both lose the
   customer's messages and blame them for it.

Hop 3 makes this *visible* (both rows now logged, correctly attributed) but does **not** fix it. The
real fix is either exempting the injected path from the per-contact rate limit, or having the
injector pace itself below the threshold. Verification task **V-T-n** quantifies it; a separate
gated change should follow.

---

## 6. ACCEPTANCE CRITERION

> **An escalation turn produces one incoming row and one outgoing row sharing a single
> non-null `turn_id`, equal to the spine execution id.**

Verification: §8 V-T-a. **[REV 2 adds a second, co-equal criterion:]**

> **A rate-limited turn produces one incoming row and one outgoing row sharing a single non-null
> `turn_id`, equal to the ingress workflow's execution id — on `sorento-main` AND on
> `sorento-main-INJECT`.**

Verification: §8 V-T-j (§OBS-15, §OBS-16).

The two sentences are the same claim about two turn shapes: **every turn the customer experiences
is fully represented in the log, and its two halves are joinable.** Everything else in this document
is scaffolding for that.

---

## 7. BLOCKERS / PREREQUISITES

1. **~~CENSUS HOLE~~ — CLOSED (rev 2). No longer a blocker.** The user enabled `availableInMCP` on
   the nine previously-unreadable workflows (`1ZhTGt0LjWuju3qG` zz-voice, `MSwEWywFpuGXpYBn`
   failover-console, `TI3BRGHNmjUsmWDk` fc-return-all, `UA4f5BIDwd3Yn1qQ` fc-move-all,
   `2uhi93JnXqobM1ae` zz-carve-test, `KOaqIwo2XeMEFtax` fc-golive-live, `KEhshmz7JjuRiSFf`
   fc-contacts, `o4kRCjzqsf0RzrAZ` fc-carve, `DIkiz689-pAnpkauSDoxH` sorento-consume-error-list) and
   they were re-scanned. **None contains any `executeWorkflow` node**, so none can call either sub.
   The census is **exhaustive over 66 of 66** and the counts are final at **15 sendmsg callers / 4
   save-sub callers**. Drop the "57 of 66" caveat wherever it appears. **V-T-g: CLOSED — PASS.**
2. **Test-guard dead-end (unchanged from cycle 1).** In `sub-human-intervention`, `test-guard`
   TRUE → `test-guard-record` → dead end; all three sendmsg calls sit on the FALSE branch. So
   `is_test:true` runs cannot reach callers #9–#11. See §9 for how this is worked around.
3. **Reviewer H2 is now a prerequisite, not a follow-up.** The name-preserving Code-node stand-in
   must be built *before* any `is_test:false` sub-level run in this cycle. Pinning is not adopted.
4. **Reviewer H1 (S7 replacement)** must land in `tests/UAC.md` §0 before the first run — S7 as
   written is unsound (equality on a continuously-drained shared list). Sink-delta + payload
   attribution, with both tightenings.
5. **Spine draft-vs-active must be re-diffed immediately before promote** (LESSONS §24/25). The
   spine is currently clean (`versionId == activeVersionId == 424f56d1`) — cleaner than cycle 1.
6. **`sorento-main` DRAFT DIVERGENCE — the blocker for Hop 3. RESOLVED: option (a). See §7.6.**
7. UAC ↔ replay redis contention (LESSONS §30) — do not run concurrently with a replay.
8. **NEW (rev 2) — no ingress-workflow clone exists.** Hop 3 must be built and UAC'd on clones of
   `sorento-main` and `sorento-main-INJECT`; neither exists today. See §7.7.

---

### 7.6 RESOLUTION — the `sorento-main` draft divergence

**The situation.** Hop 3 is the first change requiring an edit + publish of `sorento-main`, which
this project has deliberately avoided (reviewer P5: *"its `in-failover?` draft divergence stays
harmless only while untouched"*). That divergence is now unavoidable, so it must be resolved rather
than sidestepped. There is no alternative location for the incoming save — the rate-limited branch
exists only inside the ingress workflow.

- draft `versionId` `415ff490-6bed-4a0c-a2ff-bfaa9a7b8c65`
- active `activeVersionId` `952fc09a-3a45-40ef-8479-8e8ecb6abeae`
- **Exactly one node differs**, `in-failover?` (`info-1`), in exactly one leaf:
  `parameters.conditions.options.typeValidation` — active `"loose"`, draft **`"strict"`**.
  Every other node and the entire `connections` object are byte-identical (verified via the
  LESSONS §23 draft-vs-`activeVersion` diff).

**What the gate does.** `in-failover?` decides whether a contact is currently served by the failover
path. `get-set` reads `SELECT … FROM failover_watermark WHERE mode='live'` into `ids`; `restore`
merges it onto each message as `__ids`; then:

```
leftValue : ={{ ($json.__ids||[]).map(v=>String(v)).includes(String($json.contact.id)) }}
operator  : { type: "boolean", operation: "true", singleValue: true }
```

TRUE (in failover) → **output 0, which is empty — the message is dropped** (INJECT handles it).
FALSE → output 1 → the normal ingress chain. **This gate is hot: it is currently routing 100 % of
production traffic down the drop branch** (§REV 2 header).

**What `strict` vs `loose` changes here — the honest analysis.** `Array.prototype.includes()`
returns a primitive `boolean`, always. It cannot return `undefined`, `null`, a string, or a number.
The operator expects a boolean and there is no `rightValue` (`singleValue: true`), so strict
type-validation has nothing to reject. The only non-boolean outcome available is a **thrown
`TypeError`** if `$json.contact` were undefined — and an expression throw is evaluated before
type-validation and is therefore mode-independent. `caseSensitive` is irrelevant for a boolean.

**Conclusion: for every input this node can actually receive, `strict` and `loose` are
behaviourally identical.** So option (b) — accept `strict` knowingly — is *defensible on the
evidence*, and I want to be clear that I could not construct an input that distinguishes them.

**I nonetheless recommend (a): revert the draft to `loose` before publishing.** Three reasons, none
of which is "strict might behave differently on this node":

1. **The blast radius of my being wrong is a total outage, and it is time-delayed onto the recovery
   procedure.** Today the gate answers TRUE for everyone, so a hypothetical strict-mode throw would
   be invisible — the message was being dropped anyway. The moment failover is switched **off**
   (`failover_watermark` emptied), every message must take the FALSE branch. If `strict` did throw,
   *every* message would error out instead, and the bot would be completely dead — discovered
   during the switch back to normal operation, which is precisely when you least want a new
   variable. A static equivalence argument is a fine thing to be 95 % sure of; it is a poor thing to
   bet an undetected full outage on when the alternative costs one operation.
2. **There is zero upside.** Nobody asked for `strict`, no requirement depends on it, and it almost
   certainly is not intentional — the n8n editor rewrites `typeValidation` to `strict` as a
   side-effect when a v2 filter condition is re-saved in a newer editor build. Shipping an unowned,
   unreviewed, unattributed delta is exactly the LESSONS §24 revert-landmine this plan already
   invokes twice against itself. Publishing someone else's stray UI save under cover of our change
   is the failure mode, regardless of whether this particular stray save is benign.
3. **Reverting is cheaper than justifying.** One `setNodeParameter` on the draft:
   `/parameters/conditions/options/typeValidation` → `"loose"`. Draft then equals active for that
   node, and the publish ships exactly our hunk and nothing else. The entire blocker costs one op.

**Recommended procedure — two publishes, deliberately staged:**

- **Step 1 — "clean the draft" publish (zero functional change).** Set `typeValidation` back to
  `"loose"` on the draft's `in-failover?`. Re-run the full draft-vs-`activeVersion` diff and require
  it to report **zero differing node ids** and byte-identical connections. Publish. This publish is
  a **semantic no-op**: `activeVersionId` advances but the running graph is byte-identical to what
  was already running. Confirm production is unchanged — watch a handful of executions and expect
  the same `in-failover?` TRUE drops with paired INJECT enqueues.
- **Step 2 — the feature publish.** Apply §2.3.4's four operations to the now-clean draft. Re-run
  the diff; the expected delta is **exactly** `save-ratelimit-incoming` (new), `0204df88` (two added
  keys) and the two `If`-output-1 / new-node connection edges. **Anything else → HALT.** Publish.

Staging matters: it separates "clean up someone else's draft" from "ship our feature", so if
anything moves in production you know which publish caused it. It converts one frightening publish
into two boring ones, and it means the scary part (touching a hot failover gate) happens in a
change with *no* functional content, where reverting is unambiguous.

**Rejected alternatives, for the record:**
- **(b) accept `strict`.** Sound reasoning, unnecessary risk, no benefit. If the user prefers it, it
  is not unreasonable — but then it must be recorded as a *deliberate, owned* change to the failover
  gate, with V-T-o exercising both branches, not smuggled through as a side-effect of our publish.
- **(c) avoid editing `sorento-main` entirely.** Not available. The rate-limited branch exists only
  there, and `Redis2` (the sole queue push) is on the other branch, so no downstream workflow ever
  learns the message existed. **Partial mitigation worth noting:** INJECT needs no draft cleanup
  (`fa27e066` both), so promoting INJECT first (§2.4) delivers the fix to the path that is actually
  serving customers *without* touching `sorento-main` at all. If the user wants to defer the
  `sorento-main` publish, that is a coherent position — it just leaves the currently-inert path
  unfixed.

**Whichever option is chosen, before any publish of `sorento-main`, re-run the draft-vs-active diff
at the moment of publish** (LESSONS §24 — the check is only valid then, and this document's reading
is already hours stale by the time anyone acts on it).

### 7.7 NEW PREREQUISITE — ingress-workflow clones for Hop 3

Hop 3 cannot be UAC'd on the existing spine clone; it lives upstream of the queue. Two clones are
needed (UI Duplicate — LESSONS §3, `update_workflow` cannot full-replace):

- `sorento-main TEST` ← `NwMOBEQ1NW7LVky5`
- `sorento-main-INJECT TEST` ← `sk0zN90Cas4Y6Y2w`

**Containment required on each before any run** (this is a §0 S3-class obligation — assert from
workflow JSON, not memory):
- `Redis2` **must not** push to the prod list `main-message-list` — repoint to
  `main-message-list-test` or orphan it. This is the highest-risk node in the clone: a stray push
  injects a synthetic message into the real spine.
- `Call 'sorento-sub-respond-sendmsg-respond'` → repoint to an **H2-instrumented** sendmsg fork
  (name-preserving Code-node stand-in, zero credentialed nodes).
- `save-ratelimit-incoming` → repoint to the TEST sink `tWm5DYLxfypmVC1T`.
- `Call 'sorento-sub-respond-findcontact-respond'` (`D62_NHUOrugeULSFwfjEJ`) — a CRM **read**;
  permitted, leave live.
- `get-set` Postgres reads `failover_watermark` — a **read**; permitted. (`sorento-main TEST` only;
  INJECT has no such node.)
- The `Webhook` / `Respond.io Trigger` nodes must be **inactive on the clone** so no real respond.io
  traffic can enter it.

**Forcing the rate-limit branch without a 31-message burst:** use `prepare_test_pin_data` +
`test_workflow` (LESSONS §34) with `Redis1`'s output pinned to `{"437264483": 31}`. `If` is a pure
logic node and executes for real, taking output 1. This is both cheaper and safer than seeding a
live redis counter, and it makes the branch deterministic. `If1` / `consolidate` must be pinned or
fed a real body fixture so the §2.3.4 expressions resolve.

---

## 8. VERIFICATION TASKS (plan §6 style)

- **V-T-a — ACCEPTANCE.** One escalation turn: incoming row `turn_id` === outgoing row `turn_id`,
  both === spine execution id, both non-null. String equality, not "both present".
- **V-T-b — HI forwards, does not mint.** The `turn_id` reaching sendmsg from HI is the **spine's**
  execution id and is **≠ the HI sub's own execution id** and **≠ the sendmsg sub's**. Assert the
  inequalities explicitly — that is §0.3's exact failure mode, one level deeper.
- **V-T-c — all three HI callers.** Static read of `rrYXzE61…` JSON: `a1ea185e`, `c5dd9961`,
  `0ca5413f` each carry the `turn_id` key with the trigger-read expression.
- **V-T-d — no field regressed.** Blob key-set diff before/after: exactly `turn_id` flipping from
  `null` to a value on escalation rows. Every other key byte-identical in shape.
- **V-T-e — proactive callers still null.** **[REVISED REV 2 — #14/#15 removed from this set.]**
  #12 and #13 produce `turn_id: null` (JSON null, **not** `"undefined"`, not `""`).
  `respond-close-convo` and `schedule-working-day-detection` unmodified and unpublished (unless H6
  is taken, in which case #12's caller gains `skip_log` and V-T-p applies instead).
- **V-T-f — H4 (if bundled).** Both blobs use `contact?.` for `phone`/`firstName`/`lastName`; a
  contactless caller produces a **complete row** rather than crashing; a contact-bearing caller's
  row is byte-identical to pre-change.
- **V-T-g — census closed. ✅ CLOSED — PASS (rev 2).** All nine re-scanned; none contains an
  `executeWorkflow` node; zero additional callers. Census exhaustive 66/66. No further action.

**Hop 3 / rev-2 additions:**

- **V-T-j — ACCEPTANCE for the rate-limit turn.** One forced rate-limited turn on each ingress
  clone produces **exactly two rows**: one `type:"incoming"`, one `type:"outgoing"`, sharing a
  single non-null `turn_id` **equal to that ingress workflow's own execution id**. String equality,
  not "both present". Also assert the incoming row's `message` equals the customer's text and its
  `message_id` equals the body's `message.messageId` — i.e. this is genuinely the dropped message,
  not a placeholder.
- **V-T-k — `contact` arrives as an object.** The sendmsg sub receives `contact` as a JSON
  **object**, not a stringified one, despite the caller's `convertFieldsToString: true`. Assert
  `phone_number` / `first_name` / `last_name` in the outgoing blob are **populated**, not `null` and
  not `"[object Object]"`. This is the one place §2.3.3's improvement can silently fail.
- **V-T-l — new latency population declared to CRM.** The rate-limit turns enter the denominator as
  a fast, tightly-clustered population. Confirm the CRM side expects this and that it does not
  distort a p50 they rely on. Documentation task; does not gate promote.
- **V-T-m — attachment-only rate-limited message.** Force the branch with an attachment-only body
  (no `message.message.text`). Expected: the incoming row stores `undefined`/null for `message` but
  the row is still written and still pairs. Confirms the §2.3.4 simplification degrades rather than
  crashes. If it crashes, the C1 fallback chain must be mirrored after all.
- **V-T-n — quantify the injector-burst hazard (§5b).** Determine whether the failover injector has
  ever pushed >30 messages for one contact within one second. Report either way. Does not gate
  promote; feeds a separate change.
- **V-T-o — `in-failover?` both branches (only if option (b) is chosen).** If `strict` is accepted
  rather than reverted, exercise the gate with a contact **in** the failover set and a contact
  **not** in it, and assert correct routing under `strict`. Not required under the recommended
  option (a), since (a) ships no change to that node.
- **V-T-p — H6 (only if taken).** `skip_log` suppresses the row for #12 **and** a multi-part text
  message from any other caller still produces **all** its chunk rows and completes the loop — the
  loop-back control, §2.2.1 step 3. A truncated multi-part message is a hard fail.
- **V-T-q — ingress clone containment.** Before any Hop-3 run: assert from workflow JSON that
  neither ingress clone can push to `main-message-list`, that both sendmsg targets are
  H2-instrumented forks with zero credentialed nodes, and that the save target is `tWm5DYLxfypmVC1T`.
  Any failure → do not run.
- **V-T-h — respond-send-user hypothesis.** Query `chat_histories` for duplicate outgoing rows per
  §5. Report to CRM either way. Does not gate promote.
- **V-T-i — prod ingest untouched.** Per the H1-replacement gate. Non-zero sink delta → **halt**
  pending payload attribution; unretrievable consumer execution → **UNATTRIBUTABLE → FAIL**, never
  inconclusive-pass.

---

## 9. TEST PLAN (clone), honouring cycle-1's constraints

Build targets: HI fork **`vUfFUDjLAuMaeQE6`** (the fork the clone actually calls — CLAUDE.md is
correct on this one), a fresh sendmsg fork rebased on **current live `aoydkG1dbItXR5jXFEQsP`**
(post-C2/C3; do NOT reuse `sub-sendmsg-OBS` — it predates the promote), and clone
`txiPzSxy3Pclsz6v`. Save calls repointed to the TEST sink `tWm5DYLxfypmVC1T`. Never edit the live
spine or any live sub during build.

### 9.1 The three constraints, and how each is handled

- **`test-guard` dead-ends before the sends.** Handled by splitting the proof in two: Hop 1's
  *arrival* at HI is proven guard-**closed** and zero-egress (§T-2); Hop 1's *forwarding* to
  sendmsg is proven guard-**open** at sub level (§T-3). Neither half requires the other's risk.
- **`Send a Message` auto-binds the real respond.io credential in any fork.** **Adopt reviewer H2:
  build a name-preserving Code-node stand-in** — remove the credentialed `Send a Message`, re-add a
  Code node keeping the **exact** name, emitting `{messageId: <synthetic>}`. Then
  `$('Send a Message').item.json.messageId` resolves in the real node context (full fidelity) with
  **no credential anywhere in the graph**. Do the same for `HTTP Request`. Pins are **not** relied
  on. This removes the hazard rather than gating it; per LESSONS §4, remove + re-add preserving the
  name keeps every `$('Send a Message')` reference intact.
- **S7 is unsound.** Replaced by sink-delta + payload attribution (H1) before the first run.

### 9.2 Cases — add to `tests/UAC.md` as `§OBS-8` … `§OBS-17`

Contact `437264483` (Jayson, FULL access) throughout. All clone cases inject
`mock_reformulator_output`; zero parser tokens. **Every case is bound by `tests/UAC.md` §0
S1–S6 + S7(as replaced by H1) + S8**, with the §9.3 amendment.

**§OBS-8 — turn_id reaches sub-human-intervention (PRIMARY, guard-closed, zero-egress)**
- Trigger: escalation-routing text, contact `437264483`, `mode: uac`, `is_test: true`,
  `mock_reformulator_output` = escalation / `suggested_agent` + `suggested_team` set.
- Path: spine → `Call 'sub-human-intervention'` → HI `test-guard` **TRUE** → `test-guard-record`.
- Build-only instrumentation: add `turn_id` to `test-guard-record`'s payload
  (`{{ JSON.stringify($('When Executed by Another Workflow').first().json.turn_id ?? null) }}`),
  **stripped before promote**, marked in the node-diff.
- Assert: the `test:egress:{test_run_id}` record for `guard:"human-intervention-sub"` carries
  `turn_id` === the **spine** execution id (string equality against the run's own id).
- Safety: §0 all. S2 — escalation branch taken, guard closed, no assign/SLA/PIC-comment write.

**§OBS-9 — HI forwards turn_id to sendmsg (PRIMARY, sub-level, guard-open)**
- Mechanism: `test_workflow` on the **HI fork** `vUfFUDjLAuMaeQE6`, `is_test:false`, with all
  three sendmsg callers repointed to the H2-instrumented sendmsg fork. Inputs replicate the spine's
  8 mapped keys **plus** `turn_id: "9999101"`.
- Path: `test-guard` FALSE → `…routed-to-pic2` → sendmsg fork → save call → TEST sink.
- Assert: resolved save blob `turn_id === "9999101"`; **≠ the HI fork's execution id**; **≠ the
  sendmsg fork's execution id** (V-T-b). `type === "outgoing"`.
- Safety: §0 all + S8-as-amended. Zero credentialed node in either fork.

**§OBS-10 — the out-of-hours caller (#10) also threads**
- As §OBS-9 but forced down the `get-working-days` out-of-hours branch, exercising `c5dd9961`.
- Assert `turn_id === "9999102"`. Also note (do not fix) that this caller's
  `result_set` reads `last_result_set`, an **undeclared** trigger input → always `undefined`
  (pre-existing latent bug, backlog).

**§OBS-11 — the working-hours caller (#11) also threads — STATIC COVERAGE ONLY**

> **CORRECTED 2026-07-21 after the cycle-2b UAC (tester finding F1).** The text below originally
> asserted that all three HI sendmsg callers are reachable dynamically. **That is false for `0ca5413f`
> and the case must NOT be attempted dynamically.**
>
> `0ca5413f` has exactly **two** inbound edges, and **both pass through the add-comment sub**. There
> is no third entry point. Reaching it in a live run therefore requires a **real respond.io PIC
> comment**, which is a direct **§0 S2 violation** (staff email/WhatsApp ripple). The obvious escape
> — pinning the add-comment `executeWorkflow` node so it returns a fixture instead of commenting —
> **is not available on this MCP surface**: `executeWorkflow` nodes are unpinnable, confirmed
> empirically via `prepare_test_pin_data` reporting them under `nodesSkipped`.
>
> **Coverage for #11 is therefore STATIC ONLY**, and that is sufficient for this change's claim:
> the hunk is a single added `workflowInputs.value` key, identical in text to the keys added to
> `a1ea185e` and `c5dd9961`, both of which **are** exercised dynamically (§OBS-9, §OBS-10). V-T-c
> already discharges #11 by static read of the fork JSON. Do not spend further effort making #11
> dynamic; there is no safe mechanism.

- Static assertion (the binding one): `rrYXzE61gCNUck_zmXe-G` / fork `vUfFUDjLAuMaeQE6` node
  `0ca5413f` carries `turn_id: ={{ $('When Executed by Another Workflow').first().json.turn_id }}`,
  byte-identical to `a1ea185e` / `c5dd9961`.
- **DO NOT RUN** the dynamic form (working-hours branch, `turn_id === "9999103"`). Retained here
  only to record what was scoped and why it was withdrawn.

**§OBS-12 — end-to-end pairing (ACCEPTANCE, V-T-a)**
- One clone run, guard closed for egress but with the incoming save wired (as cycle 1's §OBS-1):
  assert the **incoming** blob's `turn_id` and §OBS-8's egress-record `turn_id` are the **same
  string**, and both equal the spine execution id.
- This is the case that closes §6. If it passes and §OBS-9 passes, the chain is proven end to end.

**§OBS-13 — proactive callers still emit JSON null (negative)**
- Mechanism: `test_workflow` on the sendmsg fork replicating caller #12's and #13's exact 2-key
  shape (`contact_identifer`, `message` only) — **no `turn_id`, no `contact`, no `is_test`**.
- Assert: blob `turn_id` is **JSON `null`** — not `"undefined"`, not `""`, not absent.
- Also assert statically: `sorento-main`, `sorento-main-INJECT`, `respond-close-convo` and
  `schedule-working-day-detection` are **unmodified** and **unpublished** (versionIds unchanged).

**§OBS-14 — H4: contactless caller produces a complete row (supersedes §OBS-7's crash outcome)**
- **Conditional on H4 being bundled.** Same 2-key shape as §OBS-13.
- Assert: the run does **not** throw; the blob renders with `phone_number`/`first_name`/`last_name`
  as `null` (or the agreed sentinel) and `turn_id: null`; a row is produced where cycle 1 produced
  none.
- Control: re-run §OBS-9's contact-bearing input and assert the blob is **byte-identical in shape**
  to pre-H4 (V-T-f) — optional chaining must be inert where `contact` exists.
- If H4 is **not** bundled, this case is replaced by cycle 1's §OBS-7 expectation (crash is the
  documented current behaviour) and §4's warning stands unresolved.

**§OBS-15 — rate-limit turn logs BOTH rows on one turn_id (ACCEPTANCE for Hop 3, V-T-j)  [NEW REV 2]**
- Target: `sorento-main TEST` clone (§7.7), contained per V-T-q.
- Mechanism: `test_workflow` with `Redis1` output **pinned** to `{"437264483": 31}` so `If` takes
  output **1** (rate-limited). `consolidate` / `If1` fed a real captured body fixture for contact
  `437264483` (shape per §2.3.2, `messageId` a plausible microsecond value). No 31-message burst,
  no live redis counter touched.
- Path: `If`[1] → `save-ratelimit-incoming` → `Call 'sorento-sub-respond-sendmsg-respond'`.
  `Redis2` must **not** execute — assert its absence from `runData`.
- Assert:
  1. Incoming blob at the TEST sink: `type === "incoming"`, `turn_id` === the run's own execution
     id (string equality), `message_id` === the fixture's `message.messageId`, `message` === the
     fixture's text, `sent_at` === `Math.floor(messageId/1000)`, `contact_id`/`phone_number`/
     `first_name`/`last_name` all populated from `If1`.
  2. Outgoing blob: `type === "outgoing"`, `turn_id` === **the same string**, and
     `phone_number`/`first_name`/`last_name` **populated** (V-T-k — proves `contact` arrived as an
     object, not stringified).
  3. `turn_id` is non-null, not `"undefined"`, not `""`.
- Safety: §0 all. S1 — the sendmsg fork is H2-instrumented, zero credentialed nodes, so no message
  can reach `437264483`. **S3 extension — assert `Redis2` cannot reach `main-message-list`.**

**§OBS-16 — INJECT twin behaves identically (V-T-j on the live path)  [NEW REV 2]**
- As §OBS-15 but on `sorento-main-INJECT TEST`, with an **injected-shape** body fixture: empty
  `contact.firstName`/`lastName`/`phone` in the body, `event_id: "failover-live-…"`, synthetic
  `messageId`, `replyTo: null`, no `channel`/`sender` keys (shape captured from exec `9402938`).
- Assert: byte-identical row shape to §OBS-15 — and specifically that `phone_number`/`first_name`/
  `last_name` are **populated from `If1`, not from the empty body contact**. This is the case that
  proves failover-injected traffic gets the same chat-history semantics as live traffic (the whole
  point of user decision 4).
- Also assert `reply_to_message_id === null` renders as JSON `null` from the body's explicit
  `replyTo: null` (the live-webhook fixture in §OBS-15 exercises the *absent*-key path instead, so
  the two cases together cover both).

**§OBS-17 — H6: #12 writes no row at all (CONDITIONAL, only if H6 is taken)  [NEW REV 2]**
- **Do not run unless the user overrides §2.2.4's recommendation.**
- Mechanism: `test_workflow` on the H2-instrumented sendmsg fork with `skip_log: true` plus caller
  #12's 2-key shape.
- Assert: the send path completes and **zero** rows reach the TEST sink.
- **Mandatory control (V-T-p, the real gate):** a **multi-part** text message from a normal caller
  (`skip_log` unset) still produces **one row per chunk** and `Loop Over Items` completes all
  iterations. A truncated multi-part message is a **hard fail** — this is the loop-back trap in
  §2.2.1 step 3, and it is the reason H6 is the riskiest hunk here.
- Assert also: with `skip_log` unset, behaviour is byte-identical to pre-H6 for all 14 other callers.

### 9.3 §0 amendment required for this cycle

- **S3 (extend).** The clone's containment count is unchanged ("5 orphaned + 1 sinked" — the
  UAC.md figure is correct; the build spec's "4 + 1" was the arithmetic error). **Additionally**
  assert that the HI fork `vUfFUDjLAuMaeQE6` and the new sendmsg fork contain **zero credentialed
  send nodes** — the H2 stand-in replaced them. Assert from workflow JSON, not memory.
- **S8 (restate under H2).** S8's pinning requirement is **superseded** for this cycle: no
  `is_test:false` run may execute against a fork that still contains a credentialed
  `Send a Message` or `HTTP Request`. Structural absence replaces runtime pinning. A fork failing
  this check must not be run at all.
- **S7 → H1 replacement** must be in place first (§7.4).

---

## 10. BUILD + PROMOTE ORDER

**[REVISED REV 2 — Hop 3 and the INJECT-first ordering folded in.]**

Build: H2 stand-in forks → HI fork edits (1b + 1c) → clone spine edit (1a) → **ingress clones
(§7.7) + Hop 3 edits on both** → UAC (§OBS-8…§OBS-17) → review → user-gated promote.

Promote (user-gated, after APPROVE) — **subs before callers** (LESSONS §37), and **INJECT before
`sorento-main`** (§2.4):

1. **`rrYXzE61gCNUck_zmXe-G`** — add the untyped `turn_id` trigger input (1b) **and** the three
   caller keys (1c). Publish. Must be first: 1a passes an input the sub does not yet declare.
2. **`aoydkG1dbItXR5jXFEQsP`** — hunk **H4** only (`contact?.` in both blobs), if bundled. Publish.
3. **Re-run the spine draft-vs-active diff immediately before publish** (V-OBS-g / LESSONS §24).
   Expected: identical. **Anything unexpected → HALT and escalate.**
4. **`9qVyfUxmRQqrpGRMDLRuz`** — 1a only. **PARAM-ONLY, zero connection ops. One leaf key via
   `setNodeParameter`. Never copy the clone's `workflowInputs.value`** — the clone's carries
   `is_test: true`, and injecting that into live sends `test-guard` TRUE on production traffic:
   every reply recorded and never sent, a total outage of the reply path (reviewer §5).
5. **`sk0zN90Cas4Y6Y2w` `sorento-main-INJECT` — Hop 3 (§2.3.4 ops 3a–3d).** **Do this BEFORE
   `sorento-main`**: it is the live path (§2.4) and it is the clean workflow
   (`versionId == activeVersionId == fa27e066`, no draft delta — verify this still holds at the
   moment of publish). **NOT param-only** — includes two connection edits (3b, 3c). Publish.
   Post-publish: confirm normal traffic still enqueues (`If`[0] → `Redis2`), which is the only
   regression risk, since the edit touches only the `If`[1] branch.
6. **`NwMOBEQ1NW7LVky5` `sorento-main` — TWO publishes, per §7.6:**
   - **6a. Draft-clean publish (zero functional change):** revert `in-failover?` `typeValidation`
     to `"loose"`; require the draft-vs-`activeVersion` diff to report **zero** differing nodes;
     publish; confirm production routing unchanged.
   - **6b. Feature publish:** apply Hop 3 (3a–3d); re-diff; expected delta is exactly the new node,
     `0204df88`'s two added keys, and the two connection edges. **Anything else → HALT.** Publish.
7. **Do not open or publish `respond-close-convo` or `schedule-working-day-detection`** (unless H6
   is taken, which is not recommended — §2.2.4).
8. Backup prior versionIds first (`sorento-main` draft `415ff490` / active `952fc09a`; INJECT
   `fa27e066`); sha-verify draft pre-publish and active post-publish; auto-revert on mismatch.
9. **Restore the clone** after sign-off (repoint forks back), per V-OBS-i.
10. **Post-promote verification:** one live **escalation** turn — incoming and outgoing rows share
    one non-null `turn_id`. Cycle 1's post-promote check used a happy-path turn, which is precisely
    why this defect escaped. **Verify the escalation path specifically.**
11. **Post-promote for Hop 3.** The rate-limit branch cannot be triggered on demand in production
    without deliberately abusing a real contact, so **do not attempt a live trigger**. Verify
    instead by (a) the clone acceptance §OBS-15/§OBS-16, and (b) a standing `chat_histories` query
    for rows whose `message` equals the rate-limit notice text, asserting each has a paired incoming
    row with the same `turn_id`. Zero matches is the expected and acceptable steady state — the
    branch is rare by design (§2.3.1). **Do not treat "no rows found" as a failed verification.**
