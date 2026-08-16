# REVIEW: `tool-loop-removal` — **APPROVE**

Date 2026-08-03. Reviewed clone `txiPzSxy3Pclsz6v` @ **`1bfc2124-8afa-48e1-ad95-2bfa86b00e02`**
(`versionId == activeVersionId`, `updatedAt 2026-08-03T15:34:24.315Z`, 138 nodes / 176 edges) against live
spine `9qVyfUxmRQqrpGRMDLRuz` @ **`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`** (`versionId == activeVersionId`,
`updatedAt 2026-08-02T23:34:18Z`, 101 nodes / 130 edges, draft-vs-active param diff **empty**, connections
draft == active, `Split Out1` + `Loop Over Items` **still present** ⇒ untouched).

**Everything below was re-derived from the deployed graphs and real executions.** Reports (plan, diff, run
log, P-BASE) were used only to know *what to check*. Sources: MCP `get_workflow_details` on the clone, live,
`rysSPgUssLDf6xJc` and `Fss5aAaXthJSWpZCgKiKR`; the pre-change REST backup
`backups/clone-txiPzSxy3Pclsz6v-preTL-20260803-before.json` (`6d479172`); MCP `get_execution` on
`11079398`, `11079433`, `11079727`, `11067219`, `11083242`, `11083256`, `11083629`, `11083638`, `11083744`;
and local execution of the **deployed** `tool-filter` bytes against 22 adversarial inputs.

**Verdict: APPROVE.** Zero egress re-confirmed. The miss-path join is correct and the instrument that guards
it has been shown RED under a real published fault. Twelve corrections are recorded below — **none blocks
promote**; six of them must be carried into the promote checklist or the promoted artifact will be wrong.

---

## 1. §0 ZERO EGRESS — PASS (re-derived from the deployed clone JSON, not from any report)

| gate | instrument | result |
|---|---|---|
| **S1** no real WhatsApp/comment send | `send-message-files`, `send-message-images`, `send-message-video` each have **0 inbound edges** in the deployed connection map (176 edges enumerated, 0 dangling endpoints). Zero-inbound set is **identical to pre-change** — no node newly starved, none newly fed | ✅ |
| **S1b** sendmsg callers | exactly **8** `executeWorkflow` sendmsg callers, **all** → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), **all** with `is_test: true` in `workflowInputs.value`. Never live `aoydkG1dbItXR5jXFEQsP`. Empirically confirmed on execs `11079398`/`11079727`/`11083744`: payload carries `is_test:true`, sub-exec lands in `ublq9nSlrpz63xan` | ✅ |
| **S2** no assignment / SLA / PIC write | `update-human-intervened` (`respondio` node type) **0 inbound**. Human-intervention caller → guarded fork `vUfFUDjLAuMaeQE6` with `is_test:true` | ✅ |
| **S3** no CRM/contact write | `save-session-vars` (the prod conversation-variables `PUT`) **0 inbound**. The only non-GET HTTP nodes with inbound are `get-presigned-url`, `resolve-entity-*`, `check-access-http`, `ideate-turn-http` — all pre-existing, none touched, byte-unchanged | ✅ |
| **S3b** DB | node-type census vs pre-change differs **only** by `splitInBatches 2→1` and `splitOut 2→1`. **Zero nodes added.** The 3 postgres nodes are the same 3 (`pg-get-session`, `pg-upsert-session`, `log-incoming-chat-history-n8ntest`), on `n8n_test-db` `Dnnofg8Xb27VQOhI` per the pre-change REST census | ✅ (caveat R10) |
| **S4** never a write tool | resolved tool measured **at the correct place** (see R3): the get-results sub-execution's trigger output. Healthy runs resolve real read tools; `crm_it_support_ticket_create` never appears. **This is an assertion on observed data, not a guarantee** — see R-F-B | ✅ |
| **S5** `is_test` provably present | `is_test` mention census unchanged at **11** nodes pre vs post; guards fired (`would_log`/`would_send`/`would_write`) on every `uac` run | ✅ |
| **S6** token sinks | zero LLM nodes added. Parent LLM runs 0 on 47/48; the one clarification run is the expected `Basic LLM Chain` path | ✅ |
| **S8** logger sinked | `Call 'sub-respond-save-message-redis'2` → fork `tWm5DYLxfypmVC1T`, not live `UrETd-…`. The unsound LLEN gate is correctly **not** claimed (LESSONS §45) | ✅ |

**Machine diff, pre-change (`6d479172`) → deployed (`1bfc2124`), exhaustive:** nodes removed `{Split Out1,
Loop Over Items}`; nodes added **none**; `parameters` changed on **exactly 2** nodes (`tool-filter`,
`build-suggest-offer`); non-parameter properties changed on **exactly 1** (`crossdomain-probe.executeOnce`
`true` → key absent); **zero position changes**; `settings` identical; 176 vs 179 edges = the 5 planned cuts
and 2 planned adds, nothing else. **No new egress surface exists, structurally.**

**Verdict: the change cannot cause real egress.** Reads only.

---

## 2. THE MISS-PATH JOIN — PASS, and the instrument has been shown RED

Deployed edge sets, enumerated (population: 176 edges, 124 connection source keys, 0 dangling):

