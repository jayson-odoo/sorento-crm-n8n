# Review — `mc-label-n8n` (multi-company reply clarity, n8n half)

**Reviewer pass 1** 2026-08-17 — REQUEST-CHANGES (3 blockers) · commit `a0d2a45`
**Reviewer pass 2 (re-review)** 2026-08-17 — **APPROVE** · this document

Branch `fm/mc-label-n8n` · coder diff `n8n-workflows-init/tests/diffs/mc-label-n8n.md` · tester rollup
`n8n-workflows-init/tests/runs/mc-label-n8n-rollup.md` (5/5 PASS)

**n8n MCP unavailable in both passes.** Every check was made read-only over the public REST API
(`GET /workflows/{id}`, `GET /executions/{id}?includeData=true`, `GET /executions?workflowId=…`). No PUT/POST/DELETE
was ever issued. No workflow was edited by the reviewer.

---

# VERDICT: APPROVE

All three pass-1 blockers are closed, and I re-verified each independently rather than accepting the report.

| # | blocker | closed by | independently verified |
|---|---|---|---|
| **B1** | `output-structurer` could assert absence from a negative — declare every lookup company empty underneath rows it just printed | coder `b234cdd` — `_canAttribute` guard | **yes** — server sha, hunk diff, and 5-shape replay incl. the exact failure shape |
| **B2** | promote mapping missed `Fss5aAaXthJSWpZCgKiKR`, which serves 5 of live's 8 get-results call sites | diff doc revised — both subs now MANDATORY, with the call-site table and subs-before-spine order | **yes** — re-read the doc; call-site table matches my enumeration |
| **B3** | multi-company **with rows** never executed; the row-stamp half of the wire contract never observed | tester `97fb449` — case 4 (`MUB5202`) + case-1 recheck | **yes** — pulled execs `12778370` / `12778383` / `12778877` myself |

Zero egress remains clean across all five cases. Promotion stays **user-gated**; the finalized checklist is §7.

---

## 1. B1 — closed and verified

### 1a. The published body is what the coder says it is

| check | result |
|---|---|
| `t4QvrtrPnTwRU6br` versionId | `179f1842-8061-4e59-9c72-74ad2b602f29`, `== activeVersionId`, `active: true` |
| server `output-structurer` jsCode sha256 | `25a2eed93b7fe677a6e1d7d9002522fc3051e4bae415ebe645377ad25f4973de` |
| committed artifact sha256 | `25a2eed93b7fe677a6e1d7d9002522fc3051e4bae415ebe645377ad25f4973de` — **MATCH** |
| structural re-diff vs pre-edit backup | still **only** `output-structurer.parameters.jsCode`; no node added/removed; `connections` / `settings` / `pinData` / `staticData` identical |

The artifact was rewritten from the server's copy, so the promote artifact and the tested body are the same bytes.

### 1b. The delta is exactly the two changes I asked for — nothing rode along

`diff -u` of the pass-1-reviewed artifact against the new one yields two hunks and no others:

1. `const _canAttribute = !(e.items || []).length || _shownCos.size > 0;`, applied as
   `if (_canAttribute && _silent.length) …`
2. the json spread gate tightened from `_lookupCos.length` to `_lookupCos.length > 1` (pass-1 finding 1, endorsed)

No third edit slipped in. The comment block records the reasoning and cites the shared-passthrough evidence, so the
next reader will not "simplify" the guard away.

### 1c. Replayed against the live pre-change body — the failure mode is gone, nothing else moved

Re-ran my pass-1 harness (10 shapes) plus 5 new ones, all against the **live** `rysSPgUssLDf6xJc` body:

| shape | pass-1 body | new body |
|---|---|---|
| **rows present, NO row stamped** (the B1 failure) | `1. *Product Code:* MWC-SC08B *Qty:* 12` **+ "*Mocha:* no stock records… *Sorento:* no stock records…"** | `1. *Product Code:* MWC-SC08B *Qty:* 12` — **silent, correct** |
| `lookup_companies` with 1 element | json gained a stray key | **byte-identical to old** — gate now symmetric |
| single-co stock found / stock empty / `incoming_stock` under projection / unkeyed orders | identical | **still byte-identical** |
| all empty, 2 companies (case 1) | both per-company lines | **unchanged** — `items` empty ⇒ `_canAttribute` true |
| Mocha rows + Sorento silent (case 4) | — | one `*Sorento:*` line, **none** for Mocha |
| both companies have rows | — | **no** silent lines at all |

