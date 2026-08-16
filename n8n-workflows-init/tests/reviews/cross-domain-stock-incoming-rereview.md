# RE-REVIEW: `cross-domain-stock-incoming` — **APPROVE**

Date 2026-08-04. Supersedes `tests/reviews/cross-domain-stock-incoming.md` (REQUEST-CHANGES, 2026-08-03)
and its promote checklist in full — the topology underneath moved (`tool-loop-removal` shipped to the
clone) and a third change (`crossdomain-attachment`) now sits on top of the same nodes.

| | |
|---|---|
| clone reviewed | `txiPzSxy3Pclsz6v` @ **`a5cf2434-83b6-455b-b9a4-79e3b4162f19`**, `versionId == activeVersionId`, `updatedAt 2026-08-04T06:57:24.605Z`, **141 nodes** — re-derived by me from MCP `get_workflow_details`, not taken from any report |
| live spine | `9qVyfUxmRQqrpGRMDLRuz` @ **`a40cd16d-c404-4d82-bc46-8a2e756e9dc1`**, `versionId == activeVersionId`, `updatedAt 2026-08-02T23:34:18.534Z`, 101 nodes. **draft-vs-active diff: 0 differing nodes, 0 added, 0 removed, connections byte-identical.** Zero `crossdomain*` nodes. `Split Out1` + `Loop Over Items` still present ⇒ untouched, and `tool-loop-removal` is NOT on live yet |
| verdict | **APPROVE.** All three prior findings are genuinely closed or converted to explicit promote decisions. Two **new blocking checklist constraints** (N1, N2) — neither requires a clone edit; both are about *what bytes get promoted and in what order* |

Read-only throughout. No workflow was edited. Nothing was promoted.

---

## 1. §0 zero egress — re-derived from the CURRENT clone JSON (`a5cf2434`)

Structural facts, computed from the deployed `nodes`/`connections`, not quoted from a run log:

| check | result |
|---|---|
| 5 egress nodes orphaned | ✅ `send-message-files` **0 inbound**, `send-message-images` **0**, `send-message-video` **0**, `update-human-intervened` **0**, `save-session-vars` **0** |
| sendmsg callers | ✅ **9** (was 8; `sorento-sub-respond-sendmsg-presign-fail` is new from the attachment change) — every one → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), all passing `is_test: true`. **Zero** callers point at live `aoydkG1dbItXR5jXFEQsP` |
| human-intervention | ✅ → fork `vUfFUDjLAuMaeQE6` |
| message logger | ✅ `Call 'sub-respond-save-message-redis'2` → fork `tWm5DYLxfypmVC1T`, never live `UrETd-…` |
| get-results callers | ✅ **4** (`Call 'sub-get-results'`, `probe-incoming`, `sibling-probe`, `crossdomain-probe`) → `rysSPgUssLDf6xJc` (`sub-get-results TEST`) |
| **`crossdomain-probe` tool** | ✅ `={{ $json._xd.other_tool }}`, and `other_tool` is a **hardcoded ternary in `crossdomain-zeroset` L28**: `crm_inventory_stock_balance_list` / `crm_incoming_stock_list`. Not caller-controlled. `crm_it_support_ticket_create` unreachable |
| trigger surface | ✅ sole trigger = `When Executed by Another Workflow`. **No `respondioTrigger`, no `Schedule Trigger`.** `redis-pop-main-message-list` pops `=test:q:{{ $json.contact }}` — the shared prod `main-message-list` is never touched |
| postgres | ✅ exactly 3 nodes (`pg-get-session`, `pg-upsert-session`, `log-incoming-chat-history-n8ntest`), all against `respond_contacts_test` / `chat_histories` in `n8n_test`. This change adds none. Credential binding is **not** MCP-verifiable (LESSONS §47) — asserted on node population + SQL text only |
| new nodes from THIS change | ✅ 5 — `crossdomain-zeroset` (Code), `crossdomain-gate` (If), `crossdomain-probe` (executeWorkflow), `crossdomain-render` (Code), `crossdomain-compose` (Code). None of those types accepts a credential ⇒ sound assertion, not the vacuous "no credentials block" |
| `_xdApplied` | ✅ **0 code occurrences.** The single textual hit is a *comment* in `attach-merge` explaining why it must never come back |
| `$runIndex` | ✅ absent from the crossdomain subgraph (2 uses, both in `presign-fail-notice`, attachment change) |

