# REVIEW: `crossdomain-attachment` (+ presign-error addendum) — **APPROVE**

**Reviewed 2026-08-04, read-only. Nothing edited, nothing promoted.**

| | |
|---|---|
| clone reviewed | `txiPzSxy3Pclsz6v` @ **`a5cf2434-83b6-455b-b9a4-79e3b4162f19`** — re-fetched by me; `versionId == activeVersionId`, draft-vs-active param diff **empty**, connection maps **byte-identical**, 141 nodes, `active:true` |
| live spine | `9qVyfUxmRQqrpGRMDLRuz` @ **`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`**, `updatedAt 2026-08-02T23:34:18.534Z`, 101 nodes, draft == active — **untouched, re-read by me at review time** |
| method | deployed graph via MCP `get_workflow_details` (clone, live spine, `ublq9nSlrpz63xan`, `aoydkG1dbItXR5jXFEQsP`) + independent `get_execution` re-derivation of 5 executions. I did not trust the diff or the run log for any load-bearing claim. |
| verdict | **APPROVE**, conditional on the promote checklist in §11. Two MUST-FIX documentation defects (§8) block the *next UAC run*, not the promote. |

**Bottom line.** The re-rooting is correct and the crux failure mode (0 files, green execution) is ruled
out by direct evidence on both branches. The delivery test is sound — I proved it against the deployed
`crossdomain-compose` body rather than accepting the argument. The presign apology's gate was shown RED
under induced fault, so its green means something. §0 held: **zero real egress, re-derived from the
deployed connection map, not from any report.**

I also closed the single biggest hole the clone *cannot* close by construction — see §3, finding **P-1**.

---

## 1. §0 zero egress — PASS, re-derived from the deployed clone JSON

Computed from the read-back connection map with my own inbound-edge census (the census reports real
non-zero counts for the other 130+ nodes, so it is not an instrument that can only read zero — this
discharges §XA-FP6 *for my census*; see §9 for the tester's).

| gate | assertion | measured |
|---|---|---|
| **S1** | `send-message-files` inbound | **0** |
| **S1** | `send-message-images` inbound | **0** |
| **S1** | `send-message-video` inbound | **0** |
| **S3** | `update-human-intervened` inbound | **0** |
| **S3** | `save-session-vars` inbound | **0** |
| **S1** | full zero-inbound set (9) | `Code in JavaScript`, `OpenAI Chat Model`, `When Executed by Another Workflow`, `save-session-vars`, `send-message-files`, `send-message-images`, `send-message-video`, `sorento-sub-respond-sendmsg-respond3`, `update-human-intervened` — the 5 real egress nodes are all in it |
| **S1** | sendmsg callers | **9 → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), all `is_test: true` literal. Callers pointing at live `aoydkG1dbItXR5jXFEQsP`: ZERO.** The new `sorento-sub-respond-sendmsg-presign-fail` is caller #9 and matches the other 8 exactly. |
| **S4** | get-results callers | 4 → `rysSPgUssLDf6xJc`; `crossdomain-probe.workflowId` **not** remapped |
| **S4** | resolved tools (execs `11164291/11164237/11164236`, per run log) | `crm_incoming_stock_list`, `crm_inventory_stock_balance_list` — READ only. `crm_it_support_ticket_create` absent. |
| **S3** | postgres | 3 nodes, queries target `respond_contacts_test` / `chat_histories` only — **no prod-CRM table**. This change adds **no** postgres node. Credential *bindings* are redacted by MCP (LESSONS §47/§55); see §10 "not independently verified". |
| **S5** | `test_mode` / `is_test` | trigger carries `test_mode:true`; every sendmsg caller `is_test:true`; reformulator fork `is_test:true` |
| **S7** | prod ingest | run log: `LLEN sorento-respond-message` 0→0 **corroborated by** sink-delta `sorento-respond-message-TEST` +1/run on an unconsumed list. Correct instrument per LESSONS §45; the LLEN half alone is drain-blind and the log says so. |

