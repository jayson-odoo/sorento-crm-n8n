# Review — `spec-search-shapeA-wiring`

Reviewer: `sorento-reviewer` · 2026-08-12
Change: one leaf — `resolve-entity` `jsonBody` gains `spec_fallback` / `free_terms` / `understand_phrase`
Build: TEST clone `txiPzSxy3Pclsz6v` @ `be62b3a8` · Promote target: LIVE spine `9qVyfUxmRQqrpGRMDLRuz` @ `469e7259`
Inputs: `plans/spec-search-shapeA-wiring-plan.md`, `tests/uac/SA.md`, `tests/diffs/spec-search-shapeA-wiring.md`,
`tests/manifests/spec-shapeA/README.md`, `tests/offline/spec-shapeA/*`, `tests/runs/spec-search-shapeA-*`

---

## VERDICT (rev 2, 2026-08-12): **APPROVE** — §C and §D closed. See §E for the settlement.

Rev 1 was REQUEST-CHANGES; it is retained below unedited so the reasoning that produced the fix
survives. **§D was closed better than I asked for** — not by the constructed multi-token case I
requested, but by a structural impossibility argument in the CRM source, corroborated on both arms.
Do not read rev 1's §D as an outstanding concern.

---

## ~~VERDICT (rev 1): REQUEST-CHANGES~~ — superseded by §E

Zero egress is **re-confirmed and clean** (§A). The diff, byte-gates, param sweep, transport note and
rollback are the best-disciplined artifacts this repo has produced — nothing in the build mechanics is
wrong (§B). The block is not a safety failure and not a build defect.

**The block is that the plan's central safety claim is stale, and the arm that made it stale is untested
at every level.** The CRM gate this change depends on was widened on 2026-08-11 — mid-cycle, by the very
fix (`ae3393810`, PR #124) the SA.md banner credits — from

```python
if payload.spec_fallback and _result_has_zero_matches(result):
```

to (verified on `origin/main`, `references.py:1823`)

```python
if payload.spec_fallback and (
    _result_has_zero_matches(result) or _product_words_unanswered(result)
):
```

Plan §0 and §2, and node-diff §1, all still state the property as *"the fallback **only** fires when the
normal probes return zero matches … so every currently-resolving request gets a byte-identical response.
The n8n change is inert for all existing traffic."* That sentence is now **false**, and it is the sentence
the whole promote rests on. Two consequences, §C and §D below. Both are cheap to close.

---

## A. Zero egress — RE-CONFIRMED (never LLEN-equality)

| gate | finding |
|---|---|
| **S1 real sends** | PASS ×6. Every egress-log entry is `would_log` / `would_write` / `would_send`. No `api.respond.io` POST in any of the 6 executions. All 8 sendmsg callers → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), confirmed statically at `be62b3a8`. |
| **S2 assignment/SLA/PIC** | PASS ×6. SA-3 and SA-4 **offer** escalation as a question / quick-reply; neither confirms. `sub-human-intervention` never invoked. Zero assign writes. |
| **S3 CRM/contact writes** | PASS ×6. `save-session-vars` + `update-human-intervened` remain orphaned (0 inbound); `would_write` only. No conversation-variables PUT. |
| **S4 get-results read-allowlist** | PASS. Ran in SA-1/SA-2/SA-5 only; resolved tools are reads (stock/inventory list, `crm_master_product_attachments_list`). `crm_it_support_ticket_create` observed **nowhere**. Did not run at all in SA-3/SA-4(main)/SA-6. |
| **S5 test_mode** | PASS, with a noted weakness — directly read from trigger json for SA-1/SA-3/SA-6 only; **inferred** for SA-2/SA-4/SA-5. Accepted: the clone is fail-closed *by construction* (orphaned egress nodes + CHAT fork), so `test_mode` is defence-in-depth, and each inferred case carries an independent corroborating observable (`would_send`, not `send`). |
| **S7a TEST sink** | PASS. Each of the 6 runs produced exactly one `save-message-redis` sub-execution → `tWm5DYLxfypmVC1T`, each self-verifying `turn_id == own parent execution id` (LESSONS §8). No case routed elsewhere. |
| **S7b prod sink** | **PASS — sound method.** Sink-delta + payload attribution, *not* LLEN-equality (LESSONS §45). Full 89/89 consumer polls in 08:48:50Z–08:56:05Z fetched individually (not sampled); window contains all 6 fires (08:49:14 → 08:55:44) with margin; **0 unretrievable polls**. 5 non-empty pops all carry a single unrelated live turn_id `12179650` / contact `477071885`, order-delivery content, none of the 6 `test_run_id`s or execution ids present. **Harness-attributable delta = 0.** |

