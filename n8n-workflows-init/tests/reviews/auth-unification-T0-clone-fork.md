# REVIEW — auth-unification T0 (clone + fork, 13 nodes)

**Verdict: APPROVE** for T0, with **4 blocking conditions on T1** and **3 blocking conditions on T5**.
Reviewed 2026-07-21. Read-only; no workflow edited, nothing promoted. Promotion remains user-gated.

| artifact | path |
|---|---|
| plan | `n8n-workflows-init/plans/crm-auth-unification-plan.md` |
| coder diff | `n8n-workflows-init/tests/diffs/auth-unification/T0-clone-fork.md` |
| static gate | `n8n-workflows-init/tests/diffs/auth-unification/assert-auth.sh` |
| tester run | `n8n-workflows-init/tests/runs/auth-unification-T0-dynamic-20260721.json` |

T0 is harness-only and promotes to nothing. It is approved as a **recipe**, because that is what it
actually ships into T1–T5.

---

## 0. What I verified myself (not taken on trust)

I deliberately used a **different channel than the coder**. The coder asserted via REST GET; I
asserted via MCP `get_workflow_details` (which omits `credentials` — confirming plan §2 CORRECTION 2
and LESSONS 47 from the other side) diffed against the on-disk REST backup. Two independent readers
agreeing is the point.

**Clone `txiPzSxy3Pclsz6v` @ `8bc5fb5b-87ce-4771-85bf-8bc4c7a6ae3e`, `versionId == activeVersionId`, active.**

- D1/D2/D4 correct on **all 10** nodes. `sendHeaders` still `true` with `parameters: []` (plan §3.2).
- `ideate-turn-http` retains `[{"name":"Content-Type","value":"application/json"}]` — G5b holds; the
  non-`x-api-key` header was not collaterally dropped.
- **Residual hardcoded `x-api-key` anywhere in the clone: NONE.**
- **Stray `parameters.parameters.*`: NONE** — LESSONS 32b footgun did not fire.
- Independent G5/G6 (MCP-after vs REST-before, keyed by node NAME per LESSONS 52):
  135 → 135 nodes, node-set identical, **`connections` identical**, **riders: []**,
  and the set of nodes whose auth keys changed is **exactly the 10 in scope**.
- `onError` / `retryOnFail` preserved per node, including the three
  `continueErrorOutput` and the one `continueRegularOutput` that plan §2 CORRECTION 3 turns on.

**Fork `vUfFUDjLAuMaeQE6` @ `344e1a83-996d-45fb-9e7e-4b3319358811`, `versionId == activeVersionId`.**
D1/D2/D4 correct on all 3 nodes; `headerParameters.parameters` empty on each.

**G3 (credential actually bound) — established independently, and by a stronger argument than the
coder's.** I cannot read the binding over MCP. I do not need to. D4 is statically confirmed (the node
transmits no `x-api-key`), D1/D2 set it to `genericCredentialType`, and n8n refuses to execute a
`genericCredentialType` HTTP node with no credential. Exec `9445692` returned genuine CRM business
payloads on `check-access-http` (`{"allowed":true,"decision":"allow",…}`), `resolve-entity-http`
(a populated `resolutions[]`) and `get-session-vars-http` (a real `session_vars` object). **A node
sending no key and holding no credential cannot produce that.** G3 is therefore proven at runtime for
the 8 clone nodes exercised, independent of any REST read.

## 1. Zero egress — re-confirmed independently

I re-derived the safety-critical case rather than reading the verdict.

**Fork exec `9446104` (the escalation, driven by AUTH-A12).** Received `is_test: true`. Ran exactly
four nodes: `When Executed by Another Workflow` → `chat?` → `test-guard` (output 0 = TRUE) →
`test-guard-record`. **Absent from runData:** `conversation-sla-tracking-create`,
`get-round-robin-assignee`, `get-working-days`, `Assign or unassign a Conversation1`, and both
`sub-add-comment-respond` calls. **Zero assignment, zero SLA write, zero PIC comment.** S2 confirmed.

**Containment (§AUTH-6), re-asserted by me from the post-change graph, not from memory:**

- Orphans with 0 inbound: `send-message-files`, `send-message-images`, `send-message-video`,
  `update-human-intervened`, `save-session-vars` — all five intact.