**The new file path terminates at `Switch`[2] → `guard-g-record` → `chat-attach?` → `chat-attach-push`.**
No edge was added to any real sender. Verified in the deployed map and in runData (exec `11162665`:
`guard-g-record` ran, `send-message-files` did not exist in runData).

**Fault induction was itself clean.** FP-A/B/C pointed `get-presigned-url` at `http://127.0.0.1:9`. I read
the error payload in exec `11163516`: `connect ECONNREFUSED 127.0.0.1:9`. **No request left the container
and no bad path was ever sent to the real CRM host** — the correct way to induce this fault.

**F2 stays discharged, verified in code and in data.** `compile-current-state` L418–462 returns a
whitelisted `{variables:{…21 named keys…}, user_response, quick_reply}`; `_xdBlock` (and therefore its new
`attachments` key) cannot pass it. In exec `11162665` `crossdomain-compose`'s emitted item keys are exactly
`[variables, user_response, quick_reply]` — **no `_xdApplied`, no `attachments`**. `attach-merge` and
`presign-fail-notice` both emit fresh items on dead-end branches and mutate nothing.

---

## 2. The re-rooting — PASS, cut is complete, no turn loses a file

**Static.** In the deployed clone, `if-got-attachments` has **exactly one** inbound: `attach-merge[main:0]`.
`central-exchange`[0] now goes only to `compile-current-state`. `sorento-sub-respond-sendmsg-respond2`[0]
goes to `Execution Data, attach-merge`. Nothing else feeds the chain. The cut is complete and the
double-root hazard is structurally absent.

**Reachability.** `central-exchange`'s only outbound is `compile-current-state`; `compile-current-state`'s
only outbound is `crossdomain-compose`; `crossdomain-compose`[0] → `sorento-sub-respond-sendmsg-respond2`.
So every turn that reached the chain before reaches the new root, **plus** the `If6[1]` miss branch that
could not reach it before. Note `central-exchange` also has `Basic LLM Chain[0]` and `mock-parser-output[0]`
inbound — both still flow through `compile-current-state`, so the clarification arm is not orphaned.

**Dynamic — the two cases that matter, re-derived by me from runData, not from the log:**

| | exec `11162665` (§XA.1, total miss) | exec `11163255` (§XA.9b, cert regression) |
|---|---|---|
| `central-exchange` | **no runData** — the old root would have thrown under `typeValidation: strict` | ran @ idx 39, 2 attachments |
| `attach-merge` | idx 52, 1 item, 1 file, sourced entirely from `_xdBlock` | idx 44, 2 files, **deep-equal to `central-exchange.attachments`, order preserved (IKRAM → PPS)** |
| `if-got-attachments` | TRUE | TRUE |
| `get-presigned-url` | 1 run, main[0]=1, main[1]=0 | **1 run, main[0]=2, main[1]=0** |
| `guard-g-record` | 1 run | 2 runs, IKRAM then PPS |
| A-ORDER | sendmsg2 idx **50** < if-got-attachments **53** | **42 < 45** |

§XA.9's failure mode (0 files, green execution) is therefore **positively excluded on the highest-value
fixture**, not merely un-observed.