**No egress is possible from the promoted hunk itself**: the change is three fields appended to the JSON
body of an HTTP **POST to a CRM read endpoint** (`/references/resolve`). No egress node was touched,
added, removed, rewired or re-credentialed. `connections` byte-identical; 27/27 credential bindings
intact; credential on the node unchanged (`crm-n8n-auth` `mNsZWyU82NYV58k2`) on both sides.

Recorded, not blocking: the run envelope labels these `scope: 'deterministic'` while all six are in fact
**real-parser + real-CRM-read** runs. The tier used is correct for a spine change; the label is wrong and
would mislead a future reader into counting them as 0-token runs.

## B. Node-diff correctness and promote-target verification (independently re-derived)

Verified by me against the exports (`--verify` clean at review time: live `469e7259`, clone `be62b3a8`):

- Live node **NAME `resolve-entity`**, id `a2bed208-8051-4eb4-8e21-4bee16bd3568`, `n8n-nodes-base.httpRequest`. The clone's node named `resolve-entity` is the NoOp; the body lives on `resolve-entity-http`. The diff and manifest both carry this correctly.
- **Live's current `jsonBody` sha256 = `51de7f16…` — byte-identical to `resolve-entity.before.jsonBody.txt`**, at the *current* live versionId (live has moved `89f26e9c` → `469e7259` since the plan was written; **this node did not**). Live params sha `2b50c2c2…` matches the manifest. So promoting the frozen after-body **is** "LIVE + own hunks" (LESSONS §57) — but that equality decays, so it is re-asserted in the checklist.
- Clone `resolve-entity-http` vs live `resolve-entity`, param by param: **`jsonBody` is the only difference.** `url`, `method`, `sendBody`, `sendHeaders`, `specifyBody`, `headerParameters`, `options`, `authentication`, `genericAuthType`, credentials — all identical.
- **§65 by-name check passes.** The new expression reads `$('Call \'sub-query-reformulator\'')`, a node that exists on live under exactly that name and already feeds the six pre-existing fields in the same body. No new by-name dependency; no upstream node deleted on the clone that live has (the inverse of the container-status trap).
- **§70c check passes on live.** I swept every live Code node for key-set iteration: every hit is scoped to `by_entity_type` or an unrelated object — **nothing iterates the resolver root.** The four new top-level keys (`spec_candidates`, `floor_missed`, `spec_unmet`, `semantic_used`) ride the mutate-forward chain safely, and `compile-current-state` still builds a fresh object literal so they do not persist into the CRM session.
- **§71 check passes.** Param-hash sweep, not Code-bodies-only; exactly one node's `parameters` changed on the clone; node-id set identical; `connections` byte-identical.
- Offline suite is properly instrumented: `probe.js` 38/0, `mutate.sh` 10/10 with the §72 zero-byte-mutation guard and a B5 resync gate with **three** outcomes. The surviving mutant was resolved by deleting dead code rather than by adding a comfortable assertion — correct call.

**Clone↔live drift on the SA path — assessed, and it does not invalidate the tested shapes.** The clone is
materially behind live (`disallowed-entity-gate` −127L, `compile-current-state` −64L,
`not-found-error-message` −66L, `promo-picker` absent). I diffed each:

- `disallowed-entity-gate`: all 127 live-only lines run **after** `gate_passed`/`require_specific` are set and are **promotion-domain** (multi-company routing, tier/access notices). `ALLOWS_EMPTY.master_products: false` on both sides. SA-1's gate evidence transfers.
- `compile-current-state`: live's miss filter has one **additional** exclusion (`_pickerReported`) — strictly monotone in the safe direction, so "no duplicate miss on the clone" implies the same on live *for the shapes tested*.
- `not-found-error-message`: live renders a different total-miss string than the clone did in SA-3. That is pre-existing drift, **not** caused by this change; SA-3's conclusion (path-identity, no new wording *introduced by this change*) still transfers.
- `promo-picker` (live-only): reads `$('resolve-entity')` but returns early unless `domain_hint === 'promotion'` — inert for the master_products spec path.
- get-results sub divergence (live → `rysSPgUssLDf6xJc`, clone → `t4QvrtrPnTwRU6br`): the **only** differing node is `entity-ids-transformer`, and the only hunk is `attachment_type_id` → `attachment_type_ids`. Product-uuid mapping is identical, so SA-1's "uuids ⊆ spec-match uuids" transfers. **That hunk is someone else's unpromoted work — do not let it ride this promote.**