- All **8** sendmsg callers → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`) with `is_test=true`;
  human-intervention → `vUfFUDjLAuMaeQE6` with `is_test=true`. 9/9 egress-capable callers guarded.
- `Call 'sub-respond-save-message-redis'2` → `tWm5DYLxfypmVC1T`; get-results → `rysSPgUssLDf6xJc`.
- `connections` byte-identical to pre-T0 — the strongest available form of "containment unperturbed."

**S7 — the LLEN-unsoundness check (`[[s7-llen-gate-unsound]]`). The reasoning holds.** The window
11:31:50Z→11:42:05Z is 615 s; at a 5 s poll that is ~124 polls, and 124 are accounted for with no
gap — genuinely *covering*, not sampled. Both signals LESSONS 46 requires are present and
**co-mandatory**: the per-poll `LLEN` depth series (defeats nothing on its own) **and** the per-poll
pop payload (defeats drain-blindness — a write landing and being popped inside one poll would appear
in the pop). Both read empty across all 124. `unretrievable_executions: 0`, so no
UNATTRIBUTABLE→FAIL condition. Consumer execution **count** was correctly not used as evidence. This
is the replaced gate applied properly, not the withdrawn one relabelled.

**S4:** resolved tool `crm_incoming_stock_list` — read allowlist; `crm_it_support_ticket_create`
never appears. **S1/S3/S5:** confirmed above. **S6:** deviations declared, see §5.

**Egress verdict: zero. No respond.io send, no assignment/SLA/PIC write, no prod CRM mutation.**
Every CRM call in the window was a **read**, which the safety rule permits.

---

## 2. Adjudications requested

### (1) The D1–D4 recipe — CORRECT and COMPLETE

Four parts, all four required, verified present on 13/13. The coder's deviation from plan §3.3
(`setNodeParameter` per leaf instead of `updateNodeParameters {replace:true}`) is an **improvement and
I ratify it**: `replace:true` would re-transmit multi-KB `jsonBody` expressions to delete one header —
precisely the hand-retyping hazard LESSONS 25 exists to prevent, and a G5 rider surface for zero
benefit. Leaf writes cannot perturb a fourth key, and my rider check confirms none did.

The gate was **validated against known failures in both directions** — it caught G3=false on both T0
targets and, unprompted, G4=false on the live spine draft's `resolve-entity-clarification`, the exact
double-authed partial that plan §3.1 names as the real failure mode. A gate that has only ever printed
PASS is untested; this one is not. That is the single most reassuring thing in this tranche.

### (2) The overturned lesson — evidence SUFFICIENT, replacement text needs 3 amendments

**I accept the overturn.** `[[n8n-rest-put-strips-credentials]]` is wrong as stated. The evidence is
measurement, not argument, and it has a control:

- REST GET returns populated `{id,name}` for 18/135 clone nodes → **no redaction of bindings**.
  Independently corroborated by me from the other side: MCP omits `credentials` entirely. The two
  channels genuinely differ, which is the whole substance of the original confusion.
- An **idempotent** GET→PUT on the fork preserved all 4 credentials with `nodes`+`connections`
  byte-identical → **PUT does not strip**.
- That same PUT moved `activeVersionId` → **PUT auto-publishes**. Directly observed.
- The 2026-07-20 incident reconciles cleanly: a body assembled from MCP output *would* omit
  credentials, and auto-publish alone explains the rest.

Three amendments before this lands in `docs/LESSONS.md`:

- **(a) Date- and version-bound it.** "Verified 2026-07-21 on this instance." An n8n upgrade could
  reintroduce redaction, and this lesson would then be a loaded gun pointed at the live spine.
- **(b) Add the self-check that makes it fail-safe.** The coder already ran it and it belongs *in the
  lesson*, not only in the diff note: **after every PUT, assert every credential present in the
  pre-PUT GET is still bound** (clone 18/18, fork 4/4). That converts a 2026-07-21 measurement we
  trust forever into a claim re-proven on every use.
- **(c) Record the nuance the incident actually turned on.** An "idempotent" PUT is idempotent
  **against the draft only**; against `active` it is a publish. That is exactly how the fork got
  half-published (§7 below), and it is the sentence a future reader most needs.

Mark the memory `[[n8n-rest-put-strips-credentials]]` **superseded**, do not delete it — the
auto-publish half is real and load-bearing.

The operational rule is right: **never PUT a body you are not willing to publish.** I add one clause:
**never PUT a body not derived from a fresh, faithful GET of that same workflow.** That is the clause
whose absence caused the original incident.

### (3) Zero-egress evidence — re-confirmed independently. See §1.

### (4) The tester's discriminator caveat — ACCEPTABLE for T0; negative control REQUIRED before T5

For the 8 nodes exercised, the discriminator is not even load-bearing. A 401 body cannot contain
`{"allowed":true,"decision":"allow"}` or a populated `resolutions[]`. **Payload shape is the proof**,
and it is positive, direct, and per-node. The tester was right not to manufacture a substitute, and
right to record what they could not obtain (LESSONS 54).

But it becomes load-bearing at T5, where `check-access`, `get-access-types` and `get-presigned-url`
fail into an **unwired** `main[1]` and the execution still reports `success` (plan §2 CORRECTION 3).
There the question "did it authenticate, or did it dead-end silently?" is the entire question.

**RULING: a negative control is REQUIRED before the first production tranche (T1), not merely before
T5.** It is cheap and carries zero blast radius: on the **clone**, bind a deliberately-wrong
credential to one `continueErrorOutput` CRM node, run one case, and confirm the assertion method
reports FAIL rather than PASS. Until an assertion has been shown to fail when it should, it is not an
instrument. This is the same standard the coder already met for the static gate; the dynamic gate
should meet it too.

### (5) The three defects — all three CONFIRMED by me. Rulings differ per defect.

**(a) `ideate-turn-http` — CONFIRMED, plan gap, ticket + T5 watch-list. Not a T0 blocker.**
`ideate-egress-gate` fires TRUE when `test_run_id` is present and `scope != 'chat-ui'` → routes to
`ideate-turn-mock`; FALSE → `ideate-turn-http`. Every harness run carries a `test_run_id`, so this
node is **structurally unreachable from the harness by construction** — no clone run can ever prove
its auth. Plan §5.2's unreachable table omits it; the table is wrong and must be amended. Its T5
counterpart inherits this exactly.

Severity is materially reduced by a fact neither the plan nor the tester surfaced: `ideate-turn-http`
is `onError` **default (`stopWorkflow`)**, so a 401 there is **LOUD** — a visible execution error, not
a silent dead-end. It is a prod POST, but a failing one announces itself. Combined with
`[[ideation-voice-promoted-live]]` (the ideation path is inert until the user lands B1→B2→B3), the
realistic T5 exposure is "first real ideate turn fails visibly and is rolled back in seconds."
**Required:** add it to plan §5.2's unreachable table, and to a named T5 post-promote watch list with
`search_executions(status:["error"])` for the ideation window.

**(b) Committed fixtures — CONFIRMED, and it is WORSE than reported. Highest-priority ticket.**
The tester called this a stale envelope. It is **two independent breakages**, and I reproduced both:

1. **Wrong queue.** All four `tests/cases/*.json` declare `_redis_list: main-message-list-test`.
   The clone's `redis-pop-main-message-list` pops `=test:q:{{ $json.contact }}`. Seeding the
   documented list feeds a queue the clone no longer reads. (Matches `[[replay-harness-stale-broken]]`
   — same root cause, still unfixed, now confirmed to affect UAC fixtures too, not only replay.)
2. **Envelope one level too shallow.** Every consumer dereferences
   `$('tf-message').first().json.message.message.text`. `tf-message` returns
   `$input.first().json.message.message`, and with pop `propertyName: "message"` that is `ITEM.message`.
   So the required fixture path is `item.message.message.message.text` — **four** levels. The fixtures
   carry `item.message.message.text` — **three**. The text never reaches the parser.

And the reason it is silent is the nastiest part: the fixtures also inject `mock_reformulator_output`,
so the parser is bypassed and the run produces a plausible branch **from the mock**, with the fixture's
own message text having gone nowhere. A green run that proves nothing. The fixtures additionally lack
`test_mode` (S5 requires it) and still carry the deprecated `mock_parser_output` (LESSONS 28).

The tester was correct to hand-build items instead. **Ruling: out of scope for T0 — T0 touched no
fixture and the tester used none — but this is a false-confidence generator aimed squarely at whoever
tests T1, and it must be fixed or the four files deleted before T1 starts.** Leaving a fixture that
fails silently in a directory named `tests/cases/` is worse than having no fixtures.

**(c) Plan §AUTH-3 names the wrong mode — CONFIRMED, plan correction.**
`session-get-gate` routes `mode ∈ {regress-capture, regress-replay, chat-stateful}` → **output 0**
(`pg-get-session`, the `n8n_test` Postgres path) and everything else → **output 1**
(`get-session-vars-http`). So §AUTH-3's prescribed `mode=regress-capture` would route **around the
exact node the case exists to verify** — the plan's self-described "highest-value case" is
self-defeating as written. I confirmed the tester's `uac`-mode run took `session-get-gate` output 1
and did reach the node (exec `9445692`). The plan text is wrong, the tester's substitution was right.
This is a reasoning error worth naming: LESSONS 31's "use regress-capture to keep prod session clean"
was applied without checking that the mode still routes through the node under test.

### (6) The T5 amendment — RATIFIED as (b), with a mandatory addition

The coder's option (b) — D1/D2/D4 via MCP `setNodeParameter` into the draft → review → PUT only for
D3+publish — is the right shape and I ratify it over option (a). It preserves plan §4.7's requirement
that the draft be independently derived and reviewed before it ships, and it leaves `draft == active`
afterwards, which option (a)-style thinking does not guarantee.

But (b) as stated has a hole: **the artifact reviewed and the bytes published are not the same
object.** The reviewer signs off on a draft; the PUT then posts a jq-transformed body. Anything the
jq expression does beyond D3 ships unreviewed. Two additions, both mandatory:

- **Review `body.json` itself, not the draft.** Build the PUT body, write it to disk, diff it against
  the reviewed draft (expect: D3 added on exactly N nodes, `del(.settings.binaryMode,
  .settings.timeSavedMode)`, nothing else), and **PUT that file unmodified.** The bytes reviewed are
  then the bytes published.
- **Re-run plan §4.6's draft-vs-active differing-node diff immediately before the PUT**, not only at
  tranche start. The spine draft is a known moving target — the user has hand-edited it mid-audit
  already — and a PUT built from a fresh GET of the draft will happily ship someone else's UI save as
  a rider (LESSONS 24, 51). HALT on any node outside the expected set.

With those two, (b) is safe. Without the first, (b) is option (a) with extra steps.

### (7) The fix-forward disclosure — CORRECT call, nothing needs re-verifying

The probe PUT auto-published the fork's half-converted state (D1+D2+D4, no credential) briefly. I
assess the blast radius as **nil**, for a reason stronger than "the fork is harness-only": the fork's
three CRM nodes sit on `test-guard`'s **FALSE** branch, and the clone's only call site hardcodes
`is_test=true`. During the entire window those nodes were **unreachable**, credential or not. Nothing
invoked them; nothing could have.

Fix-forward was right, and rolling back would have been *worse*: a rollback PUT is itself another
auto-publishing PUT — the same hazard re-run, for no gain. The end state is verified: fork
`draft == active` at `344e1a83`, D1/D2/D4 correct, and the tester subsequently exercised it
post-fix (exec `9446104`). **Nothing requires re-verification.**

The disclosure itself is the right behaviour and I want it on the record as such. The generalisable
lesson — an idempotent PUT is idempotent against the *draft*, never against *active* — is amendment
(c) in §2(2) above.

---

## 3. Scope / tier

Change scope `deterministic`; tester ran deterministic with **two declared deviations**: AUTH-A4
invoked the clarification LLM (intrinsic to that branch — `resolve-entity-clarification` is
unreachable without it), and A1/A8b/A10 invoked real get-results MCP **reads** (the only way to reach
`get-presigned-url` and `family-fetch`). Both are reads with token cost, not egress, and both are
necessary rather than convenient. **Accepted.**

Consequently **plan §6's claim of "0 parser tokens and 0 get-results tokens across the suite" is
false** and should be corrected — the coverage the plan itself demands cannot be obtained without
those reads. Correct the plan text rather than the practice.

**Non-blocking bookkeeping nit for the tester:** `_S7a` reports `total_delta: +12` (consistent with
the per-case series 18→30) but lists **14** save-fork execution ids, two of which precede the A1
baseline. Reconcile the id list to the counted window. Not a safety issue — the sink is unconsumed and
prod delta is 0 on both co-mandatory signals — but S7a's entire value is attribution rigour, and a
list that does not tie out undercuts the thing it exists to prove.

**Secret handling — coder's flagged plan gap, and they are right.** Plan §4.9 mandates a full REST GET
backup and never says where it lands; those files contain the literal CRM key for every unconverted
node. The coder added a directory `.gitignore` covering `*-before.json` / `*-after.json`. I verified
via `git check-ignore` that all four backups are ignored, and that no literal key appears in the
tracked diff note or in `assert-auth.sh`. **Plan §4.9 must be amended to mandate this for T1–T5**, not
left to each coder to notice.

**Minor:** `assert-auth.sh`'s header comment still repeats the now-disproven "PUT writes the redacted
form back, wiping credentials." Harmless (the script never PUTs) but it will re-teach the wrong lesson.
Correct the comment when the LESSONS text lands.

---

## 4. PROMOTE CHECKLIST

**T0 promotes to nothing.** Both targets are harness artifacts, already published, already verified.
There is no live diff to strip and no live workflow to apply it to. The checklist below is the
**authorisation to begin T1**, which is what approving T0 actually grants.

### Before T1 starts — BLOCKING

1. **Land the LESSONS correction** with amendments (a) date/version-bound, (b) mandatory post-PUT
   collateral-credential assertion, (c) idempotent-against-draft-only. Mark
   `[[n8n-rest-put-strips-credentials]]` superseded, not deleted. Correct plan §3.3's ⛔ NEVER
   REST-PUT rule to "never PUT a body you are not willing to publish, and never PUT a body not
   derived from a fresh faithful GET of that workflow."
2. **Negative control for the dynamic gate** (§2(4)). On the clone, one `continueErrorOutput` CRM node,
   deliberately wrong credential, one run; confirm the assertion reports FAIL. Record the result.
3. **Fix or delete `tests/cases/*.json`** (§2(5b)) — wrong queue *and* short envelope, failing
   silently. Do not let a T1 tester find them.
4. **Plan amendments:** add `ideate-turn-http` to the §5.2 unreachable table; correct §AUTH-3's mode
   from `regress-capture` to `uac`; correct §6's 0-token claim; extend §4.9 with the backup
   secret-handling rule.

### For every production tranche T1–T5

5. §4.9 backup captured; **prior `activeVersionId` recorded** — this is the primary rollback and it is
   a single pointer move.
6. PUT body written to disk, diffed against the reviewed state, **reviewed as bytes**, then posted
   unmodified. Never PUT an intermediate state.
7. Post-PUT, in order: `assert-auth.sh` → `RESULT: PASS` **and** `draft == active`; collateral
   credential assertion (every pre-PUT binding still present); `settings`/`pinData`/`staticData`/
   `name`/`active` unchanged; §5.1 G5/G5b/G6; G7 census delta exactly the tranche's node count.
8. §5.2 dynamic proof per CRM endpoint family, asserted on **per-node runData presence, never
   execution status** (plan §2 CORRECTION 3). Unreachable nodes recorded as **unverified**, never
   inferred from a clean static diff (LESSONS 54).
9. §5.3 observational only for egress-adjacent paths. Never provoked.
10. T1b promoted **separately** from T1, own user gate — it is an intended behaviour change and must
    not ride inside T1's zero-functional-delta argument.

### T5 specifically — BLOCKING

11. §4.6 pre-flight at tranche start **and again immediately before the PUT.** HALT if the
    draft-vs-active differing set is not exactly the 10 in-scope nodes, if any delta exceeds D1–D4, or
    if `activeVersionId` moved.
12. **LESSONS 37:** T4's `sub-human-intervention` (`rrYXzE61gCNUck_zmXe-G`) must be **published**
    before T5 — callers resolve only the published version. Apply D1–D4 directly; **never block-copy
    from the fork** (LESSONS 48 — the fork carries `is_test` and harness `workflowId`s that must never
    reach live).
13. Post-promote, verify **on the specific paths changed** (LESSONS 54): a turn reaching
    `check-access`, one reaching `save-session-vars`, one reaching `get-access-types`. Watch
    `ideate-turn-http` by error-search, since it cannot be proven in advance. Rollback trigger:
    `publish_workflow` the recorded prior `activeVersionId`.

**Promotion of any tranche remains user-gated. This review authorises T1 to begin once items 1–4 are
closed; it does not authorise any publish.**

---

## 5. Bottom line

The recipe is **correct, complete, and safe to scale to the remaining 62 nodes** — with the conditions
above. The four-part delta is verified on 13/13 nodes by two independent channels, no rider touched
any workflow, containment is byte-identical, and the tranche produced zero egress under a properly
constructed S7.

Two things earn this approval more than the passing gate does. The static gate was **proven to fail
when it should**, on two real partials including one the coder did not plant. And every gap —
no dynamic proof at the time of writing, the unverifiable `ideate-turn-http`, the backup secret
question, the half-published fork — was **disclosed rather than papered over**. That is the behaviour
that makes a 62-node migration ending on the live spine survivable.

The one thing I will not sign is a dynamic assertion that has never been shown to fail. Condition 2 is
not a formality; on the spine, the failure mode this programme most has to fear reports
`status: success`.