**On population coverage (the brief's question).** The two fixtures do not by themselves cover the whole
population — but the argument that closes the gap is *structural*, and I verified its premises rather than
its conclusion: (a) the chain has one root; (b) that root is on the unique always-executed spine segment;
(c) `attach-merge`'s `MAIN` arm reproduces `central-exchange.attachments` byte-for-byte when
`central-exchange` ran, and `[]` when it did not. (c) is the only per-turn variable, and R1/R3–R8 show it
holding as `[]` across 8 unrelated domains. That is adequate.

**Two behaviour changes the new data dependency creates. Both are real; one is already recorded.**

- **RISK-A4 (recorded).** `attach-merge` hangs off output **0** = success. A failed text send now suppresses
  the file. Confirmed on live too: exec `11168257` shows `sendmsg2.data.main` has two output arrays
  (`continueErrorOutput` is set on live as well as on the clone). Judged correct — never a file with no
  message.
- **RISK-A4b (NEW, mine).** The dependency is stronger than "the send didn't error": the sub must also
  **emit ≥1 item** on main[0]. On live, `aoydkG1dbItXR5jXFEQsP`'s plain-text arm passes through
  `If1` (`message` notEmpty) whose FALSE output is unwired — an *empty* `user_response` carrying
  attachments would today still deliver the file and after promote would not. See §3 for what I could and
  could not prove about this. Low likelihood; record it, add it to post-promote watch, do not gate on it.

---

## 3. 🚩 P-1 — the one thing the clone could not prove, now proven on live (read-only)

**This was the largest untested dependency in the change and neither the plan, the diff, nor the run log
identifies it.**

The re-rooting makes the attachment chain depend on `sorento-sub-respond-sendmsg-respond2` **emitting an
item on main[0]**. Every clone test exercised `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`) with `is_test:true`,
which short-circuits at `test-guard` → `test-guard-record` and returns the caller's own input payload.
**Live calls a different workflow with a different terminal topology** (`Loop Over Items`[0] →
`Chat Memory Manager`, or the quick-reply arm's `HTTP Request` fan-out). If live's sub returned zero items,
every attachment on production would silently stop — 0 files, green execution, on the *entire* pre-existing
file population, not just the new one.

I sampled live production executions read-only:

| live exec | `sendmsg2` main[0] | `Execution Data` ran |
|---|---|---|
| `11168257` | **1 item** `{"success":true}`, main[1] `[]` | yes, 1 item |
| `11166419` | **1 item** `{"success":true}`, main[1] `[]` | yes, 1 item |

So the precondition holds on production traffic, and — usefully — the item shape on live
(`{success:true}`) is *different* from the clone's (the full input payload). That difference is harmless
**only because `attach-merge` reads everything by node name and emits its own item**, and because
`if-got-attachments` / `Edit Fields` were repointed to `$json` of `attach-merge`, not of `sendmsg2`. The
design survives the shape divergence by construction. This is the strongest single piece of evidence in the
change and it is not in any of the artifacts — record it.

**Still unproven:** the empty-`user_response`-with-attachments sub-path (RISK-A4b). Not reachable from the
clone and not observable in the two samples.

---

## 4. `attach-merge` correctness + the `includes()` delivery test — PASS (this was the crux; it holds)

I read the deployed `crossdomain-compose` body (sha `9d8c57100c9f`) and enumerated **every** path.

**Can the block be delivered but `includes` fail?** No. All three insertion sites interpolate `xb.block`
**verbatim**:

- answered arm — `` `${out.user_response}\n${xb.block}\n\n${PHRASE}` ``
- total miss, no marker — `` `${out.user_response}\n${xb.block}` ``
- total miss, marker found — `` (head ? head+'\n' : '') + `${xb.block}\n\n` + slice(at) ``

The marker-insert logic reflows only the **head** (`slice(0,at).replace(/\s+$/,'')`) and the **tail**
(`slice(at)`); `xb.block` is never trimmed, sliced or re-cased. The `hay` haystack is computed at L59
*before* insertion, so the appended `mention` cannot move the insertion point or become a false marker
(and `I have attached the file(s) below.` contains none of the five markers case-insensitively). The
`mention` sits at the **end of the block**, hence above the escalate question — confirmed in exec
`11162665`'s delivered text, where it sits between the row block and `Try: … or would you like me to
escalate to warehouse team?`.

**Can `includes` pass when the block was NOT delivered?** No. Every compose early-return (`render` not
executed / `any!==true` / `!block` / non-string-or-empty `user_response` / answered-with-empty
`last_result_set`) returns the *original* `o`, whose `user_response` does not contain `xb.block`; and the
first three are independently re-checked inside `attach-merge` before the text test is even reached. The
test fails **safe** in both directions.

Other `attach-merge` details verified against the deployed body (sha `d548f0f1c2b0`, 2906 chars,
`runOnceForAllItems`, Code node — a type that cannot hold a credential, LESSONS §47):

- `.isExecuted` guards on all three node refs, each inside its own try/catch → no throw path.
- ordering `[...MAIN, ...XD]` mirrors the text order.
- no dedupe here — correct per A4; `Remove Duplicates` still `{"compare":"selectedFields","fieldsToCompare":"url"}` on **both** clone and live.
- `crossdomain-render`'s degraded early-return has **no** `attachments` key *and* `any:false` — double-guarded (deployed sha `f711fd2c7eb3`; `mention` gated on `blocks.length && XD_FILES.length` at L121).

---

## 5. The presign error path — PASS, and its gate was shown load-bearing

**Topology claim re-verified by me, both statically and from runData.** `get-presigned-url`'s complete
inbound list is `Remove Duplicates[main:0]`; `chat-attach?[main:1]` and `chat-attach-push[main:0]` land on
`Loop Over Items1`, which is strictly downstream. So one node-run per turn, N files as N items. Exec
`11163255` proves it empirically: **1 run, 2 items out**. The `$runIndex > 0` backstop is a correct
belt-and-braces for a future rewire.

| | exec `11163516` (FP-A) | exec `11163686` (FP-B — must go RED) |
|---|---|---|
| `get-presigned-url` | 1 run, **`executionStatus:"success"`**, main[0] **0** items, main[1] **2** | 1 run, `success`, main[0] 0, main[1] 1 |
| `presign-fail-notice` | 1 run, 1 item, `failed:2 total:2`, text byte-exact | 1 run, **0 output items** |
| sender | 1 run, `is_test:true`, → `ublq9nSlrpz63xan`, `quick_reply:null` | **no runData** |
| `Loop Over Items1` / `guard-g-record` | absent / absent | absent |
| execution status | `success` | `success` |

**FP-B genuinely goes red**, so FP-A's green is worth something. FP-C's partial wording
(`failed:1 total:2`) also confirms `$('Remove Duplicates').all()` is the right denominator.

**The sender is correctly shaped** — `quick_reply` deliberately omitted (would re-render the answer's
buttons under the apology; `send-transcript-confirm` is the precedent), `result_set` mirrors `sendmsg2` so
a quote-reply on either row resolves identically, and it writes **no** session vars.

**Coverage of the pre-existing (larger) population — mechanism verified, end-to-end untested.** All three
FP cases used the cross-domain fixture. But exec `11163255` shows the cert turn's
`crossdomain-compose.user_response` **begins with** `I have attached the file(s) below.` (the CRM
presenter's `intro`, carried through `compile-current-state` untouched), so the gate *does* arm on the
main-answer population. Mechanism proven; the apology has never actually fired on that population. Carried
in §10 and in the post-promote smoke list.

---

## 6. The claim/notice coupling — **ACCEPTABLE, with a mandatory guard**

The literal `I have attached the file(s) below.` is authored in two codebases: n8n's
`crossdomain-render.ATTACH_NOTE` and the CRM presenter `sorento_crm_mcp/presenters.py:708`. The gate is an
exact `String.includes` against it.

**Ruling: accept.** The failure direction is the safe one — a reword in either place makes the gate go
silent, which returns the turn to *today's* behaviour (a silent drop). It can never manufacture a spurious
apology, and it can never make a turn noisier than the claim itself. Gating on graph position instead would
need one rule per population and would drift as arms are added; gating on the delivered text is the correct
call and it is the reason the same node covers both populations with one rule.

**But it is not self-healing, and "safe direction" is not "harmless"** — a silenced gate re-opens exactly
the false-claim hazard this addendum exists to close, invisibly. Required, and added to the checklist:

1. **A comment at each of the three sites** (`crossdomain-render`, `presign-fail-notice`, and
   `presenters.py:708` in the CRM repo) naming the other two and stating that the string is a
   cross-repo contract. The two n8n sites already carry it; **`presenters.py:708` does not** — that is the
   one that will be reworded by someone who has never read this review.
2. **FP-B is promoted from a one-off to a standing regression** — it is the only check that can detect the
   drift, and it takes one run.

---

## 7. Dedupe — what is and is NOT proven

Per the user's 2026-08-04 narrowing, §XA-FP1 was dropped and §XA.4 / §XA-FP2 were **not run**.

**Proven:** a single structural root (I verified `if-got-attachments` has exactly one inbound);
`Remove Duplicates` is deployed with `fieldsToCompare:"url"` on both clone and live; the key is the raw CDN
path, not a presigned URL (`get-presigned-url` runs *after* — confirmed in the exec `11162665` node order);
`Remove Duplicates` passed 2 distinct urls through unchanged in exec `11163516`.

**NOT proven, and no claim is made:** which layer owns dedupe. Whether the CRM presenter's `(url, filename)`
de-dupe, or `Remove Duplicates`, is doing the work on a same-container turn is **unknown**. A future green
on §XA.4 must not be reported as "our dedupe works" without §XA-FP2.

**Standing hazard, flag it loudly:** `Remove Duplicates` dedupes *within one chain run*. It would **not**
save you if the chain ran twice. That case is excluded **structurally, by the single root** — and nothing in
the test suite would catch its loss. **Adding a second edge into `if-got-attachments` re-opens double-send
silently.** That sentence belongs in a node comment on `attach-merge`; today it is only in the UAC banner.

---

## 8. 🚩 MUST-FIX documentation defects — blocking the *next* §XA run, not the promote

**D-1 (the tester's F-1, confirmed by me).** §XA-FP4 predicts `get-presigned-url` run 1 with
`executionStatus:"error"`. Measured in exec `11163516`: **`success`**. Under `continueErrorOutput` neither
the execution status nor the node's own status goes red. As written, §XA-FP4 was itself a
green-that-cannot-fail.

**D-2 (NEW — the tester did not catch this one).** §XA.0 **A-NODES** says *"`get-presigned-url` runData:
run count == N"*, and §XA.9 spells out *"`get-presigned-url` 2 runs both success"*. **That is factually
wrong about the topology.** The node runs **once** with N items — exec `11163255`: 1 run, 2 items out.
`Loop Over Items1 = N+1` and `Switch = N` are correct. A future tester following A-NODES literally would
score a correct build RED on N≥2, or paper over it.

**Both must be rewritten to: `get-presigned-url` = exactly 1 run; assert `len(main[0])` and `len(main[1])`
per output; never read `executionStatus` on this node.**

---

## 9. Green-that-cannot-fail audit — my own ledger over the 30 executions

| check | passes on an inert build? | what rescues it |
|---|---|---|
| §XA.6, §XA.7, R1, R3–R7 (no file / no block) | **YES, all of them** | §XA.1 / §XA.5 / §XA.9b on the *same version* show a file does arrive. The run log states this correctly and does not over-claim. |
| §XA.9 / §XA.9b | **YES if the re-rooting were reverted** | correctly classified as a *regression* instrument, not a feature instrument |
| §XA.3 provenance | **YES — expected inert** | stated as such; only meaningful beside §XA.1 |
| execution `status: success` | **ALWAYS** | never used for any verdict; every one of my own verdicts above is per-node runData |
| A-COUNT (Split Out / envelope counting) | proven blind by an induced double-send | **not used**; replaced with `test:egress` `would_send` keyed by filename, shown to read 0/1/2/6 |
| FP-A (apology fires) | **YES if the gate were wired to nothing** | **FP-B run and RED** — I re-derived it: `presign-fail-notice` `main:[[]]`, sender absent. This is what makes the whole presign section trustworthy. |
| S1 orphan census | would pass if it echoed an expectation | **§XA-FP6 was NOT run** by the tester — carried honestly. **Discharged for my census**: my script prints real inbound counts for all 141 nodes and reported non-zero for 132 of them, so it demonstrably distinguishes 0 from non-0. The tester's instrument remains argued-not-demonstrated; that is acceptable given mine is independent. |
| S7 LLEN 0→0 | **YES — drain-blind** | paired with sink-delta + attribution; reported as corroboration only. Correct per LESSONS §45. |
| R6 / R7 (clarify still works) | **cannot fail either way** (F-4: `uac` mode reads a carried PROD entity) | reported **UNRELIABLE**, not PASS. Correct call. |

**Does FP-B going red make FP-A trustworthy? Yes — but only for the presign path.** It proves the
mention-gate is wired to the delivered text. It says nothing about the *delivery* assertions (§XA.1/.5/.9b),
whose credibility rests instead on the positive/negative pairing on one build version, which I re-derived
independently. §XA-FP3 (the by-name repoint red) and §XA-FP5 (decision (d) red) were **not run**; both would
have been cheap and both target the "silent zero" class. Not blocking — §XA.1 and §XA.9b both deliver files
on this build, which is the same evidence from the other side — but note it.

---

## 10. Ships UNVERIFIED — the explicit list

1. **The real send.** `send-message-files/-images/-video` are orphaned on the clone by design. Every case
   proves the *decision* to send; **none proves a send.** Post-promote smoke is mandatory, not advisory.
2. **RISK-A1 / partial-access behaviour.** Accepted **unmeasured** by explicit user decision (2026-08-04):
   the packing list reaches contacts holding stock-but-not-incoming access, covers the whole container
   (`FFAU3176932.xlsx` = 4 products), and there is **no per-agent re-check**. Row-level `access_levels`
   scoping is unchanged. Untestable — no partial-access contact exists. This is a **prerequisite recorded
   as accepted**, not a gap that testing closed.
3. **Blast-radius magnitude.** Plan verification task **V4** (count the newly-file-sending turn population
   from `n8n_test.v_turns` / `chat_histories`) was **never done** — not in the diff, not in the run log.
   For a change whose entire risk is "how many real customers newly receive a document", "unknown" is thin.
   It is answerable offline with zero live contact. **Do it before promote** (§11).
4. **V2 / V3 / V5 / V6** — not recorded as answered anywhere. **V5 matters**: the block's attachments come
   from the probe envelope, and live's get-results calls are **split** (`Call 'sub-get-results'` and
   `probe-incoming` → `rysSPgUssLDf6xJc`; `sibling-probe` → `Fss5aAaXthJSWpZCgKiKR`). The envelope shape is
   proven only on the fork.
5. **The apology on the main-answer (cert / product-attachment) population** — mechanism verified (§5), never
   fired end-to-end.
6. **RISK-A4b** — empty `user_response` carrying attachments (§2). Unreachable on the clone.
7. **`presign-fail-notice`'s `input_message`** rendered as `[attachment-failed follow-up] ` with an empty
   messageId in FP-A — the harness fixture has no `message.messageId`. Cosmetic (a log label only), but the
   expression is unexercised against a real messageId. `redis-pop-main-message-list` **does** exist on live
   (I checked), so it will resolve; verify the depth `.message.messageId` at promote — live's
   `Call 'sub-human-intervention'` uses `$('tf-message').first().json.message.messageId` for the same value.
8. **Postgres credential bindings.** MCP redacts credentials, so I could not assert `n8n_test-db` myself and
   I deliberately did not run a REST GET against the n8n host. What I *did* verify is the sound proxy: all 3
   postgres nodes query `respond_contacts_test` / `chat_histories`, and **this change adds no postgres node
   and touches none.** The coder's and tester's REST-verified `n8n_test-db ×3` stands unchallenged but
   un-reproduced by me.
9. **§XA-FP2 / §XA.4 (dedupe ownership), §XA-FP3, §XA-FP5, §XA-FP6, §XA.8, §XA.10** — not run.
10. **F1's "block above the candidates" clause** — UNREACHABLE this run (no candidate list rendered).

---

## 11. PROMOTE CHECKLIST (user-gated — do NOT promote unprompted)

### Prerequisites — hard gates

- [ ] **`tool-loop-removal` promoted.** Live today still has `If6[1] → Loop Over Items` and
      `Loop Over Items[0] → Aggregate1`. Verified by me at review time.
- [ ] **`cross-domain-stock-incoming` promoted and its review moved to APPROVE** (it is currently
      **REQUEST-CHANGES (narrow)** — F1/F2/F3, owned by a different reviewer, **not ruled on here**).
      **Live has no `crossdomain-compose` / `-render` / `-zeroset` / `-gate` / `-probe` node at all**, so
      this change is structurally un-promotable before #2. Verified.
- [ ] **#2's promote must also repoint `sorento-sub-respond-sendmsg-respond2.message` and `.result_set` to
      `$('crossdomain-compose')`** (live currently reads `$('compile-current-state')`). ⚠️ **If #2 lands the
      node but leaves that expression on `compile-current-state`, this change's apology gate reads the
      PRE-block text — and the cross-domain mention lives inside the block, so the apology would silently
      never fire on exactly the new population.** Assert this before promoting #3.
- [ ] Live `activeVersionId` **after #2 / before #3** captured and written into the plan §10.
- [ ] **V4 blast-radius estimate produced** (offline, `n8n_test`). Not optional for a real-egress promote.
- [ ] Live **draft == active** re-checked immediately before any write (LESSONS §24/§51). It is today.
- [ ] RISK-A1 acceptance re-affirmed in writing (already given 2026-08-04) — it is the *reason* this ships.

### Strip the guard scaffolding — what must NOT cross into live

- [ ] **`sorento-sub-respond-sendmsg-presign-fail` must be created FRESH on live, never block-copied**
      (LESSONS §48). On live: `workflowId.value = "aoydkG1dbItXR5jXFEQsP"`, **`is_test` ABSENT**,
      **`test_run_id` ABSENT** — matching live's other 8 sendmsg callers, which carry neither. Copying the
      clone node verbatim points production's apology at the harness fork **and** sets `is_test:true`,
      which makes the sub log instead of send.
- [ ] Live sender inputs, modelled on live `sorento-sub-respond-sendmsg-respond2` + `send-transcript-confirm`:
      `contact_identifer`, `message = {{ $json.notice }}`, `input_message`, `contact`,
      `result_set = $('crossdomain-compose')…last_result_set`, `turn_id = {{ $execution.id }}`. Nothing else.
- [ ] Do **not** port `guard-d/e/f/g-record`, `chat-attach?`, `chat-attach-push`, `mock-parser-output`,
      `session-save-gate`, or any `test:egress` wiring.
- [ ] `attach-merge` and `presign-fail-notice` **are** portable byte-for-byte (Code nodes, no workflowId,
      no `is_test`): shas `d548f0f1c2b0` and `ad8043e3ebc7`.
- [ ] `crossdomain-render` is a **#2 artifact** — build the live body as **#2's promoted live body + this
      change's two hunks** (`XD_FILES`/`ATTACH_NOTE`/`mention`, and `attachments: XD_FILES` in `_xdBlock`).
      **Never copy the clone body wholesale** (LESSONS §57).

### The live edge set — exact, by NAME (clone ids diverge; `setNodeParameter` keys on name)

```
CUT   central-exchange[main:0] -> if-got-attachments        (KEEP central-exchange -> compile-current-state)
ADD   sorento-sub-respond-sendmsg-respond2[main:0] -> attach-merge   (KEEP -> Execution Data)
ADD   attach-merge[main:0] -> if-got-attachments
ADD   get-presigned-url[main:1] -> presign-fail-notice      (main[0] -> Loop Over Items1 UNCHANGED)
ADD   presign-fail-notice[main:0] -> sorento-sub-respond-sendmsg-presign-fail
```
Node adds: `attach-merge`, `presign-fail-notice`, `sorento-sub-respond-sendmsg-presign-fail` (live-shaped).
Param patches: `if-got-attachments.conditions.conditions[0].leftValue` → `={{ $json.attachments.length }}`;
`Edit Fields.assignments.assignments[0].value` → `={{ $json.attachments }}`; `crossdomain-render.jsCode`.

### 🚩 The live-defect clause — this MUST NOT be dropped

- [ ] **Live's `get-presigned-url` has `onError: continueErrorOutput` with `main[1]` UNWIRED — confirmed by
      me in live `a40cd16d`.** A dropped file is silent on production **today**. `presign-fail-notice` +
      the `main[1]` edge + the live sender **must ship together with `D-ATTACH-MENTION`.** Promoting the
      mention without the error path takes a pre-existing silent drop and converts it into the bot stating
      something **false**, on a brand-new population. **Do not split these two into separate promotes.**

### Gate, publish, verify

- [ ] Target by **NAME**; strip trailing whitespace (LESSONS §58b); per-node byte-SHA gate draft==file →
      publish only on match → re-fetch active==file.
- [ ] `attach-merge` / `presign-fail-notice` carry **no credentials** — assert on node **type** (Code), not
      on an absent `credentials` block (MCP redacts it; LESSONS §47).
- [ ] Re-assert live `Remove Duplicates` is still `fieldsToCompare:"url"` at promote time.
- [ ] Re-assert live `send-message-files/images/video` inbound is unchanged — fed **only** by `Switch`.
- [ ] Enumerate credentialed nodes before and re-assert all after (LESSONS §55).
- [ ] `publish_workflow` after `update_workflow`.

### Post-promote smoke — MANDATORY (LESSONS §56; the real send is untested by construction)

- [ ] **Cross-domain**: `check stock SRTWC286-SH-NEW-200` → text first, then exactly one `FFAU3176932.xlsx`.
- [ ] **Pre-existing attachment turn** (certification, `SRTUB6213`) → same 2 files, same order. *This is the
      re-rooting regression check and the one most likely to bite.*
- [ ] **Both-empty** (`check stock SRTWT5800-FH`) → no file, no block, no mention.
- [ ] **P-1 confirmation**: check that `attach-merge` has runData on a live turn — that is the direct
      confirmation that live's sendmsg sub emits on main[0] under the promoted graph.
- [ ] ⛔ **Do NOT smoke the `yes` leg on a real contact** — the escalate phrase now arms on turns that
      returned data, and a bare `yes` is a real staff-assignment ripple.
- [ ] Watch `presign_audit` volume for several days; a spike attributable to `check stock` turns is the
      blast-radius signal.
- [ ] Verify on one real turn that the `save-session-vars` PUT body carries **no** `_xdBlock` /
      `attachments` key (predicted byte-identical; live's node differs from the clone's `pg-upsert-session`).

### Rollback

Granular (leaves #2 in place): restore `central-exchange`[0] → `if-got-attachments`; delete the two
`attach-merge` edges and the node; restore the two expressions; delete the `main[1]` edge,
`presign-fail-notice` and the sender; remove the `crossdomain-render` hunks. **Steps 1–5 stop all new file
sends.** Coarse rollback re-publishes the pre-#3 `activeVersionId` — which also reverts #2 unless the
intermediate pointer was captured (see Prerequisites).

---

## 12. Scope / tier — CORRECT

`scope: deterministic`, with §XA.3/.5 declared as parser-tier runs of a deterministic change. Matches what
was tested: no parser edit, no LLM node added, and **no LLM node executed in the spine on any of the 30
executions** (S6). The run log's F-3 (the get-results `AI Agent` arm never executes; the tool is chosen
deterministically by the caller) is consistent with that and is correctly surfaced as an observation about
production, not a finding against this change.

---

## 13. Interactions with other changes — noted, not ruled on

- **`cross-domain-stock-incoming` (#2)** — F1 (case-sensitive marker), F2 (`_xdApplied`), F3 (rewire census)
  are **owned by that review**. I note only that F2 is empirically discharged on the current clone
  (`crossdomain-compose`'s item keys are exactly `[variables, user_response, quick_reply]`), and that this
  change does not re-open it. The lead-in reword and the `D-ATTACH-MENTION` re-baseline both belong to the
  sequencing between #2 and #3.
- **`tool-loop-removal` (#1)** — APPROVED; its `If6[1] → Aggregate1` join is the edge this change's
  reachability argument stands on. Verified intact on the clone (`If6.main == [[central-exchange],[Aggregate1]]`).

### 🚩 P0 — RECORDED, NOT FIXED, NOT BUNDLED

Live's `Call 'sub-get-results'` **and** `probe-incoming` point at **`rysSPgUssLDf6xJc` (`sub-get-results TEST`)**
— re-confirmed by me in live `a40cd16d`. Additional detail not previously recorded: **live is split** —
`sibling-probe` points at the live sub `Fss5aAaXthJSWpZCgKiKR`, so production runs two different
get-results workflows. Any "harness-only" edit to `rysSPgUssLDf6xJc` is an ungated live change that passes
§0. **Separate, user-gated change. Do not fix here, do not bundle.**
