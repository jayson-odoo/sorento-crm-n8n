# company-pick parser promote plan

**scope: `parser`** (see the recommendation in §11 - the recommended variant is `deterministic`).
Planner, 2026-08-25. DOCS ONLY. No workflow was edited to produce this.

Goal: close the C4 narrowing on `clarify-company-gate` by giving live a handler for a
company-name reply on an open escalation offer. Part 2 of three (part 1 = the
`escalation-context` cpickRow consumer, in flight; part 3 = the customer-facing copy).

---

## 0. Verdict up front

Three findings change the shape of the job the captain scoped.

1. **The extraction is safe while the other session holds the fork, but only because you must not
   read the fork.** `export/sub-semantic-parser-FORK/` is committed at fork versionId
   `339a66d9`, which is the fork **before** the other session's 03:23Z edit. Its `output_exchange`
   and `suggest-follow-up` bodies are byte-identical to the fork live right now (sha-verified,
   §2), and its `systemMessage` is the clean 587-line pre-contamination text. Port from the export,
   never from `get_workflow_details wI5RkNGW3EOJfBdo`, and the other session's +15 lines are
   unreachable by construction. Contamination becomes a mechanical grep, not a judgement call.

2. **There is a smaller change, and it is not a spine change: ship the `output_exchange` half
   with no prompt change at all.** The deterministic tier of `_coCompanyPick` already resolves
   "mocha" / "srt" / "mocha please" / "yes mocha" without any help from the LLM (§11.2 proves
   the single-token path is unguarded by `domainQ`). The prompt only adds a *semantic fallback*
   whose own comment says "Deterministic wins." That variant is `deterministic` scope, is 100%
   offline-unit-testable against 78 existing fixtures at zero token cost, and has a blast radius
   of one `if` block instead of the whole corpus. **Recommended.** Ship the prompt half later,
   separately, measured.

3. **The fork is not an ancestor of live.** `suggest-follow-up` on the fork is a strict *subset*
   of live: live gained a unicode-dash normalizer (live 56 lines, fork 35) that the fork never
   took. Any "sync the node from the fork" move deletes a live behaviour with its own unit test.
   Answer to question 4: company-pick needs nothing from `suggest-follow-up`. Do not touch it.

---

## 1. Safety binding (§0 S1-S6, non-negotiable)

Every case below inherits the standing gate. Restated because this change is one node away from
`Call 'sub-human-intervention'`, which performs a real round-robin assign with a staff
email/WhatsApp ripple:

- **S1** No WhatsApp/comment send to a real respond.io contact.
- **S2** No assignment, SLA row, or PIC comment.
- **S3** No write to prod CRM (`respond_contacts.session_vars`, conversation-variables PUT).
- **S4** Every clone sub-call passes `is_test=true`; egress nodes stay orphaned.
- **S5** Assert the redis egress log `test:egress:{test_run_id}` after every clone run;
  a case is FAIL if any `would_send`/`would_write` records an unexpected target.
- **S6** CRM reads against prod are allowed; writes are not.

Change-specific addition, **S7**: no case in this plan may end with
`escalation.is_escalation_confirmation === true` reaching `Call 'sub-human-intervention'` on the
live spine. All confirmation-path assertions are made on the clone or offline.

---

## 2. Ground truth, verified 2026-08-25 14:48-14:55Z

| thing | id | version | fact |
|---|---|---|---|
| live parser `sub-semantic-parser` | `XTODTw-dJcV0uRdC056hG` | `177c50a9` | 7 nodes, systemMessage **484** lines, `company_pick` **0** |
| parser fork (other session active) | `wI5RkNGW3EOJfBdo` | `5dc53753` | 8 nodes, systemMessage **602** lines, `company_pick` **6** in prompt |
| fork **export in git** | same id | `339a66d9` | systemMessage **587** lines, `company_pick` **6** in prompt |
| live spine | `9qVyfUxmRQqrpGRMDLRuz` | `704c68dc` | 145 nodes |

Body sha (first 16 hex) - **export equals live for all four bodies**:

```
output_exchange     fork-live 5fad97d130690de6 == fork-export 5fad97d130690de6
output_exchange     live-live ac4b43f846644891 == live-export ac4b43f846644891
suggest-follow-up   fork-live 5e659811d493fe0e == fork-export 5e659811d493fe0e
suggest-follow-up   live-live 338ea668d463815a == live-export 338ea668d463815a
```

So the other session's 03:23Z edit was **systemMessage-only**. The code half of the extraction
carries zero contamination risk today. Re-run these four shas at build time; if
`fork-export != fork-live` on `output_exchange`, the other session has started editing code and
this plan must be re-cut.

Prompt delta, live -> fork-live: **129 lines added, 11 removed, net +118** (484 -> 602).
The captain's "+129" is the raw added-line count. Correct.

Fork `output_exchange` is **1951** lines vs live **1479**: 22 hunks, +520/-48. Company-pick is
6 of those 22 hunks. The other 16 are the axis/broaden/date-window/customer-scope work and the
partial-reply pick. Not ours.

