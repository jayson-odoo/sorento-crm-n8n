# Review — `mc-label-n8n` (multi-company reply clarity, n8n half)

**Reviewer pass** 2026-08-17 · branch `fm/mc-label-n8n` · coder diff `n8n-workflows-init/tests/diffs/mc-label-n8n.md` · tester rollup `n8n-workflows-init/tests/runs/mc-label-n8n-rollup.md`

**n8n MCP unavailable this session.** Every check below was made read-only over the public REST API
(`GET /workflows/{id}`, `GET /executions/{id}?includeData=true`). No PUT/POST/DELETE was issued. No workflow was edited.

---

# VERDICT: REQUEST-CHANGES

Two blocking items, both narrow. **Zero-egress is clean and independently re-confirmed** — the safety axis passes without
reservation. The change is blocked on a correctness gap, not a safety one:

* **B1** — the new empty-company block in `output-structurer` can emit a **self-contradictory message** on the exact
  multi-company shape that was never observed on the wire. One-line guard fixes it.
* **B2** — the promote mapping is **incomplete**: live splits its 8 `sub-get-results` call sites across **two** subs, and
  the artifact is mapped to only one. Promoting as written half-deploys the change and leaves the crossdomain path — the
  very path change 3 feeds — on stale code.

Plus **B3**, a required UAC case before promotion (multi-company **with rows**), which is what would have caught B1.

Everything else reviewed is approve-grade: the three node bodies are correct, single-company output is provably
byte-identical (independently replayed, not taken on trust), and no egress node, connection, setting or pinData moved.

---

## 1. Zero egress — PASS (independently re-verified, not relayed)

### 1a. Structural: exactly three `jsCode` leaves changed, nothing else

Fetched both edited workflows live and diffed **every node by stable `id`** against the committed pre-edit backups
(`n8n-workflows-init/tests/backups/mc-label-n8n/*.json`), field by field, plus top-level `connections` / `settings` /
`pinData` / `staticData` / `active`:

| workflow | nodes added | nodes removed | nodes differing | fields differing | connections | settings | pinData | staticData |
|---|---|---|---|---|---|---|---|---|
| `t4QvrtrPnTwRU6br` | none | none | `output-structurer` only | `parameters.jsCode` only | identical | identical | identical | identical |
| `txiPzSxy3Pclsz6v` | none | none | `not-found-error-message`, `crossdomain-zeroset` only | `parameters.jsCode` only | identical | identical | identical | identical |

`settings` survived the PUT intact on both, including the keys the REST schema rejects
(`availableInMCP:true`, `callerPolicy`, `binaryMode:"separate"`). The coder's claim holds exactly.

### 1b. Live workflows untouched

| workflow | id | versionId | == activeVersionId | updatedAt |
|---|---|---|---|---|
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` | `469e7259-6cfb-4505-bef4-f37a36bf454f` | yes | 2026-08-11T16:23:58Z |
| live sub `sub-get-results TEST` | `rysSPgUssLDf6xJc` | `eb0bbcec-daab-4c79-8a68-c7d5eca5cf0a` | yes | 2026-08-10T06:13:06Z |
| live sub `sub-get-results` | `Fss5aAaXthJSWpZCgKiKR` | `fd248b16-82ee-4307-abfb-657b9b6a4aa7` | yes | 2026-08-11T00:50:25Z |

All three match the values recorded in the diff doc (Fss5 added by me). Nothing live was written.

### 1c. Runtime: re-confirmed from the execution data myself

Pulled `12774464` (case 1 clone spine), `12774472` / `12774475` (both sub-get-results calls), `12774477` (sendmsg sub),
`12775076` (case 2), `12775298` (case 3).

* **S1 — zero real sends.** `12774477` runData = `[When Executed by Another Workflow, chat-build-parts, chat-push, chat?,
  console-loggable?, log-chat-history-n8ntest]`. The sub's `HTTP Request` node
  (`https://api.respond.io/v2/contact/…/message`) is **absent from runData** in every case. Delivery was `chat-push`
  (redis LPUSH to `chat:reply:{chat_id}`) only.