## C. BLOCKING — the widened gate breaks the inertness claim, and no control covers it

`_product_words_unanswered` (verified, `references.py:1277`) fires on an **AND-shaped result whose returned
product rows do not between them contain every word the customer used** — reading the `token_coverage`
block the AND exit already computes. It exists precisely because this catalogue writes description words
into product codes (`SRTWB7104-WALL HUNG`).

So the fallback now fires on requests that **did** return matches. And `_emit_spec_matches` (`:1740-1766`)
handles that case by **replacing** `intersection`, `by_entity_type` and `empty` with the spec rows — a
branch its own docstring calls *"defensive … normally not reached"*, because it was written when only the
zero-match arm existed. The widening made the defensive branch the primary one. (LESSONS §73's shape
exactly: an assertion written about half a value, invalidated when the other half gained teeth.)

**Both parity controls are structurally blind to this.** SA-2 (clone) and SA-P2 (CRM) both use the
single-token code `SRTWC286` — a token that fully covers its code, so `unmatched_words` is empty and the
new arm *cannot* fire. They prove inertness for the one shape that was never at risk. This is the §66/§70d
class: a fixture that cannot discriminate returns the comfortable answer.

Net: this change turns `spec_fallback: true` on for **every** resolve call on live, and the arm that can
alter *currently-resolving* multi-word product traffic has **zero** executed evidence — no CRM probe, no
clone run — while the artifacts state that traffic is byte-identical.

## D. BLOCKING (same root cause) — F1 is likely alive on the untested arm, and was refuted on the one shape that cannot show it

Reasoned from source; **a hypothesis, and labelled as one** (LESSONS §70) — but a specific one with a
cheap decisive test.

F1 was declared REFUTED on SA-1. SA-1 is a **total-miss** turn: the AND run matched nothing, was rewritten
to OR shape, and came back with exactly one resolution and `unresolved_tokens: []`. That is a property of
the **zero-match arm**, not of the feature.

On the widened arm the shape is different, and every step is verifiable in the sources I read:

1. `_emit_spec_matches` removes **only `spec_resolution["token"]`** — i.e. `payload.query`, the LLM restatement — from `unresolved_tokens` (`:1765-1766`). The customer's own raw token is **not** removed.
2. `intersection` / `by_entity_type` are replaced by spec rows; the original per-token resolution keeps `matches: []` and its **trgm `alternatives`** (SA-4 measured exactly this shape: 3 rows `BRBC2296-1 (WALL HUNG)`, `MAB7029C-WALL HUNG`, `MAB7029E-WALL HUNG`).
3. Live `compile-current-state:391` builds `_answerCodes` from the gate's `compatible_entities`, which comes from the **replaced** `by_entity_type` — so it holds the spec uuids and **not** the trgm codes.
4. `_tokenWasAnswered(res)` (`:411`) intersects the token's own `matches ∪ alternatives ∪ intersection` against `_answerCodes` → **false** for the customer's token.
5. It clears every other conjunct at `:441-445` (`resolved !== true`, no exact match, not gate-narrowed, not picker-reported) → it lands in `missResolutions`.

Predicted customer-visible result: the spec answer, and underneath it
`"wall hung basin" — did you mean: [the three code rows the CRM just decided did NOT answer the
description]`. That is F1, on the arm nobody ran — and it is worse than F1 predicted, because the
did-you-mean offers back rows the ranker explicitly displaced.

Why no run caught it: SA-1 is the OR-rewritten zero-match shape (single resolution, no leak).
SA-4/SA-5 hit the widened arm but the ranker **floor-missed**, so the code partials stood and no spec rows
appeared. **"Widened gate fires AND ranker returns candidates above floor" is unexercised end-to-end.**