**Empirical confirmation on the current build** — I pulled `runData` for exec **`11163215`**
(2026-08-04T06:51:05Z, i.e. after the last write) rather than trusting the tester:

- `crossdomain-zeroset` **1 run**, `crossdomain-gate` **1**, `crossdomain-probe` **1**, `crossdomain-render` **1**, `crossdomain-compose` **1**.
- `crossdomain-probe` → sub-execution **`11163226`** on **`rysSPgUssLDf6xJc`** (the fork), resolved `tool = crm_incoming_stock_list` (READ).
- `crossdomain-compose` output keys are exactly **`{variables, user_response, quick_reply}`** — no `_xd`, no `_xdBlock`, no `_xdApplied`. `guard-d-record` received that same item verbatim.

Tester §0 corroboration, both suites, both accepted:
`runs/tool-loop-removal-20260803.md` — S1–S6 asserted **per execution on all 48**;
`runs/crossdomain-attachment-20260804.md` — S1–S7 on all **30**, with **S7 done properly** (sink-delta on
`sorento-respond-message-TEST` +1/run with payload attribution, prod `LLEN` 0→0), i.e. the LESSONS §45 /
`s7-llen-gate-unsound` replacement, not the discredited bare-LLEN gate. Egress-row kinds across both
suites: `would_log` / `would_send` / `would_write` **only**.

**Verdict: no new egress surface. Reads only. Zero real egress re-confirmed on the deployed graph and on
real executions of it.**

---

## 2. Prior findings — is each one genuinely closed?

### F1 (case-sensitive markers) — **CLOSED**, and the widened fix is correct

Verified three independent ways.

1. **Deployed bytes.** `crossdomain-compose.jsCode` sha256
   `9d8c57100c9fc870bbd62bee346596f052dff3190f4a759c394f812d6231f073` — **byte-identical** to the reviewed
   sidecar `tests/diffs/cross-domain-stock-incoming-review-fixes.crossdomain-compose.new.js`. The
   lower-cased `hay` copy is searched; every `slice` is taken from the original `out.user_response`, so no
   customer-visible casing changes.
2. **Census re-derived by me against LIVE, not against the coder's table.** I grepped live
   `build-suggest-offer` (415L, sha `c9f652796f69`) and live `not-found-error-message` (247L, sha
   `2b1e1c86c076`) @ `a40cd16d`. Every fixture line reference checks out: bso **L88** `Related products:`,
   **L219/L224-225** `"${token}" — did you mean:` + `Couldn't find some items:`, **L252** `Here are the
   closest matches:`, **L272** `Did you mean`, **L345** date arm, **L348** `Try:`, **L393** `Here are the
   closest matches:`; nf **L155**, **L208-210**, **L234-236** all `Would you like me to escalate` (capital);
   ccs **L50** `_merge`. Live nf contains **zero** lower-case `would you like me to escalate`. So the 11
   fixtures are faithful to live's emitted strings, not invented.
3. **Ran the proof.** `node tests/diffs/…marker-proof.js` → **7 arms byte-identical, 4 fixed, 0 regressions**,
   with `block < firstNumberedLine` and `block < escalateInvite` true on every arm that has them.

**The defect was indeed wider than I found** — 4 arms, not 1: D1 multi-token, D1 numbered/uuid, D2 date,
D2 numbered/uuid all fell to the END fallback. Confirmed.

I also checked **exhaustiveness** of the census, which the coder did not claim: the total-miss text on a
crossdomain-eligible turn can only come from `build-suggest-offer`, `not-found-error-message`,
`compile-current-state._merge`, `build-cs-member-offer` or `escalate-catalog`. `build-cs-member-offer`
prepends `cat.response` (which carries the capital-W phrase) so it anchors above the roster ✅.
`escalate-catalog`'s marker-less arms (`clarify_menu`, `demand_qty`, `not_supported`, `out_of_scope`,
`access_choice`, `escalation_declined`) all branch **upstream of get-results**, so `validator` /
`crossdomain-zeroset` never run and `crossdomain-compose` short-circuits at `if (!rNode.isExecuted)` ✅.
Census is materially complete.