```
If6.main[0] == [central-exchange[0]]
If6.main[1] == [Aggregate1[0]]            ← exactly one target ✅
Aggregate1            IN == {If6[1]}                                   exactly ✅
not-found-error-message IN == {Aggregate1[0], If-incoming-picker[1]}    exactly ✅
tool-filter           OUT == [replay-get-results[0]]                   exactly one target ✅
no `connections` key survives for either deleted node; no node's parameters mention either name
`Loop Over Items1` PRESENT (8 inbound, media/attachment path) — untouched
zero `$runIndex`, zero `$('Split Out1')`, `$('Loop Over Items')`, `$('Aggregate1')`, `$('tool-filter')` refs
```

Nothing else fed or consumed the loop: pre-change `Split Out1` IN = `{tool-filter[0]}`; `Loop Over Items`
IN = `{Split Out1[0], If6[1]}`, OUT = `{Aggregate1[0], replay-get-results[0]}`; `Aggregate1` IN =
`{Loop Over Items[0]}`. Complete — the census in plan §3.1/§3.2 is correct on both workflows.

**Runtime, measured (§TL-M1 exec `11079398`, §TL-M2 exec `11079433`, post-revert `11083744`):**
`Aggregate1` 1 run sourced from `If6` output **1** run 0, output `json == {"response_intro":["No matching
results found."]}`, `pairedItem == [{"item":0}]`; `not-found-error-message` 1 run with non-empty
`escalate_message` + `is_clarification` + `found_summary`; `central-exchange` absent;
`sorento-sub-respond-sendmsg-respond2` exactly 1 run.

### §TL-AGG — PASS, and stronger than the plan predicted
Pre-change exec `11067219` is still retrievable and I read it directly: `Aggregate1` output `json` ==
`{"response_intro":["No matching results found."]}`, `pairedItem` == `[{"item":0}]` — **the anticipated
`pairedItem` divergence does not exist**, because `Aggregate` normalises it. The loop's own run-1 item did
carry `{sourceOverwrite:{previousNode:"If6",…},item:0}`, and `contextData["node:Loop Over Items"]` shows
`noItemsLeft:true, done:true` — plan §3.3's reading of `splitInBatches` v3 semantics is confirmed.

### §TL-M-BYTE — PASS, verified without using anyone's hash
I compared the **literal strings**, not the digests. Pre-change `11067219` and post-change `11079433`
`crossdomain-compose.user_response` are **identical, 906 characters**, including the em-dashes and the
blank-line structure; the `variables` block matches too (same `last_result_set`, `dym_offer:null`,
`selection_context:"suggest_offer"`). Post-revert `11083744` reproduces §TL-M1 exactly. The P-BASE markdown
transcription is faithful to the execution (verified programmatically).

**On the hash question (R4):** the P-BASE digests are `sha256(user_response + "\n")` —
`a138e89b…fe6a6` = M1 text + `\n`, `f5b200cd…1092` = M2 text + `\n`; the raw-text digests are
`98fb8731…` / `2b8da26d…`. The trailing newline is a **constant capture artifact of the shell method**, not
part of the message. It is applied identically on both sides, so the gate is sound and fully
discriminating — any single-byte change in `user_response` changes the digest. No action needed beyond
recording the convention.

---

## 3. `tool-filter` — PASS. Comparator is total and deterministic; arity is structural

Deployed body read from MCP: `sha256 = bffb4c3a40d4fa053756114e938b37722574acb72e09f0c54f79e83490dfdd0c`,
2453 chars / 2528 bytes / 59 lines, `parameters` keys == `['jsCode']` only (⇒ default *Run Once for All
Items*), no node-level props, **zero lines with trailing whitespace**, `node --check` OK when wrapped.
Sidecar `tests/diffs/tool-loop-removal.tool-filter.after.js` == deployed bytes (file adds one trailing `\n`).

**I executed the deployed bytes against 22 inputs.** Every case returned an array; **every non-empty input
returned exactly 1 item; every empty/absent input returned 0.**

| input | items | picked | ruling |
|---|---|---|---|
| 1 tool | 1 | it | ✅ |
| **A@0.9, B@0.8, C@0.95 (§TL-FP3)** | **1** | **C** | ✅ sort is real; `tools[0]` would be A |
| real 2-tool inventory pair | 1 | `stock_balance_list` | ✅ `warehouses_list` in `rejected[]` |
| **50 tools** | **1** | `t49` (max) | ✅ arity independent of registry size |
| `[]`, `undefined`, `null`, `[null]` | 0 | — | ✅ §TL-EMPTY equivalence preserved |
| tie `zzz`/`aaa` @0.5 | 1 | `aaa` | ✅ name-ASC tiebreak |
| both `similarity` missing | 1 | `aaa` | ✅ deterministic |
| non-numeric vs 0.1 | 1 | the numeric | ✅ |
| `-Infinity` both / `NaN` both | 1 | name-ASC | ✅ **no NaN comparator, no throw** |
| gate `undefined` / non-array / **throws** | 1 | the tool, `has_product:null` | ✅ tolerant read works |
| duplicate identical entries | 1 | first | ✅ stable |

**The comparator is total.** `score()` never returns `NaN` (it maps non-finite to `-Infinity`), `label()`
never returns non-string, so `cmp` never sees `NaN` and never returns `NaN`. `cmp(-Infinity, -Infinity) ===
0` — the coder's rejection of subtraction (`-Inf − -Inf = NaN`) is **correct and load-bearing**. `<`/`>` on
strings is UTF-16 code-unit order, locale-independent — the rejection of `localeCompare` is **correct**.
Equal score *and* equal label → 0 → V8's stable sort preserves input order. Deterministic for every input.

**Arity is structural, not data-dependent.** `return [{ json: … }]` is a one-element array literal in
run-once-for-all-items mode; n8n cannot fan out a single item. This is a property of the bytes I executed,
which are sha-identical to the bytes the 36 executions ran.

