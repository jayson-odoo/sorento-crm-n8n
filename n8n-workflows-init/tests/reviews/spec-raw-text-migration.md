# Review — `spec-raw-text-migration`

Reviewer seat (opus). Date 2026-08-16.
Target reviewed: TEST clone `txiPzSxy3Pclsz6v` @ `6656a1de-45e3-4b49-8ded-5286e5250b63`.
Live spine `9qVyfUxmRQqrpGRMDLRuz` @ `469e7259` — **verified untouched** (`export-workflows.py --verify`
reports `live-spine-sorento-consume-main: current (469e7259)`; its `resolve-entity` / `compile-current-state`
bodies still carry the pre-shapeA bytes, see F11).

Inputs: `plans/spec-raw-text-migration-slice-plan.md` · `tests/diffs/spec-raw-text-migration.md` ·
`tests/reviews/pr142-contract-conformance.md` (+addendum) · `tests/runs/spec-raw-text-migration-*-20260815.json` ·
`tests/uac/{00-SAFETY-always-read,SR,SA}.md` · `tests/offline/spec-answer-honesty/` · `tests/offline/spec-shapeA/`.

---

# VERDICT: **REQUEST-CHANGES**

**The safety gate passes cleanly and I re-derived it rather than inheriting it.** Nothing in this slice
can reach a real contact or mutate prod, and the tester's zero-egress evidence is sound by the *correct*
§0 method. The build quality is high — the offline suites, the mutation gates, the inverted m10, the
deployment tells and the honest UNRUN/UNRELIABLE reporting are all better than this pipeline's average.

I am nonetheless withholding approval, for four concrete and individually cheap reasons — one of which is
a **new, customer-visible artifact that this slice introduces and that neither touched node addresses**
(F1), plus two UAC obligations the families themselves mark as promote-blocking (F3, F4). None of these
requires a rebuild. The core migration is correct.

---

## A. Safety — PASS (re-derived from the exported JSON at `6656a1de`, not from the diff's claims)

| check | my finding |
|---|---|
| sendmsg callers | **9/9** → `aQUmwMVplmNcyUVc`, every one carrying `is_test`. Never `aoydkG1dbItXR5jXFEQsP` |
| **all** `executeWorkflow` targets | 6 distinct: `aQUmwMVplmNcyUVc`(9), `t4QvrtrPnTwRU6br`(6), `vUfFUDjLAuMaeQE6`(1), `wI5RkNGW3EOJfBdo`(1), `tWP33QOFT7SxThfT`(1), `tWm5DYLxfypmVC1T`(1). **Zero live sub IDs anywhere in the graph** |
| §0 S3 orphans | `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`, `save-session-vars` — all **inbound == 0**. The clone's *only* `respondio`-typed node is `update-human-intervened`, and it is orphaned |
| blast radius of the change | both touched nodes (`resolve-entity-http`, `compile-current-state`) sit on the read/render path; neither is on any egress or save path |
| S1/S2/S3 | egress logs `would_*` / `blocked` on all 16 fired executions; no escalation branch confirmed-taken |
| S4 | get-results → `t4QvrtrPnTwRU6br`, read-only response shape, no `crm_it_support_ticket_create` |
| S5 | `test_mode:true` self-verified per-execution against each case's own `test_run_id` |
| S7 | see below |

**On the S7b question raised in the brief.** The unsound, withdrawn instrument is **LLEN *equality*
before/after** (and, separately, consumer-execution *count*). The tester used neither. It used the
mandated replacement: the **per-poll LLEN depth series** *plus* the **per-poll pop payload**, across
**all 144** consumer executions covering `15:34:00Z–15:45:55Z`, individually fetched (3 transient
timeouts retried to success, 0 unretrievable), with the window demonstrably containing every case fire
(first 15:35:44Z, last 15:45:42Z) — i.e. it also satisfies the ~8-minute retention rule. Both
co-mandatory signals were recorded. That is a correct S7b. **PASS.**

*Minor (F8):* S7a was *measured* on one execution (SR-13 → sub-exec 12596917 → `tWm5DYLxfypmVC1T`,
`turn_id` self-verified) and *inferred* for the other 15 from the static wiring. I re-derived that static
property independently, so I accept it — but it is an inference and is recorded as one.

---

## B. Node-diff — PASS (with the caveat that the *delta* is attested, not re-derived)

The current clone bytes are exactly what the diff claims:

| node | leaf | sha256 | bytes |
|---|---|---|---|
| `resolve-entity-http` | `jsonBody` | `af7d38527e6b544c55ed1e04d457980d37924f8758fa5c36b0983b0bb369fb81` | 1157 |
| `compile-current-state` | `jsCode` | `9a8f141c473028d4054400049baf3f8d622525d616e7d558375fd8f10a0b2aee` | 56311 |

Key-set of the shipped `jsonBody` is exactly the 10 claimed keys. I confirmed by direct string search:
**`free_terms` absent, `user_goal` absent** — decision 3's strict reading is genuinely shipped, not just
asserted. `spec_fallback:true` / `understand_phrase:false` / `limit:15` intact.

I re-ran every offline gate myself rather than trusting the transcript:

- `spec-answer-honesty/probe.js` → **169 passed, 0 failed**, D1 `DEPLOYED (9a8f141c4730)`, D1b `DEPLOYED (af7d38527e6b)`.
- `spec-answer-honesty/mutate.sh` → **caught=29, survived=0, void=1**, and the stale-anchor selftest
  correctly reports **VOID** — the S9 instrument is itself instrumented. This is the thing that makes the
  100% score readable rather than suspicious.
- `spec-shapeA/probe.js` → **37 passed, 0 failed**; B5 correctly self-reports **SUPERSEDED** by shape
  rather than dying on a frozen sha.

**What I could not re-derive:** the "exactly two nodes differ vs `c97f2f8f`" claim. `c97f2f8f` is not in
the export's git history and I will not fetch prior workflow versions from the instance for a delta I can
establish another way. I accept it on three independent supports: the frozen `*.rev4.*` pre-slice bytes
match the recorded before-shas; D0d/D0e assert the after-bytes differ from those; and the tester's
post-run REST GET shows `updatedAt` (15:13:08Z) *predating* the first case fire (15:35:44Z), proving no
write landed during the pass. Combined with my own absolute containment sweep above — which is the
property that actually matters for safety and does not depend on any delta — this is sufficient.

---

## C. The two behaviour findings the tester escalated

### F1 — 🔴 **BLOCKER.** The customer's whole sentence is now rendered back as a search token

**This is the finding I am blocking on, and it was not in the tester's flagged list in this form.**

Because `query` is now the raw sentence, the CRM's query-keyed resolution comes back as a **third entry in
`resolutions[]` whose `token` is the entire customer message**. I confirmed this on the wire (exec
`12597847`): `resolutions[2].token == "SRTWC286 and wall hung basin"`, and every one of its rows carries
`display.via_token` set to the same full sentence.

At least one n8n renderer groups did-you-mean suggestions **by source token** (deliberately — see memory
`didyoumean-entity-retention`, so a pick replaces the right entity). It was written when tokens were short
entity raws. It now prints the customer's own question as a failed search term. SA-4's verbatim boundary
output (exec `12597815`):

```
"wall hung basin" — did you mean:
  1. BRBC2296-1 (WALL HUNG) - no SIRIM cert
  ...
"wall hung basin got SIRIM cert?" — did you mean:
  4. BRBC22137W-1 (WALL HUNG) - no SIRIM cert
```

The customer asked a question and is shown that question quoted back as something the system could not
find, heading a second, overlapping candidate list. This is new (pre-migration the group label was the
parser restatement, and on this shape the descriptive half produced no rows at all), customer-visible,
and lands on the **partial-miss did-you-mean path, which is one of the most frequently reached paths on
live**.

The tester recorded the shape and correctly declined to score it, calling it "a design question outside
this slice's scope". I disagree that it is out of scope: the slice is the *sole cause*, and the effect is
at the customer boundary. It needs either a fix (suppress or relabel the group whose token equals the
full query — the renderer already has `via_token` to key on) or an explicit, recorded decision by the
user that this wording ships. It must not promote unexamined.

### F2 — 🟠 MEDIUM. `_Matched on:` is whole-answer-scoped but spec-row-sourced

The N-1a block sources its keys from `_specRows` = `match_tier === 'spec_search' && _inAnswer(m)` — correct
and tightly written. But the sentence it emits is appended to the **whole** reply. On the newly-reachable
mixed shape (SA-5, exec `12597847`) the reply renders **15 rows** — 10 `product_code`-prefix rows and 5
`spec_search` rows — and closes with `_Matched on: mounting: Wall Hung._`. That is true of 5 rows and
false of 10; the 10 SRTWC286 rows are S-trap WCs that matched on code, not on mounting.

Substitute a spec that reads as a product attribute and the defect sharpens: *"SRTWC286 and 1.2mm sink"*
would close a mixed list with `_Matched on: thickness: 1.2mm._`, inviting the customer to believe the
SRTWC286 rows are 1.2mm. That is precisely the overclaim class the SR family exists to prevent (SR-1b).