**Premise correction:** the working tree already carries an uncommitted edit to
`export/live-spine-sorento-consume-main/nodes/escalation-context.js` (plus `workflow.json` and
`MANIFEST.json`, `locally_edited: true`). That is part 1, in flight, in this same worktree. Live
@ `704c68dc` does **not** have `cpickRow` yet. Do not stage or revert those files.

---

## 3. Partition of the +129 systemMessage lines

Line numbers are in the **fork-live 602-line** prompt (`F`), which is the numbering the captain
quoted. All six `company_pick` prompt references are inside bucket (a).

| bucket | fork lines | added | removed | what |
|---|---|---|---|---|
| **(a) company-pick** | F511-F544, F600 | **35** | 1 | `== COMPANY-NAME REPLY ON AN ESCALATION OFFER ==` (34 lines incl. its trailing blank) + the `escalation` schema line |
| **(b) other session** | F110-F117, F210-F216 | **15** | 0 | customer take/buy -> order (8); `"quantity"` requested_attribute (7) |
| **(c) domain-continuity-carry** | F153-F176, F268 | **25** | 3 | `== BARE ENTITY CONTINUATION ==` + the message-type rule-3 clause that points at it |
| **(d1) escalate-word** | F27-F31, F266 | **6** | 1 | `ESCALATE-WORD:` under AFFIRMATION + the message-type rule-1 rewrite |
| **(d2) customer-vs-supplier delivery** | F100-F105, F119-F123 | **11** | 5 | order = GOODS GOING OUT / incoming = GOODS COMING IN rewrite |
| **(d3) broaden-axis** | F257-F258, F374-F375, F386-F417, F579 | **37** | 1 | `== BROADEN AXIS ==`, the `scope_intent` and `entity_op "clear"` carve-outs, the schema line |
| | | **129** | **11** | |

Bucket (b) is confirmed exactly, not inferred: `diff sys.export.txt sys.live.txt` yields precisely
those two hunks and nothing else.

### 3.1 Lines that serve two buckets

Only one line pair genuinely does, and it is a blocker you must handle explicitly.

**F541-F542, inside bucket (a), depends on bucket (d1).** Verbatim:

```
  - Otherwise, a reply during a pending offer that names no company, no listed member, no value of its
    own and is not a yes/no (a bare fragment, small talk - but NOT the escalate word, which is a yes per
    AFFIRMATION/ESCALATE-WORD) is NOT a new business query and NOT a decline:
```

`AFFIRMATION/ESCALATE-WORD` is the bucket (d1) section at F27-F31, which live does not have.
Porting (a) alone leaves the model reading a cross-reference to a section that does not exist.

