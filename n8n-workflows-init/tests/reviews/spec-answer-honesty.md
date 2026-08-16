# Review — COMBINED promote candidate: `spec-search-shapeA-wiring` + `spec-answer-honesty` (SR-1)

Reviewer: `sorento-reviewer` · 2026-08-13
Scope reviewed: the two changes as **one live write** — they cannot ship separately (see §E).
Build: TEST clone `txiPzSxy3Pclsz6v` @ `8ed4e464` · Promote target: LIVE spine `9qVyfUxmRQqrpGRMDLRuz` @ `469e7259`
Prior review (shape A, rev 2 APPROVE): `tests/reviews/spec-search-shapeA-wiring.md`

---

## VERDICT: **APPROVE** — promote both leaves in one session. Promotion remains user-gated.

Zero egress is re-confirmed across 22 executions in both families, by sink-delta with payload
attribution (§A). The two hunks re-apply **cleanly and provably** against live's current
`compile-current-state`, which was the highest-risk item and is now settled by executed evidence,
not by inspection (§B). `tf-message` dominance on live is independently re-derived, not inherited
(§C). N-0's widening is the weakest-evidenced part of the change and is recorded as such (§D).

**And one correction I owe: my own shape-A rev-2 §E2 closure was wrong.** SR testing found a third
CRM response shape my "structurally impossible" argument did not enumerate, and on that shape
shape A **alone** ships the §D contradiction to real customers on an ordinary two-token question
(§E). The user's hold was correct. That is the load-bearing reason these promote together.

---

## A. Zero egress — RE-CONFIRMED (never LLEN-equality)

266 consumer polls across five windows, **0 unretrievable**, 30 non-empty prod pops, every one
attributed to an unrelated live contact/turn_id. Method is sink-delta + payload attribution
throughout (per-poll `LLEN` depth series *and* per-poll pop payload, LESSONS §45/§46). No
LLEN-equality and no consumer-execution-count reasoning appears anywhere in either family.

| gate | finding across 22 executions |
|---|---|
| S1 real sends | PASS. Every egress-log entry `would_log`/`would_write`/`would_send`. No `api.respond.io` 2xx send in any execution. |
| S2 assignment/SLA/PIC | PASS. Escalation **offered** in SA-3/SA-4/SR-6a/SR-6b/sr6r2, never confirmed. No harness invocation of the human-intervention sub. |
| S3 CRM/contact writes | PASS. `save-session-vars`, `update-human-intervened`, `send-message-files/images/video` all 0 inbound; `would_write` only. |
| S4 read allowlist | PASS on outcome. `crm_it_support_ticket_create` appears **nowhere**; no write-shaped tool observed. See finding F3 for the instrument gap. |
| S5 test_mode | PASS. Direct from trigger json on all 15 SR firings and SA-1/3/6/7; **inferred** on SA-2/SA-4/SA-5. |
| S7a TEST sink | PASS where measured — `tWm5DYLxfypmVC1T`, `turn_id == own parent execution id` (SA-6, SA-7, SR-1, sr4r2). |
| S7b prod sink | PASS. SA 89/89 · SA-7 7/7 · SR rev1 99/99 · SR rev2 57/57 · **SR-7/SR-8 gap 14/14, closed during this review**. |

**No egress is possible from the promoted hunks themselves.** Both leaves are (a) three fields
appended to the JSON body of an HTTP POST to a CRM **read** endpoint and (b) two additive blocks in
a pure Code node that only appends to `userResponse` and filters an array. No egress node touched,
added, removed, rewired or re-credentialed; `connections` untouched; no credential touched.

### Egress findings that do NOT block, but must be recorded

- **F1 — the sendmsg sub on record is wrong.** CLAUDE.md and the SA rollup say the clone's 9 sendmsg
  callers point at `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`). They do not. **I verified statically from
  the export: 9/9 callers → `aQUmwMVplmNcyUVc` (`sub-sendmsg-QRCHUNK`)**, a fork that appears in no
  run file, in CLAUDE.md, or in the memory index. `ublq9nSlrpz63xan` has **zero executions** in either
  run window.
  Containment nevertheless **holds**, and I proved it rather than assuming it: all 9 callers hardcode
  `is_test: true`; the fork is *armed* (`respondIoApi` bound on `Send a Message`, `HTTP Request`,
  `Send Template`, `Find a Message` — LESSONS §47, forks come out armed), but from the
  `executeWorkflowTrigger` the only reachable credentialed egress nodes are `Send a Message` and
  `HTTP Request`, and **`guard-qr`/`guard-text` dominate both** (TRUE → `guard-record-*`; FALSE → the
  real send). `Send Template`/`Find a Message`/`Switch1` sit behind `Wait`, which has **0 inbound** —
  physically unreachable. So: 2 guarded + 2 orphaned.
  The substance is fine; the *documentation* is wrong, and the guard is flag-gated, not fail-closed,
  which is weaker than the story CLAUDE.md tells. Fix CLAUDE.md.
- **F2 — SR-7 and SR-8 were signed off with S7b not asserted.** They fired ~4 min after the rev-1
  sweep window closed, and the gap was argued away with architecture reasoning — exactly the
  substitution §0 retired. The gap has now been closed read-only (14/14 covering polls,
  `12309048`…`12309161`, 0 unretrievable). It was **not** quiet: poll `12309138` @ 09:20:05.020Z shows
  `LLEN 1` and a real non-empty pop. It attributes cleanly to unrelated live contact `445239409`
  (the human-intervention-off notice, no `test_run_id`), so **harness-attributable delta = 0** — but
  the binding HALT-pending-attribution step never happened because nobody looked.
- **F3 — S4 was never run as written, in 22 of 22 cases.** The gate asks for the *resolved tool name*
  against the read allowlist; every case substituted "the response shape is read-only
  (`response/answers/attachments/has_result`)". Only SA-4 names an actual tool
  (`crm_master_product_attachments_list`, a read). No write tool was found — but the instrument that
  would find one was not used.
- **F4 — S3's "assert from the workflow JSON, not from memory" was not done for any of the 15 SR
  firings**; the orphan claim rides the coder's node-diff. I re-asserted it myself from the export at
  `8ed4e464`: all five egress nodes still 0 inbound.
- **F5 — SR-6a (`12308626`) is the one un-audited write surface.** It is the only execution in either
  family that took the **ideation / `submit_idea`** branch, and its S1/S3 rest on a single blanket
  sentence with no per-node runData. The egress log only records *guarded* nodes, so an unguarded
  write on that path would not appear in it. Not a proven failure — an unproven pass. Relevant given
  the standing `ideation-sessionvars-shape-mismatch` landmine.
- **F6 — `Chat Memory Manager` (`memoryPostgresChat`) writes on every test turn** and is reported
  nowhere. Not prod CRM, not customer-facing, but it is one of S8's banned node types and a "zero
  write" claim that silently excludes it is imprecise.
- **F7 — the SA family's evidence is no longer re-checkable.** 2026-08-12 executions have been pruned
  (`12179324` returns not-found). The SA 89-poll sweep can never be re-verified. It was performed live
  at the time, so this is not a fail — but anything you want re-verified from 2026-08-13 should be
  re-verified **now**, before those are pruned too.
- **F8 — SR-5's session isolation is doubtful.** SR-5 records `previous_conversation_state: {}` yet the
  parser emitted a carried `Dealer Sales` entity with `current_message: false`. Either the inject did
  not take effect or the parser produced it unprompted. This is the source of backlog B2 and it bears
  on whether the uac-mode session-isolation gate works at all. Worth settling before the next family.

None of F1–F8 changes the risk of the live change (which touches no egress node, no sub, no
credential), so none blocks. All are harness-integrity debt.