The guard is correctly one-sided: it suppresses only the case where the node cannot tell, and leaves every case where
it can tell exactly as specified.

### 1d. Residual, non-blocking

**Partial stamping.** If *some* rows carry `company_name` and others do not, `_shownCos` is non-empty so
`_canAttribute` is true, and a company whose only row was the unstamped one would still be wrongly called silent.
Replayed: rows `[Mocha, <unstamped>]` still emits `*Sorento:* no stock records for MUB5202.` This is far narrower than
the systemic case B1 covered — the presenter stamps from a company-name map, so an unstamped row means a row whose
`company_id` is NULL, not a deploy-skew shape. **Recorded, not blocking.** If you ever want it airtight, the stricter
gate is "every row is attributed" (`_shownCos.size > 0 && (e.items||[]).every(_coOfRow)`); I am not asking for it,
because it would trade a real behaviour (case 4) against a hypothetical row with no company.

---

## 2. B3 — closed, and it did what a UAC case is for: it proved the wire

Case 4 (`MUB5202 check stock`, exec `12778370`, sub-exec `12778383`) is the shape whose absence blocked pass 1. I
pulled the sub-execution and read the envelope directly rather than trusting the summary:

* **Row-stamp confirmed on the wire.** Both rows' `fields[0]` is literally
  `{"key":"company_name","label":"Company","value":"Mocha"}` — a *leading* field, exactly the contract the scout
  report specified and which nothing in the previous cycle had ever shown. The assumption pass 1 flagged as unverified
  is now a measurement.
* **`lookup_companies`** present with both companies; carried through into the returned json.
* **Rendered response** (verbatim from `output-structurer`):
  `"Stock details found for the requested products.\n\n1. *Company:* Mocha … 2. *Company:* Mocha …\n\n*Sorento:* no stock records for MUB5202.\n\n_Data last updated: …_"`
  → `*Company:*` on every row, **exactly one** silent-company line, and **none** for Mocha, which did return rows.
  This is the whole change working against real CRM data.
* **Executed against the fixed body**: the execution's own `workflowData` carries jsCode sha
  `25a2eed93b7f…` — I hashed it from the execution payload, so the run provably used the B1 code, not the old body.
* **Case-1 recheck** (exec `12778877`) on the republished sub: `not-found-error-message.escalate_message` is
  `"Here's what you want:\n• product: MWC-SC08B (Mocha), MWC-SC08B (Sorento)\n\nBut no inventory matched these — checked in Mocha and Sorento. …"`
  and `_xd.missing[0].uuids` carries both uuids. No regression from the B1 fix on the all-empty path.

### The one open item, and why it is genuinely not a blocker

The `incoming_stock` presenter's row-stamp is **still unobserved** — 5 probes did not surface a multi-company product
with actual incoming rows. The tester reported this loudly instead of quietly dropping it, which is the right call.

I agree it does not block, and the reason is specifically the B1 fix: `_canAttribute` is the same code on both
presenters, so **n8n is correct under either backend outcome.** If the incoming presenter stamps, the labels are
right; if it does not, the block goes silent rather than lying. Before B1 this open item would have been a blocker.
It is now an observability gap, carried into the checklist as a post-promote watch item (§7 P4) rather than a gate.

---

## 3. B2 — closed

The diff doc's promote mapping now reads *"BOTH live subs, MANDATORY — `rysSPgUssLDf6xJc` AND
`Fss5aAaXthJSWpZCgKiKR`"*, carries the call-site table, and states the subs-before-spine order (LESSONS 37). The table
matches my own enumeration of every `executeWorkflow` node in the live spine:

| target | live call sites |
|---|---|
| `rysSPgUssLDf6xJc` | `Call 'sub-get-results'`, `probe-incoming`, `tier-probe` |
| `Fss5aAaXthJSWpZCgKiKR` | `sibling-probe`, `crossdomain-probe`, `dym-probe`, `dym-probe-partial`, `promo-dym-probe` |