* **S2/S3 — zero writes.** `save-session-vars`, `update-human-intervened`, `send-message-files/images/video` and
  `Call 'sub-human-intervention'` are absent from all three clone runData key sets. Only three HTTP nodes executed in
  every case: `get-session-vars-http` (GET), `resolve-entity-http` (POST `/references/resolve` — a read query),
  `check-access-http` (POST `/access-agent/check` — a read query). The clone's only PUT node (`save-session-vars`,
  `…/conversation-variables/{id}`) never ran and is orphaned. **No prod mutation on any path.**
* **S4 — read-only tools.** Resolved tools: `crm_inventory_stock_balance_list` (main) and `crm_incoming_stock_list`
  (crossdomain probe). `crm_it_support_ticket_create` appears nowhere, not even in the MCP tool catalogue the client
  enumerated.
* **S5 — test control present.** Popped redis item carries `mode:"uac"`, `scope:"chat-console"`,
  `test_run_id:"chatcon-1786930750003"` matching the seed (rules out latest-by-time mis-attribution). All sub-calls in
  the clone definition hardcode `is_test:true`. The `test_mode`-null-on-the-trigger observation is LESSONS 1, correctly
  diagnosed by the tester, not a gap.
* **S6.** Live-parser + live-read by design (the point was to prove the deployed PR #193 envelope). No write tool ran.

Independent spot-check of the tester's central claim: `entity-ids-transformer` in **both** sub-execs carries
`product_ids: ["142fdca2-…" (Mocha), "e5f1a203-…" (Sorento)]`, and `crossdomain-zeroset._xd` in `12774464` carries
`missing[0].uuids` with both and two `probe_entities`. Change 3 demonstrably fired end to end. Cases 2 and 3: the strings
` — checked in` and `lookup_companies` occur **zero** times in runData (their only occurrences in the execution JSON are
inside the `workflowData` jsCode source). Single-company output is untouched in the wild, not just in replay.

**Egress verdict: PASS.** Nothing in this change can reach a real contact or mutate prod.

---

## 2. B1 (BLOCKING) — `output-structurer` can contradict itself when rows are present but unstamped

The new block asserts absence from a **negative**: a lookup company is called silent when its name is not found among
the rendered rows' `Company` fields. If the envelope returns rows that carry **no** company field at all, `_shownCos` is
empty and **every** lookup company is declared silent — directly underneath the rows that were just rendered.

I replayed the published body against that shape (rows present, `lookup_companies` present, no `company_name` on rows):

```
"Here are the results.

1. *Product Code:* MWC-SC08B
*Qty:* 12

*Mocha:* no stock records for MWC-SC08B.
*Sorento:* no stock records for MWC-SC08B."
```

A customer is shown 12 units of the product and told in the same message that neither company has any. That is a worse
statement than the one this change exists to fix.

**This is not hypothetical, because the row half of the wire contract has never been observed.** I scanned every
execution of `t4QvrtrPnTwRU6br` in this cycle (15 of them, including the exec **12772435** the diff doc cites as the
wire-contract verification):

| exec | result_type | items | `lookup_companies` | `company_name` in rows |
|---|---|---|---|---|
| 12772435 | stock | **0** | yes | 0 |
| 12774472 | stock | **0** | yes | 0 |
| 12774475 | incoming_stock | **0** | yes | 0 |
| 12775028 / 12774978 / 12774879 / 12775311 | stock | 15 / 8 / 2 / 1 | no | 0 |
| 12775948 | promotions | 3 | no | 0 |

Every multi-company envelope seen was **empty**; every non-empty envelope was single-company. So the leading
`{key:"company_name", label:"Company"}` row field — which `_shownCos`, the `_IDENTITY_KEYS` addition and the whole
"partial" and "found-in-several" behaviours depend on — is **assumed, never seen**. Two concrete ways the assumption
fails today:

1. The scout spec (§4 PR-A step 4) adds the row field to the **`_stock`** presenter only, while `lookup_companies` rides
   the **shared** `ListResponse` passthrough — and exec `12774475` proves `lookup_companies` already reaches
   `incoming_stock`. If the incoming presenter does not stamp rows, **every multi-company incoming answer with rows
   contradicts itself** — and that is the `crossdomain-probe` path, which change 3 now deliberately routes both
   companies into.
2. The FastMCP-restart gotcha the scout flagged in step 6 (registration happens at startup).

The codebase already states the correct rule, three nodes over, in `crossdomain-render`:
`// positive facts only — say nothing rather than assert absence`. The new block breaks that invariant in a case it
cannot detect.

**Required fix** (in `n8n-workflows-init/tests/diffs/mc-label-n8n/output-structurer.js`, and republished to the clone):
gate the emission so it never speaks when it cannot tell. After `_shownCos` is built:

```js
// Rows rendered but NOT ONE carries a Company field ⇒ the CRM did not stamp them, so we cannot
// tell which company is silent. Positive facts only: say nothing rather than assert absence
// underneath rows we just printed.
const _canAttribute = !(e.items || []).length || _shownCos.size > 0;
```

and require `_canAttribute` alongside `_silent.length` on the append. Empty-envelope behaviour (the captain's reported
case) is unaffected — `items` is empty, so `_canAttribute` is true.

This is ~2 lines, removes the entire failure class, and makes B3 a confirmation rather than a gate.

---

## 3. B2 (BLOCKING) — the promote mapping misses half the live call sites

The diff doc maps `output-structurer.js` to `rysSPgUssLDf6xJc` and calls `Fss5aAaXthJSWpZCgKiKR` an optional
"promote alongside if it is to stay in sync". It is not optional. I enumerated every `executeWorkflow` node in both
spines:

| call site | LIVE `9qVyfUxmRQqrpGRMDLRuz` targets | CLONE `txiPzSxy3Pclsz6v` targets |
|---|---|---|
| `Call 'sub-get-results'` | `rysSPgUssLDf6xJc` | `t4QvrtrPnTwRU6br` |
| `probe-incoming` | `rysSPgUssLDf6xJc` | `t4QvrtrPnTwRU6br` |
| `tier-probe` | `rysSPgUssLDf6xJc` | *(not present on clone)* |
| `sibling-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `crossdomain-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `dym-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `dym-probe-partial` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `promo-dym-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | *(not present on clone)* |

The clone funnels **all six** of its call sites through the one sub that was edited — which is exactly why the UAC
passed end to end. Live does not. Promoting only `rysSPgUssLDf6xJc` ships an asymmetric bot: the main stock answer names
the empty company, the crossdomain / sibling / did-you-mean answers do not, and the `_IDENTITY_KEYS` fix (which matters
precisely on the projected `incoming_stock` envelope the crossdomain probe requests) never lands on that path.

Cost of doing it right is nil: both subs' `output-structurer` bodies are **byte-identical today**
(`sha256 = 68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` on `rysSPgUssLDf6xJc` and
`Fss5aAaXthJSWpZCgKiKR` alike), so the same artifact applies cleanly to both with no rebase. The checklist below treats
Fss5 as a mandatory third target.

---

## 4. B3 (REQUIRED before promote) — the multi-company-with-rows case was never run

The three executed cases match the task brief exactly and are well-evidenced. But the scout's §4 validation list names a
third shape — *"and with a code stocked in both (expect `Company:` on every row)"* — and the executed suite substituted
"single-company found → no label" for it. The result is that **all three** multi-company observations in this cycle were
empty envelopes, and the "found-in-several" and "partial" behaviours the fix is scoped to cover
(§4: *"the smallest that covers found / not found / partial"*) rest on offline replay alone. That is what left B1
undetected.

**Required:** one further UAC case on the clone, a product code stocked in **both** companies, asserting on both
`crm_inventory_stock_balance_list` and `crm_incoming_stock_list` result types:
1. every rendered row carries `*Company:*`;
2. **no** `*<Company>:* no … records` line follows rows for a company that did render rows;
3. `answers[].fields` retains the `company_name` key through the `incoming_stock` projection.

If (1) fails on the incoming envelope, B1's guard is what keeps the reply honest — and a backend follow-up is needed to
stamp the incoming presenter.

---

## 5. Code correctness — otherwise correct, independently replayed

I did not take the coder's probe tables on trust; I re-ran old-vs-new as pure function replays against the **live**
pre-change bodies.

**`crossdomain-zeroset`** (live `9qVyfUxmRQqrpGRMDLRuz` body vs artifact — 7 shapes):

| case | result |
|---|---|
| single-company missing / returned | **byte-identical `_xd`** |
| multi-token single-company | **byte-identical** |
| no resolutions / domain off | **byte-identical** |
| two companies, one returned | **byte-identical** (`active:false`) |
| two companies, both missing | `missing[0].uuids:["u1","u2"]`, `probe_entities` gains the second — as specified |

**`output-structurer`** (live `rysSPgUssLDf6xJc` body vs artifact — 10 shapes): single-company stock found / stock empty /
`incoming_stock` under active projection / unkeyed orders envelope all **byte-identical**. Multi-company empty, partial
and `incoming_stock` behave exactly as the diff doc tabulates, including the projection fix keeping the `*Company:*` line
that the pre-change node stripped. Malformed input (missing `name`, `entities` as a JSON string) degrades gracefully.

**`not-found-error-message`**: the promote artifact diffs against the **live current** body as exactly the four mc-label
hunks and nothing else — verified by `diff -u`, see §6. `_compat` (`gate.compatible_entities`), `_allMatches`,
`_dispByUuid` are all defined before first use; all four `$('…')` refs (`Aggregate`, `Call 'sub-query-reformulator'`,
`disallowed-entity-gate`, `resolve-entity`) exist by name in **both** clone and live. All three bodies parse
(`new Function`).

**Captain's rule: honoured in all three nodes.** `output-structurer` keys on `e.lookup_companies` (the envelope's own
lookup set); `not-found-error-message` keys on `gate.compatible_entities` — the entities actually sent to the tool —
never on `Aggregate`/access levels. I checked: `Aggregate` is read in this node only by the pre-existing
`_entitlementMiss` arm, and nothing in the new code touches the caller grant.