**Do not fix this by also porting (d1).** (d1) is a live-write behaviour change of its own: it
makes the bare word "escalate" set `message_type = request_for_help` (F266: "whether or not an
escalation was offered before"), which fires `If2` and opens the escalation lane on turns that
never had an offer. That is a new path to a real assign, it has nothing to do with company picks,
and it must be reviewed on its own merits.

**Fix instead by de-referencing.** In the ported text, replace

`(a bare fragment, small talk - but NOT the escalate word, which is a yes per`
`    AFFIRMATION/ESCALATE-WORD) is NOT a new business query and NOT a decline:`

with

`(a bare fragment, small talk - but NOT a yes or a no in any form) is NOT a new business query`
`    and NOT a decline:`

This is a two-line mechanical edit that preserves the rule and drops the dangling pointer.
It must be reviewed as a deliberate divergence from the fork text, and recorded as such.

### 3.2 One-directional references that are fine

- **F170-F173** (bucket c) forward-references `COMPANY-NAME REPLY`. We are porting (a) and not
  (c), so the pointer's target arrives first. If (c) ever ships alone, it dangles - note it in
  the domain-continuity plan, not here.
- **F532-F539** ("A VALUE IS NOT A FRAGMENT") is physically in bucket (a) but is *behaviourally*
  a slice of bucket (c): it tells the model to set `entity_op = "replace_combine"`, carry the
  previous turn's `domain_hint`/`intent_hint`, and classify `business_query` whenever a concrete
  value is named. It is scoped by the section header to a pending offer, but it is the one place
  where bucket (a) alone changes behaviour on turns that are not company picks. **This is the
  clause to watch in the acceptance replay** (§8).

---

## 4. The systemMessage hunks to port, as anchors

Two hunks. Live's prompt is 484 lines; anchors are given as byte-exact text so they survive a
shift. The anchor strings below are quoted from the live/fork prompts verbatim and contain the
original punctuation (em dashes included) - do not normalise them or the anchor will not match.

### Hunk P1 - the COMPANY-NAME REPLY section

**Anchor before (last two lines of the person_mention block, live 425-426):**

```
  - This is name extraction only. Keep classifying message_type / domain_hint / entities exactly as you
    normally would; person_mention is additive.
```

**Anchor after (live 428, the next section header):**

```
== ORDER_STATUS FILTER ==
```

**Insert between them** (i.e. after the existing blank line 427): fork lines F511-F544 from
`export/sub-semantic-parser-FORK/workflow.json` -> `AI Agent.parameters.options.systemMessage`,
with the §3.1 two-line de-reference applied, and keeping the trailing blank line.

**Why this position.** Three constraints pin it, and they resolve to exactly one slot:
1. It must come **after** the person_mention block, because F527 says
   `Do NOT set person_mention for a company name` - a negative override only reads correctly
   after the rule it overrides.
2. It must come **before** the output JSON schema, because the schema line (P2) is the
   declaration and this is its rule body.
3. `== ORDER_STATUS FILTER ==` is where the fork put it, so the surrounding token context the
   model saw during the fork's live use is preserved. Moving it elsewhere is an unmeasured change.

**The highest-severity line in the whole port is F519.** It is not prose, it is an n8n expression
embedded in the systemMessage:

```
Companies OFFERED in the pending offer (from state; "(none)" when no offer is pending): {{ (() => { const st = $('When Executed by Another Workflow').first().json.previous_conversation_state || {}; ... })() }}
```

It renders on **every turn**, not only on offer turns. If the node reference is wrong or the
expression throws, the prompt fails to render and the parser errors on every single turn.
Verified: live's parser has a node named exactly `When Executed by Another Workflow`, and the
expression is `try`-free but null-guarded on every deref (`|| {}`, `Array.isArray`, `.filter`).
Gate this line specifically (§9, T1).

### Hunk P2 - the escalation schema line

**Replace** live line 482, byte-exact:

```
  "escalation": { "is_escalation_confirmation": false }
```

**with** fork F600:

```
  "escalation": { "is_escalation_confirmation": false, "company_pick": "string_or_null — ONLY per COMPANY-NAME REPLY ON AN ESCALATION OFFER, else null" }
```

Anchored by the two lines above it (`"suggested_agent": ...` then `  },`) and the two below
(`}` then `Return exactly one JSON object.`).

### Explicitly NOT ported

F27-F31, F100-F105, F110-F117, F119-F123, F153-F176, F210-F216, F257-F258, F266, F268,
F374-F375, F386-F417, F579. Grep gate in §9.

---

## 5. `output_exchange`: the code half

`company_pick` appears on 11 lines / 12 occurrences in the fork body, `offer_hold` on 3.
They occupy **6 of the 22 live-vs-fork hunks**, and every one is separable: the other 16 hunks
touch the axis maps, `DOMAIN_SUBJECT_HINT`, `carryDateWindow`, the entity-op executor, the
partial-reply pick, the bare-token turn, and the final-pass axis drop. No shared line.

| # | live anchor | fork lines | content | port? |
|---|---|---|---|---|
| C1 | after `const _parser_raw_snapshot = (() => { ... })();` (live 85-87) | F88-F92 | strip the raw LLM `escalation.company_pick` key | **YES - mandatory** |
| C2 | immediately before `const _selCtx = (parent_input.previous_conversation_state \|\| {}).selection_context;` (live 1264) | F1549-F1660 | `_CO_ALIASES`, `_coFillers`, `_coNegators`, `_coTok`, `function _coCompanyPick(o)` | **YES** |
| C3 | after `const _forcePick = _replyIsNumber \|\| _replyMatchesMember;` | F1692-F1706 | `const _co = _coCompanyPick(_o); const _coPickAny = _co.any;` **and** `_coReprompt` | **partial - see §5.2** |
| C4 | the two `_pos` reprompt arms | F1752-F1760 | rewire to `_coReprompt` | **NO - see §5.2** |
| C5 | the `_pm` arm and the `is_affirmative` arms | F1769-F1796 | `_m.length > 1` -> `_coReprompt`; new `else if (_coPickAny)` after it; `is_affirmative === true` carries the pick; new `is_affirmative === false && _coPickAny` arm | **YES, minus the `_coReprompt` line** |
| C6 | Tier 2.5 / Tier 4 / the open-offer block | F1800-F1844 | `else if (_coPickAny)` Tier 2.5; Tier 4 -> `_coReprompt`; the rev-4 open-offer block | **YES, minus the Tier 4 `_coReprompt` line** |

### 5.1 Every identifier `_coCompanyPick` needs already exists in live, at the right scope

Verified by grep against `export/sub-semantic-parser/nodes/output_exchange.js`:

```
parent_input            live L61    top level
norm                    live L62    top level
_parser_raw_snapshot    live L85    top level
_reqHelp                live L148   top level   (used by the open-offer block, outside the D3 if)
_llmTeamN               live L151   top level   (same)
priorRouting            live L1130  top level   (same)
_selCtx                 live L1264  top level
```

`_isNewQuery` (live L1319) is block-local to the D3 arm, and `_coCompanyPick` deliberately does
not use it: it recomputes the same predicate locally as `domainQ`, with a comment saying
"kept in lockstep". `_isDateLike` and `_ceAxisFor` are only needed by hunks we are not porting.

So C2 inserts cleanly at top level immediately above live L1264 and everything resolves. This is
a genuinely clean seam, not a lucky one.

### 5.2 `offer_hold` and `_coReprompt`: hold them, do not ship them

All three `offer_hold` references live inside `_coReprompt`, which also rewires five existing
reprompt sites and flips `output.correction` from unconditional `true` to `!_co.multi`.

Measured on live @ `704c68dc`:

- `output.correction` has **exactly one consumer**: node `If10`
  (`output.correction === true && message_type !== 'casual' && message_type !== 'business_query'`).
  Grepped every node body and every expression in `workflow.json`.
- `offer-hold-gate` already fires on `member_reprompt`:
  `if (e.offer_hold !== true && typeof e.member_reprompt !== 'string') return false;`
  and it sits **before** `If10` on the chain `If-ideate -> offer-hold-gate -> [offer-hold-reply | If10]`.
- `offer-hold-gate`'s multi test is `rp.length > 1`, which is the *same expression* as
  `_coReprompt`'s `_co.multi` (`rp.length > 1` on `routing_roster_plan`).

Therefore on every turn where `_coReprompt` would set `correction: false`, `offer-hold-gate`
returns true, `If10` never executes, and `correction` is never read. **`_coReprompt` is
behaviour-neutral on live today.** It is a flag with no consumer, added for a spine that already
solved the problem a different way.

Per the standing design principle ("no new flag unless the direct path is proven inadequate, and
you must say what proved it"), it does not ship. Keep the five reprompt sites exactly as live has
them. This removes hunk C4 entirely and shrinks C5/C6.

Revisit only if `offer-hold-gate` is ever narrowed to `offer_hold`-only.

---

## 6. `suggest-follow-up`: do not touch, and do not sync

Live 56 lines, fork 35. The fork body is a strict prefix of live's: live added, after the
`suggest_offer` block, a unicode-dash normalizer (`const _DASHES = /[...]/g;` folding U+2212 /
U+2013 into ASCII `-` across `entities[].raw` and `.canonical_code`), covered by
`tests/unit/entity-dash-normalise.test.js` (15 cases, 7 mutants) and motivated by live exec
12053189.

Company-pick needs nothing from this node: `_coCompanyPick` runs inside `output_exchange`, which
executes before it, and none of the six prompt lines or six code hunks reference it.

**Any whole-node copy from the fork deletes a tested live behaviour.** Add a sha gate (§9, T3).

---

## 7. The contract with the spine

Consumer, `escalation-context.js` (part 1, currently uncommitted in this worktree):

```js
const cpick = (o.escalation || {}).company_pick ? String((o.escalation || {}).company_pick).toLowerCase().trim() : null;
```

keys per pool row = `company_name.toLowerCase().trim()`, `String(company_id).toLowerCase()`,
`company_code`/`code` lowercased+trimmed, and `_CO_ALIASES[nk]`.

Producer, `_coCompanyPick`: returns `ent.name`, where
`ent.name = String(c.company_name)` taken from the **same** persisted pool
(`previous_conversation_state.routing_roster_plan`, else `.routing_companies`), and matched via
`nk = name.toLowerCase().trim()`.

**The shape matches.** Both sides lowercase and trim; the producer's value is the pool's own
`company_name` verbatim, so the consumer's `nk` key is guaranteed to be the producer's `cpick`.
The captain's worry about a case difference is real in principle and does not bite here, because
the consumer normalises. Confirm anyway in review (§9, T5) - if anyone ever drops the
`.toLowerCase()` on the consumer side, a mixed-case canonical name silently stops matching.

**Null-vs-absent is safe.** `(o.escalation || {}).company_pick ? ... : null` treats absent,
`null`, and `""` identically, and `cpickRow` returns `null` for a falsy `cpick`, so the arm never
fires. There is no path where absent behaves differently from null.

**The one real mismatch risk is hunk C1.** If the coder ports the emission arms but skips the
top-of-node strip, an *unvalidated* LLM `company_pick` survives on every path where no arm
fires, because the arms replace `output.output.escalation` wholesale and the non-arm paths leave
the raw LLM object intact. Live's `cpickRow` would still refuse a company outside the offered
pool (fail-closed), but a hallucinated pick naming a company that *is* in the pool would route a
real assign the customer never asked for. **C1 is mandatory and must be reviewed as a safety
hunk, not a tidiness hunk.**

Two further contract notes for part 3 (the copy):

- The consumer also accepts a `company_id`. The parser never emits one. Harmless asymmetry.
- `_CO_ALIASES` is duplicated byte-identically in three places once this ships: the parser fork,
  `escalation-context.js`, and (after the port) the live parser. Its own comments call it a
  STOPGAP for the missing CRM `companies.code` column. Do not let the copy invent a fourth.

---

## 8. Blast radius

### 8.1 What the prompt half can regress

The parser classifies every turn, so the honest answer is "anything". The specific exposures:

1. **F519 renders on every turn.** A throw or a bad node reference is a total parser outage, not
   a misclassification. Highest severity, lowest subtlety. Gate T1.
2. **F532-F539 ("A VALUE IS NOT A FRAGMENT")** is the only ported clause that instructs domain
   carry and `entity_op` on turns that are not company picks. Section-scoped to a pending offer,
   but LLM section scoping is soft. This is the clause to hunt for in the replay.
3. **Prompt-length dilution.** +35 lines on a 484-line prompt is +7%. There is no way to argue
   from first principles that attention on unrelated rules is unaffected; it has to be measured.
4. **The de-reference (§3.1)** changes two lines away from the text the fork actually ran, so the
   fork's live behaviour is not direct evidence for the ported text on that bullet.

Evidence *for* low risk: the section's first bullet is hard-gated on the rendered list being
`NOT "(none)"`, and that list is empty on every turn without a persisted
`routing_roster_plan`/`routing_companies`. In the 78 harvested live-parser fixtures, only **3**
carry either key. So the gate is closed on roughly 96% of observed turns.

Evidence *against* relying on that: the last two bullets are not gated on `(none)`, and the fork
has only ever run this text alongside buckets (c) and (d), never alone.

### 8.2 What the code half can regress

Bounded and enumerable, which is the whole argument for §11's recommendation:

- Hunks C2/C3/C5/C6-Tier-2.5 execute **only** inside
  `if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true)`.
- The open-offer block executes only when `_selCtx !== 'member_offer'` **and**
  `/would you like me to escalate/i.test(prev.response)` **and** `!output.output.domain_hint`.
- Hunk C1 is a pure deletion of a key live never sets.

Every new arm is an `else if` appended to an existing chain, so no existing arm loses a turn
except where the fork deliberately inserted `else if (_coPickAny)` between
`_m.length > 1` and the final `else` in the `_pm` branch: a person_mention that matched **zero**
members and resolves to an offered company now confirms instead of reprompting. That is the
intended behaviour and it is the one arm that converts a reprompt into an assign. Test it hard.

**Known limitation to record, not to fix here.** The open-offer block keys on
`prev.response` containing the frozen escalate phrase. `compile-current-state` compresses
`response` to `Previous turn (domain): no results.` when
`qf.message_type == "business_query" && !manualResponse`. Traced through `escalate-catalog`:
`escalate_offer` sets `manualResponse = true`, and `not_found` sets
`manualResponse = !nf.require_specific`. So the phrase survives on the offer turns that matter,
**except** `not_found` with `require_specific: true`, where the phrase is compressed away and the
open-offer block is inert. Fail-closed (no assign), so it is a coverage gap, not a hazard. Note
it in the fixture set. Also noted in passing: `offeredEscalation` at
`compile-current-state.js:160` is computed and never used - dead, unrelated, leave it.

### 8.3 The acceptance test

**For the code half (recommended variant): offline, deterministic, zero tokens.**
`tests/unit/_parser-case.js` already runs one `output_exchange` fixture through a sha-verified
body from `export/`, and `tests/unit/_all-nodes.test.js` runs *every* fixture through its node
and deep-equals the output. There are **78** live-parser `output_exchange` fixtures, **15** of
them carrying `selection_context: member_offer`. Green `_all-nodes` on all 78 after the port is
a real no-regression proof for the D3 arm, because every one of those 15 exercises the chain the
hunks edit. This runs in milliseconds via `npm run test:unit`.

**For the prompt half: there is no offline test.** A prompt change can only be measured by
running an LLM. Two corpora:

- `n8n_test.v_turns`, 2,216 historical turns. Per LESSONS §19 the seed session is empty, so a
  replay measures classification under a neutral seed, not reproduction of historical outcomes -
  which is exactly right for "did the prompt change classification", and exactly wrong for
  anything that needs a pending offer in state. Offer turns must be synthesised.
- The live execution retention window, ~2,204 executions over ~6 days (LESSONS §75: no
  `nodeNames` filter on `GET /executions`, so harvesting means whole executions plus a local
  scan cache; `scripts/capture-fixtures.py` does this). Better fidelity, small window.

Per LESSONS §29, **do not sweep**. Mine a stratified sample from `chat_histories`, pre-labelled
with the expected classification, and weight it toward what this change can plausibly move:
(i) turns naming a concrete value while any offer is pending, (ii) turns naming a company word
with no offer pending, (iii) bare affirmatives/declines, (iv) a random control stratum.
200-300 turns, diffed field-by-field against the live prompt's output on the same inputs,
same seed, same model. Accept on: **zero** diffs in stratum (iv), and every diff in (i)-(iii)
individually adjudicated. Never accept on an aggregate rate.

---

## 9. Test plan and gates

Ordered. A gate that can be satisfied by the act of running the tooling is not a gate (LESSONS §82).

**T0 - source provenance (blocks everything).**
Re-run the four shas in §2. `fork-export == fork-live` for `output_exchange` and
`suggest-follow-up` must hold. If not, stop and re-cut this plan.
Source every hunk from `n8n-workflows-init/export/sub-semantic-parser-FORK/`, never from MCP.

**T1 - the F519 expression renders.**
Before any publish, run one clone turn with no offer in state and confirm the parser produced
output at all. A prompt-render failure is a hard error on every turn, so one green turn clears
it. Then one turn *with* a two-company `routing_roster_plan` in state and confirm the AI Agent
input shows the list rendered as `Sorento (code SRT) / Mocha (code MCH)`, not `(none)`.
(This is the only case in the whole plan that requires a real LLM call, and only in the
prompt-half variant.)

**T2 - contamination grep on the candidate systemMessage.** All must be 0:
```
have take | have sales | ada ambil | "quantity"  ← bucket (b), the other session
BARE ENTITY CONTINUATION | ESCALATE-WORD | BROADEN AXIS | broaden_axis
GOODS GOING OUT | GOODS COMING IN
```
And these must be present: `COMPANY-NAME REPLY ON AN ESCALATION OFFER`, `company_pick` (6),
`Company codes: Sorento = SRT`.
And the line count must be exactly **484 + 34 = 518**.

**T3 - suggest-follow-up untouched.**
`sha256(export/sub-semantic-parser/nodes/suggest-follow-up.js)` unchanged (`338ea668d463815a...`).

**T4 - `npm run test:unit` and `npm run test:flow` green.**
Deploy refuses otherwise (per `test-pyramid-and-git-deploy.md`). Note that
`tests/unit/offer-hold-clarify-divert.test.js` contains, deliberately,
`test('the fact C2/C5 rests on: the live parser exports no company_pick handler')`, which scans
`export/sub-semantic-parser/nodes/` for `company_pick`. **It will go red the moment this ships,
by design** - its own message says "If the handler really shipped, the clarify copy must change
too." Retiring or inverting that test is part 3's job, in the same commit as the copy change.
**Do not delete it to get green.** If part 3 is not ready, that red test is the pipeline
correctly refusing to let the parser land ahead of the copy.

**T5 - contract review.** Confirm `escalation-context.js` still lowercases `cpick`, and that
`_CO_ALIASES` is byte-identical between the parser hunk and the spine node.

**T6 - clone UAC.** §10.

**T7 - promote gate.** LESSONS §25: sha-verify the draft before publish and the active after;
auto-revert to the prior versionId on mismatch. LESSONS §37: the parser is a sub, so publish it
before testing the spine, or the spine keeps calling the old published version. Back up
`177c50a9` first.

### Fixtures

Nine new `output_exchange` fixtures under
`tests/fixtures/nodes/sub-semantic-parser/output_exchange/`, built by cloning one of the 15
existing `member_offer` fixtures and editing its `previous_conversation_state`:

| name | prev state | message | expect |
|---|---|---|---|
| `cpick-bare-name` | roster plan Sorento+Mocha, rows present | `mocha` | Tier 2.5: `is_escalation_confirmation:true`, `company_pick:"Mocha"`, `entities:[]` |
| `cpick-code` | same | `srt` | `company_pick:"Sorento"` (alias path) |
| `cpick-yes-plus-name` | same | `yes mocha` | affirmative arm carries `company_pick:"Mocha"` |
| `cpick-not-offered` | Sorento only | `yes mocha` | `company_pick` **absent**, plain confirmation |
| `cpick-negated` | Sorento+Mocha | `not sorento` | no pick (negator rule D) |
| `cpick-two-named` | Sorento+Mocha | `sorento or mocha` | no pick (ambiguous) |
| `cpick-product-token` | Sorento+Mocha | `check stock MUB6201 sorento` | no pick (`prodTok`), Tier 3 new-query abandon |
| `cpick-llm-raw-stripped` | no offer | LLM emits `escalation.company_pick:"Mocha"` | key **stripped** by C1, `escalation` has no `company_pick` |
| `cpick-open-offer-no-rows` | no `member_offer`, `response` contains the escalate phrase, `routing_companies` 2 rows | `mocha` | open-offer block: confirmation + `company_pick:"Mocha"` |

`cpick-not-offered`, `cpick-negated`, `cpick-two-named`, `cpick-product-token` and
`cpick-llm-raw-stripped` are the negatives. **If the extraction accidentally pulls in the other
session's lines, the failure shows up in `cpick-product-token`**: bucket (b)'s take/buy rule
pushes `X have take Y` and its neighbours toward `order` with a `customer` + `product` entity
pair and `requested_attributes:["quantity"]`, which sets `curEnt` and `domainQ` and changes
which `_coCompanyPick` guard fires. It also shows up as a straight `requested_attributes` diff on
any of the 78 existing `order`-domain fixtures via `_all-nodes.test.js`. T2's grep catches it
earlier and cheaper; the fixtures are the backstop.

Per LESSONS §40, a field that is now emitted on every parser output must be registered in any
replay `norm()` as drop-when-null-on-both-sides / retain-when-non-null. `company_pick` is
**not** in that category, because hunk C1 deletes the key entirely on every non-arm path, so
there is nothing to drop. Confirm that is still true after the port; if C1 is ever weakened, the
§40 rule becomes mandatory.

---

## 10. UAC cases (clone `txiPzSxy3Pclsz6v`, mode `uac`, egress blocked)

Contacts: `437264483` (Jayson, FULL access) for every case. `457216562` (NO access) is not
useful here - a no-access turn never reaches an escalation offer.
**Prerequisite, flag to the captain:** the partial/ask-for-access contact is still TBD, and a
two-company `routing_roster_plan` needs a customer whose name resolves across two companies. If
no such fixture contact exists, cases U1-U3 must run from a seeded
`respond_contacts_test` row in `regress-capture` mode (LESSONS §31: `uac` mode reads PROD
conversation-variables and will not carry synthetic state).

Each case: seed the redis item -> `zz-canary-run` -> `get_execution(includeData, nodeNames)` ->
read `test:egress:{test_run_id}`. Every case asserts S1-S7.

| id | turn 1 | turn 2 | expected branch | structural assertions |
|---|---|---|---|---|
| **U1** | a query that misses across two companies, producing a member offer | `mocha` | D3 Tier 2.5 | parser `escalation.company_pick === "Mocha"`, `is_escalation_confirmation === true`, `entities: []`; `escalation-context` `routing_source === 'company_pick'`, `company_id` = Mocha's row, `brand_code` verbatim from the row; `clarify-company-gate` FALSE; egress log records exactly one `would_assign` and zero `would_send` to a real contact |
| **U2** | same | `yes` | unchanged from today | `company_pick` absent; `escalation-context` `routing_source === 'multi_company_unpicked'`; `clarify-company-gate` TRUE; `clarify-company-reply` composes the ask. **This is the C4 regression guard: U1 must not change U2.** |
| **U3** | same | `srt` | D3 Tier 2.5 via alias | `company_pick === "Sorento"` |
| **U4** | same | `for u bath and kitchen` | Tier 3 new-query abandon | `company_pick` absent, `member_pick_context` not set, the customer entity survives with `current_message: true`. Guards F532-F539. |
| **U5** | same | `4` where the roster has 3 rows | unchanged reprompt | `member_reprompt === 'out_of_range'`, `correction === true` (proves §5.2: `_coReprompt` did **not** ship) |
| **U6** | a plain not-found escalate offer, no roster fetched, 2 companies in `routing_companies` | `mocha` | open-offer block | `company_pick === "Mocha"`; `member_pick_context === true`. **This is the case that actually closes C4's gap.** |
| **U7** | no offer at all | `mocha` | untouched | `escalation` carries no `company_pick`; the turn classifies as it does today. Guards C1 plus the F519 `(none)` gate. |

U5 and U7 are the negatives that fail loudly if the port over-reaches.

---

## 11. Answering the two questions plainly

### 11.1 Is the extraction safe while another session holds the fork?

**Yes, with one hard condition: source from `export/sub-semantic-parser-FORK/` @ `339a66d9`, and
never from the live fork.**

The captain's concern was well founded but the repo already solved it. The export predates the
03:23Z edit, is sha-recorded in its own MANIFEST, is sha-verified on load by
`tests/offline/node-source.js`, and its code bodies are proven identical to the fork live right
now. The other session's +15 lines are not merely avoidable, they are absent from the artifact
you read. Add T0 and T2 and the risk is mechanical rather than vigilance-based.

The residual is a race: if the other session edits `output_exchange` mid-build, the export goes
stale silently. T0 catches it at the start; re-run T0 immediately before the publish.

The thing that is **not** safe is the framing "extract the company-pick sections". Two of those
sections carry passengers that a section-level extraction would ship: the F541-F542 cross-
reference into bucket (d1) (§3.1) and `_coReprompt`/`offer_hold` (§5.2). Both are caught here
and excluded; neither would have been caught by a grep for `company_pick`.

### 11.2 Is there a smaller change? Yes, and it is better than the spine-only idea

I looked hard at the spine-only route the captain suggested, and it is worse than a third option
that neither of us had scoped.

**The spine-only route is real but expensive.** The spine does have everything it needs:
`latest_user_message` is *built in the spine* (`Call 'sub-query-reformulator'`.workflowInputs,
from `$('tf-message')`), and the persisted pool is in `get-session-vars`. So `_coCompanyPick`
could run entirely in a spine Code node. But the reply never reaches `escalation-context`: the
escalation lane's entry gate `If2` fires only on
`escalation.is_escalation_confirmation === true` or `message_type === 'request_for_help'`, and a
bare "mocha" is neither. Closing C4 spine-only therefore means **widening `If2`**, the gate that
stands between every turn and a real assign. That is the single worst node in the graph to
loosen. Rejected.

**The better option: ship `output_exchange` and skip the prompt entirely.**

The deterministic tier of `_coCompanyPick` does not need the LLM. Trace a bare `mocha`:

```
words = ["mocha"], kept = ["mocha"]        (no fillers to strip)
shortOk = words.length <= 4 && (kept.length < 2 || (!curEnt && !domainQ))
        = true && (1 < 2 || ...)  ->  TRUE, and the domainQ/curEnt guard never evaluates
hasNeg = false, prodTok = false
hits(["mocha"]) -> exactly one pool company -> "Mocha"
```

The single-token path is **unguarded by `domainQ` on purpose** (the fork's own rev-5 comment says
so). So even when the LLM guesses a domain from the word "mocha", the deterministic pick stands.
`_hasPickSignal` is false (no number, no member-label match, no person_mention, `is_affirmative`
null), so the chain reaches Tier 2.5 and confirms. `yes mocha` takes the affirmative arm and
carries the pick. `mocha please` strips to one token. `srt` resolves through `_CO_ALIASES`.

What the prompt half adds on top of that is exactly three things: the `pickLlm` semantic
fallback (whose own comment reads "Deterministic wins."), suppression of domain invention on a
company-name reply, and `is_escalation_confirmation: true` from the LLM. The first is a
fallback. The third is redundant with Tier 2.5. Only the second buys anything real, and it buys
it on one arm: the open-offer block's `!output.output.domain_hint` precondition (§8.2).

So the staged plan:

- **Stage 1 (recommended now): code only.** Hunks C1, C2, C3-minus-`_coReprompt`, C5, C6.
  No prompt change. **scope: `deterministic`** - 0 parser tokens, fully covered by
  `npm run test:unit` against 78 real fixtures plus the 9 new ones, plus U1-U7 on the clone.
  Rollback is a one-node revert. Closes the member-offer path of C4 completely, and the
  no-roster path whenever the LLM leaves `domain_hint` null.
- **Stage 2 (later, separately): the prompt.** Hunks P1 and P2, with the §3.1 de-reference.
  **scope: `parser`.** Justified only by measured Stage-1 misses where a guessed `domain_hint`
  suppressed the open-offer block. If Stage 1 measures at, say, 90% of company replies resolved,
  Stage 2 is a much easier decision, and it gets a sample corpus of *real* failures rather than a
  hypothesised one.

This also fixes an ordering problem in the captain's framing. Part 3 (the copy) is blocked on
"the parser can parse a company name". Stage 1 satisfies that. The copy can ship on Stage 1, and
the T4 red test flips to green in the same commit, with no LLM in the loop at all.

If the captain still wants the prompt in one shot, §4 and §8.3 are written for that and are
complete. The recommendation is Stage 1 first.

---

## 12. Rollback and fast detection

A wrong classification is silent. Assume you will not be told.

**Rollback.** Both halves are single-node, single-parameter reverts:
- prompt: `setNodeParameter` on `AI Agent` `/options/systemMessage` back to the `177c50a9` body,
  or `publish_workflow(XTODTw-dJcV0uRdC056hG, '177c50a9-d6dd-4171-b7d7-33c9818d2817')`.
- code: same, on `output_exchange` `/jsCode`.
Capture `177c50a9` and both node bodies as a backup before touching anything (LESSONS §25).
Note LESSONS §24: publishing ships the **whole draft**, so confirm the draft equals the intended
state before publish, or a stale UI draft reverts something else. This exact class of accident is
what wiped the spine on 2026-08-18.

**Detection, in order of speed.**

1. **Hard-failure canary (minutes).** `search_executions(workflowId=XTODTw, status=["error"])`
   for 30 minutes after publish. F519 failing to render shows up here immediately and totally.
   Any error at all: revert first, diagnose after.
2. **Emission counter (hours).** Over the first day, count executions where
   `escalation.company_pick` is non-null. Expected: a small number, all on turns with a persisted
   pool. **A non-null `company_pick` on a turn with no persisted pool is a bug by construction**
   (the pool is the only source of the value) and is the cleanest single alarm available. Wire it
   as: non-null pick AND empty `routing_roster_plan`/`routing_companies` -> investigate.
3. **Assign-rate delta (a day).** Count `Call 'sub-human-intervention'` invocations per day
   before and after. The change can only *add* confirmations (every new arm turns a reprompt or a
   plain confirmation into a scoped confirmation), so a **drop** means an existing arm lost turns,
   and a **spike** means Tier 2.5 is over-firing. Neither is visible in any error log.
4. **The 96% control (a day).** Sample turns with no persisted pool and diff their parser output
   against the same turns replayed on `177c50a9`. Any diff at all in that stratum is a
   prompt-dilution regression. This is the only check that catches §8.1 item 3, and it does not
   exist unless someone builds it, so build it before Stage 2 rather than before Stage 1.
5. **`_all-nodes.test.js` in CI** catches the code half forever, for free, on every commit.

The asymmetry in that list is the argument of this plan: Stage 1 is caught by items 1, 2, 3 and
5, four of which are cheap and one of which is automatic. Stage 2 is only caught by item 4, which
does not exist yet.
