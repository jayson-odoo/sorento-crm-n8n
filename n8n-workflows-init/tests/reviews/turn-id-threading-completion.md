# Review — turn-id-threading-completion (cycle 2: Hop 1 + Hop 3 + H4)

**Verdict: APPROVE** — Hop 1, Hop 3 (both ingress workflows) and H4 are all correct and
promotable. Zero egress independently re-confirmed. Three **binding documentation corrections**
must land before the first publish (§D); they are not code changes and do not re-open the build.

Reviewed 2026-07-21. Predecessor: `tests/reviews/obs-latency-contract.md` (cycle 1, APPROVE, H1–H5).
Cycle 1 is LIVE: spine `424f56d1`, sendmsg `bdb672e6`, save `fe8c05a1`, consumer `7ee8307f`.

---

## A. Independently verified (fetched from MCP, not taken on trust)

| Claim | Result |
|---|---|
| BLOBTEST `69RhomhiCH4bpY1w` published, draft==active | **Confirmed** — `86cc9542` both; all 11 nodes + connections byte-identical draft vs activeVersion |
| BLOBTEST zero banned node types | **Confirmed** — 0 `respondio`, 0 `httpRequest`, 0 `memoryPostgresChat`. `Send a Message` and `HTTP Request` are `n8n-nodes-base.code`, names preserved |
| BLOBTEST both save calls → TEST sink | **Confirmed** — both `tWm5DYLxfypmVC1T`; string `UrETd-jm46tFj3Xw7w8vL` absent from the workflow |
| **D5 — hand-port fidelity (spot-check demanded)** | **Confirmed byte-for-byte** — see §B. Not assumed |
| H4 six `?? null` sites | **Confirmed** — present in both `data` blobs |
| **G1 mechanism** | **Confirmed** — BLOBTEST `test-guard` TRUE → `test-guard-record`, which has **no outbound connection**. Clones pass `is_test: ={{ true }}`. Blob path provably unreachable. Tester F9 is correct |
| Live sendmsg `aoydkG1dbItXR5jXFEQsP` clean | **Confirmed** — versionId==activeVersionId==`bdb672e6`, no draft divergence |
| Live HI sub `rrYXzE61gCNUck_zmXe-G` clean | **Confirmed** — `d3663e8e` both, 16/16 nodes. Trigger declares **12** inputs, no `turn_id`. All three callers target live sendmsg, none carries `turn_id` |
| Live spine `9qVyfUxmRQqrpGRMDLRuz` clean | **Confirmed** — `424f56d1` both, 101/101, connections identical, zero differing nodes. `726da5dc` has 8 keys, no `turn_id`, **no `is_test`** |
| INJECT `sk0zN90Cas4Y6Y2w` clean | **Confirmed** — `fa27e066` both, 11/11. No `save-ratelimit-incoming` |
| `sorento-main` `NwMOBEQ1NW7LVky5` divergence is exactly one leaf | **Confirmed** — draft `415ff490` vs active `952fc09a`; **only** node `info-1` (`in-failover?`) differs, **only** `typeValidation` (draft `strict` / active `loose`). Connections identical, node-id sets identical 15/15 |
| Ingress clone containment (V-T-q) | **Confirmed on both** — `active:false`, `activeVersionId:null`; `Redis2` zero inbound **and** list `zz-dead-main-message-list-TEST`; sendmsg → `69RhomhiCH4bpY1w`; save → `tWm5DYLxfypmVC1T`; strings `aoydkG1dbItXR5jXFEQsP`, `UrETd-jm46tFj3Xw7w8vL`, `sorento-respond-message` **all absent**; zero `respondio`/`respondioTrigger` nodes; webhook paths retagged `zz-test-*` |
| `in-failover?` on the main clone | **Confirmed `loose`** — mirrors production active, not the strict draft |

**Could not verify:** MCP redacts credentials on every node, so no credential binding is readable
from JSON. The coder's S8 rewrite correctly makes **node type** the binding proxy; that is the right
call and it is what I verified against.

---

## B. D5 — hand-ported BLOBTEST: spot-checked, fidelity CONFIRMED

You asked me not to assume duplication fidelity. I diffed BLOBTEST's two `data` blobs against live
`aoydkG1dbItXR5jXFEQsP` @ `bdb672e6` character by character. **The only differences are the H4 sites.**
Everything else survives the hand-port intact, including the details most likely to drift:

- the two blobs' **differing opening whitespace** — `JSON.stringify(\n  {\n    "contact_id"` on the
  text node vs `JSON.stringify({\n  "contact_id"` on the quick_reply node;
- the `sent_at` ternaries, the backtick template literals, key order, `turn_id ?? null`, and the
  divergent tails (`result` on text; `quick_reply` + `result` on quick_reply);
- `Code in JavaScript`'s `jsCode` byte-identical including trailing whitespace (`const parts = [];   `,
  `},    `) and the `→` in the comment.

**Consequence for the promote — this is the useful part.** Because the blobs are byte-identical to
live modulo H4, BLOBTEST's two blob strings @ `86cc9542` are directly usable as the live blob text.
That is a materially stronger promote source than `sub-sendmsg-OBS` (§F).

**Two BLOBTEST-only deltas that must NOT ride along** if anyone diffs live against BLOBTEST:
1. `test-guard-record.messageData` carries an extra `"turn_id": …` line. Live's does not. Harness
   instrumentation — **do not promote** (cycle 1's P2 already said do not touch `test-guard-record`).
2. `Send a Message` / `HTTP Request` are Code stand-ins. Obviously not promotable.

### The `"options": {}` cosmetic — assessed, inert, not a finding
Present on `test-guard`, `If`, `If1` in BLOBTEST, identically in **both** draft and active, so it
shipped nothing unreviewed. `parameters.options = {}` is the n8n default for IF nodes — live's `If`
and `If1` already carry it; only live's `test-guard` omits it, and an omitted-vs-empty options object
is semantically identical. Zero behavioural surface. **It is, however, direct evidence that
`create_workflow_from_code` introduces serialization drift**, which is why BLOBTEST must be treated
as a source of *two strings*, never of graph shape.

---

## C. Explicit verdicts on the five questions

### C1. G1 disposition — **ACCEPT the tester's recommendation. Direct proof is NOT required.**

I verified the mechanism myself: BLOBTEST's `test-guard-record` is terminal, the clones hardcode
`is_test: ={{ true }}`, so the save-blob path is structurally unreachable from an ingress clone. The
+3/+5 sink reconciliation is right and the tester was right to call its own coder-supplied budget wrong.

I accept it on a stronger ground than "well-mitigated", and the ground matters because it is what
makes this a closed argument rather than a tolerated gap:

> **The save blob is a pure function of the trigger inputs, and I confirmed that by reading it.**
> Every contact and turn_id read in both blobs resolves against
> `$('When Executed by Another Workflow').first().json.*`; the only other reads are
> `$('Send a Message').item.json.messageId` and `$('Loop Over Items').item.json.*`, both internal to
> the sub. **Nothing in either blob can observe which workflow called it.** Caller identity is
> therefore not a variable the missing test would have varied.

So the two halves compose without a gap:
- OBS-15/16 prove the sub **receives** `contact` as a populated JSON object (not stringified, not
  `[object Object]`) and `turn_id` as the correct string — V-T-k, fully proven;
- OBS-9/10 prove that **the same blob, in the same artifact**, renders exactly those inputs into
  populated `phone_number`/`first_name`/`last_name` and the right `turn_id`.

The asymmetry you flagged (OBS-9 proves rendering on the escalation path but not the rate-limit path)
is real as a matter of *which execution produced the evidence*, and immaterial as a matter of *what
the evidence establishes*, because the function is caller-blind. There is no residual behaviour that
a rate-limit-path blob render could exhibit and an escalation-path blob render could not.

I explicitly **reject option (c)** (pass `is_test=false` from the ingress clones). It would trade a
real containment guard for a coverage nicety and leave the clone's safety resting on BLOBTEST's
node-type purity alone. That is a bad trade and I would not approve a build that made it. Option (b)
(a third fork) buys nothing the composition does not already give and adds an artifact to keep
S8-clean. **(a) is correct.**

STEP 7 itself (the STANDIN→BLOBTEST repoint) is inert but harmless — both forks are equally
zero-credential and both terminate at a guard record that pushes to `test:egress:{test_run_id}`.
Leave it in place. **What must change is the diff's prose, not the wiring** — see D1.

### C2. OBS-11 static-only — **ACCEPT. No further coverage needed, by any route.**

The tester's refusal was correct behaviour: both inbound edges to `0ca5413f` pass through the
add-comment sub, `executeWorkflow` nodes are unpinnable on this surface, so dynamic coverage requires
a real respond.io PIC comment — a direct S2 violation with a staff email/WhatsApp ripple. Refusing
and substituting is right; working around it would have been wrong.

But I want to put this more strongly than "acceptable substitute", because I do not think static
coverage is the weaker evidence here. I verified live's three callers: same node type, same target
`aoydkG1dbItXR5jXFEQsP`, same trigger source, and the added key is one byte-identical expression
string. **That expression reads the trigger node, not any node on the inbound path.** The trigger
executes exactly once per sub-execution, so `$('When Executed by Another Workflow').first().json.turn_id`
resolves identically at `0ca5413f` as at `a1ea185e` and `c5dd9961` — regardless of which route
reached it. The inbound edges, which are the *only* thing distinguishing #11 from the two proven
dynamically, are precisely the thing the expression cannot observe.

The residual risk is therefore not "does it work on that path" but "was the key typed correctly",
and that is fully discharged by byte-comparison. V-T-c did it on the fork; the promote checklist
(P2) re-asserts it on live after the edit. **No other coverage route is needed and none should be
attempted.**

### C3. Tester's self-correction (F10) — **ACCEPT the retraction and the replacement. And YES, UAC.md S7b must be rewritten before sign-off — I am making it binding.**

The retraction is correct and the tester deserves credit for volunteering it against its own prior
cycle. Counting consumer executions is not weak evidence, it is **zero** evidence: the consumer emits
one execution per 5s poll unconditionally (~140 in an 11-minute window), so the count is a function
of elapsed time and nothing else. Its mutual information with "did a prod write occur" is nil. That
is the *same* defect class cycle 1 rejected in the original S7 — a gate that can report PASS while a
prod write occurred — reintroduced by a different route, and it had been recorded as a passing gate.

The replacement is sound and is a genuine instrument upgrade: the consumer's first node runs
`LLEN sorento-respond-message` every 5s and retains it in execution data, giving a 5-second-resolution
depth series that survives drain. A write at T is visible in the poll at ≤T+5s. That closes F7's
drain-blindness properly rather than papering over it.

**One tightening the rewrite must carry.** LLEN alone still has a hole: a write that lands *and* is
popped inside a single poll's own execution shows LLEN 0 at the top of that poll. The signal that
closes it is the **pop payload** — the `Redis` node emits `{"":null}` on an empty pop. The tester did
check pops (all three empty, execs `9426327` / `9426543` / `9426744`), so this cycle is sound. But
S7b must state that **both** signals are mandatory, not LLEN with the pop as corroboration.

**Why this is binding rather than a follow-up:** I checked, and `tests/UAC.md` lines 77–80 still
carry the retracted method — and rank it **first**, with line 80 reading *"the count is
authoritative, the LLEN is corroborating only."* The unsound instrument is currently the
highest-ranked one in the safety gate. Left as-is, the next cycle uses a clock as a leak detector and
scores a leak green. That is a defect in the gate itself, so it is cheap to fix and expensive to skip.

### C4. Promote diff purity — see §E. Every clone guard you listed must be stripped; the cycle-1 hazard is carried forward and has a **second, worse sibling** this cycle (§E0).

### C5. The staged `sorento-main` publish — **ENDORSE as written, with two additions.**

Plan §7.6's two-publish sequence is right, and right for the reason it gives: it separates "clean up
someone else's draft" from "ship our feature", so if production moves you know which publish did it.
I verified the divergence is exactly what the plan says — one node, one leaf, `strict` vs `loose`,
connections and node-id sets identical. I also agree with the plan's own honest framing: I cannot
construct an input where `strict` and `loose` differ on this node (`Array.includes()` returns a
primitive boolean; an expression throw is evaluated before type-validation and is mode-independent).
Option (a) is nonetheless correct, because the cost is one operation and the downside of being wrong
is a total outage discovered *during failover recovery* — the worst possible moment.

**Addition 1 — INJECT must promote first, and the plan is right that this is not a preference.**
55/55 sampled `sorento-main` executions drop at `in-failover?`; INJECT carries 100% of ingress.
Promoting only `sorento-main` would ship the fix to the inert workflow. INJECT is also the clean
target (`fa27e066` both, verified today). Sequence: INJECT → `sorento-main` 6a → `sorento-main` 6b.

**Addition 2 — a verification honesty point the plan does not make.** After 6a and 6b you **cannot**
verify `sorento-main` positively, because no traffic reaches its gate. The only available check is
negative: `in-failover?` still routes TRUE-drop and INJECT still enqueues, i.e. *nothing broke*. Do
not let a clean post-publish watch on `sorento-main` be recorded as "Hop 3 verified" — it is not, and
cannot be. Hop 3 on `sorento-main` is verified by the clone acceptance (§OBS-15) plus the standing
query, nothing more. Say so in the run log.

---

## D. Required documentation corrections (binding — before the first publish)

Not code. Each is a case of the record asserting something stronger than the evidence, which is the
failure mode that lets the *next* cycle's gap through.

- **D1.** `tests/diffs/turn-id-threading-completion.md` **STEP 7** claims G1 is closed and predicts a
  +2/case sink delta. Both are false (tester F9, mechanism verified by me). Rewrite STEP 7 to state
  that the repoint is **inert under `is_test:true`**, that G1 is **accepted as documented
  indirection** on the §C1 reasoning, and correct the S7a expected count to **+1 per Hop-3 case**.
  A promote record carrying a false coverage claim trains the next reviewer to discount the record.
- **D2.** `tests/UAC.md` **§0 S7b** (lines 77–80): delete the consumer-execution-count method
  entirely — do not demote it, delete it — and install the per-poll `Redis1` LLEN series **plus the
  pop payload** as the required drain-independent instrument, both mandatory (§C3).
- **D3.** `tests/UAC.md` **§OBS-11**: mark **DO NOT RUN dynamically**, with the S2 reason and the
  static-sufficiency argument. Diff STEP 8(a) corrected the plan; UAC.md is the document a tester
  actually reads at run time.

---

## E. PROMOTE CHECKLIST (user-gated — I authorize, I do not promote)

### E0. THE TWO PURITY HAZARDS — read before touching anything

**Hazard 1 (carried forward from cycle 1, still live).** Every clone/fork sendmsg-caller
`workflowInputs.value` carries `is_test: true` (+ `test_run_id`). Block-copying that object to live
sends `test-guard` TRUE on production traffic: every reply recorded, never sent — **total outage of
the reply path**.

**Hazard 2 (NEW this cycle, and worse).** The HI fork `vUfFUDjLAuMaeQE6`'s three sendmsg callers have
had their **`workflowId` repointed to `69RhomhiCH4bpY1w` (BLOBTEST)** — a harness stand-in with no
respond.io node in it. Copying those nodes' parameters to live would repoint **every escalation reply
on production** at a Code-node stub. Failure mode: silent, total, and *specific to escalations* —
i.e. it would be invisible to exactly the happy-path post-promote check that let this cycle's defect
through in the first place. Live must keep `aoydkG1dbItXR5jXFEQsP`.

> **Binding rule for every step below: one leaf key per node via `setNodeParameter`, relative pointer
> (`/workflowInputs/value/turn_id`, never `/parameters/...` — LESSONS 32b). Never a block copy, never
> `updateNodeParameters` deep-merge, never touch `workflowId` on any live node.**

**P0. Backup.** Record prior versionIds before any write: HI `d3663e8e-5cb9-4f65-9473-a7650cae0b63`;
sendmsg `bdb672e6-3c56-4ca1-b416-f7479301c3a1`; spine `424f56d1-df03-4274-8f97-f45bb5c0a24f`;
INJECT `fa27e066-0100-4d7f-9b94-e0dd15fcb3a5`; `sorento-main` draft `415ff490-6bed-4a0c-a2ff-bfaa9a7b8c65`
/ active `952fc09a-3a45-40ef-8479-8e8ecb6abeae`. Capture the changed node bodies (LESSONS §25).
sha-verify draft pre-publish and active post-publish; auto-revert on mismatch.

**P0b.** Land D1/D2/D3 (§D).

**P1 — HI sub `rrYXzE61gCNUck_zmXe-G`. Subs before callers (LESSONS §37) — must be first**, because
P3 passes an input the sub does not yet declare.
- Trigger `9c94bf98`: append a **13th** entry `{"name": "turn_id"}`, **untyped** (F4 settled this at
  exec `9392400` — do not "improve" to `type:"any"`). Live currently declares 12; verified today.
- `a1ea185e`, `c5dd9961`, `0ca5413f`: add **one key each**,
  `turn_id: ={{ $('When Executed by Another Workflow').first().json.turn_id }}`.
- **STRIP:** do **not** touch `workflowId` on any of the three (Hazard 2). Live stays
  `aoydkG1dbItXR5jXFEQsP` on all three — assert this after the edit.
- **STRIP:** the fork's `test-guard` / `test-guard-record` nodes and the build-only `turn_id` line in
  `test-guard-record.messageData` are harness-only. Live has 16 nodes, the fork 18 — **the node count
  must remain 16.**
- Post-edit assertion: all three added keys byte-identical to each other (discharges #11, §C2).
- Draft-vs-active diff → publish.

**P2 — sendmsg sub `aoydkG1dbItXR5jXFEQsP` — hunk H4 only.** Reviewer-separable; approved.
**8 sites**, and the count matters — the diff's STEP 6 line *"Six sites is the correct count, not
eight"* is true only of the `?? null` addition and **will mis-scope the promote if read alone.** The
top-level `phone_number` keys are evaluated too and throw first, so guarding only the blobs does not
prevent the crash H4 exists to fix. Both nodes (`fc0b22ca` text, `c2985929` quick_reply):
- `/workflowInputs/value/phone_number`: `contact.phone` → `contact?.phone` — **`?.` only, no `?? null`**
  (plain expression, not a `JSON.stringify` argument) — 2 sites;
- inside `/workflowInputs/value/data`: `contact.phone` → `contact?.phone ?? null`,
  `contact.firstName` → `contact?.firstName ?? null`, `contact.lastName` → `contact?.lastName ?? null`
  — 6 sites.
- **Source of record = BLOBTEST `69RhomhiCH4bpY1w` @ `86cc9542`, the two `data` blobs**, which I
  byte-verified against live (§B). **Not** `sub-sendmsg-OBS` (§F). Every other character of both
  blobs byte-identical — no whitespace normalisation, no key reordering.
- **Do not touch** `workflowId`, `test-guard`, or `test-guard-record` on live.
- Tell the CRM side **before** publishing: H4 changes **row volume**, not row content — outgoing rows
  begin existing for callers #5/#6/#12/#13 that today produce none, with three explicit-null columns.

**P3 — RE-RUN THE SPINE DRAFT-VS-ACTIVE DIFF IMMEDIATELY BEFORE PUBLISH** (LESSONS §24). Expected:
101/101 node ids, connections byte-identical, **zero** differing nodes (spine is clean today at
`424f56d1` — cleaner than cycle 1). **Anything else → HALT and escalate.** Not substitutable by this
review; the check is only valid at the moment of publish.

**P4 — Spine `9qVyfUxmRQqrpGRMDLRuz` — Hop 1a.** Node `726da5dc` (`Call 'sub-human-intervention'`):
add **one** key `turn_id: ={{ $execution.id }}`. Live has 8 keys and **no `is_test`** (verified) →
becomes 9. **PARAM-ONLY, zero connection ops.** The clone's node `133fcc06` carries `is_test: true`
(Hazard 1) — one leaf via `setNodeParameter`, never the object. Do not carry `position` or `schema`.

**P5 — `sk0zN90Cas4Y6Y2w` `sorento-main-INJECT` — Hop 3. BEFORE `sorento-main`** (it is the live path
and the clean workflow). Re-verify `versionId == activeVersionId == fa27e066` at the moment of
publish. **NOT param-only** — includes connection ops.
- **3a. ADD** `save-ratelimit-incoming` (`executeWorkflow` v1.3), params exactly as the clone —
  **except `workflowId.value` = `UrETd-jm46tFj3Xw7w8vL` (LIVE save sub), NOT `tWm5DYLxfypmVC1T`.**
  This is the single highest-value substitution in the whole promote; a missed one writes production
  chat history into the TEST sink. Let n8n mint the node id — do not force the clone's synthetic
  `a5100001-…`.
- **3b/3c. REWIRE:** `If`[1] → `save-ratelimit-incoming` → `Call 'sorento-sub-respond-sendmsg-respond'`.
  **`If`[0] → `Redis2` MUST SURVIVE.** Target shape: `If.main = [[{Redis2}], [{save-ratelimit-incoming}]]`.
  The clone's shape is `[null, [save-ratelimit-incoming]]` because `Redis2` was deliberately orphaned
  for containment — **do not replicate the `null`.** See §G: this edge has zero clone coverage and
  breaking it kills 100% of ingress.
- **3d. EDIT** `0204df88`: add exactly **two** keys — `turn_id: ={{ $execution.id }}` and
  `contact: ={{ $('If1').first().json }}`. Live has 2 keys → becomes 4.
  **STRIP: `is_test` and `test_run_id` must NOT be added** (Hazard 1 — the clone has 6 keys, live gets 4).
  **Do not touch `workflowId`** — stays `aoydkG1dbItXR5jXFEQsP`.
- **STRIP, all clone-only:** `Redis1.key` stays `="{{ $('If1').first().json.id }}"` (**not** the
  `test:rl:` namespace); `Redis2.list` stays `main-message-list` (**not**
  `zz-dead-main-message-list-TEST`); webhook path stays `a41d0d4e-91b1-4fae-9360-f91517d95bf1`
  (**not** `zz-test-inject-…`); do not carry the clone's 10-entry schema array.
- Pre-publish diff → expected delta is **exactly** the new node, `0204df88`'s two added keys, and the
  two new edges, with `If`[0]→`Redis2` intact. **Anything else → HALT.** Publish.
- **Immediately post-publish:** confirm normal traffic still enqueues (`If`[0] → `Redis2`). This is
  the only regression risk and it has no clone coverage (§G).

**P6 — `NwMOBEQ1NW7LVky5` `sorento-main` — TWO publishes (plan §7.6, endorsed).**
- **6a. Draft-clean publish, zero functional change.** `setNodeParameter` on `info-1`
  `/conditions/options/typeValidation` → `"loose"`. Re-run the full diff and require **zero**
  differing node ids and byte-identical connections. Publish. `activeVersionId` advances; the running
  graph is byte-identical. Confirm production unchanged: same `in-failover?` TRUE drops with paired
  INJECT enqueues.
  - **`in-failover?` `loose` is NOT a change to promote.** Production's active version is already
    `loose` (verified). 6a reverts an unowned draft delta so it matches active. The main clone was
    set to `loose` to mirror **production**, not the draft — that was correct, and it is the reason
    Hop 3 was UAC'd against the graph that actually serves requests.
- **6b. Feature publish.** Apply P5's 3a–3d identically (same substitutions, same strips; webhook path
  stays `fdd4fe8a-e8eb-4a30-a394-d07d1c1bf6e8`). **Additionally STRIP:** the main clone **deleted**
  `Respond.io Trigger` (`5c307885`) — that node **must remain on live**; node count stays 15 (+1 new = 16).
  Re-diff; expected delta exactly the new node, two added keys, two edges. **Anything else → HALT.**

**P7 — Fresh draft-vs-active diff immediately before EACH of the five publishes** (P1, P2, P4, P5,
P6a, P6b). Not once for the cycle — the check is only valid at the moment of publish, and a UI save
between publishes is exactly the LESSONS §24 revert-landmine this project has hit twice.

**P8 — Do not open or publish** `respond-close-convo` (`-WkzJMQZHmsFQm6A2abLJ`) or
`schedule-working-day-detection` (`ss9S83XF7ZtmnaUyFtYZc`). H6 is not built and is not recommended.

**P9 — Sendmsg-fork disposition (four forks).**
| fork | id | disposition |
|---|---|---|
| `sub-sendmsg-OBS` | `sJI3DbsLCG01JfRs` | **ARCHIVE** — see §F. Do **not** publish. Re-assert zero inbound references first |
| `zz-sub-sendmsg-BLOBTEST` | `69RhomhiCH4bpY1w` | **RETAIN** — the validated H4 source of record and the only S8-clean blob-bearing fork. Keep published; do not repoint |
| `zz-sub-sendmsg-STANDIN` | `lJ4IZEGwoTh6aay4` | **RETAIN** — cheap, S8-clean, no-blob stand-in. Now unreferenced; harmless |
| `sub-sendmsg-CHAT` | `ublq9nSlrpz63xan` | **RECONCILE (separate item, tracked)** — stale vs live: pre-C3, emits no `turn_id` (tester F3). Not this change's defect. **Do not touch during this promote** |

**P10 — Restore the clones after sign-off.** Repoint the spine clone's 8 sendmsg callers back to
`ublq9nSlrpz63xan` or the chat console stays broken (cycle-1 P7, still outstanding). Repoint the HI
fork's three callers off BLOBTEST when the harness campaign closes.

**P11 — POST-PROMOTE VERIFICATION — on an ESCALATION turn and a RATE-LIMITED turn specifically.**
Cycle 1 verified on a happy-path turn, which is exactly why this gap survived. A happy-path check is
**not** acceptable evidence for this cycle and must not be recorded as such.
- **(a) ESCALATION — the binding one.** One live escalation turn (contact `437264483` is the user's
  own WhatsApp — legitimate). Assert the incoming row and the outgoing PIC-routing row share **one
  non-null `turn_id`, equal to the spine execution id, by string equality.** This is also the only
  check that would catch Hazard 2, so do not skip it if P1 looked clean.
- **(b) RATE-LIMITED — do NOT trigger live.** The branch cannot be reached without deliberately
  abusing a real contact. Verify by (i) the clone acceptance §OBS-15/§OBS-16 (already passed), and
  (ii) a standing `chat_histories` query for rows whose `message` equals the rate-limit notice text,
  asserting each has a paired incoming row with the same `turn_id`. **Zero matches is the expected
  and acceptable steady state — do not score "no rows found" as a failed verification.**
- **(c) INGRESS INTACT (highest urgency, §G).** Immediately after P5 and after P6b: confirm normal
  non-rate-limited traffic still enqueues via `If`[0] → `Redis2`. Watch executions, do not infer.
- **(d)** Do not record the `sorento-main` post-publish watch as "Hop 3 verified" (§C5 addition 2).

**P12 — Tell the CRM side** (V-T-l, V-T-h): a new fast-latency population (rate-limit turns) enters
the SLA denominator; H4 adds outgoing rows that did not previously exist; and the `respond-send-user`
duplicate-row hypothesis (plan §5) remains unconfirmed and out of scope.

---

## F. `sub-sendmsg-OBS` `sJI3DbsLCG01JfRs` — **ARCHIVE. And demote it from "source of record" first.**

You asked whether it should be archived as the last artifact holding a live credential. **Yes — and
the stronger point is that it should not be the H4 promote source either.**

- It is **draft-only, unpublished, and referenced by nothing** — so it is inert today.
- It holds a real `respondio` `Send a Message` + a real `httpRequest` with an auto-bound `sorento-api`
  credential, and it fails S8 (three banned node types). It is one accidental `workflowId` repoint
  away from being a live-egress path in a future cycle. That is a standing hazard with **zero
  remaining utility**, which is the exact profile for archival.
- The diff calls it "the promote source-of-record for the H4 hunk text." **It should not be.** The
  tester correctly never fetched or ran it, so its post-STEP-6 state is **asserted but unverified**.
  The verified artifact is BLOBTEST, which I byte-compared against live (§B). P2 sources H4 from
  BLOBTEST accordingly.
- **Do NOT publish it.** Publishing would make a credentialed, unreviewed, S8-failing workflow
  resolvable by any caller. Leaving it unpublished is the safer state; archiving is safer still.
- Archive is a write → user-gated like everything else. Re-assert zero inbound references at archive
  time, and do it **after** P2 is verified so nothing is lost.

---

## G. Finding R1 (NEW, mine) — the one Hop-3 regression risk has ZERO clone coverage

Both ingress clones have `If.main[0] = null`: `Redis2` was orphaned for containment, so the clones
**never execute the normal, non-rate-limited path**. That is correct containment — you cannot test
the prod-queue push without pushing to the prod queue — but it has a consequence nobody has stated:

> **The only way Hop 3 can break production is by disturbing `If`[0] → `Redis2`, and that is exactly
> the edge the clone evidence is silent on.** Every OBS-15/16 assertion is about `If`[1].

Blast radius if broken: no message is enqueued, no spine execution is created, **100% of ingress is
lost silently** — and on INJECT, which carries all live traffic. This is not hypothetical fragility;
Hop 3 is a connection-editing change on that exact IF node.

Mitigations, both already in the checklist and both mandatory:
1. **Pre-publish (P5/P6b):** the expected-delta assertion must explicitly include *"`If.main[0]`
   unchanged, still `[{Redis2}]`"*. Do not accept the clone's `null` shape.
2. **Post-publish (P11c):** watch real executions taking `If`[0] → `Redis2` before declaring success.
   Infer nothing.

---

## H. Findings carried, not blocking

- **F3 — `sub-sendmsg-CHAT` `ublq9nSlrpz63xan` stale vs live** (pre-C3, emits no `turn_id`). Visible
  in OBS-12's egress log. Harness fidelity issue, not a defect in the code under test. Tracked; do
  not touch during this promote.
- **F5 / OBS-14 residual — `result` key dropped on contactless rows** by the same
  `JSON.stringify`-drops-`undefined` mechanism H4 just fixed for the contact fields. Correctly out of
  H4's scope and correctly not a re-open. **My call: leave it.** Normalising `result` is a row-shape
  change to a key the CRM has never received as null, so it needs CRM agreement first — it belongs
  with F5 as its own gated item, not smuggled into this promote.
- **F4 — escalation sendmsg `message: null`** on the spine's own record (the customer-facing text is
  sent by the HI sub). Pre-existing, unrelated. Backlog.