**Empirical, with teeth:** exec **`11081139`** — `check stock SRTWC286-SH-NEW-200 and SRTWT58000 and
SRTWC286-SH-NEWW` — hit the D1 multi-token lower-case arm **with** a block **and** a 6-item numbered
candidate list, and rendered `Couldn't find some items:` → block → `"…" — did you mean:` 1–6 → escalate
invite. The tester also recorded the earlier attempt `11080868` as a **textbook false green** (arm never
reached, output merely looked right). That is exactly the discipline this finding demanded.

### F2 (`_xdApplied` in the live session PUT) — **CLOSED, structurally**

Not just deleted — it *cannot* return by another route, and I verified the chain end to end:

- `crossdomain-compose` mutates only `out.user_response`, `out.quick_reply`, `out.variables`; `out` is a
  deep copy of its input. No debug key on any of the three exits.
- Its input is `compile-current-state`, whose tail **rebuilds a whitelisted literal**
  (`output = { variables: {…21 named keys…}, user_response, quick_reply }`, plus the conditional
  `dym_last_result_set`). `_xd` / `_xdBlock` are physically dropped there.
- Belt-and-braces upstream: live `central-exchange` returns `input.output` on the answered path, so the
  namespaced keys are dropped there too.
- Live `save-session-vars` is `PUT … jsonBody: {{ JSON.stringify($json) }}` reading its **input item** —
  post-promote that item is `crossdomain-compose`'s output, i.e. the whitelisted shape. Confirmed against
  exec `11163215`'s `guard-d-record` payload (= the frozen would-be PUT body): keys
  `{variables, user_response, quick_reply}` only.

### F3 (rewire census incomplete) — **CONFIRMED, and still an open promote DECISION, not a defect**

Re-verified against live `a40cd16d`:

- Live `compile-current-state` `main[0]` feeds **exactly two** nodes: `save-session-vars` and
  `sorento-sub-respond-sendmsg-respond2`. (The clone's three include `guard-d-record` / `session-save-gate`,
  which are harness-only.)
- `sorento-sub-respond-sendmsg-respond2` carries **3** by-name reads of `$('compile-current-state')`
  (`.user_response`, `.quick_reply`, `.variables.last_result_set`) — rewiring alone is inert.
- `Call 'sub-respond-save-message-redis'2` (fed from `if-message-is-audio[1]`, i.e. **not** downstream of
  the splice) reads by name:
  ```js
  try { if ($("compile-current-state").isExecuted) { after = $("compile-current-state").first().json.variables ?? null; } } catch (e) { after = null; }
  ```
  That is the C5 state-transition monitor's `after` layer. Post-promote it will log the **pre-append**
  `variables`, while the **persisted** state carries `…. Would you like me to escalate to warehouse team?`
  on partial turns. Observability-only divergence, zero customer impact — but it is precisely the
  logged-vs-persisted drift C5 exists to detect. **The clone reproduces the same wiring** (it also reads
  `compile-current-state`), so this was never going to surface in testing. It is now a mandatory
  promote-checklist decision (repoint, or record deliberately).

**Ships unverified, stated plainly:** the **E1 state-append half** — live's `save-session-vars` HTTP PUT
carrying `variables.response` with the appended phrase — has **never been exercised**, on the clone or
anywhere. The clone writes session via `pg-upsert-session` (a jsonb upsert into `respond_contacts_test`),
a *different node type* against a *different store*. The clone evidence proves the **payload shape** is
right (exec `11163215` `guard-d-record`); it proves nothing about the PUT succeeding or the CRM accepting
it. Post-promote verification on one real partial turn is mandatory, not optional.

### F4 (per-run vs per-turn `returnedCodes`) — **STRUCTURALLY IMPOSSIBLE on the clone. Re-check confirmed.**