## B. The highest-risk item — do the hunks re-apply against the CURRENT live body? **YES, proven**

Everything below is my own derivation against the export, `--verify` clean at review time
(live `469e7259`, clone `8ed4e464`).

**B1 — live's current bytes.**

| node (live NAME) | id | leaf | sha256 | bytes |
|---|---|---|---|---|
| `resolve-entity` | `a2bed208-8051-4eb4-8e21-4bee16bd3568` | `jsonBody` | `51de7f16cf223c7dcc89485d629252c2524729df56735dae29b741d9e8a7da5f` | 886 |
| `compile-current-state` | `0804657c-f600-450b-8ae9-17972406f0e9` | `jsCode` | `3fa9d17071a81adacfdc573951bef81b249031cb153a68baadf6f709bfa98249` | 36983 |

`resolve-entity` is **unmoved** since the shape-A rev-2 sign-off — `51de7f16…` is byte-identical to
the frozen `spec-shapeA/resolve-entity.before.jsonBody.txt`.

**B2 — `resolve-entity`: the combined target is exactly live + both changes' hunks.**
`diff live-body → tests/offline/spec-answer-honesty/resolve-entity-http.after.jsonBody.txt`
(`7ca14cbf…`, 1809 B) = **only** `"limit": 15` gaining its comma plus the three appended fields
`spec_fallback` / `free_terms` / `understand_phrase`. Zero other drift. Pure ASCII (unicode written
as `\u` escapes), zero trailing whitespace, no trailing newline on either side.

**B3 — `compile-current-state`: all three anchors are unique in live's body, and the splice is
purely additive.**

| anchor | occurrences in live | occurrences in clone-before |
|---|---|---|
| `  let missResolutions = [];\n` | **1** | 1 |
| `      && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())\n` | **1** | 1 |
| `// ── friendly domain disclaimers` | **1** | 1 |

Applying them to live's body: 36983 → **46427 bytes, delta +9444 — byte-identical to the clone's own
before→after delta.** `diff live → target` is **2 hunks, 143 lines added, 0 lines removed**.
`node --check` clean. Zero trailing whitespace. Expected target sha256
`9a5e47225b631829da6cbe8fcdb445004a01b67a019bdbe590ab987d87745ddb` **if and only if** live is still at
`3fa9d170…` — recompute at write time, do not trust this number.

**B4 — scope and declaration order on live, checked not assumed.**
- N-3 declarations land at live L439, **after** `_answerCodes` (L391) and `_pickerReported` (L425) —
  no TDZ.
- The N-3 clause lands **inside** the same `&&` chain, between the `_gateResolvedTokens` and
  `_pickerReported` clauses. All are pure predicates, so ordering is semantically irrelevant; live's
  `_pickerReported` clause survives untouched.
- N-2 lands at live L237. Every free identifier it uses is declared above it: `qf` L16,
  `includeResponse` L19, `isEscalateBranch` L20, `manualResponse` L22, `userResponse` L99 (`let`),
  `last_result_set` L103.
- **Every write to `userResponse` after L237 on live is `+=`, never `=`** (L250, L255, L297, L529) —
  so live's promo-picker/tier-ask arms cannot clobber the N-2 line. Same set as the clone, shifted.

**B5 — behavioural proof on live's body, not just structural.** I rebuilt the offline suite with
**live's body as both the BEFORE and the AFTER base** and ran it: **100 passed / 1 failed**, the one
failure being `D1` (the clone-deployment gate, a path artifact of my scratch copy). That includes
**U3-1 RED — live's pre-fix body *does* emit the duplicate miss line** — so the defect N-3 fixes is
live-reachable, and the fix intervenes correctly on live's body. This is the strongest available
answer to "do the hunks re-apply cleanly": they do, and they behave identically.

**B6 — the clone's miss renderer is STALE vs live, and it is a live-regression trap.** My first
live-based run showed 5 failures; all five reduce to one cause:

| | clone | live |
|---|---|---|
| miss line | `` `"${token}" — not found.` `` | `` `"${token}": not found.` `` |
| dym line | `` `"${token}" — did you mean:` `` | `` `"${token}", did you mean:` `` |

Normalising **only** that pre-existing separator (a change made purely to satisfy the suite's clone-spelled
string literals — **not** a hunk, **not** to be promoted) turns the run green. Two consequences:
1. Copying the clone's `compile-current-state` body to live would silently revert live's wording —
   precisely LESSONS §57. The live+hunks build avoids it; **do not deviate**.
2. The offline suite's string assertions are clone-spelled. **Do not reuse them literally for
   post-promote verification on live** — grep the block header `Couldn't find these:` (identical on
   both) and the token, not the separator.

**B7 — §65 inbound-edge diff (the check the node-diff itself asked for).**

| node | clone inbound | live inbound | verdict |
|---|---|---|---|
| `compile-current-state` | `build-cs-member-offer`0, `build-ideate-reply`0, `cs-offer-gate`1, `dym-annotate-partial`0, `dym-gate-partial`1 | **identical** | ✅ |
| `tf-message` | `if-audio-in`1, `patch-transcript`0 | **identical** | ✅ |
| `resolve-entity` (live) / `resolve-entity-http` (clone) | harness: `replay-resolve-entity`1 → NoOp `resolve-entity` | `If4`0, `If7`1, `If8`1 | harness scaffolding only — **not promoted** (one leaf, targeted by NAME) |

Outbound edges identical for all three. Neither hunk reads `$json` — both read BY NAME — so the
container-status trap does not apply in either direction.

**B8 — by-name read census.** Exactly **one** new by-name read is introduced: `tf-message`.
`resolve-entity`, `Call 'sub-query-reformulator'` and the other twelve were already read by live's
`compile-current-state`. Live also carries a pre-existing **variable-bound** read
(`for (const n of ['dym-annotate-partial','dym-annotate']) { … $(n) … }`, L466) — the form LESSONS
§74 warns is invisible to a literal grep. It is unchanged by the hunks; I enumerated it rather than
grepping for `$('…')` alone.

**B9 — single source of truth for the code-shape classifier.**
`ccs-hunks.CLASSIFIER_SRC === spec-shapeA/free-terms.CLASSIFIER_SRC` (identical, 256 chars, `require`d
not re-typed), and it occurs **exactly once** in each shipped body. N-0's `free_terms` filter and
N-3's `_fedFreeTerms` scope therefore cannot drift apart — which is the property that makes N-3's
"only the raws that could have fed spec search" claim true rather than aspirational.

**B10 — instruments re-run by me, not taken on trust.** `node probe.js` → **101 passed, 0 failed**,
D1 `DEPLOYED (sha e3b844c6cb67)`. `bash mutate.sh` → **16 caught, 0 survived, 1 VOID** — and the VOID
is the stale-anchor selftest firing exactly as designed (LESSONS §72), i.e. the instrument that proves
a no-op substitution can never be scored as a detection is itself working.

**B11 — transport facts.** The `compile-current-state` target carries **626 non-ASCII bytes**
(`─ 🔴 😊 👍`); the `resolve-entity` target is pure ASCII with `\u` escapes. Both mandate the
file-driven route and a **byte**-wise gate (a char-count comparison will disagree by ~150 and mean
nothing — LESSONS §57).

## C. `tf-message` dominance on live — independently re-derived (LESSONS §65)

I did not inherit the claim. From live's `connections` at `469e7259`: **157 `main` edges + 1
`ai_languageModel` edge**, nothing else.

- **6 roots** with no inbound `main` edge: `Schedule Trigger` (**disabled**),
  `When Executed by Another Workflow`, `OpenAI Chat Model`, `Code in JavaScript`,
  `presign-fail-notice`, `sorento-sub-respond-sendmsg-respond3`.