**State-pollution checks (all clean):**
* `compile-current-state` builds its output from **explicit keys**, not `{...$input.first().json}` (the node says so at
  line 10) — the new `lookup_companies` key does **not** reach persisted session vars.
* `_xd.missing[]` is consumed by `compile-current-state` (`m.code`) and `crossdomain-render` (`m._n`); the conditional
  `uuids` key is inert in both. It is only added when the code genuinely spans companies, so single-company `_xd` is
  key-for-key unchanged (replayed).
* `found_summary` (which now carries `(Company)` suffixes in the multi-company case) is consumed by
  `build-suggest-offer` as **display text only** (`Here's what you want:\n${found_summary}`) — not parsed for codes. Safe.
* `_IDENTITY_KEYS` is referenced in exactly one place (the projection filter). Adding `company_name` has no other reach.
* `probe_entities` fan-out vs dedupe: verified empirically — `entity-ids-transformer` collapsed the two entries to
  `product_ids` with 2 uuids, `_diagnostics.entities_in:2, total_uuids_passed:2, skipped:[]`. Shape is correct.

### Non-blocking findings

1. **Asymmetric gate on the `lookup_companies` spread.** The message gate is `_lookupCos.length > 1` but the json spread
   is `_lookupCos.length`. A 1-element list (which the contract says cannot occur) would add the key to a single-company
   reply's json. Replay confirms the *message* stays identical; only the key appears. Tighten to `> 1` for symmetry
   while you are editing the file for B1.