Related correction the run files should carry: SA-4's and SA-5's stated root cause — *"trgm produced
non-empty alternatives, so `_result_has_zero_matches` was never true, so spec_fallback was bypassed"* — is
reasoning from the **pre-`ae3393810` gate**. The observation (no spec rows) is solid; the explanation is
not, and it drives a follow-up recommendation ("use a phrase without a code-substring collision") that may
target nothing. Note SA-P1 returned 5 spec matches for the *same* phrase `wall hung basin`, which by the
tester's stated mechanism should have been impossible — the difference is request shape
(single token / `category` / `master_products`), not the phrase.

---

## Required changes (all cheap; none needs a clone write or a live write)

1. **Correct the inertness claim** in plan §0/§2 and node-diff §1 to the real gate
   (`_result_has_zero_matches` **or** `_product_words_unanswered`), and state the true blast radius:
   multi-word product phrases with partial code-word coverage can have their result set **replaced**.
2. **Add the missing parity control (CRM, read-only, holder of `crm-n8n-auth`).** `crm-probe.js` already
   has the with/without machinery (`post(base)` + the `parity` flag). Add two cases:
   - **SA-P6 — widened-arm inertness:** an AND-mode multi-word product phrase that partially hits code
     text (the `wall hung basin` / `SRTWB7104-WALL HUNG` shape), with and without the three fields.
     Record whether `intersection`/`by_entity_type` are replaced, and whether `unresolved_tokens` retains
     the customer token.
   - **SA-P7 — the direct RED baseline** the family asked for and never got: SA-P1's body **without** the
     three fields, asserting `specMatches(...).length === 0`. Read-only, no clone revert, and it converts
     §RED-first from a mechanism argument into an executed control at the contract boundary.
3. **Run one clone case on the widened arm** (`sorento-tester`, uac, `previous_conversation_state: {}`):
   a phrase that trips `_product_words_unanswered` **and** clears the ranker floor. Assert **the whole
   reply** per LESSONS §68 — grep for `Couldn't find`, `did you mean`, `Multiple matches found`, and any
   escalation offer alongside the spec answer. If §D reproduces, the fix is the **outcome-keyed**
   predicate the coder already sketched (any `match_tier === 'spec_search'` row ⇒ the contributing raws
   were answered) — one predicate, not a per-mechanism patch (LESSONS §67). Note that widens the diff
   beyond one node, so scope it deliberately.
4. **Record the SA-4/SA-5 correction** in both run files: the observation stands, the stated mechanism
   does not.
5. **Say in SA.md what was NOT covered** rather than letting six PASSes read as six units of coverage:
   SA-4 and SA-5 do not exercise `spec_fallback` at all; SA-1 is the family's only end-to-end
   demonstration of the feature, and it covers the zero-match arm only.

## Not blocking — accepted, record them

- **RED-first deviation is acceptable as reasoned, for the zero-match arm.** SA-1's discriminator is
  sound: `match_tier: 'spec_search'` is a value that exists *only* on the new path (verified in CRM
  source), 5/5 rows carry it and zero rows carry any other tier — exactly the discriminating observable
  LESSONS §70d demands, directly observed in runData. Combined with executed SA-P2 parity and `mutate.sh`
  m1, the practical risk the RED rule guards (a coincidental pre-existing route to the same answer) is
  closed. Requiring a clone revert-and-restore for a formal RED would be disproportionate; **item 2's
  SA-P7 gets the same evidence for one read-only CRM call.** The tester was right to refuse the write and
  to document the gap loudly rather than skip it.
- **SA-4's attachment-domain caveat does not itself block.** The hard assertion (no unscoped universal
  negative) genuinely passes, the scoping comes from pre-existing dym-probe machinery, and the unexercised
  interaction is a quality risk, not a safety or egress one. It is a documented v1 limitation — but only
  once item 5 records it as *absent coverage* rather than a pass.
- **Escalation-rate shift.** Turns that today dead-end into not-found/escalate may now auto-answer with up
  to 15 spec rows. Intended, and floor-guarded (SA-P4: gibberish → `floor_missed: true`, 0 candidates).
  Worth watching post-promote, not gating.