I did not assume it:

- `Split Out1` and `Loop Over Items` are **absent** from the clone's node set; `tool-filter[0]` has exactly
  one target (`replay-get-results`); no `splitInBatches` remains on the get-results path (`Loop Over Items1`
  is the media/attachment lane).
- `tool-filter` ends in a **one-element literal** `return [{ json: … }]` (or `return []` on zero tools), so
  arity is structural, not data-dependent.
- Therefore `validator` → `crossdomain-zeroset` runs **once per turn**; the runs cannot disagree.
- Measured: `runData['crossdomain-zeroset'].length === 1` on exec `11163215` (my own read) and on all 36
  subgraph executions in the tool-loop suite.

`crossdomain-probe.executeOnce` is **gone** from the deployed node (node keys = `id, name, onError,
parameters, position, type, typeVersion`). Correct — it was inert (n8n truncates *items within a run*, not
runs), and the tool-loop removal made it moot. The proposed `$runIndex === 0` gate was **not** added; UAC
§TL-X-T3 is right that it would be a condition that can never go false.

⚠️ **But F4 is only closed *on the clone*.** See **N1**.

### Evidence gaps — **CLOSED**

`runs/tool-loop-removal-20260803.md` carries a **case → executionId appendix for all 48** executions plus
a per-case table. **X7 was run for the first time ever** (`11082082` / `11082117`, reply exactly
`Escalation declined.`, `Call 'sub-human-intervention'` absent) and **X8 has an exec id with a runData
assertion** (`11082132` / `11082165`: `2` resolved to `last_result_set[1] = {idx:2, label:"SRTWT5800-FH",
uuid:37946fa7-…}`, i.e. the sibling picker, **not** a cross-domain row). The attribution problem is
resolved. P-CLONE discipline is documented (publish 12:34:09Z, first scored run >2 h later, throwaway
`11078752` discarded).

### The hoist — **RE-AFFIRMED, on a stronger footing than last time**

I re-diffed live `compile-current-state` (527L, sha `fcffb07a5055`) against the clone's (463L, sha
`772f2db12851`) myself. Result: **exactly 2 hunks**, nothing else moved in a 527-line node —

1. a 9-line comment block, and
2. the replacement of the inline `requested[] / returnedCodes / missing[]` computation with
   `$('crossdomain-zeroset')._xd` consumption, plus the `_noun` line.

`getResultObj()` is still referenced 3× elsewhere in the clone body, so no dead function was left behind.
Guards, the `returnedCodes.length === 0` bail, the 10-item cap and the append position are unchanged.

Residual-by-residual, re-checked against the deployed bodies:

- The dropped `fam` field is provably dead in the inline copy (`missing` reads only `rq.strict` / `rq._n`) ✅
- **Correction to a worry I had while reading:** zeroset's AND-mode fallback (L71) passes
  `_add(m.canonical_code, m.uuid, false)` — it does **not** pass `null` for uuid. So the cross-domain probe
  is uuid-capable on both resolver branches; there is no silent inertness. ✅
- The deliberate `returnedCodes.size === 0` divergence is correctly reinstated inside #3's own guard ✅
- `for (const c of prev) _pick(c)` → `_add(c, …, true)` (a numeric-`0` dym pick) remains vanishing ✅