2. **`crossdomain-probe` prompt string now repeats the code.** Observed live: `"cross-domain probe (inventory ->
   crm_incoming_stock_list) for: MWC-SC08B, MWC-SC08B"`. Cosmetic LLM hint only, and fixing it means editing the node's
   *parameters* rather than a Code body — leave it, but note it so it is not mistaken for a bug later.
3. **`_add`'s new `if (!ex.uuid) ex.uuid = ex.uuids[0] || null;`** is a mutation on the dedup path that the coder's probe
   table does not cover. I traced the call sites: no path adds a code with a falsy uuid before one with a uuid
   (lines 84/85/91 always pass `m.uuid`; lines 98/100 pass the same `_uuidByCode` lookup), so it is unreachable today.
   Informational.
4. **`_coOfRow` also matches `label === 'Company'`** with no key. If `lookup_companies` ever rides an envelope where
   "Company" means the *customer's* company (orders — `DO123 (Acme Sdn Bhd)`), that fallback compares customer names to
   lookup-company names. Only reachable if the backend starts emitting `lookup_companies` on order envelopes; worth a
   comment recording the constraint.
5. **`_foundLines` drops the `(+N more)` cap entirely when `_multiCo`.** N products × M companies all land on one bullet.
   Grouping as `MWC-SC08B (Mocha, Sorento)` would read better and bound the length — follow-up, not this change.