- **CLAUDE.md is stale** on the clone's get-results target (`rysSPgUssLDf6xJc` → actually
  `t4QvrtrPnTwRU6br`). Tester is correct; fix separately.

---

## PROMOTE CHECKLIST — do not execute until §C/§D are closed; promotion is user-gated

**Scope: exactly one leaf.** LIVE `9qVyfUxmRQqrpGRMDLRuz`, node **NAME `resolve-entity`**, parameter
`jsonBody`. Nothing else. Do not touch `resolve-entity-clarification`, either get-results sub, or any
node carrying another change's in-flight work.

**0 — record rollback first.**
- Rollback versionId: **`469e7259-6cfb-4505-bef4-f37a36bf454f`** (live at review time). Re-read and
  re-record immediately before the write — live moves.
- Rollback body: `tests/offline/spec-shapeA/resolve-entity.before.jsonBody.txt`, sha256
  `51de7f16cf223c7dcc89485d629252c2524729df56735dae29b741d9e8a7da5f` (886 bytes).

**1 — pre-flight gates (abort on any failure; each abort is free).**
- `python3 n8n-workflows-init/scripts/export-workflows.py --verify` → clean.
- Draft == active on the live spine: run the LESSONS §23 jq sweep over `get_workflow_details`; require
  **0 differing nodes + byte-identical connections**. If a stray draft delta exists, publish it as its own
  semantic-no-op first (LESSONS §51) — never let it ride this promote.
- **Re-assert the target is unmoved** (LESSONS §57 — the byte-identity claim decays): live
  `resolve-entity.parameters.jsonBody` sha256 **must still equal `51de7f16…`**. If it has moved, STOP:
  re-derive the promote body as *live-now + the three appended fields*, do not ship the frozen after-body.
- Confirm the live node is still named `resolve-entity` (id `a2bed208-8051-4eb4-8e21-4bee16bd3568`) and is
  the `httpRequest` node — **never** copy the clone's node name `resolve-entity-http` across.

**2 — transport: file-driven REST GET → replace one leaf → PUT. Not MCP.**
- MCP `setNodeParameter` **mangles `\uXXXX` escapes into literal glyphs** — it failed the byte-gate twice
  on the clone build. The body contains `‐-―−﹘﹣－`. Use the file-driven route
  (LESSONS §71 transport corollary).
- Build the PUT body from a **fresh faithful REST GET of the live spine** (REST GET preserves credentials;
  MCP output does not — LESSONS §55). Replace only `nodes[name=="resolve-entity"].parameters.jsonBody`
  with the contents of `resolve-entity.after.jsonBody.txt`.
- **`del(.settings.binaryMode)`** — live carries `binaryMode: "separate"` and the public schema rejects it
  (`settings` is merged, not replaced, so stripping is lossless). The 400 is pre-write and free, but skip
  the round trip.
- Quote every heredoc delimiter (`<<'PY'`) — the body is `$`-dense (LESSONS §D14).
- **PUT auto-publishes.** Live has a **Schedule Trigger and is active**, so the change takes effect on the
  next poll, against real customers. There is no staging step.
- Live has **no webhook trigger**, so expect a clean **200**. A 409 here would be anomalous (LESSONS §60
  applies only to webhook workflows) — treat it as a halt, not as "persisted anyway".

**3 — post-write gates.**
- Re-fetch and byte-gate: live `resolve-entity.jsonBody` sha256 == **`dac04eb02a23bfd7a780fd2f8905c4e4af4a82b41c31b21dcc0a3328ada7f639`** (1306 bytes). On mismatch, immediately `publish_workflow` the recorded rollback versionId.
- Assert **exactly one** node's `parameters` changed vs the pre-PUT GET (param-hash every node, not just
  Code bodies — LESSONS §71), and `connections` byte-identical.
- Re-assert the credential census: every binding present before is present after, same ids (LESSONS §55).
- Assert topology unchanged: no node added/removed/renamed, no new edges (LESSONS §D18).