- Only **two** of them reach `compile-current-state`: `Schedule Trigger` and
  `When Executed by Another Workflow`.
- **Main-path ancestors of `compile-current-state`: 91** — matches the claim exactly.
- **Delete `tf-message` from the graph and `compile-current-state` becomes unreachable from every
  root.** That is the dominance property, tested by removal rather than by reading the edge list.
- The only non-`main` edge anywhere into the ancestor set is
  `OpenAI Chat Model --ai_languageModel--> Basic LLM Chain` — an LM attachment, **not** a data path.
  `OpenAI Chat Model` reaches nothing on `main`. The apparent bypass is confirmed to be an artifact.

**Extended beyond the claim:** `tf-message` also dominates `resolve-entity`, `disallowed-entity-gate`
and `crossdomain-compose` — so N-0's accessor is covered on all three of live's inbound arms
(`If4`/`If7`/`If8`), not only the one the clone exercises.

**The accessor itself is live's own canonical spelling.** `tf-message`'s `jsCode` is **byte-identical**
on clone and live (sha `1c00a7f5…`), and `$('tf-message').first().json.message.message.text` is the
exact path used by live's `Call 'sub-query-reformulator'.latest_user_message`, `construct-user-prompt`,
`Call 'sub-respond-save-message-redis'2`, `if-message-is-audio` and six more. The `try/catch → ''`
means the worst case is the fallback wording, never a node error.

**One precision note for the checklist:** live's Schedule Trigger is **disabled**; live is driven by
the dispatcher through `When Executed by Another Workflow`. Live has **no webhook trigger** either
way, so a clean **200** is expected and a 409 is anomalous (LESSONS §60 applies only to
webhook-trigger workflows) — treat it as a halt.

## D. N-0 widens the ranker input — is SR-6 enough for live traffic? **Not to prove inertness. Enough to proceed, once the gap is named.**

What is genuinely established:
- **The add works and the CRM half is deployed.** SR-1 (`12307974`): the response carries
  `spec_unmet: [{key:'thickness', value:1.2}]`. The CRM could not report an unmet `thickness` unless
  `thickness 1.2mm` reached it as a free term. This closes the node-diff's own open item ("the CRM half
  is read from source, not from a running service") with a discriminating observable.
  Note the request body itself is **not** in runData (n8n records only the response, LESSONS §7) — the
  free-terms value is reconstructed by running the deployed builder. The `spec_unmet` echo is the
  independent corroboration, and it is the right one.
