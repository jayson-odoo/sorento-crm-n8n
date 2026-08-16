# Quoted-turn STATE pointer — a quote-reply resolves to the quoted turn's state, not just its result set

**Status:** PLAN (planner deliverable, 2026-07-31). **⚠️ REVISED 2026-08-02** against the
did-you-mean/partial-resolution/domain bundle promoted live 2026-08-01. **DOCS ONLY** — no workflow
edited, no CRM file edited, no execution run.
**Source of truth:** live n8n via MCP (read-only) + the CRM repo as a read-only reference. Every fact in
§1 was re-measured; where it contradicts an earlier plan or a memory note, §0 says so
loudly.
**Predecessor:** `plans/chat-console-replyto-parity-plan.md` §4 (was "delta C — gap assessment only").
This plan builds on it; it does not repeat it. Read §4 of that plan for the gap statement, then this.

> ## ⚠️ REVISION 2026-08-02 — what changed and why (read §0.8–§0.12 before anything else)
> A **6-change bundle** (per-token did-you-mean, partial-resolution two-set model, zero-stock itemize,
> select-ALL over dym, dym-pick domain carry, domain-switch words) was **PROMOTED LIVE 2026-08-01**,
> after this plan was written. Live parser `XTODTw` is now `88ef5c40` (was `8d5f7c2d`); live spine is
> `a40cd16d` (was `a505f2e1`); `output_exchange` grew **740 → 867 lines**. Five consequences:
>
> 1. **Every line anchor in this plan was re-verified against the 867-line file** (§1). The C2 insertion
>    point survives (`let parent_input` is still L52); almost every other citation moved.
> 2. **§5.1 / §27.0a's fork re-sync precondition is SATISFIED** — the bundle was built on the fork then
>    promoted, so fork `wI5RkNGW3EOJfBdo` `output_exchange` is now **byte-identical** to live (§0.3).
> 3. **A NEW mirror trap of the §3.5 class** exists on a key that did not exist when this plan was
>    written: `dym_last_result_set` (§0.9). It forces the CRM whitelist from **four keys to five** and
>    it is the one revision that changes the shipped contract.
> 4. **The old §DC-1/§DC-2 canaries are RETIRED** — the code they were written against was deleted and
>    replaced by bundle change #5 (§0.11). UAC §DC now points at §DC5.
> 5. **The §27.3 / V-C2 promote gate was WRONG** (count-based) and would false-fail. It is re-expressed
>    as a content gate (§3.3, §11 V-C2).
>
> Unchanged: the invariant, the fail-safe philosophy, which side each delta lives on, the scope tags,
> and that **every live promote is user-gated**.

**USER DECISION carried into the design:** this work (old delta C) ships **BEFORE** the quoted-text
deletion (old delta B). §7 analyses that ordering against the live graph and **confirms it is safe** —
with one class of benefit provably masked until B lands, and one UAC case (§UAC 27.9) written
specifically to make that masking visible instead of mysterious.

| delta | side | scope tag | build target | touches LIVE? | status 2026-08-02 |
|---|---|---|---|---|---|
| **C1** — widen the CRM read contract with `session_vars.referenced_state` | **CRM** (`sorento_crm_backend`) | n/a for the n8n tester; CRM pytest (§4.4) | `conversation_variables_service.py` + `conversation_variables.py` + `tests/test_chat_history_result_set.py` | CRM deploy, **user-gated** | ✅ **DEPLOYED + PROVEN against prod data** (§0.8). ⚠️ **needs ONE follow-up**: the 5th key (§3.1) |
| **C2** — parser: declare `referenced_state` + the one-place REBASE | **n8n** | **`parser`** | fork `wI5RkNGW3EOJfBdo` → promote live parser `XTODTw-dJcV0uRdC056hG` | **YES**, user-gated | not built |
| **C3** — spine: pass `referenced_state` to the parser (one leaf) | **n8n** | **`deterministic`** | clone `txiPzSxy3Pclsz6v` → promote live spine `9qVyfUxmRQqrpGRMDLRuz` | **YES**, one leaf, user-gated | not built |
| **C4** — harness: inject `referenced_state` on the clone (test lane only) | **n8n** | **`deterministic`** | clone `sim-inject-session`, and the console-lane mirror from delta A | **NO** | not built |

Promote order is fixed by LESSON 37: **C2 (parser, published) → C3 (spine leaf)**. ⚠️ **C1 is NO LONGER
independent** — the 5th key (§0.9) must be deployed **before** C2, or the system reaches a reachable,
silently-wrong state (§6 / §9 **M14**). C1's four-key half is already live, which makes the crossed-version
row "new CRM / old spine / old parser" the **current** state of the world, not a hypothetical (§6).

---

## 0. PLAN-PREMISE CORRECTIONS — ⛔ READ BEFORE ANYTHING ELSE

Five premises inherited from earlier plans / memory are **stale**. Two of them make this plan *cheaper*
than scheduled; one of them retires a blocker; one of them halves the fork re-sync; one corrects a
statement about what `dym_slot` can shrink to.

**§0.8–§0.12 were added by the 2026-08-02 revision.** §0.9 is the only one that changes the shipped
contract; §0.11 retires two owed canaries; §0.12 is a promote-gate correction.

**0.1 ⛔ `turn_id` on the ESCALATION path is NO LONGER NULL — prior-plan blocker #1 is CLOSED.**
`chat-console-replyto-parity-plan.md` §4.5(1) and memory `obs-latency-contract` both say outgoing
`turn_id` is still null on the escalation path because "sub-callers were never enumerated". Measured
this session on the live graph, it is threaded end to end:

| hop | evidence |
|---|---|
| spine → human-intervention | `Call 'sub-human-intervention'`.`workflowInputs.value.turn_id` = `={{ $execution.id }}` |
| human-intervention trigger | `When Executed by Another Workflow` declares `turn_id` (sub `rrYXzE61gCNUck_zmXe-G` @ `5018a189`, draft==active) |
| human-intervention → sendmsg ×3 | `…-routed-to-pic`, `…-routed-to-pic1`, `…-routed-to-pic2` **each** pass `turn_id: ={{ …json.turn_id }}` |
| sendmsg → both loggers | `aoydkG1dbItXR5jXFEQsP` @ `c712e218`: `Call 'sub-respond-save-message-redis'1` (plain-text) **and** `Call 'sub-respond-save-message-redis' (quick_reply)` both write `"turn_id": …json.turn_id ?? null` |

All 11 spine sendmsg / human-intervention / incoming-logger callers pass `turn_id = $execution.id`; only
the four read-only subs (`sub-query-reformulator`, `sub-get-rag`, `sub-get-results` ×2, `sibling-probe`)
omit it, correctly. **Consequence: the C-opt1 join works on escalation turns.** That was the single
biggest reason C was shelved. It is gone.

**0.2 ⛔ Live parser DOES emit `_parser_raw` — the fork is NOT "ahead" by it.**
LESSON 57(a) and the task brief both state the fork `wI5RkNGW3EOJfBdo` carries an unpromoted
`_parser_raw` rider absent from live. Live `output_exchange` (`XTODTw` @ `88ef5c40`, draft==active)
**L76** defines `_parser_raw_snapshot` and **L866** does `output._parser_raw = _parser_raw_snapshot;`
(re-verified 2026-08-02; the line moved 737 → 866). It has been promoted. `state_trace.parser_raw` is
therefore populated on live traffic. Note `_parser_raw_snapshot` snapshots **`output.output`** (the raw
LLM object), **not** `parent_input` — so it is irrelevant to the C2 rebase placement (§3.2).