6. **`_bareLabel` strips one trailing parenthetical when `_multiCo`.** A promotion display label that legitimately ends
   in a parenthetical could shift the typed-code-first reorder. Multi-company only, cosmetic ordering. Acceptable.

---

## 6. Drift import — safe on the clone, and correctly **not** carried into the promote artifact

The clone's `not-found-error-message` was 65 lines behind live; the publish rebased it onto the live body. I verified the
consequences rather than accepting them:

* **The promote artifact contains ONLY the mc-label hunks.** `diff -u` of live `9qVyfUxmRQqrpGRMDLRuz`'s current
  `not-found-error-message` (sha `d796e28d84e3…`, 334 lines) against
  `n8n-workflows-init/tests/diffs/mc-label-n8n/not-found-error-message.js` yields exactly four hunks: `_coByUuid` /
  `_searchedCos` / `_multiCo` / `_andList`; the `_byType` label qualification; the `_bareLabel` strip; the `_multiCo`
  `_foundLines` arm and `_coSuffix`. **No drift is promoted** — the drift already *is* live. The doc's claim
  "applies cleanly, no rebase" is correct.
* **The import is safe on the clone.** The three imported live arms (`_entitlementMiss`, the zero-resolution arm, the
  `gate.access_notice` prefix) reference `$('Aggregate')` and `gate.*`. `Aggregate` exists on the clone (confirmed by
  name; the clone also has a separate `Aggregate1`), and the imported code guards it with `isExecuted` inside a
  try/catch. The clone's `disallowed-entity-gate` contains **0** occurrences of `access_notice` (live has 4), so the
  prefix is simply falsy there — graceful, exactly as the coder predicted.
* **New clone blind spot worth a follow-up.** The clone's `not-found-error-message` is now live-current while its
  `disallowed-entity-gate` is still behind live. The Q23 `access_notice` prefix can therefore **never** be exercised on
  the clone. Recommend a separate change to rebase the clone's gate onto live — do not fold it into this one.

Likewise for `crossdomain-zeroset`: live's body (sha `2eef3fa37454…`) is byte-identical to the clone's pre-change body,
so that artifact also applies with zero rebase. Both `output-structurer` targets are at `68bd130cf367…`. Every promote
artifact was built on live current — claim verified, not relayed.

---

## 7. Scope / tier

Scope is a **business-logic jsCode-only change across three Code nodes**, exercised at the **live-parser + live-read**
tier (not deterministic — correctly so: the point was to prove the deployed PR #193 envelope, which a mock would hide;
LESSONS 28). The tester's tier matches the scope. There is no planner doc for this change (`n8n-workflows-init/plans/`
has no `mc-label-n8n.md`) — it came from the scout report + captain refinement directly. That is acceptable for a change
this size, but it is why the UAC case list was assembled ad hoc and why the scout's third case (§4, "stocked in both")
fell out — see B3.

**Regression note.** `_xd.missing[].uuids` and the json `lookup_companies` are *conditional* new keys, emitted only on
multi-company turns. LESSONS 40's `norm()` rule is for *always*-emitted fields and does **not** apply here — no
orchestrator change needed. A full-corpus replay against the current golden base will legitimately diff on any
multi-company turn; that is the change, not a regression.