Both subs' `output-structurer` remain byte-identical today (`68bd130c…`), so one artifact covers both with no rebase.

---

## 4. Zero egress — re-confirmed across all five cases

Re-verified after the B1 republish, not carried over from pass 1.

* **Structural.** `t4QvrtrPnTwRU6br` still differs from its pre-edit backup in `output-structurer.parameters.jsCode`
  **only**; `txiPzSxy3Pclsz6v` is untouched since the first publish (`63967fff…`, updatedAt 2026-08-17T01:33), and its
  two node bodies still match their committed artifacts (`cfd8a380…`, `2c562c7e…`). No egress node, connection,
  setting or pinData moved in either workflow at any point.
* **Runtime (execs `12778370`, `12778877`).** `save-session-vars`, `update-human-intervened`,
  `send-message-files/images/video` and `Call 'sub-human-intervention'` are **absent from runData**. The only HTTP
  nodes that executed are `get-session-vars-http` (GET), `resolve-entity-http` and `check-access-http` (read queries).
  The clone's sole PUT node never ran and is orphaned.
* **S1 swept, not sampled.** I pulled **all 8** `aQUmwMVplmNcyUVc` sendmsg sub-executions in the session window
  (`12776629` … `12778889`). Every one has runData
  `[When Executed by Another Workflow, chat-build-parts, chat-push, chat?, console-loggable?, log-chat-history-n8ntest]`
  — the respond.io `HTTP Request` node executed in **none** of them. Delivery was redis `chat-push` throughout.
* **S4/S5.** Tools: `crm_inventory_stock_balance_list`, `crm_incoming_stock_list` — reads only;
  `crm_it_support_ticket_create` appears nowhere. Both new runs carry `mode:"uac"`, `scope:"chat-console"` and a
  `test_run_id` matching their seed.

### Live workflows: untouched, and every promote baseline still current

| workflow | id | versionId (== activeVersionId) | updatedAt |
|---|---|---|---|
| live spine | `9qVyfUxmRQqrpGRMDLRuz` | `469e7259-6cfb-4505-bef4-f37a36bf454f` | 2026-08-11T16:23:58Z |
| live sub `sub-get-results TEST` | `rysSPgUssLDf6xJc` | `eb0bbcec-daab-4c79-8a68-c7d5eca5cf0a` | 2026-08-10T06:13:06Z |
| live sub `sub-get-results` | `Fss5aAaXthJSWpZCgKiKR` | `fd248b16-82ee-4307-abfb-657b9b6a4aa7` | 2026-08-11T00:50:25Z |

Nothing live was written across either pass.

---

## 5. Carried forward from pass 1 (still valid, unchanged by the fix)

* **Single-company output byte-identical** — independently replayed against the live pre-change bodies, 4/4 shapes for
  `output-structurer` and 5/5 for `crossdomain-zeroset`. This is the property the captain's refinement turns on.
* **Captain's rule honoured** — labels key on `e.lookup_companies` and `gate.compatible_entities` (what was sent to
  the tool), never on `Aggregate`/the caller's access list.
* **No state pollution** — `compile-current-state` is explicit-key (not `{...json}`), so `lookup_companies` never
  reaches persisted session vars; `_xd.missing[].uuids` is inert in both its consumers; `found_summary` is consumed by
  `build-suggest-offer` as display text only, never parsed for codes.
* **Drift** — the `not-found-error-message` promote artifact diffs against live current as **exactly** the four
  mc-label hunks; no clone drift is promoted. The clone's `disallowed-entity-gate` remains behind live (0
  `access_notice` occurrences vs live's 4), so the Q23 prefix cannot be exercised on the clone — **follow-up: rebase
  the clone's gate in a separate change, not this one.**
* **Non-blocking findings** — `crossdomain-probe`'s prompt now repeats the code (`"for: MWC-SC08B, MWC-SC08B"`,
  cosmetic, would need a node-parameter edit); `_add`'s new `if (!ex.uuid) …` is unreachable today; `_coOfRow`'s
  `label === 'Company'` fallback would misread an orders envelope if `lookup_companies` ever rides one; `_foundLines`
  drops the `(+N more)` cap when `_multiCo` (consider grouping as `MWC-SC08B (Mocha, Sorento)` later); `_bareLabel`
  strips one trailing parenthetical in the multi-company case only.
