# Node-diff — `spec-raw-text-migration`

Build target: **TEST clone `txiPzSxy3Pclsz6v`** · `c97f2f8f` → `daa88349` → `6656a1de` →
`d3767545` → **`98e93d6e`** (published, DRAFT == ACTIVE, export re-run and `--verify` clean).

> **Rev 4 (2026-08-16, THIRD NODE authorised):** `build-suggest-offer.jsCode` — the SECOND
> emitter of the F1 defect, and the one that actually rendered the reviewer's cited reply.
> `compile-current-state` and `resolve-entity-http` are **UNCHANGED** by rev 4 (both shas
> re-asserted from the re-fetched deployed JSON; draft-vs-active showed exactly one differing
> node before the publish). **The promote body is now THREE hunks by node name** — see §6b.
> Also folds in the CRM lane's four settled wire facts (plan §5) and the F6/F7 documentation.

> **Rev 3 (2026-08-16, reviewer REQUEST-CHANGES F1/F2/F6/F7):** one node, one leaf —
> `compile-current-state.jsCode` only. **`resolve-entity-http.jsonBody` is UNCHANGED** at
> `af7d38527e6b…` (re-asserted from the re-fetched deployed JSON; draft-vs-active showed exactly
> one differing node before the publish). Two behaviour hunks — **F1** (the CRM's own
> query-keyed resolution never renders as a customer token) and **F2** (the Matched-on line is
> suppressed on any mixed answer) — plus the **F6** SA.md amendment and the **F7** residual note.
> §0b records the one reviewer finding this rev does **not** close and why.

> **Rev 2 (2026-08-15, main-session decision on §1.3):** one node, one leaf —
> `resolve-entity-http.jsonBody` only, and inside it **one token**: the empty-raw fallback to the
> parser's `user_goal` is DELETED. `compile-current-state` was **not** re-touched (its sha is
> re-asserted unchanged from the re-fetched deployed JSON, and draft-vs-active showed exactly one
> differing node before the publish). Detail in §1 decision 3; mutant **m10 is INVERTED** — it
> now re-introduces the fallback and must go red. The §2a wording and the §2b `_title`
> implementation were accepted as built.
Live spine `9qVyfUxmRQqrpGRMDLRuz` **not touched**. Nothing promoted.