**0.3 ✅ RESOLVED 2026-08-02 — the fork re-sync is DONE. The precondition is SATISFIED, not pending.**
The 2-line `tryDymPick` prior-domain overwrite this plan asked to delete from the fork **no longer
exists anywhere** — the bundle rewrote that whole region (bundle change #5) and was promoted from the
fork to live. Measured 2026-08-02:

| artifact | versionId (== activeVersionId) | `output_exchange` |
|---|---|---|
| live parser `XTODTw-dJcV0uRdC056hG` | `88ef5c40` (2026-08-01 15:34) | 867 lines, sha1 `ceadf7bc933b4156b5e65c8758eddefd03c8c673` |
| fork `wI5RkNGW3EOJfBdo` | `c9f6e280` (2026-08-01 14:42) | 867 lines, sha1 **identical** |

`diff` (not just `diff -w`) is **0 lines** — byte-identical, stronger than the `diff -w` empty gate this
plan originally asked for. `AI Agent.systemMessage` is also byte-identical (sha1
`eaf99055f458caeebb787049de6b5a46c0c4c631` both sides, 31,377 bytes) and the `executeWorkflowTrigger`
declarations match exactly (6 inputs: `latest_user_message`, `contact_id`,
`previous_conversation_state`, `referenced_result_set`, `is_test`, `mock_reformulator_output`).
⚠️ The fork **still carries the extra orphaned `Postgres Chat Memory` node** (§0.4) — 8 nodes vs live's
7 — so LESSON 57's "never block-copy the fork" rule stands unchanged.
**§5.1 / §27.0a therefore become a cheap RE-VERIFY gate, not a build step** — but they stay MANDATORY,
because the claim decays the moment anything lands on either side (memory
`stale-byte-identical-fork-claim`).

**0.4 NEW FINDING — the fork carries an EXTRA node live does not have: `Postgres Chat Memory`.**
`@n8n/n8n-nodes-langchain.memoryPostgresChat` v1.3, `sessionKey = contact_id`, `contextWindowLength: 3`.
It is **orphaned** — `connections["Postgres Chat Memory"].ai_memory = [[]]` (empty target list), so the
AI Agent has no memory attached and the node cannot execute. MCP reports `credentials: null`, which per
LESSON 47 is **vacuous evidence** (MCP redacts). Treat it as: (a) not a behavioural delta today, (b) a
latent hazard — if anyone wires it, an unknown Postgres credential joins the parser path. Assert its
credential via **REST GET** in §5.2, and either delete it or leave it orphaned; **do not** promote it.

**0.5 ⛔ LESSON 31's "redis-item `previous_conversation_state` injection does NOT reach the reformulator"
is STALE for the clone.** The clone now has `sim-inject-gate` → `sim-inject-session`:

```js
const item = $('redis-pop-main-message-list').first().json.message;
return [{ json: { session_vars: {
  variables: item.previous_conversation_state ?? {},
  referenced_result_set: item.referenced_result_set ?? []
} } }];
```
gated on `!!(…json.message.previous_conversation_state)`, feeding the `get-session-vars` NoOp directly
(and bypassing `session-get-gate` entirely). **Deterministic session injection IS available on the
clone.** This is what makes C4 cheap and what decouples C2/C3 testing from the C1 CRM deploy (§6.3).

**0.6 Minor ID-table correction (not load-bearing here).** CLAUDE.md lists get-results as
`Fss5aAaXthJSWpZCgKiKR`. On the live spine, `Call 'sub-get-results'` and `probe-incoming` target
**`rysSPgUssLDf6xJc`**; only `sibling-probe` targets `Fss5aAaXthJSWpZCgKiKR`.

**0.7 Correction to the predecessor plan's §4.3.** It said that for quoted picks "the `dym_slot` tier-0
handle become[s] unnecessary". That is wrong — see §8.2. The pointer supplies the **offer**; it does not
supply **which prior entity the suggestion was FOR**. `dym_slot` is still required, for quoted picks too.

---

### 0.8 ✅ C1 IS DEPLOYED AND PROVEN AGAINST PRODUCTION DATA — §6's "old CRM" rows are now history

`session_vars.referenced_state` is live on the CRM, not merely committed on a branch. Proven by driving
the clone (`zz-run-hint`) with a **real prod `message_id`**:

| probe | clone exec | result |
|---|---|---|
| real prod `message_id` | `10820850` | `session_vars.referenced_state = {domain_hint:"inventory", intent_hint:"check_stock", entities:[{raw:"SRTWT9611-GM",…}], dym_offer:null}` |
| bogus `message_id` (miss path) | `10820865` | `referenced_state: null`, **key PRESENT** |

So the §4.3 contract ("key absent without `?message_id=`; key always present and `null` on any miss") is
empirically satisfied in both directions, and the CRM repo's own LESSONS-LEARNT note about an
*unfalsifiable* null probe is **superseded** — there is now a real non-null case.

⚠️ **Two things this does NOT prove, and both are recorded, not glossed:**
- `referenced_result_set` came back `null` on both probes because the quoted row was an **INCOMING**
  message, and incoming rows carry no `result`. **Only a quoted BOT bubble yields both keys.** Any
  §27 case that asserts on `referenced_result_set` must quote an OUTGOING row.
- `referenced_state.dym_last_result_set` (the 5th key, §0.9) is **NOT yet in the deployed projection**.
  C1 needs one follow-up commit; §4.4 grows two tests. That is the only C1 work left.

### 0.9 ⛔ NEW MIRROR TRAP — `dym_last_result_set`: the §3.5 class, on a key that did not exist when this plan was written

Bundle change #2 introduced a **two-set model**: the numbered did-you-mean set lives in
`prevState.dym_last_result_set`, **separate** from the stock `last_result_set`, and the parser's new
`reference_target: result|dym|null` selects between them. Live `output_exchange`:

| line | read |
|---|---|
| **L453** | `const _dymActive = Array.isArray(prevState.dym_last_result_set) && prevState.dym_last_result_set.length > 0;` — the #4 select-ALL gate, which **force-routes** `reference_target='dym'` (L456) |
| **L455** | `output.output.reference_positions = prevState.dym_last_result_set.map(r => Number(r.idx))…` |
| **L498** | `const _dymSet = Array.isArray(prevState.dym_last_result_set) ? prevState.dym_last_result_set : [];` (in `dymNumberedMultiSelect`) |
| **L500** | `const _offer = (prevState.dym_offer && typeof prevState.dym_offer === 'object') ? prevState.dym_offer : null;` |
| **L502** | `let _base = Array.isArray(prevState.entities) ? prevState.entities : [];` |

`prevState` (L424) and `applyDymPick`'s `_pv` (L165) **both** derive from
`parent_input.previous_conversation_state`, so all five reads rebase under C2 — **except**
`dym_last_result_set`, which is not one of the four projected keys and would therefore keep the
**CURRENT** turn's value while `_offer`, `_base` and `_pv` come from the **QUOTED** turn.

**Failure mode, concretely:** the customer quotes an old partial-miss bubble and types `2`. `_offer`
(quoted) + `_dymSet` (current, an unrelated more recent suggestion list) → position 2 of the wrong list
is resolved, `applyDymPick` runs with `_useSlot=false` so bundle #5 fires via `_viaNumbered` and
**force-routes `domain_hint` to the quoted offer's domain** — a confident, fluent answer about the wrong
product, with no error and no diagnostic anywhere. Same class as §3.5, one level up.

**DECISION: a FIFTH CRM key, `dym_last_result_set`, rebased together with `dym_offer`
(rebase-both-or-neither). Clear-on-rebase is REJECTED.** The reasoning, because the decision is not
obvious and the cheaper-looking option is the unsafe one:

1. **The data is available and intact.** The `state_trace` writer's `trim()` collapses only
   `RS = ['last_result_set','referenced_result_set','dym_candidates']`, top level only (§1.4).
   `dym_last_result_set` is **not** in `RS` → it survives `state_trace.after` **verbatim**, with every
   pick-linkage field (`idx`/`label`/`value`/`product`/`uuid`/`entity_type`/`for_raw`/`for_hint`/
   `for_canonical`). So §3.4's "`last_result_set` cannot be rebased because `trim()` destroys it"
   argument **does not apply here** — this key is the exception.
2. **`dym_offer` and `dym_last_result_set` are ONE logical object.** Both are minted in the same
   `compile-current-state` block (L441–443) from the same candidate list, sharing
   `id: String($execution.id)`. Rebasing one and not the other is definitionally a mirror trap.
3. **Clear-on-rebase (`dym_last_result_set: []`) does NOT degrade to a fallback — it degrades to a
   confidently wrong answer.** On an empty `_dymSet`, `dymNumberedMultiSelect` returns early (L499) and
   control falls to the byIdx block (L519–527), which **prefers `parent_input.referenced_result_set`** —
   and per §0.10 that channel carries the quoted bubble's **STOCK** set. A bare `2` then resolves to
   stock row 2 instead of suggestion 2. Wrong set, no error. Clearing moves the failure, it does not
   remove it.
4. **⛔ Clear-on-rebase would make C2 a REGRESSION on the commonest quoted dym pick — decisive.** Quote
   the bubble you *just* received and type `2`: today `prevState.dym_last_result_set` is present and
   correct and the pick resolves properly. Clearing it on rebase breaks that turn. With the 5th key the
   same turn is a **no-op** (quoted value == current value), which is the strongest possible form of the
   fail-safe rule. §UAC 27.2b exists solely to hold this line.
5. **CRM cost is one `raw.get()`** in the same projection — no new query, no new column, no migration.
   The contract-boundary test (§4.4(8)) grows from four keys to five.

**KNOWN GAP, stated honestly and NOT fixed here (→ F7).** The *route selector* is `reference_target`,
which the parser derives partly from the `[N did-you-mean suggestions active]` marker that
`compile-current-state` appends to `variables.response` (L444) — and `response` is **deliberately not
rebased** (§3.4, escalation-confirmation safety). So quoting an OLD dym bubble while the current session
has no active marker will most likely yield `reference_target != 'dym'`, the rebased dym set is never
consulted, and control falls to byIdx over the quoted stock set (§0.10's defect). **C2 neither worsens
nor fixes this.** Fixing it needs a *structural* forced route — the same "no marker regex, structural
only" pattern #4 already uses at L453 — which is a **new decision site** and therefore needs its own
plan, its own no-regression proof and its own promote. §UAC 27.13 **records** the gap as
expected-masked rather than pretending it passes.

### 0.10 ⛔ `referenced_result_set` is UNDER-SPECIFIED under the two-set model — traced to the exact node

A partial-miss turn now emits **one bubble carrying two numberings**: the found stock answer *and* a
numbered did-you-mean list. `chat_histories.result` can hold only one set. Traced end to end
(live spine `a40cd16d` + sendmsg sub `aoydkG1dbItXR5jXFEQsP` @ `c712e218`):

1. **Only one sendmsg caller passes a set at all.** Of the 8 live callers of `aoydkG1dbItXR5jXFEQsP`:
   `sorento-sub-respond-sendmsg-respond2` passes
   `result_set = {{ $('compile-current-state').first().json.variables.last_result_set }}`;
   `…respond4` passes `{{ null }}`; the other six omit the input entirely.
   **`dym_last_result_set` is passed by NOTHING.**
2. **Inside the sub, `Code in JavaScript` re-filters it per message part** by scraping line-start
   numbers out of the rendered text:
   `idxIn(part) = [...part.matchAll(/(?:^|\n)\s*\*?(\d{1,3})[.)]/g)]`, then
   `subset = resultSet?.filter(r => ids.has(r.idx))`, with the whole set riding part 1 only when
   `subset` is empty **and** there is exactly one part.
3. **`Call 'sub-respond-save-message-redis'1` writes `result: $('Loop Over Items').item.json.result`** —
   that filtered subset — which is what the CRM later returns as `referenced_result_set`.

**De-facto answer: `result` is always a subset of the STOCK `last_result_set`, filtered by every
line-start number visible in the bubble — including the did-you-mean numbers.** The dym block renders
`  ${idx}. ${label}` (two-space indent, matched by the regex's `\s*`), so its numbers **do** land in
`ids`. Two sub-cases:

| shape of the answer half | `ids` | logged `result` |
|---|---|---|
| stock block also line-start-numbered 1..N | ⊇ 1..N | all N stock rows — benign |
| stock answer NOT line-start-numbered (single item / prose) | {1..M} (dym numbers only) | stock rows with `idx ∈ 1..M` — **an arbitrary slice chosen by numbers that index the SUGGESTIONS** |

**Is that the right answer? No.** It is not a choice anyone made; it falls out of a text-scraping
splitter meeting a second numbering. Two defects follow:
- **D-R4a** — a quote-reply saying "the 2nd one" against a partial-miss bubble resolves against **stock
  rows** while the numbers the customer can see belong to the **suggestions**. Silent, confidently wrong.
- **D-R4b** — in the un-numbered-answer case the logged `result` rows are not even the rows those
  numbers denote, so the bubble→row mapping is meaningless.

**Specified fix, split by ownership:**
- **In scope for this plan (and it is exactly §0.9's fix):** keep `result` = the **stock** set, so
  `referenced_result_set` keeps its established meaning, and deliver the quoted turn's dym set through
  `referenced_state.dym_last_result_set`. The parser's existing `reference_target` discriminator then
  chooses between them — the *same* mechanism it already uses in-session, so no new concept is
  introduced. **§0.9 and §0.10 are one fix, not two.**
- **Out of scope → F8 (flag, do not fix):** stop the dym numbers polluting `idxIn()` at all — either
  render the dym block with a bullet the regex does not match, or namespace the two idx spaces. That is
  a sendmsg-sub + `compile-current-state` change with its own blast radius.

**⇒ §0.10 does NOT subsume §0.9.** Because `result` holds the stock set, `referenced_result_set` can
never supply the dym set, so the 5th key stands exactly as argued.

### 0.11 ⛔ The two canaries this plan owed (§DC-1 / §DC-2) are RETIRED — the code they targeted is gone

They were written against the deleted `tryDymPick` prior-domain overwrite and assumed
`current || prev` intent precedence with `_prev.domain_hint` as the domain source. Bundle change #5
replaced that region entirely (live L204–218, inside `applyDymPick`):

```js
const _isBareCode  = norm(_hit.code) === norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0]);
const _viaNumbered = (_useSlot === false);
if ((_isBareCode || _viaNumbered) && _offer && _offer.domain) {
  output.output.domain_hint            = _offer.domain;
  output.output.intent_hint            = _pv.intent_hint ?? null;
  output.output.dym_pick_domain_forced = _offer.domain;
}
```
Different source (`_offer.domain`, not `_prev.domain_hint`), different intent rule (`_pv.intent_hint`,
not `current || prev`), and a new gate (bare-code **or** numbered). #5 was mechanism-verified on the
clone with a **positive control**, so it is not a `green-that-cannot-fail`:

| probe (offer domain) | raw LLM | FINAL | `dym_pick_domain_forced` | fork exec |
|---|---|---|---|---|
| `SRT59-CR promotion` (inventory) | promotion | promotion ✅ | `None` — gate declined | `10839868` |
| `have stock for srtwc8518-SH ?` (product_attachment) | inventory | inventory ✅ | `None` — gate declined | `10839898` |
| bare `SRT59-CR` (inventory) — **POSITIVE CONTROL** | master_products | inventory | **`inventory` — FIRED** | `10839914` |

**Action:** UAC §DC-1/§DC-2 are marked RETIRED/SUPERSEDED and point at the already-written §DC5 case
family (which covers #5's real gate including the positive control and the no-clobber regressions).
Do **not** run DC-1/DC-2 as written — they would report the OLD behaviour of code that no longer exists.

### 0.12 ⛔ The §27.3 / V-C2 promote gate as written is WRONG and would FALSE-FAIL

It asserted "the carry-site count stays at **two**". Measured on the 867-line live file:

- `output.output.domain_hint =` **assignment** sites: **9** (L95, 114, 135, 215, 385, 465, 471, 637, 651).
- `output.output.intent_hint =` **assignment** sites: **9** (L96, 115, 134, 216, 386, 466, 472, 638, 653).
- (A loose grep reports 11 for `domain_hint` because L109 and L569 are `===` **comparisons**. That is
  almost certainly where the "11 write sites" figure came from — worth stating so nobody re-derives it.)
- **Both rev4 carry gates gained `&& !_switchDomain`** from bundle #6 — L384 (site 1) and L629 (site 2).

The **invariant still holds**: every one of those sites that reads prior state reads it through the
rebound `parent_input` / `prevState` / `_pv`, so the rebase remains **one statement**. But a *count* no
longer discriminates: it **fails a correct C2** (the numbers changed for reasons unrelated to C2), and
if anyone relaxes it to match the new count it would then **PASS a genuinely new carry site** such as
`output.output.domain_hint = _refState.domain_hint;` — the exact line-210-bug class this gate exists to
catch, because that writes the **output** side. Re-expressed as a content gate in §3.3 / §11 V-C2.

**Version state, re-measured 2026-08-02 (all clean, draft == active everywhere — no LESSON 24/51 rider hazard):**

| workflow | id | versionId (== activeVersionId) | nodes |
|---|---|---|---|
| live spine | `9qVyfUxmRQqrpGRMDLRuz` | `a40cd16d-c404-4d82-bc46-8a2e756e9dc1` (was `a505f2e1`) | 101 |
| clone spine | `txiPzSxy3Pclsz6v` | `0a647e8b-bf87-44ae-b0d2-3846ad045a87` (was `ccff92c3`) | 135 |
| live parser | `XTODTw-dJcV0uRdC056hG` | `88ef5c40-7653-4759-a686-6eea05cbfc3f` (was `8d5f7c2d`) | 7 |
| parser FORK (clone's target) | `wI5RkNGW3EOJfBdo` | `c9f6e280-e686-4bbb-a5ab-42615b63e997` (was `006e75f1`) | 8 (the extra = §0.4) |
| sendmsg sub | `aoydkG1dbItXR5jXFEQsP` | `c712e218-31a7-4fe3-803b-5827af31c54f` (unchanged) | — |
| human-intervention sub | `rrYXzE61gCNUck_zmXe-G` | `5018a189-22df-4cb9-aa89-fa509377abe9` (unchanged) | — |

**✅ The CLONE spine is IN SYNC with the bundle** — a precondition that could easily have been missed,
so it was checked rather than assumed:

| node | clone vs live |
|---|---|
| `compile-current-state` | `diff -w` **0 lines** (528 lines both sides) |
| `build-suggest-offer` | `diff -w` **3 hunks, all cosmetic**: two comment box-rule widths + one trailing newline. Functionally identical. |
| `Call 'sub-query-reformulator'` | targets fork `wI5RkNGW3EOJfBdo` ✅ (confirms CLAUDE.md's corrected note; the older "clone calls live `XTODTw`" note is stale) and declares 6 inputs, **no `referenced_state`** — i.e. C3/C4 genuinely unbuilt |
| `sim-inject-session` | exactly the 2-key shape §0.5 describes; C4's 3rd key not present |

> ⚠️ Record the `build-suggest-offer` cosmetic delta in the run log so a future byte-diff is not
> mis-read as drift (memory `stale-byte-identical-fork-claim`).

---

## 1. Grounded facts this plan depends on (re-verified live 2026-07-31; **every line anchor re-verified 2026-08-02** against `output_exchange` @ 867 lines)

> **Anchor table — old plan line → live 2026-08-02 line.** Use this instead of trusting any bare number
> elsewhere in the document. Only the first row is unmoved, and it is the one C2 depends on.
>
> | landmark | plan (740-line) | live (867-line) |
> |---|---|---|
> | `let parent_input = $('When Executed by Another Workflow').first().json` | **L52** | **L52 — UNMOVED** ✅ |
> | `const norm = …` | L53 | L53 |
> | `_parser_raw_snapshot` (snapshots `output.output`, **not** `parent_input`) | L76 | L76 |
> | `output.output.domain_hint = norm(…)` / `intent_hint` coercion | 93–94 | L95–96 |
> | **first `previous_conversation_state` read** — `_priorEnts0` | **L100** | **L100** |
> | `resource_attachment` → `product_attachment` normalise | L114 | L114–115 |
> | `userMsg` / `MENU_LABELS` / `menuHit` (unstripped reader #1) | 123/124/131 | L123/124/131 |
> | `applyDymPick` fn def · its `_pv` | — / L159 | **L163** / **L165** |
> | **bundle #5** dym-pick domain force (`_isBareCode`/`_viaNumbered`) | *did not exist* | **L204–218** |
> | `tryDymPick` IIFE · `_prev` · `_offer` · `_cands` · `_msg` · invocation | 158–218 | **L221–244** (222 / 225 / 226–227 / 235 / 243) |
> | `_DECISIVE_INTENTS` · `_explicit` · `domain_signal_source` | — / L236 | L252–261 / **L262** / L263 |
> | **bundle #6** switch-word map · `_switchDomain` computation | *did not exist* | **L271–291** / **L292–307** |
> | entity-op executor `prior` | 287–288 | L357–358 |
> | `reuse` date carry · `is_active` carry | 301–303 / 308–309 | L371–373 / L378–379 |
> | **CARRY SITE 1** (gate / writes) | 313–321 (315–316) | **L383–389** (gate **L384**, writes **L385–386**) |
> | `const prevState = …` | **L354** | **L424** |
> | ALL/SEMUA block · `_refSet` · `_lrsAll` · `_pickCtx` · `_msgAll` | 369–371 | L434–469 · **L439** · L440 · L441 · L443 |
> | **bundle #4** `_dymActive` + forced `reference_target='dym'` | *did not exist* | **L453–459** |
> | non-dym ALL branch hole-fill (`if (!domain_hint) …`) | 381–382 | **L465–466** |
> | `domain_inherited_for_position` | 386–388 | **L470–475** |
> | **bundle #2** `dymNumberedMultiSelect` (`_dymSet`/`_offer`/`_base`) | *did not exist* | **L493–517** (498 / 500 / 502) |
> | byIdx `lastSet` (prefers `referenced_result_set`) | 403–405 | **L523–525** |
> | `attachment_type` re-attach | ~L456 | **L568–575** |
> | `DOMAIN_BLOCKED_HINTS` declaration | — | L589 |
> | **CARRY SITE 2** (gate / writes) | 508–525 (510, 518) | **L628–645** (gate **L629**, writes **L637–638**) |
> | **bundle #6** apply (`if (_switchDomain) …`) | *did not exist* | **L650–654** |
> | `priorRouting` · `prevResponse` / `offeredEscalation` | 552 / 556 | **L681** / **L685–686** |
> | `access_levels` via the **separate** `$('When Executed…')` binding | **L575** | **L704** |
> | CS member arm: `_selCtx` · `_lastSet` · `_extract` fn · `_rawReply` · `_pos` (unstripped reader #2) | 617 / 619 / — / 638 / 649 | **L746** / **L748** / L751 / **L767** / **L778** |
> | `_isNewQuery` · `_hasPickSignal` · branch order | 654 / 669 vs 712 | **L783** / **L787** / **L798 (`_hasPickSignal`) before L841 (`_isNewQuery`)** |
> | `output._parser_raw = …` · `return output` | 737 / 737–738 | **L866** / **L867** |
>
> **NEW guard worth knowing:** L747 is `if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true)`
> — the entire CS member-pick arm is now skipped when a dym pick applied. That *strengthens* §3.4's
> non-interference theorem rather than weakening it.

### 1.1 The existing pointer, end to end (unchanged, this is the rail C rides on)

- **Live spine `get-session-vars`** (httpRequest, `1b06a306`):
  `=https://72.62.195.20/api/v1/external/conversation-variables/{{ …findcontact…json.id }}{{ $('tf-message').first().json.message.replyTo.id ? `?message_id=${…replyTo.id}` : "" }}`
  — `retryOnFail:true`, no `onError`. (The clone's equivalent `get-session-vars-http` points at
  `https://fe-sorento.foundryx.my`; same route.)
- **Live spine `Call 'sub-query-reformulator'`** (`7b2e4733`) declares **four** inputs today:
  `latest_user_message`, `contact_id`, `previous_conversation_state` (object),
  `referenced_result_set` (**array**) = `={{ $('get-session-vars').first().json.session_vars.referenced_result_set }}`.
- **Live parser trigger** declares: `latest_user_message`, `contact_id`,
  `previous_conversation_state` (object), `referenced_result_set` (array), `is_test` (boolean),
  `mock_reformulator_output` (object).
- **`output_exchange` already prefers the pointer over recency** — verbatim, live (re-anchored 2026-08-02):
  - **L439–441** `const _refSet = Array.isArray(parent_input.referenced_result_set) ? … : [];`
    `const _lrsAll = _refSet.length > 0 ? _refSet : (…prevState.last_result_set…);`
    `const _pickCtx = _refSet.length > 0 || _selCtx === 'disambiguation' || _selCtx === 'suggest_offer';`
  - **L523–525** `const lastSet = Array.isArray(parent_input.referenced_result_set) ? … : (…prevState.last_result_set…);`
  - ⚠️ **But `referenced_result_set` is NOT consulted by the dym path at all.** `dymNumberedMultiSelect`
    (L493–517) reads only `prevState.dym_last_result_set`. The pointer-over-recency preference exists on
    the **stock/menu** axis and has **no counterpart on the dym axis** — that asymmetry is exactly §0.9.

### 1.2 The CRM side, exact (read-only source, not inferred)

`app/api/v1/external/conversation_variables.py:33-65`:
```python
state = get_for_contact(db, respond_io_id=respond_io_id)
if message_id is not None:
    state = {
        **state,
        "referenced_result_set": get_referenced_result_set(
            db, respond_io_id=respond_io_id, message_id=message_id
        ),
    }
return ConversationStateResponse(respond_io_id=respond_io_id, session_vars=state)
```
`app/services/conversation_variables_service.py:81-112` — `get_referenced_state`'s sibling:
```sql
SELECT result FROM chat_histories
WHERE contact_id = :cid AND message_id = :mid
ORDER BY sent_at DESC, id DESC
LIMIT 1
```
…then `return raw if isinstance(raw, list) else None`. Response model
`ConversationStateResponse{respond_io_id: str, session_vars: dict[str, Any]}` — `session_vars` is an
open dict, so **adding a key needs no schema change**. Router mount:
`app/api/v1/external/__init__.py:189-192`, prefix `/conversation-variables`, gated by
`require_external_permission(EXTERNAL_ENDPOINT_PERMISSIONS["conversation-variables"])`.

### 1.3 `chat_histories` — the columns the join uses

`app/models/chat_history.py`:
- `turn_id = Column(String(64), nullable=True)` — "n8n `$execution.id`, stamped on **both saves of one
  turn**. NULL = proactive send".
- `state_trace = Column(JSONB, nullable=True)` — "populated by n8n on **INCOMING rows only**; NULL on
  outgoing. Opaque jsonb `{v, before, parser_raw, parser_applied, after}`. **`after: null` means the turn
  wrote no state** (no-access refusal, LLM fallback) — a real signal, distinct from field absent.
  Diagnostic column: read by the admin thread view, **deliberately absent from the external read
  contract**."
- Indexes present: `ix_chat_histories_contact_message_id (contact_id, message_id) WHERE message_id IS NOT NULL`
  (**partial, NOT unique**), `ix_chat_histories_channel_contact_sent_id`. **No index on `turn_id`** —
  see §4.5.
- Migration `295_chat_history_state_trace` added the column with no server default and no index, and
  created `public.v_turn_state_transition` over it.

That last model comment is why C1 is a **deliberate contract change** requiring CRM review, and why C1
returns a **4-key projection of `after`** and never the raw trace (§4.2).

### 1.4 What survives `trim()` — the reason C needs ZERO n8n writer change

The `state_trace` writer is the spine's `Call 'sub-respond-save-message-redis'2` (`f99f1e4b`), inside its
`data` expression. Verbatim, the collapsing rule:

```js
const RS = ['last_result_set', 'referenced_result_set', 'dym_candidates'];
const trim = (o) => {
  if (o === null || o === undefined) return null;
  if (typeof o !== 'object') return o;
  let c; try { c = JSON.parse(JSON.stringify(o)); } catch (e) { return null; }
  for (const k of RS) {
    const v = c[k];
    if (Array.isArray(v)) {
      const f = v.length ? v[0] : null;
      c[k] = { n: v.length, first: f ? (f.label ?? f.code ?? f.canonical_code ?? f.raw ?? f.uuid ?? null) : null };
    }
  }
  return c;
};
…
after = $("compile-current-state").first().json.variables ?? null;
return { v: 1, before: trim(before), parser_raw: trim(parser_raw), parser_applied: trim(parser_applied), after: trim(after) };
```

(Re-verified verbatim 2026-08-02 — the bundle did **not** touch `trim()` or its `RS` list.)

Three consequences, all load-bearing:
1. **The loop is TOP-LEVEL only.** `dym_offer` is an object, not in `RS`, and is never descended into →
   **`dym_offer.candidates` survives intact**, with `code` / `for_raw` / `for_canonical` / `entity_type`
   / `uuid` / `picked` / `ttl` / `id`. `entities`, `domain_hint`, `intent_hint`, `selection_context`,
   `routing`, `response`, `access_levels` all survive verbatim.
2. **`last_result_set` and `dym_candidates` are DESTROYED** — replaced by `{n, first}`. This is not a
   footnote; it is the safety argument that fixes the whitelist (§3.3, §4.2).
3. **⭐ NEW 2026-08-02 — `dym_last_result_set` is NOT in `RS`, so it SURVIVES VERBATIM.** Every row keeps
   `idx`/`label`/`value`/`product`/`uuid`/`entity_type`/`for_raw`/`for_hint`/`for_canonical`. This single
   fact is what makes §0.9's 5th key possible at all: the numbered dym set is recoverable from a quoted
   turn, whereas the stock `last_result_set` is not. **Any future addition to `RS` would silently break
   C2** → §4.4(11) locks it into CI.

`state_trace.after` is `compile-current-state`'s **unwrapped `variables` object** — a 20-key literal:
`message_type, intent_hint, domain_hint, user_goal, query_scope, access_levels, entities, routing,
escalation, response, last_result_set, selection_context, date_filter_start, date_filter_end, date_mode,
match_mode, contains_flyer, dym_offer, dym_candidates, ideation` — **plus a conditional 21st**:
`if (_dymLastResultSet) output.variables.dym_last_result_set = _dymLastResultSet;` (live
`compile-current-state` **L525**). The key is **absent** on every turn that armed no dym set, which is
why C1 must project it as `[]` rather than let `undefined` through (§3.3's object-spread exactness rule).
Note `order_status` and `is_active` are computed but **not** persisted into `variables` — do not expect
them in `after`.

### 1.5 `previous_conversation_state` — every read site in live `output_exchange` (**19 + 1**, re-counted 2026-08-02)

This enumeration is what makes the "one rebase point, zero new carry sites" claim checkable rather than
asserted. **Mechanically: 20 textual occurrences on 20 lines; 19 resolve through the `parent_input`
binding, exactly 1 (L704) does not.** (The plan previously said "17 + 1"; the count grew with the bundle,
the *structure* did not.)

| line(s) | read | rebases under C2? |
|---|---|---|
| **L100** | `_priorEnts0` (entity dedup) | ✅ |
| **L165** | `applyDymPick`'s `const _pv = parent_input.previous_conversation_state \|\| {}` — evaluated at call time, so after the rebase regardless of where the fn is defined. Feeds the date carry **and bundle #5's `intent_hint` realignment (L216)** | ✅ |
| **L222** | `tryDymPick`'s `const _prev = …` — invoked L243 | ✅ |
| L357–358 | entity-op executor `prior` | ✅ |
| L371–373 | `reuse` date carry | ✅ |
| L378–379 | `reuse` `is_active` carry | ✅ |
| **L385–386** | **CARRY SITE 1** — entity-less reuse domain continuity (gate L384) | ✅ |
| **L424** | `const prevState = parent_input.previous_conversation_state \|\| {}` → L435, 440, **453**, **455**, 465, 466, 470–472, 477, **498**, **500**, **502**, 525 | ✅ |
| **L630, L638** | **CARRY SITE 2** — entity-bearing compatibility carry (gate L629) | ✅ |
| L681 | `priorRouting = …previous_conversation_state?.routing ?? {}` | ✅ |
| L685 | `prevResponse = …previous_conversation_state?.response \|\| ''` → `offeredEscalation` (L686) | ✅ (but `response` is **not** whitelisted → value unchanged) |
| L746, L748 | CS member-pick arm: `selection_context`, `last_result_set` | ✅ (neither whitelisted → values unchanged) |
| **L704** | ⚠️ **not** via `parent_input` — `$('When Executed by Another Workflow').first().json.previous_conversation_state?.access_levels` (a second, independent binding) | ❌ **by design** |

`parent_input` is declared `let` at **L52** (`let parent_input = $('When Executed by Another Workflow').first().json`).
`prevState`, `_prev`, `_pv` and every `parent_input.previous_conversation_state?.…` read resolve
**through** that binding. L704 does not. §3.2 turns that asymmetry into a feature (V-C4 is built on it).

### 1.6 The two carry gates, verbatim, and the shared `_explicit`

```js
const _DECISIVE_INTENTS = new Set([
  'check_product','check_incoming','check_promotion','check_order','check_stock',
  'check_goods_receive','check_spo','check_product_attachment',
  'get_forms','get_portal_link','get_resource_attachment','submit_idea',
]);
const _explicit = _DECISIVE_INTENTS.has(output.output.intent_hint) && !!output.output.domain_hint;   // L262
```
(`_DECISIVE_INTENTS` now also contains `submit_idea`; it is L252–261.)

- **Site 1 (L383–389)** — `reuse` op, entity-less. Gate, **verbatim live L384**:
  `if (!_explicit && !_switchDomain) {   // #6: a domain switch beats the reuse carry`
  → `domain_hint = prev.domain_hint || cur || null; intent_hint = prev.intent_hint || cur || null; domain_reused_entityless = true`
- **Site 2 (L628–645)** — entity-bearing. Gate, **verbatim live L629**:
  `if (!_explicit && !_switchDomain) {   // #6: a domain switch beats the entity-bearing carry`
  → `prevDom = prev.domain_hint; if (prevDom && curEnts.length) { compatible = curEnts.every(e => !DOMAIN_BLOCKED_HINTS[prevDom].has(e.hint)); if (compatible) { domain_hint = prevDom; intent_hint = prev.intent_hint || cur || null; domain_inherited_compatible = true } else { domain_inherit_blocked = prevDom } }`

⚠️ **Both gates gained `&& !_switchDomain` from bundle change #6.** The bodies are otherwise unchanged.
C2 must leave both gate lines **byte-identical**, `_switchDomain` clause included — §3.3(4).

`_explicit` is computed at **L262** — i.e. **after** `tryDymPick` (L221–244) and **before** both gates.

### 1.7 The bundle's two NEW writers of `domain_hint`, and how each stands vs the invariant

Both are new since this plan was written, and they are the reason §2's invariant needed restating rather
than merely re-anchoring.

**#5 — dym-pick domain force (L204–218, inside `applyDymPick`).** `output.output.domain_hint =
_offer.domain` and `output.output.intent_hint = _pv.intent_hint ?? null`, gated on
`(_isBareCode || _viaNumbered) && _offer && _offer.domain`, with diagnostic
`dym_pick_domain_forced`. Sources: `_offer` ← `_prev.dym_offer` (L225) or `prevState.dym_offer` (L500);
`_pv` ← `parent_input.previous_conversation_state` (L165). **Both rebase under C2.**

**#6 — domain-switch word (L292–307 compute, L650–654 apply).** `output.output.domain_hint =
_switchDomain`, `output.output.intent_hint = null`, diagnostic `domain_switched_by_keyword`. Source is
the **CURRENT message text only** (`parent_input.latest_user_message`, reply-to suffix stripped at L294) —
never prior state. It fires only when `!_explicit`, no current-message entity exists, and every remaining
content token maps to the *same* domain. It also **suppresses both carry gates**.

Composition with C2 (this is a *benefit*, and it is the strongest new argument for §UAC 27.2):
- A quoted dym pick now inherits the **quoted** offer's domain, because #5 reads the rebased `_offer`.
  C2 + #5 compose correctly with no extra code.
- #6 is unaffected by the rebase and correctly **wins over** it: on a quote-reply where the customer
  types a bare domain word, the explicit current-turn switch beats the quoted baseline. That is the
  invariant's precedence rule, working as intended.

---

## 2. Objective and the invariant this plan is bound by

**Objective.** When a customer quote-replies, the parser's continuity **baseline** must be the state of
the turn they pointed at, so `domain_hint` / `intent_hint` / `entities` / `dym_offer` come from that
turn — and the quoted TEXT can then be deleted from `latest_user_message` (old delta B) without losing
signal.

**The invariant — UNCHANGED in substance, RESTATED 2026-08-02 because the bundle added one sanctioned
exception the user should know about:**

> **ONE owner for domain continuity.** A carry fills holes and never overwrites what the current turn
> supplied. The pointer decides only **WHICH prior turn counts as "prior"**. C2 must not create a new
> owner of domain-from-prior-state.

**Do bundle #5 and #6 respect it? One does; one is a new, documented exception.**

| change | reads prior state? | overwrites the current turn? | verdict |
|---|---|---|---|
| carry site 1 (L385–386) | yes | **no** — `prev \|\| cur \|\| null`, and gated `!_explicit && !_switchDomain` | ✅ compliant (hole-filling) |
| carry site 2 (L637–638) | yes | **no** — same shape, plus the compatibility check | ✅ compliant (hole-filling) |
| **#6 domain-switch word** (L651, L653) | **no** — current message text only | it *is* the current turn supplying | ✅ **compliant.** It suppresses both carries via `!_switchDomain`, which is precisely the invariant's precedence rule. Not a new owner. |
| **#5 dym-pick domain force** (L215–216) | **yes** — `_offer.domain` from the prior turn's stored offer | **YES.** It replaces the LLM's `domain_hint` outright, and L216 can set `intent_hint` to `null`, discarding a current-turn value | ⚠️ **NEW SANCTIONED EXCEPTION — flagged loudly** |

**Why #5's exception is defensible, and what makes it safe:** it fires only when
`_isBareCode` (the *whole* user message is the picked code) or `_viaNumbered` (the pick arrived through
the numbered handler). In both cases the LLM's `domain_hint` is an artifact of classifying a bare code
with no purpose-word — it is not a user signal, so overwriting it does not violate the *spirit* of "never
overwrite what the current turn supplied". A code embedded in a larger phrase
(`promotions for <code>`) is neither bare nor numbered → **not** forced (verified by the two declining
probes in §0.11). So #5 is better described as a **narrowly-gated pick override**, not a carry.

**⇒ The invariant's operational form is therefore: THREE owners of `domain_hint`-from-prior-state — carry
site 1, carry site 2 (both hole-filling, both gated `!_explicit && !_switchDomain`), and #5's pick
override (overwriting, gated bare-code-or-numbered). C2 must not create a FOURTH.** All three read prior
state through the rebound `parent_input`/`prevState`/`_pv`, so the rebase remains **one statement** and
all three are rebased for free — which is the whole design.

Operationally testable form — **the census, now CONTENT-based not count-based** (see §0.12 for why the
count form was wrong):

> The **set of source lines** that assign to `output.output.domain_hint` / `output.output.intent_hint`
> must be **textually identical** before and after C2 (order- and offset-insensitive), **and** the
> inserted rebase block must contain **zero** `output.output.*` assignments other than the
> `state_rebased_from_quote` diagnostic. §UAC 27.3 / §11 V-C2 is that gate, with a **mandatory
> induced-failure step**.

(For completeness, live also has non-carry writers of `domain_hint` that are out of scope and must equally
not be touched: L95/96 `norm()` coercion, L114–115 `resource_attachment` normalisation, L134–135
`MENU_LABELS` shortcut, L465–466 non-dym ALL hole-fill, L470–472 `domain_inherited_for_position`. The
content gate covers all of them, which is stronger than any claim about carries alone.)

---

## 3. C2 — the parser change (REBASE, not merge). **`scope: parser`**

### 3.1 Contract: one new declared input

`XTODTw-dJcV0uRdC056hG` › `When Executed by Another Workflow` › `workflowInputs.values` gains
**one** entry, appended after `referenced_result_set` (live currently declares exactly six:
`latest_user_message`, `contact_id`, `previous_conversation_state`, `referenced_result_set`, `is_test`,
`mock_reformulator_output` — re-verified 2026-08-02):

```json
{ "name": "referenced_state", "type": "object" }
```
No other trigger change. `referenced_result_set` keeps its meaning and its array type — **back-compat is
absolute**; C2 adds a channel, it does not alter one.

**⚠️ REVISED 2026-08-02 — `referenced_state` carries FIVE keys, not four.** The projection is:

| key | why |
|---|---|
| `domain_hint` | continuity baseline |
| `intent_hint` | continuity baseline; also #5's realignment source (`_pv.intent_hint`, L216) |
| `entities` | the prior entity list `applyDymPick` replaces into (`_prior`), and the dedup baseline |
| `dym_offer` | the quoted turn's did-you-mean offer (candidates + `id` + `domain`) |
| **`dym_last_result_set`** ⭐ NEW | the **numbered rendering of that same offer**. Added per §0.9 — without it, `_offer` comes from the quoted turn while `_dymSet` comes from the current turn (L498/L500 read the same `prevState`), which resolves position N of an unrelated list and then force-routes domain via #5. Rebase-both-or-neither. |

`dym_candidates` remains **derived on the n8n side** from the rebased `dym_offer` (§3.2) and is
deliberately **not** a CRM key.

### 3.2 The rebase — exactly one place, exactly one statement

**Placement, re-verified 2026-08-02.** Insert immediately after live **L53** (`const norm = …`), i.e. at
what becomes L54. The only two hard constraints are:
1. **after** the `parent_input` binding at **L52**, and
2. **before the first `previous_conversation_state` read at L100** (`_priorEnts0`).

Anything in 54..99 satisfies both. `_parser_raw_snapshot` (L76) is **not** a constraint — it snapshots
`output.output`, not `parent_input` (§0.2), so the block may sit either side of it. `applyDymPick`'s `_pv`
(L165) and `tryDymPick`'s `_prev` (L222) are evaluated at *call* time (L243), so they are rebased no
matter where the function is defined. The block reassigns the `let` binding; it does **not** mutate the
n8n input item.

```js
// ── QUOTED-TURN STATE REBASE (quoted-turn-state-pointer) ─────────────────────────────
// A quote-reply points at ONE earlier bot bubble. `referenced_state` is that bubble's own
// turn state (CRM projection of state_trace->'after'), delivered alongside referenced_result_set.
// When it resolves, the quoted turn becomes the continuity BASELINE: we rebind
// previous_conversation_state ONCE, here, so every existing consumer — the entity-op executor's
// `prior`, tryDymPick's `_prev`, carry site 1, `prevState`, carry site 2 — reads it unchanged.
// This is deliberately NOT a fourth carry site: it changes WHICH prior turn counts as "prior"
// and NOTHING about carry policy. It writes to the INPUT side only; it never assigns
// output.output.domain_hint / intent_hint.
// FAIL SAFE: anything short of a well-formed projection leaves the baseline exactly as today.
const _refState = parent_input.referenced_state;
const _refStateOk = !!_refState && typeof _refState === 'object' && !Array.isArray(_refState)
  && ('domain_hint' in _refState) && ('entities' in _refState);
let _rebasedFromQuote = false;
if (_refStateOk) {
  const _base = (parent_input.previous_conversation_state && typeof parent_input.previous_conversation_state === 'object')
    ? parent_input.previous_conversation_state : {};
  const _qOffer = (_refState.dym_offer && typeof _refState.dym_offer === 'object') ? _refState.dym_offer : null;
  parent_input = { ...parent_input, previous_conversation_state: {
    ..._base,
    domain_hint: _refState.domain_hint ?? null,
    intent_hint: _refState.intent_hint ?? null,
    entities:    Array.isArray(_refState.entities) ? _refState.entities : [],
    dym_offer:   _qOffer,
    // REBASE-BOTH-OR-NEITHER (plan §0.9). dym_last_result_set is the NUMBERED rendering of the SAME
    // candidate list dym_offer holds — one logical object, minted together (compile-current-state
    // L441-443, shared id=$execution.id) and read from the SAME prevState at L498/L500. Rebasing the
    // offer while leaving the CURRENT turn's numbered set would resolve position N of an UNRELATED
    // list and then let #5 force-route to the quoted offer's domain: a confident wrong answer with no
    // error. It survives state_trace's trim() verbatim (NOT in RS), so the CRM can project it.
    dym_last_result_set: Array.isArray(_refState.dym_last_result_set) ? _refState.dym_last_result_set : [],
    // dym_candidates is a READ-ONLY MIRROR of dym_offer.candidates (compile-current-state L505).
    // Rebasing dym_offer without rebasing its mirror would let the CURRENT turn's offer feed
    // tryDymPick's legacy fallback (L226-227) — the same cross-turn leak, one level down.
    // DERIVED here from the rebased offer, so it is NOT a sixth CRM whitelist key.
    dym_candidates: (_qOffer && Array.isArray(_qOffer.candidates)) ? _qOffer.candidates : [],
  } };
  _rebasedFromQuote = true;
}
```
…and, immediately before `return output` (live **L866–867**, after `output._parser_raw = …`), a diagnostic
that is **absent unless true**:
```js
if (_rebasedFromQuote) output.output.state_rebased_from_quote = true;
```

> **Note on `_refStateOk`:** the guard deliberately keys on `'domain_hint' in` **and** `'entities' in`,
> **not** on `dym_last_result_set`. That keeps the guard back-compatible with the projection already
> deployed (§0.8), which has four keys: an old-projection response still rebases the four it carries, and
> `dym_last_result_set` falls to `[]`. Per §0.9(3) that `[]` fallback is *not* free — it is the
> clear-on-rebase behaviour with all its hazards — so **C2 must not be promoted before C1's 5th-key
> follow-up is deployed.** That ordering constraint is new (§6) and is the one place where C1 and C2 are
> no longer independent.

### 3.3 Why this is a REBASE, and the promote gate that proves no new owner appeared (⚠️ RE-EXPRESSED 2026-08-02)

**Why rebase, not merge.** For the five whitelisted keys the quoted value **replaces** the recent one —
including when the quoted value is `null` / `[]`. If the quoted turn had no entities, the baseline has
none. A union would reintroduce exactly the recency contamination the pointer exists to remove. This is
why the CRM must **always emit all five keys explicitly** (§4.2): spread semantics are only exact when
`undefined` never appears.

**Why no new owner appears.** The rebase writes to the *input* side. Both gates keep their
`!_explicit && !_switchDomain` condition byte-for-byte, `_explicit` (L262) keeps deriving purely from the
**current turn**'s `intent_hint` + `domain_hint`, `_switchDomain` (L292–307) keeps deriving purely from the
current message text, and no gate body changes. So "a carry fills holes and never overwrites what the
current turn supplied" is preserved *by construction*, and every downstream consumer — including ones
nobody re-reads, like L568–575's `attachment_type` re-attach and L470–475's positional inherit — is
rebased for free.

**Reviewer's checklist (any single violation means the delta is wrong):**

1. The block assigns **only** `parent_input` (and the locals `_refState`, `_refStateOk`,
   `_rebasedFromQuote`, `_base`, `_qOffer`). It never assigns `output.output.domain_hint` or
   `output.output.intent_hint`.
2. Placement: **after** the L52 `parent_input` binding and **before** the first
   `previous_conversation_state` read at **L100** — placement, not just presence (§3.2).
3. `_explicit` (L262) is untouched and remains a function of the current turn only.
4. **Both gate lines are byte-unchanged, `&& !_switchDomain` included** (L384 and L629), and both gate
   bodies are byte-unchanged.
5. `output.output.state_rebased_from_quote` is written **only when true** — absent on ~100% of golden
   turns, so it needs no replay `norm()` rule (contrast LESSON 40).
6. No `if (quoted) …` branch appears anywhere else in the file.
7. **NEW:** `parent_input` is reassigned exactly **once** — the rebase — beyond its `let` declaration.
   Two reassignments would mean a second, hidden rebase point.

#### The gate, mechanically (⛔ the old count-based form would FALSE-FAIL — see §0.12)

Run against the `output_exchange` body extracted to a file, **before** and **after** C2:

```sh
# G1 — assignment-line CONTENT set: offset-insensitive, order-insensitive, must be IDENTICAL
grep -hoE 'output\.output\.(domain_hint|intent_hint)[[:space:]]*=[^=].*$' OUT.js \
  | sed -E 's/[[:space:]]+/ /g' | sort > sites.txt
wc -l < sites.txt && shasum sites.txt      # PRINT the population count — never let empty output mean PASS

# G2 — the rebase block writes ONLY parent_input (zero output.output.* inside it)
awk '/QUOTED-TURN STATE REBASE/,/^}$/' OUT.js | grep -cE 'output\.output\.'
#     required: 0. The state_rebased_from_quote line lives near L866, OUTSIDE this block.

# G3 — exactly one reassignment of parent_input beyond the `let` declaration
grep -cE '^[[:space:]]*parent_input[[:space:]]*=' OUT.js        # required: 1

# G4 — both carry gates verbatim
grep -cF 'if (!_explicit && !_switchDomain) {' OUT.js           # required: 2
```
Expected on live today: **G1 population = 18** (9 `domain_hint` + 9 `intent_hint` assignments — see §0.12
for why a loose grep says 11 for `domain_hint`); **G4 = 2**.

**⛔ MANDATORY induced failure (LESSON 61 — an assertion never shown to fail is not an instrument).**
Before trusting G1–G3, take a scratch copy of the *post-C2* file, insert the forbidden line
`output.output.domain_hint = _refState.domain_hint;` inside the rebase block, and confirm **G1's sha
changes AND G2 returns ≥1**. Record both the induced red and the real green in the run log. That forbidden
line is exactly the deleted-line-210 bug class: writing the **output** side instead of the input side —
which a count gate "relaxed to match the new count" would have waved straight through.

**Any G1 sha difference, G2 ≠ 0, G3 ≠ 1, G4 ≠ 2, or any checklist violation ⇒ REQUEST-CHANGES**, no
discussion.

### 3.4 What is deliberately NOT rebased — and why each exclusion is a safety property

`_base` supplies every non-whitelisted key from the **current** session. This is not laziness; four of
the exclusions are load-bearing:

| key | excluded because |
|---|---|
| **`last_result_set`** | **It is destroyed by `trim()`** — `state_trace.after.last_result_set` is `{n, first}`, not an array (§1.4). Rebasing it would hand `output_exchange` a non-array where **L525/L748** expect rows with `idx`/`uuid`/`label`. The *untrimmed* quoted set is already delivered by the existing `referenced_result_set` channel, which **L440/L523** already prefer — so nothing is lost. **Contrast `dym_last_result_set`, which IS rebased precisely because `trim()` spares it** (§1.4(3)) — the two look symmetric and are not. |
| **`selection_context`** | ⛔ **Rebasing it WITHOUT `last_result_set` is a wrong-CS-assign bug.** **L746–748**: if `selection_context` were rebased to `'member_offer'` from an old bubble while `last_result_set` stayed the *current* session's (a different roster), a bare `2` would resolve to the **wrong member's** `uuid` → real assign → staff email/WhatsApp ripple. And `last_result_set` *cannot* be rebased (row above). Since **L441** already treats `_refSet.length > 0` as a pick-context, the functional need is already met. **Non-negotiable exclusion.** |
| **`response`** | Drives the escalation-confirmation gate (**L685–686** `/would you like me to escalate/i`). Rebasing it would let a "yes" quote-confirm an escalation the customer did not just see — a staff-ripple write triggered by an old bubble. Excluded → today's fail-safe behaviour retained. ⚠️ **Cost, named openly (§0.9's KNOWN GAP / F7):** `response` also carries the `[N did-you-mean suggestions active]` marker (`compile-current-state` L444) that the parser uses to emit `reference_target='dym'`. Not rebasing it means a quoted dym pick only fires when the marker is *independently* active. Escalation safety wins; the gap is recorded in §UAC 27.13, not silently absorbed. |
| **`access_levels`** | Access can be revoked between turns. The baseline must never re-grant stale access. Note **L704** reads it via a *separate* binding anyway (§1.5), so it is doubly safe. |
| `routing` | Feeds `priorRouting` (**L681**) → `suggested_team` fallback and the member-pick retarget tier. Out of scope; excluded. |
| `date_filter_*`, `date_mode`, `is_active`, `match_mode`, `query_scope`, `user_goal`, `contains_flyer`, `escalation`, `message_type`, `ideation` | No demonstrated quote-reply need. Excluding them keeps the blast radius at five keys. `ideation` in particular has a live shape hazard (memory `ideation-sessionvars-shape-mismatch`) — stay out. (`is_active` and `order_status` are not even persisted into `variables` — §1.4.) |

**Emergent safety theorem (assert it, don't just believe it) — re-verified against the 867-line file.**
Every input to the CS member-pick arm (**L746–845**) — `selection_context` (L746), `last_result_set`
(L748), `latest_user_message` (L767/L778), `priorRouting` (L681) — is outside the whitelist. C can
therefore reach that arm only through `_isNewQuery` (**L783**), which reads `_o.domain_hint`. But
`_hasPickSignal` (L787) is branched on **first** (**L798** vs **L841**), so any real pick signal still
wins. The only reachable change is **Tier 4 (junk → reprompt) becoming Tier 3 (abandon)** — both
non-assigning. **⇒ C2 cannot cause an assign that would not otherwise happen, and cannot change WHICH
member is assigned.**
**Strengthened by the bundle:** the arm's own entry gate is now
`if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true)` (**L747**) — a dym pick
skips the member arm entirely, so the one path C2 measurably influences (dym picks) is now *excluded* from
the member arm by construction. §UAC 27.7 proves it empirically, with the LESSON-39 pass rule.

### 3.5 The mirror traps — `dym_candidates` (original) and `dym_last_result_set` (⚠️ NEW 2026-08-02)

**Trap A — `dym_candidates` (unchanged in substance, re-anchored).** `compile-current-state` **L502–505**
writes `dym_candidates` as a *read-only legacy mirror* of `dym_offer.candidates`. `tryDymPick`
**L226–227** falls back to it when `_prev.dym_offer` is not an object:

```js
const _offer = (_prev.dym_offer && typeof _prev.dym_offer === 'object') ? _prev.dym_offer : null;
const _cands = (_offer && Array.isArray(_offer.candidates)) ? _offer.candidates
             : (Array.isArray(_prev.dym_candidates) ? _prev.dym_candidates : []);
```
If the rebase set `dym_offer: null` (the quoted turn had no offer) but left the *current* session's
`dym_candidates` array in place, a typed code would be matched against the **current** offer while
claiming to be a quoted pick — the precise cross-turn leak this plan exists to close. Hence the derived
`dym_candidates` line in §3.2. It stays **derived on the n8n side**, so it is not a CRM key.

(The reverse is harmless: `state_trace.after.dym_candidates` is `{n, first}`, an object, so
`Array.isArray` is false and it could never be used as candidates even if it leaked in.)

**Trap B — `dym_last_result_set`: the SAME class, one level up, on the key the bundle added.** Full
statement and the rejected alternatives are in **§0.9**; the mechanism in one paragraph:
`dymNumberedMultiSelect` reads `_dymSet` from `prevState.dym_last_result_set` (**L498**) and `_offer`
from `prevState.dym_offer` (**L500**) — the *same* `prevState`. Rebase one and not the other and a
quoted `2` resolves position 2 of an **unrelated, more recent** suggestion list, then bundle #5 fires via
`_viaNumbered` and force-routes `domain_hint` to the **quoted** offer's domain. Confident wrong answer,
no error, no diagnostic. Hence the `dym_last_result_set` line in §3.2 and the **5th CRM key** in §3.1.

**Why Trap B needs a CRM key while Trap A does not:** Trap A's mirror is *derivable* from `dym_offer`
(same candidate list, different shape). Trap B's is **not** — `dym_last_result_set` carries the rendered
`idx`→row mapping (`idx`/`label`/`value`/`product`), i.e. the numbering the customer actually saw, which
`dym_offer.candidates` does not encode. It cannot be reconstructed on the n8n side; it must be projected.

**Generalisable rule to carry into any future rebase (worth adding to LESSONS):** *before rebasing a key,
enumerate every OTHER key read from the same prior-state object in the same code block. Any such key is
part of the same logical unit and must be rebased with it, or the rebase manufactures a coherent-looking
pairing of two different turns.* Both traps here are one instance of that rule; §3.2's comments name it
in-line so the next editor does not have to rediscover it.

### 3.6 The resulting design: a TWO-AXIS pointer, discriminated by the parser's existing `reference_target` (NEW 2026-08-02)

The bundle's two-set model means a quote-reply can address **two different numbered things** in one
bubble. After this revision the pointer is symmetric across both axes, and the discriminator is one the
parser already emits — no new concept:

| axis | quoted-turn channel | consumed at | selected when |
|---|---|---|---|
| **stock / menu / roster** rows | `referenced_result_set` (already live; `chat_histories.result`) | `_lrsAll` L440, `lastSet` L523–525 | `reference_target` is `'result'` or `null` → the byIdx block |
| **did-you-mean suggestions** | `referenced_state.dym_last_result_set` (**C2, new**) | `_dymSet` L498, `_dymActive` L453 | `reference_target === 'dym'` → `dymNumberedMultiSelect` |

Three properties follow, and each is a testable claim rather than a hope:
1. **Both axes now come from the SAME quoted turn.** That is the whole content of the §0.9 fix, and it is
   what makes a quoted pick coherent instead of a cross-turn hybrid.
2. **No new routing logic.** `reference_target` already discriminates in-session; C2 changes only *which
   turn* each side reads. The invariant ("the pointer decides WHICH prior turn counts as prior") holds
   literally.
3. **The `result` column stays as it is** — the stock set (§0.10). Changing what gets logged would be a
   spine + sendmsg-sub change with a much larger blast radius; it is flagged as **F8**, not bundled here.

⚠️ **The one asymmetry left, stated so nobody discovers it as a surprise:** axis 1's selector needs no
prior state (byIdx just prefers `referenced_result_set` when it is non-empty), whereas axis 2's selector
(`reference_target='dym'`) depends on a marker in the un-rebased `response`. So axis 1 works on any quote;
axis 2 works on a quote **only while a dym marker is independently active**. That is §0.9's KNOWN GAP →
**F7**, recorded by §UAC 27.13.

---

## 4. C1 — the CRM read-contract widening. **Side: CRM. Read-only spec — do NOT edit the CRM repo from this pipeline.**

> ## ⚠️ STATUS 2026-08-02 — C1 IS DEPLOYED. §4 is now a DELTA spec, not a build spec.
> The four-key `referenced_state` projection is **live and proven against production data** (§0.8: clone
> execs `10820850` non-null / `10820865` null-with-key-present). §4.1–§4.4 below describe the shipped
> shape; **the only outstanding CRM work is the FIFTH key** (§0.9). Concretely:
> - `get_referenced_state` gains **one** line in its return dict:
>   `"dym_last_result_set": raw["dym_last_result_set"] if isinstance(raw.get("dym_last_result_set"), list) else []`
> - the docstring's whitelist sentence changes four → five;
> - `tests/test_chat_history_result_set.py` gains tests **11 and 12** (§4.4), and test **8**'s expected
>   key-set changes from four to five.
> - **No SQL change** — `state_trace -> 'after'` already carries it (§1.4(3)); no new query, no column, no
>   migration, no index.
>
> **Ordering constraint that is NEW (and the one place C1 and C2 stopped being independent):** C2 must not
> be promoted until the 5th key is deployed, because a four-key response makes C2 fall back to
> `dym_last_result_set: []` — which is exactly the clear-on-rebase behaviour §0.9 rejected. See §6.

### 4.1 Precise change surface

| file | change |
|---|---|
| `sorento_crm_backend/app/services/conversation_variables_service.py` | **add** `get_referenced_state(db, *, respond_io_id, message_id) -> dict \| None` + module constant. No change to `get_for_contact` / `overwrite_for_contact` / `get_referenced_result_set`. |
| `sorento_crm_backend/app/api/v1/external/conversation_variables.py` | import the new function; add **one** key inside the existing `if message_id is not None:` block (lines 58–64); extend the `message_id` `Query(description=…)` text. |
| `sorento_crm_backend/tests/test_chat_history_result_set.py` | extend (§4.4). |
| — | **NO Alembic migration.** Both columns exist and are populated. `ConversationStateResponse.session_vars` is `dict[str, Any]`, so **no schema change**. |

### 4.2 The SQL, exact

One statement, one round-trip. `anchor` reuses `get_referenced_result_set`'s tie-break discipline
(`message_id` is indexed but **not unique**, §1.3); the outer select then resolves that turn's INCOMING
row, which is the only row type that carries `state_trace`.

```sql
WITH anchor AS (
    SELECT turn_id
    FROM   chat_histories
    WHERE  contact_id = :cid
      AND  message_id = :mid
    ORDER BY sent_at DESC, id DESC
    LIMIT 1
)
SELECT ch.state_trace -> 'after' AS after_state
FROM   chat_histories ch
JOIN   anchor a ON a.turn_id IS NOT NULL AND ch.turn_id = a.turn_id
WHERE  ch.contact_id = :cid
  AND  ch.type = 'incoming'
  AND  ch.state_trace IS NOT NULL
ORDER BY ch.sent_at DESC, ch.id DESC
LIMIT 1
```

Four deliberate properties:
- **Anchor is type-agnostic.** `get_referenced_result_set` does not filter `type` either, so this
  mirrors it. Bonus: if the customer quotes *their own* earlier message, that incoming row's `turn_id`
  resolves to itself → the same turn's state, which is the semantically right answer with no extra code.
- **`a.turn_id IS NOT NULL` is in the JOIN condition**, so a proactive send / console row / historical
  NULL yields zero rows → `None`. No special-casing.
- **`contact_id` is re-applied on the outer select.** `turn_id` is `$execution.id`, globally unique per
  n8n execution, but re-scoping costs nothing and makes cross-contact leakage structurally impossible.
- **`-> 'after'`** (JSONB), not `->>`. `after: null` therefore arrives as JSON null → Python `None` →
  a **MISS** (see below), which is the required semantics.

### 4.3 The Python, exact — the whitelist is enforced server-side

```python
_REFERENCED_STATE_SQL = """…the SQL above…"""


def get_referenced_state(
    db: Session,
    *,
    respond_io_id: str,
    message_id: str,
) -> dict[str, Any] | None:
    """Return a 4-key projection of the quoted turn's post-turn conversation state.

    Resolution: the chat-history row with this (contact, message_id) identifies a TURN via
    `turn_id`; that turn's INCOMING row carries `state_trace`, whose `after` member is the
    state the turn wrote. Returns None on any miss so the caller can degrade to the
    immediately-previous state rather than to a stateless baseline.

    Deliberately a PROJECTION, never the raw trace: `before` / `parser_raw` /
    `parser_applied` stay internal, and `last_result_set` / `selection_context` /
    `response` / `access_levels` / `routing` are withheld (see plan §3.4 — two of those
    exclusions are wrong-assign and stale-access safety properties, not tidiness).
    """
    row = db.execute(
        text(_REFERENCED_STATE_SQL),
        {"cid": respond_io_id, "mid": message_id},
    ).first()
    if row is None:
        return None
    raw = row.after_state
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            return None
    # `after: null` means the turn wrote no state (no-access refusal, LLM fallback). That is a
    # MISS, never `{}` — returning an empty baseline would WIPE continuity, which is strictly
    # worse than today's behaviour.
    if not isinstance(raw, dict):
        return None
    # All FIVE keys ALWAYS present when non-None: the n8n rebase uses object-spread, whose
    # semantics are only exact when `undefined` can never appear (plan §3.3).
    return {
        "domain_hint": raw.get("domain_hint"),
        "intent_hint": raw.get("intent_hint"),
        "entities": raw["entities"] if isinstance(raw.get("entities"), list) else [],
        "dym_offer": raw["dym_offer"] if isinstance(raw.get("dym_offer"), dict) else None,
        # ⭐ 5th key (plan §0.9). The NUMBERED rendering of dym_offer's candidates. Absent from
        # `after` on every turn that armed no dym set (compile-current-state L525 emits it
        # conditionally) -> normalise to [] so the n8n spread stays exact. It is the ONLY result-set
        # style key that survives state_trace's trim() intact (it is not in trim's RS list), which is
        # why it can be projected at all while `last_result_set` cannot.
        "dym_last_result_set": raw["dym_last_result_set"] if isinstance(raw.get("dym_last_result_set"), list) else [],
    }
```
Endpoint (`conversation_variables.py`, inside the existing `if message_id is not None:`):
```python
        state = {
            **state,
            "referenced_result_set": get_referenced_result_set(
                db, respond_io_id=respond_io_id, message_id=message_id
            ),
            "referenced_state": get_referenced_state(
                db, respond_io_id=respond_io_id, message_id=message_id
            ),
        }
```
Contract, matching `referenced_result_set`'s established shape (**both halves empirically confirmed
against prod, §0.8**):
- **Without `?message_id=`** → the key is **absent entirely** (the CRM's own tests already assert this
  for `referenced_result_set`; the new key must behave identically).
- **With `?message_id=`** → the key is **always present**, `null` on any miss. ✅ observed:
  bogus `message_id` → `referenced_state: null` with the key present (clone exec `10820865`).
- **When non-`null`, all FIVE keys are present**, `[]`/`null` rather than absent.
- GET **never writes**. Unknown contact still 404s in `get_for_contact`, before either lookup.

> ⚠️ **Harness note discovered while proving §0.8 — belongs in every §27 case that touches result sets:**
> `referenced_result_set` was `null` on **both** probes because the quoted row was an **INCOMING** message,
> and incoming rows carry no `result`. **Only quoting an OUTGOING (bot) bubble yields both keys.** A case
> that quotes a customer message and then asserts on `referenced_result_set` is a
> `green-that-cannot-fail` waiting to happen. (`referenced_state` itself *does* resolve for a quoted
> incoming row — §9 M13 — because the anchor is type-agnostic.)

### 4.4 CRM tests to add (extend `tests/test_chat_history_result_set.py` — it already covers the sibling)

1. `test_conversation_variables_injects_referenced_state` — outgoing row with `turn_id=T` + incoming row
   with `turn_id=T`, `state_trace={'v':1,'after':{...}}` → all **five** keys returned, values match.
2. `test_referenced_state_absent_without_message_id` — mirrors the existing
   `assert "referenced_result_set" not in sv`.
3. `test_referenced_state_null_when_turn_id_null` — outgoing row with `turn_id IS NULL` → `None`.
4. `test_referenced_state_null_when_state_trace_null` — incoming row exists, `state_trace IS NULL` → `None`.
5. `test_referenced_state_null_when_after_is_json_null` — `state_trace={'v':1,'after':None}` → **`None`,
   not `{}`**. ← the most important test in the set (§4.3's wipe hazard).
6. `test_referenced_state_scoped_to_contact` — same `message_id`, different contact → `None`.
7. `test_referenced_state_picks_latest_on_duplicate_message_id` — two rows, same `(contact, message_id)`,
   different `sent_at` → the newer turn's state.
8. `test_referenced_state_projection_withholds_internal_keys` — `after` carries
   `last_result_set` / `selection_context` / `response` / `access_levels` / `routing` / `before` →
   response contains **exactly the FIVE** whitelisted keys (**updated 2026-08-02** — was four). This is
   the contract-boundary test; without it, a future `after` key silently starts leaking.
9. `test_referenced_state_dym_offer_candidates_survive` — `after.dym_offer.candidates` round-trips with
   `code`/`for_raw`/`entity_type`/`uuid` intact (locks §1.4's `trim()` finding into CI).
10. `test_referenced_state_tolerates_non_dict_entities` — `after.entities = {"n":3}` → `entities: []`,
    no 500.
11. ⭐ **NEW** `test_referenced_state_dym_last_result_set_round_trips` — `after.dym_last_result_set` is a
    list of rows; every row keeps `idx`/`label`/`value`/`product`/`uuid`/`entity_type`/**`for_raw`**/
    **`for_hint`**/**`for_canonical`**. The three `for_*` fields are the ones `applyDymPick` needs to
    replace the right entity in place; a projection that drops them looks fine and silently breaks
    quoted picks. **This test is what locks §1.4(3) (`dym_last_result_set` is not in `trim()`'s `RS`) into
    CI — if anyone ever adds it to `RS`, this test goes red instead of C2 going quietly wrong.**
12. ⭐ **NEW** `test_referenced_state_dym_last_result_set_absent_becomes_empty_list` — `after` with **no**
    `dym_last_result_set` key (the normal, no-dym turn: `compile-current-state` L525 omits it) →
    `dym_last_result_set: []`, **present, not absent, not `None`**. `[]` is what disarms `_dymActive`
    (L453) and `dymNumberedMultiSelect` (L499) for that quote; `None` would break `Array.isArray` on the
    n8n side and `undefined` would break object-spread exactness (§3.3).

### 4.5 CRM-side risks

- **R-C1 — no index on `turn_id`.** The outer select filters `contact_id + type + turn_id`. It will use
  `ix_chat_histories_channel_contact_sent_id` for the contact and filter the rest; per-contact row counts
  are small (thousands), so this is fine at current volume, but it is a **seq-scan-within-contact**, on a
  high-volume table, on the hot inbound path. Measure `EXPLAIN ANALYZE` on prod-like data before deploy;
  if it regresses, add a partial index `(contact_id, turn_id) WHERE turn_id IS NOT NULL` in its own
  migration — **not** bundled with C1 (LESSON 51).
- **R-C2 — contract-change review.** The model comment says `state_trace` is "deliberately absent from
  the external read contract". C1 exposes a 4-key projection of one member. That is a decision the CRM
  reviewer must sign, not something this plan can assume. §4.4(8) is its regression lock.
- **R-C3 — PII.** `entities[].raw` carries tokens the customer typed (including customer names). It is
  returned scoped to that contact's own turn, i.e. exactly the scope `referenced_result_set` already has.
  No new exposure class; state it in the CRM review.
- **R-C4 — one extra query per quote-reply turn.** Only when `?message_id=` is present (a small fraction
  of turns). Not batched with the sibling because they read different rows; two `LIMIT 1` index lookups.
- **R-C5 — Alembic.** None needed. If R-C1's index is later added, pick `down_revision` from the real
  `ScriptDirectory.get_heads()` tip, never the highest file number (memory `alembic-chain-not-by-number`).

---

## 5. Preconditions (HARD — the test phase is void without them)

### 5.1 ✅ §DC-0 — parser-fork parity. **SATISFIED 2026-08-02 → downgraded from BLOCKING BUILD to BLOCKING RE-VERIFY.**
The 2-line `tryDymPick` prior-domain overwrite no longer exists on either side — the bundle rewrote that
whole region and was promoted from the fork (§0.3, §0.11). Fork `wI5RkNGW3EOJfBdo` `output_exchange` is
**byte-identical** to live `XTODTw` (sha1 `ceadf7bc…`, `diff` = 0 lines, 867 lines each), and
`AI Agent.systemMessage` is byte-identical too (sha1 `eaf99055…`).

**The gate stays MANDATORY, in re-verify form**, because a byte-identical claim decays the moment anything
lands on either side (memory `stale-byte-identical-fork-claim`):
1. Re-fetch both `output_exchange` bodies; require `diff` (not just `diff -w`) **= 0 lines**, and record
   both sha1s in the run log.
2. Same for `AI Agent.systemMessage`.
3. Require `versionId == activeVersionId` on both (LESSON 24 rider hazard).
4. Record that the fork still has **8 nodes vs live's 7** — the orphaned `Postgres Chat Memory` (§0.4).

Until (1)–(3) are recorded green, §UAC 27 is **VOID, not pending**.
Build C2 on the fork **after** this check, and build the *promote target* as **live + only C2's hunks** —
never a copy of the fork, which carries the extra node (LESSON 57).

### 5.2 S-CRED — credential gate, static REST, run FIRST
MCP redacts credentials, so `get_workflow_details` evidence is vacuous (LESSON 47). Via **REST**
`GET {N8N_API_BASE}/workflows/{id}`:
- Every Postgres node on `txiPzSxy3Pclsz6v`, `ublq9nSlrpz63xan`, `oyYfVvZHRZpWubTy` binds
  `Dnnofg8Xb27VQOhI` (`n8n_test-db`). `chat_histories` exists in **both** `n8n_test` and the prod CRM DB,
  so a mis-bind reads/writes prod with **no error** (LESSON 10). Any `ETJL5KoaA1UpkDip` → **HALT**.
- **New this plan:** enumerate the credential on fork `wI5RkNGW3EOJfBdo`'s orphaned
  `Postgres Chat Memory` (§0.4). It is unreachable today; record what it is bound to, and prefer deleting
  the node over documenting it.
- Do **not** dump full REST GETs to disk unless gitignored — a full GET embeds `activeVersion`, which
  carries literal API keys on unconverted nodes (LESSON 59b).

### 5.3 Test data
- **Test contacts:** `437264483` (Jayson) = FULL access, all happy-path/quote cases. `457216562` = NO
  access (only used to prove the rebase cannot re-grant access — §UAC 27.5/M-ACC).
- ⚠️ **Partial / ask-for-access contact is still TBD** — inherited prerequisite, unchanged by this plan.
  No §27 case depends on it.
- Sessions come from `n8n_test.respond_contacts_test` via `mode=regress-capture` or from
  `sim-inject-session` (§0.5). Reset `session_vars = '{"variables":{}}'` **between independent cases,
  never mid-sequence** (LESSON 31).
- Serialize against replay: UAC and replay share `main-message-list-test` (LESSON 30).

### 5.4 ✅ NEW — clone-spine parity with the bundle. **Verified 2026-08-02; re-verify before building.**
The bundle changed two **spine** Code nodes (`compile-current-state`, `build-suggest-offer`). If the clone
were stale on either, every §27 case that exercises the two-set model would run pre-bundle spine code —
the same false-green class as §5.1, but on the other side of the boundary. Measured: `compile-current-state`
`diff -w` = **0 lines**; `build-suggest-offer` `diff -w` = **3 cosmetic hunks** (two comment box-rule
widths + one trailing newline), functionally identical. Clone `Call 'sub-query-reformulator'` correctly
targets fork `wI5RkNGW3EOJfBdo`. **Record the cosmetic delta in the run log** so a later byte-diff is not
mistaken for drift.

---

## 6. Rollout — ⚠️ **NO LONGER order-free.** One ordering constraint was introduced by the 5th key.

Every crossed-version combination degrades to today's behaviour **except one**, which is why the original
"safe in both deploy orders" claim no longer holds unqualified:

| CRM | spine (C3) | parser (C2) | result |
|---|---|---|---|
| old | old | old | today |
| **4-key (⬅ TODAY, §0.8)** | old | old | response carries an extra `referenced_state` key that **no node reads**. Inert. ✅ **This is the current state of production.** |
| 4-key | old | **new** | parser declares the input, spine never sends it → `undefined` → `_refStateOk` false → no rebase. ✅ |
| old | **new** | **new** | spine sends `session_vars.referenced_state`, which is `undefined` → the declared input arrives `undefined` → no rebase. ✅ |
| 4-key or 5-key | **new** | old | spine passes an input the parser's trigger does not declare → n8n drops it. Inert. ✅ |
| ⚠️ **4-key** | **new** | **new** | pointer live **but `dym_last_result_set` arrives absent → `[]`** = the clear-on-rebase behaviour §0.9 REJECTED: quoted numbered picks mis-resolve against the quoted STOCK set, and quoting the just-received bubble REGRESSES. **NOT ACCEPTABLE — see the ordering constraint below.** |
| **5-key** | **new** | **new** | pointer live, both axes coherent. ✅ target state |

**⛔ ORDERING CONSTRAINT (new 2026-08-02, and the only one in this plan):** the row above in ⚠️ is a real,
reachable, *silently wrong* state — not a degrade-to-today state. So **C1's 5th key must be deployed before
C2 is promoted.** Everything else remains order-free.

**Recommended sequence (each step user-gated, each independently revertible):**
1. ~~**C1** (CRM) — deploy + verify with CRM pytest~~ ✅ **DONE** (4-key projection live and proven, §0.8).
2. **C1-follow-up** — the 5th key + tests 11/12 + test 8's key-set change (§4 status box). Inert to n8n
   until C2 ships. **This is now a hard predecessor of step 5.**
3. **§5.1 fork-parity re-verify** and **§5.4 clone-parity re-verify**, then build **C2** on the fork; run
   §UAC 27 on the clone using **C4** injection (no CRM dependency at all — §6.3).
4. **§27.3 / V-C2 content gate** including its **induced failure** (§3.3). Blocks promote.
5. **C2 promote** to live parser `XTODTw`, published (LESSON 37). ⛔ Gated on step 2.
6. **C3 promote** — one leaf on the live spine. From this publish forward the pointer is live.
7. Post-promote verification **on the changed path** (LESSON 56): a real **quote-reply of an OUTGOING bot
   bubble** (§4.3's harness note — quoting an incoming row yields no `referenced_result_set`), not a
   happy-path turn. If a path cannot be exercised, record it **unverified** — never infer it.

**6.3 The clone can test C2/C3 with zero CRM dependency.** `sim-inject-session` (§0.5) is a Code node
feeding the `get-session-vars` NoOp directly. Its live shape on the clone, re-fetched 2026-08-02, is
exactly the 2-key form (no `referenced_state` yet). **C4** extends it by one line:
```js
return [{ json: { session_vars: {
  variables: item.previous_conversation_state ?? {},
  referenced_result_set: item.referenced_result_set ?? [],
  referenced_state: item.referenced_state ?? null      // ← C4
} } }];
```
⚠️ **C4 must pass `referenced_state` through VERBATIM** — do **not** have the injector helpfully default
`dym_last_result_set` to `[]`. The fail-safe matrix (§UAC 27.5 rows h/i) has to be able to inject a
**four-key** object to prove C2 still behaves safely against the currently-deployed projection, and an
injector that silently normalises the shape would make that row untestable — a
`green-that-cannot-fail` built into the harness.
Now every §27 fail-safe permutation (`null`, `{}`, an array, a string, a partial object, a valid object)
is a **redis-item field**, so the whole fail-safe matrix is deterministic and ~0-token. Note honestly:
this exercises the parser and spine contracts, **not the CRM HTTP route** — that is C1's pytest suite
plus §UAC 27.11. Do not let a green clone matrix be read as a verified endpoint.

**Promote mechanics for C2/C3 (both user-gated).** LESSON 58 protocol without deviation: pre-check
`draft == active` on the target; build the target as **live + your own hunks**, never a copy of the fork
(LESSON 57 — the fork carries §0.4's extra node); `setNodeParameter` by node **NAME**, path relative to
`parameters` (`/jsCode`, `/workflowInputs/value/referenced_state` — **never** prefixed with
`/parameters/`, LESSON 32b); strip trailing whitespace before authoring (LESSON 58b); byte-SHA gate the
draft, publish only on match, re-fetch and SHA the active. Abort on any mismatch — each abort is free.
Live `update_workflow`/`publish_workflow` are classifier-denied until the **user** adds the allow rules;
the assistant cannot self-grant, and `sorento-coder` is contractually barred from live (LESSON 58a / 26).
Back up the prior `versionId` + node bodies first (LESSON 25). C2 and C3 are **separate publishes** so
any production movement is attributable (LESSON 51).

---

## 7. Ordering vs the quoted-text deletion (old delta B) — **C before B is STILL SAFE (re-verified 2026-08-02)**

> ### ⛔ 7.0 DELTA B IS STILL LIVE — it did NOT land in the bundle. Re-verified on live spine `a40cd16d`.
> `Call 'sub-query-reformulator'` (node id `7b2e4733`) `workflowInputs.value.latest_user_message` still
> carries **both** lines, verbatim, with the trailing `\n`:
> ```
> ={{ $('tf-message').first().json.message.message.text || $('tf-message').item.json.message.message.attachment.description || $json.message }}
> {{ $('tf-message').first().json.message.replyTo?.message ? "reply to: " + ($('tf-message').first().json.message.replyTo.message.text ? $('tf-message').first().json.message.replyTo.message.text : $('tf-message').first().json.message.replyTo.message.title) : "" }}
> ```
> B's target value (single line, **no trailing newline**) is unchanged from
> `chat-console-replyto-parity-plan.md` §3.2. Note explicitly, as that plan does: **dropping the trailing
> newlines is a real second change**, not incidental — every consumer does
> `.split(/\s*reply to:/i)[0]` **then `.trim()`**, so it is safe, but the byte-SHA gate must be computed
> against the exact intended string (LESSON 58b: the authoring channel right-trims).
>
> #### 7.0a Consumer census RE-RUN on the 867-line `output_exchange` (was: 3 strippers, 0 prompt refs, 2 unstripped readers)
> **Strippers: 3 → 5.** The bundle added two, both of which strip before comparing, so B's deletion is a
> **no-op** for both (stripping a suffix that is no longer appended):
>
> | line | code | origin | effect of B |
> |---|---|---|---|
> | **L212** | `norm(_hit.code) === norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0])` | ⭐ **bundle #5** `_isBareCode` | **no-op.** Today the split+`trim()` inside `norm` already yields the bare code on a quote-reply, so `_isBareCode` is already TRUE there; after B it is TRUE for the same reason. **No behaviour change** — confirmed by reading `norm` (`s => String(s ?? '').trim().toLowerCase()`), which removes the residual `\n`. |
> | L235 | `tryDymPick`'s `_msg` | pre-existing | no-op |
> | **L294** | `String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0].toLowerCase()` | ⭐ **bundle #6** `_swMsg` | **no-op.** `_swToks` comes from `match(/[a-z0-9]+/g)`, which ignores the residual newline either way. |
> | L443 | ALL/SEMUA `_msgAll` | pre-existing | no-op |
> | L767 | member-pick `_rawReply` | pre-existing | no-op |
>
> **Prompt references: still 0.** `AI Agent.options.systemMessage` contains neither `reply to` nor
> `latest_user_message` (grep count 0 on the 31,377-byte live prompt). The **only** interpolation is
> `AI Agent.parameters.text`, unchanged: `Previous response: …` newline
> `Current user message: {{ …latest_user_message }}` — i.e. the quoted bot text still enters the prompt raw
> as the user's words. That is B's bug, intact.
>
> **Unstripped readers: still exactly 2, unchanged, and both still change in the FIX direction:**
> `MENU_LABELS[userMsg]` (L123 → L131) and `_extract(parent_input.latest_user_message, …)` (**L778**).
>
> **⇒ B is still safe standalone**, its blast radius is unchanged, and its two UAC-worthy behaviour changes
> (B-R2 `_extract`, B-R3 `MENU_LABELS`) are exactly the two the predecessor plan named. **No new consumer
> arrived that needs the text.**

During C's window, `latest_user_message` still carries line 2 (`reply to: <bot's own text>`), so **two
channels are live at once**: the structured rebase, and the quoted text inside the LLM prompt. The
question is whether they can conflict.

**They can — and the conflict is fully one-directional.** The text channel can only ever *suppress* the
rebase, never invert it, and it does so through exactly one mechanism:

> The quoted bot text is interpolated RAW as `Current user message:` (`AI Agent.text`). Bot bubbles are
> full of purpose-words ("certificate", "promotion", "outstanding orders"), so the LLM can emit a
> `_DECISIVE_INTENTS` member **plus** a `domain_hint` that it derived from the *bot's* words. That makes
> `_explicit === true` (**L262**) → **both** carry gates are skipped → the rebased baseline is never
> consulted → the text-derived domain wins.

**Two suppression channels now, not one — and the second one is BENIGN.** Bundle #6 added
`&& !_switchDomain` to both gates (L384/L629), so a carry can also be suppressed by a bare domain word in
the customer's own message. That is a **current-turn** signal legitimately beating a quoted baseline
(§1.7), i.e. correct precedence rather than contamination. It is worth naming only so a tester who sees
`domain_switched_by_keyword` on a quote-reply does not score it as the text channel winning: the two are
distinguishable by diagnostic — `domain_signal_source: 'intent_explicit'` = the LLM (possibly poisoned by
the quoted text), `domain_switched_by_keyword: <domain>` = the deterministic keyword map. **§UAC 27.9 must
record WHICH of the two suppressed the carry**, not merely that it was suppressed.

Consequences, stated plainly:

- **C is not made unsafe by B's absence.** The failure mode is "the rebase has no effect", which is
  today's behaviour. There is no state in which the text channel plus the rebase produces something worse
  than either alone: `_explicit` short-circuits the carry, and the only other pathway (the LLM inventing
  a current-message entity from the bot's text, then axis-colliding with the rebased `prior`) resolves
  *toward* the quoted turn, and is a pre-existing B bug in any case.
- **C still delivers its primary value before B — and the bundle STRENGTHENED this argument.** The
  flagship targets are **bare-code picks and positional picks**, which reliably get `intent_hint: null`
  (the rev4 comment in live `output_exchange` L248 says so explicitly: *"bare codes reliably get
  intent_hint null"*), so `_explicit` is false and the rebase applies. **New in the bundle:** #5 does not
  even depend on `_explicit` — its gate is `_isBareCode || _viaNumbered`, and both operands are computed
  from the **user's own message** and the pick path, never from the LLM's classification. So on exactly
  the flagship turns, the rebased `_offer.domain` reaches `domain_hint` **regardless of what the quoted
  text did to the prompt**. The quoted did-you-mean pick (§UAC 27.2) therefore works before B, and now by
  a mechanism that the text channel cannot suppress at all.
- **What is masked until B lands:** cases where the customer's own words are non-decisive but the quoted
  bubble's words are decisive *and point at a different domain than the quoted turn's own state*. That is
  precisely the live cert-→-`Complaint` bug B exists to fix. C cannot fix it, and must not be scored as
  if it should.

**Verdict: ship C first, as the user decided — UNCHANGED by the bundle.** No sign-off reversal is
requested. The masking analysis re-verified: the cert→`Complaint` case is **still MASKED-never-FAIL until B
lands**, because the mechanism that masks it (`_explicit` from bot-derived purpose-words) is untouched by
the bundle. Two obligations follow, and they are not optional:

1. **§UAC 27.9** is a *documented expected-masked* case: quote a bubble whose text is decisive for domain
   Y while the quoted turn's state is domain X, and record which channel won. Pre-B, the text may win —
   that is the recorded expectation, not a failure. **Re-run it after B** and require the flip to the
   pointer. Without this case, B's later arrival looks like it changed C's behaviour for no reason.
   ⚠️ **Amended 2026-08-02:** the case must now distinguish **three** outcomes, not two —
   text-channel win (`domain_signal_source: 'intent_explicit'`), keyword-switch win
   (`domain_switched_by_keyword`), or pointer win (`domain_reused_entityless` /
   `domain_inherited_compatible` with the quoted domain). Recording only "the carry didn't fire" is not
   evidence.
2. **B's own acceptance gets stronger, for free.** After C, deleting the text can no longer "lose the
   quoted signal" for any turn whose quoted bubble resolves — the structured channel now carries
   domain/intent/entities/offer, not just the result set. Record that as a B precondition met, and shrink
   B's risk **B-R1** accordingly (it now degrades only for bubbles with *no resolvable row at all*:
   media bubbles and pre-logger buttoned bubbles).

---

## 8. What shrinks — `ttl` and the dym single-use machinery

**Carried forward from the predecessor plan's §4.3, NOT relitigated:** `ttl` **cannot be retired.** The
majority of picks are bare typed codes with no quote, and those still need the session-carried offer.
Mandating quote-reply for picks is a **product decision**, not an engineering one.

### 8.1 What genuinely shrinks (precise)

For a **quoted** pick, the offer arrives from the pointer rather than the session, so three of
`compile-current-state`'s seven lifecycle rules (live L465–479) can no longer cause a **miss** on that turn:
- **rule 2** (domain switch → `null`),
- **rule 5** (`_answered` → `null`),
- **rule 6** (`ttl <= 1` → `null`).

⚠️ **Amended 2026-08-02 — the shrink only reaches the CODE-reply path unless the 5th key ships.** A quoted
**numbered** pick goes through `dymNumberedMultiSelect`, which needs `dym_last_result_set`, not just
`dym_offer`. With only the four-key projection, a quoted numbered pick has nothing to index and the
lifecycle rules still decide. So §8.1's claim holds for **bare-code** quoted picks under the four-key
projection, and for **both** paths only after §0.9's 5th key lands.

i.e. *the offer's session lifetime stops being the limiting factor for quoted picks*. `ttl`'s blast
radius contracts to unquoted picks only. **Zero code is deleted**: no writer change, no rule removal,
`compile-current-state` untouched. The shrink is a reduction in *how often ttl decides an outcome*, and
it is observable exactly as §UAC 27.2 (a pick that succeeds after the offer has already expired in
session).

### 8.2 What does NOT shrink — correcting the predecessor plan
`dym_slot` tier-0 resolution stays **fully required, including for quoted picks.** The pointer supplies
the **offer**; it does not supply **which prior entity the suggestion was FOR**. `tryDymPick` still needs
`_idx` = the position in `_prior` (`_prev.entities`, now the *rebased* list) to replace in place, and
after pick #1 has overwritten `raw`, `dym_slot` is the only surviving handle
(`for_raw`/`for_canonical`/`for_hint` are all destroyed). What C *does* improve is that `_prior` and
`_offer` now come from the **same** turn, so the slot linkage is coherent instead of accidentally
cross-turn. Predecessor §4.3's "the `dym_slot` tier-0 handle become[s] unnecessary" is withdrawn.

Cross-refs unchanged: `plans/dym-single-use-fix.md` (offer lifecycle + `dym_slot`),
`plans/dym-candidate-map-plan.md` (`for_raw`/`for_canonical` labelling).

---

## 9. Fail-safe: every miss path and its fallback

**Governing rule:** an unresolvable quote degrades to the **immediately-previous state** — today's
behaviour — **never** to null/stateless. Every row below ends in "no rebase; baseline = current
session".

| # | miss path | where it is caught | result |
|---|---|---|---|
| **M1** | No quote at all (`replyTo` absent — ~all turns) | `get-session-vars` URL omits `?message_id=` → CRM omits the key | `referenced_state` `undefined` → `_refStateOk` false |
| **M2** | New n8n, **old CRM** | key absent | `undefined` → no rebase |
| **M3** | New CRM, **old spine** | spine never passes it | `undefined` → no rebase |
| **M4** | New spine, **old parser** | trigger doesn't declare it → n8n drops it | inert |
| **M5** | Quoted row has `turn_id IS NULL` (proactive send; console/`sub-sendmsg-CHAT` rows; pre-2026-07-21 rows) | SQL `JOIN … a.turn_id IS NOT NULL` → 0 rows | `null` → no rebase |
| **M6** | `state_trace IS NULL` (all rows before the 2026-07-22 C5 promote; audio branch; rate-limited branch) | SQL `ch.state_trace IS NOT NULL` | `null` → no rebase |
| **M7** | ⛔ **`state_trace->'after' = json null`** — the turn wrote no state (no-access refusal, LLM fallback). Documented as meaningful in the model + migration. | `if not isinstance(raw, dict): return None` | `null` → no rebase. **Must NOT become `{}`** — an empty baseline would WIPE continuity, strictly worse than today. §UAC 27.6 + CRM test 5. |
| **M8** | Media bubble quoted (`send-message-images/video/files` are inline `httpRequest` in the spine — **no logger, no row at all**) | anchor 0 rows | `null` → no rebase |
| **M9** | `message_id` non-unique | `ORDER BY sent_at DESC, id DESC LIMIT 1` in BOTH selects, mirroring `get_referenced_result_set` | deterministic newest turn |
| **M10** | CRM returns HTTP 200 with the key **present but malformed** (array / string / partial object / `{}`) | `_refStateOk` requires object, non-array, `'domain_hint' in` **and** `'entities' in` | no rebase |
| **M11** | Unknown contact | `get_for_contact` 404s **before** either lookup; spine `get-session-vars` has `retryOnFail:true`, no `onError` | unchanged from today |
| **M12** | CRM 5xx / timeout on the widened route | `retryOnFail:true`, then the node errors as it does today | unchanged; **C1 adds no new error class** — the new query is inside the same handler, and a raise there already fails the whole GET today |
| **M13** | Quote resolves to the customer's **own** earlier message | anchor is type-agnostic; that row's `turn_id` resolves to itself | that turn's own state — semantically correct, no extra code. ⚠️ **but `referenced_result_set` will be `null`** on that quote (incoming rows carry no `result`) — measured, §0.8/§4.3 |
| **M-ACC** | Quoted turn had access the contact no longer has | `access_levels` is **not** whitelisted; and **L704** reads it via a separate binding | access can never be re-granted by a quote |
| **M14** ⭐ NEW | CRM is on the **4-key** projection (today) while C2 is live | `Array.isArray(_refState.dym_last_result_set)` is false → `[]` | ⛔ **NOT a safe degrade** — this is clear-on-rebase, which §0.9(3)(4) rejects: a quoted numbered pick mis-resolves against the quoted STOCK set, and quoting the just-received bubble regresses. **Prevented by the §6 ordering constraint, not by a runtime guard.** §UAC 27.5 row (h) exists to make the behaviour visible and recorded, never to bless it. |
| **M15** ⭐ NEW | Quoted turn armed **no** dym set (the normal case) | CRM projects `dym_last_result_set: []`; `_dymActive` (L453) false, `dymNumberedMultiSelect` returns at L499 | correct: no dym affordance on that quote; a positional reply falls to byIdx over the quoted `referenced_result_set` — i.e. **within the quoted turn**, coherently |
| **M16** ⭐ NEW | Quoted turn armed a dym set, but no dym marker is active in the CURRENT session | parser emits `reference_target != 'dym'` (marker lives in the un-rebased `response`) → dym path never entered | **KNOWN GAP F7** — the rebased dym set goes unused and byIdx resolves the quoted stock set. Degrades to §0.10's pre-existing behaviour; **C2 neither worsens nor fixes it.** Recorded by §UAC 27.13, expected-masked. |

Two properties worth naming because they make the whole design cheap — **with one honest amendment**:
- **The rebase is a pure function of one input field**, so M1–M13 all collapse to
  `_refStateOk === false`. There is exactly one guard to test, and §UAC 27.6's inversion proves it can go
  both ways.
  ⚠️ **M14 breaks that single-guard property**: a *well-formed but four-key* object passes `_refStateOk`
  and then rebases **partially**. The guard cannot detect it (adding `'dym_last_result_set' in _refState`
  to `_refStateOk` would fail-safe but would also disable the pointer entirely against today's deployed
  projection — a worse trade). **It is prevented by deploy ordering (§6), which means the ordering
  constraint is a safety control, not a convenience.** Say so in the promote checklist.
- **No new error class on either side.** C1 adds a `SELECT` inside an existing handler; C2/C3 add a
  guarded read of one optional field.

---

## 10. Flags (report, do not fix here)

- **F1 — `get-session-vars` guards `replyTo` bare** (`…json.message.replyTo.id`) while three other nodes
  use `replyTo?.id ?? null`. Measured benign (live exec `10590713`: a non-reply body has no `replyTo` key
  at all, the node still returned 200). Latent inconsistency; **do not** ride it on C3's publish
  (LESSON 51). Its own semantic-no-op publish if wanted. Carried unchanged from the predecessor plan §5.1.
- **F2 — fork `wI5RkNGW3EOJfBdo` has an orphaned `Postgres Chat Memory`** (§0.4). Never promote it.
  Prefer deletion during §5.1.
- **F3 — `sub-sendmsg-CHAT` (`ublq9nSlrpz63xan`) threads no `turn_id`** and its console rows write
  `message_id NULL`. Console-lane bubbles are therefore permanently in M5 unless delta A's persistence
  work also stamps `turn_id`. **Add `turn_id` to delta A's scope** if §27 is to run through the console
  lane rather than through `sim-inject-session`.
- **F4 — no index on `chat_histories.turn_id`** (R-C1). Its own migration if `EXPLAIN` says so.
- **F5 — `dym_candidates` is still written as a legacy mirror** (`compile-current-state` ~L276) whose
  comment says "delete it once both are live". Both are live. Deleting it would remove the §3.5 trap
  class entirely — but it is a separate change with its own promote, not a rider here.
- **F6 — memory notes to correct after this plan is accepted:** `obs-latency-contract` (escalation
  `turn_id` now threaded — §0.1); LESSON 57(a) / `stale-byte-identical-fork-claim` (`_parser_raw` is live
  — §0.2); LESSON 31 (redis-item session injection now works on the clone via `sim-inject-gate` — §0.5);
  CLAUDE.md's get-results ID (§0.6). **Added 2026-08-02:** CLAUDE.md still contains the stale line "the
  clone's reformulator caller calls the **live** published sub `XTODTw`" alongside the corrected table row
  — the table is right (fork `wI5RkNGW3EOJfBdo`, re-confirmed §0.12), the prose bullet is wrong; and
  `didyoumean-bundle-promoted-live`'s pointer to "[[quoted-turn-state-pointer]] §DC" now resolves to §0.11.
- **F7 ⭐ NEW — the dym route selector depends on a marker in the un-rebased `response`.** A quoted
  numbered dym pick only fires while a `[N did-you-mean suggestions active]` marker is *independently*
  active in the current session, because `reference_target` is derived partly from that marker and
  `response` is deliberately excluded from the whitelist (§3.4, escalation safety). The fix is a
  **structural** forced route mirroring `_dymActive` (L453) — "no marker regex, structural only" — e.g.
  force `reference_target='dym'` when a **rebased** non-empty `dym_last_result_set` exists and the reply is
  bare positional. **Do not build it here:** it is a new decision site, it needs its own no-regression
  proof against §DC5's cases, and it must not ride C2's publish (LESSON 51). §UAC 27.13 records the gap.
- **F8 ⭐ NEW — the sendmsg part-splitter scrapes the did-you-mean numbers into the STOCK result filter.**
  `aoydkG1dbItXR5jXFEQsP` › `Code in JavaScript` computes
  `idxIn(part) = [...part.matchAll(/(?:^|\n)\s*\*?(\d{1,3})[.)]/g)]` and filters `result_set`
  (= `variables.last_result_set`) by it. The dym block renders `  ${idx}. ${label}` — two-space indent,
  matched by `\s*` — so suggestion numbers select stock rows. When the answer half is not itself
  line-start-numbered, the logged `result` becomes an arbitrary slice of stock rows chosen by numbers that
  index the suggestions (§0.10 D-R4b). Fix candidates: render the dym block with a bullet the regex does
  not match, or namespace the two idx spaces, or tag rows with their set. **Spine + sendmsg-sub change with
  its own blast radius — flag only.**
- **F9 ⭐ NEW (carried from the bundle's own open item, restated because it now interacts with this plan)** —
  bundle #6's `_DOMAIN_SWITCH_WORDS` map (live `output_exchange` L271–291) is a **second home for domain
  vocabulary** besides the 28k parser prompt. Drift between them is invisible: the prompt could learn a new
  domain word the map does not have (or vice versa) and nothing fails. Already flagged for migration onto
  `plans/parser-config-registry-plan.md` (one CRM registry read by parser + resolver + this map).
  **Report only — do not fix here.** Relevance to C2: the map is a *current-turn* signal that suppresses
  the rebased carry (`!_switchDomain`), so a drifted map changes which turns the pointer decides — but the
  pointer itself is unaffected.

---

## 11. Verification tasks (planner-defined; order matters)

- **V-C0 (BLOCKER, run FIRST) — ⚠️ REVISED to a RE-VERIFY.** §5.1 fork parity: re-fetch both
  `output_exchange` bodies + both `systemMessage`s, require **`diff` = 0 lines** on each (byte-identical,
  not merely `diff -w`), record both sha1 pairs and `versionId == activeVersionId` on both. Also §5.4:
  clone `compile-current-state` `diff -w` = 0 and clone `build-suggest-offer` = the 3 recorded cosmetic
  hunks **and nothing else**. Until all of that is recorded green, §UAC 27 is **VOID**.
- **V-C1 (S-CRED, static REST, blocks every case).** §5.2. Any prod credential → **HALT**.
- **V-C2 (the invariant gate) — ⚠️ REWRITTEN 2026-08-02; the old count-based form FALSE-FAILS (§0.12).**
  Run **G1–G4** exactly as specified in §3.3, before and after C2:
  G1 assignment-line **content** set (sorted, whitespace-normalised, sha'd — **print the population
  count**, expected 18 today); G2 zero `output.output.*` inside the rebase block; G3 exactly one
  `parent_input` reassignment; G4 exactly two `if (!_explicit && !_switchDomain) {` gates.
  ⛔ **The induced-failure step is part of the task, not optional:** insert
  `output.output.domain_hint = _refState.domain_hint;` into a scratch copy of the post-C2 file and record
  that G1's sha moves and G2 fires. Also walk the §3.3 **seven**-point checklist item by item.
  Any deviation = **REQUEST-CHANGES**, no discussion.
- **V-C3 (placement proof).** Assert the rebase block sits after the L52 `parent_input` binding and
  **before the first `previous_conversation_state` read at L100** (L76 is *not* a constraint — §3.2).
  Cheap and decisive empirical form: run a case where the quoted turn's `dym_offer` differs from the
  session's and assert `dym_pick_applied` resolved against the **quoted** candidates.
- **V-C4 (mutation-free proof).** Assert the block **reassigns** `parent_input` and does not mutate
  `$('When Executed by Another Workflow').first().json`. Empirically: on a rebased turn,
  `output.output.access_levels` must still equal the **current** session's (**L704** reads the untouched
  item), while `domain_hint` follows the quoted turn.
- **V-C5 (fail-safe matrix, ~0-token).** Via C4 injection, drive `referenced_state` through
  `undefined` / `null` / `{}` / `[]` / `"str"` / `{domain_hint:…}` (no `entities`) / a valid **5-key**
  object / a valid **4-key** object (M14). Only the two valid objects may set `state_rebased_from_quote`.
  **Then invert:** confirm the valid object *does* change the baseline — a guard that is always false is
  not a guard (LESSON 61).
- **V-C5b ⭐ NEW (the pairing proof — the case §0.9 exists for).** Inject a **current** session carrying
  `dym_last_result_set` = list A **and** a `referenced_state` whose `dym_offer` belongs to list B with
  `dym_last_result_set` = B. Send a bare `2`. Assert the resolved code is **B[2]**, and assert it is
  **not** A[2]. Then re-run with the 5th key **stripped** (4-key object) and record that the answer flips
  to A[2] with `dym_pick_domain_forced` = B's domain — the mis-pairing, demonstrated. That recorded red is
  what makes the 5th key's necessity evidence rather than argument.
- **V-C6 (CRM unit gate).** §4.4's **twelve** tests green in the CRM repo (was ten). Test 5
  (`after: null` → `None`), test 8 (projection withholds internal keys — now **five** keys), test 11
  (`dym_last_result_set` rows keep `for_raw`/`for_hint`/`for_canonical`) and test 12 (absent → `[]`, not
  `None`) are **mandatory**, not nice-to-have.
- **V-C7 (`EXPLAIN ANALYZE`).** Run the §4.2 SQL against prod-like data for a high-volume contact.
  Record the plan. If it seq-scans a large per-contact slice, R-C1's index becomes a precondition.
- **V-C8 (mirror fidelity, if §27 runs via the console lane).** Diff the clone's `message_id`-aware
  SELECT against §4.2 clause-by-clause — same anchor tie-break, same `type='incoming'`, same
  `state_trace IS NOT NULL`, same dict-or-None coercion, same "key absent unless `message_id` supplied".
  Record the comparison in the run log; a mirror that silently diverges is a harness that lies.
- **V-C9 (replay-diff registration).** `referenced_state` becomes a new key on the parser trigger's
  output. Register in the replay orchestrator's `norm()` (`aROEBlQyyoQaB7a1` › `Diff`) as
  **ignored-when-absent-or-null, retained-when-non-null** (LESSON 40). `state_rebased_from_quote` needs
  no rule — it is emitted only when true. ⚠️ **Pre-check first:** the replay harness is recorded as
  stale/broken (memory `replay-harness-stale-broken` — it pushes to `main-message-list-test` while the
  clone pops `test:q:{contact}`), so confirm it runs at all before treating a 100 %-regression report as
  evidence. If it is still broken, register the rule anyway and record replay as **unavailable**, never as
  passed.
- **V-C10 (live promote gates).** LESSON-58 protocol per §6, twice: C2 (parser) then C3 (spine leaf),
  separate publishes, byte-SHA'd both sides of each. ⛔ **Plus the new predecessor check: assert the live
  CRM route returns `dym_last_result_set` (5 keys) BEFORE publishing C2** — M14 is prevented by ordering,
  not by a runtime guard (§9). A quoted-bubble probe returning only four keys **HALTS** the promote.
- **V-C11 (post-promote, on the changed path).** A real live **quote-reply of an OUTGOING bot bubble**
  (LESSON 56; and §4.3's harness note — quoting an incoming row yields no `referenced_result_set`) —
  assert `state_rebased_from_quote: true` in `state_trace.parser_applied` for that turn (§0.2 confirmed
  live emits `_parser_raw`, so both raw and applied are inspectable). If unexercisable, record
  **unverified** — never inferred.
- **V-C12 (§27.9 re-run after B).** The expected-masked case must flip from text-wins to pointer-wins.
  Until then it is recorded as masked, not failed. **Amended:** it must distinguish the three suppression
  outcomes named in §7 (text / keyword-switch / pointer).
- **V-C13 ⭐ NEW (retire the owed canaries).** Confirm UAC §DC-1/§DC-2 are marked SUPERSEDED and that the
  #5 gate is instead covered by the existing §DC5 family, **including its positive control** (bare
  `SRT59-CR` → `dym_pick_domain_forced: inventory`). A gate family with only declining probes is a
  `green-that-cannot-fail`; the control is what makes it an instrument (§0.11).
- **V-C14 ⭐ NEW (F7 gap is RECORDED, not silently absorbed).** §UAC 27.13 must exist and must produce a
  written record of what a quoted numbered dym pick does when no dym marker is active in the current
  session (expected: byIdx over the quoted stock set, i.e. §0.10's pre-existing behaviour). Scored
  **MASKED**, never PASS and never FAIL. A §27 sign-off that does not mention F7 is incomplete.

---

## 12. Open decisions for the user

0. ⭐ **NEW / HIGHEST — confirm the 5th key (§0.9).** The plan's recommendation is
   `dym_last_result_set` as a **fifth CRM key, rebased with `dym_offer`**, and it explicitly **rejects**
   clear-on-rebase because clearing (a) still produces a confidently wrong answer via byIdx over the
   quoted stock set and (b) **regresses the commonest quoted dym pick — quoting the bubble you just
   received**. This is a contract change, so it needs your call. If you prefer to hold the contract at
   four keys, the honest consequence is: **do not ship C2's dym-axis at all** — i.e. drop `dym_offer` from
   the whitelist too (rebase-both-or-*neither*), shipping C2 as a domain/intent/entities-only pointer.
   That is coherent and safe; a four-key C2 that rebases `dym_offer` alone is not.
1. **C1 deploy** — ✅ the four-key projection is already live and proven (§0.8). What remains is the
   5th-key follow-up (decision 0) plus confirming that R-C2 (exposing a projection of `state_trace`,
   previously "deliberately absent from the external read contract") got CRM reviewer sign-off, since the
   deploy appears to have happened ahead of that sign-off being recorded here.
2. **F2** — delete fork `wI5RkNGW3EOJfBdo`'s orphaned `Postgres Chat Memory`, or leave it and just record
   its credential? (Recommend delete: it is the only unexplained node on the parser path.)
3. **F3** — extend delta A to stamp `turn_id` on console rows, so §27 can run end-to-end through
   `zz-chat`? Or run §27 purely via `sim-inject-session` (cheaper, but does not exercise the CRM route)?
   (Recommend: `sim-inject-session` for the matrix, plus **one** console-lane case once A stamps `turn_id`.)
4. **F5** — schedule the `dym_candidates` legacy-mirror deletion as its own change? It would retire the
   §3.5 trap class permanently.
5. **R-C1/F4** — pre-emptively add the `(contact_id, turn_id)` partial index, or wait for V-C7?
6. **Whitelist size** — confirm **five** keys (was four; see decision 0). `selection_context` remains
   *excluded on wrong-assign safety grounds* (§3.4), not on effort grounds; adding it later requires
   rebasing `last_result_set` too, which requires sourcing it from `referenced_result_set` rather than
   `state_trace` (a further change, worth its own plan if quoted member-picks are ever wanted).
7. ⭐ **NEW — F7 (the dym route selector).** Accept the recorded gap for now (recommended: yes — §UAC 27.13
   makes it visible), or schedule the structural forced-route as its own change before C2 ships? Shipping
   it *with* C2 is the one option to avoid: it would ride C2's publish and make any production movement
   unattributable (LESSON 51).
8. ⭐ **NEW — F8 (the sendmsg number-scraper).** Schedule as its own change? It is the root cause of
   §0.10's D-R4b and it will keep producing mis-paired `result` rows on partial-miss turns whether or not
   C2 ships.