* **Regression** — `uuids` and `lookup_companies` are *conditional* keys, so LESSONS 40's `norm()` rule does not
  apply; a full-corpus replay will legitimately diff on multi-company turns. That is the change, not a regression.

---

## 6. Scope / tier

Business-logic `jsCode`-only change across three Code nodes, exercised at the live-parser + live-read tier — correct,
since a mock would have hidden the very wire contract case 4 proved (LESSONS 28). Five cases now cover: multi-company
all-empty, multi-company with rows (partial), single-company not-found, single-company found, and an all-empty
recheck post-fix. That is the found / not-found / partial matrix the scout report scoped the fix to.

---

# 7. PROMOTE CHECKLIST (final)

**Promotion is USER-GATED. This checklist authorises nothing; it is what must be true when the user gates it.**
Three artifacts → **four** target nodes. No guard scaffolding to strip: this change built no `IF test_mode` gates and
touched no egress node, and all three artifacts are live-based, so the promoted diff *is* the business-logic diff.

### P1 — artifact → target mapping

| # | artifact (sha256, final) | target workflow | node | target's current sha256 — **gate on this** | revert versionId |
|---|---|---|---|---|---|
| 1 | `output-structurer.js`<br>`25a2eed93b7fe677a6e1d7d9002522fc3051e4bae415ebe645377ad25f4973de` | `rysSPgUssLDf6xJc` | `output-structurer` | `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` | `eb0bbcec-daab-4c79-8a68-c7d5eca5cf0a` |
| 2 | `output-structurer.js` *(same bytes)* | `Fss5aAaXthJSWpZCgKiKR` — **MANDATORY** | `output-structurer` | `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` | `fd248b16-82ee-4307-abfb-657b9b6a4aa7` |
| 3 | `not-found-error-message.js`<br>`cfd8a3804d2f4cb28acd247bc990692b19f8e58379728a2a923655c9ead982cb` | `9qVyfUxmRQqrpGRMDLRuz` | `not-found-error-message` | `d796e28d84e302130546e750eafaa901f9d5cfb81093a4f401c616536891fee3` | `469e7259-6cfb-4505-bef4-f37a36bf454f` |
| 4 | `crossdomain-zeroset.js`<br>`2c562c7e974fa043e5bffe12b10ab97ed523c19df04196a1980119a2e4d4ff42` | `9qVyfUxmRQqrpGRMDLRuz` | `crossdomain-zeroset` | `2eef3fa37454d5931e50747631df0463e152afdd58e6aeecea0a804040646245` | `469e7259-6cfb-4505-bef4-f37a36bf454f` |

All four baseline shas re-read from the server at the time of this re-review. Artifacts live in
`n8n-workflows-init/tests/diffs/mc-label-n8n/`.

### P2 — pre-flight, per target, before any write
- [ ] Re-fetch each target; confirm `versionId == activeVersionId` and `active == true` (no unpublished draft —
      LESSONS 24: publish ships the *whole* draft, and a stale draft is a revert-landmine).
- [ ] Re-confirm the target node's current jsCode sha equals the P1 value. **Mismatch ⇒ STOP and re-review** — live
      moved and the artifact's baseline is void.
- [ ] Back up each full target workflow JSON to `n8n-workflows-init/tests/backups/mc-label-n8n/` with a
      `-promote-pre` suffix; record its versionId (P1) as the revert target.
- [ ] `diff -u <live node body> <artifact>` and confirm the hunks are exactly the mc-label hunks. (I ran this for all
      four during review; re-run at promote time — it is the cheapest possible check.)

### P3 — publish: byte-exact, sha-gated (LESSONS 25 / 32 / 33 / 37)
- [ ] **Subs before the spine.** Order: `rysSPgUssLDf6xJc` → `Fss5aAaXthJSWpZCgKiKR` → `9qVyfUxmRQqrpGRMDLRuz`.
      A parent only ever sees a sub's *published* version.