**Flat-item interface:** `.name` is top level (`{...best, _tool_pick}`), so live's `tool: "={{ $json.name }} "`
resolves — confirmed on `11079398`/`11079727`/`11083744`.

**`_tool_pick` containment verified structurally:** `Call 'sub-get-results'` uses
`workflowInputs.mappingMode: "defineBelow"` with **exactly 5 keys** (`tool`, `contact_id`, `user_prompt`,
`entities`, `semantic_input`) and a 5-id schema; and **no node in the clone** references `_tool_pick` or
`$('tool-filter')`. The diagnostic cannot reach any session write. D8 is safe (contrast crossdomain F2).

---

## 4. Ruling on the two coder deviations

### 4.1 `_tool_pick.has_product` (4th key, not in plan D8) — **KEEP**
It is namespaced under `_tool_pick`, structurally contained (§3 above), and it is precisely what makes D10's
retained `compatible_entities` read non-dead. Dropping it recreates the computed-and-discarded read that D10
exists to delete. **Do not change it.** §TL-1's assertion is unaffected: `chosen`, `rejected[]`, `count` are
all present with unchanged meaning. Update plan D8 / UAC §TL-1 to name four keys.
*Cosmetic nit:* `-Infinity` serialises to JSON `null`, so `rejected[].similarity: null` cannot be
distinguished from a genuine `null`. Harmless in a diagnostic.

### 4.2 The old body's implicit throw is gone — **ACCEPT, RR5 closed by acceptance**
This is what plan §3.7/RR5 asked for, it is declared in the diff rather than silent, and **no caller depends
on the failure**:
- `tool-filter`'s only inbound is `Execute 'sub-get-rag'`, reachable only from `If3` out1, which is
  downstream of `disallowed-entity-gate` — so the throw was already unreachable on the real path
  (`disallowed-entity-gate` always runs first).
- The widened branch writes only to `_tool_pick.has_product`, which **nothing reads** (verified). It cannot
  change routing, the resolved tool, or any payload that reaches a customer or a write.
- The tool `name` still comes from RAG, never from the gate — so removing the throw creates **no new
  silent-wrong-answer path**. Its only historical effect would have been to convert a would-be-undefined
  read into a hard failure, i.e. a *louder* dead-end than the one D11 deliberately preserves.

---

## 5. Adversarial audit of the orchestrator's fail-on-purpose work

I re-verified FP1 and FP2 from the executions, not from the appended sections. Both PASS. Three corrections.

### FP1 — **PASS, and the mutation-deployment question answers itself**
Exec `11083256` (M1) and `11083280` (M2), status `success`, `resultData.error` none. On `11083256` I read:
`If6.main[1]` **emitted an item** (the full validator envelope, with `_xdBlock` populated) while
`runData['Aggregate1']`, `runData['not-found-error-message']`, `runData['compile-current-state']` and
`runData['sorento-sub-respond-sendmsg-respond2']` are all **ABSENT**.

That state is **impossible on the healthy graph** — `If6.main[1] → Aggregate1[0]` is a wired edge there.
So the mutation was demonstrably in effect at run time, proven by behaviour rather than by a versionId
lookup, which is the stronger form. **P-CLONE is satisfied by evidence.** Worth noting the *timing*
discipline was thin: the discard run started 15:29:45 and the scored M1 at 15:29:50 — five seconds. Only the
behavioural self-proof rescues it. Prefer a ≥1-minute gap next time; do not rely on it here.

**→ R1 (correction, strike the claim): the FP1 "negative control" is not evidence.** The run log offers
`11083242` as "the discarded happy-path run had `compile-current-state` and `sendmsg2` PRESENT under the same
mutation — so the unwired edge killed only the miss path". I read it: its `test_run_id` is literally
**`fp1-discard`**, and it is a happy-path turn (`If6` took out0 via `crossdomain-gate[1]`). A happy turn
**never traverses `If6.main[1]`**, so its greenness is guaranteed by topology whether the edge is wired or
not. It is the exact `green-that-cannot-fail` shape, and it is simultaneously the run the suite's own
P-CLONE rule says must be discarded. **Strike it.** The FP1 core observation stands entirely on its own.

### FP2 — **PASS, and the retraction was right; here is the instrument that actually works**
Exec `11083629`, status `success`. `tool-filter` emitted `{"tools":[{"name":"crm_inventory_stock_balance_list",
"similarity":0.4812}]}` — the wrapper shape, **no top-level `name`**. Impossible on the deployed body ⇒ the
mutation was deployed. `Call 'sub-get-results'` ran once and returned `has_result:false`; the customer reply
was `Here's what you want: • product: SRTWT5800 (+3 more) … But no inventory matched these. Would you like me
to escalate to warehouse team?` — a **plausible, confidently-worded, completely wrong** answer for a product
holding 564 pcs across 6 locations (confirmed from healthy exec `11079727`), on a green execution. LESSONS
§61a, exactly. Discriminating.

The orchestrator's own retraction (get-results **output** `.tool` reads empty on the healthy build too) is
correct — I confirmed the output envelope has no `tool` key at all.