---

# PROMOTE CHECKLIST

**Promotion is USER-GATED. This checklist does not authorise it; it is what must be true when the user does.**
**Do not run any of it until B1, B2 and B3 are cleared.** B1 changes `output-structurer.js`, so **every sha below for
that artifact must be regenerated after the fix** — do not carry the current values forward.

### P0 — clear the blockers first
- [ ] **B1** — add the `_canAttribute` guard to `output-structurer.js`; republish to `t4QvrtrPnTwRU6br`; update the diff
      doc's probe table with the rows-present/unstamped case. Optionally tighten the `lookup_companies` spread to `> 1`
      (finding 1) in the same edit.
- [ ] **B3** — tester runs the multi-company-with-rows case (both `stock` and `incoming_stock`) on the clone and records
      it as `mc-label-n8n-case4.json`. §0 S1–S6 must pass. Reviewer re-confirms before the gate reopens.
- [ ] **B2** — the mapping below is authoritative; the diff doc's "optional sync" line is superseded.

### P1 — artifact → target mapping (three artifacts, **four** target nodes)

| # | artifact | target workflow | node | target's current sha256 (gate on this) | target's current versionId (revert to this) |
|---|---|---|---|---|---|
| 1 | `output-structurer.js` | `rysSPgUssLDf6xJc` (`sub-get-results TEST`) | `output-structurer` | `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` | `eb0bbcec-daab-4c79-8a68-c7d5eca5cf0a` |
| 2 | `output-structurer.js` *(same bytes)* | `Fss5aAaXthJSWpZCgKiKR` (`sub-get-results`) — **MANDATORY, not optional** | `output-structurer` | `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` | `fd248b16-82ee-4307-abfb-657b9b6a4aa7` |
| 3 | `not-found-error-message.js` | `9qVyfUxmRQqrpGRMDLRuz` (live spine) | `not-found-error-message` | `d796e28d84e302130546e750eafaa901f9d5cfb81093a4f401c616536891fee3` | `469e7259-6cfb-4505-bef4-f37a36bf454f` |
| 4 | `crossdomain-zeroset.js` | `9qVyfUxmRQqrpGRMDLRuz` (live spine) | `crossdomain-zeroset` | `2eef3fa37454d5931e50747631df0463e152afdd58e6aeecea0a804040646245` | `469e7259-6cfb-4505-bef4-f37a36bf454f` |