- **The match set cannot shrink, by construction.** The builder appends (`_t.push(_x)`) — the term set
  is a strict superset of shape A's. Plan §4's stated bound is therefore closed structurally, and
  SR-7 corroborates it end-to-end (SA-1's phrase returns the identical 5 codes).
- **Code queries are unaffected.** SR-5: `SRTWC286` is stripped by *both* halves — the entity-raw
  classifier and MSG_TERM's per-word filter.

What is **not** established: the *growth* direction. Filler words ("please", "get", "with") now reach
`wanted_terms`, earn `free_term_boost`, and that boost counts as `evidence` — which is what sets
`floor_missed`. So the effective relevance floor drops slightly, and a query that returned nothing can
start returning rows. Evidence against that: **one phrase** (SR-6, "purple levitating sink"), compared
properly against the SA-3 baseline — 0 rows and `[]` codes both sides, `floor_missed: true` both
sides, byte-identical escalation text. That is a real control, honestly run, and it is n=1.

**The plan asked for more than was delivered.** Plan §4 says *"Measure in the offline probe: SA-P1's
match set must not degrade when N-0 is applied."* Shape A had `tests/offline/spec-shapeA/crm-probe.js`
with a with/without `parity` flag at the CRM boundary — that is exactly the right instrument.
**The SR family has no CRM contract probe at all**; `tests/offline/spec-answer-honesty/` is pure-JS
units. So N-0's effect on the ranker is measured at three phrases end-to-end and at zero phrases at
the contract boundary with a control.

**Judgement.** This is a quality risk, not a safety one; it is one-leaf reversible; and shape A
already carries a larger, accepted behaviour shift (escalation-rate). It does not justify blocking a
change whose *other* half fixes a defect live customers are reachable by today. But it must not be
recorded as covered. The checklist therefore carries the read-only CRM parity probe as a **step-1
item, and an explicit instruction to record it UNVERIFIED if it is skipped** — never to infer it from
SR-6.

## E. Does SR alter shape A's approved conclusions? **Yes — and my rev-2 closure was wrong**

Shape-A rev 2 §E2 closed the §D leftover-resolution leak by arguing it was *structurally impossible*:
the widened arm returns early in the AND shape (no per-token `resolutions` at all), the zero-match arm
degrades to OR and was measured clean on SA-1, *"and that is a stronger closure than the constructed
case would have given, because it holds for inputs nobody will ever enumerate."*

It does not hold. SR-9/SR-4 (exec **`12308336`**, input *"wall hung basin and SRTZZ999"*) found a
**third** shape the argument never enumerated: a multi-token query where AND yields zero intersection,
so **the CRM itself rewrites to OR** (`fallback_match_mode: "or"`) and the response then carries
**both** the per-token resolutions (`matches: []` + three trgm `alternatives`) **and** the appended
query-keyed resolution carrying five `match_tier: "spec_search"` rows.

On that shape, without N-3, the tester's clause-by-clause trace of the deployed predicate shows all
four conjuncts true for `wall hung basin` → it lands in `missResolutions` → the customer reads
`Couldn't find these: "wall hung basin" — not found.` **directly underneath the five wall-hung basins
that answered it**, offering back three codes the ranker had just displaced. That is §D, reproduced,
on an ordinary two-token question.

I corroborated it independently at §B5: **U3-1 goes RED against LIVE's pre-fix body**, so this is
live-reachable, not a clone artifact.

Three consequences:
1. **Shape A must not ship alone.** The user's hold was correct, and the reason is stronger than
   "the reply looks untidy" — it is the exact defect the shape-A review blocked on and then wrongly
   declared impossible.
2. **The generalisable lesson is mine, not the coder's.** LESSONS §70 says a reviewer finding is a
   hypothesis; so is a reviewer's *closure*. A structural-impossibility argument derived from two
   enumerated arms is still an enumeration. The coder's own §2 table had the same defect and the
   node-diff now labels it correctly ("a reachability table is an enumeration of the paths you
   thought of"). Both hedges are properly withdrawn in the artifacts.
3. **Everything else in the shape-A review stands** — target identity, transport, §70c/§71 sweeps,
   credential census, the four new resolver keys being inert by non-consumption. The only value that
   is **superseded** is the post-write byte-gate: the combined promote lands `7ca14cbf…` on
   `resolve-entity`, **not** shape A's `dac04eb0…`, in a single write.

## F. Plan / UAC adherence, and scope

- **SR-1 scope is spine-only, as planned.** Two nodes, two leaves. The plan §2 blast-radius gate is
  respected: **no get-results sub was touched**, and SR-2 (N-1/N-4) is not started. Correct — live's
  main read path runs `rysSPgUssLDf6xJc` while the clone runs `t4QvrtrPnTwRU6br`, so a sub edit here
  would be an ungated live change wearing a test name.
- **Decision §5.1 (data-truth wording) is honoured verbatim** and asserted at the customer boundary:
  `thickness isn't recorded for these products, so I couldn't narrow by 1.0mm.` (exec `12312058`) and
  `…by 1.2mm.` (`12311930`/`12311935`). Mutant **m7** kills the blame-the-search form.
- **Decision §5.2 (no n8n junk filter, wait for CRM C-1)** is honoured — SR-8 stays observational.
- **Decision §5.3 (N-4 covers all product answers, lands in SR-2 with its own UAC)** is honoured by
  omission — nothing here touches `answers[].fields`.
- **Rev 2 is the right call.** Rev 1 rendered `…couldn't narrow by 1.` for a customer who typed
  `1.0mm` — a truncation *and* a different number. Quoting the customer's own span is the honest third
  option, and the trailing zero surviving (`1.0mm`, not `1mm`) is the discriminator proving it is a
  string slice, not a `Number` round-trip.
- **The dead-code clause was caught and deleted rather than shipped with a test that cannot go red**
  (LESSONS §66). U5-6/U5-7 pin the proof against the pre-fix body too. Correct call.
- **SR-2's acceptance is met by its second arm** — the row sets remain identical (a CRM ranking
  property), but both replies now carry the N-2 line. SR.md allows exactly this.
- **Backlog exclusions are correct.** B1 (nonsense → ideation, parser non-determinism) is
  `scope: parser` and invisible to a mock — rightly out of a spine slice. B2 (a carried
  `current_message: false` entity generating its own miss line) edits **the same `missResolutions`
  filter**, so sequencing it after this promote is right; on a stale base the two hunks would collide.
  B2's note that N-3 deliberately does not cover it is accurate — N-3 requires *both*
  `_specSearchAnswered` and `_fedFreeTerms(tok)`, and SR-5 shows `Dealer` correctly surviving. That is
  scoping, not omission. I concur with both exclusions.

---

# PROMOTE CHECKLIST — one live write session, two leaves. User-gated; this review authorizes, it does not perform.

**Scope: exactly two leaves on LIVE `9qVyfUxmRQqrpGRMDLRuz`.**
`resolve-entity.parameters.jsonBody` and `compile-current-state.parameters.jsCode`. Target both **by
node NAME** (LESSONS §58c — clone/live ids diverge, and the clone's `resolve-entity` is a NoOp).
Nothing else: not `resolve-entity-clarification`, not any get-results sub, not `tf-message`, not any
node carrying container-status / human-intervened-timeout / access-tier in-flight work.

### 0 — record rollback FIRST (both values decay; re-read at write time)

- Rollback `versionId`: **`469e7259-6cfb-4505-bef4-f37a36bf454f`** (live at review time). **Re-read
  immediately before the write.**
- **Freeze live's two current leaves to files before touching anything** — the repo has the CLONE's
  before-bodies, but **live's `compile-current-state` before-body exists nowhere on disk**. Write
  `resolve-entity.live-before.jsonBody.txt` (expect `51de7f16…`, 886 B) and
  `compile-current-state.live-before.js` (expect `3fa9d170…`, 36983 B) into
  `tests/offline/spec-answer-honesty/`. Without these, a byte-level rollback of the Code node has no
  source; `publish_workflow <prior versionId>` is the whole-workflow fallback.

### 1 — pre-flight gates (abort on any failure; every abort is free)

- `python3 n8n-workflows-init/scripts/export-workflows.py --verify` → clean.
- **Draft == active on the live spine**: LESSONS §23 jq sweep over `get_workflow_details` — require
  **0 differing nodes + byte-identical connections**. A stray draft delta gets published as its own
  semantic-no-op first (§51); never let it ride.
- **Re-assert both targets are unmoved** (§57 — byte-identity claims decay):
  `resolve-entity.jsonBody` sha256 == `51de7f16…`; `compile-current-state.jsCode` sha256 ==
  `3fa9d170…`. If either has moved, **STOP** and re-derive that leaf as *live-now + its hunks*; do not
  ship the frozen after-body.
- **Rebuild `compile-current-state`'s target from live-now, do not use the clone's body.** Apply the
  three anchors from `tests/offline/spec-answer-honesty/ccs-hunks.js`
  (`N3_ANCHOR` → `N3_DECL + N3_ANCHOR`; `N3_FILTER_BEFORE` → `N3_FILTER_AFTER`;
  `N2_ANCHOR` → `N2_BLOCK + N2_ANCHOR`), **asserting each occurs exactly once before substituting**
  and that the file digest changed after (§61b/S9). Then require `diff live → target` = **0 lines
  removed**, 143 added, 2 hunks; `node --check` clean; zero trailing whitespace. Expected sha256
  `9a5e4722…` / 46427 B **only if** live is still at `3fa9d170…` — recompute, don't trust it.
- `resolve-entity`'s target is the frozen
  `tests/offline/spec-answer-honesty/resolve-entity-http.after.jsonBody.txt` (`7ca14cbf…`, 1809 B).
  Re-confirm `diff live-jsonBody → that file` shows **only** the `"limit": 15` comma plus
  `spec_fallback` / `free_terms` / `understand_phrase`.
- **Optional-but-asked-for (§D):** run shape A's read-only `crm-probe.js` with/without parity over
  ~10 phrases including SA-P1's, SR-6's nonsense, and two filler-heavy descriptive phrases, asserting
  no phrase gains rows it did not have. Reads against prod are allowed. **If you skip it, write
  "N-0 ranker-widening: UNVERIFIED at the contract boundary" into the manifest** — never infer it
  from SR-6.
- Confirm live's node identities: `resolve-entity` = `a2bed208-…`, `httpRequest`, credential
  `crm-n8n-auth` `mNsZWyU82NYV58k2`, `retryOnFail: true`; `compile-current-state` = `0804657c-…`,
  `n8n-nodes-base.code`, no credential.

### 2 — transport: ONE file-driven REST GET → replace two leaves → ONE PUT. Never MCP.

- **MCP `setNodeParameter` mangles `\uXXXX` escapes into literal glyphs** — it failed the byte-gate
  twice on the clone build. Both bodies contain them. File-driven only (LESSONS §71 corollary).
- Build the PUT body from a **fresh faithful REST GET of the live spine** (REST GET preserves
  credentials; MCP output does not — §55). Replace only
  `nodes[name=="resolve-entity"].parameters.jsonBody` and
  `nodes[name=="compile-current-state"].parameters.jsCode`.
- **`del(.settings.binaryMode, .settings.timeSavedMode)`** — live carries `binaryMode: "separate"`
  and the public schema rejects it. `settings` is merged, not replaced, so stripping is lossless; the
  400 is pre-write and free.
- **Quote every heredoc delimiter (`<<'PY'`)** — both bodies are `$`-dense with n8n expressions; an
  unquoted heredoc silently corrupts them and the PUT still succeeds (access-tier D14).
- Send the reviewed bytes unmodified. **Validate the payload's semantics before the PUT**, not only
  the round-trip after it — grep the assembled body for `{{ .` and `{{ &&` (the shell-expansion
  tells).
- **A PUT auto-publishes.** There is no staging step. Live's Schedule Trigger is **disabled**; live is
  driven by the dispatcher via `When Executed by Another Workflow`, and there is **no webhook
  trigger** — so expect a clean **200**. **A 409 here is anomalous → HALT.** Do not read it as
  "persisted anyway" (§60 applies only to webhook workflows).
- Do the whole thing in **one PUT**, so there is never a live state carrying shape A without SR-1
  (§E: that intermediate state is the defect the user held for).

### 3 — post-write gates (revert on any mismatch)

- Re-fetch and **byte**-gate both leaves (bytes, not chars — the Code body has 626 multibyte bytes):
  `resolve-entity.jsonBody` == `7ca14cbf…` (1809 B); `compile-current-state.jsCode` == the sha
  computed in step 1. On mismatch, immediately `publish_workflow` the recorded rollback versionId.
- Assert **exactly two** nodes' `parameters` changed vs the pre-PUT GET — param-hash **every** node
  (If, Switch, executeWorkflow `workflowInputs`, httpRequest bodies/URLs, redis lists, triggers), not
  just Code bodies (LESSONS §71: that blindness shipped an outage).
- `connections` **byte-identical**; node count / name set / id set unchanged; no node added, removed
  or renamed.
- **Credential census**: every binding present before is present after, same ids (§55). Confirm
  `crm-n8n-auth` `mNsZWyU82NYV58k2` still on `resolve-entity`.
- **Topology assertion** (§D18): no node reachable from itself; `tf-message` still dominates
  `compile-current-state` and `resolve-entity` on the main-only graph (re-run the removal test — it is
  three lines and it is the premise the whole N-2/N-0 accessor rests on).
- Egress containment on live unchanged: `send-message-files/images/video`, `update-human-intervened`
  inventory identical to pre-PUT.

### 4 — verify on the paths you changed, not the happy path (LESSONS §56)

Record the **verbatim** reply for each. Grep the block header `Couldn't find these:` — **not** the
clone-spelled `" — not found."` separator, which live does not use (§B6).

1. **The widened-arm / contradiction turn — this is the acceptance criterion the whole review turns
   on.** A two-token descriptive + nonexistent-code question (`wall hung basin and SRTZZ999`). Must
   render the spec answer, must still carry the `SRTZZ999` miss line, and must **not** carry a
   `wall hung basin` miss. Live's rendering will read `"SRTZZ999": not found.`
2. **The N-2 turn.** `double bowl kitchen sink with thickness 1.0mm` → the reply must contain
   `thickness isn't recorded for these products, so I couldn't narrow by 1.0mm.` — **verbatim, with
   the unit and the trailing zero**. A bare `1.` is the rev-1 defect and a hard fail.
3. **A clean descriptive turn.** `wall hung basin 600mm` → `match_tier: 'spec_search'` rows, and none
   of `Couldn't find`, `did you mean`, `Multiple matches found`, an escalation offer.
4. **A code turn.** `check stock SRTWC286` → unchanged; no N-2 line, no spec rows, the code absent
   from `free_terms`.
5. **A total-miss turn.** Still reaches not-found/escalate with **live's** existing wording.
6. **A multi-entitlement contact**, if one is reachable — live's `compile-current-state` carries the
   promo-picker/tier-ask arms the clone does not, and §71's outage was invisible to the dev contact.
   If not exercisable, record **unverified**; never infer it from a clean diff.

### 5 — after

- Refresh the export (`export-workflows.py`, no `--verify`), commit the new `versionId`.
- Append the promote to **both** manifests with both shas and the rollback pointer; mark shape A's
  `dac04eb0…` post-write value **SUPERSEDED by `7ca14cbf…`**.
- **Fix CLAUDE.md** (F1): the clone's 9 sendmsg callers target `aQUmwMVplmNcyUVc`
  (`sub-sendmsg-QRCHUNK`), not `ublq9nSlrpz63xan`; and the clone's get-results fork is
  `t4QvrtrPnTwRU6br`, not `rysSPgUssLDf6xJc`.
- Write F2's closure into the SR rollup: the 14 poll ids, and `12309138` @ 09:20:05.020Z attributed to
  live contact `445239409`.
- **Watch post-promote, for the reasons in §D:** escalation rate (turns that used to dead-end now
  auto-answer with up to 15 spec rows), and any answer to a nonsense/filler-heavy phrase that would
  previously have returned nothing.
- Then, in order: B2 (carried-entity miss line — same filter, needs this promoted first), the SR-6a
  ideation write-surface audit (F5), and the S4 instrument fix (F3).

---

## §G — N-0 CRM parity probe (main session, 2026-08-13) — the reviewer's step-1 item, EXECUTED

`tests/offline/spec-answer-honesty/crm-parity-n0.js`, read-only through the zz-crm-probe webhook
(proxy deactivated after). Closes the "n=1 growth evidence" gap: N-0's widened `free_terms` was
never measured at the CRM boundary by any SR case.

| id | direction | free_terms sent | result |
|---|---|---|---|
| P-1 | shrink | `["do you have wall hung basin 600mm"]` | lost 0, gained 0 vs shape-A form |
| P-2 | shrink | `["please get me double bowl kitchen sink with thickness 1.2mm"]` | lost 0, gained 0 |
| P-3 | growth | `["please get me a purple levitating sink"]` | 0 rows (shape A: 0) |
| P-4 | growth | `["hello can you please help me thanks"]` | 0 rows (shape A: 0) |
| P-5 | growth | `["ok"]` | 0 rows (shape A: 0) |

Growth evidence is now n=3 at the contract boundary (pure filler, a greeting, and a two-letter
utterance) plus SR-6 end-to-end — the floor holds; filler words do not manufacture an answer.
Shrink is measured, not merely argued from additivity. The checklist's "record UNVERIFIED if
skipped" branch does not apply.

## §H — /codex-review second opinion on the SR hunks (2026-08-13)

Codex (OpenAI, read-only, self-contained: both hunks + the harness accessor). Two candidates,
**both VERIFIED TRUE mechanically** — neither is a crash, neither changes which products are
returned; both make the N-2 sentence quote the wrong span:

1. **`_numSpan` accepts a number preceded by `-`.** The guard rejects `[0-9A-Za-z.]` before the
   match, so a hyphen-delimited code fragment passes: in `"do you have ABC-1.2MM in stock"` the
   char before `1.2` is `-`, and `1.2MM` is then quoted as if it were the customer's spec value.
   Reproduced: `/[0-9A-Za-z.]/.test('-') === false`.
2. **First same-valued span wins, regardless of unit family or distance from the key.** In
   `"2m hose thickness 2mm"` the scan matches `2m` (index 0, carries a unit, so the `needUnit`
   pass accepts it) and renders *"couldn't narrow by 2m"* for a **thickness of 2mm**. Reproduced:
   first match index 0.

Both are echo-only defects in an explanatory sentence whose entire purpose is not misleading the
customer, so they are being fixed rather than accepted: quote by PROXIMITY to the unmet key's own
words (mirroring how the CRM binds a number to a key in the first place), reject spans whose
surrounding token carries letters across a code separator, and when the choice is ambiguous fall
back to "by it" rather than guessing. Not blocking in severity; blocking in principle for this
particular slice.

---

# §I — DELTA REVIEW: does the §A–§H APPROVE extend to clone `c97f2f8f` (revs 3 + 4)?

Reviewer: `sorento-reviewer` · 2026-08-13 (second pass)
Reviewed: clone `8ed4e464` → `48aaa6fd` (rev 3, N-2 span selection) → **`c97f2f8f`** (rev 4, N-1a "Matched on").
Export `--verify` clean at review time: live `469e7259` (**unmoved** since §B1), clone `c97f2f8f`.

## VERDICT: **APPROVE-EXTENDED** — with ONE blocking pre-promote gate (**G1**, §I-9) and a revised checklist.

The code is approved. The mechanics of both revisions are stronger than rev 2's were, and I verified
them myself rather than accepting them (§I-1 … §I-7). The one thing I will not let ride is an
**evidence** hole, not a code defect: the house-preference key in `matched_specs` (diff §3b finding 1)
is materially more likely than the run artifacts suggest, and the decisive observation was not made.
It is closable by one read-only probe, and its failure branch is free — rev 4 is provably separable
from rev 3 (§I-1), so the fallback is "promote without the N-1a hunk", not "re-do the slice".

---

### I-1 — Rev 4 is **provably** purely additive over rev 3 (claim verified, not accepted)

```
rev-4 deployed body  MINUS  ccs-hunks.N1A_BLOCK   ==   7959776fa7ce4a0f… , 46933 B
rev-3 deployed body (manifest / tester-derived)   ==   7959776fa7ce4a0f… , 46933 B   ✅ byte-identical
```
`N1A_BLOCK` occurs **exactly once** in the rev-4 body. So N-0, N-2 and N-3 are untouched by rev 4 —
not re-worded, not re-anchored, not re-ordered — as a measured fact rather than a coder statement.
Two consequences: everything §A–§H approved about those three hunks carries forward unchanged, and
**the N-1a hunk is cleanly excisable at promote time** (see G1's fallback target in the checklist).

`resolve-entity-http.jsonBody` is still `7ca14cbf…` / 1809 B on the deployed clone — I re-derived it
from the export, independently confirming "N-0 not re-touched" for revs 2, 3 **and** 4.

### I-2 — The hunks still re-apply to LIVE, re-derived at rev 4

| | value |
|---|---|
| live `compile-current-state` (`0804657c-…`) | `3fa9d17071a81ada…` · **36983 B** — unmoved since §B1 |
| anchors in live's body | `N3_ANCHOR` ×1 · `N3_FILTER_BEFORE` ×1 · `N2_ANCHOR` ×1 before the N-1a splice **and ×1 again before the N-2 splice** |
| **live + hunks target** | **`f966b6541135b824900accde7ffd2dfbd46260a8abfe4eb774047bf13aef549b` · 56719 B** |
| delta | **+19736 B — byte-identical to the clone's own before→after delta (32958 → 52694)** |
| `diff live → target` | **4 hunks · 314 lines added · 0 lines removed** |
| syntax / hygiene | `node --check` clean · **zero** trailing-whitespace lines · multibyte overhead 574 B (bytes−chars) ⇒ the byte-gate mandate stands |

`9a5e4722…` / 46427 B from the original checklist is **SUPERSEDED** — do not use it.

### I-3 — The rev-4 diff-doc's own open question about LIVE ordering: **closed, in live's favour**

§5 asked to "confirm the emitted order on live's body, since the clone cannot show it". Done, from
live's bytes: live has exactly **one** assignment to `userResponse` (L101) and **four** appends —
L250 (P/S), L255 (Tip), L297 (`No … records found for`), L529 (`Couldn't find these:`). All four are
`+=` and all four are **below** the friendly-domain anchor at L237 where the N-1a + N-2 blocks land.
Live's promo-picker / tier-ask arms do **not** append to `userResponse` at all. So the live reading
order is exactly the clone's SR-10 order — rows → `_Matched on: …_` → N-2 → P/S — and nothing on
live can clobber or precede either line.

### I-4 — Behavioural proof on LIVE's body, repeated at rev 4 (the §B5 discipline)

Rebuilt the offline suite with **live's body as the BEFORE/AFTER base** and ran it:
**133 passed / 1 failed**, the single failure being `D1` (the export-path artifact of the scratch
copy — same as rev 2's). The rev-3 span selection and the rev-4 N-1a line behave identically when
spliced into live's body.

The §B6 miss-renderer drift is **unchanged and still a live-regression trap**: live carries exactly
1 occurrence each of `": not found."` and `", did you mean:"` against the clone's `" — "` forms;
normalising only those two pre-existing separators is what makes the live-based run green. That
normalisation is **not a hunk and is not promoted**, and the post-promote greps must key on the block
header `Couldn't find these:`, never on the clone-spelled separator.

### I-5 — Instruments re-run by me, and one claim the summary output cannot show

`node probe.js` → **134 passed / 0 failed**, `D1: DEPLOYED (sha 82707a95a7c6)`.
`bash mutate.sh` → **22 caught / 0 survived / 1 VOID** (the stale-anchor selftest firing as designed).

`mutate.sh` prints only `grep -m3 '^FAIL'`, so the diff doc's "each new mutant kills its *intended*
assertion" is invisible in its own output. I re-ran the three rev-4 mutants with the full failure
list:

| mutant | intended kill | observed |
|---|---|---|
| m20 (free_terms rendered as a key) | U6-3 | ✅ U6-3 red (+ U6-1/9/11/19/23 and the nine re-pointed) |
| m21 (zero-key guard removed) | U6-15..18 | ✅ U6-15, U6-16 ×4, U6-17 red (+ U3-8, U3-9) |
| m22 (dedup removed) | U6-5 | ✅ U6-5 red (+ U6-1/11/19/23 and the nine re-pointed) |

That run also settles §3b finding 2 empirically: **the nine re-pointed N-2/N-3 assertions were not
weakened.** `afterLessN1A()` goes red under m20 and m22 (U4-7 ×4, U4-15 ×3, U5-5, U5-7) — it
subtracts one exact string and throws unless it appears exactly once, so a malformed or duplicated
N-1a line still turns them red instead of being swallowed. Re-pointing was the correct call
(LESSONS §73 rule 1) and it kept its teeth.

### I-6 — Clone containment re-asserted at `c97f2f8f` from the export, not inherited

148 nodes · no dangling connection refs · `send-message-files` / `-images` / `-video` /
`update-human-intervened` / `save-session-vars` **all still 0 inbound** · `compile-current-state`
and `tf-message` inbound sets **identical to my §B7 table**. Nothing in revs 3–4 touched a node,
an edge or a credential.

### I-7 — Zero egress: upgraded from *claimed* to *measured* on both new lanes

I did not score this from the run files alone. Direct reads:

- **rev 4, SR-10 (`12323456`)** — trigger json carries `test_mode: true, test_run_id:'sr10r4-20260813'`
  (S5 direct, not inferred). None of the five egress nodes appear in runData. The sendmsg call
  resolves to sub-execution **`12323475` on `aQUmwMVplmNcyUVc`**, and in that sub-execution
  **`Send a Message`, `HTTP Request`, `Send Template` and `Find a Message` did not execute at all** —
  the carried payload's `pairedItem.sourceOverwrite` names **`guard-record-text`** as its producer.
  The guard is *measured* dominating, not argued, and the payload is byte-consistent with SR-10's
  recorded reply (`_Matched on: bowl count._` + the 1.2mm N-2 line).
- **rev 3 chat lane (`12316566`)** — same shape: sendmsg sub `12316578` on `aQUmwMVplmNcyUVc`,
  zero credentialed nodes executed, `lastNodeExecuted: log-chat-history-n8ntest`; no egress node in
  the parent's runData.
- **S7b** — the SR-1b rollup's sweep is the right instrument and is correctly scoped: 8 consumer
  polls, 11:57:50Z–11:58:25Z, **0 unretrievable**, all `LLEN 0` with empty pops, fully containing all
  three case spans with ~5 s margin either side. The F2 failure shape (a window that does not cover
  its own cases) is **not** repeated. S7a confirmed individually per case against `tWm5DYLxfypmVC1T`
  with `turn_id == own parent execution id`.

**Zero egress is RE-CONFIRMED for revs 3 and 4.**

### I-8 — The rev-3 seat deviation: **the evidence stands, and it is not load-bearing** — with one correction

Two reasons it stands: (a) the promote candidate is **rev 4**, and rev 4 was run in the tester seat,
in `uac` mode, with the full §0 S1–S7 and a covering S7b sweep; (b) by I-1, rev 4's body **contains
rev 3's bytes unchanged**, so every rev-3 behaviour lives inside the artifact that got the proper
pass. The maindelta file states its own limits accurately and does not overclaim — that is the
correct way to record a deviation.

One correction to how it should be *cited*. I read `12316566`'s trigger json directly:

```
{contact:"437264483", test:null, test_run_id:null, started_at:null,
 test_mode:null, scope:null, mock_parser_output:null, mock_reformulator_output:null}
```

So on the chat-console lane **`test_mode` is not merely unrecorded, it is `null`** — S5 is *false*
there, and there is no `test:egress:{run_id}` log at all. Containment on that lane rested entirely on
the fail-closed layer (per-caller hardcoded `is_test:true` + the orphaned egress nodes), which is the
layer CLAUDE.md calls primary and which I measured holding (I-7). **No safety finding** — but the
chat lane must never be cited as §0-compliant evidence for anything, and it should not become a
habit: a lane with no egress log cannot produce the S1/S3 artifact the checklist asks for.

What rev 3 uniquely contributes and rev 4 does **not** re-prove: **CDX-2** — `2m flexible hose with
thickness 2mm` → `…so I couldn't narrow by them.` on a real execution, i.e. the ambiguity fallback
declining to guess. N-2's bytes are unchanged since (I-1) and U4-30/31/32 cover it offline, so I
accept it as proven-once. Worth keeping in the post-promote list rather than re-running now.

### I-9 — 🔴 The one blocking item: **G1 — the house-preference key is likelier than the artifacts imply, and the decisive case was not run**

The coder raised this honestly (§3b finding 1) and the tester flagged it prominently rather than
scoring SR-11 as a clean pass. Both were right to. I went to the CRM source and it is worse-shaped
than "a documented risk":

- `product_spec_search.py:695-702` — for every registry row carrying `value_weights`, if the customer
  did **not** state that key and the ROW holds the preferred value, `matched.append(key)`. Note the
  half that *is* safe: the bonus lands on `score` and **not** on `evidence`, so a house preference
  can reorder but cannot lift a row over the relevance floor.
- The same file's floor comment records the measurement *"every Sorento product in the catalog
  cleared this line on the house preference alone"* — i.e. **house preferences are configured, and the
  preferred value is the house brand.**
- **SR-10 and SR-11 returned CABANA and BRAVAT rows** — precisely the shape that structurally cannot
  see this. The untested case is *a spec query answered by SORENTO products*, which is the common
  case. Its customer-visible outcome is `_Matched on: brand._` (or `_Matched on: brand and mounting._`)
  to someone who never named a brand — the exact fabrication class this slice exists to remove,
  inverted. And since `matched_specs` is `sorted(set(matched))` (line 732, alphabetical within a row),
  `brand` would sort to the **head** of the sentence.
- **A cheaper closure than either option the diff doc offers.** `search_specs` already returns
  **`asked_for`** — built from `specs` *after* free terms are resolved into keys, so it is exactly
  "the keys the customer's own words account for" (which is why SR-11's `mounting` would survive it).
  `references.py` emits `unmet` as `spec_unmet` and simply never emits `asked_for` (grep: zero
  occurrences in that file). **One CRM line** — `result["spec_asked"] = found["asked_for"]` beside
  `result["spec_unmet"]` — turns N-1a's filter into `_keys ∩ spec_asked` and closes the finding by
  construction, with `_MACHINERY_KEYS` kept as the fallback. Smaller than "mark preference-derived
  keys on the row", and it does not need C-3.

**G1 (BLOCKING, pre-promote, ~one probe).** Observe `matched_specs` for a descriptive spec phrase
whose answer is **house-brand (Sorento) rows**. Either instrument is acceptable:
 - *preferred, read-only:* the §G route — `tests/offline/spec-answer-honesty/crm-parity-n0.js` style
   call through the `zz-crm-probe` webhook (reactivate, probe, deactivate), reading `matched_specs`
   off the returned spec rows. Reads against prod are allowed.
 - *or* one clone case in the tester seat (`uac`, `previous_conversation_state:{}`), recording the
   rendered `_Matched on: …_` line verbatim.

**PASS** = every key in the union is accountable to the customer's own words → promote both hunks.
**FAIL** (any unstated key, `brand` or otherwise) = promote **without the N-1a hunk** (target
`3475573988f8ba861f8fdf131647e7160bb5cb9c53ff5a37dafc49d6bd27b9e2` · 50958 B — live + N-3 + N-2 only)
and file the `spec_asked` ask with the CRM side. N-0/N-2/N-3 ship either way; they are unaffected.

Do **not** infer G1 from SR-11. SR-11 is a genuine negative observation on a catalogue slice that
cannot exercise the mechanism, and the tester said so in those words.

### I-10 — Scope, tier and the mutant renumbering

- **Scope unchanged and correct.** Spine-only; revs 3 and 4 are one node, one leaf. No get-results
  sub touched — live's main read path `rysSPgUssLDf6xJc` is untouched, and the clone's
  `t4QvrtrPnTwRU6br` was only read from. SR-2 (N-1/N-4) not started. Plan §2's blast-radius gate is
  respected.
- **Tier matches what was tested.** Rev 4's three cases ran the real reformulator (fork
  `wI5RkNGW3EOJfBdo`) and the real CRM read — parser/get-results tier, correctly, since N-1a's input
  is a live resolver envelope no mock could shape faithfully.
- **The m19 collision is handled correctly and visibly.** `mutate.sh` ships **m20/m21/m22**, says so
  at the splice, and the diff doc maps them to SR.md's m19/m20/m21; I confirmed each kills its
  intended assertion (I-5). One-directional debt remains: **`tests/uac/SR.md` still names them
  m19–m21**, so a tester reading only SR.md will mis-map. Fix SR.md (add the mapping line) — not the
  code, which is right.
- **§D is closed by §G**, not by SR-6: the N-0 growth direction is measured at the contract boundary
  at n=3 plus two shrink controls. Nothing in revs 3–4 re-opens it (`free_terms` untouched).

---

# PROMOTE CHECKLIST — REVISED for revs 3 + 4 (supersedes the checklist above)

Everything in the original checklist stands **except** the values and steps restated here. Scope is
still exactly two leaves on LIVE `9qVyfUxmRQqrpGRMDLRuz`, targeted **by node NAME**:
`resolve-entity.parameters.jsonBody` and `compile-current-state.parameters.jsCode`.

### 0 — rollback, recorded FIRST

- LIVE rollback `versionId`: **`469e7259-6cfb-4505-bef4-f37a36bf454f`** (still current at this
  review — but **re-read immediately before the write**).
- Clone rollback chain, newest first: **`c97f2f8f` → `48aaa6fd` → `8ed4e464`**.
- Freeze live's two current leaves to files first (unchanged from the original step 0):
  `resolve-entity.live-before.jsonBody.txt` (`51de7f16…`, 886 B) and
  `compile-current-state.live-before.js` (`3fa9d170…`, 36983 B). Live's pre-change Code body exists
  **nowhere on disk** until you do this.

### 1 — pre-flight gates (abort on any failure; every abort is free)

- **G1 first (§I-9).** Run it, record the key set verbatim, and take the PASS or FAIL branch. If it
  is skipped, the promote is **not** authorized for the N-1a hunk — ship the FAIL-branch target
  instead. Never infer G1 from SR-11.
- `export-workflows.py --verify` clean · draft==active on the live spine (LESSONS §23 sweep, 0
  differing nodes + byte-identical connections; stage any stray draft delta as its own no-op publish).
- **Re-assert both live targets are unmoved:** `resolve-entity.jsonBody` == `51de7f16…`;
  `compile-current-state.jsCode` == `3fa9d170…`. If either moved → STOP and re-derive from live-now.
- **Rebuild `compile-current-state`'s target from live-now** with `ccs-hunks.js`, in **this order**
  (the order is load-bearing — it is what puts N-1a above N-2):
  1. `N3_ANCHOR` → `N3_DECL + N3_ANCHOR`
  2. `N3_FILTER_BEFORE` → `N3_FILTER_AFTER`
  3. `N2_ANCHOR` → **`N1A_BLOCK + N2_ANCHOR`**
  4. `N2_ANCHOR` → **`N2_BLOCK + N2_ANCHOR`**
  **Assert the anchor occurs exactly once before EACH substitution — the friendly-domain anchor is
  asserted TWICE now, not once** — and assert the digest changed after each (§61b/S9).
  Then require: `diff live → target` = **4 hunks · 314 added · 0 removed**; `node --check` clean;
  zero trailing whitespace; **sha256 `f966b654…` / 56719 B / +19736 B** — recompute, do not trust the
  number if live has moved.
  *G1-FAIL variant:* omit step 3 only. Expected **`34755739…` / 50958 B**, 3 hunks, 0 removed.
- `resolve-entity`'s target is unchanged from the original checklist:
  `resolve-entity-http.after.jsonBody.txt` (`7ca14cbf…`, 1809 B); re-confirm the diff is **only** the
  `"limit": 15` comma plus `spec_fallback` / `free_terms` / `understand_phrase`.
- §D's CRM parity item is **closed by §G** — no longer a step-1 item.

### 2 — transport (unchanged)

ONE file-driven REST GET → replace the two leaves → ONE PUT. Never MCP (it mangles `\uXXXX`).
`del(.settings.binaryMode, .settings.timeSavedMode)`. Quote every heredoc delimiter (`<<'PY'`) and
grep the assembled body for `{{ .` / `{{ &&` before sending. Live has **no** webhook trigger and its
Schedule Trigger is disabled → expect a clean **200**; **a 409 is anomalous → HALT**. One PUT, so
there is never a live state carrying shape A without SR-1.

### 3 — post-write gates (revert on any mismatch)

Unchanged, with the new expected value: byte-gate `compile-current-state.jsCode` == the sha computed
in step 1 (`f966b654…`, or `34755739…` on the G1-FAIL branch) and `resolve-entity.jsonBody` ==
`7ca14cbf…` / 1809 B. Then: param-hash **every** node and require exactly two changed (LESSONS §71);
`connections` byte-identical; node/name/id sets unchanged; full credential census (`crm-n8n-auth`
`mNsZWyU82NYV58k2` still on `resolve-entity`); topology assertion (no self-reachable node;
`tf-message` still dominates `compile-current-state` and `resolve-entity` by the removal test);
egress inventory identical to pre-PUT.

### 4 — verify on the paths you changed (LESSONS §56) — **two items added for N-1a**

Record the **verbatim** reply for each. Grep the block header `Couldn't find these:`, never the
clone-spelled `" — not found."` separator (§B6/§I-4).

1. **The contradiction turn** — `wall hung basin and SRTZZ999`: spec answer renders, `SRTZZ999` miss
   line survives, **no** `wall hung basin` miss. (Live spells it `"SRTZZ999": not found.`)
2. **The N-2 turn** — `double bowl kitchen sink with thickness 1.0mm` → verbatim
   `thickness isn't recorded for these products, so I couldn't narrow by 1.0mm.` A bare `1.` is the
   rev-1 defect and a hard fail.
3. **NEW — the N-1a turn.** The same reply must carry **exactly one** `_Matched on: …._`, positioned
   **between** the product rows and the N-2 line. **Record the key set verbatim** and re-check it
   against G1: any key the customer's words cannot account for on a live turn ⇒ revert the N-1a hunk
   (one-leaf, `34755739…`), do not "watch it".
4. **NEW — the N-1a no-op turn.** `check stock SRTWC286` → **zero** occurrences of `Matched on`
   anywhere, and no N-2 line; the code absent from `free_terms`.
5. A clean descriptive turn (`wall hung basin 600mm`): `spec_search` rows, and none of
   `Couldn't find`, `did you mean`, `Multiple matches found`, an escalation offer — **plus** at most
   one `_Matched on:` line.
6. A total-miss turn → not-found/escalate with **live's** existing wording.
7. **A multi-entitlement contact**, if reachable — live carries promo-picker/tier-ask arms the clone
   does not (§71's outage was invisible to the dev contact). Per §I-3 those arms make no
   `userResponse` append, so N-1a/N-2 cannot be clobbered by them; confirm the reply is unchanged in
   shape. If not exercisable, record **unverified** — never infer it from a clean diff.

### 5 — after

- Refresh the export, commit the new `versionId`; append both shas + the rollback pointer to both
  manifests; mark `9a5e4722…` (rev-2 target) and shape A's `dac04eb0…` **SUPERSEDED**.
- **Fix CLAUDE.md** (F1) — clone sendmsg fork `aQUmwMVplmNcyUVc`; clone get-results fork
  `t4QvrtrPnTwRU6br`. *(Already partially applied — re-check both rows.)*
- **Fix `tests/uac/SR.md`** — its SR-1b table names the mutants m19–m21; they ship as **m20/m21/m22**
  (rev 3 had already taken `m19`). One mapping line, so the next tester is not left guessing (§I-10).
- **File the CRM ask from §I-9**: emit `result["spec_asked"] = found["asked_for"]` beside
  `result["spec_unmet"]` in `references.py`; then N-1a filters `_keys ∩ spec_asked` and the
  house-preference finding closes by construction. This is smaller than the C-3 rider the diff doc
  proposes and should replace it.
- Write F2's closure into the SR rollup (the 14 poll ids; `12309138` @ 09:20:05.020Z → live contact
  `445239409`).
- **Watch post-promote:** escalation rate (§D); any answer to a nonsense/filler-heavy phrase that
  previously returned nothing; and the `_Matched on:` key sets on real traffic for a day (the G1 risk
  is *data*-triggered — a registry `value_weights` edit can turn it on with no n8n change).
- Then, in order: **B2** (the carried-entity miss line — same filter, needs this promoted first; now
  reproduced twice, with `Dealer` and with `2m flexible hose`), the SR-6a ideation write-surface
  audit (F5), and the S4 instrument fix (F3).

---

**Authorization.** This review authorizes the promote of `resolve-entity.jsonBody` + the rev-4
`compile-current-state.jsCode` (or the G1-FAIL variant) to live `9qVyfUxmRQqrpGRMDLRuz`, **subject to
G1 and to the gates above**. It does not perform it. Promotion remains user-gated, and no workflow
was edited in the course of this review.

---

## §J — G1 EXECUTED, PASS (main session, 2026-08-14)

`tests/offline/spec-answer-honesty/g1-house-brand-probe.js`, read-only via the zz-crm-probe proxy
(deactivated after). Walked brand-free spec phrases until the answer contained house-brand rows:

| phrase | spec rows | sorento rows | matched_specs sets observed |
|---|---|---|---|
| rain shower set | 10 | **10** | `["free_terms","product_type"]` |
| concealed cistern | 5 | **4** | `["mounting","product_type"]` |
| wall hung toilet bowl / stainless steel kitchen sink / basin tap | 25 | 0 | mounting / material / product_type (+free_terms) |

**Zero of the 14 Sorento rows carry an unstated `brand` key.** The §I hypothesis (house
preference injecting `brand` into matched_specs on Sorento-answered turns) did not manifest on
the live deployed CRM — consistent with the preference boosting `score` without registering as a
customer-earned match on this build. G1's FAIL branch (promote without N-1a) is NOT taken; the
**full rev-4 body promotes**. The `spec_asked` one-line emission remains the right structural
closure and has been suggested to the CRM side for their S4 slice; SR-11's verbatim-key review
trigger stays in force until it ships.

With §I's APPROVE-EXTENDED and this gate green, the package (SA + SR revs 1–4, live target body
`f966b654…`/56719 B per §I) is **promote-ready. Promotion remains user-gated.**