**→ R3 (upgrade): §TL-FP2's literal MUST-observe *is* measurable, and I discharged it.** The resolved input
lives on the sub-execution's trigger node. Sub-exec **`11083638`** on `rysSPgUssLDf6xJc`:
`When Executed by Another Workflow` output `"tool": " "` (empty + the expression's trailing space), and
`MCP Client1` returned `{"content":[{"type":"text","text":"Unknown tool: "}]}`. **Adopt
`runData["When Executed by Another Workflow"][0].data.main[0][0].json.tool` on the get-results
sub-execution as the standing §0 S4 instrument** — it is the exact string dispatched to the MCP endpoint,
which is what S4 is about, and it is discriminating in both directions.

### Reverts — **0-diff confirmed, from the deployed graph**
The deployed clone at `1bfc2124` differs from the pre-change backup `6d479172` in **exactly** the three
intended places, with `tool-filter` at the coder's claimed post-change sha `bffb4c3a…`,
`build-suggest-offer` at `40df90a3…`, `If6.main[1] == [Aggregate1[0]]`, `crossdomain-probe.executeOnce`
absent, and **draft == active** (params, full node objects including `executeOnce`, and connections).
Nothing from either mutation survives, and nothing else was left behind. `1bfc2124` is content-identical to
the reviewed `cb4dffdb` for every element the diff doc pinned, and my pre-change diff closes the rest.

---

## 6. Green-that-cannot-fail — my own ledger

**Real evidence (would have gone red):**
1. **§TL-M-BYTE** — same clone, same two messages, pre vs post, 906-character literal-string equality. The
   single strongest artifact in the cycle.
2. **§TL-FP1** — a published fault, a *miss* turn, `Aggregate1`/`not-found` absent with `status: success` and
   no reply at all. This is what makes the 15 miss greens mean something.
3. **§TL-FP2** — a published fault producing a wrong answer on a green execution; and now the direct
   `tool == " "` measurement (R3).
4. **§TL-S1.4/5a/5b** — keys on the exact edge whose absence is the catastrophe, shown red against synthetic
   mutations by the coder and independently re-derived by me from the deployed connection map with the
   compared population (176 edges) stated.
5. **§TL-FP3-by-deployed-bytes** — 3 tools ⇒ 1 item and it is **C**; 50 tools ⇒ 1 item. `tools[0]` would have
   given A / `t0`. Re-run by me against the sha-matched deployed body.
6. **§TL-RS** (`11080185`) — six named nodes absent while the same checker reports them present elsewhere.
7. **§TL-DYM / X8** — a wrong pick would have surfaced a different product code.
8. **X6's HI sub-execution** — 3 nodes only; a real assign would have added many.
9. **§TL-AGG's pre-change leg** — I read exec `11067219` directly, so the equality is measured across builds
   on the same clone, not transcribed.

**Weak / data-inert — I agree with the tester's own audit and add one:**
- **The per-domain arity block (§TL-1…7, §TL-R12's 36 executions) is data-inert.** `_tool_pick.count == 1`
  everywhere because RAG returns one tool for every domain today. A build with the old loop produces the
  same 1-read/1-send counts. These greens are corroboration, not proof. **The arity claim rests on
  §TL-S2 (structural read) + the deployed-bytes proof, both of which I re-derived.** That is sufficient —
  see §7.
- **§TL-AGG cannot separate its two hypotheses.** It proves 1-tool post == 1-tool pre. It does *not* prove
  the 2-element→1-element transition is invisible; the only 2-element measurement (`11049139`) is a
  different build. The "nothing consumes `response_intro`" claim rests on code reading (which I confirmed:
  zero consumers on live and clone) plus that cross-build datapoint. Accept as **argued, not measured**.
- **§TL-X-T3 / T4 are non-discriminating as observations** — P-BASE also shows 1 probe run. What actually
  closes crossdomain F3/F4 is the structural fact that no `splitInBatches` remains on that path, which I
  verified (the sole remaining one is `Loop Over Items1`, on the media path).
- **§TL-ACC-noaccess** short-circuits at `If5`; zero diagnostic value for this change.
- **§TL-R2's "byte-identical to live"** is a template-line comparison across different product codes.
  §TL-M-BYTE is the real gate; R2 should be recorded as wording-only.
- **§TL-CLR** was proven with `hi` (casual), not a vague business mash. It proves the LLM branch and the
  subgraph bypass; it does not prove clarification of a vague query.
- **R1 above** — the FP1 negative control.

---

## 7. §TL-FP3 (not run in n8n) — **RULING: does not block promote**

The property FP3 exists to prove is *"the arity is enforced by code, not by the index."* That is a property
of the node body, and the body I executed is **sha-identical to the deployed node** (`bffb4c3a…`, read from
MCP, matching the node the 36 executions ran). I re-ran it myself: 3 tools ⇒ 1 item ⇒ **C**; 50 tools ⇒ 1
item; `[]`/`undefined`/`null` ⇒ 0 items.

What the in-n8n pin run would add is confirmation that the n8n runtime does not turn a one-element return
into more than one item. It cannot: `parameters` has no `mode` key ⇒ run-once-for-all-items, and n8n has no
mechanism to fan out a single item. The runtime cannot violate the property being asserted, so the pin run
is **corroboration of something structurally guaranteed**, not the load-bearing evidence.

Because plan §8 **P3** demands all three FP cases red-then-reverted, I am explicitly overriding that line
for FP3 and owning the ruling. Two conditions:
1. **§TL-FP3 stays OWED** as its own scoped task (`prepare_test_pin_data` → `test_workflow`), tracked, not
   silently closed.
2. **The live-side substitute is already the right one:** the plan's rollback trigger *"any turn where
   `sorento-sub-respond-sendmsg-respond2` has ≥2 runs"* is the production instrument for a real 2-item
   event. Keep it in the checklist and actually watch it (see §10).

---

## 8. Tester findings — severity and promote impact

| # | finding | my ruling |
|---|---|---|
| **F-A** | if summed similarity ranks `warehouses_list` above `stock_balance_list`, the sort deterministically picks the wrong tool with no second iteration | **REAL, but the causal claim is wrong in one direction — corrected below (R6). Narrower than stated. MEDIUM latent, does not block.** |
| **F-B** | `sub-get-results`' AI Agent is orphaned ⇒ 0-token deterministic read; §0 **S4 has no allowlist anywhere**; `MCP Client1.tool` is the `tool-filter` string forwarded verbatim | **CONFIRMED, and it is worse in reach than stated — see R7. Pre-existing. This change NARROWS the surface from ≤5 names/turn to exactly 1, so it improves S4. Does not block.** Adopt the R3 instrument; log the missing allowlist as its own backlog item against `sub-get-results`. |
| **F-C** | the 1-tool premise became true on live *by data*, mid-day (2 tools @11:01:39Z → 1 tool @13:02:52Z) | **CONFIRMED as the reason the code enforcement matters.** P1 is satisfied but by mutable state. Re-read the newest live inventory execution immediately before publishing (read-only). Does not block. |
| **F-D** | §TL-CONT domain continuity failed (`how about X` classified `master_products`) | **Structurally unattributable to this change** — the entire splice is downstream of `Call 'sub-query-reformulator'`, a separate workflow this diff does not touch. Matches memory `backlog-bare-code-domain-carry`. Does not block; keep it filed there. |
| **F-E** | contact `437264483`'s **prod** conversation-variables row is stale-contaminated and `uac` mode reads it ⇒ non-domain-decisive messages return plausible green answers to the wrong question (corrupted 3 early runs) | **REAL and the most valuable process finding in the cycle.** It does not invalidate any scored case — all three affected runs were superseded and recorded. **Does not block this promote, but it must go into `docs/LESSONS.md` §31 and the driver preconditions**, because it manufactures exactly the confident-green this pipeline is built to defeat. |
| **F-F** | CLAUDE.md says 3 get-results callers on the clone; there are 4 | **CONFIRMED** (`crossdomain-probe` is the 4th). Docs fix, see R11. |
| §TL-M6 / §TL-M7 | UNREACHABLE | **ACCEPT as unreachable, not as passed.** Both carry attempts plus a structural argument. The miss path is proven on 5 domains, 9 bonus miss executions and FP1 — coverage is adequate without them. Does not block. |
| §TL-ACC-partial | BLOCKED on P-CONTACT | **ACCEPT.** The access branch never reaches the splice — `§TL-ACC-noaccess` (`11080890`) shows `tool-filter` absent entirely. Does not block. |
| §TL-EMPTY | end-to-end unmeasured | **ACCEPT.** Code-level equivalence is proven (I verified `[]` on `[]`/`undefined`/`null`/`[null]`). The pre-existing silent dead-end is preserved, not created. Keep as backlog; pair it with the FP3 pin task since both need the same tooling. |
| §0 egress log unread on 9 chat turns | weaker instrument | **ACCEPT.** S1/S3 on this clone are structural (0 inbound, re-derived by me), and the HI sub-execution was inspected node-by-node. Record the gap. |

---

## 9. Corrections that must be carried forward

**R1** — Strike the FP1 "negative control" (`11083242`). Non-discriminating; it is the `fp1-discard` run and
a happy-path turn cannot traverse `If6.main[1]`.

**R2** — Record that FP1/FP2 mutation-deployment is proven **behaviourally** (impossible-on-healthy-graph
observations), not by version pointers. The 5-second discard gap was too thin to have carried the claim alone.

**R3** — §TL-FP2's "resolved tool is undefined/empty" **was** measurable and is now discharged: sub-exec
`11083638` trigger output `"tool": " "`, `MCP Client1` → `Unknown tool: `. Adopt this as the standing S4
instrument in UAC §0.

**R4** — P-BASE digests are `sha256(user_response + "\n")`. Constant suffix, applied to both sides; the gate
is sound. Document the convention in `tests/UAC.md` so a future comparison uses the same method. (I also did
the literal-string comparison, which removes the method from the trust chain entirely.)

**R5** — Diff doc §2.3 overstates one invariant. *"non-numeric / missing `similarity` scores as `-Infinity`
⇒ a malformed entry can never win"* is **false for values that coerce to 0**, because `Number(null) === 0`
(same for `''`, `false`, `[]`). Measured: `{similarity:null}` beats `{similarity:-0.5}`. Empirically inert —
every observed real score is 0.32–0.51, i.e. > 0 — but it is a **data-dependent** claim presented as
structural. Either soften the wording or make it structural with one token:
`const n = (t && t.similarity) == null ? NaN : Number(t.similarity);`. Not a blocker; do **not** re-open the
build for it alone.

**R6** — **F-A's mechanism is wrong in one direction, and the residual risk is narrower.** The evidence doc
establishes that pre-change the loop took a second iteration on only **12 of 135** inventory turns —
precisely the turns where the first tool returned nothing (`validator` runs 1 on 123, 2 on 12). Since the
loop's only back-edge is `If6 out1` (no result), a flipped ranking where `warehouses_list` **returns rows**
would pre-change have answered from `warehouses_list` and **never tried** `stock_balance_list` — same wrong
answer, no fallback, before this change. The delta this change actually introduces is therefore exactly:

> **the recovery is lost only when the top-ranked tool returns ZERO rows** — then a product that has stock
> gets a miss reply instead of being rescued by the second tool.

That is a genuine MEDIUM latent risk (and the right severity), but the "wrong answer with no fallback"
framing overstates it. Correct F-A in the run log and plan RR3 to this wording. The real fix (max instead of
sum in `sub-get-rag`) remains correctly out of scope; `_tool_pick.rejected[]` is now the detector.

**R7** — **Plan §6 claim #2 is WRONG. P0's severity is different from what the plan records.** I fetched both
workflows and normalised them:

| | `rysSPgUssLDf6xJc` (`sub-get-results TEST`) | `Fss5aAaXthJSWpZCgKiKR` (`sub-get-results`) |
|---|---|---|
| versionId == activeVersionId | `356c1651`, updated **2026-08-03T03:47:15Z** | `47053482`, updated 2026-08-02T13:18:17Z |
| nodes / node-name set | 8 / identical | 8 / identical |
| `connections` | **identical** | **identical** |
| `parameters` on all 8 nodes | **identical** | **identical** |
| `output-structurer` `jsCode` | sha `0cb6ebdc…`, 4339 chars, carries `PENDING ALLOCATION` + `partially_allocated` | **same sha, same chars, same alloc-badge code** |
| MCP endpoint | `http://72.62.195.20:8765/mcp` on both clients | same |
| `AI Agent` main inbound | **none** (orphaned) | **none** (orphaned) |
| only differences | `MCP Client1.retryOnFail: true`; `settings.binaryMode: "separate"` | — |

Consequences, all recorded and **not** to be fixed here:
- The plan's *"the alloc-badge Phase C promote onto `Fss5aAaXthJSWpZCgKiKR` is inert on production's main
  path"* is **wrong**. The alloc-badge code is present on the fork production actually calls. Memory
  `alloc-badge-phase-c` was right; plan §6 point 2 must be corrected.
- **F-B is a property of live production, not of the harness fork.** The AI Agent is orphaned on
  `Fss5aAaXthJSWpZCgKiKR` too, and `MCP Client1.tool` forwards the caller's string verbatim on both. So
  "get-results is a 0-token deterministic read with no tool allowlist" describes production regardless of
  which get-results the spine calls.
- The live hazard stands as the user framed it: a "harness-only" edit to `rysSPgUssLDf6xJc` **is an ungated
  live change to production's main CRM read path**. Separate, user-gated. **Must not be bundled into this
  promote and must not be silently corrected in the diff.** The `retryOnFail` delta is the concrete proof
  that the two have already diverged once.

**R8** — Diff doc §1.6's "positions deliberately not touched" is **verified**: zero position deltas.

**R9** — MCP `get_workflow_details` returns **no `pinData` and no `staticData`**, so the diff doc's
"`pinData` identical / `staticData` identical" claims are **not independently verifiable from MCP**. The
pre-change REST backup carries `pinData` on `Schedule Trigger` (no such node exists ⇒ inert) and on
`When Executed by Another Workflow`. Risk direction is stale data on a *manual* run, not egress. Recorded as
a bounded gap; a REST GET would close it.

**R10** — MCP **redacts credentials on read** (LESSONS §47/§55), so I could not re-verify 28/28 post-PUT.
The **sound** substitutes, both of which I did: (i) node-**type** census unchanged except the two deleted
nodes, and **zero nodes added** ⇒ no new credentialed node can exist; (ii) 36 executions performed real CRM
reads and 3 postgres writes to `n8n_test` successfully ⇒ positive evidence the CRM/PG bindings survived (a
dropped credential fails the read loudly). Note the asymmetry: a dropped credential breaks a read; a newly
bound **prod** credential would require a node addition or an `httpHeaderAuth` binding MCP cannot perform.

**R11** — CLAUDE.md fixes (docs only): get-results callers on the clone = **4** (`crossdomain-probe` is the
4th); and the bullet claiming the clone's `Call 'sub-query-reformulator'` calls live `XTODTw-dJcV0uRdC056hG`
contradicts the table below it — the deployed clone calls fork **`wI5RkNGW3EOJfBdo`** (verified today).

**R12** — Plan §5's clone node-id for `tool-filter` is wrong (`5c40413a` is **live's**; clone's is
`e1d1d545`). Confirmed. Harmless here because everything was targeted by name, but a promote trusting that
table aborts. Diff doc §9.1 already flags it; make sure the promoter reads §9.1 and not plan §5.

---

## 10. Scope / tier — CORRECT

`deterministic` is right: Code bodies + connections + one node-level property removal. Zero nodes added, zero
credentialed nodes, zero LLM nodes, no parser edit — verified from the type census. The tester actually ran
the **parser** tier on every case (real reformulator each turn); that is a declared *superset*, required for
§TL-M-BYTE/§TL-AGG comparability with P-BASE, and it does not weaken any assertion. §0 S6 is about *parent*
LLM node runs and holds (0 on 47/48; 1 expected clarification run).

---

# PROMOTE CHECKLIST (user-gated — do NOT promote unprompted)

## Prerequisites

- [ ] **P0 — record, do not fix, do not bundle.** Live `Call 'sub-get-results'` **and** `probe-incoming` →
      `rysSPgUssLDf6xJc`; `sibling-probe` → `Fss5aAaXthJSWpZCgKiKR`. Verified in live's published
      `activeVersion a40cd16d` and in `backups/live-spine-…-a40cd16d-20260803.json`. **It will appear in the
      `diff live ↔ target`; leave it exactly as found.** Attach R7 (the fork is functionally identical to
      live get-results, alloc-badge included, differing only in `MCP Client1.retryOnFail` and
      `settings.binaryMode`) so the user decides on the real facts.
- [ ] **P1** — re-read the newest live `inventory` execution (read-only `get_execution`) and confirm
      `tool-filter` emitted `tools.length === 1`. Satisfied as of exec `11070316` @13:02:52Z, but by mutable
      registry state (F-C). Re-check immediately before publishing.
- [ ] **P2** — re-run the draft-vs-active gate on **both** workflows immediately before publish
      (LESSONS §23/§24). Verified clean today: live `a40cd16d` params diff empty + connections draft ==
      active; clone `1bfc2124` params diff empty + full-node diff empty + connections identical.
- [ ] **P3** — §TL green with exec ids ✅; **§TL-FP1 ✅ RED-then-reverted, §TL-FP2 ✅ RED-then-reverted,
      §TL-FP3 ⛔ NOT RUN in n8n — waived per §7 of this review**, on the deployed-bytes proof + the structural
      run-once argument. **FP3 remains an owed task**; file it with §TL-EMPTY (same tooling).
- [ ] **P4** — the USER adds `mcp__n8n-mcp__update_workflow` + `publish_workflow` allow-rules; the assistant
      cannot self-grant (LESSONS §58a). `sorento-coder` is barred from live.
- [ ] Fresh REST GET backup of live → `backups/`; record rollback pointer
      **`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`**; re-verify the on-disk backup still matches.

## Strip the guard scaffolding — what must NOT cross into live

- [ ] **`replay-get-results` / `fixture-get-results` are clone-only.** Live wires `tool-filter` **straight to
      `Call 'sub-get-results'`**. Confirmed: neither node exists on live.
- [ ] **`crossdomain-probe.executeOnce` removal is NOT PROMOTABLE.** `crossdomain-probe` does not exist on
      live (no `crossdomain*` node does). A promote built from "the clone's delta" would attempt it and
      abort. **Exclude it explicitly.**
- [ ] **Never copy `is_test`.** Live currently carries no `is_test` *value* anywhere (verified: the only two
      matches are `workflowInputs.schema` field declarations). This diff adds none — keep it that way
      (LESSONS §48a).
- [ ] **Never copy any `workflowId`** (P0), and never copy the clone's **orphaned** egress wiring: on live
      all five are wired (`send-message-{images,video,files}` ← `Switch[0/1/2]`, `update-human-intervened` ←
      `is-human-intervened[1]`, `save-session-vars` ← `compile-current-state[0]`). Verified.
- [ ] `Aggregate1.fieldsToAggregate`, `Execute 'sub-get-rag'` `limit: 5`,
      `Call 'sub-get-results'` `tool: "={{ $json.name }} "` (**including its trailing space**), and
      `Loop Over Items1`: untouched.

## The live diff — verified against live's real edge set, target by NAME only

Live today: 101 nodes / **130 edges**. All five cuts confirmed present; neither add already exists.
Result: **99 nodes / 127 edges.**

| op | detail |
|---|---|
| 1 | `updateNodeParameters` / `setNodeParameter path:"/jsCode"` on **`tool-filter`** (never `/parameters/jsCode` — LESSONS §32b) |
| 2 | cut `tool-filter [main 0] → Split Out1 [0]` |
| 3 | cut `Split Out1 [main 0] → Loop Over Items [0]` |
| 4′ | cut `Loop Over Items [main 1] → Call 'sub-get-results' [0]` |
| 5 | cut `Loop Over Items [main 0] → Aggregate1 [0]` |
| 6 | cut `If6 [main 1] → Loop Over Items [0]` |
| 7′ | **add `tool-filter [main 0] → Call 'sub-get-results' [0]`** |
| 8 | **add `If6 [main 1] → Aggregate1 [0]`** ← omitting this is the catastrophe |
| 9 | remove node `Split Out1` (live id `c0ad8c5f…`, `splitOut` v1) |
| 10 | remove node `Loop Over Items` (live id `d6cfb265…`, `splitInBatches` v3) |
| 11 | comment-only hunk on **`build-suggest-offer`** — see the exact target below |

One `update_workflow` call, ≤100 ops, atomic (LESSONS §33). Target by **NAME**; live↔clone ids diverge for
`tool-filter` (`5c40413a` vs `e1d1d545`), `Aggregate1` (`4f2068b9` vs `a4448717`), `If6` (`91c0e341` vs
`e2a60cb8`), `not-found-error-message` (`b5f79139` vs `5fabfbe3`); only `build-suggest-offer`
(`7972abd8…`) is shared.

## The two node bodies — exact promote targets, pre-computed

**`tool-filter`** — live body sha `54ac512b5a5b3e386c18fd7826497f484db7ccf60fd809c4d0b2bed1ab43d3f6`
(336 chars, 9 lines) is **byte-identical to clone-pre-change**, verified today. So the promote hunk is a
clean whole-body replacement with the tested clone body:
`bffb4c3a40d4fa053756114e938b37722574acb72e09f0c54f79e83490dfdd0c`, 2453 chars / 59 lines, **no trailing
whitespace on any line**, `node --check` clean. Source it from `tests/diffs/tool-loop-removal.tool-filter.after.js`
(drop the file's trailing newline). **Re-verify the live sha at promote time** — memory
`stale-byte-identical-fork-claim`.

**`build-suggest-offer`** — ⚠️ live and clone were **already not byte-identical before this change**:
live 416 lines / 23862 chars / sha `c9f65279…`; clone-pre 415 lines / 23873 chars / sha `b6047c37…`. The raw
diff is exactly 3 hunks: two `── … ──` comment rules padded to different lengths, plus live's extra trailing
blank line. Comments-stripped-and-trimmed, **live == clone-pre == clone-post** (verified).

**Therefore: do NOT copy the clone's 417-line body.** Build the target as **live's 416-line body with lines
295–296 replaced** by the four new comment lines. I constructed and verified it:

```
lines 418 · chars 24040 · sha256 8a2943ec6008aa3b23230a67c56639509d0851a09fbeb1d5fa7cf0a941c23f06
no trailing whitespace · executable content identical to live AND to the tested clone body
replaced live L295-296:
  // Multi-tool queries run get-results MORE THAN ONCE; scan EVERY run, take the first
  // non-empty alternatives set. Gate on alternatives != null (never invent).
with:
  // get-results now runs EXACTLY ONCE per turn (tool-loop-removal, 2026-08-03: one tool
  // per turn; the per-tool splitOut + splitInBatches fan-out is deleted). The run scan
  // below is retained UNCHANGED and self-terminates at run 0 via its own catch -> break,
  // so this edit is comment-only. Gate on alternatives != null (never invent).
```

`for (let ri = 0; ri < 25; ri++)`, `try { items = node.all(0, ri); } catch (e) { break; }`,
`if (!alts) return out;` and `node.isExecuted` must remain byte-present — confirmed present in the
constructed target.

## Gate and publish

- [ ] Strip trailing whitespace before sending (LESSONS §58b); `node --check` the extracted bodies.
- [ ] Per-node **byte-SHA gate**: write draft → re-fetch → `draft == file` → `publish_workflow` **only** on
      match → re-fetch `active == file`. Abort on any mismatch; an abort costs nothing.
- [ ] After publish, assert the resulting graph: no `Split Out1`, no `Loop Over Items`, `Loop Over Items1`
      still present, `If6.main[1] == [Aggregate1[0]]` (exactly one target), `Aggregate1` IN == `{If6[1]}`,
      `not-found-error-message` IN == `{Aggregate1[0], If-incoming-picker[1]}`, **127 edges / 99 nodes**.
      State the compared population; empty checker output is never a PASS (LESSONS §61b).

## Post-promote verification — on the MISS path, per domain (LESSONS §56)

A happy-path smoke **cannot** see a dead-ended `If6 out1`, and `search_executions status:["error"]` returns
zero for a dead-end. Therefore:

- [ ] On the first real live **inventory miss** and **incoming miss**: assert from runData that
      `runData['Aggregate1'].length >= 1` **and** `runData['not-found-error-message'].length >= 1`, and that
      the reply carries the escalate question. **Never score on `status`.**
- [ ] Assert `runData['sorento-sub-respond-sendmsg-respond2'].length === 1` on every watched turn. This is
      the live substitute for the un-run §TL-FP3 (§7) — actually watch it, don't just list it.
- [ ] **S4 instrument (R3):** on the get-results sub-execution, read
      `runData["When Executed by Another Workflow"][0].data.main[0][0].json.tool` — the verbatim string sent
      to `http://72.62.195.20:8765/mcp`. Confirm it is a read tool and never `crm_it_support_ticket_create`.
      There is no allowlist anywhere in the system (R7/F-B) — this assertion is the only control.
- [ ] Confirm on one real miss turn that live's `save-session-vars` PUT body is unpolluted — the promoted
      `_tool_pick` key dies at `Call 'sub-get-results'`'s `defineBelow` mapping (verified structurally), so
      this is a confirmation, not a discovery.
- [ ] **Do NOT answer "yes"** to any escalate offer on a real contact — real staff assignment ripple.

## Rollback

- [ ] `publish_workflow 9qVyfUxmRQqrpGRMDLRuz a40cd16d-c404-4d82-bc46-8a2e756e9dc1` — a pointer move.
      **Never re-build `Split Out1` / `Loop Over Items` by hand** (new ids break golden-master keying,
      LESSONS §20).
- [ ] Triggers: any live miss turn where `Aggregate1` has **zero** runs; or any turn where
      `sorento-sub-respond-sendmsg-respond2` has **≥2** runs.

## Follow-ups (file, do not bundle)

1. **§TL-FP3 in-n8n pin run** + **§TL-EMPTY end-to-end** — same tooling, one task.
2. **P0 / `rysSPgUssLDf6xJc`** — its own user-gated change. Attach R7.
3. **`sub-get-results` has no tool allowlist** (F-B, true on live too) — backlog against the sub, not the spine.
4. **`sub-get-rag` sums similarity** — real fix is max-not-sum (plan RR3, re-worded per R6).
5. **F-E** — add the `uac`-reads-prod-session contamination to LESSONS §31 + the driver preconditions.
6. **Docs** — plan §6 point 2 (R7), plan §5 clone id (R12), F-A wording (R6), diff §2.3 wording (R5),
   CLAUDE.md caller count + reformulator bullet (R11), P-BASE sha convention (R4).
7. **crossdomain re-base** — plan §9 Amendment B stands. Its checklist line *"live's `validator → If6` is the
   single edge to cut"* is **still true** after this promote: live `If6` IN == `{validator[0]}`, and loop
   removal does not touch that edge. But its **live node census must be re-taken** — `Split Out1` and
   `Loop Over Items` will no longer exist.

---

**Live spine confirmed untouched throughout:** `9qVyfUxmRQqrpGRMDLRuz` `versionId == activeVersionId ==
a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, `updatedAt 2026-08-02T23:34:18Z` (predates this session), 101 nodes,
both loop nodes present, zero draft-vs-active deltas. **Nothing was promoted. No workflow was edited by this
review.**