- **F7/F10 — prod sink drains in <60s.** Now well-mitigated by the LLEN series; D2 makes it binding.
- **§5 `respond-send-user` duplicate-row hypothesis** and **§5b injector-burst rate-limit hazard** —
  both correctly out of scope, both material, both need their own gated change. Raise with the user
  and the failover owner (V-T-h, V-T-n).

---

## I. Zero-egress re-confirmation (§0 S1–S8, both run files)

**Re-confirmed. No egress occurred in either cycle.**

- **S1** — every sendmsg path terminated at a zero-credential stand-in or a `would_send` guard record.
  I verified structurally: BLOBTEST and STANDIN contain **no node type capable of egress**; both
  ingress clones contain zero `respondio` nodes and their sendmsg callers reference only
  `69RhomhiCH4bpY1w`. No respond.io 2xx send anywhere.
- **S2** — zero assignment/SLA/PIC-comment writes. `Assign or unassign a Conversation1`,
  `conversation-sla-tracking-create`, **both** add-comment subs and the assignee-queue push were
  ABSENT from `runData` in every run. On OBS-9/10 this required a deliberate routing control
  (`get-round-robin-assignee` pinned to force the A_NW route, the only path to a sendmsg caller that
  does not traverse an add-comment sub) — correctly constructed and verified from `runData`.
  OBS-11 was refused rather than worked around. **This is the gate that mattered most this cycle and
  it held.**