**4 — verify on the path you changed, not the happy path (LESSONS §56).**
- A **descriptive** turn (SA-1's `wall hung basin 600mm` shape) resolves via `match_tier: 'spec_search'`.
- A **code** turn (`SRTWC286`) is unchanged — same match count/tiers, zero spec rows.
- A **widened-arm** turn (the §C/§D shape) renders a clean reply with **no** `Couldn't find` /
  `did you mean` under the answer. This is the acceptance criterion the whole review turns on — verify it
  explicitly, on live, and record the verbatim reply.
- A **total-miss** turn still reaches not-found/escalate with live's existing wording.
- Anything that genuinely cannot be exercised: record as **unverified**, never inferred from a clean diff.

**5 — after.** Refresh the export (`export-workflows.py`, no `--verify` flag) and commit the new
`versionId`; append the promote to the manifest with both shas and the rollback pointer.

---

# E. Rev-2 settlement — §C and §D closed, APPROVE

Re-verified each item against the artifacts, not against the summary.

## E1. Required changes — all landed and verified

| # | required | verified |
|---|---|---|
| 1 | correct the inertness claim | ✅ plan §0 (`spec-search-shapeA-wiring-plan.md:26`) and node-diff §1 (`:54`) now both state the real gate `_result_has_zero_matches(result) or _product_words_unanswered(result)` (`references.py:1823`) and the true blast radius (partial-coverage phrases REPLACED, never mixed). |
| 2 | SA-P6 widened-arm control + SA-P7 RED baseline | ✅ executed green, `crm-probe-results.json` @ 09:34:20Z. **SA-P6**: without the fields the partial-coverage intersection exists (13 code rows); with them, 10 spec rows and **0 code-partial rows remain** — replacement measured, not inferred. **SA-P7**: same body without the three fields ⇒ **0 spec rows anywhere** — the executed RED baseline the family never had. |
| 3 | clone case on the widened arm | ✅ **SA-7**, exec `12183425`, clone re-verified `be62b3a8` unmoved. `intersection` 5/5 `spec_search`, zero code partials; whole reply grepped — `Couldn't find` / `did you mean` / `Multiple matches found` / escalation offer all **ABSENT**. §68's negative-alongside-positive assertion, done properly. |
| 4 | SA-4/SA-5 root-cause correction | ✅ `review_corrections_20260812` + `SA7_widened_arm_settlement` in the rollup. |
| 5 | coverage honesty in SA.md | ✅ new section at `SA.md:62` — states plainly that SA-4/SA-5 are **absent coverage**, not proven behaviour, and that SA-1 covers the zero-match arm only. |

## E2. §D is closed — structurally, not just empirically

The tester's residual was honest and correct on their evidence: SA-7 is single-token, SA-P6 is
single-token, and SA-4/SA-5 have the two-entry shape but floor-missed — so "multi-token + widened arm
fires + floor clears" is uncombined in any run. I asked for that constructed case. **It is not needed,
because the combination cannot produce the shape §D requires.** From `references.py:1494-1506`:

```python
# AND-mode shape has no per-token visibility (only `intersection`). When
# AND failed entirely, degrade to OR-mode-under-whitelist so we can reason
# per-token. AND that succeeded is returned untouched.
if mode == "and":
    if not _result_has_zero_matches(result):
        return _attach_and_coverage(_apply_limit_marking_truncation(result, limit))
    result = _run(allowed_entity_types, force_mode="or")
```

The two arms are mutually exclusive **and so are the response shapes they can produce**:

- **Widened arm** (`_product_words_unanswered`) requires AND to have returned product rows ⇒
  `not _result_has_zero_matches` ⇒ **early return in the AND shape, which carries no per-token
  `resolutions` at all** — irrespective of token count. `_emit_spec_matches` then
  `setdefault("resolutions", []).append(spec_resolution)`, so `resolutions` is **exactly one entry**,
  the spec one, which `_tokenWasAnswered` correctly suppresses. **§D's premise-2 leftover resolution
  cannot exist on this arm.**
- **Zero-match arm** degrades to OR and *does* produce per-token `resolutions` — but that is SA-1's
  shape, measured clean (`unresolved_tokens: []`, one resolution, clean reply).

So my rev-1 error was conflating SA-4's shape (AND→OR-degraded **zero-match** arm) with the widened
arm. Token count was never the variable; **the arm determines the shape**. Three independent
measurements agree, one per reachable shape:

| shape | arm | evidence | leftover-resolution leak |
|---|---|---|---|
| AND early-return, replaced | widened | SA-P6 (CRM), SA-7 (boundary) | impossible — 1 resolution, `unresolved_tokens: []`, `alternatives: []` |
| OR-degraded, replaced | zero-match | SA-1 | none — measured clean |
| OR-degraded, floor-missed | zero-match | SA-4, SA-5 | n/a — partials correctly stand, pre-existing dym renders a scoped picker |

That is a stronger closure than the constructed case would have given, because it holds for inputs
nobody will ever enumerate.

**One durable dependency to record (not a blocker).** This closure rests on a CRM-side invariant: *an
AND run that succeeded returns early and emits no per-token `resolutions`.* If that ever changes, §D
reopens silently. Per LESSONS §73 rule 2, pin it as an **invariant, not a point pin** — one assertion
in `crm-probe.js` on the SA-P6 body: *if any `match_tier: 'spec_search'` row is present, then
`resolutions.length === 1`.* One line, and it fails on shapes nobody enumerated.

## E3. §C is closed

The widened arm now has an executed inertness control at the source (SA-P6: 13 partials → 10 spec rows,
0 mixed), an executed RED baseline (SA-P7), and an end-to-end boundary proof through the real parser
(SA-7). The artifacts state the real gate. The blind-fixture problem (SA-2/SA-P2 being single-token
code queries that cannot fire the arm) is resolved by SA-P6 covering exactly that gap.

## E4. Zero egress — re-confirmed on the new case

SA-7 adds nothing to the egress surface and its §0 block is the strongest in the family: S5 **directly**
confirmed from trigger json (not inferred); S3 sink self-verified (`turn_id 12183425` == own execution
id, sub-exec `12183442` → `tWm5DYLxfypmVC1T`); S4 read-shaped answer, no ticket-create marker; S7b
7/7 covering polls, zero delta. Egress log: 1× `would_log`, 1× `would_write`, 1× `would_send`. No real
send, no assignment, no CRM write. The §A verdict stands, now over 7 executions.

Also re-verified by me at rev 2: nothing on live reads `spec_candidates` / `floor_missed` /
`spec_unmet` / `semantic_used` (the four new top-level keys are inert by non-consumption, on top of
being outside every key-set iteration). `token_coverage` is read only by `promo-picker`, which returns
early unless `domain_hint === 'promotion'`.

## E5. Promote checklist — STANDS AS WRITTEN

No changes. Re-verified at rev 2, immediately before this sign-off:

- exports `--verify` clean; live `9qVyfUxmRQqrpGRMDLRuz` still at **`469e7259-6cfb-4505-bef4-f37a36bf454f`**;
- live `resolve-entity.jsonBody` sha256 still **`51de7f16…`** — the frozen before-body, unmoved.

Both values are as recorded in step 0/1, so the checklist's gates are currently satisfied — but **re-read
both at write time anyway** (they are gates precisely because they decay). Everything else stands:
file-driven REST GET → PUT (never MCP `setNodeParameter` — it mangles the `\uXXXX` escapes),
`del(.settings.binaryMode)`, expect a clean 200 (no webhook trigger on this workflow — a 409 is a halt),
target by node **NAME** `resolve-entity`, post-write byte-gate to `dac04eb0…`, and step 4's
path-specific verification — including the widened-arm turn, which is now the acceptance criterion this
review was blocking on.

**Promotion remains user-gated. This review authorizes it; it does not perform it.**

---

## §F — /codex-review second opinion (2026-08-12, main session)

Codex (OpenAI, read-only, self-contained prompt with before/after bodies + free-terms.js) returned
two candidates; both verified against source, **neither blocking**:

1. `SRTWB7055 -WALL HUNG` (space-before-dash code) leaks into `free_terms` — TRUE, and the
   classifier's documented bias ("allowed to be wrong in the kept-a-code direction"): the raw also
   rides `tokens` unchanged, and the leaked words give at most a weak — here actually helpful —
   text hit inside `search_specs`. Accepted bound, no change.
2. `output.entities` missing/null throws the whole jsonBody expression — TRUE and PRE-EXISTING:
   the before-body maps `output.entities` unguarded twice; this diff does not change that risk in
   either direction. Out of scope.

Explicitly cleared by codex: unicode-dash code leakage, quote/backslash JSON breakage, any
before→after drift beyond the three intended fields.

Step 8 complete: sorento-reviewer APPROVE (rev 2) + codex second opinion clean. Promotion remains
user-gated.