The scoping weakness pre-exists in the renderer; **this slice is what makes it reachable.** Not a blocker
on its own — pre-slice the customer got strictly *less* (descriptive half silently dropped), so suppressing
the spec half again would be worse — but it needs a tracked follow-up and, ideally, a scope qualifier in
the rendered line.

### F6 — 🟢 LOW (documentation only). SA-5 is **not** a CRM contract breach — no ping needed

The brief asked me to determine from the wire body whether SA-5's merge is CRM-side or n8n-side. It is
**neither a breach nor a render bug**: it is the CRM's documented OR-append arm.

- The wire says so explicitly: `fallback_match_mode:"or"`, `fallback_reason:"AND-mode produced zero
  intersection; switched to OR-mode…"`.
- The conformance report §C-1 already splits the two arms: *"AND shape: `result["intersection"] =
  spec_matches` (`:1905`) — assignment, not extend"* vs *"**OR shape: one new resolution is appended**
  (`:1916`)"*. The CRM did exactly what its own source documents.
- The CRM returned **three separate, correctly-labelled per-token resolutions**. It merged nothing. The
  flattening into one answer list happens downstream in n8n.
- SR-9 already **SETTLED this shape as REACHABLE on 2026-08-13**.

SA.md's contract fact #1 (*"REPLACE, never merge … The renderer NEVER sees a mixed set"*) is a **per-arm
statement being carried in the file as if it were universal**. Its own vocabulary
(*"replace the partial intersection"*) scopes it to the AND partial-intersection path.

**Action: amend SA.md fact #1 with the scope qualifier. Do not open a CRM ticket.**

---

## D. Remaining findings

**F3 — 🔴 BLOCKER (UAC adherence). SA-7 is unasserted, and SA.md marks it *"required before promote"*.**
Its customer-boundary half rides along on SR-14/SR-3's input, but its load-bearing runData half —
*"intersection = spec_search rows only, **no code partials**"* — is claimed by no case the tester ran.
That is the single assertion that would have caught F1/F2's mixed shape on the AND arm. It is a clone
case; it does not need the blocked proxy. **Run it.**

**F4 — 🟠 BLOCKER-adjacent. The S1-C counterweight is unrun, and it is runnable on the clone.**
SA.md: *"S1-3 alone cannot see this: a bare code cannot trip the widened `_product_words_unanswered` arm,
so without S1-C a CRM that had started firing spec search on everything would pass."* SR-16 is a **bare
code** (`check stock SRTWC286`), so it inherits exactly that blindness — its clean tier census
(`match_tier: and`, zero `spec_search`, intersection 10) does discharge **SA-2**, but cannot discharge
S1-C. Critically, **this slice raises the risk S1-C guards**: the full sentence now feeds the deriver, so
over-firing is materially more likely than when `query` was a restatement. The counterweight phrase
(*"do you have stock for SRTWC286 please"*) can be fired as an ordinary clone case — the
`zz-crm-probe-spec-shapeA` block is not the reason it went unrun.

**F5 — 🟠 MEDIUM. Regression sweep is 4 of 5.** SR.md's DEV-3-widened sweep names *code parity (bare and
pasted-in-sentence, incl. U+2212), **order / customer / date** spot-checks, attachment + `domain_hint`,
AND-mode multi-token*. The tester ran order but **not customer, not date**. DEV-3 is the entire reason
the sweep exists (a sentence yields many more probe tokens through `_synthesize_alpha_tokens` than a
restatement did), so a two-thirds-complete spot-check on the one axis DEV-3 widened is not enough.

**F7 — 🟢 LOW. `_title` is contract-correct; the contract itself is convention-only.** Confirmed
contract-identical on lower_snake input (`wall_hung` → `Wall Hung`, live-verified) and the verbatim
exemption is real (SR-14b: `brand: BRAVAT`, not `Bravat` — a genuinely discriminating live-data proof
that closes the diff's own INCONCLUSIVE hedge). Lower-then-capitalise is the right call: the
uppercase-only first cut would have made the exemption unfalsifiable. **Residual:** for a *non-exempt*
key, a value that is not lower_snake gets its catalogue spelling rewritten (`SUS304` → `Sus304`). Per the
addendum the guarantee is a pytest over seeded rows, not a write-path validator, until **CRM #160** merges
(built, 0 of 55 live rows would fail). Track #160; do not widen `_VERBATIM_KEYS` speculatively.

**F9 — 🟢 LOW / accept. The wordless-turn UNRELIABLE leaves no material untested customer path.** The
tester's honesty here is correct and I accept the non-result. Assessing the routing question directly:
the shipped accessor falls back to `attachment.description` *before* `''`, so a captioned or
respond.io-described attachment still sends real text; and the parser routes genuinely contentless turns
to `message_type:'unknown'` → casual greeting **before** `resolve-entity-http` runs. The residual path
(reaches resolve, empty text **and** empty description) is narrow and **fails safe**: `JSON.stringify('')`
is valid JSON, no node error, and `tokens`/`allowed_entity_types` still carry the parser's entities.
U7-6/U7-8 pin it. No promote gate.

**F10 — 🟢 INFO (favourable). The UNRUN live-CRM probe is *not* a hard gate for deployment status.**
The brief asked me to decide. I confirmed **directly from the raw wire body** of exec `12597847` — not
from the tester's paraphrase — that `spec_asked:[{key,value}]`, `display.specifications` (values-only),
`matched_specs`, `preferred_specs:[]`, `unrecognized_terms:[]`, `spec_unmet:[]` and `floor_missed` are all
present. **CRM #142 is deployed on the endpoint the clone calls.** The deployment tell (`_Matched on your
description._`) did not fire on any case. That question is settled by live evidence and does not need
`s1-probe.js`. What the probe still uniquely covers is S1-C's contract-shape checks — which is F4, and F4
is discharge­able on the clone. **So: the probe is not a hard gate; F4 is.** The one-toggle fix
(`UYkE8VLZ8DzJa3TT` → Available in MCP) remains worth doing, but it should not hold the cycle.

**F11 — 🔴 STRUCTURAL / sequencing. Live is TWO packages behind, so this slice cannot promote alone.**
See §E.

---

## E. Sequencing — **this slice CANNOT promote alone; it promotes as ONE bundle with SA+SR**

Live `resolve-entity` @ `469e7259` is **886 B** and reads:

```
"query": "{{ $('Call 'sub-query-reformulator'').first().json.output.user_goal }}",
...
"fallback_to_all_types": true,
"limit": 15
```

There is **no `spec_fallback`, no `understand_phrase`** — live is at the *pre-shapeA* state. Live
`compile-current-state` is **36,983 B** against the clone's **56,311 B**: the ~19.3 KB gap is the entire
unpromoted SA+SR package plus this slice, stacked on the same two nodes.

Consequences, stated plainly:

1. **It must be one bundle.** Both packages live on the same two leaves; there is no way to write this
   slice's hunks to live without also landing SA+SR. The bundle therefore **inherits SA+SR's promote
   gates**, which is what makes F3 (SA-7, *"required before promote"*) and F4 (S1-C) binding rather than
   nice-to-have.
2. **One thing is simpler than the clone's history suggests:** live never carried the N-0 `free_terms`
   builder, so DEV-3's atomicity requirement is **automatically satisfied** and the "delete `free_terms`"
   hunk is **vacuous against live**. Live goes 886 B → 1157 B in a single write. There is no transitional
   raw-query-plus-free_terms state to avoid.
3. The bundle ships `spec_fallback:true` to live **for the first time**. That is the change with the
   widest blast radius in the whole package, and it is the one S1-C exists to counterweight.

---

## F. PROMOTE BODY SPEC

Target: **LIVE `9qVyfUxmRQqrpGRMDLRuz`**, current `versionId == activeVersionId == 469e7259`.
**Write path: MCP `update_workflow` + `publish_workflow` ONLY. REST PUT is FORBIDDEN** (it auto-publishes;
outage precedent). Target nodes **by NAME**. Strip trailing whitespace.

### Hunk 1 — node `resolve-entity` *(clone name: `resolve-entity-http`)*, leaf `parameters.jsonBody`

| | |
|---|---|
| live current sha256 | `51de7f16cf223c7dcc89485d629252c2524729df56735dae29b741d9e8a7da5f` (886 B) |
| target sha256 after write | `af7d38527e6b544c55ed1e04d457980d37924f8758fa5c36b0983b0bb369fb81` (1157 B) |
| method | **Block-copy of the clone's leaf is SAFE for this node** |

Block-copy is safe here — and this is the *only* leaf where I authorise it — because I verified the body
contains no harness scaffolding and both of its by-name reads exist on live:
`$('tf-message')` ✅ and `$("Call 'sub-query-reformulator'")` ✅.
**Abort the write if live's pre-write sha ≠ `51de7f16…`.**

### Hunk 2 — node `compile-current-state`, leaf `parameters.jsCode`

| | |
|---|---|
| live current sha256 | `3fa9d17071a81adacfdc573951bef81b249031cb153a68baadf6f709bfa98249` (36,983 B) |
| method | 🔴 **HUNKS-BY-NAME ONTO LIVE'S BODY. NEVER BLOCK-COPY THE CLONE'S.** |

**Concrete proof the block-copy would regress live**, as the brief warned:

- live `compile-current-state.js:524` → `` _lines.push(`"${token}": not found.`); ``
- clone `compile-current-state.js:847` → `` _lines.push(`"${token}" — not found.`); ``

Block-copying silently rewrites live's miss-line wording — a customer-boundary change with nothing to do
with this slice. The `diff` between the two bodies is **6 hunks / 434 changed lines**, dominated by
`@@ -206,33 +206,350 @@` (the N-1a/N-2/N-3 block). Apply the business-logic hunks onto **live's** body
and re-render; do not diff-and-replace wholesale.

**By-name read portability — verified, all 13 resolve on live:** `access-level-choice-message`,
`build-cs-member-offer`, `build-ideate-reply`, `build-suggest-offer`, `central-exchange`,
`crossdomain-zeroset`, `disallowed-entity-gate`, `escalate-catalog`, `get-session-vars`, `resolve-entity`,
`sorento-sub-respond-findcontact-respond`, `tf-message`, `validator`. (Note the clone body already reads
`$('resolve-entity')`, the *live* name — no rewrite needed.) None of the 35 clone-only harness nodes
(`fixture-*`, `replay-*`, `guard-*`, `sim-inject-*`, `mock-parser-output`, `parser-bypass-gate`, …) is
referenced by either promoted leaf.

### Rollback

**Republish `469e7259`.** Record it in the promote log before the first write.

---

## G. PROMOTE CHECKLIST (user-gated — I authorise nothing beyond this list)

**Blocking prerequisites — all four must clear first:**

- [ ] **F1** — decide and record the disposition of the full-query-as-token dym group label. Either fix
      the renderer (key on `via_token == query` to suppress/relabel the group) or obtain the user's
      explicit acceptance of the SA-4 wording. **Do not promote unexamined.**
- [ ] **F3** — run **SA-7** on the clone and assert its runData half (intersection = `spec_search` rows
      only, no code partials). SA.md marks it required before promote.
- [ ] **F4** — run the **S1-C counterweight** as a clone case (*"do you have stock for SRTWC286 please"*);
      assert the fully-covered code phrase still suppresses the spec fallback.
- [ ] **F5** — complete the regression sweep: **customer** and **date** spot-checks, envelopes taken from
      real executions (never `tests/cases/*.json` unverified).

**Then, at promote time:**

- [ ] Re-read `CLAUDE.md` + `docs/LESSONS.md`; run `export-workflows.py --verify` and require clean.
- [ ] **Re-diff at promote — do not trust this review's shas.** Confirm live is still `469e7259` and that
      `resolve-entity.jsonBody` is still `51de7f16…` / `compile-current-state.jsCode` still `3fa9d170…`.
      (Memory `stale-byte-identical-fork-claim`: a hash claim decays.) Any drift ⇒ stop and re-review.
- [ ] Confirm `versionId == activeVersionId` on live before touching it (memory
      `agent-death-leaves-active-mutated`), and again after publishing.
- [ ] **Back up first**: record `469e7259` as the rollback id in the promote log.
- [ ] Apply **Hunk 1** (block-copy permitted) and **Hunk 2** (hunks-by-name onto live's body only).
- [ ] Verify the promoted bodies contain **no** `is_test`, no `test_mode`, no fixture/replay/guard node
      references — i.e. no guard scaffolding rode along (memory `live-test-scaffolding-audit`).
- [ ] Confirm live's miss-line still reads `` `"${token}": not found.` `` after the write.
- [ ] `publish_workflow`; re-fetch and confirm `versionId == activeVersionId`.
- [ ] `export-workflows.py` (no `--verify`) to refresh the cache post-promote.
- [ ] Amend **SA.md fact #1** with the AND/OR arm scope qualifier (F6). File **F2** and **F7/CRM #160** as
      tracked follow-ups.
- [ ] Do **not** promote any sub in this cycle — this slice touches none.
- [ ] Never edit live mid-cycle. Never run the live spine as a test.

---

## H. What I explicitly did NOT do

Read-only review from the diff, the exported JSON, the run files and the offline suites. I ran the offline
suites locally and made **read-only** MCP calls (`get_execution` ×1, exports). I edited no workflow,
executed no workflow, promoted nothing, and never touched `9qVyfUxmRQqrpGRMDLRuz`. Promotion remains
user-gated.