- **S3** — zero CRM/contact writes. `save-session-vars` recorded `would_write` only. Both ingress
  clones' `Redis2` orphaned **and** list-repointed; I confirmed both, plus that the literal
  `main-message-list` appears nowhere except as a substring of `zz-dead-main-message-list-TEST`.
  `main-message-list` held **0 at every sample** across both cycles.
- **S4** — `get-results` never reached in any case; the READ allowlist question does not arise.
  `crm_it_support_ticket_create` never invoked.
- **S5** — `is_test`/`test_mode` true observed in sub inputs on clone-driven runs. The three sub-level
  runs are deliberate guard-open runs governed by S8 instead — correctly scoped.
- **S6** — **zero LLM nodes executed, 0 tokens, both cycles.** Scope `deterministic` honoured.
- **S7a** — cycle 2: TEST sink +6, exactly the 6 expected saves. Cycle 2c: +3, and the tester
  correctly identified +3 as right and the coder's +5 budget as wrong (F9). Every new payload carried
  the cycle's own `turn_id`.
- **S7b** — cycle 2: one transient prod delta +2. **The binding halt was honoured**, both consumer
  executions retrieved and read in full, both attributed to an unrelated real customer (contact
  `423729094`, no `test_run_id`, `message_id` absent from every fixture, `turn_id 9423087` a live
  spine execution). Nothing UNATTRIBUTABLE; the FAIL clause was not reached. Cycle 2c: prod delta 0,
  established with the drain-independent instrument; all three covering polls clean with empty pops.
  **Attribution was decisive, not merely plausible** — it failed both discriminators independently.
- **S8** — BLOBTEST and STANDIN structurally free of all three banned node types, asserted from
  re-fetched JSON before running. I re-verified BLOBTEST myself. `sub-sendmsg-OBS` never executed,
  never pointed at, never fetched — **DO-NOT-RUN honoured.**

**Additional confirmations:** no live workflow was edited or published in cycles 2/2b/2c (I verified
current versionIds match the pre-cycle values on all five live targets). Both ingress clones remain
`active:false` / `activeVersionId:null` with `updatedAt` unchanged across the tester's window,
proving the tester edited neither. `execute_workflow` was never used on an ingress clone — both Hop-3
cases used `test_workflow` with `Redis1` pinned. No permission denial was encountered or worked around.

**Scope/tier:** declared `deterministic`; honoured exactly — `mock_reformulator_output` on the clone
case, zero LLM execution, zero parser tokens. Matches what was tested.