> **How that is proven, not asserted.** `--verify` reported live at **`469e7259`** at session
> start and at **`469e7259`** after the last write; every `update_workflow` / `publish_workflow`
> call in this slice named `txiPzSxy3Pclsz6v`; and live's two target leaves still hash to exactly
> what the **reviewer independently recorded** — `resolve-entity.jsonBody` `51de7f16…` (886 B),
> `compile-current-state.jsCode` `3fa9d170…` (36,983 B). ⚠️ The `export/live-spine-*` files show
> as modified in `git status`: that is the **committed cache being stale** (git HEAD holds
> `2524fbbd`, a live version superseded before this session by someone else's promote), not a
> live change. Exactly the staleness the export gate exists to surface — do not read it as drift.

Plan: `plans/spec-raw-text-migration-slice-plan.md` · contract authority:
`tests/reviews/pr142-contract-conformance.md` (+ its 2026-08-15 addendum) ·
UAC: `tests/uac/SR.md` §SR-1c and `tests/uac/SA.md` §"Post-#142 re-probe" ·
offline suite: `tests/offline/spec-answer-honesty/` (EXTENDED, not forked) and
`tests/offline/spec-shapeA/`.

---

## 0. 🔴 READ FIRST — the post-deploy CRM probe is **UNRUN**, and it is a gate

Step A of this build was "POST-DEPLOY PROBE FIRST". It did not run, and the reason is an
access block, not an oversight:

> The read-only CRM proxy `zz-crm-probe-spec-shapeA` (**`UYkE8VLZ8DzJa3TT`**) has
> **`availableInMCP: false`**. `get_workflow_details` and `publish_workflow` both return
> *"Workflow is not available in MCP. Enable MCP access from the workflow card in the workflows
> list, or from the workflow settings."* Publishing it is what activates its webhook, so the
> proxy cannot be reached at all. The coder seat does not route around an access block, and the
> CRM credential (`crm-n8n-auth`) lives in n8n rather than this repo, so there is no second path
> by design.

**USER ACTION (one toggle):** n8n → Workflows → `zz-crm-probe-spec-shapeA` → the card's ⋮ menu
(or the workflow's Settings panel) → enable **Available in MCP**. Then publish it, run
`PROBE_WEBHOOK=… node tests/offline/spec-answer-honesty/s1-probe.js`, unpublish it, and confirm
the webhook 404s.

The probes are **written and committed** (`s1-probe.js`, 9 cases incl. the counterweight, DEV-1,
DEV-2, SR-8) and refuse to run without the webhook (`exit 3`, with the block explained in the
error). This mirrors `spec-shapeA/crm-probe.js`'s own precedent: **UNRUN is recorded as UNRUN,
never inferred from the offline suite**, which proves the REQUEST is well-formed and never that
the SERVICE answers it as designed (LESSONS §70 — merged is not deployed).

**What that costs, stated plainly.** Everything the CRM half of this slice rests on — that
`spec_asked`, `display.specifications`, `preferred_specs` and `unrecognized_terms` are on the
wire; that `_suppress_brand_prefix_junk` shipped; that a code token survives the F2 strip — is
read from the **branch-verified conformance report**, not from a live envelope. The build is
designed so that the undeployed case is **visible rather than silent** (§3, the deployment
tell), and the tester's SR-13/SR-14/SR-15 close the gap. Do not sign the slice off on offline
evidence alone.

---

## 0b. 🔴 REV 3 — what F1 fixes, and the half it CANNOT fix from these two nodes

**Read this before scoring F1 as closed.** The reviewer's F1 evidence is exec `12597815`'s
customer-boundary output:

```
"wall hung basin" — did you mean:
  1. BRBC2296-1 (WALL HUNG) - no SIRIM cert
"wall hung basin got SIRIM cert?" — did you mean:
  4. BRBC22137W-1 (WALL HUNG) - no SIRIM cert
```

I fetched that execution's runData rather than reasoning from the review, and **that string was
rendered by `build-suggest-offer`, not by `compile-current-state`.** From `get_execution`
(`12597815`, nodeNames `build-suggest-offer` / `compile-current-state`):

- `build-suggest-offer.suggest_response` **already contains** the full block, and its
  `dym_candidates` carry `for_raw: "wall hung basin got SIRIM cert?"` on three of six entries;
- `compile-current-state` merely passes it through — the suggest override sets
  `manualResponse = true`, so `user_response === _sug.suggest_response` verbatim.

Enumerating the renderers **by rendered string** rather than by graph inbound (LESSONS §63) finds
exactly two emitters of `"${token}" — did you mean:`:
`compile-current-state.js:823` (the answered partial-miss path) and
`build-suggest-offer.js:309` (the not-found lane, the one that produced the cited reply).

> ✅ **CLOSED AT REV 4 (2026-08-16).** The main session authorised the third node; both emitters
> now carry the guard, U9-14 was INVERTED from asserting the gap to asserting the fix in the
> DEPLOYED bytes, and mutants m32/m32b/m33 cover the second emitter independently. The analysis
> below is kept because it is the reasoning that stopped a half-fix shipping as a whole one — and
> because §2f records what the fix actually changed at the customer boundary.

**Rev 3 fixed the half that lived in the authorised two nodes and did not close F1.**
Fixing only `compile-current-state` and reporting F1 closed would be the wrong-object failure
(§63) in its purest form: the SA-4 reply would be **unchanged**. The other half is a one-line
insertion into `build-suggest-offer`'s D1 loop — the predicate is portable as written, because
that node already binds the parser output as `q` and has `q.entities` (`build-suggest-offer.js:21,
206`) — but it is a **third node**, outside this slice's authorised set, and the plan's §1.3 says
*"anything else discovered mid-build = stop, report, replan."*

**The gap is a tripwire, not a paragraph.** Probe **U9-14** asserts, as a positive fact, that
`build-suggest-offer` still groups by raw token and still lacks `_isDerivedQueryToken`. It goes
**RED the moment somebody fixes that node**, forcing this section to be re-read rather than
letting a half-fix quietly read as a whole one.

**Decision taken (main session, rev 4): the third node was authorised**, on the reasoning that
F1 is a defect THIS slice introduced (raw `query` is what puts the sentence in `resolutions[]`),
so asking the user to accept the SA-4 wording would be asking him to accept our own regression.
Built in §2f.

---

## Summary

**Two nodes, two leaves.** `resolve-entity-http.parameters.jsonBody` and
`compile-current-state.parameters.jsCode`. No node added, removed, renamed, rewired or
re-credentialed.

Asserted by a **full param-hash sweep over every node** against the pre-slice ACTIVE version
(`c97f2f8f`, taken from the API's own `activeVersion` block, not from a local file) — LESSONS
§71: a promote diff built from `nodes/*.js` is blind to exactly the httpRequest node changed
here, and that blindness shipped a live outage:

| check | result |
|---|---|
| nodes whose `parameters` differ | **exactly 2** — `compile-current-state`, `resolve-entity-http` |
| node count / name set / id set | 148 / identical / identical |
| `connections` | **byte-identical** |
| `position` / `typeVersion` / `disabled` / `type` deltas | none |
| credential `(node, type, id)` triples | identical, **27/27** — and see the methodology note below |
| zero-inbound (egress containment) | unchanged: `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`, `save-session-vars`, plus `presign-fail-notice`, `Code in JavaScript`, `sorento-sub-respond-sendmsg-respond3` |
| 9 sendmsg callers | all still `is_test: true`, all still → `aQUmwMVplmNcyUVc` |
| HI fork / save-message fork | `vUfFUDjLAuMaeQE6` (`is_test:true`) / `tWm5DYLxfypmVC1T` — unchanged |

> ⚠️ **Methodology note, recorded because it produced a false alarm at rev 3.** Comparing the
> credential triples of MCP's `activeVersion` block against the REST export reports **"not
> identical"** every time — MCP returns **zero** credential entries because it REDACTS them on
> read (LESSONS §47: *"no `credentials` block" is vacuous evidence*), while the REST export
> returns all 27 unredacted. The comparison is apples-to-oranges, not a change. The sound check
> is **REST-to-REST**: git-HEAD's export (`bd0023ac`) and the current export (`d3767545`) both
> carry the **same 27 triples, byte-identical**. Independently, rev 3's only write was
> `setNodeParameter /jsCode` on `compile-current-state`, which is a **Code node with no
> credentials at all** — the op cannot reach a credential. Do not re-run the mixed comparison.

Prereq findings: the clone has **no Schedule Trigger** — its only trigger is
`When Executed by Another Workflow` (`executeWorkflowTrigger`), so the "disable the Schedule
Trigger before editing" precondition does not apply here; recorded rather than silently skipped.
All validation warnings returned by `update_workflow` are the documented pre-existing set
(LESSONS §13): the `Transcribe a recording` expression prefix, the deliberate `DISCONNECTED_NODE`
orphans, and the OpenAI `builtInTools` field. Nothing new appeared.

### Node shas — record these; re-check at the START of every test pass (LESSONS §64)

**Three leaves ship as of rev 4.**

| node (id) | leaf | before (`c97f2f8f`) | after (`daa88349`) |
|---|---|---|---|
| `resolve-entity-http` (`e663221f-0722-43c0-953d-60bec1f01e07`) | `jsonBody` | `7ca14cbfd47e273a1c1464e2fb0c85fd52e3a39cf9f0062f83bc537ce7fd4265` (1809 B) | **`af7d38527e6b544c55ed1e04d457980d37924f8758fa5c36b0983b0bb369fb81`** (1157 B) — *unchanged by rev 4* |
| `compile-current-state` (`7a130a0c-530f-4bfb-a8f2-059ec71c2ea2`) | `jsCode` | `82707a95a7c63d74b6dbc963774630e21a5bd1c9cb4748671706a4a8a63e67b5` (52694 B) | **`97d2f6a25882fc948a2a1b9ed03517137de28e68db5b0e810d5f1ef5c6200925`** (60379 B) — *unchanged by rev 4* |
| `build-suggest-offer` (`7972abd8-5d6b-40ff-9d38-152782cd8091`) ⭐ **rev 4** | `jsCode` | `2f25e23ba47467922c65f2fd438bf1ddac4eee50cf17ee28e3664dea7fb63f21` (33511 B) | **`8a18369006be77e25530b76a3c6b0284dec68ec22a76c13615d79a42ae764217`** (34944 B) |

Superseded, recorded so a report can name **which** body it found (LESSONS §64 rule ii):
`resolve-entity-http.jsonBody` at `daa88349` was
`e938baf24ae045191a6397eaf0c33aa8c6e6474daf028def6d3d3e00c0f143d9` (1227 B) — the same slice
carrying the empty-raw fallback, superseded by the strict reading before any test pass ran
against it. `compile-current-state`'s after-sha was unchanged across revs 1 and 2 at
`9a8f141c473028d4054400049baf3f8d622525d616e7d558375fd8f10a0b2aee` (56311 B); **rev 3 moves it**
and that body is frozen as `compile-current-state.rev5.js` — the RED baseline for F1/F2 (§4).
`resolve-entity-http.jsonBody` is **unchanged by rev 3**.

Both after-shas are gated automatically: `probe.js` **D1** (Code body, four outcomes) and the new
**D1b** (the jsonBody, read out of the exported `workflow.json` — the first deployment gate this
repo has ever had on a **non-Code** parameter). Both currently report `DEPLOYED`.
The pre-slice bytes are frozen as `compile-current-state.rev4.js` /
`resolve-entity-http.rev4.jsonBody.txt` — they are this slice's RED baseline (§4), and
`82707a95…` is now a **named** SUPERSEDED entry in D1's map so "not ours" never reads as
"someone else edited the node".

---

## 1. `resolve-entity-http.jsonBody` — the migration proper (plan §1.1)

**Two anchored edits that are ONE change.** Builder: `build-body.js` (each anchor asserted to
occur exactly once; each splice asserted to have changed the file; the emitted body re-checked
for `free_terms` absence and for the fallback's presence before it is written).

```diff
- "query": "{{ $('Call 'sub-query-reformulator'').first().json.output.user_goal }}",
+ "query": {{ JSON.stringify(<RAW_MESSAGE_SRC> || '') }},
...
- "free_terms": {{ JSON.stringify(<N-0 composed builder>) }},
```

Everything else byte-identical: `match_mode`, `tokens`, `allowed_entity_types`, `access_levels`,
`domain`, `fallback_to_all_types`, `limit`, `spec_fallback: true`, `understand_phrase: false`.
Re-rendered and diffed field-by-field on 9 fixtures (probe U2) — the change is an **expression**,
which no `nodes/*.js` review can see. **Key-set delta is exactly `−free_terms`**, asserted.

### Five decisions worth reviewing

1. **ATOMIC, and the builder enforces it.** DEV-3, verified in CRM source:
   `product_spec_understanding.py:413-415` merges derived free terms as a **UNION on top of** the
   caller's, and `understand_phrase` always appends the whole phrase. A transitional body sending
   raw `query` AND the old `free_terms` would rank against `caller_terms + [raw sentence]` — an
   input production has never produced, i.e. a measurement of a configuration nobody will ship.
   `build()` throws if `free_terms` survives. Mutant **m1** re-adds it and is caught.
2. **🔴 `JSON.stringify` on `query` is now load-bearing, and it was not before.** The old `query`
   was a **bare `"{{ … }}"` interpolation** — safe while the value is LLM prose, fatal for a
   customer sentence carrying a quote, a backslash or a newline: the rendered body stops being
   JSON and the node fails on the critical path of **every** product turn. This is the highest-risk
   line in the slice and it has a **RED CONTROL**: probe U2 feeds the PRE-migration body a
   `user_goal` containing a quote and asserts it genuinely breaks, so the escaping is shown to be
   doing work rather than assumed to be. Mutant **m2** removes it.
3. **🔴 NO fallback to the restatement — the STRICT reading (main session, rev 2).
   `user_goal` does not appear anywhere in this body.** The build first shipped
   ` || user_goal || '' `, on the reasoning that `RAW_MESSAGE_SRC` can legitimately return `''`
   (attachment-only turn with no caption, failed transcript) whereas `user_goal` never is, so the
   fallback preserved today's exact input on exactly those turns. The main session took the
   strict reading, and its reason is better than the one the fallback was built on:

   > The contract is that the restatement **dies entirely**. On the only turns where the fallback
   > could ever fire, `user_goal` is precisely **LLM-invented text** — and `query` now feeds the
   > CRM's code-token extractor, `_synthesize_alpha_tokens` **and** the spec deriver. Handing
   > those machines a model's paraphrase of a turn that carried no words is worse than handing
   > them nothing: `''` derives nothing, which **is** the correct answer for a wordless turn,
   > whereas a restatement derives confident tokens the customer never typed.

   Enforced in three places, so a later "helpful" edit cannot erode it: `build()` **throws** if
   `user_goal` survives anywhere in the emitted body; probe **U7-11** asserts its absence from
   the shipped bytes; and **U7-6 / U7-8** pin the two empty paths (empty raw text, and
   `tf-message` not executed) to `""` — never a node error, never the restatement.
   **Mutant m10 is INVERTED**: it re-introduces the fallback and is CAUGHT.

   The one behaviour this deliberately changes: a wordless turn (attachment with no caption,
   failed transcript) now sends `"query": ""` where it used to send a restatement. `tokens` and
   `allowed_entity_types` still carry the parser's entities, so the normal probes are unaffected
   — but it is a real change on a real path, and §5 asks the tester to exercise it once.
4. **Source dominance re-verified on the CURRENT clone graph, per the plan's instruction — not
   inherited.** From the freshly exported `TOPOLOGY.md` (`daa88349`):
   `redis-pop-main-message-list → if-audio-in → {tf-message | … → patch-transcript → tf-message}`,
   and `tf-message` is the **only** inbound of `sorento-sub-respond-findcontact-respond`, which is
   the only route onward to `… → replay-resolve-entity → resolve-entity-http`. So `tf-message`
   dominates the node. It is also already read by `resolve-entity-http` today, so this is not a
   new by-name dependency.
5. **The accessor now has ONE definition** (`raw-message.js` `RAW_MESSAGE_SRC`), shared by the
   `query` field and by `compile-current-state`'s N-2 span reader, which each carried their own
   hand-written copy before. Now that the same string decides what the CRM **searches on**, two
   spellings would be LESSONS §63 waiting to happen. U7-9/U7-10 assert both shipped artifacts
   carry the byte-identical source. The body remains **pure ASCII** with no trailing whitespace.

**Inverted behaviour worth calling out to the tester:** a product CODE is no longer stripped from
what we send — it rides inside `query` and the CRM owns it. That is correct and deliberate:
`references.py:1953-1957` never clears a `_is_code_shaped` token, which is exactly what makes the
mixed hit+miss turn (§2c) reachable. U7-5 pins it.

---

## 2. `compile-current-state.jsCode` — three hunks

Builder: `build-ccs.js` (anchors asserted unique, no-op splice refused). Hunk source of truth:
`ccs-hunks.js`. **N-2's wording, position, guards and rev-3 span selection are untouched** —
only its `_rawMsg` line was replaced by the shared `RAW_MESSAGE_SRC` (same bytes, one definition).

### 2a. N-1a — the "Matched on" line becomes VALUES, filtered by `spec_asked`

This is the recorded S4 upgrade, now buildable because `spec_asked` ships in #142. The rule:

> **`matched_specs ∩ (spec_asked-keys ∪ {class})`**, rendered as VALUES from
> `display.specifications`; `class` rendered as its **VALUE**, never the key name, and **first**.

| | rev 4 (before) | now |
|---|---|---|
| example | `_Matched on: bowl count._` | `_Matched on: Kitchen Sink and bowl count: 2._` |
| what is named | every key that SCORED | only keys the CUSTOMER asked for, plus the class |
| `free_terms` | excluded by a `_MACHINERY_KEYS` list | excluded **structurally** — it can never be in `spec_asked` |

- **The `_MACHINERY_KEYS` list is DELETED, not kept as a belt.** Two mechanisms suppressing one
  outcome is precisely what makes both of their tests stop being evidence (LESSONS §64). The
  intersection does the job; mutant **m20** proves it is load-bearing by dropping the filter and
  going red on three separate assertions at once.
- **This RETIRES the SR-1b honesty finding rather than documenting it a second time.**
  `product_spec_search.py:1006-1013` appends a house-preference key to `matched_specs` *precisely
  when the customer did not state it* (`if key in stated: continue`), which could put an unstated
  `brand` into a line that reads as *"here is what your words matched"*. A preference key can
  therefore never be in `spec_asked`, and the intersection deletes the class of defect at the
  root. **SR-11's "record the key set and hand-review it" instruction is retired** (SR.md
  amended). U8-5 asserts it; **m20** turns it red.
- **The `class` UNION is permanent, in both directions.** Per the conformance addendum,
  `class ∉ spec_asked` is an **ARTEFACT of the deterministic path, not an invariant** — with
  `understand_phrase: true` the model can return `{"key":"class",…}` and it flows straight into
  `asked_for`. So U8-3 pins that class survives when it is *absent* from `spec_asked` and U8-4
  pins that it is accepted (once, not twice) when it is *present*. Mutant **m28** drops the union.
  Nothing here asserts class is absent.
- **`class` leads the sentence.** `matched_specs` arrives `sorted(set(...))`, so first-seen order
  alone buries the noun the customer typed between `bowl_count` and `free_terms`. Mutant **m26**.
- **Values, and what is refused.** Strings, finite numbers and lists-of-those render. A **boolean,
  an object, `null`, a key absent from `specifications`, or `specifications: null` outright (the
  shape-B require path, CRM F9) DROPS that key** — no key-name fallback, because printing a bare
  key beside rendered values would be a second rendering rule and *"Matched on: has overflow"*
  states nothing. Mutant **m27** coerces instead of dropping and is caught (`narrow by true` /
  `[object Object]`, the same failure N-2 guards against).
- Value provenance is the **first in-answer spec row** that records the key — the ranker's order.
  Mutant **m29** takes the last row instead.

### 2b. DEV-1 — the humanise rule is THREE lines

`class` verbatim · `brand` verbatim · everything else `replace('_',' ')` + titlecase. The branch
exempts **both** keys from the lower_snake enum pin (`test_spec_values_on_rows.py:319-322`),
because brand values legitimately carry spaces and case — `"American Standard"`, and `"NO LOGO"`,
a real catalogue value this PR deliberately made bindable.

> ⚠️ **One thing the reviewer should check, because I changed the code to make the guard
> falsifiable.** My first cut implemented titlecase as an uppercase-only pass
> (`replace(/\b[a-z]/g, up)`). That leaves `"SORENTO"` and `"NO LOGO"` **untouched all by
> itself** — so the class/brand exemption would have been a guard that cannot go red, and U8-7/8
> would have passed vacuously (LESSONS §66, and §73's "a pin that asserts half a value"). The
> shipped `_title` therefore lower-cases first and then capitalises — which is also what
> "titlecase" means, and is identical on the lower_snake input the contract specifies. Mutant
> **m24** empties `_VERBATIM_KEYS` and goes red on `NO LOGO` → `No Logo`.
> **Accepted by the main session (rev 2)** on exactly that reasoning: contract-identical on
> lower_snake input, and it is what makes DEV-1's exemption falsifiable rather than decorative.

The renderer never *depends* on the enum format (the addendum records that the pin is a pytest
over seeded rows, not a registry-side validator until CRM #160 merges): humanising is idempotent
on an already-spaced value, asserted by U8-12.

### 2c. N-3 — kept at FULL strength, renamed to what it tests (DEV-2)

- **No weakening.** The frozen contract had N-3 demoted to belt-and-braces once the CRM stripped
  caller-`free_terms` from the footer. Review finding F2 **replaced** that mechanism with a
  stricter word-level rule consulting no caller field at all, so N-3 is once again the only guard
  for a token the CRM's rule declines to clear.
- **`_fedFreeTerms` → `_notCodeShaped`, `_tokenFedSpecSearch` → `_tokenReachedSpecSearch`.**
  `free_terms` no longer exists; a predicate named after a deleted field is LESSONS §70b's defect
  (a name promising more than the mechanism delivers). The code-shape scoping SURVIVES on new
  grounds: the CRM adopted the same carve-out (`_is_code_shaped` tokens are never cleared), so a
  customer's code is *guaranteed* to come back unresolved beside a full spec answer and N-3 must
  not mute it. Mutants **m3** and **m5** (now anchored on the new names) are both caught.
- **The mixed hit+miss turn was ALREADY handled — and I am recording that honestly rather than
  claiming a fix.** The plan said "if the current N-3 body can't, this slice fixes it." It can:
  U6-24 ("the descriptive token is still suppressed") and U6-25 ("exactly ONE miss, the code")
  **passed against the deployed rev-4 body** in the RED record. They ship as `[PRESERVE]`
  assertions that pin DEV-2's requirement explicitly; U6-23 went red only because the Matched-on
  line's text changed. The tester's SR-15 is the boundary-level confirmation.

## 2c. `compile-current-state` — F1 · the derived query token is not a customer token

**One predicate + one filter clause**, inside the answered partial-miss block.

```js
const _sentTokens = /* qf.entities[].raw, trimmed + case-folded */;
const _rawTurn    = /* RAW_MESSAGE_SRC, trimmed + case-folded */;
const _isDerivedQueryToken = (tok) => {
  const k = String(tok ?? '').trim().toLowerCase();
  if (!k) return false;
  if (_sentTokens.size) return !_sentTokens.has(k);
  return !!_rawTurn && k === _rawTurn;
};
```

```diff
   missResolutions = r.resolutions.filter(res => res && res.resolved !== true
     && !(Array.isArray(res.matches) && res.matches.some(isExact))
     && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())
+    && !_isDerivedQueryToken(res.token)
     && !_tokenReachedSpecSearch(res.token)
     && !_tokenWasAnswered(res));
```

One clause governs all three renderings the rule names — dym group label, `Couldn't find` line,
plain miss line — because `missResolutions` is the single source the block builds `_lines` from.

**Keyed on WHAT WE SENT, not on what came back.** `resolve-entity-http` builds `tokens` from
exactly `qf.entities[].raw`, and this node reads the same array, so "is this token ours?" is
decidable here without trusting any CRM echo. Every CRM-derived probe token falls outside the set
by construction — the appended query resolution **and** any `_synthesize_alpha_tokens`
whitespace-split of the sentence, which DEV-3 warns multiplies on exactly this migration.

**Fail-open, deliberately** (UAC SR-U5: a genuine miss must never be silenced):

| what we have | rule | assertion |
|---|---|---|
| sent tokens present | suppress any token NOT in the set | U9-2/3/4, U9-5 (own token survives) |
| no sent tokens | narrow to the raw turn text only | U9-10, U9-11 |
| neither | suppress nothing | U9-12 |
| case/whitespace drift | folded on both sides | U9-13 |

The legacy single-resolution arm is untouched: its `r.token` is undefined, `_isDerivedQueryToken`
returns `false` on an empty key, nothing changes.

## 2d. `compile-current-state` — F2 · the Matched-on line is whole-answer scoped

The keys were spec-row-sourced but the sentence is appended to the **whole** reply. Rule now:

> emit **ONLY** when EVERY row the customer was shown is a `spec_search` row; on any mixed answer,
> suppress entirely.

```js
const _specKeys = /* uuid + canonical_code of every in-answer spec row */;
const _allShownAreSpec = _shownEnts.length > 0 && _shownEnts.every(e =>
  [e && e.uuid, e && e.code].some(v => _specKeys.has(fold(v))));
if (!_allShownAreSpec) return;
```

Joined against `disallowed-entity-gate.compatible_entities` — the **same** list `_inAnswer` uses,
so "in the answer" and "the whole answer" cannot disagree about what the answer is.

- A partial attribution is not a weaker claim, it is a **false** one. On the measured mixed shape
  (exec `12597847`) the reply carried 15 rows — 10 code-prefix, 5 spec — and closed with
  `_Matched on: mounting: Wall Hung._`, true of 5 and false of 10. Substitute a product attribute
  and it sharpens: *"SRTWC286 and 1.2mm sink"* would invite the customer to read the SRTWC286 rows
  as 1.2mm.
- **Suppression is of the CLAIM, not of the answer** — the spec rows are still shown (U10-3).
- **Stated bound:** a shown entity that is not a product spec row (a category or brand row lifted
  into `compatible_entities`) also suppresses. That is the conservative direction, and it is the
  one this block must err in.
- The all-spec answer (the AND arm, where the CRM REPLACES) still renders (U10-5 `[PRESERVE]`).

## 2e. 🔴 The m21 story — F2 silently made an existing mutant vacuous

Worth more than either hunk, because it is the class this repo keeps paying for.

On the first rev-3 mutation run **m21 SURVIVED** — the mutant that deletes N-1a's zero-key gate
(`if (!_keys.length) return;`). Nothing about that gate had changed. What changed is that **F2's
new gate returns FIRST** on every fixture m21 was killed by: those fixtures showed two answer
entities with one spec row, which F2 correctly reads as a mixed answer. Two mechanisms suppressing
one symptom, so the test stopped being evidence for either — **LESSONS §64 exactly, arriving from
the direction nobody watches: a NEW guard silently making an OLD guard's test vacuous.**

The fix is a fixture, never a weakened assertion: the shape only the zero-key gate can reject is
*every shown row IS a spec row (so F2 passes) and NO spec key survives*. U6-16 now runs with a
one-row answer, and **m21 is CAUGHT again**. Recorded in the probe at the fixture itself so the
next person to widen a gate here reads the reason rather than rediscovering it.

This is the second time in this slice that the mutation gate — not review — found the defect
(the first was the uppercase-only titlecase, §2b).

---

## 2f. `build-suggest-offer` — F1's SECOND emitter (rev 4, third node authorised)

**Rev 3 fixed the rule in the wrong node, and the customer-visible reply did not change.** That is
worth stating plainly because it is the whole reason this node is in scope: I pulled exec
`12597815`'s runData rather than reasoning from the review, and `build-suggest-offer` emits
`suggest_response` **already containing** the defective block, while `compile-current-state` sets
`manualResponse = true` and passes it through verbatim. Enumerating renderers by RENDERED STRING
(LESSONS §63) finds exactly two emitters of `"${token}" — did you mean:`:
`compile-current-state.js:823` (answered partial-miss) and `build-suggest-offer.js:309`
(not-found lane — the cited one).

**ONE predicate, TWO splices.** Both are now generated from
`tests/offline/spec-answer-honesty/derived-token.js`; the ccs body was re-pointed at it as a
**byte-neutral refactor** (rebuilt sha identical to what was already deployed, so no ccs write was
needed). U11-14/U11-15 assert the two emitters carry the same predicate logic, and that they are
genuinely different bytes so the comparison is not a thing compared to itself.

```diff
   missResolutions = r.resolutions.filter(res => res && res.resolved !== true
     && !(Array.isArray(res.matches) && res.matches.some(isExact))
     && !_gateResolvedTokens.has(String(res.token ?? '').trim().toLowerCase())
+    && !_isDerivedQueryToken(res.token));
```

### Measured at the customer boundary — before and after, same envelope

```
BEFORE (deployed at 6656a1de / d3767545)          AFTER (98e93d6e)
Couldn't find some items:                          Couldn't find "wall hung basin". Did you mean
                                                   BRBC2296-1 (WALL HUNG), MAB7029C-WALL HUNG, or
"wall hung basin" — did you mean:                  MAB7029E-WALL HUNG? Reply with a code to
  1. BRBC2296-1 (WALL HUNG)                        continue, or would you like me to escalate to
  2. MAB7029C-WALL HUNG                            purchasing_certification team?
  3. MAB7029E-WALL HUNG
"wall hung basin got SIRIM cert?" — did you mean:
  4. BRBC22137W-1 (WALL HUNG)
  5. BRBC22292W
  6. BRBC22350W-1-SG

Reply a number to pick, or 'yes' to escalate to purchasing_certification.
```

The shape change is a **consequence, not a second decision**: with the phantom token gone there is
ONE surviving miss token, so bso takes its existing single-token arm — which is the arm this turn
would have taken before the migration introduced the phantom. The reply also gains per-code quick
replies the six-item numbered form could not offer.

### 🔴 The quieter defect F1 also fixes — pick-linkage corruption

Not in the review, found while building the assertions, and worth more than the wording:

| | `dym_candidates[].for_raw` |
|---|---|
| before | `["wall hung basin", "wall hung basin got SIRIM cert?"]` |
| after | `["wall hung basin"]` |

`for_raw` is the entity token a pick must REPLACE (memory `didyoumean-entity-retention`: *"label
each suggestion with its source token so a pick replaces the right entity and keeps
customer/date"*). Three of the six offered candidates were attributed to a raw **the parser never
emitted**, so a customer picking #4/#5/#6 handed `output_exchange` a replacement target matching no
entity. The wording defect is what the reviewer saw; this one is silent and would have failed a
pick. U11-7 asserts the pre-fix body carries it, U11-8 that no surviving candidate does.

### Live portability — checked before writing, not assumed

| check | finding |
|---|---|
| node exists on live by that exact name | ✅ `build-suggest-offer`, id `7972abd8-…` (the **same** id as the clone's) |
| the hunk's reads exist on live | ✅ `q` (`Call 'sub-query-reformulator'`) already bound at `:21`; `q.entities` already used at `:144/:208/:280` |
| the ONE new by-name read | `$('tf-message')` — **exists on live** and is the SOLE inbound of `sorento-sub-respond-findcontact-respond` on live AND the clone, so it dominates every path to this node |
| clone-only scaffolding in the hunk | none (no `fixture-*`, `replay-*`, `guard-*`, `sim-inject-*`) |
| the block's own wording, live vs clone | **IDENTICAL** — `` `"${token}" — did you mean:\n` `` on both. Unlike `compile-current-state`, whose live miss lines read `` `"${token}": not found.` `` and `` `"${token}", did you mean:` `` (comma/colon) against the clone's em-dashes |
| clone vs live body delta | **ONE hunk**: live carries a `#9 company_team` improvement (`const team = (gate && gate.company_team) \|\| …`) the clone lacks. **Block-copying the clone's bso to live would DELETE it** — hunks-by-name only |

### Transport: the banner-canonicalisation measure

Three writes of this body were aborted by the byte gate on ±1–2 character drift in long runs of
`─` inside PRE-EXISTING comment banners — LESSONS §71's transport corollary, measured again, and
REST PUT (its documented deterministic remedy) is forbidden here. Retrying an unbounded
transcription is not a strategy, so `build-bso.js` now **canonicalises every trailing run of >8
box-drawing dashes to exactly 8** before emitting. It asserts the change touches **comment lines
only** (8 lines, 0 code) and refuses to emit otherwise. The fourth write matched byte-for-byte
first time. This is clone-only; the promote body is built as live + hunks, so live's banners are
never rewritten by it.

---

## 2g. The CRM lane's four settled wire facts (plan §5) — what this build already does

Folded in for the reviewer, since two of the three disagreements were the CRM's contract note
being wrong rather than our reading:

| fact | this build |
|---|---|
| **brand/class casing — OUR RULE IS THE CONTRACT** (confirmed; they will not normalise catalogue spelling) | Already shipped, §2b. DEV-1 is closed permanently; `_VERBATIM_KEYS = ['class','brand']` stays, and **must not be widened** (F7) |
| **carrier = `resolutions[].matches[]` with `match_tier:"spec_search"`**; top-level `spec_candidates` is a MIRROR | Already what both N-1a and N-3 read (plus `intersection` on the AND shape). **Do NOT migrate to `spec_candidates`** — its own docstring records that as a dead end, because every existing consumer reads `resolutions[].matches` |
| **`preferred_specs` absent ⇒ no spec rows; treat absent as empty** | The renderer never reads `preferred_specs`; it reads `matched_specs` ∩ (`spec_asked` ∪ class) and takes values from `specifications`. Absent is therefore already inert. 🔴 If a `spec_search` row is ever captured with NO `preferred_specs` key, that is a real CRM defect — send the exec id to the CRM lane |
| **`spec_top_score` is BUILDING; the tri-state near-miss render is a NEXT slice** | Nothing here reads `floor_missed`, and nothing here would block it. The N-2 line keys on `spec_unmet`, a different question. Do not design the near-miss sentence off `floor_missed` alone — it conflates "nothing scored" with "nothing cleared the bar" |

---

## 3. The deployment TELL — the one behaviour I deliberately did NOT make safe

If `spec_asked` is **absent** (i.e. the endpoint predates #142), the filter admits only `class`,
and the line degrades to `_Matched on your description._`.

That is not papered over with a fallback to rev-4's unfiltered sentence, on purpose: a fallback
would make the deployed and undeployed CRM **indistinguishable at the customer boundary** — the
exact class of defect LESSONS §64 names (a sound assertion that cannot discriminate the two
states). U8-21/22/23 pin the degradation in all three shapes (absent, `[]`, not-an-array).

**Consequence for the tester:** on SR-13, a `_Matched on your description._` where a qualifier was
plainly asked for is **evidence that #142 is not live on the endpoint the clone calls** — report
it as a deployment finding, not as a renderer bug. Given §0, this is currently the *cheapest live
check we have* that the CRM half deployed.

---

## 4. Evidence

`tests/offline/spec-answer-honesty/` — `node probe.js` → **210 passed, 0 failed** (rev 4; 192 at
rev 3, 169 at rev 2), with **three** deployment gates all green — **D1 `DEPLOYED (97d2f6a25882)`**,
**D2 `DEPLOYED (8a18369006be)`**, **D1b `DEPLOYED (af7d38527e6b)`** — i.e. the suite's bytes ARE
the clone's bytes on **all three** leaves. `bash mutate.sh` → **35 caught, 0 survived, 1 VOID**
(the intentional stale-anchor selftest — the only VOID, and it is the instrument proving a no-op
substitution can never be scored as a detection).

**The three new mutants, each killing a NAMED assertion:**

| mutant | re-enables | dies on |
|---|---|---|
| **m30** | the derived-token label, via the sent-token arm | U3-9b, U9-2, U9-4 |
| **m30b** | the F1 predicate outright (both arms) | U3-9b, U9-2, U9-4 |
| **m31** | the Matched-on line on a MIXED answer | U10-2, U10-6 |
| **m32** ⭐ rev 4 | the derived-token label in **bso**, via the sent-token arm | U11-2, U11-3, U11-5 |
| **m32b** ⭐ rev 4 | the bso predicate outright (both arms) | U11-2, U11-3, U11-12 |
| **m33** ⭐ rev 4 | the bso predicate is DEFINED but never consulted by the filter | U11-2, U11-6 |

m30 and m30b are deliberately separate: m30 leaves the raw-turn-text fallback arm live, so each
arm of the predicate is shown to be load-bearing rather than one covering for the other. **m33 is
the one that would have caught rev 3's mistake in miniature** — a guard that exists and is never
called. Rev 3 shipped exactly that shape at the WORKFLOW level (the right rule, in the wrong
node), so each emitter now carries its own mutant rather than the suite assuming one covers both.

`tests/offline/spec-shapeA/` (regression, since `free-terms.js` gained a derived export) →
**37 passed, 0 failed**, mutation gate **10/10 caught** — re-run at rev 3, unchanged. Its B5 resync gate gained a fourth
outcome, **SUPERSEDED**, detected by *shape* (`no free_terms` + `spec_fallback:true`) rather than
a frozen sha so it survives the next revision, and naming the successor gate rather than guessing.

### RED record (§0 S9) · REV 3 — taken against the DEPLOYED pre-F1/F2 body

`OFFLINE_NODES_DIR` pointed at `compile-current-state.rev5.js` — the body the clone was actually
running at `6656a1de` (sha `9a8f141c…`): **185 passed, 7 FAILED.** Those seven are exactly the
F1/F2 behavioural claims, and nothing else:

```
RED U3-9b  [F1] the CRM-derived query token is not rendered at all
RED U9-2   [F1] the sentence never appears as a group label
RED U9-4   [F1] ... nor anywhere in the reply at all
RED U9-9   [F1] ... on the same reply where a genuine code miss still speaks
RED U9-10  [F1] with NO sent tokens, only the raw turn text itself is suppressed
RED U10-2  [F2] suppressed entirely on a mixed answer
RED U10-6  [F2] ONE non-spec row among many is enough to suppress
```

U9-1 and U10-1 are the **inverse** assertions — they assert that the pre-fix body DID render the
defect — so they pass in both modes by construction, which is what makes the RED above a
measurement rather than a claim. U9-3/5/6/7/8/11/12/13, U10-3/4/5 passed pre-fix and are labelled
`[BOUND]`/`[PRESERVE]`, not evidence for the change; each is killed post-fix by m30/m30b/m31.

### RED record (§0 S9) — REV 1/2, taken against the DEPLOYED rev-4 body, before a line was written

`OFFLINE_NODES_DIR` pointed at a scratch copy of the clone's exported `c97f2f8f` bytes
(`compile-current-state` sha `82707a95…`, jsonBody sha `7ca14cbf…`): **102 passed, 64 FAILED.**
That is every U1-R retirement proof, every U7 query assertion, every U8 filter/humanise/value
assertion, the U2 field-parity and key-set-delta assertions, the nine `afterLessN1A` no-op
comparisons (whose subtracted line legitimately changed), and U6-1/11/12/13/14/19/23.

**Passed pre-fix and therefore labelled, not counted as evidence for the change** (LESSONS §66):
U1-R6, U7-3, U7-4, U7-6, U7-8, U6-2..U6-10, U6-15..U6-18, U6-20..U6-22, **U6-24, U6-25**, U8-6,
U8-27. Each is killed post-fix by a named mutant, so none is a green that cannot fail.

> **Smell noted, not hidden: a 100% first-run mutation score is a smell, not a triumph
> (LESSONS §72).** 29/29 here is not a fresh suite finding nothing — 19 of the mutants are the
> inherited SR set and were already earning their keep, and the 10 new ones were each written
> against a *named* assertion and confirmed to kill that assertion rather than merely turning the
> suite red somewhere. The one place I went looking for a non-discriminating mutant, I found one
> (the uppercase-only titlecase, §2b) and changed the **code** so the guard could go red.

### What is NOT proven

- **The S1/DEV-1/DEV-2/SR-8/G1 post-deploy probes are UNRUN** — §0. Every CRM-side field this
  slice consumes is read from the conformance report, not from a live envelope.
- **No clone execution was run** (tester's seat, and the publish is confirmed structurally: the
  export round-trips both leaves byte-for-byte and D1/D1b report DEPLOYED, which is stronger
  evidence than a smoke that the *right bytes* landed). What that leaves open: nobody has yet
  observed the new `query` expression evaluate inside real n8n, nor the new line rendered by the
  clone. `render-body.js` models the expression faithfully for the two things that can break
  (does it parse, what string does it produce) and nothing else.
- **DEV-1's brand exemption is untested against real catalogue data.** It is proven against the
  contract's stated values (`SORENTO`, `NO LOGO`, `American Standard`). Whether any brand value in
  the live catalogue actually differs from titlecase is what `s1-probe.js`'s DEV-1 case measures,
  and it reports **INCONCLUSIVE** rather than green if none does.

### Transport finding worth keeping (three failed writes, all caught by the byte gate)

`update_workflow`'s payload is JSON, so a `\uXXXX` sequence inside a node body is **decoded by the
JSON parser before n8n sees it** — the escaped form is simply **not writable through this
transport**. The classifier's dash class (`‐-―−﹘﹣－`) came back as
literal glyphs three times running.

Rather than keep fighting it or keep two hand-maintained spellings, `free-terms.js` now DERIVES
`CLASSIFIER_TRANSPORT` from `CLASSIFIER_SRC` mechanically, `build-ccs.js` splices the transport
form, and probe **U1-R8/R9** assert the two are the same classifier *as behaviour* (over the
U+2212 paste form, the only fixture that exercises the decoded range) **and** are genuinely
different bytes — so U1-R8 cannot be comparing a thing to itself (LESSONS §70d). `CLASSIFIER_SRC`
stays the ASCII form the shape-A suite pins and LIVE's `resolve-entity` still carries.
A separate drift (one missing trailing newline) was caught by the same gate. **Three aborted
writes, zero mis-deployed bytes** — the gate is the reason each abort was cheap.

### Reviewer findings closed by rev 3 (and the two that are documentation)

| # | disposition |
|---|---|
| **F1** | ✅ **CLOSED at rev 4.** BOTH emitters carry the guard (§2c compile-current-state, §2f build-suggest-offer), from ONE shared predicate source. RED-first on each: 7 assertions vs the pre-fix ccs body, 7 more vs the pre-fix bso body. Mutants m30/m30b (ccs) and m32/m32b/m33 (bso). U9-14 inverted to assert the fix in the DEPLOYED bytes. Also fixes a silent pick-linkage corruption the review did not see (§2f) |
| **F2** | **CLOSED** — §2d, RED-first, mutant m31. |
| **F6** | **CLOSED (documentation).** `tests/uac/SA.md` contract fact #1 now carries the scope qualifier: **REPLACE is the AND arm**; on the **OR arm the CRM APPENDS** (`fallback_match_mode:"or"`, conformance §C-1 — *"AND shape: assignment, not extend"* vs *"OR shape: one new resolution is appended"*), so the renderer CAN see a mixed set. The fact was written when only the AND arm had been exercised. **Not a contract breach; no CRM ticket**, exactly as the reviewer determined. |
| **F7** | **RESIDUAL, accepted and recorded.** `_title` is contract-correct on lower_snake input and the `class`/`brand` exemption is real (live-verified `brand: BRAVAT`, not `Bravat`). But for a **non-exempt** key, a value that is *not* lower_snake gets its catalogue spelling rewritten — `SUS304` → `Sus304`. The enum-token guarantee is a pytest over seeded rows, **not a write-path validator**, until **CRM PR #160** merges (built; 0 of 55 live rows would fail). **Track #160. Do NOT widen `_VERBATIM_KEYS` speculatively** — that would trade a narrow, known cosmetic defect for an unfalsifiable exemption list. |
| **F3 / F4 / F5** | tester obligations, not code — the case specs are in §5. |

---

## 5. Tester handoff

Run `tests/uac/00-SAFETY-always-read.md` §0 on every case, `uac` mode,
`previous_conversation_state: {}` mandatory (the uac-mode prod-session landmine).
**Start every pass by re-checking the two after-shas above** (LESSONS §64) — `probe.js`'s D1/D1b
do it automatically and report four outcomes, never two.


### 🔴 The four blocking cases (reviewer F3/F4/F5 + F1's boundary re-read) — exact specs

All four: clone `txiPzSxy3Pclsz6v` @ **`d3767545`**, `uac` mode,
**`previous_conversation_state: {}` MANDATORY** on every case (the uac-mode prod-session
landmine), §0 asserted per case, per-node runData never execution status.
**Re-check both after-shas before the first case** (`97d2f6a25882…` / `af7d38527e6b…`) —
D1/D1b do it automatically.

#### SA-7 — the runData half (reviewer F3; SA.md marks it *required before promote*)

| | |
|---|---|
| **act** | `do you have wall hung basin` — a BARE descriptive phrase, no code token, so the CRM stays on the **AND** arm (which is the arm SA.md's fact #1 describes, and the only arm where REPLACE holds) |
| **assert — runData, `resolve-entity-http` OUTPUT** | ① every row in `intersection` carries `match_tier === "spec_search"`; ② **ZERO** rows with `match_field: "product_code"` or tier `prefix`/`exact`/`and` anywhere in `intersection` **or** `resolutions[].matches` — *this is the assertion no case has yet made, and the one that would have caught F1/F2's mixed shape on the AND arm*; ③ `spec_asked` present and an array |
| **assert — runData, `resolve-entity-http` INPUT** | `query` === the customer's sentence verbatim; **no `free_terms` key** |
| **assert — CUSTOMER BOUNDARY, whole reply** | spec product list present; **none** of `Couldn't find`, `did you mean`, `Multiple matches found`, an escalation offer |
| **also record** | the `_Matched on: …` line **verbatim** — on an all-spec AND answer it SHOULD render, and it doubles as SR-14/DEV-1's brand fixture |
| **if it comes back MIXED** (code partials beside spec rows) | that is the OR arm, not a failure of the build: assert instead that **no `_Matched on:` line appears at all** (F2), and record the shape |

#### S1-C — the counterweight, ON THE CLONE (reviewer F4; the blocked proxy is not the reason it was unrun)

| | |
|---|---|
| **act** | `do you have stock for SRTWC286 please` — a **fully-covered code PHRASE**, not a bare code |
| **why SR-16 cannot discharge it** | SR-16 is `check stock SRTWC286`, a bare code, which **cannot trip the widened `_product_words_unanswered` arm at all** — so its clean tier census discharges SA-2 and is structurally blind to over-firing. S1-C sends a SENTENCE, and this slice is what makes the sentence the search input, so over-firing is materially more likely than when `query` was a restatement |
| **assert — runData** | ① **ZERO** `match_tier === "spec_search"` rows anywhere (`intersection` **and** every `resolutions[].matches`); ② `spec_asked` absent or `[]` — the spec machinery did not run at all; ③ the code still resolves normally (SRTWC286 rows present, exact/prefix tier) |
| **assert — boundary** | the stock answer renders unchanged; **no `_Matched on:` line** (no spec rows ⇒ N-1a no-op) |
| **🔴 prove it can go red** | this case asserts an ABSENCE, so it is the green-that-cannot-fail shape by construction. Discharge that by citing SA-7's **positive** spec-row count from the same session as the discriminator: the same instrument, same run, returns rows on SA-7 and zero here. Without that pairing, record S1-C as *unproven*, not as passed |

#### SA-4-B ⭐ **rev 4** — the bso path AT THE CUSTOMER BOUNDARY (the reply that was wrong)

The one case that reads the string reviewer F1 actually complained about. Every other F1 assertion
is offline or on the other emitter; this is the workflow-level proof.

| | |
|---|---|
| **act** | `wall hung basin got SIRIM cert?` — SA-4's own input, verbatim (the exec-12597815 turn). It routes to `product_attachment`, misses, and lands on the **not-found lane** where `build-suggest-offer` renders |
| **assert — the WHOLE rendered reply** (§68) | ① the customer's own question **appears nowhere** — no `"wall hung basin got SIRIM cert?" — did you mean:` group, and the sentence is absent from the reply as a whole string; ② the customer's real token `"wall hung basin"` DOES still get its suggestions (no over-suppression); ③ the offer roster is the 3 candidates of that one token, not 6 across two groups |
| **assert — runData, `build-suggest-offer` output** | ④ `suggest_last_result_set.length === 3`; ⑤ 🔴 **every `dym_candidates[].for_raw` is a raw the PARSER actually emitted** — cross-check against `Call 'sub-query-reformulator'.output.entities[].raw`. Pre-fix, 3 of 6 carried the whole sentence, which silently breaks the pick round-trip. This is the half the review did not see |
| **assert — which node rendered it** | ⑥ `compile-current-state.user_response === build-suggest-offer.suggest_response` (the suggest override passes through verbatim), so the boundary string is attributable to the node that was fixed — not to a coincidence downstream |
| **RED reference** | exec `12597815` IS the red: its runData carries the two-group text verbatim. Quote both old and new in the run log rather than only asserting the new one |
| **note** | the reply legitimately changes SHAPE (numbered 6-item picker → single-token prose + per-code quick replies) because one miss token now survives instead of two. That is the pre-migration shape restored, not a new behaviour — do not score it as a regression |

#### Customer spot-check (reviewer F5)

| | |
|---|---|
| **act** | an order question naming a customer, e.g. `do you have any orders for <customer>` — take `<customer>` and the expected answer from a **real prior execution**, never from `tests/cases/*.json` unverified (the stale-fixture rule) |
| **why** | DEV-3: `query` now feeds `_synthesize_alpha_tokens`, which whitespace-splits the **whole** sentence. A customer name inside a sentence yields many more probe tokens than the restatement did, and each is a chance at a spurious resolution |
| **assert** | ① `domain_hint` routes to `order` as in the baseline; ② the customer entity resolves to the **same** uuid/code as the baseline execution; ③ the answer rows match the baseline; ④ **[F1]** the whole sentence does NOT appear as a dym group label or a `Couldn't find` line; ⑤ no `_Matched on:` line (non-spec domain) |

#### Date spot-check (reviewer F5)

| | |
|---|---|
| **act** | a date-filtered question, e.g. `orders delivered in July` / `what came in last month` — envelope from a **real** execution |
| **why** | the month word now reaches the CRM as a probe token where it previously did not; the risk is a spurious alpha-token resolution manufacturing a NEW miss block under a correct answer |
| **assert** | ① parser `date_filter_start` / `date_filter_end` / `date_mode` unchanged vs the baseline for the same input; ② the resolve request's `query` carries the raw sentence **including** the month word, while `tokens` still carry only the entity raws (the phrase must stay ONE token — SA.md); ③ the answer set matches the baseline; ④ **the whole reply carries no new miss block** |


### Blocked-first

0. **If the user has flipped MCP access on `UYkE8VLZ8DzJa3TT`,** run
   `PROBE_WEBHOOK=… node tests/offline/spec-answer-honesty/s1-probe.js` **before** any clone case
   and file `s1-probe-post142.json`; then re-run `g1-house-brand-probe.js`. A probe that
   contradicts the plan is a STOP.

### Clone cases — new, in priority order

| id | family | why it is first |
|---|---|---|
| **SR-13** | SR.md §SR-1c | the whole slice in one turn: `query` verbatim + **no `free_terms` key** in the request, `spec_asked` on the response, and the three appended lines each exactly once in order |
| **SR-15** | SR.md §SR-1c | DEV-2 at the boundary — spec shortlist AND `"SRTZZ999" — not found.` in one reply |
| **SR-14** | SR.md §SR-1c | DEV-1 at the boundary — record the Matched-on line VERBATIM; a titlecased brand is a FAIL, no brand at all is INCONCLUSIVE |
| **SR-16** | SR.md §SR-1c | the no-op guarantee on a code turn, plus "the code now rides in `query`" |
| **SR-8** | SR.md (retest) | **no longer observational** — D7's junk suppression shipped; SORENTOBAG/SORENTO188 must be gone |

### Existing cases to re-run, with their amendments

- **SR-1** — assert `query`, not `free_terms` (SR.md amendment 1).
- **SR-2** — the 1.0mm/1.2mm pair; the N-2 line must still read `…so I couldn't narrow by 1.0mm.`
  verbatim (rev 3 must not regress).
- **SR-3**, **SR-4**, **SR-7**, **SR-9**, **SR-10**, **SR-11** (review trigger retired),
  **SR-12** — unchanged intent; SR-10/SR-11's expected *string* changed (values, not key names).
- **SR-5** — code parity; the request changed, the reply must not.
- **NEW, cheap, worth one case (rev 2):** a **wordless** turn (attachment with no caption, or a
  failed transcript) now sends `"query": ""` where it used to send the parser's restatement.
  `tokens`/`allowed_entity_types` still carry the entities so nothing downstream should move,
  but this is the one path the strict reading deliberately alters — exercise it once and record
  the reply rather than inferring it.
- **SR-6** 🔴 **LOAD-BEARING** — "purple levitating sink". The whole sentence now reaches the
  ranker instead of a filtered term list, so the filler-word floor argument changes shape.
  Compare row COUNT and CODES against the baseline; rows where none appeared = FAIL.
- **SA-1..SA-7** — the shape-A family, especially **SA-2** (code parity) and **SA-6**
  (`resolve-entity-clarification` untouched — verify from the JSON).

### Regression sweep — DEV-3 widened it to the FULL resolve surface

`query` feeds **both** machines (`_resolve_input` and `derive_search_inputs`,
`references.py:1967-1977, 2051`) and there is no separate raw-text channel, so a raw sentence now
reaches the code-token extractor and `_synthesize_alpha_tokens`, which whitespace-splits the
**whole** query — a sentence yields many more probe tokens than a restatement did. Re-run, with
envelopes taken from **real executions** (never `tests/cases/*.json` unverified — the
stale-fixture rule): code parity (bare and pasted codes inside a sentence, incl. the U+2212 dash
fold), order / customer / date spot-checks, attachment + `domain_hint`, AND-mode multi-token.

### Safety

Zero egress per §0: `test:egress:{run_id}` all `would_*`; S7a TEST-sink delta + S7b prod-sink
depth series **and** pop payload with covering execution ids (never LLEN-equality). Nothing in
this slice touches a sub, a credential, a connection or an egress node — the param sweep above is
the static half of that claim.

---

## 6b. 🔴 PROMOTE BODY — now THREE hunks by node name (rev 4 widened it)

Target **LIVE `9qVyfUxmRQqrpGRMDLRuz`** @ `469e7259` (`versionId == activeVersionId`).
**MCP `update_workflow` + `publish_workflow` only — REST PUT is FORBIDDEN.** Target by NAME.
**Re-diff at promote; do not trust these shas** (a hash claim decays — memory
`stale-byte-identical-fork-claim`). Rollback = republish `469e7259`.

| # | live node | leaf | live sha256 NOW | method |
|---|---|---|---|---|
| 1 | `resolve-entity` *(clone: `resolve-entity-http`)* | `jsonBody` | `51de7f16cf223c7dcc89485d629252c2524729df56735dae29b741d9e8a7da5f` (886 B) | block-copy of the clone leaf **permitted** (reviewer §F: no harness scaffolding, both by-name reads exist on live) |
| 2 | `compile-current-state` | `jsCode` | `3fa9d17071a81adacfdc573951bef81b249031cb153a68baadf6f709bfa98249` (36,983 B) | 🔴 **HUNKS-BY-NAME ONTO LIVE'S BODY. NEVER BLOCK-COPY** |
| 3 ⭐ **rev 4** | `build-suggest-offer` | `jsCode` | `4d4096167fd3b5c3b34094e18b6873e404049cc1d0b18b8c312ab4b647d3e2f1` (33,706 B) | 🔴 **HUNKS-BY-NAME. NEVER BLOCK-COPY** |

**Why hunk 3 must not be block-copied — measured, not assumed.** `diff live clone` on
`build-suggest-offer` is **exactly one hunk**, and it is live carrying something the clone lacks:

```
live : const team = (gate && gate.company_team) || q?.routing?.suggested_team || 'customer_service';
       // #9: prefer the resolved entity's company team, so the offer text, the not-found text and
       // the actual escalation cannot name three different teams in one turn.
clone: const team = q?.routing?.suggested_team || 'customer_service';
```

Block-copying the clone's body would **delete live's #9 company-team fix** — a customer-visible
regression with nothing to do with this slice. Apply only the F1 hunk (the predicate block + the
one filter clause, both from `derived-token.js`) onto live's body.

Two more live-specific facts for hunk 2, both verified this rev:
- live's miss renderer wording differs from the clone's in **two** places, not one —
  `` `"${token}": not found.` `` (colon) **and** `` `"${token}", did you mean:` `` (comma), vs the
  clone's em-dashes. The reviewer flagged the first; the second is the same trap.
- the clone's **banner canonicalisation** (§2f) is clone-only and must not travel: it exists to
  make the MCP transport deterministic for the clone write, and hunks-by-name never carries it.

Hunk 3's only new by-name read is `$('tf-message')`, which exists on live and dominates the node
(sole inbound of `sorento-sub-respond-findcontact-respond` on both graphs).

---

## 6. Files

| path | role |
|---|---|
| `tests/offline/spec-answer-honesty/raw-message.js` | ⭐ NEW — `RAW_MESSAGE_SRC`, the ONE definition of the customer's turn text, shared by `query` and N-2 |
| `tests/offline/spec-answer-honesty/build-body.js` | rewritten: query→raw + free_terms deletion, both anchored; **atomicity AND the `user_goal` absence both enforced in `build()`** — it throws rather than emit |
| `tests/offline/spec-answer-honesty/ccs-hunks.js` | N-1a rewritten (filter + values + three-line humanise), N-3 renamed + re-justified, N-2's `_rawMsg` unified |
| `tests/offline/spec-shapeA/free-terms.js` | `CLASSIFIER_TRANSPORT` derived from `CLASSIFIER_SRC` (the MCP-transport byte form) |
| `tests/offline/spec-answer-honesty/probe.js` | SR-U1 repurposed, **SR-U7**/**SR-U8** added, U6 rewritten for values, **D0d/D0e** RED-baseline discriminators, **D1b** the non-Code deployment gate; **rev 3** adds **SR-U9** (F1, incl. the U9-14 `build-suggest-offer` tripwire), **SR-U10** (F2), **D0d2**, and re-points U3-9/U6-17 whose whole-object comparison F1 legitimately retired |
| `tests/offline/spec-answer-honesty/mutate.sh` | **35** mutants (m1/m2/m9 repointed, **m10 INVERTED**; m20 repointed; m23–m29; **rev 3** adds **m30/m30b** F1 and **m31** F2; **rev 4** adds **m32/m32b/m33** for the second emitter) + the stale-anchor selftest. Rev 3 also removed a backtick pair from m9's banner that the shell was executing as command substitution — noise inside a passing run (LESSONS D14) |
| `tests/offline/spec-answer-honesty/s1-probe.js` | ⭐ NEW — the post-deploy CRM contract probes. **UNRUN**, refuses to run without the webhook, block documented in its header |
| `tests/offline/spec-answer-honesty/compile-current-state.rev4.js` · `resolve-entity-http.rev4.jsonBody.txt` | the frozen pre-slice bytes; the RED baseline for revs 1-2 (§69) |
| `tests/offline/spec-answer-honesty/compile-current-state.rev5.js` | ⭐ NEW (rev 3) — the body deployed at `6656a1de`, i.e. this slice WITHOUT F1/F2; the RED baseline for SR-U9/SR-U10 |
| `tests/offline/spec-answer-honesty/derived-token.js` | ⭐ NEW (rev 4) — `derivedTokenSrc(parserVar, indent)`, the ONE definition of F1's rule, spliced into BOTH emitters |
| `tests/offline/spec-answer-honesty/build-bso.js` · `bso-harness.js` | ⭐ NEW (rev 4) — the third leaf's builder (with the banner-canonicalisation transport measure) and its offline harness |
| `tests/offline/spec-answer-honesty/build-suggest-offer.{before,after}.js` | ⭐ NEW (rev 4) — the frozen pre-F1 bso body (RED baseline) and the built body the clone runs |
| `tests/offline/spec-shapeA/probe.js` | B5 resync gate gains a **SUPERSEDED** outcome |
| `tests/uac/SR.md` | §SR-1c — three amendments to existing rows, SR-U1/U2/U6 changes, SR-U7/U8, SR-13..SR-16, SR-8 promoted from observational |
| `tests/uac/SA.md` | post-#142 probe table (S1-1..S1-4, S1-C counterweight, DEV-1, DEV-2, SR-8, G1) + the block and its one-toggle fix; **rev 3** amends contract fact #1 with the AND/OR arm scope qualifier (F6) |