- [ ] Never hand-retype a 17–23 KB `jsCode`. Source the exact bytes from the committed artifact file.
- [ ] **If MCP is available:** `setNodeParameter {nodeName, path:"/jsCode", value}` — one leaf, byte-exact — batched
      into a single `update_workflow` per workflow (the spine gets both nodes in one atomic call).
- [ ] **If MCP is unavailable (as in this cycle):** `PUT $N8N_API_BASE/workflows/{id}` with a **settings-whitelist**
      body, then `POST $N8N_API_BASE/workflows/{id}/activate`. Both must return 200. The PUT schema rejects some
      settings keys — carry `executionOrder`, `availableInMCP`, `callerPolicy` and (spine) `binaryMode` through
      explicitly and re-verify them after.
- [ ] **Gate the draft BEFORE publish:** re-read the draft node body; its sha must equal the artifact sha.
      Draft ≠ intended ⇒ **do not publish**.
- [ ] **Gate the active AFTER publish:** `versionId == activeVersionId`, `active == true`, node count unchanged,
      `connections` / `settings` / `pinData` identical to the P2 backup, and the **only** differing node is the
      intended one at the intended sha.
- [ ] **Any mismatch at either gate ⇒ auto-revert now:** publish the P1 revert versionId for that workflow, confirm
      `active`, and halt the entire promotion — do not proceed to the next target.

### P4 — post-promote verification on live
- [ ] All four target nodes at the artifact shas; **no other node** in any of the three workflows differs from its
      P2 backup.
- [ ] First live **multi-company with rows** turn: `*Company:*` on every row, and **no** "no … records" line under a
      company that did render rows (the case-4 shape).
- [ ] First live **multi-company all-empty** turn: both company names in the reply and the
      ` — checked in A and B` suffix (the captain's reported case).
- [ ] First live **single-company** turn: byte-identical to yesterday — no `(Company)` suffix, no ` — checked in`,
      no `Company:` row field.
- [ ] **Crossdomain path specifically** (a code that misses in inventory and spans two companies): confirm both uuids
      are probed. This is the half P1 #2 exists to enable.
- [ ] **Open item — `incoming_stock` row-stamp** (§2). Watch the first live multi-company *incoming* answer that
      returns rows: either it carries `*Company:*` (backend stamps — labels correct) or it stays silent
      (`_canAttribute` false — correct by design, no false statement either way). If silent, raise a backend
      follow-up to stamp the incoming presenter; **do not** patch it in n8n by loosening the guard.
- [ ] Keep the P2 backups and P1 versionIds to hand for the first full day; revert is a single publish.

### P5 — do not
- [ ] Do **not** promote `output-structurer` to only one of the two subs.
- [ ] Do **not** edit live mid-cycle for anything else while this promotion is open.
- [ ] Do **not** fold the clone `disallowed-entity-gate` rebase (§5) into this promotion.

---

## Appendix — what the reviewer checked, across both passes

Read-only REST only. `GET /workflows/{9qVyfUxmRQqrpGRMDLRuz, txiPzSxy3Pclsz6v, t4QvrtrPnTwRU6br, rysSPgUssLDf6xJc,
Fss5aAaXthJSWpZCgKiKR}` (twice — pre- and post-B1). `GET /executions/{12774464, 12774472, 12774475, 12774477,
12775076, 12775298, 12772435, 12772436, 12774879, 12774978, 12775028, 12775089, 12775091, 12775311, 12775948,
12778370, 12778383, 12778877}?includeData=true` plus all 8 `aQUmwMVplmNcyUVc` sendmsg sub-executions in the window.
`GET /executions?workflowId={t4QvrtrPnTwRU6br, aQUmwMVplmNcyUVc}`. Node-by-node structural diff keyed on stable node
`id` (LESSONS 20) against the committed pre-edit backups. Old-vs-new pure-function replay against the **live**
pre-change bodies — 7 shapes for `crossdomain-zeroset`, 15 for `output-structurer` across the two passes — with
mocked `$()` / `$input`. `new Function` parse of all three artifacts. jsCode sha recomputed from execution
`workflowData` to prove which body actually ran. No production host was probed; no repo-hardcoded credential was used
against live beyond the read-only `N8N_API_KEY` supplied with the task.