**Sampling status, corrected.** The prior review asked whether AND-mode / dym-picked turns had since been
exercised. They have **not**, and the run log's claim that they were is wrong:
`runs/tool-loop-removal-20260803.md` §TL-R11 labels `check stock for SRTWT5800 and SRTWC286-SH-NEW-200` as
"AND-mode" and concludes *"the hoist's AND-mode path (never sampled before) is correct"*. The parser's
`match_mode:"and"` is **not** the resolver-branch selector; zeroset branches on whether
`resolve-entity.resolutions` is an array. I pulled `resolve-entity` for the equivalent turn (exec
`11163215`) and it returned a populated `resolutions[]` with
`fallback_match_mode:"or", fallback_reason:"AND-mode produced zero intersection; switched to OR-mode…"`
— i.e. the **OR** branch ran. **Zeroset's `_or === null` branch remains unsampled**, as does the
DYM-PICKED strict path (§TL-DYM's pick was a certification turn, which zeroset gates off at `domain`).
Sign-off wording stands: *equivalence established by inspection, re-verified today by byte diff, with the
resolver-AND-mode and PICKED-strict paths unsampled.* Not *"proven by §TL-R11"*.

---

## 3. New findings

### 🚩 N1 — **BLOCKING (ordering).** Promote `tool-loop-removal` FIRST, or F4 ships live.

Live still has `tool-filter → Split Out1 → Loop Over Items → Call 'sub-get-results'`, and
`Loop Over Items[0] → Aggregate1`. On a **multi-tool** turn live runs `validator` N times, so the splice
would run `crossdomain-zeroset` N times, and per-run `returnedCodes` vs per-turn `missing` can disagree —
the exact F4 hazard, which produces a *spurious cross-domain claim and an armed escalate offer on a turn
that did answer*.

Multi-tool turns are **real on live**: exec `11049139` returned 2 tools, and the tool-loop tester found 2
tools in 62 of 63 sampled live inventory executions up to 11:01:39Z on 2026-08-03, with the 1-tool state
arriving only that afternoon **by embedding/registry data, with no workflow change** (their finding F-C).
That state can revert. F4's closure is a property of `tool-loop-removal`, not of this change.

`tool-loop-removal` is already **APPROVED** (`reviews/tool-loop-removal.md`). This is an ordering
constraint on the promote sequence, not a code change.

### 🚩 N2 — **BLOCKING (artifact selection).** The deployed `crossdomain-render` is entangled with `crossdomain-attachment`.

`crossdomain-render` at `a5cf2434` is **not** the crossdomain-only body. The attachment change added
`XD_FILES`, `ATTACH_NOTE = 'I have attached the file(s) below.'`, the `mention` suffix on `_xdBlock.block`,
and an `attachments: XD_FILES` key (sha `2f0f3f7a…` → `5c0067a9…` leadin → **`f711fd2c7eb3`** now,
5786 → 7576 chars).

If the crossdomain change is promoted alone with the *deployed* body, an incoming-direction probe whose
envelope carries a packing list will make live say **"I have attached the file(s) below."** with **no
delivery chain promoted** — `attach-merge`, `presign-fail-notice`,
`sorento-sub-respond-sendmsg-presign-fail` and the `if-got-attachments` re-rooting are all part of the
*other* change. Reachable and observed: exec `11163215` produced exactly that sentence inside `_xdBlock`
with `FFAU3176932.xlsx` attached at envelope level.

**The crossdomain-only body is recoverable and I verified it:** backup
`n8n-workflows-init/backups/clone-txiPzSxy3Pclsz6v-a0f434f9-20260804-xdattach-before.json` holds
`crossdomain-render.jsCode` at sha256[:12] **`5c0067a97d36`**, 5786 chars, with the reworded lead-in
present and `ATTACH_NOTE` / `XD_FILES` / `attachments:` absent. Promote **that** body, or promote both
changes together — user's call, but it must be a decision, not a default.

*(Ownership: the attachment change itself is a different reviewer's. I am only ruling on which
`crossdomain-render` bytes this change may promote.)*

### N3 — record. `tests/harness/crossdomain-render.reference.js` is **still stale**

3960 chars vs the deployed 7576; it contains no `LEAD` const at all, let alone the reworded one. My prior
documentation-drift finding is **not** closed. A stale "reference copy" is precisely how a future promote
ships the wrong body (LESSONS §57). Delete it or resync it before promote.

### N4 — record. The lead-in reword's core claim is **verified in deployed code**

The coder's argument that `compile-current-state._noun` and `crossdomain-zeroset.origin_domain` cannot
disagree holds: both read `$('Call \'sub-query-reformulator\'').first().json.output.domain_hint` — same
node, same expression, same run (`compile-current-state` L2 → L235 `const dh = qf.domain_hint`;
`crossdomain-zeroset` L8-11). The 2026-08-03 "stock details" collision objection is genuinely dead. The
inventory-direction lead-in is byte-unchanged. Empirically re-baselined on the current build
(`crossdomain-attachment-20260804.md` §4 M2: `-But there is stock ON HAND…` / `+But here are the stock
details…`, one substitution, all 6 stock rows and the `Related products:` list byte-identical to P-BASE).

### N5 — record. `marker-proof.js` is a demonstration, not a gate

It prints; it never asserts and never exits non-zero. Its last case prints
`ASSERT block above escalate invite: false` — which is **not** a failure (that arm has no escalate invite,
so the index is `-1`), but a future reader scanning for `false` will misread it. The proof's value comes
from my having re-derived its fixtures against live, plus exec `11081139`. Don't cite it as a gate.

### N6 — record. The **new** marker `Here are the closest matches:` was never reached on a real turn

Two attempts (`11081164`, `11081495`) hit other arms. Its correctness rests on the live source lines
(bso L252, L393 — which I read) and the local proof. Low risk; the arm is a promotion/uuid-candidate path.

### N7 — record. The clarify arms keep the END fallback, by design

nf L134/L149/L176/L187 (`missingAttachmentType`, `needsScope`, vague-token, `require_specific`) carry no
marker and no escalate invite, so the block appends at the end, below the clarify question. `require_specific`
goes `If3`-TRUE and never reaches `validator` (so it is unreachable with a block); the vague-token arm
needs a `confident:false` token to co-occur with a resolved-exact zero-row product — reachable but rare,
and the ordering cost is cosmetic. Accepted residual.

### N8 — P0, recorded only, **do NOT fix, do NOT bundle**

Live `Call 'sub-get-results'` and `probe-incoming` point at **`rysSPgUssLDf6xJc`** (`sub-get-results TEST`)
— confirmed by me in the live JSON. (Live `sibling-probe` correctly points at `Fss5aAaXthJSWpZCgKiKR`.)
Byte-identity was verified by the user; no defect today, but any "harness-only" edit to that fork is an
ungated live change that passes §0. Separate user-gated change.

---

## 4. Green-that-cannot-fail audit

**Genuinely falsifiable (stake the review on these):**

- **Exec `11163215`, read by me on the current build.** Node-by-node runData: single runs, fork sub-exec,
  read-only tool, compose output key set. A broken build changes these values.
- **Exec `11081139` (T1).** The one turn that actually rendered a lower-case `did you mean:` arm *with* a
  block *and* a numbered list. Its predecessor `11080868` is documented as a false green — the tester
  showed the check can produce a comfortable wrong answer and then discarded it.
- **My own byte diff of `compile-current-state` live↔clone: exactly 2 hunks.** Would go red on one stray line.
- **§TL-M-BYTE** — same clone, same two messages, pre vs post, sha equal.
- **§XA-FP-B** — the attachment suite's mention gate was **induced RED** on purpose. That is the pattern
  every §0 assertion should aspire to.
- **X7** (`Escalation declined.` exact string) and **X8** (a wrong pick surfaces a different product code).
- **§0 S7 by sink-delta + attribution** instead of bare LLEN.

**Weak — passes on an inert build; kept only because a positive case from the same build exists:**

- FP1 / X2 / X9 / X10 (all negatives). Paired with X1/X3/§XA.1, which show the block *does* appear.
- **§TL-X-T3 / §TL-X-T4 as observations.** P-BASE `11067200`/`11067219` also showed `crossdomain-probe: 1`
  *with the loop still present*, because they were 1-tool turns. What closes F3/F4 is the **structural**
  absence of `splitInBatches` on that path, which I re-derived from the deployed JSON — not the 9 greens.
  The tester says this himself; I concur and am relying on the structural half.
- **§TL-R11's "AND-mode" label** — see §2. The claim is not established; disregard it.

**Instruments still not shown red:**

- **§TL-FP1** (the mandatory miss-path fault injection: unwire `If6.main[1]`, re-run §TL-M1/M2) — **not
  discharged**, because the tester may not publish a mutation. The clone's 15 miss-path greens therefore
  rest on an instrument validated in a *different* population (21 happy-path executions correctly reporting
  the miss nodes absent). This is the largest remaining hole and it belongs to `tool-loop-removal`'s
  approval, not to this change — but it sits underneath this change, so it is inherited risk.
- **§XA-FP6** (prove the S1 orphan census can go red) — not run. My §0 orphan claim is a set computation
  over the deployed connection map; it is checkable but has never been demonstrated red.
- **F-E harness hazard** (`runs/tool-loop-removal-20260803.md`): the dev contact's **prod** session is
  stale-contaminated and `uac` mode reads it, so any non-domain-decisive UAC message can produce a
  plausible green answer to the wrong question. Three runs were lost to it. Any future crossdomain UAC
  should use `mode=regress-capture` (LESSONS §31).

---

## 5. What ships unverified

1. **The E1 state-append on live's HTTP PUT** (`save-session-vars`). Never exercised anywhere — the clone
   writes via `pg-upsert-session`. Payload shape proven; the write itself is not. **Verify post-promote on
   one real partial turn.**
2. **The C5 `state_trace.after` divergence** (F3) — whichever way it is decided, the decided behaviour is
   unverified until a post-promote partial turn is logged.
3. **The `Here are the closest matches:` marker** (N6) — logic-proven only.
4. **Resolver AND-mode (`resolutions` absent) and DYM-PICKED-strict** paths through `crossdomain-zeroset` —
   code-equivalent to the archived inline copy (re-verified today), never executed.
5. **RISK-3** (accepted at plan time): the escalate phrase now arms on partial turns that *did* return data,
   so a subsequent bare "yes" is a real staff assignment. User-accepted (Q8b). Watch for a few days.
6. **Byte-identity of the X9/X10 no-ops against live** — not measurable on the clone, which carries the
   unpromoted splice.

---

# PROMOTE CHECKLIST (user-gated — supersedes the 2026-08-03 checklist entirely)

## A. Order and artifact selection — do these decisions first

- [ ] **A1 (N1, blocking).** Promote **`tool-loop-removal` BEFORE this change**, or accept F4 live on
      multi-tool turns. After A1, live must show `If6.main[1] → Aggregate1` and no `Split Out1` /
      `Loop Over Items`.
- [ ] **A2 (N2, blocking).** Decide the `crossdomain-render` body:
      **(i)** crossdomain-only → promote sha256[:12] **`5c0067a97d36`** (5786 chars) from
      `backups/clone-txiPzSxy3Pclsz6v-a0f434f9-20260804-xdattach-before.json`; **or**
      **(ii)** bundle with `crossdomain-attachment` (its own reviewer's sign-off required) and promote the
      `f711fd2c7eb3` body **together with** `attach-merge`, `presign-fail-notice`,
      `sorento-sub-respond-sendmsg-presign-fail`, `get-presigned-url` and the `if-got-attachments`
      re-rooting. **Never** ship `f711fd2c7eb3` without the delivery chain.
- [ ] **A3 (F3).** Decide `Call 'sub-respond-save-message-redis'2`: repoint `state_trace.after` to
      `crossdomain-compose`, **or** record the logged-vs-persisted divergence deliberately in
      `docs/LESSONS.md` + the C5 memory. Silence is not an option.
- [ ] **A4 (N3).** Delete or resync `tests/harness/crossdomain-render.reference.js` (currently 3960 chars
      vs the deployed 7576, no `LEAD` at all).

## B. Pre-flight

- [ ] Backup live `activeVersionId` `a40cd16d-c404-4d82-bc46-8a2e756e9dc1` — re-verify
      `backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-a40cd16d-20260803.json` still matches the live GET.
- [ ] Re-run the **draft == active** check immediately before publishing (LESSONS §24/§51). Verified clean
      today: 0 differing nodes, connections byte-identical.
- [ ] Confirm the permission allow-rule for `mcp__n8n-mcp__update_workflow` + `publish_workflow` exists
      (LESSONS §58a — the assistant cannot self-grant).

## C. The promote

- [ ] **`compile-current-state`:** build the target as **LIVE 527L + the two verified hunks only** → 463L.
      `diff live ↔ target` must show *only* the comment block and the hoist-consumption/`_noun` hunk.
      **Do not block-copy the clone body.**
- [ ] **Add the 5 new nodes** (`crossdomain-zeroset`, `-gate`, `-probe`, `-render`, `-compose`).
      Splice: cut live's single `validator → If6` edge; wire
      `validator → zeroset → gate → {TRUE: probe → render → If6 | FALSE: If6}`,
      and `compile-current-state → crossdomain-compose`.
- [ ] **Remap `crossdomain-probe.workflowId`: `rysSPgUssLDf6xJc` → `Fss5aAaXthJSWpZCgKiKR`.**
      (Note N8: the live spine's other two callers already point at the TEST fork. Do **not** "fix" them here.)
- [ ] **Do NOT copy `is_test` anywhere** (LESSONS §48a). `crossdomain-probe`'s `workflowInputs` carry no
      `is_test` today — keep it that way.
- [ ] **Repoint live `sorento-sub-respond-sendmsg-respond2`'s three by-name expressions**
      `$('compile-current-state').first().json.{user_response, quick_reply, variables.last_result_set}`
      → `$('crossdomain-compose')`. **Rewiring alone is inert.**
- [ ] **Rewire BOTH live consumers** of `compile-current-state` — `save-session-vars` **and**
      `sorento-sub-respond-sendmsg-respond2` (two, not the clone's three) — to sit behind
      `crossdomain-compose`. Omitting `save-session-vars` means the partial-turn "yes" never reconciles.
- [ ] Verify every by-name dependency of the new nodes exists on live with an identical name: `validator`,
      `If6`, `resolve-entity`, `get-session-vars`, `Call 'sub-query-reformulator'`,
      `sorento-sub-respond-findcontact-respond`, `Aggregate`, `central-exchange`, `compile-current-state`
      — all present ✅.
- [ ] Target by **node NAME, never clone IDs** (`compile-current-state` is clone `7a130a0c` / live
      `0804657c`; `not-found-error-message` clone `5fabfbe3` / live `b5f79139`; `build-suggest-offer`
      `7972abd8` on both). Strip trailing whitespace. Per node: update draft → re-fetch → **byte-SHA gate
      draft == file** → publish only on match → re-fetch **active == file** (LESSONS §58).
- [ ] `publish_workflow` after `update_workflow`.

## D. Post-promote (LESSONS §56 — verify the path you changed, not a happy path)

- [ ] Smoke `Pls check eta SRTWT5800` (read-only) — expect the block above `Related products:` and the
      reworded lead-in `But here are the stock details for the requested products:`.
- [ ] Smoke an **inventory partial** turn (`check stock for <answered> and <empty>`) and, on that turn:
      **read the real `save-session-vars` PUT body** — assert `variables.response` ends with the phrase and
      that no `_xd*` key is present. This is the unverified E1 half.
- [ ] Confirm `crossdomain-zeroset` ran **exactly once** on a live turn (post-A1 this should be structural).
- [ ] **Do NOT smoke the "yes" leg on a real contact** — RISK-3 means it is a real staff assignment ripple.
- [ ] Watch for a few days: partial-turn escalate offers, and (if A2(ii) was taken) attachment delivery.

## E. Rollback

- [ ] `publish_workflow` `a40cd16d-c404-4d82-bc46-8a2e756e9dc1`.
- [ ] #3 alone restorable from `tests/diffs/zerostock-inline-computation-preserved.js` (verified byte-exact
      against live `compile-current-state` 220–321 in the prior review).

---

**Scope/tier:** `deterministic` — Code / If / executeWorkflow(read) only; no parser edit, no LLM node added.
Matches what was tested. (Several tool-loop cases were declared **parser-tier runs of a deterministic
change** because they need real classification; that is correctly declared and does not weaken any
assertion.)

**Live spine confirmed untouched at review time:** `9qVyfUxmRQqrpGRMDLRuz`,
`versionId == activeVersionId == a40cd16d-c404-4d82-bc46-8a2e756e9dc1`,
`updatedAt 2026-08-02T23:34:18.534Z`, zero `crossdomain*` nodes, zero draft-vs-active deltas.