Artifact sha256 **as committed today** (regenerate #1/#2 after B1):

```
8b68273f57f2151135b03a419597b1c521a82d0191396137f4c699f8b8ced1d4  output-structurer.js        <-- WILL CHANGE (B1)
cfd8a3804d2f4cb28acd247bc990692b19f8e58379728a2a923655c9ead982cb  not-found-error-message.js
2c562c7e974fa043e5bffe12b10ab97ed523c19df04196a1980119a2e4d4ff42  crossdomain-zeroset.js
```

**No guard scaffolding to strip.** This change built no `IF test_mode` gates and touched no egress node; the promoted
diff is the business-logic diff. The only clone-specific content in any artifact is the live→clone drift already
resolved in §6 — the artifacts are live-based, so nothing has to be un-done.

### P2 — pre-flight (per target, before any write)
- [ ] Re-fetch each target and confirm `versionId == activeVersionId` and `active == true`.
- [ ] Re-confirm the target node's **current** `jsCode` sha equals the P1 table value. Any mismatch = live moved since
      this review; **stop** and re-review — the artifact's baseline is void.
- [ ] Save a full backup of each target workflow JSON to `n8n-workflows-init/tests/backups/mc-label-n8n/` with a
      `-promote-pre` suffix, and record its `versionId` (P1 table) as the revert target.
- [ ] `diff -u <live node body> <artifact>` and confirm the hunks are exactly the mc-label hunks — no drift, no
      surprises. (I ran this today for all four; re-run at promote time.)
- [ ] Confirm no unpublished draft exists on any target (LESSONS 24: publish ships the **whole** draft, and a stale
      draft is a revert-landmine). `versionId == activeVersionId` is the check.

### P3 — publish, byte-exact and sha-gated (LESSONS 25/32/37)
- [ ] **Subs before the spine** (LESSONS 37: a parent only ever sees a sub's *published* version). Order:
      `rysSPgUssLDf6xJc` → `Fss5aAaXthJSWpZCgKiKR` → `9qVyfUxmRQqrpGRMDLRuz`.
- [ ] Never hand-retype a 17–21 KB `jsCode`. Source the exact bytes from the committed artifact file (LESSONS 25).
- [ ] If MCP is available: `setNodeParameter {nodeName, path:"/jsCode", value}` — one leaf, byte-exact — batched into a
      single `update_workflow` per workflow (spine gets both nodes in one call, ≤100 ops, atomic; LESSONS 32/33).
- [ ] If MCP is unavailable (as this session): `PUT $N8N_API_BASE/workflows/{id}` with a **settings-whitelist** body,
      then `POST $N8N_API_BASE/workflows/{id}/activate`. Both must return 200. The REST PUT schema rejects some settings
      keys — carry `executionOrder`, `availableInMCP`, `callerPolicy` and (spine) `binaryMode` through explicitly and
      re-verify them after, exactly as the coder did on the clone.
- [ ] **Gate the draft before publish:** re-read the draft node body and confirm its sha equals the artifact sha.
      Draft ≠ intended ⇒ **do not publish**.
- [ ] **Gate the active after publish:** re-read and confirm `versionId == activeVersionId`, `active == true`, node
      count unchanged, `connections` / `settings` / `pinData` identical to the P2 backup, and the **only** differing
      node is the intended one with the intended sha.
- [ ] Any mismatch at either gate ⇒ **auto-revert immediately**: publish the P1 versionId for that workflow, re-verify
      `active`, and stop the whole promotion (do not proceed to the next target).

### P4 — post-promote verification on live
- [ ] Confirm the four target nodes' shas equal the artifact shas, and that **no other node** in any of the three
      workflows changed vs the P2 backups.
- [ ] Watch the first live multi-company turn end to end: both company names in the reply, `*Company:*` on every
      rendered row, and **no** "no … records" line under a company that did render rows (the B1 failure mode).
- [ ] Watch one single-company turn and confirm it is byte-identical to yesterday's wording — no `(Company)` suffix, no
      ` — checked in`, no `Company:` row field.
- [ ] Confirm the crossdomain path specifically (a code that misses in inventory and spans two companies) now probes
      both uuids — this is the half that P1 #2 exists to enable.
- [ ] Keep the P2 backups and the P1 versionIds to hand for the whole first day; revert is a single publish.

### P5 — do-not-do
- [ ] Do **not** edit live mid-cycle for anything else while this promotion is open.
- [ ] Do **not** promote `output-structurer` to only one of the two subs.
- [ ] Do **not** fold the clone's `disallowed-entity-gate` rebase (§6) into this promotion.

---

## Appendix — what I checked and how

Read-only REST throughout: `GET /workflows/{9qVyfUxmRQqrpGRMDLRuz, txiPzSxy3Pclsz6v, t4QvrtrPnTwRU6br,
rysSPgUssLDf6xJc, Fss5aAaXthJSWpZCgKiKR}`; `GET /executions/{12774464, 12774472, 12774475, 12774477, 12775076, 12775298,
12772435, 12772436, 12774879, 12774978, 12775028, 12775089, 12775091, 12775311, 12775948}?includeData=true`;
`GET /executions?workflowId=t4QvrtrPnTwRU6br&limit=100`. Node-by-node structural diff keyed on stable node `id`
(LESSONS 20) against the committed pre-edit backups. Old-vs-new pure-function replay of `crossdomain-zeroset` (7 shapes)
and `output-structurer` (11 shapes) with mocked `$()` / `$input`, against the **live** pre-change bodies. `new Function`
parse of all three artifacts. No production host was probed and no repo-hardcoded credential was used against live
beyond the read-only `N8N_API_KEY` the task supplied.
